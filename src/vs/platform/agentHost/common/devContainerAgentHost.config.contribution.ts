/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerWorktreeEnabledSettingId } from './devContainerAgentHost.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chatAgentHostDevContainer',
	title: nls.localize('chatAgentHostDevContainerConfigurationTitle', "Chat Agent Host"),
	type: 'object',
	properties: {
		[DevContainerAgentHostEnabledSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.agentHost.devContainer.enabled', "Enable running Agent Host sessions in Dev Containers."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[DevContainerWorktreeEnabledSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.agentHost.devContainer.worktree.enabled', "Enable running Dev Container Agent Host sessions in new worktrees."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			included: false,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
	},
});
