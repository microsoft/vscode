/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { UpstreamRebaseAssessor } from '../src/maintenance/UpstreamRebaseAssessor';

suite('UpstreamRebaseAssessor', () => {
	let assessor: UpstreamRebaseAssessor;

	setup(() => {
		assessor = new UpstreamRebaseAssessor();
		assessor.setPinnedVersion('1.90.0');
	});

	test('assessRelease recommends rebase for security changes', () => {
		const assessment = assessor.assessRelease('1.91.0', '2024-07-01', [
			{
				description: 'Fix XSS vulnerability in webview',
				category: 'security',
				value: 'high',
				affectedFiles: ['src/vs/workbench/browser/webview.ts'],
				conflictRisk: 'low',
			},
		], 5);

		assert.strictEqual(assessment.recommendation, 'rebase');
	});

	test('assessRelease recommends defer for cosmetic low-conflict changes', () => {
		const assessment = assessor.assessRelease('1.91.0', '2024-07-01', [
			{
				description: 'Update icon theme',
				category: 'cosmetic',
				value: 'low',
				affectedFiles: ['resources/icons/icon.svg'],
				conflictRisk: 'none',
			},
		], 3);

		assert.strictEqual(assessment.recommendation, 'defer');
	});

	test('assessRelease recommends probably-rebase for medium value low conflict', () => {
		const assessment = assessor.assessRelease('1.91.0', '2024-07-01', [
			{
				description: 'New tree view API for extensions',
				category: 'new-feature',
				value: 'medium',
				affectedFiles: ['src/vs/workbench/api/common/extHost.api.impl.ts'],
				conflictRisk: 'low',
			},
		], 10);

		assert.strictEqual(assessment.recommendation, 'probably-rebase');
	});

	test('assessRelease recommends probably-defer for medium value high conflict', () => {
		const assessment = assessor.assessRelease('1.91.0', '2024-07-01', [
			{
				description: 'Refactored editor layout system',
				category: 'new-feature',
				value: 'medium',
				affectedFiles: [],
				conflictRisk: 'high',
			},
		], 60);

		assert.strictEqual(assessment.recommendation, 'probably-defer');
	});

	test('generateReport aggregates assessments', () => {
		assessor.assessRelease('1.91.0', '2024-07-01', [
			{ description: 'Security fix', category: 'security', value: 'high', affectedFiles: [], conflictRisk: 'low' },
		], 5);
		assessor.assessRelease('1.92.0', '2024-08-01', [
			{ description: 'UI tweak', category: 'cosmetic', value: 'low', affectedFiles: [], conflictRisk: 'none' },
		], 2);

		const report = assessor.generateReport();
		assert.strictEqual(report.overallRecommendation, 'rebase');
		assert.strictEqual(report.releases.length, 2);
		assert.ok(report.summary.includes('security'));
	});

	test('isAssessmentDue returns true when no previous assessment', () => {
		assert.strictEqual(assessor.isAssessmentDue(undefined), true);
	});

	test('isAssessmentDue returns false for recent assessment', () => {
		const recent = new Date().toISOString();
		assert.strictEqual(assessor.isAssessmentDue(recent), false);
	});

	test('getRebaseChecklist returns ordered steps', () => {
		const checklist = assessor.getRebaseChecklist();
		assert.ok(checklist.length > 5);
		assert.ok(checklist[0].includes('branch'));
	});

	test('formatReport produces markdown output', () => {
		assessor.assessRelease('1.91.0', '2024-07-01', [
			{ description: 'Fix', category: 'security', value: 'high', affectedFiles: [], conflictRisk: 'low' },
		], 5);

		const report = assessor.formatReport();
		assert.ok(report.includes('Upstream Rebase Assessment'));
		assert.ok(report.includes('Decision Matrix'));
	});

	test('clearAssessments resets state', () => {
		assessor.assessRelease('1.91.0', '2024-07-01', [
			{ description: 'Fix', category: 'security', value: 'high', affectedFiles: [], conflictRisk: 'low' },
		], 5);

		assessor.clearAssessments();
		const report = assessor.generateReport();
		assert.strictEqual(report.releases.length, 0);
	});
});
