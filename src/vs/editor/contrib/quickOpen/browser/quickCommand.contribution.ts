/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import * as browser from 'vs/base/browser/browser';
import {KbExpr} from 'vs/platform/keybinding/common/keybinding';
import {KEYBINDING_CONTEXT_EDITOR_FOCUS} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey} from 'vs/editor/common/editorCommonExtensions';
import {QuickCommandAction} from './quickCommand';

// Contribute "Quick Command" to context menu
CommonEditorRegistry.registerEditorAction({
	ctor: QuickCommandAction,
	id: QuickCommandAction.ID,
	label: nls.localize('label', "Command Palette"),
	alias: 'Command Palette',
	kbOpts: {
		context: ContextKey.EditorFocus,
		primary: (browser.isIE11orEarlier ? KeyMod.Alt | KeyCode.F1 : KeyCode.F1)
	},
	menuOpts: {
		kbExpr: KbExpr.has(KEYBINDING_CONTEXT_EDITOR_FOCUS)
	}
});