/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { createSchema, schemaProperty } from './agentHostSchema.js';

/** Host root config keys for chats of one session using different agents. */
export const ChatProvidersConfigKey = {
	Enabled: 'multipleChatProviders.enabled',
} as const;

/** Workbench settings mirrored into {@link ChatProvidersConfigKey}. */
export const ChatProvidersSettingId = {
	Enabled: 'chat.agentHost.multipleChatProviders.enabled',
} as const;

export const chatProvidersRootConfigSchema = createSchema({
	[ChatProvidersConfigKey.Enabled]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('multipleChatProviders.config.enabled', "Multiple Chat Providers"),
		default: false,
	}),
});
