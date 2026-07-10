/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as worker_threads from 'worker_threads';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { transformErrorForSerialization, transformErrorFromSerialization } from '../../../../../base/common/errors.js';
import {
	WorkerMessage, WorkerMessageType,
	createRequest, createResponse, createResponseError, createNotification
} from '../../common/workerIsolated/workerProtocol.js';

interface PendingRequest {
	readonly resolve: (value: unknown) => void;
	readonly reject: (reason: Error) => void;
}

/**
 * Worker-side connection to the supervisor.
 * Uses `worker_threads.parentPort` to communicate.
 */
export class WorkerConnectionClient extends Disposable {

	private _lastMessageId = 0;
	private readonly _pendingRequests = new Map<number, PendingRequest>();
	private readonly _requestHandlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
	private readonly _notificationHandlers = new Map<string, (...args: unknown[]) => void>();
	private readonly _cancelHandlers = new Map<number, () => void>();

	constructor(
		private readonly _parentPort: worker_threads.MessagePort,
	) {
		super();

		this._register(toDisposable(() => {
			for (const [, pending] of this._pendingRequests) {
				pending.reject(new Error('WorkerConnectionClient disposed'));
			}
			this._pendingRequests.clear();
		}));

		this._parentPort.on('message', (msg: WorkerMessage) => {
			this._handleMessage(msg);
		});
	}

	/**
	 * Send a request to the supervisor and await a response.
	 */
	request<T>(method: string, args: unknown[]): Promise<T> {
		const id = ++this._lastMessageId;
		const msg = createRequest(id, method, args);

		return new Promise<T>((resolve, reject) => {
			this._pendingRequests.set(id, { resolve: resolve as (v: unknown) => void, reject });
			this._parentPort.postMessage(msg);
		});
	}

	/**
	 * Send a one-way notification to the supervisor (no response expected).
	 */
	notify(method: string, args: unknown[]): void {
		this._parentPort.postMessage(createNotification(method, args));
	}

	/**
	 * Register a handler for incoming requests from the supervisor.
	 * The handler receives a cancel callback as the last argument if the
	 * supervisor sends a Cancel message for this request.
	 */
	onRequest(method: string, handler: (...args: unknown[]) => Promise<unknown>): IDisposable {
		this._requestHandlers.set(method, handler);
		return toDisposable(() => this._requestHandlers.delete(method));
	}

	/**
	 * Register a handler for incoming notifications from the supervisor.
	 */
	onNotification(method: string, handler: (...args: unknown[]) => void): IDisposable {
		this._notificationHandlers.set(method, handler);
		return toDisposable(() => this._notificationHandlers.delete(method));
	}

	private _handleMessage(msg: WorkerMessage): void {
		if (!msg || typeof msg.type !== 'number') {
			return; // malformed
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
				this._handleCancel(msg);
				break;
		}
	}

	private _handleResponse(msg: WorkerMessage): void {
		const pending = this._pendingRequests.get(msg.id!);
		if (!pending) {
			return;
		}
		this._pendingRequests.delete(msg.id!);
		pending.resolve(msg.result);
	}

	private _handleResponseError(msg: WorkerMessage): void {
		const pending = this._pendingRequests.get(msg.id!);
		if (!pending) {
			return;
		}
		this._pendingRequests.delete(msg.id!);
		const err = msg.error ? transformErrorFromSerialization(msg.error) : new Error('Unknown error');
		pending.reject(err);
	}

	private _handleRequest(msg: WorkerMessage): void {
		const handler = this._requestHandlers.get(msg.method!);
		if (!handler) {
			const error = transformErrorForSerialization(new Error(`No handler for method '${msg.method}'`));
			this._parentPort.postMessage(createResponseError(msg.id!, error));
			return;
		}
		handler(...(msg.args ?? [])).then(
			result => {
				this._parentPort.postMessage(createResponse(msg.id!, result));
				this._cancelHandlers.delete(msg.id!);
			},
			err => {
				const serialized = transformErrorForSerialization(err instanceof Error ? err : new Error(String(err)));
				this._parentPort.postMessage(createResponseError(msg.id!, serialized));
				this._cancelHandlers.delete(msg.id!);
			}
		);
	}

	private _handleNotification(msg: WorkerMessage): void {
		const handler = this._notificationHandlers.get(msg.method!);
		if (handler) {
			handler(...(msg.args ?? []));
		}
	}

	private _handleCancel(msg: WorkerMessage): void {
		const handler = this._cancelHandlers.get(msg.id!);
		if (handler) {
			handler();
			this._cancelHandlers.delete(msg.id!);
		}
	}
}
