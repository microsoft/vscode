/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from 'vscode';

export function deepClone<T>(obj: T): T {
	if (!obj || typeof obj !== 'object') {
		return obj;
	}
	if (obj instanceof RegExp) {
		// See https://github.com/microsoft/TypeScript/issues/10990
		return obj as any;
	}
	const result: any = Array.isArray(obj) ? [] : {};
	Object.keys(<any>obj).forEach((key: string) => {
		if ((<any>obj)[key] && typeof (<any>obj)[key] === 'object') {
			result[key] = deepClone((<any>obj)[key]);
		} else {
			result[key] = (<any>obj)[key];
		}
	});
	return result;
}

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

/**
 * A helper to delay/debounce execution of a task, includes cancellation/disposal support.
 * Pulled from https://github.com/microsoft/vscode/blob/3059063b805ed0ac10a6d9539e213386bfcfb852/extensions/markdown-language-features/src/util/async.ts
 */
export class Delayer<T> {

	public defaultDelay: number;
	private _timeout: any; // Timer
	private _cancelTimeout: Promise<T | null> | null;
	private _onSuccess: ((value: T | PromiseLike<T> | undefined) => void) | null;
	private _task: ITask<T> | null;

	constructor(defaultDelay: number) {
		this.defaultDelay = defaultDelay;
		this._timeout = null;
		this._cancelTimeout = null;
		this._onSuccess = null;
		this._task = null;
	}

	dispose() {
		this._doCancelTimeout();
	}

	public trigger(task: ITask<T>, delay: number = this.defaultDelay): Promise<T | null> {
		this._task = task;
		if (delay >= 0) {
			this._doCancelTimeout();
		}

		if (!this._cancelTimeout) {
			this._cancelTimeout = new Promise<T | undefined>((resolve) => {
				this._onSuccess = resolve;
			}).then(() => {
				this._cancelTimeout = null;
				this._onSuccess = null;
				const result = this._task && this._task?.();
				this._task = null;
				return result;
			});
		}

		if (delay >= 0 || this._timeout === null) {
			this._timeout = setTimeout(() => {
				this._timeout = null;
				this._onSuccess?.(undefined);
			}, delay >= 0 ? delay : this.defaultDelay);
		}

		return this._cancelTimeout;
	}

	private _doCancelTimeout(): void {
		if (this._timeout !== null) {
			clearTimeout(this._timeout);
			this._timeout = null;
		}
	}
}

export interface ITask<T> {
	(): T;
}


/**
 * Copied from src/vs/base/common/uuid.ts
 */
export function generateUuid(): string {
	// use `randomUUID` if possible
	if (typeof crypto.randomUUID === 'function') {
		// see https://developer.mozilla.org/en-US/docs/Web/API/Window/crypto
		// > Although crypto is available on all windows, the returned Crypto object only has one
		// > usable feature in insecure contexts: the getRandomValues() method.
		// > In general, you should use this API only in secure contexts.

		return crypto.randomUUID.bind(crypto)();
	}

	// prep-work
	const _data = new Uint8Array(16);
	const _hex: string[] = [];
	for (let i = 0; i < 256; i++) {
		_hex.push(i.toString(16).padStart(2, '0'));
	}

	// get data
	crypto.getRandomValues(_data);

	// set version bits
	_data[6] = (_data[6] & 0x0f) | 0x40;
	_data[8] = (_data[8] & 0x3f) | 0x80;

	// print as string
	let i = 0;
	let result = '';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += '-';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += '-';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += '-';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += '-';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	return result;
}

export type ValueCallback<T = unknown> = (value: T | Promise<T>) => void;

const enum DeferredOutcome {
	Resolved,
	Rejected
}


/**
 * Creates a promise whose resolution or rejection can be controlled imperatively.
 */
export class DeferredPromise<T> {

	private completeCallback!: ValueCallback<T>;
	private errorCallback!: (err: unknown) => void;
	private outcome?: { outcome: DeferredOutcome.Rejected; value: any } | { outcome: DeferredOutcome.Resolved; value: T };

	public get isRejected() {
		return this.outcome?.outcome === DeferredOutcome.Rejected;
	}

	public get isResolved() {
		return this.outcome?.outcome === DeferredOutcome.Resolved;
	}

	public get isSettled() {
		return !!this.outcome;
	}

	public get value() {
		return this.outcome?.outcome === DeferredOutcome.Resolved ? this.outcome?.value : undefined;
	}

	public readonly p: Promise<T>;

	constructor() {
		this.p = new Promise<T>((c, e) => {
			this.completeCallback = c;
			this.errorCallback = e;
		});
	}

	public complete(value: T) {
		return new Promise<void>(resolve => {
			this.completeCallback(value);
			this.outcome = { outcome: DeferredOutcome.Resolved, value };
			resolve();
		});
	}

	public error(err: unknown) {
		return new Promise<void>(resolve => {
			this.errorCallback(err);
			this.outcome = { outcome: DeferredOutcome.Rejected, value: err };
			resolve();
		});
	}

	public cancel() {
		return this.error(new CancellationError());
	}
}
