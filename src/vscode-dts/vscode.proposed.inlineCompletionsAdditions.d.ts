/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/124024 @hediet @alexdima

	export interface InlineCompletionItem {
		/**
		 * If set to `true`, unopened closing brackets are removed and unclosed opening brackets are closed.
		 * Defaults to `false`.
		*/
		completeBracketPairs?: boolean;
	}

	export interface InlineCompletionItemProvider {
		// eslint-disable-next-line local/vscode-dts-provider-naming
		handleDidShowCompletionItem?(completionItem: InlineCompletionItem): void;

		/**
		 * Is called when an inline completion item was accepted partially.
		 * @param acceptedLength The length of the substring of the inline completion that was accepted already.
		 */
		// eslint-disable-next-line local/vscode-dts-provider-naming
		handleDidPartiallyAcceptCompletionItem?(completionItem: InlineCompletionItem, acceptedLength: number): void;
	}

	// When finalizing `commands`, make sure to add a corresponding constructor parameter.
	export interface InlineCompletionList {
		/**
		 * A list of commands associated with the inline completions of this list.
		 */
		commands?: Command[];

		/**
		 * When set, overrides the user setting of `editor.inlineSuggest.suppressSuggestions`.
		 */
		suppressSuggestions?: boolean;

		/**
		 * When set and the user types a suggestion without derivating from it, the inline suggestion is not updated.
		 * Defaults to false (might change).
		 */
		enableForwardStability?: boolean;
	}
}
