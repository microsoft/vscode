/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ITerminalGroupService, ITerminalService } from './terminal.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

export function setupTerminalCommands(): void {
	registerOpenTerminalAtIndexCommands();
	registerTestRunCommandAction();
}

// TODO: Remove
// Dummy testing commands.
function registerTestRunCommandAction(): void {
	registerAction2(class TestRunCommand extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.terminal.testRunCommand',
				title: { value: 'Test Run Command', original: 'Test Run Command' },
				category: { value: 'Terminal', original: 'Terminal' },
				f1: true
			});
		}

		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const instance = terminalService.activeInstance;
			if (!instance) {
				return;
			}
			await instance.runCommand('echo "Testing runCommand with timeout"', true);
		}
	});
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
