/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseAutoTierPromotions, readAgentModelAutoTierPromotionsMeta, withAgentModelAutoTierPromotionsMeta } from '../../common/meta/agentModelMeta.js';

suite('agentModelAutoTiersMeta', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads tier promotions from service messages in either casing, ignoring what it does not understand', () => {
		assert.deepStrictEqual(parseAutoTierPromotions([
			// An SDK's camelCase, with `null` for an absent start.
			{ id: 'camel', kind: 'promotion', appliesTo: [{ type: 'auto_tier', id: 'balance' }, { type: 'auto_tier', id: 'balance' }], message: 'Save', discountPercent: 20, startsAt: null, endsAt: '2026-11-27T00:00:00Z' },
			{ id: 'message-only', kind: 'promotion', applies_to: [{ type: 'auto_tier', id: 'hydrafusion' }], message: 'New tier', discount_percent: 0 },
			{ id: 'announcement', kind: 'announcement', applies_to: [{ type: 'auto_tier', id: 'balance' }], message: 'Hi', discount_percent: 0 },
			{ id: 'model-only', kind: 'promotion', applies_to: [{ type: 'model', id: 'gpt-5' }], message: 'Sale', discount_percent: 10 },
			{ id: 'too-much', kind: 'promotion', applies_to: [{ type: 'auto_tier', id: 'balance' }], message: 'Sale', discount_percent: 120 },
			{ id: 'no-message', kind: 'promotion', applies_to: [{ type: 'auto_tier', id: 'balance' }], discount_percent: 10 },
			'not an object',
		]), [
			{ id: 'camel', message: 'Save', discountPercent: 20, tierIds: ['balance'], endsAt: '2026-11-27T00:00:00Z' },
			{ id: 'message-only', message: 'New tier', discountPercent: 0, tierIds: ['hydrafusion'] },
		]);
		assert.deepStrictEqual(parseAutoTierPromotions(undefined), []);
	});

	test('round-trips promotions through model metadata and drops malformed ones', () => {
		const promotion = { id: 'launch', message: 'Save', discountPercent: 30, tierIds: ['balance'], startsAt: '2026-10-28T00:00:00Z', showBanner: true };
		const meta = withAgentModelAutoTierPromotionsMeta({ discountPercent: 10 }, [promotion]);
		assert.deepStrictEqual({
			read: readAgentModelAutoTierPromotionsMeta({ id: 'auto', provider: 'copilotcli', name: 'Auto', _meta: meta }),
			none: withAgentModelAutoTierPromotionsMeta({ discountPercent: 10 }, []),
			malformed: readAgentModelAutoTierPromotionsMeta({ id: 'auto', provider: 'copilotcli', name: 'Auto', _meta: { 'vscode.chat.autoTierPromotions': [{ id: 'x', message: 'y', discountPercent: 'z', tierIds: [] }] } }),
		}, {
			read: [promotion],
			none: { discountPercent: 10 },
			malformed: [],
		});
	});
});
