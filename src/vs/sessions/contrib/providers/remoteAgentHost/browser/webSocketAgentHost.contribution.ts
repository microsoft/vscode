/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSocketConnectionFactory } from '../../../../../platform/agentHost/browser/webSocketConnectionFactory.js';
import { agentsWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { IExtensionRemoteAgentHostsService } from '../../../../../platform/agentHost/common/extensionRemoteAgentHosts.js';
import { type IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { EntryDrivenProviderContribution, type IEntryDrivenProviderOptions } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/entryDrivenProviderContribution.js';

/**
 * Owns the session providers of hosts dialed at a WebSocket address: those users add in settings,
 * and those running extensions register, which it also has the remote agent host service dial.
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

		this._reconcile();
	}

	protected override _getProviderEntries(): readonly IRemoteAgentHostEntry[] {
		if (!this._enabled) {
			return [];
		}
		return this._remoteAgentHostService.configuredEntries.filter(entry => entry.connection.type === RemoteAgentHostEntryType.WebSocket || entry.connection.type === RemoteAgentHostEntryType.Extension);
	}

	protected override _getProviderOptions(entry: IRemoteAgentHostEntry): IEntryDrivenProviderOptions {
		if (entry.connection.type !== RemoteAgentHostEntryType.Extension) {
			return {};
		}
		// The registering extension owns the host, so users can disconnect it but not remove it.
		const address = entry.connection.address;
		return {
			canRemove: false,
			disconnectOnDemand: async () => {
				// Excluding the host from the connectable entries first keeps reconciliation from dialing it again.
				this._extensionRemoteAgentHostsService.setDisconnected(address, true);
				await this._remoteAgentHostService.removeRemoteAgentHost(address);
			},
		};
	}
}

registerWorkbenchContribution2(WebSocketAgentHostContribution.ID, WebSocketAgentHostContribution, WorkbenchPhase.AfterRestored);
