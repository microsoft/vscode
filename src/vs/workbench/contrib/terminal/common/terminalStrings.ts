/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';

/**
 * Formats a message from the product to be written to the terminal.
 */
export function formatMessageForTerminal(message: string, excludeLeadingNewLine: boolean = false): string {
	// Wrap in bold and ensure it's on a new line
	return `${excludeLeadingNewLine ? '' : '\r\n'}\x1b[1m${message}\x1b[0m\n\r`;
}

/**
 * An object holding strings shared by multiple parts of the terminal
 */
export const terminalStrings = {
	terminal: localize('terminal', "Terminal"),
	focus: {
		value: localize('workbench.action.terminal.focus', "Focus Terminal"),
		original: 'Focus Terminal'
	},
	kill: {
		value: localize('killTerminal', "Kill Terminal"),
		original: 'Kill Terminal',
		short: localize('killTerminal.short', "Kill"),
	},
	moveToEditor: {
		value: localize('moveToEditor', "Move Terminal into Editor Area"),
		original: 'Move Terminal into Editor Area',
		short: localize('moveToEditorShort', "Move into Editor Area")
	},
	moveToTerminalPanel: {
		value: localize('workbench.action.terminal.moveToTerminalPanel', "Move Terminal into Panel"),
		original: 'Move Terminal into Panel'
	},
	changeIcon: {
		value: localize('workbench.action.terminal.changeIcon', "Change Icon..."),
		original: 'Change Icon...'
	},
	changeColor: {
		value: localize('workbench.action.terminal.changeColor', "Change Color..."),
		original: 'Change Color...'
	},
	split: {
		value: localize('splitTerminal', "Split Terminal"),
		original: 'Split Terminal',
		short: localize('splitTerminal.short', "Split"),
	},
	unsplit: {
		value: localize('unsplitTerminal', "Unsplit Terminal"),
		original: 'Unsplit Terminal'
	},
	rename: {
		value: localize('workbench.action.terminal.rename', "Rename..."),
		original: 'Rename...'
	}
};
