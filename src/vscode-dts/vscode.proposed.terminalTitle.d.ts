/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/xyz

	export interface TerminalOptions {
		/**
		 * A title template string for the terminal tab. This supports the same variables as the
		 * `terminal.integrated.tabs.title` setting, such as `${sequence}`, `${process}`, `${cwd}`,
		 * `${cwdFolder}`, `${workspaceFolderName}`, etc. When set, this overrides the default title
		 * behavior (which uses the `name` as a static title) and instead uses the template for
		 * dynamic title resolution.
		 *
		 * For example, setting `titleTemplate` to `"${sequence}"` allows the terminal's escape sequence
		 * title to be used as the tab title.
		 */
		titleTemplate?: string;
	}

	export interface ExtensionTerminalOptions {
		/**
		 * A title template string for the terminal tab. This supports the same variables as the
		 * `terminal.integrated.tabs.title` setting, such as `${sequence}`, `${process}`, `${cwd}`,
		 * `${cwdFolder}`, `${workspaceFolderName}`, etc. When set, this overrides the default title
		 * behavior (which uses the `name` as a static title) and instead uses the template for
		 * dynamic title resolution.
		 *
		 * For example, setting `titleTemplate` to `"${sequence}"` allows the terminal's escape sequence
		 * title to be used as the tab title.
		 */
		titleTemplate?: string;
	}
}
