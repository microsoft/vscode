/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatDebugModelTurnEvent, IChatDebugEventFileListContent, IChatDebugEventCustomizationSummaryContent } from '../../common/chatDebugService.js';
import { buildCustomizationDebugEvents, convertAgentHostEventsToDebugEvents, parseJsonl } from '../../browser/chatDebug/agentHostChatDebugProvider.js';
import { COPILOT_CLI_LOCAL_AH_SCHEME } from '../../browser/copilotCliEventsUri.js';
import { CustomizationType, type Customization } from '../../../../../platform/agentHost/common/state/sessionState.js';

suite('AgentHostChatDebugProvider - convertAgentHostEventsToDebugEvents', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: '/session-1' });

	// A representative `events.jsonl` stream mirroring the real CLI schema. The
	// `parentId` of every record is its *chronological* predecessor (a flat
	// linked chain, per the SDK) — NOT a logical parent — so the tree must be
	// reconstructed from turn / tool-call ids, not by following `parentId`. The
	// turn issues two top-level tools (`grep`, then an `Agent` sub-agent tool),
	// and the sub-agent issues a nested `read` (linked via `parentToolCallId`).
	const records = [
		{ type: 'session.start', id: 's', parentId: null, timestamp: '2026-06-17T00:00:00.000Z', data: { selectedModel: 'claude-opus-4.8', reasoningEffort: 'xhigh' } },
		{ type: 'user.message', id: 'u', parentId: 's', timestamp: '2026-06-17T00:00:00.000Z', data: { content: 'Do the thing\nsecond line', transformedContent: '<ctx>Do the thing', interactionId: 'i1' } },
		{ type: 'assistant.turn_start', id: 'ts1', parentId: 'u', timestamp: '2026-06-17T00:00:01.000Z', data: { turnId: '0', interactionId: 'i1' } },
		{ type: 'assistant.message', id: 'm', parentId: 'ts1', timestamp: '2026-06-17T00:00:01.500Z', data: { model: 'claude-opus-4.8', outputTokens: 42, content: 'Sure.', reasoningText: 'thinking', turnId: '0', interactionId: 'i1' } },
		{ type: 'tool.execution_start', id: 't1', parentId: 'm', timestamp: '2026-06-17T00:00:01.600Z', data: { toolName: 'grep', toolCallId: 'tc1', turnId: '0', arguments: { pattern: 'x' } } },
		{ type: 'tool.execution_complete', id: 't1c', parentId: 't1', timestamp: '2026-06-17T00:00:01.900Z', data: { toolCallId: 'tc1', success: false, turnId: '0', result: { content: 'no match' } } },
		{ type: 'tool.execution_start', id: 't2', parentId: 't1c', timestamp: '2026-06-17T00:00:02.000Z', data: { toolName: 'Agent', toolCallId: 'tc2', turnId: '0', arguments: { task: 'sub' } } },
		{ type: 'tool.execution_start', id: 't3', parentId: 't2', timestamp: '2026-06-17T00:00:02.100Z', data: { toolName: 'read', toolCallId: 'tc3', parentToolCallId: 'tc2', turnId: '0', arguments: { path: 'a' } } },
		{ type: 'tool.execution_complete', id: 't3c', parentId: 't3', timestamp: '2026-06-17T00:00:02.200Z', data: { toolCallId: 'tc3', success: true, parentToolCallId: 'tc2', turnId: '0', result: { content: 'ok' } } },
		{ type: 'tool.execution_complete', id: 't2c', parentId: 't3c', timestamp: '2026-06-17T00:00:02.500Z', data: { toolCallId: 'tc2', success: true, turnId: '0', result: { content: 'done' } } },
		{ type: 'assistant.turn_end', id: 'te', parentId: 't2c', timestamp: '2026-06-17T00:00:02.600Z', data: { turnId: '0' } },
		{ type: 'session.shutdown', id: 'sd', parentId: 'te', timestamp: '2026-06-17T00:00:03.000Z', data: { totalNanoAiu: 5_000_000_000, modelMetrics: { 'claude-opus-4.8': { usage: { inputTokens: 1000, outputTokens: 42, cacheReadTokens: 700 }, totalNanoAiu: 5_000_000_000 } } } },
	];

	test('reconstructs the logical trajectory tree from context (not from chronological parentId) and merges tool start/complete', () => {
		const { events } = convertAgentHostEventsToDebugEvents(records, sessionResource);

		// Normalize to a comparable projection (Dates and verbose payloads excluded)
		// so a single snapshot-style assertion covers ordering, parent linkage,
		// tool start/complete merge, error mapping, and durations. The key checks:
		// both top-level tools parent to the assistant message `m` (NOT to each
		// other, as following the chronological `parentId` chain would wrongly do),
		// and the nested `read` parents to its `Agent` tool via `parentToolCallId`.
		const projection = events.map(e => {
			switch (e.kind) {
				case 'generic': return { kind: e.kind, id: e.id, parent: e.parentEventId, name: e.name, details: e.details };
				case 'userMessage': return { kind: e.kind, id: e.id, parent: e.parentEventId, message: e.message };
				case 'modelTurn': return { kind: e.kind, id: e.id, parent: e.parentEventId, model: e.model, outputTokens: e.outputTokens, durationInMillis: e.durationInMillis };
				case 'toolCall': return { kind: e.kind, id: e.id, parent: e.parentEventId, toolName: e.toolName, result: e.result, durationInMillis: e.durationInMillis };
				default: return { kind: e.kind, id: e.id, parent: e.parentEventId };
			}
		});

		assert.deepStrictEqual(projection, [
			{ kind: 'generic', id: 's', parent: undefined, name: 'Session Started', details: 'model=claude-opus-4.8, reasoningEffort=xhigh' },
			{ kind: 'userMessage', id: 'u', parent: 's', message: 'Do the thing' },
			{ kind: 'modelTurn', id: 'm', parent: 'u', model: 'claude-opus-4.8', outputTokens: 42, durationInMillis: 500 },
			{ kind: 'toolCall', id: 't1', parent: 'm', toolName: 'grep', result: 'error', durationInMillis: 300 },
			{ kind: 'toolCall', id: 't2', parent: 'm', toolName: 'Agent', result: 'success', durationInMillis: 500 },
			{ kind: 'toolCall', id: 't3', parent: 't2', toolName: 'read', result: 'success', durationInMillis: 100 },
		]);
	});

	test('surfaces errors, warnings, model changes, error hooks and routine lifecycle hooks', () => {
		// A failing session: a recoverable model-call error hook precedes a
		// terminal session.error, plus a warning, a model change, and a routine
		// (successful, non-error) hook that is now surfaced as an info event.
		const failing = [
			{ type: 'session.start', id: 's', parentId: null, timestamp: '2026-06-17T00:00:00.000Z', data: { selectedModel: 'echo', copilotVersion: '1.0.69', context: { repository: 'microsoft/vscode', branch: 'main' } } },
			{ type: 'session.warning', id: 'w', parentId: 's', timestamp: '2026-06-17T00:00:00.100Z', data: { warningType: 'remote', message: 'Remote controlled sessions are not enabled.' } },
			{ type: 'user.message', id: 'u', parentId: 'w', timestamp: '2026-06-17T00:00:00.200Z', data: { content: 'go' } },
			{ type: 'hook.start', id: 'hs0', parentId: 'u', timestamp: '2026-06-17T00:00:00.300Z', data: { hookInvocationId: 'hi0', hookType: 'userPromptSubmitted', input: {} } },
			{ type: 'hook.end', id: 'he0', parentId: 'hs0', timestamp: '2026-06-17T00:00:00.310Z', data: { hookInvocationId: 'hi0', hookType: 'userPromptSubmitted', success: true } },
			{ type: 'hook.start', id: 'hs1', parentId: 'he0', timestamp: '2026-06-17T00:00:01.000Z', data: { hookInvocationId: 'hi1', hookType: 'errorOccurred', input: { errorContext: 'model_call', recoverable: true, error: {} } } },
			{ type: 'hook.end', id: 'he1', parentId: 'hs1', timestamp: '2026-06-17T00:00:01.010Z', data: { hookInvocationId: 'hi1', hookType: 'errorOccurred', success: true } },
			{ type: 'session.model_change', id: 'mc', parentId: 'he1', timestamp: '2026-06-17T00:00:02.000Z', data: { previousModel: 'echo', newModel: 'claude-opus-4.8', reasoningEffort: 'medium' } },
			{ type: 'session.error', id: 'err', parentId: 'mc', timestamp: '2026-06-17T00:00:03.000Z', data: { errorType: 'query', message: 'Failed to get response; retried 5 times.', stack: 'Error: Failed\n    at me (app.js:1:1)' } },
		];
		const { events, resolved } = convertAgentHostEventsToDebugEvents(failing, sessionResource);

		const projection = events.map(e => e.kind === 'generic'
			? { kind: e.kind, id: e.id, parent: e.parentEventId, name: e.name, details: e.details, level: e.level, category: e.category }
			: { kind: e.kind, id: e.id, parent: e.parentEventId });

		// The routine `userPromptSubmitted` hook is surfaced as a low-key info
		// event; the error/warning/model-change/error-hook events are surfaced
		// with the right levels and nested under the active turn (or session root
		// before any turn).
		assert.deepStrictEqual(projection, [
			{ kind: 'generic', id: 's', parent: undefined, name: 'Session Started', details: 'model=echo, CLI 1.0.69, microsoft/vscode@main', level: 1, category: 'session' },
			{ kind: 'generic', id: 'w', parent: 's', name: 'Warning (remote)', details: 'Remote controlled sessions are not enabled.', level: 2, category: 'session' },
			{ kind: 'userMessage', id: 'u', parent: 's' },
			{ kind: 'generic', id: 'hs0', parent: 'u', name: 'Hook: userPromptSubmitted', details: undefined, level: 1, category: 'hook' },
			{ kind: 'generic', id: 'hs1', parent: 'u', name: 'Error During model_call', details: 'Recoverable; retrying', level: 2, category: 'hook' },
			{ kind: 'generic', id: 'mc', parent: 'u', name: 'Model Changed', details: 'echo → claude-opus-4.8 (reasoningEffort=medium)', level: 1, category: 'session' },
			{ kind: 'generic', id: 'err', parent: 'u', name: 'Error (query)', details: 'Failed to get response; retried 5 times.', level: 3, category: 'session' },
		]);

		// The terminal error's expanded detail includes both message and stack.
		assert.deepStrictEqual(resolved.get('err'), { kind: 'text', value: 'Failed to get response; retried 5 times.\n\nError: Failed\n    at me (app.js:1:1)' });
	});

	test('surfaces permissions, subagent lifecycle, compaction failures, aborts and skill invocations', () => {
		const stream = [
			{ type: 'session.start', id: 's', parentId: null, timestamp: '2026-06-17T00:00:00.000Z', data: { selectedModel: 'x' } },
			{ type: 'user.message', id: 'u', parentId: 's', timestamp: '2026-06-17T00:00:00.100Z', data: { content: 'go' } },
			{ type: 'assistant.message', id: 'm', parentId: 'u', timestamp: '2026-06-17T00:00:00.200Z', data: { model: 'x', outputTokens: 5 } },
			{ type: 'tool.execution_start', id: 'tAgent', parentId: 'm', timestamp: '2026-06-17T00:00:00.300Z', data: { toolName: 'Agent', toolCallId: 'tcA', arguments: {} } },
			{ type: 'subagent.started', id: 'sa', parentId: 'tAgent', timestamp: '2026-06-17T00:00:00.400Z', data: { toolCallId: 'tcA', agentName: 'explore', agentDisplayName: 'Explore Agent', agentDescription: 'desc', model: 'haiku' } },
			{ type: 'subagent.completed', id: 'sac', parentId: 'sa', timestamp: '2026-06-17T00:00:02.400Z', data: { toolCallId: 'tcA', agentName: 'explore', model: 'haiku', totalToolCalls: 5, totalTokens: 1000, durationMs: 2000 } },
			// A denied permission is surfaced; a following approved one is dropped as routine.
			{ type: 'permission.requested', id: 'pReq', parentId: 'm', timestamp: '2026-06-17T00:00:02.500Z', data: { requestId: 'r1', permissionRequest: { kind: 'read', toolCallId: 'tc1', intention: 'Search', path: '/x' } } },
			{ type: 'permission.completed', id: 'pComp', parentId: 'pReq', timestamp: '2026-06-17T00:00:02.600Z', data: { requestId: 'r1', toolCallId: 'tc1', result: { kind: 'denied' } } },
			{ type: 'permission.requested', id: 'pReq2', parentId: 'pComp', timestamp: '2026-06-17T00:00:02.700Z', data: { requestId: 'r2', permissionRequest: { kind: 'read', toolCallId: 'tc2', intention: 'Read' } } },
			{ type: 'permission.completed', id: 'pComp2', parentId: 'pReq2', timestamp: '2026-06-17T00:00:02.800Z', data: { requestId: 'r2', result: { kind: 'approved' } } },
			// A successful compaction is implied by its start row; only failures are surfaced.
			{ type: 'session.compaction_start', id: 'cs', parentId: 'pComp2', timestamp: '2026-06-17T00:00:03.000Z', data: { systemTokens: 100, conversationTokens: 200, toolDefinitionsTokens: 300 } },
			{ type: 'session.compaction_complete', id: 'cc', parentId: 'cs', timestamp: '2026-06-17T00:00:03.100Z', data: { success: false, error: 'boom' } },
			{ type: 'abort', id: 'ab', parentId: 'cc', timestamp: '2026-06-17T00:00:03.200Z', data: { reason: 'user_initiated' } },
			{ type: 'skill.invoked', id: 'sk', parentId: 'ab', timestamp: '2026-06-17T00:00:03.300Z', data: { name: 'troubleshoot', trigger: 'auto', pluginName: 'myplugin', content: 'SKILL body' } },
		];
		const { events, resolved } = convertAgentHostEventsToDebugEvents(stream, sessionResource);

		const projection = events.map(e => {
			switch (e.kind) {
				case 'generic': return { kind: e.kind, id: e.id, parent: e.parentEventId, name: e.name, details: e.details, level: e.level, category: e.category };
				case 'subagentInvocation': return { kind: e.kind, id: e.id, parent: e.parentEventId, agentName: e.agentName, status: e.status, toolCallCount: e.toolCallCount, durationInMillis: e.durationInMillis };
				case 'toolCall': return { kind: e.kind, id: e.id, parent: e.parentEventId, toolName: e.toolName };
				default: return { kind: e.kind, id: e.id, parent: e.parentEventId };
			}
		});

		// Subagent uses the dedicated `subagentInvocation` kind (folding started +
		// completed) and nests under its spawning `Agent` tool call. The approved
		// permission `pReq2` is dropped; the denied `pReq`, compaction failure,
		// abort and skill invocation all nest under the active turn `m`.
		assert.deepStrictEqual(projection, [
			{ kind: 'generic', id: 's', parent: undefined, name: 'Session Started', details: 'model=x', level: 1, category: 'session' },
			{ kind: 'userMessage', id: 'u', parent: 's' },
			{ kind: 'modelTurn', id: 'm', parent: 'u' },
			{ kind: 'toolCall', id: 'tAgent', parent: 'm', toolName: 'Agent' },
			{ kind: 'subagentInvocation', id: 'sa', parent: 'tAgent', agentName: 'Explore Agent', status: 'completed', toolCallCount: 5, durationInMillis: 2000 },
			{ kind: 'generic', id: 'pReq', parent: 'm', name: 'Permission denied: read', details: 'Search', level: 2, category: 'permission' },
			{ kind: 'generic', id: 'cs', parent: 'm', name: 'Context Compaction', details: 'system=100, conversation=200, tools=300 tokens', level: 1, category: 'session' },
			{ kind: 'generic', id: 'cc', parent: 'm', name: 'Context Compaction Failed', details: 'boom', level: 3, category: 'session' },
			{ kind: 'generic', id: 'ab', parent: 'm', name: 'Aborted', details: 'user_initiated', level: 2, category: 'session' },
			{ kind: 'generic', id: 'sk', parent: 'm', name: 'Skill Invoked: troubleshoot', details: 'auto \u00b7 myplugin', level: 1, category: 'customization' },
		]);

		assert.deepStrictEqual(resolved.get('pReq'), { kind: 'text', value: 'kind: read\nintention: Search\npath: /x\nresult: denied' });
		assert.deepStrictEqual(resolved.get('sk'), { kind: 'text', value: 'SKILL body' });
	});

	test('back-fills session.shutdown usage onto model turns so tile sums are exact', () => {
		const { events } = convertAgentHostEventsToDebugEvents(records, sessionResource);
		const turns = events.filter((e): e is IChatDebugModelTurnEvent => e.kind === 'modelTurn');
		const sum = (pick: (t: IChatDebugModelTurnEvent) => number | undefined) => turns.reduce((acc, t) => acc + (pick(t) ?? 0), 0);
		const nanoAiu = sum(t => t.copilotUsageNanoAiu);

		// outputTokens stays from events.jsonl (42); input/cache/AIU come from
		// the shutdown summary; totalTokens = input + output.
		assert.deepStrictEqual(
			{ input: sum(t => t.inputTokens), cached: sum(t => t.cachedTokens), output: sum(t => t.outputTokens), total: sum(t => t.totalTokens), aic: nanoAiu / 1_000_000_000 },
			{ input: 1000, cached: 700, output: 42, total: 1042, aic: 5 },
		);
	});

	test('live fallback (no session.shutdown) contributes AIU only — input/cache stay blank (F1)', () => {
		// In-progress case: no session.shutdown, and the live path supplies AIU
		// only (input/cache can't be summed reliably — see sumChatStateUsage).
		const inProgress = records.filter(r => r.type !== 'session.shutdown');
		const { events } = convertAgentHostEventsToDebugEvents(inProgress, sessionResource, { totalNanoAiu: 7_000_000_000 });
		const turns = events.filter((e): e is IChatDebugModelTurnEvent => e.kind === 'modelTurn');
		const sum = (pick: (t: IChatDebugModelTurnEvent) => number | undefined) => turns.reduce((acc, t) => acc + (pick(t) ?? 0), 0);

		// AIU + output populate live; input/cache remain blank until shutdown.
		assert.deepStrictEqual(
			{ input: sum(t => t.inputTokens), cached: sum(t => t.cachedTokens), output: sum(t => t.outputTokens), aic: sum(t => t.copilotUsageNanoAiu) / 1_000_000_000 },
			{ input: 0, cached: 0, output: 42, aic: 7 },
		);
	});

	test('back-fills per-round usage from the sidecar, correlating positionally across mismatched turn-id namespaces', () => {
		// Real-world shape: events.jsonl keys `turnId` on a per-user-turn ROUND
		// index that resets each turn (0,1 then 0), while the client sidecar keys
		// on the backend REQUEST id (one id per user turn, shared by its rounds).
		// The two namespaces never match, so correlation must be positional; the
		// matching `outputTokens` both report confirm the 1:1 alignment.
		const inProgress = [
			{ type: 'session.start', id: 's', parentId: null, timestamp: '2026-06-17T00:00:00.000Z', data: {} },
			{ type: 'user.message', id: 'u1', parentId: 's', timestamp: '2026-06-17T00:00:00.000Z', data: { content: 'one' } },
			{ type: 'assistant.turn_start', id: 'ts0', parentId: 'u1', timestamp: '2026-06-17T00:00:01.000Z', data: { turnId: '0' } },
			{ type: 'assistant.message', id: 'm0', parentId: 'ts0', timestamp: '2026-06-17T00:00:01.100Z', data: { model: 'x', outputTokens: 144, turnId: '0' } },
			{ type: 'assistant.turn_start', id: 'ts1', parentId: 'm0', timestamp: '2026-06-17T00:00:02.000Z', data: { turnId: '1' } },
			{ type: 'assistant.message', id: 'm1', parentId: 'ts1', timestamp: '2026-06-17T00:00:02.100Z', data: { model: 'x', outputTokens: 127, turnId: '1' } },
			{ type: 'user.message', id: 'u2', parentId: 'm1', timestamp: '2026-06-17T00:00:03.000Z', data: { content: 'two' } },
			{ type: 'assistant.turn_start', id: 'ts2', parentId: 'u2', timestamp: '2026-06-17T00:00:04.000Z', data: { turnId: '0' } },
			{ type: 'assistant.message', id: 'm2', parentId: 'ts2', timestamp: '2026-06-17T00:00:04.100Z', data: { model: 'x', outputTokens: 52, turnId: '0' } },
		];
		// Cumulative AIU resets per user turn (request_A: 1e9→2e9; request_B: 5e8),
		// so the per-turn max (2e9 + 5e8) sums exactly to 2.5 AIC.
		const usageRecords = [
			{ turnId: 'request_A', model: 'x', inputTokens: 100, outputTokens: 144, cacheReadTokens: 0, totalNanoAiu: 1_000_000_000, ts: '2026-06-17T00:00:01.150Z' },
			{ turnId: 'request_A', model: 'x', inputTokens: 200, outputTokens: 127, cacheReadTokens: 90, totalNanoAiu: 2_000_000_000, ts: '2026-06-17T00:00:02.150Z' },
			{ turnId: 'request_B', model: 'x', inputTokens: 300, outputTokens: 52, cacheReadTokens: 250, totalNanoAiu: 500_000_000, ts: '2026-06-17T00:00:04.150Z' },
		];

		const { events } = convertAgentHostEventsToDebugEvents(inProgress, sessionResource, undefined, usageRecords);
		const turns = events.filter((e): e is IChatDebugModelTurnEvent => e.kind === 'modelTurn');
		const sum = (pick: (t: IChatDebugModelTurnEvent) => number | undefined) => turns.reduce((acc, t) => acc + (pick(t) ?? 0), 0);

		assert.deepStrictEqual(
			{ input: sum(t => t.inputTokens), cached: sum(t => t.cachedTokens), output: sum(t => t.outputTokens), total: sum(t => t.totalTokens), aic: sum(t => t.copilotUsageNanoAiu) / 1_000_000_000 },
			{ input: 600, cached: 340, output: 323, total: 923, aic: 2.5 },
		);
	});

	test('a zero-usage session.shutdown takes precedence over the live fallback', () => {
		// A finished session whose shutdown summary reports zero usage must NOT
		// fall back to live AIU: zero is then a known total, not "unknown".
		const zeroShutdown = [
			{ type: 'session.start', id: 's', parentId: null, timestamp: '2026-06-17T00:00:00.000Z', data: {} },
			{ type: 'user.message', id: 'u', parentId: 's', timestamp: '2026-06-17T00:00:00.000Z', data: { content: 'hi' } },
			{ type: 'assistant.turn_start', id: 'ts', parentId: 'u', timestamp: '2026-06-17T00:00:01.000Z', data: { turnId: '0' } },
			{ type: 'assistant.message', id: 'm', parentId: 'ts', timestamp: '2026-06-17T00:00:01.000Z', data: { model: 'x', outputTokens: 10, turnId: '0' } },
			{ type: 'session.shutdown', id: 'sd', parentId: 'm', timestamp: '2026-06-17T00:00:02.000Z', data: { totalNanoAiu: 0, modelMetrics: {} } },
		];
		const { events } = convertAgentHostEventsToDebugEvents(zeroShutdown, sessionResource, { totalNanoAiu: 9_000_000_000 });
		const turns = events.filter((e): e is IChatDebugModelTurnEvent => e.kind === 'modelTurn');
		const sum = (pick: (t: IChatDebugModelTurnEvent) => number | undefined) => turns.reduce((acc, t) => acc + (pick(t) ?? 0), 0);

		// AIU is the shutdown's 0 (not the live 9), and input is a known 0.
		assert.deepStrictEqual(
			{ aiu: sum(t => t.copilotUsageNanoAiu), input: sum(t => t.inputTokens) },
			{ aiu: 0, input: 0 },
		);
	});

	test('surfaces loaded customizations (skills/hooks/agents/MCP) as discovery events plus a summary', () => {
		// Customizations arrive as a container tree (plugin/directory with children)
		// plus a top-level MCP server; a disabled skill is surfaced as skipped.
		const customizations = [
			{
				type: CustomizationType.Directory, id: 'dir', uri: 'file:///ws/.github', name: '.github', enabled: true, contents: CustomizationType.Skill, writable: true,
				children: [
					{ type: CustomizationType.Skill, id: 'sk1', uri: 'file:///ws/.github/skills/troubleshoot/SKILL.md', name: 'troubleshoot', description: 'Diagnose issues' },
					{ type: CustomizationType.Skill, id: 'sk2', uri: 'file:///ws/.github/skills/legacy/SKILL.md', name: 'legacy', enabled: false },
					{ type: CustomizationType.Agent, id: 'ag1', uri: 'file:///ws/.github/agents/explore.agent.md', name: 'explore', description: 'Explore the codebase' },
					{ type: CustomizationType.Hook, id: 'hk1', uri: 'file:///ws/.github/hooks/lint.json', name: 'lint-on-save' },
				],
			},
			{ type: CustomizationType.McpServer, id: 'mcp1', uri: 'file:///ws/.mcp.json', name: 'github', enabled: true, state: { kind: 'running' } },
		] as unknown as readonly Customization[];

		const { events, resolved } = buildCustomizationDebugEvents(customizations, sessionResource, 's', new Date('2026-06-17T00:00:00.000Z'));

		const projection = events.map(e => e.kind === 'generic'
			? { id: e.id, parent: e.parentEventId, name: e.name, details: e.details, category: e.category }
			: { id: e.id });

		// One discovery event per present type (skills/hooks/agents/MCP) followed by
		// the roll-up summary, all parented under the session root `s`.
		assert.deepStrictEqual(projection, [
			{ id: 'agentHostCustomization:' + sessionResource.toString() + ':skill', parent: 's', name: 'Skill Discovery', details: '1 loaded, 1 disabled', category: 'discovery' },
			{ id: 'agentHostCustomization:' + sessionResource.toString() + ':hook', parent: 's', name: 'Hook Discovery', details: '1 loaded', category: 'discovery' },
			{ id: 'agentHostCustomization:' + sessionResource.toString() + ':agent', parent: 's', name: 'Agent Discovery', details: '1 loaded', category: 'discovery' },
			{ id: 'agentHostCustomization:' + sessionResource.toString() + ':mcpServer', parent: 's', name: 'MCP Server Discovery', details: '1 loaded', category: 'discovery' },
			{ id: 'agentHostCustomization:' + sessionResource.toString() + ':summary', parent: 's', name: 'Resolve Customizations', details: '1 skills, 1 agents, 1 hooks, 0 instructions', category: 'customization' },
		]);

		// The skill discovery event expands to a file list marking the disabled skill skipped.
		const skillList = resolved.get('agentHostCustomization:' + sessionResource.toString() + ':skill') as IChatDebugEventFileListContent;
		assert.deepStrictEqual(skillList.files.map(f => ({ name: f.name, status: f.status })), [
			{ name: 'troubleshoot', status: 'loaded' },
			{ name: 'legacy', status: 'skipped' },
		]);

		// The summary counts loaded skills/agents/hooks and the one skipped skill.
		const summary = resolved.get('agentHostCustomization:' + sessionResource.toString() + ':summary') as IChatDebugEventCustomizationSummaryContent;
		assert.deepStrictEqual(summary.counts, { instructions: 0, skills: 1, agents: 1, hooks: 1, skipped: 1 });
	});
});

suite('AgentHostChatDebugProvider - parseJsonl', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps records with the full envelope and drops blank, malformed, or data-less lines', () => {
		const text = [
			JSON.stringify({ type: 'user.message', id: 'a', parentId: null, timestamp: '2026-06-17T00:00:00.000Z', data: { content: 'ok' } }),
			JSON.stringify({ type: 'user.message', id: 'b', parentId: null, timestamp: '2026-06-17T00:00:00.000Z' }), // missing data
			JSON.stringify({ type: 'user.message', id: 'c', parentId: null, timestamp: '2026-06-17T00:00:00.000Z', data: 'not-an-object' }),
			JSON.stringify({ id: 'd', parentId: null, timestamp: '2026-06-17T00:00:00.000Z', data: {} }), // missing type
			JSON.stringify({ type: 'user.message', id: 'e', parentId: null, data: {} }), // missing timestamp
			JSON.stringify({ type: 'user.message', id: 'f', parentId: null, timestamp: '2026-06-17T00:00:00.000Z', data: [] }), // array data
			JSON.stringify({ type: 'user.message', id: 'g', parentId: 5, timestamp: '2026-06-17T00:00:00.000Z', data: {} }), // non-string parentId
			'{ not json',
			'   ',
			'',
		].join('\n');

		// Only the fully-formed record survives; partial/malformed lines are skipped
		// here rather than throwing later when the converter reads `record.data.*`
		// or builds `new Date(record.timestamp)`.
		assert.deepStrictEqual(parseJsonl(text).map(r => r.id), ['a']);
	});
});
