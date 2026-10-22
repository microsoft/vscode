/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableSet, IDisposable, ReferenceCollection, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ApiRequestOptions } from '../../../../../platform/github/common/client/request.js';
import { compareRequestPriority, RequestPriority } from '../../../../../platform/github/common/types.js';
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

/** Pull request metadata and mergeability with coalesced refresh and periodic polling. */
export class GitHubPullRequestModel extends Disposable {

	private readonly _token = cancelOnDispose(this._store);
	private readonly _pullRequest = observableValue<IGitHubPullRequest | undefined>(this, undefined);
	readonly pullRequest: IObservable<IGitHubPullRequest | undefined> = this._pullRequest;

	private readonly _reviews = observableValue<readonly IGitHubPullRequestReview[] | undefined>(this, undefined);
	readonly reviews: IObservable<readonly IGitHubPullRequestReview[] | undefined> = this._reviews;

	private readonly _mergeability = observableValue<IGitHubPullRequestMergeability | undefined>(this, undefined);
	readonly mergeability: IObservable<IGitHubPullRequestMergeability | undefined> = this._mergeability;

	private _refreshPromise: Promise<void> | undefined;
	private _refreshPriority: RequestPriority = 'interactive';
	private _refreshVersion = 0;

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
		this._register(_fetcher.client.onDidChange(() => {
			const shouldRefresh = this._refreshPromise !== undefined || this._pullRequest.get() !== undefined;
			this._refreshPromise = undefined;
			transaction(tx => {
				this._pullRequest.set(undefined, tx);
				this._reviews.set(undefined, tx);
				this._mergeability.set(undefined, tx);
			});
			if (shouldRefresh) {
				void this.refresh({ priority: 'background' });
			}
		}));
	}

	/** Refreshes pull request metadata, reviews, and mergeability. */
	refresh(options?: ApiRequestOptions): Promise<void> {
		const priority = options?.priority ?? 'interactive';
		if (!this._refreshPromise || compareRequestPriority(priority, this._refreshPriority) < 0) {
			this._refreshPriority = priority;
			const pending = this._refresh(options).finally(() => {
				if (this._refreshPromise === pending) {
					this._refreshPromise = undefined;
				}
			});
			this._refreshPromise = pending;
		}
		return this._refreshPromise;
	}

	/**
	 * Post a top-level issue comment on the PR.
	 */
	async postIssueComment(body: string): Promise<IGitHubPRComment> {
		return this._fetcher.postIssueComment(this.owner, this.repo, this.prNumber, body, this._token);
	}

	/**
	 * Post a review comment on a line in the pull request head.
	 */
	async postReviewComment(body: string, commitId: string, path: string, line: number, startLine: number | undefined, pendingReview?: Pick<IGitHubPullRequestReview, 'id' | 'nodeId'>): Promise<void> {
		await this._fetcher.postPullRequestReviewComment(this.owner, this.repo, this.prNumber, body, commitId, path, line, startLine, pendingReview, this._token);
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
		await this.refresh({ priority: 'background' });
		// Re-schedule for next poll cycle (RunOnceScheduler is one-shot)
		if (!this._store.isDisposed && this._pollingDisposables.size > 0) {
			this._pollScheduler.schedule();
		}
	}

	private async _refresh(options?: ApiRequestOptions): Promise<void> {
		const generation = this._fetcher.client.generation;
		const version = ++this._refreshVersion;
		this._logService.trace(`${TRACE_PREFIX} [PRModel] Refreshing ${this.owner}/${this.repo}#${this.prNumber}`);
		try {
			const [pr, reviews] = await Promise.all([
				this._fetcher.getPullRequest(this.owner, this.repo, this.prNumber, this._token, options),
				this._fetcher.getReviews(this.owner, this.repo, this.prNumber, this._token, options),
			]);
			if (this._store.isDisposed || generation !== this._fetcher.client.generation || version !== this._refreshVersion) {
				return;
			}

			transaction(tx => {
				const prChanged = !structuralEquals(pr, this._pullRequest.get());
				const reviewsChanged = !structuralEquals(reviews, this._reviews.get());
				if (prChanged) {
					this._pullRequest.set(pr, tx);
				}
				if (reviewsChanged) {
					this._reviews.set(reviews, tx);
				}
				if (prChanged || reviewsChanged) {
					this._mergeability.set(computeMergeability(pr, reviews), tx);
				}
			});

			const current = this._pullRequest.get();
			this._logService.trace(`${TRACE_PREFIX} [PRModel] Refreshed ${this.owner}/${this.repo}#${this.prNumber}: state ${current?.state ?? 'unknown'}, isDraft ${current?.isDraft ?? 'unknown'}, headSha ${current?.headSha ?? 'unknown'}`);
		} catch (err) {
			if (!isCancellationError(err)) {
				this._logService.error(`${TRACE_PREFIX} ${LOG_PREFIX} Failed to refresh PR #${this.prNumber}:`, err);
			}
		}
	}

}
