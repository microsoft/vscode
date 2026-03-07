/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatSessionStatus, IChatSessionItem } from './chatSessionsService.js';

// #region Types

/**
 * Identifies a unique client connection within the distributed session system.
 * Each client (VS Code instance) that connects to the sync service receives a unique ID.
 */
export interface ISessionClientId {
	/** Unique identifier for this client instance */
	readonly clientId: string;
	/** Human-readable name (e.g. machine hostname or user-chosen label) */
	readonly displayName: string;
}

/**
 * A monotonically increasing version vector entry used for optimistic concurrency.
 * Each client maintains its own counter; the vector clock is the collection of all entries.
 */
export interface ISessionVersionEntry {
	readonly clientId: string;
	readonly counter: number;
}

/**
 * Full version vector for a session — one entry per client that has ever mutated it.
 * Used to detect concurrent edits and determine causal ordering.
 */
export type SessionVersionVector = readonly ISessionVersionEntry[];

/**
 * Liveness state of a host that owns session execution resources.
 */
export const enum HostStatus {
	/** Host is actively sending heartbeats and executing tasks */
	Online = 0,
	/** Host missed recent heartbeats but hasn't exceeded the failure threshold */
	Suspect = 1,
	/** Host has exceeded the failure threshold and is considered unreachable */
	Offline = 2,
}

/**
 * Describes a host (machine) that can execute agent sessions.
 * Comparable to an ngrok tunnel endpoint — a machine that exposes
 * a connection agent for clients to reach remote sessions.
 */
export interface ISessionHost {
	readonly hostId: string;
	readonly displayName: string;
	readonly status: HostStatus;
	/** URI clients use to reach this host (e.g. `wss://host-id.tunnel.example.com`) */
	readonly endpoint: URI;
	/** Millisecond timestamp of the last successful heartbeat */
	readonly lastHeartbeat: number;
}

/**
 * An immutable snapshot of a distributed session's state at a specific version.
 * Snapshots are the unit of replication: they are produced by the owning host
 * and consumed by every other client to build a consistent local view.
 */
export interface IDistributedSessionSnapshot {
	/** The session resource URI — stable identity across all clients */
	readonly sessionResource: URI;
	/** Version vector at the time this snapshot was taken */
	readonly version: SessionVersionVector;
	/** The host that currently owns execution for this session */
	readonly ownerHostId: string;
	/** Serialised session metadata (label, status, timing, changes, etc.) */
	readonly item: IChatSessionItem;
	/** Millisecond UTC timestamp when the snapshot was created */
	readonly timestamp: number;
}

/**
 * Represents a change to a distributed session that hasn't yet been
 * acknowledged by the sync service. The service resolves conflicts
 * using version vectors and last-writer-wins per field.
 */
export interface IDistributedSessionUpdate {
	readonly sessionResource: URI;
	/** Version vector the client had when it produced this update */
	readonly baseVersion: SessionVersionVector;
	/** Partial session item fields to merge */
	readonly patch: Partial<Pick<IChatSessionItem, 'label' | 'status' | 'archived'>>;
}

/**
 * Outcome of attempting to apply an update via the sync service.
 */
export const enum SyncUpdateResult {
	/** The update was accepted and the new version is authoritative */
	Accepted = 0,
	/** A concurrent update was detected; the client should re-fetch and retry */
	Conflict = 1,
	/** The session's owner host is offline; the update was queued for replay */
	OwnerOffline = 2,
}

/**
 * Result returned by {@link IDistributedSessionSyncService.applyUpdate}.
 */
export interface IDistributedSessionUpdateResult {
	readonly result: SyncUpdateResult;
	/** The latest snapshot after the update (or the conflicting snapshot on conflict) */
	readonly snapshot: IDistributedSessionSnapshot;
}

// #endregion

// #region Service Interface

export interface IDistributedSessionSyncService {
	readonly _serviceBrand: undefined;

	// --- Lifecycle ----------------------------------------------------------

	/**
	 * Fires when the local client's connection to the sync hub changes.
	 * `true` means connected, `false` means disconnected.
	 */
	readonly onDidChangeConnectionState: Event<boolean>;

	/** Whether the local client is currently connected to the sync hub. */
	readonly connected: boolean;

	/**
	 * Register the local client with the sync hub.
	 * Must be called once during startup before any other operations.
	 */
	connect(client: ISessionClientId): Promise<void>;

	/**
	 * Gracefully disconnect from the sync hub.
	 * Outstanding updates are flushed before disconnecting.
	 */
	disconnect(): Promise<void>;

	// --- Host management ----------------------------------------------------

	/**
	 * Fires when any host's status changes (online → suspect → offline).
	 */
	readonly onDidChangeHostStatus: Event<ISessionHost>;

	/**
	 * Register the local machine as a session host.
	 * The service will begin sending heartbeats automatically.
	 * @returns A disposable that, when disposed, unregisters the host.
	 */
	registerHost(host: Omit<ISessionHost, 'status' | 'lastHeartbeat'>): IDisposable;

	/**
	 * List all currently known hosts and their liveness state.
	 */
	getHosts(): readonly ISessionHost[];

	// --- Session replication -------------------------------------------------

	/**
	 * Fires when any session snapshot is updated (including remote changes).
	 */
	readonly onDidChangeSession: Event<IDistributedSessionSnapshot>;

	/**
	 * Fires when a session is removed from the distributed state.
	 */
	readonly onDidRemoveSession: Event<URI>;

	/**
	 * Return the latest snapshot for every session visible to the current account.
	 */
	getSessions(): readonly IDistributedSessionSnapshot[];

	/**
	 * Return the latest snapshot for a specific session, or `undefined` if unknown.
	 */
	getSession(sessionResource: URI): IDistributedSessionSnapshot | undefined;

	/**
	 * Publish a new session to the distributed state.
	 * The calling host becomes the owner.
	 */
	publishSession(snapshot: IDistributedSessionSnapshot): Promise<void>;

	/**
	 * Apply a partial update to a session.
	 * Uses optimistic concurrency via version vectors.
	 */
	applyUpdate(update: IDistributedSessionUpdate): Promise<IDistributedSessionUpdateResult>;

	/**
	 * Reassign ownership of a session to a different host.
	 * Typically called during failover when the current owner goes offline.
	 */
	reassignSessionOwner(sessionResource: URI, newOwnerHostId: string): Promise<boolean>;
}

export const IDistributedSessionSyncService = createDecorator<IDistributedSessionSyncService>('distributedSessionSyncService');

// #endregion

// #region Utilities

/**
 * Compare two version vectors to determine causal ordering.
 * @returns
 *  - `1`  if `a` dominates `b` (a is strictly newer)
 *  - `-1` if `b` dominates `a`
 *  - `0`  if they are concurrent (conflict)
 */
export function compareVersionVectors(a: SessionVersionVector, b: SessionVersionVector): -1 | 0 | 1 {
	const mapA = new Map(a.map(e => [e.clientId, e.counter]));
	const mapB = new Map(b.map(e => [e.clientId, e.counter]));

	const allClientIds = new Set([...mapA.keys(), ...mapB.keys()]);

	let aGreater = false;
	let bGreater = false;

	for (const clientId of allClientIds) {
		const ca = mapA.get(clientId) ?? 0;
		const cb = mapB.get(clientId) ?? 0;
		if (ca > cb) {
			aGreater = true;
		} else if (cb > ca) {
			bGreater = true;
		}
	}

	if (aGreater && !bGreater) {
		return 1;
	}
	if (bGreater && !aGreater) {
		return -1;
	}
	return 0; // concurrent
}

/**
 * Increment the counter for the given client in a version vector,
 * returning a new vector (immutable).
 */
export function incrementVersionVector(vector: SessionVersionVector, clientId: string): SessionVersionVector {
	const result: ISessionVersionEntry[] = [];
	let found = false;
	for (const entry of vector) {
		if (entry.clientId === clientId) {
			result.push({ clientId, counter: entry.counter + 1 });
			found = true;
		} else {
			result.push(entry);
		}
	}
	if (!found) {
		result.push({ clientId, counter: 1 });
	}
	return result;
}

/**
 * Merge two version vectors by taking the max counter per client.
 */
export function mergeVersionVectors(a: SessionVersionVector, b: SessionVersionVector): SessionVersionVector {
	const merged = new Map<string, number>();
	for (const entry of a) {
		merged.set(entry.clientId, entry.counter);
	}
	for (const entry of b) {
		const existing = merged.get(entry.clientId) ?? 0;
		merged.set(entry.clientId, Math.max(existing, entry.counter));
	}
	return Array.from(merged.entries()).map(([clientId, counter]) => ({ clientId, counter }));
}

/**
 * Determine whether a session needs a new owner based on host status.
 * Active sessions (in-progress or waiting for input) need failover
 * when their owner host goes offline.
 */
export function sessionNeedsFailover(snapshot: IDistributedSessionSnapshot, hosts: readonly ISessionHost[]): boolean {
	if (snapshot.item.status !== ChatSessionStatus.InProgress && snapshot.item.status !== ChatSessionStatus.NeedsInput) {
		return false; // only active sessions need failover
	}
	const ownerHost = hosts.find(h => h.hostId === snapshot.ownerHostId);
	return !ownerHost || ownerHost.status === HostStatus.Offline;
}

// #endregion
