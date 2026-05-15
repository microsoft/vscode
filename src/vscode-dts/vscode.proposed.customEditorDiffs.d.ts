/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface CustomEditorDiffDocuments<T> {
		readonly original: T;
		readonly modified: T;
	}

	export interface CustomEditorDiffWebviewPanels {
		readonly original: WebviewPanel;
		readonly modified: WebviewPanel;
	}

	export interface CustomReadonlyEditorProvider<T extends CustomDocument = CustomDocument> {

		/**
		 * Resolve a custom editor the shows the diff between two documents using a single webview.
		 *
		 * @param documents Original and modified documents for the diff editor.
		 * @param webviewPanel The webview panel used to display the editor UI for this diff.
		 * @param token A cancellation token that indicates the result is no longer needed.
		 *
		 * @returns Thenable indicating that the custom diff editor has been resolved.
		 */
		resolveCustomEditorInlineDiff?(documents: CustomEditorDiffDocuments<T>, webviewPanel: WebviewPanel, token: CancellationToken): Thenable<void> | void;

		/**
		 * Resolve a side-by-side custom editor diff between two custom documents.
		 *
		 * @param documents Original and modified documents for the diff editor.
		 * @param webviewPanels The webview panels used to display the original and modified sides of the diff.
		 * @param token A cancellation token that indicates the result is no longer needed.
		 *
		 * @returns Thenable indicating that the custom diff editor has been resolved.
		 */
		resolveCustomEditorSideBySideDiff?(documents: CustomEditorDiffDocuments<T>, webviewPanels: CustomEditorDiffWebviewPanels, token: CancellationToken): Thenable<void> | void;
	}

	export interface CustomTextEditorProvider {

		/**
		 * Resolve a custom editor for a diff between two text resources using a single webview.
		 *
		 * @param documents Original and modified documents for the diff editor.
		 * @param webviewPanel The webview panel used to display the editor UI for this diff.
		 * @param token A cancellation token that indicates the result is no longer needed.
		 *
		 * @returns Thenable indicating that the custom diff editor has been resolved.
		 */
		resolveCustomTextEditorInlineDiff?(documents: CustomEditorDiffDocuments<TextDocument>, webviewPanel: WebviewPanel, token: CancellationToken): Thenable<void> | void;

		/**
		 * Resolve a side-by-side custom editor diff between two text resources.
		 *
		 * @param documents Original and modified documents for the diff editor.
		 * @param webviewPanels The webview panels used to display the original and modified sides of the diff.
		 * @param token A cancellation token that indicates the result is no longer needed.
		 *
		 * @returns Thenable indicating that the custom diff editor has been resolved.
		 */
		resolveCustomTextEditorSideBySideDiff?(documents: CustomEditorDiffDocuments<TextDocument>, webviewPanels: CustomEditorDiffWebviewPanels, token: CancellationToken): Thenable<void> | void;
	}
}
