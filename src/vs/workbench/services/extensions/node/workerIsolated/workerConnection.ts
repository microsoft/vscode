/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { transformErrorForSerialization, transformErrorFromSerialization } from '../../../../../base/common/errors.js';
import {
	IWorkerLike, WorkerMessage, WorkerMessageType,
	createRequest, createCancel, createResponse, createResponseError, createNotification
} from '../../common/workerIsolated/workerProtocol.js';

export interface WorkerConnectionOptions {
	/** Timeout in ms for requests. 0 means no timeout. */
	readonly timeout?: number;
}

interface PendingRequest {
	readonly resolve: (value: unknown) => void;
	readonly reject: (reason: Error) => void;
	timer?: ReturnType<typeof setTimeout>;
	cancellationDisposable?: IDisposable;
}

/**
 * Supervisor-side connection to a single worker thread.
 * Provides typed request/response RPC and one-way notifications over `MessagePort`.
 */
export class WorkerConnection extends Disposable {

	private _lastMessageId = 0;
	private readonly _pendingRequests = new Map<number, PendingRequest>();
	private readonly _requestHandlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
	private readonly _notificationHandlers = new Map<string, (...args: unknown[]) => void>();
	private readonly _timeout: number;

	private readonly _onDidExit = this._register(new Emitter<{ code: number; signal?: string }>());
	readonly onDidExit: Event<{ code: number; signal?: string }> = this._onDidExit.event;

	private readonly _onDidError = this._register(new Emitter<Error>());
	readonly onDidError: Event<Error> = this._onDidError.event;

	constructor(
		private readonly _worker: IWorkerLike,
		options?: WorkerConnectionOptions,
	) {
		super();
		this._timeout = options?.timeout ?? 0;

		this._register(toDisposable(() => {
			// Reject all pending requests on dispose
			for (const [, pending] of this._pendingRequests) {
				this._cleanupPending(pending);
				pending.reject(new Error('WorkerConnection disposed'));
			}
			this._pendingRequests.clear();
		}));

		this._worker.on('message', (msg: unknown) => {
			this._handleMessage(msg as WorkerMessage);
		});

		this._worker.on('error', (...args: unknown[]) => {
			this._onDidError.fire(args[0] instanceof Error ? args[0] : new Error(String(args[0])));
		});

		this._worker.on('exit', (...args: unknown[]) => {
			const code = typeof args[0] === 'number' ? args[0] : 1;
			this._onDidExit.fire({ code });
			// Reject all pending requests
			for (const [, pending] of this._pendingRequests) {
				this._cleanupPending(pending);
				pending.reject(new Error(`Worker exited with code ${code}`));
			}
			this._pendingRequests.clear();
		});
	}

	/**
	 * Send a request to the worker and await a response.
	 */
	request<T>(method: string, args: unknown[], token?: CancellationToken): Promise<T> {
		const id = ++this._lastMessageId;
		const msg = createRequest(id, method, args);

		return new Promise<T>((resolve, reject) => {
			const pending: PendingRequest = { resolve: resolve as (v: unknown) => void, reject };

			if (this._timeout > 0) {
				pending.timer = setTimeout(() => {
					const p = this._pendingRequests.get(id);
					this._pendingRequests.delete(id);
					if (p) {
						p.cancellationDisposable?.dispose();
					}
					reject(new Error(`Request '${method}' timed out after ${this._timeout}ms`));
				}, this._timeout);
			}

			this._pendingRequests.set(id, pending);

			if (token) {
				if (token.isCancellationRequested) {
					this._pendingRequests.delete(id);
					if (pending.timer) {
						clearTimeout(pending.timer);
					}
					reject(new Error('Cancelled'));
					return;
				}
				pending.cancellationDisposable = token.onCancellationRequested(() => {
					if (this._pendingRequests.has(id)) {
						this._worker.postMessage(createCancel(id));
					}
				});
			}

			this._worker.postMessage(msg);
		});
	}

	/**
	 * Send a one-way notification to the worker (no response expected).
	 */
	notify(method: string, args: unknown[]): void {
		this._worker.postMessage(createNotification(method, args));
	}

	/**
	 * Register a handler for incoming requests from the worker.
	 */
	onRequest(method: string, handler: (...args: unknown[]) => Promise<unknown>): IDisposable {
		this._requestHandlers.set(method, handler);
		return toDisposable(() => this._requestHandlers.delete(method));
	}

	/**
	 * Register a handler for incoming notifications from the worker.
	 */
	onNotification(method: string, handler: (...args: unknown[]) => void): IDisposable {
		this._notificationHandlers.set(method, handler);
		return toDisposable(() => this._notificationHandlers.delete(method));
	}

	/**
	 * Gracefully terminate the worker.
	 */
	async terminate(): Promise<void> {
		await this._worker.terminate();
	}

	private _cleanupPending(pending: PendingRequest): void {
		if (pending.timer) {
			clearTimeout(pending.timer);
		}
		pending.cancellationDisposable?.dispose();
	}

	private _handleMessage(msg: WorkerMessage): void {
		if (!msg || typeof msg.type !== 'number') {
			this._onDidError.fire(new Error('Received malformed message from worker'));
			return;
		}

		switch (msg.type) {
			case WorkerMessageType.Response:
				this._handleResponse(msg);
				break;
			case WorkerMessageType.ResponseError:
				this._handleResponseError(msg);
				break;
			case WorkerMessageType.Request:
				this._handleRequest(msg);
				break;
			case WorkerMessageType.Notification:
				this._handleNotification(msg);
				break;
			case WorkerMessageType.Cancel:
				// Cancel is only sent from supervisor → worker, not the reverse direction
				break;
			default:
				this._onDidError.fire(new Error(`Unknown message type: ${(msg as WorkerMessage).type}`));
				break;
		}
	}

	private _handleResponse(msg: WorkerMessage): void {
		const pending = this._pendingRequests.get(msg.id!);
		if (!pending) {
			return; // Response for an already-completed or timed-out request
		}
		this._pendingRequests.delete(msg.id!);
		this._cleanupPending(pending);
		pending.resolve(msg.result);
	}

	private _handleResponseError(msg: WorkerMessage): void {
		const pending = this._pendingRequests.get(msg.id!);
		if (!pending) {
			return;
		}
		this._pendingRequests.delete(msg.id!);
		this._cleanupPending(pending);
		const err = msg.error ? transformErrorFromSerialization(msg.error) : new Error('Unknown worker error');
		pending.reject(err);
	}

	private _handleRequest(msg: WorkerMessage): void {
		const handler = this._requestHandlers.get(msg.method!);
		if (!handler) {
			const error = transformErrorForSerialization(new Error(`No handler for method '${msg.method}'`));
			this._worker.postMessage(createResponseError(msg.id!, error));
			return;
		}
		handler(...(msg.args ?? [])).then(
			result => {
				this._worker.postMessage(createResponse(msg.id!, result));
			},
			err => {
				const serialized = transformErrorForSerialization(err instanceof Error ? err : new Error(String(err)));
				this._worker.postMessage(createResponseError(msg.id!, serialized));
			}
		);
	}

	private _handleNotification(msg: WorkerMessage): void {
		const handler = this._notificationHandlers.get(msg.method!);
		if (handler) {
			handler(...(msg.args ?? []));
		}
	}
}
