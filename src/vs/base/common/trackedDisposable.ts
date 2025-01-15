/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';

/**
 * Disposable class that tracks its own {@linkcode disposed} state.
 */
export class TrackedDisposable extends Disposable {

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
		super.dispose();
	}
}
