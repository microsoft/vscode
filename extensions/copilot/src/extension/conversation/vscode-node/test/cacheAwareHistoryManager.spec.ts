/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import * as vscode from 'vscode';
import { LanguageModelChatMessageRole } from '../../../../vscodeTypes';
import {
	approximateTokenCount,
	CacheAwareChatMessage,
	DefaultCacheAwareHistoryConfig,
	deriveConversationId,
	longestCommonPrefixLength,
	prepareMessagesForRequest,
} from '../cacheAwareHistoryManager';

function system(text: string): vscode.LanguageModelChatMessage {
	return new vscode.LanguageModelChatMessage(LanguageModelChatMessageRole.System, text);
}

function user(text: string): vscode.LanguageModelChatMessage {
	return vscode.LanguageModelChatMessage.User(text);
}

function assistant(text: string): vscode.LanguageModelChatMessage {
	return vscode.LanguageModelChatMessage.Assistant(text);
}

function texts(messages: readonly CacheAwareChatMessage[]): string[] {
	return messages.map(m => {
		const content = m.content;
		if (typeof content === 'string') {
			return content;
		}
		return content
			.filter(part => part instanceof vscode.LanguageModelTextPart)
			.map(part => (part as vscode.LanguageModelTextPart).value)
			.join('');
	});
}

describe('cacheAwareHistoryManager', () => {
	test('deriveConversationId is stable for the same system + first user message', () => {
		const a = [system('sys'), user('first'), assistant('a1'), user('second')];
		const b = [system('sys'), user('first'), assistant('a1'), user('second'), assistant('a2')];
		const c = [system('sys'), user('different'), assistant('a1'), user('second')];

		expect(deriveConversationId(a)).toBe(deriveConversationId(b));
		expect(deriveConversationId(a)).not.toBe(deriveConversationId(c));
	});

	test('longestCommonPrefixLength computes the shared prefix', () => {
		const a = [system('sys'), user('first'), assistant('a1'), user('second')];
		const b = [system('sys'), user('first'), assistant('a1'), user('second'), assistant('a2')];
		const c = [system('sys'), user('other')];

		expect(longestCommonPrefixLength(a, b)).toBe(4);
		expect(longestCommonPrefixLength(a, c)).toBe(1);
	});

	test('first request sends a small prefill (system + latest user)', () => {
		const history = [system('sys'), user('first'), assistant('a1'), user('second')];
		const result = prepareMessagesForRequest(history, undefined, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		expect(texts(result.messagesToSend)).toEqual(['sys', 'second']);
		expect(result.truncated).toBe(false);
		expect(result.newState.lastSentMessages).toBe(result.messagesToSend);
	});

	test('subsequent request keeps the growing history when it fits', () => {
		const first = [system('sys'), user('first')];
		const firstResult = prepareMessagesForRequest(first, undefined, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		const second = [system('sys'), user('first'), assistant('a1'), user('second')];
		const secondResult = prepareMessagesForRequest(second, firstResult.newState, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		// The full history is sent because it fits within the budget.
		expect(texts(secondResult.messagesToSend)).toEqual(['sys', 'first', 'a1', 'second']);
		expect(secondResult.truncated).toBe(false);
	});

	test('drops oldest turns when over budget but keeps the stable prefix', () => {
		const first = [system('sys'), user('first')];
		const firstResult = prepareMessagesForRequest(first, undefined, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		// Build a long history that exceeds the budget.
		const longHistory = [system('sys'), user('first')];
		for (let i = 0; i < 50; i++) {
			longHistory.push(assistant(`assistant reply ${i}`));
			longHistory.push(user(`user message ${i}`));
		}

		const result = prepareMessagesForRequest(longHistory, firstResult.newState, 100, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		expect(result.truncated).toBe(true);
		// System prompt is always kept.
		expect(result.messagesToSend[0].role).toBe(LanguageModelChatMessageRole.System);
		// The most recent turns are kept.
		const sent = texts(result.messagesToSend);
		expect(sent[sent.length - 1]).toBe('user message 49');
		// The token count fits within the budget.
		expect(approximateTokenCount(result.messagesToSend)).toBeLessThanOrEqual(100);
	});

	test('disabled config sends the full history unchanged', () => {
		const history = [system('sys'), user('first'), assistant('a1'), user('second')];
		const config = { ...DefaultCacheAwareHistoryConfig, enabled: false };
		const result = prepareMessagesForRequest(history, undefined, 1000, approximateTokenCount, config);

		expect(texts(result.messagesToSend)).toEqual(['sys', 'first', 'a1', 'second']);
		expect(result.truncated).toBe(false);
	});

	test('minRecentTurns keeps at least the configured number of recent turns', () => {
		// Establish conversation state with a first (prefill) request.
		const first = [system('sys'), user('first')];
		const firstResult = prepareMessagesForRequest(first, undefined, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		// Build a long history that exceeds the budget.
		const longHistory = [system('sys'), user('first')];
		for (let i = 0; i < 50; i++) {
			longHistory.push(assistant(`assistant reply ${i}`));
			longHistory.push(user(`user message ${i}`));
		}

		const config = { ...DefaultCacheAwareHistoryConfig, minRecentTurns: 3 };
		const result = prepareMessagesForRequest(longHistory, firstResult.newState, 100, approximateTokenCount, config);

		// Truncation keeps the system prompt + at least the last 3 non-system turns.
		const sent = texts(result.messagesToSend);
		expect(sent[0]).toBe('sys');
		expect(sent.slice(-3)).toEqual(['user message 48', 'assistant reply 49', 'user message 49']);
		expect(result.truncated).toBe(true);
	});
});
