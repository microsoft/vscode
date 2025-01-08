/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// @anthonykim1 @tyriar https://github.com/microsoft/vscode/issues/227467

	export interface TerminalShellIntegration {
		/**
		 * The environment of the shell process. This is undefined if the shell integration script
		 * does not send the environment.
		 */
		readonly env: { [key: string]: string | undefined } | undefined;
	}

	// TODO: Is it fine that this shares onDidChangeTerminalShellIntegration with cwd and the shellIntegration object itself?
}
