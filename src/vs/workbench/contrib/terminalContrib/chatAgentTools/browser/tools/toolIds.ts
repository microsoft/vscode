/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum TerminalToolId {
	RunInTerminal = 'run_in_terminal',
	AwaitTerminal = 'await_terminal',
	GetTerminalOutput = 'get_terminal_output',
	KillTerminal = 'kill_terminal',
	TerminalSelection = 'terminal_selection',
	TerminalLastCommand = 'terminal_last_command',
	ConfirmTerminalCommand = 'vscode_get_terminal_confirmation',
	CreateAndRunTask = 'create_and_run_task',
	GetTaskOutput = 'get_task_output',
	RunTask = 'run_task',
}
