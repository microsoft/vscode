/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { CloudSandboxAutoConnectOnOpenSettingId, CloudSandboxEarlyPreparationSettingId, CloudSandboxEnabledSettingId, CloudSandboxSessionFeedEnabledSettingId, ICloudSandboxAgentHostService, ICloudSandboxApiService, ICloudSandboxDraftPreparationService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { CloudSandboxAgentHostService } from './cloudSandboxAgentHostService.js';
import { CloudSandboxApiService } from './cloudSandboxApiService.js';
import { CloudSandboxDraftPreparationService } from './cloudSandboxDraftPreparationService.js';
import { CloudSandboxModelCatalogService, ICloudSandboxModelCatalogService } from './cloudSandboxModels.js';
import { CloudSandboxTelemetryService, ICloudSandboxTelemetryService } from './cloudSandboxTelemetry.js';
import { EditorCloudSandboxContribution } from './editorCloudSandboxContribution.js';
import { RemoteAgentHostContribution } from './remoteAgentHostChatContribution.js';
import './missionControlEnvironmentActions.js';
import { AgentHostDefaultCloneDirectorySettingId, AgentHostRemoteConnectionsSettingId, IMissionControlEnvironmentService, IMissionControlSharingService, MissionControlUseLocalCredentialsSettingId } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { MissionControlEnvironmentService } from './missionControlEnvironmentService.js';
import { MissionControlSharingService } from './missionControlSharingService.js';
import { IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';
import { IAgentHostAdvertisedAuthenticationResolver } from '../../../../../platform/agentHost/common/agentHostAdvertisedAuthentication.js';
import { RemoteAgentHostAuthenticationResolver } from './remoteAgentHostAuthenticationResolver.js';

class MissionControlContribution {
	static readonly ID = 'workbench.contrib.missionControl';
	constructor(
		@IMissionControlSharingService _sharingService: IMissionControlSharingService,
	) { }
}

registerSingleton(ICloudSandboxTelemetryService, CloudSandboxTelemetryService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxApiService, CloudSandboxApiService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxDraftPreparationService, CloudSandboxDraftPreparationService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxModelCatalogService, CloudSandboxModelCatalogService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxAgentHostService, CloudSandboxAgentHostService, InstantiationType.Delayed);
registerSingleton(IMissionControlEnvironmentService, MissionControlEnvironmentService, InstantiationType.Delayed);
registerSingleton(IMissionControlSharingService, MissionControlSharingService, InstantiationType.Delayed);
registerSingleton(IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService, InstantiationType.Delayed);
registerSingleton(IAgentHostAdvertisedAuthenticationResolver, RemoteAgentHostAuthenticationResolver, InstantiationType.Delayed);

registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(EditorCloudSandboxContribution.ID, EditorCloudSandboxContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(MissionControlContribution.ID, MissionControlContribution, WorkbenchPhase.AfterRestored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[AgentHostRemoteConnectionsSettingId]: {
			type: 'string',
			enum: ['devTunnel', 'githubEnvironment'],
			enumDescriptions: [
				localize('remoteConnections.devTunnel', "Allow remote connections through a secure Dev Tunnel from VS Code or a browser."),
				localize('remoteConnections.githubEnvironment', "Register this machine as a GitHub environment for remote agent access (preview). Remote clients receive trusted-owner access to sessions, tools, and workspace resources. Session actions are mirrored to GitHub for catalog and history storage. Conversation content is not end-to-end encrypted."),
			],
			description: localize('remoteConnections', "Choose the connection method used by Allow Remote Connections. In VS Code Insiders and Code - OSS, selecting a method in the Remote Connections menu updates this setting and enables sharing. Selecting Off disables sharing without changing the preferred method. Changing this setting directly turns sharing off."),
			default: 'devTunnel',
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			tags: ['preview', 'advanced'],
		},
		[RemoteAgentHostsEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.remoteAgentHosts.enabled', "Enable connecting to remote agent hosts."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
		[AgentHostDefaultCloneDirectorySettingId]: {
			type: 'string',
			markdownDescription: localize('agentHost.defaultCloneDirectory', "Root folder for repositories cloned by remote clients when this machine is shared as a GitHub environment. Repositories are cloned into `<root>/<owner>/<repository>`. Use an absolute path or a path starting with `~` for the local user's home folder. The folder is created if needed. When empty, falls back to `#git.defaultCloneDirectory#`, then the home folder. Changes apply to future clones and do not move existing repositories."),
			default: '',
			scope: ConfigurationScope.APPLICATION_MACHINE,
			restricted: true,
			ignoreSync: true,
		},
		[MissionControlUseLocalCredentialsSettingId]: {
			type: 'boolean',
			description: localize('missionControl.useLocalCredentials', "Use this machine's signed-in Copilot credential instead of the remote client's credential for Mission Control agent requests. Remote clients must still authenticate as the same GitHub account. Requests use the local account's permissions and usage allowance. Changing this setting disconnects existing Mission Control clients."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			tags: ['experimental', 'advanced'],
			ignoreSync: true,
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
		[CloudSandboxEarlyPreparationSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.cloudSandbox.earlyPreparation', "Prepare an eligible cloud environment while typing in a new Cloud chat in the editor or Agents Window. This can allocate cloud compute before you send a message."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			tags: ['experimental', 'advanced'],
			experiment: { mode: 'auto' },
		},
		[CloudSandboxSessionFeedEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.cloudSandbox.sessionFeed.enabled', "Try Mission Control push notifications to discover and refresh cloud sandbox sessions when enabled for your GitHub account. If unavailable, use normal polling without repeated connection attempts until the window reloads, the account changes, or this setting is toggled. When disabled, do not request feed credentials or open a feed connection; use normal polling only."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
	},
});
