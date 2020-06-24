/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const TRACK_DISPOSABLES = false;

const __is_disposable_tracked__ = '__is_disposable_tracked__';

export const DisposableNone = Object.freeze<IDisposable>({ dispose() { } });

function markTracked<T extends IDisposable>(x: T): void {
	if (!TRACK_DISPOSABLES) {
		return;
	}

	if (x && x !== DisposableNone) {
		try {
			(x as any)[__is_disposable_tracked__] = true;
		} catch {
			// noop
		}
	}
}

function trackDisposable<T extends IDisposable>(x: T): T {
	if (!TRACK_DISPOSABLES) {
		return x;
	}

	const stack = new Error('Potentially leaked disposable').stack!;
	setTimeout(() => {
		if (!(x as any)[__is_disposable_tracked__]) {
			console.log(stack);
		}
	}, 3000);
	return x;
}

export function dispose<T extends IDisposable>(disposable: T): T;
export function dispose<T extends IDisposable>(disposable: T | undefined): T | undefined;
export function dispose<T extends IDisposable>(disposables: Array<T>): Array<T>;
export function dispose<T extends IDisposable>(disposables: ReadonlyArray<T>): ReadonlyArray<T>;
export function dispose<T extends IDisposable>(disposables: T | T[] | undefined): T | T[] | undefined {
	if (Array.isArray(disposables)) {
		disposables.forEach(d => {
			if (d) {
				markTracked(d);
				d.dispose();
			}
		});
		return [];
	} else if (disposables) {
		markTracked(disposables);
		disposables.dispose();
		return disposables;
	} else {
		return undefined;
	}
}

export function combinedDisposable(...disposables: IDisposable[]): IDisposable {
	disposables.forEach(markTracked);
	return trackDisposable({ dispose: () => dispose(disposables) });
}

export interface IDisposable {
	dispose(): void;
}

export class DisposableStore implements IDisposable {
	private _toDispose = new Set<IDisposable>();
	private _isDisposed = false;

	/**
	 * Dispose of all registered disposables and mark this object as disposed.
	 *
	 * Any future disposables added to this object will be disposed of on `add`.
	 */
	public dispose(): void {
		if (this._isDisposed) {
			return;
		}

		markTracked(this);
		this._isDisposed = true;
		this.clear();
	}

	/**
	 * Dispose of all registered disposables but do not mark this object as disposed.
	 */
	public clear(): void {
		this._toDispose.forEach(item => item.dispose());
		this._toDispose.clear();
	}

	public add<T extends IDisposable>(t: T): T {
		if (!t) {
			return t;
		}
		if ((t as any as DisposableStore) === this) {
			throw new Error('Cannot register a disposable on itself!');
		}

		markTracked(t);
		if (this._isDisposed) {
			console.warn(new Error('Registering disposable on object that has already been disposed of').stack);
			t.dispose();
		} else {
			this._toDispose.add(t);
		}

		return t;
	}
}
