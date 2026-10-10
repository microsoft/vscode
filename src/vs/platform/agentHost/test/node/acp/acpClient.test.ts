/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { PassThrough } from 'stream';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AcpClient, type IAcpTransport } from '../../../node/acp/acpClient.js';
import { ACP_PROTOCOL_VERSION } from '../../../node/acp/acpProtocol.js';
import { JsonRpcError, JsonRpcErrorCode, JsonRpcResponseError } from '../../../node/codex/codexAppServerClient.js';

interface IFakeAgent {
	readonly transport: IAcpTransport;
	/** What the client wrote to the agent's stdin. */
	readonly outbound: PassThrough;
	push(message: object): void;
	pushRaw(text: string): void;
	exit(code: number | null): void;
	dispose(): void;
}

function makeFakeAgent(): IFakeAgent {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const exitEmitter = new Emitter<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>();
	const onceListeners: ((e: { readonly code: number | null; readonly signal: NodeJS.Signals | null }) => void)[] = [];
	const fireExit = (e: { readonly code: number | null; readonly signal: NodeJS.Signals | null }) => {
		exitEmitter.fire(e);
		for (const listener of onceListeners.splice(0)) {
			listener(e);
		}
	};
	return {
		transport: {
			stdin,
			stdout,
			kill(signal) {
				fireExit({ code: null, signal: signal ?? null });
				return true;
			},
			onExit: exitEmitter.event,
			onExitOnce: listener => { onceListeners.push(listener); },
		},
		outbound: stdin,
		push: message => { stdout.write(JSON.stringify(message) + '\n'); },
		pushRaw: text => { stdout.write(text); },
		exit: code => fireExit({ code, signal: null }),
		dispose() {
			onceListeners.length = 0;
			exitEmitter.dispose();
			stdin.destroy();
			stdout.destroy();
		},
	};
}

function readNextMessage(stream: PassThrough, timeoutMs = 1_000): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		let buf = '';
		const onData = (chunk: Buffer | string) => {
			buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
			const nl = buf.indexOf('\n');
			if (nl < 0) {
				return;
			}
			cleanup();
			try {
				resolve(JSON.parse(buf.slice(0, nl)));
			} catch (err) {
				reject(err);
			}
		};
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error('timed out waiting for message'));
		}, timeoutMs);
		const cleanup = () => {
			clearTimeout(timer);
			stream.off('data', onData);
		};
		stream.on('data', onData);
	});
}

suite('AcpClient', () => {

	let agent: IFakeAgent;
	let client: AcpClient;

	setup(() => {
		agent = makeFakeAgent();
		client = new AcpClient(agent.transport);
	});

	// Registered before the leak check so the client is disposed when the check runs.
	teardown(() => {
		client.dispose();
		agent.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('sends JSON-RPC 2.0 requests and resolves the typed result', async () => {
		const response = client.request('initialize', { protocolVersion: ACP_PROTOCOL_VERSION, clientCapabilities: { fs: { readTextFile: true } } });
		const sent = await readNextMessage(agent.outbound);
		assert.deepStrictEqual(sent, {
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true } } },
		});
		agent.push({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1, agentCapabilities: { loadSession: true } } });
		assert.deepStrictEqual(await response, { protocolVersion: 1, agentCapabilities: { loadSession: true } });
	});

	test('rejects with JsonRpcResponseError on an error envelope', async () => {
		const response = client.request('session/new', { cwd: '/w', mcpServers: [] });
		const sent = await readNextMessage(agent.outbound);
		agent.push({ jsonrpc: '2.0', id: sent.id, error: { code: -32000, message: 'Authentication required' } });
		await assert.rejects(response, (err: unknown) => err instanceof JsonRpcResponseError && err.code === -32000);
	});

	test('reassembles messages split across chunks and skips non-JSON lines', async () => {
		const updates: unknown[] = [];
		const listener = client.onNotification('session/update', params => updates.push(params));
		const line = JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's', update: { sessionUpdate: 'plan', entries: [] } } });
		agent.pushRaw('debug output from agent\n');
		agent.pushRaw('null\n42\n"text"\n[1]\n');
		agent.pushRaw(line.slice(0, 10));
		agent.pushRaw(line.slice(10) + '\n');
		const response = client.request('session/list', {});
		const sent = await readNextMessage(agent.outbound);
		agent.push({ jsonrpc: '2.0', id: sent.id, result: { sessions: [] } });
		await response;
		assert.deepStrictEqual(updates, [{ sessionId: 's', update: { sessionUpdate: 'plan', entries: [] } }]);
		listener.dispose();
	});

	test('answers agent requests with the handler result, including null', async () => {
		const listener = client.onRequest('fs/write_text_file', () => ({ result: null }));
		agent.push({ jsonrpc: '2.0', id: 'w1', method: 'fs/write_text_file', params: { sessionId: 's', path: '/w/a.txt', content: 'x' } });
		assert.deepStrictEqual(await readNextMessage(agent.outbound), { jsonrpc: '2.0', id: 'w1', result: null });
		listener.dispose();
	});

	test('answers unknown agent requests with MethodNotFound', async () => {
		agent.push({ jsonrpc: '2.0', id: 7, method: 'terminal/create', params: {} });
		const reply = await readNextMessage(agent.outbound) as { error: { code: number } };
		assert.strictEqual(reply.error.code, JsonRpcErrorCode.MethodNotFound);
	});

	test('reports handler exceptions as InternalError', async () => {
		const listener = client.onRequest('fs/read_text_file', () => { throw new Error('outside workspace'); });
		agent.push({ jsonrpc: '2.0', id: 3, method: 'fs/read_text_file', params: { sessionId: 's', path: '/etc/hosts' } });
		assert.deepStrictEqual(await readNextMessage(agent.outbound), { jsonrpc: '2.0', id: 3, error: { code: JsonRpcErrorCode.InternalError, message: 'outside workspace' } });
		listener.dispose();
	});

	test('sends notifications without an id', async () => {
		client.notify('session/cancel', { sessionId: 's' });
		assert.deepStrictEqual(await readNextMessage(agent.outbound), { jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: 's' } });
	});

	test('rejects pending requests when the agent exits', async () => {
		const response = client.request('session/prompt', { sessionId: 's', prompt: [{ type: 'text', text: 'hi' }] });
		await readNextMessage(agent.outbound);
		agent.exit(1);
		await assert.rejects(response, (err: unknown) => err instanceof JsonRpcError && !(err instanceof JsonRpcResponseError));
		await assert.rejects(client.request('session/list', {}), JsonRpcError);
	});

	test('rejects pending requests with CancellationError on dispose', async () => {
		const response = client.request('session/list', {});
		await readNextMessage(agent.outbound);
		client.dispose();
		await assert.rejects(response, CancellationError);
	});
});
