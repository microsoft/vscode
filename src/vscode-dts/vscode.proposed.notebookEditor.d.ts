/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/106744

	/**
	 * Represents a notebook editor that is attached to a {@link NotebookDocument notebook}.
	 */
	export enum NotebookEditorRevealType {
		/**
		 * The range will be revealed with as little scrolling as possible.
		 */
		Default = 0,

		/**
		 * The range will always be revealed in the center of the viewport.
		 */
		InCenter = 1,

		/**
		 * If the range is outside the viewport, it will be revealed in the center of the viewport.
		 * Otherwise, it will be revealed with as little scrolling as possible.
		 */
		InCenterIfOutsideViewport = 2,

		/**
		 * The range will always be revealed at the top of the viewport.
		 */
		AtTop = 3
	}

	/**
	 * Represents a notebook editor that is attached to a {@link NotebookDocument notebook}.
	 */
	export interface NotebookEditor {
		/**
		 * The document associated with this notebook editor.
		 */
		//todo@api rename to notebook?
		readonly document: NotebookDocument;

		/**
		 * The selections on this notebook editor.
		 *
		 * The primary selection (or focused range) is `selections[0]`. When the document has no cells, the primary selection is empty `{ start: 0, end: 0 }`;
		 */
		selections: readonly NotebookRange[];

		/**
		 * The current visible ranges in the editor (vertically).
		 */
		readonly visibleRanges: readonly NotebookRange[];

		/**
		 * Scroll as indicated by `revealType` in order to reveal the given range.
		 *
		 * @param range A range.
		 * @param revealType The scrolling strategy for revealing `range`.
		 */
		revealRange(range: NotebookRange, revealType?: NotebookEditorRevealType): void;

		/**
		 * The column in which this editor shows.
		 */
		readonly viewColumn?: ViewColumn;
	}

	export interface NotebookEditorSelectionChangeEvent {
		/**
		 * The {@link NotebookEditor notebook editor} for which the selections have changed.
		 */
		readonly notebookEditor: NotebookEditor;
		readonly selections: readonly NotebookRange[];
	}

	export interface NotebookEditorVisibleRangesChangeEvent {
		/**
		 * The {@link NotebookEditor notebook editor} for which the visible ranges have changed.
		 */
		readonly notebookEditor: NotebookEditor;
		readonly visibleRanges: readonly NotebookRange[];
	}

	export interface NotebookDocumentShowOptions {
		readonly viewColumn?: ViewColumn;
		readonly preserveFocus?: boolean;
		readonly preview?: boolean;
		readonly selections?: readonly NotebookRange[];
	}

	export namespace window {
		export const visibleNotebookEditors: readonly NotebookEditor[];
		export const onDidChangeVisibleNotebookEditors: Event<readonly NotebookEditor[]>;
		export const activeNotebookEditor: NotebookEditor | undefined;
		export const onDidChangeActiveNotebookEditor: Event<NotebookEditor | undefined>;
		export const onDidChangeNotebookEditorSelection: Event<NotebookEditorSelectionChangeEvent>;
		export const onDidChangeNotebookEditorVisibleRanges: Event<NotebookEditorVisibleRangesChangeEvent>;

		export function showNotebookDocument(uri: Uri, options?: NotebookDocumentShowOptions): Thenable<NotebookEditor>;
		export function showNotebookDocument(document: NotebookDocument, options?: NotebookDocumentShowOptions): Thenable<NotebookEditor>;
	}
}
