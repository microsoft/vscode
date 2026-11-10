/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Sequencer } from '../../../../../base/common/async.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, observableSignal, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { supportsAgentHostGitHubEnvironment } from '../../../../../platform/agentHost/common/meta/agentHostGitHubEnvironmentMeta.js';
import { GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlEnvironmentService, IRemoteGitHubEnvironmentShare, IRemoteGitHubEnvironmentSharingService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import type { InitializeResult } from '../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { getGitHubEnvironmentAuthentication, getGitHubEnvironmentSessions } from './gitHubEnvironmentAccount.js';

const sharesStorageKey = 'agentHost.remoteGitHubEnvironments.shared';
const pendingUnregistrationsStorageKey = 'agentHost.remoteGitHubEnvironments.pendingUnregister';
const shareableEntryTypes: ReadonlySet<RemoteAgentHostEntryType> = new Set([RemoteAgentHostEntryType.SSH, RemoteAgentHostEntryType.WSL, RemoteAgentHostEntryType.Tunnel]);

interface IStoredShare {
	readonly accountId: string;
	readonly environmentId?: string;
}

interface IShareStatus {
	readonly state: 'connecting' | 'error';
	readonly error?: string;
}

type IGitHubEnvironmentConnection = IAgentConnection & Required<Pick<IAgentConnection, 'registerGitHubEnvironment' | 'unregisterGitHubEnvironment'>>;

function isGitHubEnvironmentConnection(connection: IAgentConnection): connection is IGitHubEnvironmentConnection {
	return !!connection.registerGitHubEnvironment && !!connection.unregisterGitHubEnvironment;
}

function setEquals<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
	return a.size === b.size && [...a].every(value => b.has(value));
}

/**
 * Registers remote agent hosts as GitHub environments with this window's
 * GitHub account. A registration lives in the remote agent host process, so
 * the remote stays shared while this window is disconnected; this service
 * registers again with a fresh credential after each (re)connection.
 */
export class RemoteGitHubEnvironmentSharingService extends Disposable implements IRemoteGitHubEnvironmentSharingService {
	declare readonly _serviceBrand: undefined;

	private readonly _stored = observableValue<ReadonlyMap<string, IStoredShare>>(this, new Map());
	private readonly _status = observableValue<ReadonlyMap<string, IShareStatus>>(this, new Map());
	private readonly _pendingUnregistrations = new Map<string, string>();
	/** The handshake each address was last synchronized for; a new handshake means a reconnected or restarted host. */
	private readonly _synced = new Map<string, InitializeResult>();
	private readonly _queue = new Sequencer();
	private readonly _sync = this._register(new RunOnceScheduler(() => {
		void this._queue.queue(() => this._doSync()).catch(error => this._logService.error('[RemoteGitHubEnvironments] Synchronization failed', error));
	}, 0));
	private readonly _gate = observableSignal(this);
	private readonly _enabled: IObservable<boolean>;
	private readonly _connections: IObservable<ReadonlyMap<string, IGitHubEnvironmentConnection>>;

	readonly shareable: IObservable<ReadonlySet<string>>;
	readonly shares: IObservable<ReadonlyMap<string, IRemoteGitHubEnvironmentShare>>;
	readonly environmentIds: IObservable<ReadonlySet<string>>;

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IMissionControlEnvironmentService private readonly _environmentService: IMissionControlEnvironmentService,
		@IMissionControlAvailabilityService availabilityService: IMissionControlAvailabilityService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@IProductService private readonly _productService: IProductService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._stored.set(this._readStored(), undefined);
		for (const [address, accountId] of Object.entries(this._readRecord(pendingUnregistrationsStorageKey))) {
			if (typeof accountId === 'string') {
				this._pendingUnregistrations.set(address, accountId);
			}
		}

		this._enabled = derived(this, reader => {
			this._gate.read(reader);
			availabilityService.available.read(reader);
			return this._environmentService.enabled;
		});
		const connectionsChanged = observableSignalFromEvent(this, this._remoteAgentHostService.onDidChangeConnections);
		const entriesChanged = observableSignalFromEvent(this, this._remoteAgentHostService.onDidChangeConfiguredEntries);
		this._connections = derived(this, reader => {
			connectionsChanged.read(reader);
			entriesChanged.read(reader);
			const result = new Map<string, IGitHubEnvironmentConnection>();
			for (const { address, status } of this._remoteAgentHostService.connections) {
				const type = this._remoteAgentHostService.getEntryByAddress(address)?.connection.type;
				const connection = this._remoteAgentHostService.getConnection(address);
				if (RemoteAgentHostConnectionStatus.isConnected(status) && type !== undefined && shareableEntryTypes.has(type)
					&& connection && isGitHubEnvironmentConnection(connection) && supportsAgentHostGitHubEnvironment(connection.initializeResult.read(reader))) {
					result.set(address, connection);
				}
			}
			return result;
		});
		this.shareable = derivedOpts<ReadonlySet<string>>({ owner: this, equalsFn: setEquals }, reader => this._enabled.read(reader) ? new Set(this._connections.read(reader).keys()) : new Set());
		this.shares = derived(this, reader => {
			const status = this._status.read(reader);
			const result = new Map<string, IRemoteGitHubEnvironmentShare>();
			for (const [address, share] of this._stored.read(reader)) {
				result.set(address, { state: 'enabled', environmentId: share.environmentId, ...status.get(address) });
			}
			for (const [address, addressStatus] of status) {
				if (!result.has(address)) {
					result.set(address, addressStatus);
				}
			}
			return result;
		});
		// Only remotes that are still configured hide their environment, so removing one elsewhere keeps the environment reachable.
		this.environmentIds = derivedOpts<ReadonlySet<string>>({ owner: this, equalsFn: setEquals }, reader => {
			entriesChanged.read(reader);
			const result = new Set<string>();
			for (const [address, share] of this._stored.read(reader)) {
				if (share.environmentId !== undefined && this._remoteAgentHostService.getEntryByAddress(address)) {
					result.add(share.environmentId);
				}
			}
			return result;
		});

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsEnabledSettingId) || e.affectsConfiguration(GitHubEnvironmentsEnabledSettingId) || e.affectsConfiguration('chat.disableAIFeatures')) {
				this._gate.trigger(undefined);
			}
		}));
		this._register(entitlementService.onDidChangeSentiment(() => this._gate.trigger(undefined)));
		let wasEnabled: boolean | undefined;
		this._register(autorun(reader => {
			const enabled = this._enabled.read(reader);
			this._connections.read(reader);
			if (enabled !== wasEnabled) {
				wasEnabled = enabled;
				this._synced.clear();
			}
			this._sync.schedule();
		}));
		const { providerId } = getGitHubEnvironmentAuthentication(this._productService);
		this._register(this._authenticationService.onDidChangeSessions(e => {
			if (e.providerId === providerId) {
				this._resync();
			}
		}));
		this._register(this._defaultAccountService.onDidChangeDefaultAccount(() => this._resync()));
	}

	setShared(address: string, shared: boolean): Promise<void> {
		return this._queue.queue(() => shared ? this._share(address) : this._unshare(address));
	}

	private async _share(address: string): Promise<void> {
		const connection = this._connections.get().get(address);
		if (!this._enabled.get() || !connection) {
			throw new Error(localize('remoteGitHubEnvironment.unavailable', "Connect to this remote to share it as a GitHub environment."));
		}
		this._setStatus(address, { state: 'connecting' });
		try {
			const session = await this._getSession(true);
			const previousAccountId = this._stored.get().get(address)?.accountId ?? this._pendingUnregistrations.get(address);
			if (previousAccountId !== undefined && previousAccountId !== session.account.id) {
				await connection.unregisterGitHubEnvironment(previousAccountId);
			}
			this._setPendingUnregistration(address, undefined);
			await this._registerConnection(address, connection, session);
		} finally {
			this._setStatus(address, undefined);
		}
	}

	private async _unshare(address: string): Promise<void> {
		const share = this._stored.get().get(address);
		this._setStatus(address, undefined);
		if (!share) {
			return;
		}
		this._setStored(address, undefined);
		this._synced.delete(address);
		await this._unregister(address, share.accountId);
	}

	private _resync(): void {
		this._synced.clear();
		this._sync.schedule();
	}

	private async _doSync(): Promise<void> {
		const connections = this._connections.get();
		for (const [address, accountId] of [...this._pendingUnregistrations]) {
			const connection = connections.get(address);
			if (connection && !this._stored.get().has(address)) {
				try {
					await connection.unregisterGitHubEnvironment(accountId);
					this._setPendingUnregistration(address, undefined);
				} catch (error) {
					this._logService.warn('[RemoteGitHubEnvironments] Failed to unregister a remote agent host', address, error);
				}
			}
		}
		const enabled = this._enabled.get();
		for (const [address, share] of this._stored.get()) {
			const connection = connections.get(address);
			const initializeResult = connection?.initializeResult.get();
			if (!connection || !initializeResult || this._synced.get(address) === initializeResult) {
				continue;
			}
			this._synced.set(address, initializeResult);
			if (!enabled) {
				// Keep the user's choice, but withdraw the registration while GitHub environments are unavailable.
				await connection.unregisterGitHubEnvironment(share.accountId).catch(error => this._logService.warn('[RemoteGitHubEnvironments] Failed to withdraw a remote agent host', address, error));
				continue;
			}
			try {
				const session = await this._getSession(false);
				if (session.account.id !== share.accountId) {
					this._logService.info('[RemoteGitHubEnvironments] Stopped sharing a remote agent host because the GitHub account changed', address);
					this._setStored(address, undefined);
					this._setStatus(address, undefined);
					await this._unregister(address, share.accountId);
					continue;
				}
				await this._registerConnection(address, connection, session);
				this._setStatus(address, undefined);
			} catch (error) {
				this._logService.warn('[RemoteGitHubEnvironments] Failed to register a remote agent host', address, error);
				this._setStatus(address, { state: 'error', error: toErrorMessage(error) });
			}
		}
	}

	private async _registerConnection(address: string, connection: IGitHubEnvironmentConnection, session: AuthenticationSession): Promise<void> {
		const initializeResult = connection.initializeResult.get();
		const registration = await connection.registerGitHubEnvironment(session.account.id, session.accessToken);
		this._setStored(address, { accountId: session.account.id, environmentId: registration.environmentId });
		if (initializeResult) {
			this._synced.set(address, initializeResult);
		}
	}

	private async _unregister(address: string, accountId: string): Promise<void> {
		const connection = this._connections.get().get(address);
		if (connection) {
			try {
				await connection.unregisterGitHubEnvironment(accountId);
				return;
			} catch (error) {
				this._logService.warn('[RemoteGitHubEnvironments] Failed to unregister a remote agent host; retrying after the next connection', address, error);
			}
		}
		this._setPendingUnregistration(address, accountId);
	}

	private async _getSession(interactive: boolean): Promise<AuthenticationSession> {
		const defaultAccount = await this._defaultAccountService.getDefaultAccount();
		const sessions = await getGitHubEnvironmentSessions(this._authenticationService, this._productService, defaultAccount, () => interactive && !this._store.isDisposed);
		if (new Set(sessions.map(session => session.account.id)).size !== 1) {
			throw new Error(localize('remoteGitHubEnvironment.accountRequired', "Select a GitHub account for Copilot and sign in with the required permissions to share this remote as a GitHub environment."));
		}
		return sessions[0];
	}

	private _setStatus(address: string, status: IShareStatus | undefined): void {
		const current = this._status.get();
		if (current.get(address) === status) {
			return;
		}
		const next = new Map(current);
		if (status) {
			next.set(address, status);
		} else {
			next.delete(address);
		}
		this._status.set(next, undefined);
	}

	private _setStored(address: string, share: IStoredShare | undefined): void {
		const next = new Map(this._stored.get());
		if (share) {
			next.set(address, share);
		} else if (!next.delete(address)) {
			return;
		}
		this._stored.set(next, undefined);
		this._writeRecord(sharesStorageKey, Object.fromEntries(next));
	}

	private _setPendingUnregistration(address: string, accountId: string | undefined): void {
		if (accountId === undefined ? !this._pendingUnregistrations.delete(address) : this._pendingUnregistrations.get(address) === accountId) {
			return;
		}
		if (accountId !== undefined) {
			this._pendingUnregistrations.set(address, accountId);
		}
		this._writeRecord(pendingUnregistrationsStorageKey, Object.fromEntries(this._pendingUnregistrations));
	}

	private _readStored(): Map<string, IStoredShare> {
		const result = new Map<string, IStoredShare>();
		for (const [address, value] of Object.entries(this._readRecord(sharesStorageKey))) {
			if (value && typeof value === 'object' && typeof (value as IStoredShare).accountId === 'string') {
				const { accountId, environmentId } = value as IStoredShare;
				result.set(address, typeof environmentId === 'string' ? { accountId, environmentId } : { accountId });
			}
		}
		return result;
	}

	private _readRecord(key: string): Record<string, unknown> {
		try {
			const value: unknown = JSON.parse(this._storageService.get(key, StorageScope.APPLICATION, '{}'));
			return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
		} catch {
			return {};
		}
	}

	private _writeRecord(key: string, record: Record<string, unknown>): void {
		if (Object.keys(record).length) {
			this._storageService.store(key, JSON.stringify(record), StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(key, StorageScope.APPLICATION);
		}
	}
}
