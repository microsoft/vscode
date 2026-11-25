/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/328933

declare module 'vscode' {

	export interface WorkspaceEditMetadata {
		/**
		 * Controls whether an undo stop is created before applying this edit.
		 *
		 * When `false`, single-document text edits may be merged into the preceding
		 * open undo element for that document. Defaults to `true`.
		 */
		readonly undoStopBefore?: boolean;

		/**
		 * Controls whether an undo stop is created after applying this edit.
		 *
		 * When `false`, the undo element for a single-document text edit stays open so
		 * a subsequent edit with {@link undoStopBefore} set to `false` can merge into it.
		 * Defaults to `true`.
		 */
		readonly undoStopAfter?: boolean;
	}

	/**
	 * A single step in an atomic sequence of workspace edits applied via
	 * {@link workspace.applyEdit}.
	 */
	export interface WorkspaceEditUndoStep {
		readonly edit: WorkspaceEdit;
		readonly metadata?: WorkspaceEditMetadata;
	}

	export namespace workspace {
		/**
		 * Atomically applies a sequence of single-document text edits, each with its own
		 * undo-stop metadata. The document version is validated once before any step is
		 * applied; if the document has changed, none of the steps are applied and `false`
		 * is returned.
		 */
		export function applyEditSequence(steps: readonly WorkspaceEditUndoStep[]): Thenable<boolean>;
	}
}
