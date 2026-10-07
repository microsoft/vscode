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
import { MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { cloudSandboxAddress, cloudSandboxEnvironmentId } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IMissionControlEnvironmentService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, type IRemoteAgentHostEntry } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { EntryDrivenProviderContribution, type IEntryDrivenProviderOptions } from './entryDrivenProviderContribution.js';
import { Menus } from '../../../../browser/menus.js';
import { ConnectMissionControlEnvironmentCommand } from '../../../../../workbench/contrib/chat/browser/remoteAgentHost/missionControlEnvironmentActions.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';
import { IUserDataProfileService } from '../../../../../workbench/services/userDataProfile/common/userDataProfile.js';

/** User-local MC hosts use the native provider, never the sandbox's task-history adapter. */
export class MissionControlAgentHostContribution extends EntryDrivenProviderContribution {
	static readonly ID = 'workbench.contrib.missionControlAgentHosts';
	protected readonly _entryType = RemoteAgentHostEntryType.CloudSandbox;

	constructor(
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@INotificationService notificationService: INotificationService,
		@IMissionControlEnvironmentService private readonly _inventory: IMissionControlEnvironmentService,
		@IAgentHostFilterService filterService: IAgentHostFilterService,
		@ILogService logService: ILogService,
		@IUserDataProfileService private readonly _profileService: IUserDataProfileService,
	) {
		super(remoteAgentHostService, configurationService, instantiationService, sessionsProvidersService, notificationService);
		this._register(remoteAgentHostService.onDidChangeConfiguredEntries(() => this._reconcile()));
		this._register(remoteAgentHostService.onDidChangeConnections(() => this._reconcile()));
		this._register(configurationService.onDidChangeConfiguration(() => this._reconcile()));
		this._register(autorun(reader => {
			this._inventory.hosts.read(reader);
			this._reconcile();
		}));
		this._register(filterService.registerDiscoveryHandler(() => this._inventory.refresh(CancellationToken.None)));
		void this._inventory.refresh(CancellationToken.None).catch(error => {
			if (!isCancellationError(error)) {
				logService.warn('Mission Control discovery failed; retaining known hosts', error);
			}
		});
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
		super._reconcile();
		for (const [address, provider] of this._providerInstances) {
			if (!this._remoteAgentHostService.connections.some(connection => connection.address === address)) {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
			}
		}
	}

	protected _getProviderOptions(entry: IRemoteAgentHostEntry): IEntryDrivenProviderOptions {
		if (entry.connection.type !== RemoteAgentHostEntryType.CloudSandbox) {
			throw new Error('Mission Control provider requires an MC connection.');
		}
		const id = entry.connection.environmentId;
		const account = this._inventory.accountKey!;
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
			connectOnDemand: () => forCurrentAccount(() => this._inventory.connect(id, CancellationToken.None)),
			disconnectOnDemand: () => forCurrentAccount(() => this._inventory.disconnect(id)),
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
	command: { id: ConnectMissionControlEnvironmentCommand, title: localize('connectMissionControlHost', "Environments"), icon: Codicon.remote },
	when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.not('config.chat.disableAIFeatures'), ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)),
	group: '1_add',
	order: 5,
});
