/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//#endregion
/**
 * Stateless fetcher for GitHub CI check data (check runs, check suites).
 * All methods return raw typed data with no caching or state.
 */
export class GitHubPRCIFetcher {
    constructor(_apiClient) {
        this._apiClient = _apiClient;
    }
    async getCheckRuns(owner, repo, ref) {
        const data = await this._apiClient.request('GET', `/repos/${e(owner)}/${e(repo)}/commits/${e(ref)}/check-runs`, 'githubApi.getCheckRuns');
        return data.check_runs.map(mapCheckRun);
    }
    /**
     * Rerun failed jobs in a GitHub Actions workflow run.
     */
    async rerunFailedJobs(owner, repo, runId) {
        await this._apiClient.request('POST', `/repos/${e(owner)}/${e(repo)}/actions/runs/${runId}/rerun-failed-jobs`, 'githubApi.rerunFailedJobs');
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
    async getCheckRunAnnotations(owner, repo, checkRunId) {
        const sections = [];
        let detail;
        // 1. Fetch check run detail for output fields
        try {
            detail = await this._apiClient.request('GET', `/repos/${e(owner)}/${e(repo)}/check-runs/${checkRunId}`, 'githubApi.getCheckRunAnnotations');
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
        }
        catch {
            // Ignore — output may not be available
        }
        // 2. Fetch annotations
        try {
            const annotations = await this._apiClient.request('GET', `/repos/${e(owner)}/${e(repo)}/check-runs/${checkRunId}/annotations`, 'githubApi.getCheckRunAnnotations.annotations');
            if (annotations.length > 0) {
                sections.push(annotations.map(a => `[${a.annotation_level}] ${a.path}:${a.start_line}${a.end_line !== a.start_line ? `-${a.end_line}` : ''} ${a.title ? `(${a.title}) ` : ''}${a.message}`).join('\n'));
            }
        }
        catch {
            // Ignore — annotations may not be available
        }
        if (sections.length > 0) {
            return sections.join('\n\n');
        }
        return 'No output available for this check run.';
    }
}
//#region Helpers
function e(value) {
    return encodeURIComponent(value);
}
function mapCheckRun(data) {
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
function mapCheckStatus(status) {
    switch (status) {
        case 'queued': return "queued" /* GitHubCheckStatus.Queued */;
        case 'in_progress': return "in_progress" /* GitHubCheckStatus.InProgress */;
        case 'completed': return "completed" /* GitHubCheckStatus.Completed */;
        default: return "queued" /* GitHubCheckStatus.Queued */;
    }
}
function mapCheckConclusion(conclusion) {
    switch (conclusion) {
        case 'success': return "success" /* GitHubCheckConclusion.Success */;
        case 'failure': return "failure" /* GitHubCheckConclusion.Failure */;
        case 'neutral': return "neutral" /* GitHubCheckConclusion.Neutral */;
        case 'cancelled': return "cancelled" /* GitHubCheckConclusion.Cancelled */;
        case 'skipped': return "skipped" /* GitHubCheckConclusion.Skipped */;
        case 'timed_out': return "timed_out" /* GitHubCheckConclusion.TimedOut */;
        case 'action_required': return "action_required" /* GitHubCheckConclusion.ActionRequired */;
        case 'stale': return "stale" /* GitHubCheckConclusion.Stale */;
        default: return "neutral" /* GitHubCheckConclusion.Neutral */;
    }
}
/**
 * Compute an overall CI status from a list of check runs.
 */
export function computeOverallCIStatus(checks) {
    if (checks.length === 0) {
        return "neutral" /* GitHubCIOverallStatus.Neutral */;
    }
    let hasFailure = false;
    let hasPending = false;
    for (const check of checks) {
        if (check.status !== "completed" /* GitHubCheckStatus.Completed */) {
            hasPending = true;
            continue;
        }
        if (check.conclusion === "failure" /* GitHubCheckConclusion.Failure */ ||
            check.conclusion === "timed_out" /* GitHubCheckConclusion.TimedOut */ ||
            check.conclusion === "action_required" /* GitHubCheckConclusion.ActionRequired */) {
            hasFailure = true;
        }
    }
    if (hasFailure) {
        return "failure" /* GitHubCIOverallStatus.Failure */;
    }
    if (hasPending) {
        return "pending" /* GitHubCIOverallStatus.Pending */;
    }
    return "success" /* GitHubCIOverallStatus.Success */;
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViUFJDSUZldGNoZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2dpdGh1Yi9icm93c2VyL2ZldGNoZXJzL2dpdGh1YlBSQ0lGZXRjaGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBOENoRyxZQUFZO0FBRVo7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLGlCQUFpQjtJQUU3QixZQUNrQixVQUEyQjtRQUEzQixlQUFVLEdBQVYsVUFBVSxDQUFpQjtJQUN6QyxDQUFDO0lBRUwsS0FBSyxDQUFDLFlBQVksQ0FBQyxLQUFhLEVBQUUsSUFBWSxFQUFFLEdBQVc7UUFDMUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FDekMsS0FBSyxFQUNMLFVBQVUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFDNUQsd0JBQXdCLENBQ3hCLENBQUM7UUFDRixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxlQUFlLENBQUMsS0FBYSxFQUFFLElBQVksRUFBRSxLQUFhO1FBQy9ELE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQzVCLE1BQU0sRUFDTixVQUFVLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQixLQUFLLG9CQUFvQixFQUN2RSwyQkFBMkIsQ0FDM0IsQ0FBQztJQUNILENBQUM7SUFFRDs7Ozs7Ozs7T0FRRztJQUNILEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxLQUFhLEVBQUUsSUFBWSxFQUFFLFVBQWtCO1FBQzNFLE1BQU0s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