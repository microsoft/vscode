/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface NotebookDocumentCreationOptions {
		/**
		 * The notebook type that should be used.
		 */
		readonly notebookType: string;

		/**
		 * The initial contents of the notebook.
		 */
		readonly content?: NotebookData;

		/**
		 * The resource for the notebook.
		 */
		readonly untitledResource?: Uri;

		/**
		 * The notebook should be opened in a repl editor.
		 * This should only be done if the notebook is not already shown in another editor.
		 */
		readonly repl?: boolean;
	}

	export namespace workspace {
		/**
		 * Open an untitled notebook. The editor will prompt the user for a file
		 * path when the document is to be saved.
		 *
		 * @see {@link workspace.openNotebookDocument}
		 * @param options Options to configure how the notebook is opened if it is not already.
		 * @returns A promise that resolves to a {@link NotebookDocument notebook}.
		 */
		export function openNotebookDocument(options: NotebookDocumentCreationOptions): Thenable<NotebookDocument>;
	}

	export interface NotebookDocument {
		/**
		 * The notebook is intended to be used in a repl editor.
		 */
		readonly isRepl?: boolean;
	}
}
