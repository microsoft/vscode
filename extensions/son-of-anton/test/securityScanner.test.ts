/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { parseSarif } from '../src/security/SecurityScanner';

suite('SecurityScanner', () => {
	suite('parseSarif', () => {
		test('parses valid SARIF output', () => {
			const sarif = JSON.stringify({
				runs: [{
					results: [{
						ruleId: 'javascript.lang.security.detect-eval',
						level: 'error',
						message: { text: 'Detected use of eval()' },
						locations: [{
							physicalLocation: {
								artifactLocation: { uri: 'src/utils.ts' },
								region: {
									startLine: 10,
									startColumn: 5,
									endLine: 10,
									endColumn: 20,
								},
							},
						}],
					}],
				}],
			});

			const report = parseSarif(sarif, 'Semgrep');

			assert.deepStrictEqual(report, {
				tool: 'Semgrep',
				results: [{
					ruleId: 'javascript.lang.security.detect-eval',
					level: 'error',
					message: 'Detected use of eval()',
					filePath: 'src/utils.ts',
					startLine: 10,
					startColumn: 5,
					endLine: 10,
					endColumn: 20,
				}],
			});
		});

		test('handles empty runs', () => {
			const sarif = JSON.stringify({ runs: [] });
			const report = parseSarif(sarif, 'Semgrep');
			assert.deepStrictEqual(report.results, []);
		});

		test('handles invalid JSON', () => {
			const report = parseSarif('not json', 'Semgrep');
			assert.deepStrictEqual(report, { tool: 'Semgrep', results: [] });
		});

		test('handles missing locations gracefully', () => {
			const sarif = JSON.stringify({
				runs: [{
					results: [{
						ruleId: 'some-rule',
						level: 'warning',
						message: { text: 'Something is wrong' },
					}],
				}],
			});

			const report = parseSarif(sarif, 'Trivy');
			assert.strictEqual(report.results.length, 1);
			assert.strictEqual(report.results[0].startLine, 1);
			assert.strictEqual(report.results[0].filePath, '');
		});

		test('parses multiple results across multiple runs', () => {
			const sarif = JSON.stringify({
				runs: [
					{
						results: [
							{
								ruleId: 'rule-1',
								level: 'error',
								message: { text: 'First finding' },
								locations: [{
									physicalLocation: {
										artifactLocation: { uri: 'a.ts' },
										region: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 10 },
									},
								}],
							},
						],
					},
					{
						results: [
							{
								ruleId: 'rule-2',
								level: 'warning',
								message: { text: 'Second finding' },
								locations: [{
									physicalLocation: {
										artifactLocation: { uri: 'b.ts' },
										region: { startLine: 5, startColumn: 1, endLine: 5, endColumn: 15 },
									},
								}],
							},
						],
					},
				],
			});

			const report = parseSarif(sarif, 'Semgrep');
			assert.strictEqual(report.results.length, 2);
			assert.strictEqual(report.results[0].ruleId, 'rule-1');
			assert.strictEqual(report.results[1].ruleId, 'rule-2');
		});
	});
});
