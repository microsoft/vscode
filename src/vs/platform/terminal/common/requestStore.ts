/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';

/**
 * A helper class to track requests that have replies. Using this it's easy to implement an event
 * that accepts a reply.
 */
export class RequestStore<T, RequestArgs> extends Disposable {
	private _lastRequestId = 0;
	private readonly _timeout: number;
	private _pendingRequests: Map<number, (resolved: T) => void> = new Map();
	private _pendingRequestDisposables: Map<number, IDisposable[]> = new Map();

	private readonly _onCreateRequest = this._register(new Emitter<RequestArgs & { requestId: number }>());
	readonly onCreateRequest = this._onCreateRequest.event;

	/**
	 * @param timeout How long in ms to allow requests to go unanswered for, undefined will use the
	 * default (15 seconds).
	 */
	constructor(
		timeout: number | undefined,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._timeout = timeout === undefined ? 15000 : timeout;
		this._register(toDisposable(() => {
			for (const d of this._pendingRequestDisposables.values()) {
				dispose(d);
			}
		}));
	}

	/**
	 * Creates a request.
	 * @param args The arguments to pass to the onCreateRequest event.
	 */
	createRequest(args: RequestArgs): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const requestId = ++this._lastRequestId;
			this._pendingRequests.set(requestId, resolve);
			this._onCreateRequest.fire({ requestId, ...args });
			const tokenSource = new CancellationTokenSource();
			timeout(this._timeout, tokenSource.token).then(() => reject(`Request ${requestId} timed out (${this._timeout}ms)`));
			this._pendingRequestDisposables.set(requestId, [toDisposable(() => tokenSource.cancel())]);
		});
	}

	/**
	 * Accept a reply to a request.
	 * @param requestId The request ID originating from the onCreateRequest event.
	 * @param data The reply data.
	 */
	acceptReply(requestId: number, data: T) {
		const resolveRequest = this._pendingRequests.get(requestId);
		if (resolveRequest) {
			this._pendingRequests.delete(requestId);
			dispose(this._pendingRequestDisposables.get(requestId) || []);
			this._pendingRequestDisposables.delete(requestId);
			resolveRequest(data);
		} else {
			this._logService.warn(`RequestStore#acceptReply was called without receiving a matching request ${requestId}`);
		}
	}
}
