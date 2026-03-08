/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	SarifLocation,
	SarifReport,
	SarifResult,
	SarifRule,
	Severity,
	VulnerabilityReport,
} from './types';

/**
 * Convert validated vulnerability reports to SARIF format.
 * SARIF integrates with the VS Code problems panel for inline diagnostics.
 */
export function toSarif(reports: VulnerabilityReport[]): SarifReport {
	const rules: SarifRule[] = [];
	const results: SarifResult[] = [];
	const ruleIndex = new Map<string, number>();

	for (const report of reports) {
		const finding = report.finding;
		const ruleId = `soa-pentest/${finding.testType}`;

		if (!ruleIndex.has(ruleId)) {
			ruleIndex.set(ruleId, rules.length);
			rules.push({
				id: ruleId,
				name: finding.testType,
				shortDescription: {
					text: `${formatOwaspCategory(finding.owaspCategory)}: ${finding.testType}`,
				},
				helpUri: `https://owasp.org/Top10/${finding.owaspCategory}/`,
			});
		}

		const locations: SarifLocation[] = [];
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
			message: {
				text: [
					finding.evidence,
					'',
					`**Impact:** ${report.impactAssessment}`,
					`**Suggested Fix:** ${finding.suggestedFix}`,
					'',
					'**Reproduction Steps:**',
					...report.reproductionSteps.map((step, i) => `${i + 1}. ${step}`),
				].join('\n'),
			},
			locations,
		});
	}

	return {
		$schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
		version: '2.1.0',
		runs: [{
			tool: {
				driver: {
					name: 'Son-of-Anton Penetration Tester',
					version: '1.0.0',
					rules,
				},
			},
			results,
		}],
	};
}

function severityToLevel(severity: Severity): SarifResult['level'] {
	switch (severity) {
		case 'critical':
		case 'high':
			return 'error';
		case 'medium':
			return 'warning';
		case 'low':
			return 'note';
	}
}

function formatOwaspCategory(category: string): string {
	const mapping: Record<string, string> = {
		'A01-broken-access-control': 'A01',
		'A02-cryptographic-failures': 'A02',
		'A03-injection': 'A03',
		'A04-insecure-design': 'A04',
		'A05-security-misconfiguration': 'A05',
		'A06-vulnerable-components': 'A06',
		'A07-auth-failures': 'A07',
		'A08-software-integrity-failures': 'A08',
		'A09-logging-failures': 'A09',
		'A10-ssrf': 'A10',
	};
	return mapping[category] ?? category;
}
