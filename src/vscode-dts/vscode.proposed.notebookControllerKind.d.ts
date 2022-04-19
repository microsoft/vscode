/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode-jupyter/issues/7373

	export interface NotebookController {
		/**
		 * The human-readable label used to categorise controllers.
		 */
		kind?: string;
	}
}
