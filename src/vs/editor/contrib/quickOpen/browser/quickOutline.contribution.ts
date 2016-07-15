/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {KbExpr} from 'vs/platform/keybinding/common/keybinding';
import {ModeContextKeys} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey} from 'vs/editor/common/editorCommonExtensions';
import {QuickOutlineAction} from './quickOutline';

// Contribute "Quick Outline" to context menu
CommonEditorRegistry.registerEditorAction({
	ctor: QuickOutlineAction,
	id: QuickOutlineAction.ID,
	label: nls.localize('label', "Go to Symbol..."),
	alias: 'Go to Symbol...',
	kbOpts: {
		context: ContextKey.EditorFocus,
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_O
	},
	menuOpts: {
		group: 'navigation',
		order: 3,
		kbExpr: KbExpr.and(KbExpr.has(ModeContextKeys.hasDocumentSymbolProvider))
	}
});
