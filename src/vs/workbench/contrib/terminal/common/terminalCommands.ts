/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ITerminalService } from 'vs/workbench/contrib/terminal/common/terminal';

export const enum TERMINAL_COMMAND_ID {
	FIND_NEXT = 'workbench.action.terminal.findNext',
	FIND_NEXT_TERMINAL_FOCUS = 'workbench.action.terminal.findNextTerminalFocus',
	FIND_PREVIOUS = 'workbench.action.terminal.findPrevious',
	FIND_PREVIOUS_TERMINAL_FOCUS = 'workbench.action.terminal.findPreviousTerminalFocus',
	TOGGLE = 'workbench.action.terminal.toggleTerminal',
	KILL = 'workbench.action.terminal.kill',
	QUICK_KILL = 'workbench.action.terminal.quickKill',
	COPY_SELECTION = 'workbench.action.terminal.copySelection',
	SELECT_ALL = 'workbench.action.terminal.selectAll',
	DELETE_WORD_LEFT = 'workbench.action.terminal.deleteWordLeft',
	DELETE_WORD_RIGHT = 'workbench.action.terminal.deleteWordRight',
	DELETE_TO_LINE_START = 'workbench.action.terminal.deleteToLineStart',
	MOVE_TO_LINE_START = 'workbench.action.terminal.moveToLineStart',
	MOVE_TO_LINE_END = 'workbench.action.terminal.moveToLineEnd',
	NEW = 'workbench.action.terminal.new',
	NEW_LOCAL = 'workbench.action.terminal.newLocal',
	NEW_IN_ACTIVE_WORKSPACE = 'workbench.action.terminal.newInActiveWorkspace',
	SPLIT = 'workbench.action.terminal.split',
	SPLIT_IN_ACTIVE_WORKSPACE = 'workbench.action.terminal.splitInActiveWorkspace',
	FOCUS_PREVIOUS_PANE = 'workbench.action.terminal.focusPreviousPane',
	FOCUS_NEXT_PANE = 'workbench.action.terminal.focusNextPane',
	RESIZE_PANE_LEFT = 'workbench.action.terminal.resizePaneLeft',
	RESIZE_PANE_RIGHT = 'workbench.action.terminal.resizePaneRight',
	RESIZE_PANE_UP = 'workbench.action.terminal.resizePaneUp',
	RESIZE_PANE_DOWN = 'workbench.action.terminal.resizePaneDown',
	FOCUS = 'workbench.action.terminal.focus',
	FOCUS_NEXT = 'workbench.action.terminal.focusNext',
	FOCUS_PREVIOUS = 'workbench.action.terminal.focusPrevious',
	PASTE = 'workbench.action.terminal.paste',
	SELECT_DEFAULT_SHELL = 'workbench.action.terminal.selectDefaultShell',
	RUN_SELECTED_TEXT = 'workbench.action.terminal.runSelectedText',
	RUN_ACTIVE_FILE = 'workbench.action.terminal.runActiveFile',
	SWITCH_TERMINAL = 'workbench.action.terminal.switchTerminal',
	SCROLL_DOWN_LINE = 'workbench.action.terminal.scrollDown',
	SCROLL_DOWN_PAGE = 'workbench.action.terminal.scrollDownPage',
	SCROLL_TO_BOTTOM = 'workbench.action.terminal.scrollToBottom',
	SCROLL_UP_LINE = 'workbench.action.terminal.scrollUp',
	SCROLL_UP_PAGE = 'workbench.action.terminal.scrollUpPage',
	SCROLL_TO_TOP = 'workbench.action.terminal.scrollToTop',
	CLEAR = 'workbench.action.terminal.clear',
	CLEAR_SELECTION = 'workbench.action.terminal.clearSelection',
	MANAGE_WORKSPACE_SHELL_PERMISSIONS = 'workbench.action.terminal.manageWorkspaceShellPermissions',
	RENAME = 'workbench.action.terminal.rename',
	FIND_WIDGET_FOCUS = 'workbench.action.terminal.focusFindWidget',
	FIND_WIDGET_HIDE = 'workbench.action.terminal.hideFindWidget',
	QUICK_OPEN_TERM = 'workbench.action.quickOpenTerm',
	SCROLL_TO_PREVIOUS_COMMAND = 'workbench.action.terminal.scrollToPreviousCommand',
	SCROLL_TO_NEXT_COMMAND = 'workbench.action.terminal.scrollToNextCommand',
	SELECT_TO_PREVIOUS_COMMAND = 'workbench.action.terminal.selectToPreviousCommand',
	SELECT_TO_NEXT_COMMAND = 'workbench.action.terminal.selectToNextCommand',
	SELECT_TO_PREVIOUS_LINE = 'workbench.action.terminal.selectToPreviousLine',
	SELECT_TO_NEXT_LINE = 'workbench.action.terminal.selectToNextLine',
	TOGGLE_ESCAPE_SEQUENCE_LOGGING = 'toggleEscapeSequenceLogging',
	SEND_SEQUENCE = 'workbench.action.terminal.sendSequence',
	TOGGLE_FIND_REGEX = 'workbench.action.terminal.toggleFindRegex',
	TOGGLE_FIND_WHOLE_WORD = 'workbench.action.terminal.toggleFindWholeWord',
	TOGGLE_FIND_CASE_SENSITIVE = 'workbench.action.terminal.toggleFindCaseSensitive',
	TOGGLE_FIND_REGEX_TERMINAL_FOCUS = 'workbench.action.terminal.toggleFindRegexTerminalFocus',
	TOGGLE_FIND_WHOLE_WORD_TERMINAL_FOCUS = 'workbench.action.terminal.toggleFindWholeWordTerminalFocus',
	TOGGLE_FIND_CASE_SENSITIVE_TERMINAL_FOCUS = 'workbench.action.terminal.toggleFindCaseSensitiveTerminalFocus',
	NAVIGATION_MODE_EXIT = 'workbench.action.terminal.navigationModeExit',
	NAVIGATION_MODE_FOCUS_NEXT = 'workbench.action.terminal.navigationModeFocusNext',
	NAVIGATION_MODE_FOCUS_PREVIOUS = 'workbench.action.terminal.navigationModeFocusPrevious'
}

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
				const terminalService = accessor.get(ITerminalService);
				terminalService.setActiveInstanceByIndex(terminalIndex);
				return terminalService.showPanel(true);
			}
		});
	}
}
