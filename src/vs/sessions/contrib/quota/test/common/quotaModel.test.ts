/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	QuotaCostData,
	TokenUsage,
	addUsage,
	buildCompactSummary,
	emptyUsage,
	estimateCost,
	formatCostUsd,
	formatDurationSeconds,
	formatTokenCount,
	formatWindowFraction,
	isSpendCapExceeded,
	pricingFor,
} from '../../common/quotaModel.js';

suite('quotaModel', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ── emptyUsage ────────────────────────────────────────────────────────────

	test('emptyUsage returns zero for every field', () => {
		assert.deepStrictEqual(emptyUsage(), {
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		});
	});

	// ── addUsage ──────────────────────────────────────────────────────────────

	test('addUsage accumulates all fields correctly', () => {
		const a: TokenUsage = { inputTokens: 100, outputTokens: 50, cacheCreationInputTokens: 20, cacheReadInputTokens: 10 };
		const b: TokenUsage = { inputTokens: 200, outputTokens: 75, cacheCreationInputTokens: 5,  cacheReadInputTokens: 30 };
		assert.deepStrictEqual(addUsage(a, b), {
			inputTokens: 300,
			outputTokens: 125,
			cacheCreationInputTokens: 25,
			cacheReadInputTokens: 40,
		});
	});

	test('addUsage with emptyUsage is an identity operation', () => {
		const u: TokenUsage = { inputTokens: 42, outputTokens: 7, cacheCreationInputTokens: 1, cacheReadInputTokens: 2 };
		assert.deepStrictEqual(addUsage(u, emptyUsage()), u);
		assert.deepStrictEqual(addUsage(emptyUsage(), u), u);
	});

	// ── pricingFor ────────────────────────────────────────────────────────────

	test('pricingFor returns known pricing for claude-opus-4-7', () => {
		assert.deepStrictEqual(pricingFor('claude-opus-4-7'), {
			inputPerMillion: 15,
			outputPerMillion: 75,
			cacheReadPerMillion: 1.5,
			cacheWritePerMillion: 18.75,
		});
	});

	test('pricingFor returns zero pricing for an unknown model', () => {
		assert.deepStrictEqual(pricingFor('unknown-model-xyz'), {
			inputPerMillion: 0,
			outputPerMillion: 0,
			cacheReadPerMillion: 0,
			cacheWritePerMillion: 0,
		});
	});

	// ── estimateCost ──────────────────────────────────────────────────────────

	test('estimateCost with zero usage returns zero', () => {
		assert.strictEqual(estimateCost(emptyUsage(), pricingFor('claude-opus-4-7')).usd, 0);
	});

	test('estimateCost computes correctly for sonnet at 1M tokens each', () => {
		const usage: TokenUsage = {
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		};
		assert.strictEqual(estimateCost(usage, pricingFor('claude-sonnet-4-6')).usd, 18);
	});

	test('estimateCost includes cache creation and read tokens', () => {
		const usage: TokenUsage = {
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationInputTokens: 1_000_000,
			cacheReadInputTokens: 1_000_000,
		};
		const cost = estimateCost(usage, pricingFor('claude-haiku-4-5'));
		assert.deepStrictEqual({ usd: parseFloat(cost.usd.toFixed(4)) }, { usd: 0.33 });
	});

	// ── formatCostUsd ─────────────────────────────────────────────────────────

	test('formatCostUsd formats common cases', () => {
		assert.deepStrictEqual({
			zero: formatCostUsd(0),
			subCent: formatCostUsd(0.001),
			fortyCents: formatCostUsd(0.42),
			twoDollars: formatCostUsd(2.00),
		}, {
			zero: '$0.00',
			subCent: '<$0.01',
			fortyCents: '$0.42',
			twoDollars: '$2.00',
		});
	});

	// ── formatTokenCount ──────────────────────────────────────────────────────

	test('formatTokenCount handles small, K, and M ranges', () => {
		assert.deepStrictEqual({
			small: formatTokenCount(42),
			kilo: formatTokenCount(12_345),
			mega: formatTokenCount(1_200_000),
		}, {
			small: '42',
			kilo: '12.3K',
			mega: '1.2M',
		});
	});

	// ── formatWindowFraction ──────────────────────────────────────────────────

	test('formatWindowFraction rounds to nearest percent', () => {
		assert.deepStrictEqual({
			zero: formatWindowFraction(0),
			half: formatWindowFraction(0.5),
			small: formatWindowFraction(0.124),
		}, {
			zero: '0%',
			half: '50%',
			small: '12%',
		});
	});

	// ── formatDurationSeconds ─────────────────────────────────────────────────

	test('formatDurationSeconds handles seconds, minutes, and hours', () => {
		assert.deepStrictEqual({
			seconds: formatDurationSeconds(45),
			minutes: formatDurationSeconds(150),
			hours: formatDurationSeconds(7320),
		}, {
			seconds: '45s',
			minutes: '2m',
			hours: '2h 2m',
		});
	});

	// ── isSpendCapExceeded ────────────────────────────────────────────────────

	test('isSpendCapExceeded returns false when no limit is set', () => {
		assert.strictEqual(isSpendCapExceeded({ limitUsd: undefined, currentTotalUsd: 999 }), false);
	});

	test('isSpendCapExceeded returns false when under the limit', () => {
		assert.strictEqual(isSpendCapExceeded({ limitUsd: 10, currentTotalUsd: 9.99 }), false);
	});

	test('isSpendCapExceeded returns true at exactly the limit', () => {
		assert.strictEqual(isSpendCapExceeded({ limitUsd: 10, currentTotalUsd: 10 }), true);
	});

	test('isSpendCapExceeded returns true when over the limit', () => {
		assert.strictEqual(isSpendCapExceeded({ limitUsd: 5, currentTotalUsd: 5.01 }), true);
	});

	// ── buildCompactSummary ───────────────────────────────────────────────────

	function makeData(overrides: Partial<QuotaCostData> = {}): QuotaCostData {
		return {
			summary: { totalUsage: emptyUsage(), estimatedCost: { usd: 0 }, byModel: [], byTool: [] },
			providerQuota: [],
			spendCap: { limitUsd: undefined, currentTotalUsd: 0 },
			...overrides,
		};
	}

	test('buildCompactSummary with zero data starts with $0.00', () => {
		const s = buildCompactSummary(makeData());
		assert.ok(s.startsWith('$0.00'), `Expected '$0.00' prefix, got: "${s}"`);
	});

	test('buildCompactSummary shows token count when non-zero', () => {
		const data = makeData({
			summary: {
				totalUsage: { inputTokens: 5_000, outputTokens: 2_000, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
				estimatedCost: { usd: 0 },
				byModel: [],
				byTool: [],
			},
		});
		const s = buildCompactSummary(data);
		assert.ok(s.includes('7.0K tokens'), `Expected token count in summary, got: "${s}"`);
	});

	test('buildCompactSummary shows subscription window fraction', () => {
		const data = makeData({
			providerQuota: [{ providerId: 'anthropic-oauth', displayName: 'Claude Pro', kind: 'subscription', windowFractionUsed: 0.12 }],
		});
		const s = buildCompactSummary(data);
		assert.deepStrictEqual({
			hasName: s.includes('Claude Pro'),
			hasFraction: s.includes('12%'),
		}, { hasName: true, hasFraction: true });
	});

	test('buildCompactSummary shows API-key RPM when no subscription present', () => {
		const data = makeData({
			providerQuota: [{ providerId: 'anthropic-key', displayName: 'Claude API', kind: 'api-key', requestsUsed: 4, requestsLimit: 30 }],
		});
		const s = buildCompactSummary(data);
		assert.ok(s.includes('4 / 30 RPM'), `Expected RPM in summary, got: "${s}"`);
	});

	test('buildCompactSummary prefers subscription over api-key when both present', () => {
		const data = makeData({
			providerQuota: [
				{ providerId: 'anthropic-key', displayName: 'Claude API', kind: 'api-key', requestsUsed: 4, requestsLimit: 30 },
				{ providerId: 'anthropic-oauth', displayName: 'Claude Pro', kind: 'subscription', windowFractionUsed: 0.25 },
			],
		});
		const s = buildCompactSummary(data);
		assert.deepStrictEqual({
			hasSubscription: s.includes('Claude Pro'),
			hasApiRpm: s.includes('RPM'),
		}, { hasSubscription: true, hasApiRpm: false });
	});
});
