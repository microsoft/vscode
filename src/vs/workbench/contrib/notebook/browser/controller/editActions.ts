/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { MenuId, MenuItemAction, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext, InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CellToolbarOrder, CELL_TITLE_CELL_GROUP_ID, CELL_TITLE_OUTPUT_GROUP_ID, executeNotebookCondition, INotebookActionContext, INotebookCellActionContext, NotebookAction, NotebookCellAction, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, runDeleteAction } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { CellEditState, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_TYPE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_HAS_OUTPUTS, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON, QUIT_EDIT_CELL_COMMAND_ID } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { CellEditType, CellKind, ICellEditOperation, NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';

const CLEAR_ALL_CELLS_OUTPUTS_COMMAND_ID = 'notebook.clearAllCellsOutputs';
const EDIT_CELL_COMMAND_ID = 'notebook.cell.edit';
const DELETE_CELL_COMMAND_ID = 'notebook.cell.delete';
const CLEAR_CELL_OUTPUTS_COMMAND_ID = 'notebook.cell.clearOutputs';

export class DeleteCellAction extends MenuItemAction {
	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService
	) {
		super(
			{
				id: DELETE_CELL_COMMAND_ID,
				title: localize('notebookActions.deleteCell', "Delete Cell"),
				icon: icons.deleteCellIcon,
				precondition: NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)
			},
			undefined,
			{ shouldForwardArgs: true },
			contextKeyService,
			commandService);
	}
}

registerAction2(class EditCellAction extends NotebookCellAction {
	constructor() {
		super(
			{
				id: EDIT_CELL_COMMAND_ID,
				title: localize('notebookActions.editCell', "Edit Cell"),
				keybinding: {
					when: ContextKeyExpr.and(
						NOTEBOOK_CELL_LIST_FOCUSED,
						ContextKeyExpr.not(InputFocusedContextKey),
						NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)),
					primary: KeyCode.Enter,
					weight: KeybindingWeight.WorkbenchContrib
				},
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
						NOTEBOOK_CELL_TYPE.isEqualTo('markup'),
						NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.toNegated(),
						NOTEBOOK_CELL_EDITABLE),
					order: CellToolbarOrder.EditCell,
					group: CELL_TITLE_CELL_GROUP_ID
				},
				icon: icons.editIcon,
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const viewModel = context.notebookEditor.viewModel;
		if (!viewModel || viewModel.options.isReadOnly) {
			return;
		}

		context.notebookEditor.focusNotebookCell(context.cell, 'editor');
	}
});

const quitEditCondition = ContextKeyExpr.and(
	NOTEBOOK_EDITOR_FOCUSED,
	InputFocusedContext
);
registerAction2(class QuitEditCellAction extends NotebookCellAction {
	constructor() {
		super(
			{
				id: QUIT_EDIT_CELL_COMMAND_ID,
				title: localize('notebookActions.quitEdit', "Stop Editing Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(
						NOTEBOOK_CELL_TYPE.isEqualTo('markup'),
						NOTEBOOK_CELL_MARKDOWN_EDIT_MODE,
						NOTEBOOK_CELL_EDITABLE),
					order: CellToolbarOrder.SaveCell,
					group: CELL_TITLE_CELL_GROUP_ID
				},
				icon: icons.stopEditIcon,
				keybinding: [
					{
						when: ContextKeyExpr.and(quitEditCondition,
							EditorContextKeys.hoverVisible.toNegated(),
							EditorContextKeys.hasNonEmptySelection.toNegated(),
							EditorContextKeys.hasMultipleSelections.toNegated()),
						primary: KeyCode.Escape,
						weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT - 5
					},
					{
						when: ContextKeyExpr.and(
							quitEditCondition,
							NOTEBOOK_CELL_TYPE.isEqualTo('markup')),
						primary: KeyMod.WinCtrl | KeyCode.Enter,
						win: {
							primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
						},
						weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT - 5
					},
				]
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		if (context.cell.cellKind === CellKind.Markup) {
			context.cell.updateEditState(CellEditState.Preview, QUIT_EDIT_CELL_COMMAND_ID);
		}

		context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
	}
});

registerAction2(class DeleteCellAction extends NotebookCellAction {
	constructor() {
		super(
			{
				id: DELETE_CELL_COMMAND_ID,
				title: localize('notebookActions.deleteCell', "Delete Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: NOTEBOOK_EDITOR_EDITABLE
				},
				keybinding: {
					primary: KeyCode.Delete,
					mac: {
						primary: KeyMod.CtrlCmd | KeyCode.Backspace
					},
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, ContextKeyExpr.not(InputFocusedContextKey)),
					weight: KeybindingWeight.WorkbenchContrib
				},
				icon: icons.deleteCellIcon
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const viewModel = context.notebookEditor.viewModel;
		if (!viewModel || viewModel.options.isReadOnly) {
			return;
		}

		runDeleteAction(viewModel, context.cell);
	}
});

registerAction2(class ClearCellOutputsAction extends NotebookCellAction {
	constructor() {
		super({
			id: CLEAR_CELL_OUTPUTS_COMMAND_ID,
			title: localize('clearCellOutputs', 'Clear Cell Outputs'),
			menu: [
				{
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(NOTEBOOK_CELL_TYPE.isEqualTo('code'), executeNotebookCondition, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON.toNegated()),
					order: CellToolbarOrder.ClearCellOutput,
					group: CELL_TITLE_OUTPUT_GROUP_ID
				},
				{
					id: MenuId.NotebookOutputToolbar,
					when: ContextKeyExpr.and(NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE)
				},
			],
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
				primary: KeyMod.Alt | KeyCode.Delete,
				weight: KeybindingWeight.WorkbenchContrib
			},
			icon: icons.clearIcon
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (!editor.hasModel() || !editor.textModel.length) {
			return;
		}

		const cell = context.cell;
		const index = editor.textModel.cells.indexOf(cell.model);

		if (index < 0) {
			return;
		}

		editor.textModel.applyEdits([{ editType: CellEditType.Output, index, outputs: [] }], true, undefined, () => undefined, undefined);

		if (context.cell.internalMetadata.runState !== NotebookCellExecutionState.Executing) {
			context.notebookEditor.textModel.applyEdits([{
				editType: CellEditType.PartialInternalMetadata, index, internalMetadata: {
					runState: null,
					runStartTime: null,
					runStartTimeAdjustment: null,
					runEndTime: null,
					executionOrder: null,
					lastRunSuccess: null
				}
			}], true, undefined, () => undefined, undefined);
		}
	}
});


registerAction2(class ClearAllCellOutputsAction extends NotebookAction {
	constructor() {
		super({
			id: CLEAR_ALL_CELLS_OUTPUTS_COMMAND_ID,
			title: localize('clearAllCellsOutputs', 'Clear Outputs'),
			precondition: NOTEBOOK_HAS_OUTPUTS,
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
					),
					group: 'navigation',
					order: 0
				},
				{
					id: MenuId.NotebookToolbar,
					when: ContextKeyExpr.and(
						executeNotebookCondition,
						ContextKeyExpr.equals('config.notebook.globalToolbar', true)
					),
					group: 'navigation/execute',
					order: 0
				}
			],
			icon: icons.clearIcon
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (!editor.hasModel() || !editor.textModel.length) {
			return;
		}

		editor.textModel.applyEdits(
			editor.textModel.cells.map((cell, index) => ({
				editType: CellEditType.Output, index, outputs: []
			})), true, undefined, () => undefined, undefined);

		const clearExecutionMetadataEdits = editor.textModel.cells.map((cell, index) => {
			if (cell.internalMetadata.runState !== NotebookCellExecutionState.Executing) {
				return {
					editType: CellEditType.PartialInternalMetadata, index, internalMetadata: {
						runState: null,
						runStartTime: null,
						runStartTimeAdjustment: null,
						runEndTime: null,
						executionOrder: null,
						lastRunSuccess: null
					}
				};
			} else {
				return undefined;
			}
		}).filter(edit => !!edit) as ICellEditOperation[];
		if (clearExecutionMetadataEdits.length) {
			context.notebookEditor.textModel.applyEdits(clearExecutionMetadataEdits, true, undefined, () => undefined, undefined);
		}
	}
});
