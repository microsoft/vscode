/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorSerializer, EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { ProcessExplorerEditorInput } from './processExplorerEditorInput.js';
import { ProcessExplorerEditor } from './processExplorerEditor.js';

class ProcessExplorerEditorContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.processExplorerEditor';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		editorResolverService.registerEditor(
			`${ProcessExplorerEditorInput.RESOURCE.scheme}:**/**`,
			{
				id: ProcessExplorerEditorInput.ID,
				label: localize('promptOpenWith.processExplorer.displayName', "Process Explorer"),
				priority: RegisteredEditorPriority.exclusive
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === ProcessExplorerEditorInput.RESOURCE.scheme
			},
			{
				createEditorInput: () => {
					return {
						editor: instantiationService.createInstance(ProcessExplorerEditorInput),
						options: {
							pinned: true
						}
					};
				}
			}
		);
	}
}

registerWorkbenchContribution2(ProcessExplorerEditorContribution.ID, ProcessExplorerEditorContribution, WorkbenchPhase.BlockStartup);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(ProcessExplorerEditor, ProcessExplorerEditor.ID, localize('processExplorer', "Process Explorer")),
	[new SyncDescriptor(ProcessExplorerEditorInput)]
);

class ProcessExplorerEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(editorInput: EditorInput): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): EditorInput {
		return ProcessExplorerEditorInput.instance;
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ProcessExplorerEditorInput.ID, ProcessExplorerEditorInputSerializer);
