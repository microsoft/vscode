/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/editorTabs.css';
import { NewBrowserTabAction, NewChangesTabAction, NewFileTabAction, NewSearchTabAction } from './addTabActions.js';
import { localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ActiveEditorContext, AuxiliaryBarVisibleContext, EditorPartModalContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Menus } from '../../../browser/menus.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { EditorMaximizedContext, SinglePaneDetailChangesOrFilesActiveContext } from '../../../common/contextkeys.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../workbench/common/editor.js';
import { resolveCommandsContext } from '../../../../workbench/browser/parts/editor/editorCommandsContext.js';
import { MultiDiffEditorInput } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { CHANGES_VIEW_ID } from '../../changes/common/changes.js';
import { ChangesViewPane } from '../../changes/browser/changesView.js';
import { prepareMoveCopyEditors } from '../../../../workbench/browser/parts/editor/editor.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID } from '../../../../workbench/browser/parts/editor/editorCommands.js';
import { TERMINAL_VIEW_ID } from '../../../../workbench/contrib/terminal/common/terminal.js';
import { TEXT_FILE_EDITOR_ID } from '../../../../workbench/contrib/files/common/files.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { SessionsCategories } from '../../../common/categories.js';
import { DOCK_DETAIL_PANEL_SETTING } from '../../../common/sessionConfig.js';
import { IChangesViewService } from '../../changes/common/changesViewService.js';

const terminalPanelHiddenForMaximizedEditor = new WeakSet<IAgentWorkbenchLayoutService>();

// The pop-out-to-modal and close-editor-area buttons do not apply to the single-pane
// redesign, so they are hidden when the setting is enabled (original layout keeps them).
const singlePaneDetailPanel = ContextKeyExpr.equals(`config.${DOCK_DETAIL_PANEL_SETTING}`, true);
const notSinglePaneDetailPanel = singlePaneDetailPanel.negate();

const editorTitleActionsWhen = ContextKeyExpr.and(
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated(),
	IsTopRightEditorGroupContext);
// Single-pane "layout" actions (maximize/restore, hide editor, toggle details)
// render in the editor-title *layout* cluster (MenuId.EditorTitleLayout), after
// the editor-title actions and their separator — mirroring the classic layout.
// The detail-panel toggle is conditional (hidden for tab types with no detail,
// e.g. browser and search — see `singlePaneLayoutToggleDetailsOrder` in
// `singlePaneResponsiveSidebarStrategy.ts`) and keeps its trailing position after
// the always-present maximize/restore and hide chevron.
const singlePaneLayoutMaximizeOrder = 10;
const singlePaneLayoutHideEditorOrder = 20;

// Keybinding scope for the single-pane maximize/restore toggle: active in the
// main sessions window whenever the single-pane layout is on and the editor
// area is visible. Deliberately does not require the editor group to be focused
// so the toggle works while typing in the chat.
const singlePaneMaximizeKeybindingWhen = ContextKeyExpr.and(
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated(),
	singlePaneDetailPanel,
	MainEditorAreaVisibleContext);

class SinglePaneAddTabContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.singlePaneAddTab';

	constructor(
		@IAgentWorkbenchLayoutService layoutService: IAgentWorkbenchLayoutService,
	) {
		super();

		if (!layoutService.isSinglePaneLayoutEnabled) {
			return;
		}

		this._register(registerAction2(NewFileTabAction));
		this._register(registerAction2(NewBrowserTabAction));
		this._register(registerAction2(NewSearchTabAction));
		this._register(registerAction2(NewChangesTabAction));
	}
}

registerWorkbenchContribution2(SinglePaneAddTabContribution.ID, SinglePaneAddTabContribution, WorkbenchPhase.BlockStartup);

class MaximizeMainEditorPartAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.maximizeMainEditorPart';

	constructor() {
		super({
			id: MaximizeMainEditorPartAction.ID,
			title: localize2('maximizeMainEditorPart', "Maximize Editor Area"),
			icon: Codicon.screenFull,
			f1: false,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyE,
				when: ContextKeyExpr.and(singlePaneMaximizeKeybindingWhen, EditorMaximizedContext.negate())
			},
			menu: [
				{
					id: MenuId.EditorTitleLayout,
					group: 'navigation',
					order: singlePaneLayoutMaximizeOrder,
					when: ContextKeyExpr.and(editorTitleActionsWhen, EditorMaximizedContext.negate(), singlePaneDetailPanel, MainEditorAreaVisibleContext)
				},
				{
					id: MenuId.EditorTitleLayout,
					group: 'navigation',
					order: 99,
					when: ContextKeyExpr.and(editorTitleActionsWhen, EditorMaximizedContext.negate(), notSinglePaneDetailPanel)
				}
			]
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
			toggled: EditorMaximizedContext,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyE,
				when: ContextKeyExpr.and(singlePaneMaximizeKeybindingWhen, EditorMaximizedContext)
			},
			menu: [
				{
					id: MenuId.EditorTitleLayout,
					group: 'navigation',
					order: singlePaneLayoutMaximizeOrder,
					when: ContextKeyExpr.and(editorTitleActionsWhen, EditorMaximizedContext, singlePaneDetailPanel, MainEditorAreaVisibleContext)
				},
				{
					id: MenuId.EditorTitleLayout,
					group: 'navigation',
					order: 99,
					when: ContextKeyExpr.and(editorTitleActionsWhen, EditorMaximizedContext, notSinglePaneDetailPanel)
				}
			]
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

class HideMainEditorPartAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.hideMainEditorPart';

	constructor() {
		super({
			id: HideMainEditorPartAction.ID,
			title: localize2('hideMainEditorPart', "Hide Editor"),
			icon: Codicon.chevronRight,
			f1: false,
			menu: {
				id: MenuId.EditorTitleLayout,
				group: 'navigation',
				order: singlePaneLayoutHideEditorOrder,
				when: ContextKeyExpr.and(
					editorTitleActionsWhen,
					singlePaneDetailPanel,
					EditorMaximizedContext.negate(),
					AuxiliaryBarVisibleContext,
					SinglePaneDetailChangesOrFilesActiveContext,
					MainEditorAreaVisibleContext)
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);
		layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		layoutService.setPartHidden(true, Parts.EDITOR_PART);
		// Closing the editor area frees horizontal space, so bring the sessions
		// list back (it may have been auto-collapsed when details was opened).
		layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
	}
}

registerAction2(HideMainEditorPartAction);

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
					IsAuxiliaryWindowContext.toNegated(),
					IsTopRightEditorGroupContext,
					notSinglePaneDetailPanel)
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
					IsSessionsWindowContext,
					IsAuxiliaryWindowContext.toNegated(),
					notSinglePaneDetailPanel
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
		const changesViewService = accessor.get(IChangesViewService);

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
			const changes = changesViewService.activeSessionChangesObs.get();

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

class AddFileAsContextAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.addFileAsContext';

	constructor() {
		const precondition = ContextKeyExpr.and(
			IsSessionsWindowContext,
			IsAuxiliaryWindowContext.toNegated(),
			ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID)
		);

		super({
			id: AddFileAsContextAction.ID,
			title: localize2('addFileAsContext', "Add File as Context"),
			category: SessionsCategories.Sessions,
			icon: Codicon.attach,
			f1: true,
			precondition,
			menu: [{
				id: Menus.SessionsEditorTitle,
				group: 'navigation',
				order: 100000,
				when: ContextKeyExpr.and(precondition, singlePaneDetailPanel)
			}, {
				id: MenuId.EditorTitle,
				group: 'navigation',
				order: 100000, // towards the far right, mirroring Split Editor Right in the regular window
				when: ContextKeyExpr.and(precondition, notSinglePaneDetailPanel)
			}]
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const editorService = accessor.get(IEditorService);
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);

		const resolvedContext = resolveCommandsContext(args, editorService, accessor.get(IEditorGroupsService), accessor.get(IListService));
		const resources = resolvedContext.groupedEditors
			.flatMap(groupedEditor => groupedEditor.editors)
			.map(editor => EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }))
			.filter((uri): uri is URI => uri !== undefined && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(uri.scheme));
		if (resources.length === 0) {
			return;
		}

		const sessionId = sessionsService.activeSession.get()?.sessionId;
		sessionsPartService.getSessionView(sessionId)?.attach(resources);
	}
}

registerAction2(AddFileAsContextAction);
