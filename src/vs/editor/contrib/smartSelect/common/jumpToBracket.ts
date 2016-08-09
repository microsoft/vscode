/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {Handler, EditorContextKeys} from 'vs/editor/common/editorCommon';
import {editorAction, HandlerEditorAction} from 'vs/editor/common/editorCommonExtensions';

@editorAction
class SelectBracketAction extends HandlerEditorAction {
	constructor() {
		super({
			id: 'editor.action.jumpToBracket',
			label: nls.localize('smartSelect.jumpBracket', "Go to Bracket"),
			alias: 'Go to Bracket',
			precondition: null,
			handlerId: Handler.JumpToBracket,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_BACKSLASH
			}
		});
	}
}
