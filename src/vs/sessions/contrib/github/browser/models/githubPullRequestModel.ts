/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IGitHubPRComment, IGitHubPullRequest, IGitHubPullRequestMergeability, IGitHubPullRequestReview } from '../../common/types.js';
import { computeMergeability, GitHubPRFetcher } from '../fetchers/githubPRFetcher.js';

const LOG_PREFIX = '[GitHubPullRequestModel]';
const DEFAULT_POLL_INTERVAL_MS = 60_000;

/**
 * Reactive model for a GitHub pull request. Wraps fetcher data in
 * observables, supports on-demand refresh, and can poll periodically.
 */
export class GitHubPullRequestModel extends Disposable {

	private _pullRequestEtag: string | undefined = undefined;
	private readonly _pullRequest = observableValue<IGitHubPullRequest | undefined>(this, undefined);
	readonly pullRequest: IObservable<IGitHubPullRequest | undefined> = this._pullRequest;

	private _reviewsEtag: string | undefined = undefined;
	private readonly _reviews = observableValue<readonly IGitHubPullRequestReview[] | undefined>(this, undefined);
	readonly reviews: IObservable<readonly IGitHubPullRequestReview[] | undefined> = this._reviews;

	private readonly _mergeability = observableValue<IGitHubPullRequestMergeability | undefined>(this, undefined);
	readonly mergeability: IObservable<IGitHubPullRequestMergeability | undefined> = this._mergeability;

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
	 * The PR payload is fetched once and used to compute both `pullRequest` and
	 * `mergeability`, avoiding duplicate `GET /pulls/:number` calls per cycle.
	 */
	async refresh(): Promise<void> {
		await this._refreshPullRequestAndMergeability();
	}

	/**
	 * Post a top-level issue comment on the PR.
	 */
	async postIssueComment(body: string): Promise<IGitHubPRComment> {
		return this._fetcher.postIssueComment(this.owner, this.repo, this.prNumber, body);
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

	private async _refreshPullRequestAndMergeability(): Promise<void> {
		try {
			const [pr, reviews] = await Promise.all([
				this._fetcher.getPullRequest(this.owner, this.repo, this.prNumber, this._pullRequestEtag),
				this._fetcher.getReviews(this.owner, this.repo, this.prNumber, this._reviewsEtag),
			]);

			transaction(tx => {
				if (pr.statusCode === 200 && pr.data) {
					this._pullRequestEtag = pr.etag;
					this._pullRequest.set(pr.data, tx);
				}

				if (reviews.statusCode === 200 && reviews.data) {
					this._reviewsEtag = reviews.etag;
					this._reviews.set(reviews.data, tx);
				}

				// Recompute mergeability if either the pull request or reviews changed. Both
				// are needed to compute mergeability, so we wait until both requests complete
				// before updating.
				if (pr.statusCode === 200 || reviews.statusCode === 200) {
					const prData = pr.data ?? this._pullRequest.get();
					const reviewsData = reviews.data ?? this._reviews.get();

					if (prData && reviewsData) {
						const mergeability = computeMergeability(prData, reviewsData);
						this._mergeability.set(mergeability, tx);
					}
				}
			});
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} Failed to refresh PR #${this.prNumber}:`, err);
		}
	}

	override dispose(): void {
		this._disposed = true;
		super.dispose();
	}
}
