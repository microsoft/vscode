/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/229538

declare module 'vscode' {
	export namespace languages {

		/**
		 * An event that is emitted when a ghost text style completion is provided to a {@link TextEditor}
		 */
		export const onDidProvideInlineCompletion: Event<InlineCompletionProvidedEvent>;
	}

	/**
	 * An event descripting a text completion provided event
	 */
	export interface InlineCompletionProvidedEvent {
		/**
		 * The provided inline completions for the event
		 */
		readonly result: InlineCompletionItem[] | undefined;
		/**
		 * The ID of the provider which provided the event completions
		 */
		readonly providerId: string | undefined;
	}
}
