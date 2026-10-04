/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ObservedTokenUsage } from '../../node/copilot/observedTokenUsage.js';

suite('ObservedTokenUsage', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('missing records and invalid counters remain unknown', () => {
		const usage = new ObservedTokenUsage();
		assert.deepStrictEqual(usage.snapshot().summaries, [{
			usageScope: 'direct-model', usageStatus: 'notReported', usageRecordCount: 0,
			inputKnownRecordCount: 0, outputKnownRecordCount: 0, cacheKnownRecordCount: 0,
		}]);
		for (const [index, value] of [undefined, NaN, Infinity, -1, -Infinity].entries()) {
			usage.add(String(index), undefined, 'direct-model', { inputTokens: value, outputTokens: value, cacheReadTokens: value });
		}
		assert.deepStrictEqual(usage.snapshot().summaries, [{
			usageScope: 'direct-model', usageStatus: 'notReported', usageRecordCount: 5,
			inputKnownRecordCount: 0, outputKnownRecordCount: 0, cacheKnownRecordCount: 0,
		}]);
	});

	test('known zero and partial records retain independent availability', () => {
		const usage = new ObservedTokenUsage();
		usage.add('zero', 'gpt', 'direct-model', { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }, 'high');
		const snapshot = usage.snapshot();
		usage.add('partial', 'gpt', 'direct-model', { inputTokens: 12 }, 'high');
		assert.deepStrictEqual([snapshot.summaries[0], usage.snapshot().summaries[0]], [{
			model: 'gpt', reasoningEffort: 'high', usageScope: 'direct-model', usageStatus: 'known',
			usageRecordCount: 1, inputKnownRecordCount: 1, outputKnownRecordCount: 1, cacheKnownRecordCount: 1,
			knownInputTokens: 0, knownOutputTokens: 0, knownCacheReadTokens: 0,
		}, {
			model: 'gpt', reasoningEffort: 'high', usageScope: 'direct-model', usageStatus: 'partial',
			usageRecordCount: 2, inputKnownRecordCount: 2, outputKnownRecordCount: 1, cacheKnownRecordCount: 1,
			knownInputTokens: 12, knownOutputTokens: 0, knownCacheReadTokens: 0,
		}]);
	});

	test('finite nonnegative counters follow the shared provider availability contract', () => {
		const usage = new ObservedTokenUsage();
		usage.add('finite', 'gpt', 'direct-model', { inputTokens: 1.5, outputTokens: 2.5, cacheReadTokens: 0 });
		assert.deepStrictEqual(usage.snapshot().summaries[0], {
			model: 'gpt', usageScope: 'direct-model', usageStatus: 'known',
			usageRecordCount: 1, inputKnownRecordCount: 1, outputKnownRecordCount: 1, cacheKnownRecordCount: 1,
			knownInputTokens: 1.5, knownOutputTokens: 2.5, knownCacheReadTokens: 0,
		});
	});

	test('deduplicates stable event identities, not equal counters or model identities', () => {
		const usage = new ObservedTokenUsage();
		usage.add('same', 'gpt', 'direct-model', { inputTokens: 5 });
		usage.add('same', 'gpt', 'direct-model', { inputTokens: 5 });
		usage.add('other', 'gpt', 'direct-model', { inputTokens: 5 });
		usage.add(undefined, 'gpt', 'direct-model', { inputTokens: 5 });
		assert.deepStrictEqual(usage.snapshot().summaries[0], {
			model: 'gpt', usageScope: 'direct-model', usageStatus: 'partial',
			usageRecordCount: 3, inputKnownRecordCount: 3, outputKnownRecordCount: 0, cacheKnownRecordCount: 0,
			knownInputTokens: 15,
		});
	});

	test('separates models, compaction and owning request accumulators', () => {
		const root = new ObservedTokenUsage();
		const child = new ObservedTokenUsage();
		root.add('root', 'gpt', 'direct-model', { inputTokens: 10 });
		root.add('helper', 'claude', 'direct-model', { inputTokens: 20 });
		root.add('compact', undefined, 'compaction', { inputTokens: 30 });
		child.add('child', 'claude', 'direct-model', { inputTokens: 40 });
		assert.deepStrictEqual([root, child].map(usage => usage.snapshot().summaries.map(row => [row.model, row.usageScope, row.knownInputTokens])), [
			[['gpt', 'direct-model', 10], ['claude', 'direct-model', 20], [undefined, 'compaction', 30]],
			[['claude', 'direct-model', 40]],
		]);
	});

	test('same model with different reported efforts is not attributed to one selected effort', () => {
		const usage = new ObservedTokenUsage();
		usage.add('low', 'gpt', 'direct-model', { inputTokens: 3 }, 'low');
		usage.add('high', 'gpt', 'direct-model', { inputTokens: 7 }, 'high');
		usage.add('unknown', 'gpt', 'direct-model', { inputTokens: 11 });
		assert.deepStrictEqual(usage.snapshot().summaries.map(row => [row.reasoningEffort, row.knownInputTokens]), [
			['low', 3], ['high', 7], [undefined, 11],
		]);
	});
});
