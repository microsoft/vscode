/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export const empty: IDisposable = Object.freeze({
	dispose() { }
});

export interface IDisposable {
	dispose(): void;
}

export function dispose<T extends IDisposable>(disposable: T): T {
	if (disposable) {
		disposable.dispose();
	}
	return null;
}

export function disposeAll<T extends IDisposable>(arr: T[]): T[] {
	if (arr) {
		for (let i = 0, len = arr.length; i < len; i++) {
			if (arr[i]) {
				arr[i].dispose();
			}
		}
	}
	return [];
}

export function combinedDispose(...disposables: IDisposable[]): IDisposable {
	return {
		dispose: () => disposeAll(disposables)
	};
}

export function combinedDispose2(disposables: IDisposable[]): IDisposable {
	return {
		dispose: () => disposeAll(disposables)
	};
}

export function fnToDisposable(fn: () => void): IDisposable {
	return {
		dispose: () => fn()
	};
}

export function toDisposable(...fns: (() => void)[]): IDisposable {
	return combinedDispose2(fns.map(fnToDisposable));
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
		this._toDispose = disposeAll(this._toDispose);
	}

	protected _register<T extends IDisposable>(t:T): T {
		this._toDispose.push(t);
		return t;
	}
}
