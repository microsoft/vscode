/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { COMMAND_ID } from 'vs/workbench/parts/terminal/common/terminalCommands';

export function setupTerminalMenu() {
	// Manage
	const manageGroup = '1_manage';
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: manageGroup,
		command: {
			id: COMMAND_ID.NEW,
			title: nls.localize({ key: 'miNewTerminal', comment: ['&& denotes a mnemonic'] }, "&&New Terminal")
		},
		order: 1
	});
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: manageGroup,
		command: {
			id: COMMAND_ID.SPLIT,
			title: nls.localize({ key: 'miSplitTerminal', comment: ['&& denotes a mnemonic'] }, "&&Split Terminal")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: manageGroup,
		command: {
			id: COMMAND_ID.KILL,
			title: nls.localize({ key: 'miKillTerminal', comment: ['&& denotes a mnemonic'] }, "&&Kill Terminal")
		},
		order: 3
	});

	// Run
	const runGroup = '2_run';
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: runGroup,
		command: {
			id: COMMAND_ID.CLEAR,
			title: nls.localize({ key: 'miClear', comment: ['&& denotes a mnemonic'] }, "&&Clear")
		},
		order: 1
	});
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: runGroup,
		command: {
			id: COMMAND_ID.RUN_ACTIVE_FILE,
			title: nls.localize({ key: 'miRunActiveFile', comment: ['&& denotes a mnemonic'] }, "Run &&Active File")
		},
		order: 2
	});
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: runGroup,
		command: {
			id: COMMAND_ID.RUN_SELECTED_TEXT,
			title: nls.localize({ key: 'miRunSelectedText', comment: ['&& denotes a mnemonic'] }, "Run &&Selected Text")
		},
		order: 3
	});

	// Navigation
	const navigationGroup = '3_navigation';
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: navigationGroup,
		command: {
			id: COMMAND_ID.SCROLL_TO_PREVIOUS_COMMAND,
			title: nls.localize({ key: 'miScrollToPreviousCommand', comment: ['&& denotes a mnemonic'] }, "Scroll To Previous Command")
		},
		order: 1
	});
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: navigationGroup,
		command: {
			id: COMMAND_ID.SCROLL_TO_NEXT_COMMAND,
			title: nls.localize({ key: 'miScrollToNextCommand', comment: ['&& denotes a mnemonic'] }, "Scroll To Next Command")
		},
		order: 2
	});
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: navigationGroup,
		command: {
			id: COMMAND_ID.SELECT_TO_PREVIOUS_COMMAND,
			title: nls.localize({ key: 'miSelectToPreviousCommand', comment: ['&& denotes a mnemonic'] }, "Select To Previous Command")
		},
		order: 3
	});
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: navigationGroup,
		command: {
			id: COMMAND_ID.SELECT_TO_NEXT_COMMAND,
			title: nls.localize({ key: 'miSelectToNextCommand', comment: ['&& denotes a mnemonic'] }, "Select To Next Command")
		},
		order: 4
	});
}