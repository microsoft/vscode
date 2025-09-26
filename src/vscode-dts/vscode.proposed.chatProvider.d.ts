/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 4

declare module 'vscode' {

	/**
	* The provider version of {@linkcode LanguageModelChatRequestOptions}
	*/
	export interface ProvideLanguageModelChatResponseOptions {

		/**
		 * What extension initiated the request to the language model
		 */
		readonly requestInitiator: string;
	}

	/**
	 * All the information representing a single language model contributed by a {@linkcode LanguageModelChatProvider}.
	 */
	export interface LanguageModelChatInformation {

		/**
		 * When present, this gates the use of `requestLanguageModelAccess` behind an authorization flow where
		 * the user must approve of another extension accessing the models contributed by this extension.
		 * Additionally, the extension can provide a label that will be shown in the UI.
		 * A common example of a label is an account name that is signed in.
		 *
		 */
		requiresAuthorization?: true | { label: string };

		/**
		 * Whether or not this will be selected by default in the model picker
		 * NOT BEING FINALIZED
		 */
		readonly isDefault?: boolean;

		/**
		 * Whether or not the model will show up in the model picker immediately upon being made known via {@linkcode LanguageModelChatProvider.provideLanguageModelChatInformation}.
		 * NOT BEING FINALIZED
		 */
		readonly isUserSelectable?: boolean;

		/**
		 * Optional category to group models by in the model picker.
		 * The lower the order, the higher the category appears in the list.
		 * Has no effect if `isUserSelectable` is `false`.
		 *
		 * WONT BE FINALIZED
		 */
		readonly category?: { label: string; order: number };

		readonly statusIcon?: ThemeIcon;
	}

	export interface LanguageModelChatCapabilities {
		/**
		 * The tools the model prefers for making file edits. If not provided or if none of the tools,
		 * are recognized, the editor will try multiple edit tools and pick the best one. The available
		 * edit tools WILL change over time and this capability only serves as a hint to the editor.
		 *
		 * Edit tools currently recognized include:
		 * - 'find-replace': Find and replace text in a document.
		 * - 'multi-find-replace': Find and replace multiple text snippets across documents.
		 * - 'apply-patch': A file-oriented diff format used by some OpenAI models
		 * - 'code-rewrite': A general but slower editing tool that allows the model
		 *   to rewrite and code snippet and provide only the replacement to the editor.
		 *
		 * The order of edit tools in this array has no significance; all of the recognized edit
		 * tools will be made available to the model.
		 */
		readonly editTools?: string[];
	}

	export type LanguageModelResponsePart2 = LanguageModelResponsePart | LanguageModelDataPart | LanguageModelThinkingPart;

	export interface LanguageModelChatProvider<T extends LanguageModelChatInformation = LanguageModelChatInformation> {
		provideLanguageModelChatResponse(model: T, messages: readonly LanguageModelChatRequestMessage[], options: ProvideLanguageModelChatResponseOptions, progress: Progress<LanguageModelResponsePart2>, token: CancellationToken): Thenable<void>;
	}
}
