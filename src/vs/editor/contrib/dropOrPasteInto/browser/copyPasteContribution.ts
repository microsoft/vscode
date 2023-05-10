/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorCommand, EditorContributionInstantiation, ServicesAccessor, registerEditorCommand, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { registerEditorFeature } from 'vs/editor/common/editorFeatures';
import { CopyPasteController, changePasteTypeCommandId, pasteWidgetVisibleCtx } from 'vs/editor/contrib/dropOrPasteInto/browser/copyPasteController';
import { DefaultPasteProvidersFeature } from 'vs/editor/contrib/dropOrPasteInto/browser/defaultProviders';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

registerEditorContribution(CopyPasteController.ID, CopyPasteController, EditorContributionInstantiation.Eager); // eager because it listens to events on the container dom node of the editor

registerEditorCommand(new class extends EditorCommand {
	constructor() {
		super({
			id: changePasteTypeCommandId,
			precondition: pasteWidgetVisibleCtx,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Period,
			}
		});
	}

	public override runEditorCommand(_accessor: ServicesAccessor | null, editor: ICodeEditor, _args: any) {
		CopyPasteController.get(editor)?.changePasteType();
	}
});

registerEditorFeature(DefaultPasteProvidersFeature);
