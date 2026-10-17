/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IAgentActionSignal } from '../../../common/agent.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { AcpTurnMapper } from '../../../node/acp/acpTurnMapper.js';

const chat = URI.parse('ahp-chat://chat-1/session');

/** Action types and the fields that matter, without volatile ids and durations. */
function summarize(signals: readonly IAgentActionSignal[]): unknown[] {
	return signals.map(s => {
		assert.strictEqual(s.resource.toString(), chat.toString());
		const a = s.action as unknown as Record<string, unknown>;
		switch (a.type) {
			case ActionType.ChatResponsePart: {
				const part = a.part as { kind: string; content: string };
				return [a.type, part.kind, part.content];
			}
			case ActionType.ChatDelta:
			case ActionType.ChatReasoning:
				return [a.type, a.content];
			case ActionType.ChatToolCallStart:
				return [a.type, a.toolCallId, a.toolName, a.displayName];
			case ActionType.ChatToolCallReady:
				return [a.type, a.toolCallId, a.invocationMessage, a.toolInput];
			case ActionType.ChatToolCallComplete: {
				const result = a.result as { success: boolean; content?: { text: string }[] };
				return [a.type, a.toolCallId, result.success, result.content?.map(c => c.text)];
			}
			case ActionType.ChatError:
				return [a.type, (a.part as { error: { errorType: string } }).error.errorType];
			default:
				return [a.type];
		}
	});
}

suite('AcpTurnMapper', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('streams text and reasoning into parts and deltas', () => {
		const mapper = new AcpTurnMapper(chat, 't1');
		const signals = [
			...mapper.map({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'think' } }),
			...mapper.map({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'ing' } }),
			...mapper.map({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hel' } }),
			...mapper.map({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'lo' } }),
			...mapper.finish('end_turn'),
		];
		assert.deepStrictEqual(summarize(signals), [
			[ActionType.ChatResponsePart, 'reasoning', 'think'],
			[ActionType.ChatReasoning, 'ing'],
			[ActionType.ChatResponsePart, 'markdown', 'Hel'],
			[ActionType.ChatDelta, 'lo'],
			[ActionType.ChatTurnComplete],
		]);
	});

	test('maps a tool call lifecycle and starts a new text part afterwards', () => {
		const mapper = new AcpTurnMapper(chat, 't1');
		const signals = [
			...mapper.map({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Reading' } }),
			...mapper.map({ sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'Read a.ts', kind: 'read', status: 'pending', rawInput: { path: 'a.ts' } }),
			...mapper.map({ sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'in_progress' }),
			...mapper.map({ sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'file body' } }] }),
			...mapper.map({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done' } }),
			...mapper.finish('end_turn'),
		];
		assert.deepStrictEqual(summarize(signals), [
			[ActionType.ChatResponsePart, 'markdown', 'Reading'],
			[ActionType.ChatToolCallStart, 'c1', 'read', 'Read a.ts'],
			[ActionType.ChatToolCallReady, 'c1', 'Read a.ts', '{\n  "path": "a.ts"\n}'],
			[ActionType.ChatToolCallComplete, 'c1', true, ['file body']],
			[ActionType.ChatResponsePart, 'markdown', 'Done'],
			[ActionType.ChatTurnComplete],
		]);
	});

	test('does not emit ready for tool calls awaiting permission', () => {
		const mapper = new AcpTurnMapper(chat, 't1');
		const signals = [
			...mapper.map({ sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'Edit a.ts', kind: 'edit', status: 'pending' }),
			...mapper.beginPermission({ toolCallId: 'c1', title: 'Edit a.ts' }),
			...mapper.map({ sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'completed', content: [{ type: 'diff', path: '/w/a.ts', oldText: 'a', newText: 'a\nb' }] }),
		];
		assert.deepStrictEqual(summarize(signals), [
			[ActionType.ChatToolCallStart, 'c1', 'edit', 'Edit a.ts'],
			[ActionType.ChatToolCallComplete, 'c1', true, ['Edited /w/a.ts (1 → 2 lines)']],
		]);
	});

	test('announces tool calls first seen in a permission request', () => {
		const mapper = new AcpTurnMapper(chat, 't1');
		assert.deepStrictEqual(summarize(mapper.beginPermission({ toolCallId: 'c9', title: 'Run npm test', kind: 'execute' })), [
			[ActionType.ChatToolCallStart, 'c9', 'execute', 'Run npm test'],
		]);
	});

	test('settles unfinished tool calls and maps stop reasons', () => {
		const cancelled = new AcpTurnMapper(chat, 't1');
		cancelled.map({ sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'Search', kind: 'search' });
		assert.deepStrictEqual(summarize(cancelled.finish('cancelled')), [
			[ActionType.ChatToolCallReady, 'c1', 'Search', undefined],
			[ActionType.ChatToolCallComplete, 'c1', false, undefined],
			[ActionType.ChatTurnCancelled],
		]);
		assert.strictEqual(cancelled.ended, true);
		assert.deepStrictEqual(cancelled.map({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'late' } }), []);

		assert.deepStrictEqual(summarize(new AcpTurnMapper(chat, 't2').finish('refusal')), [[ActionType.ChatError, 'refusal']]);
		assert.deepStrictEqual(summarize(new AcpTurnMapper(chat, 't3').fail('acpError', 'boom')), [[ActionType.ChatError, 'acpError']]);
	});

	test('ignores updates that are not part of the response', () => {
		const mapper = new AcpTurnMapper(chat, 't1');
		assert.deepStrictEqual([
			...mapper.map({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'hi' } }),
			...mapper.map({ sessionUpdate: 'plan', entries: [] }),
			...mapper.map({ sessionUpdate: 'usage_update', used: 1, size: 2 }),
			...mapper.map({ sessionUpdate: 'some_future_update' }),
		], []);
	});
});
