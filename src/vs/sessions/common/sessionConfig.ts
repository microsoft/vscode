/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ResolveSessionConfigResult } from '../../platform/agentHost/common/state/protocol/commands.js';

export const USE_WORKTREE_SETTING = 'sessions.useWorktree';

export const USE_WORKTREE_SETTING_TREATMENT = 'agentSessionsUseWorktree';

export const SESSIONS_CHAT_TABS_SETTING = 'sessions.showChatTabs';

export const SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING = 'sessions.list.groupExternalSessions';

export const enum SessionsChatTabsMode {
	Multiple = 'multiple',
	Single = 'single',
}

export const SESSIONS_CHAT_TABS_DEFAULT = SessionsChatTabsMode.Multiple;

export function isSessionConfigComplete(config: ResolveSessionConfigResult): boolean {
	return (config.schema.required ?? []).every(property => config.values[property] !== undefined);
}
