/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import type { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ROUTE_EVICTION_GRACE_MS, ROUTE_TABLE_SOFT_CAP } from './constants.js';
import type { ILocalModelAutoLimits, ILocalModelFallbackModel } from './requestRouter.js';
import type { ILocalModelClock, IServingIdentity } from './servingAccess.js';

/** What `/auto` patching records for one session token. */
export interface IRouteRecordInit {
	/** The chat-capable cloud fallback `F`. */
	readonly fallback: ILocalModelFallbackModel;
	/** Serving identity captured at injection; the route is never served by another one. */
	readonly serving: IServingIdentity;
	/** Origin of the CAPI that issued the token. */
	readonly capiOrigin: string;
	readonly accountGeneration: number;
	readonly expiresAt: number;
	/** The patched limits (pinned to {@link serving}). */
	readonly limits: ILocalModelAutoLimits;
	/** `/auto` `tier`, for telemetry. */
	readonly tier?: string;
}

/** A route record; held only in memory, never logged or persisted. */
export interface IRouteRecord extends IRouteRecordInit {
	readonly createdAt: number;
	readonly leases: number;
}

/** A lease on a route record; the record is not evicted while leased. `dispose` is idempotent. */
export interface IRouteLease extends IDisposable {
	readonly record: IRouteRecord;
}

class RouteEntry implements IRouteRecord {
	leases = 0;

	readonly fallback: ILocalModelFallbackModel;
	readonly serving: IServingIdentity;
	readonly capiOrigin: string;
	readonly accountGeneration: number;
	readonly expiresAt: number;
	readonly limits: ILocalModelAutoLimits;
	readonly tier?: string;

	constructor(init: IRouteRecordInit, readonly createdAt: number) {
		this.fallback = init.fallback;
		this.serving = init.serving;
		this.capiOrigin = init.capiOrigin;
		this.accountGeneration = init.accountGeneration;
		this.expiresAt = init.expiresAt;
		this.limits = init.limits;
		this.tier = init.tier;
	}
}

/** Length of the token hash prefix used in logs. */
const TOKEN_HASH_PREFIX_LENGTH = 8;

/** A short, non-reversible identifier for an Auto session token, for logs only. */
export function hashRouteToken(token: string): string {
	return createHash('sha256').update(token).digest('hex').slice(0, TOKEN_HASH_PREFIX_LENGTH);
}

/**
 * Auto session token → fallback route records, held only in memory (tokens are never logged or persisted). A record is
 * evicted only when unleased and 10 min past `expiresAt`, or oldest-first above the soft cap (1024); records from an
 * older account generation are treated as missing.
 */
export class RouteTable {

	private readonly _entries = new Map<string, RouteEntry>();

	constructor(
		private readonly _clock: Pick<ILocalModelClock, 'now'>,
		private readonly _softCap = ROUTE_TABLE_SOFT_CAP,
		private readonly _evictionGraceMs = ROUTE_EVICTION_GRACE_MS,
	) { }

	get size(): number {
		return this._entries.size;
	}

	/** Adds (or replaces) the record for `token`. */
	add(token: string, init: IRouteRecordInit): void {
		this._entries.delete(token);
		this._entries.set(token, new RouteEntry(init, this._clock.now()));
		this.sweep();
	}

	/** Looks up `token` and leases its record; `undefined` when there is none or it belongs to another account generation. */
	acquire(token: string, accountGeneration: number): IRouteLease | undefined {
		this.sweep();
		const entry = this._entries.get(token);
		if (!entry) {
			return undefined;
		}
		if (entry.accountGeneration !== accountGeneration) {
			if (entry.leases === 0) {
				this._entries.delete(token);
			}
			return undefined;
		}
		entry.leases++;
		let released = false;
		return {
			record: entry,
			dispose: () => {
				if (!released) {
					released = true;
					entry.leases--;
				}
			},
		};
	}

	/** Unexpired routes of `accountGeneration` bound to `servingGeneration`; the `liveAutoRoutes` usage count. */
	countLiveRoutes(servingGeneration: number, accountGeneration: number): number {
		const now = this._clock.now();
		let count = 0;
		for (const entry of this._entries.values()) {
			if (entry.serving.servingGeneration === servingGeneration && entry.accountGeneration === accountGeneration && now <= entry.expiresAt) {
				count++;
			}
		}
		return count;
	}

	/** Evicts unleased records past `expiresAt + grace`, then the oldest unleased records above the soft cap. */
	sweep(): void {
		const now = this._clock.now();
		for (const [token, entry] of this._entries) {
			if (entry.leases === 0 && now > entry.expiresAt + this._evictionGraceMs) {
				this._entries.delete(token);
			}
		}
		if (this._entries.size <= this._softCap) {
			return;
		}
		// Map iteration is insertion order, which is creation order (`add` re-inserts).
		for (const [token, entry] of this._entries) {
			if (this._entries.size <= this._softCap) {
				break;
			}
			if (entry.leases === 0) {
				this._entries.delete(token);
			}
		}
	}
}
