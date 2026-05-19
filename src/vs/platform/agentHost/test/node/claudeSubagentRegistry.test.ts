/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, type Turn } from '../../common/state/protocol/state.js';
import { scanTranscriptForAgentIds, SUBAGENT_ID_SUFFIX_REGEX, SubagentRegistry, SubagentSpawn } from '../../node/claude/claudeSubagentRegistry.js';

function makeAgentToolCallTurn(toolCallId: string, opts: { suffixText?: string; toolName?: string; status?: ToolCallStatus }): Turn {
	return {
		id: 'turn-' + toolCallId,
		userMessage: { text: '' },
		responseParts: [{
			kind: ResponsePartKind.ToolCall,
			toolCall: {
				toolCallId,
				toolName: opts.toolName ?? 'Task',
				displayName: 'Task',
				status: opts.status ?? ToolCallStatus.Completed,
				confirmed: ToolCallConfirmationReason.NotNeeded,
				invocationMessage: 'invoking task',
				success: true,
				pastTenseMessage: 'task done',
				content: opts.suffixText !== undefined ? [{ type: ToolResultContentType.Text, text: opts.suffixText }] : undefined,
			},
		}],
		state: 0 as unknown as Turn['state'],
		startedAt: 1,
		endedAt: 2,
		usage: undefined,
	} as Turn;
}

suite('SubagentSpawn', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('agentId is set-once via setAgentId; subagentType/description/background are mutable; markAnnounced and markCompleted are first-call-true-then-false', () => {
		const spawn = new SubagentSpawn('toolu_x');

		const beforeSet = spawn.agentId;
		spawn.setAgentId('agent-1');
		spawn.setAgentId('agent-2'); // ignored: first-writer-wins
		const afterSet = spawn.agentId;

		spawn.subagentType = 'Explore';
		spawn.description = 'Count files';
		spawn.background = true;

		const announce1 = spawn.markAnnounced();
		const announce2 = spawn.markAnnounced();
		const complete1 = spawn.markCompleted();
		const complete2 = spawn.markCompleted();

		assert.deepStrictEqual({
			toolUseId: spawn.toolUseId,
			beforeSet,
			afterSet,
			subagentType: spawn.subagentType,
			description: spawn.description,
			background: spawn.background,
			announce1,
			announce2,
			complete1,
			complete2,
		}, {
			toolUseId: 'toolu_x',
			beforeSet: undefined,
			afterSet: 'agent-1', // second setAgentId silently dropped
			subagentType: 'Explore',
			description: 'Count files',
			background: true,
			announce1: true,
			announce2: false,
			complete1: true,
			complete2: false,
		});
	});
});

suite('SubagentRegistry', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function r(): SubagentRegistry {
		return disposables.add(new SubagentRegistry());
	}

	test('recordSpawn is idempotent; init fields are first-writer-wins; getSpawn returns the same record across calls', () => {
		const registry = r();
		const first = registry.recordSpawn('toolu_a', { agentId: 'agent-1', subagentType: 'Explore', description: 'first desc' });
		const second = registry.recordSpawn('toolu_a', { agentId: 'agent-2', subagentType: 'OverwriteAttempt', description: 'second desc' });

		assert.deepStrictEqual({
			sameRef: first === second,
			retrieved: registry.getSpawn('toolu_a') === first,
			agentId: first.agentId,
			subagentType: first.subagentType,
			description: first.description,
		}, {
			sameRef: true,
			retrieved: true,
			agentId: 'agent-1',
			subagentType: 'Explore',
			description: 'first desc',
		});
	});

	test('removeSpawn deletes the spawn AND evicts inner-tool edges that pointed at it; other parents’ edges are untouched', () => {
		const registry = r();
		registry.recordSpawn('toolu_parent_a');
		registry.recordSpawn('toolu_parent_b');
		registry.noteInnerTool('toolu_inner_a1', 'toolu_parent_a');
		registry.noteInnerTool('toolu_inner_a2', 'toolu_parent_a');
		registry.noteInnerTool('toolu_inner_b1', 'toolu_parent_b');

		registry.removeSpawn('toolu_parent_a');

		assert.deepStrictEqual({
			parentA: registry.getSpawn('toolu_parent_a'),
			parentB: registry.getSpawn('toolu_parent_b')?.toolUseId,
			innerA1Parent: registry.getParentSpawn('toolu_inner_a1'),
			innerA2Parent: registry.getParentSpawn('toolu_inner_a2'),
			innerB1Parent: registry.getParentSpawn('toolu_inner_b1')?.toolUseId,
		}, {
			parentA: undefined,
			parentB: 'toolu_parent_b',
			innerA1Parent: undefined,
			innerA2Parent: undefined,
			innerB1Parent: 'toolu_parent_b',
		});
	});

	test('drainForegroundSpawns: returns and removes only foreground spawns; background spawns survive; inner-edge entries pointing at drained spawns are evicted', () => {
		const registry = r();
		registry.recordSpawn('toolu_fg_1');
		const bg = registry.recordSpawn('toolu_bg');
		bg.background = true;
		registry.recordSpawn('toolu_fg_2');
		registry.noteInnerTool('toolu_inner_fg1', 'toolu_fg_1');
		registry.noteInnerTool('toolu_inner_bg', 'toolu_bg');

		const drained = registry.drainForegroundSpawns();

		assert.deepStrictEqual({
			drainedIds: drained.map(s => s.toolUseId).sort(),
			survivedFg1: registry.getSpawn('toolu_fg_1'),
			survivedFg2: registry.getSpawn('toolu_fg_2'),
			survivedBg: registry.getSpawn('toolu_bg')?.toolUseId,
			fgInnerEvicted: registry.getParentSpawn('toolu_inner_fg1'),
			bgInnerSurvived: registry.getParentSpawn('toolu_inner_bg')?.toolUseId,
		}, {
			drainedIds: ['toolu_fg_1', 'toolu_fg_2'],
			survivedFg1: undefined,
			survivedFg2: undefined,
			survivedBg: 'toolu_bg',
			fgInnerEvicted: undefined,
			bgInnerSurvived: 'toolu_bg',
		});
	});

	test('primeFromTranscript scans Task tool_result text blocks for agentId suffix and records each pair (idempotent against repeat calls)', () => {
		const registry = r();
		const transcript: readonly Turn[] = [
			makeAgentToolCallTurn('toolu_a', { suffixText: 'agentId: agentaaa\n(use SendMessage with to: \'agentaaa\')' }),
			makeAgentToolCallTurn('toolu_b', { suffixText: 'no suffix here' }),
			makeAgentToolCallTurn('toolu_c', { suffixText: 'agentId: agentccc' }),
			makeAgentToolCallTurn('toolu_d', { suffixText: 'agentId: agentddd', toolName: 'Read' }), // not a subagent tool
		];

		registry.primeFromTranscript(transcript);
		registry.primeFromTranscript(transcript); // idempotent

		assert.deepStrictEqual({
			a: registry.getSpawn('toolu_a')?.agentId,
			b: registry.getSpawn('toolu_b'),
			c: registry.getSpawn('toolu_c')?.agentId,
			d: registry.getSpawn('toolu_d'),
		}, {
			a: 'agentaaa',
			b: undefined,
			c: 'agentccc',
			d: undefined,
		});
	});

	test('dispose clears spawns + inner-edge maps so a stray reference cannot resurrect stale state', () => {
		const registry = new SubagentRegistry();
		registry.recordSpawn('toolu_x', { agentId: 'agent-x' });
		registry.noteInnerTool('toolu_inner', 'toolu_x');

		registry.dispose();

		assert.deepStrictEqual({
			spawn: registry.getSpawn('toolu_x'),
			innerParent: registry.getParentSpawn('toolu_inner'),
		}, {
			spawn: undefined,
			innerParent: undefined,
		});
	});
});

suite('SUBAGENT_ID_SUFFIX_REGEX + scanTranscriptForAgentIds', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('regex matches canonical and drifted formats; rejects unrelated text', () => {
		const matches = [
			'agentId: abc123 (use SendMessage with to: \'abc123\') ...',
			'agentId:   abc123\n',
			'  agentId: abc123',
			'AgentId: ABC123',
			'noise\nagentId: xyz789 trailing',
		];
		const nonMatches = [
			'no agent here',
			'agent-Id: nope',
			'agentid abc no colon',
		];

		assert.deepStrictEqual({
			matches: matches.map(t => SUBAGENT_ID_SUFFIX_REGEX.exec(t)?.[1]),
			nonMatches: nonMatches.map(t => SUBAGENT_ID_SUFFIX_REGEX.exec(t)),
		}, {
			matches: ['abc123', 'abc123', 'abc123', 'ABC123', 'xyz789'],
			nonMatches: [null, null, null],
		});
	});

	test('scanTranscriptForAgentIds returns only the (toolCallId → agentId) pairs from terminal Task/Agent tool_result text blocks', () => {
		const transcript: readonly Turn[] = [
			makeAgentToolCallTurn('toolu_match', { suffixText: 'agentId: agentmatch' }),
			makeAgentToolCallTurn('toolu_streaming', { suffixText: 'agentId: agentstream', status: ToolCallStatus.Streaming }),
			makeAgentToolCallTurn('toolu_no_suffix', { suffixText: 'just text' }),
			makeAgentToolCallTurn('toolu_wrong_tool', { suffixText: 'agentId: agentx', toolName: 'Read' }),
		];

		const pairs = scanTranscriptForAgentIds(transcript);

		assert.deepStrictEqual(Array.from(pairs.entries()).sort(), [
			['toolu_match', 'agentmatch'],
		]);
	});
});
