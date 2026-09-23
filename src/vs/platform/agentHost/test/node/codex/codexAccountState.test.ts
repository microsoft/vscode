/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { codexAccountRateLimitFromResponse, codexAccountStateFromResponse } from '../../../node/codex/codexAccountState.js';
import type { RateLimitWindow } from '../../../node/codex/protocol/generated/v2/RateLimitWindow.js';

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

	test('prefers the Codex weekly rate-limit window', () => {
		assert.deepStrictEqual(codexAccountRateLimitFromResponse({
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
		}), {
			usedPercent: 42.4,
			windowDurationMins: 7 * 24 * 60,
			resetsAt: 300,
		});
	});

	test('falls back to available rate-limit data', () => {
		assert.deepStrictEqual(codexAccountRateLimitFromResponse({
			rateLimits: {
				limitId: null,
				limitName: null,
				primary: { usedPercent: 42.4, windowDurationMins: null, resetsAt: null },
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
		}), { usedPercent: 42.4, windowDurationMins: undefined, resetsAt: undefined });
	});

	test('rejects invalid rate-limit samples before caching', () => {
		const window: RateLimitWindow = { usedPercent: 42.4, windowDurationMins: 10080, resetsAt: 400 };
		const invalidWindows = [
			...[-1, 101, NaN, Infinity].map(usedPercent => ({ ...window, usedPercent })),
			...[-1, 0, NaN, Infinity].map(windowDurationMins => ({ ...window, windowDurationMins })),
			...[-1, 0, NaN, Infinity].map(resetsAt => ({ ...window, resetsAt })),
		];
		assert.deepStrictEqual(invalidWindows.map(primary => codexAccountRateLimitFromResponse({
			rateLimits: {
				limitId: null, limitName: null, primary, secondary: null, credits: null,
				individualLimit: null, spendControlReached: null, planType: null, rateLimitReachedType: null,
			},
			rateLimitsByLimitId: null, rateLimitResetCredits: null, accountId: null, rateLimitUpsell: null,
		})), invalidWindows.map(() => undefined));
	});

	test('falls back when the Codex bucket has no windows', () => {
		assert.deepStrictEqual(codexAccountRateLimitFromResponse({
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
		}), { usedPercent: 30, windowDurationMins: 10080, resetsAt: 400 });
	});
});
