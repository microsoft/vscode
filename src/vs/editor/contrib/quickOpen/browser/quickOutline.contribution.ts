/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {QuickOutlineAction} from './quickOutline';

// Contribute "Quick Outline" to context menu
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(QuickOutlineAction, QuickOutlineAction.ID, nls.localize('label', "Go to Symbol..."), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_O
}));
