/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatEntitlement } from '../../../../services/chat/common/chatEntitlementService.js';
import { buildQuotaExceededMessage } from '../../common/chatQuotaMessage.js';

suite('buildQuotaExceededMessage', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('free plan without reset date', () => {
		assert.strictEqual(
			buildQuotaExceededMessage({ entitlement: ChatEntitlement.Free }),
			'You\'ve reached your monthly credit limit. Upgrade to Copilot Pro or wait for your credits to reset.',
		);
	});

	test('managed plan points at the admin', () => {
		assert.strictEqual(
			buildQuotaExceededMessage({ entitlement: ChatEntitlement.Business }),
			'You\'ve reached your credit limit. Contact your organization\'s Copilot admin to continue.',
		);
	});

	test('anonymous user is prompted to sign in', () => {
		assert.strictEqual(
			buildQuotaExceededMessage({ entitlement: ChatEntitlement.Unknown }),
			'You\'ve reached your monthly credit limit. Sign in to keep going.',
		);
	});

	test('reset date is appended when provided', () => {
		const message = buildQuotaExceededMessage({
			entitlement: ChatEntitlement.Free,
			quotaResetDate: '2026-06-30T17:00:00.000Z',
			quotaResetDateHasTime: true,
		});
		assert.ok(message.startsWith('You\'ve reached your monthly credit limit. Upgrade to Copilot Pro or wait until your credits reset on '));
	});
});
