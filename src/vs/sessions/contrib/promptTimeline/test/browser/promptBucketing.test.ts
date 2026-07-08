/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { _testing, budgetBucketPrompts, MAX_TICKS, type PromptItem } from '../../browser/promptBucketing.js';

suite('PromptBucketing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const now = new Date(2026, 6, 1, 12, 0, 0).getTime();

	function prompt(requestId: string, date: Date): PromptItem {
		return {
			requestId,
			text: `Prompt ${requestId}`,
			timestamp: date.getTime()
		};
	}

	test('returns no buckets for empty input', () => {
		assert.deepStrictEqual(budgetBucketPrompts([], now), []);
	});

	test('keeps a single prompt as one tick', () => {
		const item = prompt('p1', new Date(2026, 6, 1, 11, 30));

		assert.deepStrictEqual(budgetBucketPrompts([item], now), [{
			prompt: item,
			prompts: [item],
			count: 1
		}]);
	});

	test('keeps today prompts at per-prompt granularity', () => {
		const prompts = [
			prompt('p1', new Date(2026, 6, 1, 9)),
			prompt('p2', new Date(2026, 6, 1, 9, 30)),
			prompt('p3', new Date(2026, 6, 1, 10))
		];

		assert.deepStrictEqual(_testing.bucketPrompts(prompts, new Date(now)).map(bucket => ({
			requestId: bucket.prompt.requestId,
			ids: bucket.prompts.map(prompt => prompt.requestId),
			count: bucket.count
		})), [
			{ requestId: 'p1', ids: ['p1'], count: 1 },
			{ requestId: 'p2', ids: ['p2'], count: 1 },
			{ requestId: 'p3', ids: ['p3'], count: 1 }
		]);
	});

	test('groups older consecutive prompts by day and month', () => {
		const prompts = [
			prompt('day-1', new Date(2026, 5, 20, 9)),
			prompt('day-2', new Date(2026, 5, 20, 18)),
			prompt('day-3', new Date(2026, 5, 19, 9)),
			prompt('month-1', new Date(2026, 4, 8, 9)),
			prompt('month-2', new Date(2026, 4, 25, 9))
		];

		assert.deepStrictEqual(_testing.bucketPrompts(prompts, new Date(now)).map(bucket => ({
			requestId: bucket.prompt.requestId,
			ids: bucket.prompts.map(prompt => prompt.requestId),
			count: bucket.count
		})), [
			{ requestId: 'day-1', ids: ['day-1', 'day-2'], count: 2 },
			{ requestId: 'day-3', ids: ['day-3'], count: 1 },
			{ requestId: 'month-1', ids: ['month-1', 'month-2'], count: 2 }
		]);
	});

	test('caps with uniform sampling while keeping first and last', () => {
		const buckets = Array.from({ length: 10 }, (_, index) => {
			const item = prompt(`p${index}`, new Date(2026, 6, 1, index));
			return { prompt: item, prompts: [item], count: 1 };
		});

		assert.deepStrictEqual(_testing.uniformSample(buckets, 5).map(bucket => bucket.prompt.requestId), [
			'p0',
			'p2',
			'p5',
			'p7',
			'p9'
		]);
	});

	test('expands the most recent coarse bucket when under budget', () => {
		const prompts = [
			prompt('older-1', new Date(2026, 5, 20, 9)),
			prompt('older-2', new Date(2026, 5, 20, 10)),
			prompt('recent-1', new Date(2026, 5, 30, 9)),
			prompt('recent-2', new Date(2026, 5, 30, 10)),
			prompt('recent-3', new Date(2026, 5, 30, 11))
		];
		const buckets = _testing.bucketPrompts(prompts, new Date(now));

		assert.deepStrictEqual(_testing.expandRecentBuckets(buckets, 4).map(bucket => ({
			requestId: bucket.prompt.requestId,
			ids: bucket.prompts.map(prompt => prompt.requestId),
			count: bucket.count
		})), [
			{ requestId: 'older-1', ids: ['older-1', 'older-2'], count: 2 },
			{ requestId: 'recent-1', ids: ['recent-1'], count: 1 },
			{ requestId: 'recent-2', ids: ['recent-2'], count: 1 },
			{ requestId: 'recent-3', ids: ['recent-3'], count: 1 }
		]);
	});

	test('never returns more than MAX_TICKS', () => {
		const prompts = Array.from({ length: 80 }, (_, index) => prompt(`p${index}`, new Date(2026, 6, 1, 0, index)));

		assert.deepStrictEqual({
			length: budgetBucketPrompts(prompts, now).length,
			first: budgetBucketPrompts(prompts, now)[0].prompt.requestId,
			last: budgetBucketPrompts(prompts, now)[MAX_TICKS - 1].prompt.requestId
		}, {
			length: MAX_TICKS,
			first: 'p0',
			last: 'p79'
		});
	});

	test('honors an explicit maxTicks cap smaller than MAX_TICKS', () => {
		const prompts = Array.from({ length: 40 }, (_, index) => prompt(`p${index}`, new Date(2026, 6, 1, 0, index)));
		const result = budgetBucketPrompts(prompts, now, 6);

		assert.deepStrictEqual({
			length: result.length,
			first: result[0].prompt.requestId,
			last: result[result.length - 1].prompt.requestId
		}, {
			length: 6,
			first: 'p0',
			last: 'p39'
		});
	});
});
