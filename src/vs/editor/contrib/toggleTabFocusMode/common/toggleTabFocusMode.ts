/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {ServicesAccessor, EditorAction, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {TabFocus} from 'vs/editor/common/config/commonEditorConfig';

export class ToggleTabFocusModeAction extends EditorAction {

	public static ID = 'editor.action.toggleTabFocusMode';

	constructor() {
		super(
			ToggleTabFocusModeAction.ID,
			nls.localize('toggle.tabfocusmode', "Toggle Use of Tab Key for Setting Focus"),
			'Toggle Use of Tab Key for Setting Focus',
			false
		);

		this._precondition = null;

		this.kbOpts = {
			kbExpr: null,
			primary: KeyMod.CtrlCmd | KeyCode.KEY_M,
			mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_M }
		};
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		let oldValue = TabFocus.getTabFocusMode();
		TabFocus.setTabFocusMode(!oldValue);
	}
}

// register actions
CommonEditorRegistry.registerEditorAction(new ToggleTabFocusModeAction());
