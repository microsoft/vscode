/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { describe, expect, it } from 'vitest';
import { ToolCallingLoop } from '../../node/toolCallingLoop';

function textPart(text: string): Raw.ChatCompletionContentPartText {
	return { type: Raw.ChatCompletionContentPartKind.Text, text };
}

function assistantMsg(text: string, toolCalls?: Raw.ChatMessageToolCall[]): Raw.AssistantChatMessage {
	return {
		role: Raw.ChatRole.Assistant,
		content: [textPart(text)],
		toolCalls,
	};
}

function toolMsg(toolCallId: string, text: string): Raw.ToolChatMessage {
	return {
		role: Raw.ChatRole.Tool,
		toolCallId,
		content: [textPart(text)],
	};
}

function userMsg(text: string): Raw.UserChatMessage {
	return {
		role: Raw.ChatRole.User,
		content: [textPart(text)],
	};
}

function tc(id: string, name: string, args = '{}'): Raw.ChatMessageToolCall {
	return { id, type: 'function', function: { name, arguments: args } };
}

describe('validateToolMessagesCore', () => {
	const geminiOpts = { stripOrphanedToolCalls: true };

	it('passes through valid messages unchanged', () => {
		const messages: Raw.ChatMessage[] = [
			userMsg('hello'),
			assistantMsg('calling tools', [tc('1', 'readFile'), tc('2', 'listDir')]),
			toolMsg('1', 'file contents'),
			toolMsg('2', 'dir listing'),
			assistantMsg('done'),
		];

		const { messages: result, filterReasons } = ToolCallingLoop.validateToolMessagesCore(messages, geminiOpts);
		expect(filterReasons).toHaveLength(0);
		expect(result).toHaveLength(5);
	});

	it('removes orphaned tool result messages (no preceding assistant)', () => {
		const messages: Raw.ChatMessage[] = [
			userMsg('hello'),
			toolMsg('1', 'orphaned result'),
		];

		const { messages: result, filterReasons } = ToolCallingLoop.validateToolMessagesCore(messages);
		expect(result).toHaveLength(1);
		expect(result[0].role).toBe(Raw.ChatRole.User);
		expect(filterReasons).toContain('noPreviousAssistantMessage');
	});

	it('removes tool result messages when assistant had no tool_calls', () => {
		const messages: Raw.ChatMessage[] = [
			assistantMsg('no tools called'),
			toolMsg('1', 'orphaned result'),
		];

		const { messages: result, filterReasons } = ToolCallingLoop.validateToolMessagesCore(messages);
		expect(result).toHaveLength(1);
		expect(result[0].role).toBe(Raw.ChatRole.Assistant);
		expect(filterReasons).toContain('noToolCalls');
	});

	it('removes tool result messages with non-matching tool_call_id', () => {
		const messages: Raw.ChatMessage[] = [
			assistantMsg('calling', [tc('1', 'readFile')]),
			toolMsg('1', 'result'),
			toolMsg('999', 'wrong id'),
		];

		const { messages: result } = ToolCallingLoop.validateToolMessagesCore(messages);
		expect(result).toHaveLength(2);
		expect(result[0].role).toBe(Raw.ChatRole.Assistant);
		expect(result[1].role).toBe(Raw.ChatRole.Tool);
	});

	it('strips orphaned tool_calls from assistant message when results are missing', () => {
		const messages: Raw.ChatMessage[] = [
			assistantMsg('calling 3 tools', [tc('1', 'readFile'), tc('2', 'listDir'), tc('3', 'grep')]),
			toolMsg('1', 'result 1'),
			// tool results for '2' and '3' are missing
		];

		const { messages: result, filterReasons, strippedToolCallCount } = ToolCallingLoop.validateToolMessagesCore(messages, geminiOpts);
		expect(result).toHaveLength(2);
		const asstMsg = result[0] as Raw.AssistantChatMessage;
		expect(asstMsg.toolCalls).toHaveLength(1);
		expect(asstMsg.toolCalls![0].id).toBe('1');
		expect(filterReasons).toHaveLength(0);
		expect(strippedToolCallCount).toBe(2);
	});

	it('clears toolCalls entirely when no results exist for any tool_call', () => {
		const messages: Raw.ChatMessage[] = [
			assistantMsg('calling', [tc('1', 'readFile'), tc('2', 'listDir')]),
			userMsg('next message'),
		];

		const { messages: result, filterReasons, strippedToolCallCount } = ToolCallingLoop.validateToolMessagesCore(messages, geminiOpts);
		const asstMsg = result[0] as Raw.AssistantChatMessage;
		expect(asstMsg.toolCalls).toBeUndefined();
		expect(filterReasons).toHaveLength(0);
		expect(strippedToolCallCount).toBe(2);
	});

	it('handles multiple assistant turns with mixed valid/orphaned tool_calls', () => {
		const messages: Raw.ChatMessage[] = [
			// First round: all matched
			assistantMsg('round 1', [tc('1', 'readFile'), tc('2', 'listDir')]),
			toolMsg('1', 'result 1'),
			toolMsg('2', 'result 2'),
			// Second round: one orphaned
			assistantMsg('round 2', [tc('3', 'grep'), tc('4', 'writeFile')]),
			toolMsg('3', 'result 3'),
			// '4' is missing
		];

		const { messages: result, filterReasons, strippedToolCallCount } = ToolCallingLoop.validateToolMessagesCore(messages, geminiOpts);
		expect(result).toHaveLength(5);

		const round1Asst = result[0] as Raw.AssistantChatMessage;
		expect(round1Asst.toolCalls).toHaveLength(2);

		const round2Asst = result[3] as Raw.AssistantChatMessage;
		expect(round2Asst.toolCalls).toHaveLength(1);
		expect(round2Asst.toolCalls![0].id).toBe('3');
		expect(filterReasons).toHaveLength(0);
		expect(strippedToolCallCount).toBe(1);
	});

	it('does not strip tool_calls when assistant has no toolCalls', () => {
		const messages: Raw.ChatMessage[] = [
			assistantMsg('just text, no tools'),
			userMsg('ok'),
		];

		const { messages: result, filterReasons } = ToolCallingLoop.validateToolMessagesCore(messages);
		expect(result).toHaveLength(2);
		expect(filterReasons).toHaveLength(0);
	});

	it('handles the boundary between two assistant messages correctly', () => {
		// Ensure tool results are only matched to the immediately preceding assistant
		const messages: Raw.ChatMessage[] = [
			assistantMsg('first', [tc('1', 'readFile')]),
			toolMsg('1', 'result for first'),
			assistantMsg('second', [tc('2', 'listDir')]),
			toolMsg('2', 'result for second'),
		];

		const { messages: result, filterReasons } = ToolCallingLoop.validateToolMessagesCore(messages, geminiOpts);
		expect(result).toHaveLength(4);
		expect(filterReasons).toHaveLength(0);
	});

	it('strips tool_calls when the last assistant message has unresolved calls', () => {
		// This simulates the maxToolCallsExceeded scenario
		const messages: Raw.ChatMessage[] = [
			userMsg('do something'),
			assistantMsg('round 1', [tc('1', 'readFile')]),
			toolMsg('1', 'result'),
			assistantMsg('round 2 — exceeded', [tc('2', 'listDir'), tc('3', 'grep')]),
			// No tool results — tool call limit exceeded
		];

		const { messages: result, filterReasons, strippedToolCallCount } = ToolCallingLoop.validateToolMessagesCore(messages, geminiOpts);
		expect(result).toHaveLength(4);
		const lastAsst = result[3] as Raw.AssistantChatMessage;
		expect(lastAsst.toolCalls).toBeUndefined();
		expect(filterReasons).toHaveLength(0);
		expect(strippedToolCallCount).toBe(2);
	});

	it('does not strip orphaned tool_calls when stripOrphanedToolCalls is not set', () => {
		// For non-Gemini models, orphaned tool_calls should be left as-is
		const messages: Raw.ChatMessage[] = [
			assistantMsg('calling', [tc('1', 'readFile'), tc('2', 'listDir')]),
			toolMsg('1', 'result 1'),
			// '2' is missing
		];

		const { messages: result, filterReasons } = ToolCallingLoop.validateToolMessagesCore(messages);
		expect(result).toHaveLength(2);
		const asstMsg = result[0] as Raw.AssistantChatMessage;
		// tool_calls preserved — no stripping for non-Gemini models
		expect(asstMsg.toolCalls).toHaveLength(2);
		expect(filterReasons).toHaveLength(0);
	});

	it('matches tool results across an intervening user message', () => {
		// Regression: Assistant(toolCalls) → User → Tool should still pair correctly
		const messages: Raw.ChatMessage[] = [
			assistantMsg('calling', [tc('1', 'readFile')]),
			userMsg('some user message'),
			toolMsg('1', 'result'),
		];

		// First-pass keeps the tool result (previousAssistantMessage is not reset by user messages)
		const { messages: result, filterReasons } = ToolCallingLoop.validateToolMessagesCore(messages, geminiOpts);
		expect(result).toHaveLength(3);
		// Second-pass should NOT strip the tool_call — the result exists after the user message
		const asstMsg = result[0] as Raw.AssistantChatMessage;
		expect(asstMsg.toolCalls).toHaveLength(1);
		expect(asstMsg.toolCalls![0].id).toBe('1');
		expect(filterReasons).toHaveLength(0);
	});

	it('strips orphaned tool_calls when tool result is separated by a second assistant message', () => {
		// Assistant(toolCalls) → User → Assistant → Tool should NOT pair across the second assistant
		const messages: Raw.ChatMessage[] = [
			assistantMsg('first', [tc('1', 'readFile')]),
			userMsg('some user message'),
			assistantMsg('second', [tc('2', 'listDir')]),
			toolMsg('2', 'result for second'),
		];

		const { messages: result, filterReasons, strippedToolCallCount } = ToolCallingLoop.validateToolMessagesCore(messages, geminiOpts);
		expect(result).toHaveLength(4);
		// First assistant's tool_call '1' has no matching result — should be stripped
		const firstAsst = result[0] as Raw.AssistantChatMessage;
		expect(firstAsst.toolCalls).toBeUndefined();
		// Second assistant's tool_call '2' is properly matched
		const secondAsst = result[2] as Raw.AssistantChatMessage;
		expect(secondAsst.toolCalls).toHaveLength(1);
		expect(secondAsst.toolCalls![0].id).toBe('2');
		expect(filterReasons).toHaveLength(0);
		expect(strippedToolCallCount).toBe(1);
	});

	it('correctly matches tool results with empty-string toolCallId', () => {
		// Edge case: empty string is a valid tool call ID and should not be treated as falsy
		const messages: Raw.ChatMessage[] = [
			assistantMsg('calling', [tc('', 'readFile')]),
			toolMsg('', 'result'),
		];

		const { messages: result, strippedToolCallCount } = ToolCallingLoop.validateToolMessagesCore(messages, geminiOpts);
		expect(result).toHaveLength(2);
		const asstMsg = result[0] as Raw.AssistantChatMessage;
		expect(asstMsg.toolCalls).toHaveLength(1);
		expect(asstMsg.toolCalls![0].id).toBe('');
		expect(strippedToolCallCount).toBe(0);
	});
});
