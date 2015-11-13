/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import EditorCommon = require('vs/editor/common/editorCommon');
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

class ToggleTabFocusModeAction extends EditorAction {

	static ID = 'editor.action.toggleTabFocusMode';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	public run():TPromise<boolean> {

		if(this.editor.getConfiguration().tabFocusMode) {
			this.editor.updateOptions({tabFocusMode: false});
		} else {
			this.editor.updateOptions({tabFocusMode: true});
		}

		return TPromise.as(true);
	}
}

// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ToggleTabFocusModeAction, ToggleTabFocusModeAction.ID, nls.localize('toggle.tabfocusmode', "Toggle Use of Tab Key for Setting Focus"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_M,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_M }
}));
