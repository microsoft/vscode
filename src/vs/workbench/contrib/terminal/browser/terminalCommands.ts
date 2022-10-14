/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ITerminalGroupService } from 'vs/workbench/contrib/terminal/browser/terminal';

export function setupTerminalCommands(): void {
	registerOpenTerminalAtIndexCommands();
}

function registerOpenTerminalAtIndexCommands(): void {
	for (let i = 0; i < 9; i++) {
		const terminalIndex = i;
		const visibleIndex = i + 1;

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: `workbench.action.terminal.focusAtIndex${visibleIndex}`,
			weight: KeybindingWeight.WorkbenchContrib,
			when: undefined,
			primary: 0,
			handler: accessor => {
				accessor.get(ITerminalGroupService).setActiveInstanceByIndex(terminalIndex);
				return accessor.get(ITerminalGroupService).showPanel(true);
			}
		});
	}
}
