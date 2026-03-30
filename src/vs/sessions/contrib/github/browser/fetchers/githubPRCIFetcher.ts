/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitHubCheckConclusion, GitHubCheckStatus, GitHubCIOverallStatus, IGitHubCICheck } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';

//#region GitHub API response types

interface IGitHubCheckRunResponse {
	readonly id: number;
	readonly name: string;
	readonly status: string;
	readonly conclusion: string | null;
	readonly started_at: string | null;
	readonly completed_at: string | null;
	readonly details_url: string | null;
}

interface IGitHubCheckRunsListResponse {
	readonly total_count: number;
	readonly check_runs: readonly IGitHubCheckRunResponse[];
}

interface IGitHubCheckRunAnnotationResponse {
	readonly path: string;
	readonly start_line: number;
	readonly end_line: number;
	readonly annotation_level: string;
	readonly message: string;
	readonly title: string | null;
}

interface IGitHubCheckRunDetailResponse {
	readonly id: number;
	readonly name: string;
	readonly details_url: string | null;
	readonly app: {
		readonly slug: string;
	} | null;
	readonly output: {
		readonly title: string | null;
		readonly summary: string | null;
		readonly text: string | null;
		readonly annotations_count: number;
	};
}

//#endregion

/**
 * Stateless fetcher for GitHub CI check data (check runs, check suites).
 * All methods return raw typed data with no caching or state.
 */
export class GitHubPRCIFetcher {

	constructor(
		private readonly _apiClient: GitHubApiClient,
	) { }

	async getCheckRuns(owner: string, repo: string, ref: string): Promise<IGitHubCICheck[]> {
		const data = await this._apiClient.request<IGitHubCheckRunsListResponse>(
			'GET',
			`/repos/${e(owner)}/${e(repo)}/commits/${e(ref)}/check-runs`,
			'githubApi.getCheckRuns'
		);
		return data.check_runs.map(mapCheckRun);
	}

	/**
	 * Rerun failed jobs in a GitHub Actions workflow run.
	 */
	async rerunFailedJobs(owner: string, repo: string, runId: number): Promise<void> {
		await this._apiClient.request<void>(
			'POST',
			`/repos/${e(owner)}/${e(repo)}/actions/runs/${runId}/rerun-failed-jobs`,
			'githubApi.rerunFailedJobs'
		);
	}

	/**
	 * Get logs/output for a specific check run.
	 *
	 * Tries multiple sources in order:
	 * 1. The check run's own output fields (title, summary, text) — set by the
	 *    check run creator via the Checks API.
	 * 2. Annotations attached to the check run.
	 * 3. GitHub Actions job logs (only works for GitHub Actions workflows).
	 */
	async getCheckRunAnnotations(owner: string, repo: string, checkRunId: number): Promise<string> {
		const sections: string[] = [];
		let detail: IGitHubCheckRunDetailResponse | undefined;

		// 1. Fetch check run detail for output fields
		try {
			detail = await this._apiClient.request<IGitHubCheckRunDetailResponse>(
				'GET',
				`/repos/${e(owner)}/${e(repo)}/check-runs/${checkRunId}`,
				'githubApi.getCheckRunAnnotations'
			);
			const output = detail.output;
			if (output.title) {
				sections.push(`# ${output.title}`);
			}
			if (output.summary) {
				sections.push(output.summary);
			}
			if (output.text) {
				sections.push(output.text);
			}
		} catch {
			// Ignore — output may not be available
		}

		// 2. Fetch annotations
		try {
			const annotations = await this._apiClient.request<readonly IGitHubCheckRunAnnotationResponse[]>(
				'GET',
				`/repos/${e(owner)}/${e(repo)}/check-runs/${checkRunId}/annotations`,
				'githubApi.getCheckRunAnnotations.annotations'
			);
			if (annotations.length > 0) {
				sections.push(
					annotations.map(a =>
						`[${a.annotation_level}] ${a.path}:${a.start_line}${a.end_line !== a.start_line ? `-${a.end_line}` : ''} ${a.title ? `(${a.title}) ` : ''}${a.message}`
					).join('\n')
				);
			}
		} catch {
			// Ignore — annotations may not be available
		}

		if (sections.length > 0) {
			return sections.join('\n\n');
		}

		return 'No output available for this check run.';
	}
}

//#region Helpers

function e(value: string): string {
	return encodeURIComponent(value);
}

function mapCheckRun(data: IGitHubCheckRunResponse): IGitHubCICheck {
	return {
		id: data.id,
		name: data.name,
		status: mapCheckStatus(data.status),
		conclusion: data.conclusion ? mapCheckConclusion(data.conclusion) : undefined,
		startedAt: data.started_at ?? undefined,
		completedAt: data.completed_at ?? undefined,
		detailsUrl: data.details_url ?? undefined,
	};
}

function mapCheckStatus(status: string): GitHubCheckStatus {
	switch (status) {
		case 'queued': return GitHubCheckStatus.Queued;
		case 'in_progress': return GitHubCheckStatus.InProgress;
		case 'completed': return GitHubCheckStatus.Completed;
		default: return GitHubCheckStatus.Queued;
	}
}

function mapCheckConclusion(conclusion: string): GitHubCheckConclusion {
	switch (conclusion) {
		case 'success': return GitHubCheckConclusion.Success;
		case 'failure': return GitHubCheckConclusion.Failure;
		case 'neutral': return GitHubCheckConclusion.Neutral;
		case 'cancelled': return GitHubCheckConclusion.Cancelled;
		case 'skipped': return GitHubCheckConclusion.Skipped;
		case 'timed_out': return GitHubCheckConclusion.TimedOut;
		case 'action_required': return GitHubCheckConclusion.ActionRequired;
		case 'stale': return GitHubCheckConclusion.Stale;
		default: return GitHubCheckConclusion.Neutral;
	}
}

/**
 * Compute an overall CI status from a list of check runs.
 */
export function computeOverallCIStatus(checks: readonly IGitHubCICheck[]): GitHubCIOverallStatus {
	if (checks.length === 0) {
		return GitHubCIOverallStatus.Neutral;
	}

	let hasFailure = false;
	let hasPending = false;

	for (const check of checks) {
		if (check.status !== GitHubCheckStatus.Completed) {
			hasPending = true;
			continue;
		}
		if (check.conclusion === GitHubCheckConclusion.Failure ||
			check.conclusion === GitHubCheckConclusion.TimedOut ||
			check.conclusion === GitHubCheckConclusion.ActionRequired) {
			hasFailure = true;
		}
	}

	if (hasFailure) {
		return GitHubCIOverallStatus.Failure;
	}
	if (hasPending) {
		return GitHubCIOverallStatus.Pending;
	}
	return GitHubCIOverallStatus.Success;
}

//#endregion
