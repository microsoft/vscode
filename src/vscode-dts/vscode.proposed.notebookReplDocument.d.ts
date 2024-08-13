/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface NotebookDocumentShowOptions {
		/**
		 * The notebook should be opened in a repl editor.
		 * This should only be done if the notebook is not already shown in another editor.
		 */
		readonly asRepl?: boolean;

		/**
		 * The contoller that should be initially set for the editor.
		 */
		readonly controller?: NotebookController;

		/**
		 * The label for the editor tab.
		 */
		readonly label?: string;
	}
}
