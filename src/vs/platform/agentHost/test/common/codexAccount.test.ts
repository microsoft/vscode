/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CODEX_ACCOUNT_META_KEY, readCodexAccountInfo } from '../../common/codexAccount.js';

suite('Codex account metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads validated rate-limit metadata', () => {
		assert.deepStrictEqual(readCodexAccountInfo({
			agents: [],
			_meta: {
				[CODEX_ACCOUNT_META_KEY]: {
					status: 'signedIn',
					email: 'person@example.com',
					rateLimit: { usedPercent: 42.4, windowDurationMins: 10080, resetsAt: 1234 },
				},
			},
		}), {
			status: 'signedIn',
			email: 'person@example.com',
			planType: undefined,
			profileImage: undefined,
			requiresOpenaiAuth: undefined,
			rateLimit: { usedPercent: 42.4, windowDurationMins: 10080, resetsAt: 1234 },
			rateLimits: undefined,
			authUrl: undefined,
			authUrlNonce: undefined,
		});
	});

	test('drops malformed rate-limit metadata', () => {
		const account = readCodexAccountInfo({
			agents: [],
			_meta: {
				[CODEX_ACCOUNT_META_KEY]: { status: 'signedIn', rateLimit: { usedPercent: 101 } },
			},
		});
		assert.strictEqual(account.status, 'signedIn');
		assert.strictEqual(account.rateLimit, undefined);
	});

	test('reads both rate-limit windows and drops malformed entries independently', () => {
		const weekly = { usedPercent: 42.4, windowDurationMins: 10080, resetsAt: 1234 };
		const fiveHour = { usedPercent: 0, windowDurationMins: 300, resetsAt: 123 };
		const account = readCodexAccountInfo({
			agents: [],
			_meta: {
				[CODEX_ACCOUNT_META_KEY]: {
					status: 'signedIn',
					rateLimits: [weekly, null, { usedPercent: 101 }, { usedPercent: 10, resetsAt: -1 }, fiveHour],
				},
			},
		});
		assert.deepStrictEqual(account.rateLimits, [weekly, fiveHour]);
	});

	test('reads only safe profile-image references', () => {
		const nonce = 'a'.repeat(64);
		const profileImage = {
			uri: `vscode-codex-profile-image:/profile-${nonce}.png`,
			contentType: 'image/png',
			sizeHint: 5,
			nonce,
		};
		const account = readCodexAccountInfo({
			agents: [],
			_meta: { [CODEX_ACCOUNT_META_KEY]: { status: 'signedIn', profileImage } },
		});
		assert.deepStrictEqual(account.profileImage, profileImage);

		const unsafeAccount = readCodexAccountInfo({
			agents: [],
			_meta: { [CODEX_ACCOUNT_META_KEY]: { status: 'signedIn', profileImage: { ...profileImage, uri: 'https://example.test/profile.png' } } },
		});
		assert.strictEqual(unsafeAccount.profileImage, undefined);
	});

	test('reads the downloading account state', () => {
		const account = readCodexAccountInfo({
			agents: [],
			_meta: { [CODEX_ACCOUNT_META_KEY]: { status: 'downloading' } },
		});

		assert.strictEqual(account.status, 'downloading');
	});

	test('preserves validated request correlation on a terminal sign-in failure', () => {
		const readFailure = (authUrlNonce: string | number) => readCodexAccountInfo({
			agents: [],
			_meta: { [CODEX_ACCOUNT_META_KEY]: { status: 'error', authUrlNonce } },
		});

		assert.deepStrictEqual({
			valid: readFailure('failed-request').authUrlNonce,
			invalid: readFailure(42).authUrlNonce,
			url: readFailure('failed-request').authUrl,
		}, {
			valid: 'failed-request',
			invalid: undefined,
			url: undefined,
		});
	});
});
