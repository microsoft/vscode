/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface NotebookDocumentShowOptions {
		/**
		 * The notebook should be opened in a REPL editor,
		 * where the last cell of the notebook is an input box and the rest are read-only.
		 */
		readonly asRepl?: boolean;

		/**
		 * The label to be used for the editor tab.
		 */
		readonly label?: string;
	}
}
