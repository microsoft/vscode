/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/106744

	/**
	 * A notebook edit represents edits that should be applied to the contents of a notebook.
	 */
	export class NotebookEdit {

		/**
		 * Utility to create a edit that replaces cells in a notebook.
		 *
		 * @param range The range of cells to replace
		 * @param newCells The new notebook cells.
		 */
		static replaceCells(range: NotebookRange, newCells: NotebookCellData[]): NotebookEdit;

		/**
		 * Utility to create a edit that deletes cells in a notebook.
		 *
		 * @param range The range of cells to delete.
		 */
		static deleteCells(range: NotebookRange): NotebookEdit;

		/**
		 * Utility to update a cells metadata.
		 *
		 * @param index The index of the cell to update.
		 * @param newMetadata The new metadata for the cell.
		 */
		static updateCellMetadata(index: number, newMetadata: { [key: string]: any }): NotebookEdit;

		/**
		 * Range of the cells being edited
		 */
		readonly range: NotebookRange;

		/**
		 * New cells being inserted. May be empty.
		 */
		readonly newCells: NotebookCellData[];

		/**
		 * Optional new metadata for the cells.
		 */
		readonly newCellMetadata?: { [key: string]: any };

		constructor(range: NotebookRange, newCells: NotebookCellData[], newCellMetadata?: { [key: string]: any });
	}

	export interface WorkspaceEdit {
		/**
		 * Replaces the metadata for a notebook document.
		 */
		replaceNotebookMetadata(uri: Uri, value: { [key: string]: any }): void;

		/**
		 * Set (and replace) edits for a resource.
		 *
		 * @param uri A resource identifier.
		 * @param edits An array of text or notebook edits.
		 */
		set(uri: Uri, edits: TextEdit[] | NotebookEdit[]): void;
	}
}
