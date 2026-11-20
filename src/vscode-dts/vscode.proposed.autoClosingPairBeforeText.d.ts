/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface AutoClosingPair {
		/**
		 * The regular expression that the text on the current line before the cursor, including
		 * the just-typed opening string, must match for the closing string to be automatically inserted.
		 */
		beforeText?: RegExp;
	}
}
