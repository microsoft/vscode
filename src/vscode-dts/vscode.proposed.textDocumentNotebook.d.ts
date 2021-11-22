/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/102091

	export interface TextDocument {

		/**
		 * The {@link NotebookDocument notebook} that contains this document as a notebook cell or `undefined` when
		 * the document is not contained by a notebook (this should be the more frequent case).
		 */
		notebook: NotebookDocument | undefined;
	}
}
