/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line code-translation-remind
import { localize } from 'vs/nls';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor, IEditorRegistry } from 'vs/workbench/browser/editor';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IEditorInputSerializer as IEditorInputSerializer, IEditorInputFactoryRegistry, EditorExtensions } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { TextAreaEditor } from 'vs/workbench/contrib/textAreaEditor/browser/textAreaEditor';
import { TextAreaEditorInput } from 'vs/workbench/contrib/textAreaEditor/browser/textAreaEditorInput';
import { ITextAreaEditorService, TextAreaEditorService } from 'vs/workbench/contrib/textAreaEditor/browser/textAreaEditorService';
import { IEditorOverrideService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorOverrideService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IWorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { bufferToStream, VSBuffer } from 'vs/base/common/buffer';

// --- TextArea Editor Pane

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	EditorDescriptor.create(
		TextAreaEditor,
		TextAreaEditor.ID,
		'Text Area Editor'
	),
	[
		new SyncDescriptor(TextAreaEditorInput)
	]
);

// --- TextArea Editor Input Serializer

class TextAreaEditorInputSerializer implements IEditorInputSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return editorInput instanceof TextAreaEditorInput;
	}

	serialize(editorInput: TextAreaEditorInput): string {
		return editorInput.resource.toString();
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): TextAreaEditorInput {
		return instantiationService.createInstance(TextAreaEditorInput, URI.parse(serializedEditorInput));
	}
}

Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).registerEditorInputSerializer(TextAreaEditorInput.TYPE_ID, TextAreaEditorInputSerializer);

// --- TextArea Editor Override

class TextAreaEditorOverride implements IWorkbenchContribution {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorOverrideService editorOverrideService: IEditorOverrideService
	) {
		editorOverrideService.registerEditor(
			'*.text-area',
			{
				id: TextAreaEditorInput.OVERRIDE_ID,
				priority: RegisteredEditorPriority.default,
				label: 'Text Area Editor',
				detail: 'An editor that is textArea based.'
			},
			{
				canHandleDiff: false
			},
			resource => ({ editor: instantiationService.createInstance(TextAreaEditorInput, resource) })
		);
	}
}

// --- Working Copy Editor Handler

export class TextAreaWorkingCopyEditorHandler implements IWorkbenchContribution {

	constructor(
		@IWorkingCopyEditorService workingCopyEditorService: IWorkingCopyEditorService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		workingCopyEditorService.registerHandler({
			handles: workingCopy => workingCopy.typeId === 'textAreaWorkingCopy',
			isOpen: (workingCopy, editor) => editor instanceof TextAreaEditorInput && isEqual(workingCopy.resource, editor.resource),
			createEditor: workingCopy => instantiationService.createInstance(TextAreaEditorInput, workingCopy.resource)
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(TextAreaEditorOverride, LifecyclePhase.Starting);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(TextAreaWorkingCopyEditorHandler, LifecyclePhase.Starting);

// --- TextArea Editor Service
registerSingleton(ITextAreaEditorService, TextAreaEditorService);

// --- Open Untitled Text Area Editor
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'textAreaEditor.newUntitled',
			title: { value: localize('textAreaEditor.newUntitled', "New Untitled Text Area Editor"), original: 'New Untitled Text Area Editor' },
			f1: true
		});
	}
	async run(accessor: ServicesAccessor) {
		const textAreaEditorService = accessor.get(ITextAreaEditorService);
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);

		const untitledTextAreaEditorWorkingCopy = await textAreaEditorService.manager.resolve({ contents: bufferToStream(VSBuffer.fromString('Initial Contents')) });

		const untitledTextAreaEditorInput = instantiationService.createInstance(TextAreaEditorInput, untitledTextAreaEditorWorkingCopy.resource);
		return editorService.openEditor(untitledTextAreaEditorInput);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'textAreaEditor.newUntitledWithPath',
			title: { value: localize('textAreaEditor.newUntitledWithPath', "New Untitled Text Area Editor With Associated Path"), original: 'New Untitled Text Area Editor With Associated Path' },
			f1: true
		});
	}
	async run(accessor: ServicesAccessor) {
		const textAreaEditorService = accessor.get(ITextAreaEditorService);
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);
		const fileDialogService = accessor.get(IFileDialogService);

		const target = await fileDialogService.pickFileToSave(await fileDialogService.defaultFilePath());
		if (!target) {
			return;
		}

		const untitledTextAreaEditorWorkingCopy = await textAreaEditorService.manager.resolve({ associatedResource: { path: target?.path } });

		const untitledTextAreaEditorInput = instantiationService.createInstance(TextAreaEditorInput, untitledTextAreaEditorWorkingCopy.resource);
		return editorService.openEditor(untitledTextAreaEditorInput);
	}
});
