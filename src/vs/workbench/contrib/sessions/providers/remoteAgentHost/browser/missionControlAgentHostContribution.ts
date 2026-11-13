/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { localize } from '../../../../../../nls.js';
import { autorun, derived } from '../../../../../../base/common/observable.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { cloudSandboxAddress, cloudSandboxEnvironmentId } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IMissionControlEnvironmentService, IMissionControlSharingService, IRemoteGitHubEnvironmentSharingService } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, type IRemoteAgentHostEntry } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { EntryDrivenProviderContribution, type IEntryDrivenProviderOptions } from './entryDrivenProviderContribution.js';
import { IAgentHostFilterService } from '../../../common/agentHostFilter.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { ISessionsRecentWorkspacesService } from '../../../browser/sessionsRecentWorkspacesService.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { getRemoteAgentHostPickerKey } from './remoteAgentHostPickerVisibility.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISession } from '../../../../../services/sessions/common/session.js';

/** How long sessions wait to move between a shared remote's direct connection and its GitHub environment. */
const SESSION_HANDOFF_TIMEOUT = 2 * 60 * 1000;

interface IHandoffSession {
	readonly session: ISession;
	readonly backendSession: URI;
	/** The host chat resources of the session's chats, by their resources. */
	readonly backendChats: ResourceMap<URI>;
}

interface ISessionHandoff extends IDisposable {
	step(): void;
}

/** User-local MC hosts use the native provider, never the sandbox's task-history adapter. */
export class MissionControlAgentHostContribution extends EntryDrivenProviderContribution {
	static readonly ID = 'workbench.contrib.missionControlAgentHosts';
	protected readonly _entryType = RemoteAgentHostEntryType.CloudSandbox;
	protected get isWebPlatform(): boolean { return isWeb; }
	private readonly _pendingConnects = new Map<string, Promise<void>>();
	private _discovery: Promise<void> | undefined;
	/** Sessions moving between shared remotes' direct connections and their GitHub environments, by environment ID. */
	private readonly _handoffs = this._register(new DisposableMap<string, ISessionHandoff>());
	/** GitHub environments being disconnected because their remotes are connected directly again. */
	private readonly _returning = new Set<string>();

	constructor(
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@INotificationService notificationService: INotificationService,
		@IMissionControlEnvironmentService private readonly _inventory: IMissionControlEnvironmentService,
		@IAgentHostFilterService filterService: IAgentHostFilterService,
		@ILogService private readonly _logService: ILogService,
		@IUserDataProfileService private readonly _profileService: IUserDataProfileService,
		@ISessionsRecentWorkspacesService recentWorkspacesService: ISessionsRecentWorkspacesService,
		@IMissionControlSharingService sharingService: IMissionControlSharingService,
		@IStorageService private readonly _storageService: IStorageService,
		@IAgentHostConnectionsService private readonly _agentHostConnectionsService: IAgentHostConnectionsService,
		@IRemoteGitHubEnvironmentSharingService private readonly _remoteSharing: IRemoteGitHubEnvironmentSharingService,
	) {
		super(remoteAgentHostService, configurationService, instantiationService, sessionsProvidersService, notificationService);
		const updateProjects = () => sharingService.setProjectFolders(recentWorkspacesService
			.getRecentWorkspaces(true, true)
			.flatMap(recent => recent.workspace.folders.map(folder => folder.root))
			.filter(folder => folder.scheme === Schemas.file));
		this._register(recentWorkspacesService.onDidChangeRecentWorkspaces(updateProjects));
		this._register(sessionsProvidersService.onDidChangeProviders(updateProjects));
		updateProjects();
		this._register(remoteAgentHostService.onDidChangeConfiguredEntries(() => this._reconcile()));
		this._register(remoteAgentHostService.onDidChangeConnections(() => this._reconcile()));
		this._register(configurationService.onDidChangeConfiguration(e => {
			this._reconcile();
			if (e.affectsConfiguration(RemoteAgentHostAutoConnectSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				this._requestAutoConnections();
			}
		}));
		this._register(autorun(reader => {
			this._inventory.hosts.read(reader);
			this._inventory.discoveredOnlineHostIds.read(reader);
			this._inventory.ownEnvironmentId.read(reader);
			this._remoteSharing.environmentIds.read(reader);
			this._remoteSharing.shares.read(reader);
			this._reconcile();
			this._requestAutoConnections();
		}));
		this._register(filterService.registerDiscoveryHandler(() => this._discover()));
		this._register(this._remoteSharing.registerKeepSharingHandler((address, environmentId) => this._continueThroughEnvironment(address, environmentId)));
		void this._refreshInventory().catch(error => {
			if (!isCancellationError(error)) {
				this._logService.warn('Mission Control discovery failed; retaining known hosts', error);
			}
		});
	}

	private _autoConnectSuppressionKey(id: string, account: string): string {
		return `missionControl.userLocalAutoConnectSuppressed.v1.${encodeURIComponent(this._profileService.currentProfile.id)}.${encodeURIComponent(account)}.${id}`;
	}

	private _previouslyConnectedKey(id: string, account: string): string {
		return `missionControl.userLocalPreviouslyConnected.v1.${encodeURIComponent(this._profileService.currentProfile.id)}.${encodeURIComponent(account)}.${id}`;
	}

	private _refreshInventory(): Promise<void> {
		if (!this._discovery) {
			this._discovery = this._inventory.refresh(CancellationToken.None).finally(() => {
				this._discovery = undefined;
			});
		}
		return this._discovery;
	}

	private async _discover(): Promise<void> {
		try {
			await this._refreshInventory();
		} catch (error) {
			if (!isCancellationError(error)) {
				this._logService.warn('Mission Control discovery failed; retaining known hosts', error);
			}
			throw error;
		}
	}

	private _requestAutoConnections(): void {
		if (!this._inventory.enabled
			|| !this._configurationService.getValue<boolean>(RemoteAgentHostAutoConnectSettingId)) {
			return;
		}
		const account = this._inventory.accountKey;
		if (!account) {
			return;
		}
		const ownEnvironmentId = this._inventory.ownEnvironmentId.get();
		const discoveredOnlineHostIds = this._inventory.discoveredOnlineHostIds.get();
		// Remotes shared from here are listed by their direct connections while those are configured; remotes kept shared after disconnecting are not.
		const sharedRemoteEnvironmentIds = this._remoteSharing.environmentIds.get();
		for (const host of this._inventory.hosts.get()) {
			const provider = this._providerInstances.get(cloudSandboxAddress(host.id));
			if (host.id === ownEnvironmentId || sharedRemoteEnvironmentIds.has(host.id) || host.status !== 'online' || !discoveredOnlineHostIds.has(host.id) || !provider
				|| !this.isWebPlatform && !this._storageService.getBoolean(this._previouslyConnectedKey(host.id, account), StorageScope.PROFILE, false)
				|| this._storageService.getBoolean(this._autoConnectSuppressionKey(host.id, account), StorageScope.PROFILE, false)
				|| !RemoteAgentHostConnectionStatus.isDisconnected(provider.connectionStatus.get())) {
				continue;
			}
			void provider.connect().catch(error => {
				if (!isCancellationError(error)) {
					this._logService.warn('Mission Control automatic connection failed; retaining the environment for retry', error);
				}
			});
		}
	}

	protected override _getProviderEntries(): readonly IRemoteAgentHostEntry[] {
		if (!this._enabled || !this._inventory.enabled) {
			return [];
		}
		return this._inventory.hosts.get().map(host => ({
			name: host.name,
			connection: { type: RemoteAgentHostEntryType.CloudSandbox, environmentKind: 'user-local', environmentId: host.id, address: cloudSandboxAddress(host.id) },
		}));
	}

	protected override _updateProviderName(_address: string, provider: RemoteAgentHostSessionsProvider, name: string): void {
		provider.setLabel(name);
	}

	protected override _createProvider(address: string, name: string, options: IEntryDrivenProviderOptions): RemoteAgentHostSessionsProvider {
		const id = cloudSandboxEnvironmentId(address)!;
		const labels = new DisposableStore();
		try {
			labels.add(this._remoteAgentHostService.registerDisplayName(address,
				derived(this, reader => this._inventory.hosts.read(reader).find(host => host.id === id)?.displayName),
				name => this._inventory.setDisplayName(id, name)));
			const whileRegistered = (operation: (() => Promise<void>) | undefined) => operation ? async () => {
				if (labels.isDisposed) {
					throw new CancellationError();
				}
				await operation();
			} : undefined;
			const provider = super._createProvider(address, name, {
				...options,
				connectOnDemand: whileRegistered(options.connectOnDemand),
				disconnectOnDemand: whileRegistered(options.disconnectOnDemand),
				setDisplayName: name => {
					if (labels.isDisposed) {
						throw new CancellationError();
					}
					options.setDisplayName?.(name);
				},
			});
			this._providerStores.get(address)!.add(labels);
			return provider;
		} catch (error) {
			labels.dispose();
			throw error;
		}
	}

	protected override _reconcile(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._batchProviderChanges(() => this._reconcileInventory());
		this._returnSharedRemotes();
		for (const handoff of [...this._handoffs.values()]) {
			handoff.step();
		}
	}

	/** Continues the sessions of a remote kept shared on disconnect through its GitHub environment once the remote is gone. */
	private _continueThroughEnvironment(address: string, environmentId: string): void {
		const source = this._findDirectProvider(address);
		this._handOff(environmentId, this._captureSessions(source),
			() => !this._remoteSharing.environmentIds.get().has(environmentId) && !(source && this._isListing(source)),
			() => this._providerInstances.get(cloudSandboxAddress(environmentId)),
			target => void target.connect().catch(error => {
				if (!isCancellationError(error)) {
					this._logService.warn('Failed to connect to the GitHub environment of a remote kept shared on disconnect', error);
				}
			}));
	}

	/** Disconnects the GitHub environments of shared remotes that are connected directly again, and moves their sessions back to the direct connections. */
	private _returnSharedRemotes(): void {
		const environmentIds = this._remoteSharing.environmentIds.get();
		for (const [address, share] of this._remoteSharing.shares.get()) {
			const environmentId = share.environmentId;
			if (environmentId === undefined || !environmentIds.has(environmentId) || this._returning.has(environmentId)) {
				continue;
			}
			// The environment stays usable until the direct connection is established, in case connecting fails.
			if (!RemoteAgentHostConnectionStatus.isConnected(this._remoteAgentHostService.connections.find(connection => connection.address === address)?.status)) {
				continue;
			}
			const provider = this._providerInstances.get(cloudSandboxAddress(environmentId));
			if (!provider || RemoteAgentHostConnectionStatus.isDisconnected(provider.connectionStatus.get())) {
				continue;
			}
			const sessions = this._captureSessions(provider);
			provider.unpublishCachedSessions();
			this._returning.add(environmentId);
			// Not a user disconnect, so don't suppress automatically reconnecting the environment later.
			void this._inventory.disconnect(environmentId).catch(error => {
				if (!isCancellationError(error)) {
					this._logService.warn('Failed to disconnect the GitHub environment of a remote connected directly again', error);
				}
			}).finally(() => this._returning.delete(environmentId));
			this._handOff(environmentId, sessions, () => true, () => this._findDirectProvider(address));
		}
	}

	/**
	 * Moves open sessions to the target provider as it lists them. Waits until ready to find the target,
	 * and calls `onTarget` once the target is found.
	 */
	private _handOff<T extends IAgentHostSessionsProvider>(environmentId: string, sessions: readonly IHandoffSession[], isReady: () => boolean, findTarget: () => T | undefined, onTarget?: (target: T) => void): void {
		const store = new DisposableStore();
		const targetListener = store.add(new MutableDisposable());
		let remaining = sessions;
		let target: T | undefined;
		const handoff: ISessionHandoff = {
			step: () => {
				if (store.isDisposed) {
					return;
				}
				// A target that was replaced (e.g. its provider was recreated) no longer receives the sessions.
				if (target && !this._sessionsProvidersService.getProviders({ includeSessionBackends: true }).includes(target)) {
					target = undefined;
					targetListener.clear();
				}
				if (!target) {
					if (!isReady()) {
						return;
					}
					target = findTarget();
					if (!target) {
						return;
					}
					targetListener.value = target.onDidChangeSessions(() => handoff.step());
					onTarget?.(target);
					if (store.isDisposed) {
						return;
					}
				}
				const current = target;
				remaining = remaining.filter(({ session, backendSession, backendChats }) => !current.adoptSession?.(session, backendSession, backendChats));
				if (!remaining.length) {
					finish();
				}
			},
			dispose: () => store.dispose(),
		};
		const finish = () => {
			if (this._handoffs.get(environmentId) === handoff) {
				this._handoffs.deleteAndDispose(environmentId);
			}
		};
		store.add(this._sessionsProvidersService.onDidChangeProviders(() => handoff.step()));
		store.add(disposableTimeout(finish, SESSION_HANDOFF_TIMEOUT));
		this._handoffs.set(environmentId, handoff);
		handoff.step();
	}

	private _findDirectProvider(address: string): IAgentHostSessionsProvider | undefined {
		return this._sessionsProvidersService.getProviders().find((provider): provider is IAgentHostSessionsProvider => isAgentHostProvider(provider) && provider.remoteAddress === address);
	}

	private _isListing(provider: IAgentHostSessionsProvider): boolean {
		return this._sessionsProvidersService.getProviders().includes(provider) && provider.getSessions().length > 0;
	}

	private _captureSessions(provider: IAgentHostSessionsProvider | undefined): IHandoffSession[] {
		return (provider?.getSessions() ?? []).flatMap(session => {
			const backendSession = provider!.getBackendSessionResource(session.sessionId);
			if (!backendSession) {
				return [];
			}
			const backendChats = new ResourceMap<URI>();
			for (const chat of session.chats.get()) {
				const backendChat = provider!.getBackendChatResource(chat.resource);
				if (backendChat) {
					backendChats.set(chat.resource, backendChat);
				}
			}
			return [{ session, backendSession, backendChats }];
		});
	}

	private _batchProviderChanges<T>(fn: () => T): T {
		return this._agentHostConnectionsService.batchSessionResolutionChanges(() =>
			this._sessionsProvidersService.batchProviderChanges(fn));
	}

	override dispose(): void {
		this._batchProviderChanges(() => super.dispose());
	}

	private _reconcileInventory(): void {
		super._reconcile();
		for (const [address, provider] of this._providerInstances) {
			const connection = this._remoteAgentHostService.connections.find(connection => connection.address === address);
			if (RemoteAgentHostConnectionStatus.isConnected(connection?.status)) {
				this._storageService.store(this._previouslyConnectedKey(cloudSandboxEnvironmentId(address)!, this._inventory.accountKey!), true, StorageScope.PROFILE, StorageTarget.MACHINE);
			} else {
				provider.unpublishCachedSessions();
			}
			if (!connection) {
				const key = this._autoConnectSuppressionKey(cloudSandboxEnvironmentId(address)!, this._inventory.accountKey!);
				provider.setConnectionStatus(this._pendingConnects.has(key)
					? RemoteAgentHostConnectionStatus.connecting
					: RemoteAgentHostConnectionStatus.disconnected);
			}
		}
	}

	protected _getProviderOptions(entry: IRemoteAgentHostEntry): IEntryDrivenProviderOptions {
		if (entry.connection.type !== RemoteAgentHostEntryType.CloudSandbox) {
			throw new Error('Mission Control provider requires an MC connection.');
		}
		const id = entry.connection.environmentId;
		const account = this._inventory.accountKey!;
		const suppressionKey = this._autoConnectSuppressionKey(id, account);
		const checkAccount = () => {
			if (!this._inventory.enabled || this._inventory.accountKey !== account) {
				throw new CancellationError();
			}
		};
		const forCurrentAccount = async (operation: () => Promise<void>) => {
			checkAccount();
			await operation();
		};
		return {
			connectOnDemand: () => forCurrentAccount(async () => {
				this._storageService.remove(suppressionKey, StorageScope.PROFILE);
				const pending = this._pendingConnects.get(suppressionKey);
				if (pending) {
					await pending;
					return;
				}
				const promise = this._inventory.connect(id, CancellationToken.None);
				this._pendingConnects.set(suppressionKey, promise);
				this._reconcile();
				try {
					await promise;
				} finally {
					this._pendingConnects.delete(suppressionKey);
					this._reconcile();
				}
			}),
			disconnectOnDemand: () => forCurrentAccount(async () => {
				this._storageService.store(suppressionKey, true, StorageScope.PROFILE, StorageTarget.MACHINE);
				await this._inventory.disconnect(id);
			}),
			canRemove: false,
			setDisplayName: name => {
				checkAccount();
				this._inventory.setDisplayName(id, name);
			},
			sessionCacheKey: `missionControl.userLocalSessions.v1.${encodeURIComponent(this._profileService.currentProfile.id)}.${encodeURIComponent(account)}.${id}`,
			readOnlyWhenDisconnected: true,
			// This computer's own registration runs sessions directly as This Computer, and remotes shared from here are listed by their direct connections.
			isVisibleInEnvironmentPicker: derived(this, reader => this._inventory.ownEnvironmentId.read(reader) !== id
				&& !this._remoteSharing.environmentIds.read(reader).has(id)
				&& this._inventory.hosts.read(reader).some(host => host.id === id && host.status === 'online')),
			localRegistration: derived(this, reader => this._inventory.ownEnvironmentId.read(reader) === id ? 'githubEnvironment' : undefined),
			pickerVisibilityKey: getRemoteAgentHostPickerKey(cloudSandboxAddress(id), account),
			disconnectLabel: localize('missionControl.disconnectHost', "Disconnect"),
			hostDescription: derived(this, reader => {
				const hosts = this._inventory.hosts.read(reader);
				const host = hosts.find(host => host.id === id);
				return host?.status === 'online' ? localize('missionControl.available', "Online")
					: localize('missionControl.unavailable', "Offline");
			}),
			connectionLabels: {
				unavailableTitle: localize('missionControl.unavailableTitle', "Environment Disconnected"),
				unavailableDescription: localize('missionControl.unavailableDescription', "Start the environment's owning application, then reconnect. This does not start or replace its compute."),
				unavailable: localize('missionControl.unavailableBanner', "Environment disconnected."),
				connectingTitle: localize('missionControl.connectingTitle', "Connecting to Environment"),
				connecting: localize('missionControl.connectingBanner', "Connecting to the environment..."),
				reconnecting: localize('missionControl.reconnectingBanner', "Reconnecting to the environment..."),
				reconnectingIn: seconds => localize('missionControl.reconnectingIn', "Reconnecting to the environment in {0}s...", seconds),
				incompatibleTitle: localize('missionControl.incompatibleTitle', "Environment Incompatible"),
				incompatible: localize('missionControl.incompatibleBanner', "The environment's Agent Host Protocol version is incompatible."),
			},
		};
	}
}
