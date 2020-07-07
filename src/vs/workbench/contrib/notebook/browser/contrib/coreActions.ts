/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { URI } from 'vs/base/common/uri';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { localize } from 'vs/nls';
import { Action2, IAction2Options, MenuId, MenuItemAction, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext, InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { BaseCellRenderTemplate, CellEditState, ICellViewModel, INotebookEditor, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_TYPE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_EXECUTING_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_RUNNABLE, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_CELL_HAS_OUTPUTS, CellFocusMode, NOTEBOOK_OUTPUT_FOCUSED } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind, NOTEBOOK_EDITOR_CURSOR_BOUNDARY, NotebookCellRunState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';

// Notebook Commands
const EXECUTE_NOTEBOOK_COMMAND_ID = 'notebook.execute';
const CANCEL_NOTEBOOK_COMMAND_ID = 'notebook.cancelExecution';
const NOTEBOOK_FOCUS_TOP = 'notebook.focusTop';
const NOTEBOOK_FOCUS_BOTTOM = 'notebook.focusBottom';
const NOTEBOOK_REDO = 'notebook.redo';
const NOTEBOOK_UNDO = 'notebook.undo';
const NOTEBOOK_FOCUS_PREVIOUS_EDITOR = 'notebook.focusPreviousEditor';
const NOTEBOOK_FOCUS_NEXT_EDITOR = 'notebook.focusNextEditor';
const CLEAR_ALL_CELLS_OUTPUTS_COMMAND_ID = 'notebook.clearAllCellsOutputs';
const RENDER_ALL_MARKDOWN_CELLS = 'notebook.renderAllMarkdownCells';

// Cell Commands
const INSERT_CODE_CELL_ABOVE_COMMAND_ID = 'notebook.cell.insertCodeCellAbove';
const INSERT_CODE_CELL_BELOW_COMMAND_ID = 'notebook.cell.insertCodeCellBelow';
const INSERT_MARKDOWN_CELL_ABOVE_COMMAND_ID = 'notebook.cell.insertMarkdownCellAbove';
const INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID = 'notebook.cell.insertMarkdownCellBelow';
const CHANGE_CELL_TO_CODE_COMMAND_ID = 'notebook.cell.changeToCode';
const CHANGE_CELL_TO_MARKDOWN_COMMAND_ID = 'notebook.cell.changeToMarkdown';

const EDIT_CELL_COMMAND_ID = 'notebook.cell.edit';
const QUIT_EDIT_CELL_COMMAND_ID = 'notebook.cell.quitEdit';
const DELETE_CELL_COMMAND_ID = 'notebook.cell.delete';

const MOVE_CELL_UP_COMMAND_ID = 'notebook.cell.moveUp';
const MOVE_CELL_DOWN_COMMAND_ID = 'notebook.cell.moveDown';
const COPY_CELL_COMMAND_ID = 'notebook.cell.copy';
const CUT_CELL_COMMAND_ID = 'notebook.cell.cut';
const PASTE_CELL_COMMAND_ID = 'notebook.cell.paste';
const PASTE_CELL_ABOVE_COMMAND_ID = 'notebook.cell.pasteAbove';
const COPY_CELL_UP_COMMAND_ID = 'notebook.cell.copyUp';
const COPY_CELL_DOWN_COMMAND_ID = 'notebook.cell.copyDown';
const SPLIT_CELL_COMMAND_ID = 'notebook.cell.split';
const JOIN_CELL_ABOVE_COMMAND_ID = 'notebook.cell.joinAbove';
const JOIN_CELL_BELOW_COMMAND_ID = 'notebook.cell.joinBelow';

const EXECUTE_CELL_COMMAND_ID = 'notebook.cell.execute';
const CANCEL_CELL_COMMAND_ID = 'notebook.cell.cancelExecution';
const EXECUTE_CELL_SELECT_BELOW = 'notebook.cell.executeAndSelectBelow';
const EXECUTE_CELL_INSERT_BELOW = 'notebook.cell.executeAndInsertBelow';
const CLEAR_CELL_OUTPUTS_COMMAND_ID = 'notebook.cell.clearOutputs';
const CHANGE_CELL_LANGUAGE = 'notebook.cell.changeLanguage';
const CENTER_ACTIVE_CELL = 'notebook.centerActiveCell';

const FOCUS_IN_OUTPUT_COMMAND_ID = 'notebook.cell.focusInOutput';
const FOCUS_OUT_OUTPUT_COMMAND_ID = 'notebook.cell.focusOutOutput';

export const NOTEBOOK_ACTIONS_CATEGORY = localize('notebookActions.category', "Notebook");

export const CELL_TITLE_GROUP_ID = 'inline';

const EDITOR_WIDGET_ACTION_WEIGHT = KeybindingWeight.EditorContrib; // smaller than Suggest Widget, etc

const enum CellToolbarOrder {
	EditCell,
	SplitCell,
	SaveCell,
	ClearCellOutput,
	DeleteCell
}

abstract class NotebookAction extends Action2 {
	constructor(desc: IAction2Options) {
		if (desc.f1 !== false) {
			desc.f1 = false;
			const f1Menu = {
				id: MenuId.CommandPalette,
				when: NOTEBOOK_IS_ACTIVE_EDITOR
			};

			if (!desc.menu) {
				desc.menu = [];
			} else if (!Array.isArray(desc.menu)) {
				desc.menu = [desc.menu];
			}

			desc.menu = [
				...desc.menu,
				f1Menu
			];
		}

		desc.category = NOTEBOOK_ACTIONS_CATEGORY;

		super(desc);
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext): Promise<void> {
		if (!this.isCellActionContext(context)) {
			context = this.getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

		this.runWithContext(accessor, context);
	}

	abstract async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void>;

	private isCellActionContext(context?: INotebookCellActionContext): context is INotebookCellActionContext {
		return !!context && !!context.cell && !!context.notebookEditor;
	}

	private getActiveCellContext(accessor: ServicesAccessor): INotebookCellActionContext | undefined {
		const editorService = accessor.get(IEditorService);

		const editor = getActiveNotebookEditor(editorService);
		if (!editor) {
			return;
		}

		const activeCell = editor.getActiveCell();
		if (!activeCell) {
			return;
		}

		return {
			cell: activeCell,
			notebookEditor: editor
		};
	}
}

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: EXECUTE_CELL_COMMAND_ID,
			title: localize('notebookActions.execute', "Execute Cell"),
			keybinding: {
				when: NOTEBOOK_EDITOR_FOCUSED,
				primary: KeyMod.WinCtrl | KeyCode.Enter,
				win: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
				},
				weight: EDITOR_WIDGET_ACTION_WEIGHT
			},
			icon: { id: 'codicon/play' },
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		return runCell(accessor, context);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: CANCEL_CELL_COMMAND_ID,
			title: localize('notebookActions.cancel', "Stop Cell Execution"),
			icon: { id: 'codicon/primitive-square' },
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		return context.notebookEditor.cancelNotebookCellExecution(context.cell);
	}
});

export class ExecuteCellAction extends MenuItemAction {
	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService
	) {
		super(
			{
				id: EXECUTE_CELL_COMMAND_ID,
				title: localize('notebookActions.executeCell', "Execute Cell"),
				icon: { id: 'codicon/play' }
			},
			undefined,
			{ shouldForwardArgs: true },
			contextKeyService,
			commandService);
	}
}

export class CancelCellAction extends MenuItemAction {
	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService
	) {
		super(
			{
				id: CANCEL_CELL_COMMAND_ID,
				title: localize('notebookActions.CancelCell', "Cancel Execution"),
				icon: { id: 'codicon/primitive-square' }
			},
			undefined,
			{ shouldForwardArgs: true },
			contextKeyService,
			commandService);
	}
}


registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: EXECUTE_CELL_SELECT_BELOW,
			title: localize('notebookActions.executeAndSelectBelow', "Execute Notebook Cell and Select Below"),
			keybinding: {
				when: NOTEBOOK_EDITOR_FOCUSED,
				primary: KeyMod.Shift | KeyCode.Enter,
				weight: EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const idx = context.notebookEditor.viewModel?.getCellIndex(context.cell);
		if (typeof idx !== 'number') {
			return;
		}

		const executionP = runCell(accessor, context);

		// Try to select below, fall back on inserting
		const nextCell = context.notebookEditor.viewModel?.viewCells[idx + 1];
		if (nextCell) {
			context.notebookEditor.focusNotebookCell(nextCell, 'container');
		} else {
			const newCell = context.notebookEditor.insertNotebookCell(context.cell, CellKind.Code, 'below');
			if (newCell) {
				context.notebookEditor.focusNotebookCell(newCell, 'editor');
			}
		}

		return executionP;
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: EXECUTE_CELL_INSERT_BELOW,
			title: localize('notebookActions.executeAndInsertBelow', "Execute Notebook Cell and Insert Below"),
			keybinding: {
				when: NOTEBOOK_EDITOR_FOCUSED,
				primary: KeyMod.Alt | KeyCode.Enter,
				weight: EDITOR_WIDGET_ACTION_WEIGHT
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

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: RENDER_ALL_MARKDOWN_CELLS,
			title: localize('notebookActions.renderMarkdown', "Render All Markdown Cells"),
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		renderAllMarkdownCells(context);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: EXECUTE_NOTEBOOK_COMMAND_ID,
			title: localize('notebookActions.executeNotebook', "Execute Notebook"),
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		renderAllMarkdownCells(context);

		const editorGroupService = accessor.get(IEditorGroupsService);
		const group = editorGroupService.activeGroup;

		if (group) {
			if (group.activeEditor) {
				group.pinEditor(group.activeEditor);
			}
		}

		return context.notebookEditor.executeNotebook();
	}
});

function renderAllMarkdownCells(context: INotebookCellActionContext): void {
	context.notebookEditor.viewModel!.viewCells.forEach(cell => {
		if (cell.cellKind === CellKind.Markdown) {
			cell.editState = CellEditState.Preview;
		}
	});
}

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: CANCEL_NOTEBOOK_COMMAND_ID,
			title: localize('notebookActions.cancelNotebook', "Cancel Notebook Execution"),
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		return context.notebookEditor.cancelNotebookExecution();
	}
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: EXECUTE_NOTEBOOK_COMMAND_ID,
		title: localize('notebookActions.menu.executeNotebook', "Execute Notebook (Run all cells)"),
		icon: { id: 'codicon/run-all' }
	},
	order: -1,
	group: 'navigation',
	when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EXECUTING_NOTEBOOK.toNegated(), NOTEBOOK_EDITOR_RUNNABLE)
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: CANCEL_NOTEBOOK_COMMAND_ID,
		title: localize('notebookActions.menu.cancelNotebook', "Stop Notebook Execution"),
		icon: { id: 'codicon/primitive-square' }
	},
	order: -1,
	group: 'navigation',
	when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EXECUTING_NOTEBOOK)
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: CHANGE_CELL_TO_CODE_COMMAND_ID,
			title: localize('notebookActions.changeCellToCode', "Change Cell to Code"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyCode.KEY_Y,
				weight: KeybindingWeight.WorkbenchContrib
			},
			precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR),
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		await changeCellToKind(CellKind.Code, context);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: CHANGE_CELL_TO_MARKDOWN_COMMAND_ID,
			title: localize('notebookActions.changeCellToMarkdown', "Change Cell to Markdown"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyCode.KEY_M,
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		await changeCellToKind(CellKind.Markdown, context);
	}
});

export function getActiveNotebookEditor(editorService: IEditorService): INotebookEditor | undefined {
	// TODO can `isNotebookEditor` be on INotebookEditor to avoid a circular dependency?
	const activeEditorPane = editorService.activeEditorPane as unknown as { isNotebookEditor?: boolean } | undefined;
	return activeEditorPane?.isNotebookEditor ? (editorService.activeEditorPane?.getControl() as INotebookEditor) : undefined;
}

async function runCell(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
	if (context.cell.metadata?.runState === NotebookCellRunState.Running) {
		return;
	}

	const editorGroupService = accessor.get(IEditorGroupsService);
	const group = editorGroupService.activeGroup;

	if (group) {
		if (group.activeEditor) {
			group.pinEditor(group.activeEditor);
		}
	}

	return context.notebookEditor.executeNotebookCell(context.cell);
}

export async function changeCellToKind(kind: CellKind, context: INotebookCellActionContext, language?: string): Promise<ICellViewModel | null> {
	const { cell, notebookEditor } = context;

	if (cell.cellKind === kind) {
		return null;
	}

	const text = cell.getText();
	if (!notebookEditor.insertNotebookCell(cell, kind, 'below', text)) {
		return null;
	}

	const idx = notebookEditor.viewModel?.getCellIndex(cell);
	if (typeof idx !== 'number') {
		return null;
	}

	const newCell = notebookEditor.viewModel?.viewCells[idx + 1];
	if (!newCell) {
		return null;
	}

	if (language) {
		newCell.model.language = language;
	}

	await notebookEditor.focusNotebookCell(newCell, cell.editState === CellEditState.Editing ? 'editor' : 'container');
	notebookEditor.deleteNotebookCell(cell);

	return newCell;
}

export interface INotebookCellActionContext {
	readonly cellTemplate?: BaseCellRenderTemplate;
	readonly cell: ICellViewModel;
	readonly notebookEditor: INotebookEditor;
	readonly ui?: boolean;
}

abstract class InsertCellCommand extends NotebookAction {
	constructor(
		desc: Readonly<IAction2Options>,
		private kind: CellKind,
		private direction: 'above' | 'below'
	) {
		super(desc);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const newCell = context.notebookEditor.insertNotebookCell(context.cell, this.kind, this.direction, undefined, context.ui);
		if (newCell) {
			await context.notebookEditor.focusNotebookCell(newCell, 'editor');
		}
	}
}

registerAction2(class extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_CODE_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.insertCodeCellAbove', "Insert Code Cell Above"),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WorkbenchContrib
				},
			},
			CellKind.Code,
			'above');
	}
});

registerAction2(class extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
				title: localize('notebookActions.insertCodeCellBelow', "Insert Code Cell Below"),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.Enter,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WorkbenchContrib
				},
			},
			CellKind.Code,
			'below');
	}
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellBetween, {
	command: {
		id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
		title: localize('notebookActions.menu.insertCode', "$(add) Code"),
		tooltip: localize('notebookActions.menu.insertCode.tooltip', "Add Code Cell")
	},
	order: 0,
	group: 'inline'
});

registerAction2(class extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_MARKDOWN_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.insertMarkdownCellAbove', "Insert Markdown Cell Above"),
			},
			CellKind.Markdown,
			'above');
	}
});

registerAction2(class extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID,
				title: localize('notebookActions.insertMarkdownCellBelow', "Insert Markdown Cell Below"),
			},
			CellKind.Markdown,
			'below');
	}
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellBetween, {
	command: {
		id: INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID,
		title: localize('notebookActions.menu.insertMarkdown', "$(add) Markdown"),
		tooltip: localize('notebookActions.menu.insertMarkdown.tooltip', "Add Markdown Cell")
	},
	order: 1,
	group: 'inline'
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: EDIT_CELL_COMMAND_ID,
				title: localize('notebookActions.editCell', "Edit Cell"),
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyCode.Enter,
					weight: KeybindingWeight.WorkbenchContrib
				},
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(
						NOTEBOOK_CELL_TYPE.isEqualTo('markdown'),
						NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.toNegated(),
						NOTEBOOK_CELL_EDITABLE),
					order: CellToolbarOrder.EditCell,
					group: CELL_TITLE_GROUP_ID
				},
				icon: { id: 'codicon/pencil' }
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		context.notebookEditor.focusNotebookCell(context.cell, 'editor');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: QUIT_EDIT_CELL_COMMAND_ID,
				title: localize('notebookActions.quitEdit', "Stop Editing Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(
						NOTEBOOK_CELL_TYPE.isEqualTo('markdown'),
						NOTEBOOK_CELL_MARKDOWN_EDIT_MODE,
						NOTEBOOK_CELL_EDITABLE),
					order: CellToolbarOrder.SaveCell,
					group: CELL_TITLE_GROUP_ID
				},
				icon: { id: 'codicon/check' },
				keybinding: {
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						InputFocusedContext,
						EditorContextKeys.hoverVisible.toNegated(),
						EditorContextKeys.hasNonEmptySelection.toNegated()),
					primary: KeyCode.Escape,
					weight: EDITOR_WIDGET_ACTION_WEIGHT - 5
				},
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		if (context.cell.cellKind === CellKind.Markdown) {
			context.cell.editState = CellEditState.Preview;
		}

		return context.notebookEditor.focusNotebookCell(context.cell, 'container');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: DELETE_CELL_COMMAND_ID,
				title: localize('notebookActions.deleteCell', "Delete Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					order: CellToolbarOrder.DeleteCell,
					when: NOTEBOOK_EDITOR_EDITABLE,
					group: CELL_TITLE_GROUP_ID
				},
				keybinding: {
					primary: KeyCode.Delete,
					mac: {
						primary: KeyMod.CtrlCmd | KeyCode.Backspace
					},
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					weight: KeybindingWeight.WorkbenchContrib
				},
				icon: { id: 'codicon/trash' },
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const index = context.notebookEditor.viewModel!.getCellIndex(context.cell);
		const result = await context.notebookEditor.deleteNotebookCell(context.cell);

		if (result) {
			// deletion succeeds, move focus to the next cell
			const nextCellIdx = index < context.notebookEditor.viewModel!.length ? index : context.notebookEditor.viewModel!.length - 1;
			if (nextCellIdx >= 0) {
				await context.notebookEditor.focusNotebookCell(context.notebookEditor.viewModel!.viewCells[nextCellIdx], 'container');
			} else {
				// No cells left, insert a new empty one
				const newCell = context.notebookEditor.insertNotebookCell(undefined, context.cell.cellKind);
				if (newCell) {
					await context.notebookEditor.focusNotebookCell(newCell, 'editor');
				}
			}
		}
	}
});

async function moveCell(context: INotebookCellActionContext, direction: 'up' | 'down'): Promise<void> {
	const result = direction === 'up' ?
		await context.notebookEditor.moveCellUp(context.cell) :
		await context.notebookEditor.moveCellDown(context.cell);

	if (result) {
		// move cell command only works when the cell container has focus
		await context.notebookEditor.focusNotebookCell(result, 'container');
	}
}

async function copyCell(context: INotebookCellActionContext, direction: 'up' | 'down'): Promise<void> {
	const text = context.cell.getText();
	const newCellDirection = direction === 'up' ? 'above' : 'below';
	const newCell = context.notebookEditor.insertNotebookCell(context.cell, context.cell.cellKind, newCellDirection, text);
	if (newCell) {
		await context.notebookEditor.focusNotebookCell(newCell, 'container');
	}
}

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: MOVE_CELL_UP_COMMAND_ID,
				title: localize('notebookActions.moveCellUp', "Move Cell Up"),
				icon: { id: 'codicon/arrow-up' },
				keybinding: {
					primary: KeyMod.Alt | KeyCode.UpArrow,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return moveCell(context, 'up');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: MOVE_CELL_DOWN_COMMAND_ID,
				title: localize('notebookActions.moveCellDown', "Move Cell Down"),
				icon: { id: 'codicon/arrow-down' },
				keybinding: {
					primary: KeyMod.Alt | KeyCode.DownArrow,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return moveCell(context, 'down');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: COPY_CELL_COMMAND_ID,
				title: localize('notebookActions.copy', "Copy Cell"),
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
					weight: EDITOR_WIDGET_ACTION_WEIGHT
				},
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const clipboardService = accessor.get<IClipboardService>(IClipboardService);
		const notebookService = accessor.get<INotebookService>(INotebookService);
		clipboardService.writeText(context.cell.getText());
		notebookService.setToCopy([context.cell.model]);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: CUT_CELL_COMMAND_ID,
				title: localize('notebookActions.cut', "Cut Cell"),
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyCode.KEY_X,
					weight: EDITOR_WIDGET_ACTION_WEIGHT
				},
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const clipboardService = accessor.get<IClipboardService>(IClipboardService);
		const notebookService = accessor.get<INotebookService>(INotebookService);
		clipboardService.writeText(context.cell.getText());
		const viewModel = context.notebookEditor.viewModel;

		if (!viewModel) {
			return;
		}

		viewModel.deleteCell(viewModel.getCellIndex(context.cell), true);
		notebookService.setToCopy([context.cell.model]);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: PASTE_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.pasteAbove', "Paste Cell Above"),
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_V,
					weight: EDITOR_WIDGET_ACTION_WEIGHT
				},
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const notebookService = accessor.get<INotebookService>(INotebookService);
		const pasteCells = notebookService.getToCopy() || [];

		const viewModel = context.notebookEditor.viewModel;

		if (!viewModel) {
			return;
		}

		const currCellIndex = viewModel.getCellIndex(context!.cell);

		pasteCells.reverse().forEach(pasteCell => {
			viewModel.insertCell(currCellIndex, pasteCell, true);
			return;
		});
	}
});
registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: PASTE_CELL_COMMAND_ID,
				title: localize('notebookActions.paste', "Paste Cell"),
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
					weight: EDITOR_WIDGET_ACTION_WEIGHT
				},
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const notebookService = accessor.get<INotebookService>(INotebookService);
		const pasteCells = notebookService.getToCopy() || [];

		const viewModel = context.notebookEditor.viewModel;

		if (!viewModel) {
			return;
		}

		const currCellIndex = viewModel.getCellIndex(context!.cell);

		pasteCells.reverse().forEach(pasteCell => {
			viewModel.insertCell(currCellIndex + 1, pasteCell, true);
			return;
		});
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: COPY_CELL_UP_COMMAND_ID,
				title: localize('notebookActions.copyCellUp', "Copy Cell Up"),
				keybinding: {
					primary: KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return copyCell(context, 'up');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: COPY_CELL_DOWN_COMMAND_ID,
				title: localize('notebookActions.copyCellDown', "Copy Cell Down"),
				keybinding: {
					primary: KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return copyCell(context, 'down');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_FOCUS_NEXT_EDITOR,
			title: localize('cursorMoveDown', 'Focus Next Cell Editor'),
			keybinding: [
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						ContextKeyExpr.has(InputFocusedContextKey),
						EditorContextKeys.editorTextFocus,
						NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('top'),
						NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('none')),
					primary: KeyCode.DownArrow,
					weight: EDITOR_WIDGET_ACTION_WEIGHT
				},
				{
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED),
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
					mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.DownArrow, },
					weight: KeybindingWeight.WorkbenchContrib
				}
			]
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		const activeCell = context.cell;

		const idx = editor.viewModel?.getCellIndex(activeCell);
		if (typeof idx !== 'number') {
			return;
		}

		const newCell = editor.viewModel?.viewCells[idx + 1];

		if (!newCell) {
			return;
		}

		const newFocusMode = newCell.cellKind === CellKind.Markdown && newCell.editState === CellEditState.Preview ? 'container' : 'editor';
		editor.focusNotebookCell(newCell, newFocusMode);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_FOCUS_PREVIOUS_EDITOR,
			title: localize('cursorMoveUp', 'Focus Previous Cell Editor'),
			keybinding: {
				when: ContextKeyExpr.and(
					NOTEBOOK_EDITOR_FOCUSED,
					ContextKeyExpr.has(InputFocusedContextKey),
					EditorContextKeys.editorTextFocus,
					NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('bottom'),
					NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('none')),
				primary: KeyCode.UpArrow,
				weight: EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		const activeCell = context.cell;

		const idx = editor.viewModel?.getCellIndex(activeCell);
		if (typeof idx !== 'number') {
			return;
		}

		if (idx < 1) {
			// we don't do loop
			return;
		}

		const newCell = editor.viewModel?.viewCells[idx - 1];

		if (!newCell) {
			return;
		}

		const newFocusMode = newCell.cellKind === CellKind.Markdown && newCell.editState === CellEditState.Preview ? 'container' : 'editor';
		editor.focusNotebookCell(newCell, newFocusMode);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: FOCUS_IN_OUTPUT_COMMAND_ID,
			title: localize('focusOutput', 'Focus In Active Cell Output'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_CELL_HAS_OUTPUTS),
				primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
				mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.DownArrow, },
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		const activeCell = context.cell;
		editor.focusNotebookCell(activeCell, 'output');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: FOCUS_OUT_OUTPUT_COMMAND_ID,
			title: localize('focusOutputOut', 'Focus Out Active Cell Output'),
			keybinding: {
				when: NOTEBOOK_EDITOR_FOCUSED,
				primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
				mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.UpArrow, },
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		const activeCell = context.cell;
		await editor.focusNotebookCell(activeCell, 'editor');
	}
});


registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_UNDO,
			title: localize('undo', 'Undo'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyCode.KEY_Z,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		await context.notebookEditor.viewModel?.undo();
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_REDO,
			title: localize('redo', 'Redo'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		await context.notebookEditor.viewModel?.redo();
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_FOCUS_TOP,
			title: localize('focusFirstCell', 'Focus First Cell'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyCode.Home,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow },
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (!editor.viewModel || !editor.viewModel.length) {
			return;
		}

		const firstCell = editor.viewModel.viewCells[0];
		await editor.focusNotebookCell(firstCell, 'container');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_FOCUS_BOTTOM,
			title: localize('focusLastCell', 'Focus Last Cell'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyCode.End,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow },
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (!editor.viewModel || !editor.viewModel.length) {
			return;
		}

		const firstCell = editor.viewModel.viewCells[editor.viewModel.length - 1];
		await editor.focusNotebookCell(firstCell, 'container');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: CLEAR_CELL_OUTPUTS_COMMAND_ID,
			title: localize('clearActiveCellOutputs', 'Clear Active Cell Outputs'),
			menu: {
				id: MenuId.NotebookCellTitle,
				when: ContextKeyExpr.and(NOTEBOOK_CELL_TYPE.isEqualTo('code'), NOTEBOOK_EDITOR_RUNNABLE),
				order: CellToolbarOrder.ClearCellOutput,
				group: CELL_TITLE_GROUP_ID
			},
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_CELL_HAS_OUTPUTS),
				primary: KeyMod.Alt | KeyCode.Delete,
				weight: KeybindingWeight.WorkbenchContrib
			},
			icon: { id: 'codicon/clear-all' },
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (!editor.viewModel || !editor.viewModel.length) {
			return;
		}

		editor.viewModel.notebookDocument.clearCellOutput(context.cell.handle);
	}
});

interface ILanguagePickInput extends IQuickPickItem {
	languageId: string;
	description: string;
}

export class ChangeCellLanguageAction extends NotebookAction {
	constructor() {
		super({
			id: CHANGE_CELL_LANGUAGE,
			title: localize('changeLanguage', 'Change Cell Language'),
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		this.showLanguagePicker(accessor, context);
	}

	private async showLanguagePicker(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const topItems: ILanguagePickInput[] = [];
		const mainItems: ILanguagePickInput[] = [];

		const modeService = accessor.get(IModeService);
		const modelService = accessor.get(IModelService);
		const quickInputService = accessor.get(IQuickInputService);

		const providerLanguages = [...context.notebookEditor.viewModel!.notebookDocument.languages, 'markdown'];
		providerLanguages.forEach(languageId => {
			let description: string;
			if (languageId === context.cell.language) {
				description = localize('languageDescription', "({0}) - Current Language", languageId);
			} else {
				description = localize('languageDescriptionConfigured', "({0})", languageId);
			}

			const languageName = modeService.getLanguageName(languageId);
			if (!languageName) {
				// Notebook has unrecognized language
				return;
			}

			const item = <ILanguagePickInput>{
				label: languageName,
				iconClasses: getIconClasses(modelService, modeService, this.getFakeResource(languageName, modeService)),
				description,
				languageId
			};

			if (languageId === 'markdown' || languageId === context.cell.language) {
				topItems.push(item);
			} else {
				mainItems.push(item);
			}
		});

		mainItems.sort((a, b) => {
			return a.description.localeCompare(b.description);
		});

		const picks: QuickPickInput[] = [
			...topItems,
			{ type: 'separator' },
			...mainItems
		];

		const selection = await quickInputService.pick(picks, { placeHolder: localize('pickLanguageToConfigure', "Select Language Mode") }) as ILanguagePickInput | undefined;
		if (selection && selection.languageId) {
			if (selection.languageId === 'markdown' && context.cell?.language !== 'markdown') {
				const newCell = await changeCellToKind(CellKind.Markdown, { cell: context.cell, notebookEditor: context.notebookEditor });
				if (newCell) {
					await context.notebookEditor.focusNotebookCell(newCell, 'editor');
				}
			} else if (selection.languageId !== 'markdown' && context.cell?.language === 'markdown') {
				await changeCellToKind(CellKind.Code, { cell: context.cell, notebookEditor: context.notebookEditor }, selection.languageId);
			} else {
				context.notebookEditor.viewModel!.notebookDocument.changeCellLanguage(context.cell.handle, selection.languageId);
			}
		}
	}

	/**
	 * Copied from editorStatus.ts
	 */
	private getFakeResource(lang: string, modeService: IModeService): URI | undefined {
		let fakeResource: URI | undefined;

		const extensions = modeService.getExtensions(lang);
		if (extensions?.length) {
			fakeResource = URI.file(extensions[0]);
		} else {
			const filenames = modeService.getFilenames(lang);
			if (filenames?.length) {
				fakeResource = URI.file(filenames[0]);
			}
		}

		return fakeResource;
	}
}
registerAction2(ChangeCellLanguageAction);

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: CLEAR_ALL_CELLS_OUTPUTS_COMMAND_ID,
			title: localize('clearAllCellsOutputs', 'Clear All Cells Outputs'),
			menu: {
				id: MenuId.EditorTitle,
				when: NOTEBOOK_IS_ACTIVE_EDITOR,
				group: 'navigation',
				order: 0
			},
			icon: { id: 'codicon/clear-all' },
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (!editor.viewModel || !editor.viewModel.length) {
			return;
		}

		editor.viewModel.notebookDocument.clearAllCellOutputs();
	}
});

async function splitCell(context: INotebookCellActionContext): Promise<void> {
	if (context.cell.cellKind === CellKind.Code) {
		const newCells = await context.notebookEditor.splitNotebookCell(context.cell);
		if (newCells) {
			await context.notebookEditor.focusNotebookCell(newCells[newCells.length - 1], 'editor');
		}
	}
}

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: SPLIT_CELL_COMMAND_ID,
				title: localize('notebookActions.splitCell', "Split Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_CELL_TYPE.isEqualTo('code'), NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, InputFocusedContext),
					order: CellToolbarOrder.SplitCell,
					group: CELL_TITLE_GROUP_ID
				},
				icon: { id: 'codicon/split-vertical' },
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_CELL_TYPE.isEqualTo('code'), NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, InputFocusedContext),
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.US_BACKSLASH,
					weight: KeybindingWeight.WorkbenchContrib
				},
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return splitCell(context);
	}
});


async function joinCells(context: INotebookCellActionContext, direction: 'above' | 'below'): Promise<void> {
	const cell = await context.notebookEditor.joinNotebookCells(context.cell, direction, CellKind.Code);
	if (cell) {
		await context.notebookEditor.focusNotebookCell(cell, 'editor');
	}
}

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: JOIN_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.joinCellAbove', "Join with Previous Cell"),
				keybinding: {
					when: NOTEBOOK_EDITOR_FOCUSED,
					primary: KeyMod.WinCtrl | KeyMod.Alt | KeyMod.Shift | KeyCode.KEY_J,
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return joinCells(context, 'above');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: JOIN_CELL_BELOW_COMMAND_ID,
				title: localize('notebookActions.joinCellBelow', "Join with Next Cell"),
				keybinding: {
					when: NOTEBOOK_EDITOR_FOCUSED,
					primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KEY_J,
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return joinCells(context, 'below');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: CENTER_ACTIVE_CELL,
			title: localize('notebookActions.centerActiveCell', "Center Active Cell"),
			keybinding: {
				when: NOTEBOOK_EDITOR_FOCUSED,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_L,
				mac: {
					primary: KeyMod.WinCtrl | KeyCode.KEY_L,
				},
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		return context.notebookEditor.revealInCenter(context.cell);
	}
});
