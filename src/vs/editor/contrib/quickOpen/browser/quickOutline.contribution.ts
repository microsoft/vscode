/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import QuickOutline = require('./quickOutline');
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

// Contribute "Quick Outline" to context menu
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(QuickOutline.QuickOutlineAction, QuickOutline.QuickOutlineAction.ID, nls.localize('label', "Go to Symbol..."), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_O 
}));
