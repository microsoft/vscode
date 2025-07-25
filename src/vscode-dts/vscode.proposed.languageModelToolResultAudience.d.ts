/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export enum ToolResultAudience {
		Assistant = 0,
		User = 1,
	}

	/**
	 * A language model response part containing a piece of text, returned from a {@link LanguageModelChatResponse}.
	 */
	export class LanguageModelTextPart2 extends LanguageModelTextPart {
		audience: ToolResultAudience[] | undefined;
		constructor(value: string, audience?: ToolResultAudience[]);
	}

	export class LanguageModelDataPart2 extends LanguageModelDataPart {
		audience: ToolResultAudience[] | undefined;
		constructor(data: Uint8Array, mimeType: string, audience?: ToolResultAudience[]);
	}
}
