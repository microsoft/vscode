/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor, Extensions as EditorExtensions, IEditorRegistry } from 'vs/workbench/browser/editor';
import { NotebookEditor, NOTEBOOK_EDITOR_FOCUSED } from 'vs/workbench/contrib/notebook/browser/notebookEditor';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { IEditorService, IOpenEditorOverride } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IEditorInput } from 'vs/workbench/common/editor';
import { IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { INotebookService, NotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actions';
import { IActiveCodeEditor, isDiffEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Action } from 'vs/base/common/actions';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContextKey, InputFocusedContext } from 'vs/platform/contextkey/common/contextkeys';
import { KeyCode } from 'vs/base/common/keyCodes';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { NotebookHandler } from 'vs/workbench/contrib/notebook/browser/notebookHandler';

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	EditorDescriptor.create(
		NotebookEditor,
		NotebookEditor.ID,
		'Notebook Editor'
	),
	[
		new SyncDescriptor(NotebookEditorInput)
	]
);


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
			let notebookProviders = this.notebookService.getContributedNotebook(resource!);

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
			let notebookProviders = this.notebookService.getContributedNotebook(resource!);

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
			let notebookProviders = this.notebookService.getContributedNotebook(resource!);

			if (notebookProviders.length > 0) {
				let editorViewType = ((editorControl! as any) as NotebookHandler).viewType;
				let viewType = notebookProviders[0].id;

				if (viewType === editorViewType) {

					let activeCell = ((editorControl! as any) as NotebookHandler).getActiveCell();
					if (activeCell) {
						((editorControl! as any) as NotebookHandler).focusNotebookCell(activeCell, false);
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
			let notebookProviders = this.notebookService.getContributedNotebook(resource!);

			if (notebookProviders.length > 0) {
				let editorViewType = ((editorControl! as any) as NotebookHandler).viewType;
				let viewType = notebookProviders[0].id;

				if (viewType === editorViewType) {

					let activeCell = ((editorControl! as any) as NotebookHandler).getActiveCell();
					if (activeCell) {
						((editorControl! as any) as NotebookHandler).editNotebookCell(undefined, activeCell);
					}
				}
			}
		}
	}
}

export class NotebookContribution implements IWorkbenchContribution {
	private _resourceMapping: Map<string, NotebookEditorInput> = new Map<string, NotebookEditorInput>();

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@INotebookService private readonly notebookService: INotebookService,
		@IInstantiationService private readonly instantiationService: IInstantiationService

	) {
		this.editorService.overrideOpenEditor((editor, options, group) => this.onEditorOpening(editor, options, group));

		this.registerCommands();

		this.editorService.onDidActiveEditorChange(() => {
			if (this.editorService.activeEditor && this.editorService.activeEditor! instanceof NotebookEditorInput) {
				let editorInput = this.editorService.activeEditor! as NotebookEditorInput;
				this.notebookService.updateActiveNotebookDocument(editorInput.viewType!, editorInput.getResource()!);
			}
		});
	}

	private onEditorOpening(editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup): IOpenEditorOverride | undefined {
		const resource = editor.getResource();
		let viewType: string | undefined = undefined;

		if (resource) {
			let notebookProviders = this.notebookService.getContributedNotebook(resource!);

			if (notebookProviders.length > 0) {
				viewType = notebookProviders[0].id;
			}
		}

		if (viewType === undefined) {
			return undefined;
		}

		if (this._resourceMapping.has(resource!.path)) {
			const input = this._resourceMapping.get(resource!.path);

			if (!input!.isDisposed()) {
				return { override: this.editorService.openEditor(input!, { ...options, ignoreOverrides: true }, group) };
			}
		}

		const input = this.instantiationService.createInstance(NotebookEditorInput, editor, viewType);
		this._resourceMapping.set(resource!.path, input);

		return { override: this.editorService.openEditor(input, options, group) };
	}

	private registerCommands() {
		const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions);

		workbenchActionsRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ExecuteNotebookAction, ExecuteNotebookAction.ID, ExecuteNotebookAction.LABEL), 'Execute Notebook', 'Notebook');

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

		workbenchActionsRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ExecuteNotebookCellAction, ExecuteNotebookCellAction.ID, ExecuteNotebookCellAction.LABEL), 'Execute Notebook Cell', 'Notebook');

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

	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookContribution, LifecyclePhase.Starting);


registerSingleton(INotebookService, NotebookService);


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

export function getActiveEditor(editorService: IEditorService): IActiveCodeEditor | null {
	let activeTextEditorWidget = editorService.activeTextEditorWidget;

	if (isDiffEditor(activeTextEditorWidget)) {
		if (activeTextEditorWidget.getOriginalEditor().hasTextFocus()) {
			activeTextEditorWidget = activeTextEditorWidget.getOriginalEditor();
		} else {
			activeTextEditorWidget = activeTextEditorWidget.getModifiedEditor();
		}
	}

	if (!isCodeEditor(activeTextEditorWidget) || !activeTextEditorWidget.hasModel()) {
		return null;
	}

	return activeTextEditorWidget;
}
