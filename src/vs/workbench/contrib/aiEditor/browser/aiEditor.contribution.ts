/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { AIEditorPane, AI_EDITOR_PANE_ID } from './AIEditorPane.js';
import { AIEditorInput } from './AIEditorInput.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

// Register AI Editor pane with its input
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		AIEditorPane,
		AI_EDITOR_PANE_ID,
		localize('aiEditor.title', 'AI Editor')
	),
	[
		new SyncDescriptor(AIEditorInput)
	]
);


// Command: Open AI Editor
registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'workbench.action.openAIEditor', title: localize2('openAIEditor', 'Open AI Editor'), f1: true, category: localize2('category.ai', 'AI') });
	}

	run(accessor: { get<T>(id: any): T }) {
		const inst = accessor.get<IInstantiationService>(IInstantiationService);
		const editorService = accessor.get<IEditorService>(IEditorService);
		const input = inst.createInstance(AIEditorInput);
		return editorService.openEditor(input);
	}
});

