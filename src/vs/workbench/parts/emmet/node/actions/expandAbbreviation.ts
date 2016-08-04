/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {BasicEmmetEditorAction} from 'vs/workbench/parts/emmet/node/emmetActions';

import {CommonEditorRegistry, EditorKbExpr} from 'vs/editor/common/editorCommonExtensions';
import {Handler, ICommonCodeEditor} from 'vs/editor/common/editorCommon';

import {KeyCode} from 'vs/base/common/keyCodes';
import {KbExpr} from 'vs/platform/keybinding/common/keybinding';

class ExpandAbbreviationAction extends BasicEmmetEditorAction {

	constructor() {
		super(
			'editor.emmet.action.expandAbbreviation',
			nls.localize('expandAbbreviationAction', "Emmet: Expand Abbreviation"),
			'Emmet: Expand Abbreviation',
			'expand_abbreviation'
		);

		this.kbOpts = {
			primary: KeyCode.Tab,
			kbExpr: KbExpr.and(
				EditorKbExpr.TextFocus,
				EditorKbExpr.HasOnlyEmptySelection,
				EditorKbExpr.HasSingleSelection,
				EditorKbExpr.TabDoesNotMoveFocus,
				KbExpr.has('config.emmet.triggerExpansionOnTab')
			)
		};
	}

	protected noExpansionOccurred(editor:ICommonCodeEditor): void {
		// forward the tab key back to the editor
		editor.trigger('emmet', Handler.Tab, {});
	}
}

CommonEditorRegistry.registerEditorAction2(new ExpandAbbreviationAction());
