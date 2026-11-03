/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, ReferenceCollection, toDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ApiRequestOptions } from '../../../../../platform/github/common/client/request.js';
import { PullRequestChecks } from '../../../../../platform/github/common/githubPullRequestService.js';
import { classifyRequiredPullRequestChecks, getRequiredPullRequestChecksStatus, RequiredPullRequestChecks } from '../../../../../platform/github/common/pullRequestRequiredChecks.js';
import { compareRequestPriority, RequestPriority } from '../../../../../platform/github/common/types.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { GitHubCIOverallStatus, IGitHubCICheck } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';
import { GitHubPRCIFetcher } from '../fetchers/githubPRCIFetcher.js';
import { IPullRequestChecksSource, IPullRequestChecksSubscription } from '../fetchers/githubPRChecksSource.js';

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
		private readonly _checksSource: IPullRequestChecksSource,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._fetcher = new GitHubPRCIFetcher(apiClient, this._logService);
	}

	protected override createReferencedObject(key: string, owner: string, repo: string, prNumber: number, headSha: string): GitHubPullRequestCIModel {
		this._logService.trace(`${TRACE_PREFIX} [GitHubPullRequestCIModelReferenceCollection][createReferencedObject] Creating CI model for ${key}`);
		return new GitHubPullRequestCIModel(owner, repo, prNumber, headSha, this._fetcher, this._logService, this._storageService, this._checksSource);
	}

	protected override destroyReferencedObject(key: string, object: GitHubPullRequestCIModel): void {
		this._logService.trace(`${TRACE_PREFIX} [GitHubPullRequestCIModelReferenceCollection][destroyReferencedObject] Disposing CI model for ${key}`);
		object.dispose();
	}
}

/** CI status for a pull request head with coalesced refresh and periodic polling. */
export class GitHubPullRequestCIModel extends Disposable {

	private readonly _token = cancelOnDispose(this._store);
	private readonly _checks = observableValue<readonly IGitHubCICheck[]>(this, []);
	/** Every check run reported for the head, whether it counts or not. */
	readonly checks: IObservable<readonly IGitHubCICheck[]> = this._checks;

	private readonly _requiredChecksSubscription = this._register(new MutableDisposable<DisposableStore>());
	private _requiredChecksHandle: IPullRequestChecksSubscription | undefined;
	private readonly _pullRequestChecks = observableValue<IObservable<PullRequestChecks | undefined> | undefined>(this, undefined);

	/** The checks of this head as the shared pull request resources read them, or `undefined` while they load. */
	private readonly _headChecks = derived(this, reader => {
		const checks = this._pullRequestChecks.read(reader)?.read(reader);
		return checks?.headSha === this.headSha ? checks : undefined;
	});

	/**
	 * Which checks of the head count, and how they stand, decided as on every
	 * other pull request surface (see {@link classifyRequiredPullRequestChecks}).
	 * Its failed checks are the ones Fix Checks repairs. `undefined` while they
	 * load.
	 */
	readonly requiredChecks: IObservable<RequiredPullRequestChecks | undefined> = derived(this, reader => {
		const checks = this._headChecks.read(reader);
		return checks ? classifyRequiredPullRequestChecks(checks) : undefined;
	});

	/** The state of the checks that count (see {@link getRequiredPullRequestChecksStatus}), or loading. */
	readonly overallStatus: IObservable<GitHubCIOverallStatus> = derived(this, reader => {
		const checks = this._headChecks.read(reader);
		if (!checks) {
			return GitHubCIOverallStatus.Loading;
		}
		switch (getRequiredPullRequestChecksStatus(checks)) {
			case 'failure': return GitHubCIOverallStatus.Failure;
			case 'pending': return GitHubCIOverallStatus.Pending;
			case 'success': return GitHubCIOverallStatus.Success;
			case undefined: return GitHubCIOverallStatus.Neutral;
		}
	});

	private readonly _fixRequested = observableValue<boolean>(this, false);
	/**
	 * Whether the user has already requested a CI fix for this PR head SHA.
	 * Resets automatically once a new commit lands (a new model is created for
	 * the new head SHA) so the "Fix Checks" action surfaces again.
	 */
	readonly fixRequested: IObservable<boolean> = this._fixRequested;

	private _refreshPromise: Promise<void> | undefined;
	private _refreshPriority: RequestPriority = 'interactive';
	private _refreshVersion = 0;

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
		private readonly _checksSource: IPullRequestChecksSource,
	) {
		super();

		this._prKey = `${owner}/${repo}/${prNumber}`;
		this._fixRequested.set(this._readFixRequested(), undefined);

		// Keep in sync with other windows/profiles that request a fix.
		this._register(this._storageService.onDidChangeValue(StorageScope.PROFILE, STORAGE_KEY_FIX_REQUESTED, this._store)(() => {
			this._fixRequested.set(this._readFixRequested(), undefined);
		}));

		this._pollScheduler = this._register(new RunOnceScheduler(() => this._poll(), DEFAULT_POLL_INTERVAL_MS));
		this._register(_fetcher.client.onDidChange(() => {
			const shouldRefresh = this._refreshPromise !== undefined || this._checks.get().length > 0;
			this._refreshPromise = undefined;
			this._checks.set([], undefined);
			if (this._requiredChecksSubscription.value) {
				this._subscribeRequiredChecks();
			}
			if (shouldRefresh) {
				void this.refresh(false, { priority: 'background' });
			}
		}));
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

	/** Refreshes CI checks. */
	refresh(force = false, options?: ApiRequestOptions): Promise<void> {
		if (!this._requiredChecksSubscription.value) {
			this._subscribeRequiredChecks();
		} else if (force) {
			void this._requiredChecksHandle?.refresh(true, this._token).catch(error => this._logRequiredChecksError(error));
		}
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
		this._logService.trace(`${TRACE_PREFIX} [CIModel] Refreshing CI for ${this.owner}/${this.repo}#${this.prNumber}@${this.headSha}`);
		try {
			const checks = await this._fetcher.getCheckRuns(this.owner, this.repo, this.headSha, this._token, options);
			if (this._store.isDisposed || generation !== this._fetcher.client.generation || version !== this._refreshVersion) {
				return;
			}
			const previous = this._checks.get();
			if (!structuralEquals(checks, previous)) {
				this._checks.set(checks, undefined);
				// A rerun or a newly reported check can change which checks count, which the shared resources might only poll for later.
				if (previous.length > 0) {
					void this._requiredChecksHandle?.refresh(false, this._token).catch(error => this._logRequiredChecksError(error));
				}
			}
			this._logService.trace(`${TRACE_PREFIX} [CIModel] Refreshed CI for ${this.owner}/${this.repo}#${this.prNumber}@${this.headSha}: ${checks.length} check(s), overallStatus ${this.overallStatus.get()}`);
		} catch (err) {
			if (!isCancellationError(err)) {
				this._logService.error(`${TRACE_PREFIX} ${LOG_PREFIX} Failed to refresh CI checks for ${this.owner}/${this.repo}#${this.prNumber}@${this.headSha}:`, err);
			}
		}
	}

	/**
	 * Get annotations (structured logs) for a specific check run.
	 */
	async getCheckRunAnnotations(checkRunId: number): Promise<string> {
		return this._fetcher.getCheckRunAnnotations(this.owner, this.repo, checkRunId, this._token);
	}

	/**
	 * Follows which checks count, from the shared pull request resources, which
	 * keep them current on their own. Until they are read, the checks' state is
	 * loading.
	 */
	private _subscribeRequiredChecks(): void {
		const store = new DisposableStore();
		this._requiredChecksSubscription.value = store;
		this._requiredChecksHandle = undefined;
		this._pullRequestChecks.set(undefined, undefined);
		const controller = new AbortController();
		store.add(toDisposable(() => controller.abort()));
		this._checksSource.subscribe(this.owner, this.repo, this.prNumber, this.headSha, controller.signal).then(subscription => {
			if (controller.signal.aborted) {
				subscription.dispose();
				return;
			}
			store.add(subscription);
			store.add(toDisposable(() => {
				if (this._requiredChecksHandle === subscription) {
					this._requiredChecksHandle = undefined;
					this._pullRequestChecks.set(undefined, undefined);
				}
			}));
			this._requiredChecksHandle = subscription;
			this._pullRequestChecks.set(subscription.checks, undefined);
			void subscription.refresh(false, this._token).catch(error => this._logRequiredChecksError(error));
		}, error => {
			if (controller.signal.aborted) {
				return;
			}
			this._logRequiredChecksError(error);
			// Lets the next refresh subscribe again.
			this._requiredChecksSubscription.clear();
		});
	}

	private _logRequiredChecksError(error: unknown): void {
		if (!isCancellationError(error)) {
			this._logService.warn(`${LOG_PREFIX} Cannot read which checks count for ${this.owner}/${this.repo}#${this.prNumber}, so their state stays loading until they are read:`, error);
		}
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
		await this._fetcher.rerunFailedJobs(this.owner, this.repo, runId, this._token);
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
		await this.refresh(false, { priority: 'background' });
		// Re-schedule if not disposed (RunOnceScheduler is one-shot)
		if (!this._store.isDisposed && this._pollingClientCount > 0) {
			this._pollScheduler.schedule();
		}
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
