/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import { onUnexpectedError } from 'vs/base/common/errors';

export default class CallbackList {

	private _callbacks: Function[];
	private _contexts: any[];

	public add(callback: Function, context: any = null, bucket?: IDisposable[]): void {
		if (!this._callbacks) {
			this._callbacks = [];
			this._contexts = [];
		}
		this._callbacks.push(callback);
		this._contexts.push(context);

		if (Array.isArray(bucket)) {
			bucket.push({ dispose: () => this.remove(callback, context) });
		}
	}

	public remove(callback: Function, context: any = null): void {
		if (!this._callbacks) {
			return;
		}

		let foundCallbackWithDifferentContext = false;
		for (var i = 0, len = this._callbacks.length; i < len; i++) {
			if (this._callbacks[i] === callback) {
				if (this._contexts[i] === context) {
					// callback & context match => remove it
					this._callbacks.splice(i, 1);
					this._contexts.splice(i, 1);
					return;
				} else {
					foundCallbackWithDifferentContext = true;
				}
			}
		}

		if (foundCallbackWithDifferentContext) {
			throw new Error('When adding a listener with a context, you should remove it with the same context');
		}
	}

	public invoke(...args: any[]): any[] {
		if (!this._callbacks) {
			return undefined;
		}

		const ret: any[] = [],
			callbacks = this._callbacks.slice(0),
			contexts = this._contexts.slice(0);

		for (var i = 0, len = callbacks.length; i < len; i++) {
			try {
				ret.push(callbacks[i].apply(contexts[i], args));
			} catch (e) {
				onUnexpectedError(e);
			}
		}
		return ret;
	}

	public isEmpty(): boolean {
		return !this._callbacks || this._callbacks.length === 0;
	}

	public entries(): [Function, any][] {
		if (!this._callbacks) {
			return [];
		}
		return this._callbacks.map((fn, index) => <[Function, any]>[fn, this._contexts[index]]);
	}

	public dispose(): void {
		this._callbacks = undefined;
		this._contexts = undefined;
	}
}
