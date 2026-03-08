/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

describe('Config', () => {
	describe('validateTargetUrl', () => {
		function validateTargetUrl(url) {
			try {
				const parsed = new URL(url);
				const allowedHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
				return allowedHosts.includes(parsed.hostname);
			} catch {
				return false;
			}
		}

		test('allows localhost URLs', () => {
			assert.ok(validateTargetUrl('http://localhost:3000'));
			assert.ok(validateTargetUrl('http://localhost:8080/api'));
			assert.ok(validateTargetUrl('http://localhost'));
		});

		test('allows 127.0.0.1 URLs', () => {
			assert.ok(validateTargetUrl('http://127.0.0.1:3000'));
			assert.ok(validateTargetUrl('http://127.0.0.1'));
		});

		test('allows 0.0.0.0 URLs', () => {
			assert.ok(validateTargetUrl('http://0.0.0.0:3000'));
		});

		test('rejects external URLs', () => {
			assert.ok(!validateTargetUrl('http://example.com'));
			assert.ok(!validateTargetUrl('https://google.com'));
			assert.ok(!validateTargetUrl('http://192.168.1.1'));
			assert.ok(!validateTargetUrl('http://internal-server.company.com'));
		});

		test('rejects invalid URLs', () => {
			assert.ok(!validateTargetUrl('not a url'));
			assert.ok(!validateTargetUrl(''));
		});
	});
});
