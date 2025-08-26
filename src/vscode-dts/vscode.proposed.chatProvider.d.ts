/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 2

declare module 'vscode' {
	/**
	 * All the information representing a single language model contributed by a {@linkcode LanguageModelChatProvider}.
	 */
	export interface LanguageModelChatInformation {
		/**
		 * Whether or not this will be selected by default in the model picker
		 * NOT BEING FINALIZED
		 */
		readonly isDefault?: boolean;

		/**
		 * Whether or not the model will show up in the model picker immediately upon being made known via {@linkcode LanguageModelChatProvider.prepareLanguageModelChatInformation}.
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
	}
}
