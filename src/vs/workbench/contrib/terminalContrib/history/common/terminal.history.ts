/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum TerminalHistoryCommandId {
	ClearPreviousSessionHistory = 'workbench.action.terminal.clearPreviousSessionHistory',
	GoToRecentDirectory = 'workbench.action.terminal.goToRecentDirectory',
	RunRecentCommand = 'workbench.action.terminal.runRecentCommand',
}

export const defaultTerminalHistoryCommandsToSkipShell = [
	TerminalHistoryCommandId.GoToRecentDirectory,
	TerminalHistoryCommandId.RunRecentCommand
];
