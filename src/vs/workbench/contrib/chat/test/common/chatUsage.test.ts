/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatUsage } from '../../common/chatService/chatService.js';
import { aggregateChatUsage, getLatestModelCallTokensPerSecond } from '../../common/chatUsage.js';

suite('Chat usage aggregation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('aggregates whole-turn totals by model', () => {
		const summary = aggregateChatUsage([
			usage([
				{ model: 'Claude', inputTokens: 10, cachedTokens: 4, outputTokens: 2 },
				{ model: 'GPT', inputTokens: 5, cachedTokens: 1, outputTokens: 3 },
			]),
			usage([
				{ model: 'Claude', inputTokens: 20, cachedTokens: 8, outputTokens: 6 },
			]),
		]);

		assert.deepStrictEqual(summary, {
			inputTokens: 35,
			cachedTokens: 13,
			outputTokens: 11,
			models: [
				{ model: 'Claude', inputTokens: 30, cachedTokens: 12, outputTokens: 8 },
				{ model: 'GPT', inputTokens: 5, cachedTokens: 1, outputTokens: 3 },
			],
			isComplete: true,
		});
	});

	test('marks response-level fallback as partial', () => {
		assert.deepStrictEqual(aggregateChatUsage([
			{ kind: 'usage', promptTokens: 10, completionTokens: 2 },
			undefined,
			{ kind: 'usage', promptTokens: 20, completionTokens: 4 },
		]), {
			inputTokens: 30,
			outputTokens: 6,
			models: [],
			isComplete: false,
		});
	});

	test('marks missing request usage as partial when model totals are available', () => {
		assert.deepStrictEqual(aggregateChatUsage([
			usage([
				{ model: 'Claude', inputTokens: 10, cachedTokens: 4, outputTokens: 2 },
			]),
			undefined,
		]), {
			inputTokens: 10,
			outputTokens: 2,
			models: [
				{ model: 'Claude', inputTokens: 10, cachedTokens: 4, outputTokens: 2 },
			],
			isComplete: false,
		});
	});

	test('ignores invalid totals and returns undefined without usable usage', () => {
		assert.strictEqual(aggregateChatUsage([
			undefined,
			{ kind: 'usage', promptTokens: -1, completionTokens: 2 },
			{
				kind: 'usage',
				promptTokens: Number.NaN,
				completionTokens: 1,
				modelTotals: [{ model: 'Claude', inputTokens: Number.NaN, cachedTokens: 0, outputTokens: 2 }],
			},
		]), undefined);
	});

	test('measures output speed from the latest model call only when the provider timed it', () => {
		const usages: (IChatUsage | undefined)[] = [
			// A subagent's call is reported on its parent turn, whose completion tokens are the parent's own.
			{ kind: 'usage', promptTokens: 900, completionTokens: 40, latestModelCall: { duration: 5000, outputTokens: 300 } },
			{ kind: 'usage', promptTokens: 900, completionTokens: 120, latestModelCall: { duration: 2000 } },
			{ kind: 'usage', promptTokens: 900, completionTokens: 120 },
			{ kind: 'usage', promptTokens: 900, completionTokens: 120, latestModelCall: { duration: 0 } },
			{ kind: 'usage', promptTokens: 900, completionTokens: 0, latestModelCall: { duration: 2000 } },
			undefined,
		];
		assert.deepStrictEqual(usages.map(getLatestModelCallTokensPerSecond), [60, 60, undefined, undefined, undefined, undefined]);
	});
});

function usage(modelTotals: NonNullable<IChatUsage['modelTotals']>): IChatUsage {
	return {
		kind: 'usage',
		promptTokens: 1,
		completionTokens: 1,
		modelTotals,
	};
}
