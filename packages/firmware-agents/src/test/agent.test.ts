/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Agent, AgentEvent, AgentProfile } from '../kernel/agent';
import { withApproval } from '../kernel/approvalTool';
import { ILlmClient } from '../kernel/llm';
import { defineTool, ToolError } from '../kernel/tool';
import { AnyTool, IToolSet, ToolRegistry } from '../kernel/toolRegistry';
import { callTool, say, ScriptedFakeLlm } from '../llm/scriptedFakeLlm';
import { FakeHost } from './fakeHost';

class TestAgent extends Agent {
	constructor(llm: ILlmClient, tools: IToolSet, host: FakeHost, protected readonly profile: AgentProfile = { id: 'test', systemPrompt: 'You are a test agent.' }) {
		super(llm, tools, host);
	}
}

const readRegister = defineTool({
	name: 'read_register',
	description: 'Read a register',
	risk: 'read',
	inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false },
	invoke: async (input: { name: string }) => ({ name: input.name, value: 0x2000_0400 }),
});

const flash = defineTool({
	name: 'flash',
	description: 'Flash the firmware',
	risk: 'hardware',
	inputSchema: { type: 'object', properties: { elf: { type: 'string' } }, required: ['elf'] },
	describeCall: (input: { elf: string }) => `Flash ${input.elf}`,
	invoke: async (input: { elf: string }) => `flashed ${input.elf}`,
});

function setup(tools: AnyTool[] = [readRegister, flash]) {
	const registry = new ToolRegistry();
	for (const tool of withApproval(tools)) {
		registry.register(tool);
	}
	return registry;
}

suite('Agent (ReAct loop)', () => {

	test('runs tools the model asks for and feeds the results back until it answers', async () => {
		const llm = new ScriptedFakeLlm([
			callTool('c1', 'read_register', { name: 'SP' }, 'Checking the stack pointer. '),
			say('SP is 0x20000400.'),
		]);
		const events: AgentEvent[] = [];
		const result = await new TestAgent(llm, setup(), new FakeHost()).run('What is SP?', { onEvent: e => events.push(e) });

		assert.deepStrictEqual({ text: result.text, stopReason: result.stopReason, steps: result.steps }, { text: 'SP is 0x20000400.', stopReason: 'done', steps: 2 });
		assert.deepStrictEqual(result.messages, [
			{ role: 'user', content: 'What is SP?' },
			{ role: 'assistant', content: 'Checking the stack pointer. ', toolCalls: [{ id: 'c1', name: 'read_register', input: { name: 'SP' } }] },
			{ role: 'tool', toolCallId: 'c1', content: '{"name":"SP","value":536871936}' },
			{ role: 'assistant', content: 'SP is 0x20000400.' },
		]);
		assert.deepStrictEqual(events.map(e => e.kind), ['step', 'text-delta', 'tool-call', 'tool-result', 'step', 'text-delta']);
		assert.strictEqual(llm.requests[0].system, 'You are a test agent.');
		assert.deepStrictEqual(llm.requests[0].tools.map(t => t.name), ['read_register', 'flash']);
	});

	test('asks for approval before a hardware tool and tells the model when it is declined', async () => {
		const host = new FakeHost(false);
		const llm = new ScriptedFakeLlm([callTool('c1', 'flash', { elf: 'app.elf' }), say('OK, not flashing.')]);
		const result = await new TestAgent(llm, setup(), host).run('Flash it');

		assert.deepStrictEqual(host.approvals, [{ agentId: 'test', toolName: 'flash', risk: 'hardware', summary: 'Flash app.elf', input: { elf: 'app.elf' } }]);
		const toolMessage = result.messages[2];
		assert.ok(toolMessage.role === 'tool' && toolMessage.content.includes('declined'));
	});

	test('read tools never ask for approval', async () => {
		const host = new FakeHost();
		await new TestAgent(new ScriptedFakeLlm([callTool('c1', 'read_register', { name: 'PC' }), say('done')]), setup(), host).run('x');
		assert.deepStrictEqual(host.approvals, []);
	});

	test('reports unknown tools, invalid arguments and unparseable JSON back to the model without running anything', async () => {
		let ran = 0;
		const counting = defineTool({ ...readRegister, invoke: async () => { ran++; return 1; } });
		const llm = new ScriptedFakeLlm([
			[
				{ kind: 'tool-call', call: { id: 'a', name: 'erase_chip', input: {} } },
				{ kind: 'tool-call', call: { id: 'b', name: 'read_register', input: { name: 7 } } },
				{ kind: 'tool-call', call: { id: 'c', name: 'read_register', input: undefined, rawArguments: '{"name":', inputError: 'Unexpected end of JSON input' } },
				{ kind: 'finish', reason: 'tool-calls' },
			],
			say('done'),
		]);
		const result = await new TestAgent(llm, setup([counting]), new FakeHost()).run('x');

		assert.strictEqual(ran, 0);
		assert.deepStrictEqual(result.messages.slice(2, 5).map(m => m.role === 'tool' ? JSON.parse(m.content).error : m), [
			'Unknown tool "erase_chip". Available tools: read_register.',
			'Invalid arguments for "read_register": input.name must be a string.',
			'Arguments for "read_register" are not valid JSON (Unexpected end of JSON input).',
		]);
	});

	test('a ToolError reaches the model with details; an unexpected exception is logged and reported', async () => {
		const failing = defineTool({ ...readRegister, name: 'probe', invoke: async (): Promise<number> => { throw new ToolError('No ST-Link found', { usb: [] }); } });
		const crashing = defineTool({ ...readRegister, name: 'crash', invoke: async (): Promise<number> => { throw new TypeError('boom'); } });
		const host = new FakeHost();
		const llm = new ScriptedFakeLlm([
			[
				{ kind: 'tool-call', call: { id: 'a', name: 'probe', input: { name: 'x' } } },
				{ kind: 'tool-call', call: { id: 'b', name: 'crash', input: { name: 'x' } } },
				{ kind: 'finish', reason: 'tool-calls' },
			],
			say('done'),
		]);
		const result = await new TestAgent(llm, setup([failing, crashing]), host).run('x');

		assert.deepStrictEqual(result.messages.slice(2, 4).map(m => m.role === 'tool' ? JSON.parse(m.content) : m), [
			{ error: 'No ST-Link found', details: { usb: [] } },
			{ error: 'Tool "crash" failed unexpectedly: boom' },
		]);
		assert.strictEqual(host.logs.length, 1);
		assert.strictEqual(host.logs[0].level, 'error');
	});

	test('stops at maxSteps when the model keeps calling tools', async () => {
		const llm = new ScriptedFakeLlm([1, 2, 3].map(i => callTool(`c${i}`, 'read_register', { name: 'PC' })));
		const result = await new TestAgent(llm, setup(), new FakeHost(), { id: 'test', systemPrompt: '', maxSteps: 3 }).run('loop');
		assert.deepStrictEqual({ stopReason: result.stopReason, steps: result.steps, calls: llm.requests.length }, { stopReason: 'max-steps', steps: 3, calls: 3 });
	});

	test('truncates large tool results', async () => {
		const dump = defineTool({ ...readRegister, name: 'dump', invoke: async () => 'x'.repeat(100) });
		const llm = new ScriptedFakeLlm([callTool('c1', 'dump', { name: 'RAM' }), say('ok')]);
		const result = await new TestAgent(llm, setup([dump]), new FakeHost(), { id: 'test', systemPrompt: '', maxToolResultChars: 10 }).run('x');
		assert.deepStrictEqual(result.messages[2], { role: 'tool', toolCallId: 'c1', content: 'xxxxxxxxxx\n…[truncated 90 characters]' });
	});

	test('cancellation stops the run before the next tool executes', async () => {
		const controller = new AbortController();
		let flashed = false;
		const abortingRead = defineTool({ ...readRegister, invoke: async () => { controller.abort(); return 0; } });
		const recordingFlash = defineTool({ ...flash, invoke: async () => { flashed = true; return ''; } });
		const llm = new ScriptedFakeLlm([[
			{ kind: 'tool-call', call: { id: 'a', name: 'read_register', input: { name: 'PC' } } },
			{ kind: 'tool-call', call: { id: 'b', name: 'flash', input: { elf: 'app.elf' } } },
			{ kind: 'finish', reason: 'tool-calls' },
		]]);
		const result = await new TestAgent(llm, setup([abortingRead, recordingFlash]), new FakeHost()).run('x', { signal: controller.signal });
		assert.deepStrictEqual({ stopReason: result.stopReason, flashed }, { stopReason: 'cancelled', flashed: false });
	});

	test('continues a conversation from history', async () => {
		const llm = new ScriptedFakeLlm([say('first'), say('second')]);
		const agent = new TestAgent(llm, setup(), new FakeHost());
		const first = await agent.run('one');
		await agent.run('two', { history: first.messages });
		assert.deepStrictEqual(llm.requests[1].messages, [
			{ role: 'user', content: 'one' },
			{ role: 'assistant', content: 'first' },
			{ role: 'user', content: 'two' },
		]);
	});

	test('model errors propagate to the caller', async () => {
		const llm: ILlmClient = { chat: async function* () { throw new Error('HTTP 401'); } };
		await assert.rejects(new TestAgent(llm, setup(), new FakeHost()).run('x'), /HTTP 401/);
	});
});
