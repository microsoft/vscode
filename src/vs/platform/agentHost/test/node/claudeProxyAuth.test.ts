/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseProxyBearer } from '../../node/claude/claudeProxyAuth.js';

const NONCE = 'test-nonce-deadbeef';

suite('parseProxyBearer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts Bearer <nonce>.<sessionId> with non-empty sessionId', () => {
		assert.deepStrictEqual(
			parseProxyBearer({ 'authorization': `Bearer ${NONCE}.session-abc` }, NONCE),
			{ valid: true, sessionId: 'session-abc' },
		);
	});

	test('preserves dots inside the sessionId portion', () => {
		assert.deepStrictEqual(
			parseProxyBearer({ 'authorization': `Bearer ${NONCE}.session.with.dots` }, NONCE),
			{ valid: true, sessionId: 'session.with.dots' },
		);
	});

	test('rejects missing Authorization header', () => {
		assert.deepStrictEqual(
			parseProxyBearer({}, NONCE),
			{ valid: false, sessionId: undefined },
		);
	});

	test('rejects non-Bearer Authorization scheme', () => {
		assert.deepStrictEqual(
			parseProxyBearer({ 'authorization': `Basic ${NONCE}.s` }, NONCE),
			{ valid: false, sessionId: undefined },
		);
	});

	test('rejects Bearer with wrong nonce', () => {
		assert.deepStrictEqual(
			parseProxyBearer({ 'authorization': 'Bearer wrong-nonce.session-abc' }, NONCE),
			{ valid: false, sessionId: undefined },
		);
	});

	test('rejects Bearer <nonce> with no dot (legacy format not supported)', () => {
		assert.deepStrictEqual(
			parseProxyBearer({ 'authorization': `Bearer ${NONCE}` }, NONCE),
			{ valid: false, sessionId: undefined },
		);
	});

	test('rejects Bearer <nonce>. with empty sessionId', () => {
		assert.deepStrictEqual(
			parseProxyBearer({ 'authorization': `Bearer ${NONCE}.` }, NONCE),
			{ valid: false, sessionId: undefined },
		);
	});

	test('ignores x-api-key when only x-api-key is present', () => {
		assert.deepStrictEqual(
			parseProxyBearer({ 'x-api-key': NONCE }, NONCE),
			{ valid: false, sessionId: undefined },
		);
	});

	test('uses Authorization header when both x-api-key and Authorization are present', () => {
		assert.deepStrictEqual(
			parseProxyBearer({
				'x-api-key': 'sk-ant-real-api-key',
				'authorization': `Bearer ${NONCE}.s`,
			}, NONCE),
			{ valid: true, sessionId: 's' },
		);
	});
});
