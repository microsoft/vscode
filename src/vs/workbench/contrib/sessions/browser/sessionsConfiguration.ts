/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationNode, IConfigurationPropertySchema, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { SESSIONS_LIST_CANVASES_SECTION_SETTING, SESSIONS_LIST_INDENT_ITEMS_SETTING, SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING, SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING, SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING } from './views/sessionsListCommon.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { AutomationSessionsListMode, ExternalSessionApplicationBadgeMode, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING, SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, SESSIONS_LIST_INBOX_AUTO_ADVANCE_SETTING, SESSIONS_LIST_INBOX_ENABLED_SETTING, SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING, USE_WORKTREE_SETTING } from '../common/sessionConfig.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import product from '../../../../platform/product/common/product.js';
import { NEW_SESSION_WELCOME_GRAPHIC_SETTING, NEW_SESSION_WELCOME_GRAPHICS, WORKSPACE_OPT_OUT_SETTING } from '../common/chatConstants.js';

/** The settings of the sessions list, of the sessions it opens and of its New Session composer. */
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
		description: localize('sessions.list.inboxEnabled', "Shows a toggle on the Sessions list to open Inbox Mode and keeps session attention up to date even outside Inbox Mode. Turning the toggle off restores the previous grouping. Disabling this setting also leaves Inbox Mode."),
		default: false,
	},
	[SESSIONS_LIST_INBOX_AUTO_ADVANCE_SETTING]: {
		type: 'string',
		tags: ['accessibility'],
		enum: ['auto', 'on', 'off', 'newSession'],
		enumDescriptions: [
			localize('sessions.list.inboxAutoAdvance.auto', "Automatically move to the next Inbox session after sending a reply or approving a request, unless a screen reader is attached."),
			localize('sessions.list.inboxAutoAdvance.on', "Always move to the next Inbox session after sending a reply or approving a request."),
			localize('sessions.list.inboxAutoAdvance.off', "Stay in the current session after sending a reply or approving a request."),
			localize('sessions.list.inboxAutoAdvance.newSession', "Open New Session and focus its chat input after sending a reply or approving a request."),
		],
		description: localize('sessions.list.inboxAutoAdvance', "Controls where focus moves after sending a reply or approving a request in an Inbox session: the next visible Inbox session (or the Inbox heading when none remain), the current session, or the New Session chat input."),
		default: 'auto',
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
		tags: ['advanced'],
		enum: [AutomationSessionsListMode.Always, AutomationSessionsListMode.AfterReply, AutomationSessionsListMode.Never],
		enumDescriptions: [
			localize('sessions.list.showAutomationSessions.always', "Show every automation session in the sessions list."),
			localize('sessions.list.showAutomationSessions.afterReply', "Show an automation session in the sessions list once you send a message in it."),
			localize('sessions.list.showAutomationSessions.never', "Show automation sessions only in Automations."),
		],
		description: localize('sessions.list.showAutomationSessions', "Controls when automation sessions automatically also appear in the sessions list. They always remain in Automations. Use Show in Sessions List or Hide from Sessions List in a session's context menu to override this for that session."),
		default: AutomationSessionsListMode.AfterReply,
	},
	[SESSIONS_LIST_CANVASES_SECTION_SETTING]: {
		type: 'boolean',
		tags: ['experimental'],
		description: localize('sessions.list.canvasesSection', "Controls whether canvases pinned to the sidebar are listed in a Canvases section, whose Open Canvas action starts a session with a canvas without sending a message. Pinned canvases otherwise follow the navigation shortcuts."),
		default: false,
		experiment: { mode: 'auto' }
	},
	[SESSIONS_LIST_INDENT_ITEMS_SETTING]: {
		type: 'boolean',
		tags: ['experimental', 'advanced'],
		description: localize('sessions.list.indentItems', "Controls whether sessions and other rows in the sessions list are indented below their section header to show the list's hierarchy."),
		default: product.quality !== 'stable',
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
	[WORKSPACE_OPT_OUT_SETTING]: {
		type: 'boolean',
		default: false,
		scope: ConfigurationScope.WINDOW,
		description: localize('sessions.chat.experimental.workspaceOptOut', "Controls whether hovering over or focusing the workspace picker shows a button to chat without a workspace. Requires a compatible harness and environment. Chat remains available in the workspace list when this setting is disabled."),
		tags: ['experimental'],
		experiment: { mode: 'auto' },
	},
	[NEW_SESSION_WELCOME_GRAPHIC_SETTING]: {
		type: 'string',
		enum: [...NEW_SESSION_WELCOME_GRAPHICS],
		enumDescriptions: [
			localize('sessions.chat.welcomeGraphic.none', "Show no graphic."),
			localize('sessions.chat.welcomeGraphic.windowOverview', "Show an animation in which the single task of the editor window becomes several tasks side by side in the Agents window."),
			localize('sessions.chat.welcomeGraphic.windowOverviewStatic', "Show the single task of the editor window next to several tasks side by side in the Agents window."),
			localize('sessions.chat.welcomeGraphic.workingCopies', "Show an animation in which a project becomes sessions that work in separate copies of that project and in another project."),
			localize('sessions.chat.welcomeGraphic.workingCopiesStatic', "Show a project in the editor window next to sessions that work in separate copies of that project and in another project in the Agents window."),
			localize('sessions.chat.welcomeGraphic.windowComparison', "Show an animated comparison of one task at a time in the editor window with parallel tasks across copies and projects in the Agents window."),
		],
		default: 'none',
		scope: ConfigurationScope.APPLICATION,
		description: localize('sessions.chat.welcomeGraphic', "Controls which graphic is shown above the welcome message of a new session until you have started two sessions in the Agents window."),
		tags: ['advanced', 'experimental'],
		experiment: { mode: 'auto' },
	},
} satisfies IStringDictionary<IConfigurationPropertySchema>;

let sessionsListConfiguration: IConfigurationNode | undefined;
let sessionsListConfigurationHolds = 0;

/**
 * Registers the settings of the sessions list and of the sessions it opens, as the Agents window registers them, for as long
 * as anything of an editor window needs them: the sessions list, the chat part, whose header sets one of them, and the New
 * Session composer, whose workspace opt-out and welcome graphic read two of them. They
 * register once, however many hold them.
 */
export function registerSessionsListConfiguration(): IDisposable {
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	if (sessionsListConfigurationHolds++ === 0) {
		// Of a copy of the properties: the registry drops a property that another node registers already, such as the Agents
		// window's, from the node it registers, which must not change the shared properties
		sessionsListConfiguration = { id: 'sessionsList', properties: { ...sessionsListConfigurationProperties } };
		configurationRegistry.registerConfiguration(sessionsListConfiguration);
	}
	return toDisposable(() => {
		if (--sessionsListConfigurationHolds === 0 && sessionsListConfiguration) {
			configurationRegistry.deregisterConfigurations([sessionsListConfiguration]);
			sessionsListConfiguration = undefined;
		}
	});
}
