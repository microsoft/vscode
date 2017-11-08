/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import { onUnexpectedError } from 'vs/base/common/errors';
import { LinkedList } from 'vs/base/common/linkedList';

export default class CallbackList {

	private _callbacks: LinkedList<[Function, any]>;

	public add(callback: Function, context: any = null, bucket?: IDisposable[]): () => void {
		if (!this._callbacks) {
			this._callbacks = new LinkedList<[Function, any]>();
		}
		const remove = this._callbacks.push([callback, context]);
		if (Array.isArray(bucket)) {
			bucket.push({ dispose: remove });
		}
		return remove;
	}

	public invoke(...args: any[]): any[] {
		if (!this._callbacks) {
			return undefined;
		}

		const ret: any[] = [];
		const elements = this._callbacks.toArray();

		for (const [callback, context] of elements) {
			try {
				ret.push(callback.apply(context, args));
			} catch (e) {
				onUnexpectedError(e);
			}
		}
		return ret;
	}

	public entries(): [Function, any][] {
		if (!this._callbacks) {
			return [];
		}
		return this._callbacks
			? this._callbacks.toArray()
			: [];
	}

	public isEmpty(): boolean {
		return !this._callbacks || this._callbacks.isEmpty();
	}

	public dispose(): void {
		this._callbacks = undefined;
	}
}
