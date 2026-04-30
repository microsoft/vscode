/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { URI } from '../../../../util/vs/base/common/uri';
import { ChatReferenceBinaryData, ChatRequestTurn, ChatRequestTurn2, ChatResponseMarkdownPart, ChatResponseThinkingProgressPart, ChatResponseTurn2, ChatToolInvocationPart } from '../../../../vscodeTypes';
import { IClaudeCodeSession, ISubagentSession, StoredMessage, SYNTHETIC_MODEL_ID } from '../../claude/node/sessionParser/claudeSessionSchema';
import { buildChatHistory } from '../chatHistoryBuilder';

// #region Test Helpers

let _msgCounter = 0;

function userMsg(content: string | Anthropic.Messages.ContentBlockParam[]): StoredMessage {
	const uuid = `user-${++_msgCounter}`;
	return {
		uuid,
		sessionId: 'test-session',
		timestamp: new Date(),
		parentUuid: null,
		type: 'user',
		message: { role: 'user' as const, content },
	} as StoredMessage;
}

function assistantMsg(content: readonly Record<string, unknown>[], model = 'claude-3-sonnet'): StoredMessage {
	const uuid = `asst-${++_msgCounter}`;
	return {
		uuid,
		sessionId: 'test-session',
		timestamp: new Date(),
		parentUuid: null,
		type: 'assistant',
		message: {
			id: uuid,
			type: 'message',
			role: 'assistant' as const,
			content,
			model,
			stop_reason: content.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
			stop_sequence: null,
			usage: { input_tokens: 10, output_tokens: 10 },
		},
	} as StoredMessage;
}

function toolResult(toolUseId: string, content: string, isError = false): StoredMessage {
	return userMsg([{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError }]);
}

function session(messages: StoredMessage[], subagents: ISubagentSession[] = []): IClaudeCodeSession {
	const timestamp = new Date();
	return {
		id: 'test-session',
		label: 'Test',
		messages,
		created: (messages[0]?.timestamp ?? timestamp).getTime(),
		lastRequestEnded: (messages[messages.length - 1]?.timestamp ?? timestamp).getTime(),
		subagents,
	};
}

interface SnapshotRequest {
	type: 'request';
	prompt: string;
}

interface SnapshotResponse {
	type: 'response';
	parts: Array<Record<string, unknown>>;
}

type SnapshotTurn = SnapshotRequest | SnapshotResponse | { type: 'unknown' };

function getResponseParts(snapshot: SnapshotTurn[], index: number): Array<Record<string, unknown>> {
	const turn = snapshot[index];
	if (turn.type !== 'response') {
		throw new Error(`Expected response at index ${index}, got ${turn.type}`);
	}
	return turn.parts;
}

function mapHistoryForSnapshot(history: readonly (vscode.ChatRequestTurn | vscode.ChatResponseTurn2)[]): SnapshotTurn[] {
	return history.map(turn => {
		if (turn instanceof ChatRequestTurn || turn instanceof ChatRequestTurn2) {
			return {
				type: 'request',
				prompt: turn.prompt,
			};
		} else if (turn instanceof ChatResponseTurn2) {
			return {
				type: 'response',
				parts: turn.response.map(part => {
					if (part instanceof ChatResponseMarkdownPart) {
						return {
							type: 'markdown',
							content: part.value.value,
						};
					} else if (part instanceof ChatToolInvocationPart) {
						return {
							type: 'tool',
							toolName: part.toolName,
							toolCallId: part.toolCallId,
							isError: part.isError,
							isComplete: part.isComplete,
						};
					} else if (part instanceof ChatResponseThinkingProgressPart) {
						return {
							type: 'thinking',
						};
					}
					return { type: 'unknown' };
				}),
			};
		}
		return { type: 'unknown' };
	});
}

// #endregion

describe('buildChatHistory', () => {

	// #region Empty and Minimal Cases

	describe('empty and minimal cases', () => {
		it('returns empty array for session with no messages', () => {
			const result = buildChatHistory(session([]));
			expect(result).toEqual([]);
		});

		it('converts a single user message to a request turn', () => {
			const result = buildChatHistory(session([
				userMsg('Hello'),
			]));
			expect(mapHistoryForSnapshot(result)).toMatchInlineSnapshot(`
				[
				  {
				    "prompt": "Hello",
				    "type": "request",
				  },
				]
			`);
		});

		it('converts a single assistant text message to a response turn', () => {
			const result = buildChatHistory(session([
				assistantMsg([{ type: 'text', text: 'Hi there!' }]),
			]));
			expect(mapHistoryForSnapshot(result)).toMatchInlineSnapshot(`
				[
				  {
				    "parts": [
				      {
				        "content": "Hi there!",
				        "type": "markdown",
				      },
				    ],
				    "type": "response",
				  },
				]
			`);
		});
	});

	// #endregion

	// #region Simple Request/Response Pairs

	describe('simple request/response pairs', () => {
		it('converts a user message followed by an assistant text response', () => {
			const result = buildChatHistory(session([
				userMsg('What is 2+2?'),
				assistantMsg([{ type: 'text', text: 'The answer is 4.' }]),
			]));
			expect(mapHistoryForSnapshot(result)).toMatchInlineSnapshot(`
				[
				  {
				    "prompt": "What is 2+2?",
				    "type": "request",
				  },
				  {
				    "parts": [
				      {
				        "content": "The answer is 4.",
				        "type": "markdown",
				      },
				    ],
				    "type": "response",
				  },
				]
			`);
		});

		it('handles multiple conversation turns', () => {
			const result = buildChatHistory(session([
				userMsg('First question'),
				assistantMsg([{ type: 'text', text: 'First answer' }]),
				userMsg('Second question'),
				assistantMsg([{ type: 'text', text: 'Second answer' }]),
			]));
			expect(result).toHaveLength(4);
			expect(result[0]).toBeInstanceOf(ChatRequestTurn2);
			expect(result[1]).toBeInstanceOf(ChatResponseTurn2);
			expect(result[2]).toBeInstanceOf(ChatRequestTurn2);
			expect(result[3]).toBeInstanceOf(ChatResponseTurn2);
		});
	});

	// #endregion

	// #region Consecutive Message Grouping

	describe('consecutive message grouping', () => {
		it('combines consecutive user messages into a single request turn', () => {
			const result = buildChatHistory(session([
				userMsg('First part.'),
				userMsg('Second part.'),
				assistantMsg([{ type: 'text', text: 'Response' }]),
			]));
			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot).toHaveLength(2);
			expect(snapshot[0]).toEqual({
				type: 'request',
				prompt: 'First part.\n\nSecond part.',
			});
		});

		it('combines consecutive assistant messages into a single response turn', () => {
			const result = buildChatHistory(session([
				userMsg('Hello'),
				assistantMsg([{ type: 'text', text: 'Part one.' }]),
				assistantMsg([{ type: 'text', text: 'Part two.' }]),
			]));
			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot).toHaveLength(2);
			expect(snapshot[1]).toEqual({
				type: 'response',
				parts: [
					{ type: 'markdown', content: 'Part one.' },
					{ type: 'markdown', content: 'Part two.' },
				],
			});
		});
	});

	// #endregion

	// #region Single Tool Call

	describe('single tool call', () => {
		it('creates a tool invocation part for tool_use blocks', () => {
			const result = buildChatHistory(session([
				userMsg('List files'),
				assistantMsg([
					{ type: 'text', text: 'Let me check.' },
					{ type: 'tool_use', id: 'tool-1', name: 'bash', input: { command: 'ls' } },
				]),
			]));
			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot[1]).toEqual({
				type: 'response',
				parts: [
					{ type: 'markdown', content: 'Let me check.' },
					{ type: 'tool', toolName: 'bash', toolCallId: 'tool-1', isComplete: undefined },
				],
			});
		});

		it('marks tool invocations as complete when tool result follows', () => {
			const result = buildChatHistory(session([
				userMsg('List files'),
				assistantMsg([
					{ type: 'tool_use', id: 'tool-1', name: 'bash', input: { command: 'ls' } },
				]),
				toolResult('tool-1', 'file1.txt\nfile2.txt'),
			]));
			const snapshot = mapHistoryForSnapshot(result);
			// Should be a single response with a completed tool
			expect(snapshot).toHaveLength(2);
			expect(snapshot[1]).toEqual({
				type: 'response',
				parts: [
					{ type: 'tool', toolName: 'bash', toolCallId: 'tool-1', isError: false, isComplete: true },
				],
			});
		});

		it('marks tool invocations as error when tool result is an error', () => {
			const result = buildChatHistory(session([
				userMsg('Run command'),
				assistantMsg([
					{ type: 'tool_use', id: 'tool-1', name: 'bash', input: { command: 'bad-cmd' } },
				]),
				toolResult('tool-1', 'command not found', true),
			]));
			const snapshot = mapHistoryForSnapshot(result);
			expect(getResponseParts(snapshot, 1)[0]).toMatchObject({
				type: 'tool',
				isError: true,
				isComplete: true,
			});
		});
	});

	// #endregion

	// #region Multi-Round Tool Use (Core Bug Fix)

	describe('multi-round tool use merging', () => {
		it('merges assistant → tool_result → assistant into a single response', () => {
			const result = buildChatHistory(session([
				userMsg('Find and read config'),
				assistantMsg([
					{ type: 'text', text: 'Let me find it.' },
					{ type: 'tool_use', id: 'tool-1', name: 'Glob', input: { pattern: '**/config.*' } },
				]),
				toolResult('tool-1', 'config.json'),
				assistantMsg([
					{ type: 'text', text: 'Found it. Let me read it.' },
					{ type: 'tool_use', id: 'tool-2', name: 'Read', input: { file_path: 'config.json' } },
				]),
				toolResult('tool-2', '{ "key": "value" }'),
				assistantMsg([
					{ type: 'text', text: 'Done.' },
				]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			// Must be exactly 1 request + 1 response
			expect(snapshot).toHaveLength(2);
			expect(snapshot[0].type).toBe('request');
			expect(snapshot[1].type).toBe('response');
			expect(getResponseParts(snapshot, 1)).toHaveLength(5);
		});

		it('merges many rounds of tool use into a single response', () => {
			const result = buildChatHistory(session([
				userMsg('Do complex task'),
				assistantMsg([{ type: 'tool_use', id: 't1', name: 'Glob', input: {} }]),
				toolResult('t1', 'result1'),
				assistantMsg([{ type: 'tool_use', id: 't2', name: 'Read', input: {} }]),
				toolResult('t2', 'result2'),
				assistantMsg([{ type: 'tool_use', id: 't3', name: 'Grep', input: {} }]),
				toolResult('t3', 'result3'),
				assistantMsg([{ type: 'tool_use', id: 't4', name: 'bash', input: {} }]),
				toolResult('t4', 'result4'),
				assistantMsg([{ type: 'text', text: 'All done.' }]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot).toHaveLength(2);
			expect(getResponseParts(snapshot, 1)).toHaveLength(5); // 4 tools + 1 text
			expect(getResponseParts(snapshot, 1)[0]).toMatchObject({ type: 'tool', isComplete: true });
			expect(getResponseParts(snapshot, 1)[1]).toMatchObject({ type: 'tool', isComplete: true });
			expect(getResponseParts(snapshot, 1)[2]).toMatchObject({ type: 'tool', isComplete: true });
			expect(getResponseParts(snapshot, 1)[3]).toMatchObject({ type: 'tool', isComplete: true });
			expect(getResponseParts(snapshot, 1)[4]).toMatchObject({ type: 'markdown', content: 'All done.' });
		});

		it('correctly separates two user requests each with their own tool loops', () => {
			const result = buildChatHistory(session([
				// First user request with tool loop
				userMsg('First task'),
				assistantMsg([{ type: 'tool_use', id: 't1', name: 'Glob', input: {} }]),
				toolResult('t1', 'found'),
				assistantMsg([{ type: 'text', text: 'Done with first.' }]),
				// Second user request with tool loop
				userMsg('Second task'),
				assistantMsg([{ type: 'tool_use', id: 't2', name: 'Read', input: {} }]),
				toolResult('t2', 'content'),
				assistantMsg([{ type: 'text', text: 'Done with second.' }]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot).toHaveLength(4); // req, resp, req, resp
			expect(snapshot[0]).toMatchObject({ type: 'request', prompt: 'First task' });
			expect(snapshot[1]).toMatchObject({ type: 'response' });
			expect(getResponseParts(snapshot, 1)).toHaveLength(2); // tool + text
			expect(snapshot[2]).toMatchObject({ type: 'request', prompt: 'Second task' });
			expect(snapshot[3]).toMatchObject({ type: 'response' });
			expect(getResponseParts(snapshot, 3)).toHaveLength(2); // tool + text
		});

		it('handles parallel tool calls in a single assistant message', () => {
			const result = buildChatHistory(session([
				userMsg('Search broadly'),
				assistantMsg([
					{ type: 'text', text: 'Searching...' },
					{ type: 'tool_use', id: 't1', name: 'Glob', input: {} },
					{ type: 'tool_use', id: 't2', name: 'Grep', input: {} },
				]),
				// Both tool results come in the same user message
				userMsg([
					{ type: 'tool_result', tool_use_id: 't1', content: 'glob result' },
					{ type: 'tool_result', tool_use_id: 't2', content: 'grep result' },
				]),
				assistantMsg([{ type: 'text', text: 'Found everything.' }]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot).toHaveLength(2);
			expect(getResponseParts(snapshot, 1)).toHaveLength(4); // text + 2 tools + text
			expect(getResponseParts(snapshot, 1)[1]).toMatchObject({ type: 'tool', isComplete: true });
			expect(getResponseParts(snapshot, 1)[2]).toMatchObject({ type: 'tool', isComplete: true });
		});

		it('handles tool results that arrive in separate user messages', () => {
			const result = buildChatHistory(session([
				userMsg('Do thing'),
				assistantMsg([
					{ type: 'tool_use', id: 't1', name: 'Glob', input: {} },
					{ type: 'tool_use', id: 't2', name: 'Grep', input: {} },
				]),
				// Each tool result as a separate user message (both should be merged)
				toolResult('t1', 'glob result'),
				toolResult('t2', 'grep result'),
				assistantMsg([{ type: 'text', text: 'Done.' }]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot).toHaveLength(2);
			expect(getResponseParts(snapshot, 1)[0]).toMatchObject({ type: 'tool', isComplete: true });
			expect(getResponseParts(snapshot, 1)[1]).toMatchObject({ type: 'tool', isComplete: true });
		});
	});

	// #endregion

	// #region System Reminder Filtering

	describe('system reminder filtering', () => {
		it('filters out system-reminder blocks from user messages', () => {
			const result = buildChatHistory(session([
				userMsg([
					{ type: 'text', text: '<system-reminder>\nInternal context.\n</system-reminder>' },
					{ type: 'text', text: 'What does this do?' },
				]),
			]));
			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot).toHaveLength(1);
			expect(snapshot[0]).toMatchObject({ type: 'request', prompt: 'What does this do?' });
		});

		it('strips system-reminders from legacy string format', () => {
			const result = buildChatHistory(session([
				userMsg('<system-reminder>\nInternal.\n</system-reminder>\n\nActual question'),
			]));
			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot[0]).toMatchObject({ type: 'request', prompt: 'Actual question' });
		});

		it('produces no request turn when user message is only a system-reminder', () => {
			const result = buildChatHistory(session([
				userMsg([
					{ type: 'text', text: '<system-reminder>\nInternal.\n</system-reminder>' },
				]),
				assistantMsg([{ type: 'text', text: 'Hello!' }]),
			]));
			const snapshot = mapHistoryForSnapshot(result);
			// Only the assistant response should appear
			expect(snapshot).toHaveLength(1);
			expect(snapshot[0]).toMatchObject({ type: 'response' });
		});

		it('filters system-reminder user messages mid-tool-loop without breaking the response', () => {
			const result = buildChatHistory(session([
				userMsg('Do task'),
				assistantMsg([
					{ type: 'tool_use', id: 't1', name: 'bash', input: {} },
				]),
				// Tool result + system reminder in the same user message group
				userMsg([
					{ type: 'tool_result', tool_use_id: 't1', content: 'done' },
				]),
				userMsg([
					{ type: 'text', text: '<system-reminder>\nReminder.\n</system-reminder>' },
				]),
				assistantMsg([{ type: 'text', text: 'Finished.' }]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			// System-reminder-only user messages should not break the response
			expect(snapshot).toHaveLength(2);
			expect(snapshot[0]).toMatchObject({ type: 'request', prompt: 'Do task' });
			expect(getResponseParts(snapshot, 1)).toHaveLength(2); // tool + text
		});
	});

	// #endregion

	// #region Interrupted Requests

	describe('interrupted requests', () => {
		it('skips user messages that are interruption markers', () => {
			const result = buildChatHistory(session([
				userMsg('Do something'),
				assistantMsg([
					{ type: 'tool_use', id: 't1', name: 'bash', input: {} },
				]),
				toolResult('t1', 'partial'),
				assistantMsg([{ type: 'text', text: 'Working...' }]),
				userMsg('[Request interrupted by user]'),
				assistantMsg([{ type: 'text', text: 'Stopped.' }]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			// The interruption marker should not create a request turn
			// The "Stopped." response merges into a new response (since the interrupted
			// user message broke the assistant grouping but produced no request turn)
			expect(snapshot.filter(s => s.type === 'request')).toHaveLength(1);
		});
	});

	// #endregion

	// #region Thinking Blocks

	describe('thinking blocks', () => {
		it('includes thinking blocks in response parts', () => {
			const result = buildChatHistory(session([
				userMsg('Think about this'),
				assistantMsg([
					{ type: 'thinking', thinking: 'Let me reason...' },
					{ type: 'text', text: 'Here is my answer.' },
				]),
			]));

			// Thinking block + text = 2 parts
			expect(result).toHaveLength(2);
			const response = result[1] as vscode.ChatResponseTurn2;
			expect(response.response).toHaveLength(2);
		});

		it('preserves thinking blocks across multi-round tool use', () => {
			const result = buildChatHistory(session([
				userMsg('Complex task'),
				assistantMsg([
					{ type: 'thinking', thinking: 'First thinking...' },
					{ type: 'tool_use', id: 't1', name: 'Glob', input: {} },
				]),
				toolResult('t1', 'found'),
				assistantMsg([
					{ type: 'thinking', thinking: 'Second thinking...' },
					{ type: 'text', text: 'Done.' },
				]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot).toHaveLength(2); // 1 request, 1 merged response
		});
	});

	// #endregion

	// #region Edge Cases

	describe('edge cases', () => {
		it('handles tool_use without a corresponding tool_result', () => {
			const result = buildChatHistory(session([
				userMsg('Start'),
				assistantMsg([
					{ type: 'tool_use', id: 't1', name: 'bash', input: {} },
				]),
				// No tool result - session may have been interrupted
			]));

			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot).toHaveLength(2);
			expect(getResponseParts(snapshot, 1)[0]).toMatchObject({
				type: 'tool',
				isComplete: undefined, // Not completed since no result arrived
			});
		});

		it('handles user message with mixed text and tool_result content', () => {
			const result = buildChatHistory(session([
				userMsg([
					{ type: 'text', text: 'Here is context: ' },
					{ type: 'tool_result', tool_use_id: 'orphan', content: 'result', is_error: false },
				]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			// The text should become a request; the tool_result is processed (but orphaned)
			expect(snapshot).toHaveLength(1);
			expect(snapshot[0]).toMatchObject({ type: 'request', prompt: 'Here is context: ' });
		});

		it('handles session starting with assistant message (no preceding user message)', () => {
			const result = buildChatHistory(session([
				assistantMsg([{ type: 'text', text: 'I was already running.' }]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot).toHaveLength(1);
			expect(snapshot[0]).toMatchObject({ type: 'response' });
		});

		it('handles tool_result for a tool_use_id that does not exist', () => {
			const result = buildChatHistory(session([
				userMsg('Start'),
				assistantMsg([{ type: 'text', text: 'Response' }]),
				toolResult('nonexistent-id', 'result'),
			]));

			// Should not throw, the orphaned tool result is just ignored
			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot).toHaveLength(2);
		});

		it('handles empty assistant content blocks', () => {
			const result = buildChatHistory(session([
				userMsg('Hello'),
				assistantMsg([]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			// Empty content produces no parts, so no response turn is created.
			// Only the request turn from the user message exists.
			expect(snapshot).toHaveLength(1);
			expect(snapshot[0]).toMatchObject({ type: 'request' });
		});

		it('handles whitespace-only user messages', () => {
			const result = buildChatHistory(session([
				userMsg('   \n\t  '),
				assistantMsg([{ type: 'text', text: 'Response' }]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			// Whitespace-only should not create a request turn
			expect(snapshot).toHaveLength(1);
			expect(snapshot[0]).toMatchObject({ type: 'response' });
		});

		it('appends system messages as separated markdown parts in the preceding response', () => {
			const systemMessage: StoredMessage = {
				uuid: 'sys-1',
				sessionId: 'test-session',
				timestamp: new Date(),
				parentUuid: null,
				type: 'system',
				message: { role: 'system' as const, content: 'Conversation compacted' },
			};

			const result = buildChatHistory(session([
				userMsg('Hello'),
				assistantMsg([{ type: 'text', text: 'Hi there' }]),
				systemMessage,
				userMsg('After compaction'),
				assistantMsg([{ type: 'text', text: 'Continuing' }]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			// Request, Response (with system appended), Request, Response
			expect(snapshot).toHaveLength(4);
			expect(snapshot[0]).toMatchObject({ type: 'request', prompt: 'Hello' });
			expect(snapshot[1]).toMatchObject({ type: 'response' });
			expect(snapshot[2]).toMatchObject({ type: 'request', prompt: 'After compaction' });
			expect(snapshot[3]).toMatchObject({ type: 'response' });

			// The system message should be appended as a second markdown part with separator
			const responseParts = getResponseParts(snapshot, 1);
			expect(responseParts).toHaveLength(2);
			expect(responseParts[0]).toMatchObject({ type: 'markdown', content: 'Hi there' });
			expect(responseParts[1]).toMatchObject({ type: 'markdown', content: '\n\n---\n\n*Conversation compacted*' });
		});

		it('creates a standalone response turn when system message appears with no preceding response', () => {
			const systemMessage: StoredMessage = {
				uuid: 'sys-1',
				sessionId: 'test-session',
				timestamp: new Date(),
				parentUuid: null,
				type: 'system',
				message: { role: 'system' as const, content: 'Conversation compacted' },
			};

			const result = buildChatHistory(session([
				systemMessage,
				userMsg('After compaction'),
				assistantMsg([{ type: 'text', text: 'Continuing' }]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			// System response (standalone since no preceding parts), Request, Response
			expect(snapshot).toHaveLength(3);
			expect(snapshot[0]).toMatchObject({ type: 'response' });
			expect(snapshot[1]).toMatchObject({ type: 'request', prompt: 'After compaction' });
			expect(snapshot[2]).toMatchObject({ type: 'response' });

			const systemParts = getResponseParts(snapshot, 0);
			expect(systemParts).toHaveLength(1);
			expect(systemParts[0]).toMatchObject({ type: 'markdown', content: '\n\n---\n\n*Conversation compacted*' });
		});
	});

	// #endregion

	// #region Subagent Tool Calls

	describe('subagent tool calls', () => {
		function subagentSession(agentId: string, messages: StoredMessage[], parentToolUseId?: string): ISubagentSession {
			return {
				agentId,
				parentToolUseId,
				messages,
				timestamp: new Date(),
			};
		}

		it('injects subagent tool calls after Task tool result', () => {
			const taskToolUseId = 'toolu_task_001';
			const subagentBashId = 'toolu_bash_sub_001';

			const subagent = subagentSession('agent-abc', [
				assistantMsg([{ type: 'tool_use', id: subagentBashId, name: 'Bash', input: { command: 'sleep 10' } }]),
				toolResult(subagentBashId, 'command completed'),
			], taskToolUseId);

			const result = buildChatHistory(session([
				userMsg('run a task'),
				assistantMsg([{ type: 'tool_use', id: taskToolUseId, name: 'Task', input: { description: 'Run sleep', prompt: 'sleep 10' } }]),
				toolResult(taskToolUseId, 'Task completed'),
				assistantMsg([{ type: 'text', text: 'Done!' }]),
			], [subagent]));

			// Should have: request, response
			expect(result).toHaveLength(2);

			const response = result[1] as vscode.ChatResponseTurn2;
			const toolParts = response.response.filter((p): p is vscode.ChatToolInvocationPart => p instanceof ChatToolInvocationPart);

			// Should have Task tool + subagent Bash tool
			expect(toolParts).toHaveLength(2);

			// First tool is the Task itself
			expect(toolParts[0].toolName).toBe('Task');
			expect(toolParts[0].toolCallId).toBe(taskToolUseId);
			expect(toolParts[0].isComplete).toBe(true);

			// Second tool is the subagent's Bash call
			expect(toolParts[1].toolName).toBe('Bash');
			expect(toolParts[1].toolCallId).toBe(subagentBashId);
			expect(toolParts[1].subAgentInvocationId).toBe(taskToolUseId);
			expect(toolParts[1].isComplete).toBe(true);
		});

		it('handles Agent tool name (renamed from Task in Claude Code v2.1.63)', () => {
			const agentToolUseId = 'toolu_agent_001';
			const subagentBashId = 'toolu_bash_sub_agent';

			const subagent = subagentSession('agent-new', [
				assistantMsg([{ type: 'tool_use', id: subagentBashId, name: 'Bash', input: { command: 'ls' } }]),
				toolResult(subagentBashId, 'files listed'),
			], agentToolUseId);

			const result = buildChatHistory(session([
				userMsg('run an agent'),
				assistantMsg([{ type: 'tool_use', id: agentToolUseId, name: 'Agent', input: { description: 'List files', prompt: 'ls' } }]),
				toolResult(agentToolUseId, 'Agent completed'),
				assistantMsg([{ type: 'text', text: 'Done!' }]),
			], [subagent]));

			expect(result).toHaveLength(2);

			const response = result[1] as vscode.ChatResponseTurn2;
			const toolParts = response.response.filter((p): p is vscode.ChatToolInvocationPart => p instanceof ChatToolInvocationPart);

			expect(toolParts).toHaveLength(2);
			expect(toolParts[0].toolName).toBe('Agent');
			expect(toolParts[0].toolCallId).toBe(agentToolUseId);
			expect(toolParts[1].toolName).toBe('Bash');
			expect(toolParts[1].subAgentInvocationId).toBe(agentToolUseId);
		});

		it('sets subAgentInvocationId on all subagent tool calls', () => {
			const taskToolUseId = 'toolu_task_002';

			const subagent = subagentSession('agent-xyz', [
				assistantMsg([{ type: 'tool_use', id: 'toolu_read_001', name: 'Read', input: { file_path: '/tmp/test.txt' } }]),
				toolResult('toolu_read_001', 'file contents'),
				assistantMsg([{ type: 'tool_use', id: 'toolu_edit_001', name: 'Edit', input: { file_path: '/tmp/test.txt', old_string: 'a', new_string: 'b' } }]),
				toolResult('toolu_edit_001', 'edit applied'),
			], taskToolUseId);

			const result = buildChatHistory(session([
				userMsg('edit a file'),
				assistantMsg([{ type: 'tool_use', id: taskToolUseId, name: 'Task', input: { description: 'Edit file', prompt: 'edit the file' } }]),
				toolResult(taskToolUseId, 'Edits done'),
				assistantMsg([{ type: 'text', text: 'All done.' }]),
			], [subagent]));

			const response = result[1] as vscode.ChatResponseTurn2;
			const toolParts = response.response.filter((p): p is vscode.ChatToolInvocationPart => p instanceof ChatToolInvocationPart);

			// Task + 2 subagent tools (Read returns undefined from createFormattedToolInvocation for Edit/Write)
			// Read should produce an invocation, Edit/Write return undefined
			// Let's just check all subagent tools have the correct subAgentInvocationId
			const subagentTools = toolParts.filter(t => t.subAgentInvocationId === taskToolUseId);
			expect(subagentTools.length).toBeGreaterThan(0);

			for (const tool of subagentTools) {
				expect(tool.subAgentInvocationId).toBe(taskToolUseId);
			}
		});

		it('handles session with no subagents (backward compatible)', () => {
			const result = buildChatHistory(session([
				userMsg('hello'),
				assistantMsg([{ type: 'text', text: 'hi' }]),
			]));

			expect(result).toHaveLength(2);
		});

		it('handles Task tool with no matching subagent', () => {
			const taskToolUseId = 'toolu_task_003';

			const result = buildChatHistory(session([
				userMsg('run a task'),
				assistantMsg([{ type: 'tool_use', id: taskToolUseId, name: 'Task', input: { description: 'Do something', prompt: 'do it' } }]),
				toolResult(taskToolUseId, 'Task completed'),
				assistantMsg([{ type: 'text', text: 'Done!' }]),
			]));

			const response = result[1] as vscode.ChatResponseTurn2;
			const toolParts = response.response.filter((p): p is vscode.ChatToolInvocationPart => p instanceof ChatToolInvocationPart);

			// Only the Task tool itself, no subagent tools
			expect(toolParts).toHaveLength(1);
			expect(toolParts[0].toolName).toBe('Task');
		});

		it('handles multiple Task tools with different subagents', () => {
			const task1Id = 'toolu_task_multi_1';
			const task2Id = 'toolu_task_multi_2';

			const subagent1 = subagentSession('agent-1', [
				assistantMsg([{ type: 'tool_use', id: 'toolu_bash_1', name: 'Bash', input: { command: 'echo hello' } }]),
				toolResult('toolu_bash_1', 'hello'),
			], task1Id);

			const subagent2 = subagentSession('agent-2', [
				assistantMsg([{ type: 'tool_use', id: 'toolu_bash_2', name: 'Bash', input: { command: 'echo world' } }]),
				toolResult('toolu_bash_2', 'world'),
			], task2Id);

			const result = buildChatHistory(session([
				userMsg('run two tasks'),
				assistantMsg([
					{ type: 'tool_use', id: task1Id, name: 'Task', input: { description: 'Task 1', prompt: 'echo hello' } },
					{ type: 'tool_use', id: task2Id, name: 'Task', input: { description: 'Task 2', prompt: 'echo world' } },
				]),
				toolResult(task1Id, 'Task 1 done'),
				toolResult(task2Id, 'Task 2 done'),
				assistantMsg([{ type: 'text', text: 'Both done!' }]),
			], [subagent1, subagent2]));

			const response = result[1] as vscode.ChatResponseTurn2;
			const toolParts = response.response.filter((p): p is vscode.ChatToolInvocationPart => p instanceof ChatToolInvocationPart);

			// 2 Task tools + 2 subagent Bash tools
			expect(toolParts).toHaveLength(4);

			// First two are the Task tools
			expect(toolParts[0].toolName).toBe('Task');
			expect(toolParts[1].toolName).toBe('Task');

			// Subagent tools follow their respective Task results
			const subagent1Tools = toolParts.filter(t => t.subAgentInvocationId === task1Id);
			expect(subagent1Tools).toHaveLength(1);
			expect(subagent1Tools[0].toolName).toBe('Bash');

			const subagent2Tools = toolParts.filter(t => t.subAgentInvocationId === task2Id);
			expect(subagent2Tools).toHaveLength(1);
			expect(subagent2Tools[0].toolName).toBe('Bash');
		});

		it('correctly associates subagents when Task results are interleaved with non-Task results', () => {
			const taskId = 'toolu_task_interleave';
			const bashId = 'toolu_bash_main';

			const subagent = subagentSession('agent-interleave', [
				assistantMsg([{ type: 'tool_use', id: 'toolu_sub_glob', name: 'Glob', input: { pattern: '*.ts' } }]),
				toolResult('toolu_sub_glob', 'found files'),
			], taskId);

			const result = buildChatHistory(session([
				userMsg('do stuff'),
				assistantMsg([
					{ type: 'tool_use', id: bashId, name: 'Bash', input: { command: 'echo hi' } },
					{ type: 'tool_use', id: taskId, name: 'Task', input: { description: 'Sub task', prompt: 'find files' } },
				]),
				// Non-Task tool result first, then Task result — separate StoredMessages
				toolResult(bashId, 'hi'),
				toolResult(taskId, 'Sub task done'),
				assistantMsg([{ type: 'text', text: 'All done.' }]),
			], [subagent]));

			const response = result[1] as vscode.ChatResponseTurn2;
			const toolParts = response.response.filter((p): p is vscode.ChatToolInvocationPart => p instanceof ChatToolInvocationPart);

			// Bash (main) + Task + subagent Glob = 3 tools
			expect(toolParts).toHaveLength(3);
			expect(toolParts[0].toolName).toBe('Bash');
			expect(toolParts[0].subAgentInvocationId).toBeUndefined();

			expect(toolParts[1].toolName).toBe('Task');
			expect(toolParts[1].subAgentInvocationId).toBeUndefined();

			// Subagent tool is correctly linked to the Task, not the Bash tool
			const subagentTools = toolParts.filter(t => t.subAgentInvocationId === taskId);
			expect(subagentTools).toHaveLength(1);
			expect(subagentTools[0].toolName).toBe('Glob');
		});

		it('handles mixed Agent and Task tool names in same session', () => {
			const taskId = 'toolu_task_old';
			const agentId = 'toolu_agent_new';

			const subagent1 = subagentSession('old-agent', [
				assistantMsg([{ type: 'tool_use', id: 'toolu_bash_old', name: 'Bash', input: { command: 'echo old' } }]),
				toolResult('toolu_bash_old', 'old'),
			], taskId);

			const subagent2 = subagentSession('new-agent', [
				assistantMsg([{ type: 'tool_use', id: 'toolu_bash_new', name: 'Bash', input: { command: 'echo new' } }]),
				toolResult('toolu_bash_new', 'new'),
			], agentId);

			const result = buildChatHistory(session([
				userMsg('do stuff'),
				assistantMsg([
					{ type: 'tool_use', id: taskId, name: 'Task', input: { description: 'Old task', prompt: 'old' } },
					{ type: 'tool_use', id: agentId, name: 'Agent', input: { description: 'New agent', prompt: 'new' } },
				]),
				toolResult(taskId, 'Old done'),
				toolResult(agentId, 'New done'),
				assistantMsg([{ type: 'text', text: 'Both done.' }]),
			], [subagent1, subagent2]));

			const response = result[1] as vscode.ChatResponseTurn2;
			const toolParts = response.response.filter((p): p is vscode.ChatToolInvocationPart => p instanceof ChatToolInvocationPart);

			// Task + its subagent Bash + Agent + its subagent Bash = 4
			expect(toolParts).toHaveLength(4);
			expect(toolParts[0].toolName).toBe('Task');
			expect(toolParts[1].toolName).toBe('Agent');
			expect(toolParts.filter(t => t.subAgentInvocationId === taskId)).toHaveLength(1);
			expect(toolParts.filter(t => t.subAgentInvocationId === agentId)).toHaveLength(1);
		});

		it('excludes subagents without parentToolUseId from injection', () => {
			const taskToolUseId = 'toolu_task_orphan';

			const orphanSubagent = subagentSession('orphan-agent', [
				assistantMsg([{ type: 'tool_use', id: 'toolu_bash_orphan', name: 'Bash', input: { command: 'echo orphan' } }]),
				toolResult('toolu_bash_orphan', 'orphan output'),
			]);

			const result = buildChatHistory(session([
				userMsg('run a task'),
				assistantMsg([{ type: 'tool_use', id: taskToolUseId, name: 'Agent', input: { description: 'Do work', prompt: 'work' } }]),
				toolResult(taskToolUseId, 'Done'),
				assistantMsg([{ type: 'text', text: 'Finished.' }]),
			], [orphanSubagent]));

			const response = result[1] as vscode.ChatResponseTurn2;
			const toolParts = response.response.filter((p): p is vscode.ChatToolInvocationPart => p instanceof ChatToolInvocationPart);

			// Only the Agent tool itself, no subagent tools injected
			expect(toolParts).toHaveLength(1);
			expect(toolParts[0].toolName).toBe('Agent');
			expect(toolParts[0].subAgentInvocationId).toBeUndefined();
		});
	});

	// #endregion

	// #region Image References

	describe('image references', () => {
		it('creates request turn with image references from base64 image blocks', () => {
			const result = buildChatHistory(session([
				userMsg([
					{
						type: 'image',
						source: {
							type: 'base64',
							media_type: 'image/png',
							data: 'iVBORw0KGgo=',
						},
					} as Anthropic.ImageBlockParam,
					{ type: 'text', text: 'What is this?' },
				]),
				assistantMsg([{ type: 'text', text: 'An image.' }]),
			]));

			expect(result).toHaveLength(2);
			const requestTurn = result[0] as vscode.ChatRequestTurn2;
			expect(requestTurn.prompt).toBe('What is this?');
			expect(requestTurn.references).toHaveLength(1);

			const ref = requestTurn.references[0];
			expect(ref.value).toBeInstanceOf(ChatReferenceBinaryData);
			const binaryData = ref.value as InstanceType<typeof ChatReferenceBinaryData>;
			expect(binaryData.mimeType).toBe('image/png');
		});

		it('reconstructs binary data from base64 in image references', async () => {
			const result = buildChatHistory(session([
				userMsg([
					{
						type: 'image',
						source: {
							type: 'base64',
							media_type: 'image/jpeg',
							data: Buffer.from([0xFF, 0xD8]).toString('base64'),
						},
					} as Anthropic.ImageBlockParam,
					{ type: 'text', text: 'Describe' },
				]),
			]));

			const requestTurn = result[0] as vscode.ChatRequestTurn2;
			const binaryData = requestTurn.references[0].value as InstanceType<typeof ChatReferenceBinaryData>;
			const data = await binaryData.data();
			expect(Buffer.from(data)).toEqual(Buffer.from([0xFF, 0xD8]));
		});

		it('creates request turn with multiple image references', () => {
			const result = buildChatHistory(session([
				userMsg([
					{
						type: 'image',
						source: { type: 'base64', media_type: 'image/png', data: 'aQ==' },
					} as Anthropic.ImageBlockParam,
					{
						type: 'image',
						source: { type: 'base64', media_type: 'image/jpeg', data: 'bQ==' },
					} as Anthropic.ImageBlockParam,
					{ type: 'text', text: 'Compare these' },
				]),
			]));

			const requestTurn = result[0] as vscode.ChatRequestTurn2;
			expect(requestTurn.references).toHaveLength(2);
			expect((requestTurn.references[0].value as InstanceType<typeof ChatReferenceBinaryData>).mimeType).toBe('image/png');
			expect((requestTurn.references[1].value as InstanceType<typeof ChatReferenceBinaryData>).mimeType).toBe('image/jpeg');
		});

		it('creates request turn for image-only messages with no text', () => {
			const result = buildChatHistory(session([
				userMsg([
					{
						type: 'image',
						source: { type: 'base64', media_type: 'image/png', data: 'aQ==' },
					} as Anthropic.ImageBlockParam,
				]),
			]));

			// Even with no text, should produce a request turn because of the image
			expect(result).toHaveLength(1);
			const requestTurn = result[0] as vscode.ChatRequestTurn2;
			expect(requestTurn.references).toHaveLength(1);
		});

		it('creates URI reference for URL-based image blocks', () => {
			const result = buildChatHistory(session([
				userMsg([
					{
						type: 'image',
						source: { type: 'url', url: 'https://example.com/img.png' },
					} as Anthropic.ImageBlockParam,
					{ type: 'text', text: 'What is this?' },
				]),
			]));

			const requestTurn = result[0] as vscode.ChatRequestTurn2;
			expect(requestTurn.references).toHaveLength(1);
			const ref = requestTurn.references[0];
			expect(URI.isUri(ref.value)).toBe(true);
			expect((ref.value as URI).toString()).toBe('https://example.com/img.png');
		});
	});

	// #endregion

	// #region Slash Command Messages

	describe('slash command messages', () => {
		it('renders /compact command as request turn with stdout as response turn', () => {
			const result = buildChatHistory(session([
				userMsg('Hello'),
				assistantMsg([{ type: 'text', text: 'Hi there' }]),
				// Command message with <command-name> tags
				userMsg([
					{ type: 'text', text: '<system-reminder>\nContext.\n</system-reminder>' },
					{ type: 'text', text: '<command-name>/compact</command-name>\n            <command-message>compact</command-message>\n            <command-args></command-args>' },
				]),
				// Command stdout in a separate user message
				userMsg('<local-command-stdout>Compacted PreCompact [callback] completed successfully</local-command-stdout>'),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			// Request, Response, Command Request, Command Response
			expect(snapshot).toHaveLength(4);
			expect(snapshot[0]).toMatchObject({ type: 'request', prompt: 'Hello' });
			expect(snapshot[1]).toMatchObject({ type: 'response' });
			expect(snapshot[2]).toMatchObject({ type: 'request', prompt: '/compact' });
			expect(snapshot[3]).toMatchObject({
				type: 'response',
				parts: [{ type: 'markdown', content: 'Compacted PreCompact [callback] completed successfully' }],
			});
		});

		it('renders /init command as request turn without stdout', () => {
			const result = buildChatHistory(session([
				// Init command message (string format from real fixture)
				userMsg('<command-message>init is analyzing your codebase…</command-message>\n<command-name>/init</command-name>'),
				assistantMsg([{ type: 'text', text: 'Analyzing...' }]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot).toHaveLength(2);
			expect(snapshot[0]).toMatchObject({ type: 'request', prompt: '/init' });
			expect(snapshot[1]).toMatchObject({ type: 'response' });
		});

		it('finalizes pending response before command request turn', () => {
			const result = buildChatHistory(session([
				userMsg('Do task'),
				assistantMsg([
					{ type: 'text', text: 'Working...' },
					{ type: 'tool_use', id: 't1', name: 'bash', input: { command: 'echo done' } },
				]),
				toolResult('t1', 'done'),
				assistantMsg([{ type: 'text', text: 'Finished.' }]),
				// Now the user runs /compact
				userMsg([
					{ type: 'text', text: '<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args></command-args>' },
				]),
				userMsg('<local-command-stdout>Compacted successfully</local-command-stdout>'),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			// Request, Response (with tool + text), Command Request, Command Response
			expect(snapshot).toHaveLength(4);
			expect(snapshot[0]).toMatchObject({ type: 'request', prompt: 'Do task' });
			expect(snapshot[1]).toMatchObject({ type: 'response' });
			expect(snapshot[2]).toMatchObject({ type: 'request', prompt: '/compact' });
			expect(snapshot[3]).toMatchObject({
				type: 'response',
				parts: [{ type: 'markdown', content: 'Compacted successfully' }],
			});
		});

		it('handles command without stdout (no response turn emitted)', () => {
			const result = buildChatHistory(session([
				userMsg([
					{ type: 'text', text: '<command-name>/help</command-name>\n<command-message>help</command-message>\n<command-args></command-args>' },
				]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			// Only the command request turn, no response
			expect(snapshot).toHaveLength(1);
			expect(snapshot[0]).toMatchObject({ type: 'request', prompt: '/help' });
		});

		it('renders full compact sequence: system message, command, and stdout', () => {
			const systemMessage: StoredMessage = {
				uuid: 'sys-1',
				sessionId: 'test-session',
				timestamp: new Date(),
				parentUuid: null,
				type: 'system',
				message: { role: 'system' as const, content: 'Conversation compacted' },
			};

			const result = buildChatHistory(session([
				userMsg('Hello'),
				assistantMsg([{ type: 'text', text: 'Hi there' }]),
				// System compact_boundary
				systemMessage,
				// /compact command
				userMsg([
					{ type: 'text', text: '<system-reminder>\nContext.\n</system-reminder>' },
					{ type: 'text', text: '<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args></command-args>' },
				]),
				// Stdout
				userMsg('<local-command-stdout>Compacted successfully</local-command-stdout>'),
				// In real sessions, a synthetic assistant message separates the command from the next turn
				assistantMsg([{ type: 'text', text: 'No response requested.' }], '<synthetic>'),
				// Conversation continues
				userMsg('What were we talking about?'),
				assistantMsg([{ type: 'text', text: 'We were discussing...' }]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			// Request, Response (with system appended), Command Request, Command Response, Request, Response
			expect(snapshot).toHaveLength(6);
			expect(snapshot[0]).toMatchObject({ type: 'request', prompt: 'Hello' });
			expect(snapshot[1]).toMatchObject({ type: 'response' });
			expect(snapshot[2]).toMatchObject({ type: 'request', prompt: '/compact' });
			expect(snapshot[3]).toMatchObject({ type: 'response', parts: [{ type: 'markdown', content: 'Compacted successfully' }] });
			expect(snapshot[4]).toMatchObject({ type: 'request', prompt: 'What were we talking about?' });
			expect(snapshot[5]).toMatchObject({ type: 'response' });

			// The first response should have the assistant text + system separator
			const responseParts = getResponseParts(snapshot, 1);
			expect(responseParts).toHaveLength(2);
			expect(responseParts[0]).toMatchObject({ type: 'markdown', content: 'Hi there' });
			expect(responseParts[1]).toMatchObject({ type: 'markdown', content: '\n\n---\n\n*Conversation compacted*' });
		});
	});

	// #endregion

	// #region Synthetic Message Filtering

	describe('Synthetic Message Filtering', () => {
		it('filters out synthetic assistant messages', () => {
			const s = session([
				userMsg('Hello'),
				assistantMsg([{ type: 'text', text: 'Hi there!' }]),
				userMsg('Do something'),
				assistantMsg([{ type: 'text', text: 'No response requested.' }], '<synthetic>'),
			]);

			const result = buildChatHistory(s);
			const snapshot = mapHistoryForSnapshot(result);

			// The synthetic message should be filtered out entirely
			expect(snapshot).toEqual([
				{ type: 'request', prompt: 'Hello' },
				{ type: 'response', parts: [{ type: 'markdown', content: 'Hi there!' }] },
				{ type: 'request', prompt: 'Do something' },
				// No response from the synthetic message
			]);
		});

		it('preserves non-synthetic assistant messages around synthetic ones', () => {
			const s = session([
				userMsg('Hello'),
				assistantMsg([{ type: 'text', text: 'Real response' }]),
				assistantMsg([{ type: 'text', text: 'No response requested.' }], '<synthetic>'),
			]);

			const result = buildChatHistory(s);
			const snapshot = mapHistoryForSnapshot(result);

			expect(snapshot).toEqual([
				{ type: 'request', prompt: 'Hello' },
				{ type: 'response', parts: [{ type: 'markdown', content: 'Real response' }] },
			]);
		});

		it('filters synthetic messages in the middle of a tool loop', () => {
			const result = buildChatHistory(session([
				userMsg('Do task'),
				assistantMsg([
					{ type: 'text', text: 'Working...' },
					{ type: 'tool_use', id: 't1', name: 'bash', input: { command: 'echo hi' } },
				]),
				toolResult('t1', 'hi'),
				// Synthetic message mid-loop (e.g., from an abort)
				assistantMsg([{ type: 'text', text: 'No response requested.' }], '<synthetic>'),
				// Real assistant continues
				assistantMsg([{ type: 'text', text: 'Done.' }]),
			]));

			const snapshot = mapHistoryForSnapshot(result);
			expect(snapshot).toHaveLength(2);
			expect(snapshot[0]).toMatchObject({ type: 'request', prompt: 'Do task' });

			// The response should contain the tool call, the text before, and the text after — but not the synthetic message
			const parts = getResponseParts(snapshot, 1);
			const markdownParts = parts.filter(p => p.type === 'markdown');
			expect(markdownParts).toEqual([
				{ type: 'markdown', content: 'Working...' },
				{ type: 'markdown', content: 'Done.' },
			]);
			// No "No response requested." in any part
			expect(parts.every(p => p.type !== 'markdown' || (p as Record<string, unknown>).content !== 'No response requested.')).toBe(true);
		});
	});

	// #endregion

	// #region Model ID Resolution

	describe('model ID resolution via parseClaudeModelId', () => {
		it('converts SDK model ID to endpoint format on request turns', () => {
			const s = session([
				userMsg('Hello'),
				assistantMsg([{ type: 'text', text: 'Hi' }], 'claude-opus-4-5-20251101'),
			]);

			const result = buildChatHistory(s);

			const requestTurn = result[0] as vscode.ChatRequestTurn2;
			expect(requestTurn).toBeInstanceOf(ChatRequestTurn2);
			expect(requestTurn.modelId).toBe('claude-opus-4.5');
		});

		it('falls back to raw model ID when parsing fails', () => {
			const s = session([
				userMsg('Hello'),
				assistantMsg([{ type: 'text', text: 'Hi' }], 'unknown-model-id'),
			]);

			const result = buildChatHistory(s);

			const requestTurn = result[0] as vscode.ChatRequestTurn2;
			expect(requestTurn.modelId).toBe('unknown-model-id');
		});

		it('skips synthetic assistant messages when resolving model ID', () => {
			const s = session([
				userMsg('Hello'),
				assistantMsg([{ type: 'text', text: 'No response requested.' }], SYNTHETIC_MODEL_ID),
				assistantMsg([{ type: 'text', text: 'Real response' }], 'claude-sonnet-4-20250514'),
			]);

			const result = buildChatHistory(s);

			const requestTurn = result[0] as vscode.ChatRequestTurn2;
			expect(requestTurn.modelId).toBe('claude-sonnet-4');
		});

		it('returns undefined modelId when no assistant message follows', () => {
			const s = session([
				userMsg('Hello'),
			]);

			const result = buildChatHistory(s);

			const requestTurn = result[0] as vscode.ChatRequestTurn2;
			expect(requestTurn.modelId).toBeUndefined();
		});

		it('uses the correct model for each request in multi-turn conversations', () => {
			const s = session([
				userMsg('First question'),
				assistantMsg([{ type: 'text', text: 'First answer' }], 'claude-sonnet-4-20250514'),
				userMsg('Second question'),
				assistantMsg([{ type: 'text', text: 'Second answer' }], 'claude-opus-4-5-20251101'),
			]);

			const result = buildChatHistory(s);

			const firstRequest = result[0] as vscode.ChatRequestTurn2;
			expect(firstRequest.modelId).toBe('claude-sonnet-4');

			const secondRequest = result[2] as vscode.ChatRequestTurn2;
			expect(secondRequest.modelId).toBe('claude-opus-4.5');
		});

		it('tags command request turns with converted model ID', () => {
			const s = session([
				userMsg('<command-name>/compact</command-name><command-message>compact</command-message>'),
				assistantMsg([{ type: 'text', text: 'Compacted.' }], 'claude-sonnet-4-20250514'),
			]);

			const result = buildChatHistory(s);

			const commandTurn = result[0] as vscode.ChatRequestTurn2;
			expect(commandTurn.prompt).toBe('/compact');
			expect(commandTurn.modelId).toBe('claude-sonnet-4');
		});

		it('preserves endpoint-format model IDs as-is', () => {
			const s = session([
				userMsg('Hello'),
				assistantMsg([{ type: 'text', text: 'Hi' }], 'claude-opus-4.5'),
			]);

			const result = buildChatHistory(s);

			const requestTurn = result[0] as vscode.ChatRequestTurn2;
			expect(requestTurn.modelId).toBe('claude-opus-4.5');
		});
	});

	// #endregion
});
