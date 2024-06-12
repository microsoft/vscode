/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extname } from 'vs/base/common/resources';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import * as nls from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { DEFAULT_EDITOR_ASSOCIATION, EditorExtensions } from 'vs/workbench/common/editor';
import { FlowEditor } from 'vs/workbench/contrib/flowEditor/browser/flowEditor';
import { FlowGraphService } from 'vs/workbench/contrib/flowEditor/browser/flowGraphService';
import { FlowEditorInput } from 'vs/workbench/contrib/flowEditor/common/flowEditorInput';
import { IFlowGraphService } from 'vs/workbench/contrib/flowEditor/common/flowGraphService';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import 'vs/css!./media/flowEditor';


registerSingleton(IFlowGraphService, FlowGraphService, InstantiationType.Delayed);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		FlowEditor,
		FlowEditor.ID,
		nls.localize('flowEditorTitle', "Flow Editor")
	),
	[
		new SyncDescriptor(FlowEditorInput)
	]
);

registerAction2(class OpenFlowEditor extends Action2 {
	constructor() {
		super({
			id: 'flowEditor.open',
			title: { value: 'Open Flow Editor', original: 'Open Flow Editor' },
			category: 'Preferences',
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const workspace = accessor.get(IWorkspaceContextService);
		const editorService = accessor.get(IEditorService);
		const folder = workspace.getWorkspace().folders[0];
		editorService.openEditor({
			resource: folder.uri.with({ path: folder.uri.path + `/.vscode/flows${FlowEditorInput.EXT}` }),
		});
	}
});

class FlowEditorContribution implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.flowEditor';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFlowGraphService flowGraphService: IFlowGraphService,
	) {
		editorResolverService.registerEditor(
			`*${FlowEditorInput.EXT}`,
			{
				id: FlowEditorInput.ID,
				label: nls.localize('flowEditor.label', 'Flow Editor'),
				detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
				priority: RegisteredEditorPriority.default,
			},
			{
				singlePerResource: true,
				canSupportResource: resource => (extname(resource) === FlowEditorInput.EXT)
			},
			{
				createEditorInput: async ({ resource }) => {
					const graph = await flowGraphService.getGraph(resource);
					return { editor: instantiationService.createInstance(FlowEditorInput, graph) };
				}
			}
		);
	}
}

registerWorkbenchContribution2(FlowEditorContribution.ID, FlowEditorContribution, WorkbenchPhase.BlockStartup);
