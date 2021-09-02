/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { maxIndex, minIndex } from 'vs/base/common/arrays';
import { Iterable } from 'vs/base/common/iterator';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { URI, UriComponents } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { EditorsOrder } from 'vs/workbench/common/editor';
import { cellExecutionArgs, CellToolbarOrder, CELL_TITLE_CELL_GROUP_ID, executeNotebookCondition, getContextFromActiveEditor, getContextFromUri, INotebookActionContext, INotebookCellActionContext, INotebookCellToolbarActionContext, INotebookCommandContext, NotebookAction, NotebookCellAction, NotebookMultiCellAction, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, parseMultiCellExecutionArgs } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { CellEditState, CellFocusMode, EXECUTE_CELL_COMMAND_ID, NOTEBOOK_CELL_EXECUTING, NOTEBOOK_CELL_EXECUTION_STATE, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_TYPE, NOTEBOOK_HAS_RUNNING_CELL, NOTEBOOK_INTERRUPTIBLE_KERNEL, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT, NOTEBOOK_MISSING_KERNEL_EXTENSION } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { CellKind, ConsolidatedRunButton, NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const EXECUTE_NOTEBOOK_COMMAND_ID = 'notebook.execute';
const CANCEL_NOTEBOOK_COMMAND_ID = 'notebook.cancelExecution';
const CANCEL_CELL_COMMAND_ID = 'notebook.cell.cancelExecution';
const EXECUTE_CELL_FOCUS_CONTAINER_COMMAND_ID = 'notebook.cell.executeAndFocusContainer';
const EXECUTE_CELL_SELECT_BELOW = 'notebook.cell.executeAndSelectBelow';
const EXECUTE_CELL_INSERT_BELOW = 'notebook.cell.executeAndInsertBelow';
const EXECUTE_CELL_AND_BELOW = 'notebook.cell.executeCellAndBelow';
const EXECUTE_CELLS_ABOVE = 'notebook.cell.executeCellsAbove';
const RENDER_ALL_MARKDOWN_CELLS = 'notebook.renderAllMarkdownCells';

// If this changes, update getCodeCellExecutionContextKeyService to match
export const executeCondition = ContextKeyExpr.and(
	NOTEBOOK_CELL_TYPE.isEqualTo('code'),
	ContextKeyExpr.or(
		ContextKeyExpr.greater(NOTEBOOK_KERNEL_COUNT.key, 0),
		NOTEBOOK_MISSING_KERNEL_EXTENSION
	));

export const executeThisCellCondition = ContextKeyExpr.and(
	executeCondition,
	NOTEBOOK_CELL_EXECUTING.toNegated());

function renderAllMarkdownCells(context: INotebookActionContext): void {
	context.notebookEditor.viewModel.viewCells.forEach(cell => {
		if (cell.cellKind === CellKind.Markup) {
			cell.updateEditState(CellEditState.Preview, 'renderAllMarkdownCells');
		}
	});
}

async function runCell(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {

	const editorGroupService = accessor.get(IEditorGroupsService);
	const group = editorGroupService.activeGroup;

	if (group) {
		if (group.activeEditor) {
			group.pinEditor(group.activeEditor);
		}
	}

	if (context.ui && context.cell) {
		if (context.cell.internalMetadata.runState === NotebookCellExecutionState.Executing) {
			return;
		}
		await context.notebookEditor.executeNotebookCells(Iterable.single(context.cell));
		if (context.autoReveal) {
			const cellIndex = context.notebookEditor.getCellIndex(context.cell);
			context.notebookEditor.revealCellRangeInView({ start: cellIndex, end: cellIndex + 1 });
		}
	} else if (context.selectedCells) {
		await context.notebookEditor.executeNotebookCells(context.selectedCells);
		const firstCell = context.selectedCells[0];

		if (firstCell && context.autoReveal) {
			const cellIndex = context.notebookEditor.getCellIndex(firstCell);
			context.notebookEditor.revealCellRangeInView({ start: cellIndex, end: cellIndex + 1 });
		}
	}
}

registerAction2(class RenderAllMarkdownCellsAction extends NotebookAction {
	constructor() {
		super({
			id: RENDER_ALL_MARKDOWN_CELLS,
			title: localize('notebookActions.renderMarkdown', "Render All Markdown Cells"),
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		renderAllMarkdownCells(context);
	}
});

registerAction2(class ExecuteNotebookAction extends NotebookAction {
	constructor() {
		super({
			id: EXECUTE_NOTEBOOK_COMMAND_ID,
			title: localize('notebookActions.executeNotebook', "Run All"),
			icon: icons.executeAllIcon,
			description: {
				description: localize('notebookActions.executeNotebook', "Run All"),
				args: [
					{
						name: 'uri',
						description: 'The document uri'
					}
				]
			},
			menu: [
				{
					id: MenuId.EditorTitle,
					order: -1,
					group: 'navigation',
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						executeNotebookCondition,
						ContextKeyExpr.or(NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(), NOTEBOOK_HAS_RUNNING_CELL.toNegated()),
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
					)
				},
				{
					id: MenuId.NotebookToolbar,
					order: -1,
					group: 'navigation/execute',
					when: ContextKeyExpr.and(
						executeNotebookCondition,
						ContextKeyExpr.or(NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(), NOTEBOOK_HAS_RUNNING_CELL.toNegated()),
						ContextKeyExpr.equals('config.notebook.globalToolbar', true)
					)
				}
			]
		});
	}

	override getEditorContextFromArgsOrActive(accessor: ServicesAccessor, context?: UriComponents): INotebookActionContext | undefined {
		return getContextFromUri(accessor, context) ?? getContextFromActiveEditor(accessor.get(IEditorService));
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		renderAllMarkdownCells(context);

		const editorService = accessor.get(IEditorService);
		const editor = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).find(
			editor => editor.editor instanceof NotebookEditorInput && editor.editor.viewType === context.notebookEditor.textModel.viewType && editor.editor.resource.toString() === context.notebookEditor.textModel.uri.toString());
		const editorGroupService = accessor.get(IEditorGroupsService);

		if (editor) {
			const group = editorGroupService.getGroup(editor.groupId);
			group?.pinEditor(editor.editor);
		}

		return context.notebookEditor.executeNotebookCells();
	}
});

registerAction2(class ExecuteCell extends NotebookMultiCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_COMMAND_ID,
			precondition: executeThisCellCondition,
			title: localize('notebookActions.execute', "Execute Cell"),
			keybinding: {
				when: NOTEBOOK_CELL_LIST_FOCUSED,
				primary: KeyMod.WinCtrl | KeyCode.Enter,
				win: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
				},
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
			menu: {
				id: MenuId.NotebookCellExecute,
				when: executeThisCellCondition,
				group: 'inline'
			},
			description: {
				description: localize('notebookActions.execute', "Execute Cell"),
				args: cellExecutionArgs
			},
			icon: icons.executeIcon
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		return runCell(accessor, context);
	}
});

registerAction2(class ExecuteAboveCells extends NotebookMultiCellAction {
	constructor() {
		super({
			id: EXECUTE_CELLS_ABOVE,
			precondition: executeCondition,
			title: localize('notebookActions.executeAbove', "Execute Above Cells"),
			menu: [
				{
					id: MenuId.NotebookCellExecute,
					when: ContextKeyExpr.and(
						executeCondition,
						ContextKeyExpr.equals(`config.${ConsolidatedRunButton}`, true))
				},
				{
					id: MenuId.NotebookCellTitle,
					order: CellToolbarOrder.ExecuteAboveCells,
					group: CELL_TITLE_CELL_GROUP_ID,
					when: ContextKeyExpr.and(
						executeCondition,
						ContextKeyExpr.equals(`config.${ConsolidatedRunButton}`, false))
				}
			],
			icon: icons.executeAboveIcon
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		let endCellIdx: number | undefined = undefined;
		if (context.ui) {
			endCellIdx = context.notebookEditor.getCellIndex(context.cell);
		} else {
			endCellIdx = maxIndex(context.selectedCells, cell => context.notebookEditor.getCellIndex(cell));
		}

		if (typeof endCellIdx === 'number') {
			const range = { start: 0, end: endCellIdx };
			const cells = context.notebookEditor.getCellsInRange(range);
			context.notebookEditor.executeNotebookCells(cells);
		}
	}
});

registerAction2(class ExecuteCellAndBelow extends NotebookMultiCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_AND_BELOW,
			precondition: executeCondition,
			title: localize('notebookActions.executeBelow', "Execute Cell and Below"),
			menu: [
				{
					id: MenuId.NotebookCellExecute,
					when: ContextKeyExpr.and(
						executeCondition,
						ContextKeyExpr.equals(`config.${ConsolidatedRunButton}`, true))
				},
				{
					id: MenuId.NotebookCellTitle,
					order: CellToolbarOrder.ExecuteCellAndBelow,
					group: CELL_TITLE_CELL_GROUP_ID,
					when: ContextKeyExpr.and(
						executeCondition,
						ContextKeyExpr.equals(`config.${ConsolidatedRunButton}`, false))
				}
			],
			icon: icons.executeBelowIcon
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		let startCellIdx: number | undefined = undefined;
		if (context.ui) {
			startCellIdx = context.notebookEditor.getCellIndex(context.cell);
		} else {
			startCellIdx = minIndex(context.selectedCells, cell => context.notebookEditor.getCellIndex(cell));
		}

		if (typeof startCellIdx === 'number') {
			const range = { start: startCellIdx, end: context.notebookEditor.getLength() };
			const cells = context.notebookEditor.getCellsInRange(range);
			context.notebookEditor.executeNotebookCells(cells);
		}
	}
});

registerAction2(class ExecuteCellFocusContainer extends NotebookMultiCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_FOCUS_CONTAINER_COMMAND_ID,
			precondition: executeThisCellCondition,
			title: localize('notebookActions.executeAndFocusContainer', "Execute Cell and Focus Container"),
			description: {
				description: localize('notebookActions.executeAndFocusContainer', "Execute Cell and Focus Container"),
				args: cellExecutionArgs
			},
			icon: icons.executeIcon
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		if (context.ui) {
			context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
		} else {
			const firstCell = context.selectedCells[0];

			if (firstCell) {
				context.notebookEditor.focusNotebookCell(firstCell, 'container', { skipReveal: true });
			}
		}

		await runCell(accessor, context);
	}
});

const cellCancelCondition = ContextKeyExpr.or(
	ContextKeyExpr.equals(NOTEBOOK_CELL_EXECUTION_STATE.key, 'executing'),
	ContextKeyExpr.equals(NOTEBOOK_CELL_EXECUTION_STATE.key, 'pending'),
);

registerAction2(class CancelExecuteCell extends NotebookMultiCellAction {
	constructor() {
		super({
			id: CANCEL_CELL_COMMAND_ID,
			precondition: cellCancelCondition,
			title: localize('notebookActions.cancel', "Stop Cell Execution"),
			icon: icons.stopIcon,
			menu: {
				id: MenuId.NotebookCellExecute,
				when: cellCancelCondition,
				group: 'inline'
			},
			description: {
				description: localize('notebookActions.cancel', "Stop Cell Execution"),
				args: [
					{
						name: 'options',
						description: 'The cell range options',
						schema: {
							'type': 'object',
							'required': ['ranges'],
							'properties': {
								'ranges': {
									'type': 'array',
									items: [
										{
											'type': 'object',
											'required': ['start', 'end'],
											'properties': {
												'start': {
													'type': 'number'
												},
												'end': {
													'type': 'number'
												}
											}
										}
									]
								},
								'document': {
									'type': 'object',
									'description': 'The document uri',
								}
							}
						}
					}
				]
			},
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		if (context.ui) {
			return context.notebookEditor.cancelNotebookCells(Iterable.single(context.cell));
		} else {
			return context.notebookEditor.cancelNotebookCells(context.selectedCells);
		}
	}
});

registerAction2(class ExecuteCellSelectBelow extends NotebookCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_SELECT_BELOW,
			precondition: ContextKeyExpr.or(executeThisCellCondition, NOTEBOOK_CELL_TYPE.isEqualTo('markup')),
			title: localize('notebookActions.executeAndSelectBelow', "Execute Notebook Cell and Select Below"),
			keybinding: {
				when: NOTEBOOK_CELL_LIST_FOCUSED,
				primary: KeyMod.Shift | KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const idx = context.notebookEditor.getCellIndex(context.cell);
		if (typeof idx !== 'number') {
			return;
		}

		if (context.cell.cellKind === CellKind.Markup) {
			const nextCell = context.notebookEditor.cellAt(idx + 1);
			context.cell.updateEditState(CellEditState.Preview, EXECUTE_CELL_SELECT_BELOW);
			if (nextCell) {
				context.notebookEditor.focusNotebookCell(nextCell, 'container');
			} else {
				const newCell = context.notebookEditor.insertNotebookCell(context.cell, CellKind.Markup, 'below');
				if (newCell) {
					context.notebookEditor.focusNotebookCell(newCell, 'editor');
				}
			}
			return;
		} else {
			// Try to select below, fall back on inserting
			const nextCell = context.notebookEditor.cellAt(idx + 1);
			if (nextCell) {
				context.notebookEditor.focusNotebookCell(nextCell, 'container');
			} else {
				const newCell = context.notebookEditor.insertNotebookCell(context.cell, CellKind.Code, 'below');
				if (newCell) {
					context.notebookEditor.focusNotebookCell(newCell, 'editor');
				}
			}

			return runCell(accessor, context);
		}
	}
});

registerAction2(class ExecuteCellInsertBelow extends NotebookCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_INSERT_BELOW,
			precondition: executeThisCellCondition,
			title: localize('notebookActions.executeAndInsertBelow', "Execute Notebook Cell and Insert Below"),
			keybinding: {
				when: NOTEBOOK_CELL_LIST_FOCUSED,
				primary: KeyMod.Alt | KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const newFocusMode = context.cell.focusMode === CellFocusMode.Editor ? 'editor' : 'container';

		const executionP = runCell(accessor, context);
		const newCell = context.notebookEditor.insertNotebookCell(context.cell, CellKind.Code, 'below');
		if (newCell) {
			context.notebookEditor.focusNotebookCell(newCell, newFocusMode);
		}

		return executionP;
	}
});

registerAction2(class CancelNotebook extends NotebookAction {
	constructor() {
		super({
			id: CANCEL_NOTEBOOK_COMMAND_ID,
			title: localize('notebookActions.cancelNotebook', "Stop Execution"),
			icon: icons.stopIcon,
			description: {
				description: localize('notebookActions.cancelNotebook', "Stop Execution"),
				args: [
					{
						name: 'uri',
						description: 'The document uri',
						constraint: URI
					}
				]
			},
			menu: [
				{
					id: MenuId.EditorTitle,
					order: -1,
					group: 'navigation',
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						NOTEBOOK_HAS_RUNNING_CELL,
						NOTEBOOK_INTERRUPTIBLE_KERNEL,
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
					)
				},
				{
					id: MenuId.NotebookToolbar,
					order: -1,
					group: 'navigation/execute',
					when: ContextKeyExpr.and(
						NOTEBOOK_HAS_RUNNING_CELL,
						NOTEBOOK_INTERRUPTIBLE_KERNEL,
						ContextKeyExpr.equals('config.notebook.globalToolbar', true)
					)
				}
			]
		});
	}

	override getEditorContextFromArgsOrActive(accessor: ServicesAccessor, context?: UriComponents): INotebookActionContext | undefined {
		return getContextFromUri(accessor, context) ?? getContextFromActiveEditor(accessor.get(IEditorService));
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		return context.notebookEditor.cancelNotebookCells();
	}
});
