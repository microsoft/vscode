/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// from https://github.com/microsoft/vscode/blob/43ae27a30e7b5e8711bf6b218ee39872ed2b8ef6/src/vs/base/common/objects.ts#L117
export function objectEquals(one: any, other: any) {
	if (one === other) {
		return true;
	}
	if (one === null || one === undefined || other === null || other === undefined) {
		return false;
	}
	if (typeof one !== typeof other) {
		return false;
	}
	if (typeof one !== 'object') {
		return false;
	}
	if ((Array.isArray(one)) !== (Array.isArray(other))) {
		return false;
	}

	let i: number;
	let key: string;

	if (Array.isArray(one)) {
		if (one.length !== other.length) {
			return false;
		}
		for (i = 0; i < one.length; i++) {
			if (!objectEquals(one[i], other[i])) {
				return false;
			}
		}
	} else {
		const oneKeys: string[] = [];

		for (key in one) {
			oneKeys.push(key);
		}
		oneKeys.sort();
		const otherKeys: string[] = [];
		for (key in other) {
			otherKeys.push(key);
		}
		otherKeys.sort();
		if (!objectEquals(oneKeys, otherKeys)) {
			return false;
		}
		for (i = 0; i < oneKeys.length; i++) {
			if (!objectEquals(one[oneKeys[i]], other[oneKeys[i]])) {
				return false;
			}
		}
	}

	return true;
}

interface Options<T> {
	callback: (value: T) => void;

	merge?: (input: T[]) => T;
	delay?: number;
}


export class DebounceTrigger<T> {

	private _isPaused = 0;
	protected _eventQueue: T[] = [];
	private _callbackFn: (value: T) => void;
	private _mergeFn?: (input: T[]) => T;
	private readonly _delay: number;
	private _handle: any | undefined;

	constructor(options: Options<T>) {
		this._callbackFn = options.callback;
		this._mergeFn = options.merge;
		this._delay = options.delay ?? 100;
	}

	private pause(): void {
		this._isPaused++;
	}

	private resume(): void {
		if (this._isPaused !== 0 && --this._isPaused === 0) {
			if (this._mergeFn) {
				const events = Array.from(this._eventQueue);
				this._eventQueue = [];
				this._callbackFn(this._mergeFn(events));

			} else {
				// no merging, fire each event individually and test
				// that this emitter isn't paused halfway through
				while (!this._isPaused && this._eventQueue.length !== 0) {
					this._callbackFn(this._eventQueue.shift()!);
				}
			}
		}
	}

	trigger(event: T): void {
		if (!this._handle) {
			this.pause();
			this._handle = setTimeout(() => {
				this._handle = undefined;
				this.resume();
			}, this._delay);
		}

		if (this._isPaused !== 0) {
			this._eventQueue.push(event);
		} else {
			this._callbackFn(event);
		}
	}
}
