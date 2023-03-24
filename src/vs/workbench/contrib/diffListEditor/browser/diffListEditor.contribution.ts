/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { DEFAULT_EDITOR_ASSOCIATION, EditorExtensions, EditorInputWithOptions, IEditorFactoryRegistry, IEditorSerializer, IResourceDiffListEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { DiffListEditor, DiffListEditorInput, DiffListEditorInputData } from 'vs/workbench/contrib/diffListEditor/browser/diffListEditor';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { parse } from 'vs/base/common/marshalling';
import { onUnexpectedError } from 'vs/base/common/errors';

class DiffListEditorResolverContribution extends Disposable {

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
				createDiffListEditorInput: (diffListEditor: IResourceDiffListEditorInput): EditorInputWithOptions => {
					return {
						editor: instantiationService.createInstance(
							DiffListEditorInput,
							diffListEditor.label,
							diffListEditor.resources.map(resource => {
								return new DiffListEditorInputData(
									resource.resource,
									resource.original.resource,
									resource.modified.resource);
							}))
					};
				}
			}
		));
	}
}

Registry
	.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(DiffListEditorResolverContribution, LifecyclePhase.Starting);

class DiffListEditorSerializer implements IEditorSerializer {

	canSerialize(editor: EditorInput): boolean {
		return true;
	}

	serialize(editor: DiffListEditorInput): string | undefined {
		return JSON.stringify({ label: editor.label, resources: editor.resources });
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		try {
			const data = parse(serializedEditor) as { label: string | undefined; resources: DiffListEditorInputData[] };
			return instantiationService.createInstance(DiffListEditorInput, data.label, data.resources);
		} catch (err) {
			onUnexpectedError(err);
			return undefined;
		}
	}
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		DiffListEditor,
		DiffListEditor.ID,
		localize('name', "DiffList Editor")
	),
	[
		new SyncDescriptor(DiffListEditorInput)
	]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	DiffListEditorInput.ID,
	DiffListEditorSerializer
);
