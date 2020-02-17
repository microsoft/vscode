/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { KeyCode } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext, InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { NOTEBOOK_EDITOR_FOCUSED, NotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookEditor';

// TODO@joh,peng This is outdated, registerAction2 should be used instead!

export class ExecuteNotebookCellAction extends Action {

	static readonly ID = 'workbench.action.executeNotebookCell';
	static readonly LABEL = 'Execute Notebook Cell';

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService,
		@INotebookService private readonly notebookService: INotebookService

	) {
		super(id, label);
	}

	async run(): Promise<void> {
		let resource = this.editorService.activeEditor?.getResource();

		if (resource) {
			let notebookProviders = this.notebookService.getContributedNotebookProviders(resource!);

			if (notebookProviders.length > 0) {
				let viewType = notebookProviders[0].id;
				this.notebookService.executeNotebookActiveCell(viewType, resource);
			}
		}
	}
}
export class ExecuteNotebookAction extends Action {

	static readonly ID = 'workbench.action.executeNotebook';
	static readonly LABEL = 'Execute Notebook';

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService,
		@INotebookService private readonly notebookService: INotebookService

	) {
		super(id, label);
	}

	async run(): Promise<void> {
		let resource = this.editorService.activeEditor?.getResource();

		if (resource) {
			let notebookProviders = this.notebookService.getContributedNotebookProviders(resource!);

			if (notebookProviders.length > 0) {
				let viewType = notebookProviders[0].id;
				this.notebookService.executeNotebook(viewType, resource);
			}
		}
	}
}


export class QuitNotebookEditAction extends Action {

	static readonly ID = 'workbench.action.quitNotebookEdit';
	static readonly LABEL = 'Quit Notebook Cell Editing';

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService,
		@INotebookService private readonly notebookService: INotebookService

	) {
		super(id, label);
	}

	async run(): Promise<void> {
		let resource = this.editorService.activeEditor?.getResource();
		let editorControl = this.editorService.activeControl;

		if (resource && editorControl) {
			let notebookProviders = this.notebookService.getContributedNotebookProviders(resource!);

			if (notebookProviders.length > 0) {
				let editorViewType = (editorControl! as NotebookEditor).viewType;
				let viewType = notebookProviders[0].id;

				if (viewType === editorViewType) {

					let activeCell = (editorControl! as NotebookEditor).getActiveCell();
					if (activeCell) {
						(editorControl! as NotebookEditor).focusNotebookCell(activeCell, false);
					}
				}
			}
		}
	}
}
export class EditNotebookCellAction extends Action {

	static readonly ID = 'workbench.action.editNotebookActiveCell';
	static readonly LABEL = 'Edit Notebook Active Cell';

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService,
		@INotebookService private readonly notebookService: INotebookService

	) {
		super(id, label);
	}

	async run(): Promise<void> {
		let resource = this.editorService.activeEditor?.getResource();
		let editorControl = this.editorService.activeControl;

		if (resource && editorControl) {
			let notebookProviders = this.notebookService.getContributedNotebookProviders(resource!);

			if (notebookProviders.length > 0) {
				let editorViewType = (editorControl! as NotebookEditor).viewType;
				let viewType = notebookProviders[0].id;

				if (viewType === editorViewType) {

					let activeCell = (editorControl! as NotebookEditor).getActiveCell();
					if (activeCell) {
						(editorControl! as NotebookEditor).editNotebookCell(undefined, activeCell);
					}
				}
			}
		}
	}
}


const registry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(
	SyncActionDescriptor.create(
		EditNotebookCellAction,
		EditNotebookCellAction.ID,
		EditNotebookCellAction.LABEL,
		{
			primary: KeyCode.Enter,
		},
		ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
	),
	'Edit Notebook Active Cell;',
	'Notebook'
);

registry.registerWorkbenchAction(
	SyncActionDescriptor.create(
		QuitNotebookEditAction,
		QuitNotebookEditAction.ID,
		QuitNotebookEditAction.LABEL,
		{
			primary: KeyCode.Escape,
		},
		ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext),
		// TODO: It's set to `EditorContrib - 5` to ensure all editor escape commands to work
		// but, how about core?
		KeybindingWeight.EditorContrib - 5
	),
	'Edit Notebook Active Cell;',
	'Notebook'
);

registry.registerWorkbenchAction(
	SyncActionDescriptor.create(
		ExecuteNotebookAction,
		ExecuteNotebookAction.ID,
		ExecuteNotebookAction.LABEL
	),
	'Execute Notebook',
	'Notebook'
);

registry.registerWorkbenchAction(
	SyncActionDescriptor.create(
		ExecuteNotebookCellAction,
		ExecuteNotebookCellAction.ID,
		ExecuteNotebookCellAction.LABEL
	),
	'Execute Notebook Cell',
	'Notebook'
);

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
