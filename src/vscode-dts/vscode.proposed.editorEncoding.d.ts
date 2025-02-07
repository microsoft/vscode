/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/824

	export enum EncodingMode {

		/**
		 * Instructs the encoding support to encode the object with the provided encoding
		 */
		Encode = 0,

		/**
		 * Instructs the encoding support to decode the object with the provided encoding
		 */
		Decode = 1
	}

	export interface TextEditor {
		/**
		 * Get the text editor encoding.
		 */
		getEncoding(): Thenable<string | undefined>;

		/**
		 * Set the text editor encoding.
		 * @param encoding
		 * @param mode
		 */
		setEncoding(encoding: string, mode: EncodingMode): Thenable<void>;
	}
}
