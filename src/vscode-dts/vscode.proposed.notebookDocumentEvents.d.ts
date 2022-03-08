/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface NotebookDocumentContentCellChange {

		/**
		 * The affected notebook.
		 */
		readonly cell: NotebookCell;

		readonly metadata: { [key: string]: any } | undefined;
		readonly outputs: readonly NotebookCellOutput[] | undefined;
		readonly executionSummary: NotebookCellExecutionSummary | undefined;
	}

	export interface NotebookDocumentContentChange {
		readonly range: NotebookRange;
		readonly addedCells: NotebookCell[];
		readonly removedCells: NotebookCell[];
	}

	export interface NotebookDocumentChangeEvent {

		/**
		 * The affected notebook.
		 */
		readonly notebook: NotebookDocument;

		/**
		 * The notebook metadata when it has changed or `undefined` when it has not changed.
		 */
		readonly metadata: { [key: string]: any } | undefined;

		readonly contentChanges: readonly NotebookDocumentContentChange[];

		readonly cellChanges: NotebookDocumentContentCellChange[];
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
