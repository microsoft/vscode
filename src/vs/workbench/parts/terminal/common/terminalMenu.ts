/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';

export function setupTerminalMenu() {
	// Manage
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '1_manage',
		command: {
			id: 'workbench.action.terminal.new',
			title: nls.localize({ key: 'miNewTerminal', comment: ['&& denotes a mnemonic'] }, "&&New Terminal")
		},
		order: 1
	});
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '1_manage',
		command: {
			id: 'workbench.action.terminal.split',
			title: nls.localize({ key: 'miSplitTerminal', comment: ['&& denotes a mnemonic'] }, "&&Split Terminal")
		},
		order: 2
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '1_manage',
		command: {
			id: 'workbench.action.terminal.kill',
			title: nls.localize({ key: 'miKillTerminal', comment: ['&& denotes a mnemonic'] }, "&&Kill Terminal")
		},
		order: 3
	});

	// Run
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '2_run',
		command: {
			id: 'workbench.action.terminal.clear',
			title: nls.localize({ key: 'miClear', comment: ['&& denotes a mnemonic'] }, "&&Clear")
		},
		order: 1
	});
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '2_run',
		command: {
			id: 'workbench.action.terminal.runActiveFile',
			title: nls.localize({ key: 'miRunActiveFile', comment: ['&& denotes a mnemonic'] }, "Run &&Active File")
		},
		order: 2
	});
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '2_run',
		command: {
			id: 'workbench.action.terminal.runSelectedFile',
			title: nls.localize({ key: 'miRunSelectedText', comment: ['&& denotes a mnemonic'] }, "Run &&Selected Text")
		},
		order: 3
	});

	// Scroll/selection
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '3_selection',
		command: {
			id: 'workbench.action.terminal.scrollToPreviousCommand',
			title: nls.localize({ key: 'miScrollToPreviousCommand', comment: ['&& denotes a mnemonic'] }, "Scroll To Previous Command")
		},
		order: 1
	});
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '3_selection',
		command: {
			id: 'workbench.action.terminal.scrollToNextCommand',
			title: nls.localize({ key: 'miScrollToNextCommand', comment: ['&& denotes a mnemonic'] }, "Scroll To Next Command")
		},
		order: 2
	});
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '3_selection',
		command: {
			id: 'workbench.action.terminal.selectToPreviousCommand',
			title: nls.localize({ key: 'miSelectToPreviousCommand', comment: ['&& denotes a mnemonic'] }, "Select To Previous Command")
		},
		order: 3
	});
	MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
		group: '3_selection',
		command: {
			id: 'workbench.action.terminal.selectToNextCommand',
			title: nls.localize({ key: 'miSelectToNextCommand', comment: ['&& denotes a mnemonic'] }, "Select To Next Command")
		},
		order: 4
	});
}