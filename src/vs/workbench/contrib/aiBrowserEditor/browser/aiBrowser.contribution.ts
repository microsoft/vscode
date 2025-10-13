/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../common/editor.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../browser/editor.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AiBrowserEditorInput } from './aiBrowserEditorInput.js';
import { AiBrowserEditor } from './aiBrowserEditor.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import * as nls from '../../../../nls.js';

// Register the command to open AI Browser
class OpenAiBrowserAction extends Action2 {
	static readonly ID = 'aiBrowser.open';

	constructor() {
		super({
			id: OpenAiBrowserAction.ID,
			title: nls.localize2("aiBrowser.open", "AI Browser: Open"),
			category: nls.localize2("view", "View"),
			f1: true, // Show in Command Palette (F1 or Cmd+Shift+P)
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);

		// Create and open the AI Browser editor
		const input = new AiBrowserEditorInput();
		await editorService.openEditor(input, { pinned: true });
	}
}

// AI Browser Editor Serializer
class AiBrowserEditorSerializer implements IEditorSerializer {
	canSerialize(): boolean {
		return true;
	}

	serialize(editorInput: AiBrowserEditorInput): string {
		return JSON.stringify({
			id: editorInput.typeId,
			resource: editorInput.resource
		});
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): AiBrowserEditorInput {
		return new AiBrowserEditorInput();
	}
}

// Register editor serializer
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(
		AiBrowserEditorInput.ID,
		AiBrowserEditorSerializer
	);

// Register editor pane
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane)
	.registerEditorPane(
		EditorPaneDescriptor.create(
			AiBrowserEditor,
			AiBrowserEditor.ID,
			nls.localize("aiBrowser.title", "AI Browser")
		),
		[new SyncDescriptor(AiBrowserEditorInput)]
	);

// Register the action
registerAction2(OpenAiBrowserAction);
