/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import { Result } from '../../../../util/common/result';
import { CallTracker, TelemetryCorrelationId } from '../../../../util/common/telemetryCorrelationId';
import { CancelablePromise, DeferredPromise, createCancelablePromise, raceCancellationError, raceTimeout, timeout } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../../util/vs/base/common/errors';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { Disposable, IDisposable } from '../../../../util/vs/base/common/lifecycle';
import { EmbeddingType } from '../../../embeddings/common/embeddingsComputer';
import { AdoRepoId, GithubRepoId, ResolvedRepoRemoteInfo } from '../../../git/common/gitService';
import { measureExecTime } from '../../../log/common/logExecTime';
import { ILogService } from '../../../log/common/logService';
import { IAdoCodeSearchService } from '../../../remoteCodeSearch/common/adoCodeSearchService';
import { IGithubCodeSearchService } from '../../../remoteCodeSearch/common/githubCodeSearchService';
import { CodeSearchResult, RemoteCodeSearchError, RemoteCodeSearchIndexState, RemoteCodeSearchIndexStatus } from '../../../remoteCodeSearch/common/remoteCodeSearch';
import { ITelemetryService } from '../../../telemetry/common/telemetry';
import { WorkspaceChunkSearchOptions } from '../../common/workspaceChunkSearch';
import { RepoInfo } from './repoTracker';

export enum CodeSearchRepoStatus {
	/** We could not resolve this repo */
	NotResolvable = 'NotResolvable',

	Resolving = 'Resolving',

	/** We are checking the status of the remote index. */
	CheckingStatus = 'CheckingStatus',

	/** The remote index is indexable but not built yet */
	NotYetIndexed = 'NotYetIndexed',

	/** The remote index is not indexed and we cannot trigger indexing for it */
	NotIndexable = 'NotIndexable',

	/**
	 * We failed to check the remote index status.
	 *
	 * This has a number of possible causes:
	 *
	 * - The repo doesn't exist
	 * - The user cannot access the repo (most services won't differentiate with it not existing). If we know
	 * 		for sure that the user cannot access the repo, we will instead use {@linkcode NotAuthorized}.
	 * - The status endpoint returned an error.
	 */
	CouldNotCheckIndexStatus = 'CouldNotCheckIndexStatus',

	/**
	 * The user is not authorized to access the remote index.
	 *
	 * This is a special case of {@linkcode CouldNotCheckIndexStatus} that is shown when we know the user is not authorized.
	 */
	NotAuthorized = 'NotAuthorized',

	/** The remote index is being build but is not ready for use  */
	BuildingIndex = 'BuildingIndex',

	/** The remote index is ready and usable */
	Ready = 'Ready'
}
export type BuildIndexTriggerReason = 'auto' | 'manual';

export interface TriggerIndexingError {
	readonly id: string;
	readonly userMessage: string;
}

export namespace TriggerRemoteIndexingError {
	export const noWorkspace: TriggerIndexingError = {
		id: 'no-workspace',
		userMessage: l10n.t("No workspace found")
	};

	export const stillResolving: TriggerIndexingError = {
		id: 'still-resolving',
		userMessage: l10n.t("Still resolving repos. Please try again shortly.")
	};

	export const notIndexable: TriggerIndexingError = {
		id: 'not-indexable',
		userMessage: l10n.t("No indexable repos found and support for indexing non-GitHub repos is not available")
	};

	export const noValidAuthToken: TriggerIndexingError = {
		id: 'no-valid-auth-token',
		userMessage: l10n.t("No valid auth token")
	};

	export const alreadyIndexed: TriggerIndexingError = {
		id: 'already-indexed',
		userMessage: l10n.t("Already indexed")
	};

	export const alreadyIndexing: TriggerIndexingError = {
		id: 'already-indexing',
		userMessage: l10n.t("Already indexing")
	};

	export const couldNotCheckIndexStatus: TriggerIndexingError = {
		id: 'could-not-check-index-status',
		userMessage: l10n.t("Could not check the remote index status for this repo")
	};

	export function errorTriggeringIndexing(repoId: GithubRepoId | AdoRepoId): TriggerIndexingError {
		return {
			id: 'request-to-index-failed',
			userMessage: l10n.t`Request to index '${repoId.toString()}' failed`
		};
	}
}


export type RemoteCodeSearchState =
	{
		readonly status: CodeSearchRepoStatus.BuildingIndex | CodeSearchRepoStatus.CheckingStatus | CodeSearchRepoStatus.CouldNotCheckIndexStatus | CodeSearchRepoStatus.NotAuthorized | CodeSearchRepoStatus.NotIndexable | CodeSearchRepoStatus.NotResolvable | CodeSearchRepoStatus.Resolving | CodeSearchRepoStatus.NotYetIndexed;
	} | {
		readonly status: CodeSearchRepoStatus.Ready;
		readonly indexedCommit: string | undefined;
	};

export interface CodeSearchRepo extends IDisposable {
	readonly onDidChangeStatus: Event<CodeSearchRepoStatus>;
	get status(): CodeSearchRepoStatus;
	get indexedCommit(): string | undefined;

	readonly repoInfo: RepoInfo;
	readonly remoteInfo: ResolvedRepoRemoteInfo | undefined;

	/**
	 * Initializes the repo, fetching any necessary state from remote endpoints.
	 *
	 * This should not force the repo to be indexed.
	 */
	initialize(): Promise<void>;

	/**
	 * Called before performing a search to ensure the repo is ready for searching.
	 */
	prepareSearch(telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<boolean>;

	searchRepo(
		authOptions: { silent: boolean },
		embeddingType: EmbeddingType,
		resolvedQuery: string,
		maxResultCountHint: number,
		options: WorkspaceChunkSearchOptions,
		telemetryInfo: TelemetryCorrelationId,
		token: CancellationToken
	): Promise<CodeSearchResult>;

	triggerRemoteIndexingOfRepo(triggerReason: BuildIndexTriggerReason, telemetryInfo: TelemetryCorrelationId): Promise<Result<true, TriggerIndexingError>>;

	refreshStatusFromEndpoint(force: boolean, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<RemoteCodeSearchState | undefined>;
}

abstract class BaseRemoteCodeSearchRepo extends Disposable implements CodeSearchRepo {

	private readonly _initialPollingDelay = 2000; // ms
	private readonly _maxPollingAttempts = 10;

	private _state: RemoteCodeSearchState;

	public get status(): CodeSearchRepoStatus {
		return this._state.status;
	}

	public get indexedCommit(): string | undefined {
		if (this._state.status === CodeSearchRepoStatus.Ready) {
			return this._state.indexedCommit;
		}
		return undefined;
	}

	private initTask: CancelablePromise<void>;

	private _isDisposed = false;

	private _onDidChangeStatus = this._register(new Emitter<CodeSearchRepoStatus>());
	public readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private _repoIndexPolling?: {
		readonly deferredP: DeferredPromise<void>;
		attemptNumber: number;
	};

	constructor(
		public readonly repoInfo: RepoInfo,
		public readonly remoteInfo: ResolvedRepoRemoteInfo,
		@ILogService protected readonly _logService: ILogService,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService
	) {
		super();

		this._state = {
			status: CodeSearchRepoStatus.CheckingStatus,
		};

		this.initTask = createCancelablePromise<void>(async initToken => {
			try {
				await raceCancellationError(timeout(0), initToken); // Allow constructor to complete
				await raceCancellationError(this.refreshStatusFromEndpoint(false, new TelemetryCorrelationId('CodeSearchRepo::init'), initToken), initToken);
			} catch (e) {
				if (!isCancellationError(e)) {
					this._logService.error(`CodeSearchChunkSearch.openGitRepo(${repoInfo.rootUri}). Failed to initialize repo state from endpoint. ${e}`);
				}
			}
		});
	}

	public override dispose(): void {
		super.dispose();
		this._isDisposed = true;
	}

	public async initialize(): Promise<void> {
		try {
			await this.initTask;
		} catch (error) {
			this._logService.error(`Error during repo initialization: ${error}`);
		}
	}

	protected updateState(newState: RemoteCodeSearchState) {
		if (this._state === newState) {
			return;
		}

		this._state = newState;
		this._onDidChangeStatus.fire(this._state.status);
	}

	public abstract searchRepo(authOptions: { silent: boolean }, embeddingType: EmbeddingType, resolvedQuery: string, maxResultCountHint: number, options: WorkspaceChunkSearchOptions, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<CodeSearchResult>;
	public abstract triggerRemoteIndexingOfRepo(triggerReason: BuildIndexTriggerReason, telemetryInfo: TelemetryCorrelationId): Promise<Result<true, TriggerIndexingError>>;
	public abstract prepareSearch(telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<boolean>;

	public async refreshStatusFromEndpoint(force = false, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<RemoteCodeSearchState | undefined> {
		if (!force && (this.status === CodeSearchRepoStatus.Ready || this.status === CodeSearchRepoStatus.NotAuthorized)) {
			return;
		}

		this._logService.trace(`CodeSearchChunkSearch.updateRepoStateFromEndpoint(${this.repoInfo.rootUri}). Checking status from endpoint.`);

		const newState = await raceCancellationError(this.fetchRemoteIndexState(telemetryInfo, token), token);
		this._logService.trace(`CodeSearchChunkSearch.updateRepoStateFromEndpoint(${this.repoInfo.rootUri}). Updating state to ${newState.status}.`);

		this.updateState(newState);

		if (newState.status === CodeSearchRepoStatus.BuildingIndex) {
			// Trigger polling but don't block
			this.pollForRepoIndexingToComplete().catch(() => { });
		}

		return newState;
	}

	protected async fetchRemoteIndexState(telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<RemoteCodeSearchState> {
		this._logService.trace(`CodeSearchChunkSearch.getRepoIndexStatusFromEndpoint(${this.repoInfo.rootUri}`);

		const statusResult = await this.doFetchRemoteIndexState(telemetryInfo, token);
		if (!statusResult.isOk()) {
			if (statusResult.err.type === 'not-authorized') {
				this._logService.error(`CodeSearchChunkSearch::getIndexedStatus(${this.remoteInfo.repoId}). Failed to fetch indexing status. Unauthorized.`);
				return { status: CodeSearchRepoStatus.NotAuthorized };
			} else {
				this._logService.error(`CodeSearchChunkSearch::getIndexedStatus(${this.remoteInfo.repoId}). Failed to fetch indexing status. Encountered error: ${statusResult.err.error}`);
				return { status: CodeSearchRepoStatus.CouldNotCheckIndexStatus };
			}
		}

		switch (statusResult.val.status) {
			case RemoteCodeSearchIndexStatus.Ready: return { status: CodeSearchRepoStatus.Ready, indexedCommit: statusResult.val.indexedCommit };
			case RemoteCodeSearchIndexStatus.BuildingIndex: return { status: CodeSearchRepoStatus.BuildingIndex };
			case RemoteCodeSearchIndexStatus.NotYetIndexed: return { status: CodeSearchRepoStatus.NotYetIndexed };
			case RemoteCodeSearchIndexStatus.NotIndexable: return { status: CodeSearchRepoStatus.NotResolvable };
		}
	}

	protected abstract doFetchRemoteIndexState(telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<Result<RemoteCodeSearchIndexState, RemoteCodeSearchError>>;

	private pollForRepoIndexingToComplete(): Promise<void> {
		this._logService.trace(`CodeSearchChunkSearch.startPollingForRepoIndexingComplete(${this.repoInfo.rootUri})`);

		const existing = this._repoIndexPolling;
		if (existing) {
			// Use existing polling
			return existing.deferredP.p;
		}

		const deferredP = new DeferredPromise<void>();
		const pollEntry = { deferredP, attemptNumber: 0 };
		this._repoIndexPolling = pollEntry;

		const runPoll = async () => {
			try {
				while (true) {
					if (this._isDisposed) {
						this._logService.trace(`CodeSearchChunkSearch.startPollingForRepoIndexingComplete(${this.repoInfo.rootUri}). Repo no longer tracked.`);
						return;
					}

					if (this.status !== CodeSearchRepoStatus.BuildingIndex) {
						this._logService.trace(`CodeSearchChunkSearch.startPollingForRepoIndexingComplete(${this.repoInfo.rootUri}). Found unexpected repo state: ${this.status}. Stopping polling`);
						return;
					}

					const attemptNumber = pollEntry.attemptNumber++;
					if (attemptNumber >= this._maxPollingAttempts) {
						this._logService.trace(`CodeSearchChunkSearch.startPollingForRepoIndexingComplete(${this.repoInfo.rootUri}). Max attempts reached. Stopping polling.`);
						if (!this._isDisposed) {
							this.updateState({ status: CodeSearchRepoStatus.CouldNotCheckIndexStatus });
						}
						return;
					}

					const delay = this._initialPollingDelay * Math.pow(1.5, attemptNumber);
					await timeout(delay);
					if (this._isDisposed) {
						return;
					}

					this._logService.trace(`CodeSearchChunkSearch.startPollingForRepoIndexingComplete(${this.repoInfo.rootUri}). Checking endpoint for status.`);
					let polledState: RemoteCodeSearchState | undefined;
					try {
						polledState = await this.fetchRemoteIndexState(new TelemetryCorrelationId(new CallTracker('CodeSearchRepo::poll')), CancellationToken.None);
					} catch {
						// noop
					}
					this._logService.trace(`CodeSearchChunkSearch.startPollingForRepoIndexingComplete(${this.repoInfo.rootUri}). Got back new status from endpoint: ${polledState?.status}.`);

					switch (polledState?.status) {
						case CodeSearchRepoStatus.Ready: {
							this._logService.trace(`CodeSearchChunkSearch.startPollingForRepoIndexingComplete(${this.repoInfo.rootUri}). Repo indexed successfully.`);
							if (!this._isDisposed) {
								this.updateState(polledState);
							}
							return;
						}
						case CodeSearchRepoStatus.BuildingIndex: {
							// Continue polling with next backoff delay
							continue;
						}
						default: {
							// We got some other state, so stop polling
							if (!this._isDisposed) {
								this.updateState(polledState ?? { status: CodeSearchRepoStatus.CouldNotCheckIndexStatus });
							}
							return;
						}
					}
				}
			} finally {
				deferredP.complete();
				this._repoIndexPolling = undefined;
			}
		};

		runPoll().catch(() => { });

		return deferredP.p;
	}
}
export class GithubCodeSearchRepo extends BaseRemoteCodeSearchRepo {

	/** Minimum time between index state refreshes when already Ready  */
	private readonly _indexStateRefreshInterval = 30 * 60 * 1000;

	private _lastIndexStateRefreshTime = 0;
	private _hadOutOfSyncResult = false;

	constructor(
		repoInfo: RepoInfo,
		private readonly _githubRepoId: GithubRepoId,
		remoteInfo: ResolvedRepoRemoteInfo,
		@ILogService logService: ILogService,
		@IGithubCodeSearchService private readonly _githubCodeSearchService: IGithubCodeSearchService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(repoInfo, remoteInfo, logService, telemetryService);
	}

	public override async searchRepo(authOptions: { silent: boolean }, embeddingType: EmbeddingType, resolvedQuery: string, maxResultCountHint: number, options: WorkspaceChunkSearchOptions, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<CodeSearchResult> {
		const result = await this._githubCodeSearchService.searchRepo(authOptions, embeddingType, {
			githubRepoId: this._githubRepoId,
			localRepoRoot: this.repoInfo.rootUri,
			indexedCommit: undefined, // TODO
		}, resolvedQuery, maxResultCountHint, options, telemetryInfo, token);
		if (result.outOfSync) {
			this._hadOutOfSyncResult = true;
		}
		return result;
	}

	protected async doFetchRemoteIndexState(telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<Result<RemoteCodeSearchIndexState, RemoteCodeSearchError>> {
		return this._githubCodeSearchService.getRemoteIndexState({
			silent: true,
		}, this._githubRepoId, telemetryInfo, token);
	}

	public async triggerRemoteIndexingOfRepo(triggerReason: BuildIndexTriggerReason, telemetryInfo: TelemetryCorrelationId): Promise<Result<true, TriggerIndexingError>> {
		this._logService.trace(`Triggering indexing for repo: ${this.remoteInfo.repoId} `);

		// Update UI state as soon as possible if triggered by the user
		if (triggerReason === 'manual') {
			this.updateState({ status: CodeSearchRepoStatus.BuildingIndex });
		}

		const triggerSuccess = await this._githubCodeSearchService.triggerIndexing({ silent: true }, triggerReason, this._githubRepoId, telemetryInfo);
		if (!triggerSuccess) {
			this._logService.error(`RepoTracker::TriggerRemoteIndexing(${triggerReason}). Failed to request indexing for '${this.remoteInfo.repoId}'.`);

			this.updateState({ status: CodeSearchRepoStatus.NotYetIndexed });

			return Result.error(TriggerRemoteIndexingError.errorTriggeringIndexing(this.remoteInfo.repoId));
		}

		this.updateState({ status: CodeSearchRepoStatus.BuildingIndex });

		return Result.ok(true);
	}

	public async prepareSearch(telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<boolean> {
		// Amount of time we'll wait for instant indexing to finish before giving up
		const unindexRepoInitTimeout = 8000;

		const startRepoStatus = this.status;

		await measureExecTime(() => raceTimeout((async () => {
			if (this.status === CodeSearchRepoStatus.Ready) {
				const timeSinceLastRefresh = Date.now() - this._lastIndexStateRefreshTime;
				if (timeSinceLastRefresh >= this._indexStateRefreshInterval || this._hadOutOfSyncResult) {
					this._hadOutOfSyncResult = false;
					const newState = await raceCancellationError(this.fetchRemoteIndexState(telemetryInfo, token), token);
					this._lastIndexStateRefreshTime = Date.now();
					this.updateState(newState);
				}
				return;
			}

			// Trigger indexing if we have not already
			if (this.status === CodeSearchRepoStatus.NotYetIndexed) {
				const triggerResult = await raceCancellationError(this.triggerRemoteIndexingOfRepo('auto', telemetryInfo), token);
				if (triggerResult.isError()) {
					throw new Error(`CodeSearchChunkSearch: Triggering indexing of '${this.remoteInfo.repoId}' failed: ${triggerResult.err.id}`);
				}

				// Continue
			}

			if (this.status === CodeSearchRepoStatus.BuildingIndex) {
				// Poll rapidly using endpoint to check if instant indexing has completed
				let attemptsRemaining = 5;
				const delayBetweenAttempts = 1000;

				while (attemptsRemaining-- > 0) {
					const currentStatus = (await raceCancellationError(this.refreshStatusFromEndpoint(false, telemetryInfo, token), token))?.status;
					if (currentStatus === CodeSearchRepoStatus.Ready) {
						// We're good to start searching
						break;
					} else if (currentStatus !== CodeSearchRepoStatus.BuildingIndex) {
						throw new Error(`CodeSearchChunkSearch: Checking instant indexing status of '${this.remoteInfo.repoId}' failed. Found unexpected status: '${currentStatus}'`);
					}

					await raceCancellationError(timeout(delayBetweenAttempts), token);
				}
			}
		})(), unindexRepoInitTimeout), (execTime, status) => {
			const endRepoStatus = this.status;

			/* __GDPR__
				"codeSearchChunkSearch.perf.tryToInstantIndexRepo" : {
					"owner": "mjbvz",
					"comment": "Total time for instant indexing to complete",
					"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
					"startRepoStatus": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Initial status of the repo" },
					"endRepoStatus": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Final status of the repo" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('codeSearchChunkSearch.perf.tryToInstantIndexRepo', {
				status,
				startRepoStatus,
				endRepoStatus,
			}, { execTime });
		});

		return this.status === CodeSearchRepoStatus.Ready;
	}
}

export class AdoCodeSearchRepo extends BaseRemoteCodeSearchRepo {
	constructor(
		repoInfo: RepoInfo,
		private readonly _adoRepoId: AdoRepoId,
		remoteInfo: ResolvedRepoRemoteInfo,
		@ILogService logService: ILogService,
		@IAdoCodeSearchService private readonly _adoCodeSearchService: IAdoCodeSearchService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(repoInfo, remoteInfo, logService, telemetryService);
	}

	public searchRepo(authOptions: { silent: boolean }, _embeddingType: EmbeddingType, resolvedQuery: string, maxResultCountHint: number, options: WorkspaceChunkSearchOptions, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<CodeSearchResult> {
		return this._adoCodeSearchService.searchRepo(authOptions, {
			adoRepoId: this._adoRepoId,
			localRepoRoot: this.repoInfo.rootUri,
			indexedCommit: undefined, // TODO
		}, resolvedQuery, maxResultCountHint, options, telemetryInfo, token);
	}

	public override async prepareSearch(telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<boolean> {
		// Nothing to do in ADO case
		return true;
	}

	public override async triggerRemoteIndexingOfRepo(triggerReason: BuildIndexTriggerReason, telemetryInfo: TelemetryCorrelationId): Promise<Result<true, TriggerIndexingError>> {
		return Result.error(TriggerRemoteIndexingError.notIndexable);
	}

	protected override doFetchRemoteIndexState(_telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<Result<RemoteCodeSearchIndexState, RemoteCodeSearchError>> {
		return this._adoCodeSearchService.getRemoteIndexState({ silent: true }, this._adoRepoId, token);
	}
}
