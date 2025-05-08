/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from './lifecycle.js';

/**
 * Disposable object that tracks its {@linkcode disposed} state
 * as a public attribute and provides the {@linkcode onDispose}
 * event to subscribe to.
 */
export abstract class ObservableDisposable extends Disposable {
	/**
	 * Underlying disposables store this object relies on.
	 */
	private readonly store = this._register(new DisposableStore());

	/**
	 * Gets current 'disposed' state of this object.
	 */
	public get disposed(): boolean {
		return this.store.isDisposed;
	}

	/**
	 * The event is fired when this object is disposed.
	 * Note! Executes the callback immediately if already disposed.
	 *
	 * @param callback The callback function to be called on updates.
	 */
	public onDispose(callback: () => void): IDisposable {
		// if already disposed, execute the callback immediately
		if (this.disposed) {
			const timeoutHandle = setTimeout(callback);

			return toDisposable(() => {
				clearTimeout(timeoutHandle);
			});
		}

		return this.store.add(toDisposable(callback));
	}

	/**
	 * Adds disposable object(s) to the list of disposables
	 * that will be disposed with this object.
	 */
	public addDisposables(...disposables: IDisposable[]): this {
		for (const disposable of disposables) {
			this.store.add(disposable);
		}

		return this;
	}

	/**
	 * Assert that the current object was not yet disposed.
	 *
	 * @throws If the current object was already disposed.
	 * @param error Error message or error object to throw if assertion fails.
	 */
	public assertNotDisposed(
		error: string | Error,
	): asserts this is TNotDisposed<this> {
		assertNotDisposed(this, error);
	}
}

/**
 * Type for a non-disposed object `TObject`.
 */
type TNotDisposed<TObject extends { disposed: boolean }> = TObject & { disposed: false };

/**
 * Asserts that a provided `object` is not `disposed` yet,
 * e.g., its `disposed` property is `false`.
 *
 * @throws if the provided `object.disposed` equal to `false`.
 * @param error Error message or error object to throw if assertion fails.
 */
export function assertNotDisposed<TObject extends { disposed: boolean }>(
	object: TObject,
	error: string | Error,
): asserts object is TNotDisposed<TObject> {
	if (!object.disposed) {
		return;
	}

	const errorToThrow = typeof error === 'string'
		? new Error(error)
		: error;

	throw errorToThrow;
}
