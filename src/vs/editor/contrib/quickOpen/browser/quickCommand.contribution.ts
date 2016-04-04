/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import * as browser from 'vs/base/browser/browser';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {QuickCommandAction} from './quickCommand';

// Contribute "Quick Command" to context menu
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(QuickCommandAction, QuickCommandAction.ID, nls.localize('label', "Command Palette"), {
	context: ContextKey.EditorFocus,
	primary: (browser.isIE11orEarlier ? KeyMod.Alt | KeyCode.F1 : KeyCode.F1)
}));