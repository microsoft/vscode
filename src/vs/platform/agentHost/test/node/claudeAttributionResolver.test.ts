/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { URI } from '../../../../base/common/uri.js';
import { NullLogService } from '../../../log/common/log.js';
import { ResponsePartKind, ToolCallStatus } from '../../common/state/protocol/state.js';
import { buildAttributionSeed, hydrateAttribution } from '../../node/claude/claudeAttributionResolver.js';
import { ClaudeMapperState } from '../../node/claude/claudeMapSessionEvents.js';
import { replaySessionMessages } from '../../node/claude/claudeReplayMapper.js';
import { SubagentRegistry } from '../../node/claude/claudeSubagentRegistry.js';
import { getClaudePastTenseMessage } from '../../node/claude/claudeToolDisplay.js';

suite('claudeAttributionResolver', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const logService = new NullLogService();
	const session = URI.parse('claude:/sess-1');

	function makeUser(uuid: string, text: string): SessionMessage {
		return {
			type: 'user',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			parent_agent_id: null,
			message: { role: 'user', content: [{ type: 'text', text }] },
		};
	}

	function makeAssistantToolUse(uuid: string, toolUseId: string, name: string, input: unknown = {}): SessionMessage {
		return {
			type: 'assistant',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			parent_agent_id: null,
			message: { id: `msg_${uuid}`, role: 'assistant', content: [{ type: 'tool_use', id: toolUseId, name, input }] },
		};
	}

	function makeUserToolResult(uuid: string, toolUseId: string, text: string): SessionMessage {
		return {
			type: 'user',
			uuid,
			session_id: 'sess-1',
			parent_tool_use_id: null,
			parent_agent_id: null,
			message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: text }] },
		};
	}

	test('buildAttributionSeed: an unresolved tool_use in a non-tail turn is retained as pending, not dead, because a later steer may still return its result', () => {
		// u2 may be a steer folded into u1 (M10), whose preempted u1 tool can still return, so tu_early stays pending.
		const messages: SessionMessage[] = [
			makeUser('u1', 'first'),
			makeAssistantToolUse('a1', 'tu_early', 'Bash', { command: 'sleep 100' }),
			makeAssistantToolUse('a2', 'tu_task_done', 'Task', { description: 'explore' }),
			makeUserToolResult('r1', 'tu_task_done', 'agentId: agentaaa'),
			makeUser('u2', 'second'),
			makeAssistantToolUse('a3', 'tu_settled', 'Read', { file_path: '/tmp/x' }),
			makeUserToolResult('r2', 'tu_settled', 'contents'),
			makeAssistantToolUse('a4', 'tu_tail_pending', 'Grep', { pattern: 'x' }),
			makeAssistantToolUse('a5', 'tu_task_pending', 'Task', { description: 'still running' }),
		];

		const seed = buildAttributionSeed(replaySessionMessages(messages, session, logService).attribution);

		assert.deepStrictEqual({
			pending: seed.pending.map(e => e.toolUseId),
			dead: seed.dead.map(e => e.toolUseId),
			spawns: seed.spawns.map(e => [e.toolUseId, e.resultSeen, e.agentId]),
		}, {
			pending: ['tu_early', 'tu_tail_pending', 'tu_task_pending'],
			dead: [],
			spawns: [['tu_task_done', true, 'agentaaa'], ['tu_task_pending', false, undefined]],
		});
	});

	test('hydrateAttribution seeds registry info so pastTenseMessage parity holds, hydrates non-tail pending entries, and records spawns', () => {
		const command = 'git status';
		const messages: SessionMessage[] = [
			makeUser('u1', 'first'),
			makeAssistantToolUse('a1', 'tu_early', 'Bash', { command }),
			makeUser('u2', 'second'),
			makeAssistantToolUse('a2', 'tu_settled', 'Bash', { command }),
			makeUserToolResult('r1', 'tu_settled', 'clean'),
			makeAssistantToolUse('a3', 'tu_tail_pending', 'Bash', { command }),
			makeAssistantToolUse('a4', 'tu_task_done', 'Task', { subagent_type: 'Explore', description: 'count files', prompt: 'count them' }),
			makeUserToolResult('r2', 'tu_task_done', 'agentId: agentaaa'),
			makeAssistantToolUse('a5', 'tu_task_pending', 'Task', { subagent_type: 'Plan', description: 'plan it', prompt: 'make a plan' }),
		];
		const { turns, attribution } = replaySessionMessages(messages, session, logService);
		const state = new ClaudeMapperState();
		const registry = disposables.add(new SubagentRegistry());

		hydrateAttribution(state, registry, buildAttributionSeed(attribution));

		const settledPart = turns[1].responseParts.find(p => p.kind === ResponsePartKind.ToolCall && p.toolCall.toolCallId === 'tu_settled');
		const replayedPastTense = settledPart?.kind === ResponsePartKind.ToolCall && settledPart.toolCall.status === ToolCallStatus.Completed
			? settledPart.toolCall.pastTenseMessage
			: undefined;
		const hydrated = state.toolCalls.lookup('tu_tail_pending');
		const livePastTense = hydrated?.info
			? getClaudePastTenseMessage(hydrated.info.toolName, hydrated.info.displayName, hydrated.info.parsedInput, true, 'clean')
			: undefined;
		const early = state.toolCalls.lookup('tu_early');
		const spawnPending = registry.getSpawn('tu_task_pending');

		assert.deepStrictEqual({
			hydrated: { turnId: hydrated?.turnId, toolName: hydrated?.toolName, restored: hydrated?.restored, toolInput: hydrated?.info?.toolInput },
			early: { turnId: early?.turnId, restored: early?.restored },
			livePastTense,
			replayedPastTense,
			settled: state.toolCalls.lookup('tu_settled'),
			spawnDone: { agentId: registry.getSpawn('tu_task_done')?.agentId, subagentType: registry.getSpawn('tu_task_done')?.subagentType },
			spawnPending: spawnPending && { agentId: spawnPending.agentId, subagentType: spawnPending.subagentType, description: spawnPending.description, prompt: spawnPending.prompt },
		}, {
			hydrated: { turnId: 'u2', toolName: 'Bash', restored: true, toolInput: 'git status' },
			early: { turnId: 'u1', restored: true },
			livePastTense: { markdown: 'Ran `git status`' },
			replayedPastTense: { markdown: 'Ran `git status`' },
			settled: undefined,
			spawnDone: { agentId: 'agentaaa', subagentType: 'Explore' },
			spawnPending: { agentId: undefined, subagentType: 'Plan', description: 'plan it', prompt: 'make a plan' },
		});
	});
});
