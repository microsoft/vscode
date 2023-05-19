/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/179430

	export interface DocumentDropEdit {
		/**
		 * Identifies the type of edit.
		 *
		 * This id should be unique within the extension but does not need to be unique across extensions.
		 */
		id?: string;

		/**
		 * The relative priority of this edit. Higher priority items are shown first in the UI.
		 *
		 * Defaults to `0`.
		 */
		priority?: number;

		/**
		 * Human readable label that describes the edit.
		 */
		label?: string;
	}

	export interface DocumentDropEditProviderMetadata {
		/**
		 * List of data transfer types that the provider supports.
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
