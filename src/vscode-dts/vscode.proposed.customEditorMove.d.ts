/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/86146

	// TODO: Also for custom editor

	export interface CustomTextEditorProvider {

		/**
		 * Handle when the underlying resource for a custom editor is renamed.
		 *
		 * This allows the webview for the editor be preserved throughout the rename. If this method is not implemented,
		 * the editor will destroy the previous custom editor and create a replacement one.
		 *
		 * @param newDocument New text document to use for the custom editor.
		 * @param existingWebviewPanel Webview panel for the custom editor.
		 * @param token A cancellation token that indicates the result is no longer needed.
		 *
		 * @return Thenable indicating that the webview editor has been moved.
		 */
		// eslint-disable-next-line local/vscode-dts-provider-naming
		moveCustomTextEditor?(newDocument: TextDocument, existingWebviewPanel: WebviewPanel, token: CancellationToken): Thenable<void>;
	}
}
