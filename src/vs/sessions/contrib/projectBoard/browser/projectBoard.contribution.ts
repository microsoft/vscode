/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../nls.js';
import { IProjectBoardService } from './projectBoardService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { OPEN_AGENT_PROJECT_BOARD_COMMAND_ID } from '../../../../platform/window/common/window.js';
import { ActiveEditorContext, IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ChatEditorInput } from '../../../../workbench/contrib/chat/browser/widgetHosts/editor/chatEditorInput.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { KanbanCustomViewContribution } from './kanbanView.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Menus } from '../../../browser/menus.js';
import { KANBAN_ADD_COLUMN_COMMAND_ID, KANBAN_ADD_ROW_COMMAND_ID, KANBAN_NEW_SESSION_COMMAND_ID, KANBAN_TOGGLE_ARCHIVED_COMMAND_ID } from '../../../common/projectBoard.js';
import { KanbanAutoIncludeSessionsContext, KanbanBoardEditableContext, KanbanShowArchivedContext, KanbanShowCreditsContext, KanbanShowLastPromptContext, KanbanShowModelDetailsContext, KanbanShowPermissionDetailsContext, KanbanShowStateDurationContext } from '../../../common/contextkeys.js';

registerWorkbenchContribution2(KanbanCustomViewContribution.ID, KanbanCustomViewContribution, WorkbenchPhase.BlockRestore);

registerAction2(class AddKanbanRowAction extends Action2 {
	constructor() {
		super({
			id: KANBAN_ADD_ROW_COMMAND_ID,
			title: localize2('projectBoard.addRow', "Add Row"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, KanbanBoardEditableContext),
			menu: [{ id: Menus.CustomViewKanban, group: 'navigation', order: 1 }],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IProjectBoardService).addAxis('row');
	}
});

registerAction2(class AddKanbanColumnAction extends Action2 {
	constructor() {
		super({
			id: KANBAN_ADD_COLUMN_COMMAND_ID,
			title: localize2('projectBoard.addColumn', "Add Column"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, KanbanBoardEditableContext),
			menu: [{ id: Menus.CustomViewKanban, group: 'navigation', order: 2 }],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IProjectBoardService).addAxis('column');
	}
});

registerAction2(class ToggleKanbanArchivedAction extends Action2 {
	constructor() {
		super({
			id: KANBAN_TOGGLE_ARCHIVED_COMMAND_ID,
			title: localize2('projectBoard.showArchived', "Show Archived"),
			precondition: ChatContextKeys.enabled,
			toggled: KanbanShowArchivedContext,
			menu: [{ id: Menus.CustomViewKanban, group: 'navigation', order: 3 }],
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IProjectBoardService).toggleArchived();
	}
});

registerAction2(class NewKanbanSessionAction extends Action2 {
	constructor() {
		super({
			id: KANBAN_NEW_SESSION_COMMAND_ID,
			title: localize2('projectBoard.createSession', "New Session"),
			precondition: ChatContextKeys.enabled,
			menu: [{ id: Menus.CustomViewKanban, group: 'navigation', order: 4 }],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IProjectBoardService).createSession();
	}
});

MenuRegistry.appendMenuItem(Menus.CustomViewKanban, {
	submenu: Menus.CustomViewKanbanSettings,
	title: localize2('projectBoard.boardSettings', "Board Settings"),
	icon: Codicon.settingsGear,
	group: 'navigation',
	order: 5,
	when: KanbanBoardEditableContext,
});

registerAction2(class ToggleKanbanAutoIncludeSessionsAction extends Action2 {
	constructor() {
		super({
			id: 'projectBoard.settings.autoIncludeSessions',
			title: localize2('projectBoard.autoIncludeSessions', "Auto-include Sessions"),
			precondition: KanbanBoardEditableContext,
			toggled: KanbanAutoIncludeSessionsContext,
			menu: [{ id: Menus.CustomViewKanbanSettings, group: 'navigation', order: 1 }],
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IProjectBoardService).toggleAutoIncludeSessions();
	}
});

registerAction2(class ToggleKanbanStateDurationAction extends Action2 {
	constructor() {
		super({
			id: 'projectBoard.settings.stateDuration',
			title: localize2('projectBoard.showStateDuration', "Show Time in State"),
			precondition: KanbanBoardEditableContext,
			toggled: KanbanShowStateDurationContext,
			menu: [{ id: Menus.CustomViewKanbanSettings, group: 'navigation', order: 2 }],
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IProjectBoardService).toggleDisplayOption('showStateDuration');
	}
});

registerAction2(class ToggleKanbanCreditsAction extends Action2 {
	constructor() {
		super({
			id: 'projectBoard.settings.credits',
			title: localize2('projectBoard.showCredits', "Show AI Credits"),
			precondition: KanbanBoardEditableContext,
			toggled: KanbanShowCreditsContext,
			menu: [{ id: Menus.CustomViewKanbanSettings, group: 'navigation', order: 3 }],
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IProjectBoardService).toggleDisplayOption('showCredits');
	}
});

registerAction2(class ToggleKanbanLastPromptAction extends Action2 {
	constructor() {
		super({
			id: 'projectBoard.settings.lastPrompt',
			title: localize2('projectBoard.showLastPrompt', "Show Last Prompt"),
			precondition: KanbanBoardEditableContext,
			toggled: KanbanShowLastPromptContext,
			menu: [{ id: Menus.CustomViewKanbanSettings, group: 'navigation', order: 4 }],
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IProjectBoardService).toggleDisplayOption('showLastPrompt');
	}
});

registerAction2(class ToggleKanbanModelDetailsAction extends Action2 {
	constructor() {
		super({
			id: 'projectBoard.settings.modelDetails',
			title: localize2('projectBoard.showModelDetails', "Show Model Details"),
			precondition: KanbanBoardEditableContext,
			toggled: KanbanShowModelDetailsContext,
			menu: [{ id: Menus.CustomViewKanbanSettings, group: 'navigation', order: 5 }],
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IProjectBoardService).toggleDisplayOption('showModelDetails');
	}
});

registerAction2(class ToggleKanbanPermissionDetailsAction extends Action2 {
	constructor() {
		super({
			id: 'projectBoard.settings.permissionDetails',
			title: localize2('projectBoard.showPermissionDetails', "Show Agent & Permissions"),
			precondition: KanbanBoardEditableContext,
			toggled: KanbanShowPermissionDetailsContext,
			menu: [{ id: Menus.CustomViewKanbanSettings, group: 'navigation', order: 6 }],
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IProjectBoardService).toggleDisplayOption('showPermissionDetails');
	}
});

registerAction2(class OpenProjectBoardAction extends Action2 {
	constructor() {
		super({
			id: OPEN_AGENT_PROJECT_BOARD_COMMAND_ID,
			title: localize2('openAgentProjectBoard', "Agents: Open Agents Hub"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, IsSessionsWindowContext),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const lifecycleService = accessor.get(ILifecycleService);
		const projectBoardService = accessor.get(IProjectBoardService);
		await lifecycleService.when(LifecyclePhase.Restored);
		await projectBoardService.open();
	}
});

registerAction2(class CloseStandaloneSessionAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.agentProjectBoard.closeSession',
			title: localize2('closeStandaloneSession', "Close Standalone Chat"),
			precondition: ContextKeyExpr.and(IsSessionsWindowContext, IsAuxiliaryWindowContext, ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID)),
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib - 10,
				when: ContextKeyExpr.and(
					EditorContextKeys.hasNonEmptySelection.toNegated(),
					EditorContextKeys.hasMultipleSelections.toNegated(),
					ChatContextKeys.findWidgetVisible.toNegated(),
				),
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IProjectBoardService).closeSession(getActiveWindow().vscodeWindowId);
	}
});
