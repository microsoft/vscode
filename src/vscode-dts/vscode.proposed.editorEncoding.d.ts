/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/824

	export interface TextEditor {
		/**
		 * Get the text editor encoding.
		 */
		getEncoding(): Thenable<string | undefined>;

		/**
		 * Set the text editor encoding.
		 * @param encoding
		 */
		setEncoding(encoding: string): Thenable<void>;
	}
}
