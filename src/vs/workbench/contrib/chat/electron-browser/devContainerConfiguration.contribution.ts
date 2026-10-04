/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerSamplesEnabledSettingId } from '../../../../platform/agentHost/common/devContainerAgentHost.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[DevContainerAgentHostEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.devContainer.enabled', "Enable running Agent Host sessions in Dev Containers."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			experiment: { mode: 'auto' },
		},
		[DevContainerSamplesEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.devContainer.samples.enabled', "Show Dev Container samples in the Agents window workspace picker. The sample is cloned into a Docker volume and started when you send the first prompt. Requires Dev Container Agent Host sessions to be enabled."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
	},
});
