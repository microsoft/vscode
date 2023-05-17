/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A contribution to a cell's status bar
	 */
	export class NotebookCellStatusBarItem2 extends NotebookCellStatusBarItem {
		/**
		 * The foreground color for this entry.
		 */
		color: string | ThemeColor | undefined;
	}

}
