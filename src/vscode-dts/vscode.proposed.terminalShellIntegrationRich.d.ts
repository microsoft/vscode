/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// @tyriar https://github.com/microsoft/vscode/issues/227467

	export interface TerminalShellIntegration {
		/**
		 * Whether this shell supports rich command detection. This means that the shell has
		 * declared that it will report the required shell integation sequences in the exact order
		 * they're expected, so {@link TerminalShellExecutionCommandLine.value} should always be set
		 * and {@link TerminalShellExecutionCommandLine.confidence} should always be
		 * {@link TerminalShellExecutionCommandLineConfidence.High} at the time
		 * {@link onDidStartTerminalShellExecution} fires.
		 */
		readonly hasRichCommandDetection: boolean;
	}
}
