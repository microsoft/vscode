/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor, Extensions as EditorExtensions, IEditorRegistry } from 'vs/workbench/browser/editor';
import { NotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookEditor';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { IEditorService, IOpenEditorOverride } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IEditorInput } from 'vs/workbench/common/editor';
import { IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { endsWith } from 'vs/base/common/strings';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { INotebookService, NotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actions';
import { IActiveCodeEditor, isDiffEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Action } from 'vs/base/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';

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

export class NotebookContribution implements IWorkbenchContribution {
	private _resourceMapping: Map<string, NotebookEditorInput> = new Map<string, NotebookEditorInput>();

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@INotebookService private readonly notebookService: INotebookService,
		@IInstantiationService private readonly instantiationService: IInstantiationService

	) {
		this.editorService.overrideOpenEditor((editor, options, group) => this.onEditorOpening(editor, options, group));

		this.registerCommands();
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
			if (
				!resource ||
				!endsWith(resource.path, '.ipynb')
			) {
				return undefined;
			}
		}

		if (this._resourceMapping.has(resource!.path)) {
			const input = this._resourceMapping.get(resource!.path);

			return { override: this.editorService.openEditor(input!, { ...options, ignoreOverrides: true }, group) };
		}


		const input = this.instantiationService.createInstance(NotebookEditorInput, editor, viewType);
		this._resourceMapping.set(resource!.path, input);

		return { override: this.editorService.openEditor(input, { ...options, ignoreOverrides: true }, group) };
	}

	private registerCommands() {
		const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions);

		workbenchActionsRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ExecuteNotebookAction, ExecuteNotebookAction.ID, ExecuteNotebookAction.LABEL), 'Execute Notebook', 'Notebook');
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookContribution, LifecyclePhase.Starting);


registerSingleton(INotebookService, NotebookService);


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
