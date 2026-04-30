/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IGitHubPRComment, IGitHubPullRequestReviewThread } from '../../common/types.js';
import { GitHubPRFetcher } from '../fetchers/githubPRFetcher.js';

const LOG_PREFIX = '[GitHubPullRequestReviewThreadsModel]';
const DEFAULT_POLL_INTERVAL_MS = 60_000;

/**
 * Reactive model for GitHub pull request review threads. Review threads are
 * fetched through GraphQL, so they have a separate refresh and polling cadence
 * from lightweight pull request metadata.
 */
export class GitHubPullRequestReviewThreadsModel extends Disposable {

	private readonly _reviewThreads = observableValue<readonly IGitHubPullRequestReviewThread[]>(this, []);
	readonly reviewThreads: IObservable<readonly IGitHubPullRequestReviewThread[]> = this._reviewThreads;

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
	 * Refresh review thread data.
	 */
	async refresh(): Promise<void> {
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
		await this.refresh();
		return comment;
	}

	/**
	 * Resolve a review thread and refresh the thread list.
	 */
	async resolveThread(threadId: string): Promise<void> {
		await this._fetcher.resolveThread(this.owner, this.repo, threadId);
		await this.refresh();
	}

	/**
	 * Start periodic polling. Each cycle refreshes review thread data.
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
		if (!this._disposed) {
			this._pollScheduler.schedule();
		}
	}

	override dispose(): void {
		this._disposed = true;
		super.dispose();
	}
}
