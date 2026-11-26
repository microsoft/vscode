/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun } from '../../../../../base/common/observable.js';
import { WebSocketConnectionFactory } from '../../../../../platform/agentHost/browser/webSocketConnectionFactory.js';
import { agentsWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { IExtensionRemoteAgentHostsService, toExtensionRemoteAgentHostEntry } from '../../../../../platform/agentHost/common/extensionRemoteAgentHosts.js';
import { getEntryAddress, type IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { EntryDrivenProviderContribution, type IEntryDrivenProviderOptions } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/entryDrivenProviderContribution.js';

/**
 * Owns the session providers of hosts dialed at a WebSocket address: those users add in settings,
 * and those running extensions register, which it also has the remote agent host service dial.
 * An extension host the user disconnected keeps its provider, which connects it again on demand.
 *
 * Both kinds share one owner because an extension can register the address of a host the user
 * already added. The remote agent host service then supplies a single entry for the address, of
 * the extension's kind until its registration ends, and this owner replaces the provider in one pass.
 */
export class WebSocketAgentHostContribution extends EntryDrivenProviderContribution implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.webSocketAgentHostContribution';

	protected readonly _entryType = RemoteAgentHostEntryType.WebSocket;

	constructor(
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
		@IExtensionRemoteAgentHostsService private readonly _extensionRemoteAgentHostsService: IExtensionRemoteAgentHostsService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@INotificationService notificationService: INotificationService,
	) {
		super(remoteAgentHostService, configurationService, instantiationService, sessionsProvidersService, notificationService);

		this._register(this._remoteAgentHostService.registerConnectionFactory(this._register(this._instantiationService.createInstance(
			WebSocketConnectionFactory,
			RemoteAgentHostEntryType.Extension,
			this._extensionRemoteAgentHostsService.connectableEntries,
			() => agentsWindowAgentHostClientInfo,
		))));

		this._register(this._remoteAgentHostService.onDidChangeConfiguredEntries(() => this._reconcile()));
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._reconcile()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				this._reconcile();
			}
		}));
		// Registering or unregistering a host the user disconnected changes no configured entry.
		this._register(autorun(reader => {
			this._extensionRemoteAgentHostsService.hosts.read(reader);
			this._extensionRemoteAgentHostsService.disconnectedAddresses.read(reader);
			this._reconcile();
		}));
	}

	protected override _getProviderEntries(): readonly IRemoteAgentHostEntry[] {
		if (!this._enabled) {
			return [];
		}
		const entries = this._remoteAgentHostService.configuredEntries.filter(entry => entry.connection.type === RemoteAgentHostEntryType.WebSocket || entry.connection.type === RemoteAgentHostEntryType.Extension);
		// A host the user disconnected is registered but not dialed, so it has no configured entry; it keeps a provider to connect it from.
		const configured = new Set(entries.map(entry => getEntryAddress(entry)));
		const disconnected = this._extensionRemoteAgentHostsService.hosts.get().filter(host => !configured.has(host.address)).map(toExtensionRemoteAgentHostEntry);
		return [...entries, ...disconnected];
	}

	protected override _reconcile(): void {
		super._reconcile();
		const disconnected = this._extensionRemoteAgentHostsService.disconnectedAddresses.get();
		for (const [address, provider] of this._providerInstances) {
			// Without a connection nothing reports its status. Like other disconnected remotes, it lists no sessions until connected again.
			if (disconnected.has(address) && !this._remoteAgentHostService.connections.some(connection => connection.address === address)) {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
				provider.unpublishCachedSessions();
			}
		}
	}

	protected override _getProviderOptions(entry: IRemoteAgentHostEntry): IEntryDrivenProviderOptions {
		if (entry.connection.type !== RemoteAgentHostEntryType.Extension) {
			return {};
		}
		// The registering extension owns the host, so users can disconnect it but not remove it.
		const address = entry.connection.address;
		return {
			canRemove: false,
			connectOnDemand: async () => {
				// Makes the host connectable again; the reconnect joins the dial that reconciliation starts, as a user request.
				this._extensionRemoteAgentHostsService.setDisconnected(address, false);
				this._remoteAgentHostService.reconnect(address, true);
				await this._remoteAgentHostService.waitForConnection(address);
			},
			disconnectOnDemand: async () => {
				// Excluding the host from the connectable entries first keeps reconciliation from dialing it again.
				this._extensionRemoteAgentHostsService.setDisconnected(address, true);
				await this._remoteAgentHostService.removeRemoteAgentHost(address);
			},
		};
	}
}

registerWorkbenchContribution2(WebSocketAgentHostContribution.ID, WebSocketAgentHostContribution, WorkbenchPhase.AfterRestored);
