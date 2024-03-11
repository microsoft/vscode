/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/205058

	export interface TerminalState {
		/**
		 * Whether the {@link Terminal} has had [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration)
		 * activated. This typically happens shortly after the terminal has been created.
		 */
		readonly isShellIntegrationActivated: boolean;
	}
}
