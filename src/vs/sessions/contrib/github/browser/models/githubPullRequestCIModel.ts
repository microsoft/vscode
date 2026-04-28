/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { GitHubCIOverallStatus, IGitHubCICheck } from '../../common/types.js';
import { computeOverallCIStatus, GitHubPRCIFetcher } from '../fetchers/githubPRCIFetcher.js';

const LOG_PREFIX = '[GitHubPullRequestCIModel]';
const DEFAULT_POLL_INTERVAL_MS = 60_000;

/**
 * Reactive model for CI check status on a pull request head ref.
 * Wraps fetcher data in observables and supports periodic polling.
 */
export class GitHubPullRequestCIModel extends Disposable {

	private _checksEtag: string | undefined = undefined;
	private readonly _checks = observableValue<readonly IGitHubCICheck[]>(this, []);
	readonly checks: IObservable<readonly IGitHubCICheck[]> = this._checks;

	private readonly _overallStatus = observableValue<GitHubCIOverallStatus>(this, GitHubCIOverallStatus.Neutral);
	readonly overallStatus: IObservable<GitHubCIOverallStatus> = this._overallStatus;

	private readonly _pollScheduler: RunOnceScheduler;
	private _disposed = false;

	constructor(
		readonly owner: string,
		readonly repo: string,
		readonly headRef: string,
		private readonly _fetcher: GitHubPRCIFetcher,
		private readonly _logService: ILogService,
	) {
		super();

		this._pollScheduler = this._register(new RunOnceScheduler(() => this._poll(), DEFAULT_POLL_INTERVAL_MS));
	}

	/**
	 * Refresh all CI check data.
	 */
	async refresh(): Promise<void> {
		try {
			const response = await this._fetcher.getCheckRuns(this.owner, this.repo, this.headRef, this._checksEtag);
			if (response.statusCode === 200 && response.data) {
				this._checksEtag = response.etag;
				this._checks.set(response.data, undefined);
				this._overallStatus.set(computeOverallCIStatus(response.data), undefined);
			}
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} Failed to refresh CI checks for ${this.owner}/${this.repo}@${this.headRef}:`, err);
		}
	}

	/**
	 * Get annotations (structured logs) for a specific check run.
	 */
	async getCheckRunAnnotations(checkRunId: number): Promise<string> {
		return this._fetcher.getCheckRunAnnotations(this.owner, this.repo, checkRunId);
	}

	/**
	 * Rerun a failed check by extracting the workflow run ID from its details URL
	 * and calling the GitHub Actions rerun-failed-jobs API, then refresh status.
	 */
	async rerunFailedCheck(check: IGitHubCICheck): Promise<void> {
		const runId = parseWorkflowRunId(check.detailsUrl);
		if (!runId) {
			this._logService.warn(`${LOG_PREFIX} Cannot rerun check "${check.name}": no workflow run ID found in detailsUrl`);
			return;
		}
		await this._fetcher.rerunFailedJobs(this.owner, this.repo, runId);
		await this.refresh();
	}

	/**
	 * Start periodic polling. Each cycle refreshes CI check data.
	 */
	startPolling(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): void {
		this._pollScheduler.cancel();
		this._pollScheduler.schedule(intervalMs);
	}

	/**
	 * Stop periodic polling.
	 */
	stopPolling(): void {
		this._pollScheduler.cancel();
	}

	private async _poll(): Promise<void> {
		await this.refresh();
		// Re-schedule if not disposed (RunOnceScheduler is one-shot)
		if (!this._disposed) {
			this._pollScheduler.schedule();
		}
	}

	override dispose(): void {
		this._disposed = true;
		super.dispose();
	}
}

/**
 * Extract the GitHub Actions workflow run ID from a check run's details URL.
 * URLs follow the pattern: `https://github.com/{owner}/{repo}/actions/runs/{run_id}/job/{job_id}`
 */
export function parseWorkflowRunId(detailsUrl: string | undefined): number | undefined {
	if (!detailsUrl) {
		return undefined;
	}
	const match = /\/actions\/runs\/(?<runId>\d+)/.exec(detailsUrl);
	const runId = match?.groups?.runId;
	return runId ? parseInt(runId, 10) : undefined;
}
