/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPick, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IPickerQuickAccessItem } from '../../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { inQuickInputContextKeyValue } from '../../../../../platform/quickinput/browser/quickInput.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';

class AddQuickPickItemToContextAction extends Action2 {
	constructor() {
		super({
			id: 'chat.action.addQuickPickContext',
			title: localize2('chat.addQuickPickContext', "Add Quick Pick Item to Chat Context"),
			category: CHAT_CATEGORY,
			f1: false,
			keybinding: {
				primary: KeyMod.Shift | KeyCode.Enter,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow },
				weight: KeybindingWeight.WorkbenchContrib + 100,
				when: ContextKeyExpr.has(inQuickInputContextKeyValue),
			},
			precondition: ContextKeyExpr.has(inQuickInputContextKeyValue),
		});
	}

	override run(accessor: ServicesAccessor): void {
		const quickInputService = accessor.get(IQuickInputService);
		const picker = quickInputService.currentQuickInput as IQuickPick<IQuickPickItem> | undefined;
		const activeItem = picker?.activeItems[0] as IPickerQuickAccessItem | undefined;
		if (!activeItem?.attach) {
			return;
		}

		activeItem.attach();
	}
}

registerAction2(AddQuickPickItemToContextAction);
