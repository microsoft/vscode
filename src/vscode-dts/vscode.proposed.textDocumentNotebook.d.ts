/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/102091

	export interface TextDocument {

		/**
		 * @deprecated
		 *
		 * This proposal won't be finalized like this, see https://github.com/microsoft/vscode/issues/102091#issuecomment-865050645.
		 * Already today you can use
		 *
		 * ```ts
		 * vscode.workspace.notebookDocuments.find(notebook => notebook.getCells().some(cell => cell.document === myTextDocument))
		 * ```
		 *
		 *
		 */
		notebook: NotebookDocument | undefined;
	}
}
