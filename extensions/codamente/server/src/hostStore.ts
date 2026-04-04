/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'node:crypto';
import type { HostEntry, PublicHost, ConnectInfo } from './types';

/**
 * In-memory host store with automatic TTL-based expiry.
 *
 * Hosts that miss heartbeats for longer than {@link HOST_TTL_MS} are
 * automatically pruned on the next access or periodic sweep.
 */
export class HostStore {

	/** How long a host lives without a heartbeat before it is expired. */
	private static readonly HOST_TTL_MS = 90_000; // 90 seconds (3 missed 30 s heartbeats)

	private readonly _hosts = new Map<string, HostEntry>();
	private _sweepTimer: ReturnType<typeof setInterval> | undefined;

	constructor() {
		// Sweep every 60 seconds to clean up expired entries
		this._sweepTimer = setInterval(() => this._sweep(), 60_000);
	}

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	/**
	 * Register a new host owned by the given GitHub user.
	 */
	register(githubUserId: number, tunnelUrl: string, connectionToken: string, hostName: string): HostEntry {
		const id = crypto.randomUUID();
		const now = Date.now();
		const entry: HostEntry = {
			id,
			githubUserId,
			tunnelUrl,
			connectionToken,
			hostName,
			lastHeartbeat: now,
			createdAt: now,
		};
		this._hosts.set(id, entry);
		return entry;
	}

	/**
	 * Update the heartbeat timestamp for a host.
	 * Returns `true` if the host exists and belongs to the caller.
	 */
	heartbeat(id: string, githubUserId: number): boolean {
		const entry = this._hosts.get(id);
		if (!entry || entry.githubUserId !== githubUserId) {
			return false;
		}
		entry.lastHeartbeat = Date.now();
		return true;
	}

	/**
	 * Remove a host. Only the owner may remove it.
	 * Returns `true` if the host was found and removed.
	 */
	remove(id: string, githubUserId: number): boolean {
		const entry = this._hosts.get(id);
		if (!entry || entry.githubUserId !== githubUserId) {
			return false;
		}
		this._hosts.delete(id);
		return true;
	}

	/**
	 * List all live hosts for a given user. Expired entries are excluded.
	 * Returns the public shape without connection tokens.
	 */
	listForUser(githubUserId: number): PublicHost[] {
		const now = Date.now();
		const result: PublicHost[] = [];
		for (const entry of this._hosts.values()) {
			if (entry.githubUserId === githubUserId && !this._isExpired(entry, now)) {
				result.push({ id: entry.id, tunnelUrl: entry.tunnelUrl, hostName: entry.hostName });
			}
		}
		return result;
	}

	/**
	 * Get connection info for a host. Only the owner can connect.
	 * Returns `undefined` if the host doesn't exist, is expired, or
	 * doesn't belong to the caller.
	 */
	getConnectInfo(id: string, githubUserId: number): ConnectInfo | undefined {
		const entry = this._hosts.get(id);
		if (!entry || entry.githubUserId !== githubUserId || this._isExpired(entry, Date.now())) {
			return undefined;
		}
		return { tunnelUrl: entry.tunnelUrl, connectionToken: entry.connectionToken };
	}

	/**
	 * Return total number of live (non-expired) hosts. Useful for health checks.
	 */
	get size(): number {
		this._sweep();
		return this._hosts.size;
	}

	/**
	 * Shut down the background sweep timer.
	 */
	dispose(): void {
		if (this._sweepTimer !== undefined) {
			clearInterval(this._sweepTimer);
			this._sweepTimer = undefined;
		}
	}

	// -----------------------------------------------------------------------
	// Internal
	// -----------------------------------------------------------------------

	private _isExpired(entry: HostEntry, now: number): boolean {
		return now - entry.lastHeartbeat > HostStore.HOST_TTL_MS;
	}

	private _sweep(): void {
		const now = Date.now();
		for (const [id, entry] of this._hosts) {
			if (this._isExpired(entry, now)) {
				this._hosts.delete(id);
			}
		}
	}
}
