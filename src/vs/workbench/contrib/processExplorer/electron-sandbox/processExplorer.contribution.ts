/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { IEditorSerializer, EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ProcessExplorerEditorInput } from './processExplorerEditoInput.js';
import { ProcessExplorerEditor } from './processExplorerEditor.js';

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
