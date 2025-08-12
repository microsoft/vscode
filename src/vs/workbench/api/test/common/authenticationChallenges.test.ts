/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { parseWWWAuthenticateHeader } from '../../../base/common/oauth.js';

suite('Authentication Challenges', () => {

	test('parseWWWAuthenticateHeader - Bearer challenge with claims', () => {
		const headerValue = 'Bearer realm="", authorization_uri="https://login.microsoftonline.com/common/oauth2/authorize", error="insufficient_claims", claims="eyJhY2Nlc3NfdG9rZW4iOnsiYWNycyI6eyJlc3NlbnRpYWwiOnRydWUsInZhbHVlcyI6WyJwMSJdfX19"';
		
		const result = parseWWWAuthenticateHeader(headerValue);
		
		assert.strictEqual(result.scheme, 'Bearer');
		assert.strictEqual(result.params.realm, '');
		assert.strictEqual(result.params.authorization_uri, 'https://login.microsoftonline.com/common/oauth2/authorize');
		assert.strictEqual(result.params.error, 'insufficient_claims');
		assert.strictEqual(result.params.claims, 'eyJhY2Nlc3NfdG9rZW4iOnsiYWNycyI6eyJlc3NlbnRpYWwiOnRydWUsInZhbHVlcyI6WyJwMSJdfX19');
	});

	test('parseWWWAuthenticateHeader - Bearer challenge with scope', () => {
		const headerValue = 'Bearer realm="", scope="https://graph.microsoft.com/.default", error="invalid_token"';
		
		const result = parseWWWAuthenticateHeader(headerValue);
		
		assert.strictEqual(result.scheme, 'Bearer');
		assert.strictEqual(result.params.realm, '');
		assert.strictEqual(result.params.scope, 'https://graph.microsoft.com/.default');
		assert.strictEqual(result.params.error, 'invalid_token');
	});

	test('parseWWWAuthenticateHeader - Simple Bearer challenge', () => {
		const headerValue = 'Bearer';
		
		const result = parseWWWAuthenticateHeader(headerValue);
		
		assert.strictEqual(result.scheme, 'Bearer');
		assert.deepStrictEqual(result.params, {});
	});
});