/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';

/**
 * Gates the entire Automations feature: sidebar entry, editor section,
 * session composer option, and scheduled execution. Enabled by default.
 */
export const CHAT_AUTOMATIONS_ENABLED_SETTING = 'chat.automations.enabled';
export const CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING = 'chat.automations.cloud.enabled';

/** Experimental: how the Automations page is laid out. */
export const CHAT_AUTOMATIONS_LAYOUT_SETTING = 'chat.automations.layout';
/** Experimental, prototype only: adds sample automations to the `modal` and `chatInput` layouts. */
export const CHAT_AUTOMATIONS_SAMPLE_DATA_SETTING = 'chat.automations.sampleData';

/** `page` is today's page, `modal` is a modal with a navigation sidebar, `chatInput` puts a chat input on top of the page. */
export type AutomationsLayout = 'page' | 'modal' | 'chatInput';

export function toAutomationsLayout(value: unknown): AutomationsLayout {
	return value === 'modal' || value === 'chatInput' ? value : 'page';
}

/** Context key mirroring {@link CHAT_AUTOMATIONS_ENABLED_SETTING}, for `when` clauses on menus/commands. */
export const ChatAutomationsEnabledContext = new RawContextKey<boolean>('chatAutomationsEnabled', false, {
	type: 'boolean',
	description: 'True when the chat Automations feature is enabled via the chat.automations.enabled setting.',
});
