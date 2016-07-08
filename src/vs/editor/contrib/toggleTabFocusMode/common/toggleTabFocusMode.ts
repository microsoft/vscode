/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {TPromise} from 'vs/base/common/winjs.base';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import {ICommonCodeEditor, IEditorActionDescriptorData} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {TabFocus} from 'vs/editor/common/config/commonEditorConfig';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';

export class ToggleTabFocusModeAction extends EditorAction {

	public static ID = 'editor.action.toggleTabFocusMode';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	public run():TPromise<boolean> {

		let oldValue = TabFocus.getTabFocusMode();
		TabFocus.setTabFocusMode(!oldValue);

		return TPromise.as(true);
	}
}

// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ToggleTabFocusModeAction, ToggleTabFocusModeAction.ID, nls.localize('toggle.tabfocusmode', "Toggle Use of Tab Key for Setting Focus"), {
	primary: null,
	context: null
}, 'Toggle Use of Tab Key for Setting Focus'));

KeybindingsRegistry.registerCommandRule({
	id: ToggleTabFocusModeAction.ID,
	weight: KeybindingsRegistry.WEIGHT.editorContrib(),
	when: null,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_M,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_M }
});
