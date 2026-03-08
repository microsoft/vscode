/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { toSarif, severityToLevel } = require('../dist/sarif');

describe('SARIF Report Generation', () => {
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
