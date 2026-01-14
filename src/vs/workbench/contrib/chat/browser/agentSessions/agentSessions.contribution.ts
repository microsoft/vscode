/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as QuickAccessExtensions, IQuickAccessRegistry } from '../../../../../platform/quickinput/common/quickAccess.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { AgentSessionsViewerOrientation, AgentSessionsViewerPosition } from './agentSessions.js';
import { IAgentSessionsService, AgentSessionsService } from './agentSessionsService.js';
import { LocalAgentsSessionsProvider } from './localAgentSessionsProvider.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ISubmenuItem, MenuId, MenuRegistry, registerAction2, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ArchiveAgentSessionAction, ArchiveAgentSessionSectionAction, UnarchiveAgentSessionSectionAction, UnarchiveAgentSessionAction, OpenAgentSessionInEditorGroupAction, OpenAgentSessionInNewEditorGroupAction, OpenAgentSessionInNewWindowAction, ShowAgentSessionsSidebar, HideAgentSessionsSidebar, ToggleAgentSessionsSidebar, RefreshAgentSessionsViewerAction, FindAgentSessionInViewerAction, MarkAgentSessionUnreadAction, MarkAgentSessionReadAction, FocusAgentSessionsAction, SetAgentSessionsOrientationStackedAction, SetAgentSessionsOrientationSideBySideAction, ToggleChatViewSessionsAction, PickAgentSessionAction, ArchiveAllAgentSessionsAction, RenameAgentSessionAction, DeleteAgentSessionAction, DeleteAllLocalSessionsAction } from './agentSessionsActions.js';
import { AgentSessionsQuickAccessProvider, AGENT_SESSIONS_QUICK_ACCESS_PREFIX } from './agentSessionsQuickAccess.js';
import { IFocusViewService, FocusViewService } from './focusViewService.js';
import { EnterFocusViewAction, ExitFocusViewAction, OpenInChatPanelAction, ToggleAgentsControl } from './focusViewActions.js';
import { AgentsControlViewItem } from './agentsControl.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';

//#region Actions and Menus

registerAction2(FocusAgentSessionsAction);
registerAction2(PickAgentSessionAction);
registerAction2(ArchiveAllAgentSessionsAction);
registerAction2(ArchiveAgentSessionSectionAction);
registerAction2(UnarchiveAgentSessionSectionAction);
registerAction2(ArchiveAgentSessionAction);
registerAction2(UnarchiveAgentSessionAction);
registerAction2(RenameAgentSessionAction);
registerAction2(DeleteAgentSessionAction);
registerAction2(DeleteAllLocalSessionsAction);
registerAction2(MarkAgentSessionUnreadAction);
registerAction2(MarkAgentSessionReadAction);
registerAction2(OpenAgentSessionInNewWindowAction);
registerAction2(OpenAgentSessionInEditorGroupAction);
registerAction2(OpenAgentSessionInNewEditorGroupAction);
registerAction2(RefreshAgentSessionsViewerAction);
registerAction2(FindAgentSessionInViewerAction);
registerAction2(ShowAgentSessionsSidebar);
registerAction2(HideAgentSessionsSidebar);
registerAction2(ToggleAgentSessionsSidebar);
registerAction2(ToggleChatViewSessionsAction);
registerAction2(SetAgentSessionsOrientationStackedAction);
registerAction2(SetAgentSessionsOrientationSideBySideAction);

// Focus View
registerAction2(EnterFocusViewAction);
registerAction2(ExitFocusViewAction);
registerAction2(OpenInChatPanelAction);
registerAction2(ToggleAgentsControl);

// --- Agent Sessions Toolbar

MenuRegistry.appendMenuItem(MenuId.AgentSessionsToolbar, {
	submenu: MenuId.AgentSessionsViewerFilterSubMenu,
	title: localize2('filterAgentSessions', "Filter Agent Sessions"),
	group: 'navigation',
	order: 3,
	icon: Codicon.filter,
	when: ChatContextKeys.agentSessionsViewerLimited.negate()
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

// --- Sessions Title Toolbar

MenuRegistry.appendMenuItem(MenuId.ChatViewSessionTitleToolbar, {
	command: {
		id: ShowAgentSessionsSidebar.ID,
		title: ShowAgentSessionsSidebar.TITLE,
		icon: Codicon.layoutSidebarLeftOff,
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(
		ContextKeyExpr.or(
			ChatContextKeys.agentSessionsViewerVisible.negate(),
			ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.Stacked),
		),
		ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Left)
	)
});

MenuRegistry.appendMenuItem(MenuId.ChatViewSessionTitleToolbar, {
	command: {
		id: ShowAgentSessionsSidebar.ID,
		title: ShowAgentSessionsSidebar.TITLE,
		icon: Codicon.layoutSidebarRightOff,
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(
		ContextKeyExpr.or(
			ChatContextKeys.agentSessionsViewerVisible.negate(),
			ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.Stacked),
		),
		ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Right)
	)
});

//#endregion

//#region Quick Access

Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.Quickaccess).registerQuickAccessProvider({
	ctor: AgentSessionsQuickAccessProvider,
	prefix: AGENT_SESSIONS_QUICK_ACCESS_PREFIX,
	contextKey: 'inAgentSessionsPicker',
	when: ChatContextKeys.enabled,
	placeholder: localize('agentSessionsQuickAccessPlaceholder', "Search agent sessions by name"),
	helpEntries: [{
		description: localize('agentSessionsQuickAccessHelp', "Show All Agent Sessions"),
		commandId: 'workbench.action.chat.history',
	}]
});

//#endregion

//#region Workbench Contributions

registerWorkbenchContribution2(LocalAgentsSessionsProvider.ID, LocalAgentsSessionsProvider, WorkbenchPhase.AfterRestored);
registerSingleton(IAgentSessionsService, AgentSessionsService, InstantiationType.Delayed);
registerSingleton(IFocusViewService, FocusViewService, InstantiationType.Delayed);

// Register Agents Control as a menu item in the command center (alongside the search box, not replacing it)
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	submenu: MenuId.AgentsControlMenu,
	title: localize('agentsControl', "Agents"),
	icon: Codicon.chatSparkle,
	when: ContextKeyExpr.has(`config.${ChatConfiguration.AgentSessionProjectionEnabled}`),
	order: 10002 // to the right of the chat button
});

// Register a placeholder action to the submenu so it appears (required for submenus)
MenuRegistry.appendMenuItem(MenuId.AgentsControlMenu, {
	command: {
		id: 'workbench.action.chat.toggle',
		title: localize('openChat', "Open Chat"),
	},
	when: ContextKeyExpr.has(`config.${ChatConfiguration.AgentSessionProjectionEnabled}`),
});

/**
 * Provides custom rendering for the agents control in the command center.
 * Uses IActionViewItemService to render a custom AgentsControlViewItem
 * for the AgentsControlMenu submenu.
 * Also adds a CSS class to the workbench when agents control is enabled.
 */
class AgentsControlRendering extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsControl.rendering';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();

		this._register(actionViewItemService.register(MenuId.CommandCenter, MenuId.AgentsControlMenu, (action, options) => {
			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(AgentsControlViewItem, action, options);
		}, undefined));

		// Add/remove CSS class on workbench based on setting
		const updateClass = () => {
			const enabled = configurationService.getValue<boolean>(ChatConfiguration.AgentSessionProjectionEnabled) === true;
			mainWindow.document.body.classList.toggle('agents-control-enabled', enabled);
		};
		updateClass();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentSessionProjectionEnabled)) {
				updateClass();
			}
		}));
	}
}

// Register the workbench contribution that provides custom rendering for the agents control
registerWorkbenchContribution2(AgentsControlRendering.ID, AgentsControlRendering, WorkbenchPhase.AfterRestored);

//#endregion
