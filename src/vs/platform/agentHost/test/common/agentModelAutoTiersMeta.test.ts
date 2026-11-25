/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { collectAutoTierPromotions } from '../../common/meta/agentModelMeta.js';

suite('agentModelAutoTiersMeta', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('groups the runtime\'s per-tier promotions by promotion, accepting the optional fields the SDK contract allows', () => {
		const launch = { id: 'ensemble-launch', discountPercent: 30, startsAt: '2026-10-28T00:00:00Z', endsAt: '2026-11-27T00:00:00Z', message: '30% off', showBanner: true };
		const discountOnly = { discountPercent: 10 };
		assert.deepStrictEqual(collectAutoTierPromotions([
			{ id: 'balance', billing: { promo: launch } },
			{ id: 'hydrafusion', billing: { promo: launch } },
			{ id: 'hydrafusion-max', billing: { promo: { id: 'max-preview', message: 'Max is coming' } } },
			{ id: 'efficiency', billing: { promo: discountOnly } },
			{ id: 'intelligence', billing: { promo: discountOnly } },
			{ id: 'premium', billing: { promo: { id: 'empty' } } },
			{ id: 'broken', billing: { promo: { id: 'bad-date', message: 'Sale', endsAt: 'soon' } } },
			{ id: 'fast', billing: {} },
			{ id: 'none' },
		]), [
			{ id: 'ensemble-launch', message: '30% off', discountPercent: 30, tierIds: ['balance', 'hydrafusion'], startsAt: '2026-10-28T00:00:00Z', endsAt: '2026-11-27T00:00:00Z', showBanner: true },
			{ id: 'max-preview', message: 'Max is coming', discountPercent: 0, tierIds: ['hydrafusion-max'] },
			{ id: JSON.stringify([undefined, 10, undefined, undefined]), discountPercent: 10, tierIds: ['efficiency', 'intelligence'] },
		]);
	});

});
