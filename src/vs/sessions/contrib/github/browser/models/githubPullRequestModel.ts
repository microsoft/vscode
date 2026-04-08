/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IGitHubPRComment, IGitHubPRReviewThread, IGitHubPullRequest, IGitHubPullRequestMergeability } from '../../common/types.js';
import { GitHubPRFetcher } from '../fetchers/githubPRFetcher.js';

const LOG_PREFIX = '[GitHubPullRequestModel]';
const DEFAULT_POLL_INTERVAL_MS = 60_000;

/**
 * Reactive model for a GitHub pull request. Wraps fetcher data in
 * observables, supports on-demand refresh, and can poll periodically.
 */
export class GitHubPullRequestModel extends Disposable {

	private readonly _pullRequest = observableValue<IGitHubPullRequest | undefined>(this, undefined);
	readonly pullRequest: IObservable<IGitHubPullRequest | undefined> = this._pullRequest;

	private readonly _mergeability = observableValue<IGitHubPullRequestMergeability | undefined>(this, undefined);
	readonly mergeability: IObservable<IGitHubPullRequestMergeability | undefined> = this._mergeability;

	private readonly _reviewThreads = observableValue<readonly IGitHubPRReviewThread[]>(this, []);
	readonly reviewThreads: IObservable<readonly IGitHubPRReviewThread[]> = this._reviewThreads;

	private readonly _pollScheduler: RunOnceScheduler;
	private _disposed = false;

	constructor(
		readonly owner: string,
		readonly repo: string,
		readonly prNumber: number,
		private readonly _fetcher: GitHubPRFetcher,
		private readonly _logService: ILogService,
	) {
		super();

		this._pollScheduler = this._register(new RunOnceScheduler(() => this._poll(), DEFAULT_POLL_INTERVAL_MS));
	}

	/**
	 * Refresh all PR data: pull request info, mergeability, and review threads.
	 */
	async refresh(): Promise<void> {
		await Promise.all([
			this._refreshPullRequest(),
			this._refreshMergeability(),
			this._refreshThreads(),
		]);
	}

	/**
	 * Refresh only the review threads.
	 */
	async refreshThreads(): Promise<void> {
		await this._refreshThreads();
	}

	/**
	 * Post a reply to an existing review thread and refresh threads.
	 */
	async postReviewComment(body: string, inReplyTo: number): Promise<IGitHubPRComment> {
		const comment = await this._fetcher.postReviewComment(this.owner, this.repo, this.prNumber, body, inReplyTo);
		await this._refreshThreads();
		return comment;
	}

	/**
	 * Post a top-level issue comment on the PR.
	 */
	async postIssueComment(body: string): Promise<IGitHubPRComment> {
		return this._fetcher.postIssueComment(this.owner, this.repo, this.prNumber, body);
	}

	/**
	 * Resolve a review thread and refresh the thread list.
	 */
	async resolveThread(threadId: string): Promise<void> {
		await this._fetcher.resolveThread(this.owner, this.repo, threadId);
		await this._refreshThreads();
	}

	/**
	 * Start periodic polling. Each cycle refreshes all PR data.
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
		// Re-schedule for next poll cycle (RunOnceScheduler is one-shot)
		if (!this._disposed) {
			this._pollScheduler.schedule();
		}
	}

	override dispose(): void {
		this._disposed = true;
		super.dispose();
	}

	private async _refreshPullRequest(): Promise<void> {
		try {
			const data = await this._fetcher.getPullRequest(this.owner, this.repo, this.prNumber);
			this._pullRequest.set(data, undefined);
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} Failed to refresh PR #${this.prNumber}:`, err);
		}
	}

	private async _refreshMergeability(): Promise<void> {
		try {
			const data = await this._fetcher.getMergeability(this.owner, this.repo, this.prNumber);
			this._mergeability.set(data, undefined);
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} Failed to refresh mergeability for PR #${this.prNumber}:`, err);
		}
	}

	private async _refreshThreads(): Promise<void> {
		try {
			const data = await this._fetcher.getReviewThreads(this.owner, this.repo, this.prNumber);
			this._reviewThreads.set(data, undefined);
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} Failed to refresh threads for PR #${this.prNumber}:`, err);
		}
	}
}
