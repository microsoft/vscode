/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { AgentHostChatResourcesConfigKey } from '../../../../../platform/agentHost/common/agentHostSchema.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';

export const ChatResourcesEnabledSettingId = 'chat.resources.enabled';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chatResources',
	title: nls.localize('chatResources.configurationTitle', "Chat Resources"),
	type: 'object',
	properties: {
		[ChatResourcesEnabledSettingId]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			// Agents can then ask to pin the files they record or show them above the chat input.
			agentHost: { key: AgentHostChatResourcesConfigKey },
			markdownDescription: nls.localize('chatResources.enabled', "Whether the pinned pills of files the chat recorded, such as its agent's artifacts, can show them above the chat input instead of opening them in an editor."),
			tags: ['experimental'],
		},
	},
});
