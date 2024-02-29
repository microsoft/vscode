/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/30066/

	/**
	 * The reason why paste edits were requested.
	 */
	export enum DocumentPasteTriggerKind {
		/**
		 * Pasting was requested as part of a normal paste operation.
		 */
		Automatic = 0,

		/**
		 * Pasting was requested by the user with the 'paste as' command.
		 */
		PasteAs = 1,
	}

	/**
	 * Additional information about the paste operation.
	 */

	export interface DocumentPasteEditContext {
		readonly only: DocumentPasteEditKind | undefined;

		/**
		 * The reason why paste edits were requested.
		 */
		readonly triggerKind: DocumentPasteTriggerKind;
	}

	/**
	 * Provider invoked when the user copies and pastes code.
	 */
	interface DocumentPasteEditProvider<T extends DocumentPasteEdit = DocumentPasteEdit> {

		/**
		 * Optional method invoked after the user copies text in a file.
		 *
		 * During {@link prepareDocumentPaste}, an extension can compute metadata that is attached to
		 * a {@link DataTransfer} and is passed back to the provider in {@link provideDocumentPasteEdits}.
		 *
		 * @param document Document where the copy took place.
		 * @param ranges Ranges being copied in `document`.
		 * @param dataTransfer The data transfer associated with the copy. You can store additional values on this for later use in  {@link provideDocumentPasteEdits}.
		 * This object is only valid for the duration of this method.
		 * @param token A cancellation token.
		 *
		 * @return Optional thenable that resolves when all changes to the `dataTransfer` are complete.
		 */
		prepareDocumentPaste?(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, token: CancellationToken): void | Thenable<void>;

		/**
		 * Invoked before the user pastes into a document.
		 *
		 * Returned edits can replace the standard pasting behavior.
		 *
		 * @param document Document being pasted into
		 * @param ranges Currently selected ranges in the document.
		 * @param dataTransfer The data transfer associated with the paste.
		 * @param context Additional context for the paste.
		 * @param token A cancellation token.
		 *
		 * @return Set of potential {@link DocumentPasteEdit edits} that apply the paste. Return `undefined` to use standard pasting.
		 */
		provideDocumentPasteEdits?(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, context: DocumentPasteEditContext, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Optional method which fills in the {@linkcode DocumentPasteEdit.additionalEdit} before the edit is applied.
		 *
		 * This should be used if generating the `additionalEdit` may take a long time.
		 *
		 * @param pasteEdit The {@linkcode DocumentPasteEdit} to resolve.
		 * @param token A cancellation token.
		 *
		 * @returns The resolved paste edit or a thenable that resolves to such. It is OK to return the given
		 * `item`. When no result is returned, the given `item` will be used.
		 */
		resolveDocumentPasteEdit?(pasteEdit: T, token: CancellationToken): ProviderResult<T>;
	}

	/**
	 * An edit applied on paste
	 */
	class DocumentPasteEdit {

		/**
		 * Human readable label that describes the edit.
		 */
		title: string;

		/**
		 * {@link DocumentPasteEditKind Kind} of the edit.
		 *
		 * Used to identify specific types of edits.
		 */
		kind: DocumentPasteEditKind;

		/**
		 * The text or snippet to insert at the pasted locations.
		 */
		insertText: string | SnippetString;

		/**
		 * An optional additional edit to apply on paste.
		 */
		additionalEdit?: WorkspaceEdit;

		/**
		 * List of mime types that this edit handles.
		 */
		handledMimeTypes?: readonly string[];

		/**
		 * Controls the ordering of paste edits provided by multiple providers.
		 *
		 * If this edit yields to another, it will be shown lower in the list of paste edit.
		 */
		yieldTo?: ReadonlyArray<{ readonly kind: DocumentPasteEditKind } | { readonly mimeType: string }>;

		/**
		 * Create a new paste edit.
		 *
		 * @param insertText The text or snippet to insert at the pasted locations.
		 * @param title Human readable label that describes the edit.
		 * @param kind {@link DocumentPasteEditKind Kind} of the edit.
		 */
		constructor(insertText: string | SnippetString, title: string, kind: DocumentPasteEditKind);
	}


	/**
	 * TODO: Share with code action kind?
	 */
	class DocumentPasteEditKind {
		static readonly Empty: DocumentPasteEditKind;
		private constructor(value: string);

		readonly value: string;

		append(...parts: string[]): CodeActionKind;
		intersects(other: CodeActionKind): boolean;
		contains(other: CodeActionKind): boolean;
	}

	interface DocumentPasteProviderMetadata {
		// TODO
		readonly providedPasteEditKinds?: readonly DocumentPasteEditKind[];

		/**
		 * Mime types that {@linkcode DocumentPasteEditProvider.prepareDocumentPaste prepareDocumentPaste} may add on copy.
		 */
		readonly copyMimeTypes?: readonly string[];

		/**
		 * Mime types that {@linkcode DocumentPasteEditProvider.provideDocumentPasteEdits provideDocumentPasteEdits} should be invoked for.
		 *
		 * This can either be an exact mime type such as `image/png`, or a wildcard pattern such as `image/*`.
		 *
		 * Use `text/uri-list` for resources dropped from the explorer or other tree views in the workbench.
		 *
		 * Use `files` to indicate that the provider should be invoked if any {@link DataTransferFile files} are present in the {@linkcode DataTransfer}.
		 * Note that {@linkcode DataTransferFile} entries are only created when dropping content from outside the editor, such as
		 * from the operating system.
		 */
		readonly pasteMimeTypes?: readonly string[];
	}

	namespace languages {
		export function registerDocumentPasteEditProvider(selector: DocumentSelector, provider: DocumentPasteEditProvider, metadata: DocumentPasteProviderMetadata): Disposable;
	}
}
