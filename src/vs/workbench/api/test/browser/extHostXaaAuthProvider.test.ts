/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { IAuthorizationTokenResponse } from '../../../../base/common/oauth.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	cacheKey,
	IDP_SCOPES,
	isExpired,
	toSession,
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

	test('isExpired treats expires_in: 0 as immediately expired', () => {
		// Distinguish from `expires_in === undefined` (which means "never"); zero must mean
		// "already expired" so a malformed/edge-case AS response can't be served from cache.
		assert.strictEqual(
			isExpired({ token: { expires_in: 0 }, created_at: 1_000_000 }, 1_000_000),
			true
		);
	});

	test('IDP_SCOPES requests an OpenID session with refresh', () => {
		assert.deepStrictEqual([...IDP_SCOPES].sort(), ['offline_access', 'openid']);
	});
});

suite('XaaAuthProvider toSession', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// Minimal unsigned JWT: getClaimsFromJWT only base64-decodes the header/payload segments.
	const jwt = (claims: object): string =>
		`${encodeBase64(VSBuffer.fromString(JSON.stringify({ alg: 'none' })))}.${encodeBase64(VSBuffer.fromString(JSON.stringify(claims)))}.sig`;

	test('prefers the identity in the session\'s own id_token over the fallback account', () => {
		// The token passed to toSession is the response for THIS session, so its id_token is the
		// authoritative identity. The fallback account comes from a different (IdP) token response and
		// must only fill in when this token carries no id_token of its own.
		const token: IAuthorizationTokenResponse = { access_token: 'opaque', token_type: 'Bearer', id_token: jwt({ sub: 'session-sub', preferred_username: 'session@contoso.com' }) };
		const session = toSession(token, ['mcp:proxy'], { id: 'idp-sub', label: 'idp@contoso.com' });
		assert.deepStrictEqual(session.account, { id: 'session-sub', label: 'session@contoso.com' });
	});

	test('falls back to the threaded account when the token has no id_token', () => {
		// The common resource-session case: the resource token carries no id_token, so the session adopts
		// the IdP identity — keeping it aligned with account enumeration (getAccounts).
		const token: IAuthorizationTokenResponse = { access_token: 'opaque-resource-token', token_type: 'Bearer' };
		const session = toSession(token, ['mcp:proxy'], { id: 'idp-sub', label: 'user@contoso.com' });
		assert.deepStrictEqual(session.account, { id: 'idp-sub', label: 'user@contoso.com' });
	});

	test('never mines identity from the access_token', () => {
		// The access token is a bearer credential for the resource server, opaque to us by design. Even when
		// it is a JWT with identity claims and there is neither an id_token nor a fallback, we must not read it.
		const token: IAuthorizationTokenResponse = { access_token: jwt({ sub: 'resource-sub', preferred_username: 'do-not-use' }), token_type: 'Bearer' };
		const session = toSession(token, ['mcp:proxy']);
		assert.deepStrictEqual(session.account, { id: 'unknown', label: 'XAA' });
	});
});
