/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import product from '../../product/common/product.js';
import { ChatMoveConfigKey, ChatMoveSettingId } from './agentHostChatMove.js';

/** Move Chats settings, mirrored into the agent host root config. On by default outside Stable. */
export const chatMoveConfigurationProperties = {
	[ChatMoveSettingId.Enabled]: {
		type: 'boolean',
		description: nls.localize('chat.agentHost.moveChats.enabled', "Enables moving chats between Agent Host sessions and into new sessions."),
		default: product.quality !== 'stable',
		scope: ConfigurationScope.APPLICATION,
		tags: ['experimental'],
		agentHost: { key: ChatMoveConfigKey.Enabled },
	},
} satisfies Record<string, IConfigurationPropertySchema>;
