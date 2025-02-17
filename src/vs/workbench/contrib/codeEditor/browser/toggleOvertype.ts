/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { InputMode } from '../../../../editor/common/inputMode.js';

export class ToggleOvertypeInsertMode extends Action2 {

	constructor() {
		super({
			id: 'editor.action.toggleOvertypeInsertMode',
			title: {
				...localize2('toggleOvertypeInsertMode', "Toggle Overtype/Insert Mode"),
				mnemonicTitle: localize({ key: 'mitoggleOvertypeInsertMode', comment: ['&& denotes a mnemonic'] }, "&&Toggle Overtype/Insert Mode"),
			},
			metadata: {
				description: localize2('toggleOvertypeMode.description', "Toggle between overtype and insert mode"),
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Insert,
				mac: { primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.KeyO },
			},
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const oldInputMode = InputMode.getInputMode();
		const newInputMode = oldInputMode === 'insert' ? 'overtype' : 'insert';
		InputMode.setInputMode(newInputMode);
	}
}

registerAction2(ToggleOvertypeInsertMode);
