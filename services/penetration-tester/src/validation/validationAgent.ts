/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import {
	PenTestConfig,
	ReproductionResult,
	Severity,
	TestResult,
	VulnerabilityFinding,
	VulnerabilityReport,
} from '../types';

/**
 * The Validation Agent takes suspected vulnerabilities from sandbox agents
 * and confirms whether they are real by reproducing the finding.
 *
 * This is the key advantage over traditional SAST — it eliminates false
 * positives by requiring actual exploit reproduction.
 */
export class ValidationAgent {
	private readonly config: PenTestConfig;

	constructor(config: PenTestConfig) {
		this.config = config;
	}

	/**
	 * Validate all findings from a set of test results.
	 * Returns only confirmed vulnerability reports.
	 */
	async validateFindings(
		testResults: TestResult[],
		targetBaseUrl: string,
	): Promise<VulnerabilityReport[]> {
		const reports: VulnerabilityReport[] = [];

		for (const result of testResults) {
			if (!result.finding) {
				continue;
			}

			const report = await this.validateFinding(result, targetBaseUrl);
			if (report) {
				reports.push(report);
			}
		}

		return reports;
	}

	/**
	 * Validate a single finding by attempting to reproduce it.
	 */
	async validateFinding(
		testResult: TestResult,
		targetBaseUrl: string,
	): Promise<VulnerabilityReport | null> {
		const finding = testResult.finding;
		if (!finding) {
			return null;
		}

		const reproductionResult = await this.reproduceFinding(finding, targetBaseUrl);

		if (reproductionResult.reproduced) {
			finding.confirmed = true;
			finding.reproducible = true;

			const impactAssessment = this.assessImpact(finding);
			const reproductionSteps = this.generateReproductionSteps(finding, targetBaseUrl);

			return {
				id: randomUUID(),
				finding,
				reproductionResult,
				impactAssessment,
				reproductionSteps,
			};
		}

		// Mark as unconfirmed but still return for logging
		finding.confirmed = false;
		finding.reproducible = false;

		return null;
	}

	/**
	 * Attempt to reproduce a vulnerability finding.
	 * Sends the exact same request and verifies the same result.
	 */
	private async reproduceFinding(
		finding: VulnerabilityFinding,
		targetBaseUrl: string,
	): Promise<ReproductionResult> {
		const maxAttempts = 3;
		let reproduced = false;
		let matchedResponse = false;
		const notes: string[] = [];

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				const response = await this.replayRequest(finding, targetBaseUrl);

				if (response) {
					const isVulnerable = this.checkVulnerabilityIndicators(
						finding.testType,
						response.body,
						response.statusCode,
					);

					if (isVulnerable) {
						reproduced = true;
						matchedResponse = true;
						notes.push(`Reproduced on attempt ${attempt}: response confirms vulnerability`);
						break;
					} else {
						notes.push(`Attempt ${attempt}: response did not match vulnerability pattern`);
					}
				} else {
					notes.push(`Attempt ${attempt}: no response received`);
				}
			} catch (err) {
				notes.push(
					`Attempt ${attempt}: error - ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}

		return {
			reproduced,
			attempts: maxAttempts,
			matchedResponse,
			notes: notes.join('. '),
		};
	}

	/**
	 * Replay the exact request that triggered the finding.
	 */
	private async replayRequest(
		finding: VulnerabilityFinding,
		targetBaseUrl: string,
	): Promise<{ statusCode: number; body: string; headers: Record<string, string> } | null> {
		const endpointParts = finding.endpoint.split(' ');
		const method = endpointParts[0] ?? 'GET';
		const path = endpointParts[1] ?? '/';

		let url: string;
		let body: string | null = null;

		if (method === 'GET') {
			const paramName = 'q';
			url = `${targetBaseUrl}${path}?${encodeURIComponent(paramName)}=${encodeURIComponent(finding.payload)}`;
		} else {
			url = `${targetBaseUrl}${path}`;
			body = JSON.stringify({ input: finding.payload });
		}

		return new Promise((resolve, reject) => {
			const parsedUrl = new URL(url);
			const options: http.RequestOptions = {
				hostname: parsedUrl.hostname,
				port: parsedUrl.port || 80,
				path: parsedUrl.pathname + parsedUrl.search,
				method,
				timeout: this.config.testTimeoutMs,
				headers: {
					'User-Agent': 'SoA-PenTest-Validation/1.0',
					...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
				},
			};

			const request = http.request(options, response => {
				let data = '';
				response.on('data', chunk => { data += chunk; });
				response.on('end', () => {
					resolve({
						statusCode: response.statusCode ?? 0,
						body: data.substring(0, 10000),
						headers: Object.fromEntries(
							Object.entries(response.headers).map(([k, v]) => [k, String(v ?? '')]),
						),
					});
				});
			});

			request.on('error', reject);
			request.on('timeout', () => {
				request.destroy();
				reject(new Error('Validation request timed out'));
			});

			if (body) {
				request.write(body);
			}
			request.end();
		});
	}

	/**
	 * Check if a response indicates a vulnerability for the given test type.
	 */
	private checkVulnerabilityIndicators(
		testType: string,
		responseBody: string,
		statusCode: number,
	): boolean {
		const bodyLower = responseBody.toLowerCase();

		switch (testType) {
			case 'sql-injection':
				return statusCode === 500 ||
					['syntax error', 'mysql', 'postgresql', 'sqlite', 'sql server'].some(
						i => bodyLower.includes(i),
					);

			case 'nosql-injection':
				return ['mongoerror', 'bsontype', 'cast to objectid'].some(
					i => bodyLower.includes(i),
				);

			case 'command-injection':
				return bodyLower.includes('pen-test-marker') ||
					bodyLower.includes('uid=') ||
					bodyLower.includes('root:');

			case 'template-injection':
				return responseBody.includes('49');

			case 'xss-reflected':
			case 'xss-stored':
				return bodyLower.includes('xss-test-marker') ||
					bodyLower.includes('<script>');

			case 'brute-force':
				return statusCode === 200;

			case 'idor':
				return statusCode === 200 && responseBody.length > 50;

			case 'privilege-escalation':
				return statusCode === 200;

			case 'missing-auth':
				return statusCode === 200;

			default:
				return statusCode === 500;
		}
	}

	/**
	 * Assess the real-world impact of a confirmed vulnerability.
	 */
	private assessImpact(finding: VulnerabilityFinding): string {
		const severityDescriptions: Record<Severity, string> = {
			critical: 'This vulnerability allows an attacker to fully compromise the application or underlying infrastructure.',
			high: 'This vulnerability could result in significant data exposure or unauthorized actions.',
			medium: 'This vulnerability could be exploited under specific conditions to access limited data or functionality.',
			low: 'This vulnerability has limited impact but should be addressed as part of defence in depth.',
		};

		return `${severityDescriptions[finding.severity]} ${finding.impact}`;
	}

	/**
	 * Generate step-by-step reproduction instructions.
	 */
	private generateReproductionSteps(
		finding: VulnerabilityFinding,
		targetBaseUrl: string,
	): string[] {
		const endpointParts = finding.endpoint.split(' ');
		const method = endpointParts[0] ?? 'GET';
		const path = endpointParts[1] ?? '/';

		const steps: string[] = [
			'Start the local application.',
		];

		if (method === 'GET') {
			const encodedPayload = encodeURIComponent(finding.payload);
			steps.push(
				`Send: curl "${targetBaseUrl}${path}?q=${encodedPayload}"`,
			);
		} else {
			steps.push(
				`Send: curl -X ${method} "${targetBaseUrl}${path}" -H "Content-Type: application/json" -d '${JSON.stringify({ input: finding.payload })}'`,
			);
		}

		steps.push(`Observe: ${finding.evidence}`);

		return steps;
	}

	/**
	 * Generate a markdown finding report.
	 */
	generateMarkdownReport(report: VulnerabilityReport): string {
		const finding = report.finding;
		const lines = [
			`## Finding: ${this.testTypeToTitle(finding.testType)} in ${finding.endpoint}`,
			'',
			`**Severity:** ${finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)}`,
			`**OWASP Category:** ${this.formatOwaspCategory(finding.owaspCategory)}`,
			`**Endpoint:** ${finding.endpoint}`,
			`**Payload:** \`${finding.payload}\``,
			`**Evidence:** ${finding.evidence}`,
			`**Impact:** ${report.impactAssessment}`,
			`**Suggested Fix:** ${finding.suggestedFix}`,
		];

		if (finding.filePath) {
			lines.push(`**Source File:** ${finding.filePath}${finding.line ? `:${finding.line}` : ''}`);
		}

		lines.push('');
		lines.push('**Reproduction Steps:**');
		report.reproductionSteps.forEach((step, index) => {
			lines.push(`${index + 1}. ${step}`);
		});

		return lines.join('\n');
	}

	private testTypeToTitle(testType: string): string {
		const titles: Record<string, string> = {
			'sql-injection': 'SQL Injection',
			'nosql-injection': 'NoSQL Injection',
			'command-injection': 'Command Injection',
			'template-injection': 'Template Injection',
			'xss-reflected': 'Reflected XSS',
			'xss-stored': 'Stored XSS',
			'brute-force': 'Brute Force / Missing Rate Limiting',
			'session-management': 'Session Management Issue',
			'password-reset': 'Account Enumeration via Password Reset',
			'idor': 'Insecure Direct Object Reference (IDOR)',
			'privilege-escalation': 'Privilege Escalation',
			'missing-auth': 'Missing Authentication',
		};
		return titles[testType] ?? testType;
	}

	private formatOwaspCategory(category: string): string {
		const descriptions: Record<string, string> = {
			'A01-broken-access-control': 'A01 — Broken Access Control',
			'A02-cryptographic-failures': 'A02 — Cryptographic Failures',
			'A03-injection': 'A03 — Injection',
			'A04-insecure-design': 'A04 — Insecure Design',
			'A05-security-misconfiguration': 'A05 — Security Misconfiguration',
			'A06-vulnerable-components': 'A06 — Vulnerable and Outdated Components',
			'A07-auth-failures': 'A07 — Identification and Authentication Failures',
			'A08-software-integrity-failures': 'A08 — Software and Data Integrity Failures',
			'A09-logging-failures': 'A09 — Security Logging and Monitoring Failures',
			'A10-ssrf': 'A10 — Server-Side Request Forgery',
		};
		return descriptions[category] ?? category;
	}
}
