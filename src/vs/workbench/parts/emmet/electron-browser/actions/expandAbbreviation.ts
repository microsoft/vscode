/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { BasicEmmetEditorAction } from 'vs/workbench/parts/emmet/electron-browser/emmetActions';

import { editorAction } from 'vs/editor/common/editorCommonExtensions';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CoreEditingCommands } from 'vs/editor/common/controller/coreCommands';

import { KeyCode } from 'vs/base/common/keyCodes';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

@editorAction
class ExpandAbbreviationAction extends BasicEmmetEditorAction {

	constructor() {
		super(
			'editor.emmet.action.expandAbbreviation',
			nls.localize('expandAbbreviationAction', "Emmet: Expand Abbreviation"),
			'Emmet: Expand Abbreviation',
			'expand_abbreviation',
			{
				primary: KeyCode.Tab,
				kbExpr: ContextKeyExpr.and(
					EditorContextKeys.textFocus,
					EditorContextKeys.hasOnlyEmptySelection,
					EditorContextKeys.hasSingleSelection,
					EditorContextKeys.tabDoesNotMoveFocus,
					ContextKeyExpr.has('config.emmet.triggerExpansionOnTab'),
					ContextKeyExpr.not('config.emmet.useNewEmmet')
				)
			}
		);
	}

	protected noExpansionOccurred(editor: ICommonCodeEditor): void {
		// forward the tab key back to the editor
		CoreEditingCommands.Tab.runEditorCommand(null, editor, null);
	}
}
