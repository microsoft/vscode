/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
const LOG_PREFIX = '[GitHubPullRequestModel]';
const DEFAULT_POLL_INTERVAL_MS = 30_000;
/**
 * Reactive model for a GitHub pull request. Wraps fetcher data in
 * observables, supports on-demand refresh, and can poll periodically.
 */
export class GitHubPullRequestModel extends Disposable {
    constructor(owner, repo, prNumber, _fetcher, _logService) {
        super();
        this.owner = owner;
        this.repo = repo;
        this.prNumber = prNumber;
        this._fetcher = _fetcher;
        this._logService = _logService;
        this._pullRequest = observableValue(this, undefined);
        this.pullRequest = this._pullRequest;
        this._mergeability = observableValue(this, undefined);
        this.mergeability = this._mergeability;
        this._reviewThreads = observableValue(this, []);
        this.reviewThreads = this._reviewThreads;
        this._disposed = false;
        this._pollScheduler = this._register(new RunOnceScheduler(() => this._poll(), DEFAULT_POLL_INTERVAL_MS));
    }
    /**
     * Refresh all PR data: pull request info, mergeability, and review threads.
     */
    async refresh() {
        await Promise.all([
            this._refreshPullRequest(),
            this._refreshMergeability(),
            this._refreshThreads(),
        ]);
    }
    /**
     * Refresh only the review threads.
     */
    async refreshThreads() {
        await this._refreshThreads();
    }
    /**
     * Post a reply to an existing review thread and refresh threads.
     */
    async postReviewComment(body, inReplyTo) {
        const comment = await this._fetcher.postReviewComment(this.owner, this.repo, this.prNumber, body, inReplyTo);
        await this._refreshThreads();
        return comment;
    }
    /**
     * Post a top-level issue comment on the PR.
     */
    async postIssueComment(body) {
        return this._fetcher.postIssueComment(this.owner, this.repo, this.prNumber, body);
    }
    /**
     * Resolve a review thread and refresh the thread list.
     */
    async resolveThread(threadId) {
        await this._fetcher.resolveThread(this.owner, this.repo, threadId);
        await this._refreshThreads();
    }
    /**
     * Start periodic polling. Each cycle refreshes all PR data.
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
        // Re-schedule for next poll cycle (RunOnceScheduler is one-shot)
        if (!this._disposed) {
            this._pollScheduler.schedule();
        }
    }
    dispose() {
        this._disposed = true;
        super.dispose();
    }
    async _refreshPullRequest() {
        try {
            const data = await this._fetcher.getPullRequest(this.owner, this.repo, this.prNumber);
            this._pullRequest.set(data, undefined);
        }
        catch (err) {
            this._logService.error(`${LOG_PREFIX} Failed to refresh PR #${this.prNumber}:`, err);
        }
    }
    async _refreshMergeability() {
        try {
            const data = await this._fetcher.getMergeability(this.owner, this.repo, this.prNumber);
            this._mergeability.set(data, undefined);
        }
        catch (err) {
            this._logService.error(`${LOG_PREFIX} Failed to refresh mergeability for PR #${this.prNumber}:`, err);
        }
    }
    async _refreshThreads() {
        try {
            const data = await this._fetcher.getReviewThreads(this.owner, this.repo, this.prNumber);
            this._reviewThreads.set(data, undefined);
        }
        catch (err) {
            this._logService.error(`${LOG_PREFIX} Failed to refresh threads for PR #${this.prNumber}:`, err);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViUHVsbFJlcXVlc3RNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvZ2l0aHViL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlB1bGxSZXF1ZXN0TW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBZSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUt4RixNQUFNLFVBQVUsR0FBRywwQkFBMEIsQ0FBQztBQUM5QyxNQUFNLHdCQUF3QixHQUFHLE1BQU0sQ0FBQztBQUV4Qzs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsVUFBVTtJQWNyRCxZQUNVLEtBQWEsRUFDYixJQUFZLEVBQ1osUUFBZ0IsRUFDUixRQUF5QixFQUN6QixXQUF3QjtRQUV6QyxLQUFLLEVBQUUsQ0FBQztRQU5DLFVBQUssR0FBTCxLQUFLLENBQVE7UUFDYixTQUFJLEdBQUosSUFBSSxDQUFRO1FBQ1osYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUNSLGFBQVEsR0FBUixRQUFRLENBQWlCO1FBQ3pCLGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBakJ6QixpQkFBWSxHQUFHLGVBQWUsQ0FBaUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3hGLGdCQUFXLEdBQWdELElBQUksQ0FBQyxZQUFZLENBQUM7UUFFckUsa0JBQWEsR0FBRyxlQUFlLENBQTZDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNyRyxpQkFBWSxHQUE0RCxJQUFJLENBQUMsYUFBYSxDQUFDO1FBRW5GLG1CQUFjLEdBQUcsZUFBZSxDQUFtQyxJQUFJLEVBQUUsRUFBRSxD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