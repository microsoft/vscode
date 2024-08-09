/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface NotebookDocument {
		/**
		 * If the notebook document is loaded in a REPL view.
		 */
		readonly isRepl: boolean;
	}

	export interface OpenNotebookOptions {
		/**
		 * The type of the notebook to open.
		 */
		readonly notebookType: string;
		/**
		 * The initial contents of the notebook.
		 */
		readonly content?: NotebookData;
		/**
		 * Whether the notebook is opened in a REPL view.
		 */
		readonly repl?: boolean;
	}

	export namespace workspace {
		/**
		 * Open an untitled notebook. The editor will prompt the user for a file
		 * path when the document is to be saved.
		 *
		 * @see {@link workspace.openNotebookDocument}
		 * @param options Options to control how the document will be opened.
		 * @returns A promise that resolves to a {@link NotebookDocument notebook}.
		 */
		export function openNotebookDocument(options: OpenNotebookOptions): Thenable<NotebookDocument>;
	}
}
