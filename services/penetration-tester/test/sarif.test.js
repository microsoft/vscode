/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

describe('SARIF Report Generation', () => {
	function severityToLevel(severity) {
		switch (severity) {
			case 'critical':
			case 'high':
				return 'error';
			case 'medium':
				return 'warning';
			case 'low':
				return 'note';
			default:
				return 'note';
		}
	}

	function toSarif(reports) {
		const rules = [];
		const results = [];
		const ruleIndex = new Map();

		for (const report of reports) {
			const finding = report.finding;
			const ruleId = `soa-pentest/${finding.testType}`;

			if (!ruleIndex.has(ruleId)) {
				ruleIndex.set(ruleId, rules.length);
				rules.push({
					id: ruleId,
					name: finding.testType,
					shortDescription: { text: `${finding.owaspCategory}: ${finding.testType}` },
					helpUri: `https://owasp.org/Top10/${finding.owaspCategory}/`,
				});
			}

			const locations = [];
			if (finding.filePath) {
				locations.push({
					physicalLocation: {
						artifactLocation: { uri: finding.filePath },
						region: {
							startLine: finding.line ?? 1,
							startColumn: 1,
							endLine: finding.line ?? 1,
							endColumn: 1,
						},
					},
				});
			}

			results.push({
				ruleId,
				level: severityToLevel(finding.severity),
				message: { text: finding.evidence },
				locations,
			});
		}

		return {
			$schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
			version: '2.1.0',
			runs: [{ tool: { driver: { name: 'Son-of-Anton Penetration Tester', version: '1.0.0', rules } }, results }],
		};
	}

	test('generates valid SARIF structure', () => {
		const reports = [{
			finding: {
				testType: 'sql-injection',
				owaspCategory: 'A03-injection',
				severity: 'critical',
				evidence: 'SQL error in response',
				filePath: 'src/services/userService.ts',
				line: 42,
			},
			impactAssessment: 'Critical',
			reproductionSteps: ['Step 1', 'Step 2'],
		}];

		const sarif = toSarif(reports);

		assert.strictEqual(sarif.version, '2.1.0');
		assert.strictEqual(sarif.runs.length, 1);
		assert.strictEqual(sarif.runs[0].tool.driver.name, 'Son-of-Anton Penetration Tester');
		assert.strictEqual(sarif.runs[0].results.length, 1);
		assert.strictEqual(sarif.runs[0].results[0].ruleId, 'soa-pentest/sql-injection');
		assert.strictEqual(sarif.runs[0].results[0].level, 'error');
	});

	test('maps severities to correct SARIF levels', () => {
		assert.strictEqual(severityToLevel('critical'), 'error');
		assert.strictEqual(severityToLevel('high'), 'error');
		assert.strictEqual(severityToLevel('medium'), 'warning');
		assert.strictEqual(severityToLevel('low'), 'note');
	});

	test('deduplicates rules for same test type', () => {
		const reports = [
			{
				finding: { testType: 'sql-injection', owaspCategory: 'A03-injection', severity: 'critical', evidence: 'Finding 1', filePath: 'a.ts', line: 1 },
				impactAssessment: 'High', reproductionSteps: [],
			},
			{
				finding: { testType: 'sql-injection', owaspCategory: 'A03-injection', severity: 'high', evidence: 'Finding 2', filePath: 'b.ts', line: 5 },
				impactAssessment: 'High', reproductionSteps: [],
			},
		];

		const sarif = toSarif(reports);

		assert.strictEqual(sarif.runs[0].tool.driver.rules.length, 1);
		assert.strictEqual(sarif.runs[0].results.length, 2);
	});

	test('includes file location when available', () => {
		const reports = [{
			finding: {
				testType: 'xss-reflected',
				owaspCategory: 'A03-injection',
				severity: 'medium',
				evidence: 'XSS detected',
				filePath: 'src/handlers/search.ts',
				line: 15,
			},
			impactAssessment: 'Medium', reproductionSteps: [],
		}];

		const sarif = toSarif(reports);
		const location = sarif.runs[0].results[0].locations[0];

		assert.strictEqual(location.physicalLocation.artifactLocation.uri, 'src/handlers/search.ts');
		assert.strictEqual(location.physicalLocation.region.startLine, 15);
	});

	test('handles findings without file path', () => {
		const reports = [{
			finding: {
				testType: 'zap-baseline',
				owaspCategory: 'A05-security-misconfiguration',
				severity: 'low',
				evidence: 'Missing security header',
			},
			impactAssessment: 'Low', reproductionSteps: [],
		}];

		const sarif = toSarif(reports);

		assert.strictEqual(sarif.runs[0].results[0].locations.length, 0);
	});

	test('generates empty SARIF for no findings', () => {
		const sarif = toSarif([]);

		assert.strictEqual(sarif.runs[0].results.length, 0);
		assert.strictEqual(sarif.runs[0].tool.driver.rules.length, 0);
	});
});
