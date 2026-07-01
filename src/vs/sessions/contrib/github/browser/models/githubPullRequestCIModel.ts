/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable, IDisposable, ReferenceCollection, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { GitHubCIOverallStatus, IGitHubCICheck } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';
import { computeOverallCIStatus, GitHubPRCIFetcher } from '../fetchers/githubPRCIFetcher.js';

const LOG_PREFIX = '[GitHubPullRequestCIModel]';
const TRACE_PREFIX = '[PR-ICON-TRACE]';
const DEFAULT_POLL_INTERVAL_MS = 60_000;

/**
 * Persisted map of `${owner}/${repo}/${prNumber}` to the PR head SHA for which
 * the user last requested a CI fix. Used to suppress the "Fix Checks" action
 * until a new commit lands on the PR.
 */
const STORAGE_KEY_FIX_REQUESTED = 'sessions.ci.fixRequested';

export class GitHubPullRequestCIModelReferenceCollection extends ReferenceCollection<GitHubPullRequestCIModel> {
	private readonly _fetcher: GitHubPRCIFetcher;

	constructor(
		apiClient: GitHubApiClient,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._fetcher = new GitHubPRCIFetcher(apiClient);
	}

	protected override createReferencedObject(key: string, owner: string, repo: string, prNumber: number, headSha: string): GitHubPullRequestCIModel {
		this._logService.trace(`${TRACE_PREFIX} [GitHubPullRequestCIModelReferenceCollection][createReferencedObject] Creating CI model for ${key}`);
		return new GitHubPullRequestCIModel(owner, repo, prNumber, headSha, this._fetcher, this._logService, this._storageService);
	}

	protected override destroyReferencedObject(key: string, object: GitHubPullRequestCIModel): void {
		this._logService.trace(`${TRACE_PREFIX} [GitHubPullRequestCIModelReferenceCollection][destroyReferencedObject] Disposing CI model for ${key}`);
		object.dispose();
	}
}

/**
 * Reactive model for CI check status on a pull request head ref.
 * Wraps fetcher data in observables and supports periodic polling.
 */
export class GitHubPullRequestCIModel extends Disposable {

	private _checksEtag: string | undefined = undefined;
	private readonly _checks = observableValue<readonly IGitHubCICheck[]>(this, []);
	readonly checks: IObservable<readonly IGitHubCICheck[]> = this._checks;

	private readonly _overallStatus = observableValue<GitHubCIOverallStatus>(this, GitHubCIOverallStatus.Neutral);
	readonly overallStatus: IObservable<GitHubCIOverallStatus> = this._overallStatus;

	private readonly _fixRequested = observableValue<boolean>(this, false);
	/**
	 * Whether the user has already requested a CI fix for this PR head SHA.
	 * Resets automatically once a new commit lands (a new model is created for
	 * the new head SHA) so the "Fix Checks" action surfaces again.
	 */
	readonly fixRequested: IObservable<boolean> = this._fixRequested;

	private _refreshPromise: Promise<void> | undefined = undefined;

	private _pollingClientCount = 0;
	private readonly _pollScheduler: RunOnceScheduler;

	/** `${owner}/${repo}/${prNumber}` — stable across commits to the same PR. */
	private readonly _prKey: string;

	constructor(
		readonly owner: string,
		readonly repo: string,
		readonly prNumber: number,
		readonly headSha: string,
		private readonly _fetcher: GitHubPRCIFetcher,
		private readonly _logService: ILogService,
		private readonly _storageService: IStorageService,
	) {
		super();

		this._prKey = `${owner}/${repo}/${prNumber}`;
		this._fixRequested.set(this._readFixRequested(), undefined);

		// Keep in sync with other windows/profiles that request a fix.
		this._register(this._storageService.onDidChangeValue(StorageScope.PROFILE, STORAGE_KEY_FIX_REQUESTED, this._store)(() => {
			this._fixRequested.set(this._readFixRequested(), undefined);
		}));

		this._pollScheduler = this._register(new RunOnceScheduler(() => this._poll(), DEFAULT_POLL_INTERVAL_MS));
	}

	/**
	 * Remember that the user requested a CI fix for the current head SHA so the
	 * "Fix Checks" action is suppressed until a new commit lands on the PR.
	 */
	markFixRequested(): void {
		const map = this._readFixRequestedMap();
		map.set(this._prKey, this.headSha);
		this._storageService.store(STORAGE_KEY_FIX_REQUESTED, JSON.stringify(Object.fromEntries(map)), StorageScope.PROFILE, StorageTarget.USER);
		this._fixRequested.set(true, undefined);
	}

	private _readFixRequested(): boolean {
		return this._readFixRequestedMap().get(this._prKey) === this.headSha;
	}

	private _readFixRequestedMap(): Map<string, string> {
		const raw = this._storageService.get(STORAGE_KEY_FIX_REQUESTED, StorageScope.PROFILE);
		if (!raw) {
			return new Map();
		}
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object') {
				return new Map(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
			}
		} catch {
			// Ignore malformed storage
		}
		return new Map();
	}

	/**
	 * Refresh all CI check data.
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
		this._logService.trace(`${TRACE_PREFIX} [CIModel] Refreshing CI for ${this.owner}/${this.repo}#${this.prNumber}@${this.headSha} (checksEtag ${this._checksEtag ?? 'none'})`);
		try {
			const response = await this._fetcher.getCheckRuns(this.owner, this.repo, this.headSha, this._checksEtag);
			if (response.statusCode === 200 && response.data) {
				this._checksEtag = response.etag;
				this._checks.set(response.data, undefined);
				this._overallStatus.set(computeOverallCIStatus(response.data), undefined);
			}
			this._logService.trace(`${TRACE_PREFIX} [CIModel] Refreshed CI for ${this.owner}/${this.repo}#${this.prNumber}@${this.headSha}: status ${response.statusCode}, ${this._checks.get().length} check(s), overallStatus ${this._overallStatus.get()}`);
		} catch (err) {
			this._logService.error(`${TRACE_PREFIX} ${LOG_PREFIX} Failed to refresh CI checks for ${this.owner}/${this.repo}#${this.prNumber}@${this.headSha}:`, err);
		}
	}

	/**
	 * Get annotations (structured logs) for a specific check run.
	 */
	async getCheckRunAnnotations(checkRunId: number): Promise<string> {
		return this._fetcher.getCheckRunAnnotations(this.owner, this.repo, checkRunId);
	}

	/**
	 * Rerun a failed check by extracting the workflow run ID from its details URL
	 * and calling the GitHub Actions rerun-failed-jobs API, then refresh status.
	 */
	async rerunFailedCheck(check: IGitHubCICheck): Promise<void> {
		const runId = parseWorkflowRunId(check.detailsUrl);
		if (!runId) {
			this._logService.warn(`${LOG_PREFIX} Cannot rerun check "${check.name}": no workflow run ID found in detailsUrl`);
			return;
		}
		await this._fetcher.rerunFailedJobs(this.owner, this.repo, runId);
		await this.refresh(true);
	}

	/**
	 * Start periodic polling. Each cycle refreshes CI check data.
	 */
	startPolling(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): IDisposable {
		if (this._pollingClientCount++ === 0) {
			this._logService.trace(`${TRACE_PREFIX} [CIModel] Start polling ${this.owner}/${this.repo}#${this.prNumber}@${this.headSha} every ${intervalMs}ms`);
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
		this._logService.trace(`${TRACE_PREFIX} [CIModel] Poll cycle for ${this.owner}/${this.repo}#${this.prNumber}@${this.headSha}`);
		await this.refresh();
		// Re-schedule if not disposed (RunOnceScheduler is one-shot)
		if (!this._store.isDisposed && this._pollingClientCount > 0) {
			this._pollScheduler.schedule();
		}
	}

	override dispose(): void {
		super.dispose();
	}
}

/**
 * Extract the GitHub Actions workflow run ID from a check run's details URL.
 * URLs follow the pattern: `https://github.com/{owner}/{repo}/actions/runs/{run_id}/job/{job_id}`
 */
export function parseWorkflowRunId(detailsUrl: string | undefined): number | undefined {
	if (!detailsUrl) {
		return undefined;
	}
	const match = /\/actions\/runs\/(?<runId>\d+)/.exec(detailsUrl);
	const runId = match?.groups?.runId;
	return runId ? parseInt(runId, 10) : undefined;
}
