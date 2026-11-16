/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SESSIONS_LIST_INDENT_ITEMS_SETTING, SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING, SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING, SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING } from './views/sessionsList.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { AutomationSessionsListMode, ExternalSessionApplicationBadgeMode, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING, SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, SESSIONS_LIST_INBOX_ENABLED_SETTING, SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING, USE_WORKTREE_SETTING } from '../common/sessionConfig.js';
import { IStringDictionary } from '../../../../base/common/collections.js';

/** The settings of the sessions list and of the sessions it opens. */
export const sessionsListConfigurationProperties = {
	[SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING]: {
		type: 'boolean',
		tags: ['preview'],
		description: localize('sessions.list.groupExternalSessions', "Controls whether external sessions are shown in a separate External section instead of workspace or time groups. Pinned sessions and custom groups keep their placement."),
		default: false,
		experiment: { mode: 'auto' }
	},
	[SESSIONS_LIST_INBOX_ENABLED_SETTING]: {
		type: 'boolean',
		tags: ['experimental'],
		description: localize('sessions.list.inboxEnabled', "Uses Inbox Mode as the default Sessions list grouping when no grouping has been chosen. Inbox Mode is always available in the Grouping menu. Explicit grouping choices are preserved."),
		default: false,
	},
	[SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING]: {
		type: 'string',
		tags: ['experimental'],
		enum: [
			ExternalSessionApplicationBadgeMode.Off,
			ExternalSessionApplicationBadgeMode.Title,
			ExternalSessionApplicationBadgeMode.Details,
		],
		enumDescriptions: [
			localize('sessions.list.externalApplicationBadge.off', "Do not show the creating application."),
			localize('sessions.list.externalApplicationBadge.title', "Show the creating application next to the session title."),
			localize('sessions.list.externalApplicationBadge.details', "Show the creating application first in the session details."),
		],
		description: localize('sessions.list.externalApplicationBadge', "Controls where sessions created in an application other than VS Code show the creating application."),
		default: ExternalSessionApplicationBadgeMode.Title,
		experiment: { mode: 'auto' }
	},
	[SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING]: {
		type: 'boolean',
		tags: ['experimental', 'advanced'],
		description: localize('sessions.list.externalApplicationBadgeShowFrom', "Controls whether session application badges include the word 'From'."),
		default: false,
		experiment: { mode: 'auto' }
	},
	[SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING]: {
		type: 'boolean',
		tags: ['preview'],
		description: localize('sessions.list.showEmptyDefaultGroups', "Controls whether the Chats group is shown in the sessions list even when it is empty."),
		default: true,
		experiment: { mode: 'auto' }
	},
	[SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING]: {
		type: 'boolean',
		tags: ['preview'],
		description: localize('sessions.list.showUnreadInCollapsedSections', "Controls whether collapsed sections in the sessions list show needs-attention, CI-failure, or unread indicators for the unarchived sessions they contain."),
		default: false,
		experiment: { mode: 'auto' }
	},
	[SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING]: {
		type: 'boolean',
		tags: ['experimental', 'advanced'],
		description: localize('sessions.list.showArchivedByDefault', "Controls whether the Done or Archived section is shown by default in the sessions list. This default is ignored after the corresponding filter is changed."),
		default: true,
		scope: ConfigurationScope.APPLICATION,
		experiment: { mode: 'auto' }
	},
	[SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING]: {
		type: 'string',
		tags: ['experimental', 'advanced'],
		enum: [AutomationSessionsListMode.Always, AutomationSessionsListMode.AfterReply, AutomationSessionsListMode.Never],
		enumDescriptions: [
			localize('sessions.list.showAutomationSessions.always', "Show every automation session in the sessions list."),
			localize('sessions.list.showAutomationSessions.afterReply', "Show an automation session in the sessions list once you send a message in it."),
			localize('sessions.list.showAutomationSessions.never', "Show automation sessions only in Automations."),
		],
		description: localize('sessions.list.showAutomationSessions', "Controls when automation sessions automatically also appear in the sessions list. They always remain in Automations. Use Show in Sessions List or Hide from Sessions List in a session's context menu to override this for that session."),
		default: AutomationSessionsListMode.AfterReply,
		experiment: { mode: 'auto' }
	},
	[SESSIONS_LIST_INDENT_ITEMS_SETTING]: {
		type: 'boolean',
		tags: ['experimental', 'advanced'],
		description: localize('sessions.list.indentItems', "Controls whether sessions and other rows in the sessions list are indented below their section header to show the list's hierarchy."),
		default: false,
		experiment: { mode: 'auto' }
	},
	[SESSIONS_MARK_AS_DONE_CONFETTI_SETTING]: {
		type: 'boolean',
		description: localize('sessions.markAsDoneConfetti', "Controls whether a confetti animation is shown when marking a session as done."),
		default: true,
		experiment: { mode: 'auto' }
		// https://github.com/microsoft/vscode/issues/335801
	},
	[USE_WORKTREE_SETTING]: {
		type: 'boolean',
		default: false,
		scope: ConfigurationScope.APPLICATION,
		description: localize('sessions.useWorktree', "Controls whether New Worktree is checked for a workspace that has not started a session before. Each workspace otherwise uses the choice from its last started session."),
	},
} satisfies IStringDictionary<IConfigurationPropertySchema>;
