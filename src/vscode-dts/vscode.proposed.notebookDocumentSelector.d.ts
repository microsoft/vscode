/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/141143

	export interface DocumentFilter {

		/**
		 * The {@link NotebookDocument.notebookType type} of a notebook, like `jupyter`
		 */
		readonly notebookType?: string;
	}
}
