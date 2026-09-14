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
});
