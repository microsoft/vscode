/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue, transaction } from '../../../base/common/observable.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostRemoteTargetStatus, AgentHostRemoteTargetUnavailableError, type IAgentHostRemoteTargetConnector, type IAgentHostRemoteTargetDescriptor, type IAgentHostRemoteTargetHandle } from '../common/agentHostRemoteAgents.js';
import type { IAgentConnection } from '../common/agentService.js';
import { computeReconnectDelay, DEFAULT_RECONNECT_POLICY } from '../common/reconnectPolicy.js';
import type { IRemoteAgentHostProtocolClient, RemoteAgentHostProtocolClientState } from '../common/remoteAgentHostService.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';

const REMOTE_AGENT_CLIENT_IDS_STORAGE_KEY = 'remoteAgents.clientIds';

class RemoteTargetHandle extends Disposable implements IAgentHostRemoteTargetHandle {
	private readonly _label: ReturnType<typeof observableValue<string>>;
	readonly label: IObservable<string>;

	private readonly _status = observableValue(this, AgentHostRemoteTargetStatus.Connecting);
	readonly status: IObservable<AgentHostRemoteTargetStatus> = this._status;

	private readonly _connection = observableValue<IAgentConnection | undefined>(this, undefined);
	readonly connection: IObservable<IAgentConnection | undefined> = this._connection;

	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;

	private readonly _connectionLifetime = this._register(new MutableDisposable<DisposableStore>());
	private readonly _redial = this._register(new MutableDisposable<IDisposable>());
	private _redialAttempt = 0;

	constructor(
		readonly connectorId: string,
		readonly targetId: string,
		readonly clientId: string,
		label: string,
		readonly internalKey: string,
		private readonly _persistClientId: () => Promise<void>,
		private readonly _logService: ILogService,
	) {
		super();
		this._label = observableValue(this, label);
		this.label = this._label;
	}

	update(target: IAgentHostRemoteTargetDescriptor): void {
		this._label.set(target.label, undefined);
	}

	connect(connector: IAgentHostRemoteTargetConnector, target: IAgentHostRemoteTargetDescriptor, resetBackoff = true): void {
		this._redial.clear();
		if (resetBackoff) {
			this._redialAttempt = 0;
		}
		const lifetime = new DisposableStore();
		const cancellation = new CancellationTokenSource();
		lifetime.add(toDisposable(() => cancellation.dispose(true)));
		this._connectionLifetime.value = lifetime;
		this._setAvailability(AgentHostRemoteTargetStatus.Connecting);

		void this._connect(connector, target, lifetime, cancellation);
	}

	requireConnection(): IAgentConnection {
		const connection = this._connection.get();
		if (!connection) {
			throw new AgentHostRemoteTargetUnavailableError(this.connectorId, this.targetId, this._status.get());
		}
		return connection;
	}

	private _acceptClientState(client: IRemoteAgentHostProtocolClient, state: RemoteAgentHostProtocolClientState, connector: IAgentHostRemoteTargetConnector, target: IAgentHostRemoteTargetDescriptor): void {
		switch (state) {
			case 'connected':
				this._publishConnected(client);
				break;
			case 'connecting':
				this._setAvailability(AgentHostRemoteTargetStatus.Connecting);
				break;
			case 'reconnecting':
				this._setAvailability(AgentHostRemoteTargetStatus.Reconnecting);
				break;
			case 'incompatible':
				this._setAvailability(AgentHostRemoteTargetStatus.Unavailable);
				this._connectionLifetime.clear();
				break;
			case 'closed':
				this._setAvailability(AgentHostRemoteTargetStatus.Unavailable);
				this._connectionLifetime.clear();
				this._scheduleRedial(connector, target);
				break;
		}
	}

	private async _connect(connector: IAgentHostRemoteTargetConnector, target: IAgentHostRemoteTargetDescriptor, lifetime: DisposableStore, cancellation: CancellationTokenSource): Promise<void> {
		try {
			await this._persistClientId();
			if (cancellation.token.isCancellationRequested) {
				return;
			}
			const client = await connector.createConnection(target, {
				clientId: this.clientId,
				cancellationToken: cancellation.token,
			});
			if (cancellation.token.isCancellationRequested) {
				client.dispose();
				return;
			}
			if (client.clientId !== this.clientId) {
				client.dispose();
				this._setAvailability(AgentHostRemoteTargetStatus.Unavailable);
				this._logService.error(`[AgentHostRemoteAgents] Connector ${this.connectorId} returned client '${client.clientId}' for target ${this.targetId}; expected '${this.clientId}'.`);
				return;
			}
			lifetime.add(client);
			lifetime.add(client.onDidChangeConnectionState(state => this._acceptClientState(client, state, connector, target)));
			await client.connect();
			if (!cancellation.token.isCancellationRequested) {
				this._publishConnected(client);
			}
		} catch (error) {
			if (!cancellation.token.isCancellationRequested && this._status.get() === AgentHostRemoteTargetStatus.Connecting) {
				this._setAvailability(AgentHostRemoteTargetStatus.Unavailable);
				this._logService.error(`[AgentHostRemoteAgents] Failed to prepare or connect target ${this.connectorId}/${this.targetId}`, error);
				this._scheduleRedial(connector, target);
			}
		}
	}

	private _publishConnected(client: IRemoteAgentHostProtocolClient): void {
		const rootState = client.rootState.value;
		if (!rootState || rootState instanceof Error) {
			this._setAvailability(AgentHostRemoteTargetStatus.Unavailable);
			this._logService.error(`[AgentHostRemoteAgents] Target ${this.connectorId}/${this.targetId} initialized without a root provider catalogue`, rootState);
			this._connectionLifetime.clear();
			return;
		}
		transaction(tx => {
			this._connection.set(client, tx);
			this._status.set(AgentHostRemoteTargetStatus.Connected, tx);
		});
		this._redialAttempt = 0;
		this._redial.clear();
	}

	private _setAvailability(status: AgentHostRemoteTargetStatus): void {
		transaction(tx => {
			this._connection.set(undefined, tx);
			this._status.set(status, tx);
		});
	}

	private _scheduleRedial(connector: IAgentHostRemoteTargetConnector, target: IAgentHostRemoteTargetDescriptor): void {
		const policy = connector.reconnectPolicy ?? DEFAULT_RECONNECT_POLICY;
		if (this._store.isDisposed || !policy.autoRestore || this._redial.value || this._redialAttempt >= policy.maxAttempts) {
			return;
		}
		const attempt = ++this._redialAttempt;
		this._redial.value = disposableTimeout(() => {
			this._redial.clear();
			this.connect(connector, target, false);
		}, computeReconnectDelay(policy, attempt));
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._setAvailability(AgentHostRemoteTargetStatus.Unavailable);
		this._onDidDispose.fire();
		super.dispose();
	}
}

interface ITargetConnectorRegistration {
	readonly connector: IAgentHostRemoteTargetConnector;
	readonly store: DisposableStore;
	targets: readonly IAgentHostRemoteTargetDescriptor[];
}

/**
 * Owns connector registrations and their stable target handles.
 */
export class AgentHostRemoteTargetRegistry extends Disposable {
	private readonly _connectors = new Map<string, ITargetConnectorRegistration>();
	private readonly _targetHandles = this._register(new DisposableMap<string, RemoteTargetHandle>());
	private readonly _targetIds = new Map<string, string>();
	private readonly _clientIdPersistence = new Map<string, { readonly clientId: string; readonly promise: Promise<void> }>();
	private readonly _targets = observableValue<readonly IAgentHostRemoteTargetHandle[]>(this, []);
	readonly targets: IObservable<readonly IAgentHostRemoteTargetHandle[]> = this._targets;

	constructor(
		private readonly _storageService: IAgentHostStorageService,
		private readonly _logService: ILogService,
	) {
		super();
	}

	registerConnector(connector: IAgentHostRemoteTargetConnector): IDisposable {
		if (!connector.connectorId) {
			throw new Error('Remote Agent Host connector id must not be empty.');
		}
		if (this._connectors.has(connector.connectorId)) {
			throw new Error(`Remote Agent Host connector '${connector.connectorId}' is already registered.`);
		}

		const store = new DisposableStore();
		const registration: ITargetConnectorRegistration = { connector, store, targets: [] };
		this._connectors.set(connector.connectorId, registration);
		try {
			store.add(autorun(reader => {
				registration.targets = connector.targets.read(reader);
				this._reconcileTargets();
			}));
		} catch (error) {
			this._connectors.delete(connector.connectorId);
			store.dispose();
			throw error;
		}

		return toDisposable(() => {
			store.dispose();
			if (this._connectors.get(connector.connectorId) === registration) {
				this._connectors.delete(connector.connectorId);
				this._reconcileTargets();
			}
		});
	}

	private _reconcileTargets(): void {
		const desired = new Map<string, { readonly connector: IAgentHostRemoteTargetConnector; readonly target: IAgentHostRemoteTargetDescriptor }>();
		const contributedKeys = new Set<string>();
		for (const registration of this._connectors.values()) {
			for (const target of registration.targets) {
				this._validateTarget(registration.connector.connectorId, target);
				const key = this._targetKey(registration.connector.connectorId, target.internalKey);
				if (contributedKeys.has(key)) {
					throw new Error(`Remote Agent Host connector '${registration.connector.connectorId}' contributed duplicate target key '${target.internalKey}'.`);
				}
				contributedKeys.add(key);
				const expectedTargetId = this._targetIds.get(key);
				if (expectedTargetId !== undefined && expectedTargetId !== target.targetId) {
					this._logService.error(`[AgentHostRemoteAgents] Quarantining target '${target.internalKey}' from connector '${registration.connector.connectorId}' because its external identity changed from '${expectedTargetId}' to '${target.targetId}'.`);
					continue;
				}
				this._targetIds.set(key, target.targetId);
				desired.set(key, { connector: registration.connector, target });
			}
		}
		for (const key of this._targetIds.keys()) {
			if (!contributedKeys.has(key)) {
				this._targetIds.delete(key);
			}
		}

		for (const [key] of this._targetHandles) {
			if (!desired.has(key)) {
				this._targetHandles.deleteAndDispose(key);
			}
		}
		for (const [key, entry] of desired) {
			const existing = this._targetHandles.get(key);
			if (existing) {
				existing.update(entry.target);
				if (existing.status.get() === AgentHostRemoteTargetStatus.Unavailable) {
					existing.connect(entry.connector, entry.target);
				}
				continue;
			}
			const clientId = this._getOrCreateClientId(key);
			const handle = new RemoteTargetHandle(
				entry.connector.connectorId,
				entry.target.targetId,
				clientId,
				entry.target.label,
				entry.target.internalKey,
				() => this._persistClientId(key, clientId),
				this._logService,
			);
			this._targetHandles.set(key, handle);
			handle.connect(entry.connector, entry.target);
		}
		const targets = [...desired.keys()].map(key => this._targetHandles.get(key)!);
		const currentTargets = this._targets.get();
		if (targets.length !== currentTargets.length || targets.some((target, index) => currentTargets[index] !== target)) {
			this._targets.set(targets, undefined);
		}
	}

	private _validateTarget(connectorId: string, target: IAgentHostRemoteTargetDescriptor): void {
		if (!target.internalKey || !target.targetId || !target.label) {
			throw new Error(`Remote Agent Host connector '${connectorId}' contributed a target with an empty identity or label.`);
		}
	}

	private _targetKey(connectorId: string, internalKey: string): string {
		return JSON.stringify([connectorId, internalKey]);
	}

	private _getOrCreateClientId(targetKey: string): string {
		return this._readClientIds()[targetKey] ?? generateUuid();
	}

	private _persistClientId(targetKey: string, clientId: string): Promise<void> {
		const pending = this._clientIdPersistence.get(targetKey);
		if (pending) {
			if (pending.clientId === clientId) {
				return pending.promise;
			}
			return pending.promise.then(
				() => this._persistClientId(targetKey, clientId),
				() => this._persistClientId(targetKey, clientId),
			);
		}
		const stored = this._readClientIds();
		if (stored[targetKey] === clientId) {
			return Promise.resolve();
		}
		const promise = this._storageService.setAndFlush(REMOTE_AGENT_CLIENT_IDS_STORAGE_KEY, { ...stored, [targetKey]: clientId });
		const persistence = { clientId, promise };
		this._clientIdPersistence.set(targetKey, persistence);
		void promise.then(
			() => this._clearClientIdPersistence(targetKey, persistence),
			() => this._clearClientIdPersistence(targetKey, persistence),
		);
		return promise;
	}

	private _clearClientIdPersistence(targetKey: string, persistence: { readonly clientId: string; readonly promise: Promise<void> }): void {
		if (this._clientIdPersistence.get(targetKey) === persistence) {
			this._clientIdPersistence.delete(targetKey);
		}
	}

	private _readClientIds(): Record<string, string> {
		const raw = this._storageService.get<Record<string, unknown>>(REMOTE_AGENT_CLIENT_IDS_STORAGE_KEY);
		return raw && typeof raw === 'object' && !Array.isArray(raw)
			? Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
			: {};
	}

	override dispose(): void {
		for (const connector of this._connectors.values()) {
			connector.store.dispose();
		}
		this._connectors.clear();
		this._targetIds.clear();
		this._targetHandles.clearAndDisposeAll();
		this._targets.set([], undefined);
		super.dispose();
	}
}
