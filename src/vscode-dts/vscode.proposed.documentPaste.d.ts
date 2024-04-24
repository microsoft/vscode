/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/30066/

	/**
	 * Identifies a {@linkcode DocumentDropEdit} or {@linkcode DocumentPasteEdit}
	 */
	class DocumentDropOrPasteEditKind {
		static readonly Empty: DocumentDropOrPasteEditKind;

		private constructor(value: string);

		/**
		 * The raw string value of the kind.
		 */
		readonly value: string;

		/**
		 * Create a new kind by appending additional scopes to the current kind.
		 *
		 * Does not modify the current kind.
		 */
		append(...parts: string[]): DocumentDropOrPasteEditKind;

		/**
		 * Checks if this kind intersects `other`.
		 *
		 * The kind `"text.plain"` for example intersects `text`, `"text.plain"` and `"text.plain.list"`,
		 * but not `"unicorn"`, or `"textUnicorn.plain"`.
		 *
		 * @param other Kind to check.
		 */
		intersects(other: DocumentDropOrPasteEditKind): boolean;

		/**
		 * Checks if `other` is a sub-kind of this `DocumentDropOrPasteEditKind`.
		 *
		 * The kind `"text.plain"` for example contains `"text.plain"` and `"text.plain.list"`,
		 * but not `"text"` or `"unicorn.text.plain"`.
		 *
		 * @param other Kind to check.
		 */
		contains(other: DocumentDropOrPasteEditKind): boolean;
	}

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
		readonly only: DocumentDropOrPasteEditKind | undefined;

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
		 * Optional method invoked after the user copies from a {@link TextEditor text editor}.
		 *
		 * This allows the provider to attach metadata about the copied text to the {@link DataTransfer}. This data
		 * transfer is then passed back to providers in {@linkcode provideDocumentPasteEdits}.
		 *
		 * Note that currently any changes to the {@linkcode DataTransfer} are isolated to the current editor window.
		 * This means that any added metadata cannot be seen by other editor windows or by other applications.
		 *
		 * @param document Text document where the copy took place.
		 * @param ranges Ranges being copied in {@linkcode document}.
		 * @param dataTransfer The data transfer associated with the copy. You can store additional values on this for
		 * later use in  {@linkcode provideDocumentPasteEdits}. This object is only valid for the duration of this method.
		 * @param token A cancellation token.
		 *
		 * @return Optional thenable that resolves when all changes to the `dataTransfer` are complete.
		 */
		prepareDocumentPaste?(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, token: CancellationToken): void | Thenable<void>;

		/**
		 * Invoked before the user pastes into a {@link TextEditor text editor}.
		 *
		 * Returned edits can replace the standard pasting behavior.
		 *
		 * @param document Document being pasted into
		 * @param ranges Range in the {@linkcode document} to paste into.
		 * @param dataTransfer The {@link DataTransfer data transfer} associated with the paste. This object is only
		 * valid for the duration of the paste operation.
		 * @param context Additional context for the paste.
		 * @param token A cancellation token.
		 *
		 * @return Set of potential {@link DocumentPasteEdit edits} that can apply the paste. Only a single returned
		 * {@linkcode DocumentPasteEdit} is applied at a time. If multiple edits are returned from all providers, then
		 * the first is automatically applied and a widget is shown that lets the user switch to the other edits.
		 */
		provideDocumentPasteEdits?(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, context: DocumentPasteEditContext, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Optional method which fills in the {@linkcode DocumentPasteEdit.additionalEdit} before the edit is applied.
		 *
		 * This is called once per edit and should be used if generating the complete edit may take a long time.
		 * Resolve can only be used to change {@linkcode DocumentPasteEdit.additionalEdit}.
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
	 * An edit the applies a paste operation.
	 */
	class DocumentPasteEdit {

		/**
		 * Human readable label that describes the edit.
		 */
		title: string;

		/**
		 * {@link DocumentDropOrPasteEditKind Kind} of the edit.
		 */
		kind: DocumentDropOrPasteEditKind;

		/**
		 * The text or snippet to insert at the pasted locations.
		 *
		 * If your edit requires more advanced insertion logic, set this to an empty string and provide an {@link DocumentPasteEdit.additionalEdit additional edit} instead.
		 */
		insertText: string | SnippetString;

		/**
		 * An optional additional edit to apply on paste.
		 */
		additionalEdit?: WorkspaceEdit;

		/**
		 * Controls ordering when multiple paste edits can potentially be applied.
		 *
		 * If this edit yields to another, it will be shown lower in the list of possible paste edits shown to the user.
		 */
		yieldTo?: readonly DocumentDropOrPasteEditKind[];

		/**
		 * Create a new paste edit.
		 *
		 * @param insertText The text or snippet to insert at the pasted locations.
		 * @param title Human readable label that describes the edit.
		 * @param kind {@link DocumentDropOrPasteEditKind Kind} of the edit.
		 */
		constructor(insertText: string | SnippetString, title: string, kind: DocumentDropOrPasteEditKind);
	}

	/**
	 * Provides additional metadata about how a {@linkcode DocumentPasteEditProvider} works.
	 */
	interface DocumentPasteProviderMetadata {
		/**
		 * List of {@link DocumentDropOrPasteEditKind kinds} that the provider may return in {@linkcode DocumentPasteEditProvider.provideDocumentPasteEdits provideDocumentPasteEdits}.
		 *
		 * This is used to filter out providers when a specific {@link DocumentDropOrPasteEditKind kind} of edit is requested.
		 */
		readonly providedPasteEditKinds: readonly DocumentDropOrPasteEditKind[];

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
		 * Note that {@linkcode DataTransferFile} entries are only created when pasting content from outside the editor, such as
		 * from the operating system.
		 */
		readonly pasteMimeTypes?: readonly string[];
	}

	/**
	 * TODO on finalization:
	 * - Add ctor(insertText: string | SnippetString, title?: string, kind?: DocumentDropOrPasteEditKind); Can't be done as this is an extension to an existing class
	 */

	export interface DocumentDropEdit {
		/**
		 * Human readable label that describes the edit.
		 */
		title?: string;

		/**
		 * {@link DocumentDropOrPasteEditKind Kind} of the edit.
		 */
		kind: DocumentDropOrPasteEditKind;

		/**
		 * Controls the ordering or multiple edits. If this provider yield to edits, it will be shown lower in the list.
		 */
		yieldTo?: readonly DocumentDropOrPasteEditKind[];
	}

	export interface DocumentDropEditProvider<T extends DocumentDropEdit = DocumentDropEdit> {
		// Overload that allows returning multiple edits
		// Will be merged in on finalization
		provideDocumentDropEdits(document: TextDocument, position: Position, dataTransfer: DataTransfer, token: CancellationToken): ProviderResult<DocumentDropEdit | DocumentDropEdit[]>;

		/**
		 * Optional method which fills in the {@linkcode DocumentDropEdit.additionalEdit} before the edit is applied.
		 *
		 * This is called once per edit and should be used if generating the complete edit may take a long time.
		 * Resolve can only be used to change {@link DocumentDropEdit.additionalEdit}.
		 *
		 * @param pasteEdit The {@linkcode DocumentDropEdit} to resolve.
		 * @param token A cancellation token.
		 *
		 * @returns The resolved edit or a thenable that resolves to such. It is OK to return the given
		 * `edit`. If no result is returned, the given `edit` is used.
		 */
		resolveDocumentDropEdit?(edit: T, token: CancellationToken): ProviderResult<T>;
	}

	/**
	 * Provides additional metadata about how a {@linkcode DocumentDropEditProvider} works.
	 */
	export interface DocumentDropEditProviderMetadata {
		/**
		 * List of {@link DocumentDropOrPasteEditKind kinds} that the provider may return in {@linkcode DocumentDropEditProvider.provideDocumentDropEdits provideDocumentDropEdits}.
		 *
		 * This is used to filter out providers when a specific {@link DocumentDropOrPasteEditKind kind} of edit is requested.
		 */
		readonly providedDropEditKinds?: readonly DocumentDropOrPasteEditKind[];

		/**
		 * List of {@link DataTransfer} mime types that the provider can handle.
		 *
		 * This can either be an exact mime type such as `image/png`, or a wildcard pattern such as `image/*`.
		 *
		 * Use `text/uri-list` for resources dropped from the explorer or other tree views in the workbench.
		 *
		 * Use `files` to indicate that the provider should be invoked if any {@link DataTransferFile files} are present in the {@link DataTransfer}.
		 * Note that {@link DataTransferFile} entries are only created when dropping content from outside the editor, such as
		 * from the operating system.
		 */
		readonly dropMimeTypes: readonly string[];
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

		/**
		 * Overload which adds extra metadata. Will be removed on finalization.
		 */
		export function registerDocumentDropEditProvider(selector: DocumentSelector, provider: DocumentDropEditProvider, metadata?: DocumentDropEditProviderMetadata): Disposable;
	}
}
