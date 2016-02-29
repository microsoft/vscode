/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {GotoLineAction} from './gotoLine';

// Contribute Ctrl+G to "Go to line" using quick open
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(GotoLineAction, GotoLineAction.ID, nls.localize('label', "Go to Line..."), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_G,
	mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_G }
}));