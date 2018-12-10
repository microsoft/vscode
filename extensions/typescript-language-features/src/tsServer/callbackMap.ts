/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Proto from '../protocol';
import { CancelledResponse, ServerResponse } from '../typescriptService';

export interface CallbackItem<R> {
	readonly onSuccess: (value: R) => void;
	readonly onError: (err: any) => void;
	readonly startTime: number;
	readonly isAsync: boolean;
}

export class CallbackMap<R extends Proto.Response> {
	private readonly _callbacks = new Map<number, CallbackItem<ServerResponse<R> | undefined>>();
	private readonly _asyncCallbacks = new Map<number, CallbackItem<ServerResponse<R> | undefined>>();

	public destroy(cause: string): void {
		const cancellation = new CancelledResponse(cause);
		for (const callback of this._callbacks.values()) {
			callback.onSuccess(cancellation);
		}
		this._callbacks.clear();
		for (const callback of this._asyncCallbacks.values()) {
			callback.onSuccess(cancellation);
		}
		this._asyncCallbacks.clear();
	}

	public add(seq: number, callback: CallbackItem<ServerResponse<R> | undefined>, isAsync: boolean) {
		if (isAsync) {
			this._asyncCallbacks.set(seq, callback);
		} else {
			this._callbacks.set(seq, callback);
		}
	}

	public fetch(seq: number): CallbackItem<ServerResponse<R> | undefined> | undefined {
		const callback = this._callbacks.get(seq) || this._asyncCallbacks.get(seq);
		this.delete(seq);
		return callback;
	}

	private delete(seq: number) {
		if (!this._callbacks.delete(seq)) {
			this._asyncCallbacks.delete(seq);
		}
	}
}