/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { ZapClient } from '../clients/zapClient';
import {
	Endpoint,
	PenTestConfig,
	PlannedTest,
	RequestRecord,
	ResponseRecord,
	Severity,
	TestEvidence,
	TestResult,
	TestType,
	VulnerabilityFinding,
} from '../types';
import {
	COMMAND_INJECTION_PAYLOADS,
	COMMON_CREDENTIALS,
	IDOR_TEST_IDS,
	NOSQL_INJECTION_PAYLOADS,
	SQL_INJECTION_PAYLOADS,
	TEMPLATE_INJECTION_PAYLOADS,
	XSS_PAYLOADS,
} from './payloads';

/**
 * Sandbox agents execute security tests inside the Docker sandbox.
 * Each test type has a dedicated method that sends payloads, records
 * requests/responses, and returns findings.
 *
 * Constraints:
 * - All tests run inside the sandbox container.
 * - Max 100 requests per test (prevent self-DoS).
 * - Timeout: 60 seconds per individual test.
 * - All traffic is logged.
 */
export class SandboxAgent {
	private readonly config: PenTestConfig;
	private readonly zapClient: ZapClient;

	constructor(config: PenTestConfig, zapClient: ZapClient) {
		this.config = config;
		this.zapClient = zapClient;
	}

	/**
	 * Execute a planned test and return the result.
	 */
	async executeTest(test: PlannedTest, targetBaseUrl: string): Promise<TestResult> {
		const startTime = Date.now();
		const evidence: TestEvidence = { requests: [], responses: [], observations: [] };

		let finding: VulnerabilityFinding | null = null;

		try {
			switch (test.type) {
				case 'sql-injection':
					finding = await this.testSqlInjection(targetBaseUrl, test.targetEndpoint, evidence);
					break;
				case 'nosql-injection':
					finding = await this.testNosqlInjection(targetBaseUrl, test.targetEndpoint, evidence);
					break;
				case 'command-injection':
					finding = await this.testCommandInjection(targetBaseUrl, test.targetEndpoint, evidence);
					break;
				case 'template-injection':
					finding = await this.testTemplateInjection(targetBaseUrl, test.targetEndpoint, evidence);
					break;
				case 'xss-reflected':
					finding = await this.testReflectedXss(targetBaseUrl, test.targetEndpoint, evidence);
					break;
				case 'xss-stored':
					finding = await this.testStoredXss(targetBaseUrl, test.targetEndpoint, evidence);
					break;
				case 'brute-force':
					finding = await this.testBruteForce(targetBaseUrl, test.targetEndpoint, evidence);
					break;
				case 'session-management':
					finding = await this.testSessionManagement(targetBaseUrl, test.targetEndpoint, evidence);
					break;
				case 'password-reset':
					finding = await this.testPasswordReset(targetBaseUrl, test.targetEndpoint, evidence);
					break;
				case 'idor':
					finding = await this.testIdor(targetBaseUrl, test.targetEndpoint, evidence);
					break;
				case 'privilege-escalation':
					finding = await this.testPrivilegeEscalation(targetBaseUrl, test.targetEndpoint, evidence);
					break;
				case 'missing-auth':
					finding = await this.testMissingAuth(targetBaseUrl, test.targetEndpoint, evidence);
					break;
				case 'zap-baseline':
					finding = await this.runZapBaseline(targetBaseUrl, evidence);
					break;
				case 'zap-active':
					finding = await this.runZapActive(targetBaseUrl, evidence);
					break;
				case 'zap-api':
					finding = await this.runZapApi(targetBaseUrl, evidence);
					break;
			}
		} catch (err) {
			evidence.observations.push(
				`Test execution error: ${err instanceof Error ? err.message : String(err)}`,
			);
		}

		return {
			testId: test.id,
			type: test.type,
			owaspCategory: test.owaspCategory,
			endpoint: `${test.targetEndpoint.method} ${test.targetEndpoint.path}`,
			finding,
			requestCount: evidence.requests.length,
			durationMs: Date.now() - startTime,
			evidence,
		};
	}

	/**
	 * Test for SQL injection vulnerabilities.
	 */
	private async testSqlInjection(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		return this.testInjection(
			baseUrl, endpoint, evidence,
			SQL_INJECTION_PAYLOADS,
			'sql-injection',
			'A03-injection',
			response => this.isSqlInjectionIndicator(response),
		);
	}

	/**
	 * Test for NoSQL injection vulnerabilities.
	 */
	private async testNosqlInjection(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		return this.testInjection(
			baseUrl, endpoint, evidence,
			NOSQL_INJECTION_PAYLOADS,
			'nosql-injection',
			'A03-injection',
			response => this.isNosqlInjectionIndicator(response),
		);
	}

	/**
	 * Test for command injection vulnerabilities.
	 */
	private async testCommandInjection(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		return this.testInjection(
			baseUrl, endpoint, evidence,
			COMMAND_INJECTION_PAYLOADS,
			'command-injection',
			'A03-injection',
			response => response.body.includes('pen-test-marker') ||
				response.body.includes('uid=') ||
				response.body.includes('root:'),
		);
	}

	/**
	 * Test for template injection vulnerabilities.
	 */
	private async testTemplateInjection(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		return this.testInjection(
			baseUrl, endpoint, evidence,
			TEMPLATE_INJECTION_PAYLOADS,
			'template-injection',
			'A03-injection',
			response => response.body.includes('49'),
		);
	}

	/**
	 * Test for reflected XSS vulnerabilities.
	 */
	private async testReflectedXss(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		return this.testInjection(
			baseUrl, endpoint, evidence,
			XSS_PAYLOADS,
			'xss-reflected',
			'A03-injection',
			response => response.body.includes('xss-test-marker') ||
				response.body.includes('<script>') ||
				response.body.includes('onerror='),
		);
	}

	/**
	 * Test for stored XSS vulnerabilities.
	 */
	private async testStoredXss(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		for (const payload of XSS_PAYLOADS) {
			if (evidence.requests.length >= this.config.maxRequestsPerTest) {
				break;
			}

			// Submit the payload
			const submitBody = this.buildRequestBody(endpoint, payload);
			await this.sendRequest(baseUrl, endpoint, evidence, submitBody);

			// Retrieve and check if the payload is reflected
			const getResponse = await this.sendGetRequest(
				`${baseUrl}${endpoint.path}`,
				evidence,
			);

			if (getResponse && (
				getResponse.body.includes('xss-test-marker') ||
				getResponse.body.includes('<script>')
			)) {
				return this.createFinding(
					'xss-stored', 'A03-injection', 'high',
					endpoint, payload,
					`Stored XSS: payload was persisted and reflected in GET response`,
					'Sanitize all user input before storing. Use output encoding when rendering.',
				);
			}
		}

		return null;
	}

	/**
	 * Test for brute force vulnerabilities (rate limiting).
	 */
	private async testBruteForce(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		let successCount = 0;
		let totalAttempts = 0;

		for (const cred of COMMON_CREDENTIALS) {
			if (evidence.requests.length >= this.config.maxRequestsPerTest) {
				break;
			}

			const body = JSON.stringify({
				username: cred.username,
				password: cred.password,
			});

			const response = await this.sendPostRequest(
				`${baseUrl}${endpoint.path}`,
				body,
				evidence,
			);

			totalAttempts++;

			if (response && (response.statusCode === 200 || response.statusCode === 302)) {
				successCount++;
			}
		}

		// If no rate limiting was observed (no 429 responses), report it
		const hasRateLimiting = evidence.responses.some(r => r.statusCode === 429);

		if (!hasRateLimiting && totalAttempts >= 5) {
			return this.createFinding(
				'brute-force', 'A07-auth-failures', 'medium',
				endpoint, `${totalAttempts} login attempts without rate limiting`,
				`No rate limiting detected after ${totalAttempts} attempts. ${successCount} successful logins with common credentials.`,
				'Implement rate limiting on authentication endpoints. Consider account lockout after failed attempts.',
			);
		}

		if (successCount > 0) {
			return this.createFinding(
				'brute-force', 'A07-auth-failures', 'critical',
				endpoint, `Common credentials accepted`,
				`${successCount} of ${totalAttempts} common credential pairs were accepted.`,
				'Enforce strong password policies. Reject commonly-leaked passwords.',
			);
		}

		return null;
	}

	/**
	 * Test session management security.
	 */
	private async testSessionManagement(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		const response = await this.sendGetRequest(
			`${baseUrl}${endpoint.path}`,
			evidence,
		);

		if (!response) {
			return null;
		}

		const setCookie = response.headers['set-cookie'] ?? '';
		const observations: string[] = [];

		if (setCookie && !setCookie.includes('HttpOnly')) {
			observations.push('Session cookie missing HttpOnly flag');
		}
		if (setCookie && !setCookie.includes('Secure')) {
			observations.push('Session cookie missing Secure flag');
		}
		if (setCookie && !setCookie.includes('SameSite')) {
			observations.push('Session cookie missing SameSite attribute');
		}

		evidence.observations.push(...observations);

		if (observations.length > 0) {
			return this.createFinding(
				'session-management', 'A07-auth-failures', 'medium',
				endpoint, observations.join('; '),
				`Session management issues: ${observations.join('. ')}.`,
				'Set HttpOnly, Secure, and SameSite attributes on session cookies.',
			);
		}

		return null;
	}

	/**
	 * Test password reset for account enumeration.
	 */
	private async testPasswordReset(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		// Test with a known-unlikely email and compare responses
		const existingResponse = await this.sendPostRequest(
			`${baseUrl}${endpoint.path}`,
			JSON.stringify({ email: 'admin@example.com' }),
			evidence,
		);

		const nonExistingResponse = await this.sendPostRequest(
			`${baseUrl}${endpoint.path}`,
			JSON.stringify({ email: 'definitely-not-a-real-user-9999@example.com' }),
			evidence,
		);

		if (existingResponse && nonExistingResponse) {
			// If responses differ, account enumeration is possible
			if (existingResponse.statusCode !== nonExistingResponse.statusCode ||
				existingResponse.body.length !== nonExistingResponse.body.length) {
				return this.createFinding(
					'password-reset', 'A07-auth-failures', 'low',
					endpoint, 'Different responses for existing vs non-existing accounts',
					'Password reset endpoint reveals whether an email address is registered.',
					'Return the same response regardless of whether the account exists.',
				);
			}
		}

		return null;
	}

	/**
	 * Test for Insecure Direct Object Reference (IDOR).
	 */
	private async testIdor(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		for (const testId of IDOR_TEST_IDS) {
			if (evidence.requests.length >= this.config.maxRequestsPerTest) {
				break;
			}

			const manipulatedPath = endpoint.path.replace(/:[^/]+/g, testId);
			const response = await this.sendGetRequest(
				`${baseUrl}${manipulatedPath}`,
				evidence,
			);

			if (response && response.statusCode === 200) {
				// Check if we got actual data back (not just a 200 with an error)
				const body = response.body;
				if (body.length > 50 && !body.includes('error') && !body.includes('not found')) {
					return this.createFinding(
						'idor', 'A01-broken-access-control', 'high',
						endpoint, `Accessed resource with ID: ${testId}`,
						`IDOR: Able to access resource at ${manipulatedPath} without proper authorization check.`,
						'Implement proper authorization checks. Verify the requesting user owns the resource.',
					);
				}
			}
		}

		return null;
	}

	/**
	 * Test for privilege escalation.
	 */
	private async testPrivilegeEscalation(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		// Try accessing admin-like paths without authentication
		const adminPaths = [
			endpoint.path.replace(/\/api\//, '/api/admin/'),
			endpoint.path + '/admin',
			'/admin' + endpoint.path,
		];

		for (const path of adminPaths) {
			if (evidence.requests.length >= this.config.maxRequestsPerTest) {
				break;
			}

			const response = await this.sendGetRequest(`${baseUrl}${path}`, evidence);

			if (response && response.statusCode === 200) {
				return this.createFinding(
					'privilege-escalation', 'A01-broken-access-control', 'critical',
					endpoint, `Accessed admin path: ${path}`,
					`Privilege escalation: admin endpoint ${path} accessible without admin credentials.`,
					'Implement role-based access control. Verify user roles before granting access to admin endpoints.',
				);
			}
		}

		return null;
	}

	/**
	 * Test for missing authentication on endpoints.
	 */
	private async testMissingAuth(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		const response = await this.sendGetRequest(
			`${baseUrl}${endpoint.path}`,
			evidence,
		);

		if (response && response.statusCode === 200) {
			// Check if the response contains sensitive data patterns
			const sensitivePatterns = [
				/\bemail\b/i,
				/\bpassword\b/i,
				/\btoken\b/i,
				/\bsecret\b/i,
				/\bapi.?key\b/i,
				/\bssn\b/i,
				/\bcredit.?card\b/i,
			];

			const matchedPatterns = sensitivePatterns.filter(p => p.test(response.body));

			if (matchedPatterns.length > 0) {
				return this.createFinding(
					'missing-auth', 'A01-broken-access-control', 'high',
					endpoint, `Unauthenticated access to endpoint returning sensitive data`,
					`Endpoint ${endpoint.path} is accessible without authentication and returns data matching sensitive patterns.`,
					'Add authentication middleware to this endpoint.',
				);
			}
		}

		return null;
	}

	/**
	 * Run a ZAP baseline (passive) scan.
	 */
	private async runZapBaseline(
		baseUrl: string,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		try {
			const scanId = await this.zapClient.startBaselineScan(baseUrl);
			evidence.observations.push(`ZAP baseline scan started: ${scanId}`);

			// Wait for completion (poll every 2 seconds)
			let status = 0;
			let pollCount = 0;
			while (status < 100 && pollCount < 30) {
				await this.delay(2000);
				status = await this.zapClient.getSpiderStatus(scanId);
				pollCount++;
			}

			const alerts = await this.zapClient.getAlerts(baseUrl);
			evidence.observations.push(`ZAP found ${alerts.length} alerts`);

			if (alerts.length > 0) {
				const highestRisk = alerts.sort((a, b) => b.riskCode - a.riskCode)[0];
				return {
					id: randomUUID(),
					owaspCategory: 'A05-security-misconfiguration',
					testType: 'zap-baseline',
					severity: this.zapRiskToSeverity(highestRisk.riskCode),
					endpoint: highestRisk.url,
					payload: highestRisk.attack,
					evidence: `${alerts.length} alerts found. Highest: ${highestRisk.name} (${highestRisk.riskDesc})`,
					impact: highestRisk.description,
					suggestedFix: highestRisk.solution,
					confirmed: true,
					reproducible: true,
				};
			}
		} catch (err) {
			evidence.observations.push(
				`ZAP baseline scan error: ${err instanceof Error ? err.message : String(err)}`,
			);
		}

		return null;
	}

	/**
	 * Run a ZAP active scan (requires developer approval).
	 */
	private async runZapActive(
		baseUrl: string,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		try {
			await this.zapClient.setScanScope(baseUrl);
			const scanId = await this.zapClient.startActiveScan(baseUrl);
			evidence.observations.push(`ZAP active scan started: ${scanId}`);

			let status = 0;
			let pollCount = 0;
			while (status < 100 && pollCount < 60) {
				await this.delay(5000);
				status = await this.zapClient.getActiveScanStatus(scanId);
				pollCount++;
			}

			const alerts = await this.zapClient.getAlerts(baseUrl);
			evidence.observations.push(`ZAP active scan found ${alerts.length} alerts`);

			if (alerts.length > 0) {
				const highestRisk = alerts.sort((a, b) => b.riskCode - a.riskCode)[0];
				return {
					id: randomUUID(),
					owaspCategory: 'A05-security-misconfiguration',
					testType: 'zap-active',
					severity: this.zapRiskToSeverity(highestRisk.riskCode),
					endpoint: highestRisk.url,
					payload: highestRisk.attack,
					evidence: `${alerts.length} alerts found. Highest: ${highestRisk.name}`,
					impact: highestRisk.description,
					suggestedFix: highestRisk.solution,
					confirmed: true,
					reproducible: true,
				};
			}
		} catch (err) {
			evidence.observations.push(
				`ZAP active scan error: ${err instanceof Error ? err.message : String(err)}`,
			);
		}

		return null;
	}

	/**
	 * Run a ZAP API scan using an OpenAPI spec.
	 */
	private async runZapApi(
		baseUrl: string,
		evidence: TestEvidence,
	): Promise<VulnerabilityFinding | null> {
		// API scan delegates to baseline scan with the API spec URL
		return this.runZapBaseline(`${baseUrl}/api/openapi.json`, evidence);
	}

	/**
	 * Generic injection test driver.
	 */
	private async testInjection(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
		payloads: string[],
		testType: TestType,
		owaspCategory: 'A03-injection',
		isVulnerable: (response: ResponseRecord) => boolean,
	): Promise<VulnerabilityFinding | null> {
		// Get baseline response first
		const baselineResponse = await this.sendGetRequest(
			`${baseUrl}${endpoint.path}`,
			evidence,
		);
		const baselineStatus = baselineResponse?.statusCode ?? 200;

		for (const payload of payloads) {
			if (evidence.requests.length >= this.config.maxRequestsPerTest) {
				break;
			}

			let response: ResponseRecord | null;

			if (endpoint.method === 'GET') {
				const paramName = endpoint.parameters[0]?.name ?? 'q';
				const url = `${baseUrl}${endpoint.path}?${encodeURIComponent(paramName)}=${encodeURIComponent(payload)}`;
				response = await this.sendGetRequest(url, evidence);
			} else {
				const body = this.buildRequestBody(endpoint, payload);
				response = await this.sendPostRequest(
					`${baseUrl}${endpoint.path}`,
					body,
					evidence,
				);
			}

			if (response) {
				// Check for vulnerability indicators
				if (isVulnerable(response)) {
					return this.createFinding(
						testType, owaspCategory,
						this.inferSeverity(testType),
						endpoint, payload,
						`Injection detected: response indicates vulnerability to ${testType}`,
						this.suggestFix(testType),
					);
				}

				// Check for error-based detection (different status code)
				if (response.statusCode === 500 && baselineStatus !== 500) {
					evidence.observations.push(
						`Server error with payload: ${payload.substring(0, 50)}`,
					);
					return this.createFinding(
						testType, owaspCategory, 'high',
						endpoint, payload,
						`Server returned 500 error with injection payload, suggesting unhandled input`,
						this.suggestFix(testType),
					);
				}
			}
		}

		return null;
	}

	// --- HTTP request helpers ---

	private async sendGetRequest(url: string, evidence: TestEvidence): Promise<ResponseRecord | null> {
		const requestRecord: RequestRecord = {
			method: 'GET',
			url,
			headers: { 'User-Agent': 'SoA-PenTest/1.0' },
			body: null,
			timestamp: Date.now(),
		};
		evidence.requests.push(requestRecord);

		try {
			return await this.httpRequest('GET', url, null, evidence);
		} catch {
			return null;
		}
	}

	private async sendPostRequest(
		url: string,
		body: string,
		evidence: TestEvidence,
	): Promise<ResponseRecord | null> {
		const requestRecord: RequestRecord = {
			method: 'POST',
			url,
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'SoA-PenTest/1.0',
			},
			body,
			timestamp: Date.now(),
		};
		evidence.requests.push(requestRecord);

		try {
			return await this.httpRequest('POST', url, body, evidence);
		} catch {
			return null;
		}
	}

	private async sendRequest(
		baseUrl: string,
		endpoint: Endpoint,
		evidence: TestEvidence,
		body: string,
	): Promise<ResponseRecord | null> {
		if (endpoint.method === 'GET') {
			return this.sendGetRequest(`${baseUrl}${endpoint.path}?data=${encodeURIComponent(body)}`, evidence);
		}
		return this.sendPostRequest(`${baseUrl}${endpoint.path}`, body, evidence);
	}

	private httpRequest(
		method: string,
		urlString: string,
		body: string | null,
		evidence: TestEvidence,
	): Promise<ResponseRecord> {
		return new Promise((resolve, reject) => {
			const url = new URL(urlString);
			const options: http.RequestOptions = {
				hostname: url.hostname,
				port: url.port || 80,
				path: url.pathname + url.search,
				method,
				timeout: this.config.testTimeoutMs,
				headers: {
					'User-Agent': 'SoA-PenTest/1.0',
					...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
				},
			};

			const startTime = Date.now();
			const request = http.request(options, response => {
				let data = '';
				response.on('data', chunk => { data += chunk; });
				response.on('end', () => {
					const responseRecord: ResponseRecord = {
						statusCode: response.statusCode ?? 0,
						headers: Object.fromEntries(
							Object.entries(response.headers).map(([k, v]) => [k, String(v ?? '')]),
						),
						body: data.substring(0, 10000),
						timestamp: Date.now(),
						durationMs: Date.now() - startTime,
					};
					evidence.responses.push(responseRecord);
					resolve(responseRecord);
				});
			});

			request.on('error', reject);
			request.on('timeout', () => {
				request.destroy();
				reject(new Error('Request timed out'));
			});

			if (body) {
				request.write(body);
			}
			request.end();
		});
	}

	// --- Helper methods ---

	private buildRequestBody(endpoint: Endpoint, payload: string): string {
		const body: Record<string, string> = {};
		for (const param of endpoint.parameters) {
			if (param.location === 'body' || param.location === 'query') {
				body[param.name] = payload;
			}
		}
		if (Object.keys(body).length === 0) {
			body['input'] = payload;
		}
		return JSON.stringify(body);
	}

	private createFinding(
		testType: TestType,
		owaspCategory: VulnerabilityFinding['owaspCategory'],
		severity: Severity,
		endpoint: Endpoint,
		payload: string,
		evidence: string,
		suggestedFix: string,
	): VulnerabilityFinding {
		return {
			id: randomUUID(),
			owaspCategory,
			testType,
			severity,
			endpoint: `${endpoint.method} ${endpoint.path}`,
			payload,
			evidence,
			impact: this.describeImpact(testType, severity),
			suggestedFix,
			confirmed: false,
			reproducible: false,
		};
	}

	private isSqlInjectionIndicator(response: ResponseRecord): boolean {
		const indicators = [
			'syntax error',
			'mysql',
			'postgresql',
			'sqlite',
			'ora-',
			'sql server',
			'unclosed quotation',
			'unterminated string',
			'pg_query',
			'you have an error in your sql',
		];
		const bodyLower = response.body.toLowerCase();
		return indicators.some(indicator => bodyLower.includes(indicator));
	}

	private isNosqlInjectionIndicator(response: ResponseRecord): boolean {
		const indicators = [
			'mongoerror',
			'bsontype',
			'cast to objectid',
			'$where',
			'mapreduce',
		];
		const bodyLower = response.body.toLowerCase();
		return indicators.some(indicator => bodyLower.includes(indicator));
	}

	private zapRiskToSeverity(riskCode: number): Severity {
		switch (riskCode) {
			case 3: return 'critical';
			case 2: return 'high';
			case 1: return 'medium';
			default: return 'low';
		}
	}

	private inferSeverity(testType: TestType): Severity {
		const severityMap: Record<TestType, Severity> = {
			'sql-injection': 'critical',
			'nosql-injection': 'critical',
			'command-injection': 'critical',
			'template-injection': 'high',
			'xss-reflected': 'medium',
			'xss-stored': 'high',
			'brute-force': 'medium',
			'session-management': 'medium',
			'password-reset': 'low',
			'idor': 'high',
			'privilege-escalation': 'critical',
			'missing-auth': 'high',
			'zap-baseline': 'medium',
			'zap-active': 'high',
			'zap-api': 'medium',
		};
		return severityMap[testType] ?? 'medium';
	}

	private suggestFix(testType: TestType): string {
		const fixes: Record<TestType, string> = {
			'sql-injection': 'Use parameterized queries or prepared statements. Never concatenate user input into SQL strings.',
			'nosql-injection': 'Validate and sanitize all query inputs. Use strict schemas. Avoid $where operators with user input.',
			'command-injection': 'Avoid passing user input to shell commands. Use safe APIs. If unavoidable, whitelist allowed characters.',
			'template-injection': 'Use sandboxed template engines. Never pass raw user input to template rendering.',
			'xss-reflected': 'Encode output. Use Content-Security-Policy headers. Validate input on the server side.',
			'xss-stored': 'Sanitize all user input before storing. Use output encoding when rendering.',
			'brute-force': 'Implement rate limiting and account lockout. Use CAPTCHA after failed attempts.',
			'session-management': 'Set HttpOnly, Secure, and SameSite attributes on cookies. Use short session timeouts.',
			'password-reset': 'Return the same response regardless of whether the account exists.',
			'idor': 'Implement authorization checks. Verify the requesting user owns the resource.',
			'privilege-escalation': 'Implement role-based access control. Validate user roles on every request.',
			'missing-auth': 'Add authentication middleware to all sensitive endpoints.',
			'zap-baseline': 'Review ZAP findings and apply recommended fixes.',
			'zap-active': 'Review ZAP findings and apply recommended fixes.',
			'zap-api': 'Review ZAP API findings and apply recommended fixes.',
		};
		return fixes[testType] ?? 'Review and fix the security issue.';
	}

	private describeImpact(testType: TestType, severity: Severity): string {
		const impacts: Record<TestType, string> = {
			'sql-injection': 'An attacker could execute arbitrary SQL queries, potentially accessing or deleting all data.',
			'nosql-injection': 'An attacker could bypass authentication or access unauthorized data.',
			'command-injection': 'An attacker could execute arbitrary system commands on the server.',
			'template-injection': 'An attacker could execute arbitrary code via the template engine.',
			'xss-reflected': 'An attacker could execute JavaScript in other users\' browsers.',
			'xss-stored': 'An attacker could persistently execute JavaScript for all users viewing the affected content.',
			'brute-force': 'An attacker could guess credentials through automated attempts.',
			'session-management': 'An attacker could hijack user sessions.',
			'password-reset': 'An attacker could enumerate valid user accounts.',
			'idor': 'An attacker could access other users\' data by manipulating resource IDs.',
			'privilege-escalation': 'An attacker could gain administrative privileges.',
			'missing-auth': 'An unauthenticated user could access sensitive data or operations.',
			'zap-baseline': `ZAP detected ${severity} severity issues in the application.`,
			'zap-active': `ZAP active scanning detected ${severity} severity vulnerabilities.`,
			'zap-api': `ZAP API scanning detected ${severity} severity issues.`,
		};
		return impacts[testType] ?? 'Security vulnerability detected.';
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}
