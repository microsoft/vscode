/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/30066/

	/**
	 * Provider invoked when the user copies and pastes code.
	 */
	interface DocumentPasteEditProvider {

		/**
		 * Optional method invoked after the user copies text in a file.
		 *
		 * During {@link prepareDocumentPaste}, an extension can compute metadata that is attached to
		 * a {@link DataTransfer} and is passed back to the provider in {@link provideDocumentPasteEdits}.
		 *
		 * @param document Document where the copy took place.
		 * @param range Range being copied in the `document`.
		 * @param dataTransfer The data transfer associated with the copy. You can store additional values on this for later use in  {@link provideDocumentPasteEdits}.
		 * @param token A cancellation token.
		 */
		prepareDocumentPaste?(document: TextDocument, range: Range, dataTransfer: DataTransfer, token: CancellationToken): void | Thenable<void>;

		/**
		 * Invoked before the user pastes into a document.
		 *
		 * In this method, extensions can return a workspace edit that replaces the standard pasting behavior.
		 *
		 * @param document Document being pasted into
		 * @param range Currently selected range in the document.
		 * @param dataTransfer The data transfer associated with the paste.
		 * @param token A cancellation token.
		 *
		 * @return Optional workspace edit that applies the paste. Return undefined to use standard pasting.
		 */
		provideDocumentPasteEdits(document: TextDocument, range: Range, dataTransfer: DataTransfer, token: CancellationToken): ProviderResult<WorkspaceEdit | SnippetTextEdit>;
	}

	namespace languages {
		export function registerDocumentPasteEditProvider(selector: DocumentSelector, provider: DocumentPasteEditProvider): Disposable;
	}
}
