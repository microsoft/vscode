/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from './cancellation.js';
import { IDisposable, markAsDisposed, trackDisposable } from './lifecycle.js';

/**
 * A map that associates each request with a cancellation listener. The listener is
 * automatically created from the provided {@link CancellationToken} and disposed when the
 * entry is deleted or the map is cleared/disposed.
 */
export class CancellableRequestMap<T extends object> implements IDisposable {

	private readonly _map = new Map<number, { value: T; cancelListener: IDisposable }>();
	private _isDisposed = false;

	constructor() {
		trackDisposable(this);
	}

	set(requestId: number, value: T, token: CancellationToken, onCancel: () => void): void {
		if (this._isDisposed) {
			console.warn(new Error('Trying to add to a CancellableRequestMap that has already been disposed of.').stack);
		}
		this.delete(requestId);
		const cancelListener = token.onCancellationRequested(onCancel);
		this._map.set(requestId, { value, cancelListener });
	}

	get(requestId: number): T | undefined {
		return this._map.get(requestId)?.value;
	}

	delete(requestId: number): void {
		const entry = this._map.get(requestId);
		if (entry) {
			entry.cancelListener.dispose();
			this._map.delete(requestId);
		}
	}

	clear(): void {
		for (const key of [...this._map.keys()]) {
			this.delete(key);
		}
	}

	dispose(): void {
		this._isDisposed = true;
		markAsDisposed(this);
		this.clear();
	}
}
