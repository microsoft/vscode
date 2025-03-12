/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/230165

	export interface TerminalState {

		/**
		 * The shell type of the terminal that may change throughout terminal's change of state.
		 *
		 * Use the {@link window.onDidChangeTerminalState onDidChangeTerminalState} event to
		 * get notified when the terminal shell changes.
		 * Note that we attempt to provide name of shell from its binary.
		 * For example, bash, zsh, pwsh will be bash, zsh, pwsh accordingly.
		 */
		readonly shell: string | undefined;
	}

}
