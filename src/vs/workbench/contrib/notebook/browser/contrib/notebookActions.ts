/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { MenuRegistry, MenuId, Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext, InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { NOTEBOOK_EDITOR_FOCUSED, NotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookEditor';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';

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
		const nextCell = editor.viewModel?.viewCells[idx + 1];
		if (nextCell) {
			editor.focusNotebookCell(nextCell, false);
		} else {
			editor.insertEmptyNotebookCell(activeCell, CellKind.Code, 'below');
		}
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


function getActiveNotebookEditor(editorService: IEditorService): NotebookEditor | undefined {
	const activeEditorPane = editorService.activeEditorPane as NotebookEditor | undefined;
	return activeEditorPane?.isNotebookEditor ? activeEditorPane : undefined;
}
