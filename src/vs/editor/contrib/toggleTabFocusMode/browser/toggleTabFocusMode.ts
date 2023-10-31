/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from 'vs/base/browser/ui/aria/aria';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { TabFocus } from 'vs/editor/browser/config/tabFocus';
import * as nls from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

export class ToggleTabFocusModeAction extends Action2 {

	public static readonly ID = 'editor.action.toggleTabFocusMode';

	constructor() {
		super({
			id: ToggleTabFocusModeAction.ID,
			title: { value: nls.localize({ key: 'toggle.tabMovesFocus', comment: ['Turn on/off use of tab key for moving focus around VS Code'] }, 'Toggle Tab Key Moves Focus'), original: 'Toggle Tab Key Moves Focus' },
			precondition: undefined,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyM,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyM },
				weight: KeybindingWeight.EditorContrib
			},
			f1: true
		});
	}

	public run(): void {
		const oldValue = TabFocus.getTabFocusMode();
		const newValue = !oldValue;
		TabFocus.setTabFocusMode(newValue);
		if (newValue) {
			alert(nls.localize('toggle.tabMovesFocus.on', "Pressing Tab will now move focus to the next focusable element"));
		} else {
			alert(nls.localize('toggle.tabMovesFocus.off', "Pressing Tab will now insert the tab character"));
		}
	}
}

registerAction2(ToggleTabFocusModeAction);
