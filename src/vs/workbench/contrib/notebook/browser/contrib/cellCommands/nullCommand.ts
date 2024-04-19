/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode } from 'vs/base/common/keyCodes';
import { registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_INPUT_FOCUSED } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';

registerAction2(class NullAction extends Action2 {
	constructor() {
		super({
			id: 'notebook.nullCommand',
			title: 'Null Command',
			f1: false,
			keybinding: [
				{
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_INPUT_FOCUSED),
					primary: KeyCode.DownArrow,
					weight: KeybindingWeight.WorkbenchContrib + 1
				},
				{
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_INPUT_FOCUSED),
					primary: KeyCode.UpArrow,
					weight: KeybindingWeight.WorkbenchContrib + 1
				},
				{
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_INPUT_FOCUSED),
					primary: KeyCode.Delete,
					weight: KeybindingWeight.WorkbenchContrib + 1
				},
				{
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_INPUT_FOCUSED),
					primary: KeyCode.Enter,
					weight: KeybindingWeight.WorkbenchContrib + 1
				}
			]
		});
	}

	run() {
		//noop
	}
});
