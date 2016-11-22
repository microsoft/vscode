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

export function combinedDisposable(disposables: IDisposable[]): IDisposable {
	return { dispose: () => dispose(disposables) };
}

export function toDisposable(...fns: (() => void)[]): IDisposable {
	return combinedDisposable(fns.map(fn => ({ dispose: fn })));
}

export abstract class Disposable implements IDisposable {

	private _toDispose: IDisposable[];

	constructor() {
		this._toDispose = [];
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	protected _register<T extends IDisposable>(t: T): T {
		this._toDispose.push(t);
		return t;
	}
}

export class Disposables extends Disposable {

	public add<T extends IDisposable>(e: T): T;
	public add(...elements: IDisposable[]): void;
	public add<T extends IDisposable>(arg: T | T[]): T {
		if (!Array.isArray(arg)) {
			return this._register(arg);
		} else {
			for (let element of arg) {
				return this._register(element);
			}
		}
	}
}

export interface IReference<T> extends IDisposable {
	readonly object: T;
}

export abstract class ReferenceCollection<T> {

	private references: { [key: string]: { readonly object: T; counter: number; } } = Object.create(null);

	constructor() { }

	acquire(key: string): IReference<T> {
		let reference = this.references[key];

		if (!reference) {
			reference = this.references[key] = { counter: 0, object: this.createReferencedObject(key) };
		}

		const { object } = reference;
		const dispose = () => {
			if (--reference.counter === 0) {
				this.destroyReferencedObject(reference.object);
				delete this.references[key];
			}
		};

		reference.counter++;

		return { object, dispose };
	}

	protected abstract createReferencedObject(key: string): T;
	protected abstract destroyReferencedObject(object: T): void;
}

export class ImmortalReference<T> implements IReference<T> {
	constructor(public object: T) { }
	dispose(): void { /* noop */ }
}