/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { DEFAULT_EDITOR_ASSOCIATION, EditorExtensions, EditorInputWithOptions, IEditorFactoryRegistry, IEditorSerializer, IResourceMultiDiffEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { parse } from 'vs/base/common/marshalling';
import { onUnexpectedError } from 'vs/base/common/errors';
import { MultiDiffEditorInput, MultiDiffEditorInputData } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput';
import { MultiDiffEditor } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffEditor';
import { Codicon } from 'vs/base/common/codicons';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

class MultiDiffEditorResolverContribution extends Disposable {

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`*`,
			{
				id: DEFAULT_EDITOR_ASSOCIATION.id,
				label: DEFAULT_EDITOR_ASSOCIATION.displayName,
				detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
				priority: RegisteredEditorPriority.builtin
			},
			{},
			{
				createMultiDiffEditorInput: (diffListEditor: IResourceMultiDiffEditorInput): EditorInputWithOptions => {
					return {
						editor: instantiationService.createInstance(
							MultiDiffEditorInput,
							diffListEditor.label,
							diffListEditor.resources.map(resource => {
								return new MultiDiffEditorInputData(
									resource.resource,
									resource.original.resource,
									resource.modified.resource
								);
							}))
					};
				}
			}
		));
	}
}

Registry
	.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(MultiDiffEditorResolverContribution, LifecyclePhase.Starting);

class MultiDiffEditorSerializer implements IEditorSerializer {

	canSerialize(editor: EditorInput): boolean {
		return true;
	}

	serialize(editor: MultiDiffEditorInput): string | undefined {
		return JSON.stringify({ label: editor.label, resources: editor.resources });
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		try {
			const data = parse(serializedEditor) as { label: string | undefined; resources: MultiDiffEditorInputData[] };
			return instantiationService.createInstance(MultiDiffEditorInput, data.label, data.resources);
		} catch (err) {
			onUnexpectedError(err);
			return undefined;
		}
	}
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		MultiDiffEditor,
		MultiDiffEditor.ID,
		localize('name', "Multi Diff Editor")
	),
	[
		new SyncDescriptor(MultiDiffEditorInput)
	]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	MultiDiffEditorInput.ID,
	MultiDiffEditorSerializer
);

export class GoToFileAction extends Action2 {
	constructor() {
		super({
			id: 'multiDiffEditor.goToFile',
			title: { value: localize('goToFile', "Open File"), original: 'Open File' },
			icon: Codicon.goToFile,
			precondition: EditorContextKeys.inMultiDiffEditor,
			menu: {
				when: EditorContextKeys.inMultiDiffEditor,
				id: MenuId.MultiDiffEditorFileToolbar,
				order: 22,
				group: 'navigation',
			},
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]): void {
		const uri = args[0] as URI;
		const editorService = accessor.get(IEditorService);
		editorService.openEditor({ resource: uri });
	}
}

registerAction2(GoToFileAction);
