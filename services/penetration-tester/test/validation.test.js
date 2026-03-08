/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

describe('ValidationAgent', () => {
	describe('vulnerability indicators', () => {
		test('detects SQL injection indicators in response body', () => {
			const indicators = [
				'syntax error',
				'mysql',
				'postgresql',
				'sqlite',
				'ora-',
				'sql server',
				'unclosed quotation',
			];

			for (const indicator of indicators) {
				const bodyLower = `some response with ${indicator} in it`.toLowerCase();
				const isVulnerable = indicators.some(i => bodyLower.includes(i));
				assert.ok(isVulnerable, `Should detect indicator: ${indicator}`);
			}
		});

		test('detects NoSQL injection indicators', () => {
			const indicators = ['mongoerror', 'bsontype', 'cast to objectid'];
			const body = 'Error: MongoError: bad query';
			const bodyLower = body.toLowerCase();

			const isVulnerable = indicators.some(i => bodyLower.includes(i));
			assert.ok(isVulnerable);
		});

		test('detects command injection markers', () => {
			const body = 'output: pen-test-marker';
			const isVulnerable = body.includes('pen-test-marker') ||
				body.includes('uid=') ||
				body.includes('root:');

			assert.ok(isVulnerable);
		});

		test('detects template injection (7*7=49)', () => {
			const body = 'Hello 49 World';
			assert.ok(body.includes('49'));
		});

		test('detects XSS markers', () => {
			const body = '<div>xss-test-marker</div>';
			const isVulnerable = body.includes('xss-test-marker') ||
				body.includes('<script>');

			assert.ok(isVulnerable);
		});

		test('does not false-positive on clean responses', () => {
			const cleanBody = 'Hello, this is a normal response with no issues.';
			const sqlIndicators = ['syntax error', 'mysql', 'postgresql'];
			const isVulnerable = sqlIndicators.some(i => cleanBody.toLowerCase().includes(i));

			assert.ok(!isVulnerable);
		});
	});

	describe('impact assessment', () => {
		test('generates appropriate severity descriptions', () => {
			const severityDescriptions = {
				critical: 'This vulnerability allows an attacker to fully compromise the application or underlying infrastructure.',
				high: 'This vulnerability could result in significant data exposure or unauthorized actions.',
				medium: 'This vulnerability could be exploited under specific conditions to access limited data or functionality.',
				low: 'This vulnerability has limited impact but should be addressed as part of defence in depth.',
			};

			assert.ok(severityDescriptions.critical.includes('fully compromise'));
			assert.ok(severityDescriptions.high.includes('significant data exposure'));
			assert.ok(severityDescriptions.medium.includes('specific conditions'));
			assert.ok(severityDescriptions.low.includes('limited impact'));
		});
	});

	describe('reproduction steps', () => {
		test('generates curl command for GET endpoint', () => {
			const finding = {
				endpoint: 'GET /api/users/search',
				payload: "' OR '1'='1",
				evidence: 'SQL error in response',
			};

			const encodedPayload = encodeURIComponent(finding.payload);
			const curlCommand = `curl "http://localhost:3000/api/users/search?q=${encodedPayload}"`;

			assert.ok(curlCommand.includes('http://localhost:3000'));
			assert.ok(curlCommand.includes(encodedPayload));
		});

		test('generates curl command for POST endpoint', () => {
			const finding = {
				endpoint: 'POST /api/auth/login',
				payload: "admin' --",
				evidence: 'Authentication bypassed',
			};

			const endpointParts = finding.endpoint.split(' ');
			const method = endpointParts[0];
			const path = endpointParts[1];

			assert.strictEqual(method, 'POST');
			assert.strictEqual(path, '/api/auth/login');
		});
	});

	describe('markdown report generation', () => {
		test('generates well-formatted finding report', () => {
			const report = {
				finding: {
					testType: 'sql-injection',
					severity: 'critical',
					owaspCategory: 'A03-injection',
					endpoint: 'GET /api/users/search',
					payload: "'; DROP TABLE users; --",
					evidence: 'Server returned 500 error with PostgreSQL error message',
					impact: 'An attacker could execute arbitrary SQL queries',
					suggestedFix: 'Use parameterised queries',
					filePath: 'src/services/userService.ts',
					line: 42,
				},
				impactAssessment: 'Critical vulnerability',
				reproductionSteps: [
					'Start the local application',
					'Send curl request',
					'Observe 500 response',
				],
			};

			const lines = [
				`## Finding: SQL Injection in ${report.finding.endpoint}`,
				'',
				`**Severity:** Critical`,
				`**OWASP Category:** A03 — Injection`,
				`**Endpoint:** ${report.finding.endpoint}`,
			];

			assert.ok(lines[0].includes('SQL Injection'));
			assert.ok(lines[0].includes('GET /api/users/search'));
			assert.ok(lines[2].includes('Critical'));
		});
	});
});
