/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout, RunOnceScheduler, Sequencer } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mapsStrictEqualIgnoreOrder } from '../../../../../base/common/map.js';
import { autorun, derived, derivedOpts, IObservable, observableSignal, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import type { IAgentHostGitHubEnvironmentStatus } from '../../../../../platform/agentHost/common/meta/agentHostGitHubEnvironmentMeta.js';
import { GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlEnvironmentService, IRemoteGitHubEnvironmentShare, IRemoteGitHubEnvironmentSharingService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import type { InitializeResult } from '../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { getGitHubEnvironmentAuthentication, getGitHubEnvironmentSessions, GitHubEnvironmentAccountUnavailableError } from './gitHubEnvironmentAccount.js';

const sharesStorageKey = 'agentHost.remoteGitHubEnvironments.shared';
const pendingUnregistrationsStorageKey = 'agentHost.remoteGitHubEnvironments.pendingUnregister';
const shareableEntryTypes: ReadonlySet<RemoteAgentHostEntryType> = new Set([RemoteAgentHostEntryType.SSH, RemoteAgentHostEntryType.WSL, RemoteAgentHostEntryType.Tunnel]);

interface IStoredShare {
	readonly accountId: string;
	readonly environmentId?: string;
	/** The agent host process holding the registration; without it, a missing registration was lost rather than removed by another client. */
	readonly instanceId?: string;
}

interface IShareStatus {
	readonly state: 'connecting' | 'error';
	readonly error?: string;
}

/** This window's GitHub account, or why it is missing; `signedOut` distinguishes a removed account from a failed lookup. */
type IAccountResult = { readonly session: AuthenticationSession } | { readonly session?: undefined; readonly error: unknown; readonly signedOut: boolean };

type IGitHubEnvironmentConnection = IAgentConnection & Required<Pick<IAgentConnection, 'registerGitHubEnvironment' | 'unregisterGitHubEnvironment' | 'gitHubEnvironment'>>;

function isGitHubEnvironmentConnection(connection: IAgentConnection): connection is IGitHubEnvironmentConnection {
	return !!connection.registerGitHubEnvironment && !!connection.unregisterGitHubEnvironment && !!connection.gitHubEnvironment;
}

function setEquals<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
	return a.size === b.size && [...a].every(value => b.has(value));
}

function createStoredShare(accountId: string, environmentId: string | undefined, instanceId: string | undefined): IStoredShare {
	return { accountId, ...(environmentId !== undefined ? { environmentId } : {}), ...(instanceId !== undefined ? { instanceId } : {}) };
}

/**
 * Describes a connected remote's share from the registration its agent host reports, or `undefined` if it is not shared.
 */
function getHostShare(host: IAgentHostGitHubEnvironmentStatus, stored: IStoredShare | undefined, accountId: string | undefined): IRemoteGitHubEnvironmentShare | undefined {
	if (host.registration) {
		return host.registration.accountId === stored?.accountId || host.registration.accountId === accountId
			? { state: 'enabled', environmentId: host.registration.environmentId }
			: { state: 'unavailable', unavailableReason: 'account' };
	}
	if (host.registeredByHost) {
		return { state: 'unavailable', unavailableReason: 'host' };
	}
	// Another client stopped sharing if the registration is missing from the process that held it; otherwise it is registered again.
	return stored && stored.instanceId !== host.instanceId ? { state: 'enabled', environmentId: stored.environmentId } : undefined;
}

/**
 * Registers remote agent hosts as GitHub environments with this window's
 * GitHub account. A registration lives in the remote agent host process, so
 * the remote stays shared while this window is disconnected; this service
 * registers again with a fresh credential after each (re)connection. The
 * status each agent host reports shows registrations made or removed by other
 * clients, and reveals a restart that lost the registration.
 */
export class RemoteGitHubEnvironmentSharingService extends Disposable implements IRemoteGitHubEnvironmentSharingService {
	declare readonly _serviceBrand: undefined;

	private readonly _stored = observableValue<ReadonlyMap<string, IStoredShare>>(this, new Map());
	private readonly _status = observableValue<ReadonlyMap<string, IShareStatus>>(this, new Map());
	/** This window's GitHub account, which identifies registrations made from other computers as its own. */
	private readonly _accountId = observableValue<string | undefined>(this, undefined);
	/** Whether this window resolved a GitHub account before, so that a missing account means it signed out rather than that authentication is still starting. */
	private _hadAccount = false;
	private readonly _pendingUnregistrations = new Map<string, string>();
	/** The handshake each address was last synchronized for; a new handshake means a restarted host. */
	private readonly _synced = new Map<string, InitializeResult>();
	/** Incremented when the gate or account changes, so that work started before does not mark remotes synchronized. */
	private _generation = 0;
	/** Shares another window added whose registration this window's connection has not reported yet. */
	private readonly _adopted = new Set<string>();
	private readonly _keepSharingHandlers = new Set<(address: string, environmentId: string) => void>();
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
		@IDialogService private readonly _dialogService: IDialogService,
	) {
		super();
		this._stored.set(this._readStored(), undefined);
		this._readPendingUnregistrations();

		this._enabled = derived(this, reader => {
			this._gate.read(reader);
			availabilityService.available.read(reader);
			return this._environmentService.enabled;
		});
		const connectionsChanged = observableSignalFromEvent(this, this._remoteAgentHostService.onDidChangeConnections);
		const entriesChanged = observableSignalFromEvent(this, this._remoteAgentHostService.onDidChangeConfiguredEntries);
		this._connections = derivedOpts<Map<string, IGitHubEnvironmentConnection>>({ owner: this, equalsFn: mapsStrictEqualIgnoreOrder }, reader => {
			connectionsChanged.read(reader);
			entriesChanged.read(reader);
			const result = new Map<string, IGitHubEnvironmentConnection>();
			for (const { address, status } of this._remoteAgentHostService.connections) {
				const type = this._remoteAgentHostService.getEntryByAddress(address)?.connection.type;
				const connection = this._remoteAgentHostService.getConnection(address);
				if (RemoteAgentHostConnectionStatus.isConnected(status) && type !== undefined && shareableEntryTypes.has(type)
					&& connection && isGitHubEnvironmentConnection(connection) && connection.gitHubEnvironment.read(reader) !== undefined) {
					result.set(address, connection);
				}
			}
			return result;
		});
		this.shareable = derivedOpts<ReadonlySet<string>>({ owner: this, equalsFn: setEquals }, reader => this._enabled.read(reader) ? new Set(this._connections.read(reader).keys()) : new Set());
		this.shares = derived(this, reader => {
			const stored = this._stored.read(reader);
			const accountId = this._accountId.read(reader);
			const result = new Map<string, IRemoteGitHubEnvironmentShare>();
			for (const [address, share] of stored) {
				result.set(address, { state: 'enabled', environmentId: share.environmentId });
			}
			for (const [address, connection] of this._connections.read(reader)) {
				const host = connection.gitHubEnvironment.read(reader);
				const share = host && getHostShare(host, stored.get(address), accountId);
				if (share) {
					result.set(address, share);
				} else if (host) {
					result.delete(address);
				}
			}
			for (const [address, status] of this._status.read(reader)) {
				const environmentId = result.get(address)?.environmentId;
				result.set(address, environmentId !== undefined ? { ...status, environmentId } : status);
			}
			return result;
		});
		// Only remotes that are still configured hide their environment, so removing one elsewhere keeps the environment reachable.
		this.environmentIds = derivedOpts<ReadonlySet<string>>({ owner: this, equalsFn: setEquals }, reader => {
			entriesChanged.read(reader);
			const result = new Set<string>();
			for (const [address, share] of this.shares.read(reader)) {
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
			const connections = this._connections.read(reader);
			for (const connection of connections.values()) {
				connection.initializeResult.read(reader);
				connection.gitHubEnvironment.read(reader);
			}
			// A protocol reconnect keeps the handshake, so a remote synchronizes again whenever it returns to the connected set.
			for (const address of [...this._synced.keys()]) {
				if (!connections.has(address)) {
					this._synced.delete(address);
				}
			}
			if (enabled !== wasEnabled) {
				wasEnabled = enabled;
				this._invalidate();
			}
			this._sync.schedule();
		}));
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, sharesStorageKey, this._store)(e => {
			if (e.external) {
				this._reloadStored();
			}
		}));
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, pendingUnregistrationsStorageKey, this._store)(e => {
			if (e.external) {
				this._readPendingUnregistrations();
				this._sync.schedule();
			}
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

	registerKeepSharingHandler(handler: (address: string, environmentId: string) => void): IDisposable {
		this._keepSharingHandlers.add(handler);
		return toDisposable(() => this._keepSharingHandlers.delete(handler));
	}

	async confirmDisconnect(address: string, name: string): Promise<boolean> {
		const share = this.shares.get().get(address);
		if (!this._enabled.get() || !share || share.state === 'unavailable') {
			return true;
		}
		const { result } = await this._dialogService.prompt<boolean>({
			type: 'question',
			message: localize('remoteGitHubEnvironment.keepSharing', "Keep sharing '{0}' as a GitHub environment?", name),
			detail: localize('remoteGitHubEnvironment.keepSharingDetail', "If you keep sharing it, its agent host keeps running, and this and other applications that support GitHub environments can still use it. If you stop sharing it, those applications can no longer use it."),
			buttons: [
				{ label: localize({ key: 'remoteGitHubEnvironment.keepSharingButton', comment: ['&& denotes a mnemonic'] }, "&&Keep Sharing"), run: () => true },
				{ label: localize({ key: 'remoteGitHubEnvironment.stopSharingButton', comment: ['&& denotes a mnemonic'] }, "&&Stop Sharing"), run: () => false },
			],
			cancelButton: true,
		});
		if (result === undefined) {
			return false;
		}
		if (result) {
			// The environment replaces the remote in the GitHub environment list once the remote is disconnected.
			void this._environmentService.refresh(CancellationToken.None).catch(error => {
				if (!isCancellationError(error)) {
					this._logService.warn('[RemoteGitHubEnvironments] Failed to refresh GitHub environments after keeping a remote shared', error);
				}
			});
			if (share.environmentId !== undefined) {
				for (const handler of [...this._keepSharingHandlers]) {
					try {
						handler(address, share.environmentId);
					} catch (error) {
						this._logService.error('[RemoteGitHubEnvironments] Failed to continue sessions through a kept GitHub environment', error);
					}
				}
			}
			return true;
		}
		// Unregistering needs the connection; a slow host must not block the disconnect.
		await raceTimeout(this.setShared(address, false), 5000);
		return true;
	}

	private async _share(address: string): Promise<void> {
		if (!this._enabled.get() || !this._connections.get().has(address)) {
			throw this._unavailableError();
		}
		this._setStatus(address, { state: 'connecting' });
		try {
			const session = await this._getSession(true);
			// Signing in can take long enough for the remote or the gate to change.
			const connection = this._connections.get().get(address);
			if (!this._enabled.get() || !connection) {
				throw this._unavailableError();
			}
			const generation = this._generation;
			this._accountId.set(session.account.id, undefined);
			const previousAccountId = this._stored.get().get(address)?.accountId ?? this._pendingUnregistrations.get(address);
			if (previousAccountId !== undefined && previousAccountId !== session.account.id) {
				await connection.unregisterGitHubEnvironment(previousAccountId);
			}
			this._setPendingUnregistration(address, undefined);
			await this._registerConnection(address, connection, session, generation, false);
		} finally {
			this._setStatus(address, undefined);
		}
	}

	private _unavailableError(): Error {
		return new Error(localize('remoteGitHubEnvironment.unavailable', "Connect to this remote to share it as a GitHub environment."));
	}

	private async _unshare(address: string): Promise<void> {
		const share = this._stored.get().get(address);
		this._setStatus(address, undefined);
		if (share) {
			this._setStored(address, undefined);
			this._synced.delete(address);
			await this._unregister(address, share.accountId);
			return;
		}
		// Shared with this window's GitHub account from another computer.
		const connection = this._connections.get().get(address);
		const accountId = this._accountId.get();
		if (connection && accountId !== undefined && connection.gitHubEnvironment.get()?.registration?.accountId === accountId) {
			await this._unregister(address, accountId);
		}
	}

	private _resync(): void {
		this._invalidate();
		this._sync.schedule();
	}

	private _invalidate(): void {
		this._generation++;
		this._synced.clear();
	}

	private async _doSync(): Promise<void> {
		const generation = this._generation;
		const enabled = this._enabled.get();
		const account = enabled && (this._connections.get().size || this._stored.get().size) ? await this._resolveAccount() : undefined;
		if (generation !== this._generation) {
			// Superseded by the synchronization scheduled with the change.
			return;
		}
		this._accountId.set(account?.session?.account.id, undefined);
		if (account?.session || account?.signedOut) {
			for (const [address, share] of [...this._stored.get()]) {
				if (share.accountId === account.session?.account.id) {
					continue;
				}
				this._logService.info('[RemoteGitHubEnvironments] Stopped sharing a remote agent host because the GitHub account changed or signed out', address);
				this._forget(address);
				await this._unregister(address, share.accountId);
			}
		}
		for (const [address, pendingAccountId] of [...this._pendingUnregistrations]) {
			const connection = this._connections.get().get(address);
			const host = connection?.gitHubEnvironment.get();
			if (!connection || !host || this._stored.get().has(address)) {
				continue;
			}
			// A restart or another client may already have removed the registration.
			if (host.registration?.accountId === pendingAccountId) {
				try {
					await connection.unregisterGitHubEnvironment(pendingAccountId);
				} catch (error) {
					this._logService.warn('[RemoteGitHubEnvironments] Failed to unregister a remote agent host', address, error);
					continue;
				}
			}
			this._setPendingUnregistration(address, undefined);
		}
		for (const address of [...this._stored.get().keys()]) {
			if (generation !== this._generation) {
				return;
			}
			// Earlier iterations await requests, during which other windows and connections can change.
			let share = this._stored.get().get(address);
			const connection = this._connections.get().get(address);
			const host = connection?.gitHubEnvironment.get();
			const initializeResult = connection?.initializeResult.get();
			if (!share || !connection || !host || !initializeResult) {
				continue;
			}
			if (host.registration) {
				this._adopted.delete(address);
			}
			if (host.registration ? host.registration.accountId !== share.accountId : host.registeredByHost) {
				this._logService.info('[RemoteGitHubEnvironments] Stopped sharing a remote agent host because another account or the host registered it', address);
				this._forget(address);
				continue;
			}
			if (!host.registration && share.instanceId === host.instanceId) {
				if (this._adopted.has(address)) {
					// Another window's registration may be reported after its storage change.
					continue;
				}
				this._logService.info('[RemoteGitHubEnvironments] Stopped sharing a remote agent host because another client stopped sharing it', address);
				this._forget(address);
				continue;
			}
			if (host.registration && (host.registration.environmentId !== share.environmentId || host.instanceId !== share.instanceId)) {
				share = createStoredShare(share.accountId, host.registration.environmentId, host.instanceId);
				this._setStored(address, share);
			}
			if (this._synced.get(address) === initializeResult) {
				continue;
			}
			this._synced.set(address, initializeResult);
			if (!enabled) {
				// Keep the user's choice, but withdraw the registration while GitHub environments are unavailable.
				if (share.instanceId !== undefined) {
					this._setStored(address, createStoredShare(share.accountId, share.environmentId, undefined));
				}
				await connection.unregisterGitHubEnvironment(share.accountId).catch(error => this._logService.warn('[RemoteGitHubEnvironments] Failed to withdraw a remote agent host', address, error));
				continue;
			}
			if (!account?.session) {
				this._logService.warn('[RemoteGitHubEnvironments] Failed to register a remote agent host', address, account?.error);
				this._setStatus(address, { state: 'error', error: toErrorMessage(account?.error) });
				continue;
			}
			try {
				await this._registerConnection(address, connection, account.session, generation, true);
				this._setStatus(address, undefined);
			} catch (error) {
				this._logService.warn('[RemoteGitHubEnvironments] Failed to register a remote agent host', address, error);
				this._setStatus(address, { state: 'error', error: toErrorMessage(error) });
			}
		}
	}

	/** Forgets a share that is no longer this window's to manage, without unregistering it. */
	private _forget(address: string): void {
		this._setStored(address, undefined);
		this._setStatus(address, undefined);
		this._synced.delete(address);
	}

	/**
	 * Registers a remote with a fresh credential. A `background` registration
	 * renews an existing share, which another window may stop meanwhile.
	 */
	private async _registerConnection(address: string, connection: IGitHubEnvironmentConnection, session: AuthenticationSession, generation: number, background: boolean): Promise<void> {
		const initializeResult = connection.initializeResult.get();
		// Marked before the request: an invalidation while it runs must leave the remote to the next synchronization.
		if (initializeResult && generation === this._generation) {
			this._synced.set(address, initializeResult);
		}
		let registration;
		try {
			registration = await connection.registerGitHubEnvironment(session.account.id, session.accessToken);
		} catch (error) {
			// The host withdraws a failed registration, which must not look like another client stopped sharing.
			const share = this._stored.get().get(address);
			if (share?.instanceId !== undefined) {
				this._setStored(address, createStoredShare(share.accountId, share.environmentId, undefined));
			}
			throw error;
		}
		if (background && !this._stored.get().has(address)) {
			this._logService.info('[RemoteGitHubEnvironments] Withdrawing a registration that another window stopped sharing meanwhile', address);
			await this._unregister(address, session.account.id);
			return;
		}
		// The host reports its new status before it responds.
		this._setStored(address, createStoredShare(session.account.id, registration.environmentId, connection.gitHubEnvironment.get()?.instanceId));
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

	private async _resolveAccount(): Promise<IAccountResult> {
		try {
			return { session: await this._getSession(false) };
		} catch (error) {
			return { error, signedOut: this._hadAccount && error instanceof GitHubEnvironmentAccountUnavailableError };
		}
	}

	private async _getSession(interactive: boolean): Promise<AuthenticationSession> {
		const defaultAccount = await this._defaultAccountService.getDefaultAccount();
		const sessions = await getGitHubEnvironmentSessions(this._authenticationService, this._productService, defaultAccount, () => interactive && !this._store.isDisposed);
		const accountIds = new Set(sessions.map(session => session.account.id));
		if (accountIds.size !== 1) {
			const message = localize('remoteGitHubEnvironment.accountRequired', "Select a GitHub account for Copilot and sign in with the required permissions to share this remote as a GitHub environment.");
			throw accountIds.size ? new Error(message) : new GitHubEnvironmentAccountUnavailableError(message, 'signInRequired');
		}
		this._hadAccount = true;
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
		this._adopted.delete(address);
		const next = new Map(this._stored.get());
		if (share) {
			next.set(address, share);
		} else if (!next.delete(address)) {
			return;
		}
		this._stored.set(next, undefined);
		this._updateRecord(sharesStorageKey, address, share);
	}

	private _setPendingUnregistration(address: string, accountId: string | undefined): void {
		if (accountId === undefined ? !this._pendingUnregistrations.delete(address) : this._pendingUnregistrations.get(address) === accountId) {
			return;
		}
		if (accountId !== undefined) {
			this._pendingUnregistrations.set(address, accountId);
		}
		this._updateRecord(pendingUnregistrationsStorageKey, address, accountId);
	}

	private _readPendingUnregistrations(): void {
		this._pendingUnregistrations.clear();
		for (const [address, accountId] of Object.entries(this._readRecord(pendingUnregistrationsStorageKey))) {
			if (typeof accountId === 'string') {
				this._pendingUnregistrations.set(address, accountId);
			}
		}
	}

	private _readStored(): Map<string, IStoredShare> {
		const result = new Map<string, IStoredShare>();
		for (const [address, value] of Object.entries(this._readRecord(sharesStorageKey))) {
			if (value && typeof value === 'object' && typeof (value as IStoredShare).accountId === 'string') {
				const { accountId, environmentId, instanceId } = value as IStoredShare;
				result.set(address, createStoredShare(accountId, typeof environmentId === 'string' ? environmentId : undefined, typeof instanceId === 'string' ? instanceId : undefined));
			}
		}
		return result;
	}

	/** Adopts shares changed by another window, which registers the shares it adds itself. */
	private _reloadStored(): void {
		const previous = this._stored.get();
		const stored = this._readStored();
		for (const address of previous.keys()) {
			if (!stored.has(address)) {
				// Another window stopped sharing, which a background registration in flight must respect.
				this._adopted.delete(address);
				this._synced.delete(address);
				this._setStatus(address, undefined);
			}
		}
		for (const address of stored.keys()) {
			if (previous.has(address)) {
				continue;
			}
			this._adopted.add(address);
			// The other window registers the share, which a disabled window must still withdraw.
			const initializeResult = this._enabled.get() ? this._connections.get().get(address)?.initializeResult.get() : undefined;
			if (initializeResult) {
				this._synced.set(address, initializeResult);
			}
		}
		this._stored.set(stored, undefined);
		this._sync.schedule();
	}

	private _readRecord(key: string): Record<string, unknown> {
		try {
			const value: unknown = JSON.parse(this._storageService.get(key, StorageScope.APPLICATION, '{}'));
			return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
		} catch {
			return {};
		}
	}

	/** Updates one address, keeping the entries other windows wrote. */
	private _updateRecord(key: string, address: string, value: unknown): void {
		const record = new Map(Object.entries(this._readRecord(key)));
		if (value === undefined) {
			record.delete(address);
		} else {
			record.set(address, value);
		}
		if (record.size) {
			this._storageService.store(key, JSON.stringify(Object.fromEntries(record)), StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(key, StorageScope.APPLICATION);
		}
	}
}
