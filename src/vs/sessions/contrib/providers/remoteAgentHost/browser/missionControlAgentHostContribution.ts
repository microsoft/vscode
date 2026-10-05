/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ICloudSandboxAgentHostService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { getEntryAddress, IRemoteAgentHostService, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, type IRemoteAgentHostEntry } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { EntryDrivenProviderContribution, type IEntryDrivenProviderOptions } from './entryDrivenProviderContribution.js';
import { Menus } from '../../../../browser/menus.js';
import { ConnectMissionControlEnvironmentCommand } from '../../../../../workbench/contrib/chat/browser/remoteAgentHost/missionControlEnvironmentActions.js';

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
		@ICloudSandboxAgentHostService private readonly _connections: ICloudSandboxAgentHostService,
	) {
		super(remoteAgentHostService, configurationService, instantiationService, sessionsProvidersService, notificationService);
		this._register(remoteAgentHostService.onDidChangeConfiguredEntries(() => this._reconcile()));
		this._register(remoteAgentHostService.onDidChangeConnections(() => this._reconcile()));
		this._register(configurationService.onDidChangeConfiguration(() => this._reconcile()));
		this._reconcile();
	}

	protected override _getProviderEntries(): readonly IRemoteAgentHostEntry[] {
		return super._getProviderEntries().filter(entry => {
			if (entry.connection.type !== RemoteAgentHostEntryType.CloudSandbox || entry.connection.environmentKind !== 'user-local') {
				return false;
			}
			const address = getEntryAddress(entry);
			const root = this._remoteAgentHostService.getConnection(address)?.rootState.value;
			return this._providerInstances.has(address) || (!!root && !(root instanceof Error));
		});
	}

	protected _getProviderOptions(entry: IRemoteAgentHostEntry): IEntryDrivenProviderOptions {
		if (entry.connection.type !== RemoteAgentHostEntryType.CloudSandbox) {
			throw new Error('Mission Control provider requires an MC connection.');
		}
		const options = { environmentId: entry.connection.environmentId, name: entry.name, environmentKind: 'user-local' as const };
		return {
			connectOnDemand: async () => { await this._connections.connect(options, CancellationToken.None); },
			disconnectOnDemand: () => this._connections.disconnect(options.environmentId),
		};
	}
}

registerWorkbenchContribution2(MissionControlAgentHostContribution.ID, MissionControlAgentHostContribution, WorkbenchPhase.AfterRestored);
MenuRegistry.appendMenuItem(Menus.SessionWorkspaceManage, {
	command: { id: ConnectMissionControlEnvironmentCommand, title: localize('connectMissionControlHost', "Connect to Mission Control Environment..."), icon: Codicon.cloud },
	when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)),
	group: '1_add',
	order: 5,
});
