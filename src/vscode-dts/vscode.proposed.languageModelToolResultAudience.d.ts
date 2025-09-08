/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export enum LanguageModelPartAudience {
		/**
		 * The part should be shown to the language model.
		 */
		Assistant = 0,
		/**
		 * The part should be shown to the user.
		 */
		User = 1,
		/**
		 * The part should should be retained for internal bookkeeping within
		 * extensions.
		 */
		Extension = 2,
	}

	/**
	 * A language model response part containing a piece of text, returned from a {@link LanguageModelChatResponse}.
	 */
	export class LanguageModelTextPart2 extends LanguageModelTextPart {
		audience: LanguageModelPartAudience[] | undefined;
		constructor(value: string, audience?: LanguageModelPartAudience[]);
	}

	export class LanguageModelDataPart2 extends LanguageModelDataPart {
		audience: LanguageModelPartAudience[] | undefined;
		constructor(data: Uint8Array, mimeType: string, audience?: LanguageModelPartAudience[]);
	}
}
