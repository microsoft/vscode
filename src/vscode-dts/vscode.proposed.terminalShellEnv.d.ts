/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// @anthonykim1 @tyriar https://github.com/microsoft/vscode/issues/227467

	// Expose the terminal's actual shell environment to extensions
	export interface TerminalShellIntegration {
		// The shell environment
		// undefined means we don't know anything about the env
		// NOTE: This is similar to command line in that it's verified with a nonce, however we just ignore when there's no nonce, so we don't need the trust flag like `TerminalShellExecutionCommandLine.isTrusted`
		readonly env: { [key: string]: string | undefined } | undefined;
	}

	export namespace window {
		// Fires when TerminalShellIntegration.env changes
		// TODO: Should this just use `onDidChangeTerminalShellIntegration` like `TerminalShellIntegration.cwd` does?
		export const onDidChangeTerminalShellIntegrationEnvironment: Event<TerminalShellIntegration>;
	}
}
