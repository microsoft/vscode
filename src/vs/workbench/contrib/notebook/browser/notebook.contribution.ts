/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor, Extensions as EditorExtensions, IEditorRegistry } from 'vs/workbench/browser/editor';
import { NotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookEditor';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { Action } from 'vs/base/common/actions';
import { IEditorService, IOpenEditorOverride } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IEditorInput } from 'vs/workbench/common/editor';
import { IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { endsWith } from 'vs/base/common/strings';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { URI } from 'vs/base/common/uri';

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

export class NotebookContribution implements IWorkbenchContribution {
	private editorOpeningListener: IDisposable | undefined;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService

	) {
		this.editorOpeningListener = this.editorService.overrideOpenEditor((editor, options, group) => this.onEditorOpening(editor, options, group));
	}

	private onEditorOpening(editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup): IOpenEditorOverride | undefined {
		const resource = editor.getResource();

		if (
			!resource ||
			!endsWith(resource.path, '.ipynb')
		) {
			return undefined;
		}

		const input = this.instantiationService.createInstance(NotebookEditorInput, editor);

		return { override: this.editorService.openEditor(input, options, group) };
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookContribution, LifecyclePhase.Starting);
