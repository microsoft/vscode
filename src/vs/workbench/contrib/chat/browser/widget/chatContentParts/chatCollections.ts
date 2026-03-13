/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../../base/common/lifecycle.js';

export class ResourcePool<T extends IDisposable> implements IDisposable {
	private readonly pool: T[] = [];

	private _inUse = new Set<T>;
	public get inUse(): ReadonlySet<T> {
		return this._inUse;
	}

	constructor(
		private readonly _itemFactory: () => T,
	) { }

	get(): T {
		if (this.pool.length > 0) {
			const item = this.pool.pop()!;
			this._inUse.add(item);
			return item;
		}

		const item = this._itemFactory();
		this._inUse.add(item);
		return item;
	}

	release(item: T): void {
		this._inUse.delete(item);
		this.pool.push(item);
	}

	/**
	 * Clear and dispose the items in the pool that are not in use.
	 */
	clear(): void {
		for (const item of this.pool) {
			item.dispose();
		}
		this.pool.length = 0;
	}

	public dispose(): void {
		this.clear();

		for (const item of this._inUse) {
			item.dispose();
		}
		this._inUse.clear();
	}
}

export interface IDisposableReference<T> extends IDisposable {
	object: T;
	isStale: () => boolean;
}
