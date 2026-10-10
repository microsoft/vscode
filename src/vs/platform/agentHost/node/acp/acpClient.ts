/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, type IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { type ICodexAppServerTransport, JsonRpcError, JsonRpcErrorCode, JsonRpcResponseError, type ServerRequestHandlerResult } from '../codex/codexAppServerClient.js';
import type { IAcpAgentNotifications, IAcpAgentRequests, IAcpClientNotifications, IAcpClientRequests } from './acpProtocol.js';

/** stdio pair of an ACP agent process; structurally identical to the Codex app-server transport. */
export type IAcpTransport = ICodexAppServerTransport;

export type AcpRequestHandlerResult<R> = ServerRequestHandlerResult<R>;

type AgentRequestMethod = keyof IAcpAgentRequests;
type ClientRequestMethod = keyof IAcpClientRequests;

interface IPendingRequest {
	resolve(value: unknown): void;
	reject(reason: unknown): void;
	readonly method: string;
}

interface IWireMessage {
	readonly jsonrpc?: string;
	readonly id?: number | string | null;
	readonly method?: string;
	readonly params?: unknown;
	readonly result?: unknown;
	readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
}

/**
 * JSON-RPC 2.0 client for an Agent Client Protocol agent over NDJSON stdio.
 *
 * Brokers typed requests and notifications in both directions and knows
 * nothing about agent host semantics; `AcpAgent` maps them onto `IAgent`.
 *
 * Unlike the Codex app-server, ACP agents expect the `"jsonrpc": "2.0"`
 * member on every message, and may use string request ids.
 */
export interface IAcpClient extends IDisposable {
	/** Fires once when the agent process exits (clean or otherwise). */
	readonly onExit: Event<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>;

	request<M extends AgentRequestMethod>(method: M, params: IAcpAgentRequests[M][0]): Promise<IAcpAgentRequests[M][1]>;

	notify<M extends keyof IAcpAgentNotifications>(method: M, params: IAcpAgentNotifications[M]): void;

	/** Only one handler per method; a later registration replaces the earlier one. */
	onNotification<M extends keyof IAcpClientNotifications>(method: M, handler: (params: IAcpClientNotifications[M]) => void): IDisposable;

	/**
	 * Only one handler per method; a later registration replaces the earlier one.
	 * Unregistered methods are answered with {@link JsonRpcErrorCode.MethodNotFound}.
	 */
	onRequest<M extends ClientRequestMethod>(
		method: M,
		handler: (params: IAcpClientRequests[M][0]) => Promise<AcpRequestHandlerResult<IAcpClientRequests[M][1]>> | AcpRequestHandlerResult<IAcpClientRequests[M][1]>,
	): IDisposable;
}

const GRACE_KILL_MS = 2_000;

export class AcpClient extends Disposable implements IAcpClient {

	private readonly _onExit = this._register(new Emitter<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>());
	readonly onExit = this._onExit.event;

	private _nextId = 1;
	private readonly _pending = new Map<number, IPendingRequest>();
	private readonly _notificationHandlers = new Map<string, (params: unknown) => void>();
	private readonly _requestHandlers = new Map<string, (params: unknown) => Promise<AcpRequestHandlerResult<unknown>>>();

	private _exited = false;
	private _disposed = false;
	private _buf = '';

	constructor(
		private readonly _transport: IAcpTransport,
		private readonly _onLog?: (level: 'trace' | 'warn' | 'error', message: string) => void,
		private readonly _graceKillMs = GRACE_KILL_MS,
	) {
		super();
		this._register(this._transport.onExit(e => this._handleExit(e)));
		this._transport.stdout.setEncoding?.('utf8');
		const onData = (chunk: string | Buffer) => this._onData(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
		this._transport.stdout.on('data', onData);
		this._register(toDisposable(() => this._transport.stdout.off('data', onData)));
	}

	private _onData(text: string): void {
		this._buf += text;
		let nl: number;
		while ((nl = this._buf.indexOf('\n')) >= 0) {
			const line = this._buf.slice(0, nl).trim();
			this._buf = this._buf.slice(nl + 1);
			if (!line) {
				continue;
			}
			let msg: IWireMessage;
			try {
				msg = JSON.parse(line);
			} catch {
				// Agents sometimes print diagnostics on stdout; never echo the line, it may contain user content.
				this._log('warn', `ignoring non-JSON line from agent (${line.length} chars)`);
				continue;
			}
			this._dispatch(msg);
		}
	}

	private _dispatch(msg: IWireMessage): void {
		const hasId = msg.id !== null && msg.id !== undefined;
		const method = typeof msg.method === 'string' ? msg.method : undefined;

		if (hasId && !method) {
			const pending = typeof msg.id === 'number' ? this._pending.get(msg.id) : undefined;
			if (!pending) {
				this._log('warn', `unsolicited response id=${String(msg.id)}`);
				return;
			}
			this._pending.delete(msg.id as number);
			if (msg.error) {
				pending.reject(new JsonRpcResponseError(msg.error.code, msg.error.message, msg.error.data));
			} else {
				pending.resolve(msg.result);
			}
			return;
		}

		if (method && hasId) {
			void this._handleRequest(msg.id as number | string, method, msg.params);
			return;
		}

		if (method) {
			const handler = this._notificationHandlers.get(method);
			if (!handler) {
				this._log('trace', `dropping unhandled notification: ${method}`);
				return;
			}
			try {
				handler(msg.params);
			} catch (err) {
				this._log('error', `notification handler ${method} threw: ${err instanceof Error ? err.message : String(err)}`);
			}
			return;
		}

		this._log('warn', 'unrecognized message from agent');
	}

	private async _handleRequest(id: number | string, method: string, params: unknown): Promise<void> {
		const handler = this._requestHandlers.get(method);
		if (!handler) {
			this._write({ jsonrpc: '2.0', id, error: { code: JsonRpcErrorCode.MethodNotFound, message: `Method not found: ${method}` } });
			return;
		}
		try {
			const result = await handler(params);
			if (result.error) {
				this._write({ jsonrpc: '2.0', id, error: result.error });
			} else {
				// `null` is a valid result (e.g. `fs/write_text_file`); JSON-RPC requires the member.
				this._write({ jsonrpc: '2.0', id, result: result.result ?? null });
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._log('error', `handler for ${method} threw: ${message}`);
			this._write({ jsonrpc: '2.0', id, error: { code: JsonRpcErrorCode.InternalError, message } });
		}
	}

	private _write(message: IWireMessage): boolean {
		if (this._exited || this._disposed) {
			return false;
		}
		try {
			this._transport.stdin.write(JSON.stringify(message) + '\n');
			return true;
		} catch (err) {
			this._log('error', `write failed: ${err instanceof Error ? err.message : String(err)}`);
			return false;
		}
	}

	private _handleExit(e: { code: number | null; signal: NodeJS.Signals | null }): void {
		if (this._exited) {
			return;
		}
		this._exited = true;
		const reason = `ACP agent exited (code=${e.code}, signal=${e.signal})`;
		for (const [id, pending] of this._pending) {
			pending.reject(new JsonRpcError(JsonRpcErrorCode.InternalError, `${reason}; request id=${id} (${pending.method}) aborted`));
		}
		this._pending.clear();
		this._onExit.fire(e);
	}

	request<M extends AgentRequestMethod>(method: M, params: IAcpAgentRequests[M][0]): Promise<IAcpAgentRequests[M][1]> {
		if (this._disposed) {
			return Promise.reject(new CancellationError());
		}
		if (this._exited) {
			return Promise.reject(new JsonRpcError(JsonRpcErrorCode.InternalError, 'ACP agent has exited'));
		}
		const id = this._nextId++;
		return new Promise((resolve, reject) => {
			this._pending.set(id, { method, resolve: resolve as (v: unknown) => void, reject });
			if (!this._write({ jsonrpc: '2.0', id, method, params })) {
				this._pending.delete(id);
				reject(new JsonRpcError(JsonRpcErrorCode.InternalError, 'write failed; ACP agent transport closed'));
			}
		});
	}

	notify<M extends keyof IAcpAgentNotifications>(method: M, params: IAcpAgentNotifications[M]): void {
		this._write({ jsonrpc: '2.0', method, params });
	}

	onNotification<M extends keyof IAcpClientNotifications>(method: M, handler: (params: IAcpClientNotifications[M]) => void): IDisposable {
		const wrapped = handler as (params: unknown) => void;
		this._notificationHandlers.set(method, wrapped);
		return toDisposable(() => {
			if (this._notificationHandlers.get(method) === wrapped) {
				this._notificationHandlers.delete(method);
			}
		});
	}

	onRequest<M extends ClientRequestMethod>(
		method: M,
		handler: (params: IAcpClientRequests[M][0]) => Promise<AcpRequestHandlerResult<IAcpClientRequests[M][1]>> | AcpRequestHandlerResult<IAcpClientRequests[M][1]>,
	): IDisposable {
		const wrapped = async (params: unknown) => handler(params as IAcpClientRequests[M][0]);
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
		for (const pending of this._pending.values()) {
			pending.reject(new CancellationError());
		}
		this._pending.clear();
		try {
			this._transport.stdin.end();
		} catch { /* already closed */ }
		if (!this._exited) {
			const timer = setTimeout(() => {
				try {
					this._transport.kill('SIGKILL');
				} catch { /* already dead */ }
			}, this._graceKillMs) as unknown as { unref?(): void };
			this._transport.onExitOnce(() => clearTimeout(timer as unknown as ReturnType<typeof setTimeout>));
			timer.unref?.();
		}
		super.dispose();
	}

	private _log(level: 'trace' | 'warn' | 'error', message: string): void {
		this._onLog?.(level, message);
	}
}
