/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { MenuRegistry, MenuId, Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext, InputFocusedContextKey, IsDevelopmentContext } from 'vs/platform/contextkey/common/contextkeys';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { NOTEBOOK_EDITOR_FOCUSED, NotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookEditor';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED, CellState, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind, NOTEBOOK_EDITOR_CURSOR_BOUNDARY } from 'vs/workbench/contrib/notebook/common/notebookCommon';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.executeNotebookCell',
			title: 'Execute Notebook Cell',
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext),
				primary: KeyMod.WinCtrl | KeyCode.Enter,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		runActiveCell(accessor);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.executeNotebookCellSelectBelow',
			title: 'Execute Notebook Cell and Select Below',
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext),
				primary: KeyMod.Shift | KeyCode.Enter,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const activeCell = runActiveCell(accessor);
		if (!activeCell) {
			return;
		}

		const editor = getActiveNotebookEditor(editorService);
		if (!editor) {
			return;
		}

		const idx = editor.viewModel?.getViewCellIndex(activeCell);
		if (typeof idx !== 'number') {
			return;
		}

		// Try to select below, fall back on inserting
		const nextCell = editor.viewModel?.viewCells[idx + 1];
		if (nextCell) {
			editor.focusNotebookCell(nextCell, false);
		} else {
			editor.insertNotebookCell(activeCell, CellKind.Code, 'below');
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.executeNotebookCellInsertBelow',
			title: 'Execute Notebook Cell and Insert Below',
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext),
				primary: KeyMod.Alt | KeyCode.Enter,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const activeCell = runActiveCell(accessor);
		if (!activeCell) {
			return;
		}

		const editor = getActiveNotebookEditor(editorService);
		if (!editor) {
			return;
		}

		editor.insertNotebookCell(activeCell, CellKind.Code, 'below');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.executeNotebook',
			title: 'Execute Notebook'
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		let editorService = accessor.get(IEditorService);
		let notebookService = accessor.get(INotebookService);

		let resource = editorService.activeEditor?.resource;

		if (!resource) {
			return;
		}

		let notebookProviders = notebookService.getContributedNotebookProviders(resource!);

		if (notebookProviders.length > 0) {
			let viewType = notebookProviders[0].id;
			notebookService.executeNotebook(viewType, resource);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.quitNotebookEdit',
			title: 'Quit Notebook Cell Editing',
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext),
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib - 5
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
				activeCell.state = CellState.Preview;
			}

			editor.focusNotebookCell(activeCell, false);
		}
	}
});

registerAction2(class extends Action2 {

	static readonly ID = 'workbench.action.editNotebookActiveCell';
	static readonly LABEL = 'Edit Notebook Active Cell';

	constructor() {
		super({
			id: 'workbench.action.editNotebookActiveCell',
			title: 'Edit Notebook Active Cell',
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyCode.Enter,
				weight: KeybindingWeight.WorkbenchContrib
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
			editor.editNotebookCell(activeCell);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.notebook.hideFind',
			title: 'Hide Find in Notebook',
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
			title: 'Find in Notebook',
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
		id: 'workbench.action.executeNotebook',
		title: 'Execute Notebook (Run all cells)',
		icon: { id: 'codicon/debug-start' }
	},
	order: -1,
	group: 'navigation',
	when: NOTEBOOK_EDITOR_FOCUSED
});


MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: 'workbench.action.executeNotebookCell',
		title: 'Execute Notebook Cell',
		icon: { id: 'codicon/debug-continue' }
	},
	order: -1,
	group: 'navigation',
	when: NOTEBOOK_EDITOR_FOCUSED
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.changeCellToCode',
			title: 'Change Cell to Code',
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyCode.KEY_Y,
				weight: KeybindingWeight.WorkbenchContrib
			}
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
			title: 'Change Cell to Markdown',
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyCode.KEY_M,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		return changeActiveCellToKind(CellKind.Markdown, accessor);
	}
});

function getActiveNotebookEditor(editorService: IEditorService): NotebookEditor | undefined {
	const activeEditorPane = editorService.activeEditorPane as NotebookEditor | undefined;
	return activeEditorPane?.isNotebookEditor ? activeEditorPane : undefined;
}

function runActiveCell(accessor: ServicesAccessor): ICellViewModel | undefined {
	const editorService = accessor.get(IEditorService);
	const notebookService = accessor.get(INotebookService);

	const resource = editorService.activeEditor?.resource;
	if (!resource) {
		return;
	}

	const editor = getActiveNotebookEditor(editorService);
	if (!editor) {
		return;
	}

	const notebookProviders = notebookService.getContributedNotebookProviders(resource);
	if (!notebookProviders.length) {
		return;
	}

	const activeCell = editor.getActiveCell();
	if (!activeCell) {
		return;
	}

	const idx = editor.viewModel?.getViewCellIndex(activeCell);
	if (typeof idx !== 'number') {
		return;
	}

	const viewType = notebookProviders[0].id;
	notebookService.executeNotebookActiveCell(viewType, resource);

	return activeCell;
}

function changeActiveCellToKind(kind: CellKind, accessor: ServicesAccessor): void {
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
	editor.insertNotebookCell(activeCell, kind, 'below', text);
	const idx = editor.viewModel?.getViewCellIndex(activeCell);
	if (typeof idx !== 'number') {
		return;
	}

	const newCell = editor.viewModel?.viewCells[idx + 1];
	if (!newCell) {
		return;
	}

	editor.focusNotebookCell(newCell, false);
	editor.deleteNotebookCell(activeCell);
}

function getActiveCell(accessor: ServicesAccessor): [NotebookEditor, ICellViewModel] | undefined {
	const editorService = accessor.get(IEditorService);
	const notebookService = accessor.get(INotebookService);

	const resource = editorService.activeEditor?.resource;
	if (!resource) {
		return;
	}

	const editor = getActiveNotebookEditor(editorService);
	if (!editor) {
		return;
	}

	const notebookProviders = notebookService.getContributedNotebookProviders(resource);
	if (!notebookProviders.length) {
		return;
	}

	const activeCell = editor.getActiveCell();
	if (!activeCell) {
		return;
	}

	return [editor, activeCell];
}


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.notebook.cursorDown',
			title: 'Notebook Cursor Move Down',
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.has(InputFocusedContextKey), NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('top'), NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('none')),
				primary: KeyCode.DownArrow,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const activeCellRet = getActiveCell(accessor);

		if (!activeCellRet) {
			return;
		}

		const [editor, activeCell] = activeCellRet;

		const idx = editor.viewModel?.getViewCellIndex(activeCell);
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
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.has(InputFocusedContextKey), NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('bottom'), NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('none')),
				primary: KeyCode.UpArrow,
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const activeCellRet = getActiveCell(accessor);

		if (!activeCellRet) {
			return;
		}

		const [editor, activeCell] = activeCellRet;
		const idx = editor.viewModel?.getViewCellIndex(activeCell);
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
			id: 'workbench.action.notebook.testResize',
			title: 'Notebook Test Cell Resize',
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
