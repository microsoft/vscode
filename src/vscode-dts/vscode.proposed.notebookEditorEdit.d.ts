/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/106744

	export interface WorkspaceEdit {
		replaceNotebookMetadata(uri: Uri, value: { [key: string]: any }): void;

		/**
		 * @deprecated Please migrate to the new `notebookWorkspaceEdit` proposed API.
		 */
		replaceNotebookCells(uri: Uri, range: NotebookRange, cells: NotebookCellData[], metadata?: WorkspaceEditEntryMetadata): void;

		/**
		 * @deprecated Please migrate to the new `notebookWorkspaceEdit` proposed API.
		 */
		replaceNotebookCellMetadata(uri: Uri, index: number, cellMetadata: { [key: string]: any }, metadata?: WorkspaceEditEntryMetadata): void;
	}

	export interface NotebookEditorEdit {
		/**
		 * @deprecated Please migrate to the new `notebookWorkspaceEdit` proposed API.
		 */
		replaceMetadata(value: { [key: string]: any }): void;

		/**
		 * @deprecated Please migrate to the new `notebookWorkspaceEdit` proposed API.
		 */
		replaceCells(start: number, end: number, cells: NotebookCellData[]): void;

		/**
		 * @deprecated Please migrate to the new `notebookWorkspaceEdit` proposed API.
		 */
		replaceCellMetadata(index: number, metadata: { [key: string]: any }): void;
	}

	export interface NotebookEditor {
		/**
		 * Perform an edit on the notebook associated with this notebook editor.
		 *
		 * The given callback-function is invoked with an {@link NotebookEditorEdit edit-builder} which must
		 * be used to make edits. Note that the edit-builder is only valid while the
		 * callback executes.
		 *
		 * @deprecated Please migrate to the new `notebookWorkspaceEdit` proposed API.
		 *
		 * @param callback A function which can create edits using an {@link NotebookEditorEdit edit-builder}.
		 * @return A promise that resolves with a value indicating if the edits could be applied.
		 */
		edit(callback: (editBuilder: NotebookEditorEdit) => void): Thenable<boolean>;
	}
}
