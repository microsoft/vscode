/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import { AddressInfo } from 'net';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../log/common/log.js';

// #region Public types

/**
 * Per-request bookkeeping shared by every loopback proxy. `clientGone`
 * distinguishes a client-driven disconnect (socket already closed — write
 * nothing) from a service-driven `dispose()` (socket still open —
 * `res.destroy()` to unblock the client) when the abort signal fires.
 */
export interface IProxyInFlight {
	readonly ac: AbortController;
	readonly res: http.ServerResponse;
	clientGone: boolean;
}

/**
 * The shared, refcounted runtime exposed to subclasses while servicing
 * requests and minting handles. `state` is the subclass-owned mutable
 * payload (e.g. the current GitHub token) created once per bind by
 * {@link LoopbackProxyServer.createState} from the seed supplied to the
 * `acquire()` call that triggered the bind.
 */
export interface ILoopbackProxyRuntime<TState> {
	/** e.g. `http://127.0.0.1:54321` — no trailing slash. */
	readonly baseUrl: string;
	/** 256-bit hex string minted for this bind. */
	readonly nonce: string;
	/** In-flight requests; aborted on teardown. */
	readonly inFlight: Set<IProxyInFlight>;
	/** Subclass-owned mutable per-bind state. */
	readonly state: TState;
}

/**
 * Minimal handle every loopback proxy hands back from `start()`. Subclasses
 * are free to widen this with extra members (e.g. `setToken`,
 * `providerBaseUrl`).
 *
 * **Subprocess ownership invariant.** Callers that hand `baseUrl` / `nonce`
 * to a subprocess MUST kill that subprocess before calling `dispose()` —
 * after the last handle is disposed the proxy may rebind on a different port
 * and the subprocess would silently lose its endpoint.
 */
export interface ILoopbackProxyHandle extends IDisposable {
	/** e.g. `http://127.0.0.1:54321` — no trailing slash. */
	readonly baseUrl: string;
	/** 256-bit hex string. */
	readonly nonce: string;
}

// #endregion

// #region Internal state

interface IInternalRuntime<TState> extends ILoopbackProxyRuntime<TState> {
	readonly server: http.Server;
	refcount: number;
}

/**
 * Build the 256-bit hex nonce embedded in the proxy Bearer token. Web Crypto
 * is available in Node 18+.
 */
function generateNonce(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	let out = '';
	for (let i = 0; i < bytes.length; i++) {
		out += bytes[i].toString(16).padStart(2, '0');
	}
	return out;
}

// #endregion

/**
 * Reads the full body of an inbound request as a UTF-8 string.
 */
export function readProxyRequestBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

/**
 * Reusable base for the agent-host loopback HTTP proxies. Owns the
 * full server lifecycle — lazy bind on `127.0.0.1`, nonce minting,
 * refcounted handles, in-flight tracking, and teardown — so each concrete
 * proxy only has to implement request routing (`handleRequest`) and the
 * shape of its `state` (`createState`).
 *
 * `TState` is the subclass-owned per-bind mutable state; `TSeed` is the
 * value each `acquire()` caller threads into `createState()` so the state
 * is born valid (e.g. with a real GitHub token rather than a placeholder).
 * It defaults to `void` for proxies whose state needs no seed.
 *
 * Lifecycle: the first `start()` binds a single shared server; concurrent
 * `start()` calls share that bind. Each handle holds a refcount; when the
 * last one is disposed (or `dispose()` is called explicitly) the listener
 * closes, in-flight requests are aborted, and the next `start()` rebinds
 * with a fresh port and nonce.
 */
export abstract class LoopbackProxyServer<TState, TSeed = void> {

	private _runtime: IInternalRuntime<TState> | undefined;
	private _starting: Promise<IInternalRuntime<TState>> | undefined;
	private _disposed = false;

	constructor(
		/** Human-readable name used in log lines and error messages. */
		protected readonly name: string,
		protected readonly _logService: ILogService,
	) { }

	protected get isDisposed(): boolean {
		return this._disposed;
	}

	/**
	 * Build the subclass-owned mutable state object stored on the runtime.
	 * Called exactly once per bind, before any request can be dispatched,
	 * with the `seed` from the `acquire()` call that won the bind race so
	 * the state starts out valid instead of holding a placeholder.
	 */
	protected abstract createState(seed: TSeed): TState;

	/**
	 * Route + service an authenticated inbound request. Invoked for every
	 * request; any throw is caught by the base and turned into a 500.
	 */
	protected abstract handleRequest(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		runtime: ILoopbackProxyRuntime<TState>,
	): Promise<void>;

	/**
	 * Write the fallback "internal proxy error" response used when
	 * {@link handleRequest} throws before sending headers. Subclasses may
	 * override to match their wire format; the default emits a generic
	 * JSON error envelope.
	 */
	protected writeInternalError(res: http.ServerResponse): void {
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: { type: 'api_error', message: 'Internal proxy error' } }));
	}

	/**
	 * Acquire a refcounted lease on the shared runtime, binding the server
	 * if it isn't running yet. Subclasses build their public handle around
	 * the returned `runtime` and wire its `dispose()` to `release`.
	 *
	 * `seed` is forwarded to {@link createState} when this call triggers the
	 * bind; for callers that join an existing bind it is ignored (the state
	 * already exists), so they must apply their own value to `runtime.state`
	 * afterwards if they need last-writer-wins semantics.
	 *
	 * Throws if the service has been disposed (including if `dispose()`
	 * raced the bind).
	 */
	protected async acquire(seed: TSeed): Promise<{ runtime: ILoopbackProxyRuntime<TState>; release: () => void }> {
		if (this._disposed) {
			throw new Error(`${this.name} has been disposed`);
		}
		const runtime = await this._ensureRuntime(seed);
		// Re-check after the await: dispose() may have run while
		// _ensureRuntime was awaiting the bind, in which case the runtime
		// we received is already torn down — but a fresh start() in between
		// is also possible, so verify the active runtime hasn't moved.
		if (this._disposed || this._runtime !== runtime) {
			throw new Error(`${this.name} has been disposed`);
		}
		runtime.refcount++;

		let released = false;
		const release = () => {
			if (released) {
				return;
			}
			released = true;
			this._releaseHandle(runtime);
		};
		return { runtime, release };
	}

	dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._teardownRuntime();
	}

	/**
	 * Returns the shared runtime, binding a new server if there isn't one
	 * yet. Concurrent callers share the same in-flight bind via
	 * {@link _starting}; this prevents two listeners from being created when
	 * {@link acquire} is invoked twice before the first bind resolves.
	 *
	 * If {@link dispose} runs while the bind is in flight, the just-bound
	 * server is torn down here and the awaiting caller sees a rejected
	 * promise.
	 */
	private _ensureRuntime(seed: TSeed): Promise<IInternalRuntime<TState>> {
		if (this._runtime) {
			return Promise.resolve(this._runtime);
		}
		if (!this._starting) {
			this._starting = (async () => {
				try {
					const rt = await this._startServer(seed);
					if (this._disposed) {
						// dispose() ran while we were binding — the teardown
						// noop'd because _runtime was still undefined, so
						// close what we just created.
						rt.server.closeAllConnections();
						rt.server.close();
						throw new Error(`${this.name} has been disposed`);
					}
					this._runtime = rt;
					return rt;
				} finally {
					this._starting = undefined;
				}
			})();
		}
		return this._starting;
	}

	private _releaseHandle(runtime: IInternalRuntime<TState>): void {
		// If `dispose()` (or a later bind) already replaced the runtime, the
		// handle's refcount no longer applies.
		if (this._runtime !== runtime) {
			return;
		}
		runtime.refcount--;
		if (runtime.refcount === 0) {
			this._teardownRuntime();
		}
	}

	private _teardownRuntime(): void {
		const runtime = this._runtime;
		if (!runtime) {
			return;
		}
		this._runtime = undefined;
		// Abort in-flight requests so their catch handlers run and destroy
		// still-open responses; closeAllConnections() then frees the
		// listening socket immediately.
		for (const entry of runtime.inFlight) {
			entry.ac.abort();
		}
		runtime.server.closeAllConnections();
		runtime.server.close(err => {
			if (err) {
				this._logService.warn(`[${this.name}] server.close error: ${err.message}`);
			}
		});
	}

	private async _startServer(seed: TSeed): Promise<IInternalRuntime<TState>> {
		const nonce = generateNonce();
		const inFlight = new Set<IProxyInFlight>();
		const httpModule = await import('http');
		const server = httpModule.createServer();

		await new Promise<void>((resolve, reject) => {
			const onError = (err: Error) => reject(err);
			server.once('error', onError);
			server.listen(0, '127.0.0.1', () => {
				server.removeListener('error', onError);
				resolve();
			});
		});

		const address = server.address();
		if (!address || typeof address === 'string') {
			server.close();
			throw new Error(`${this.name} failed to bind: unexpected address ${String(address)}`);
		}
		const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
		this._logService.info(`[${this.name}] listening on ${baseUrl}`);

		const runtime: IInternalRuntime<TState> = {
			server,
			baseUrl,
			nonce,
			inFlight,
			refcount: 0,
			state: this.createState(seed),
		};

		// Attach the request handler only after `runtime` is fully built.
		// Node's single-threaded event loop guarantees no `request` event can
		// be parsed and dispatched between `listen` resolving and this
		// synchronous registration, so the handler can safely close over
		// `runtime` as a `const`.
		server.on('request', (req, res) => {
			this.handleRequest(req, res, runtime).catch(err => {
				// Last-resort safety net. Concrete proxies are expected to
				// handle their own throw paths.
				this._logService.error(`[${this.name}] unhandled request error: ${err instanceof Error ? err.message : String(err)}`);
				if (!res.headersSent) {
					try {
						this.writeInternalError(res);
					} catch {
						// nothing else we can do
					}
				} else if (!res.writableEnded) {
					try {
						res.end();
					} catch { /* ignore */ }
				}
			});
		});

		return runtime;
	}
}
