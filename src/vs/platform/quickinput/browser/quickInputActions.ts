/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { KeybindingWeight, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { inQuickInputContext } from 'vs/platform/quickinput/browser/quickInput';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.quickInput.accept',
	weight: KeybindingWeight.EditorCore,
	when: inQuickInputContext,
	primary: KeyCode.Enter,
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		return quickInputService.accept();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.quickInput.cancel',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickInputContext,
	primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape],
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		return quickInputService.cancel();
	}
});
