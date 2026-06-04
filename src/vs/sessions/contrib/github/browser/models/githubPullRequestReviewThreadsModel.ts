/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable, IDisposable, ReferenceCollection, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IGitHubPRComment, IGitHubPullRequestReviewThread } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';
import { GitHubPRFetcher } from '../fetchers/githubPRFetcher.js';

const LOG_PREFIX = '[GitHubPullRequestReviewThreadsModel]';
const DEFAULT_POLL_INTERVAL_MS = 60_000;

export class GitHubPullRequestReviewThreadsModelReferenceCollection extends ReferenceCollection<GitHubPullRequestReviewThreadsModel> {
	private readonly _fetcher: GitHubPRFetcher;

	constructor(
		apiClient: GitHubApiClient,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._fetcher = new GitHubPRFetcher(apiClient);
	}

	protected override createReferencedObject(key: string, owner: string, repo: string, prNumber: number): GitHubPullRequestReviewThreadsModel {
		this._logService.trace(`[GitHubPullRequestReviewThreadsModelReferenceCollection][createReferencedObject] Creating PR review threads model for ${key}`);
		return new GitHubPullRequestReviewThreadsModel(owner, repo, prNumber, this._fetcher, this._logService);
	}

	protected override destroyReferencedObject(key: string, object: GitHubPullRequestReviewThreadsModel): void {
		this._logService.trace(`[GitHubPullRequestReviewThreadsModelReferenceCollection][destroyReferencedObject] Disposing PR review threads model for ${key}`);
		object.dispose();
	}
}

/**
 * Reactive model for GitHub pull request review threads. Review threads are
 * fetched through GraphQL, so they have a separate refresh and polling cadence
 * from lightweight pull request metadata.
 */
export class GitHubPullRequestReviewThreadsModel extends Disposable {

	private readonly _reviewThreads = observableValue<readonly IGitHubPullRequestReviewThread[]>(this, []);
	readonly reviewThreads: IObservable<readonly IGitHubPullRequestReviewThread[]> = this._reviewThreads;

	private _refreshPromise: Promise<void> | undefined = undefined;

	private _pollingClientCount = 0;
	private readonly _pollScheduler: RunOnceScheduler;

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
	 * Refresh review thread data.
	 */
	refresh(force = false): Promise<void> {
		if (force && this._refreshPromise) {
			return this._refreshPromise.then(() => this.refresh(true));
		}

		if (force) {
			return this._refresh();
		}

		if (!this._refreshPromise) {
			this._refreshPromise = this._refresh()
				.finally(() => {
					this._refreshPromise = undefined;
				});
		}

		return this._refreshPromise;
	}

	private async _refresh(): Promise<void> {
		try {
			const data = await this._fetcher.getReviewThreads(this.owner, this.repo, this.prNumber);
			this._reviewThreads.set(data, undefined);
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} Failed to refresh threads for PR #${this.prNumber}:`, err);
		}
	}

	/**
	 * Post a reply to an existing review thread and refresh threads.
	 */
	async postReviewComment(body: string, inReplyTo: number): Promise<IGitHubPRComment> {
		const comment = await this._fetcher.postReviewComment(this.owner, this.repo, this.prNumber, body, inReplyTo);
		await this.refresh(true);
		return comment;
	}

	/**
	 * Resolve a review thread and refresh the thread list.
	 */
	async resolveThread(threadId: string): Promise<void> {
		await this._fetcher.resolveThread(this.owner, this.repo, threadId);
		await this.refresh(true);
	}

	/**
	 * Start periodic polling. Each cycle refreshes review thread data.
	 */
	startPolling(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): IDisposable {
		if (this._pollingClientCount++ === 0) {
			this._pollScheduler.schedule(intervalMs);
		}

		return toDisposable(() => {
			if (this._store.isDisposed) {
				return;
			}

			if (--this._pollingClientCount === 0) {
				this._pollScheduler.cancel();
			}
		});
	}

	private async _poll(): Promise<void> {
		await this.refresh();
		if (!this._store.isDisposed && this._pollingClientCount > 0) {
			this._pollScheduler.schedule();
		}
	}

	override dispose(): void {
		super.dispose();
	}
}
