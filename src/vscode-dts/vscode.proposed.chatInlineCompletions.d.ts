/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * The chat inline completion item provider interface defines the contract between extensions and
	 * inline completions for chat input.
	 *
	 * Providers can generate inline completion suggestions based on chat input text without needing
	 * access to the underlying text document.
	 */
	export interface ChatInlineCompletionItemProvider {
		/**
		 * Provide inline completion items for the given chat input.
		 *
		 * @param input The current chat input text
		 * @param position The cursor position within the input (0-based character offset)
		 * @param token A cancellation token.
		 * @return An array of inline completion items or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideChatInlineCompletionItems(
			input: string,
			position: number,
			token: CancellationToken
		): ProviderResult<InlineCompletionItem[] | InlineCompletionList>;
	}

	export namespace chat {
		/**
		 * Register a chat inline completion item provider.
		 *
		 * Multiple providers can be registered. In that case, providers are asked in parallel and
		 * the results are merged.
		 *
		 * @param provider A chat inline completion item provider.
		 * @return A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerChatInlineCompletionItemProvider(provider: ChatInlineCompletionItemProvider): Disposable;
	}
}
