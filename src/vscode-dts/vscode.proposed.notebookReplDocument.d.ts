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
	}

	export namespace window {
		export function showNotebookDocument(document: NotebookDocument, options?: NotebookDocumentShowOptions): Thenable<NotebookEditor>;

	}
}
