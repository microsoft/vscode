/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/126280 @mjbvz

	export interface NotebookCellData {
		/**
		 * Mime type determines how the cell's `value` is interpreted.
		 *
		 * The mime selects which notebook renders is used to render the cell.
		 *
		 * If not set, internally the cell is treated as having a mime type of `text/plain`.
		 * Cells that set `language` to `markdown` instead are treated as `text/markdown`.
		 */
		mime?: string;
	}

	export interface NotebookCell {
		/**
		 * Mime type determines how the markup cell's `value` is interpreted.
		 *
		 * The mime selects which notebook renders is used to render the cell.
		 *
		 * If not set, internally the cell is treated as having a mime type of `text/plain`.
		 * Cells that set `language` to `markdown` instead are treated as `text/markdown`.
		 */
		mime: string | undefined;
	}
}
