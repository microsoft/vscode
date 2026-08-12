/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';

/**
 * Gates the entire Automations feature: sidebar entry, editor section,
 * session composer option, and scheduled execution. Default `false`.
 */
export const CHAT_AUTOMATIONS_ENABLED_SETTING = 'chat.automations.enabled';

/** Per-run timeout in minutes. Hung runs are cancelled and marked failed so they don't block the dispatch chain. */
export const CHAT_AUTOMATIONS_RUN_TIMEOUT_MINUTES_SETTING = 'chat.automations.runTimeoutMinutes';

/** Default for {@link CHAT_AUTOMATIONS_RUN_TIMEOUT_MINUTES_SETTING}. */
export const DEFAULT_AUTOMATIONS_RUN_TIMEOUT_MINUTES = 30;

/** Context key mirroring {@link CHAT_AUTOMATIONS_ENABLED_SETTING}, for `when` clauses on menus/commands. */
export const ChatAutomationsEnabledContext = new RawContextKey<boolean>('chatAutomationsEnabled', false, {
	type: 'boolean',
	description: 'True when the chat Automations feature is enabled via the chat.automations.enabled setting.',
});
