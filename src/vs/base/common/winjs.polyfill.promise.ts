/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promise as WinJSPromise } from './winjs.base';

/**
 * A polyfill for the native promises. The implementation is based on
 * WinJS promises but tries to gap differences between winjs promises
 * and native promises.
 */
export class PolyfillPromise<T = any> implements Promise<T> {

	static all(thenables: Thenable<any>[]): PolyfillPromise {
		return new PolyfillPromise(WinJSPromise.join(thenables).then(null, values => {
			// WinJSPromise returns a sparse array whereas
			// native promises return the *first* error
			for (var key in values) {
				if (values.hasOwnProperty(key)) {
					return values[key];
				}
			}
		}));
	}

	static race(thenables: Thenable<any>[]): PolyfillPromise {
		// WinJSPromise returns `{ key: <index/key>, value: <promise> }`
		// from the `any` call and Promise.race just wants the value
		return new PolyfillPromise(WinJSPromise.any(thenables).then(entry => entry.value, err => err.value));
	}

	static resolve(value): PolyfillPromise {
		return new PolyfillPromise(WinJSPromise.wrap(value));
	}

	static reject(value): PolyfillPromise {
		return new PolyfillPromise(WinJSPromise.wrapError(value));
	}

	private _winjsPromise: WinJSPromise;

	constructor(winjsPromise: WinJSPromise);
	constructor(callback: (resolve: (value?: T) => void, reject: (err?: any) => void) => any);
	constructor(callback: WinJSPromise | ((resolve: (value?: T) => void, reject: (err?: any) => void) => any)) {

		if (WinJSPromise.is(callback)) {
			this._winjsPromise = callback;
		} else {
			this._winjsPromise = new WinJSPromise((resolve, reject) => {
				let initializing = true;
				callback(function (value) {
					if (!initializing) {
						resolve(value);
					} else {
						setImmediate(resolve, value);
					}
				}, function (err) {
					if (!initializing) {
						reject(err);
					} else {
						setImmediate(reject, err);
					}
				});
				initializing = false;
			});
		}
	}

	then(onFulfilled?: any, onRejected?: any): PolyfillPromise {
		return new PolyfillPromise(this._winjsPromise.then(onFulfilled, onRejected));
	}

	catch(onRejected?: any): PolyfillPromise {
		return new PolyfillPromise(this._winjsPromise.then(null, onRejected));
	}
}
