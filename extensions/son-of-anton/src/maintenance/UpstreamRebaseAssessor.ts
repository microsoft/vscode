/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Category of an upstream change.
 */
export type ChangeCategory = 'security' | 'new-feature' | 'electron-update' | 'agent-api' | 'cosmetic';

/**
 * Value assessment of upstream changes.
 */
export type ChangeValue = 'high' | 'medium' | 'low';

/**
 * A single upstream release assessment.
 */
export interface ReleaseAssessment {
	version: string;
	releaseDate: string;
	changes: UpstreamChange[];
	totalConflictFiles: number;
	recommendation: RebaseRecommendation;
	assessmentDate: string;
}

/**
 * An individual upstream change.
 */
export interface UpstreamChange {
	description: string;
	category: ChangeCategory;
	value: ChangeValue;
	affectedFiles: string[];
	conflictRisk: 'none' | 'low' | 'medium' | 'high';
}

/**
 * Rebase recommendation decision.
 */
export type RebaseRecommendation = 'rebase' | 'probably-rebase' | 'probably-defer' | 'defer';

/**
 * Decision matrix entry for rebase assessment.
 */
export interface DecisionMatrixEntry {
	changeValue: ChangeValue;
	conflictLevel: 'low' | 'high';
	recommendation: RebaseRecommendation;
}

/**
 * Full assessment report.
 */
export interface RebaseAssessmentReport {
	currentPinnedVersion: string;
	assessmentDate: string;
	releases: ReleaseAssessment[];
	overallRecommendation: RebaseRecommendation;
	estimatedEffortDays: number;
	summary: string;
}

const DECISION_MATRIX: DecisionMatrixEntry[] = [
	{ changeValue: 'high', conflictLevel: 'low', recommendation: 'rebase' },
	{ changeValue: 'high', conflictLevel: 'high', recommendation: 'rebase' },
	{ changeValue: 'medium', conflictLevel: 'low', recommendation: 'probably-rebase' },
	{ changeValue: 'medium', conflictLevel: 'high', recommendation: 'probably-defer' },
	{ changeValue: 'low', conflictLevel: 'low', recommendation: 'defer' },
	{ changeValue: 'low', conflictLevel: 'high', recommendation: 'defer' },
];

const LOW_CONFLICT_THRESHOLD = 20;
const HIGH_CONFLICT_THRESHOLD = 50;

/**
 * UpstreamRebaseAssessor — determines when and whether to rebase against upstream VS Code.
 *
 * Responsibilities:
 * 1. Review upstream releases since pinned version
 * 2. Categorize changes (security, feature, cosmetic)
 * 3. Predict conflict count using modification docs
 * 4. Apply decision matrix to recommend action
 */
export class UpstreamRebaseAssessor {
	private readonly assessments: ReleaseAssessment[] = [];
	private pinnedVersion: string = '';

	/**
	 * Set the currently pinned upstream version.
	 */
	setPinnedVersion(version: string): void {
		this.pinnedVersion = version;
	}

	/**
	 * Get the currently pinned version.
	 */
	getPinnedVersion(): string {
		return this.pinnedVersion;
	}

	/**
	 * Assess a single upstream release.
	 */
	assessRelease(
		version: string,
		releaseDate: string,
		changes: UpstreamChange[],
		conflictFileCount: number,
	): ReleaseAssessment {
		// Determine highest-value change
		const highestValue = this.getHighestValue(changes);

		// Determine conflict level
		const conflictLevel = conflictFileCount < LOW_CONFLICT_THRESHOLD ? 'low' : 'high';

		// Apply decision matrix
		const recommendation = this.applyDecisionMatrix(highestValue, conflictLevel);

		// Override: security changes always warrant rebase
		const hasSecurityChanges = changes.some(c => c.category === 'security');
		const finalRecommendation = hasSecurityChanges ? 'rebase' : recommendation;

		const assessment: ReleaseAssessment = {
			version,
			releaseDate,
			changes,
			totalConflictFiles: conflictFileCount,
			recommendation: finalRecommendation,
			assessmentDate: new Date().toISOString(),
		};

		this.assessments.push(assessment);
		return assessment;
	}

	/**
	 * Generate a full assessment report covering all assessed releases.
	 */
	generateReport(): RebaseAssessmentReport {
		// Overall recommendation is the most urgent across all releases
		const recommendations = this.assessments.map(a => a.recommendation);
		const overallRecommendation = this.getMostUrgent(recommendations);

		// Estimate effort based on total conflict files
		const totalConflicts = this.assessments.reduce((sum, a) => sum + a.totalConflictFiles, 0);
		const estimatedDays = totalConflicts < LOW_CONFLICT_THRESHOLD ? 1
			: totalConflicts < HIGH_CONFLICT_THRESHOLD ? 2
				: 3;

		const summaryParts: string[] = [];
		const securityReleases = this.assessments.filter(a =>
			a.changes.some(c => c.category === 'security')
		);
		if (securityReleases.length > 0) {
			summaryParts.push(`${securityReleases.length} release(s) contain security patches`);
		}

		const featureReleases = this.assessments.filter(a =>
			a.changes.some(c => c.category === 'new-feature' && c.value !== 'low')
		);
		if (featureReleases.length > 0) {
			summaryParts.push(`${featureReleases.length} release(s) contain useful features`);
		}

		summaryParts.push(`${totalConflicts} files predicted to conflict`);
		summaryParts.push(`Estimated effort: ${estimatedDays} day(s)`);

		return {
			currentPinnedVersion: this.pinnedVersion,
			assessmentDate: new Date().toISOString(),
			releases: [...this.assessments],
			overallRecommendation,
			estimatedEffortDays: estimatedDays,
			summary: summaryParts.join('. ') + '.',
		};
	}

	/**
	 * Check if an assessment is due (quarterly cadence).
	 */
	isAssessmentDue(lastAssessmentDate: string | undefined): boolean {
		if (!lastAssessmentDate) {
			return true;
		}

		const last = new Date(lastAssessmentDate);
		const now = new Date();
		const monthsSince = (now.getFullYear() - last.getFullYear()) * 12
			+ (now.getMonth() - last.getMonth());

		return monthsSince >= 3;
	}

	/**
	 * Get the rebase checklist for executing a rebase.
	 */
	getRebaseChecklist(): string[] {
		return [
			'Create a new branch for the rebase',
			'Fetch the target upstream release tag',
			'Attempt the rebase: git rebase upstream/release/X.XX',
			'Resolve conflicts file by file',
			'Review docs/modifications/ for files we intentionally changed',
			'Run full TypeScript compilation check',
			'Run the full test suite',
			'Run integration tests against Docker Compose stack',
			'QA the IDE manually (agent chat, completions, extensions)',
			'Update docs/modifications/ with any new conflicts resolved',
			'Create PR for review',
		];
	}

	/**
	 * Format the assessment as a human-readable report.
	 */
	formatReport(): string {
		const report = this.generateReport();
		const lines: string[] = ['## Upstream Rebase Assessment\n'];

		lines.push(`**Pinned Version:** ${report.currentPinnedVersion || 'Not set'}`);
		lines.push(`**Assessment Date:** ${report.assessmentDate}`);
		lines.push(`**Overall Recommendation:** ${report.overallRecommendation.toUpperCase()}`);
		lines.push(`**Estimated Effort:** ${report.estimatedEffortDays} day(s)`);
		lines.push(`\n${report.summary}\n`);

		if (report.releases.length > 0) {
			lines.push('### Release Details\n');
			lines.push('| Version | Date | Changes | Conflicts | Recommendation |');
			lines.push('|---|---|---|---|---|');

			for (const release of report.releases) {
				const changesSummary = release.changes.map(c => c.category).join(', ');
				lines.push(
					`| ${release.version} | ${release.releaseDate} ` +
					`| ${changesSummary} | ${release.totalConflictFiles} ` +
					`| ${release.recommendation} |`
				);
			}
		}

		lines.push('\n### Decision Matrix\n');
		lines.push('| Change Value | Conflict Count | Decision |');
		lines.push('|---|---|---|');
		lines.push('| High (security) | Any | Rebase |');
		lines.push('| Medium (useful feature) | Low (<20 files) | Probably rebase |');
		lines.push('| Medium (useful feature) | High (>50 files) | Probably defer |');
		lines.push('| Low (cosmetic) | Any | Defer |');

		return lines.join('\n');
	}

	/**
	 * Persist assessment data to the workspace.
	 */
	async persistAssessment(): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders?.length) {
			return;
		}

		const docsDir = vscode.Uri.joinPath(
			workspaceFolders[0].uri,
			'docs',
		);
		await vscode.workspace.fs.createDirectory(docsDir);

		const report = this.generateReport();
		const content = Buffer.from(JSON.stringify(report, null, '\t'));
		const fileUri = vscode.Uri.joinPath(docsDir, 'upstream-rebase-assessment.json');
		await vscode.workspace.fs.writeFile(fileUri, content);
	}

	/**
	 * Clear all assessments (for re-assessment).
	 */
	clearAssessments(): void {
		this.assessments.length = 0;
	}

	private getHighestValue(changes: UpstreamChange[]): ChangeValue {
		const order: ChangeValue[] = ['high', 'medium', 'low'];
		for (const value of order) {
			if (changes.some(c => c.value === value)) {
				return value;
			}
		}
		return 'low';
	}

	private applyDecisionMatrix(changeValue: ChangeValue, conflictLevel: 'low' | 'high'): RebaseRecommendation {
		const entry = DECISION_MATRIX.find(
			e => e.changeValue === changeValue && e.conflictLevel === conflictLevel
		);
		return entry?.recommendation ?? 'defer';
	}

	private getMostUrgent(recommendations: RebaseRecommendation[]): RebaseRecommendation {
		const priority: RebaseRecommendation[] = ['rebase', 'probably-rebase', 'probably-defer', 'defer'];
		for (const rec of priority) {
			if (recommendations.includes(rec)) {
				return rec;
			}
		}
		return 'defer';
	}
}
