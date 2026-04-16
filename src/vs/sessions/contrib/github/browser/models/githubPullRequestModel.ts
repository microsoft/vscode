/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
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
		await this._refresh();
	}

	/**
	 * Post a reply to an existing review thread and refresh threads.
	 */
	async postReviewComment(body: string, inReplyTo: number): Promise<IGitHubPRComment> {
		const comment = await this._fetcher.postReviewComment(this.owner, this.repo, this.prNumber, body, inReplyTo);
		await this._refresh();
		return comment;
	}

	/**
	 * Post a top-level issue comment on the PR.
	 */
	async postIssueComment(body: string): Promise<IGitHubPRComment> {
		const comment = await this._fetcher.postIssueComment(this.owner, this.repo, this.prNumber, body);
		await this._refresh();
		return comment;
	}

	/**
	 * Resolve a review thread and refresh the thread list.
	 */
	async resolveThread(threadId: string): Promise<void> {
		await this._fetcher.resolveThread(this.owner, this.repo, threadId);
		await this._refresh();
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

		// Re-schedule for next poll cycle
		// as RunOnceScheduler is one-shot
		if (!this._disposed) {
			this._pollScheduler.schedule();
		}
	}

	private async _refresh(): Promise<void> {
		try {
			const data = await this._fetcher.getPullRequest(this.owner, this.repo, this.prNumber);

			transaction(tx => {
				this._pullRequest.set(data.pullRequest, tx);
				this._mergeability.set(data.mergeability, tx);
				this._reviewThreads.set(data.reviewThreads, tx);
			});
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} Failed to refresh PR snapshot for #${this.prNumber}:`, err);
		}
	}

	override dispose(): void {
		this._disposed = true;
		super.dispose();
	}
}
