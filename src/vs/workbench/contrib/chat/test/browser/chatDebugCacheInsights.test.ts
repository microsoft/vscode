/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { diffPromptSignature, INormalizedMessage } from '../../browser/chatDebug/chatDebugCacheDiff.js';
import { analyzeStringDivergence, analyzeToolCatalog, buildSessionCacheReport, CacheBreakCategory, CacheInsightSeverity, categorizeCacheBreak, computeCacheInsights, detectVolatileValue, ICacheInsight, ICacheInsightsInput, maxInsightSeverity, primaryInsight, StringDivergenceShape, VolatileValueKind } from '../../browser/chatDebug/chatDebugCacheInsights.js';

function msg(role: string, text: string): INormalizedMessage {
	return { role, text, charLength: text.length };
}

function makeInput(overrides: Partial<ICacheInsightsInput> & { aMessages?: readonly INormalizedMessage[]; bMessages?: readonly INormalizedMessage[] }): ICacheInsightsInput {
	const aMessages = overrides.aMessages ?? [];
	const bMessages = overrides.bMessages ?? [];
	return {
		aModel: 'gpt-test',
		bModel: 'gpt-test',
		aSystem: 'system prompt',
		bSystem: 'system prompt',
		aTools: undefined,
		bTools: undefined,
		diff: diffPromptSignature(aMessages, bMessages),
		optionsDiff: [],
		hitPct: 50,
		inputTokens: 50_000,
		minutesSincePrevious: 0.5,
		isContinuation: false,
		previousIsContinuation: false,
		compareInputMessages: true,
		...overrides,
		aMessages,
		bMessages,
	};
}

/** Project insights down to the fields that matter for scenario assertions. */
function shape(insights: readonly ICacheInsight[]): { severity: string; component: string | undefined }[] {
	return insights.map(i => ({ severity: i.severity, component: i.component }));
}

suite('chatDebugCacheInsights', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('analyzeStringDivergence', () => {
		test('classifies every shape and reports common spans', () => {
			assert.deepStrictEqual(
				[
					analyzeStringDivergence('same', 'same'),
					analyzeStringDivergence('hello world', 'hello world!!')?.shape,
					analyzeStringDivergence('hello world!!', 'hello world')?.shape,
					analyzeStringDivergence('PREFIX hello', 'hello')?.shape,
					analyzeStringDivergence('hello', 'PREFIX hello')?.shape,
					analyzeStringDivergence('aaa MIDDLE zzz', 'aaa OTHER zzz')?.shape,
				],
				[
					undefined,
					StringDivergenceShape.TrailingAdded,
					StringDivergenceShape.TrailingRemoved,
					StringDivergenceShape.LeadingRemoved,
					StringDivergenceShape.LeadingAdded,
					StringDivergenceShape.InnerEdit,
				],
			);
		});

		test('inner edit reports first-difference offset and disjoint common spans', () => {
			const d = analyzeStringDivergence('aaa MIDDLE zzz', 'aaa OTHER zzz')!;
			assert.deepStrictEqual(
				{ commonPrefix: d.commonPrefix, commonSuffix: d.commonSuffix, aChanged: d.aChanged, bChanged: d.bChanged },
				{ commonPrefix: 4, commonSuffix: 4, aChanged: 'MIDDLE', bChanged: 'OTHER' },
			);
		});
	});

	suite('detectVolatileValue', () => {
		test('detects matching volatile kinds with differing values', () => {
			assert.deepStrictEqual(
				[
					detectVolatileValue('at 2026-06-10 09:15', 'at 2026-06-10 09:21'),
					detectVolatileValue('id 6e9c0a4e-1f2b-4c3d-8e5f-aa0011223344', 'id 0e9c0a4e-1f2b-4c3d-8e5f-aa0011223344'),
					detectVolatileValue('seq 1718000000123', 'seq 1718000000456'),
					detectVolatileValue('same 2026-06-10', 'same 2026-06-10'),
					detectVolatileValue('plain text', 'other text'),
				],
				[VolatileValueKind.Timestamp, VolatileValueKind.Uuid, VolatileValueKind.Counter, undefined, undefined],
			);
		});
	});

	suite('analyzeToolCatalog', () => {
		test('classifies reorder, add/remove, and modify', () => {
			const toolA = JSON.stringify([{ name: 'read' }, { name: 'edit' }]);
			const toolAReordered = JSON.stringify([{ name: 'edit' }, { name: 'read' }]);
			const toolAPlus = JSON.stringify([{ name: 'read' }, { name: 'edit' }, { name: 'grep' }]);
			const toolAModified = JSON.stringify([{ name: 'read', description: 'v2' }, { name: 'edit' }]);
			assert.deepStrictEqual(
				[
					analyzeToolCatalog(toolA, toolAReordered),
					analyzeToolCatalog(toolA, toolAPlus),
					analyzeToolCatalog(toolA, toolAModified),
					analyzeToolCatalog('not json', toolA),
				],
				[
					{ added: [], removed: [], modified: [], reorderedOnly: true, aCount: 2, bCount: 2 },
					{ added: ['grep'], removed: [], modified: [], reorderedOnly: false, aCount: 2, bCount: 3 },
					{ added: [], removed: [], modified: ['read'], reorderedOnly: false, aCount: 2, bCount: 2 },
					undefined,
				],
			);
		});
	});

	suite('computeCacheInsights', () => {
		test('pure append is a single OK finding pointing at the first new message', () => {
			const shared = [msg('user', 'question'), msg('assistant', 'answer')];
			const insights = computeCacheInsights(makeInput({
				aMessages: shared,
				bMessages: [...shared, msg('user', 'follow-up')],
			}));
			assert.deepStrictEqual(shape(insights), [
				{ severity: CacheInsightSeverity.Ok, component: 'messages[2]' },
			]);
		});

		test('in-place history rewrite is critical and reported before later changes', () => {
			const insights = computeCacheInsights(makeInput({
				aMessages: [msg('user', 'question'), msg('assistant', 'PREAMBLE answer'), msg('user', 'next')],
				bMessages: [msg('user', 'question'), msg('assistant', 'answer'), msg('user', 'changed next')],
			}));
			assert.deepStrictEqual(shape(insights), [
				{ severity: CacheInsightSeverity.Critical, component: 'messages[1]' },
				{ severity: CacheInsightSeverity.Info, component: undefined },
			]);
		});

		test('cache-key order: tools and system findings precede the message finding', () => {
			const insights = computeCacheInsights(makeInput({
				aModel: 'model-a',
				bModel: 'model-b',
				aTools: JSON.stringify([{ name: 'read' }]),
				bTools: JSON.stringify([{ name: 'read' }, { name: 'edit' }]),
				aSystem: 'system v1',
				bSystem: 'system v2',
				aMessages: [msg('user', 'hi')],
				bMessages: [msg('user', 'hi'), msg('assistant', 'reply')],
			}));
			// model, tools, system are critical; the append downgrades to info
			// because an earlier tier already broke the cache.
			assert.deepStrictEqual(shape(insights), [
				{ severity: CacheInsightSeverity.Critical, component: undefined },
				{ severity: CacheInsightSeverity.Critical, component: 'tools' },
				{ severity: CacheInsightSeverity.Critical, component: 'system' },
				{ severity: CacheInsightSeverity.Info, component: 'messages[1]' },
			]);
		});

		test('byte-identical prompt with ~0% hit reads as likely expiration', () => {
			const shared = [msg('user', 'question')];
			const insights = computeCacheInsights(makeInput({
				aMessages: shared,
				bMessages: shared,
				hitPct: 0,
				minutesSincePrevious: 7,
			}));
			assert.deepStrictEqual(
				insights.map(i => i.severity),
				[CacheInsightSeverity.Warning],
			);
		});

		test('byte-identical prompt with a high hit is OK', () => {
			const shared = [msg('user', 'question')];
			const insights = computeCacheInsights(makeInput({
				aMessages: shared,
				bMessages: shared,
				hitPct: 99.5,
			}));
			assert.deepStrictEqual(
				insights.map(i => i.severity),
				[CacheInsightSeverity.Ok],
			);
		});

		test('history truncation is critical at the cut position', () => {
			const insights = computeCacheInsights(makeInput({
				aMessages: [msg('user', 'q'), msg('assistant', 'a'), msg('user', 'old tail')],
				bMessages: [msg('user', 'q'), msg('assistant', 'a')],
			}));
			assert.deepStrictEqual(shape(insights), [
				{ severity: CacheInsightSeverity.Critical, component: 'messages[2]' },
			]);
		});

		test('continuation suppresses message analysis and adds the continuation note', () => {
			const insights = computeCacheInsights(makeInput({
				aMessages: [msg('user', 'full history')],
				bMessages: [msg('tool', 'delta only')],
				diff: diffPromptSignature([], []),
				isContinuation: true,
				compareInputMessages: false,
			}));
			assert.deepStrictEqual(
				insights.map(i => i.severity),
				[CacheInsightSeverity.Info],
			);
		});

		test('volatile timestamp in the system prompt is called out in the hint', () => {
			const insights = computeCacheInsights(makeInput({
				aSystem: 'You are helpful. Current time: 2026-06-10 09:15:00. Stay safe.',
				bSystem: 'You are helpful. Current time: 2026-06-10 09:21:42. Stay safe.',
			}));
			const system = insights.find(i => i.component === 'system');
			assert.deepStrictEqual(
				{ severity: system?.severity, mentionsTimestamp: system?.hint?.includes('timestamp') },
				{ severity: CacheInsightSeverity.Critical, mentionsTimestamp: true },
			);
		});

		test('tiny prompt with a miss reads as below-minimum-cacheable, not expiration', () => {
			const shared = [msg('user', 'short utility prompt')];
			const insights = computeCacheInsights(makeInput({
				aMessages: shared,
				bMessages: shared,
				hitPct: 0,
				inputTokens: 800,
			}));
			assert.deepStrictEqual(
				{ severities: insights.map(i => i.severity), mentionsMinimum: insights[0].title.includes('minimum') },
				{ severities: [CacheInsightSeverity.Warning], mentionsMinimum: true },
			);
		});

		test('appending more blocks than the lookback window adds a warning', () => {
			const shared = [msg('user', 'q')];
			const appended = Array.from({ length: 25 }, (_, i) => msg('tool', `result ${i}`));
			const insights = computeCacheInsights(makeInput({
				aMessages: shared,
				bMessages: [...shared, ...appended],
			}));
			assert.deepStrictEqual(
				insights.map(i => i.severity),
				[CacheInsightSeverity.Ok, CacheInsightSeverity.Warning],
			);
		});

		test('helpers: maxInsightSeverity and primaryInsight pick the worst / first actionable finding', () => {
			const insights = computeCacheInsights(makeInput({
				aSystem: 'v1',
				bSystem: 'v2',
				aMessages: [msg('user', 'q')],
				bMessages: [msg('user', 'q'), msg('assistant', 'a')],
			}));
			assert.deepStrictEqual(
				{ max: maxInsightSeverity(insights), primaryComponent: primaryInsight(insights)?.component },
				{ max: CacheInsightSeverity.Critical, primaryComponent: 'system' },
			);
		});
	});

	suite('categorizeCacheBreak', () => {
		test('classifies pairs by their primary finding', () => {
			const shared = [msg('user', 'q'), msg('assistant', 'a')];
			assert.deepStrictEqual(
				[
					categorizeCacheBreak(computeCacheInsights(makeInput({ aMessages: shared, bMessages: [...shared, msg('user', 'next')] }))),
					categorizeCacheBreak(computeCacheInsights(makeInput({ aSystem: 'v1', bSystem: 'v2', aMessages: shared, bMessages: shared }))),
					categorizeCacheBreak(computeCacheInsights(makeInput({ aMessages: shared, bMessages: shared, hitPct: 0 }))),
					categorizeCacheBreak(computeCacheInsights(makeInput({
						aMessages: [msg('user', 'q'), msg('assistant', 'OLD a')],
						bMessages: [msg('user', 'q'), msg('assistant', 'NEW a')],
					}))),
				],
				[CacheBreakCategory.Healthy, CacheBreakCategory.System, CacheBreakCategory.Expiration, CacheBreakCategory.History],
			);
		});
	});

	suite('buildSessionCacheReport', () => {
		test('flags recurring avoidable categories and sums wasted tokens', () => {
			const report = buildSessionCacheReport([
				{ turnIndex: 1, category: CacheBreakCategory.Healthy, lostTokens: 2_000 },
				{ turnIndex: 2, category: CacheBreakCategory.Tools, lostTokens: 60_000 },
				{ turnIndex: 3, category: CacheBreakCategory.Tools, lostTokens: 55_000 },
				{ turnIndex: 4, category: CacheBreakCategory.Expiration, lostTokens: 40_000 },
				{ turnIndex: 5, category: CacheBreakCategory.System, lostTokens: 10_000 },
			]);
			assert.deepStrictEqual(
				{
					pairCount: report.pairCount,
					healthyCount: report.healthyCount,
					avoidableLostTokens: report.avoidableLostTokens,
					byCategory: report.byCategory,
					findingSeverities: report.findings.map(f => ({ severity: f.severity, category: f.category })),
					cause3: report.causeByTurnIndex.get(3),
				},
				{
					pairCount: 5,
					healthyCount: 1,
					avoidableLostTokens: 125_000,
					byCategory: [
						{ category: CacheBreakCategory.Tools, count: 2, lostTokens: 115_000 },
						{ category: CacheBreakCategory.Expiration, count: 1, lostTokens: 40_000 },
						{ category: CacheBreakCategory.System, count: 1, lostTokens: 10_000 },
					],
					findingSeverities: [{ severity: CacheInsightSeverity.Critical, category: CacheBreakCategory.Tools }],
					cause3: CacheBreakCategory.Tools,
				},
			);
		});

		test('all-healthy session yields a single OK finding', () => {
			const report = buildSessionCacheReport([
				{ turnIndex: 1, category: CacheBreakCategory.Healthy, lostTokens: 1_000 },
				{ turnIndex: 2, category: CacheBreakCategory.Healthy, lostTokens: 1_500 },
			]);
			assert.deepStrictEqual(
				{ healthyCount: report.healthyCount, findings: report.findings.map(f => f.severity), avoidable: report.avoidableLostTokens },
				{ healthyCount: 2, findings: [CacheInsightSeverity.Ok], avoidable: 0 },
			);
		});

		test('overall hit rate is token-weighted across all turns', () => {
			// One huge healthy request and one tiny full miss: pair-counting
			// would read "50% of requests missed", token-weighting shows the
			// truth — nearly everything was served from cache.
			const report = buildSessionCacheReport(
				[{ turnIndex: 1, category: CacheBreakCategory.Expiration, lostTokens: 1_000 }],
				[
					{ inputTokens: 99_000, cachedTokens: 99_000 },
					{ inputTokens: 1_000, cachedTokens: 0 },
					{ inputTokens: 0, cachedTokens: 0 }, // no usage reported — excluded
				],
			);
			assert.deepStrictEqual(report.overall, {
				inputTokens: 100_000,
				cachedTokens: 99_000,
				hitPct: 99,
				turnCount: 2,
			});
		});

		test('overall is undefined when no turn reported token usage', () => {
			const report = buildSessionCacheReport(
				[{ turnIndex: 1, category: CacheBreakCategory.Healthy, lostTokens: 0 }],
				[{ inputTokens: 0, cachedTokens: 0 }],
			);
			assert.strictEqual(report.overall, undefined);
		});

		test('recurring expiration yields a warning finding', () => {
			const report = buildSessionCacheReport([
				{ turnIndex: 1, category: CacheBreakCategory.Expiration, lostTokens: 30_000 },
				{ turnIndex: 2, category: CacheBreakCategory.Expiration, lostTokens: 35_000 },
				{ turnIndex: 3, category: CacheBreakCategory.Healthy, lostTokens: 500 },
			]);
			assert.deepStrictEqual(
				report.findings.map(f => ({ severity: f.severity, category: f.category })),
				[{ severity: CacheInsightSeverity.Warning, category: CacheBreakCategory.Expiration }],
			);
		});
	});
});
