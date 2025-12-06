/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize2 } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, ViewContainerLocation, IViewDescriptor, IViewsRegistry, Extensions as ViewExtensions } from '../../../../common/views.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ChatConfiguration } from '../../common/constants.js';
import { AGENT_SESSIONS_VIEW_CONTAINER_ID, AGENT_SESSIONS_VIEW_ID, AgentSessionsViewerOrientation, AgentSessionsViewerPosition } from './agentSessions.js';
import { IAgentSessionsService, AgentSessionsService } from './agentSessionsService.js';
import { AgentSessionsView } from './agentSessionsView.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { LocalAgentsSessionsProvider } from './localAgentSessionsProvider.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ISubmenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ArchiveAgentSessionAction, UnarchiveAgentSessionAction, RefreshAgentSessionsViewAction, FindAgentSessionAction, OpenAgentSessionInEditorGroupAction, OpenAgentSessionInNewEditorGroupAction, OpenAgentSessionInNewWindowAction, ShowAgentSessionsSidebar, HideAgentSessionsSidebar, RefreshAgentSessionsViewerAction, FindAgentSessionInViewerAction } from './agentSessionsActions.js';

//#region View Container and View Registration

const chatAgentsIcon = registerIcon('chat-sessions-icon', Codicon.commentDiscussionSparkle, 'Icon for Agent Sessions View');

const AGENT_SESSIONS_VIEW_TITLE = localize2('agentSessions.view.label', "Agents");

const agentSessionsViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: AGENT_SESSIONS_VIEW_CONTAINER_ID,
	title: AGENT_SESSIONS_VIEW_TITLE,
	icon: chatAgentsIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [AGENT_SESSIONS_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: AGENT_SESSIONS_VIEW_CONTAINER_ID,
	hideIfEmpty: true,
	order: 6,
}, ViewContainerLocation.AuxiliaryBar);

const agentSessionsViewDescriptor: IViewDescriptor = {
	id: AGENT_SESSIONS_VIEW_ID,
	containerIcon: chatAgentsIcon,
	containerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
	singleViewPaneContainerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
	name: AGENT_SESSIONS_VIEW_TITLE,
	canToggleVisibility: false,
	canMoveView: true,
	openCommandActionDescriptor: {
		id: AGENT_SESSIONS_VIEW_ID,
		title: AGENT_SESSIONS_VIEW_TITLE
	},
	ctorDescriptor: new SyncDescriptor(AgentSessionsView),
	when: ContextKeyExpr.and(
		ChatContextKeys.Setup.hidden.negate(),
		ChatContextKeys.Setup.disabled.negate(),
		ContextKeyExpr.equals(`config.${ChatConfiguration.AgentSessionsViewLocation}`, 'single-view'),
	)
};
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([agentSessionsViewDescriptor], agentSessionsViewContainer);

//#endregion

//#region Actions and Menus

registerAction2(ArchiveAgentSessionAction);
registerAction2(UnarchiveAgentSessionAction);
registerAction2(OpenAgentSessionInNewWindowAction);
registerAction2(OpenAgentSessionInEditorGroupAction);
registerAction2(OpenAgentSessionInNewEditorGroupAction);
registerAction2(RefreshAgentSessionsViewAction);
registerAction2(FindAgentSessionAction);
registerAction2(RefreshAgentSessionsViewerAction);
registerAction2(FindAgentSessionInViewerAction);
registerAction2(ShowAgentSessionsSidebar);
registerAction2(HideAgentSessionsSidebar);

MenuRegistry.appendMenuItem(MenuId.AgentSessionsViewTitle, {
	submenu: MenuId.AgentSessionsFilterSubMenu,
	title: localize2('filterAgentSessions', "Filter Agent Sessions"),
	group: 'navigation',
	order: 100,
	icon: Codicon.filter
} satisfies ISubmenuItem);

MenuRegistry.appendMenuItem(MenuId.AgentSessionsToolbar, {
	command: {
		id: ShowAgentSessionsSidebar.ID,
		title: ShowAgentSessionsSidebar.TITLE,
		icon: Codicon.layoutSidebarRightOff,
	},
	group: 'navigation',
	order: 5,
	when: ContextKeyExpr.and(
		ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.Stacked),
		ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Right)
	)
});

MenuRegistry.appendMenuItem(MenuId.AgentSessionsToolbar, {
	command: {
		id: ShowAgentSessionsSidebar.ID,
		title: ShowAgentSessionsSidebar.TITLE,
		icon: Codicon.layoutSidebarLeftOff,
	},
	group: 'navigation',
	order: 5,
	when: ContextKeyExpr.and(
		ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.Stacked),
		ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Left)
	)
});

MenuRegistry.appendMenuItem(MenuId.AgentSessionsToolbar, {
	command: {
		id: HideAgentSessionsSidebar.ID,
		title: HideAgentSessionsSidebar.TITLE,
		icon: Codicon.layoutSidebarRight,
	},
	group: 'navigation',
	order: 5,
	when: ContextKeyExpr.and(
		ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.SideBySide),
		ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Right)
	)
});

MenuRegistry.appendMenuItem(MenuId.AgentSessionsToolbar, {
	command: {
		id: HideAgentSessionsSidebar.ID,
		title: HideAgentSessionsSidebar.TITLE,
		icon: Codicon.layoutSidebarLeft,
	},
	group: 'navigation',
	order: 5,
	when: ContextKeyExpr.and(
		ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.SideBySide),
		ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Left)
	)
});

//#endregion

//#region Workbench Contributions

registerWorkbenchContribution2(LocalAgentsSessionsProvider.ID, LocalAgentsSessionsProvider, WorkbenchPhase.AfterRestored);
registerSingleton(IAgentSessionsService, AgentSessionsService, InstantiationType.Delayed);

//#endregion
