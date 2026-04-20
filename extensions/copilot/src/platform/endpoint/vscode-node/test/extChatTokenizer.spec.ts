/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LanguageModelChat, LanguageModelChatMessage, LanguageModelChatMessage2 } from 'vscode';
import { ExtensionContributedChatTokenizer } from '../extChatTokenizer';

/**
 * Mock implementation of LanguageModelChat for testing purposes.
 * Simulates token counting with a configurable strategy.
 */
class MockLanguageModelChat implements Partial<LanguageModelChat> {
	private readonly _tokenCountFn: (input: string | LanguageModelChatMessage | LanguageModelChatMessage2) => number;

	constructor(tokenCountFn?: (input: string | LanguageModelChatMessage | LanguageModelChatMessage2) => number) {
		// Default: approximate token count as words (split by whitespace)
		this._tokenCountFn = tokenCountFn ?? ((input) => {
			if (typeof input === 'string') {
				return input.split(/\s+/).filter(Boolean).length || 0;
			}
			// For messages, count tokens in all text content parts
			let total = 0;
			for (const part of input.content) {
				if ('value' in part && typeof part.value === 'string') {
					total += part.value.split(/\s+/).filter(Boolean).length || 0;
				}
			}
			return total;
		});
	}

	countTokens(input: string | LanguageModelChatMessage | LanguageModelChatMessage2): Thenable<number> {
		return Promise.resolve(this._tokenCountFn(input));
	}
}

describe('ExtensionContributedChatTokenizer', () => {
	let tokenizer: ExtensionContributedChatTokenizer;
	let mockLanguageModel: MockLanguageModelChat;

	beforeEach(() => {
		mockLanguageModel = new MockLanguageModelChat();
		tokenizer = new ExtensionContributedChatTokenizer(mockLanguageModel as unknown as LanguageModelChat);
	});

	describe('tokenLength', () => {
		it('should count tokens for a simple string', async () => {
			const result = await tokenizer.tokenLength('Hello world');
			expect(result).toBe(2); // "Hello" and "world"
		});

		it('should return 0 for an empty string', async () => {
			const result = await tokenizer.tokenLength('');
			expect(result).toBe(0);
		});

		it('should count tokens for a text content part', async () => {
			const textPart: Raw.ChatCompletionContentPart = {
				type: Raw.ChatCompletionContentPartKind.Text,
				text: 'This is a test message'
			};
			const result = await tokenizer.tokenLength(textPart);
			expect(result).toBe(5); // 5 words
		});

		it('should return tokenUsage for opaque content parts', async () => {
			const opaquePart: Raw.ChatCompletionContentPart = {
				type: Raw.ChatCompletionContentPartKind.Opaque,
				value: { some: 'data' },
				tokenUsage: 42
			};
			const result = await tokenizer.tokenLength(opaquePart);
			expect(result).toBe(42);
		});

		it('should return 0 for opaque content parts without tokenUsage', async () => {
			const opaquePart: Raw.ChatCompletionContentPart = {
				type: Raw.ChatCompletionContentPartKind.Opaque,
				value: { some: 'data' }
			};
			const result = await tokenizer.tokenLength(opaquePart);
			expect(result).toBe(0);
		});

		it('should return 0 for cache breakpoint content parts', async () => {
			const cacheBreakpoint: Raw.ChatCompletionContentPart = {
				type: Raw.ChatCompletionContentPartKind.CacheBreakpoint
			};
			const result = await tokenizer.tokenLength(cacheBreakpoint);
			expect(result).toBe(0);
		});

		it('should count tokens for document content parts', async () => {
			const documentPart: Raw.ChatCompletionContentPart = {
				type: Raw.ChatCompletionContentPartKind.Document,
				documentData: { data: 'JVBERi0xLjQK base64 encoded pdf data', mediaType: 'application/pdf' },
			};
			const result = await tokenizer.tokenLength(documentPart);
			// Token length for documents is estimated from document size; it should be positive.
			expect(result).toBeGreaterThan(0);
		});
	});

	describe('countMessageTokens', () => {
		it('should count tokens for a user message', async () => {
			const message: Raw.ChatMessage = {
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello there' }]
			};
			const result = await tokenizer.countMessageTokens(message);
			// BaseTokensPerMessage (3) + message content tokens
			expect(result).toBeGreaterThanOrEqual(3);
		});

		it('should count tokens for an assistant message', async () => {
			const message: Raw.ChatMessage = {
				role: Raw.ChatRole.Assistant,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'I can help with that' }]
			};
			const result = await tokenizer.countMessageTokens(message);
			expect(result).toBeGreaterThanOrEqual(3);
		});

		it('should count tokens for a system message', async () => {
			const message: Raw.ChatMessage = {
				role: Raw.ChatRole.System,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'You are a helpful assistant' }]
			};
			const result = await tokenizer.countMessageTokens(message);
			expect(result).toBeGreaterThanOrEqual(3);
		});
	});

	describe('countMessagesTokens', () => {
		it('should count tokens for multiple messages', async () => {
			const messages: Raw.ChatMessage[] = [
				{
					role: Raw.ChatRole.System,
					content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'You are helpful' }]
				},
				{
					role: Raw.ChatRole.User,
					content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hi' }]
				},
				{
					role: Raw.ChatRole.Assistant,
					content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }]
				}
			];
			const result = await tokenizer.countMessagesTokens(messages);
			// BaseTokensPerCompletion (3) + 3 messages * BaseTokensPerMessage (3) + content tokens
			expect(result).toBeGreaterThanOrEqual(12);
		});

		it('should return base tokens for empty messages array', async () => {
			const result = await tokenizer.countMessagesTokens([]);
			expect(result).toBe(3); // BaseTokensPerCompletion
		});
	});

	describe('countToolTokens', () => {
		it('should count tokens for a single tool', async () => {
			const tools = [{
				name: 'get_weather',
				description: 'Get the current weather',
				inputSchema: {
					type: 'object',
					properties: {
						location: { type: 'string' }
					}
				}
			}];
			const result = await tokenizer.countToolTokens(tools);
			// baseToolTokens (16) + baseTokensPerTool (8) + object tokens * 1.1
			expect(result).toBeGreaterThan(24);
		});

		it('should count tokens for multiple tools', async () => {
			const tools = [
				{
					name: 'get_weather',
					description: 'Get weather info',
					inputSchema: { type: 'object' }
				},
				{
					name: 'search',
					description: 'Search the web',
					inputSchema: { type: 'object' }
				}
			];
			const result = await tokenizer.countToolTokens(tools);
			// baseToolTokens (16) + 2 * baseTokensPerTool (8) + object tokens
			expect(result).toBeGreaterThan(32);
		});

		it('should return 0 for empty tools array', async () => {
			const result = await tokenizer.countToolTokens([]);
			expect(result).toBe(0);
		});
	});

	describe('with custom token counting', () => {
		it('should use the language model countTokens method', async () => {
			const countTokensSpy = vi.fn().mockResolvedValue(10);
			const customMock = {
				countTokens: countTokensSpy
			} as unknown as LanguageModelChat;

			const customTokenizer = new ExtensionContributedChatTokenizer(customMock);
			const result = await customTokenizer.tokenLength('test string');

			expect(countTokensSpy).toHaveBeenCalledWith('test string');
			expect(result).toBe(10);
		});

		it('should delegate message token counting to language model', async () => {
			const countTokensSpy = vi.fn().mockResolvedValue(15);
			const customMock = {
				countTokens: countTokensSpy
			} as unknown as LanguageModelChat;

			const customTokenizer = new ExtensionContributedChatTokenizer(customMock);
			const message: Raw.ChatMessage = {
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }]
			};

			const result = await customTokenizer.countMessageTokens(message);
			// BaseTokensPerMessage (3) + 15 from language model
			expect(result).toBe(18);
			expect(countTokensSpy).toHaveBeenCalled();
		});
	});
});
