/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from './event.js';
import { Disposable } from './lifecycle.js';

/**
 * Disposable object that tracks its {@linkcode disposed} state
 * as a public attribute and provides the {@linkcode onDispose}
 * event to subscribe to.
 */
export abstract class ObservableDisposable extends Disposable {
	/**
	 * Private emitter for the `onDispose` event.
	 */
	private readonly _onDispose = this._register(new Emitter<void>());

	/**
	 * The event is fired when this object is disposed.
	 * Note! Executes the callback immediately if already disposed.
	 *
	 * @param callback The callback function to be called on updates.
	 */
	public onDispose(callback: () => void): this {
		// if already disposed, execute the callback immediately
		if (this.disposed) {
			callback();

			return this;
		}

		// otherwise subscribe to the event
		this._register(this._onDispose.event(callback));
		return this;
	}

	/**
	 * Tracks disposed state of this object.
	 */
	private _disposed = false;

	/**
	 * Check if the current object was already disposed.
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * Dispose current object if not already disposed.
	 * @returns
	 */
	public override dispose(): void {
		if (this.disposed) {
			return;
		}

		this._disposed = true;
		this._onDispose.fire();
		super.dispose();
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
