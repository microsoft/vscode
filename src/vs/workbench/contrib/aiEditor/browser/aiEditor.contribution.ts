/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { AiEditorInput } from './aiEditorInput.js';
import { AiEditorPane } from './aiEditorPane.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { localize, localize2 } from '../../../../nls.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

// Register the AI Editor Pane
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane)
	.registerEditorPane(
		EditorPaneDescriptor.create(
			AiEditorPane,
			AiEditorPane.ID,
			localize('aiEditor', "AI Editor")
		),
		[new SyncDescriptor(AiEditorInput)]
	);

// Register command to open AI Editor
class OpenAiEditorAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openAiEditor',
			title: localize2('openAiEditor', "Open AI Editor"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const input = AiEditorInput.create();
		
		await editorService.openEditor(input, {
			pinned: true
		});
	}
}

registerAction2(OpenAiEditorAction);