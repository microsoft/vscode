/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from './async.js';
import { CancellationToken, CancellationTokenSource } from './cancellation.js';
import { CancellationError } from './errors.js';
import { Disposable, toDisposable } from './lifecycle.js';
import { hasKey } from './types.js';

export type JsonRpcId = string | number;

export interface IJsonRpcError {
	code: number;
	message: string;
	data?: unknown;
}

export interface IJsonRpcRequest {
	jsonrpc: '2.0';
	id: JsonRpcId;
	method: string;
	params?: unknown;
}

export interface IJsonRpcNotification {
	jsonrpc: '2.0';
	method: string;
	params?: unknown;
}

export interface IJsonRpcSuccessResponse {
	jsonrpc: '2.0';
	id: JsonRpcId;
	result: unknown;
}

export interface IJsonRpcErrorResponse {
	jsonrpc: '2.0';
	id?: JsonRpcId;
	error: IJsonRpcError;
}

export type JsonRpcMessage = IJsonRpcRequest | IJsonRpcNotification | IJsonRpcSuccessResponse | IJsonRpcErrorResponse;
export type JsonRpcResponse = IJsonRpcSuccessResponse | IJsonRpcErrorResponse;

interface IPendingRequest {
	promise: DeferredPromise<unknown>;
	cts: CancellationTokenSource;
}

export interface IJsonRpcProtocolHandlers {
	handleRequest?(request: IJsonRpcRequest, token: CancellationToken): Promise<unknown> | unknown;
	handleNotification?(notification: IJsonRpcNotification): void;
}

export class JsonRpcError extends Error {
	constructor(
		public readonly code: number,
		message: string,
		public readonly data?: unknown,
	) {
		super(message);
	}
}

/**
 * Generic JSON-RPC 2.0 protocol helper.
 */
export class JsonRpcProtocol extends Disposable {
	private static readonly ParseError = -32700;
	private static readonly MethodNotFound = -32601;
	private static readonly InternalError = -32603;

	private _nextRequestId = 1;
	private readonly _pendingRequests = new Map<JsonRpcId, IPendingRequest>();

	constructor(
		private readonly _send: (message: JsonRpcMessage) => void,
		private readonly _handlers: IJsonRpcProtocolHandlers,
	) {
		super();
	}

	public sendNotification(notification: Omit<IJsonRpcNotification, 'jsonrpc'>): void {
		this._send({
			jsonrpc: '2.0',
			...notification,
		});
	}

	public sendRequest<T = unknown>(request: Omit<IJsonRpcRequest, 'jsonrpc' | 'id'>, token: CancellationToken = CancellationToken.None, onCancel?: (id: JsonRpcId) => void): Promise<T> {
		if (this._store.isDisposed) {
			return Promise.reject(new CancellationError());
		}

		const id = this._nextRequestId++;
		const promise = new DeferredPromise<unknown>();
		const cts = new CancellationTokenSource();
		this._pendingRequests.set(id, { promise, cts });

		const cancelListener = token.onCancellationRequested(() => {
			if (!promise.isSettled) {
				this._pendingRequests.delete(id);
				cts.cancel();
				onCancel?.(id);
				promise.cancel();
			}
			cancelListener.dispose();
		});

		this._send({
			jsonrpc: '2.0',
			id,
			...request,
		});

		return promise.p.finally(() => {
			cancelListener.dispose();
			this._pendingRequests.delete(id);
			cts.dispose(true);
		}) as Promise<T>;
	}

	/**
	 * Handles one or more incoming JSON-RPC messages.
	 *
	 * Returns an array of JSON-RPC response objects generated for any incoming
	 * requests in the message(s). Notifications and responses to our own
	 * outgoing requests do not produce return values. For batch inputs, the
	 * returned responses are in the same order as the corresponding requests.
	 *
	 * Note: responses are also emitted via the `_send` callback, so callers
	 * that rely on the return value should not re-send them.
	 */
	public async handleMessage(message: JsonRpcMessage | JsonRpcMessage[]): Promise<JsonRpcResponse[]> {
		if (Array.isArray(message)) {
			const replies: JsonRpcResponse[] = [];
			for (const single of message) {
				const reply = await this._handleMessage(single);
				if (reply) {
					replies.push(reply);
				}
			}
			return replies;
		}

		const reply = await this._handleMessage(message);
		return reply ? [reply] : [];
	}

	public cancelPendingRequest(id: JsonRpcId): void {
		const request = this._pendingRequests.get(id);
		if (request) {
			this._pendingRequests.delete(id);
			request.cts.cancel();
			request.promise.cancel();
			request.cts.dispose(true);
		}
	}

	public cancelAllRequests(): void {
		for (const [id, pending] of this._pendingRequests) {
			this._pendingRequests.delete(id);
			pending.cts.cancel();
			pending.promise.cancel();
			pending.cts.dispose(true);
		}
	}

	private async _handleMessage(message: JsonRpcMessage): Promise<JsonRpcResponse | undefined> {
		if (isJsonRpcResponse(message)) {
			if (hasKey(message, { result: true })) {
				this._handleResult(message);
			} else {
				this._handleError(message);
			}
			return undefined;
		}

		if (isJsonRpcRequest(message)) {
			return this._handleRequest(message);
		}

		if (isJsonRpcNotification(message)) {
			this._handlers.handleNotification?.(message);
		}

		return undefined;
	}

	private _handleResult(response: IJsonRpcSuccessResponse): void {
		const request = this._pendingRequests.get(response.id);
		if (request) {
			this._pendingRequests.delete(response.id);
			request.promise.complete(response.result);
			request.cts.dispose(true);
		}
	}

	private _handleError(response: IJsonRpcErrorResponse): void {
		if (response.id === undefined) {
			return;
		}

		const request = this._pendingRequests.get(response.id);
		if (request) {
			this._pendingRequests.delete(response.id);
			request.promise.error(new JsonRpcError(response.error.code, response.error.message, response.error.data));
			request.cts.dispose(true);
		}
	}

	private async _handleRequest(request: IJsonRpcRequest): Promise<JsonRpcResponse> {
		if (!this._handlers.handleRequest) {
			const response: IJsonRpcErrorResponse = {
				jsonrpc: '2.0',
				id: request.id,
				error: {
					code: JsonRpcProtocol.MethodNotFound,
					message: `Method not found: ${request.method}`,
				}
			};
			this._send(response);
			return response;
		}

		const cts = new CancellationTokenSource();
		this._register(toDisposable(() => cts.dispose(true)));

		try {
			const resultOrThenable = this._handlers.handleRequest(request, cts.token);
			const result = isThenable(resultOrThenable) ? await resultOrThenable : resultOrThenable;
			const response: IJsonRpcSuccessResponse = {
				jsonrpc: '2.0',
				id: request.id,
				result,
			};
			this._send(response);
			return response;
		} catch (error) {
			let response: IJsonRpcErrorResponse;
			if (error instanceof JsonRpcError) {
				response = {
					jsonrpc: '2.0',
					id: request.id,
					error: {
						code: error.code,
						message: error.message,
						data: error.data,
					}
				};
			} else {
				response = {
					jsonrpc: '2.0',
					id: request.id,
					error: {
						code: JsonRpcProtocol.InternalError,
						message: error instanceof Error ? error.message : 'Internal error',
					}
				};
			}
			this._send(response);
			return response;
		} finally {
			cts.dispose(true);
		}
	}

	public override dispose(): void {
		this.cancelAllRequests();
		super.dispose();
	}

	public static createParseError(message: string, data?: unknown): IJsonRpcErrorResponse {
		return {
			jsonrpc: '2.0',
			error: {
				code: JsonRpcProtocol.ParseError,
				message,
				data,
			}
		};
	}
}

export function isJsonRpcRequest(message: JsonRpcMessage): message is IJsonRpcRequest {
	return 'method' in message && 'id' in message && (typeof message.id === 'string' || typeof message.id === 'number');
}

export function isJsonRpcResponse(message: JsonRpcMessage): message is IJsonRpcSuccessResponse | IJsonRpcErrorResponse {
	return hasKey(message, { id: true, result: true }) || hasKey(message, { id: true, error: true });
}

export function isJsonRpcNotification(message: JsonRpcMessage): message is IJsonRpcNotification {
	return hasKey(message, { method: true }) && !hasKey(message, { id: true });
}


function isThenable<T>(value: T | Promise<T>): value is Promise<T> {
	return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}
