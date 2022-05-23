/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/149271

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
		 *
		 * @deprecated Use {@linkcode NotebookEditor.notebook} instead.
		 */
		readonly document: NotebookDocument;

		/**
		 * The {@link NotebookDocument notebook document} associated with this notebook editor.
		 */
		readonly notebook: NotebookDocument;

		/**
		 * The primary selection in this notebook editor.
		 */
		selection: NotebookRange;

		/**
		 * All selections in this notebook editor.
		 *
		 * The primary selection (or focused range) is `selections[0]`. When the document has no cells, the primary selection is empty `{ start: 0, end: 0 }`;
		 */
		selections: readonly NotebookRange[];

		/**
		 * The current visible ranges in the editor (vertically).
		 */
		readonly visibleRanges: readonly NotebookRange[];

		/**
		 * The column in which this editor shows.
		 */
		readonly viewColumn?: ViewColumn;

		/**
		 * Scroll as indicated by `revealType` in order to reveal the given range.
		 *
		 * @param range A range.
		 * @param revealType The scrolling strategy for revealing `range`.
		 */
		revealRange(range: NotebookRange, revealType?: NotebookEditorRevealType): void;
	}

	/**
	 * Represents an event describing the change in a {@link NotebookEditor.selections notebook editor's selections}.
	 */
	export interface NotebookEditorSelectionChangeEvent {
		/**
		 * The {@link NotebookEditor notebook editor} for which the selections have changed.
		 */
		readonly notebookEditor: NotebookEditor;

		/**
		 * The new value for the {@link NotebookEditor.selections notebook editor's selections}.
		 */
		readonly selections: readonly NotebookRange[];
	}

	/**
	 * Represents an event describing the change in a {@link NotebookEditor.visibleRanges notebook editor's visibleRanges}.
	 */
	export interface NotebookEditorVisibleRangesChangeEvent {
		/**
		 * The {@link NotebookEditor notebook editor} for which the visible ranges have changed.
		 */
		readonly notebookEditor: NotebookEditor;

		/**
		 * The new value for the {@link NotebookEditor.visibleRanges notebook editor's visibleRanges}.
		 */
		readonly visibleRanges: readonly NotebookRange[];
	}

	/**
	 * Represents options to configure the behavior of showing a {@link NotebookDocument notebook document} in an {@link NotebookEditor notebook editor}.
	 */
	export interface NotebookDocumentShowOptions {
		/**
		 * An optional view column in which the {@link NotebookEditor notebook editor} should be shown.
		 * The default is the {@link ViewColumn.Active active}, other values are adjusted to
		 * be `Min(column, columnCount + 1)`, the {@link ViewColumn.Active active}-column is
		 * not adjusted. Use {@linkcode ViewColumn.Beside} to open the
		 * editor to the side of the currently active one.
		 */
		readonly viewColumn?: ViewColumn;

		/**
		 * An optional flag that when `true` will stop the {@link NotebookEditor notebook editor} from taking focus.
		 */
		readonly preserveFocus?: boolean;

		/**
		 * An optional flag that controls if an {@link NotebookEditor notebook editor}-tab shows as preview. Preview tabs will
		 * be replaced and reused until set to stay - either explicitly or through editing. The default behaviour depends
		 * on the `workbench.editor.enablePreview`-setting.
		 */
		readonly preview?: boolean;

		/**
		 * An optional selection to apply for the document in the {@link NotebookEditor notebook editor}.
		 */
		readonly selections?: readonly NotebookRange[];
	}

	export namespace window {
		/**
		 * The currently visible {@link NotebookEditor notebook editors} or an empty array.
		 */
		export const visibleNotebookEditors: readonly NotebookEditor[];

		/**
		 * An {@link Event} which fires when the {@link window.visibleNotebookEditors visible notebook editors}
		 * has changed.
		 */
		export const onDidChangeVisibleNotebookEditors: Event<readonly NotebookEditor[]>;

		/**
		 * The currently active {@link NotebookEditor notebook editor} or `undefined`. The active editor is the one
		 * that currently has focus or, when none has focus, the one that has changed
		 * input most recently.
		 */
		export const activeNotebookEditor: NotebookEditor | undefined;

		/**
		 * An {@link Event} which fires when the {@link window.activeNotebookEditor active notebook editor}
		 * has changed. *Note* that the event also fires when the active editor changes
		 * to `undefined`.
		 */
		export const onDidChangeActiveNotebookEditor: Event<NotebookEditor | undefined>;

		/**
		 * An {@link Event} which fires when the {@link NotebookEditor.selections notebook editor selections}
		 * have changed.
		 */
		export const onDidChangeNotebookEditorSelection: Event<NotebookEditorSelectionChangeEvent>;

		/**
		 * An {@link Event} which fires when the {@link NotebookEditor.visibleRanges notebook editor visible ranges}
		 * have changed.
		 */
		export const onDidChangeNotebookEditorVisibleRanges: Event<NotebookEditorVisibleRangesChangeEvent>;

		/**
		 * Show the given {@link NotebookDocument} in a {@link NotebookEditor notebook editor}.
		 *
		 * @param document A text document to be shown.
		 * @param options {@link NotebookDocumentShowOptions Editor options} to configure the behavior of showing the {@link NotebookEditor notebook editor}.
		 *
		 * @return A promise that resolves to an {@link NotebookEditor notebook editor}.
		 */
		export function showNotebookDocument(document: NotebookDocument, options?: NotebookDocumentShowOptions): Thenable<NotebookEditor>;

		/**
		 * A short-hand for `openNotebookDocument(uri).then(document => showNotebookDocument(document, options))`.
		 *
		 * @deprecated Will not be finalized.
		 *
		 * @see {@link workspace.openNotebookDocument}
		 *
		 * @param uri The resource to open.
		 * @param options {@link NotebookDocumentShowOptions Editor options} to configure the behavior of showing the {@link NotebookEditor notebook editor}.
		 *
		 * @return A promise that resolves to an {@link NotebookEditor notebook editor}.
		 */
		export function showNotebookDocument(uri: Uri, options?: NotebookDocumentShowOptions): Thenable<NotebookEditor>;
	}
}
