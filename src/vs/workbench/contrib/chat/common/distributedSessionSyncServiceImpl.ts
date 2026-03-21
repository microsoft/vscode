/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatSessionItem } from './chatSessionsService.js';
import {
	compareVersionVectors,
	HostStatus,
	IDistributedSessionSnapshot,
	IDistributedSessionSyncService,
	IDistributedSessionUpdate,
	IDistributedSessionUpdateResult,
	incrementVersionVector,
	ISessionClientId,
	ISessionHost,
	mergeVersionVectors,
	SyncUpdateResult,
} from './distributedSessionSyncService.js';

/**
 * Default heartbeat interval in milliseconds.
 * Hosts send heartbeats at this cadence to prove liveness.
 */
const HEARTBEAT_INTERVAL_MS = 5_000;

/**
 * After this many missed heartbeat windows the host is marked {@link HostStatus.Suspect}.
 */
const SUSPECT_THRESHOLD_MS = HEARTBEAT_INTERVAL_MS * 3;

/**
 * After this many missed heartbeat windows the host is marked {@link HostStatus.Offline}.
 */
const OFFLINE_THRESHOLD_MS = HEARTBEAT_INTERVAL_MS * 6;

/**
 * In-memory implementation of the distributed session sync service.
 *
 * In production this would be backed by a remote coordination service
 * (comparable to an ngrok-style tunnel hub with a shared state store).
 * This implementation provides the correct semantics — version vectors,
 * heartbeat-based liveness, conflict detection — so that the UI layer
 * and integration tests can exercise the full protocol locally.
 */
export class DistributedSessionSyncService extends Disposable implements IDistributedSessionSyncService {
	declare readonly _serviceBrand: undefined;

	// --- Connection state ---------------------------------------------------

	private _connected = false;
	private _clientId: ISessionClientId | undefined;

	private readonly _onDidChangeConnectionState = this._register(new Emitter<boolean>());
	readonly onDidChangeConnectionState: Event<boolean> = this._onDidChangeConnectionState.event;

	get connected(): boolean { return this._connected; }

	// --- Host management ----------------------------------------------------

	private readonly _hosts = new Map<string, ISessionHost>();
	private readonly _hostHeartbeatTimers = new Map<string, IDisposable>();

	private readonly _onDidChangeHostStatus = this._register(new Emitter<ISessionHost>());
	readonly onDidChangeHostStatus: Event<ISessionHost> = this._onDidChangeHostStatus.event;

	// --- Session state ------------------------------------------------------

	private readonly _sessions = new ResourceMap<IDistributedSessionSnapshot>();

	private readonly _onDidChangeSession = this._register(new Emitter<IDistributedSessionSnapshot>());
	readonly onDidChangeSession: Event<IDistributedSessionSnapshot> = this._onDidChangeSession.event;

	private readonly _onDidRemoveSession = this._register(new Emitter<URI>());
	readonly onDidRemoveSession: Event<URI> = this._onDidRemoveSession.event;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	// --- Lifecycle ----------------------------------------------------------

	async connect(client: ISessionClientId): Promise<void> {
		if (this._connected) {
			return;
		}
		this._clientId = client;
		this._connected = true;
		this.logService.info(`[DistributedSessionSync] Client connected: ${client.clientId} (${client.displayName})`);
		this._onDidChangeConnectionState.fire(true);
	}

	async disconnect(): Promise<void> {
		if (!this._connected) {
			return;
		}
		this._connected = false;
		this._clientId = undefined;
		this.logService.info('[DistributedSessionSync] Client disconnected');
		this._onDidChangeConnectionState.fire(false);
	}

	// --- Host management ----------------------------------------------------

	registerHost(hostInfo: Omit<ISessionHost, 'status' | 'lastHeartbeat'>): IDisposable {
		const now = Date.now();
		const host: ISessionHost = {
			...hostInfo,
			status: HostStatus.Online,
			lastHeartbeat: now,
		};
		this._hosts.set(host.hostId, host);
		this.logService.info(`[DistributedSessionSync] Host registered: ${host.hostId} (${host.displayName})`);
		this._onDidChangeHostStatus.fire(host);

		// Start heartbeat monitor
		const disposables = new DisposableStore();

		const heartbeatHandle = setInterval(() => this._sendHeartbeat(host.hostId), HEARTBEAT_INTERVAL_MS);
		disposables.add(toDisposable(() => clearInterval(heartbeatHandle)));

		const monitorHandle = setInterval(() => this._checkHostLiveness(host.hostId), HEARTBEAT_INTERVAL_MS);
		disposables.add(toDisposable(() => clearInterval(monitorHandle)));

		// Cleanup on unregister
		disposables.add(toDisposable(() => {
			this._hosts.delete(host.hostId);
			this._hostHeartbeatTimers.delete(host.hostId);
			const offlineHost = { ...host, status: HostStatus.Offline, lastHeartbeat: Date.now() };
			this._onDidChangeHostStatus.fire(offlineHost);
			this.logService.info(`[DistributedSessionSync] Host unregistered: ${host.hostId}`);
		}));

		this._hostHeartbeatTimers.set(host.hostId, disposables);
		return disposables;
	}

	getHosts(): readonly ISessionHost[] {
		return Array.from(this._hosts.values());
	}

	private _sendHeartbeat(hostId: string): void {
		const host = this._hosts.get(hostId);
		if (!host) {
			return;
		}
		const updated: ISessionHost = { ...host, lastHeartbeat: Date.now(), status: HostStatus.Online };
		this._hosts.set(hostId, updated);
		if (host.status !== HostStatus.Online) {
			this.logService.info(`[DistributedSessionSync] Host ${hostId} back online`);
			this._onDidChangeHostStatus.fire(updated);
		}
	}

	private _checkHostLiveness(hostId: string): void {
		const host = this._hosts.get(hostId);
		if (!host) {
			return;
		}
		const elapsed = Date.now() - host.lastHeartbeat;
		let newStatus = host.status;

		if (elapsed >= OFFLINE_THRESHOLD_MS) {
			newStatus = HostStatus.Offline;
		} else if (elapsed >= SUSPECT_THRESHOLD_MS) {
			newStatus = HostStatus.Suspect;
		} else {
			newStatus = HostStatus.Online;
		}

		if (newStatus !== host.status) {
			const updated: ISessionHost = { ...host, status: newStatus };
			this._hosts.set(hostId, updated);
			this.logService.info(`[DistributedSessionSync] Host ${hostId} status changed`);
			this._onDidChangeHostStatus.fire(updated);
		}
	}

	/**
	 * Simulate a host missing heartbeats (for testing).
	 * In production this happens naturally when a machine goes offline.
	 */
	_simulateHostFailure(hostId: string): void {
		const host = this._hosts.get(hostId);
		if (!host) {
			return;
		}
		// Push lastHeartbeat far into the past to trigger offline detection
		const staleHost: ISessionHost = {
			...host,
			lastHeartbeat: Date.now() - OFFLINE_THRESHOLD_MS - 1,
		};
		this._hosts.set(hostId, staleHost);
		// Run the liveness check immediately
		this._checkHostLiveness(hostId);
	}

	// --- Session replication -------------------------------------------------

	getSessions(): readonly IDistributedSessionSnapshot[] {
		return Array.from(this._sessions.values());
	}

	getSession(sessionResource: URI): IDistributedSessionSnapshot | undefined {
		return this._sessions.get(sessionResource);
	}

	async publishSession(snapshot: IDistributedSessionSnapshot): Promise<void> {
		this._sessions.set(snapshot.sessionResource, snapshot);
		this.logService.info(`[DistributedSessionSync] Session published: ${snapshot.sessionResource.toString()}`);
		this._onDidChangeSession.fire(snapshot);
	}

	async applyUpdate(update: IDistributedSessionUpdate): Promise<IDistributedSessionUpdateResult> {
		const current = this._sessions.get(update.sessionResource);
		if (!current) {
			return {
				result: SyncUpdateResult.Conflict,
				snapshot: {
					sessionResource: update.sessionResource,
					version: update.baseVersion,
					ownerHostId: '',
					item: {
						resource: update.sessionResource,
						label: '',
						timing: { created: 0, lastRequestStarted: undefined, lastRequestEnded: undefined },
					},
					timestamp: Date.now(),
				},
			};
		}

		// Check if the owner host is offline
		const ownerHost = this._hosts.get(current.ownerHostId);
		if (ownerHost && ownerHost.status === HostStatus.Offline) {
			return {
				result: SyncUpdateResult.OwnerOffline,
				snapshot: current,
			};
		}

		// Optimistic concurrency check via version vectors
		const ordering = compareVersionVectors(update.baseVersion, current.version);
		if (ordering === -1) {
			// Client's base is behind the current state — conflict
			return {
				result: SyncUpdateResult.Conflict,
				snapshot: current,
			};
		}

		// Apply the patch
		const clientId = this._clientId?.clientId ?? 'unknown';
		const newVersion = incrementVersionVector(
			mergeVersionVectors(update.baseVersion, current.version),
			clientId
		);

		const updatedItem: IChatSessionItem = { ...current.item };
		const mutable = updatedItem as { -readonly [K in keyof IChatSessionItem]: IChatSessionItem[K] };
		if (update.patch.label !== undefined) {
			mutable.label = update.patch.label;
		}
		if (update.patch.status !== undefined) {
			mutable.status = update.patch.status;
		}
		if (update.patch.archived !== undefined) {
			mutable.archived = update.patch.archived;
		}

		const newSnapshot: IDistributedSessionSnapshot = {
			sessionResource: current.sessionResource,
			version: newVersion,
			ownerHostId: current.ownerHostId,
			item: mutable,
			timestamp: Date.now(),
		};

		this._sessions.set(current.sessionResource, newSnapshot);
		this._onDidChangeSession.fire(newSnapshot);

		return {
			result: SyncUpdateResult.Accepted,
			snapshot: newSnapshot,
		};
	}

	async reassignSessionOwner(sessionResource: URI, newOwnerHostId: string): Promise<boolean> {
		const current = this._sessions.get(sessionResource);
		if (!current) {
			return false;
		}

		const newHost = this._hosts.get(newOwnerHostId);
		if (!newHost || newHost.status === HostStatus.Offline) {
			return false;
		}

		const clientId = this._clientId?.clientId ?? 'unknown';
		const newVersion = incrementVersionVector(current.version, clientId);

		const reassigned: IDistributedSessionSnapshot = {
			...current,
			ownerHostId: newOwnerHostId,
			version: newVersion,
			timestamp: Date.now(),
		};
		this._sessions.set(sessionResource, reassigned);
		this.logService.info(`[DistributedSessionSync] Session ${sessionResource.toString()} reassigned to host ${newOwnerHostId}`);
		this._onDidChangeSession.fire(reassigned);
		return true;
	}
}
