/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from 'vs/nls';

/**
 * An object holding strings shared by multiple parts of the terminal
 */
export const terminalStrings = {
	terminal: localize('terminal', "Terminal"),
	new: localize('terminal.new', "New Terminal"),
	doNotShowAgain: localize('doNotShowAgain', 'Do Not Show Again'),
	currentSessionCategory: localize('currentSessionCategory', 'current session'),
	previousSessionCategory: localize('previousSessionCategory', 'previous session'),
	typeTask: localize('task', "Task"),
	typeLocal: localize('local', "Local"),
	actionCategory: localize2('terminalCategory', "Terminal"),
	focus: localize2('workbench.action.terminal.focus', "Focus Terminal"),
	focusAndHideAccessibleBuffer: localize2('workbench.action.terminal.focusAndHideAccessibleBuffer', "Focus Terminal and Hide Accessible Buffer"),
	kill: {
		...localize2('killTerminal', "Kill Terminal"),
		short: localize('killTerminal.short', "Kill"),
	},
	moveToEditor: localize2('moveToEditor', "Move Terminal into Editor Area"),
	moveIntoNewWindow: localize2('moveIntoNewWindow', "Move Terminal into New Window"),
	moveToTerminalPanel: localize2('workbench.action.terminal.moveToTerminalPanel', "Move Terminal into Panel"),
	changeIcon: localize2('workbench.action.terminal.changeIcon', "Change Icon..."),
	changeColor: localize2('workbench.action.terminal.changeColor', "Change Color..."),
	split: {
		...localize2('splitTerminal', "Split Terminal"),
		short: localize('splitTerminal.short', "Split"),
	},
	unsplit: localize2('unsplitTerminal', "Unsplit Terminal"),
	rename: localize2('workbench.action.terminal.rename', "Rename..."),
	toggleSizeToContentWidth: localize2('workbench.action.terminal.sizeToContentWidthInstance', "Toggle Size to Content Width"),
	focusHover: localize2('workbench.action.terminal.focusHover', "Focus Hover"),
	sendSequence: localize2('workbench.action.terminal.sendSequence', "Send Custom Sequence To Terminal"),
	newWithCwd: localize2('workbench.action.terminal.newWithCwd', "Create New Terminal Starting in a Custom Working Directory"),
	renameWithArgs: localize2('workbench.action.terminal.renameWithArg', "Rename the Currently Active Terminal"),
	scrollToPreviousCommand: localize2('workbench.action.terminal.scrollToPreviousCommand', "Scroll To Previous Command"),
	scrollToNextCommand: localize2('workbench.action.terminal.scrollToNextCommand', "Scroll To Next Command")
};
