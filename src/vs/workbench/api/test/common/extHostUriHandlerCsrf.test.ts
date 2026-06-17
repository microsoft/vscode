/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	canonicalize,
	computeToken,
	CSRF_TOKEN_PARAM,
	CsrfRejectionReason,
	extractToken,
	stripCsrfToken,
	timingSafeEqual,
	verifyCsrfToken,
} from '../../../services/extensions/common/uriHandlerCsrf.js';

suite('ExtHostUriHandlerCsrf', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const secret = new TextEncoder().encode('a-very-secret-32-byte-test-value');
	const PATH = '/start';

	/** Build the query string a legitimate signer would produce for the given route + params. */
	async function sign(path: string, params: Record<string, string>): Promise<string> {
		const base = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
		const token = await computeToken(secret, path, base);
		return `${base}&${CSRF_TOKEN_PARAM}=${token}`;
	}

	test('canonicalize binds the path, is order/encoding-independent, and excludes the token', () => {
		const a = canonicalize('/start', 'program=%2Fbin%2Fsh&request=launch');
		const b = canonicalize('/start', 'request=launch&program=/bin/sh');
		assert.strictEqual(a, b);
		assert.strictEqual(a, '%2Fstart\nprogram=%2Fbin%2Fsh\nrequest=launch');

		// Different routes produce different canonical messages even with identical params.
		assert.notStrictEqual(canonicalize('/start', 'program=/bin/sh'), canonicalize('/run', 'program=/bin/sh'));

		// The reserved token param must never participate in the signed message.
		assert.strictEqual(canonicalize('/start', `program=/bin/sh&${CSRF_TOKEN_PARAM}=deadbeef`), '%2Fstart\nprogram=%2Fbin%2Fsh');
	});

	test('serialization is injective: a value with delimiters cannot mimic separate params', () => {
		// A single param whose value contains '\n' and '=' must not canonicalize to the same message
		// as two distinct params — otherwise a token could be replayed across different param sets.
		const oneParamWithDelimiters = canonicalize('/x', `a=${encodeURIComponent('b\nc=d')}`);
		const twoParams = canonicalize('/x', 'a=b&c=d');
		assert.notStrictEqual(oneParamWithDelimiters, twoParams);
	});

	test('extractToken / stripCsrfToken', () => {
		assert.strictEqual(extractToken('a=1&b=2'), undefined);
		assert.strictEqual(extractToken(`a=1&${CSRF_TOKEN_PARAM}=abc&b=2`), 'abc');

		const stripped = stripCsrfToken(URI.parse(`vscode://ext.id/start?a=1&${CSRF_TOKEN_PARAM}=abc&b=2`));
		assert.strictEqual(stripped.query, 'a=1&b=2');
		assert.strictEqual(extractToken(stripped.query), undefined);
	});

	test('timingSafeEqual', () => {
		assert.strictEqual(timingSafeEqual('abc', 'abc'), true);
		assert.strictEqual(timingSafeEqual('abc', 'abd'), false);
		assert.strictEqual(timingSafeEqual('abc', 'abcd'), false);
		assert.strictEqual(timingSafeEqual('', ''), true);
	});

	test('a correctly signed link verifies', async () => {
		const query = await sign(PATH, { program: '/bin/sh', request: 'launch' });
		const result = await verifyCsrfToken(secret, PATH, query);
		assert.deepStrictEqual(result, { ok: true });
	});

	test('tampering with any param invalidates the token', async () => {
		const signed = await sign(PATH, { program: '/bin/sh', request: 'launch' });
		const token = extractToken(signed)!;
		const tampered = `program=${encodeURIComponent('/bin/evil')}&request=launch&${CSRF_TOKEN_PARAM}=${token}`;
		const result = await verifyCsrfToken(secret, PATH, tampered);
		assert.deepStrictEqual(result, { ok: false, reason: CsrfRejectionReason.Mismatch });
	});

	test('a token minted for one route does not validate against another (path binding)', async () => {
		const signed = await sign('/start', { program: '/bin/sh' });
		// Replay the exact same params + token against a different protected route.
		const result = await verifyCsrfToken(secret, '/run', signed);
		assert.deepStrictEqual(result, { ok: false, reason: CsrfRejectionReason.Mismatch });
	});

	test('missing token is rejected', async () => {
		const result = await verifyCsrfToken(secret, PATH, 'program=/bin/sh&request=launch');
		assert.deepStrictEqual(result, { ok: false, reason: CsrfRejectionReason.Missing });
	});

	test('no secret fails closed (even with a token present)', async () => {
		const signed = await sign(PATH, { program: '/bin/sh' });
		const result = await verifyCsrfToken(undefined, PATH, signed);
		assert.deepStrictEqual(result, { ok: false, reason: CsrfRejectionReason.NoSecret });
	});
});
