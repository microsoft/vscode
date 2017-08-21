/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import nls = require('vs/nls');
import { EmmetEditorAction } from 'vs/workbench/parts/emmet/electron-browser/emmetActions';
import { editorAction } from 'vs/editor/common/editorCommonExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

@editorAction
class ExpandAbbreviationAction extends EmmetEditorAction {

	constructor() {
		super({
			id: 'editor.emmet.action.expandAbbreviation',
			label: nls.localize('expandAbbreviationAction', "Emmet: Expand Abbreviation"),
			alias: 'Emmet: Expand Abbreviation',
			precondition: EditorContextKeys.writable,
			actionName: 'expand_abbreviation',
			kbOpts: {
				primary: KeyCode.Tab,
				kbExpr: ContextKeyExpr.and(
					EditorContextKeys.textFocus,
					EditorContextKeys.tabDoesNotMoveFocus,
					ContextKeyExpr.has('config.emmet.triggerExpansionOnTab')
				)
			}
		});

	}
}