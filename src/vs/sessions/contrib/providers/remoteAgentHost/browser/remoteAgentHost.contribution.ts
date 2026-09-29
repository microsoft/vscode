/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { AgentHostLocalFilePermissionsSettingId } from '../../../../../platform/agentHost/common/agentHostResourceService.js';
import { RemoteAgentHostAutoConnectSettingId, RemoteAgentHostsSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TunnelAgentHostsSettingId } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { WslAutoStartSettingId } from '../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { OpenAgentHostStateFileAction } from '../../agentHost/browser/openAgentHostStateFileAction.js';
import '../../../../../workbench/contrib/chat/browser/remoteAgentHost/remoteAgentHost.contribution.js';
import './remoteAgentHostActions.js';
import './manageRemoteAgentHosts.js';
import '../../agentHost/browser/agentHostAgentPicker.js';

registerAction2(OpenAgentHostStateFileAction);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[RemoteAgentHostAutoConnectSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.remoteAgentHosts.autoConnect', "Automatically connect to online dev tunnel, SSH, and WSL remote agent hosts on startup. When disabled, cached sessions are still shown but connections are established only on demand."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		'chat.sshRemoteAgentHostCommand': {
			type: 'string',
			description: nls.localize('chat.sshRemoteAgentHostCommand', "For development: Override the command used to start the remote agent host over SSH. When set, skips automatic CLI installation and runs this command instead. The command must print a WebSocket URL matching ws://127.0.0.1:PORT (optionally with ?tkn=TOKEN) to stdout or stderr./"),
			default: '',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		'chat.wslRemoteAgentHostCommand': {
			type: 'string',
			description: nls.localize('chat.wslRemoteAgentHostCommand', "For development: Override the command used to start the remote agent host in WSL. When set, skips automatic CLI installation and runs this command instead. The command must print a WebSocket URL matching ws://127.0.0.1:PORT (optionally with ?tkn=TOKEN) to stdout or stderr."),
			default: '',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		'chat.agentHost.forwardSSHAgent': {
			type: 'boolean',
			description: nls.localize('chat.agentHost.forwardSSHAgent', "When enabled, forwards the local SSH agent to the remote machine during SSH agent host connections to hosts whose SSH config has `ForwardAgent yes`. Only enable this for trusted hosts. The remote agent host process must be restarted for this setting to take effect."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[WslAutoStartSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.agentHost.wsl.autoStart', "Automatically start a WSL distribution when opening a chat whose distribution is not running. When disabled, the chat shows a Start button instead."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[RemoteAgentHostsSettingId]: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					address: { type: 'string', description: nls.localize('chat.remoteAgentHosts.address', "The WebSocket address of the remote agent host (e.g. \"localhost:3000\").") },
					name: { type: 'string', description: nls.localize('chat.remoteAgentHosts.name', "A display name for this remote agent host.") },
					connectionToken: { type: 'string', description: nls.localize('chat.remoteAgentHosts.connectionToken', "An optional connection token for authenticating with the remote agent host.") },
				},
				required: ['address', 'name'],
			},
			description: nls.localize('chat.remoteAgentHosts', "A list of WebSocket remote agent host addresses to connect to (e.g. \"localhost:3000\"). SSH remote agent host details are managed by VS Code."),
			default: [],
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
		[TunnelAgentHostsSettingId]: {
			type: 'array',
			items: { type: 'string' },
			description: nls.localize('chat.remoteAgentTunnels', "Additional dev tunnel names to look for when connecting to remote agent hosts. These are looked up in addition to tunnels automatically enumerated from your account."),
			default: [],
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[AgentHostLocalFilePermissionsSettingId]: {
			type: 'object',
			description: nls.localize('chat.agentHost.localFilePermissions', "Per-host filesystem grants for remote agent hosts. Maps a remote agent host address to URI strings and the access mode the host has been granted (`r` for read, `rw` for read and write). Hosts cannot read or write any files outside the granted URIs without prompting; a URI grant covers descendants. This setting is normally maintained by the agent-host permission prompts and rarely edited by hand."),
			additionalProperties: {
				type: 'object',
				additionalProperties: {
					oneOf: [
						{
							type: 'string',
							enum: ['r', 'rw'],
							enumDescriptions: [
								nls.localize('chat.agentHost.localFilePermissions.read', "Read-only access."),
								nls.localize('chat.agentHost.localFilePermissions.readWrite', "Read and write access."),
							],
						},
						{
							type: 'object',
							properties: {
								mode: { type: 'string', enum: ['r', 'rw'] },
								lexicalUri: {
									type: 'string',
									description: nls.localize('chat.agentHost.localFilePermissions.lexicalUri', "Original resource URI used to display accessible directory entries."),
								},
							},
							required: ['mode', 'lexicalUri'],
							additionalProperties: false,
						},
					],
				},
			},
			default: {},
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
	},
});
