/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';

/**
 * A helper class to track requests that have replies. Using this it's easy to implement an event
 * that accepts a reply.
 */
export class RequestStore<T, RequestArgs> extends Disposable {
	private _lastRequestId = 0;
	private _pendingRequests: Map<number, (resolved: T) => void> = new Map();

	private readonly _onCreateRequest = this._register(new Emitter<RequestArgs & { requestId: number }>());
	readonly onCreateRequest = this._onCreateRequest.event;

	constructor(
		@ILogService private readonly _logService: ILogService
	) {
		super();
		// TODO: Support timeout
	}

	createRequest(args: RequestArgs): Promise<T> {
		return new Promise<T>(resolve => {
			const requestId = ++this._lastRequestId;
			this._pendingRequests.set(requestId, resolve);
			this._onCreateRequest.fire({ requestId, ...args });
		});
	}

	acceptReply(requestId: number, data: T) {
		const resolveRequest = this._pendingRequests.get(requestId);
		if (resolveRequest) {
			this._pendingRequests.delete(requestId);
			resolveRequest(data);
		} else {
			this._logService.warn(`RequestStore#acceptReply was called without receiving a matching request ${requestId}`);
		}
	}
}
