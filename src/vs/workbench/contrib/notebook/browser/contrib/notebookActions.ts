/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { Action2, IAction2Options, MenuId, MenuItemAction, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext, InputFocusedContextKey, IsDevelopmentContext } from 'vs/platform/contextkey/common/contextkeys';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { NOTEBOOK_CELL_EDITABLE_CONTEXT_KEY, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE_CONTEXT_KEY, NOTEBOOK_CELL_TYPE_CONTEXT_KEY, NOTEBOOK_EDITABLE_CONTEXT_KEY, NOTEBOOK_EXECUTING_KEY } from 'vs/workbench/contrib/notebook/browser/constants';
import { BaseCellRenderTemplate, CellEditState, CellRunState, ICellViewModel, INotebookEditor, KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED, NOTEBOOK_EDITOR_EXECUTING_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind, NOTEBOOK_EDITOR_CURSOR_BOUNDARY } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';

const INSERT_CODE_CELL_ABOVE_COMMAND_ID = 'workbench.notebook.code.insertCellAbove';
const INSERT_CODE_CELL_BELOW_COMMAND_ID = 'workbench.notebook.code.insertCellBelow';
const INSERT_MARKDOWN_CELL_ABOVE_COMMAND_ID = 'workbench.notebook.markdown.insertCellAbove';
const INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID = 'workbench.notebook.markdown.insertCellBelow';

const EDIT_CELL_COMMAND_ID = 'workbench.notebook.cell.edit';
const SAVE_CELL_COMMAND_ID = 'workbench.notebook.cell.save';
const DELETE_CELL_COMMAND_ID = 'workbench.notebook.cell.delete';

const MOVE_CELL_UP_COMMAND_ID = 'workbench.notebook.cell.moveUp';
const MOVE_CELL_DOWN_COMMAND_ID = 'workbench.notebook.cell.moveDown';
const COPY_CELL_COMMAND_ID = 'workbench.notebook.cell.copy';
const CUT_CELL_COMMAND_ID = 'workbench.notebook.cell.cut';
const PASTE_CELL_COMMAND_ID = 'workbench.notebook.cell.paste';
const PASTE_CELL_ABOVE_COMMAND_ID = 'workbench.notebook.cell.pasteAbove';
const COPY_CELL_UP_COMMAND_ID = 'workbench.notebook.cell.copyUp';
const COPY_CELL_DOWN_COMMAND_ID = 'workbench.notebook.cell.copyDown';

const EXECUTE_CELL_COMMAND_ID = 'workbench.notebook.cell.execute';
const CANCEL_CELL_COMMAND_ID = 'workbench.notebook.cell.cancelExecution';
const EXECUTE_NOTEBOOK_COMMAND_ID = 'workbench.notebook.executeNotebook';
const CANCEL_NOTEBOOK_COMMAND_ID = 'workbench.notebook.cancelExecution';

const NOTEBOOK_ACTIONS_CATEGORY = localize('notebookActions.category', "Notebook");

const EDITOR_WIDGET_ACTION_WEIGHT = KeybindingWeight.EditorContrib; // smaller than Suggest Widget, etc

const enum CellToolbarOrder {
	MoveCellUp,
	MoveCellDown,
	EditCell,
	SaveCell,
	InsertCell,
	DeleteCell
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: EXECUTE_CELL_COMMAND_ID,
			category: NOTEBOOK_ACTIONS_CATEGORY,
			title: localize('notebookActions.execute', "Execute Cell"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext),
				primary: KeyMod.WinCtrl | KeyCode.Enter,
				win: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
				},
				weight: EDITOR_WIDGET_ACTION_WEIGHT
			},
			icon: { id: 'codicon/play' },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext): Promise<void> {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

		runCell(context);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CANCEL_CELL_COMMAND_ID,
			title: localize('notebookActions.cancel', "Stop Cell Execution"),
			category: NOTEBOOK_ACTIONS_CATEGORY,
			icon: { id: 'codicon/primitive-square' },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext): Promise<void> {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

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


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.executeNotebookCellSelectBelow',
			title: localize('notebookActions.executeAndSelectBelow', "Execute Notebook Cell and Select Below"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext),
				primary: KeyMod.Shift | KeyCode.Enter,
				weight: EDITOR_WIDGET_ACTION_WEIGHT
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const activeCell = await runActiveCell(accessor);
		if (!activeCell) {
			return;
		}

		const editor = getActiveNotebookEditor(editorService);
		if (!editor) {
			return;
		}

		const idx = editor.viewModel?.getCellIndex(activeCell);
		if (typeof idx !== 'number') {
			return;
		}

		// Try to select below, fall back on inserting
		const nextCell = editor.viewModel?.viewCells[idx + 1];
		if (nextCell) {
			editor.focusNotebookCell(nextCell, false);
		} else {
			await editor.insertNotebookCell(activeCell, CellKind.Code, 'below');
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.executeNotebookCellInsertBelow',
			title: localize('notebookActions.executeAndInsertBelow', "Execute Notebook Cell and Insert Below"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext),
				primary: KeyMod.Alt | KeyCode.Enter,
				weight: EDITOR_WIDGET_ACTION_WEIGHT
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const activeCell = await runActiveCell(accessor);
		if (!activeCell) {
			return;
		}

		const editor = getActiveNotebookEditor(editorService);
		if (!editor) {
			return;
		}

		await editor.insertNotebookCell(activeCell, CellKind.Code, 'below');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: EXECUTE_NOTEBOOK_COMMAND_ID,
			title: localize('notebookActions.executeNotebook', "Execute Notebook"),
			category: NOTEBOOK_ACTIONS_CATEGORY,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getActiveNotebookEditor(editorService);
		if (!editor) {
			return;
		}

		return editor.executeNotebook();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CANCEL_NOTEBOOK_COMMAND_ID,
			title: localize('notebookActions.cancelNotebook', "Cancel Notebook Execution"),
			category: NOTEBOOK_ACTIONS_CATEGORY,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getActiveNotebookEditor(editorService);
		if (!editor) {
			return;
		}

		return editor.cancelNotebookExecution();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.quitNotebookEdit',
			title: localize('notebookActions.quitEditing', "Quit Notebook Cell Editing"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext),
				primary: KeyCode.Escape,
				weight: EDITOR_WIDGET_ACTION_WEIGHT - 5
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		let editorService = accessor.get(IEditorService);
		let editor = getActiveNotebookEditor(editorService);

		if (!editor) {
			return;
		}

		let activeCell = editor.getActiveCell();
		if (activeCell) {
			if (activeCell.cellKind === CellKind.Markdown) {
				activeCell.editState = CellEditState.Preview;
			}

			editor.focusNotebookCell(activeCell, false);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.notebook.hideFind',
			title: localize('notebookActions.hideFind', "Hide Find in Notebook"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED),
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		let editorService = accessor.get(IEditorService);
		let editor = getActiveNotebookEditor(editorService);

		editor?.hideFind();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.notebook.find',
			title: localize('notebookActions.findInNotebook', "Find in Notebook"),
			keybinding: {
				when: NOTEBOOK_EDITOR_FOCUSED,
				primary: KeyCode.KEY_F | KeyMod.CtrlCmd,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		let editorService = accessor.get(IEditorService);
		let editor = getActiveNotebookEditor(editorService);

		editor?.showFind();
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
	when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(NOTEBOOK_EXECUTING_KEY))
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: CANCEL_NOTEBOOK_COMMAND_ID,
		title: localize('notebookActions.menu.cancelNotebook', "Stop Notebook Execution"),
		icon: { id: 'codicon/primitive-square' }
	},
	order: -1,
	group: 'navigation',
	when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EXECUTING_NOTEBOOK)
});


MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: EXECUTE_CELL_COMMAND_ID,
		title: localize('notebookActions.menu.execute', "Execute Notebook Cell"),
		icon: { id: 'codicon/run' }
	},
	order: 0,
	group: 'navigation',
	when: NOTEBOOK_EDITOR_FOCUSED
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.changeCellToCode',
			title: localize('notebookActions.changeCellToCode', "Change Cell to Code"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyCode.KEY_Y,
				weight: KeybindingWeight.WorkbenchContrib
			},
			category: NOTEBOOK_ACTIONS_CATEGORY,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		return changeActiveCellToKind(CellKind.Code, accessor);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.changeCellToMarkdown',
			title: localize('notebookActions.changeCellToMarkdown', "Change Cell to Markdown"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyCode.KEY_M,
				weight: KeybindingWeight.WorkbenchContrib
			},
			category: NOTEBOOK_ACTIONS_CATEGORY,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext): Promise<void> {
		return changeActiveCellToKind(CellKind.Markdown, accessor);
	}
});

export function getActiveNotebookEditor(editorService: IEditorService): INotebookEditor | undefined {
	// TODO can `isNotebookEditor` be on INotebookEditor to avoid a circular dependency?
	const activeEditorPane = editorService.activeEditorPane as any | undefined;
	return activeEditorPane?.isNotebookEditor ? activeEditorPane : undefined;
}

async function runActiveCell(accessor: ServicesAccessor): Promise<ICellViewModel | undefined> {
	const editorService = accessor.get(IEditorService);
	const editor = getActiveNotebookEditor(editorService);
	if (!editor) {
		return;
	}

	const activeCell = editor.getActiveCell();
	if (!activeCell) {
		return;
	}

	editor.executeNotebookCell(activeCell);
	return activeCell;
}

async function runCell(context: INotebookCellActionContext): Promise<void> {
	if (context.cell.runState === CellRunState.Running) {
		return;
	}

	return context.notebookEditor.executeNotebookCell(context.cell);
}

async function changeActiveCellToKind(kind: CellKind, accessor: ServicesAccessor): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const editor = getActiveNotebookEditor(editorService);
	if (!editor) {
		return;
	}

	const activeCell = editor.getActiveCell();
	if (!activeCell) {
		return;
	}

	if (activeCell.cellKind === kind) {
		return;
	}

	const text = activeCell.getText();
	await editor.insertNotebookCell(activeCell, kind, 'below', text);
	const idx = editor.viewModel?.getCellIndex(activeCell);
	if (typeof idx !== 'number') {
		return;
	}

	const newCell = editor.viewModel?.viewCells[idx + 1];
	if (!newCell) {
		return;
	}

	editor.focusNotebookCell(newCell, true);
	editor.deleteNotebookCell(activeCell);
}

export interface INotebookCellActionContext {
	cellTemplate?: BaseCellRenderTemplate;
	cell: ICellViewModel;
	notebookEditor: INotebookEditor;
}

function isCellActionContext(context: any): context is INotebookCellActionContext {
	return context && !!context.cell && !!context.notebookEditor;
}

function getActiveCellContext(accessor: ServicesAccessor): INotebookCellActionContext | undefined {
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

abstract class InsertCellCommand extends Action2 {
	constructor(
		desc: Readonly<IAction2Options>,
		private kind: CellKind,
		private direction: 'above' | 'below'
	) {
		super(desc);
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext): Promise<void> {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

		await context.notebookEditor.insertNotebookCell(context.cell, this.kind, this.direction);
	}
}

registerAction2(class extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_CODE_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.insertCodeCellAbove', "Insert Code Cell Above"),
				f1: true
			},
			CellKind.Code,
			'above');
	}
});

export class InsertCodeCellAction extends MenuItemAction {
	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService
	) {
		super(
			{
				id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
				title: localize('notebookActions.insertCodeCellBelow', "Insert Code Cell Below"),
				// icon: { id: 'codicon/add' },
			},
			undefined,
			{ shouldForwardArgs: true },
			contextKeyService,
			commandService);
	}
}

registerAction2(class extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
				title: localize('notebookActions.insertCodeCellBelow', "Insert Code Cell Below"),
				category: NOTEBOOK_ACTIONS_CATEGORY,
				icon: { id: 'codicon/add' },
				menu: {
					id: MenuId.NotebookCellTitle,
					order: CellToolbarOrder.InsertCell,
					alt: {
						id: INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID,
						title: localize('notebookActions.insertMarkdownCellBelow', "Insert Markdown Cell Below"),
						icon: { id: 'codicon/add' },
					},
					when: ContextKeyExpr.equals(NOTEBOOK_EDITABLE_CONTEXT_KEY, true)
				},
				f1: true
			},
			CellKind.Code,
			'below');
	}
});

registerAction2(class extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_MARKDOWN_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.insertMarkdownCellAbove', "Insert Markdown Cell Above"),
				f1: true
			},
			CellKind.Markdown,
			'above');
	}
});

export class InsertMarkdownCellAction extends MenuItemAction {
	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService
	) {
		super(
			{
				id: INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID,
				title: localize('notebookActions.insertMarkdownCellBelow', "Insert Markdown Cell Below")
			},
			undefined,
			{ shouldForwardArgs: true },
			contextKeyService,
			commandService);
	}
}

registerAction2(class extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID,
				title: localize('notebookActions.insertMarkdownCellBelow', "Insert Markdown Cell Below")
			},
			CellKind.Markdown,
			'below');
	}
});

registerAction2(class extends Action2 {
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
						ContextKeyExpr.equals(NOTEBOOK_CELL_TYPE_CONTEXT_KEY, 'markdown'),
						ContextKeyExpr.equals(NOTEBOOK_CELL_MARKDOWN_EDIT_MODE_CONTEXT_KEY, false),
						ContextKeyExpr.equals(NOTEBOOK_CELL_EDITABLE_CONTEXT_KEY, true)),
					order: CellToolbarOrder.EditCell
				},
				icon: { id: 'codicon/pencil' }
			});
	}

	run(accessor: ServicesAccessor, context?: INotebookCellActionContext) {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

		return context.notebookEditor.editNotebookCell(context.cell);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super(
			{
				id: SAVE_CELL_COMMAND_ID,
				title: localize('notebookActions.saveCell', "Save Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(
						ContextKeyExpr.equals(NOTEBOOK_CELL_TYPE_CONTEXT_KEY, 'markdown'),
						ContextKeyExpr.equals(NOTEBOOK_CELL_MARKDOWN_EDIT_MODE_CONTEXT_KEY, true),
						ContextKeyExpr.equals(NOTEBOOK_CELL_EDITABLE_CONTEXT_KEY, true)),
					order: CellToolbarOrder.SaveCell
				},
				icon: { id: 'codicon/save' }
			});
	}

	run(accessor: ServicesAccessor, context?: INotebookCellActionContext) {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

		return context.notebookEditor.saveNotebookCell(context.cell);
	}
});


registerAction2(class extends Action2 {
	constructor() {
		super(
			{
				id: DELETE_CELL_COMMAND_ID,
				title: localize('notebookActions.deleteCell', "Delete Cell"),
				category: NOTEBOOK_ACTIONS_CATEGORY,
				menu: {
					id: MenuId.NotebookCellTitle,
					order: CellToolbarOrder.DeleteCell,
					when: ContextKeyExpr.equals(NOTEBOOK_EDITABLE_CONTEXT_KEY, true)
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
				f1: true
			});
	}

	run(accessor: ServicesAccessor, context?: INotebookCellActionContext) {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

		return context.notebookEditor.deleteNotebookCell(context.cell);
	}
});

async function moveCell(context: INotebookCellActionContext, direction: 'up' | 'down'): Promise<void> {
	direction === 'up' ?
		context.notebookEditor.moveCellUp(context.cell) :
		context.notebookEditor.moveCellDown(context.cell);
}

async function copyCell(context: INotebookCellActionContext, direction: 'up' | 'down'): Promise<void> {
	const text = context.cell.getText();
	const newCellDirection = direction === 'up' ? 'above' : 'below';
	await context.notebookEditor.insertNotebookCell(context.cell, context.cell.cellKind, newCellDirection, text);
}

registerAction2(class extends Action2 {
	constructor() {
		super(
			{
				id: MOVE_CELL_UP_COMMAND_ID,
				title: localize('notebookActions.moveCellUp', "Move Cell Up"),
				category: NOTEBOOK_ACTIONS_CATEGORY,
				icon: { id: 'codicon/arrow-up' },
				menu: {
					id: MenuId.NotebookCellTitle,
					order: CellToolbarOrder.MoveCellUp,
					alt: {
						id: COPY_CELL_UP_COMMAND_ID,
						title: localize('notebookActions.copyCellUp', "Copy Cell Up"),
						icon: { id: 'codicon/arrow-up' }
					},
					when: ContextKeyExpr.equals(NOTEBOOK_EDITABLE_CONTEXT_KEY, true)
				},
				f1: true
			});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext) {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

		return moveCell(context, 'up');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super(
			{
				id: MOVE_CELL_DOWN_COMMAND_ID,
				title: localize('notebookActions.moveCellDown', "Move Cell Down"),
				category: NOTEBOOK_ACTIONS_CATEGORY,
				icon: { id: 'codicon/arrow-down' },
				menu: {
					id: MenuId.NotebookCellTitle,
					order: CellToolbarOrder.MoveCellDown,
					alt: {
						id: COPY_CELL_DOWN_COMMAND_ID,
						title: localize('notebookActions.copyCellDown', "Copy Cell Down"),
						icon: { id: 'codicon/arrow-down' }
					},
					when: ContextKeyExpr.equals(NOTEBOOK_EDITABLE_CONTEXT_KEY, true)
				},
				f1: true
			});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext) {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

		return moveCell(context, 'down');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super(
			{
				id: COPY_CELL_COMMAND_ID,
				title: localize('notebookActions.copy', "Copy Cell"),
				category: NOTEBOOK_ACTIONS_CATEGORY,
				f1: true,
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
					weight: EDITOR_WIDGET_ACTION_WEIGHT
				},
			});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext) {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

		const clipboardService = accessor.get<IClipboardService>(IClipboardService);
		const notebookService = accessor.get<INotebookService>(INotebookService);
		clipboardService.writeText(context.cell.getText());
		notebookService.setToCopy([context.cell.model]);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super(
			{
				id: CUT_CELL_COMMAND_ID,
				title: localize('notebookActions.cut', "Cut Cell"),
				category: NOTEBOOK_ACTIONS_CATEGORY,
				f1: true,
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyCode.KEY_X,
					weight: EDITOR_WIDGET_ACTION_WEIGHT
				},
			});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext) {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

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

registerAction2(class extends Action2 {
	constructor() {
		super(
			{
				id: PASTE_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.pasteAbove', "Paste Cell Above"),
				category: NOTEBOOK_ACTIONS_CATEGORY,
				f1: true,
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_V,
					weight: EDITOR_WIDGET_ACTION_WEIGHT
				},
			});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext) {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

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
registerAction2(class extends Action2 {
	constructor() {
		super(
			{
				id: PASTE_CELL_COMMAND_ID,
				title: localize('notebookActions.paste', "Paste Cell"),
				category: NOTEBOOK_ACTIONS_CATEGORY,
				f1: true,
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
					weight: EDITOR_WIDGET_ACTION_WEIGHT
				},
			});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext) {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

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

registerAction2(class extends Action2 {
	constructor() {
		super(
			{
				id: COPY_CELL_UP_COMMAND_ID,
				title: localize('notebookActions.copyCellUp', "Copy Cell Up"),
				category: NOTEBOOK_ACTIONS_CATEGORY,
				f1: true
			});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext) {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

		return copyCell(context, 'up');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super(
			{
				id: COPY_CELL_DOWN_COMMAND_ID,
				title: localize('notebookActions.copyCellDown', "Copy Cell Down"),
				category: NOTEBOOK_ACTIONS_CATEGORY,
				f1: true
			});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext) {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

		return copyCell(context, 'down');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.notebook.cursorDown',
			title: 'Notebook Cursor Move Down',
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.has(InputFocusedContextKey), EditorContextKeys.editorTextFocus, NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('top'), NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('none')),
				primary: KeyCode.DownArrow,
				weight: EDITOR_WIDGET_ACTION_WEIGHT
			}
		});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext): Promise<void> {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

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

		editor.focusNotebookCell(newCell, true);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.notebook.cursorUp',
			title: 'Notebook Cursor Move Up',
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.has(InputFocusedContextKey), EditorContextKeys.editorTextFocus, NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('bottom'), NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('none')),
				primary: KeyCode.UpArrow,
				weight: EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext): Promise<void> {
		if (!isCellActionContext(context)) {
			context = getActiveCellContext(accessor);
			if (!context) {
				return;
			}
		}

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

		editor.focusNotebookCell(newCell, true);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.notebook.undo',
			title: 'Notebook Undo',
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyCode.KEY_Z,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);

		const editor = getActiveNotebookEditor(editorService);
		if (!editor) {
			return;
		}

		const viewModel = editor.viewModel;

		if (!viewModel) {
			return;
		}

		viewModel.undo();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.notebook.redo',
			title: 'Notebook Redo',
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);

		const editor = getActiveNotebookEditor(editorService);
		if (!editor) {
			return;
		}

		const viewModel = editor.viewModel;

		if (!viewModel) {
			return;
		}

		viewModel.redo();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.notebook.testResize',
			title: 'Notebook Test Cell Resize',
			category: NOTEBOOK_ACTIONS_CATEGORY,
			keybinding: {
				when: IsDevelopmentContext,
				primary: undefined,
				weight: KeybindingWeight.WorkbenchContrib
			},
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const resource = editorService.activeEditor?.resource;
		if (!resource) {
			return;
		}

		const editor = getActiveNotebookEditor(editorService);
		if (!editor) {
			return;
		}

		const cells = editor.viewModel?.viewCells;

		if (cells && cells.length) {
			const firstCell = cells[0];
			editor.layoutNotebookCell(firstCell, 400);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.notebook.testSetHiddenRanges1',
			title: 'Notebook Cells set hidden ranges: 2,3,4',
			category: NOTEBOOK_ACTIONS_CATEGORY,
			keybinding: {
				when: IsDevelopmentContext,
				primary: undefined,
				weight: KeybindingWeight.WorkbenchContrib
			},
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const resource = editorService.activeEditor?.resource;
		if (!resource) {
			return;
		}

		const editor = getActiveNotebookEditor(editorService);
		if (!editor) {
			return;
		}

		editor.setHiddenAreas([{ start: 1, length: 3 }]);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.notebook.testSetHiddenRanges2',
			title: 'Notebook Cells set hidden ranges: 4,5',
			category: NOTEBOOK_ACTIONS_CATEGORY,
			keybinding: {
				when: IsDevelopmentContext,
				primary: undefined,
				weight: KeybindingWeight.WorkbenchContrib
			},
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const resource = editorService.activeEditor?.resource;
		if (!resource) {
			return;
		}

		const editor = getActiveNotebookEditor(editorService);
		if (!editor) {
			return;
		}

		editor.setHiddenAreas([{ start: 3, length: 2 }]);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.notebook.resetHiddenAreas',
			title: 'Notebook Cells reset hidden ranges',
			category: NOTEBOOK_ACTIONS_CATEGORY,
			keybinding: {
				when: IsDevelopmentContext,
				primary: undefined,
				weight: KeybindingWeight.WorkbenchContrib
			},
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const resource = editorService.activeEditor?.resource;
		if (!resource) {
			return;
		}

		const editor = getActiveNotebookEditor(editorService);
		if (!editor) {
			return;
		}

		editor.setHiddenAreas([]);
	}
});
