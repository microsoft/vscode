/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../lifecycle.js';

export class Debouncer implements IDisposable {
	private _timeout: Timeout | undefined = undefined;

	public debounce(fn: () => void, timeoutMs: number): void {
		if (this._timeout !== undefined) {
			clearTimeout(this._timeout);
		}
		this._timeout = setTimeout(() => {
			this._timeout = undefined;
			fn();
		}, timeoutMs);
	}

	dispose(): void {
		if (this._timeout !== undefined) {
			clearTimeout(this._timeout);
		}
	}
}

export class Throttler implements IDisposable {
	private _timeout: Timeout | undefined = undefined;

	public throttle(fn: () => void, timeoutMs: number): void {
		if (this._timeout === undefined) {
			this._timeout = setTimeout(() => {
				this._timeout = undefined;
				fn();
			}, timeoutMs);
		}
	}

	dispose(): void {
		if (this._timeout !== undefined) {
			clearTimeout(this._timeout);
		}
	}
}

export function deepAssign<T>(target: T, source: T): void {
	for (const key in source) {
		if (!!target[key] && typeof target[key] === 'object' && !!source[key] && typeof source[key] === 'object') {
			deepAssign(target[key], source[key]);
		} else {
			target[key] = source[key];
		}
	}
}

export function deepAssignDeleteNulls<T>(target: T, source: T): void {
	for (const key in source) {
		if (source[key] === null) {
			delete target[key];
		} else if (!!target[key] && typeof target[key] === 'object' && !!source[key] && typeof source[key] === 'object') {
			deepAssignDeleteNulls(target[key], source[key]);
		} else {
			target[key] = source[key];
		}
	}
}
