/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from './event.js';
import { Disposable } from '../../base/common/lifecycle.js';

/**
 * Disposable object that tracks its {@linkcode disposed} state as
 * a public attribute.
 */
export class TrackedDisposable extends Disposable {
	/**
	 * Private emitter for the `onDispose` event.
	 */
	private readonly _onDispose = this._register(new Emitter<void>());

	/**
	 * The event is fired when this object is disposed.
	 * @param callback The callback function to be called on updates.
	 */
	public onDispose(callback: () => void): void {
		this._onDispose.event(callback);
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
}
