/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { computeOverallCIStatus } from '../fetchers/githubPRCIFetcher.js';
const LOG_PREFIX = '[GitHubPullRequestCIModel]';
const DEFAULT_POLL_INTERVAL_MS = 60_000;
/**
 * Reactive model for CI check status on a pull request head ref.
 * Wraps fetcher data in observables and supports periodic polling.
 */
export class GitHubPullRequestCIModel extends Disposable {
    constructor(owner, repo, headRef, _fetcher, _logService) {
        super();
        this.owner = owner;
        this.repo = repo;
        this.headRef = headRef;
        this._fetcher = _fetcher;
        this._logService = _logService;
        this._checks = observableValue(this, []);
        this.checks = this._checks;
        this._overallStatus = observableValue(this, "neutral" /* GitHubCIOverallStatus.Neutral */);
        this.overallStatus = this._overallStatus;
        this._disposed = false;
        this._pollScheduler = this._register(new RunOnceScheduler(() => this._poll(), DEFAULT_POLL_INTERVAL_MS));
    }
    /**
     * Refresh all CI check data.
     */
    async refresh() {
        try {
            const checks = await this._fetcher.getCheckRuns(this.owner, this.repo, this.headRef);
            this._checks.set(checks, undefined);
            this._overallStatus.set(computeOverallCIStatus(checks), undefined);
        }
        catch (err) {
            this._logService.error(`${LOG_PREFIX} Failed to refresh CI checks for ${this.owner}/${this.repo}@${this.headRef}:`, err);
        }
    }
    /**
     * Get annotations (structured logs) for a specific check run.
     */
    async getCheckRunAnnotations(checkRunId) {
        return this._fetcher.getCheckRunAnnotations(this.owner, this.repo, checkRunId);
    }
    /**
     * Rerun a failed check by extracting the workflow run ID from its details URL
     * and calling the GitHub Actions rerun-failed-jobs API, then refresh status.
     */
    async rerunFailedCheck(check) {
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
    startPolling(intervalMs = DEFAULT_POLL_INTERVAL_MS) {
        this._pollScheduler.cancel();
        this._pollScheduler.schedule(intervalMs);
    }
    /**
     * Stop periodic polling.
     */
    stopPolling() {
        this._pollScheduler.cancel();
    }
    async _poll() {
        await this.refresh();
        // Re-schedule if not disposed (RunOnceScheduler is one-shot)
        if (!this._disposed) {
            this._pollScheduler.schedule();
        }
    }
    dispose() {
        this._disposed = true;
        super.dispose();
    }
}
/**
 * Extract the GitHub Actions workflow run ID from a check run's details URL.
 * URLs follow the pattern: `https://github.com/{owner}/{repo}/actions/runs/{run_id}/job/{job_id}`
 */
export function parseWorkflowRunId(detailsUrl) {
    if (!detailsUrl) {
        return undefined;
    }
    const match = /\/actions\/runs\/(?<runId>\d+)/.exec(detailsUrl);
    const runId = match?.groups?.runId;
    return runId ? parseInt(runId, 10) : undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViUHVsbFJlcXVlc3RDSU1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9naXRodWIvYnJvd3Nlci9tb2RlbHMvZ2l0aHViUHVsbFJlcXVlc3RDSU1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQWUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFHeEYsT0FBTyxFQUFFLHNCQUFzQixFQUFxQixNQUFNLGtDQUFrQyxDQUFDO0FBRTdGLE1BQU0sVUFBVSxHQUFHLDRCQUE0QixDQUFDO0FBQ2hELE1BQU0sd0JBQXdCLEdBQUcsTUFBTSxDQUFDO0FBRXhDOzs7R0FHRztBQUNILE1BQU0sT0FBTyx3QkFBeUIsU0FBUSxVQUFVO0lBV3ZELFlBQ1UsS0FBYSxFQUNiLElBQVksRUFDWixPQUFlLEVBQ1AsUUFBMkIsRUFDM0IsV0FBd0I7UUFFekMsS0FBSyxFQUFFLENBQUM7UUFOQyxVQUFLLEdBQUwsS0FBSyxDQUFRO1FBQ2IsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUNaLFlBQU8sR0FBUCxPQUFPLENBQVE7UUFDUCxhQUFRLEdBQVIsUUFBUSxDQUFtQjtRQUMzQixnQkFBVyxHQUFYLFdBQVcsQ0FBYTtRQWR6QixZQUFPLEdBQUcsZUFBZSxDQUE0QixJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdkUsV0FBTSxHQUEyQyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBRXRELG1CQUFjLEdBQUcsZUFBZSxDQUF3QixJQUFJLGdEQUFnQyxDQUFDO1FBQ3JHLGtCQUFhLEdBQXVDLElBQUksQ0FBQyxjQUFjLENBQUM7UUFHekUs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