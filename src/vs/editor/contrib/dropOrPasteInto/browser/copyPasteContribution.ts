/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorCommand, EditorContributionInstantiation, ServicesAccessor, registerEditorAction, registerEditorCommand, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { registerEditorFeature } from 'vs/editor/common/editorFeatures';
import { CopyPasteController, changePasteTypeCommandId, pasteWidgetVisibleCtx } from 'vs/editor/contrib/dropOrPasteInto/browser/copyPasteController';
import { DefaultPasteProvidersFeature } from 'vs/editor/contrib/dropOrPasteInto/browser/defaultProviders';
import * as nls from 'vs/nls';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

registerEditorContribution(CopyPasteController.ID, CopyPasteController, EditorContributionInstantiation.Eager); // eager because it listens to events on the container dom node of the editor

registerEditorFeature(DefaultPasteProvidersFeature);

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
		return CopyPasteController.get(editor)?.changePasteType();
	}
});

registerEditorAction(class extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.pasteAs',
			label: nls.localize('pasteAs', "Paste As..."),
			alias: 'Paste As...',
			precondition: undefined,
			description: {
				description: 'Paste as',
				args: [{
					name: 'args',
					schema: {
						type: 'object',
						properties: {
							'id': {
								type: 'string',
								description: nls.localize('pasteAs.id', "The id of the paste edit to try applying. If not provided, the editor will show a picker."),
							}
						},
					}
				}]
			}
		});
	}

	public override run(_accessor: ServicesAccessor, editor: ICodeEditor, args: any) {
		const id = typeof args?.id === 'string' ? args.id : undefined;
		return CopyPasteController.get(editor)?.pasteAs(id);
	}
});
