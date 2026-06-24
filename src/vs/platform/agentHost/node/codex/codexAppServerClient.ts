/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Readable, Writable } from 'stream';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, type IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import type { ClientNotification } from './protocol/generated/ClientNotification.js';
import type { ClientRequest } from './protocol/generated/ClientRequest.js';
import type { RequestId } from './protocol/generated/RequestId.js';
import type { ServerNotification } from './protocol/generated/ServerNotification.js';
import type { ServerRequest } from './protocol/generated/ServerRequest.js';

// #region Wire types
//
// JSON-RPC 2.0 over NDJSON, with the `"jsonrpc": "2.0"` field *omitted on
// the wire* per the codex app-server convention. The generated
// `ClientRequest` / `ClientNotification` / `ServerRequest` /
// `ServerNotification` unions encode `method` + `params` shapes; we add
// `id` + `result` / `error` envelopes on top.

interface IWireResponseSuccess<R = unknown> {
	readonly id: RequestId;
	readonly result: R;
	readonly error?: undefined;
	readonly method?: undefined;
}

interface IWireResponseError {
	readonly id: RequestId;
	readonly result?: undefined;
	readonly error: { readonly code: number; readonly message: string; readonly data?: unknown };
	readonly method?: undefined;
}

type WireMessage = ClientNotification | ClientRequest | ServerNotification | ServerRequest | IWireResponseSuccess | IWireResponseError;

// #endregion

/**
 * Standard JSON-RPC error codes.
 *
 * @see https://www.jsonrpc.org/specification#error_object
 */
export const enum JsonRpcErrorCode {
	ParseError = -32700,
	InvalidRequest = -32600,
	MethodNotFound = -32601,
	InvalidParams = -32602,
	InternalError = -32603,
}

/**
 * Error thrown when a remote request responds with an `error` envelope.
 */
export class JsonRpcError extends Error {
	constructor(
		readonly code: number,
		message: string,
		readonly data?: unknown,
	) {
		super(message);
		this.name = 'JsonRpcError';
	}
}

// #region Typed method projections
//
// Extract `<method>` → `params` / `result` for each direction. The
// generated unions have shape `{ method: "x/y", id?: RequestId, params: P
// }`, so a discriminated-union pick works as a method-keyed lookup.

type MethodOf<U> = U extends { method: infer M } ? M : never;
type ParamsOf<U, M> = U extends { method: M; params: infer P } ? P : never;

export type ClientRequestMethod = MethodOf<ClientRequest>;
export type ClientNotificationMethod = MethodOf<ClientNotification>;
export type ServerRequestMethod = MethodOf<ServerRequest>;
export type ServerNotificationMethod = MethodOf<ServerNotification>;

export type ClientRequestParams<M extends ClientRequestMethod> = ParamsOf<ClientRequest, M>;
export type ClientNotificationParams<M extends ClientNotificationMethod> = ParamsOf<ClientNotification, M>;
export type ServerRequestParams<M extends ServerRequestMethod> = ParamsOf<ServerRequest, M>;
export type ServerNotificationParams<M extends ServerNotificationMethod> = ParamsOf<ServerNotification, M>;

// `result` for client-issued requests doesn't have a single generated
// union; each method has its own `<X>Response` type. We surface the
// response shape as a generic parameter on `request<M, R>` so callers
// can name the response type explicitly, defaulting to `unknown`.

// #endregion

/**
 * Result of a server→client request. Either a successful result payload
 * or a JSON-RPC error envelope. Implementations of
 * {@link ICodexAppServerClient.onRequest} return one of these.
 */
export type ServerRequestHandlerResult<R = unknown> =
	| { readonly result: R; readonly error?: undefined }
	| { readonly result?: undefined; readonly error: { readonly code: number; readonly message: string; readonly data?: unknown } };

/**
 * Subset of `ChildProcessWithoutNullStreams` we actually use, so callers
 * can pass either a real child process or an in-memory pair for tests.
 */
export interface ICodexAppServerTransport {
	readonly stdin: Writable;
	readonly stdout: Readable;
	/** Force termination. Used as the 2 s grace force-kill fallback. */
	kill(signal?: NodeJS.Signals): boolean;
	/** Fires when the underlying process exits. */
	readonly onExit: Event<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>;
	/** Registers a one-shot exit listener that may outlive client disposal. */
	onExitOnce(listener: (e: { readonly code: number | null; readonly signal: NodeJS.Signals | null }) => void): void;
}

/**
 * Generic JSON-RPC client over a {@link ICodexAppServerTransport}.
 *
 * The client doesn't know anything about codex's domain — it just
 * brokers typed requests and notifications in both directions. The
 * `CodexAgent` layer above translates this into `IAgent` semantics.
 *
 * Lifecycle:
 *  - Construct with an active transport. The client immediately starts
 *    reading from `transport.stdout`.
 *  - Send requests / notifications via {@link request} / {@link notify}.
 *  - Register handlers for server-initiated traffic via
 *    {@link onNotification} / {@link onRequest}.
 *  - On `dispose()`: send EOF on stdin, wait up to 2 s for clean exit,
 *    then SIGKILL. Outstanding requests reject with `CancellationError`.
 */
export interface ICodexAppServerClient extends IDisposable {
	/** Fires once when the transport exits (clean or otherwise). */
	readonly onExit: Event<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>;

	/** Fires when the underlying transport rejects further writes (process exited unexpectedly). */
	readonly onTransportError: Event<Error>;

	/**
	 * Issue a request. Resolves with the typed response payload, or
	 * rejects with {@link JsonRpcError} for protocol-level errors and
	 * {@link CancellationError} on dispose.
	 */
	request<M extends ClientRequestMethod, R = unknown>(
		method: M,
		params: ClientRequestParams<M>,
	): Promise<R>;

	/**
	 * Fire-and-forget notification. Does not throw if the transport
	 * already closed; lost notifications are surfaced via
	 * `onTransportError`.
	 */
	notify<M extends ClientNotificationMethod>(
		method: M,
		params: ClientNotificationParams<M>,
	): void;

	/**
	 * Register a handler for a server-pushed notification.
	 *
	 * Only one handler per method; subsequent registrations replace the
	 * previous handler.
	 */
	onNotification<M extends ServerNotificationMethod>(
		method: M,
		handler: (params: ServerNotificationParams<M>) => void,
	): IDisposable;

	/**
	 * Register a handler for a server-initiated request. The handler
	 * returns a typed result or an error envelope.
	 *
	 * Only one handler per method; subsequent registrations replace the
	 * previous handler. Unregistered methods reply with
	 * {@link JsonRpcErrorCode.MethodNotFound}.
	 */
	onRequest<M extends ServerRequestMethod, R = unknown>(
		method: M,
		handler: (params: ServerRequestParams<M>) => Promise<ServerRequestHandlerResult<R>> | ServerRequestHandlerResult<R>,
	): IDisposable;
}

interface IPendingRequest {
	resolve(value: unknown): void;
	reject(reason: unknown): void;
	readonly method: string;
}

const GRACE_KILL_MS = 2_000;

export class CodexAppServerClient extends Disposable implements ICodexAppServerClient {

	private readonly _onExit = this._register(new Emitter<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>());
	readonly onExit = this._onExit.event;

	private readonly _onTransportError = this._register(new Emitter<Error>());
	readonly onTransportError = this._onTransportError.event;

	private _nextId = 1;
	private readonly _pending = new Map<number, IPendingRequest>();
	private readonly _notificationHandlers = new Map<string, (params: unknown) => void>();
	private readonly _requestHandlers = new Map<string, (params: unknown) => Promise<ServerRequestHandlerResult<unknown>>>();

	private _exited = false;
	private _disposed = false;
	private _buf = '';

	constructor(
		private readonly _transport: ICodexAppServerTransport,
		private readonly _onLog?: (level: 'info' | 'warn' | 'error', message: string) => void,
		private readonly _graceKillMs = GRACE_KILL_MS,
	) {
		super();
		this._register(this._transport.onExit(e => this._handleExit(e)));
		this._transport.stdout.setEncoding?.('utf8');
		this._register(this._listenToStdout());
	}

	private _listenToStdout(): IDisposable {
		const onData = (chunk: string | Buffer) => {
			const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
			this._buf += text;
			let nl: number;
			while ((nl = this._buf.indexOf('\n')) >= 0) {
				const line = this._buf.slice(0, nl);
				this._buf = this._buf.slice(nl + 1);
				const trimmed = line.trim();
				if (trimmed.length === 0) {
					continue;
				}
				let parsed: WireMessage;
				try {
					parsed = JSON.parse(trimmed) as WireMessage;
				} catch (err) {
					this._log('error', `parse error on line: ${trimmed.slice(0, 200)}`);
					continue;
				}
				this._dispatch(parsed);
			}
		};
		this._transport.stdout.on('data', onData);
		return toDisposable(() => this._transport.stdout.off('data', onData));
	}

	private _dispatch(msg: WireMessage): void {
		const hasId = hasKey(msg, { id: true });
		const hasMethod = hasKey(msg, { method: true });
		// Response envelope (has id and either result or error, no method).
		if (hasId && !hasMethod && (hasKey(msg, { result: true }) || hasKey(msg, { error: true }))) {
			if (typeof msg.id !== 'number') {
				this._log('warn', `unsolicited response id=${msg.id}`);
				return;
			}
			const id = msg.id;
			const pending = this._pending.get(id);
			if (!pending) {
				this._log('warn', `unsolicited response id=${msg.id}`);
				return;
			}
			this._pending.delete(id);
			if (hasKey(msg, { error: true }) && msg.error) {
				pending.reject(new JsonRpcError(msg.error.code, msg.error.message, msg.error.data));
			} else {
				pending.resolve((msg as IWireResponseSuccess).result);
			}
			return;
		}

		// Server→client request (has method + id).
		if (hasMethod && hasId && msg.id !== undefined && msg.method !== undefined) {
			void this._handleServerRequest(msg as ServerRequest);
			return;
		}

		// Server→client notification (has method, no id).
		if (hasMethod && msg.method !== undefined) {
			this._handleServerNotification(msg as ServerNotification);
			return;
		}

		this._log('warn', `unrecognized message: ${JSON.stringify(msg).slice(0, 200)}`);
	}

	private async _handleServerRequest(msg: ServerRequest): Promise<void> {
		const handler = this._requestHandlers.get(msg.method);
		if (!handler) {
			this._writeMessage({
				id: msg.id,
				error: {
					code: JsonRpcErrorCode.MethodNotFound,
					message: `Method not found: ${msg.method}`,
				},
			});
			return;
		}
		try {
			const result = await handler(msg.params);
			if (result.error) {
				this._writeMessage({ id: msg.id, error: result.error });
			} else {
				this._writeMessage({ id: msg.id, result: result.result });
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._log('error', `handler for ${msg.method} threw: ${message}`);
			this._writeMessage({
				id: msg.id,
				error: { code: JsonRpcErrorCode.InternalError, message },
			});
		}
	}

	private _handleServerNotification(msg: ServerNotification): void {
		const handler = this._notificationHandlers.get(msg.method);
		if (!handler) {
			// Tolerate unhandled notifications (newer codex versions may add
			// notifications we don't handle yet). Warn so every dropped method is
			// intentionally triaged by CodexAgent instead of disappearing silently.
			this._log('warn', `dropping unhandled notification: ${msg.method}`);
			return;
		}
		try {
			handler(msg.params);
		} catch (err) {
			this._log('error', `notification handler ${msg.method} threw: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private _writeMessage(message: unknown): boolean {
		if (this._exited || this._disposed) {
			return false;
		}
		try {
			this._transport.stdin.write(JSON.stringify(message) + '\n');
			return true;
		} catch (err) {
			this._onTransportError.fire(err instanceof Error ? err : new Error(String(err)));
			return false;
		}
	}

	private _handleExit(e: { code: number | null; signal: NodeJS.Signals | null }): void {
		if (this._exited) {
			return;
		}
		this._exited = true;
		const reason = `codex app-server exited (code=${e.code}, signal=${e.signal})`;
		for (const [id, pending] of this._pending) {
			pending.reject(new JsonRpcError(JsonRpcErrorCode.InternalError, `${reason}; request id=${id} (${pending.method}) aborted`));
		}
		this._pending.clear();
		this._onExit.fire(e);
	}

	request<M extends ClientRequestMethod, R = unknown>(
		method: M,
		params: ClientRequestParams<M>,
	): Promise<R> {
		if (this._disposed) {
			return Promise.reject(new CancellationError());
		}
		if (this._exited) {
			return Promise.reject(new JsonRpcError(JsonRpcErrorCode.InternalError, 'transport has exited'));
		}
		const id = this._nextId++;
		return new Promise<R>((resolve, reject) => {
			this._pending.set(id, { method, resolve: resolve as (v: unknown) => void, reject });
			const ok = this._writeMessage({ id, method, params });
			if (!ok) {
				this._pending.delete(id);
				reject(new JsonRpcError(JsonRpcErrorCode.InternalError, 'write failed; transport closed'));
			}
		});
	}

	notify<M extends ClientNotificationMethod>(
		method: M,
		params: ClientNotificationParams<M>,
	): void {
		// `params` may be `undefined` (e.g. `initialized` carries no
		// payload). Don't include the key in that case.
		const payload: { method: string; params?: unknown } = { method };
		if (params !== undefined) {
			payload.params = params;
		}
		this._writeMessage(payload);
	}

	onNotification<M extends ServerNotificationMethod>(
		method: M,
		handler: (params: ServerNotificationParams<M>) => void,
	): IDisposable {
		this._notificationHandlers.set(method, handler as (params: unknown) => void);
		return toDisposable(() => {
			if (this._notificationHandlers.get(method) === handler) {
				this._notificationHandlers.delete(method);
			}
		});
	}

	onRequest<M extends ServerRequestMethod, R = unknown>(
		method: M,
		handler: (params: ServerRequestParams<M>) => Promise<ServerRequestHandlerResult<R>> | ServerRequestHandlerResult<R>,
	): IDisposable {
		const wrapped = async (params: unknown): Promise<ServerRequestHandlerResult<unknown>> => {
			return await handler(params as ServerRequestParams<M>);
		};
		this._requestHandlers.set(method, wrapped);
		return toDisposable(() => {
			if (this._requestHandlers.get(method) === wrapped) {
				this._requestHandlers.delete(method);
			}
		});
	}

	override dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		// Reject anything still pending so callers don't hang.
		for (const pending of this._pending.values()) {
			pending.reject(new CancellationError());
		}
		this._pending.clear();
		// Try a graceful EOF on stdin; if the process doesn't exit in
		// {@link GRACE_KILL_MS}, SIGKILL.
		try {
			this._transport.stdin.end();
		} catch { /* already closed */ }
		if (!this._exited) {
			const timer = setTimeout(() => {
				try {
					this._transport.kill('SIGKILL');
				} catch { /* already dead */ }
			}, this._graceKillMs) as unknown as { unref?(): void };
			this._transport.onExitOnce(() => {
				clearTimeout(timer as unknown as ReturnType<typeof setTimeout>);
			});
			timer.unref?.();
		}
		super.dispose();
	}

	private _log(level: 'info' | 'warn' | 'error', message: string): void {
		this._onLog?.(level, message);
	}
}

/**
 * Wrap a {@link import('node:child_process').ChildProcessWithoutNullStreams}
 * into an {@link ICodexAppServerTransport}. Tests use a fake transport
 * built around `node:stream`'s `PassThrough` or similar.
 */
export function transportFromChildProcess(
	child: { stdin: Writable | null; stdout: Readable | null; kill: (signal?: NodeJS.Signals) => boolean; on: (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void) => unknown; once: (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void) => unknown; removeListener: (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void) => unknown },
): ICodexAppServerTransport {
	if (!child.stdin || !child.stdout) {
		throw new Error('Child process has no stdio pair');
	}
	return {
		stdin: child.stdin,
		stdout: child.stdout,
		kill: signal => child.kill(signal),
		onExit: Event.fromNodeEventEmitter(child, 'exit', (code: number | null, signal: NodeJS.Signals | null) => ({ code, signal })),
		onExitOnce: listener => child.once('exit', (code, signal) => listener({ code, signal })),
	};
}
