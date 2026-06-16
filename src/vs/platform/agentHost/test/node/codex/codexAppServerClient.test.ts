/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { PassThrough } from 'stream';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	CodexAppServerClient,
	JsonRpcError,
	JsonRpcErrorCode,
	type ICodexAppServerTransport,
} from '../../../node/codex/codexAppServerClient.js';

// #region In-memory fake transport
//
// Two `PassThrough` streams paired so the test's "peer" side reads what
// the client writes, and vice versa. Mirrors the shape of a real spawned
// process from the client's perspective.

interface IFakePeer {
	readonly transport: ICodexAppServerTransport;
	/** Lines the client wrote (sent to the server). */
	readonly outbound: PassThrough;
	readonly killCount: number;
	/** Inject a wire message from server → client. Newline-terminated. */
	push(message: object): void;
	/** Simulate the codex process exiting. */
	exit(code: number | null, signal?: NodeJS.Signals | null): void;
	dispose(): void;
}

function makeFakePeer(): IFakePeer {
	const clientStdin = new PassThrough();   // client writes here, peer reads
	const clientStdout = new PassThrough();  // peer writes here, client reads
	const exitEmitter = new Emitter<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>();
	const onceExitListeners: ((e: { readonly code: number | null; readonly signal: NodeJS.Signals | null }) => void)[] = [];
	let killed = false;
	let killCount = 0;
	const fireExit = (e: { readonly code: number | null; readonly signal: NodeJS.Signals | null }) => {
		exitEmitter.fire(e);
		for (const listener of onceExitListeners.splice(0)) {
			listener(e);
		}
	};

	const transport: ICodexAppServerTransport = {
		stdin: clientStdin,
		stdout: clientStdout,
		kill(_signal) {
			killCount++;
			if (killed) {
				return false;
			}
			killed = true;
			fireExit({ code: null, signal: _signal ?? null });
			return true;
		},
		onExit: exitEmitter.event,
		onExitOnce(listener) {
			onceExitListeners.push(listener);
		},
	};

	return {
		transport,
		outbound: clientStdin,
		get killCount() { return killCount; },
		push(message: object) {
			clientStdout.write(JSON.stringify(message) + '\n');
		},
		exit(code, signal = null) {
			fireExit({ code, signal });
		},
		dispose() {
			onceExitListeners.length = 0;
			exitEmitter.dispose();
			clientStdin.destroy();
			clientStdout.destroy();
		},
	};
}

/**
 * Consume newline-delimited JSON from a stream. Resolves with the next
 * complete message; rejects if `timeoutMs` elapses or the stream ends.
 */
function readNextMessage(stream: PassThrough, timeoutMs = 1_000): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let buf = '';
		const onData = (chunk: Buffer | string) => {
			buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
			const nl = buf.indexOf('\n');
			if (nl < 0) {
				return;
			}
			const line = buf.slice(0, nl).trim();
			cleanup();
			try {
				resolve(JSON.parse(line));
			} catch (err) {
				reject(err);
			}
		};
		const onEnd = () => {
			cleanup();
			reject(new Error('stream ended before message arrived'));
		};
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error('timed out waiting for message'));
		}, timeoutMs);
		const cleanup = () => {
			clearTimeout(timer);
			stream.off('data', onData);
			stream.off('end', onEnd);
		};
		stream.on('data', onData);
		stream.on('end', onEnd);
	});
}

// #endregion

suite('CodexAppServerClient', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('request roundtrip resolves with typed result', async () => {
		const peer = makeFakePeer();
		const client = new CodexAppServerClient(peer.transport);
		try {
			// Issue a request and capture what's written on the wire.
			const responsePromise = client.request<'getAuthStatus'>('getAuthStatus', { refreshToken: false, includeToken: false });
			const sent = await readNextMessage(peer.outbound) as { id: number; method: string; params: unknown };
			assert.strictEqual(sent.method, 'getAuthStatus');
			assert.deepStrictEqual(sent.params, { refreshToken: false, includeToken: false });
			assert.strictEqual(typeof sent.id, 'number');

			// Reply with success.
			peer.push({ id: sent.id, result: { authMode: 'apikey' } });
			const result = await responsePromise as { authMode: string };
			assert.deepStrictEqual(result, { authMode: 'apikey' });
		} finally {
			client.dispose();
			peer.dispose();
		}
	});

	test('request rejects with JsonRpcError on error envelope', async () => {
		const peer = makeFakePeer();
		const client = new CodexAppServerClient(peer.transport);
		try {
			const responsePromise = client.request('getAuthStatus', { refreshToken: false, includeToken: false });
			const sent = await readNextMessage(peer.outbound) as { id: number };
			peer.push({ id: sent.id, error: { code: -32001, message: 'overloaded' } });
			await assert.rejects(responsePromise, (err: unknown) => {
				assert.ok(err instanceof JsonRpcError, 'expected JsonRpcError');
				assert.strictEqual(err.code, -32001);
				assert.match(err.message, /overloaded/);
				return true;
			});
		} finally {
			client.dispose();
			peer.dispose();
		}
	});

	test('request response ids must match the numeric id exactly', async () => {
		const peer = makeFakePeer();
		const logs: { level: string; message: string }[] = [];
		const client = new CodexAppServerClient(peer.transport, (level, message) => logs.push({ level, message }));
		try {
			const responsePromise = client.request<'getAuthStatus'>('getAuthStatus', { refreshToken: false, includeToken: false });
			const sent = await readNextMessage(peer.outbound) as { id: number };

			peer.push({ id: String(sent.id), result: { authMode: 'apikey' } });
			await new Promise(r => setImmediate(r));
			assert.deepStrictEqual(logs, [{ level: 'warn', message: `unsolicited response id=${sent.id}` }]);

			peer.push({ id: sent.id, result: { authMode: 'apikey' } });
			assert.deepStrictEqual(await responsePromise, { authMode: 'apikey' });
		} finally {
			client.dispose();
			peer.dispose();
		}
	});

	test('notify writes a payload with no id', async () => {
		const peer = makeFakePeer();
		const client = new CodexAppServerClient(peer.transport);
		try {
			client.notify('initialized', undefined as never);
			const sent = await readNextMessage(peer.outbound) as { id?: unknown; method: string; params?: unknown };
			assert.strictEqual(sent.method, 'initialized');
			assert.strictEqual(sent.id, undefined);
			assert.strictEqual(sent.params, undefined);
		} finally {
			client.dispose();
			peer.dispose();
		}
	});

	test('server notification is delivered to registered handler', async () => {
		const peer = makeFakePeer();
		const client = new CodexAppServerClient(peer.transport);
		try {
			const received: unknown[] = [];
			const handle = client.onNotification('thread/started', params => received.push(params));
			peer.push({ method: 'thread/started', params: { thread: { id: 'thr_x' } } });
			// Give the data event a tick.
			await new Promise(r => setImmediate(r));
			assert.deepStrictEqual(received, [{ thread: { id: 'thr_x' } }]);
			handle.dispose();
		} finally {
			client.dispose();
			peer.dispose();
		}
	});

	test('unhandled server notification is dropped with a warning', async () => {
		const peer = makeFakePeer();
		const logs: { level: string; message: string }[] = [];
		const client = new CodexAppServerClient(peer.transport, (level, message) => logs.push({ level, message }));
		try {
			let invoked = false;
			const handle = client.onNotification('thread/started', () => { invoked = true; });
			peer.push({ method: 'made-up/method', params: { anything: 1 } });
			await new Promise(r => setImmediate(r));
			assert.deepStrictEqual({ invoked, logs }, {
				invoked: false,
				logs: [{ level: 'warn', message: 'dropping unhandled notification: made-up/method' }],
			});
			handle.dispose();
		} finally {
			client.dispose();
			peer.dispose();
		}
	});

	test('server request without handler returns MethodNotFound', async () => {
		const peer = makeFakePeer();
		const client = new CodexAppServerClient(peer.transport);
		try {
			peer.push({ id: 99, method: 'item/tool/requestUserInput', params: { questions: [] } });
			const reply = await readNextMessage(peer.outbound) as { id: number; error: { code: number; message: string } };
			assert.strictEqual(reply.id, 99);
			assert.strictEqual(reply.error.code, JsonRpcErrorCode.MethodNotFound);
		} finally {
			client.dispose();
			peer.dispose();
		}
	});

	test('server request with handler returns result envelope', async () => {
		const peer = makeFakePeer();
		const client = new CodexAppServerClient(peer.transport);
		try {
			const handle = client.onRequest('item/tool/requestUserInput', _params => ({
				result: { answers: { test: { answers: ['ok'] } } },
			}));
			peer.push({ id: 7, method: 'item/tool/requestUserInput', params: { questions: [{ id: 'test', label: 'go?' }] } });
			const reply = await readNextMessage(peer.outbound) as { id: number; result: unknown };
			assert.strictEqual(reply.id, 7);
			assert.deepStrictEqual(reply.result, { answers: { test: { answers: ['ok'] } } });
			handle.dispose();
		} finally {
			client.dispose();
			peer.dispose();
		}
	});

	test('server request handler throwing is converted to InternalError', async () => {
		const peer = makeFakePeer();
		const client = new CodexAppServerClient(peer.transport);
		try {
			const handle = client.onRequest('item/tool/requestUserInput', () => {
				throw new Error('boom');
			});
			peer.push({ id: 8, method: 'item/tool/requestUserInput', params: { questions: [] } });
			const reply = await readNextMessage(peer.outbound) as { id: number; error: { code: number; message: string } };
			assert.strictEqual(reply.error.code, JsonRpcErrorCode.InternalError);
			assert.match(reply.error.message, /boom/);
			handle.dispose();
		} finally {
			client.dispose();
			peer.dispose();
		}
	});

	test('process exit rejects in-flight requests', async () => {
		const peer = makeFakePeer();
		const client = new CodexAppServerClient(peer.transport);
		try {
			const responsePromise = client.request('getAuthStatus', { refreshToken: false, includeToken: false });
			// Consume the outbound write so the request is fully dispatched.
			await readNextMessage(peer.outbound);
			peer.exit(1);
			await assert.rejects(responsePromise, (err: unknown) => {
				assert.ok(err instanceof JsonRpcError, 'expected JsonRpcError');
				return true;
			});
		} finally {
			client.dispose();
			peer.dispose();
		}
	});

	test('dispose rejects pending requests with CancellationError', async () => {
		const peer = makeFakePeer();
		const client = new CodexAppServerClient(peer.transport);
		const responsePromise = client.request('getAuthStatus', { refreshToken: false, includeToken: false });
		await readNextMessage(peer.outbound);
		client.dispose();
		await assert.rejects(responsePromise, (err: unknown) => err instanceof CancellationError);
		peer.dispose();
	});

	test('dispose cancels grace kill when transport exits cleanly', async () => {
		const peer = makeFakePeer();
		const client = new CodexAppServerClient(peer.transport, undefined, 1);
		client.dispose();
		peer.exit(0);
		await new Promise(resolve => setTimeout(resolve, 5));
		assert.strictEqual(peer.killCount, 0);
		peer.dispose();
	});

	test('handles multiple messages arriving in a single chunk', async () => {
		const peer = makeFakePeer();
		const client = new CodexAppServerClient(peer.transport);
		try {
			const received: string[] = [];
			const h1 = client.onNotification('thread/started', () => received.push('a'));
			const h2 = client.onNotification('turn/started', () => received.push('b'));
			// Two NDJSON lines in one chunk.
			peer.transport.stdout.emit('data', JSON.stringify({ method: 'thread/started', params: { thread: { id: 't' } } }) + '\n' + JSON.stringify({ method: 'turn/started', params: { turn: { id: 'x' } } }) + '\n');
			await new Promise(r => setImmediate(r));
			assert.deepStrictEqual(received, ['a', 'b']);
			h1.dispose();
			h2.dispose();
		} finally {
			client.dispose();
			peer.dispose();
		}
	});

	test('partial line is buffered until newline arrives', async () => {
		const peer = makeFakePeer();
		const client = new CodexAppServerClient(peer.transport);
		try {
			const received: unknown[] = [];
			const handle = client.onNotification('thread/started', params => received.push(params));
			const json = JSON.stringify({ method: 'thread/started', params: { thread: { id: 'split' } } }) + '\n';
			peer.transport.stdout.emit('data', json.slice(0, 10));
			await new Promise(r => setImmediate(r));
			assert.deepStrictEqual(received, []);
			peer.transport.stdout.emit('data', json.slice(10));
			await new Promise(r => setImmediate(r));
			assert.deepStrictEqual(received, [{ thread: { id: 'split' } }]);
			handle.dispose();
		} finally {
			client.dispose();
			peer.dispose();
		}
	});
});
