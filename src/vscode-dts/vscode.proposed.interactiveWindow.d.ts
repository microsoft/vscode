/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	/**
	 * The tab represents an interactive window.
	 */
	export class TabInputInteractiveWindow {
		/**
		 * The uri of the history notebook in the interactive window.
		 */
		readonly uri: Uri;
		/**
		 * The uri of the input box in the interactive window.
		 */
		readonly inputUri: Uri;
		/**
		 * Constructs a new tab input for a notebook.
		 * @param uri The uri of the history notebook in the interactive window.
		 * @param uri The uri of the input box in the interactive window.
		 */
		constructor(uri: Uri, inputUri: Uri);
	}

	export interface Tab {
		readonly input: TabInputText | TabInputTextDiff | TabInputCustom | TabInputWebview | TabInputNotebook | TabInputNotebookDiff | TabInputTerminal | TabInputInteractiveWindow | unknown;
	}
}
