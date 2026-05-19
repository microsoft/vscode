/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	cacheKey,
	IDP_SCOPES,
	isExpired,
} from '../../common/extHostXaaAuthProvider.js';

suite('XaaAuthProvider helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('cacheKey is scope-order-independent', () => {
		assert.strictEqual(
			cacheKey('https://r.example.com', ['b', 'a']),
			cacheKey('https://r.example.com', ['a', 'b'])
		);
	});

	test('cacheKey distinguishes different audiences', () => {
		assert.notStrictEqual(
			cacheKey('https://r1.example.com', ['s']),
			cacheKey('https://r2.example.com', ['s'])
		);
	});

	test('isExpired treats tokens without expires_in as never expiring', () => {
		assert.strictEqual(
			isExpired({ token: {}, created_at: 0 }, Number.MAX_SAFE_INTEGER),
			false
		);
	});

	test('isExpired flags tokens within 60s of expiry as expired', () => {
		const created_at = 1_000_000;
		const expires_in = 3600;
		// 60s before nominal expiry → already expired due to safety margin
		const justInsideMargin = created_at + (expires_in * 1000) - 30_000;
		assert.strictEqual(isExpired({ token: { expires_in }, created_at }, justInsideMargin), true);
		// well before expiry
		const earlier = created_at + 1000;
		assert.strictEqual(isExpired({ token: { expires_in }, created_at }, earlier), false);
	});

	test('IDP_SCOPES requests an OpenID session with refresh', () => {
		assert.deepStrictEqual([...IDP_SCOPES].sort(), ['offline_access', 'openid']);
	});
});
