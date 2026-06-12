/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatEntitlement } from '../../../../services/chat/common/chatEntitlementService.js';
import { buildQuotaExceededMessage, QuotaExceededCode } from '../../common/chatQuotaMessage.js';

suite('buildQuotaExceededMessage', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('standard (non-UBB) plan messages', () => {
		assert.deepStrictEqual(
			{
				free: buildQuotaExceededMessage({ entitlement: ChatEntitlement.Free }),
				pro: buildQuotaExceededMessage({ entitlement: ChatEntitlement.Pro }),
				proPlus: buildQuotaExceededMessage({ entitlement: ChatEntitlement.ProPlus }),
				managed: buildQuotaExceededMessage({ entitlement: ChatEntitlement.Business }),
				other: buildQuotaExceededMessage({ entitlement: ChatEntitlement.Unknown }),
			},
			{
				free: 'You\'ve reached your monthly chat messages quota. Upgrade to Copilot Pro or wait for your allowance to renew.',
				pro: 'You\'ve exhausted your premium model quota. Please enable additional paid premium requests, upgrade to Copilot Pro+, or wait for your allowance to renew.',
				proPlus: 'You\'ve exhausted your premium model quota. Please enable additional paid premium requests or wait for your allowance to renew.',
				managed: 'You\'ve exhausted your credits. To continue working, please contact your organization\'s Copilot admin or wait for your allowance to renew.',
				other: 'You\'ve exhausted your premium model quota. To continue working, switch to Auto. For additional paid premium requests, please reach out to your organization\'s Copilot admin or wait for your allowance to renew.',
			},
		);
	});

	test('usage-based-billing (credit) plan messages', () => {
		assert.deepStrictEqual(
			{
				free: buildQuotaExceededMessage({ entitlement: ChatEntitlement.Free, usageBasedBilling: true }),
				managed: buildQuotaExceededMessage({ entitlement: ChatEntitlement.Enterprise, usageBasedBilling: true }),
			},
			{
				free: 'You\'ve reached your monthly credit limit. Upgrade to Copilot Pro or wait for your credits to reset.',
				managed: 'You\'ve reached your credit limit. To continue working, please contact your organization\'s Copilot admin or wait for your credits to reset.',
			},
		);
	});

	test('reset date is appended when provided', () => {
		const message = buildQuotaExceededMessage({
			entitlement: ChatEntitlement.Free,
			usageBasedBilling: true,
			quotaResetDate: '2026-06-30T17:00:00.000Z',
			quotaResetDateHasTime: true,
		});
		assert.ok(message.startsWith('You\'ve reached your monthly credit limit. Upgrade to Copilot Pro or wait until your credits reset on '));
	});

	test('special backend codes', () => {
		assert.deepStrictEqual(
			{
				overage: buildQuotaExceededMessage({ entitlement: ChatEntitlement.Pro, code: QuotaExceededCode.OverageLimitReached }),
				additionalSpend: buildQuotaExceededMessage({ entitlement: ChatEntitlement.Pro, code: QuotaExceededCode.AdditionalSpendLimitReached }),
				billingNotConfigured: buildQuotaExceededMessage({ entitlement: ChatEntitlement.Pro, code: QuotaExceededCode.BillingNotConfigured, serverMessage: 'Billing is not configured for your org.' }),
			},
			{
				overage: 'You cannot accrue additional premium requests at this time. Please contact [GitHub Support](https://support.github.com/contact) to continue using Copilot.',
				additionalSpend: 'You\'ve reached your additional usage limit for your plan. Upgrade your plan to keep going.',
				billingNotConfigured: 'Billing is not configured for your org.',
			},
		);
	});

	test('free_quota_exceeded is treated as the standard quota code', () => {
		assert.strictEqual(
			buildQuotaExceededMessage({ entitlement: ChatEntitlement.Free, code: QuotaExceededCode.FreeQuotaExceeded }),
			buildQuotaExceededMessage({ entitlement: ChatEntitlement.Free }),
		);
	});
});
