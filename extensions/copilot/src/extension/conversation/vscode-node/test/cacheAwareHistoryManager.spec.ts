/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import * as vscode from 'vscode';
import { LanguageModelChatMessageRole, LanguageModelToolCallPart, LanguageModelToolResultPart } from '../../../../vscodeTypes';
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

function assistantWithToolCall(callId: string, name: string): vscode.LanguageModelChatMessage {
	const message = new vscode.LanguageModelChatMessage(LanguageModelChatMessageRole.Assistant, '');
	(message as any).content = [new LanguageModelToolCallPart(callId, name, { arg: 'value' })];
	return message;
}

function userWithToolResult(callId: string, text: string): vscode.LanguageModelChatMessage {
	const message = new vscode.LanguageModelChatMessage(LanguageModelChatMessageRole.User, '');
	(message as any).content = [new LanguageModelToolResultPart(callId, [new vscode.LanguageModelTextPart(text)])];
	return message;
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
	test('grows history up to the ceiling then truncates back to the floor (sawtooth)', () => {
		const first = [system('sys'), user('first')];
		const firstResult = prepareMessagesForRequest(first, undefined, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		// A medium history fits within the ceiling (maxUtilization = 100% of budget).
		const mediumHistory = [system('sys'), user('first')];
		for (let i = 0; i < 20; i++) {
			mediumHistory.push(assistant(`assistant reply ${i}`));
			mediumHistory.push(user(`user message ${i}`));
		}
		const mediumResult = prepareMessagesForRequest(mediumHistory, firstResult.newState, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);
		expect(mediumResult.truncated).toBe(false);
		expect(approximateTokenCount(mediumResult.messagesToSend)).toBeLessThanOrEqual(1000);

		// A long history exceeds the ceiling and is truncated back to the floor (minUtilization = 50% of budget).
		const longHistory = [system('sys'), user('first')];
		for (let i = 0; i < 200; i++) {
			longHistory.push(assistant(`assistant reply ${i}`));
			longHistory.push(user(`user message ${i}`));
		}
		const longResult = prepareMessagesForRequest(longHistory, firstResult.newState, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);
		expect(longResult.truncated).toBe(true);
		expect(approximateTokenCount(longResult.messagesToSend)).toBeLessThanOrEqual(500);
		// The most recent turns are kept.
		const sent = texts(longResult.messagesToSend);
		expect(sent[sent.length - 1]).toBe('user message 199');
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

	test('prefill falls back to full history when the latest user message carries a tool result', () => {
		const history = [system('sys'), user('first'), assistantWithToolCall('call-1', 'toolA'), userWithToolResult('call-1', 'result')];
		const result = prepareMessagesForRequest(history, undefined, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		// The full history is preserved so the tool-call/tool-result exchange stays intact.
		expect(result.messagesToSend).toHaveLength(4);
		expect(result.messagesToSend[0].role).toBe(LanguageModelChatMessageRole.System);
		expect(result.messagesToSend[3].role).toBe(LanguageModelChatMessageRole.User);
	});

	test('truncation drops tool-call/tool-result exchanges atomically', () => {
		const first = [system('sys'), user('first')];
		const firstResult = prepareMessagesForRequest(first, undefined, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		// Build a history with an early tool exchange followed by many turns.
		const longHistory = [system('sys'), user('first'), assistantWithToolCall('call-1', 'toolA'), userWithToolResult('call-1', 'result')];
		for (let i = 0; i < 50; i++) {
			longHistory.push(assistant(`assistant reply ${i}`));
			longHistory.push(user(`user message ${i}`));
		}

		const result = prepareMessagesForRequest(longHistory, firstResult.newState, 100, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		expect(result.truncated).toBe(true);
		// The tool-call and its matching tool-result must both be dropped together.
		const sent = texts(result.messagesToSend);
		expect(sent).not.toContain('result');
		// The most recent turns are kept.
		expect(sent[sent.length - 1]).toBe('user message 49');
	});

	test('summarizeDroppedTurns injects the summary into the sent messages', () => {
		const first = [system('sys'), user('first')];
		const firstResult = prepareMessagesForRequest(first, undefined, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		const longHistory = [system('sys'), user('first')];
		for (let i = 0; i < 50; i++) {
			longHistory.push(assistant(`assistant reply ${i}`));
			longHistory.push(user(`user message ${i}`));
		}

		const config = { ...DefaultCacheAwareHistoryConfig, summarizeDroppedTurns: true };
		const result = prepareMessagesForRequest(longHistory, firstResult.newState, 100, approximateTokenCount, config);

		expect(result.truncated).toBe(true);
	// The summary is injected as a stable early system message, immediately
	// after the existing system messages, so it reaches the model without
	// breaking the immutable prefix for subsequent requests.
	const systemMessages = result.messagesToSend.filter(m => m.role === LanguageModelChatMessageRole.System);
	expect(systemMessages.length).toBeGreaterThan(1);
	const summaryMessage = systemMessages[systemMessages.length - 1];
	expect(texts([summaryMessage])[0]).toContain('dropped');
	// The summary must not be the last message (that would put a changing
	// system message at the end and poison the prefix for the next request).
	expect(result.messagesToSend[result.messagesToSend.length - 1].role).not.toBe(LanguageModelChatMessageRole.System);    });
	test('extendsLastSent is true when the candidate extends the last-sent prefix', () => {
		const first = [system('sys'), user('first')];
		const firstResult = prepareMessagesForRequest(first, undefined, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		const second = [system('sys'), user('first'), assistant('a1'), user('second')];
		const secondResult = prepareMessagesForRequest(second, firstResult.newState, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		expect(secondResult.extendsLastSent).toBe(true);
	});

	test('extendsLastSent is false when an earlier message is rewritten', () => {
		const first = [system('sys'), user('first')];
		const firstResult = prepareMessagesForRequest(first, undefined, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		// The system prompt is rewritten, so the prefix diverges.
		const second = [system('sys-rewritten'), user('first'), assistant('a1'), user('second')];
		const secondResult = prepareMessagesForRequest(second, firstResult.newState, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		expect(secondResult.extendsLastSent).toBe(false);
	});

	test('aggressive truncation policy keeps fewer recent turns than conservative', () => {
		const first = [system('sys'), user('first')];
		const firstResult = prepareMessagesForRequest(first, undefined, 1000, approximateTokenCount, DefaultCacheAwareHistoryConfig);

		const longHistory = [system('sys'), user('first')];
		for (let i = 0; i < 50; i++) {
			longHistory.push(assistant(`assistant reply ${i}`));
			longHistory.push(user(`user message ${i}`));
		}

		const conservative = prepareMessagesForRequest(longHistory, firstResult.newState, 100, approximateTokenCount, { ...DefaultCacheAwareHistoryConfig, truncationPolicy: 'conservative' });
		const aggressive = prepareMessagesForRequest(longHistory, firstResult.newState, 100, approximateTokenCount, { ...DefaultCacheAwareHistoryConfig, truncationPolicy: 'aggressive' });

		// Aggressive keeps fewer recent turns (minRecentTurns) than conservative.
		expect(aggressive.messagesToSend.length).toBeLessThan(conservative.messagesToSend.length);
	});

	test('approximateTokenCount counts non-text parts', () => {
		const toolCall = assistantWithToolCall('call-1', 'toolA');
		const toolResult = userWithToolResult('call-1', 'some result text');
		const textOnly = user('hello world');

		// Tool-call arguments and tool-result content contribute to the count.
		expect(approximateTokenCount([toolCall])).toBeGreaterThan(0);
		expect(approximateTokenCount([toolResult])).toBeGreaterThan(0);
		expect(approximateTokenCount([toolCall, toolResult])).toBeGreaterThan(approximateTokenCount([textOnly]));
	});
});
