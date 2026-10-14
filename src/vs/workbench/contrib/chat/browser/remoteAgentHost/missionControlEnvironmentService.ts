/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isObject } from '../../../../../base/common/types.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { cloudSandboxAddress, ICloudSandboxAgentHostService, ICloudSandboxApiService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IMissionControlEnvironmentService, IMissionControlHost } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { formatConnectionDiagnosticError, getConnectionDiagnosticError } from '../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageEntry, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';

const INVENTORY_PREFIX = 'missionControl.userLocalHosts.v1.';
const CONNECT_TIMEOUT_MS = 60_000;

type MissionControlConnectionAttemptEvent = {
	outcome: 'success' | 'failure' | 'cancelled' | 'timeout';
	stage: 'environment' | 'connection';
	durationMs: number;
};

export type MissionControlConnectionAttemptClassification = {
	owner: 'roblourens';
	comment: 'User-local Mission Control connection attempts, including inventory validation and the end-to-end deadline.';
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Success, failure, caller cancellation or the user-local connection deadline.' };
	stage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Environment validation or delegated relay connection.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds for the complete attempt, including environment validation.' };
};

function isHost(value: unknown): value is IMissionControlHost {
	const host = value as Partial<IMissionControlHost> | undefined;
	return isObject(host)
		&& typeof host.id === 'string' && /^[A-Za-z0-9_-]+$/.test(host.id)
		&& typeof host.name === 'string' && !!host.name.trim()
		&& host.kind === 'user-local' && typeof host.status === 'string'
		&& (host.displayName === undefined || typeof host.displayName === 'string');
}

export class MissionControlEnvironmentService extends Disposable implements IMissionControlEnvironmentService {
	declare readonly _serviceBrand: undefined;
	readonly hosts = observableValue<readonly IMissionControlHost[]>(this, []);
	private _accountKey: string | undefined;
	private _ownEnvironment: string | undefined;
	private _generation = 0;
	private _refreshGeneration = 0;
	private _initializing: Promise<void> | undefined;
	private readonly _connects = this._register(new DisposableMap<string, CancellationTokenSource>());
	private readonly _pendingConnects = new Map<string, Promise<void>>();

	constructor(
		@ICloudSandboxApiService private readonly _api: ICloudSandboxApiService,
		@ICloudSandboxAgentHostService private readonly _connections: ICloudSandboxAgentHostService,
		@IAgentHostService private readonly _local: IAgentHostService,
		@IStorageService private readonly _storage: IStorageService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
		@IChatEntitlementService private readonly _entitlement: IChatEntitlementService,
		@ILogService private readonly _log: ILogService,
		@IAuthenticationService authentication: IAuthenticationService,
		@IRemoteAgentHostService private readonly _remote: IRemoteAgentHostService,
		@ITelemetryService private readonly _telemetry: ITelemetryService,
	) {
		super();
		this._register(toDisposable(() => this._withdraw()));
		this._register(_api.onDidChangeAccount(account => {
			if (account !== this._accountKey) {
				this._withdraw();
				void this.refresh(CancellationToken.None).catch(error => this._reportBackgroundError(error));
			}
		}));
		this._register(authentication.onDidChangeSessions(e => {
			if (e.event.removed?.some(session => JSON.stringify([e.providerId, session.account.id]) === this._accountKey)
				&& ![...(e.event.added ?? []), ...(e.event.changed ?? [])].some(session => JSON.stringify([e.providerId, session.account.id]) === this._accountKey)) {
				this._withdraw();
			}
		}));
		const updateEnabled = () => {
			if (!this.enabled) {
				this._withdraw();
			} else {
				void this.refresh(CancellationToken.None).catch(error => this._reportBackgroundError(error));
			}
		};
		this._register(_configuration.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsEnabledSettingId) || e.affectsConfiguration('chat.disableAIFeatures')) {
				updateEnabled();
			}
		}));
		this._register(_entitlement.onDidChangeSentiment(updateEnabled));
		this._register(_storage.onDidChangeValue(StorageScope.PROFILE, undefined, this._store)(e => {
			if (this._accountKey && e.key.startsWith(this._storagePrefix)) {
				this._restore();
			}
		}));
	}

	get accountKey(): string | undefined { return this._accountKey; }
	get enabled(): boolean {
		return !this._entitlement.sentiment.hidden
			&& this._configuration.getValue<boolean>('chat.disableAIFeatures') !== true
			&& this._configuration.getValue<boolean>(RemoteAgentHostsEnabledSettingId) === true;
	}

	private get _storagePrefix(): string { return `${INVENTORY_PREFIX}${encodeURIComponent(this._accountKey!)}.`; }

	initialize(): Promise<void> {
		if (!this.enabled || this._store.isDisposed) {
			return Promise.resolve();
		}
		if (!this._initializing) {
			const generation = this._generation;
			const promise = this._initialize(generation);
			this._initializing = promise;
			void promise.finally(() => {
				if (this._initializing === promise) {
					this._initializing = undefined;
				}
			}).catch(error => this._reportBackgroundError(error));
		}
		return this._initializing;
	}

	private async _initialize(generation: number): Promise<void> {
		const account = await this._api.getAccountKey();
		const own = await this._local.getMissionControlEnvironmentId?.();
		this._checkGeneration(generation);
		if (account !== this._accountKey) {
			this._withdraw();
			this._accountKey = account;
			this._ownEnvironment = own;
			if (account) {
				this._restore();
			}
		} else if (own !== this._ownEnvironment) {
			this._ownEnvironment = own;
			this._replaceHosts(this.hosts.get().filter(host => host.id !== own));
		}
	}

	async refresh(token: CancellationToken): Promise<void> {
		if (!this.enabled) {
			return;
		}
		await raceCancellationError(this.initialize(), token);
		if (!this._accountKey) {
			return;
		}
		const generation = this._generation;
		const refreshGeneration = ++this._refreshGeneration;
		const account = this._accountKey;
		const environments = await this._api.listEnvironments(token, { refresh: true });
		const own = await this._local.getMissionControlEnvironmentId?.();
		const currentAccount = await this._api.getAccountKey();
		this._checkGeneration(generation, token);
		if (account !== currentAccount || refreshGeneration !== this._refreshGeneration) {
			throw new CancellationError();
		}
		this._ownEnvironment = own;
		const previous = new Map(this.hosts.get().map(host => [host.id, host]));
		const next = new Map<string, IMissionControlHost>();
		for (const environment of environments) {
			if (environment.kind === 'user-local' && environment.id !== this._ownEnvironment) {
				const retained = previous.get(environment.id);
				next.set(environment.id, {
					id: environment.id, name: environment.name, kind: 'user-local', status: environment.status,
					displayName: retained?.displayName,
				});
			}
		}
		this._replaceHosts([...next.values()]);
		this._persist();
	}

	async connect(id: string, token: CancellationToken): Promise<void> {
		const pending = this._pendingConnects.get(id);
		if (pending) {
			await raceCancellationError(pending, token);
			return;
		}
		const connection = this._connect(id, token);
		this._pendingConnects.set(id, connection);
		try {
			await connection;
		} finally {
			if (this._pendingConnects.get(id) === connection) {
				this._pendingConnects.delete(id);
			}
		}
	}

	private async _connect(id: string, token: CancellationToken): Promise<void> {
		const watch = StopWatch.create(false);
		let outcome: MissionControlConnectionAttemptEvent['outcome'] = 'success';
		const operation = new DisposableStore();
		const source = operation.add(new CancellationTokenSource(token));
		let timedOut = false;
		let connecting = false;
		let joiningRecovery = false;
		operation.add(disposableTimeout(() => {
			timedOut = true;
			source.cancel();
		}, CONNECT_TIMEOUT_MS));
		try {
			await raceCancellationError(this.initialize(), source.token);
			const host = this._requireHost(id);
			const generation = this._generation;
			this._connects.set(id, source);
			const reuseConnection = async (): Promise<boolean> => {
				const connection = this._remote.connections.find(connection => connection.address === cloudSandboxAddress(id));
				if (!connection || (connection.status.kind !== 'connected' && connection.status.kind !== 'connecting' && connection.status.kind !== 'reconnecting')) {
					return false;
				}
				connecting = true;
				joiningRecovery = true;
				if (connection.status.kind !== 'connected') {
					await raceCancellationError(this._remote.waitForConnection(connection.address), source.token);
				}
				this._checkGeneration(generation, source.token);
				this._requireHost(id);
				return true;
			};
			if (await reuseConnection()) {
				return;
			}
			const environment = await raceCancellationError(this._api.getEnvironment(id, source.token), source.token);
			const account = await raceCancellationError(this._api.getAccountKey(), source.token);
			this._checkGeneration(generation, source.token);
			this._requireHost(id);
			if (account !== this._accountKey || environment.id !== id) {
				throw new CancellationError();
			}
			if (environment.status !== 'online') {
				throw new Error(localize('missionControl.hostOffline', "{0} is not online. Start its owning application before connecting. Connecting will not start or replace this machine.", host.displayName ?? host.name));
			}
			if (await reuseConnection()) {
				return;
			}
			if (this._remote.connections.some(connection => connection.address === cloudSandboxAddress(id))) {
				await raceCancellationError(this._connections.disconnect(id), source.token);
				this._checkGeneration(generation, source.token);
				this._requireHost(id);
			}
			connecting = true;
			await raceCancellationError(this._connections.connect({ environmentId: id, name: host.name, environmentKind: 'user-local' }, source.token), source.token);
			this._checkGeneration(generation, source.token);
			this._requireHost(id);
		} catch (error) {
			outcome = timedOut ? 'timeout' : isCancellationError(error) || token.isCancellationRequested ? 'cancelled' : 'failure';
			if (outcome !== 'cancelled') {
				const message = `[MissionControl] Connection ${outcome}; stage=${connecting ? 'connection' : 'environment'} durationMs=${watch.elapsed()}`;
				this._log.warn(timedOut ? message : `${message}: ${formatConnectionDiagnosticError(getConnectionDiagnosticError(error))}`);
			}
			if (timedOut) {
				if (connecting && !joiningRecovery && this._connects.get(id) === source) {
					await this._connections.disconnect(id);
				}
				throw new Error(localize('missionControl.connectTimedOut', "Connecting to the environment timed out. Ensure its owning application is running, then reconnect."));
			}
			throw error;
		} finally {
			if (this._connects.get(id) === source) {
				this._connects.deleteAndDispose(id);
			}
			operation.dispose();
			this._telemetry.publicLog2<MissionControlConnectionAttemptEvent, MissionControlConnectionAttemptClassification>('missionControlConnectionAttempt', {
				outcome,
				stage: connecting ? 'connection' : 'environment',
				durationMs: watch.elapsed(),
			});
		}
	}

	async disconnect(id: string): Promise<void> {
		this._cancelConnect(id);
		await this._connections.disconnect(id);
	}

	setDisplayName(id: string, name: string | undefined): void {
		this._requireHost(id);
		const key = `${this._storagePrefix}${id}.displayName`;
		const value = name?.trim() || undefined;
		if (value === undefined) {
			this._storage.remove(key, StorageScope.PROFILE);
		} else {
			this._storage.store(key, value, StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		this._restore();
	}

	private _requireHost(id: string): IMissionControlHost {
		const host = this.hosts.get().find(host => host.id === id);
		if (!this.enabled || !this._accountKey || !host) {
			throw new CancellationError();
		}
		return host;
	}

	private _persist(): void {
		if (this._accountKey) {
			const entries: IStorageEntry[] = this.hosts.get().map(host => ({
				key: `${this._storagePrefix}${host.id}.metadata`,
				value: JSON.stringify({ id: host.id, name: host.name, kind: 'user-local', status: host.status }),
				scope: StorageScope.PROFILE,
				target: StorageTarget.MACHINE,
			}));
			const currentKeys = new Set(entries.map(entry => entry.key));
			for (const key of this._storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE)) {
				if (key.startsWith(this._storagePrefix) && key.endsWith('.metadata') && !currentKeys.has(key)) {
					entries.push({ key, value: undefined, scope: StorageScope.PROFILE, target: StorageTarget.MACHINE });
				}
			}
			this._storage.storeAll(entries, false);
		}
	}

	private _restore(): void {
		try {
			const hosts: IMissionControlHost[] = [];
			for (const key of this._storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE)) {
				if (!key.startsWith(this._storagePrefix) || !key.endsWith('.metadata')) {
					continue;
				}
				const host: unknown = JSON.parse(this._storage.get(key, StorageScope.PROFILE)!);
				if (!isHost(host) || key !== `${this._storagePrefix}${host.id}.metadata`) {
					throw new Error('Invalid Mission Control host inventory.');
				}
				if (host.id !== this._ownEnvironment) {
					hosts.push({
						id: host.id, name: host.name, kind: 'user-local', status: host.status,
						displayName: this._storage.get(`${this._storagePrefix}${host.id}.displayName`, StorageScope.PROFILE),
					});
				}
			}
			this._replaceHosts(hosts);
		} catch (error) {
			this._log.error('Failed to restore Mission Control host inventory', error);
		}
	}

	private _replaceHosts(hosts: readonly IMissionControlHost[]): void {
		const visible = new Set(hosts.map(host => host.id));
		for (const previous of this.hosts.get()) {
			if (!visible.has(previous.id)) {
				void this.disconnect(previous.id).catch(error => this._log.error('Failed to withdraw Mission Control host', error));
			}
		}
		this.hosts.set(hosts, undefined);
	}

	private _checkGeneration(generation: number, token = CancellationToken.None): void {
		if (generation !== this._generation || token.isCancellationRequested || !this.enabled || this._store.isDisposed) {
			throw new CancellationError();
		}
	}

	private _cancelConnect(id: string): void {
		this._connects.get(id)?.cancel();
		this._connects.deleteAndDispose(id);
		this._pendingConnects.delete(id);
	}

	private _withdraw(): void {
		this._generation++;
		this._initializing = undefined;
		for (const host of this.hosts.get()) {
			this._cancelConnect(host.id);
			void this._connections.disconnect(host.id).catch(error => this._log.error('Failed to withdraw Mission Control host', error));
		}
		this._accountKey = undefined;
		this.hosts.set([], undefined);
	}

	private _reportBackgroundError(error: unknown): void {
		if (!isCancellationError(error)) {
			this._log.warn('Mission Control host discovery failed; retaining cached hosts', error);
		}
	}
}
