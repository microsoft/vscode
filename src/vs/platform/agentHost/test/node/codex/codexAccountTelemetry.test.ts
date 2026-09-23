/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ICodexAccountTelemetryContext } from '../../../common/agentHostTelemetry.js';
import type { ICodexAccountRateLimitInfo } from '../../../common/codexAccount.js';
import type { ICodexAccountState } from '../../../node/codex/codexAccountState.js';
import { getCodexAccountTelemetryContext, normalizeChatGPTPlanTier } from '../../../node/codex/codexAccountTelemetry.js';
import type { PlanType } from '../../../node/codex/protocol/generated/PlanType.js';

suite('CodexAccountTelemetry', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const now = 1_000_000;
	const account: ICodexAccountState = { usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', planType: 'plus' };
	const rateLimit: ICodexAccountRateLimitInfo = { usedPercent: 42.4, windowDurationMins: 7 * 24 * 60, resetsAt: now / 1000 + 3600 };

	test('normalizes every generated plan value', () => {
		const expected = {
			free: 'free', go: 'go', plus: 'plus', pro: 'pro', prolite: 'pro',
			team: 'business', self_serve_business_prolite: 'business', self_serve_business_usage_based: 'business', business: 'business',
			ent26: 'enterprise', enterprise_cbp_automation: 'enterprise', enterprise_cbp_usage_based: 'enterprise', enterprise: 'enterprise',
			edu: 'edu', edu_plus: 'edu', edu_pro: 'edu', unknown: 'unknown',
		} satisfies Record<PlanType, ICodexAccountTelemetryContext['chatgptPlanTier']>;

		assert.deepStrictEqual(Object.fromEntries(Object.keys(expected).map(plan => [plan, normalizeChatGPTPlanTier(plan)])), expected);
	});

	test('maps unrecognized and invalid plan values to unknown', () => {
		const values = [undefined, null, '', 'future-plan', 'PLUS', ' plus ', '__proto__', 'constructor', 'toString', 1, {}, ['plus']];
		assert.deepStrictEqual(values.map(normalizeChatGPTPlanTier), values.map(() => 'unknown'));
	});

	test('omits inapplicable context for unavailable account states', () => {
		const accounts: (ICodexAccountState | undefined)[] = [
			undefined,
			{ ...account, status: 'unknown' },
			{ ...account, status: 'unavailable' },
			{ ...account, status: 'error', error: 'unavailable' },
			{ ...account, status: 'unavailable', authType: 'apiKey' },
			{ ...account, status: 'unavailable', authType: 'other' },
			{ ...account, authType: undefined },
			{ ...account, authType: 'apiKey' },
			{ ...account, status: 'signedOut' },
		];
		assert.deepStrictEqual(accounts.map(value => getCodexAccountTelemetryContext(value, rateLimit, now, now)), [
			...accounts.slice(0, -1).map(() => ({ chatgptAccountState: 'unknown', chatgptWeeklyQuotaState: 'unavailable' })),
			{ chatgptAccountState: 'signedOut', chatgptWeeklyQuotaState: 'unavailable' },
		]);
	});

	test('preserves unknown plan and missing snapshot availability', () => {
		assert.deepStrictEqual(getCodexAccountTelemetryContext({ ...account, planType: undefined }, undefined, undefined, now), {
			chatgptAccountState: 'signedIn', chatgptPlanTier: 'unknown', chatgptWeeklyQuotaState: 'missing',
		});
	});

	test('buckets all weekly boundaries using the observation at turn start', () => {
		const samples = [0, ...Array.from({ length: 10 }, (_, index) => [(index + 1) * 10 - 0.01, (index + 1) * 10]).flat()];
		assert.deepStrictEqual(samples.map(usedPercent => getCodexAccountTelemetryContext(account, { ...rateLimit, usedPercent }, now - 5 * 60 * 1000, now)),
			samples.map((_, index) => ({
				chatgptAccountState: 'signedIn', chatgptPlanTier: 'plus', chatgptWeeklyQuotaState: 'available',
				chatgptWeeklyUsedPercentBucket: Math.floor(index / 2) * 10,
			})));
	});

	test('distinguishes unusable snapshots without emitting a bucket', () => {
		const cases: { rateLimit: ICodexAccountRateLimitInfo | undefined; observedAt: number | undefined; state: ICodexAccountTelemetryContext['chatgptWeeklyQuotaState'] }[] = [
			{ rateLimit: undefined, observedAt: now, state: 'missing' },
			{ rateLimit, observedAt: undefined, state: 'missing' },
			{ rateLimit, observedAt: now - 5 * 60 * 1000 - 1, state: 'stale' },
			...[now + 1, -1, NaN, Infinity, -Infinity].map(observedAt => ({ rateLimit, observedAt, state: 'invalid' as const })),
			...[undefined, 300, 10079, 10081, 30 * 24 * 60].map(windowDurationMins => ({ rateLimit: { ...rateLimit, windowDurationMins }, observedAt: now, state: 'nonWeekly' as const })),
			...[NaN, Infinity, -1, 0].map(windowDurationMins => ({ rateLimit: { ...rateLimit, windowDurationMins }, observedAt: now, state: 'invalid' as const })),
			...[now / 1000, now / 1000 - 1].map(resetsAt => ({ rateLimit: { ...rateLimit, resetsAt }, observedAt: now, state: 'expired' as const })),
			...[NaN, Infinity, -Infinity, 0, -1].map(resetsAt => ({ rateLimit: { ...rateLimit, resetsAt }, observedAt: now, state: 'invalid' as const })),
			...[NaN, Infinity, -Infinity, -0.01, 100.01].map(usedPercent => ({ rateLimit: { ...rateLimit, usedPercent }, observedAt: now, state: 'invalid' as const })),
		];
		assert.deepStrictEqual(cases.map(value => getCodexAccountTelemetryContext(account, value.rateLimit, value.observedAt, now)),
			cases.map(value => ({ chatgptAccountState: 'signedIn', chatgptPlanTier: 'plus', chatgptWeeklyQuotaState: value.state })));
	});

	test('accepts an unknown reset and a reset after admission', () => {
		assert.deepStrictEqual([undefined, now / 1000 + 0.001].map(resetsAt => getCodexAccountTelemetryContext(account, { ...rateLimit, resetsAt }, now, now)), [
			{ chatgptAccountState: 'signedIn', chatgptPlanTier: 'plus', chatgptWeeklyQuotaState: 'available', chatgptWeeklyUsedPercentBucket: 40 },
			{ chatgptAccountState: 'signedIn', chatgptPlanTier: 'plus', chatgptWeeklyQuotaState: 'available', chatgptWeeklyUsedPercentBucket: 40 },
		]);
	});

	test('copies only bounded values into an immutable snapshot', () => {
		const sourceAccount = { ...account, email: 'person@example.com' };
		const sourceRateLimit = { ...rateLimit };
		const snapshot = getCodexAccountTelemetryContext(sourceAccount, sourceRateLimit, now, now);
		sourceAccount.planType = 'free';
		sourceRateLimit.usedPercent = 100;
		assert.deepStrictEqual({ snapshot, frozen: Object.isFrozen(snapshot) }, {
			snapshot: { chatgptAccountState: 'signedIn', chatgptPlanTier: 'plus', chatgptWeeklyQuotaState: 'available', chatgptWeeklyUsedPercentBucket: 40 },
			frozen: true,
		});
	});
});
