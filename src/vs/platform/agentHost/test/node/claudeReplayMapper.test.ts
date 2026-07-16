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
import { mapSessionMessagesToTurns, resolveForkAnchorUuid } from '../../node/claude/claudeReplayMapper.js';

suite('claudeReplayMapper', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const logService = new NullLogService();
	const session = URI.parse('claude:/sess-1');
	type TimestampedSessionMessage = SessionMessage & { readonly timestamp?: string };

	function makeUser(uuid: string, text: string, timestamp?: string): TimestampedSessionMessage {
		return {
			type: 'user',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			message: { role: 'user', content: [{ type: 'text', text }] },
			timestamp,
		};
	}

	function makeAssistantText(uuid: string, text: string, timestamp?: string): TimestampedSessionMessage {
		return {
			type: 'assistant',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			message: { id: `msg_${uuid}`, role: 'assistant', content: [{ type: 'text', text }] },
			timestamp,
		};
	}

	function makeAssistantToolUse(uuid: string, toolUseId: string, name: string, input: unknown = {}, timestamp?: string): TimestampedSessionMessage {
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
			timestamp,
		};
	}

	function makeUserToolResult(uuid: string, toolUseId: string, text: string, isError = false, timestamp?: string): TimestampedSessionMessage {
		return {
			type: 'user',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			message: {
				role: 'user',
				content: [{ type: 'tool_result', tool_use_id: toolUseId, content: text, ...(isError ? { is_error: true } : {}) }],
			},
			timestamp,
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
		assert.strictEqual(turns[0].message.text, 'hello');
		assert.strictEqual(turns[0].usage, undefined, 'replay never has usage');
		assert.strictEqual(turns[0].state, TurnState.Complete);
		assert.strictEqual(turns[0].responseParts.length, 1);
		const part = turns[0].responseParts[0];
		assert.strictEqual(part.kind, ResponsePartKind.Markdown);
		if (part.kind === ResponsePartKind.Markdown) {
			assert.strictEqual(part.content, 'world');
		}
	});

	test('restores turn timing from persisted message timestamps', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'hello', '2026-07-09T18:00:00.000Z'),
			makeAssistantText('a1', 'world', '2026-07-09T18:00:02.500Z'),
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		assert.deepStrictEqual({
			startedAt: turns[0].startedAt,
			duration: turns[0].duration,
		}, {
			startedAt: '2026-07-09T18:00:00.000Z',
			duration: 2_500,
		});
	});

	test('leaves turn timing unknown when persisted timestamps are missing or invalid', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'hello', 'invalid'),
			makeAssistantText('a1', 'world'),
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		assert.deepStrictEqual({
			startedAt: turns[0].startedAt,
			duration: turns[0].duration,
		}, {
			startedAt: undefined,
			duration: undefined,
		});
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

	test('late tool results do not extend the active turn duration', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'first', '2026-07-09T18:00:00.000Z'),
			makeAssistantToolUse('a1', 'tu-late', 'Bash', {}, '2026-07-09T18:00:01.000Z'),
			makeUser('u2', 'second', '2026-07-09T18:00:10.000Z'),
			makeAssistantText('a2', 'clean reply', '2026-07-09T18:00:12.000Z'),
			makeUserToolResult('late-result', 'tu-late', 'done', false, '2026-07-09T18:00:20.000Z'),
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		assert.deepStrictEqual(turns.map(turn => turn.duration), [1_000, 2_000]);
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
		assert.strictEqual(turns[0].message.text, 'what model are you');
		assert.strictEqual(turns[1].id, 'u2');
		assert.strictEqual(turns[1].message.text, 'how about now');
	});

	test('Fixture 10: prompt-less subagent transcript (inner messages) maps to one turn', () => {
		// A subagent transcript from `getSubagentMessages` carries a
		// `parent_tool_use_id` on every envelope and has NO synthetic spawning
		// user prompt, so it opens directly with an assistant message. The
		// builder must synthesize an empty-prompt turn rather than dropping the
		// inner assistant content (which would lose the whole transcript on
		// replay). Shape mirrors a real captured subagent transcript.
		const parent = 'toolu_parent';
		const messages: SessionMessage[] = [
			{
				type: 'assistant', uuid: 'sa1', session_id: 'sess-1', parent_tool_use_id: parent,
				message: { id: 'msg_sa1', role: 'assistant', content: [{ type: 'thinking', thinking: 'planning', signature: 'sig' }] },
			},
			{
				type: 'assistant', uuid: 'sa2', session_id: 'sess-1', parent_tool_use_id: parent,
				message: { id: 'msg_sa2', role: 'assistant', content: [{ type: 'tool_use', id: 'tu_inner', name: 'Bash', input: { command: 'ls' } }] },
			},
			{
				type: 'user', uuid: 'sa3', session_id: 'sess-1', parent_tool_use_id: parent,
				message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_inner', content: 'file-a.txt\nfile-b.txt' }] },
			},
			{
				type: 'assistant', uuid: 'sa4', session_id: 'sess-1', parent_tool_use_id: parent,
				message: { id: 'msg_sa4', role: 'assistant', content: [{ type: 'text', text: 'Done. SUBAGENT_ONLY_MARKER_xyz' }] },
			},
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		assert.strictEqual(turns.length, 1, 'inner assistant messages must form a single synthesized turn');
		assert.strictEqual(turns[0].id, 'sa1', 'turn id anchors on the first inner assistant envelope');
		assert.strictEqual(turns[0].message.text, '', 'subagent turn has no user prompt');
		assert.strictEqual(turns[0].state, TurnState.Complete, 'tool_result drains the pending tool_use');
		const markdown = turns[0].responseParts.filter(p => p.kind === ResponsePartKind.Markdown);
		assert.ok(markdown.some(p => p.kind === ResponsePartKind.Markdown && p.content.includes('SUBAGENT_ONLY_MARKER_xyz')),
			'the subagent final text (with marker) must survive replay');
		const toolCall = turns[0].responseParts.find(p => p.kind === ResponsePartKind.ToolCall);
		assert.ok(toolCall && toolCall.kind === ResponsePartKind.ToolCall && toolCall.toolCall.status === ToolCallStatus.Completed,
			'inner Bash tool call must be reconstructed as Completed');
	});

	test('Fixture 10b: top-level assistant before any user message is still dropped', () => {
		// Guard the narrow behavior: a top-level (non-inner) assistant envelope
		// arriving before any user message remains anomalous and is dropped, so
		// the synthesize-on-open path is scoped strictly to subagent transcripts.
		const messages: SessionMessage[] = [
			makeAssistantText('a1', 'orphan reply'),
			makeUser('u1', 'hello'),
			makeAssistantText('a2', 'world'),
		];

		const turns = mapSessionMessagesToTurns(messages, session, logService);

		assert.strictEqual(turns.length, 1, 'the orphan top-level assistant must NOT synthesize a turn');
		assert.strictEqual(turns[0].id, 'u1');
	});
});

suite('resolveForkAnchorUuid', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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
			message: { id: `msg_${uuid}`, role: 'assistant', content: [{ type: 'tool_use', id: toolUseId, name, input }] },
		};
	}

	function makeUserToolResult(uuid: string, toolUseId: string, text: string): SessionMessage {
		return {
			type: 'user',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: text }] },
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

	// 3-turn transcript shared by the fork-position fixtures.
	const threeTurns: SessionMessage[] = [
		makeUser('u1', 'apple'),
		makeAssistantText('a1', 'apple!'),
		makeUser('u2', 'banana'),
		makeAssistantText('a2', 'banana!'),
		makeUser('u3', 'cherry'),
		makeAssistantText('a3', 'cherry!'),
	];

	test('fork at turn 0 → last assistant uuid of turn 0', () => {
		assert.strictEqual(resolveForkAnchorUuid(threeTurns, 'u1'), 'a1');
	});

	test('fork at turn 1 → last assistant uuid of turn 1', () => {
		assert.strictEqual(resolveForkAnchorUuid(threeTurns, 'u2'), 'a2');
	});

	test('fork at the last turn → last assistant uuid of that turn', () => {
		assert.strictEqual(resolveForkAnchorUuid(threeTurns, 'u3'), 'a3');
	});

	test('turn with multiple assistant envelopes → the LAST one', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'do a thing'),
			makeAssistantText('a1', 'thinking'),
			makeAssistantToolUse('a2', 'tool-1', 'Read'),
			makeUserToolResult('r1', 'tool-1', 'file contents'),
			makeUser('u2', 'next'),
			makeAssistantText('a3', 'ok'),
		];
		assert.strictEqual(resolveForkAnchorUuid(messages, 'u1'), 'a2', 'must return the last assistant envelope of the target turn');
	});

	test('user-tool-results between assistants does not flip the turn', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'go'),
			makeAssistantToolUse('a1', 'tool-1', 'Read'),
			makeUserToolResult('r1', 'tool-1', 'contents'),
			makeAssistantText('a2', 'done'),
			makeUser('u2', 'next'),
			makeAssistantText('a3', 'ok'),
		];
		assert.strictEqual(resolveForkAnchorUuid(messages, 'u1'), 'a2', 'tool_result envelope must not end the turn');
	});

	test('system-notification mid-turn does not flip the turn', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'go'),
			makeSystem('s1', 'compact_boundary'),
			makeAssistantText('a1', 'done'),
			makeUser('u2', 'next'),
			makeAssistantText('a2', 'ok'),
		];
		assert.strictEqual(resolveForkAnchorUuid(messages, 'u1'), 'a1', 'system notification must not end the turn');
	});

	test('user-only target turn (no assistant) falls back to the user-text uuid', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'apple'),
			makeAssistantText('a1', 'apple!'),
			makeUser('u2', 'unanswered'),
		];
		assert.strictEqual(resolveForkAnchorUuid(messages, 'u2'), 'u2', 'fall back to the user-text envelope uuid');
	});

	test('turnId not found → undefined', () => {
		assert.strictEqual(resolveForkAnchorUuid(threeTurns, 'nope'), undefined);
	});

	test('empty transcript → undefined', () => {
		assert.strictEqual(resolveForkAnchorUuid([], 'u1'), undefined);
	});

	test('CLI-echo user envelopes are skipped by the shared parser', () => {
		const messages: SessionMessage[] = [
			makeUser('u1', 'what model'),
			{
				type: 'user',
				uuid: 'echo-1',
				session_id: 'sess-1',
				parent_tool_use_id: null,
				message: { role: 'user', content: '<command-name>/model</command-name>' },
			},
			makeAssistantText('a1', 'opus'),
			makeUser('u2', 'next'),
			makeAssistantText('a2', 'ok'),
		];
		// The CLI-echo envelope must not be treated as the start of a new turn,
		// so turn u1's anchor is still a1 (not echo-1, not undefined).
		assert.strictEqual(resolveForkAnchorUuid(messages, 'u1'), 'a1');
	});
});
