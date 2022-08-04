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
		 * Utility to create an edit that replaces cells in a notebook.
		 *
		 * @param index The index to insert cells at.
		 * @param newCells The new notebook cells.
		 */
		static insertCells(index: number, newCells: NotebookCellData[]): NotebookEdit;

		/**
		 * Utility to create an edit that deletes cells in a notebook.
		 *
		 * @param range The range of cells to delete.
		 */
		static deleteCells(range: NotebookRange): NotebookEdit;

		/**
		 * Utility to create an edit that update a cell's metadata.
		 *
		 * @param index The index of the cell to update.
		 * @param newCellMetadata The new metadata for the cell.
		 */
		static updateCellMetadata(index: number, newCellMetadata: { [key: string]: any }): NotebookEdit;

		/**
		 * Utility to create an edit that updates the notebook's metadata.
		 *
		 * @param newNotebookMetadata The new metadata for the notebook.
		 */
		static updateNotebookMetadata(newNotebookMetadata: { [key: string]: any }): NotebookEdit;

		/**
		 * Range of the cells being edited. May be empty.
		 */
		range: NotebookRange;

		/**
		 * New cells being inserted. May be empty.
		 */
		newCells: NotebookCellData[];

		/**
		 * Optional new metadata for the cells.
		 */
		newCellMetadata?: { [key: string]: any };

		/**
		 * Optional new metadata for the notebook.
		 */
		newNotebookMetadata?: { [key: string]: any };

		constructor(range: NotebookRange, newCells: NotebookCellData[]);
	}

	export interface WorkspaceEdit {
		/**
		 * Set (and replace) edits for a resource.
		 *
		 * @param uri A resource identifier.
		 * @param edits An array of text or notebook edits.
		 */
		set(uri: Uri, edits: TextEdit[] | NotebookEdit[]): void;
	}
}
