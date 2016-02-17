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

class SelectBracketAction extends EditorAction {

	static ID = 'editor.action.jumpToBracket';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	public run():TPromise<boolean> {

		this.editor.trigger(this.id, EditorCommon.Handler.JumpToBracket, {});

		return TPromise.as(true);
	}

}

// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(SelectBracketAction, SelectBracketAction.ID, nls.localize('smartSelect.jumpBracket', "Go to Bracket"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_BACKSLASH
}));
