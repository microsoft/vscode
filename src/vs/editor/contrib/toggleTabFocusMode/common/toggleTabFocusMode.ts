/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {ServicesAccessor, EditorAction2, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {TabFocus} from 'vs/editor/common/config/commonEditorConfig';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';

export class ToggleTabFocusModeAction extends EditorAction2 {

	public static ID = 'editor.action.toggleTabFocusMode';

	constructor() {
		super(
			ToggleTabFocusModeAction.ID,
			nls.localize('toggle.tabfocusmode', "Toggle Use of Tab Key for Setting Focus"),
			'Toggle Use of Tab Key for Setting Focus',
			false
		);
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		let oldValue = TabFocus.getTabFocusMode();
		TabFocus.setTabFocusMode(!oldValue);
	}
}

// register actions
CommonEditorRegistry.registerEditorAction2(new ToggleTabFocusModeAction());

KeybindingsRegistry.registerCommandRule({
	id: ToggleTabFocusModeAction.ID,
	weight: KeybindingsRegistry.WEIGHT.editorContrib(),
	when: null,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_M,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_M }
});
