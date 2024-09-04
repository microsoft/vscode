/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum TerminalFindCommandId {
	FindFocus = 'workbench.action.terminal.focusFind',
	FindHide = 'workbench.action.terminal.hideFind',
	FindNext = 'workbench.action.terminal.findNext',
	FindPrevious = 'workbench.action.terminal.findPrevious',
	ToggleFindRegex = 'workbench.action.terminal.toggleFindRegex',
	ToggleFindWholeWord = 'workbench.action.terminal.toggleFindWholeWord',
	ToggleFindCaseSensitive = 'workbench.action.terminal.toggleFindCaseSensitive',
	SearchWorkspace = 'workbench.action.terminal.searchWorkspace',
}

export const defaultTerminalFindCommandToSkipShell = [
	TerminalFindCommandId.FindFocus,
	TerminalFindCommandId.FindHide,
	TerminalFindCommandId.FindNext,
	TerminalFindCommandId.FindPrevious,
	TerminalFindCommandId.ToggleFindRegex,
	TerminalFindCommandId.ToggleFindWholeWord,
	TerminalFindCommandId.ToggleFindCaseSensitive,
	TerminalFindCommandId.SearchWorkspace,
];
