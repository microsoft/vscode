/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './experiments/agentSessionsExperiments.contribution.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as QuickAccessExtensions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { AgentSessionsViewerOrientation, AgentSessionsViewerPosition } from './agentSessions.js';
import { IAgentSessionsService, AgentSessionsService } from './agentSessionsService.js';
import { LocalAgentsSessionsController } from './localAgentSessionsController.js';
import { registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ArchiveAgentSessionAction, ArchiveAgentSessionSectionAction, UnarchiveAgentSessionAction, OpenAgentSessionInEditorGroupAction, OpenAgentSessionInNewEditorGroupAction, OpenAgentSessionInNewWindowAction, ShowAgentSessionsSidebar, HideAgentSessionsSidebar, ToggleAgentSessionsSidebar, RefreshAgentSessionsViewerAction, FindAgentSessionInViewerAction, MarkAgentSessionUnreadAction, MarkAgentSessionReadAction, FocusAgentSessionsAction, SetAgentSessionsOrientationStackedAction, SetAgentSessionsOrientationSideBySideAction, PickAgentSessionAction, ArchiveAllAgentSessionsAction, MarkAllAgentSessionsReadAction, RenameAgentSessionAction, DeleteAgentSessionAction, DeleteAllLocalSessionsAction, MarkAgentSessionSectionReadAction, ToggleShowAgentSessionsAction, UnarchiveAgentSessionSectionAction, PinAgentSessionAction, UnpinAgentSessionAction, CollapseAllAgentSessionSectionsAction } from './agentSessionsActions.js';
import { AgentSessionsQuickAccessProvider, AGENT_SESSIONS_QUICK_ACCESS_PREFIX } from './agentSessionsQuickAccess.js';
//#region Actions and Menus
registerAction2(FocusAgentSessionsAction);
registerAction2(PickAgentSessionAction);
registerAction2(ArchiveAllAgentSessionsAction);
registerAction2(MarkAllAgentSessionsReadAction);
registerAction2(ArchiveAgentSessionSectionAction);
registerAction2(UnarchiveAgentSessionSectionAction);
registerAction2(MarkAgentSessionSectionReadAction);
registerAction2(CollapseAllAgentSessionSectionsAction);
registerAction2(ArchiveAgentSessionAction);
registerAction2(UnarchiveAgentSessionAction);
registerAction2(PinAgentSessionAction);
registerAction2(UnpinAgentSessionAction);
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
registerAction2(ToggleShowAgentSessionsAction);
registerAction2(SetAgentSessionsOrientationStackedAction);
registerAction2(SetAgentSessionsOrientationSideBySideAction);
// --- Agent Sessions Toolbar
MenuRegistry.appendMenuItem(MenuId.AgentSessionsToolbar, {
    submenu: MenuId.AgentSessionsViewerFilterSubMenu,
    title: localize2('filterAgentSessions', "Filter Agent Sessions"),
    group: 'navigation',
    order: 3,
    icon: Codicon.filter,
});
MenuRegistry.appendMenuItem(MenuId.AgentSessionsToolbar, {
    command: {
        id: ShowAgentSessionsSidebar.ID,
        title: ShowAgentSessionsSidebar.TITLE,
        icon: Codicon.layoutSidebarRightOff,
    },
    group: 'navigation',
    order: 5,
    when: ContextKeyExpr.and(ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.Stacked), ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Right))
});
MenuRegistry.appendMenuItem(MenuId.AgentSessionsToolbar, {
    command: {
        id: ShowAgentSessionsSidebar.ID,
        title: ShowAgentSessionsSidebar.TITLE,
        icon: Codicon.layoutSidebarLeftOff,
    },
    group: 'navigation',
    order: 5,
    when: ContextKeyExpr.and(ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.Stacked), ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Left))
});
MenuRegistry.appendMenuItem(MenuId.AgentSessionsToolbar, {
    command: {
        id: HideAgentSessionsSidebar.ID,
        title: HideAgentSessionsSidebar.TITLE,
        icon: Codicon.layoutSidebarRight,
    },
    group: 'navigation',
    order: 5,
    when: ContextKeyExpr.and(ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.SideBySide), ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Right))
});
MenuRegistry.appendMenuItem(MenuId.AgentSessionsToolbar, {
    command: {
        id: HideAgentSessionsSidebar.ID,
        title: HideAgentSessionsSidebar.TITLE,
        icon: Codicon.layoutSidebarLeft,
    },
    group: 'navigation',
    order: 5,
    when: ContextKeyExpr.and(ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.SideBySide), ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Left))
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
    when: ContextKeyExpr.and(ContextKeyExpr.or(ChatContextKeys.agentSessionsViewerVisible.negate(), ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.Stacked)), ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Left))
});
MenuRegistry.appendMenuItem(MenuId.ChatViewSessionTitleToolbar, {
    command: {
        id: ShowAgentSessionsSidebar.ID,
        title: ShowAgentSessionsSidebar.TITLE,
        icon: Codicon.layoutSidebarRightOff,
    },
    group: 'navigation',
    order: 1,
    when: ContextKeyExpr.and(ContextKeyExpr.or(ChatContextKeys.agentSessionsViewerVisible.negate(), ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.Stacked)), ChatContextKeys.agentSessionsViewerPosition.isEqualTo(AgentSessionsViewerPosition.Right))
});
//#endregion
//#region Quick Access
Registry.as(QuickAccessExtensions.Quickaccess).registerQuickAccessProvider({
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
registerWorkbenchContribution2(LocalAgentsSessionsController.ID, LocalAgentsSessionsController, 3 /* WorkbenchPhase.AfterRestored */);
registerSingleton(IAgentSessionsService, AgentSessionsService, 1 /* InstantiationType.Delayed */);
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9ucy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLHdEQUF3RCxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsaUJBQWlCLEVBQXFCLE1BQU0sNERBQTRELENBQUM7QUFDbEgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxVQUFVLElBQUkscUJBQXFCLEVBQXdCLE1BQU0sMERBQTBELENBQUM7QUFDckksT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ2pHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3hGLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSw4QkFBOEIsRUFBa0IsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRyxPQUFPLEVBQWdCLE1BQU0sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDeEgsT0FBTyxFQUFFLHlCQUF5QixFQUFFLGdDQUFnQyxFQUFFLDJCQUEy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