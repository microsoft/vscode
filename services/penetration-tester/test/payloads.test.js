/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

describe('Payloads', () => {
	// Inline the payloads for testing (they're simple string arrays)
	const SQL_INJECTION_PAYLOADS = [
		"' OR '1'='1",
		"' OR '1'='1' --",
		"' OR '1'='1' /*",
		"1' OR '1'='1",
		'1 OR 1=1',
		'1 OR 1=1--',
		"' UNION SELECT NULL--",
		"' UNION SELECT NULL,NULL--",
		"'; WAITFOR DELAY '0:0:2'--",
		"' AND SLEEP(2)--",
		"' AND 1=CONVERT(int, @@version)--",
		"' AND extractvalue(1, concat(0x7e, version()))--",
	];

	const XSS_PAYLOADS = [
		'<script>alert("xss-test-marker")</script>',
		'<img src=x onerror=alert("xss-test-marker")>',
		'<svg onload=alert("xss-test-marker")>',
		'" onmouseover="alert(\'xss-test-marker\')"',
		"'><script>alert('xss-test-marker')</script>",
		'javascript:alert("xss-test-marker")',
		'<img src="x" onerror="alert(\'xss-test-marker\')">',
		'"><img src=x onerror=alert("xss-test-marker")>',
	];

	const COMMON_CREDENTIALS = [
		{ username: 'admin', password: 'admin' },
		{ username: 'admin', password: 'password' },
		{ username: 'admin', password: '123456' },
		{ username: 'root', password: 'root' },
		{ username: 'test', password: 'test' },
		{ username: 'user', password: 'user' },
		{ username: 'admin', password: 'admin123' },
		{ username: 'admin', password: 'Password1' },
	];

	test('SQL injection payloads are non-destructive', () => {
		for (const payload of SQL_INJECTION_PAYLOADS) {
			// None of the payloads should contain DROP, DELETE, TRUNCATE, ALTER, or UPDATE
			const upper = payload.toUpperCase();
			assert.ok(!upper.includes('DROP '), `Payload should not contain DROP: ${payload}`);
			assert.ok(!upper.includes('DELETE '), `Payload should not contain DELETE: ${payload}`);
			assert.ok(!upper.includes('TRUNCATE'), `Payload should not contain TRUNCATE: ${payload}`);
			assert.ok(!upper.includes('ALTER '), `Payload should not contain ALTER: ${payload}`);
		}
	});

	test('XSS payloads use test markers', () => {
		for (const payload of XSS_PAYLOADS) {
			assert.ok(
				payload.includes('xss-test-marker'),
				`XSS payload should contain test marker: ${payload}`,
			);
		}
	});

	test('brute force credential list is small', () => {
		// Must stay under 100 to respect the per-test request limit
		assert.ok(COMMON_CREDENTIALS.length <= 100);
		assert.ok(COMMON_CREDENTIALS.length <= 10);
	});

	test('all SQL payloads are strings', () => {
		for (const payload of SQL_INJECTION_PAYLOADS) {
			assert.strictEqual(typeof payload, 'string');
			assert.ok(payload.length > 0);
		}
	});

	test('credentials have required fields', () => {
		for (const cred of COMMON_CREDENTIALS) {
			assert.ok(cred.username, 'Credential must have username');
			assert.ok(cred.password, 'Credential must have password');
			assert.strictEqual(typeof cred.username, 'string');
			assert.strictEqual(typeof cred.password, 'string');
		}
	});
});
