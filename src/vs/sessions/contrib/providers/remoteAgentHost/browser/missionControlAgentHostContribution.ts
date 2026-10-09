/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { autorun, derived } from '../../../../../base/common/observable.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { cloudSandboxAddress, cloudSandboxEnvironmentId } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IMissionControlEnvironmentService, IMissionControlSharingService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, type IRemoteAgentHostEntry } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { EntryDrivenProviderContribution, type IEntryDrivenProviderOptions } from './entryDrivenProviderContribution.js';
import { Menus } from '../../../../browser/menus.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';
import { IUserDataProfileService } from '../../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { UNIFIED_WORKSPACE_PICKER_SETTING } from '../../../chat/common/constants.js';
import { Schemas } from '../../../../../base/common/network.js';
import { RemoteAgentHostCommandIds } from './remoteAgentHostActions.js';

/** User-local MC hosts use the native provider, never the sandbox's task-history adapter. */
export class MissionControlAgentHostContribution extends EntryDrivenProviderContribution {
	static readonly ID = 'workbench.contrib.missionControlAgentHosts';
	protected readonly _entryType = RemoteAgentHostEntryType.CloudSandbox;
	protected get isWebPlatform(): boolean { return isWeb; }
	private readonly _pendingConnects = new Map<string, Promise<void>>();
	private _discovery: Promise<void> | undefined;

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
	) {
		super(remoteAgentHostService, configurationService, instantiationService, sessionsProvidersService, notificationService);
		const updateProjects = () => sharingService.setProjectFolders(recentWorkspacesService
			.getRecentWorkspaces(true, configurationService.getValue<boolean>(UNIFIED_WORKSPACE_PICKER_SETTING))
			.flatMap(recent => recent.workspace.folders.map(folder => folder.root))
			.filter(folder => folder.scheme === Schemas.file));
		this._register(recentWorkspacesService.onDidChangeRecentWorkspaces(updateProjects));
		this._register(sessionsProvidersService.onDidChangeProviders(updateProjects));
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(UNIFIED_WORKSPACE_PICKER_SETTING)) {
				updateProjects();
			}
		}));
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
			this._reconcile();
			this._requestAutoConnections();
		}));
		this._register(filterService.registerDiscoveryHandler(() => this._discover()));
		void this._refreshInventory().catch(error => {
			if (!isCancellationError(error)) {
				this._logService.warn('Mission Control discovery failed; retaining known hosts', error);
			}
		});
	}

	private _autoConnectSuppressionKey(id: string, account: string): string {
		return `missionControl.userLocalAutoConnectSuppressed.v1.${encodeURIComponent(this._profileService.currentProfile.id)}.${encodeURIComponent(account)}.${id}`;
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
		if (!this.isWebPlatform || !this._inventory.enabled
			|| !this._configurationService.getValue<boolean>(RemoteAgentHostAutoConnectSettingId)) {
			return;
		}
		const account = this._inventory.accountKey;
		if (!account) {
			return;
		}
		for (const host of this._inventory.hosts.get()) {
			const provider = this._providerInstances.get(cloudSandboxAddress(host.id));
			if (host.status !== 'online' || !provider
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
		super._reconcile();
		for (const [address, provider] of this._providerInstances) {
			if (!this._remoteAgentHostService.connections.some(connection => connection.address === address)) {
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
			retainSessionsOnDisconnect: true,
			readOnlyWhenDisconnected: true,
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

registerWorkbenchContribution2(MissionControlAgentHostContribution.ID, MissionControlAgentHostContribution, WorkbenchPhase.AfterRestored);
MenuRegistry.appendMenuItem(Menus.SessionWorkspaceManage, {
	command: { id: RemoteAgentHostCommandIds.connectViaMissionControl, title: localize('connectMissionControlHost', "Environments"), icon: Codicon.remote },
	when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.not('config.chat.disableAIFeatures'), ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)),
	group: '1_add',
	order: 5,
});
