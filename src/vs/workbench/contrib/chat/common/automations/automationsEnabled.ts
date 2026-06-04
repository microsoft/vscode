/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';

/**
 * Configuration key that gates the entire Automations feature
 * (Customizations sidebar entry, Customizations editor section,
 * new-session "kind" dropdown option, and scheduled execution).
 *
 * Default is `false` so the feature stays hidden until a user opts in
 * via this setting or the "Toggle Automations" command palette entry.
 */
export const CHAT_AUTOMATIONS_ENABLED_SETTING = 'chat.automations.enabled';

/**
 * Context key mirroring {@link CHAT_AUTOMATIONS_ENABLED_SETTING}. Use this
 * in `when` clauses on menus and commands so the feature's UI only shows
 * when the setting is enabled.
 */
export const ChatAutomationsEnabledContext = new RawContextKey<boolean>('chatAutomationsEnabled', false, {
	type: 'boolean',
	description: 'True when the chat Automations feature is enabled via the chat.automations.enabled setting.',
});
