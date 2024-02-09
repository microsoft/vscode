/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/204345 @ulugbekna

declare module 'vscode' {

	export interface NewSymbolNamesProvider {
		/**
		 * Provide possible new names for the symbol at the given range.
		 *
		 * @param document The document in which the symbol is defined.
		 * @param range The range that spans the symbol being renamed.
		 * @param token A cancellation token.
		 * @return A list of new symbol names.
		 */
		provideNewSymbolNames(document: TextDocument, range: Range, token: CancellationToken): ProviderResult<string[]>;
	}

	export namespace languages {
		export function registerNewSymbolNamesProvider(selector: DocumentSelector, provider: NewSymbolNamesProvider): Disposable;
	}
}
