/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITokenizer as ITsxTokenizer, OutputMode, Raw } from '@vscode/prompt-tsx';
import type { LanguageModelChatTool } from 'vscode';


export enum TokenizerType {
	CL100K = 'cl100k_base',
	O200K = 'o200k_base',
	Llama3 = 'llama3',
}

export interface ITokenizer extends ITsxTokenizer<OutputMode.Raw> {

	/**
	 * Return the length of `text` in number of tokens.
	 *
	 * @param text The input text
	 */
	tokenLength(text: string | Raw.ChatCompletionContentPart): Promise<number>;

	countMessageTokens(message: Raw.ChatMessage): Promise<number>;

	countMessagesTokens(messages: Raw.ChatMessage[]): Promise<number>;

	countToolTokens(tools: readonly LanguageModelChatTool[]): Promise<number>;
}
