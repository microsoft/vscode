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
		 * @param ranges Ranges being copied in the `document`.
		 * @param dataTransfer The data transfer associated with the copy. You can store additional values on this for later use in  {@link provideDocumentPasteEdits}.
		 * @param token A cancellation token.
		 */
		prepareDocumentPaste?(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, token: CancellationToken): void | Thenable<void>;

		/**
		 * Invoked before the user pastes into a document.
		 *
		 * In this method, extensions can return a workspace edit that replaces the standard pasting behavior.
		 *
		 * @param document Document being pasted into
		 * @param ranges Currently selected ranges in the document.
		 * @param dataTransfer The data transfer associated with the paste.
		 * @param token A cancellation token.
		 *
		 * @return Optional workspace edit that applies the paste. Return undefined to use standard pasting.
		 */
		provideDocumentPasteEdits(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, token: CancellationToken): ProviderResult<DocumentPasteEdit>;
	}

	/**
	 * An operation applied on paste
	 */
	class DocumentPasteEdit {
		/**
		 * The text or snippet to insert at the pasted locations.
		 */
		insertText: string | SnippetString;

		/**
		 * An optional additional edit to apply on paste.
		 */
		additionalEdit?: WorkspaceEdit;

		/**
		 * @param insertText The text or snippet to insert at the pasted locations.
		 */
		constructor(insertText: string | SnippetString);
	}

	interface DocumentPasteProviderMetadata {
		/**
		 * Mime types that `provideDocumentPasteEdits` should be invoked for.
		 *
		 * Use the special `files` mimetype to indicate the provider should be invoked if any files are present in the `DataTransfer`.
		 */
		readonly pasteMimeTypes: readonly string[];
	}

	namespace languages {
		export function registerDocumentPasteEditProvider(selector: DocumentSelector, provider: DocumentPasteEditProvider, metadata: DocumentPasteProviderMetadata): Disposable;
	}
}
