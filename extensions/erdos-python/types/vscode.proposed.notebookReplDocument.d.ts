/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface NotebookDocumentShowOptions {
		/**
		 * The notebook should be opened in a REPL editor,
		 * where the last cell of the notebook is an input box and the other cells are the read-only history.
		 * When the value is a string, it will be used as the label for the editor tab.
		 */
		readonly asRepl?: boolean | string | {
			/**
			* The label to be used for the editor tab.
			*/
			readonly label: string;
		};
	}

	export interface NotebookEditor {
		/**
		 * Information about the REPL editor if the notebook was opened as a repl.
		 */
		replOptions?: {
			/**
			 * The index where new cells should be appended.
			 */
			appendIndex: number;
		};
	}
}
