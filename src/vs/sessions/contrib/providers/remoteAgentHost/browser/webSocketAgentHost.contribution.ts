/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { EntryDrivenProviderContribution } from './entryDrivenProviderContribution.js';

export class WebSocketAgentHostContribution extends EntryDrivenProviderContribution implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.webSocketAgentHostContribution';

	protected readonly _entryType = RemoteAgentHostEntryType.WebSocket;

	constructor(
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@INotificationService notificationService: INotificationService,
	) {
		super(remoteAgentHostService, configurationService, instantiationService, sessionsProvidersService, notificationService);

		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._reconcile()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				this._reconcile();
			}
		}));

		this._reconcile();
	}

	protected override _getProviderOptions(_entry: IRemoteAgentHostEntry) {
		return {};
	}
}

registerWorkbenchContribution2(WebSocketAgentHostContribution.ID, WebSocketAgentHostContribution, WorkbenchPhase.AfterRestored);
