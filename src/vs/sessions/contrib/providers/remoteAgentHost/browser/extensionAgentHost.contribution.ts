/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSocketConnectionFactory } from '../../../../../platform/agentHost/browser/webSocketConnectionFactory.js';
import { agentsWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { IExtensionRemoteAgentHostsService } from '../../../../../platform/agentHost/common/extensionRemoteAgentHosts.js';
import { type IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { EntryDrivenProviderContribution, type IEntryDrivenProviderOptions } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/entryDrivenProviderContribution.js';

/**
 * Owns the remote agent hosts that running extensions register, in the Agents window: it has the
 * remote agent host service dial them and creates their session providers. The extension owns each
 * host, so users can disconnect it but not remove it.
 */
export class ExtensionAgentHostContribution extends EntryDrivenProviderContribution implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.extensionAgentHostContribution';

	protected readonly _entryType = RemoteAgentHostEntryType.Extension;

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
			if (e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				this._reconcile();
			}
		}));

		this._reconcile();
	}

	protected override _getProviderOptions(entry: IRemoteAgentHostEntry): IEntryDrivenProviderOptions {
		const address = entry.connection.type === RemoteAgentHostEntryType.Extension ? entry.connection.address : undefined;
		if (!address) {
			return {};
		}
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

registerWorkbenchContribution2(ExtensionAgentHostContribution.ID, ExtensionAgentHostContribution, WorkbenchPhase.AfterRestored);
