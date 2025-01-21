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

		/**
		 * Whether the environment came from a trusted source and is therefore safe to used its
		 * values in a manner that could lead to execution of arbitrary code. If this value is
		 * `false`, {@link env} should either not be used for something that could lead to arbitrary
		 * code execution, or the user should be warned beforehand.
		 *
		 * This is `true` only when the environment was reported explicitly and it used a nonce for
		 * verification.
		 */
		readonly isTrusted: boolean;
	}

	// TODO: Is it fine that this shares onDidChangeTerminalShellIntegration with cwd and the shellIntegration object itself?
}
