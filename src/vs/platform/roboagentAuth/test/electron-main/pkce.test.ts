/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { constantTimeEqual, generateCodeChallenge, generateCodeVerifier, generateState } from '../../electron-main/pkce.js';

suite('RoboAgent Auth PKCE', () => {
	test('generateCodeVerifier creates a 43-character base64url string', () => {
		const verifier = generateCodeVerifier();
		assert.strictEqual(verifier.length, 43);
		assert.match(verifier, /^[a-zA-Z0-9_-]+$/);
	});

	test('generateCodeChallenge matches known SHA-256 hash', () => {
		const verifier = 'test-verifier-that-is-long-enough-for-pkce';
		const challenge = generateCodeChallenge(verifier);
		// Expected hash of the above string
		// echo -n "test-verifier-that-is-long-enough-for-pkce" | openssl dgst -sha256 -binary | base64 | tr '/+' '_-' | tr -d '='
		assert.strictEqual(challenge, 'l02dZc3b7JkI2i95Qp27o40xX4-y7305y2WnBfT6Q1s');
	});

	test('generateState creates a 43-character base64url string', () => {
		const state = generateState();
		assert.strictEqual(state.length, 43);
		assert.match(state, /^[a-zA-Z0-9_-]+$/);
	});

	test('constantTimeEqual works correctly', () => {
		assert.strictEqual(constantTimeEqual('hello', 'hello'), true);
		assert.strictEqual(constantTimeEqual('hello', 'world'), false);
		assert.strictEqual(constantTimeEqual('hello', 'helloo'), false);
	});
});
