/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/130231

	/**
	 * Terminal exit reason kind.
	 */
	export enum TerminalExitReason {
		/**
		 * Unknown reason.
		 */
		Unknown = 0,

		/**
		 * The window closed/reloaded.
		 */
		Shutdown = 1,

		/**
		 * The shell process exited.
		 */
		Process = 2,

		/**
		 * The user closed the terminal.
		 */
		User = 3,

		/**
		 * An extension disposed the terminal.
		 */
		Extension = 4,
	}

	export interface TerminalExitStatus {
		/**
		 * The reason that triggered the exit of a terminal.
		 */
		readonly reason: TerminalExitReason;
	}

}
