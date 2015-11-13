/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import editorCommon = require('vs/editor/common/editorCommon');
import {ExpandAbbreviationAction} from './emmetActions';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ExpandAbbreviationAction,
	ExpandAbbreviationAction.ID,
	nls.localize('expandAbbreviationAction',
	"Emmet: Expand Abbreviation")));

KeybindingsRegistry.registerCommandRule({
	id: ExpandAbbreviationAction.ID,
	weight: KeybindingsRegistry.WEIGHT.editorContrib(),
	context: [{
		key: editorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS
	}, {
		key: editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION,
		operator: KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_NOT_EQUAL,
		operand: true
	}, {
		key: editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS,
		operator: KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_NOT_EQUAL,
		operand: true
	}, {
		key: editorCommon.KEYBINDING_CONTEXT_EDITOR_TAB_MOVES_FOCUS,
		operator: KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_NOT_EQUAL,
		operand: true
	}],
	primary: KeyCode.Tab
});