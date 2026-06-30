/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatDebugModelTurnEvent } from '../../common/chatDebugService.js';
import { convertAgentHostEventsToDebugEvents, parseJsonl } from '../../browser/chatDebug/agentHostChatDebugProvider.js';
import { COPILOT_CLI_LOCAL_AH_SCHEME } from '../../browser/copilotCliEventsUri.js';

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
