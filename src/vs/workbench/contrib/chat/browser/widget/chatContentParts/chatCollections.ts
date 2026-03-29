/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../../base/common/lifecycle.js';

export interface IResourcePoolOptions {
	/**
	 * Maximum number of idle items to keep in the pool.
	 * When exceeded after a debounce period, excess idle items are disposed.
	 * Defaults to no limit.
	 */
	maxIdleSize?: number;

	/**
	 * Delay in milliseconds before trimming excess idle items.
	 * Allows rapid get/release cycles (e.g. during streaming) without
	 * unnecessary disposal. Defaults to 10 seconds.
	 */
	trimIdleDelay?: number;
}

export class ResourcePool<T extends IDisposable> implements IDisposable {
	private readonly pool: T[] = [];
	private readonly _keyMap = new Map<string, T[]>();
	private _trimTimer: ReturnType<typeof setTimeout> | undefined;

	private _inUse = new Set<T>;
	public get inUse(): ReadonlySet<T> {
		return this._inUse;
	}

	constructor(
		private readonly _itemFactory: () => T,
		private readonly _options?: IResourcePoolOptions,
	) { }

	/**
	 * Get an item from the pool. If a key is provided, the pool will try
	 * to return an idle item that was previously released with the same key.
	 * This is a best-effort hint — the key does not need to be unique, and
	 * multiple items can be checked out with the same key simultaneously.
	 */
	get(key?: string): T {
		if (key) {
			const keyItems = this._keyMap.get(key);
			if (keyItems) {
				const idx = keyItems.findIndex(item => this.pool.includes(item));
				if (idx !== -1) {
					const item = keyItems[idx];
					const poolIdx = this.pool.indexOf(item);
					this.pool.splice(poolIdx, 1);
					this._inUse.add(item);
					return item;
				}
			}
		}

		if (this.pool.length > 0) {
			const item = this.pool.pop()!;
			this._inUse.add(item);
			return item;
		}

		const item = this._itemFactory();
		this._inUse.add(item);
		return item;
	}

	release(item: T, key?: string): void {
		this._inUse.delete(item);
		this.pool.push(item);

		if (key) {
			let keyItems = this._keyMap.get(key);
			if (!keyItems) {
				keyItems = [];
				this._keyMap.set(key, keyItems);
			}
			if (!keyItems.includes(item)) {
				keyItems.push(item);
			}
		}

		this._scheduleTrim();
	}

	private _scheduleTrim(): void {
		const maxIdle = this._options?.maxIdleSize;
		if (maxIdle === undefined || this.pool.length <= maxIdle) {
			return;
		}

		// Debounce: reset the timer on every release so that rapid
		// get/release cycles (streaming, scrolling) don't cause churn.
		if (this._trimTimer !== undefined) {
			clearTimeout(this._trimTimer);
		}
		const delay = this._options?.trimIdleDelay ?? 10_000;
		this._trimTimer = setTimeout(() => {
			this._trimTimer = undefined;
			this._trimIdle();
		}, delay);
	}

	private _trimIdle(): void {
		const maxIdle = this._options?.maxIdleSize;
		if (maxIdle === undefined) {
			return;
		}

		while (this.pool.length > maxIdle) {
			const item = this.pool.pop()!;
			this._removeFromKeyMap(item);
			item.dispose();
		}
	}

	private _removeFromKeyMap(item: T): void {
		for (const [key, items] of this._keyMap) {
			const idx = items.indexOf(item);
			if (idx !== -1) {
				items.splice(idx, 1);
				if (items.length === 0) {
					this._keyMap.delete(key);
				}
				break;
			}
		}
	}

	/**
	 * Clear and dispose the items in the pool that are not in use.
	 */
	clear(): void {
		if (this._trimTimer !== undefined) {
			clearTimeout(this._trimTimer);
			this._trimTimer = undefined;
		}
		for (const item of this.pool) {
			item.dispose();
		}
		this.pool.length = 0;
		this._keyMap.clear();
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
