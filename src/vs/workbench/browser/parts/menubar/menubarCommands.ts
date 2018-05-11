/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import URI from 'vs/base/common/uri';

export const FILE_MENU_FAKE_OPEN_FILE_COMMAND_ID = 'workbench.action.fakeOpenFile';

export function setup(): void {
	registerMenubarCommands();
}

function registerMenubarCommands() {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: FILE_MENU_FAKE_OPEN_FILE_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: KeyMod.CtrlCmd | KeyCode.F6,
		win: { primary: KeyMod.CtrlCmd | KeyCode.F6 },
		handler: (accessor, resource: URI | object) => {
			alert('fake open successful');
			console.log('fake open triggered');
		}
	});
}