/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { ReadOnly } from 'vs/editor/common/config/commonEditorConfig';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { MenuId } from 'vs/platform/actions/common/actions';

export class ToggleReadOnlyModeAction extends EditorAction {

	public static readonly ID = 'editor.action.toggleReadOnlyMode';

	constructor() {
		super({
			id: ToggleReadOnlyModeAction.ID,
			label: nls.localize({ key: 'toggle.readOnly', comment: ['Turn on/off read only mode around VS Code'] }, "Toggle Read Only Mode"),
			alias: 'Toggle Tab Key Moves Focus',
			precondition: undefined,
			kbOpts: {
				kbExpr: null,
				primary: KeyMod.Alt | KeyMod.Shift | KeyCode.KEY_R,
				mac: { primary: KeyMod.Alt | KeyMod.Shift | KeyCode.KEY_R },
				weight: KeybindingWeight.EditorContrib
			},
			menubarOpts: {
				menuId: MenuId.MenubarEditMenu,
				group: '5_insert',
				title: nls.localize({ key: 'miToggleReadOnlyMode', comment: ['&& denotes a mnemonic'] }, "Toggle &&Read Only Mode"),
				order: 5
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const oldValue = ReadOnly.getReadOnlyMode();
		const newValue = !oldValue;
		ReadOnly.setReadOnlyMode(newValue);
		if (newValue) {
			alert(nls.localize('toggle.readOnly.on', "Editor is read only mode now"));
		} else {
			alert(nls.localize('toggle.readOnly.off', "Editor is not red only mode now"));
		}
	}
}

registerEditorAction(ToggleReadOnlyModeAction);
