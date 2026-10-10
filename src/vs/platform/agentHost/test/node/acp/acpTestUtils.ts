/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PassThrough } from 'stream';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import type { IAcpTransport } from '../../../node/acp/acpClient.js';

/** Params of a client request, loosely typed for scripted handlers. */
export interface IFakeRequestParams {
	readonly [key: string]: unknown;
	readonly sessionId: string;
	readonly value: string;
}

type RequestHandler = (params: IFakeRequestParams, agent: FakeAcpAgentProcess) => unknown | Promise<unknown>;

/**
 * In-memory ACP agent process. Answers client requests with scripted
 * handlers and can push notifications or issue its own requests.
 */
export class FakeAcpAgentProcess {

	readonly transport: IAcpTransport;
	/** Every request and notification the client sent, in order. */
	readonly received: { method: string; params: unknown }[] = [];
	readonly handlers = new Map<string, RequestHandler>();

	private readonly _stdin = new PassThrough();
	private readonly _stdout = new PassThrough();
	private readonly _exit = new Emitter<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>();
	private readonly _onceExit: ((e: { readonly code: number | null; readonly signal: NodeJS.Signals | null }) => void)[] = [];
	private readonly _pendingClientReplies = new Map<string, DeferredPromise<unknown>>();
	private readonly _messageWaiters: { method: string; deferred: DeferredPromise<unknown> }[] = [];
	/** Client messages no {@link nextMessage} call has claimed yet. */
	private readonly _unclaimed: { method: string; params: unknown }[] = [];
	private _nextId = 1;
	private _buf = '';
	private _exited = false;

	constructor() {
		this._stdin.setEncoding('utf8');
		this._stdin.on('data', (chunk: string) => this._onData(chunk));
		this.transport = {
			stdin: this._stdin,
			stdout: this._stdout,
			kill: signal => {
				this.exit(null, signal ?? null);
				return true;
			},
			onExit: this._exit.event,
			onExitOnce: listener => { this._onceExit.push(listener); },
		};
		this.handlers.set('initialize', () => ({
			protocolVersion: 1,
			agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {}, list: {}, close: {} } },
			authMethods: [],
		}));
	}

	/** Resolves with the params of the oldest unclaimed client message with `method`, waiting if none arrived yet. */
	nextMessage(method: string): Promise<unknown> {
		const index = this._unclaimed.findIndex(m => m.method === method);
		if (index >= 0) {
			return Promise.resolve(this._unclaimed.splice(index, 1)[0].params);
		}
		const deferred = new DeferredPromise<unknown>();
		this._messageWaiters.push({ method, deferred });
		return deferred.p;
	}

	notify(method: string, params: unknown): void {
		this._write({ jsonrpc: '2.0', method, params });
	}

	/** Sends a request to the client and resolves with its result (or the error envelope). */
	request(method: string, params: unknown): Promise<unknown> {
		const id = `agent-${this._nextId++}`;
		const deferred = new DeferredPromise<unknown>();
		this._pendingClientReplies.set(id, deferred);
		this._write({ jsonrpc: '2.0', id, method, params });
		return deferred.p;
	}

	exit(code: number | null, signal: NodeJS.Signals | null = null): void {
		if (this._exited) {
			return;
		}
		this._exited = true;
		this._exit.fire({ code, signal });
		for (const listener of this._onceExit.splice(0)) {
			listener({ code, signal });
		}
	}

	dispose(): void {
		this._exit.dispose();
		this._stdin.destroy();
		this._stdout.destroy();
	}

	private _write(message: object): void {
		if (!this._exited) {
			this._stdout.write(JSON.stringify(message) + '\n');
		}
	}

	private _onData(chunk: string): void {
		this._buf += chunk;
		let nl: number;
		while ((nl = this._buf.indexOf('\n')) >= 0) {
			const line = this._buf.slice(0, nl);
			this._buf = this._buf.slice(nl + 1);
			if (line.trim()) {
				void this._handle(JSON.parse(line));
			}
		}
	}

	private async _handle(msg: { id?: number | string; method?: string; params?: unknown; result?: unknown; error?: unknown }): Promise<void> {
		if (msg.method === undefined) {
			const pending = this._pendingClientReplies.get(String(msg.id));
			this._pendingClientReplies.delete(String(msg.id));
			pending?.complete(msg.error ? { error: msg.error } : msg.result);
			return;
		}
		this.received.push({ method: msg.method, params: msg.params });
		const waiter = this._messageWaiters.findIndex(w => w.method === msg.method);
		if (waiter >= 0) {
			this._messageWaiters.splice(waiter, 1)[0].deferred.complete(msg.params);
		} else {
			this._unclaimed.push({ method: msg.method, params: msg.params });
		}
		if (msg.id === undefined) {
			return;
		}
		const handler = this.handlers.get(msg.method);
		if (!handler) {
			this._write({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
			return;
		}
		try {
			this._write({ jsonrpc: '2.0', id: msg.id, result: (await handler(msg.params as IFakeRequestParams, this)) ?? null });
		} catch (error) {
			const err = error as { code?: number; message?: string };
			this._write({ jsonrpc: '2.0', id: msg.id, error: { code: err.code ?? -32603, message: err.message ?? String(error) } });
		}
	}
}
