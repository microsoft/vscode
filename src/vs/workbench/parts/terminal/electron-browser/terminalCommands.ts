/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ITerminalService } from 'vs/workbench/parts/terminal/common/terminal';

export function setup(): void {
	registerOpenTerminalAtIndexCommands();
}

function registerOpenTerminalAtIndexCommands(): void {
	for (let i = 0; i < 9; i++) {
		const terminalIndex = i;
		const visibleIndex = i + 1;

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: `workbench.action.terminal.focusAtIndex${visibleIndex}`,
			weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
			when: void 0,
			primary: null,
			handler: accessor => {
				const terminalService = accessor.get(ITerminalService);
				terminalService.setActiveInstanceByIndex(terminalIndex);
				return terminalService.showPanel(true);
			}
		});
	}
}