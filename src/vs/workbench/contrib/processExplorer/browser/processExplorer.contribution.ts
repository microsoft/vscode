/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { IEditorSerializer, EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ProcessExplorerEditorInput } from './processExplorerEditoInput.js';
import { ProcessExplorerEditor } from './processExplorerEditor.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(ProcessExplorerEditor, ProcessExplorerEditor.ID, localize('runtimeExtension', "Running Extensions")),
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

registerAction2(class OpenProcessExplorer extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openProcessExplorer2',
			f1: true,
			category: Categories.Developer,
			title: localize2('openProcessExplorer', 'Open Process Explorer 2'),
		});
	}

	run(accessor: ServicesAccessor): void {
		const editorService = accessor.get(IEditorService);

		editorService.openEditor(ProcessExplorerEditorInput.instance, { pinned: true });
	}
});

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '5_tools',
	command: {
		id: 'workbench.action.openProcessExplorer2',
		title: localize({ key: 'miOpenProcessExplorerer', comment: ['&& denotes a mnemonic'] }, "Open &&Process Explorer 2")
	},
	order: 2
});
