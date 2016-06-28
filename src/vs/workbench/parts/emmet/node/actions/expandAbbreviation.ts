/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {BasicEmmetEditorAction} from 'vs/workbench/parts/emmet/node/emmetActions';

import {CommonEditorRegistry, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {IEditorActionDescriptorData, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';

import editorCommon = require('vs/editor/common/editorCommon');
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {KeyCode} from 'vs/base/common/keyCodes';
import {KbExpr} from 'vs/platform/keybinding/common/keybindingService';

class ExpandAbbreviationAction extends BasicEmmetEditorAction {

	static ID = 'editor.emmet.action.expandAbbreviation';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService, 'expand_abbreviation');
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ExpandAbbreviationAction,
	ExpandAbbreviationAction.ID,
	nls.localize('expandAbbreviationAction', "Emmet: Expand Abbreviation"), void 0, 'Emmet: Expand Abbreviation'));


KeybindingsRegistry.registerCommandRule({
	id: ExpandAbbreviationAction.ID,
	weight: KeybindingsRegistry.WEIGHT.editorContrib(),
	when: KbExpr.and(
		KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS),
		KbExpr.not(editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION),
		KbExpr.not(editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS),
		KbExpr.not(editorCommon.KEYBINDING_CONTEXT_EDITOR_TAB_MOVES_FOCUS),
		KbExpr.has('config.emmet.triggerExpansionOnTab')
	),
	primary: KeyCode.Tab
});
