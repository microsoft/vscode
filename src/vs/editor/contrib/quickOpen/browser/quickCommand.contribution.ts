/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as Browser from 'vs/base/browser/browser';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import * as QuickCommand from './quickCommand';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

// Contribute "Quick Command" to context menu
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(QuickCommand.QuickCommandAction, QuickCommand.QuickCommandAction.ID, nls.localize('label', "Command Palette"), {
	context: ContextKey.EditorFocus,
	primary: (Browser.isIE11orEarlier ? KeyMod.Alt | KeyCode.F1 : KeyCode.F1)
}));