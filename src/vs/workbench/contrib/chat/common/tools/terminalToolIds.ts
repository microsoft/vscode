/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Terminal-related tool IDs shared between chat infrastructure and terminal
 * contrib. The canonical enum lives here so that `chat/common` can reference
 * the IDs without depending on `terminalContrib/`.
 *
 * `terminalContrib/chatAgentTools/browser/tools/toolIds.ts` re-exports this
 * enum so existing imports in that layer continue to work.
 */
export const enum TerminalToolId {
	RunInTerminal = 'run_in_terminal',
	SendToTerminal = 'send_to_terminal',
	GetTerminalOutput = 'get_terminal_output',
	KillTerminal = 'kill_terminal',
	TerminalSelection = 'terminal_selection',
	TerminalLastCommand = 'terminal_last_command',
	ConfirmTerminalCommand = 'vscode_get_terminal_confirmation',
	CreateAndRunTask = 'create_and_run_task',
	GetTaskOutput = 'get_task_output',
	RunTask = 'run_task',
}
