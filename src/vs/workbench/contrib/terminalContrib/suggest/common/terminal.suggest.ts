/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum TerminalSuggestCommandId {
	SelectPrevSuggestion = 'workbench.action.terminal.selectPrevSuggestion',
	SelectPrevPageSuggestion = 'workbench.action.terminal.selectPrevPageSuggestion',
	SelectNextSuggestion = 'workbench.action.terminal.selectNextSuggestion',
	SelectNextPageSuggestion = 'workbench.action.terminal.selectNextPageSuggestion',
	AcceptSelectedSuggestion = 'workbench.action.terminal.acceptSelectedSuggestion',
	HideSuggestWidget = 'workbench.action.terminal.hideSuggestWidget',
}

export const defaultTerminalSuggestCommandsToSkipShell = [
	TerminalSuggestCommandId.SelectPrevSuggestion,
	TerminalSuggestCommandId.SelectPrevPageSuggestion,
	TerminalSuggestCommandId.SelectNextSuggestion,
	TerminalSuggestCommandId.SelectNextPageSuggestion,
	TerminalSuggestCommandId.AcceptSelectedSuggestion,
	TerminalSuggestCommandId.HideSuggestWidget,
];
