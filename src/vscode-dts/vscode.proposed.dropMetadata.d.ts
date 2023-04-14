/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/179430

	export interface DocumentDropEdit {
		/**
		 * Human readable label that describes the edit.
		 */
		label?: string;
	}

	export interface DocumentDropEditProviderMetadata {
		/**
		 * Unique identifier for the provider.
		 */
		readonly id: string;

		/**
		 * List of data transfer types that the provider supports.
		 */
		readonly dropMimeTypes?: readonly string[];
	}

	export namespace languages {
		export function registerDocumentDropEditProvider(selector: DocumentSelector, provider: DocumentDropEditProvider, metadata?: DocumentDropEditProviderMetadata): Disposable;
	}
}
