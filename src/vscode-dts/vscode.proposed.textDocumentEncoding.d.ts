/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/824

	export interface TextDocument {

		/**
		 * The text document's encoding.
		 */
		readonly encoding: string;

		/**
		 * Encodes the text document's content using the specified encoding.
		 *
		 * @param encoding The encoding to be used for encoding the document.
		 * @returns A promise that resolves when the encoding is complete.
		 */
		encode(encoding: string): Thenable<void>;

		/**
		 * Decodes the text document's content using the specified encoding.
		 *
		 * @param encoding The encoding to be used for decoding the document.
		 * @returns A promise that resolves when the decoding is complete.
		 */
		decode(encoding: string): Thenable<void>;
	}
}
