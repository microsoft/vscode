/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/149271

	// ❗️ Important: The main NotebookEditor api has been finalized.
	// This file only contains deprecated properties/functions from the proposal.

	export interface NotebookEditor {
		/**
		 * The document associated with this notebook editor.
		 *
		 * @deprecated Use {@linkcode NotebookEditor.notebook} instead.
		 */
		readonly document: NotebookDocument;
	}

	export namespace window {
		/**
		 * A short-hand for `openNotebookDocument(uri).then(document => showNotebookDocument(document, options))`.
		 *
		 * @deprecated Will not be finalized.
		 *
		 * @see {@link workspace.openNotebookDocument}
		 *
		 * @param uri The resource to open.
		 * @param options {@link NotebookDocumentShowOptions Editor options} to configure the behavior of showing the {@link NotebookEditor notebook editor}.
		 *
		 * @return A promise that resolves to an {@link NotebookEditor notebook editor}.
		 */
		export function showNotebookDocument(uri: Uri, options?: NotebookDocumentShowOptions): Thenable<NotebookEditor>;
	}
}
