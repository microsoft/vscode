/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// @adrianstephens https://github.com/microsoft/vscode/issues/77138

	export namespace debug {
		export const configuration: DebugConfiguration | undefined;
		/**
		 * Set the debug configuration for a workspace. This will change the selected launch configuration
		 */
		export function setConfiguration(folder: WorkspaceFolder | undefined, nameOrConfiguration: string | DebugConfiguration): Thenable<void>;

		/**
		 * An event that fires when the debug configuration changes for a workspace.
		 * The event provides the workspace folder (or undefined for single-folder or no-folder), and the new configuration.
		 */
		export const onDidChangeConfiguration: Event<{ workspace: WorkspaceFolder | undefined; configuration: DebugConfiguration | undefined }>;
	}
}
