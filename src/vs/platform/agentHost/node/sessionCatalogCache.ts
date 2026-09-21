/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { LRUCache } from '../../../base/common/map.js';

interface ICatalogCacheEntry<T> {
	version: string;
	readonly promise: Promise<T | undefined>;
	expiresAt: number;
	value?: T;
}

/** Shares in-flight reads and bounds successful catalog snapshots; misses and failures are never retained. */
export class SessionCatalogCache<T> extends Disposable {
	private readonly _entries = new LRUCache<string, ICatalogCacheEntry<T>>(2048);
	private readonly _expiry: RunOnceScheduler;

	constructor(
		private readonly _ttl: number,
		private readonly _now: () => number = Date.now,
		private readonly _canCache?: (value: T) => boolean,
	) {
		super();
		this._expiry = this._register(new RunOnceScheduler(() => this._expire(), this._ttl));
	}

	has(key: string, version: string): boolean {
		const entry = this._entries.get(key);
		if (entry && entry.version === version && entry.expiresAt > this._now()) {
			return true;
		}
		this._entries.delete(key);
		return false;
	}

	get(key: string, version: string, load: () => Promise<T | undefined>, resolvedVersion?: (value: T) => string): Promise<T | undefined> {
		if (this.has(key, version)) {
			return this._entries.get(key)!.promise;
		}
		const entry: ICatalogCacheEntry<T> = {
			version,
			expiresAt: Number.POSITIVE_INFINITY,
			promise: Promise.resolve().then(load).then(value => {
				if (this._entries.get(key) !== entry) {
					return value;
				}
				if (value === undefined || this._ttl <= 0 || this._store.isDisposed || this._canCache?.(value) === false) {
					this._entries.delete(key);
				} else {
					entry.version = resolvedVersion?.(value) ?? version;
					entry.value = value;
					entry.expiresAt = this._now() + this._ttl;
					if (!this._expiry.isScheduled()) {
						this._expiry.schedule();
					}
				}
				return value;
			}),
		};
		this._entries.set(key, entry);
		void entry.promise.catch(() => {
			if (this._entries.get(key) === entry) {
				this._entries.delete(key);
			}
		});
		return entry.promise;
	}

	peek(key: string): T | undefined {
		const entry = this._entries.get(key);
		return entry && entry.expiresAt > this._now() ? entry.value : undefined;
	}

	delete(key: string): boolean {
		return this._entries.delete(key);
	}

	retain(keys: ReadonlySet<string>): void {
		this.deleteMatching(key => !keys.has(key));
	}

	deleteMatching(predicate: (key: string) => boolean): void {
		for (const key of [...this._entries.keys()]) {
			if (predicate(key)) {
				this._entries.delete(key);
			}
		}
	}

	clear(): void {
		this._entries.clear();
		this._expiry.cancel();
	}

	private _expire(): void {
		const now = this._now();
		let nextExpiry = Number.POSITIVE_INFINITY;
		for (const [key, entry] of [...this._entries]) {
			if (entry.expiresAt <= now) {
				this._entries.delete(key);
			} else {
				nextExpiry = Math.min(nextExpiry, entry.expiresAt);
			}
		}
		if (Number.isFinite(nextExpiry)) {
			this._expiry.schedule(nextExpiry - now);
		}
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}
}
