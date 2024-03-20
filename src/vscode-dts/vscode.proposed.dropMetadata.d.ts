/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/179430


	/**
	 * TODO:
	 * - Add ctor(insertText: string | SnippetString, title?: string, kind?: DocumentPasteEditKind); Can't be done as this is an extension to an existing class
	 * - Update provider to return multiple edits
	 */

	export interface DocumentDropEdit {
		/**
		 * Human readable label that describes the edit.
		 */
		title?: string;

		/**
		 * {@link DocumentPasteEditKind Kind} of the edit.
		 *
		 * Used to identify specific types of edits.
		 *
		 * TODO: use own type?
		 */
		kind: DocumentPasteEditKind;

		/**
		 * The mime type from the {@link DataTransfer} that this edit applies.
		 *
		 * TODO: Should this be taken from `dropMimeTypes` instead?
		 */
		handledMimeType?: string;

		/**
		 * Controls the ordering or multiple paste edits. If this provider yield to edits, it will be shown lower in the list.
		 */
		yieldTo?: ReadonlyArray<DocumentPasteEditKind>;
	}

	export interface DocumentDropEditProviderMetadata {
		readonly providedDropEditKinds?: readonly DocumentPasteEditKind[];

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

	export namespace languages {
		export function registerDocumentDropEditProvider(selector: DocumentSelector, provider: DocumentDropEditProvider, metadata?: DocumentDropEditProviderMetadata): Disposable;
	}
}
