/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { isArray } from './types';

export const empty: IDisposable = Object.freeze({
	dispose() { }
});

export interface IDisposable {
	dispose(): void;
}

export function dispose<T extends IDisposable>(...disposables: T[]): T;
export function dispose<T extends IDisposable>(disposables: T[]): T[];
export function dispose<T extends IDisposable>(...disposables: T[]): T[] {
	const first = disposables[0];

	if (isArray(first)) {
		disposables = first as any as T[];
	}

	disposables.forEach(d => d && d.dispose());
	return [];
}

export function combinedDisposable(disposables: IDisposable[]): IDisposable;
export function combinedDisposable(...disposables: IDisposable[]): IDisposable;
export function combinedDisposable(disposables: any): IDisposable {
	return { dispose: () => dispose(disposables) };
}

export function toDisposable(...fns: (() => void)[]): IDisposable {
	return combinedDisposable(fns.map(fn => ({ dispose: fn })));
}

function callAll(arg: any): any {
	if (!arg) {
		return null;
	} else if (typeof arg === 'function') {
		arg();
		return null;
	} else if (Array.isArray(arg)) {
		while (arg.length > 0) {
			arg.pop()();
		}
		return arg;
	} else {
		return null;
	}
}

export interface CallAll {
	(fn: Function): Function;
	(fn: Function[]): Function[];
}

/**
 * Calls all functions that are being passed to it.
 */
export const cAll: CallAll = callAll;

export abstract class Disposable implements IDisposable {

	private _toDispose: IDisposable[];

	constructor() {
		this._toDispose = [];
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	protected _register<T extends IDisposable>(t:T): T {
		this._toDispose.push(t);
		return t;
	}
}

export class Disposables extends Disposable {

	public add(disposable: IDisposable): void {
		this._register(disposable);
	}
}
