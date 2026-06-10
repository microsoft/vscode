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
	private _trimTimer: ReturnType<typeof setTimeout> | undefined;

	private _inUse = new Set<T>;
	public get inUse(): ReadonlySet<T> {
		return this._inUse;
	}

	constructor(
		private readonly _itemFactory: () => T,
		private readonly _options?: IResourcePoolOptions,
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
			item.dispose();
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
	}

	public dispose(): void {
		this.clear();

		for (const item of this._inUse) {
			item.dispose();
		}
		this._inUse.clear();
	}
}

/**
 * A resource pool that supports keyed reuse. On {@link get}, the pool will
 * prefer returning an idle item that was previously {@link release released}
 * with the same key. Keys are best-effort hints — multiple items can share a
 * key and the pool falls back to any idle item when no keyed match is found.
 */
export class KeyedResourcePool<T extends IDisposable> implements IDisposable {
	private readonly _idle: T[] = [];
	private readonly _inUse = new Set<T>();
	private readonly _keyToItems = new Map<string, Set<T>>();
	private readonly _itemToKey = new Map<T, string>();
	private _trimTimer: ReturnType<typeof setTimeout> | undefined;

	public get inUse(): ReadonlySet<T> {
		return this._inUse;
	}

	constructor(
		private readonly _itemFactory: () => T,
		private readonly _options?: IResourcePoolOptions,
	) { }

	get(key: string): T {
		const candidates = this._keyToItems.get(key);
		if (candidates) {
			for (const item of candidates) {
				if (!this._inUse.has(item)) {
					const idx = this._idle.indexOf(item);
					if (idx !== -1) {
						this._idle.splice(idx, 1);
						this._inUse.add(item);
						return item;
					}
				}
			}
		}

		if (this._idle.length > 0) {
			const item = this._idle.pop()!;
			this._inUse.add(item);
			return item;
		}

		const item = this._itemFactory();
		this._inUse.add(item);
		return item;
	}

	release(item: T, key: string): void {
		this._inUse.delete(item);
		this._idle.push(item);

		// Remove old key association if it changed
		const oldKey = this._itemToKey.get(item);
		if (oldKey !== undefined && oldKey !== key) {
			const oldSet = this._keyToItems.get(oldKey);
			if (oldSet) {
				oldSet.delete(item);
				if (oldSet.size === 0) {
					this._keyToItems.delete(oldKey);
				}
			}
		}

		this._itemToKey.set(item, key);
		let keySet = this._keyToItems.get(key);
		if (!keySet) {
			keySet = new Set();
			this._keyToItems.set(key, keySet);
		}
		keySet.add(item);

		this._scheduleTrim();
	}

	private _scheduleTrim(): void {
		const maxIdle = this._options?.maxIdleSize;
		if (maxIdle === undefined || this._idle.length <= maxIdle) {
			return;
		}

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

		while (this._idle.length > maxIdle) {
			const item = this._idle.pop()!;
			this._removeFromMaps(item);
			item.dispose();
		}
	}

	private _removeFromMaps(item: T): void {
		const key = this._itemToKey.get(item);
		if (key !== undefined) {
			const keySet = this._keyToItems.get(key);
			if (keySet) {
				keySet.delete(item);
				if (keySet.size === 0) {
					this._keyToItems.delete(key);
				}
			}
			this._itemToKey.delete(item);
		}
	}

	clear(): void {
		if (this._trimTimer !== undefined) {
			clearTimeout(this._trimTimer);
			this._trimTimer = undefined;
		}
		for (const item of this._idle) {
			item.dispose();
		}
		this._idle.length = 0;
		this._keyToItems.clear();
		this._itemToKey.clear();
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
