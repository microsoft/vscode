/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A minimal AHP client for live-compatibility scenarios.
 *
 * The E2E suite's `TestProtocolClient` is the richer client — snapshots, reverse
 * requests, notification waiters — but it is built for a Mocha test process and
 * transitively pulls in the snapshot module, which installs `setup`/`teardown`
 * at import time. Live-compat baselines are driven from a plain `node` script,
 * so importing it there would fail before a single build was launched.
 *
 * That constraint turns out to be the right shape anyway. The suite's governing
 * principle is that the implementation is reached *only* over the Agent Host
 * Protocol on a WebSocket; this client is that seam and nothing else. It speaks
 * JSON-RPC 2.0, serves no reverse requests, and knows nothing about any host
 * type — which is precisely the position a real third-party client is in when
 * it meets a build from six months ago.
 *
 * Reverse requests are answered with a method-not-found error rather than
 * ignored: a baseline never asks the host to touch client-side files, so a
 * reverse request arriving at all is a signal worth surfacing, and leaving it
 * unanswered would instead hang the host until its own timeout.
 */

import { WebSocket } from 'ws';

/** JSON-RPC error surfaced by the host. */
export class LiveCompatProtocolError extends Error {
	constructor(readonly code: number, message: string) {
		super(message);
	}
}

const JSON_RPC_METHOD_NOT_FOUND = -32601;

interface IPendingCall {
	readonly resolve: (value: unknown) => void;
	readonly reject: (error: Error) => void;
	readonly timer: ReturnType<typeof setTimeout>;
}

export class LiveCompatAhpClient {
	private readonly _socket: WebSocket;
	private readonly _pending = new Map<number, IPendingCall>();
	private _nextId = 1;
	private _closed = false;

	constructor(port: number) {
		this._socket = new WebSocket(`ws://127.0.0.1:${port}`);
	}

	connect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this._socket.on('error', reject);
			this._socket.on('open', () => {
				this._socket.on('message', data => this._receive(data.toString()));
				// A socket that drops mid-scenario must fail the outstanding call
				// rather than let it sit until the per-call timeout.
				this._socket.on('close', () => this._failAllPending(new Error('[agent-host-live-compat] the host closed the connection')));
				resolve();
			});
		});
	}

	/** Send a JSON-RPC request and await its response. */
	call<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
		if (this._closed) {
			return Promise.reject(new Error(`[agent-host-live-compat] '${method}' on a closed connection`));
		}
		const id = this._nextId++;
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this._pending.delete(id);
				reject(new Error(`[agent-host-live-compat] timed out after ${timeoutMs}ms waiting for '${method}'`));
			}, timeoutMs);
			this._pending.set(id, { resolve: value => resolve(value as T), reject, timer });
			try {
				this._socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
			} catch (error) {
				this._pending.delete(id);
				clearTimeout(timer);
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	/** Send a fire-and-forget JSON-RPC notification. */
	notify(method: string, params: unknown): void {
		this._socket.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
	}

	close(): void {
		if (this._closed) {
			return;
		}
		this._closed = true;
		this._failAllPending(new Error('[agent-host-live-compat] the client closed the connection'));
		this._socket.close();
	}

	private _receive(text: string): void {
		const message = JSON.parse(text) as {
			id?: number;
			method?: string;
			result?: unknown;
			error?: { code: number; message: string };
		};
		if (message.id !== undefined && message.method !== undefined) {
			this._socket.send(JSON.stringify({
				jsonrpc: '2.0',
				id: message.id,
				error: { code: JSON_RPC_METHOD_NOT_FOUND, message: `[agent-host-live-compat] reverse request '${message.method}' is not served by the baseline client` },
			}));
			return;
		}
		if (message.id === undefined) {
			// A server notification. Baselines assert on readbacks, not on the
			// notification stream, so there is nothing to accumulate.
			return;
		}
		const pending = this._pending.get(message.id);
		if (!pending) {
			return;
		}
		this._pending.delete(message.id);
		clearTimeout(pending.timer);
		if (message.error) {
			pending.reject(new LiveCompatProtocolError(message.error.code, message.error.message));
		} else {
			pending.resolve(message.result);
		}
	}

	private _failAllPending(error: Error): void {
		for (const [id, pending] of this._pending) {
			this._pending.delete(id);
			clearTimeout(pending.timer);
			pending.reject(error);
		}
	}
}
