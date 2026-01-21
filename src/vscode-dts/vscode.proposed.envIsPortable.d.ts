/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace env {

		/**
		 * Indicates whether the application is running in portable mode.
		 *
		 * Portable mode is enabled when the application is run from a folder that contains
		 * a `data` directory, allowing for self-contained installations.
		 *
		 * Learn more about [Portable Mode](https://code.visualstudio.com/docs/editor/portable).
		 */
		export const isAppPortable: boolean;
	}
}
