/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { URI } from '../../../../base/common/uri.js';
import { NullLogService } from '../../../log/common/log.js';
import { ResponsePartKind, ToolCallStatus, ToolResultContentType, TurnState } from '../../common/state/protocol/state.js';
import { mapSessionMessagesToTurns } from '../../node/claude/claudeReplayMapper.js';

suite('claudeReplayMapper', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const logService = new NullLogService();
	const session = URI.parse('claude:/sess-1');

	function makeUser(uuid: string, text: string): SessionMessage {
		return {
			type: 'user',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			message: { role: 'user', content: [{ type: 'text', text }] },
		};
	}

	function makeAssistantText(uuid: string, text: string): SessionMessage {
		return {
			type: 'assistant',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			message: { id: `msg_${uuid}`, role: 'assistant', content: [{ type: 'text', text }] },
		};
	}

	function makeAssistantToolUse(uuid: string, toolUseId: string, name: string, input: unknown = {}): SessionMessage {
		return {
			type: 'assistant',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			message: {
				id: `msg_${uuid}`,
				role: 'assistant',
				content: [{ type: 'tool_use', id: toolUseId, name, input }],
			},
		};
	}

	function makeUserToolResult(uuid: string, toolUseId: string, text: string, isError = false): SessionMessage {
		return {
			type: 'user',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			message: {
				role: 'user',
				content: [{ type: 'tool_result', tool_use_id: toolUseId, content: text, ...(isError ? { is_error: true } : {}) }],
			},
		};
	}

	function makeSystem(uuid: string, subtype: string, text?: string): SessionMessage {
		return {
			type: 'system',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			message: { subtype, ...(text !== undefined ? { text } : {}) },
		};
	}

	test('Fixture 1: single text turn', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'hello'),
			makeAssistantText('a1', 'world'),
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		assert.strictEqual(turns.length, 1);
		assert.strictEqual(turns[0].id, 'u1', 'Turn.id MUST equal user SessionMessage.uuid');
		assert.strictEqual(turns[0].userMessage.text, 'hello');
		assert.strictEqual(turns[0].usage, undefined, 'replay never has usage');
		assert.strictEqual(turns[0].state, TurnState.Complete);
		assert.strictEqual(turns[0].responseParts.length, 1);
		const part = turns[0].responseParts[0];
		assert.strictEqual(part.kind, ResponsePartKind.Markdown);
		if (part.kind === ResponsePartKind.Markdown) {
			assert.strictEqual(part.content, 'world');
		}
	});

	test('Fixture 2: tool_use + tool_result is one Turn with one Completed ToolCall', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'list files'),
			makeAssistantToolUse('a1', 'tu1', 'Bash', { command: 'ls' }),
			makeUserToolResult('synthetic1', 'tu1', 'file1.txt\nfile2.txt'),
			makeAssistantText('a2', 'two files'),
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		assert.strictEqual(turns.length, 1, 'tool_result MUST NOT start a new turn');
		assert.strictEqual(turns[0].state, TurnState.Complete);
		const toolCallParts = turns[0].responseParts.filter(p => p.kind === ResponsePartKind.ToolCall);
		assert.strictEqual(toolCallParts.length, 1);
		const toolCall = toolCallParts[0];
		assert.strictEqual(toolCall.kind, ResponsePartKind.ToolCall);
		if (toolCall.kind === ResponsePartKind.ToolCall) {
			assert.strictEqual(toolCall.toolCall.status, ToolCallStatus.Completed);
			assert.strictEqual(toolCall.toolCall.toolName, 'Bash');
			if (toolCall.toolCall.status === ToolCallStatus.Completed) {
				assert.strictEqual(toolCall.toolCall.success, true);
				assert.deepStrictEqual(toolCall.toolCall.content, [{ type: ToolResultContentType.Text, text: 'file1.txt\nfile2.txt' }]);
			}
		}
	});

	test('Fixture 3: multi-turn produces ordered Turns', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'first'),
			makeAssistantText('a1', 'reply 1'),
			makeUser('u2', 'second'),
			makeAssistantText('a2', 'reply 2'),
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		assert.strictEqual(turns.length, 2);
		assert.strictEqual(turns[0].id, 'u1');
		assert.strictEqual(turns[1].id, 'u2');
	});

	test('Fixture 4: compact_boundary attaches as SystemNotification on the active turn', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'first'),
			makeAssistantText('a1', 'reply 1'),
			makeSystem('s1', 'compact_boundary', 'context compacted'),
			makeAssistantText('a2', 'reply 2'),
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		assert.strictEqual(turns.length, 1, 'compact_boundary is NOT a turn boundary');
		const sysParts = turns[0].responseParts.filter(p => p.kind === ResponsePartKind.SystemNotification);
		assert.strictEqual(sysParts.length, 1);
	});

	test('Fixture 5: Task / Agent tool_use produces subagent marker', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'spawn subagent'),
			makeAssistantToolUse('a1', 'tu1', 'Task', { description: 'do thing' }),
			makeUserToolResult('synthetic1', 'tu1', 'subagent done'),
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		const toolCallPart = turns[0].responseParts.find(p => p.kind === ResponsePartKind.ToolCall);
		assert.ok(toolCallPart, 'expected a ToolCall part');
		if (toolCallPart && toolCallPart.kind === ResponsePartKind.ToolCall) {
			assert.strictEqual(toolCallPart.toolCall._meta?.toolKind, 'subagent');
			if (toolCallPart.toolCall.status === ToolCallStatus.Completed) {
				const hasSubagentMarker = toolCallPart.toolCall.content?.some(c => c.type === ToolResultContentType.Subagent);
				assert.strictEqual(hasSubagentMarker, true, 'subagent marker block must be present');
			} else {
				assert.fail(`expected Completed status, got ${toolCallPart.toolCall.status}`);
			}
		}
	});

	test('Fixture 5b: Agent tool name also recognised as subagent', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'spawn subagent'),
			makeAssistantToolUse('a1', 'tu1', 'Agent', { description: 'do thing' }),
			makeUserToolResult('synthetic1', 'tu1', 'done'),
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		const toolCallPart = turns[0].responseParts.find(p => p.kind === ResponsePartKind.ToolCall);
		assert.ok(toolCallPart && toolCallPart.kind === ResponsePartKind.ToolCall);
		if (toolCallPart.kind === ResponsePartKind.ToolCall) {
			assert.strictEqual(toolCallPart.toolCall._meta?.toolKind, 'subagent');
		}
	});

	test('Fixture 6: tail Turn with orphan tool_use is Cancelled', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'do work'),
			makeAssistantToolUse('a1', 'tu-orphan', 'Bash', { command: 'sleep 100' }),
			// no matching tool_result — model crashed mid-turn
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		assert.strictEqual(turns.length, 1);
		assert.strictEqual(turns[0].state, TurnState.Cancelled);
	});

	test('Fixture 6b: orphan in turn N does NOT cancel turn N+1', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'first'),
			makeAssistantToolUse('a1', 'tu-orphan', 'Bash', {}),
			// no tool_result for tu-orphan
			makeUser('u2', 'second'),
			makeAssistantText('a2', 'clean reply'),
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		assert.strictEqual(turns.length, 2);
		assert.strictEqual(turns[0].state, TurnState.Cancelled, 'turn 1 has orphan');
		assert.strictEqual(turns[1].state, TurnState.Complete, 'turn 2 has no orphan');
	});

	test('Fixture 7: non-allowlisted system subtypes are dropped', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'go'),
			makeAssistantText('a1', 'reply'),
			makeSystem('s1', 'api_retry', 'retrying'),
			makeSystem('s2', 'hook_started', 'hook x'),
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		const sysParts = turns[0].responseParts.filter(p => p.kind === ResponsePartKind.SystemNotification);
		assert.strictEqual(sysParts.length, 0);
	});

	test('Fixture 9: CLI slash-command echo and local-command-stdout entries are dropped', () => {
		// On-disk shape verified empirically (claude-history skill):
		// the `/model` echo lacks `isSynthetic` / `isMeta`, content is a
		// raw string starting with `<command-name>`. Same for the
		// `<local-command-stdout>` paired entry.
		const messages: SessionMessage[] = [
			makeUser('u1', 'what model are you'),
			makeAssistantText('a1', 'sonnet'),
			{
				type: 'user',
				uuid: 'echo-1',
				session_id: 'sess-1',
				parent_tool_use_id: null,
				message: { role: 'user', content: '<command-name>/model</command-name>\n            <command-message>model</command-message>\n            <command-args>claude-opus-4.7</command-args>' },
			},
			{
				type: 'user',
				uuid: 'echo-2',
				session_id: 'sess-1',
				parent_tool_use_id: null,
				message: { role: 'user', content: '<local-command-stdout>Set model to claude-opus-4.7</local-command-stdout>' },
			},
			makeUser('u2', 'how about now'),
			makeAssistantText('a2', 'opus'),
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		assert.strictEqual(turns.length, 2, 'CLI-echo user envelopes must NOT start new turns');
		assert.strictEqual(turns[0].id, 'u1');
		assert.strictEqual(turns[0].userMessage.text, 'what model are you');
		assert.strictEqual(turns[1].id, 'u2');
		assert.strictEqual(turns[1].userMessage.text, 'how about now');
	});
});
