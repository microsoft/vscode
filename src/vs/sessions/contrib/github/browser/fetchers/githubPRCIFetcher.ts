/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { CheckRun } from '../../../../../platform/github/common/core/checks.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { GitHubCheckConclusion, GitHubCheckStatus, GitHubCIOverallStatus, IGitHubCICheck } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';

export class GitHubPRCIFetcher {
	constructor(readonly client: GitHubApiClient, private readonly _logService: ILogService) { }

	getCheckRuns(owner: string, repo: string, ref: string, token?: CancellationToken): Promise<readonly IGitHubCICheck[]> {
		return this.client.withClient(async (client, signal) => {
			const checks = await client.checks.listRuns({ owner, name: repo }, ref, signal, {
				query: { page: 1, per_page: 100 },
				maxPages: 100,
			});
			return checks.check_runs.map(mapCheckRun);
		}, token);
	}

	rerunFailedJobs(owner: string, repo: string, runId: number, token?: CancellationToken): Promise<void> {
		return this.client.withClient((client, signal) =>
			client.actions.rerunFailedJobs({ owner, name: repo }, runId, signal), token);
	}

	getCheckRunAnnotations(owner: string, repo: string, checkRunId: number, token?: CancellationToken): Promise<string> {
		return this.client.withClient(async (client, signal) => {
			const repository = { owner, name: repo };
			const sections: string[] = [];
			try {
				const { output } = await client.checks.getRun(repository, checkRunId, signal);
				if (output.title) {
					sections.push(`# ${output.title}`);
				}
				if (output.summary) {
					sections.push(output.summary);
				}
				if (output.text) {
					sections.push(output.text);
				}
			} catch (error) {
				if (signal.aborted || isCancellationError(error)) {
					throw error;
				}
				this._logService.warn('[GitHubPRCIFetcher] Failed to read check output', error);
			}
			try {
				const annotations = await client.checks.listAnnotations(repository, checkRunId, signal, {
					query: { page: 1, per_page: 100 },
					maxPages: 100,
				});
				if (annotations.length > 0) {
					sections.push(annotations.map(a =>
						`[${a.annotation_level}] ${a.path}:${a.start_line}${a.end_line !== a.start_line ? `-${a.end_line}` : ''} ${a.title ? `(${a.title}) ` : ''}${a.message}`
					).join('\n'));
				}
			} catch (error) {
				if (signal.aborted || isCancellationError(error)) {
					throw error;
				}
				this._logService.warn('[GitHubPRCIFetcher] Failed to read check annotations', error);
			}
			return sections.length > 0 ? sections.join('\n\n') : 'No output available for this check run.';
		}, token);
	}
}

function mapCheckRun(data: CheckRun): IGitHubCICheck {
	return {
		id: data.id, name: data.name,
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

/** Computes an overall CI status from check runs. */
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
