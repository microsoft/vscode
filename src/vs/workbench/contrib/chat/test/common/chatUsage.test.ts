/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatUsage, IChatUsageModelTotal } from '../../common/chatService/chatService.js';
import { aggregateChatUsage } from '../../common/chatUsage.js';

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

	test('aggregates by provider ID and raw model ID rather than display labels', () => {
		const firstProvider = { id: 'first', kind: 'native', label: 'Shared provider label' };
		const secondProvider = { id: 'second', kind: 'native', label: 'Shared provider label' };
		const renamedProvider = { ...firstProvider, label: 'Renamed provider' };
		const summary = aggregateChatUsage([
			usage([
				{ model: 'raw-model', modelDisplayName: 'Shared model', provider: firstProvider, inputTokens: 10, cachedTokens: 4, outputTokens: 2 },
				{ model: 'raw-model', modelDisplayName: 'Shared model', provider: secondProvider, inputTokens: 5, cachedTokens: 1, outputTokens: 3 },
				{ model: 'raw-model', inputTokens: 7, cachedTokens: 0, outputTokens: 1 },
				{ model: 'other-model', modelDisplayName: 'Shared model', provider: firstProvider, inputTokens: 3, cachedTokens: 1, outputTokens: 0 },
			]),
			usage([
				{ model: 'raw-model', provider: renamedProvider, inputTokens: 20, cachedTokens: 8, outputTokens: 6 },
				{ model: 'raw-model', modelDisplayName: 'Renamed model', provider: secondProvider, inputTokens: 2, cachedTokens: 0, outputTokens: 4 },
			]),
		]);

		assert.deepStrictEqual(summary, {
			inputTokens: 47,
			cachedTokens: 14,
			outputTokens: 16,
			models: [
				{ model: 'raw-model', modelDisplayName: 'Shared model', provider: renamedProvider, inputTokens: 30, cachedTokens: 12, outputTokens: 8 },
				{ model: 'raw-model', modelDisplayName: 'Renamed model', provider: secondProvider, inputTokens: 7, cachedTokens: 1, outputTokens: 7 },
				{ model: 'raw-model', inputTokens: 7, cachedTokens: 0, outputTokens: 1 },
				{ model: 'other-model', modelDisplayName: 'Shared model', provider: firstProvider, inputTokens: 3, cachedTokens: 1, outputTokens: 0 },
			],
			isComplete: true,
		});
	});

	test('preserves explicit zero totals and unknown provider attribution independently of completeness', () => {
		const zeroTotals = [
			{ model: 'raw-model', provider: { id: 'first', kind: 'native', label: 'First provider' }, inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
			{ model: 'raw-model', inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
		];

		assert.deepStrictEqual({
			missing: aggregateChatUsage([undefined]),
			zero: aggregateChatUsage([usage(zeroTotals)]),
			partial: aggregateChatUsage([usage(zeroTotals), undefined]),
			legacy: aggregateChatUsage([{ kind: 'usage', promptTokens: 0, completionTokens: 0 }]),
		}, {
			missing: undefined,
			zero: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, models: zeroTotals, isComplete: true },
			partial: { inputTokens: 0, outputTokens: 0, models: zeroTotals, isComplete: false },
			legacy: { inputTokens: 0, outputTokens: 0, models: [], isComplete: false },
		});
	});

	test('separates binding accounts, binding identities and legacy provider references', () => {
		const legacy = { id: 'shared-id', kind: 'configured', label: 'Shared provider' };
		const unknownAccount = { ...legacy, binding: { source: 'configuration' } };
		const accountA = { ...unknownAccount, binding: { source: 'configuration', accountRef: { selectionId: 'account-a' } } };
		const accountB = { ...unknownAccount, binding: { source: 'configuration', accountRef: { selectionId: 'account-b' } } };
		const otherBinding = { ...accountA, id: 'other-binding' };
		const renamed = { ...accountA, kind: 'updated-kind', label: 'Renamed provider', binding: { ...accountA.binding, source: 'updated-source' } };
		const total = (provider: IChatUsageModelTotal['provider'], tokens: number): IChatUsageModelTotal => ({
			model: 'raw-model',
			modelDisplayName: 'Shared model',
			...(provider ? { provider } : {}),
			inputTokens: tokens * 10, cachedTokens: tokens, outputTokens: tokens,
		});
		const providers = [legacy, unknownAccount, accountA, accountB, otherBinding, undefined];

		assert.deepStrictEqual(aggregateChatUsage([
			usage(providers.map((provider, index) => total(provider, index + 1))),
			usage([total(renamed, 7)]),
		]), {
			inputTokens: 280,
			cachedTokens: 28,
			outputTokens: 28,
			models: [
				total(legacy, 1),
				total(unknownAccount, 2),
				total(renamed, 10),
				total(accountB, 4),
				total(otherBinding, 5),
				total(undefined, 6),
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
});

function usage(modelTotals: NonNullable<IChatUsage['modelTotals']>): IChatUsage {
	return {
		kind: 'usage',
		promptTokens: 1,
		completionTokens: 1,
		modelTotals,
	};
}
