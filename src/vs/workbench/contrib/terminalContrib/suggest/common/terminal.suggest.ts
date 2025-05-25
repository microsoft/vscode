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
	AcceptSelectedSuggestionEnter = 'workbench.action.terminal.acceptSelectedSuggestionEnter',
	HideSuggestWidget = 'workbench.action.terminal.hideSuggestWidget',
	HideSuggestWidgetAndNavigateHistory = 'workbench.action.terminal.hideSuggestWidgetAndNavigateHistory',
	RequestCompletions = 'workbench.action.terminal.requestCompletions',
	ResetWidgetSize = 'workbench.action.terminal.resetSuggestWidgetSize',
	ToggleDetails = 'workbench.action.terminal.suggestToggleDetails',
	ToggleDetailsFocus = 'workbench.action.terminal.suggestToggleDetailsFocus',
	ConfigureSettings = 'workbench.action.terminal.configureSuggestSettings',
}

export const defaultTerminalSuggestCommandsToSkipShell = [
	TerminalSuggestCommandId.SelectPrevSuggestion,
	TerminalSuggestCommandId.SelectPrevPageSuggestion,
	TerminalSuggestCommandId.SelectNextSuggestion,
	TerminalSuggestCommandId.SelectNextPageSuggestion,
	TerminalSuggestCommandId.AcceptSelectedSuggestion,
	TerminalSuggestCommandId.AcceptSelectedSuggestionEnter,
	TerminalSuggestCommandId.HideSuggestWidget,
	TerminalSuggestCommandId.RequestCompletions,
	TerminalSuggestCommandId.ToggleDetails,
	TerminalSuggestCommandId.ToggleDetailsFocus,
];
