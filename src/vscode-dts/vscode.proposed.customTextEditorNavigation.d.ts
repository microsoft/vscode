/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface CustomTextEditorProvider {
		/**
		 * Resolve navigation for an individual custom text editor after {@link resolveCustomTextEditor} completes.
		 *
		 * Opting in enables document-symbol Outline and heading breadcrumbs using the document's existing
		 * symbol providers. Navigation always targets this panel, including when the document is shown in
		 * multiple panels. This method is not called for custom diff editors.
		 *
		 * The returned controller is disposed when the panel or provider is disposed.
		 */
		resolveCustomTextEditorNavigation?(document: TextDocument, webviewPanel: WebviewPanel, token: CancellationToken): Thenable<CustomTextEditorNavigation> | CustomTextEditorNavigation;
	}

	/**
	 * Navigation and selection for one custom text editor panel. Positions refer to its text document.
	 */
	export interface CustomTextEditorNavigation extends Disposable {
		/** The current selection, or undefined when the editor has no text selection. */
		readonly selection: Selection | undefined;
		/** Fires when the selection changes, including when it is cleared. */
		readonly onDidChangeSelection: Event<Selection | undefined>;
		/**
		 * Reveal a range in this panel. Without an options.selection, only preview or scroll the range;
		 * do not change the selection. Respect preserveFocus and stop work when cancellation is requested.
		 */
		revealRange(range: Range, options: CustomTextEditorRevealOptions, token: CancellationToken): Thenable<void> | void;
		/**
		 * Capture the current view for temporarily previewing a symbol. The opaque value remains in
		 * the extension host and is passed back only to this controller.
		 */
		captureViewState(): Thenable<unknown> | unknown;
		/** Restore a previously captured view. Stop work when cancellation is requested. */
		restoreViewState(state: unknown, token: CancellationToken): Thenable<void> | void;
	}

	export interface CustomTextEditorRevealOptions {
		readonly selection?: Selection;
		readonly preserveFocus?: boolean;
	}
}
