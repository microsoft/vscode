/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable, DisposableSet, IDisposable, ReferenceCollection, toDisposable } from '../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IGitHubIssue } from '../../common/types.js';
import { GitHubIssueFetcher } from '../fetchers/githubIssueFetcher.js';
import { GitHubApiClient } from '../githubApiClient.js';

const LOG_PREFIX = '[GitHubIssueModel]';

/**
 * How long a model waits before it revalidates on demand. Issues move far more slowly
 * than pull requests, so repeated {@link GitHubIssueModel.refresh} calls — several
 * session views showing the same issue, a header re-created on a session switch —
 * collapse into a single request instead of producing one each.
 */
export const MIN_REFRESH_INTERVAL_MS = 60_000;

/** How often an issue is revalidated while something keeps its model warm. */
const DEFAULT_POLL_INTERVAL_MS = 900_000;

/** How many disposed issues keep their revalidation state. */
const MAX_CACHED_SNAPSHOTS = 100;

/**
 * The revalidation state of a disposed issue model: the last payload and the ETag that
 * produced it. Restoring it into a freshly created model lets that model render the
 * last-known state right away and revalidate with `If-None-Match`, which GitHub answers
 * with a `304 Not Modified` that does not count against the API rate limit.
 */
interface IGitHubIssueSnapshot {
	readonly etag: string | undefined;
	readonly issue: IGitHubIssue | undefined;
	readonly refreshedAt: number;
}

export class GitHubIssueModelReferenceCollection extends ReferenceCollection<GitHubIssueModel> {
	private readonly _fetcher: GitHubIssueFetcher;

	/**
	 * Revalidation state of issues whose model has been disposed, keyed like the
	 * collection itself. Session switches and list re-renders release the last reference
	 * to an issue model routinely; without this the next model would start cold and spend
	 * a full, rate-limited request re-fetching a payload that almost never changed.
	 */
	private readonly _snapshots = new LRUCache<string, IGitHubIssueSnapshot>(MAX_CACHED_SNAPSHOTS);

	constructor(
		apiClient: GitHubApiClient,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._fetcher = new GitHubIssueFetcher(apiClient);
	}

	protected override createReferencedObject(key: string, owner: string, repo: string, issueNumber: number): GitHubIssueModel {
		const model = new GitHubIssueModel(owner, repo, issueNumber, this._fetcher, this._logService);
		const snapshot = this._snapshots.get(key);
		if (snapshot) {
			model.restore(snapshot);
		}
		return model;
	}

	protected override destroyReferencedObject(key: string, object: GitHubIssueModel): void {
		const snapshot = object.snapshot();
		if (snapshot) {
			this._snapshots.set(key, snapshot);
		}
		object.dispose();
	}
}

/**
 * Reactive model for a GitHub issue. Wraps fetcher data in an observable, supports
 * on-demand refresh, and can poll periodically.
 *
 * Every request after the first is conditional on the last ETag, so an unchanged issue
 * costs a `304` that GitHub does not charge against the rate limit. On-demand refreshes
 * are additionally debounced by {@link MIN_REFRESH_INTERVAL_MS} so redundant callers do
 * not each produce a request.
 */
export class GitHubIssueModel extends Disposable {

	private _etag: string | undefined = undefined;
	private readonly _issue = observableValue<IGitHubIssue | undefined>(this, undefined);
	readonly issue: IObservable<IGitHubIssue | undefined> = this._issue;

	private _refreshPromise: Promise<void> | undefined = undefined;
	/** When the last request completed (whether it returned `200` or `304`). */
	private _refreshedAt: number | undefined = undefined;

	private readonly _pollScheduler: RunOnceScheduler;
	private readonly _pollingDisposables = this._register(new DisposableSet());

	constructor(
		readonly owner: string,
		readonly repo: string,
		readonly issueNumber: number,
		private readonly _fetcher: GitHubIssueFetcher,
		private readonly _logService: ILogService,
	) {
		super();

		this._pollScheduler = this._register(new RunOnceScheduler(() => this._poll(), DEFAULT_POLL_INTERVAL_MS));
	}

	/** Adopts the revalidation state of an earlier model for the same issue. */
	restore(snapshot: IGitHubIssueSnapshot): void {
		this._etag = snapshot.etag;
		this._refreshedAt = snapshot.refreshedAt;
		if (snapshot.issue) {
			this._issue.set(snapshot.issue, undefined);
		}
	}

	/** The revalidation state to hand to the next model for this issue, if any. */
	snapshot(): IGitHubIssueSnapshot | undefined {
		return this._refreshedAt !== undefined
			? { etag: this._etag, issue: this._issue.get(), refreshedAt: this._refreshedAt }
			: undefined;
	}

	/**
	 * Revalidates the issue, unless the last request completed less than
	 * {@link MIN_REFRESH_INTERVAL_MS} ago.
	 */
	refresh(): Promise<void> {
		if (this._refreshedAt !== undefined && Date.now() - this._refreshedAt < MIN_REFRESH_INTERVAL_MS) {
			return Promise.resolve();
		}

		return this._refreshNow();
	}

	startPolling(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): IDisposable {
		const disposable = toDisposable(() => {
			this._pollingDisposables.deleteAndDispose(disposable);

			if (this._pollingDisposables.size === 0) {
				this._pollScheduler.cancel();
			}
		});
		this._pollingDisposables.add(disposable);

		if (this._pollingDisposables.size === 1) {
			this._pollScheduler.schedule(intervalMs);
		}

		return disposable;
	}

	private _refreshNow(): Promise<void> {
		if (!this._refreshPromise) {
			this._refreshPromise = this._refresh()
				.finally(() => {
					this._refreshPromise = undefined;
				});
		}

		return this._refreshPromise;
	}

	private async _poll(): Promise<void> {
		// Poll ticks always revalidate; the on-demand debounce would otherwise
		// swallow a tick that lands inside the debounce window.
		await this._refreshNow();
		// Re-schedule for the next poll cycle (RunOnceScheduler is one-shot).
		if (!this._store.isDisposed && this._pollingDisposables.size > 0) {
			this._pollScheduler.schedule();
		}
	}

	private async _refresh(): Promise<void> {
		try {
			const response = await this._fetcher.getIssue(this.owner, this.repo, this.issueNumber, this._etag);
			this._refreshedAt = Date.now();
			if (response.statusCode === 200 && response.data) {
				this._etag = response.etag;
				this._issue.set(response.data, undefined);
			}
		} catch (err) {
			// Leave `_refreshedAt` untouched so the next caller retries instead of being
			// debounced against a request that never produced data.
			this._logService.error(`${LOG_PREFIX} Failed to refresh issue ${this.owner}/${this.repo}#${this.issueNumber}:`, err);
		}
	}
}
