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
import { ArchiveAgentSessionAction, ArchiveAgentSessionSectionAction, UnarchiveAgentSessionSectionAction, UnarchiveAgentSessionAction, OpenAgentSessionInEditorGroupAction, OpenAgentSessionInNewEditorGroupAction, OpenAgentSessionInNewWindowAction, ShowAgentSessionsSidebar, HideAgentSessionsSidebar, ToggleAgentSessionsSidebar, RefreshAgentSessionsViewerAction, FindAgentSessionInViewerAction, MarkAgentSessionUnreadAction, MarkAgentSessionReadAction, MarkAgentSessionSectionReadAction, FocusAgentSessionsAction, SetAgentSessionsOrientationStackedAction, SetAgentSessionsOrientationSideBySideAction, ShowAllAgentSessionsAction, ShowRecentAgentSessionsAction, HideAgentSessionsAction, PickAgentSessionAction, ArchiveAllAgentSessionsAction, RenameAgentSessionAction, DeleteAgentSessionAction, DeleteAllLocalSessionsAction } from './agentSessionsActions.js';
import { AgentSessionsQuickAccessProvider, AGENT_SESSIONS_QUICK_ACCESS_PREFIX } from './agentSessionsQuickAccess.js';
import { IAgentSessionProjectionService, AgentSessionProjectionService } from './agentSessionProjectionService.js';
import { EnterAgentSessionProjectionAction, ExitAgentSessionProjectionAction, ToggleAgentStatusAction, ToggleAgentSessionProjectionAction } from './agentSessionProjectionActions.js';
import { IAgentStatusService, AgentStatusService } from './agentStatusService.js';
import { AgentStatusWidget } from './agentStatusWidget.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import { AuxiliaryBarMaximizedContext } from '../../../../common/contextkeys.js';
import { LayoutSettings } from '../../../../services/layout/browser/layoutService.js';

//#region Actions and Menus

registerAction2(FocusAgentSessionsAction);
registerAction2(PickAgentSessionAction);
registerAction2(ArchiveAllAgentSessionsAction);
registerAction2(ArchiveAgentSessionSectionAction);
registerAction2(UnarchiveAgentSessionSectionAction);
registerAction2(MarkAgentSessionSectionReadAction);
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
registerAction2(ShowAllAgentSessionsAction);
registerAction2(ShowRecentAgentSessionsAction);
registerAction2(HideAgentSessionsAction);
registerAction2(SetAgentSessionsOrientationStackedAction);
registerAction2(SetAgentSessionsOrientationSideBySideAction);

// Agent Session Projection
registerAction2(EnterAgentSessionProjectionAction);
registerAction2(ExitAgentSessionProjectionAction);
registerAction2(ToggleAgentStatusAction);
registerAction2(ToggleAgentSessionProjectionAction);

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
		ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Right),
		AuxiliaryBarMaximizedContext.negate()
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
		ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Left),
		AuxiliaryBarMaximizedContext.negate()
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
		ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Right),
		AuxiliaryBarMaximizedContext.negate()
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
		ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Left),
		AuxiliaryBarMaximizedContext.negate()
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
registerSingleton(IAgentStatusService, AgentStatusService, InstantiationType.Delayed);
registerSingleton(IAgentSessionProjectionService, AgentSessionProjectionService, InstantiationType.Delayed);

// Register Agent Status as a menu item in the command center (alongside the search box, not replacing it)
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	submenu: MenuId.AgentsControlMenu,
	title: localize('agentsControl', "Agents"),
	icon: Codicon.chatSparkle,
	when: ContextKeyExpr.has(`config.${ChatConfiguration.AgentStatusEnabled}`),
	order: 10002 // to the right of the chat button
});

// Register a placeholder action to the submenu so it appears (required for submenus)
MenuRegistry.appendMenuItem(MenuId.AgentsControlMenu, {
	command: {
		id: 'workbench.action.chat.toggle',
		title: localize('openChat', "Open Chat"),
	},
	when: ContextKeyExpr.has(`config.${ChatConfiguration.AgentStatusEnabled}`),
});

/**
 * Provides custom rendering for the agent status in the command center.
 * Uses IActionViewItemService to render a custom AgentStatusWidget
 * for the AgentsControlMenu submenu.
 * Also adds a CSS class to the workbench when agent status is enabled.
 */
class AgentStatusRendering extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentStatus.rendering';

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
			return instantiationService.createInstance(AgentStatusWidget, action, options);
		}, undefined));

		// Add/remove CSS class on workbench based on setting
		// Also force enable command center when agent status is enabled
		const updateClass = () => {
			const enabled = configurationService.getValue<boolean>(ChatConfiguration.AgentStatusEnabled) === true;
			mainWindow.document.body.classList.toggle('agent-status-enabled', enabled);

			// Force enable command center when agent status is enabled
			if (enabled && configurationService.getValue<boolean>(LayoutSettings.COMMAND_CENTER) !== true) {
				configurationService.updateValue(LayoutSettings.COMMAND_CENTER, true);
			}
		};
		updateClass();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentStatusEnabled)) {
				updateClass();
			}
		}));
	}
}

// Register the workbench contribution that provides custom rendering for the agent status
registerWorkbenchContribution2(AgentStatusRendering.ID, AgentStatusRendering, WorkbenchPhase.AfterRestored);

//#endregion
