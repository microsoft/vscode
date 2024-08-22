/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../../nls';
import { EmmetEditorAction } from '../emmetActions';
import { registerEditorAction } from '../../../../../editor/browser/editorExtensions';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys';
import { KeyCode } from '../../../../../base/common/keyCodes';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry';
import { MenuId } from '../../../../../platform/actions/common/actions';

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
					EditorContextKeys.editorTextFocus,
					EditorContextKeys.tabDoesNotMoveFocus,
					ContextKeyExpr.has('config.emmet.triggerExpansionOnTab')
				),
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				menuId: MenuId.MenubarEditMenu,
				group: '5_insert',
				title: nls.localize({ key: 'miEmmetExpandAbbreviation', comment: ['&& denotes a mnemonic'] }, "Emmet: E&&xpand Abbreviation"),
				order: 3
			}
		});

	}
}

registerEditorAction(ExpandAbbreviationAction);
