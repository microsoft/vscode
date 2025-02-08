/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
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
		readonly inputBoxUri: Uri;
		private constructor(uri: Uri, inputBoxUri: Uri);
	}

	export interface Tab {
		readonly input: TabInputText | TabInputTextDiff | TabInputCustom | TabInputWebview | TabInputNotebook | TabInputNotebookDiff | TabInputTerminal | TabInputInteractiveWindow | unknown;
	}
}
