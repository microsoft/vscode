/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { Delayer, raceCancellationError } from '../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable, DisposableStore, dispose } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { URI } from '../../../util/vs/base/common/uri';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ComputeBatchInfo } from '../../chunking/common/chunkingEndpointClient';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { logExecTime, LogExecTime } from '../../log/common/logExecTime';
import { ILogService } from '../../log/common/logService';
import { ICodeSearchAuthenticationService } from '../../remoteCodeSearch/node/codeSearchRepoAuth';
import { ISimulationTestContext } from '../../simulationTestContext/common/simulationTestContext';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { StrategySearchResult, StrategySearchSizing, WorkspaceChunkQueryWithEmbeddings, WorkspaceChunkSearchOptions } from '../common/workspaceChunkSearch';
import { BuildIndexTriggerReason } from './codeSearch/codeSearchRepo';
import { WorkspaceChunkEmbeddingsIndex } from './workspaceChunkEmbeddingsIndex';
import { IWorkspaceFileIndex } from './workspaceFileIndex';

export enum LocalEmbeddingsIndexStatus {
	Disabled = 'disabled',
	Unknown = 'unknown',

	UpdatingIndex = 'updatingIndex',
	Ready = 'ready',

	TooManyFilesForAutomaticIndexing = 'tooManyFilesForAutomaticIndexing',
	TooManyFilesForAnyIndexing = 'tooManyFilesForAnyIndexing',
}


/**
 * Uses a locally stored index of embeddings to find the most similar chunks from the workspace.
 *
 * This can be costly so it is only available for smaller workspaces.
 */
export class EmbeddingsChunkSearch extends Disposable {

	/** Max workspace size that will be automatically indexed. */
	private static readonly defaultAutomaticIndexingFileCap = 750;

	/** Max workspace size for automatic for clients with expanded capabilities. */
	private static readonly defaultExpandedAutomaticIndexingFileCap = 50_000;

	/** Max workspace size that can indexed if requested by the user. */
	private static readonly defaultManualIndexingFileCap = 2500;

	private _state = LocalEmbeddingsIndexStatus.Unknown;

	private readonly _disposeCts = this._register(new CancellationTokenSource());

	private readonly _embeddingsIndex: WorkspaceChunkEmbeddingsIndex;

	private readonly _onDidChangeIndexState = this._register(new Emitter<void>());
	public readonly onDidChangeIndexState = this._onDidChangeIndexState.event;

	private readonly _reindexDisposables = this._register(new DisposableStore());
	private readonly _reindexRequests = new ResourceMap<Delayer<void>>;

	private readonly _hasRequestedManualIndexingKey = 'copilot.embeddingsChunkSearch.hasRequestedManualIndexing';
	private readonly _hasPromptedExpandedIndexingKey = 'copilot.embeddingsChunkSearch.hasRequestedExpandedIndexing';

	constructor(
		embeddingsIndex: WorkspaceChunkEmbeddingsIndex,
		@ISimulationTestContext _simulationTestContext: ISimulationTestContext,
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@ICodeSearchAuthenticationService private readonly _codeSearchAuthService: ICodeSearchAuthenticationService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IWorkspaceFileIndex private readonly _workspaceIndex: IWorkspaceFileIndex,
	) {
		super();

		this._embeddingsIndex = embeddingsIndex;

		this._register(this._embeddingsIndex.onDidChangeWorkspaceIndexState(() => {
			return this._onDidChangeIndexState.fire();
		}));
	}

	public override dispose(): void {
		super.dispose();

		dispose(this._reindexRequests.values());
		this._reindexRequests.clear();
	}

	async prepareSearchWorkspace(telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<void> {
		// We're potentially going to index a lot of files due to expanded indexing, prompt the user to confirm first.
		// This both informs them that indexing may take some time and also reduces load for cases when
		// the extra indexing was unexpected.
		if (!await raceCancellationError(this.getExpandedClientSideIndexingStatus(), token)) {
			return;
		}

		if (this._embeddingsIndex.fileCount < await this.getManualIndexFileCap()) {
			return;
		}

		// Only auto prompt once per workspace
		const hasPrompted = this._extensionContext.workspaceState.get<boolean | undefined>(this._hasPromptedExpandedIndexingKey);
		if (hasPrompted) {
			return;
		}
		this._extensionContext.workspaceState.update(this._hasPromptedExpandedIndexingKey, true);

		const shouldIndex = await this._codeSearchAuthService.promptForExpandedLocalIndexing(this._embeddingsIndex.fileCount);
		if (shouldIndex) {
			// Don't await, just kick off
			this.triggerIndexingOfWorkspace('manual', telemetryInfo.addCaller('EmbeddingsChunkSearch::prepareSearchWorkspace'));
		}
	}

	async searchWorkspace(sizing: StrategySearchSizing, query: WorkspaceChunkQueryWithEmbeddings, options: WorkspaceChunkSearchOptions, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<StrategySearchResult | undefined> {
		return logExecTime(this._logService, 'EmbeddingsChunkSearch.searchWorkspace', async () => {
			// kick off resolve early but don't await it until actually needed
			const resolvedQuery = query.resolveQueryEmbeddings(token);

			const innerTelemetryInfo = telemetryInfo.addCaller('EmbeddingsChunkSearch::searchWorkspace');

			await raceCancellationError(this.doInitialIndexing('manual', innerTelemetryInfo), token);
			if (this._state === LocalEmbeddingsIndexStatus.UpdatingIndex || this._state === LocalEmbeddingsIndexStatus.Ready) {
				return { chunks: await this._embeddingsIndex.searchWorkspace(resolvedQuery, sizing.maxResultCountHint, options, innerTelemetryInfo, token) };
			} else {
				return undefined;
			}
		}, (execTime, status) => {
			/* __GDPR__
				"embeddingsChunkSearch.perf.searchFileChunks" : {
					"owner": "mjbvz",
					"comment": "Total time for searchFileChunks to complete",
					"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('embeddingsChunkSearch.perf.searchFileChunks', {
				status,
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			}, { execTime });
		});
	}

	@LogExecTime(self => self._logService, 'EmbeddingsChunkSearch::searchSubsetOfFiles')
	async searchSubsetOfFiles(sizing: StrategySearchSizing, query: WorkspaceChunkQueryWithEmbeddings, files: readonly URI[], options: WorkspaceChunkSearchOptions, telemetry: { info: TelemetryCorrelationId; batchInfo?: ComputeBatchInfo }, token: CancellationToken): Promise<StrategySearchResult> {
		if (!files.length) {
			return { chunks: [] };
		}

		return logExecTime(this._logService, 'EmbeddingsChunkSearch::searchSubsetOfFiles', async () => {
			await raceCancellationError(this._embeddingsIndex.initialize(), token);

			// kick off resolve early but don't await it until actually needed
			const resolvedQuery = query.resolveQueryEmbeddings(token);

			return {
				chunks: await this._embeddingsIndex.searchSubsetOfFiles(files, resolvedQuery, sizing.maxResultCountHint, options, { info: telemetry.info.addCaller('EmbeddingsChunkSearch::searchSubsetOfFiles'), batchInfo: telemetry.batchInfo }, token)
			};
		}, (execTime, status) => {
			/* __GDPR__
				"embeddingsChunkSearch.perf.searchSubsetOfFiles" : {
					"owner": "mjbvz",
					"comment": "Total time for searchSubsetOfFiles to complete",
					"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('embeddingsChunkSearch.perf.searchSubsetOfFiles', {
				status,
				workspaceSearchSource: telemetry.info.callTracker.toString(),
				workspaceSearchCorrelationId: telemetry.info.correlationId,
			}, { execTime });
		});
	}

	private _init?: Promise<void>;
	private async initialize(): Promise<void> {
		this._init ??= (async () => {
			await this._embeddingsIndex.initialize();
			if (this._disposeCts.token.isCancellationRequested) {
				return;
			}

			const limitStatus = await this.checkIndexSizeLimits();
			if (limitStatus) {
				if (limitStatus === LocalEmbeddingsIndexStatus.TooManyFilesForAnyIndexing) {
					this._logService.debug(`EmbeddingsChunkSearch: Disabling all local embedding indexing due to too many files. Found ${this._embeddingsIndex.fileCount} files. Max: ${await this.getManualIndexFileCap()}`);
				} else if (limitStatus === LocalEmbeddingsIndexStatus.TooManyFilesForAutomaticIndexing) {
					this._logService.debug(`EmbeddingsChunkSearch: skipping automatic indexing due to too many files. Found ${this._embeddingsIndex.fileCount} files. Max: ${await this.getAutoIndexFileCap()}`);
				}

				this.setState(limitStatus);
				return;
			}

			this._logService.debug(`EmbeddingsChunkSearch: initialize found ${this._embeddingsIndex.fileCount} files. Max: ${await this.getAutoIndexFileCap()}`);
			this.setState(LocalEmbeddingsIndexStatus.Ready);
		})();
		await this._init;
	}

	private async checkIndexSizeLimits(): Promise<LocalEmbeddingsIndexStatus | undefined> {
		// First check if we have too many files to do any indexing
		const manualEmbeddingsCacheFileCap = await this.getManualIndexFileCap();
		if (this._embeddingsIndex.fileCount > manualEmbeddingsCacheFileCap) {
			return LocalEmbeddingsIndexStatus.TooManyFilesForAnyIndexing;
		}

		// Then see if we can still trigger automatically
		const autoFileCap = await this.getAutoIndexFileCap();
		if (this._embeddingsIndex.fileCount > autoFileCap) {
			const hasRequestedManualIndexing = this._extensionContext.workspaceState.get(this._hasRequestedManualIndexingKey, false);
			if (!hasRequestedManualIndexing) {
				return LocalEmbeddingsIndexStatus.TooManyFilesForAutomaticIndexing;
			}
		}

		return undefined;
	}

	private _initialIndexing?: Promise<void>;
	private async doInitialIndexing(trigger: BuildIndexTriggerReason, telemetryInfo: TelemetryCorrelationId): Promise<void> {
		this._initialIndexing ??= (async () => {
			await this.initialize();

			if (this._state === LocalEmbeddingsIndexStatus.TooManyFilesForAnyIndexing
				|| this._state === LocalEmbeddingsIndexStatus.TooManyFilesForAutomaticIndexing
			) {
				return;
			}

			// Kick off indexing but don't block on it by waiting
			this.triggerIndexingOfWorkspace(trigger, telemetryInfo.addCaller('EmbeddingsChunkSearch::doInitialIndexing'));

			this.registerAutomaticReindexListeners();
		})();
		await this._initialIndexing;
	}

	private async triggerIndexingOfWorkspace(trigger: BuildIndexTriggerReason, telemetryInfo: TelemetryCorrelationId): Promise<void> {
		this._logService.debug('EmbeddingsChunkSearch::triggerIndexingOfWorkspace()');
		this.setState(LocalEmbeddingsIndexStatus.UpdatingIndex);

		try {
			await this._embeddingsIndex.triggerIndexingOfWorkspace(trigger, telemetryInfo, this._disposeCts.token);
			this.setState(LocalEmbeddingsIndexStatus.Ready);
			this._logService.debug('Workspace Chunk Embeddings Index initialized.');
		} catch (e) {
			this._logService.warn(`Failed to index workspace: ${e}`);
		}
	}

	private registerAutomaticReindexListeners() {
		this._reindexDisposables.clear();
		dispose(this._reindexRequests.values());
		this._reindexRequests.clear();

		const updateIndexState = async () => {
			const limitStatus = await this.checkIndexSizeLimits();
			if (limitStatus) {
				this.setState(limitStatus);
			}
		};

		this._reindexDisposables.add(this._workspaceIndex.onDidCreateFiles(async _uris => {
			updateIndexState();
		}));

		this._reindexDisposables.add(this._workspaceIndex.onDidDeleteFiles(uris => {
			for (const uri of uris) {
				this._reindexRequests.get(uri)?.dispose();
				this._reindexRequests.delete(uri);
			}

			updateIndexState();
		}));
	}

	private async getAutoIndexFileCap() {
		if (await this.getExpandedClientSideIndexingStatus() === 'enabled') {
			return this._experimentationService.getTreatmentVariable<number>('workspace.expandedEmbeddingsCacheFileCap') ?? EmbeddingsChunkSearch.defaultExpandedAutomaticIndexingFileCap;
		}

		return this._experimentationService.getTreatmentVariable<number>('workspace.embeddingsCacheFileCap') ?? EmbeddingsChunkSearch.defaultAutomaticIndexingFileCap;
	}

	private async getManualIndexFileCap() {
		let manualCap = this._experimentationService.getTreatmentVariable<number>('workspace.manualEmbeddingsCacheFileCap') ?? EmbeddingsChunkSearch.defaultManualIndexingFileCap;

		if (await this.getExpandedClientSideIndexingStatus() === 'available') {
			manualCap = this._experimentationService.getTreatmentVariable<number>('workspace.expandedEmbeddingsCacheFileCap') ?? EmbeddingsChunkSearch.defaultExpandedAutomaticIndexingFileCap;
		}

		// The manual cap should never be lower than the auto cap
		return Math.max(manualCap, await this.getAutoIndexFileCap());
	}

	private async getExpandedClientSideIndexingStatus(): Promise<'enabled' | 'available' | 'disabled'> {
		try {
			const token = await this._authService.getCopilotToken();
			if (!token?.isExpandedClientSideIndexingEnabled()) {
				return 'disabled';
			}
		} catch {
			// noop
		}

		const cache = this._extensionContext.workspaceState.get<boolean | undefined>(this._hasPromptedExpandedIndexingKey);
		return cache === true ? 'enabled' : 'available';
	}


	private setState(status: LocalEmbeddingsIndexStatus): void {
		if (this._state !== status) {
			this._state = status;
			this._onDidChangeIndexState.fire();
		}
	}

	public tryTriggerReindexing(uris: readonly URI[], telemetryInfo: TelemetryCorrelationId): void {
		if (this._state === LocalEmbeddingsIndexStatus.TooManyFilesForAnyIndexing
			|| this._state === LocalEmbeddingsIndexStatus.TooManyFilesForAutomaticIndexing
		) {
			return;
		}

		for (const uri of uris) {
			let delayer = this._reindexRequests.get(uri);
			if (!delayer) {
				delayer = new Delayer<void>(0);
				this._reindexRequests.set(uri, delayer);
			}

			delayer.trigger(async () => {
				await this.initialize();

				if (this._state === LocalEmbeddingsIndexStatus.TooManyFilesForAnyIndexing
					|| this._state === LocalEmbeddingsIndexStatus.TooManyFilesForAutomaticIndexing
				) {
					return;
				}

				return this._embeddingsIndex.triggerIndexingOfFile(uri, telemetryInfo.addCaller('EmbeddingChunkSearch::tryTriggerReindexing'), this._disposeCts.token);
			}, 0);
		}
	}
}
