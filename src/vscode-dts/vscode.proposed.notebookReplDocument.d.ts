/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ReplDocumentCreationOptions {
		/**
		 * The resource for the notebook.
		 */
		readonly resource?: Uri;

		/**
		 * The title for the editor.
		 */
		readonly title?: string;

		/**
		 * The initial kernel for the notebook.
		 */
		readonly controller?: NotebookController;
	}

	export namespace workspace {
		/**
		 * Open a notebook document to be used in a repl editor.
		 *
		 * @see {@link workspace.openNotebookDocument}
		 * @param options Options to configure how the notebook is opened if it is not already.
		 * @returns A promise that resolves to a {@link NotebookDocument notebook}.
		 */
		export function openReplDocument(notebookType: string, options?: ReplDocumentCreationOptions): Thenable<NotebookDocument>;
	}

	export interface NotebookDocument {
		/**
		 * The notebook is intended to be used in a repl editor.
		 */
		readonly isRepl?: boolean;
	}
}
