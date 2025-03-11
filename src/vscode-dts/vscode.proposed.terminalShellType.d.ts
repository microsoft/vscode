/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/230165

	// Part of TerminalState since the shellType can change multiple times and this comes with an event.
	export interface TerminalState {
		/**
		 * The current detected shell type of the terminal.
		 * Standardize on shell binaries (serve as command-line interpreters). Compiled programs that read and execute command from user.
		 * For example, bash, zsh, pwsh will be bash, zsh, pwsh accordingly.
		 */
		readonly shell: string | undefined;
	}
	// TODO: Remove this against vscode.d.ts to finalize.
}
