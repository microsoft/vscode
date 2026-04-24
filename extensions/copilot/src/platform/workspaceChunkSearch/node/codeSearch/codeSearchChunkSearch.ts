/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { shouldInclude } from '../../../../util/common/glob';
import { Result } from '../../../../util/common/result';
import { TelemetryCorrelationId } from '../../../../util/common/telemetryCorrelationId';
import { coalesce } from '../../../../util/vs/base/common/arrays';
import { raceCancellationError, raceTimeout } from '../../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../../util/vs/base/common/errors';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { Iterable } from '../../../../util/vs/base/common/iterator';
import { Lazy } from '../../../../util/vs/base/common/lazy';
import { Disposable, DisposableStore, IDisposable } from '../../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../../util/vs/base/common/map';
import { isEqual, isEqualOrParent } from '../../../../util/vs/base/common/resources';
import { StopWatch } from '../../../../util/vs/base/common/stopwatch';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseWarningPart } from '../../../../vscodeTypes';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { IAuthenticationChatUpgradeService } from '../../../authentication/common/authenticationUpgrade';
import { FileChunkAndScore } from '../../../chunking/common/chunk';
import { ComputeBatchInfo } from '../../../chunking/common/chunkingEndpointClient';
import { ConfigKey, IConfigurationService } from '../../../configuration/common/configurationService';
import { EmbeddingType } from '../../../embeddings/common/embeddingsComputer';
import { RelativePattern } from '../../../filesystem/common/fileTypes';
import { IGitService, ResolvedRepoRemoteInfo } from '../../../git/common/gitService';
import { Change } from '../../../git/vscode/git';
import { logExecTime, LogExecTime } from '../../../log/common/logExecTime';
import { ILogService } from '../../../log/common/logService';
import { IAdoCodeSearchService } from '../../../remoteCodeSearch/common/adoCodeSearchService';
import { SemanticCodeSearchResult } from '../../../remoteCodeSearch/common/remoteCodeSearch';
import { ICodeSearchAuthenticationService } from '../../../remoteCodeSearch/node/codeSearchRepoAuth';
import { isGitHubRemoteRepository } from '../../../remoteRepositories/common/utils';
import { IExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../telemetry/common/telemetry';
import { IWorkspaceService } from '../../../workspace/common/workspaceService';
import { StrategySearchResult, StrategySearchSizing, WorkspaceChunkQueryWithEmbeddings, WorkspaceChunkSearchOptions } from '../../common/workspaceChunkSearch';
import { EmbeddingsChunkSearch } from '../embeddingsChunkSearch';

import { WorkspaceChunkEmbeddingsIndex } from '../workspaceChunkEmbeddingsIndex';
import { IWorkspaceFileIndex } from '../workspaceFileIndex';
import { AdoCodeSearchRepo, BuildIndexTriggerReason, CodeSearchRepo, CodeSearchRepoStatus, GithubCodeSearchRepo, TriggerIndexingError, TriggerRemoteIndexingError } from './codeSearchRepo';
import { ExternalIngestClient } from './externalIngestClient';
import { ExternalIngestIndex, ExternalIngestStatus } from './externalIngestIndex';
import { CodeSearchRepoTracker, RepoInfo, TrackedRepoStatus } from './repoTracker';
import { CodeSearchDiff, CodeSearchWorkspaceDiffTracker } from './workspaceDiff';

export interface RepoEntry {
	readonly info: RepoInfo;
	readonly remoteInfo: ResolvedRepoRemoteInfo | undefined;
	readonly status: CodeSearchRepoStatus;
}

export interface CodeSearchRemoteIndexState {
	readonly status: 'disabled' | 'initializing' | 'loaded';

	readonly repos: ReadonlyArray<RepoEntry>;

	/**
	 * Status of external ingest indexing for files not covered by code search.
	 */
	readonly externalIngestState?: ExternalIngestStatus;
}

type DiffSearchResult = StrategySearchResult & {
	readonly strategyId: string;
	readonly embeddingsComputeInfo?: ComputeBatchInfo;
};

interface AvailableSuccessMetadata {
	readonly indexedRepos: readonly CodeSearchRepo[];
	readonly notYetIndexedRepos: readonly CodeSearchRepo[];
	readonly repoStatuses: Record<string, number>;
}

interface AvailableFailureMetadata {
	readonly unavailableReason: string;
	readonly repoStatuses: Record<string, number>;
}

/**
 * ChunkSearch strategy that first calls the Github code search API to get a context window of files that are similar to the query.
 * Then it uses the embeddings index to find the most similar chunks in the context window.
 */
export class CodeSearchChunkSearch extends Disposable {

	/**
	 * Maximum number of files that have changed from what code search has indexed.
	 * This is used to avoid doing code search when the diff is too large.
	 */
	private readonly maxDiffSize = 2000;

	/**
	 * Maximum percent of files that have changed from what code search has indexed.
	 * If a majority of files have been changed there's no point to doing a code search.
	 */
	private readonly maxDiffPercentage = 0.70;

	/**
	 * How long we should wait on the local diff before giving up.
	 */
	private readonly localDiffSearchTimeout = 15_000;

	private readonly _workspaceDiffTracker: Lazy<CodeSearchWorkspaceDiffTracker>;

	private readonly _embeddingsChunkSearch: EmbeddingsChunkSearch;

	private readonly _onDidChangeIndexState = this._register(new Emitter<void>());
	public readonly onDidChangeIndexState = this._onDidChangeIndexState.event;

	private _isDisposed = false;

	private readonly _codeSearchRepos = new ResourceMap<{ readonly repo: CodeSearchRepo; readonly disposables: IDisposable }>();

	private readonly _onDidFinishInitialization = this._register(new Emitter<void>());
	private readonly onDidFinishInitialization = this._onDidFinishInitialization.event;

	private readonly _onDidAddOrUpdateCodeSearchRepo = this._register(new Emitter<RepoEntry>());
	private readonly onDidAddOrUpdateCodeSearchRepo = this._onDidAddOrUpdateCodeSearchRepo.event;

	private readonly _onDidRemoveCodeSearchRepo = this._register(new Emitter<RepoEntry>());
	private readonly onDidRemoveCodeSearchRepo = this._onDidRemoveCodeSearchRepo.event;

	private readonly _repoTracker: CodeSearchRepoTracker;

	private readonly _embeddingsIndex: WorkspaceChunkEmbeddingsIndex;
	private readonly _externalIngestIndex: Lazy<ExternalIngestIndex>;

	constructor(
		private readonly _embeddingType: EmbeddingType,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAdoCodeSearchService private readonly _adoCodeSearchService: IAdoCodeSearchService,
		@IAuthenticationChatUpgradeService private readonly _authUpgradeService: IAuthenticationChatUpgradeService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ICodeSearchAuthenticationService private readonly _codeSearchAuthService: ICodeSearchAuthenticationService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
		@IGitService private readonly _gitService: IGitService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWorkspaceFileIndex private readonly _workspaceChunkIndex: IWorkspaceFileIndex,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) {
		super();

		this._embeddingsIndex = this._register(instantiationService.createInstance(WorkspaceChunkEmbeddingsIndex, this._embeddingType));
		this._embeddingsChunkSearch = this._register(instantiationService.createInstance(EmbeddingsChunkSearch, this._embeddingsIndex));

		this._repoTracker = this._register(instantiationService.createInstance(CodeSearchRepoTracker));
		this._externalIngestIndex = new Lazy(() => {
			const client = instantiationService.createInstance(ExternalIngestClient);
			return this._register(instantiationService.createInstance(ExternalIngestIndex, client, this.getExternalIngestRoots()));
		});

		this._register(this._repoTracker.onDidAddOrUpdateRepo(info => {
			if (info.status === TrackedRepoStatus.Resolved && info.resolvedRemoteInfo) {
				return this.openGitRepo(info.repo, info.resolvedRemoteInfo);
			}
		}));

		this._register(this._repoTracker.onDidRemoveRepo(info => {
			this.closeRepo(info.repo);
		}));

		// When the github authentication state changes, update repos only if the session actually changed
		{
			let lastAnyGitHubSessionId = this._authenticationService.anyGitHubSession?.id;
			let lastPermissiveGitHubSessionId = this._authenticationService.permissiveGitHubSession?.id;
			this._register(this._authenticationService.onDidAuthenticationChange(() => {
				const anySessionId = this._authenticationService.anyGitHubSession?.id;
				const permissiveSessionId = this._authenticationService.permissiveGitHubSession?.id;
				if (anySessionId === lastAnyGitHubSessionId && permissiveSessionId === lastPermissiveGitHubSessionId) {
					return;
				}
				lastAnyGitHubSessionId = anySessionId;
				lastPermissiveGitHubSessionId = permissiveSessionId;
				this.updateRepoStatuses('github', new TelemetryCorrelationId('CodeSearchChunkSearch::onDidAuthenticationChange'));
			}));
		}

		this._register(Event.any(
			this._authenticationService.onDidAdoAuthenticationChange,
			this._adoCodeSearchService.onDidChangeIndexState
		)(() => {
			this.updateRepoStatuses('ado', new TelemetryCorrelationId('CodeSearchChunkSearch::onDidAdoChange'));
		}));

		this._register(Event.any(
			this.onDidFinishInitialization,
			this.onDidRemoveCodeSearchRepo,
			this.onDidAddOrUpdateCodeSearchRepo,
		)(() => this._onDidChangeIndexState.fire()));

		this._workspaceDiffTracker = new Lazy(() => {
			return this._register(instantiationService.createInstance(CodeSearchWorkspaceDiffTracker, {
				onDidAddOrUpdateRepo: this.onDidAddOrUpdateCodeSearchRepo,
				onDidRemoveRepo: this.onDidRemoveCodeSearchRepo,
				diffWithIndexedCommit: async (repoInfo): Promise<CodeSearchDiff | undefined> => {
					const entry = repoInfo.info ? this._codeSearchRepos.get(repoInfo.info.rootUri) : undefined;
					return entry ? this.diffWithIndexedCommit(entry.repo) : undefined;
				},
				initialize: () => this.initialize(),
				getAllRepos: () => Array.from(this._codeSearchRepos.values(), (e): RepoEntry => ({
					info: e.repo.repoInfo,
					remoteInfo: e.repo.remoteInfo,
					status: e.repo.status,
				})),
			}));
		});

		if (this.isCodeSearchEnabled()) {
			this.initialize();
		}
	}

	public override dispose(): void {
		super.dispose();
		this._isDisposed = true;

		for (const repoEntry of this._codeSearchRepos.values()) {
			repoEntry.repo.dispose();
			repoEntry.disposables.dispose();
		}
		this._codeSearchRepos.clear();
	}

	private _hasFinishedInitialization = false;
	private _initializePromise: Promise<void> | undefined;

	@LogExecTime(self => self._logService, 'CodeSearchChunkSearch::initialize')
	private async initialize() {
		this._initializePromise ??= (async () => {
			return logExecTime(this._logService, 'CodeSearchChunkSearch::initialize_impl', async () => {
				try {
					// Wait for the initial repos to be found
					await this._repoTracker.initialize();
					if (this._isDisposed) {
						return;
					}

					// And make sure they have done their initial checks.
					// After this the repos may still be left polling github but we've done at least one check
					await Promise.all(Array.from(this._codeSearchRepos.values(), info => info.repo.initialize()));
					if (this._isDisposed) {
						return;
					}

					// Update external ingest index with the code search repo roots (if external ingest is enabled)
					if (this.isExternalIngestEnabled()) {
						this.updateExternalIngestRoots();
						this._register(this._externalIngestIndex.value.onDidChangeState(() => {
							this._onDidChangeIndexState.fire();
						}));

						await this._externalIngestIndex.value.initialize();
					}
				} finally {
					this._hasFinishedInitialization = true;
					this._onDidFinishInitialization.fire();
				}
			});
		})();
		await this._initializePromise;
	}

	private getExternalIngestRoots(): URI[] {
		return Array.from(this._codeSearchRepos.values())
			.filter(entry => entry.repo.status === CodeSearchRepoStatus.Ready)
			.map(entry => entry.repo.repoInfo.rootUri);
	}

	private updateExternalIngestRoots(): void {
		this._externalIngestIndex.rawValue?.updateCodeSearchRoots(this.getExternalIngestRoots());
	}

	private isInitializing(): boolean {
		return !this._hasFinishedInitialization;
	}

	@LogExecTime(self => self._logService, 'CodeSearchChunkSearch::isAvailable')
	async isAvailable(searchTelemetryInfo?: TelemetryCorrelationId, canPrompt = false, token = CancellationToken.None): Promise<boolean> {
		const sw = new StopWatch();
		const codeSearchCheckResult = await this.isCodeSearchAvailable(canPrompt, token);
		if (this._isDisposed) {
			return false;
		}

		const hasExternalIngest = !!this.isExternalIngestEnabled();

		// Track where indexed repos are located related to the workspace
		const indexedRepoLocation = {
			workspaceFolder: 0,
			parentFolder: 0,
			subFolder: 0,
			unknownFolder: 0,
		};

		if (codeSearchCheckResult.isOk()) {
			const workspaceFolder = this._workspaceService.getWorkspaceFolders();
			for (const repo of codeSearchCheckResult.val.indexedRepos) {
				if (workspaceFolder.some(folder => isEqual(repo.repoInfo.rootUri, folder))) {
					indexedRepoLocation.workspaceFolder++;
				} else if (workspaceFolder.some(folder => isEqualOrParent(folder, repo.repoInfo.rootUri))) {
					indexedRepoLocation.parentFolder++;
				} else if (workspaceFolder.some(folder => isEqualOrParent(repo.repoInfo.rootUri, folder))) {
					indexedRepoLocation.subFolder++;
				} else {
					indexedRepoLocation.unknownFolder++;
				}
			}
		}

		/* __GDPR__
			"codeSearchChunkSearch.isAvailable" : {
				"owner": "mjbvz",
				"comment": "Metadata about the code search availability check",
				"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
				"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
				"codeSearchUnavailableReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Reason why code search is unavailable" },
				"repoStatues": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Detailed info about the statues of the repos in the workspace" },
				"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How long the check too to complete" },
				"hasExternalIngest": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether external ingest is enabled" },
				"indexedRepoCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of indexed repositories" },
				"notYetIndexedRepoCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of repositories that have not yet been indexed" },

				"indexedRepoLocation.workspace": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of repositories that map exactly to a workspace folder" },
				"indexedRepoLocation.parent": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of repositories that map to a parent folder" },
				"indexedRepoLocation.sub": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of repositories that map to a sub-folder" },
				"indexedRepoLocation.unknown": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of repositories that map to an unknown folder" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('codeSearchChunkSearch.isAvailable', {
			workspaceSearchSource: searchTelemetryInfo?.callTracker,
			workspaceSearchCorrelationId: searchTelemetryInfo?.correlationId,
			codeSearchUnavailableReason: codeSearchCheckResult.isError() ? codeSearchCheckResult.err.unavailableReason : undefined,
			repoStatues: JSON.stringify(codeSearchCheckResult.isOk() ? codeSearchCheckResult.val.repoStatuses : codeSearchCheckResult.err.repoStatuses),
		}, {
			execTime: sw.elapsed(),
			hasExternalIngest: hasExternalIngest ? 1 : 0,
			indexedRepoCount: codeSearchCheckResult.isOk() ? codeSearchCheckResult.val.indexedRepos.length : 0,
			notYetIndexedRepoCount: codeSearchCheckResult.isOk() ? codeSearchCheckResult.val.notYetIndexedRepos.length : 0,
			'indexedRepoLocation.workspace': indexedRepoLocation.workspaceFolder,
			'indexedRepoLocation.parent': indexedRepoLocation.parentFolder,
			'indexedRepoLocation.sub': indexedRepoLocation.subFolder,
			'indexedRepoLocation.unknown': indexedRepoLocation.unknownFolder,
		});

		if (codeSearchCheckResult.isError()) {
			this._logService.debug(`CodeSearchChunkSearch.isAvailable: codeSearchCheckResult returned error: ${codeSearchCheckResult.err.unavailableReason}`);
		}

		if (codeSearchCheckResult.isOk()) {
			this._logService.debug(`CodeSearchChunkSearch.isAvailable: true since code search is available`);
			return true;
		}

		if (hasExternalIngest) {
			this._logService.debug(`CodeSearchChunkSearch.isAvailable: true since external ingest is enabled`);
		} else {
			this._logService.debug(`CodeSearchChunkSearch.isAvailable: false since external ingest is not enabled and no code search repos found`);
		}

		return hasExternalIngest;
	}

	private async isCodeSearchAvailable(canPrompt = false, token: CancellationToken): Promise<Result<AvailableSuccessMetadata, AvailableFailureMetadata>> {
		if (!this.isCodeSearchEnabled()) {
			return Result.error<AvailableFailureMetadata>({ unavailableReason: 'Disabled by experiment', repoStatuses: {} });
		}

		await this.initialize();
		if (this._isDisposed) {
			return Result.error<AvailableFailureMetadata>({ unavailableReason: 'Disposed', repoStatuses: {} });
		}

		let allRepos = Array.from(this._codeSearchRepos.values(), entry => entry.repo);
		if (canPrompt) {
			if (allRepos.some(repo => repo.status === CodeSearchRepoStatus.CouldNotCheckIndexStatus || repo.status === CodeSearchRepoStatus.NotAuthorized)) {
				if (await raceCancellationError(this._authUpgradeService.shouldRequestPermissiveSessionUpgrade(), token)) { // Needs more thought
					if (await raceCancellationError(this._authUpgradeService.shouldRequestPermissiveSessionUpgrade(), token)) {
						await raceCancellationError(this.updateRepoStatuses(undefined, new TelemetryCorrelationId('CodeSearchChunkSearch::doIsAvailableCheck')), token);
						allRepos = Array.from(this._codeSearchRepos.values(), entry => entry.repo);
					}
				}
			}
		}

		const repoStatuses = allRepos.reduce((sum, repo) => { sum[repo.status] = (sum[repo.status] ?? 0) + 1; return sum; }, {} as Record<string, number>);
		const indexedRepos = allRepos.filter(repo => repo.status === CodeSearchRepoStatus.Ready);
		const notYetIndexedRepos = allRepos.filter(repo => repo.status === CodeSearchRepoStatus.NotYetIndexed);

		if (!indexedRepos.length && !notYetIndexedRepos.length) {
			// Get detailed info about why we failed
			if (!allRepos.length) {
				return Result.error<AvailableFailureMetadata>({ unavailableReason: 'No repos', repoStatuses });
			}

			if (allRepos.some(repo => repo.status === CodeSearchRepoStatus.CheckingStatus || repo.status === CodeSearchRepoStatus.Resolving)) {
				return Result.error<AvailableFailureMetadata>({ unavailableReason: 'Checking status', repoStatuses });
			}

			if (allRepos.every(repo => repo.status === CodeSearchRepoStatus.NotResolvable)) {
				return Result.error<AvailableFailureMetadata>({ unavailableReason: 'Repos not resolvable', repoStatuses });
			}

			if (allRepos.every(repo => repo.status === CodeSearchRepoStatus.NotIndexable)) {
				return Result.error<AvailableFailureMetadata>({ unavailableReason: 'Repos not indexable', repoStatuses });
			}

			if (allRepos.every(repo => repo.status === CodeSearchRepoStatus.NotYetIndexed)) {
				return Result.error<AvailableFailureMetadata>({ unavailableReason: 'Not yet indexed', repoStatuses });
			}

			if (allRepos.every(repo => repo.status === CodeSearchRepoStatus.CouldNotCheckIndexStatus || repo.status === CodeSearchRepoStatus.NotAuthorized)) {
				return Result.error<AvailableFailureMetadata>({ unavailableReason: 'Could not check index status', repoStatuses });
			}

			// Generic error
			return Result.error<AvailableFailureMetadata>({ unavailableReason: `No indexed repos`, repoStatuses });
		}

		const diffArray = await this.getLocalDiff();
		if (!Array.isArray(diffArray)) {
			switch (diffArray) {
				case 'unknown': {
					return Result.error<AvailableFailureMetadata>({ unavailableReason: 'Diff not available', repoStatuses });
				}
				case 'tooLarge': {
					return Result.error<AvailableFailureMetadata>({ unavailableReason: 'Diff too large', repoStatuses });
				}
			}
			return Result.error<AvailableFailureMetadata>({ unavailableReason: 'Unknown diff error', repoStatuses });
		}

		return Result.ok({ indexedRepos, notYetIndexedRepos, repoStatuses });
	}

	private isCodeSearchEnabled() {
		return this._configService.getExperimentBasedConfig<boolean>(ConfigKey.Advanced.WorkspaceEnableCodeSearch, this._experimentationService);
	}

	public isExternalIngestEnabled(): boolean | 'force' {
		return this._configService.getExperimentBasedConfig<boolean>(ConfigKey.TeamInternal.WorkspaceEnableCodeSearchExternalIngest, this._experimentationService);
	}

	public getRemoteIndexState(): CodeSearchRemoteIndexState {
		if (!this.isCodeSearchEnabled() && !this.isExternalIngestEnabled()) {
			return {
				status: 'disabled',
				repos: [],
			};
		}

		// Kick of request but do not wait for it to finish
		this.initialize();

		// Get external ingest state if enabled
		const externalIngestState = this.isExternalIngestEnabled() && this._externalIngestIndex.hasValue
			? this._externalIngestIndex.value.getState()
			: undefined;

		if (this.isInitializing()) {
			return {
				status: 'initializing',
				repos: [],
				externalIngestState,
			};
		}

		if (this.isExternalIngestEnabled() === 'force') {
			return {
				status: 'loaded',
				repos: [],
				externalIngestState,
			};
		}

		const trackedRepos = this._repoTracker.getAllTrackedRepos();
		if (trackedRepos) {
			const resolving = trackedRepos.some(repo => repo.status === TrackedRepoStatus.Resolving);
			if (resolving) {
				return {
					status: 'initializing',
					repos: [],
					externalIngestState,
				};
			}
		}

		const resolvedRepos = Array.from(this._codeSearchRepos.values(), entry => entry.repo)
			.filter(repo => repo.status !== CodeSearchRepoStatus.NotResolvable);

		const repos = resolvedRepos.map((repo): RepoEntry => ({ info: repo.repoInfo, remoteInfo: repo.remoteInfo, status: repo.status }));

		return {
			status: 'loaded',
			repos,
			externalIngestState,
		};
	}


	private didRunPrepare = false;
	public async prepareSearchWorkspace(telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<undefined> {
		if (this.didRunPrepare) {
			return;
		}

		this.didRunPrepare = true;
		return this.tryAuthIfNeeded(telemetryInfo, token);
	}

	public async searchWorkspace(sizing: StrategySearchSizing, query: WorkspaceChunkQueryWithEmbeddings, options: WorkspaceChunkSearchOptions, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<StrategySearchResult | undefined> {
		if (!(await raceCancellationError(this.isAvailable(telemetryInfo, true, token), token))) {
			return;
		}

		return logExecTime(this._logService, 'CodeSearchChunkSearch.searchWorkspace', async () => {
			const allRepos = Array.from(this._codeSearchRepos.values(), entry => entry.repo);
			await logExecTime(this._logService, 'CodeSearchChunkSearch.searchWorkspace.prepare', () => {
				return raceCancellationError(
					Promise.all(allRepos.map(repo => repo.prepareSearch(telemetryInfo.addCaller('CodeSearchChunkSearch::searchWorkspace'), token))),
					token);
			});

			const indexedRepos = allRepos.filter(repo => repo.status === CodeSearchRepoStatus.Ready);

			const diffArray = await raceCancellationError(this.getLocalDiff(), token);
			if (!Array.isArray(diffArray)) {
				return;
			}

			const diffFilePattern = diffArray.map(uri => new RelativePattern(uri, '*'));

			const localSearchCts = new CancellationTokenSource(token);

			// Kick off remote and local searches in parallel
			const innerTelemetryInfo = telemetryInfo.addCaller('CodeSearchChunkSearch::searchWorkspace');

			// Trigger code search for all files without any excludes for diffed files.
			// This is needed in case local diff times out
			const codeSearchOperation = indexedRepos.length > 0
				? this.doCodeSearch(query, indexedRepos, sizing, options, innerTelemetryInfo, token).catch(e => {
					if (!isCancellationError(e)) {
						this._logService.error(`Code search failed`, e);
					}

					// If code search fails, cancel local search too because we won't be able to merge
					localSearchCts.cancel();
					throw e;
				})
				: Promise.resolve<SemanticCodeSearchResult>({ chunks: [], outOfSync: false });

			const localSearchOperation = raceTimeout(this.searchLocalDiff(diffArray, sizing, query, options, innerTelemetryInfo, localSearchCts.token), this.localDiffSearchTimeout, () => {
				localSearchCts.cancel();
			});

			let codeSearchResults: SemanticCodeSearchResult | undefined;
			let localResults: DiffSearchResult | undefined;
			try {
				codeSearchResults = await raceCancellationError(codeSearchOperation, token);
				if (codeSearchResults) {
					localResults = await raceCancellationError(localSearchOperation, token);
				} else {
					// No need to do local search if code search failed
					localSearchCts.cancel();
				}
			} finally {
				localSearchCts.dispose(true);
			}

			/* __GDPR__
				"codeSearchChunkSearch.search.success" : {
					"owner": "mjbvz",
					"comment": "Information about successful code searches",
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"diffSearchStrategy": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Search strategy for the diff" },
					"chunkCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of returned chunks just from code search" },
					"locallyChangedFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of files that are different than the code search index" },
					"codeSearchOutOfSync": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Tracks if the local commit we think code search has indexed matches what code search actually has indexed" },
					"embeddingsRecomputedFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of files that needed to have their embeddings recomputed. Only logged when embeddings search is used" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('codeSearchChunkSearch.search.success', {
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
				diffSearchStrategy: localResults?.strategyId ?? 'none',
			}, {
				chunkCount: codeSearchResults?.chunks.length ?? 0,
				locallyChangedFileCount: diffArray.length,
				codeSearchOutOfSync: codeSearchResults?.outOfSync ? 1 : 0,
				embeddingsRecomputedFileCount: localResults?.embeddingsComputeInfo?.recomputedFileCount ?? 0,
			});

			this._logService.trace(`CodeSearchChunkSearch.searchWorkspace: codeSearchResults: ${codeSearchResults?.chunks.length}, localResults: ${localResults?.chunks.length}`);

			// If neither code search nor local diff search returned results, bail
			if (!codeSearchResults && !localResults) {
				return;
			}

			// Merge results from code search and local diff search
			const mergedChunks: readonly FileChunkAndScore[] = [
				// Code search results (excluding diffed files if we have local results)
				...(codeSearchResults?.chunks ?? [])
					.filter(x => !localResults || shouldInclude(x.chunk.file, { exclude: diffFilePattern })),

				// Local diff results
				...(localResults?.chunks ?? [])
					.filter(x => shouldInclude(x.chunk.file, { include: diffFilePattern })),
			];

			const outChunks = mergedChunks
				.filter(x => shouldInclude(x.chunk.file, options.globPatterns));

			return {
				chunks: outChunks,
				alerts: !localResults
					? [new ChatResponseWarningPart(l10n.t('Still updating workspace index. Falling back to using the latest remote code index only. Response may be less accurate.'))]
					: undefined
			};
		}, (execTime, status) => {
			/* __GDPR__
				"codeSearchChunkSearch.perf.searchFileChunks" : {
					"owner": "mjbvz",
					"comment": "Total time for searchFileChunks to complete",
					"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('codeSearchChunkSearch.perf.searchFileChunks', {
				status,
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			}, { execTime });
		});
	}

	@LogExecTime(self => self._logService, 'CodeSearchChunkSearch::getLocalDiff')
	private async getLocalDiff(): Promise<readonly URI[] | 'unknown' | 'tooLarge'> {
		await this._workspaceDiffTracker.value.initialized;

		const diff = this._workspaceDiffTracker.value.getDiffFiles();
		if (!diff) { // undefined means we don't know the state of the workspace
			return 'unknown';
		}

		const diffArray = Array.from(diff);
		if (
			diffArray.length > this.maxDiffSize
			|| (diffArray.length / Iterable.reduce(this._workspaceChunkIndex.values(), sum => sum + 1, 0)) > this.maxDiffPercentage
		) {
			return 'tooLarge';
		}

		return diffArray;
	}

	private async searchLocalDiff(diffArray: readonly URI[], sizing: StrategySearchSizing, query: WorkspaceChunkQueryWithEmbeddings, options: WorkspaceChunkSearchOptions, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<DiffSearchResult | undefined> {
		const innerTelemetryInfo = telemetryInfo.addCaller('CodeSearchChunkSearch::searchLocalDiff');

		// If external ingest is enabled, we always want to search it as well as it tracks files outside of the code search repos
		if (this.isExternalIngestEnabled()) {
			// Also force it to search the local diff too so we can can override stale code-search results.
			await raceCancellationError(this._externalIngestIndex.value.updateForceIncludeFiles(diffArray, token), token);

			const externalResult = await this._externalIngestIndex.value.search(sizing, query, innerTelemetryInfo, token);
			if (externalResult) {
				const diffFilePattern = diffArray.map(uri => new RelativePattern(uri, '*'));
				const filtered = externalResult.filter(x => shouldInclude(x.chunk.file, { include: diffFilePattern }));
				return { chunks: filtered, strategyId: 'externalIngest' };
			}
			return undefined;
		}

		// Otherwise, the fallback to local searching using embeddings
		if (!diffArray.length) {
			return { chunks: [], strategyId: 'skipped' };
		}

		const subSearchOptions: WorkspaceChunkSearchOptions = {
			...options,
			globPatterns: {
				exclude: options.globPatterns?.exclude,
				include: diffArray.map(uri => new RelativePattern(uri, '*')),
			}
		};

		const embeddingsMaxFiles = this._configService.getExperimentBasedConfig(ConfigKey.Advanced.WorkspaceMaxDiffSizeBeforeUsingExternalIngest, this._experimentationService);

		if (diffArray.length <= embeddingsMaxFiles) {
			const batchInfo = new ComputeBatchInfo();
			const result = await this._embeddingsChunkSearch.searchSubsetOfFiles(sizing, query, diffArray, subSearchOptions, { info: innerTelemetryInfo, batchInfo }, token);
			return { ...result, strategyId: 'localEmbeddings', embeddingsComputeInfo: batchInfo };
		} else {
			// No way to search out-of-sync files; caller will use code search results alone and warn the user
			this._logService.debug(`CodeSearchChunkSearch.searchLocalDiff: ${diffArray.length} out-of-sync files exceeds threshold (${embeddingsMaxFiles}), skipping local diff search`);
			return undefined;
		}
	}

	@LogExecTime(self => self._logService, 'CodeSearchChunkSearch::doCodeSearch', function (execTime, status) {
		// Old name used for backwards compatibility with old telemetry
		/* __GDPR__
			"codeSearchChunkSearch.perf.doCodeSearchWithRetry" : {
				"owner": "mjbvz",
				"comment": "Total time for doCodeSearch to complete",
				"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
				"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('codeSearchChunkSearch.perf.doCodeSearchWithRetry', { status }, { execTime });
	})
	private async doCodeSearch(query: WorkspaceChunkQueryWithEmbeddings, repos: readonly CodeSearchRepo[], sizing: StrategySearchSizing, options: WorkspaceChunkSearchOptions, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<SemanticCodeSearchResult | undefined> {
		const results = await Promise.all(repos.map(repo => {
			return repo.searchRepo({ silent: true }, this._embeddingType, query.queryText, sizing.maxResultCountHint, options, telemetryInfo, token);
		}));

		return {
			chunks: coalesce(results).flatMap(x => x.chunks),
			outOfSync: coalesce(results).some(x => x.outOfSync),
		};
	}

	public async triggerIndexing(triggerReason: BuildIndexTriggerReason, onProgress: (message: string) => void, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<Result<true, TriggerIndexingError>> {
		const triggerResult = await this.doTriggerIndexing(triggerReason, onProgress, telemetryInfo, token);
		if (triggerResult.isOk()) {
			this._logService.trace(`CodeSearch.triggerIndexing(${triggerReason}) succeeded`);
		} else {
			this._logService.trace(`CodeSearch.triggerIndexing(${triggerReason}) failed. ${triggerResult.err.id}`);
		}

		/* __GDPR__
			"codeSearchChunkSearch.triggerRemoteIndexing" : {
				"owner": "mjbvz",
				"comment": "Triggers of remote indexing",
				"triggerReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "How the call was triggered" },
				"error": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "How the trigger call failed" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('codeSearchChunkSearch.triggerRemoteIndexing', {
			triggerReason: triggerReason,
			error: triggerResult.isError() ? triggerResult.err.id : undefined,
		});

		return triggerResult;
	}

	@LogExecTime(self => self._logService, 'CodeSearchChunkSearch::openGitRepo')
	private async openGitRepo(repo: RepoInfo, remoteInfo: ResolvedRepoRemoteInfo): Promise<void> {
		this._logService.trace(`CodeSearchChunkSearch.openGitRepo(${repo.rootUri})`);

		const existing = this._codeSearchRepos.get(repo.rootUri);
		if (existing) {
			return;
		}

		// Skip repos that aren't relevant to the workspace (e.g. worktrees at external paths)
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();
		const isRelevantToWorkspace = workspaceFolders.some(folder =>
			isEqualOrParent(repo.rootUri, folder) || isEqualOrParent(folder, repo.rootUri));
		if (!isRelevantToWorkspace) {
			this._logService.trace(`CodeSearchChunkSearch.openGitRepo(${repo.rootUri}): skipping, not relevant to workspace`);
			return;
		}

		// Skip if another repo already covers this remote (e.g. git worktrees sharing the same remote)
		const remoteKey = remoteInfo.repoId.toString();
		for (const entry of this._codeSearchRepos.values()) {
			if (entry.repo.remoteInfo?.repoId.toString() === remoteKey) {
				this._logService.trace(`CodeSearchChunkSearch.openGitRepo(${repo.rootUri}): skipping, remote already covered by ${entry.repo.repoInfo.rootUri}`);
				return;
			}
		}

		if (remoteInfo.repoId.type === 'github') {
			this.updateRepoEntry(repo, this._instantiationService.createInstance(GithubCodeSearchRepo, repo, remoteInfo.repoId, remoteInfo));
			// Update external ingest roots since this repo is now covered by code search
			if (this.isExternalIngestEnabled() === true) {
				this.updateExternalIngestRoots();
			}
			return;
		} else if (remoteInfo.repoId.type === 'ado') {
			this.updateRepoEntry(repo, this._instantiationService.createInstance(AdoCodeSearchRepo, repo, remoteInfo.repoId, remoteInfo));
			// Update external ingest roots since this repo is now covered by code search
			if (this.isExternalIngestEnabled() === true) {
				this.updateExternalIngestRoots();
			}
			return;
		}

		// For unsupported repo types, the external ingest index will handle the files
		this._logService.trace(`CodeSearchChunkSearch.openGitRepo: Repo type ${remoteInfo.repoId} not directly supported for code search, files will be indexed via external ingest`);
	}

	private updateRepoEntry(repoInfo: RepoInfo, newEntry: CodeSearchRepo) {
		const existing = this._codeSearchRepos.get(repoInfo.rootUri);
		if (existing?.repo === newEntry) {
			return;
		}

		existing?.repo.dispose();
		existing?.disposables.dispose();

		const disposables = new DisposableStore();
		disposables.add(newEntry.onDidChangeStatus(() => {
			this._onDidChangeIndexState.fire();
		}));

		this._codeSearchRepos.set(repoInfo.rootUri, { repo: newEntry, disposables });
		this._onDidAddOrUpdateCodeSearchRepo.fire({
			info: newEntry.repoInfo,
			remoteInfo: newEntry.remoteInfo,
			status: newEntry.status,
		});
	}

	private closeRepo(repo: RepoInfo) {
		this._logService.trace(`CodeSearchChunkSearch.closeRepo(${repo.rootUri})`);

		const repoEntry = this._codeSearchRepos.get(repo.rootUri);
		if (!repoEntry) {
			return;
		}

		repoEntry.repo.dispose();
		repoEntry.disposables.dispose();

		this._onDidRemoveCodeSearchRepo.fire({
			info: repoEntry.repo.repoInfo,
			remoteInfo: repoEntry.repo.remoteInfo,
			status: repoEntry.repo.status,
		});
		this._codeSearchRepos.delete(repo.rootUri);
	}

	private async doTriggerIndexing(triggerReason: BuildIndexTriggerReason, onProgress: (message: string) => void, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<Result<true, TriggerIndexingError>> {
		this._logService.trace(`RepoTracker.TriggerRemoteIndexing(${triggerReason}).started`);

		await this.initialize();

		// Update external ingest index if enabled
		const externalIndexEnabled = this.isExternalIngestEnabled();
		if (externalIndexEnabled) {
			const result = await raceCancellationError(this._externalIngestIndex.value.doIngest(telemetryInfo, onProgress, token), token);
			if (result.isError()) {
				return Result.error(result.err);
			}

			// If we are forcing external ingest only, we don't care about code search repo states
			if (externalIndexEnabled === 'force') {
				return Result.ok(true);
			}
		}

		this._logService.trace(`RepoTracker.TriggerRemoteIndexing(${triggerReason}).Repos: ${JSON.stringify(Array.from(this._codeSearchRepos.values(), entry => ({
			rootUri: entry.repo.repoInfo.rootUri.toString(),
			status: entry.repo.status,
		})), null, 4)} `);

		const authToken = await this.getGithubAuthToken();
		if (this._isDisposed) {
			return Result.ok(true);
		}

		if (!authToken) {
			return Result.error(TriggerRemoteIndexingError.noValidAuthToken);
		}

		const allRepos = Array.from(this._codeSearchRepos.values(), entry => entry.repo);
		if (!allRepos.length || allRepos.every(repo => repo.status === CodeSearchRepoStatus.NotResolvable)) {
			if (externalIndexEnabled) {
				return Result.ok(true);
			} else {
				return Result.error(TriggerRemoteIndexingError.notIndexable);
			}
		}

		if (allRepos.every(repo => repo.status === CodeSearchRepoStatus.Resolving)) {
			return Result.error(TriggerRemoteIndexingError.stillResolving);
		}

		const candidateRepos = allRepos.filter(repo => repo.status !== CodeSearchRepoStatus.NotResolvable && repo.status !== CodeSearchRepoStatus.Resolving);
		if (candidateRepos.every(repo => repo.status === CodeSearchRepoStatus.Ready)) {
			return Result.error(TriggerRemoteIndexingError.alreadyIndexed);
		}

		if (candidateRepos.every(repo => repo.status === CodeSearchRepoStatus.BuildingIndex || repo.status === CodeSearchRepoStatus.Ready)) {
			return Result.error(TriggerRemoteIndexingError.alreadyIndexing);
		}

		if (candidateRepos.every(repo => repo.status === CodeSearchRepoStatus.CouldNotCheckIndexStatus || repo.status === CodeSearchRepoStatus.NotAuthorized)) {
			return Result.error(TriggerRemoteIndexingError.couldNotCheckIndexStatus);
		}

		const responses = await Promise.all(candidateRepos.map(repoEntry => {
			if (repoEntry.status === CodeSearchRepoStatus.NotYetIndexed) {
				return repoEntry.triggerRemoteIndexingOfRepo(triggerReason, telemetryInfo.addCaller('CodeSearchChunkSearch::triggerRemoteIndexing'));
			}
		}));

		const error = responses.find(r => r?.isError());
		return error ?? Result.ok(true);
	}

	private async updateRepoStatuses(onlyReposOfType: 'github' | 'ado' | undefined, telemetryInfo: TelemetryCorrelationId): Promise<void> {
		await Promise.all(Array.from(this._codeSearchRepos.values(), entry => {
			if (!onlyReposOfType || entry.repo.remoteInfo?.repoId.type === onlyReposOfType) {
				return entry.repo.refreshStatusFromEndpoint(true, telemetryInfo.addCaller('CodeSearchChunkSearch::updateRepoStatuses'), CancellationToken.None).catch(() => { });
			}
		}));
	}

	private async getGithubAuthToken() {
		return (await this._authenticationService.getGitHubSession('permissive', { silent: true }))?.accessToken
			?? (await this._authenticationService.getGitHubSession('any', { silent: true }))?.accessToken;
	}

	private async tryAuthIfNeeded(_telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<PromiseLike<undefined> | undefined> {
		await raceCancellationError(this.initialize(), token);
		if (this._isDisposed) {
			return;
		}

		// See if there are any repos that we know for sure we are not authorized for
		const allRepos = Array.from(this._codeSearchRepos.values(), entry => entry.repo);
		const notAuthorizedRepos = allRepos.filter(repo => repo.status === CodeSearchRepoStatus.NotAuthorized);
		if (!notAuthorizedRepos.length) {
			return;
		}

		// TODO: only handles first repos of each type, but our other services also don't track tokens for multiple
		// repos in a workspace right now
		const firstGithubRepo = notAuthorizedRepos.find(repo => repo.remoteInfo?.repoId.type === 'github');
		if (firstGithubRepo) {
			await this._codeSearchAuthService.tryAuthenticating(firstGithubRepo.remoteInfo);
		}

		const firstAdoRepo = notAuthorizedRepos.find(repo => repo.remoteInfo?.repoId.type === 'ado');
		if (firstAdoRepo) {
			await this._codeSearchAuthService.tryAuthenticating(firstAdoRepo.remoteInfo);
		}
	}

	private async diffWithIndexedCommit(repo: CodeSearchRepo): Promise<CodeSearchDiff | undefined> {
		if (isGitHubRemoteRepository(repo.repoInfo.rootUri)) {
			// TODO: always assumes no diff. Can we get a real diff somehow?
			return { changes: [] };
		}

		const doDiffWith = async (ref: string): Promise<Change[] | undefined> => {
			try {
				return await this._gitService.diffWith(repo.repoInfo.rootUri, ref);
			} catch (e) {
				this._logService.trace(`CodeSearchChunkSearch.diffWithIndexedCommit(${repo.repoInfo.rootUri}).Could not compute diff against: ${ref}.Error: ${e} `);
			}
		};

		if (repo.status === CodeSearchRepoStatus.NotYetIndexed) {
			const changes = await doDiffWith('@{upstream}');
			return changes ? { changes } : undefined;
		}

		if (repo.status === CodeSearchRepoStatus.Ready) {
			const changesAgainstIndexedCommit = repo.indexedCommit ? await doDiffWith(repo.indexedCommit) : undefined;
			if (changesAgainstIndexedCommit) {
				return { changes: changesAgainstIndexedCommit, mayBeOutdated: false };
			}

			this._logService.trace(`CodeSearchChunkSearch.diffWithIndexedCommit(${repo.repoInfo.rootUri}).Falling back to diff against upstream.`);

			const changesAgainstUpstream = await doDiffWith('@{upstream}');
			if (changesAgainstUpstream) {
				return { changes: changesAgainstUpstream, mayBeOutdated: true };
			}

			this._logService.trace(`CodeSearchChunkSearch.diffWithIndexedCommit(${repo.repoInfo.rootUri}).Could not compute any diff.`);
		}

		return undefined;
	}

	public deleteExternalIngestWorkspaceIndex(telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<void> {
		return this._externalIngestIndex.value.deleteIndex(telemetryInfo, token);
	}
}
