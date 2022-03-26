/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/144662

declare module 'vscode' {

	/**
	 * Describes a change to a notebook cell.
	 *
	 * @see {@link NotebookDocumentChangeEvent}
	 */
	export interface NotebookDocumentContentCellChange {

		/**
		 * The affected notebook.
		 */
		readonly cell: NotebookCell;

		/**
		 * The document of the cell or `undefined` when it did not change.
		 *
		 * *Note* that you should use the {@link workspace.onDidChangeTextDocument onDidChangeTextDocument}-event
		 * for detailed change information, like what edits have been performed.
		 */
		readonly document: TextDocument | undefined;

		/**
		 * The new metadata of the cell or `undefined` when it did not change.
		 */
		readonly metadata: { [key: string]: any } | undefined;

		/**
		 * The new outputs of the cell or `undefined` when they did not change.
		 */
		readonly outputs: readonly NotebookCellOutput[] | undefined;

		/**
		 * The new execution summary of the cell or `undefined` when it did not change.
		 */
		readonly executionSummary: NotebookCellExecutionSummary | undefined;
	}

	/**
	 * Describes a structural change to a notebook document.
	 *
	 * @see {@link NotebookDocumentChangeEvent}
	 */
	export interface NotebookDocumentContentChange {

		/**
		 * The range at which cells have been either added or removed.
		 */
		readonly range: NotebookRange;

		/**
		 * Cells that have been added to the document.
		 */
		readonly addedCells: readonly NotebookCell[];

		/**
		 * Cells that have been removed from the document.
		 */
		readonly removedCells: readonly NotebookCell[];
	}

	/**
	 * An event describing a transactional {@link NotebookDocument notebook} change.
	 */
	export interface NotebookDocumentChangeEvent {

		/**
		 * The affected notebook.
		 */
		readonly notebook: NotebookDocument;

		/**
		 * The new metadata of the notebook or `undefined` when it did not change.
		 */
		readonly metadata: { [key: string]: any } | undefined;

		/**
		 * An array of content changes describing added or removed {@link NotebookCell cells}.
		 */
		readonly contentChanges: readonly NotebookDocumentContentChange[];

		/**
		 * An array of {@link NotebookDocumentContentCellChange cell changes}.
		 */
		readonly cellChanges: readonly NotebookDocumentContentCellChange[];
	}

	export namespace workspace {

		/**
		 * An event that is emitted when a {@link NotebookDocument notebook} is saved.
		 */
		export const onDidSaveNotebookDocument: Event<NotebookDocument>;

		/**
		 * An event that is emitted when a {@link NotebookDocument notebook} has changed.
		 */
		export const onDidChangeNotebookDocument: Event<NotebookDocumentChangeEvent>;
	}
}
