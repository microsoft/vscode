/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/????

	export namespace languages {
		/** Returns the language in use as a specific location in a document. */
		export function getLanguageAtPosition(doc: vscode.TextDocument, pos: vscode.Position): Thenable<string>;

		/** Returns the scope name, if known, for a given language identifier. */
		export function getScopeName(languageId: string): Thenable<string | undefined>;
	}
}
