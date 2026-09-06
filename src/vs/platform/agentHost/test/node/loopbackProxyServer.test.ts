/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as http from 'http';
import * as net from 'net';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import {
	ILoopbackProxyRuntime,
	IProxyInFlight,
	LoopbackProxyServer,
	readProxyRequestBody,
} from '../../node/shared/loopbackProxyServer.js';

// #region Test subclass

interface ITestState {
	value: string;
}

type RequestHandler = (
	req: http.IncomingMessage,
	res: http.ServerResponse,
	runtime: ILoopbackProxyRuntime<ITestState>,
) => Promise<void>;

/**
 * Minimal concrete proxy used to drive the shared {@link LoopbackProxyServer}
 * lifecycle in isolation. The request handler and internal-error writer are
 * swappable per test; `createState` is counted so we can assert one state per
 * bind.
 */
class TestProxyServer extends LoopbackProxyServer<ITestState> {

	createStateCalls = 0;

	requestHandler: RequestHandler = async (_req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end('ok');
	};

	internalErrorWriter: ((res: http.ServerResponse) => void) | undefined;

	constructor(name = 'TestProxyServer') {
		super(name, new NullLogService());
	}

	protected createState(): ITestState {
		this.createStateCalls++;
		return { value: '' };
	}

	protected override handleRequest(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		runtime: ILoopbackProxyRuntime<ITestState>,
	): Promise<void> {
		return this.requestHandler(req, res, runtime);
	}

	protected override writeInternalError(res: http.ServerResponse): void {
		if (this.internalErrorWriter) {
			this.internalErrorWriter(res);
			return;
		}
		super.writeInternalError(res);
	}

	/** Test-only public wrapper around the protected {@link acquire}. */
	async startHandle(value?: string): Promise<ITestHandle> {
		const { runtime, release } = await this.acquire();
		if (value !== undefined) {
			runtime.state.value = value;
		}
		return {
			baseUrl: runtime.baseUrl,
			nonce: runtime.nonce,
			runtime,
			dispose: release,
		};
	}
}

interface ITestHandle {
	readonly baseUrl: string;
	readonly nonce: string;
	readonly runtime: ILoopbackProxyRuntime<ITestState>;
	dispose(): void;
}

/**
 * Concrete proxy whose per-bind state is seeded at `acquire()` time, used to
 * exercise the seed → {@link LoopbackProxyServer.createState} flow. Every seed
 * threaded into `createState` is recorded so tests can assert when — and with
 * which value — the state was built.
 */
class SeededTestProxyServer extends LoopbackProxyServer<ITestState, string> {

	readonly seeds: string[] = [];

	requestHandler: RequestHandler = async (_req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end('ok');
	};

	constructor(name = 'SeededTestProxyServer') {
		super(name, new NullLogService());
	}

	protected createState(seed: string): ITestState {
		this.seeds.push(seed);
		return { value: seed };
	}

	protected override handleRequest(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		runtime: ILoopbackProxyRuntime<ITestState>,
	): Promise<void> {
		return this.requestHandler(req, res, runtime);
	}

	/** Test-only public wrapper around the protected {@link acquire}. */
	async startHandle(seed: string): Promise<ITestHandle> {
		const { runtime, release } = await this.acquire(seed);
		return {
			baseUrl: runtime.baseUrl,
			nonce: runtime.nonce,
			runtime,
			dispose: release,
		};
	}
}

// #endregion

// #region HTTP helpers

let _httpModule: typeof http | undefined;
async function getHttp(): Promise<typeof http> {
	if (!_httpModule) {
		_httpModule = await import('http');
	}
	return _httpModule;
}

interface IFetchResult {
	status: number;
	headers: http.IncomingHttpHeaders;
	body: string;
	parsed: unknown;
}

function fetchHttp(
	url: string,
	init?: { method?: string; headers?: Record<string, string>; body?: string },
	onResponse?: (res: http.IncomingMessage, abort: () => void) => void,
): Promise<IFetchResult> {
	return getHttp().then(httpMod => new Promise<IFetchResult>((resolve, reject) => {
		const u = new URL(url);
		const req = httpMod.request({
			hostname: u.hostname,
			port: u.port,
			path: u.pathname + u.search,
			method: init?.method ?? 'GET',
			headers: init?.headers,
		}, res => {
			const chunks: Buffer[] = [];
			res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
			res.on('end', () => {
				const body = Buffer.concat(chunks).toString('utf8');
				let parsed: unknown;
				try { parsed = body ? JSON.parse(body) : undefined; } catch { parsed = undefined; }
				resolve({ status: res.statusCode ?? 0, headers: res.headers, body, parsed });
			});
			res.on('error', reject);
			onResponse?.(res, () => req.destroy());
		});
		req.on('error', reject);
		if (init?.body !== undefined) {
			req.write(init.body);
		}
		req.end();
	}));
}

/** Resolves `true` if the connection was refused (server torn down). */
async function isConnectionRefused(url: string): Promise<boolean> {
	try {
		await fetchHttp(url);
		return false;
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		return code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ECONNABORTED';
	}
}

// #endregion

suite('LoopbackProxyServer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// #region Lifecycle & binding

	suite('Lifecycle & binding', () => {

		test('startHandle() returns a loopback baseUrl and 256-bit hex nonce', async () => {
			const service = new TestProxyServer();
			const handle = await service.startHandle();
			try {
				assert.match(handle.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
				assert.match(handle.nonce, /^[0-9a-f]{64}$/);
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('binds only on the IPv4 loopback interface', async () => {
			const service = new TestProxyServer();
			const handle = await service.startHandle();
			try {
				assert.match(handle.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
				// Binding to 127.0.0.1 must NOT also listen on the IPv6
				// loopback (::1); a connection there should be refused.
				const port = Number(new URL(handle.baseUrl).port);
				const refusedOnIpv6 = await new Promise<boolean>(resolve => {
					const socket = net.connect({ host: '::1', port });
					socket.once('connect', () => { socket.destroy(); resolve(false); });
					socket.once('error', () => { socket.destroy(); resolve(true); });
				});
				assert.strictEqual(refusedOnIpv6, true, 'server should not be reachable on ::1');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('serves real requests via handleRequest', async () => {
			const service = new TestProxyServer();
			service.requestHandler = async (_req, res) => {
				res.writeHead(201, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ hello: 'world' }));
			};
			const handle = await service.startHandle();
			try {
				const res = await fetchHttp(`${handle.baseUrl}/anything`);
				assert.strictEqual(res.status, 201);
				assert.deepStrictEqual(res.parsed, { hello: 'world' });
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('handleRequest receives the runtime with baseUrl, nonce and state', async () => {
			const service = new TestProxyServer();
			let seen: ILoopbackProxyRuntime<ITestState> | undefined;
			service.requestHandler = async (_req, res, runtime) => {
				seen = runtime;
				res.writeHead(200);
				res.end();
			};
			const handle = await service.startHandle('payload');
			try {
				await fetchHttp(`${handle.baseUrl}/`);
				assert.strictEqual(seen, handle.runtime);
				assert.strictEqual(seen?.baseUrl, handle.baseUrl);
				assert.strictEqual(seen?.nonce, handle.nonce);
				assert.strictEqual(seen?.state.value, 'payload');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});
	});

	// #endregion

	// #region Refcounting

	suite('Refcounting', () => {

		test('concurrent acquires share a single bind and one state object', async () => {
			const service = new TestProxyServer();
			// Issue both before the first bind resolves; they must share
			// the runtime rather than each binding a server.
			const [h1, h2] = await Promise.all([
				service.startHandle('a'),
				service.startHandle('b'),
			]);
			try {
				assert.strictEqual(h1.baseUrl, h2.baseUrl);
				assert.strictEqual(h1.nonce, h2.nonce);
				assert.strictEqual(h1.runtime.state, h2.runtime.state, 'state is shared by reference');
				assert.strictEqual(service.createStateCalls, 1);
			} finally {
				h1.dispose();
				h2.dispose();
				service.dispose();
			}
		});

		test('disposing one handle while another is alive keeps the server up', async () => {
			const service = new TestProxyServer();
			const h1 = await service.startHandle();
			const h2 = await service.startHandle();
			h1.dispose();
			try {
				const res = await fetchHttp(`${h2.baseUrl}/`);
				assert.strictEqual(res.status, 200);
			} finally {
				h2.dispose();
				service.dispose();
			}
		});

		test('disposing the last handle tears the server down', async () => {
			const service = new TestProxyServer();
			const handle = await service.startHandle();
			const baseUrl = handle.baseUrl;
			// Reachable while held.
			assert.strictEqual((await fetchHttp(`${baseUrl}/`)).status, 200);
			handle.dispose();
			assert.strictEqual(await isConnectionRefused(`${baseUrl}/`), true);
			service.dispose();
		});

		test('startHandle() after refcount-0 teardown rebinds with a fresh nonce and new state', async () => {
			const service = new TestProxyServer();
			const h1 = await service.startHandle();
			const nonce1 = h1.nonce;
			h1.dispose();

			const h2 = await service.startHandle();
			try {
				assert.notStrictEqual(h2.nonce, nonce1);
				assert.match(h2.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
				assert.strictEqual(service.createStateCalls, 2, 'state is rebuilt per bind');
			} finally {
				h2.dispose();
				service.dispose();
			}
		});
	});

	// #endregion

	// #region Seeding

	suite('Seeding', () => {

		test('acquire seeds createState so the state is born valid with no placeholder window', async () => {
			const service = new SeededTestProxyServer();
			// Capture the state the very first dispatched request observes to
			// prove no empty/placeholder value is ever visible on the wire.
			let firstRequestValue: string | undefined;
			service.requestHandler = async (_req, res, runtime) => {
				firstRequestValue = runtime.state.value;
				res.writeHead(200);
				res.end();
			};
			const handle = await service.startHandle('token-1');
			try {
				await fetchHttp(`${handle.baseUrl}/`);
				assert.deepStrictEqual(
					{ seeds: service.seeds, state: handle.runtime.state.value, firstRequestValue },
					{ seeds: ['token-1'], state: 'token-1', firstRequestValue: 'token-1' },
				);
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('concurrent acquires build state once from the seed that wins the bind', async () => {
			const service = new SeededTestProxyServer();
			// Both are issued before the first bind resolves; the first caller
			// wins the bind race so createState runs once with its seed, while
			// the second just joins the shared runtime.
			const [h1, h2] = await Promise.all([
				service.startHandle('token-1'),
				service.startHandle('token-2'),
			]);
			try {
				assert.deepStrictEqual(
					{ seeds: service.seeds, shared: h1.runtime.state === h2.runtime.state, value: h1.runtime.state.value },
					{ seeds: ['token-1'], shared: true, value: 'token-1' },
				);
			} finally {
				h1.dispose();
				h2.dispose();
				service.dispose();
			}
		});

		test('rebinding after refcount-0 teardown re-seeds createState with the new value', async () => {
			const service = new SeededTestProxyServer();
			const h1 = await service.startHandle('token-1');
			h1.dispose();

			const h2 = await service.startHandle('token-2');
			try {
				assert.deepStrictEqual(
					{ seeds: service.seeds, value: h2.runtime.state.value },
					{ seeds: ['token-1', 'token-2'], value: 'token-2' },
				);
			} finally {
				h2.dispose();
				service.dispose();
			}
		});
	});

	// #endregion

	// #region Dispose semantics

	suite('Dispose semantics', () => {

		test('explicit dispose() tears down regardless of live handles', async () => {
			const service = new TestProxyServer();
			const handle = await service.startHandle();
			const baseUrl = handle.baseUrl;
			service.dispose();
			// Handle is still "held" by the caller, but the service is gone.
			assert.strictEqual(await isConnectionRefused(`${baseUrl}/`), true);
			// Releasing the now-stale handle must be a safe no-op.
			handle.dispose();
		});

		test('dispose() while a bind is in flight rejects the pending acquire', async () => {
			const service = new TestProxyServer();
			const startPromise = service.startHandle();
			service.dispose();
			await assert.rejects(() => startPromise, /disposed/);
		});

		test('acquire after dispose() rejects', async () => {
			const service = new TestProxyServer();
			service.dispose();
			await assert.rejects(() => service.startHandle(), /disposed/);
		});

		test('dispose() is idempotent', async () => {
			const service = new TestProxyServer();
			const handle = await service.startHandle();
			handle.dispose();
			service.dispose();
			service.dispose();
			// Re-disposing the released handle is also a no-op.
			handle.dispose();
		});

		test('error message is prefixed with the proxy name', async () => {
			const service = new TestProxyServer('MyCustomProxy');
			service.dispose();
			await assert.rejects(() => service.startHandle(), /MyCustomProxy has been disposed/);
		});
	});

	// #endregion

	// #region Unhandled errors

	suite('Unhandled errors', () => {

		test('throw before headers → default internal-error envelope (500)', async () => {
			const service = new TestProxyServer();
			service.requestHandler = async () => {
				throw new Error('boom');
			};
			const handle = await service.startHandle();
			try {
				const res = await fetchHttp(`${handle.baseUrl}/`);
				assert.strictEqual(res.status, 500);
				assert.deepStrictEqual(res.parsed, { error: { type: 'api_error', message: 'Internal proxy error' } });
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('throw before headers → subclass writeInternalError override is used', async () => {
			const service = new TestProxyServer();
			service.internalErrorWriter = res => {
				res.writeHead(503, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ custom: true }));
			};
			service.requestHandler = async () => {
				throw new Error('boom');
			};
			const handle = await service.startHandle();
			try {
				const res = await fetchHttp(`${handle.baseUrl}/`);
				assert.strictEqual(res.status, 503);
				assert.deepStrictEqual(res.parsed, { custom: true });
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('throw after headers are sent → response is ended without crashing', async () => {
			const service = new TestProxyServer();
			service.requestHandler = async (_req, res) => {
				res.writeHead(200, { 'Content-Type': 'text/plain' });
				res.write('partial');
				throw new Error('boom after headers');
			};
			const handle = await service.startHandle();
			try {
				const res = await fetchHttp(`${handle.baseUrl}/`);
				assert.strictEqual(res.status, 200);
				assert.strictEqual(res.body, 'partial');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});
	});

	// #endregion

	// #region In-flight abort

	suite('In-flight abort', () => {

		test('dispose() aborts in-flight requests and destroys their sockets', async () => {
			const service = new TestProxyServer();
			let aborted = false;
			let entered!: () => void;
			const handlerEntered = new Promise<void>(resolve => { entered = resolve; });

			service.requestHandler = async (_req, res, runtime) => {
				const entry: IProxyInFlight = { ac: new AbortController(), res, clientGone: false };
				runtime.inFlight.add(entry);
				res.on('close', () => { entry.clientGone = true; entry.ac.abort(); });
				try {
					entered();
					await new Promise<void>(resolve => {
						entry.ac.signal.addEventListener('abort', () => {
							aborted = true;
							// Service-driven abort: socket still open → destroy.
							if (!entry.clientGone && !res.writableEnded) {
								res.destroy();
							}
							resolve();
						});
					});
				} finally {
					runtime.inFlight.delete(entry);
				}
			};

			const handle = await service.startHandle();
			const reqError = fetchHttp(`${handle.baseUrl}/`).catch((err: NodeJS.ErrnoException) => err);

			await handlerEntered;
			service.dispose();

			const result = await reqError;
			assert.ok(result instanceof Error, 'client request should error when the socket is destroyed');
			assert.strictEqual(aborted, true, 'in-flight AbortController should have fired');
			handle.dispose();
		});
	});

	// #endregion

	// #region readProxyRequestBody

	suite('readProxyRequestBody', () => {

		test('reads the full request body as UTF-8', async () => {
			const service = new TestProxyServer();
			let received: string | undefined;
			service.requestHandler = async (req, res) => {
				received = await readProxyRequestBody(req);
				res.writeHead(200);
				res.end();
			};
			const handle = await service.startHandle();
			try {
				const payload = JSON.stringify({ greeting: 'héllo 🌍', n: 42 });
				await fetchHttp(`${handle.baseUrl}/`, { method: 'POST', body: payload });
				assert.strictEqual(received, payload);
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('resolves to an empty string for a body-less request', async () => {
			const service = new TestProxyServer();
			let received: string | undefined;
			service.requestHandler = async (req, res) => {
				received = await readProxyRequestBody(req);
				res.writeHead(200);
				res.end();
			};
			const handle = await service.startHandle();
			try {
				await fetchHttp(`${handle.baseUrl}/`, { method: 'POST' });
				assert.strictEqual(received, '');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});
	});

	// #endregion
});
