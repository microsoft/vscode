/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewDescriptor, IViewsRegistry, Extensions as ViewContainerExtensions, WindowEnablement, ViewContainer, IViewContainersRegistry, ViewContainerLocation } from '../../../../workbench/common/views.js';
import { localize, localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { SessionsTitleBarContribution } from './sessionsTitleBarWidget.js';
import { SessionsTelemetryContribution } from './sessionsTelemetry.contribution.js';
import { NewSessionActionViewItemContribution, SessionConversationsActionViewItemContribution, SessionConversationsMenuContribution, SessionNewChatActionViewItemContribution } from './sessionsActions.js';
import { SessionsView, SessionsViewId } from './views/sessionsView.js';
import { AutomationsCustomViewContribution } from './views/automationsView.js';
import './views/sessionsViewActions.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING } from './views/sessionsList.js';
import { SessionsMouseNavigationContribution } from './sessionsMouseNavigation.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_INPUT_WINDOW_TOGGLE_COMMAND_ID } from '../../../../workbench/contrib/chat/common/chatInputWindow.js';
import { OmniChatEnabledSettingId } from '../../../../workbench/contrib/chat/common/sessionRouter.js';
import { Menus } from '../../../browser/menus.js';
import { OmniCIFailureContribution } from './omniCIFailureContribution.js';
import { BlockedSessionsCIFixModel, IBlockedSessionsCIFixModel } from './blockedSessionsCIFixModel.js';

const agentSessionsViewIcon = registerIcon('chat-sessions-icon', Codicon.commentDiscussionSparkle, localize('agentSessionsViewIcon', 'Icon for Agent Sessions View'));
const AGENT_SESSIONS_VIEW_TITLE = localize2('agentSessions.view.label', "Sessions");
const SessionsContainerId = 'agentic.workbench.view.sessionsContainer';

registerSingleton(IBlockedSessionsCIFixModel, BlockedSessionsCIFixModel, InstantiationType.Delayed);

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

MenuRegistry.appendMenuItem(Menus.SidebarSessionsHeader, {
	command: {
		id: CHAT_INPUT_WINDOW_TOGGLE_COMMAND_ID,
		title: localize2('chat.toggleInputWindow', "Toggle Floating Chat Input Window"),
		icon: Codicon.arrowCircleUpSparkle,
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.equals(`config.${OmniChatEnabledSettingId}`, true)
	),
});

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING]: {
			type: 'boolean',
			tags: ['preview'],
			description: localize('sessions.list.showEmptyDefaultGroups', "Controls whether the Chats group is shown in the sessions list even when it is empty."),
			default: true,
			experiment: { mode: 'auto' }
		},
	},
});

registerWorkbenchContribution2(AutomationsCustomViewContribution.ID, AutomationsCustomViewContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SessionsTitleBarContribution.ID, SessionsTitleBarContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(OmniCIFailureContribution.ID, OmniCIFailureContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(NewSessionActionViewItemContribution.ID, NewSessionActionViewItemContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SessionConversationsActionViewItemContribution.ID, SessionConversationsActionViewItemContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SessionsMouseNavigationContribution.ID, SessionsMouseNavigationContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SessionsTelemetryContribution.ID, SessionsTelemetryContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionConversationsMenuContribution.ID, SessionConversationsMenuContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionNewChatActionViewItemContribution.ID, SessionNewChatActionViewItemContribution, WorkbenchPhase.AfterRestored);
