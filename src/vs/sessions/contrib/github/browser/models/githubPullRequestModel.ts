/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable, DisposableSet, IDisposable, ReferenceCollection, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IGitHubPRComment, IGitHubPullRequest, IGitHubPullRequestMergeability, IGitHubPullRequestReview } from '../../common/types.js';
import { computeMergeability, GitHubPRFetcher } from '../fetchers/githubPRFetcher.js';
import { GitHubApiClient } from '../githubApiClient.js';

const LOG_PREFIX = '[GitHubPullRequestModel]';
const TRACE_PREFIX = '[PR-ICON-TRACE]';
const DEFAULT_POLL_INTERVAL_MS = 60_000;

export class GitHubPullRequestModelReferenceCollection extends ReferenceCollection<GitHubPullRequestModel> {
	private readonly _fetcher: GitHubPRFetcher;

	constructor(
		apiClient: GitHubApiClient,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._fetcher = new GitHubPRFetcher(apiClient);
	}

	protected override createReferencedObject(key: string, owner: string, repo: string, prNumber: number): GitHubPullRequestModel {
		this._logService.trace(`${TRACE_PREFIX} [GitHubPullRequestModelReferenceCollection][createReferencedObject] Creating PR model for ${key}`);
		return new GitHubPullRequestModel(owner, repo, prNumber, this._fetcher, this._logService);
	}

	protected override destroyReferencedObject(key: string, object: GitHubPullRequestModel): void {
		this._logService.trace(`${TRACE_PREFIX} [GitHubPullRequestModelReferenceCollection][destroyReferencedObject] Disposing PR model for ${key}`);
		object.dispose();
	}
}

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

	private _refreshPromise: Promise<void> | undefined = undefined;

	private readonly _pollScheduler: RunOnceScheduler;
	private readonly _pollingDisposables = this._register(new DisposableSet());

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
	 * Refresh all PR data: pull request info, and mergeability.
	 */
	refresh(): Promise<void> {
		if (!this._refreshPromise) {
			this._refreshPromise = this._refresh()
				.finally(() => {
					this._refreshPromise = undefined;
				});
		}

		return this._refreshPromise;
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
	startPolling(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): IDisposable {
		const disposable = toDisposable(() => {
			this._pollingDisposables.deleteAndDispose(disposable);

			if (this._pollingDisposables.size === 0) {
				this._pollScheduler.cancel();
			}
		});
		this._pollingDisposables.add(disposable);

		if (this._pollingDisposables.size === 1) {
			this._logService.trace(`${TRACE_PREFIX} [PRModel] Start polling ${this.owner}/${this.repo}#${this.prNumber} every ${intervalMs}ms`);
			this._pollScheduler.schedule(intervalMs);
		}

		return disposable;
	}

	private async _poll(): Promise<void> {
		this._logService.trace(`${TRACE_PREFIX} [PRModel] Poll cycle for ${this.owner}/${this.repo}#${this.prNumber}`);
		await this.refresh();
		// Re-schedule for next poll cycle (RunOnceScheduler is one-shot)
		if (!this._store.isDisposed && this._pollingDisposables.size > 0) {
			this._pollScheduler.schedule();
		}
	}

	private async _refresh(): Promise<void> {
		this._logService.trace(`${TRACE_PREFIX} [PRModel] Refreshing ${this.owner}/${this.repo}#${this.prNumber} (prEtag ${this._pullRequestEtag ?? 'none'}, reviewsEtag ${this._reviewsEtag ?? 'none'})`);
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

			const current = this._pullRequest.get();
			this._logService.trace(`${TRACE_PREFIX} [PRModel] Refreshed ${this.owner}/${this.repo}#${this.prNumber}: prStatus ${pr.statusCode}, reviewsStatus ${reviews.statusCode}, state ${current?.state ?? 'unknown'}, isDraft ${current?.isDraft ?? 'unknown'}, headSha ${current?.headSha ?? 'unknown'}`);
		} catch (err) {
			this._logService.error(`${TRACE_PREFIX} ${LOG_PREFIX} Failed to refresh PR #${this.prNumber}:`, err);
		}
	}

	override dispose(): void {
		super.dispose();
	}
}
