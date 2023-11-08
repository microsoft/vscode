/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/145234

	export interface ShellIntegration {
		/**
		 * The current cwd of the shell.
		 */
		cwd: Uri | string | undefined;
		/**
		 * @returns The terminal the command was executed in, command output, exit code, etc.
		 * @param command The command to execute.
		 */
		executeCommand(command: string): Thenable<TerminalExecutedCommand>;
	}

	export interface Terminal {
		/**
		 * The shell integration used by the terminal, if any, which provides insights like
		 * the current cwd and command tracking.
		 */
		shellIntegration?: ShellIntegration;
	}
}
