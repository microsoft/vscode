/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { codexAccountRateLimitsFromResponse, codexAccountStateFromResponse } from '../../../node/codex/codexAccountState.js';

suite('CodexAccountState', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps ChatGPT identities as human accounts', () => {
		assert.deepStrictEqual(
			codexAccountStateFromResponse({ account: { type: 'chatgpt', email: 'private@example.com', planType: 'plus' }, requiresOpenaiAuth: true }),
			{ usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', email: 'private@example.com', planType: 'plus', requiresOpenaiAuth: true },
		);
		assert.deepStrictEqual(
			codexAccountStateFromResponse({ account: { type: 'chatgpt', email: null, planType: 'team' }, requiresOpenaiAuth: true }),
			{ usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', email: undefined, planType: 'team', requiresOpenaiAuth: true },
		);
	});

	test('distinguishes required sign-in from providers without OpenAI auth', () => {
		assert.deepStrictEqual(
			codexAccountStateFromResponse({ account: null, requiresOpenaiAuth: true }),
			{ usageSource: 'openai', status: 'signedOut', requiresOpenaiAuth: true },
		);
		assert.deepStrictEqual(
			codexAccountStateFromResponse({ account: null, requiresOpenaiAuth: false }),
			{ usageSource: 'openai', status: 'unavailable', requiresOpenaiAuth: false },
		);
	});

	test('does not classify API key or Bedrock credentials as human accounts', () => {
		assert.deepStrictEqual(
			codexAccountStateFromResponse({ account: { type: 'apiKey' }, requiresOpenaiAuth: true }),
			{ usageSource: 'openai', status: 'unavailable', authType: 'apiKey', requiresOpenaiAuth: true },
		);
		assert.deepStrictEqual(
			codexAccountStateFromResponse({ account: { type: 'amazonBedrock', usesCodexManagedCredentials: true }, requiresOpenaiAuth: false }),
			{ usageSource: 'openai', status: 'unavailable', authType: 'other', requiresOpenaiAuth: false },
		);
	});

	test('preserves both Codex rate-limit windows with the weekly summary first', () => {
		assert.deepStrictEqual(codexAccountRateLimitsFromResponse({
			rateLimits: {
				limitId: null,
				limitName: null,
				primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 100 },
				secondary: null,
				credits: null,
				individualLimit: null,
				spendControlReached: null,
				planType: null,
				rateLimitReachedType: null,
			},
			rateLimitsByLimitId: {
				codex: {
					limitId: 'codex',
					limitName: 'Codex',
					primary: { usedPercent: 21, windowDurationMins: 300, resetsAt: 200 },
					secondary: { usedPercent: 42.4, windowDurationMins: 7 * 24 * 60, resetsAt: 300 },
					credits: null,
					individualLimit: null,
					spendControlReached: null,
					planType: null,
					rateLimitReachedType: null,
				},
			},
			rateLimitResetCredits: null,
			accountId: null,
			rateLimitUpsell: null,
		}), [{
			usedPercent: 42.4,
			windowDurationMins: 7 * 24 * 60,
			resetsAt: 300,
		}, {
			usedPercent: 21,
			windowDurationMins: 300,
			resetsAt: 200,
		}]);
	});

	test('falls back to available rate-limit data and clamps percentages', () => {
		assert.deepStrictEqual(codexAccountRateLimitsFromResponse({
			rateLimits: {
				limitId: null,
				limitName: null,
				primary: { usedPercent: 125, windowDurationMins: null, resetsAt: null },
				secondary: null,
				credits: null,
				individualLimit: null,
				spendControlReached: null,
				planType: null,
				rateLimitReachedType: null,
			},
			rateLimitsByLimitId: null,
			rateLimitResetCredits: null,
			accountId: null,
			rateLimitUpsell: null,
		}), [{ usedPercent: 100, windowDurationMins: undefined, resetsAt: undefined }]);
	});

	test('falls back when the Codex bucket has no windows', () => {
		assert.deepStrictEqual(codexAccountRateLimitsFromResponse({
			rateLimits: {
				limitId: null,
				limitName: null,
				primary: { usedPercent: 30, windowDurationMins: 10080, resetsAt: 400 },
				secondary: null,
				credits: null,
				individualLimit: null,
				spendControlReached: null,
				planType: null,
				rateLimitReachedType: null,
			},
			rateLimitsByLimitId: {
				codex: {
					limitId: 'codex',
					limitName: 'Codex',
					primary: null,
					secondary: null,
					credits: null,
					individualLimit: null,
					spendControlReached: null,
					planType: null,
					rateLimitReachedType: null,
				},
			},
			rateLimitResetCredits: null,
			accountId: null,
			rateLimitUpsell: null,
		}), [{ usedPercent: 30, windowDurationMins: 10080, resetsAt: 400 }]);
	});

	test('omits missing or invalid windows without losing a valid five-hour limit', () => {
		assert.deepStrictEqual([null, { usedPercent: 0, windowDurationMins: 300, resetsAt: null }].map(primary => codexAccountRateLimitsFromResponse({
			rateLimits: {
				limitId: null,
				limitName: null,
				primary,
				secondary: { usedPercent: NaN, windowDurationMins: 10080, resetsAt: 400 },
				credits: null,
				individualLimit: null,
				spendControlReached: null,
				planType: null,
				rateLimitReachedType: null,
			},
			rateLimitsByLimitId: null,
			rateLimitResetCredits: null,
			accountId: null,
			rateLimitUpsell: null,
		})), [[], [{ usedPercent: 0, windowDurationMins: 300, resetsAt: undefined }]]);
	});
});
