/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IEntitlementsData } from '../../../../../base/common/defaultAccount.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseQuotas } from '../../../../services/chat/common/chatEntitlementService.js';

suite('parseQuotas', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function makeEntitlementsData(overrides: Partial<IEntitlementsData>): IEntitlementsData {
		return {
			access_type_sku: 'plus_monthly_subscriber_quota',
			chat_enabled: true,
			assigned_date: '2026-04-17T12:53:45-07:00',
			can_signup_for_limited: false,
			copilot_plan: 'individual_pro',
			organization_login_list: [],
			analytics_tracking_id: 'test',
			...overrides,
		};
	}

	test('reads token_based_billing from top-level, not from quota snapshot', () => {
		const data = makeEntitlementsData({
			token_based_billing: true,
			quota_snapshots: {
				premium_interactions: {
					overage_count: 0,
					overage_permitted: true,
					percent_remaining: 97.4,
					unlimited: false,
					// no token_based_billing here — paid users don't have it per-snapshot
				},
			},
		});

		const quotas = parseQuotas(data);
		assert.strictEqual(quotas.premiumChat?.usageBasedBilling, true);
	});

	test('usageBasedBilling is undefined when top-level token_based_billing is absent', () => {
		const data = makeEntitlementsData({
			quota_snapshots: {
				premium_interactions: {
					overage_count: 0,
					overage_permitted: false,
					percent_remaining: 80,
					unlimited: false,
				},
			},
		});

		const quotas = parseQuotas(data);
		assert.strictEqual(quotas.premiumChat?.usageBasedBilling, undefined);
	});

	test('all quota types receive top-level token_based_billing', () => {
		const data = makeEntitlementsData({
			token_based_billing: true,
			quota_snapshots: {
				chat: {
					overage_count: 0,
					overage_permitted: false,
					percent_remaining: 100,
					unlimited: true,
				},
				completions: {
					overage_count: 0,
					overage_permitted: false,
					percent_remaining: 100,
					unlimited: true,
				},
				premium_interactions: {
					overage_count: 0,
					overage_permitted: true,
					percent_remaining: 97.4,
					unlimited: false,
				},
			},
		});

		const quotas = parseQuotas(data);
		assert.strictEqual(quotas.chat?.usageBasedBilling, true);
		assert.strictEqual(quotas.completions?.usageBasedBilling, true);
		assert.strictEqual(quotas.premiumChat?.usageBasedBilling, true);
	});

	test('parses paid user response correctly (top-level token_based_billing only)', () => {
		const data = makeEntitlementsData({
			quota_reset_date: '2026-06-01',
			quota_reset_date_utc: '2026-06-01T00:00:00.000Z',
			token_based_billing: true,
			quota_snapshots: {
				chat: {
					overage_count: 0,
					overage_permitted: false,
					percent_remaining: 100,
					unlimited: true,
					entitlement: '0',
				},
				completions: {
					overage_count: 0,
					overage_permitted: false,
					percent_remaining: 100,
					unlimited: true,
					entitlement: '0',
				},
				premium_interactions: {
					overage_count: 0,
					overage_permitted: true,
					percent_remaining: 97.4,
					unlimited: false,
					entitlement: '3900',
				},
			},
		});

		const quotas = parseQuotas(data);
		assert.deepStrictEqual(quotas, {
			resetDate: '2026-06-01T00:00:00.000Z',
			resetDateHasTime: true,
			chat: {
				percentRemaining: 100,
				unlimited: true,
				usageBasedBilling: true,
				resetAt: undefined,
				entitlement: 0,
			},
			completions: {
				percentRemaining: 100,
				unlimited: true,
				usageBasedBilling: true,
				resetAt: undefined,
				entitlement: 0,
			},
			premiumChat: {
				percentRemaining: 97.4,
				unlimited: false,
				usageBasedBilling: true,
				resetAt: undefined,
				entitlement: 3900,
			},
			additionalUsageEnabled: true,
			additionalUsageCount: 0,
		});
	});

	test('parses free user CFI response with per-snapshot token_based_billing', () => {
		const data = makeEntitlementsData({
			access_type_sku: 'free_limited_copilot',
			copilot_plan: 'free',
			token_based_billing: true,
			quota_snapshots: {
				chat: {
					overage_count: 0,
					overage_permitted: false,
					percent_remaining: 98.7,
					unlimited: false,
				},
				completions: {
					overage_count: 0,
					overage_permitted: false,
					percent_remaining: 100,
					unlimited: false,
				},
				premium_interactions: {
					overage_count: 0,
					overage_permitted: false,
					percent_remaining: 0,
					unlimited: false,
				},
			},
		});

		const quotas = parseQuotas(data);
		assert.strictEqual(quotas.chat?.usageBasedBilling, true);
		assert.strictEqual(quotas.completions?.usageBasedBilling, true);
		assert.strictEqual(quotas.premiumChat?.usageBasedBilling, true);
		assert.strictEqual(quotas.premiumChat?.percentRemaining, 0);
		assert.strictEqual(quotas.additionalUsageEnabled, false);
	});

	test('skips quota snapshots with has_quota false', () => {
		const data = makeEntitlementsData({
			access_type_sku: 'free_limited_copilot',
			copilot_plan: 'free',
			token_based_billing: true,
			quota_snapshots: {
				chat: {
					overage_count: 0,
					overage_permitted: false,
					percent_remaining: 97.8,
					unlimited: false,
					entitlement: '200',
					has_quota: true,
				},
				completions: {
					overage_count: 0,
					overage_permitted: false,
					percent_remaining: 100,
					unlimited: false,
					entitlement: '4000',
					has_quota: true,
				},
				premium_interactions: {
					overage_count: 999700,
					overage_permitted: false,
					percent_remaining: 0,
					unlimited: false,
					entitlement: '0',
					has_quota: false,
				},
			},
		});

		const quotas = parseQuotas(data);
		assert.strictEqual(quotas.chat?.percentRemaining, 97.8);
		assert.strictEqual(quotas.chat?.entitlement, 200);
		assert.strictEqual(quotas.completions?.percentRemaining, 100);
		assert.strictEqual(quotas.completions?.entitlement, 4000);
		assert.strictEqual(quotas.premiumChat, undefined);
	});
});
