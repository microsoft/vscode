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
			profileImageDataUri: undefined,
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

	test('reads only safe profile-image metadata', () => {
		const profileImageDataUri = 'data:image/png;base64,aW1hZ2U=';
		const account = readCodexAccountInfo({
			agents: [],
			_meta: { [CODEX_ACCOUNT_META_KEY]: { status: 'signedIn', profileImageDataUri } },
		});
		assert.strictEqual(account.profileImageDataUri, profileImageDataUri);

		const unsafeAccount = readCodexAccountInfo({
			agents: [],
			_meta: { [CODEX_ACCOUNT_META_KEY]: { status: 'signedIn', profileImageDataUri: 'data:image/svg+xml;base64,aW1hZ2U=' } },
		});
		assert.strictEqual(unsafeAccount.profileImageDataUri, undefined);
	});

	test('reads the downloading account state', () => {
		const account = readCodexAccountInfo({
			agents: [],
			_meta: { [CODEX_ACCOUNT_META_KEY]: { status: 'downloading' } },
		});

		assert.strictEqual(account.status, 'downloading');
	});
});
