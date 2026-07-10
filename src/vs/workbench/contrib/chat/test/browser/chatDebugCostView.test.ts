/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatDebugEvent } from '../../common/chatDebugService.js';
import { computeCostBreakdown, computeCostMatrix } from '../../browser/chatDebug/chatDebugCostView.js';

suite('ChatDebugCostView - computeCostBreakdown', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('vscode-chat-debug://session-1');
	const created = new Date(0);

	// A session with one main-agent turn, a top-level `runSubagent` tool call,
	// and a nested subagent turn (which nests under the spawning tool call via
	// `parentEventId`). Credits: main turn 5 AIC, subagent turn 3 AIC. Token
	// fields are populated as they would be after the provider's per-model
	// back-fill.
	const events: IChatDebugEvent[] = [
		{ kind: 'userMessage', id: 'u1', sessionResource, created, message: 'go', sections: [] },
		{ kind: 'modelTurn', id: 'm1', sessionResource, created, parentEventId: 'u1', model: 'claude-opus-4.8', copilotUsageNanoAiu: 5_000_000_000, inputTokens: 1000, outputTokens: 100, cachedTokens: 800 },
		{ kind: 'toolCall', id: 'tc1', sessionResource, created, parentEventId: 'm1', toolName: 'runSubagent', input: JSON.stringify({ description: 'Search the codebase' }) },
		{ kind: 'modelTurn', id: 'm2', sessionResource, created, parentEventId: 'tc1', model: 'claude-sonnet-4.6', copilotUsageNanoAiu: 3_000_000_000, inputTokens: 400, outputTokens: 50, cachedTokens: 100 },
		{ kind: 'toolCall', id: 'tc2', sessionResource, created, parentEventId: 'm2', toolName: 'grep' },
	];

	test('groups cost by subagent, attributing nested turns to the spawning tool call', () => {
		const breakdown = computeCostBreakdown(events, 'subagent');
		const snapshot = {
			totalNanoAiu: breakdown.totalNanoAiu,
			sessionTokens: { input: breakdown.inputTokens, output: breakdown.outputTokens, cached: breakdown.cachedTokens },
			buckets: breakdown.buckets.map(b => ({
				label: b.label,
				nanoAiu: b.nanoAiu,
				modelTurnCount: b.modelTurnCount,
				toolCallCount: b.toolCallCount,
				tokens: { input: b.inputTokens, output: b.outputTokens, cached: b.cachedTokens },
				leaves: Array.from(b.leaves.values()).map(l => ({ label: l.label, nanoAiu: l.nanoAiu, input: l.inputTokens })),
			})),
		};
		assert.deepStrictEqual(snapshot, {
			totalNanoAiu: 8_000_000_000,
			sessionTokens: { input: 1400, output: 150, cached: 900 },
			buckets: [
				{
					label: 'Main Agent',
					nanoAiu: 5_000_000_000,
					modelTurnCount: 1,
					toolCallCount: 1,
					tokens: { input: 1000, output: 100, cached: 800 },
					leaves: [{ label: 'claude-opus-4.8', nanoAiu: 5_000_000_000, input: 1000 }],
				},
				{
					label: 'runSubagent: Search the codebase',
					nanoAiu: 3_000_000_000,
					modelTurnCount: 1,
					toolCallCount: 1,
					tokens: { input: 400, output: 50, cached: 100 },
					leaves: [{ label: 'claude-sonnet-4.6', nanoAiu: 3_000_000_000, input: 400 }],
				},
			],
		});
	});

	test('groups cost by model, splitting each model across subagents', () => {
		const breakdown = computeCostBreakdown(events, 'model');
		const snapshot = {
			totalNanoAiu: breakdown.totalNanoAiu,
			buckets: breakdown.buckets.map(b => ({
				label: b.label,
				nanoAiu: b.nanoAiu,
				modelTurnCount: b.modelTurnCount,
				input: b.inputTokens,
				leaves: Array.from(b.leaves.values()).map(l => ({ label: l.label, nanoAiu: l.nanoAiu })),
			})),
		};
		assert.deepStrictEqual(snapshot, {
			totalNanoAiu: 8_000_000_000,
			buckets: [
				{
					label: 'claude-opus-4.8',
					nanoAiu: 5_000_000_000,
					modelTurnCount: 1,
					input: 1000,
					leaves: [{ label: 'Main Agent', nanoAiu: 5_000_000_000 }],
				},
				{
					label: 'claude-sonnet-4.6',
					nanoAiu: 3_000_000_000,
					modelTurnCount: 1,
					input: 400,
					leaves: [{ label: 'runSubagent: Search the codebase', nanoAiu: 3_000_000_000 }],
				},
			],
		});
	});

	test('builds a subagent × model matrix whose rows and columns reconcile to the total', () => {
		const matrix = computeCostMatrix(events);
		const snapshot = {
			totalNanoAiu: matrix.totalNanoAiu,
			columns: matrix.columns.map(c => ({ label: c.label, nanoAiu: c.nanoAiu })),
			rows: matrix.rows.map(r => ({
				label: r.label,
				nanoAiu: r.nanoAiu,
				cells: matrix.columns.map(c => r.cells.get(c.key) ?? 0),
			})),
		};
		assert.deepStrictEqual(snapshot, {
			totalNanoAiu: 8_000_000_000,
			columns: [
				{ label: 'claude-opus-4.8', nanoAiu: 5_000_000_000 },
				{ label: 'claude-sonnet-4.6', nanoAiu: 3_000_000_000 },
			],
			rows: [
				{ label: 'Main Agent', nanoAiu: 5_000_000_000, cells: [5_000_000_000, 0] },
				{ label: 'runSubagent: Search the codebase', nanoAiu: 3_000_000_000, cells: [0, 3_000_000_000] },
			],
		});
	});

	test('reports a zero total and no token data when no credits are present', () => {
		const breakdown = computeCostBreakdown([
			{ kind: 'modelTurn', id: 'm1', sessionResource, created, model: 'm' },
		], 'subagent');
		assert.deepStrictEqual(
			{ total: breakdown.totalNanoAiu, hasTokenData: breakdown.hasTokenData },
			{ total: 0, hasTokenData: false },
		);
	});
});
