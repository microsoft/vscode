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
		 * Pasting was requested by the user with the `paste as` command.
		 */
		PasteAs = 1,
	}

	/**
	 * Additional information about the paste operation.
	 */

	export interface DocumentPasteEditContext {
		/**
		 * Requested kind of paste edits to return.
		 */
		readonly only: DocumentPasteEditKind | undefined;

		/**
		 * The reason why paste edits were requested.
		 */
		readonly triggerKind: DocumentPasteTriggerKind;
	}

	/**
	 * Provider invoked when the user copies or pastes in a {@linkcode TextDocument}.
	 */
	interface DocumentPasteEditProvider<T extends DocumentPasteEdit = DocumentPasteEdit> {

		/**
		 * Optional method invoked after the user copies text in a file.
		 *
		 * This allows the provider to attach copy metadata to the {@link DataTransfer}
		 * which is then passed back to providers in {@linkcode provideDocumentPasteEdits}.
		 *
		 * Note that currently any changes to the {@linkcode DataTransfer} are isolated to the current editor session.
		 * This means that added metadata cannot be seen by other applications.
		 *
		 * @param document Document where the copy took place.
		 * @param ranges Ranges being copied in {@linkcode document}.
		 * @param dataTransfer The data transfer associated with the copy. You can store additional values on this for later use in  {@linkcode provideDocumentPasteEdits}.
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
		 * @param ranges Range in the {@linkcode document} to paste into.
		 * @param dataTransfer The {@link DataTransfer data transfer} associated with the paste. This object is only valid for the duration of the paste operation.
		 * @param context Additional context for the paste.
		 * @param token A cancellation token.
		 *
		 * @return Set of potential {@link DocumentPasteEdit edits} that apply the paste. Return `undefined` to use standard pasting.
		 */
		provideDocumentPasteEdits?(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, context: DocumentPasteEditContext, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Optional method which fills in the {@linkcode DocumentPasteEdit.additionalEdit} before the edit is applied.
		 *
		 * This is called once per edit and should be used if generating the complete edit may take a long time.
		 * Resolve can only be used to change {@link DocumentPasteEdit.additionalEdit}.
		 *
		 * @param pasteEdit The {@linkcode DocumentPasteEdit} to resolve.
		 * @param token A cancellation token.
		 *
		 * @returns The resolved paste edit or a thenable that resolves to such. It is OK to return the given
		 * `pasteEdit`. If no result is returned, the given `pasteEdit` is used.
		 */
		resolveDocumentPasteEdit?(pasteEdit: T, token: CancellationToken): ProviderResult<T>;
	}

	/**
	 * An edit applied on paste.
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
		 * Controls the ordering of paste edits provided by multiple providers.
		 *
		 * If this edit yields to another, it will be shown lower in the list of paste edit.
		 */
		yieldTo?: readonly DocumentPasteEditKind[];

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

		// TODO: Add `Text` any others?

		private constructor(value: string);

		readonly value: string;

		append(...parts: string[]): CodeActionKind;
		intersects(other: CodeActionKind): boolean;
		contains(other: CodeActionKind): boolean;
	}

	interface DocumentPasteProviderMetadata {
		/**
		 * List of {@link DocumentPasteEditKind kinds} that the provider may return in {@linkcode DocumentPasteEditProvider.provideDocumentPasteEdits provideDocumentPasteEdits}.
		 *
		 * The provider will only be invoked when one of these kinds is being requested. For normal pasting, all providers will be invoked.
		 */
		readonly providedPasteEditKinds: readonly DocumentPasteEditKind[];

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
		/**
		 * Registers a new {@linkcode DocumentPasteEditProvider}.
		 *
		 * @param selector A selector that defines the documents this provider applies to.
		 * @param provider A paste editor provider.
		 * @param metadata Additional metadata about the provider.
		 *
		 * @returns A {@link Disposable} that unregisters this provider when disposed of.
		 */
		export function registerDocumentPasteEditProvider(selector: DocumentSelector, provider: DocumentPasteEditProvider, metadata: DocumentPasteProviderMetadata): Disposable;
	}
}
