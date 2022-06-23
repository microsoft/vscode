/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/152806

	/**
	 * Environment variables that can be applied to a new process.
	 */
	export interface ProcessEnvironment {
		[key: string]: string | undefined;
	}

	namespace window {
		/**
		 * Reloads the current window.
		 *
		 * If `env` is defined in the options, the specified environment variables
		 * will be applied to new processes when the window is reloaded.
		 */
		export function reload(options?: { env?: ProcessEnvironment }): void;
	}
}
