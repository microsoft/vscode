/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// perf-benchmark-marker

/**
 * Fixture for chat-simulation benchmarks.
 * Simplified from src/vs/base/common/lifecycle.ts for stable perf testing.
 */

export interface IDisposable {
	dispose(): void;
}

export function isDisposable<T extends object>(thing: T): thing is T & IDisposable {
	return typeof (thing as IDisposable).dispose === 'function'
		&& (thing as IDisposable).dispose.length === 0;
}

export function dispose<T extends IDisposable>(disposable: T): T;
export function dispose<T extends IDisposable>(disposable: T | undefined): T | undefined;
export function dispose<T extends IDisposable>(disposables: T[]): T[];
export function dispose<T extends IDisposable>(disposables: readonly T[]): readonly T[];
export function dispose<T extends IDisposable>(arg: T | T[] | undefined): any {
	if (Array.isArray(arg)) {
		const errors: any[] = [];
		for (const d of arg) {
			try { d.dispose(); } catch (e) { errors.push(e); }
		}
		if (errors.length > 0) { throw new Error(`Dispose errors: ${errors.length}`); }
		return arg;
	} else if (arg) {
		arg.dispose();
		return arg;
	}
}

export class DisposableStore implements IDisposable {
	private readonly _toDispose = new Set<IDisposable>();
	private _isDisposed = false;

	dispose(): void {
		if (this._isDisposed) { return; }
		this._isDisposed = true;
		this.clear();
	}

	clear(): void {
		if (this._toDispose.size === 0) { return; }
		const iter = this._toDispose.values();
		this._toDispose.clear();
		for (const item of iter) {
			try { item.dispose(); } catch { }
		}
	}

	add<T extends IDisposable>(o: T): T {
		if (this._isDisposed) {
			console.warn('Adding to a disposed DisposableStore');
			return o;
		}
		this._toDispose.add(o);
		return o;
	}

	get size(): number { return this._toDispose.size; }
}

export abstract class Disposable implements IDisposable {
	private readonly _store = new DisposableStore();

	dispose(): void {
		this._store.dispose();
	}

	protected _register<T extends IDisposable>(o: T): T {
		return this._store.add(o);
	}
}

export class MutableDisposable<T extends IDisposable> implements IDisposable {
	private _value?: T;
	private _isDisposed = false;

	get value(): T | undefined { return this._isDisposed ? undefined : this._value; }

	set value(value: T | undefined) {
		if (this._isDisposed || value === this._value) { return; }
		this._value?.dispose();
		this._value = value;
	}

	dispose(): void {
		this._isDisposed = true;
		this._value?.dispose();
		this._value = undefined;
	}
}

export class DisposableMap<K, V extends IDisposable> implements IDisposable {
	private readonly _map = new Map<K, V>();
	private _isDisposed = false;

	set(key: K, value: V): void {
		const existing = this._map.get(key);
		if (existing !== value) {
			existing?.dispose();
			this._map.set(key, value);
		}
	}

	get(key: K): V | undefined { return this._map.get(key); }

	delete(key: K): void {
		this._map.get(key)?.dispose();
		this._map.delete(key);
	}

	dispose(): void {
		if (this._isDisposed) { return; }
		this._isDisposed = true;
		for (const [, v] of this._map) { v.dispose(); }
		this._map.clear();
	}
}
