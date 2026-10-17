/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ExtensionContext {
		/**
		 * Whether the application was started with an explicit `--user-data-dir`.
		 */
		readonly isCustomUserDataDir: boolean;
	}
}
