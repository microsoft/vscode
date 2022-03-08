/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/141143

	export interface DocumentFilter {

		/**
		 * The {@link NotebookDocument.notebookType type} of a notebook, like `jupyter`. This allows
		 * to narrow down on the type of a notebook that a {@link NotebookCell.document cell document} belongs to.
		 *
		 * *Note* that combining `notebookType` and {@link DocumentFilter.scheme `scheme`} with a value
		 * different than `"vscode-notebook-cell"` or `undefined` is invalid and will not match
		 * any document.
		 */
		readonly notebookType?: string;
	}
}
