/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';

/**
 * An object holding strings shared by multiple parts of the terminal
 */
export const terminalStrings = {
	terminal: localize('terminal', "Terminal"),
	new: localize('terminal.new', "New Terminal"),
	doNotShowAgain: localize('doNotShowAgain', 'Do Not Show Again'),
	currentSessionCategory: localize('currentSessionCategory', 'current session'),
	previousSessionCategory: localize('previousSessionCategory', 'previous session'),
	actionCategory: {
		value: localize('terminalCategory', "Terminal"),
		original: 'Terminal'
	},
	focus: {
		value: localize('workbench.action.terminal.focus', "Focus Terminal"),
		original: 'Focus Terminal'
	},
	focusAndHideAccessibleBuffer: {
		value: localize('workbench.action.terminal.focusAndHideAccessibleBuffer', "Focus Terminal and Hide Accessible Buffer"),
		original: 'Focus Terminal and Hide Accessible Buffer'
	},
	kill: {
		value: localize('killTerminal', "Kill Terminal"),
		original: 'Kill Terminal',
		short: localize('killTerminal.short', "Kill"),
	},
	moveToEditor: {
		value: localize('moveToEditor', "Move Terminal into Editor Area"),
		original: 'Move Terminal into Editor Area',
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
	},
	toggleSizeToContentWidth: {
		value: localize('workbench.action.terminal.sizeToContentWidthInstance', "Toggle Size to Content Width"),
		original: 'Toggle Size to Content Width'
	},
	focusHover: {
		value: localize('workbench.action.terminal.focusHover', "Focus Hover"),
		original: 'Focus Hover'
	},
	sendSequence: {
		value: localize('workbench.action.terminal.sendSequence', "Send Custom Sequence To Terminal"),
		original: 'Send Custom Sequence To Terminal'
	},
	newWithCwd: {
		value: localize('workbench.action.terminal.newWithCwd', "Create New Terminal Starting in a Custom Working Directory"),
		original: 'Create New Terminal Starting in a Custom Working Directory'
	},
	renameWithArgs: {
		value: localize('workbench.action.terminal.renameWithArg', "Rename the Currently Active Terminal"),
		original: 'Rename the Currently Active Terminal'
	}
};
