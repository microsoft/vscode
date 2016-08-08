/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {Handler, EditorContextKeys} from 'vs/editor/common/editorCommon';
import {HandlerEditorAction, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';

class SelectBracketAction extends HandlerEditorAction {

	constructor() {
		super(
			'editor.action.jumpToBracket',
			nls.localize('smartSelect.jumpBracket', "Go to Bracket"),
			'Go to Bracket',
			false,
			Handler.JumpToBracket
		);

		this._precondition = null;

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_BACKSLASH
		};
	}
}

// register actions
CommonEditorRegistry.registerEditorAction(new SelectBracketAction());
