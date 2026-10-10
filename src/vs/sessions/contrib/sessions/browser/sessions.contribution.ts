/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewDescriptor, IViewsRegistry, Extensions as ViewContainerExtensions, WindowEnablement, ViewContainer, IViewContainersRegistry, ViewContainerLocation } from '../../../../workbench/common/views.js';
import { localize, localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { SessionsTitleBarContribution } from './sessionsTitleBarWidget.js';
import { SessionsTelemetryContribution } from './sessionsTelemetry.contribution.js';
import { SessionsAccountTelemetryContribution } from './sessionsAccountTelemetry.js';
import { NEW_SESSION_BUTTON_STYLE_SETTING, NEW_SESSION_BUTTON_STYLE_TREATMENT, NewSessionActionViewItemContribution, SessionConversationActionsContribution, SessionListActionsExperimentContribution } from './sessionsActions.js';
import { SessionsView, SessionsViewId } from './views/sessionsView.js';
import { AutomationsCustomViewContribution } from './views/automationsView.js';
import './views/sessionsViewActions.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING, SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING, SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING } from './views/sessionsList.js';
import { SessionsMouseNavigationContribution } from './sessionsMouseNavigation.js';
import './sessionDetailsAction.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { SessionsWindowNotifier } from './sessionsWindowNotifier.js';
import { ExternalSessionApplicationBadgeMode, SESSIONS_CHAT_TABS_DEFAULT, SESSIONS_CHAT_TABS_SETTING, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING, SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, SESSIONS_LIST_REARRANGE_TREATMENT, SessionsChatTabsMode, USE_WORKTREE_SETTING, USE_WORKTREE_SETTING_TREATMENT } from '../../../common/sessionConfig.js';

const agentSessionsViewIcon = registerIcon('chat-sessions-icon', Codicon.commentDiscussionSparkle, localize('agentSessionsViewIcon', 'Icon for Agent Sessions View'));
const AGENT_SESSIONS_VIEW_TITLE = localize2('agentSessions.view.label', "Sessions");
const SessionsContainerId = 'agentic.workbench.view.sessionsContainer';

const agentSessionsViewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: SessionsContainerId,
	title: AGENT_SESSIONS_VIEW_TITLE,
	icon: agentSessionsViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SessionsContainerId, { mergeViewWithContainerWhenSingleView: true, }]),
	storageId: SessionsContainerId,
	hideIfEmpty: true,
	order: 6,
	openCommandActionDescriptor: {
		id: SessionsContainerId,
		mnemonicTitle: localize({ key: 'miSessions', comment: ['&& denotes a mnemonic'] }, "&&Sessions"),
		keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX },
		order: 0
	},
	windowEnablement: WindowEnablement.Sessions
}, ViewContainerLocation.Sidebar, { isDefault: true });

const sessionsViewPaneDescriptor: IViewDescriptor = {
	id: SessionsViewId,
	containerIcon: agentSessionsViewIcon,
	containerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
	singleViewPaneContainerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
	name: AGENT_SESSIONS_VIEW_TITLE,
	canToggleVisibility: true,
	canMoveView: false,
	ctorDescriptor: new SyncDescriptor(SessionsView),
	windowEnablement: WindowEnablement.Sessions
};

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([sessionsViewPaneDescriptor], agentSessionsViewContainer);

export const sessionsConfiguration = {
	id: 'sessions',
	properties: {
		[SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING]: {
			type: 'boolean',
			tags: ['experimental'],
			description: localize('sessions.sidebar.separateNavigation', "Controls whether New Session, Automations, and Customizations are shown in a separate navigation list above the Sessions header. When disabled, Automations is shown inside the sessions tree, New Session remains a toolbar button, and Customizations remains a separate section."),
			default: false,
			experiment: {
				mode: 'auto',
				name: SESSIONS_LIST_REARRANGE_TREATMENT,
			},
		},
		[SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING]: {
			type: 'boolean',
			tags: ['preview'],
			description: localize('sessions.list.groupExternalSessions', "Controls whether external sessions are shown in a separate External section instead of workspace or time groups. Pinned sessions and custom groups keep their placement."),
			default: false,
			experiment: { mode: 'auto' }
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
			description: localize('sessions.list.externalApplicationBadge', "Controls where external sessions created in another application show the creating application."),
			default: ExternalSessionApplicationBadgeMode.Off,
			experiment: { mode: 'auto' }
		},
		[SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING]: {
			type: 'boolean',
			tags: ['experimental', 'advanced'],
			description: localize('sessions.list.externalApplicationBadge.showFrom', "Controls whether external session application badges include the word 'From'."),
			default: true,
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
			default: false,
			scope: ConfigurationScope.APPLICATION,
			experiment: { mode: 'auto' }
		},
		[SESSIONS_CHAT_TABS_SETTING]: {
			type: 'string',
			tags: ['preview'],
			enum: [SessionsChatTabsMode.Multiple, SessionsChatTabsMode.Single],
			enumDescriptions: [
				localize('sessions.showChatTabs.multiple', "Each chat is displayed as a tab in the session view."),
				localize('sessions.showChatTabs.single', "The active chat is displayed as the session view."),
			],
			description: localize('sessions.showChatTabs', "Controls whether chats in a session are shown as individual tabs or whether the active chat is shown as the session view."),
			default: SESSIONS_CHAT_TABS_DEFAULT,
			experiment: { mode: 'auto' },
		},
		[SESSIONS_MARK_AS_DONE_CONFETTI_SETTING]: {
			type: 'boolean',
			description: localize('sessions.markAsDoneConfetti', "Controls whether a confetti animation is shown when marking a session as done."),
			default: true,
			experiment: { mode: 'auto' }
			// https://github.com/microsoft/vscode/issues/335801
		},
		[NEW_SESSION_BUTTON_STYLE_SETTING]: {
			type: 'string',
			enum: ['default', 'lightweight', 'lightweightWithKeybindingBackground'],
			default: 'default',
			scope: ConfigurationScope.APPLICATION,
			included: false,
			tags: ['experimental'],
			experiment: {
				mode: 'auto',
				name: NEW_SESSION_BUTTON_STYLE_TREATMENT,
			},
			description: localize('sessions.newSessionButton.style', "Controls the visual style of the New Session button."),
		},
		[USE_WORKTREE_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			description: localize('sessions.useWorktree', "Controls whether New Worktree is checked for a workspace that has not started a session before. Each workspace otherwise uses the choice from its last started session."),
			experiment: {
				mode: 'auto',
				name: USE_WORKTREE_SETTING_TREATMENT
			},
		},
	},
} satisfies IConfigurationNode;

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(sessionsConfiguration);

registerWorkbenchContribution2(AutomationsCustomViewContribution.ID, AutomationsCustomViewContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SessionsTitleBarContribution.ID, SessionsTitleBarContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(NewSessionActionViewItemContribution.ID, NewSessionActionViewItemContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SessionListActionsExperimentContribution.ID, SessionListActionsExperimentContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SessionsMouseNavigationContribution.ID, SessionsMouseNavigationContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SessionsTelemetryContribution.ID, SessionsTelemetryContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionsAccountTelemetryContribution.ID, SessionsAccountTelemetryContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionsWindowNotifier.ID, SessionsWindowNotifier, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionConversationActionsContribution.ID, SessionConversationActionsContribution, WorkbenchPhase.AfterRestored);
