/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { CloudSandboxAutoConnectOnOpenSettingId, CloudSandboxEnabledSettingId, ICloudSandboxAgentHostService, ICloudSandboxApiService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { CloudSandboxAgentHostService } from './cloudSandboxAgentHostService.js';
import { CloudSandboxApiService } from './cloudSandboxApiService.js';
import { CloudSandboxModelCatalogService, ICloudSandboxModelCatalogService } from './cloudSandboxModels.js';
import { CloudSandboxTelemetryService, ICloudSandboxTelemetryService } from './cloudSandboxTelemetry.js';
import { EditorCloudSandboxContribution } from './editorCloudSandboxContribution.js';
import { RemoteAgentHostContribution } from './remoteAgentHostChatContribution.js';
import './missionControlEnvironmentActions.js';
import { IMissionControlEnvironmentService, IMissionControlSharingService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { MissionControlEnvironmentService } from './missionControlEnvironmentService.js';
import { MissionControlSharingService } from './missionControlSharingService.js';
import { IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';
import { IRemoteConnectionsService } from '../../common/remoteConnections.js';
import { RemoteConnectionsService } from './remoteConnectionsService.js';

class MissionControlContribution {
	static readonly ID = 'workbench.contrib.missionControl';
	constructor(
		@IMissionControlSharingService _sharingService: IMissionControlSharingService,
	) { }
}

registerSingleton(ICloudSandboxTelemetryService, CloudSandboxTelemetryService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxApiService, CloudSandboxApiService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxModelCatalogService, CloudSandboxModelCatalogService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxAgentHostService, CloudSandboxAgentHostService, InstantiationType.Delayed);
registerSingleton(IMissionControlEnvironmentService, MissionControlEnvironmentService, InstantiationType.Delayed);
registerSingleton(IMissionControlSharingService, MissionControlSharingService, InstantiationType.Delayed);
registerSingleton(IRemoteConnectionsService, RemoteConnectionsService, InstantiationType.Delayed);
registerSingleton(IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService, InstantiationType.Delayed);

registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(EditorCloudSandboxContribution.ID, EditorCloudSandboxContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(MissionControlContribution.ID, MissionControlContribution, WorkbenchPhase.AfterRestored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[RemoteAgentHostsEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.remoteAgentHosts.enabled', "Enable connecting to remote agent hosts."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
		[CloudSandboxEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.cloudSandbox.enabled', "Use GitHub Cloud for new Cloud sessions in the Agents Window instead of Copilot coding agent on GitHub Actions. Also enables discovering and opening GitHub Cloud sessions."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
			experiment: { mode: 'auto' },
		},
		[CloudSandboxAutoConnectOnOpenSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.cloudSandbox.autoConnectOnOpen', "Automatically connect to or wake a cloud sandbox environment in the background when opening or restoring its chat in the Agents Window. When disabled, connecting waits until you start composing or explicitly connect."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
	},
});
