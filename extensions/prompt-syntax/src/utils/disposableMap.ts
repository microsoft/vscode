/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vscode';
import { ObservableDisposable } from './vscode';

/**
 * TODO: @legomushroom
 */
export class DisposableMap<T, K extends Disposable> extends ObservableDisposable {
	private readonly map = new Map<T, K>();

	public set(key: T, value: K): void {
		this.map.set(key, value);
	}

	public get(key: T): K | undefined {
		return this.map.get(key);
	}

	public deleteAndLeak(key: T): void {
		this.map.delete(key);
	}

	public deleteAndDispose(key: T): void {
		try {
			this.map.get(key)?.dispose();
		} catch (error) {
			// TODO: @legomushroom - log the error?
		}

		this.map.delete(key);
	}

	public override dispose(): void {
		if (this.disposed) {
			return;
		}

		for (const disposable of this.map.values()) {
			try {
				disposable.dispose();
			} catch (error) {
				// TODO: @legomushroom - log the error?
			}
		}

		super.dispose();
		this.map.clear();
	}
}
