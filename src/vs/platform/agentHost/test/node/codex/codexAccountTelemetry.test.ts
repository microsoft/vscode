/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ICodexAccountTelemetry } from '../../../common/codexAccountTelemetry.js';
import type { ICodexAccountState } from '../../../node/codex/codexAccountState.js';
import { getCodexAccountTelemetryContext, normalizeCodexPlanTier, type ICodexRateLimitSnapshot } from '../../../node/codex/codexAccountTelemetry.js';
import type { PlanType } from '../../../node/codex/protocol/generated/PlanType.js';

suite('CodexAccountTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const now = 1_000_000;
	const signedInAccount: ICodexAccountState = { usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', planType: 'plus' };
	const rateLimit = { usedPercent: 42.4, windowDurationMins: 7 * 24 * 60, resetsAt: now / 1000 + 3600 };
	const snapshot = { rateLimit, observedAt: now };

	test('normalizes every protocol plan to a public family', () => {
		const expected = {
			free: 'free',
			go: 'go',
			plus: 'plus',
			pro: 'pro',
			prolite: 'pro',
			team: 'business',
			self_serve_business_prolite: 'business',
			self_serve_business_usage_based: 'business',
			business: 'business',
			ent26: 'enterprise',
			enterprise_cbp_automation: 'enterprise',
			enterprise_cbp_usage_based: 'enterprise',
			enterprise: 'enterprise',
			edu: 'edu',
			edu_plus: 'edu',
			edu_pro: 'edu',
			unknown: 'unknown',
		} satisfies Record<PlanType, ICodexAccountTelemetry['chatgptPlanTier']>;

		assert.deepStrictEqual(Object.fromEntries(Object.keys(expected).map(plan => [plan, normalizeCodexPlanTier(plan)])), expected);
	});

	test('bounds future and invalid plan values', () => {
		const values = [undefined, null, '', 'future-plan', 'PLUS', '__proto__', 'constructor', 'toString', 0, false, [], {}];
		assert.deepStrictEqual(values.map(normalizeCodexPlanTier), values.map(() => 'unknown'));
	});

	test('distinguishes unavailable and non-ChatGPT accounts without plan or quota values', () => {
		const cases: readonly [ICodexAccountState | undefined, ICodexAccountTelemetry['chatgptAccountState']][] = [
			[undefined, 'unknown'],
			[{ ...signedInAccount, status: 'unknown' }, 'unknown'],
			[{ ...signedInAccount, status: 'error' }, 'unknown'],
			[{ ...signedInAccount, status: 'unavailable' }, 'unknown'],
			[{ ...signedInAccount, status: 'signedOut' }, 'notSignedIn'],
			[{ ...signedInAccount, authType: undefined }, 'unknown'],
			[{ ...signedInAccount, status: 'unavailable', authType: 'apiKey' }, 'notSignedIn'],
			[{ ...signedInAccount, status: 'unavailable', authType: 'other' }, 'notSignedIn'],
			[{ ...signedInAccount, usageSource: 'copilot' }, 'unknown'],
			[{ ...signedInAccount, usageSource: 'copilot', status: 'signedOut' }, 'unknown'],
		];
		assert.deepStrictEqual(cases.map(([account]) => getCodexAccountTelemetryContext(account, snapshot, now)), cases.map(([, chatgptAccountState]) => ({
			chatgptAccountState,
			chatgptWeeklyQuotaState: 'unavailable',
		})));
	});

	test('keeps missing and unrecognized plans explicitly unknown for signed-in accounts', () => {
		const plans = [undefined, '', 'future-plan'];
		assert.deepStrictEqual(plans.map(planType => getCodexAccountTelemetryContext({ ...signedInAccount, planType }, undefined, now)), plans.map(() => ({
			chatgptAccountState: 'signedIn',
			chatgptPlanTier: 'unknown',
			chatgptWeeklyQuotaState: 'missing',
		})));
	});

	test('buckets every boundary of a fresh exact-weekly snapshot', () => {
		const samples = Array.from({ length: 10 }, (_, index) => [[index * 10, index * 10], [index * 10 + 9.99, index * 10]]).flat();
		samples.push([100, 100]);
		assert.deepStrictEqual(samples.map(([usedPercent]) => getCodexAccountTelemetryContext(signedInAccount, {
			rateLimit: { ...rateLimit, usedPercent },
			observedAt: now - 5 * 60 * 1000,
		}, now)), samples.map(([, chatgptWeeklyUsedPercentBucket]) => ({
			chatgptAccountState: 'signedIn',
			chatgptPlanTier: 'plus',
			chatgptWeeklyQuotaState: 'available',
			chatgptWeeklyUsedPercentBucket,
		})));
	});

	test('accepts a fresh weekly snapshot without a known reset', () => {
		assert.deepStrictEqual(getCodexAccountTelemetryContext(signedInAccount, {
			rateLimit: { ...rateLimit, resetsAt: undefined },
			observedAt: now,
		}, now), {
			chatgptAccountState: 'signedIn',
			chatgptPlanTier: 'plus',
			chatgptWeeklyQuotaState: 'available',
			chatgptWeeklyUsedPercentBucket: 40,
		});
	});

	test('classifies unusable snapshots without inventing a bucket', () => {
		const cases: readonly [ICodexRateLimitSnapshot | undefined, ICodexAccountTelemetry['chatgptWeeklyQuotaState']][] = [
			[undefined, 'missing'],
			[{ ...snapshot, rateLimit: undefined }, 'missing'],
			[{ ...snapshot, observedAt: undefined }, 'missing'],
			[{ ...snapshot, observedAt: Number.NaN }, 'invalid'],
			[{ ...snapshot, observedAt: Number.POSITIVE_INFINITY }, 'invalid'],
			[{ ...snapshot, observedAt: Number.NEGATIVE_INFINITY }, 'invalid'],
			[{ ...snapshot, observedAt: now + 1 }, 'invalid'],
			[{ ...snapshot, observedAt: now - 5 * 60 * 1000 - 1 }, 'stale'],
			[{ ...snapshot, rateLimit: { ...rateLimit, windowDurationMins: undefined } }, 'nonWeekly'],
			[{ ...snapshot, rateLimit: { ...rateLimit, windowDurationMins: 300 } }, 'nonWeekly'],
			[{ ...snapshot, rateLimit: { ...rateLimit, windowDurationMins: 30 * 24 * 60 } }, 'nonWeekly'],
			[{ ...snapshot, rateLimit: { ...rateLimit, windowDurationMins: 0 } }, 'invalid'],
			[{ ...snapshot, rateLimit: { ...rateLimit, windowDurationMins: -1 } }, 'invalid'],
			[{ ...snapshot, rateLimit: { ...rateLimit, windowDurationMins: Number.NaN } }, 'invalid'],
			[{ ...snapshot, rateLimit: { ...rateLimit, windowDurationMins: Number.POSITIVE_INFINITY } }, 'invalid'],
			[{ ...snapshot, rateLimit: { ...rateLimit, resetsAt: now / 1000 } }, 'expired'],
			[{ ...snapshot, rateLimit: { ...rateLimit, resetsAt: now / 1000 - 1 } }, 'expired'],
			[{ ...snapshot, rateLimit: { ...rateLimit, resetsAt: 0 } }, 'invalid'],
			[{ ...snapshot, rateLimit: { ...rateLimit, resetsAt: -1 } }, 'invalid'],
			[{ ...snapshot, rateLimit: { ...rateLimit, resetsAt: Number.NaN } }, 'invalid'],
			[{ ...snapshot, rateLimit: { ...rateLimit, resetsAt: Number.POSITIVE_INFINITY } }, 'invalid'],
			[{ ...snapshot, rateLimit: { ...rateLimit, resetsAt: Number.MAX_VALUE } }, 'invalid'],
			[{ ...snapshot, rateLimit: { ...rateLimit, usedPercent: Number.NaN } }, 'invalid'],
			[{ ...snapshot, rateLimit: { ...rateLimit, usedPercent: Number.POSITIVE_INFINITY } }, 'invalid'],
			[{ ...snapshot, rateLimit: { ...rateLimit, usedPercent: Number.NEGATIVE_INFINITY } }, 'invalid'],
			[{ ...snapshot, rateLimit: { ...rateLimit, usedPercent: -1 } }, 'invalid'],
			[{ ...snapshot, rateLimit: { ...rateLimit, usedPercent: 101 } }, 'invalid'],
		];
		assert.deepStrictEqual(cases.map(([value]) => getCodexAccountTelemetryContext(signedInAccount, value, now)), cases.map(([, chatgptWeeklyQuotaState]) => ({
			chatgptAccountState: 'signedIn',
			chatgptPlanTier: 'plus',
			chatgptWeeklyQuotaState,
		})));
	});

	test('retains only immutable bounded values from the input snapshot', () => {
		const account = { ...signedInAccount };
		const limits = { ...rateLimit };
		const context = getCodexAccountTelemetryContext(account, { rateLimit: limits, observedAt: now }, now);
		account.status = 'signedOut';
		account.planType = 'business';
		limits.usedPercent = 100;
		limits.resetsAt = 0;

		assert.deepStrictEqual({ context, frozen: Object.isFrozen(context) }, {
			context: {
				chatgptAccountState: 'signedIn',
				chatgptPlanTier: 'plus',
				chatgptWeeklyQuotaState: 'available',
				chatgptWeeklyUsedPercentBucket: 40,
			},
			frozen: true,
		});
	});
});
