/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OutputMode, Raw } from '@vscode/prompt-tsx';
import { LanguageModelChat, LanguageModelChatTool } from 'vscode';
import { ITokenizer } from '../../../util/common/tokenizer';
import { assertNever } from '../../../util/vs/base/common/assert';
import { calculateImageTokenCost, estimateDocumentTokenCost } from '../../tokenizer/node/tokenizer';
import { convertToApiChatMessage } from './extChatEndpoint';

/**
 * BaseTokensPerCompletion is the minimum tokens for a completion request.
 * Replies are primed with <|im_start|>assistant<|message|>, so these tokens represent the
 * special token and the role name.
 */
const BaseTokensPerCompletion = 3;

/*
 * Each GPT 3.5 / GPT 4 message comes with 3 tokens per message due to special characters
 */
const BaseTokensPerMessage = 3;


export class ExtensionContributedChatTokenizer implements ITokenizer {
	public readonly mode = OutputMode.Raw;

	constructor(private readonly languageModel: LanguageModelChat) { }

	async tokenLength(text: string | Raw.ChatCompletionContentPart): Promise<number> {
		if (typeof text === 'string') {
			return this._textTokenLength(text);
		}

		switch (text.type) {
			case Raw.ChatCompletionContentPartKind.Text:
				return this._textTokenLength(text.text);
			case Raw.ChatCompletionContentPartKind.Opaque:
				return text.tokenUsage || 0;
			case Raw.ChatCompletionContentPartKind.Image:
				if (text.imageUrl.url.startsWith('data:image/')) {
					try {
						return calculateImageTokenCost(text.imageUrl.url, text.imageUrl.detail);
					} catch {
						return this._textTokenLength(text.imageUrl.url);
					}
				}
				return this._textTokenLength(text.imageUrl.url);
			case Raw.ChatCompletionContentPartKind.CacheBreakpoint:
				return 0;
			case Raw.ChatCompletionContentPartKind.Document:
				return estimateDocumentTokenCost(text.documentData.data);
			default:
				assertNever(text, `unknown content part (${JSON.stringify(text)})`);
		}
	}

	private async _textTokenLength(text: string): Promise<number> {
		if (!text) {
			return 0;
		}
		// Use the VS Code language model API to count tokens
		return this.languageModel.countTokens(text);
	}

	async countMessageTokens(message: Raw.ChatMessage): Promise<number> {
		// Convert to VS Code message format and use the language model's countTokens
		const apiMessages = convertToApiChatMessage([message]);
		if (apiMessages.length === 0) {
			return 0;
		}

		// Count tokens for the message using VS Code API
		const messageTokens = await this.languageModel.countTokens(apiMessages[0]);
		return BaseTokensPerMessage + messageTokens;
	}

	async countMessagesTokens(messages: Raw.ChatMessage[]): Promise<number> {
		let numTokens = BaseTokensPerCompletion;
		for (const message of messages) {
			numTokens += await this.countMessageTokens(message);
		}
		return numTokens;
	}

	async countToolTokens(tools: readonly LanguageModelChatTool[]): Promise<number> {
		const baseToolTokens = 16;
		let numTokens = 0;
		if (tools.length) {
			numTokens += baseToolTokens;
		}

		const baseTokensPerTool = 8;
		for (const tool of tools) {
			numTokens += baseTokensPerTool;
			numTokens += await this._countObjectTokens({ name: tool.name, description: tool.description, parameters: tool.inputSchema });
		}

		// This is an estimate, so give a little safety margin
		return Math.floor(numTokens * 1.1);
	}

	private async _countObjectTokens(obj: Record<string, unknown>): Promise<number> {
		let numTokens = 0;
		for (const [key, value] of Object.entries(obj)) {
			if (!value) {
				continue;
			}

			numTokens += await this._textTokenLength(key);
			if (typeof value === 'string') {
				numTokens += await this._textTokenLength(value);
			} else if (typeof value === 'object') {
				numTokens += await this._countObjectTokens(value as Record<string, unknown>);
			}
		}

		return numTokens;
	}
}