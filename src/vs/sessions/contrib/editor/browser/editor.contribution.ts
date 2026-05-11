/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorPartModalContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { EditorMaximizedContext } from '../../../common/contextkeys.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { MultiDiffEditorInput } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { CHANGES_VIEW_ID } from '../../changes/common/changes.js';
import { ChangesViewPane } from '../../changes/browser/changesView.js';
import { prepareMoveCopyEditors } from '../../../../workbench/browser/parts/editor/editor.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID } from '../../../../workbench/browser/parts/editor/editorCommands.js';
import { TERMINAL_VIEW_ID } from '../../../../workbench/contrib/terminal/common/terminal.js';

const terminalPanelHiddenForMaximizedEditor = new WeakSet<IAgentWorkbenchLayoutService>();

class MaximizeMainEditorPartAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.maximizeMainEditorPart';

	constructor() {
		super({
			id: MaximizeMainEditorPartAction.ID,
			title: localize2('maximizeMainEditorPart', "Maximize Editor Area"),
			icon: Codicon.screenFull,
			f1: false,
			menu: {
				id: MenuId.EditorTitleLayout,
				group: 'navigation',
				order: 99,
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					IsTopRightEditorGroupContext,
					EditorMaximizedContext.negate())
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);
		const viewsService = accessor.get(IViewsService);
		let hidTerminalPanel = false;

		if (layoutService.isVisible(Parts.PANEL_PART) && viewsService.isViewVisible(TERMINAL_VIEW_ID)) {
			layoutService.setPartHidden(true, Parts.PANEL_PART);
			hidTerminalPanel = true;
		}

		if (hidTerminalPanel) {
			terminalPanelHiddenForMaximizedEditor.add(layoutService);
		} else {
			terminalPanelHiddenForMaximizedEditor.delete(layoutService);
		}

		layoutService.setEditorMaximized(true);
	}
}

registerAction2(MaximizeMainEditorPartAction);

class RestoreMainEditorPartAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.restoreMainEditorPart';

	constructor() {
		super({
			id: RestoreMainEditorPartAction.ID,
			title: localize2('restoreMainEditorPart', "Restore Editor Area"),
			icon: Codicon.screenNormal,
			f1: false,
			menu: {
				id: MenuId.EditorTitleLayout,
				group: 'navigation',
				order: 99,
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					IsTopRightEditorGroupContext,
					EditorMaximizedContext)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);
		const shouldRestoreTerminalPanel = terminalPanelHiddenForMaximizedEditor.has(layoutService);

		layoutService.setEditorMaximized(false);

		if (shouldRestoreTerminalPanel && !layoutService.isVisible(Parts.PANEL_PART)) {
			layoutService.setPartHidden(false, Parts.PANEL_PART);
		}

		terminalPanelHiddenForMaximizedEditor.delete(layoutService);
	}
}

registerAction2(RestoreMainEditorPartAction);

class CloseMainEditorPartAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.closeMainEditorPart';

	constructor() {
		super({
			id: CloseMainEditorPartAction.ID,
			title: localize2('closeMainEditorPart', "Close Editor Area"),
			icon: Codicon.close,
			f1: false,
			menu: {
				id: MenuId.EditorTitleLayout,
				group: 'navigation',
				order: 100,
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					IsTopRightEditorGroupContext)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.action.closeAllGroups');
	}
}

registerAction2(CloseMainEditorPartAction);

class OpenEditorInModalEditorAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.openEditorInModal';

	constructor() {
		super({
			id: OpenEditorInModalEditorAction.ID,
			title: localize2('openEditorInModal', "Open in Modal Editor"),
			icon: Codicon.openInWindow,
			f1: false,
			menu: {
				id: MenuId.EditorTitleLayout,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(
					IsSessionsWindowContext
				)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);
		const configurationService = accessor.get(IConfigurationService);
		const editorGroupsService = accessor.get(IEditorGroupsService);

		const isMaximized = layoutService.isEditorMaximized();

		// Set the `workbench.editor.useModal` setting to 'all'
		await configurationService.updateValue('workbench.editor.useModal', 'all');

		// Move all editors from the active group to the modal editor
		const activeGroup = editorGroupsService.mainPart.activeGroup;

		// Check for multi-file diff editor
		const multiFileDiffEditor = activeGroup.editors
			.find(editor => editor instanceof MultiDiffEditorInput);

		if (multiFileDiffEditor) {
			// Reopen multi-file diff editor as the first editor in the modal editor
			const view = viewsService.getViewWithId<ChangesViewPane>(CHANGES_VIEW_ID);
			await view?.openChanges();

			// Close the multi-file diff editor
			await activeGroup.closeEditor(multiFileDiffEditor);
		}

		// Move all remaining editors to the modal editor
		const modalPart = await editorGroupsService.createModalEditorPart();
		const editorsToMove = prepareMoveCopyEditors(activeGroup, activeGroup.editors.slice(), true);
		activeGroup.moveEditors(editorsToMove, modalPart.activeGroup);

		// Maximize
		if (isMaximized && !modalPart.maximized) {
			modalPart.toggleMaximized();
		}

		// Focus
		modalPart.activeGroup.focus();
	}
}

registerAction2(OpenEditorInModalEditorAction);

class OpenModalEditorInEditorAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.openModalEditorInEditor';

	constructor() {
		super({
			id: OpenModalEditorInEditorAction.ID,
			title: localize2('openModalEditorInEditor', "Open in Editor Area"),
			icon: Codicon.openInWindow,
			f1: false,
			menu: {
				id: MenuId.ModalEditorTitle,
				group: 'navigation',
				order: 98,
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					EditorPartModalContext)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const commandService = accessor.get(ICommandService);
		const configurationService = accessor.get(IConfigurationService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);

		const activeEditorPart = editorGroupsService.activeModalEditorPart;
		const activeGroup = activeEditorPart?.activeGroup;
		if (!activeEditorPart || !activeGroup) {
			return;
		}

		const isMaximized = activeEditorPart.maximized;

		// Set the `workbench.editor.useModal` setting back to 'some'
		await configurationService.updateValue('workbench.editor.useModal', 'some');

		// Show the main editor part
		layoutService.setPartHidden(false, Parts.EDITOR_PART);

		// Check for navigation in the modal editor
		const navigation = activeGroup.activeEditorPane?.options?.modal?.navigation;
		if (navigation) {
			const view = viewsService.getViewWithId<ChangesViewPane>(CHANGES_VIEW_ID);
			const changes = view?.viewModel.activeSessionChangesObs.get();

			if (changes && navigation.current < changes.length) {
				// Reopen multi-file diff editor for the current file
				await view?.openChanges(changes[navigation.current].modifiedUri ?? changes[navigation.current].originalUri);

				// Close the editor in the modal editor (assume that the
				// multi-file diff editor is the first editor in the modal
				// editor)
				await activeGroup.closeEditor(activeGroup.editors[0]);
			}
		}

		// Move all remaining editors to the main editor part
		await commandService.executeCommand(MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID);

		// Maximize
		if (isMaximized) {
			layoutService.setEditorMaximized(true);
		}

		// Focus
		editorGroupsService.activeGroup.focus();
	}
}

registerAction2(OpenModalEditorInEditorAction);
