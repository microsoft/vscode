// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { Pool, fetch as undiciFetch } from 'undici';
import type { FetchFn } from './providers/anthropic-oauth.js';

/** undici Pool options applied to every connection pool (§8.3). */
const POOL_OPTIONS: ConstructorParameters<typeof Pool>[1] = {
	connections: 8,
	pipelining: 1,
	keepAliveTimeout: 60_000,
	keepAliveMaxTimeout: 60_000,
};

/**
 * A map of base URL → undici Pool. One pool per provider origin avoids TLS
 * handshake overhead on every request.  Cuts ~80ms off Anthropic round-trips.
 */
export class ProviderConnectionPool {
	private readonly pools = new Map<string, Pool>();

	/** Returns (or creates) the pool for the given origin. */
	getPool(baseUrl: string): Pool {
		const existing = this.pools.get(baseUrl);
		if (existing) {
			return existing;
		}
		const pool = new Pool(baseUrl, POOL_OPTIONS);
		this.pools.set(baseUrl, pool);
		return pool;
	}

	/**
	 * Creates a `fetch`-compatible function backed by the pool for `baseUrl`.
	 * Drop-in replacement for the global `fetch` accepted by provider adapters.
	 */
	createFetchFn(baseUrl: string): FetchFn {
		const pool = this.getPool(baseUrl);
		// undici.fetch accepts a `dispatcher` option to route through our pool.
		return (input, init?) => undiciFetch(
			input as Parameters<typeof undiciFetch>[0],
			{ ...(init as object | undefined), dispatcher: pool } as Parameters<typeof undiciFetch>[1],
		) as unknown as Promise<Response>;
	}

	/** Closes all pools and releases their connections. */
	async destroy(): Promise<void> {
		const closers: Promise<void>[] = [];
		for (const pool of this.pools.values()) {
			closers.push(pool.destroy());
		}
		this.pools.clear();
		await Promise.all(closers);
	}

	/** Number of pools currently open. */
	get size(): number {
		return this.pools.size;
	}
}
