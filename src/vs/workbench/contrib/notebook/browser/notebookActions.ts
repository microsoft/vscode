/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode } from 'vs/base/common/keyCodes';
import { MenuRegistry, MenuId, Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext, InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { NOTEBOOK_EDITOR_FOCUSED, NotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookEditor';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.executeNotebookCell',
			title: 'Execute Notebook Cell'
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
			notebookService.executeNotebookActiveCell(viewType, resource);
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
		let notebookService = accessor.get(INotebookService);

		let resource = editorService.activeEditor?.resource;
		let editorControl = editorService.activeControl;
		let notebookProviders = notebookService.getContributedNotebookProviders(resource!);

		if (!resource || !editorControl || notebookProviders.length === 0) {
			return;
		}

		let editorViewType = (editorControl! as NotebookEditor).viewType;
		let viewType = notebookProviders[0].id;

		if (viewType !== editorViewType) {
			return;
		}

		let activeCell = (editorControl! as NotebookEditor).getActiveCell();
		if (activeCell) {
			(editorControl! as NotebookEditor).focusNotebookCell(activeCell, false);
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
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		let editorService = accessor.get(IEditorService);
		let notebookService = accessor.get(INotebookService);

		let resource = editorService.activeEditor?.resource;
		let editorControl = editorService.activeControl;
		let notebookProviders = notebookService.getContributedNotebookProviders(resource!);

		if (!resource || !editorControl || notebookProviders.length === 0) {
			return;
		}

		let editorViewType = (editorControl! as NotebookEditor).viewType;
		let viewType = notebookProviders[0].id;

		if (viewType !== editorViewType) {
			return;
		}

		let activeCell = (editorControl! as NotebookEditor).getActiveCell();
		if (activeCell) {
			(editorControl! as NotebookEditor).editNotebookCell(undefined, activeCell);
		}
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
