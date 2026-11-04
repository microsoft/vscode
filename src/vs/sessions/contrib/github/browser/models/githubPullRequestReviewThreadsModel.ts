/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, IDisposable, ReferenceCollection, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ApiRequestOptions } from '../../../../../platform/github/common/client/request.js';
import { compareRequestPriority, RequestPriority } from '../../../../../platform/github/common/types.js';
import { IGitHubPRComment, IGitHubPullRequestReviewThread } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';
import { GitHubPRFetcher } from '../fetchers/githubPRFetcher.js';

const LOG_PREFIX = '[GitHubPullRequestReviewThreadsModel]';
const TRACE_PREFIX = '[PR-ICON-TRACE]';
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
		this._logService.trace(`${TRACE_PREFIX} [GitHubPullRequestReviewThreadsModelReferenceCollection][createReferencedObject] Creating PR review threads model for ${key}`);
		return new GitHubPullRequestReviewThreadsModel(owner, repo, prNumber, this._fetcher, this._logService);
	}

	protected override destroyReferencedObject(key: string, object: GitHubPullRequestReviewThreadsModel): void {
		this._logService.trace(`${TRACE_PREFIX} [GitHubPullRequestReviewThreadsModelReferenceCollection][destroyReferencedObject] Disposing PR review threads model for ${key}`);
		object.dispose();
	}
}

/** Review threads with refresh and polling independent of pull request metadata. */
export class GitHubPullRequestReviewThreadsModel extends Disposable {

	private readonly _token = cancelOnDispose(this._store);
	private readonly _reviewThreads = observableValue<readonly IGitHubPullRequestReviewThread[]>(this, []);
	readonly reviewThreads: IObservable<readonly IGitHubPullRequestReviewThread[]> = this._reviewThreads;
	private readonly _hasLoaded = observableValue(this, false);
	readonly hasLoaded: IObservable<boolean> = this._hasLoaded;
	private readonly _initialRefreshCompleted = observableValue(this, false);
	readonly initialRefreshCompleted: IObservable<boolean> = this._initialRefreshCompleted;

	private _refreshPromise: Promise<void> | undefined;
	private _refreshPriority: RequestPriority = 'interactive';
	private _refreshVersion = 0;

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
		this._register(_fetcher.client.onDidChange(() => {
			const shouldRefresh = this._refreshPromise !== undefined || this._hasLoaded.get();
			this._refreshPromise = undefined;
			transaction(tx => {
				this._reviewThreads.set([], tx);
				this._hasLoaded.set(false, tx);
				this._initialRefreshCompleted.set(false, tx);
			});
			if (shouldRefresh) {
				void this.refresh(false, { priority: 'background' });
			}
		}));
	}

	/** Refreshes review threads. */
	refresh(force = false, options?: ApiRequestOptions): Promise<void> {
		if (force && this._refreshPromise) {
			return this.refresh(false, options).then(() => this.refresh(true, options));
		}

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

	private async _refresh(options?: ApiRequestOptions): Promise<void> {
		const generation = this._fetcher.client.generation;
		const version = ++this._refreshVersion;
		this._logService.trace(`${TRACE_PREFIX} [ReviewThreadsModel] Refreshing review threads for ${this.owner}/${this.repo}#${this.prNumber}`);
		try {
			const data = await this._fetcher.getReviewThreads(this.owner, this.repo, this.prNumber, this._token, options);
			if (this._store.isDisposed || generation !== this._fetcher.client.generation || version !== this._refreshVersion) {
				return;
			}
			transaction(tx => {
				this._reviewThreads.set(data, tx);
				this._hasLoaded.set(true, tx);
				this._initialRefreshCompleted.set(true, tx);
			});
			const unresolved = data.filter(thread => !thread.isResolved).length;
			this._logService.trace(`${TRACE_PREFIX} [ReviewThreadsModel] Refreshed review threads for ${this.owner}/${this.repo}#${this.prNumber}: ${data.length} thread(s), ${unresolved} unresolved`);
		} catch (err) {
			if (!this._store.isDisposed && generation === this._fetcher.client.generation && version === this._refreshVersion) {
				this._initialRefreshCompleted.set(true, undefined);
			}
			if (!isCancellationError(err)) {
				this._logService.error(`${TRACE_PREFIX} ${LOG_PREFIX} Failed to refresh threads for PR #${this.prNumber}:`, err);
			}
		}
	}

	/**
	 * Post a reply to an existing review thread and refresh threads.
	 */
	async postReviewComment(body: string, inReplyTo: number): Promise<IGitHubPRComment> {
		const comment = await this._fetcher.postReviewComment(this.owner, this.repo, this.prNumber, body, inReplyTo, this._token);
		await this.refresh(true);
		return comment;
	}

	/**
	 * Resolve a review thread and refresh the thread list.
	 */
	async resolveThread(threadId: string): Promise<void> {
		await this._fetcher.resolveThread(this.owner, this.repo, threadId, this._token);
		await this.refresh(true);
	}

	/**
	 * Start periodic polling. Each cycle refreshes review thread data.
	 */
	startPolling(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): IDisposable {
		if (this._pollingClientCount++ === 0) {
			this._logService.trace(`${TRACE_PREFIX} [ReviewThreadsModel] Start polling ${this.owner}/${this.repo}#${this.prNumber} every ${intervalMs}ms`);
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
		this._logService.trace(`${TRACE_PREFIX} [ReviewThreadsModel] Poll cycle for ${this.owner}/${this.repo}#${this.prNumber}`);
		await this.refresh(false, { priority: 'background' });
		if (!this._store.isDisposed && this._pollingClientCount > 0) {
			this._pollScheduler.schedule();
		}
	}

}
