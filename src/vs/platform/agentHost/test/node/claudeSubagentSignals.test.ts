/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ToolCallConfirmationReason } from '../../common/state/sessionState.js';
import { ClaudeMapperState, mapSDKMessageToAgentSignals } from '../../node/claude/claudeMapSessionEvents.js';
import { SubagentRegistry } from '../../node/claude/claudeSubagentRegistry.js';
import { buildTopLevelSubagentReadyAction, mapSubagentSystemMessage } from '../../node/claude/claudeSubagentSignals.js';
import {
	makeAssistantMessage,
	makeContentBlockStartText,
	makeContentBlockStartToolUse,
	makeStreamEvent,
	makeUserToolResultMessage,
} from './claudeMapSessionEventsTestUtils.js';

/**
 * Direct tests for Phase 12 subagent signal emission.
 *
 * Drives `mapSDKMessageToAgentSignals` end-to-end for the integrated
 * paths, and the two newly-exported `claudeSubagentSignals` functions
 * directly for their contract-level assertions. Uses a fresh real
 * {@link SubagentRegistry} per test so subagent state is visible
 * across mapper invocations and assertable directly on the spawn record.
 */
suite('claudeSubagentSignals — Phase 12 emission', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const SESSION = URI.parse('agent-session://test/abc');
	const SESSION_ID = 'sid-1';
	const TURN_ID = 'turn-1';

	function r(): SubagentRegistry {
		return disposables.add(new SubagentRegistry());
	}

	test('top-level Task tool_use records a spawn; non-subagent tools do not', () => {
		const state = new ClaudeMapperState();
		const log = new NullLogService();
		const registry = r();

		mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, 'toolu_task', 'Task')),
			SESSION, TURN_ID, state, log, registry,
		);
		mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(1, 'toolu_agent', 'Agent')),
			SESSION, TURN_ID, state, log, registry,
		);
		mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(2, 'toolu_read', 'Read')),
			SESSION, TURN_ID, state, log, registry,
		);

		assert.deepStrictEqual({
			task: registry.getSpawn('toolu_task')?.toolUseId,
			agent: registry.getSpawn('toolu_agent')?.toolUseId,
			read: registry.getSpawn('toolu_read'),
		}, {
			task: 'toolu_task',
			agent: 'toolu_agent',
			read: undefined,
		});
	});

	test('top-level Task SessionToolCallStart carries _meta.toolKind=subagent so the workbench renders the subagent UI', () => {
		const state = new ClaudeMapperState();
		const log = new NullLogService();
		const registry = r();

		const taskSignals = mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, 'toolu_task', 'Task')),
			SESSION, TURN_ID, state, log, registry,
		);
		const readSignals = mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(1, 'toolu_read', 'Read')),
			SESSION, TURN_ID, state, log, registry,
		);

		const taskAction = taskSignals[0];
		const readAction = readSignals[0];
		assert.ok(taskAction.kind === 'action' && taskAction.action.type === ActionType.SessionToolCallStart, 'Task signal is SessionToolCallStart');
		assert.ok(readAction.kind === 'action' && readAction.action.type === ActionType.SessionToolCallStart, 'Read signal is SessionToolCallStart');

		assert.deepStrictEqual({
			taskMeta: taskAction.action._meta,
			readMeta: readAction.action._meta,
		}, {
			taskMeta: { toolKind: 'subagent' },
			readMeta: undefined,
		});
	});

	test('top-level canonical assistant for Task emits SessionToolCallReady with confirmed:NotNeeded + _meta.subagentDescription/AgentName AND records metadata onto the spawn', () => {
		const state = new ClaudeMapperState();
		const log = new NullLogService();
		const registry = r();

		mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, 'toolu_top_task', 'Task')),
			SESSION, TURN_ID, state, log, registry,
		);

		const canonical = makeAssistantMessage(SESSION_ID, [{
			type: 'tool_use',
			id: 'toolu_top_task',
			name: 'Task',
			input: { description: 'Count TS files', subagent_type: 'Explore', prompt: 'Count how many TS files...' },
		}]);
		const out = mapSDKMessageToAgentSignals(canonical, SESSION, TURN_ID, state, log, registry);

		const ready = out.find(s => s.kind === 'action' && s.action.type === ActionType.SessionToolCallReady);
		assert.ok(ready && ready.kind === 'action' && ready.action.type === ActionType.SessionToolCallReady, 'Ready emitted');

		const spawn = registry.getSpawn('toolu_top_task');
		assert.deepStrictEqual({
			toolCallId: ready.action.toolCallId,
			invocationMessage: ready.action.invocationMessage,
			confirmed: ready.action.confirmed,
			meta: ready.action._meta,
			parentToolCallId: ready.parentToolCallId,
			spawnSubagentType: spawn?.subagentType,
			spawnDescription: spawn?.description,
		}, {
			toolCallId: 'toolu_top_task',
			invocationMessage: 'Count TS files',
			confirmed: ToolCallConfirmationReason.NotNeeded,
			meta: {
				toolKind: 'subagent',
				subagentDescription: 'Count TS files',
				subagentAgentName: 'Explore',
			},
			parentToolCallId: undefined,
			spawnSubagentType: 'Explore',
			spawnDescription: 'Count TS files',
		});
	});

	test('inner subagent message: prepends subagent_started exactly once, tags emitted action with parentToolCallId, records inner-tool→parent edge', () => {
		const state = new ClaudeMapperState();
		const log = new NullLogService();
		const registry = r();
		const PARENT = 'toolu_parent';

		mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, PARENT, 'Task')),
			SESSION, TURN_ID, state, log, registry,
		);

		const innerText = makeStreamEvent(SESSION_ID, makeContentBlockStartText(0));
		innerText.parent_tool_use_id = PARENT;
		const first = mapSDKMessageToAgentSignals(innerText, SESSION, TURN_ID, state, log, registry);

		const innerToolUse = makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(1, 'toolu_inner', 'Read'));
		innerToolUse.parent_tool_use_id = PARENT;
		const second = mapSDKMessageToAgentSignals(innerToolUse, SESSION, TURN_ID, state, log, registry);

		assert.deepStrictEqual({
			firstKinds: first.map(s => s.kind),
			firstStartedToolCallId: first[0]?.kind === 'subagent_started' ? first[0].toolCallId : null,
			firstActionParent: first.filter(s => s.kind === 'action').map(s => s.kind === 'action' ? s.parentToolCallId : null),
			secondKinds: second.map(s => s.kind),
			secondActionParent: second.filter(s => s.kind === 'action').map(s => s.kind === 'action' ? s.parentToolCallId : null),
			innerToolParentSpawnId: registry.getParentSpawn('toolu_inner')?.toolUseId,
		}, {
			firstKinds: ['subagent_started', 'action'],
			firstStartedToolCallId: PARENT,
			firstActionParent: [PARENT],
			secondKinds: ['action'],
			secondActionParent: [PARENT],
			innerToolParentSpawnId: PARENT,
		});
	});

	test('inner emission with unknown parent_tool_use_id (no spawn recorded) does NOT prepend subagent_started — tagging still applies', () => {
		// New model: "no spawn means no announcement". If the registry
		// has never seen the parent (and thus has no metadata), emitting
		// a subagent_started would be lying about a session that never
		// existed. The action is still tagged with parentToolCallId so
		// AgentSideEffects can route it (or buffer / drop).
		const state = new ClaudeMapperState();
		const log = new NullLogService();
		const registry = r();

		const innerText = makeStreamEvent(SESSION_ID, makeContentBlockStartText(0));
		innerText.parent_tool_use_id = 'toolu_unknown';
		const out = mapSDKMessageToAgentSignals(innerText, SESSION, TURN_ID, state, log, registry);

		assert.deepStrictEqual({
			kinds: out.map(s => s.kind),
			actionParents: out.filter(s => s.kind === 'action').map(s => s.kind === 'action' ? s.parentToolCallId : null),
		}, {
			kinds: ['action'],
			actionParents: ['toolu_unknown'],
		});
	});

	test('inner subagent canonical assistant message emits text/thinking/tool_use signals + tags them with parentToolCallId, lets the matching tool_result complete', () => {
		// Empirically the SDK delivers inner content via canonical messages,
		// not partials — this exercises that integration path end-to-end.
		const state = new ClaudeMapperState();
		const log = new NullLogService();
		const registry = r();
		const PARENT = 'toolu_parent_inner';

		mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, PARENT, 'Task')),
			SESSION, TURN_ID, state, log, registry,
		);

		const innerAssistant = makeAssistantMessage(SESSION_ID, [
			{ type: 'text', text: 'looking up files', citations: null },
			{ type: 'tool_use', id: 'toolu_inner_glob', name: 'Glob', input: { pattern: '**/*.ts' } },
		]);
		innerAssistant.parent_tool_use_id = PARENT;
		const fromAssistant = mapSDKMessageToAgentSignals(innerAssistant, SESSION, TURN_ID, state, log, registry);

		const innerToolResult = makeUserToolResultMessage(SESSION_ID, 'toolu_inner_glob', 'a.ts\nb.ts');
		innerToolResult.parent_tool_use_id = PARENT;
		const fromToolResult = mapSDKMessageToAgentSignals(innerToolResult, SESSION, TURN_ID, state, log, registry);

		const kinds = fromAssistant.map(s => s.kind);
		const allParentIds = [...fromAssistant, ...fromToolResult].filter(s => s.kind === 'action').map(s => s.kind === 'action' ? s.parentToolCallId : null);
		const completeAction = fromToolResult.find(s => s.kind === 'action' && s.action.type === ActionType.SessionToolCallComplete);

		assert.deepStrictEqual({
			fromAssistantKinds: kinds,
			toolUseEdge: registry.getParentSpawn('toolu_inner_glob')?.toolUseId,
			fromToolResultHasComplete: completeAction !== undefined,
			everyActionTaggedWithParent: allParentIds.every(p => p === PARENT),
		}, {
			fromAssistantKinds: ['subagent_started', 'action', 'action', 'action'],
			toolUseEdge: PARENT,
			fromToolResultHasComplete: true,
			everyActionTaggedWithParent: true,
		});
	});

	test('foreground subagent completion: tool_result for a Task spawn emits SessionToolCallComplete AND IAgentSubagentCompletedSignal, then clears the spawn from the registry', () => {
		const state = new ClaudeMapperState();
		const log = new NullLogService();
		const registry = r();
		const PARENT = 'toolu_fg_task';

		mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, PARENT, 'Task')),
			SESSION, TURN_ID, state, log, registry,
		);

		const signals = mapSDKMessageToAgentSignals(
			makeUserToolResultMessage(SESSION_ID, PARENT, 'done'),
			SESSION, TURN_ID, state, log, registry,
		);

		assert.deepStrictEqual({
			kinds: signals.map(s => s.kind),
			completedToolCallId: signals.find(s => s.kind === 'subagent_completed')?.toolCallId,
			spawnCleared: registry.getSpawn(PARENT),
		}, {
			kinds: ['action', 'subagent_completed'],
			completedToolCallId: PARENT,
			spawnCleared: undefined,
		});
	});

	test('background subagent completion: task_started then tool_result yields NO completion; later task_notification fires it', () => {
		const state = new ClaudeMapperState();
		const log = new NullLogService();
		const registry = r();
		const PARENT = 'toolu_bg_task';

		mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, PARENT, 'Task')),
			SESSION, TURN_ID, state, log, registry,
		);

		mapSDKMessageToAgentSignals(
			{ type: 'system', subtype: 'task_started', task_id: 't1', tool_use_id: PARENT, description: 'bg' } as unknown as SDKMessage,
			SESSION, TURN_ID, state, log, registry,
		);

		const afterToolResult = mapSDKMessageToAgentSignals(
			makeUserToolResultMessage(SESSION_ID, PARENT, 'tool returned'),
			SESSION, TURN_ID, state, log, registry,
		);
		const isBackgroundAfterToolResult = registry.getSpawn(PARENT)?.background;

		const afterNotification = mapSDKMessageToAgentSignals(
			{ type: 'system', subtype: 'task_notification', task_id: 't1', tool_use_id: PARENT, status: 'completed', output_file: 'o', summary: 's' } as unknown as SDKMessage,
			SESSION, TURN_ID, state, log, registry,
		);

		const afterNotificationAgain = mapSDKMessageToAgentSignals(
			{ type: 'system', subtype: 'task_notification', task_id: 't1', tool_use_id: PARENT, status: 'completed', output_file: 'o', summary: 's' } as unknown as SDKMessage,
			SESSION, TURN_ID, state, log, registry,
		);

		assert.deepStrictEqual({
			afterToolResultKinds: afterToolResult.map(s => s.kind),
			isBackgroundAfterToolResult,
			afterNotificationKinds: afterNotification.map(s => s.kind),
			completedToolCallId: afterNotification.find(s => s.kind === 'subagent_completed')?.toolCallId,
			afterNotificationAgainKinds: afterNotificationAgain.map(s => s.kind),
			spawnClearedAfterNotification: registry.getSpawn(PARENT),
		}, {
			afterToolResultKinds: ['action'],
			isBackgroundAfterToolResult: true,
			afterNotificationKinds: ['subagent_completed'],
			completedToolCallId: PARENT,
			afterNotificationAgainKinds: [],
			spawnClearedAfterNotification: undefined,
		});
	});

	// #region focused contract tests on the extracted exports

	test('buildTopLevelSubagentReadyAction omits _meta description/agentName when input fields are missing or wrong-typed; still records the spawn', () => {
		const registry = r();
		const malformed = buildTopLevelSubagentReadyAction(
			{ type: 'tool_use', id: 'toolu_bad', name: 'Task', input: { description: 42, subagent_type: null } as unknown as Record<string, unknown> },
			SESSION,
			TURN_ID,
			registry,
		);

		assert.ok(malformed.kind === 'action' && malformed.action.type === ActionType.SessionToolCallReady);
		const spawn = registry.getSpawn('toolu_bad');
		assert.deepStrictEqual({
			meta: malformed.action._meta,
			invocationMessage: malformed.action.invocationMessage,
			spawnRecorded: spawn?.toolUseId,
			spawnSubagentType: spawn?.subagentType,
			spawnDescription: spawn?.description,
		}, {
			meta: { toolKind: 'subagent' },
			invocationMessage: 'Run subagent task',
			spawnRecorded: 'toolu_bad',
			spawnSubagentType: undefined,
			spawnDescription: undefined,
		});
	});

	test('mapSubagentSystemMessage ignores task_notification with non-terminal status, missing tool_use_id, or unknown spawn', () => {
		const registry = r();
		registry.recordSpawn('toolu_known');

		const inProgress = mapSubagentSystemMessage({ type: 'system', subtype: 'task_notification', task_id: 't', tool_use_id: 'toolu_known', status: 'in_progress' } as unknown as SDKMessage & { type: 'system' }, SESSION, registry);
		const missingId = mapSubagentSystemMessage({ type: 'system', subtype: 'task_notification', task_id: 't', status: 'completed' } as unknown as SDKMessage & { type: 'system' }, SESSION, registry);
		const unknownEntry = mapSubagentSystemMessage({ type: 'system', subtype: 'task_notification', task_id: 't', tool_use_id: 'toolu_unknown', status: 'completed' } as unknown as SDKMessage & { type: 'system' }, SESSION, registry);

		assert.deepStrictEqual({
			inProgressKinds: inProgress.map(s => s.kind),
			missingIdKinds: missingId.map(s => s.kind),
			unknownEntryKinds: unknownEntry.map(s => s.kind),
		}, {
			inProgressKinds: [],
			missingIdKinds: [],
			unknownEntryKinds: [],
		});
	});

	// #endregion
});
