/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Regression tests for the P0 code review and security review findings (2026-10-15).
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NodeAgentHost } from '../adapters/node/nodeAgentHost';
import { NodeFileSystem, PathOutsideWorkspaceError } from '../adapters/node/nodeFileSystem';
import { killAllChildren, runProcess } from '../adapters/node/nodeProcessRunner';
import { Agent, AgentProfile } from '../kernel/agent';
import { ApprovalRequest, IAgentHost } from '../kernel/host';
import { validateJsonSchema } from '../kernel/jsonSchema';
import { ILlmClient, LlmError, LlmEvent } from '../kernel/llm';
import { MessageBus } from '../kernel/messageBus';
import { defineTool } from '../kernel/tool';
import { AnyTool, IToolSet, ToolRegistry } from '../kernel/toolRegistry';
import { OpenAiCompatibleClient, parseChatCompletionStream } from '../llm/openAiCompatibleClient';
import { callTool, say, ScriptedFakeLlm } from '../llm/scriptedFakeLlm';
import { CollaborationMessage } from '../orchestration/messages';
import { FakeHost } from './fakeHost';

class TestAgent extends Agent {
	constructor(llm: ILlmClient, tools: IToolSet, host: IAgentHost, protected readonly profile: AgentProfile = { id: 'test', systemPrompt: '' }) {
		super(llm, tools, host);
	}
}

const registryOf = (...tools: AnyTool[]) => {
	const registry = new ToolRegistry();
	tools.forEach(t => registry.register(t));
	return registry;
};

async function collect(events: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> {
	const out: LlmEvent[] = [];
	for await (const e of events) {
		out.push(e);
	}
	return out;
}

async function* bytes(...parts: Uint8Array[]): AsyncGenerator<Uint8Array> {
	yield* parts;
}

const sse = (...payloads: unknown[]) => payloads.map(p => `data: ${typeof p === 'string' ? p : JSON.stringify(p)}\n\n`).join('');

suite('Regressions: agent loop', () => {

	test('an unwrapped hardware tool still needs approval (default deny)', async () => {
		let ran = false;
		const flash = defineTool({ name: 'flash', description: '', risk: 'hardware', inputSchema: { type: 'object' }, invoke: async () => { ran = true; return ''; } });
		const host = new FakeHost(false);
		await new TestAgent(new ScriptedFakeLlm([callTool('c1', 'flash', {}), say('ok')]), registryOf(flash), host).run('x');
		assert.deepStrictEqual({ ran, approvals: host.approvals.length }, { ran: false, approvals: 1 });
	});

	test('cancelling mid-batch still gives every tool call a result', async () => {
		const controller = new AbortController();
		const first = defineTool({ name: 'first', description: '', risk: 'read', inputSchema: { type: 'object' }, invoke: async () => { controller.abort(); return 1; } });
		const second = defineTool({ name: 'second', description: '', risk: 'read', inputSchema: { type: 'object' }, invoke: async () => 2 });
		const llm = new ScriptedFakeLlm([[
			{ kind: 'tool-call', call: { id: 'a', name: 'first', input: {} } },
			{ kind: 'tool-call', call: { id: 'b', name: 'second', input: {} } },
			{ kind: 'finish', reason: 'tool-calls' },
		]]);
		const result = await new TestAgent(llm, registryOf(first, second), new FakeHost()).run('x', { signal: controller.signal });
		const toolResults = result.messages.filter(m => m.role === 'tool');
		assert.deepStrictEqual({ stop: result.stopReason, ids: toolResults.map(m => m.role === 'tool' && m.toolCallId) }, { stop: 'cancelled', ids: ['a', 'b'] });
	});

	test('aborting while an approval prompt is open ends the run', async () => {
		const controller = new AbortController();
		const host: IAgentHost = {
			...new FakeHost(),
			fs: new FakeHost().fs,
			exec: new FakeHost().exec,
			log: () => { },
			progress: () => { },
			approve: (_request: ApprovalRequest) => { setTimeout(() => controller.abort(), 10); return new Promise<boolean>(() => { }); },
		};
		let ran = false;
		const flash = defineTool({ name: 'flash', description: '', risk: 'hardware', inputSchema: { type: 'object' }, invoke: async () => { ran = true; return ''; } });
		const result = await new TestAgent(new ScriptedFakeLlm([callTool('c1', 'flash', {})]), registryOf(flash), host).run('x', { signal: controller.signal });
		assert.deepStrictEqual({ stop: result.stopReason, ran }, { stop: 'cancelled', ran: false });
	});

	test('reports content-filter stops and refuses calls beyond the per-step limit', async () => {
		const filtered = await new TestAgent(new ScriptedFakeLlm([[{ kind: 'finish', reason: 'content-filter' }]]), registryOf(), new FakeHost()).run('x');
		assert.strictEqual(filtered.stopReason, 'content-filter');

		let runs = 0;
		const read = defineTool({ name: 'read', description: '', risk: 'read', inputSchema: { type: 'object' }, invoke: async () => ++runs });
		const llm = new ScriptedFakeLlm([[
			...[1, 2, 3].map(i => ({ kind: 'tool-call', call: { id: `c${i}`, name: 'read', input: {} } } as const)),
			{ kind: 'finish', reason: 'tool-calls' },
		], say('ok')]);
		const result = await new TestAgent(llm, registryOf(read), new FakeHost(), { id: 'test', systemPrompt: '', maxToolCallsPerStep: 2 }).run('x');
		assert.strictEqual(runs, 2);
		assert.match(result.messages[4].role === 'tool' ? result.messages[4].content : '', /Too many tool calls/);
	});

	test('rejects prototype-reaching keys at any depth before the tool runs', async () => {
		let ran = false;
		const tool = defineTool({ name: 'cfg', description: '', risk: 'read', inputSchema: { type: 'object' }, invoke: async () => { ran = true; return ''; } });
		const input = JSON.parse('{"a":{"b":[{"__proto__":{"admin":true}}]},"constructor":1}');
		const result = await new TestAgent(new ScriptedFakeLlm([callTool('c1', 'cfg', input), say('ok')]), registryOf(tool), new FakeHost()).run('x');
		assert.strictEqual(ran, false);
		assert.deepStrictEqual(result.messages[2].role === 'tool' && JSON.parse(result.messages[2].content).error,
			'Invalid arguments for "cfg": input.a.b[0].__proto__ is not allowed; input.constructor is not allowed.');
	});
});

suite('Regressions: schema and bus', () => {

	test('inherited names are neither accepted as properties nor as present required fields', () => {
		const schema = { type: 'object', properties: { elf: { type: 'string', maxLength: 5 }, list: { type: 'array', maxItems: 1 } }, required: ['elf', 'toString'], additionalProperties: false } as const;
		assert.deepStrictEqual(validateJsonSchema(schema, { elf: 'a' }), ['input.toString is required']);
		assert.deepStrictEqual(validateJsonSchema(schema, JSON.parse('{"elf":"toolong","list":[1,2],"__proto__":{},"toString":[1]}')), [
			'input.__proto__ is not allowed',
			'input.elf must be at most 5 characters',
			'input.list must have at most 1 items',
			'input.toString is not allowed',
		]);
	});

	test('waitFor rejects (and unsubscribes) when its predicate throws', async () => {
		const bus = new MessageBus<CollaborationMessage>();
		const waiting = bus.waitFor('verification-result', () => { throw new Error('bad predicate'); });
		bus.publish({ type: 'verification-result', bugId: 'b', passed: true, details: '' });
		await assert.rejects(waiting, /bad predicate/);
	});
});

suite('Regressions: OpenAI-compatible client', () => {

	test('a name repeated in later fragments is not doubled', async () => {
		const stream = sse(
			{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'x', function: { name: 'read_file', arguments: '{"path":' } }] } }] },
			{ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'read_file', arguments: '"a.c"}' } }] }, finish_reason: 'tool_calls' }] },
			'[DONE]');
		const [event] = await collect(parseChatCompletionStream(bytes(new TextEncoder().encode(stream))));
		assert.deepStrictEqual(event, { kind: 'tool-call', call: { id: 'x', name: 'read_file', input: { path: 'a.c' } } });
	});

	test('multi-byte characters split across chunks and CRLF line endings survive', async () => {
		const encoded = new TextEncoder().encode(sse({ choices: [{ delta: { content: '€ °C' }, finish_reason: 'stop' }] }, '[DONE]').replace(/\n/g, '\r\n'));
		const cut = encoded.indexOf(0xe2) + 1; // inside the 3-byte "€"
		const events = await collect(parseChatCompletionStream(bytes(encoded.subarray(0, cut), encoded.subarray(cut))));
		assert.deepStrictEqual(events, [{ kind: 'text-delta', text: '€ °C' }, { kind: 'finish', reason: 'stop' }]);
	});

	test('oversized tool arguments are refused', async () => {
		const huge = 'x'.repeat(1024 * 1024 + 1);
		const stream = sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'x', function: { name: 'w', arguments: huge } }] } }] });
		await assert.rejects(collect(parseChatCompletionStream(bytes(new TextEncoder().encode(stream)))), /too large/);
	});

	test('retry back-off does not trip the idle timeout', async () => {
		let attempt = 0;
		const client = new OpenAiCompatibleClient({
			baseUrl: 'https://x', apiKey: 'k', model: 'm', idleTimeoutMs: 50, retryBaseDelayMs: 150,
			fetchImpl: (async () => ++attempt === 1
				? new Response('', { status: 503 })
				: new Response(sse({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }, '[DONE]'), { status: 200 })) as typeof fetch,
		});
		const events = await collect(client.chat({ system: '', messages: [], tools: [] }, new AbortController().signal));
		assert.deepStrictEqual({ attempt, last: events.at(-1) }, { attempt: 2, last: { kind: 'finish', reason: 'stop' } });
	});

	test('plain http is refused except for localhost, and the key is redacted from provider errors', async () => {
		assert.throws(() => new OpenAiCompatibleClient({ baseUrl: 'http://example.com/v1', apiKey: 'k', model: 'm' }), /https/);
		assert.doesNotThrow(() => new OpenAiCompatibleClient({ baseUrl: 'http://localhost:8000/v1', apiKey: 'k', model: 'm' }));

		const key = 'sk-or-v1-0123456789abcdef0123456789';
		const client = new OpenAiCompatibleClient({ baseUrl: 'https://x', apiKey: key, model: 'm', fetchImpl: (async () => new Response(`bad key ${key}`, { status: 401 })) as typeof fetch });
		await assert.rejects(collect(client.chat({ system: '', messages: [], tools: [] }, new AbortController().signal)), (err: LlmError) => !err.message.includes(key) && err.message.includes('bad key ***'));
	});
});

suite('Regressions: Node adapters', () => {

	let root: string;
	let outside: string;

	setup(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'fwagents-ws-'));
		outside = await fs.mkdtemp(path.join(os.tmpdir(), 'fwagents-out-'));
	});

	teardown(async () => {
		await fs.rm(root, { recursive: true, force: true });
		await fs.rm(outside, { recursive: true, force: true });
	});

	test('writing through a dangling symlink is refused', async () => {
		await fs.symlink(path.join(outside, 'pwned.txt'), path.join(root, 'dangling'));
		await assert.rejects(new NodeFileSystem(root).writeFile('dangling', 'x'), PathOutsideWorkspaceError);
		assert.deepStrictEqual(await fs.readdir(outside), []);
	});

	test('names that merely start with ".." are inside the workspace', async () => {
		const fsys = new NodeFileSystem(root);
		await fsys.writeFile('..foo', 'ok');
		assert.strictEqual(await fsys.readFile('..foo'), 'ok');
	});

	test('reads only regular files within the size limit', async () => {
		const fsys = new NodeFileSystem(root, 4);
		await fs.mkdir(path.join(root, 'dir'));
		await fs.writeFile(path.join(root, 'big.bin'), '12345');
		await assert.rejects(fsys.readFile('dir'), /not a regular file/);
		await assert.rejects(fsys.readFile('big.bin'), /limit is 4/);
	});

	test('a symlinked working directory pointing outside is refused', async () => {
		await fs.symlink(outside, path.join(root, 'outdir'));
		const result = await runProcess(root, process.execPath, ['-e', 'console.log(process.cwd())'], { cwd: 'outdir' });
		assert.deepStrictEqual({ out: result.stdout, error: result.spawnError }, { out: '', error: 'Working directory "outdir" is outside the workspace' });
	});

	test('a timeout also stops grandchildren that hold the pipes', async function () {
		if (process.platform === 'win32') {
			this.skip();
		}
		const started = Date.now();
		const result = await runProcess(root, 'sh', ['-c', 'sleep 30 & sleep 30'], { timeoutMs: 200 });
		assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
		assert.strictEqual(result.timedOut, true);
	});

	test('a background grandchild that outlives a successful parent does not hang the run', async function () {
		if (process.platform === 'win32') {
			this.skip();
		}
		const started = Date.now();
		const result = await runProcess(root, 'sh', ['-c', 'sleep 30 & echo started']);
		assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
		assert.deepStrictEqual({ code: result.exitCode, out: result.stdout.trim() }, { code: 0, out: 'started' });
	});

	test('keeps multi-byte output intact, survives a throwing listener and never rejects on bad arguments', async () => {
		const result = await runProcess(root, process.execPath, ['-e', 'process.stdout.write("€".repeat(100000))'], { onOutput: () => { throw new Error('listener bug'); } });
		assert.deepStrictEqual({ len: result.stdout.length, bad: result.stdout.includes('�') }, { len: 100000, bad: false });
		const nul = await runProcess(root, 'node\0x', []);
		assert.ok(nul.spawnError);
	});

	test('children never see API keys, and secrets in their output are redacted', async () => {
		const key = 'sk-or-v1-abcdefabcdefabcdefabcdef';
		const host = new NodeAgentHost({ root, secrets: ['custom-secret-value'], env: { ...process.env, OPENROUTER_API_KEY: key, MY_TOKEN: 'custom-secret-value' }, write: () => { } });
		const result = await host.exec(process.execPath, ['-e', 'console.log(JSON.stringify([process.env.OPENROUTER_API_KEY ?? null, process.env.MY_TOKEN ?? null])); console.log("leak sk-or-v1-0123456789abcdef0123")']);
		assert.deepStrictEqual(result.stdout.trim().split('\n'), ['[null,null]', 'leak ***']);
	});
});

suite('Regressions: second review round', () => {

	let root: string;

	setup(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'fwagents-ws-'));
	});

	teardown(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	const isAlive = (pid: number) => {
		try {
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	};
	const waitUntil = async (condition: () => boolean, ms = 3000) => {
		const end = Date.now() + ms;
		while (!condition() && Date.now() < end) {
			await new Promise(r => setTimeout(r, 25));
		}
		return condition();
	};

	test('a name fragment that is a prefix of the name so far is still appended', async () => {
		const stream = sse(...['read_', 're', 'g'].map((name, i) => ({ choices: [{ delta: { tool_calls: [{ index: 0, ...i === 0 ? { id: 'x' } : {}, function: { name } }] } }] })),
			{ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }, '[DONE]');
		const [event] = await collect(parseChatCompletionStream(bytes(new TextEncoder().encode(stream))));
		assert.ok(event.kind === 'tool-call' && event.call.name === 'read_reg');
	});

	test('a failing approval prompt denies and is logged as an error, not taken as the user saying no silently', async () => {
		const host = new FakeHost();
		host.approve = async () => { throw new Error('UI crashed'); };
		let ran = false;
		const flash = defineTool({ name: 'flash', description: '', risk: 'hardware', inputSchema: { type: 'object' }, invoke: async () => { ran = true; return ''; } });
		await new TestAgent(new ScriptedFakeLlm([callTool('c1', 'flash', {}), say('ok')]), registryOf(flash), host).run('x');
		assert.deepStrictEqual({ ran, logged: host.logs.some(l => l.level === 'error' && l.message.includes('UI crashed')) }, { ran: false, logged: true });
	});

	test('deeply nested input is refused instead of crashing the run', async () => {
		const tool = defineTool({ name: 'deep', description: '', risk: 'read', inputSchema: { type: 'object' }, invoke: async () => '' });
		const input = JSON.parse('{"a":' + '['.repeat(200_000) + ']'.repeat(200_000) + '}');
		const result = await new TestAgent(new ScriptedFakeLlm([callTool('c1', 'deep', input), say('ok')]), registryOf(tool), new FakeHost()).run('x');
		assert.match(result.messages[2].role === 'tool' ? result.messages[2].content : '', /nested too deeply/);
		assert.strictEqual(result.stopReason, 'done');
	});

	test('background jobs do not outlive a command that exited normally', async function () {
		if (process.platform === 'win32') {
			this.skip();
		}
		const result = await runProcess(root, 'sh', ['-c', 'sleep 30 >/dev/null 2>&1 & echo $!']);
		const pid = Number(result.stdout.trim());
		assert.ok(pid > 0);
		assert.ok(await waitUntil(() => !isAlive(pid)), `background job ${pid} still running`);
	});

	test('killAllChildren stops running commands (for hosts that handle Ctrl-C)', async function () {
		if (process.platform === 'win32') {
			this.skip();
		}
		const running = runProcess(root, 'sh', ['-c', 'sleep 30']);
		await new Promise(r => setTimeout(r, 100));
		killAllChildren();
		const result = await running;
		assert.strictEqual(result.exitCode, null);
	});

	test('streamed output, credential-like env vars and secrets straddling the cap are all handled', async () => {
		const key = 'sk-or-v1-abcdefabcdefabcdefabcdef';
		const chunks: string[] = [];
		const host = new NodeAgentHost({ root, write: () => { }, env: { ...process.env, GITHUB_TOKEN: 'ghp_x', AWS_SECRET_ACCESS_KEY: 'y', DB_PASSWORD: 'z' } });
		const result = await host.exec(process.execPath, ['-e', `console.log(JSON.stringify([process.env.GITHUB_TOKEN ?? null, process.env.AWS_SECRET_ACCESS_KEY ?? null, process.env.DB_PASSWORD ?? null])); process.stdout.write("x".repeat(80) + "${key}")`], { maxOutputBytes: 100, onOutput: (_s, c) => chunks.push(c) });
		const [envLine, rest] = result.stdout.split('\n');
		assert.strictEqual(envLine, '[null,null,null]');
		assert.ok(!rest.includes('sk-or') && !rest.includes('abcdef'), rest);
		assert.ok(!chunks.join('').includes(key));
	});
});
