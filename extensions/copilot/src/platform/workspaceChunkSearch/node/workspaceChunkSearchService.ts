/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { createFencedCodeBlock, getLanguageId } from '../../../util/common/markdown';
import { Result } from '../../../util/common/result';
import { createServiceIdentifier } from '../../../util/common/services';
import { TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { raceCancellationError } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { CancellationError, isCancellationError } from '../../../util/vs/base/common/errors';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseProgressPart2, ChatResponseWarningPart } from '../../../vscodeTypes';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { FileChunk, FileChunkAndScore } from '../../chunking/common/chunk';
import { MAX_CHUNK_SIZE_TOKENS } from '../../chunking/node/naiveChunker';
import { distance, Embedding, EmbeddingDistance, Embeddings, EmbeddingType, IEmbeddingsComputer } from '../../embeddings/common/embeddingsComputer';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { IIgnoreService } from '../../ignore/common/ignoreService.js';
import { logExecTime, LogExecTime } from '../../log/common/logExecTime';
import { ILogService } from '../../log/common/logService';
import { IChatEndpoint } from '../../networking/common/networking';
import { ISimulationTestContext } from '../../simulationTestContext/common/simulationTestContext';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { getWorkspaceFileDisplayPath, IWorkspaceService } from '../../workspace/common/workspaceService';
import { IGithubAvailableEmbeddingTypesService } from '../common/githubAvailableEmbeddingTypes';
import { IRerankerService } from '../common/rerankerService';
import { StrategySearchResult, StrategySearchSizing, WorkspaceChunkQuery, WorkspaceChunkQueryWithEmbeddings, WorkspaceChunkSearchOptions, WorkspaceSearchAlert } from '../common/workspaceChunkSearch';
import { CodeSearchChunkSearch, CodeSearchRemoteIndexState } from './codeSearch/codeSearchChunkSearch';
import { BuildIndexTriggerReason, TriggerIndexingError } from './codeSearch/codeSearchRepo';
import { IWorkspaceFileIndex } from './workspaceFileIndex';

const maxEmbeddingSpread = 0.65;

interface ScoredFileChunk<T extends FileChunk = FileChunk> {
	readonly chunk: T;
	readonly distance: EmbeddingDistance;
}

export interface WorkspaceChunkSearchResult {
	readonly chunks: readonly FileChunkAndScore[];
	readonly alerts?: readonly WorkspaceSearchAlert[];
}

export interface WorkspaceChunkSearchSizing {
	readonly endpoint: IChatEndpoint;
	readonly tokenBudget: number | undefined;
	readonly maxResults: number | undefined;
}

export interface WorkspaceIndexState {
	readonly remoteIndexState: CodeSearchRemoteIndexState;
}

export const IWorkspaceChunkSearchService = createServiceIdentifier<IWorkspaceChunkSearchService>('IWorkspaceChunkSearchService');

export interface IWorkspaceChunkSearchService extends IDisposable {
	readonly _serviceBrand: undefined;

	readonly onDidChangeIndexState: Event<void>;

	getIndexState(): Promise<WorkspaceIndexState>;

	isAvailable(): Promise<boolean>;

	searchFileChunks(
		sizing: WorkspaceChunkSearchSizing,
		query: WorkspaceChunkQuery,
		options: WorkspaceChunkSearchOptions,
		telemetryInfo: TelemetryCorrelationId,
		progress: vscode.Progress<vscode.ChatResponsePart> | undefined,
		token: CancellationToken,
	): Promise<WorkspaceChunkSearchResult>;

	triggerIndexing(trigger: BuildIndexTriggerReason, onProgress: (message: string) => void, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<Result<true, TriggerIndexingError>>;

	deleteExternalIngestWorkspaceIndex(): Promise<void>;
}


interface StrategySearchErr {
	readonly errorDiagMessage: string;
	alerts?: readonly WorkspaceSearchAlert[];
}

type StrategySearchOutcome = Result<StrategySearchResult, StrategySearchErr>;

export class WorkspaceChunkSearchService extends Disposable implements IWorkspaceChunkSearchService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeIndexState = this._register(new Emitter<void>());
	readonly onDidChangeIndexState = this._onDidChangeIndexState.event;

	private _impl: WorkspaceChunkSearchServiceImpl | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IGithubAvailableEmbeddingTypesService private readonly _availableEmbeddingTypes: IGithubAvailableEmbeddingTypesService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this.tryInit(true);

		this._register(this._authenticationService.onDidAuthenticationChange(() => {
			this.tryInit(true);
		}));
	}

	private async tryInit(silent: boolean): Promise<WorkspaceChunkSearchServiceImpl | undefined> {
		if (!this._authenticationService.copilotToken || this._authenticationService.copilotToken.isNoAuthUser) {
			return undefined;
		}

		if (this._impl) {
			return this._impl;
		}

		try {
			const best = await this._availableEmbeddingTypes.getPreferredType(silent);
			// Double check that we haven't initialized in the meantime
			if (this._impl) {
				return this._impl;
			}

			if (best) {
				this._logService.info(`WorkspaceChunkSearchService: using embedding type ${best}`);
				this._impl = this._register(this._instantiationService.createInstance(WorkspaceChunkSearchServiceImpl, best));
				this._register(this._impl.onDidChangeIndexState(() => this._onDidChangeIndexState.fire()));
				this._onDidChangeIndexState.fire();

				return this._impl;
			}
		} catch {
			return undefined;
		}
	}

	async getIndexState(): Promise<WorkspaceIndexState> {
		const impl = await this.tryInit(true);
		if (!impl) {
			return {
				remoteIndexState: {
					status: 'disabled',
					repos: [],
				},
			};
		}

		return impl.getIndexState();
	}

	async isAvailable(): Promise<boolean> {
		if (!this._impl) {
			return false;
		}

		return this._impl.isAvailable();
	}

	async searchFileChunks(sizing: WorkspaceChunkSearchSizing, query: WorkspaceChunkQuery, options: WorkspaceChunkSearchOptions, telemetryInfo: TelemetryCorrelationId, progress: vscode.Progress<vscode.ChatResponsePart> | undefined, token: CancellationToken): Promise<WorkspaceChunkSearchResult> {
		const impl = await this.tryInit(false);
		if (!impl) {
			throw new Error('Workspace chunk search service not available');
		}
		return impl.searchFileChunks(sizing, query, options, telemetryInfo, progress, token);
	}

	async triggerIndexing(trigger: BuildIndexTriggerReason, onProgress: (message: string) => void, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<Result<true, TriggerIndexingError>> {
		const impl = await raceCancellationError(this.tryInit(false), token);
		if (!impl) {
			throw new Error('Workspace chunk search service not available');
		}
		return impl.triggerIndexing(trigger, onProgress, telemetryInfo, token);
	}

	async deleteExternalIngestWorkspaceIndex(): Promise<void> {
		const impl = await this.tryInit(false);
		if (!impl) {
			throw new Error('Workspace chunk search service not available');
		}
		return impl.deleteExternalIngestWorkspaceIndex();
	}
}

class WorkspaceChunkSearchServiceImpl extends Disposable implements IWorkspaceChunkSearchService {

	declare readonly _serviceBrand: undefined;

	private readonly shouldEagerlyIndexKey = 'workspaceChunkSearch.shouldEagerlyIndex';

	private readonly _codeSearchChunkSearch: CodeSearchChunkSearch;

	private readonly _onDidChangeIndexState = this._register(new Emitter<void>());
	readonly onDidChangeIndexState = this._onDidChangeIndexState.event;

	constructor(
		private readonly _embeddingType: EmbeddingType,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEmbeddingsComputer private readonly _embeddingsComputer: IEmbeddingsComputer,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@ILogService private readonly _logService: ILogService,
		@IRerankerService private readonly _rerankerService: IRerankerService,
		@ISimulationTestContext private readonly _simulationTestContext: ISimulationTestContext,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@IWorkspaceFileIndex private readonly _workspaceFileIndex: IWorkspaceFileIndex,
	) {
		super();

		this._codeSearchChunkSearch = this._register(instantiationService.createInstance(CodeSearchChunkSearch, this._embeddingType));

		this._register(
			Event.debounce(
				this._codeSearchChunkSearch.onDidChangeIndexState,
				() => { },
				250
			)(() => this._onDidChangeIndexState.fire()));

		/* __GDPR__
			"workspaceChunkSearch.created" : {
				"owner": "mjbvz",
				"comment": "Metadata about workspace chunk search",
				"embeddingType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Type of embeddings used" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('workspaceChunkSearch.created', {
			embeddingType: this._embeddingType.id,
		});
	}

	async getIndexState(): Promise<WorkspaceIndexState> {
		return {
			remoteIndexState: this._codeSearchChunkSearch.getRemoteIndexState(),
		};
	}

	async isAvailable(): Promise<boolean> {
		return this._codeSearchChunkSearch.isAvailable(new TelemetryCorrelationId('WorkspaceChunkSearchServiceImpl.isAvailable'), false, CancellationToken.None);
	}

	triggerIndexing(trigger: BuildIndexTriggerReason, onProgress: (message: string) => void, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<Result<true, TriggerIndexingError>> {
		return this._codeSearchChunkSearch.triggerIndexing(trigger, onProgress, telemetryInfo, token);
	}

	deleteExternalIngestWorkspaceIndex(): Promise<void> {
		return this._codeSearchChunkSearch.deleteExternalIngestWorkspaceIndex(
			new TelemetryCorrelationId('WorkspaceChunkSearchService::deleteExternalIngestWorkspaceIndex'),
			CancellationToken.None);
	}

	async searchFileChunks(
		sizing: WorkspaceChunkSearchSizing,
		query: WorkspaceChunkQuery,
		options: WorkspaceChunkSearchOptions,
		telemetryInfo: TelemetryCorrelationId,
		progress: vscode.Progress<vscode.ChatResponsePart> | undefined,
		token: CancellationToken
	): Promise<WorkspaceChunkSearchResult> {
		const wasFirstSearchInWorkspace = !this._extensionContext.workspaceState.get(this.shouldEagerlyIndexKey, false);
		this._extensionContext.workspaceState.update(this.shouldEagerlyIndexKey, true);

		return logExecTime(this._logService, 'WorkspaceChunkSearch.searchFileChunks', async (): Promise<WorkspaceChunkSearchResult> => {
			// Kick off (but do not wait on) query embedding resolve as soon as possible because almost all strategies will ultimately need it
			const queryWithEmbeddings = this.toQueryWithEmbeddings(query, token);

			const stratSizing: StrategySearchSizing = {
				endpoint: sizing.endpoint,
				tokenBudget: sizing.tokenBudget,
				maxResultCountHint: this.getMaxChunks(sizing),
			};

			const searchTask = this.doSearchFileChunks(stratSizing, queryWithEmbeddings, options, telemetryInfo, token);
			progress?.report(new ChatResponseProgressPart2(l10n.t('Collecting workspace information'), async () => { await searchTask; }));
			const searchSw = new StopWatch();
			const searchResult = await raceCancellationError(searchTask, token);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			/* __GDPR__
				"workspaceChunkSearchStrategy" : {
					"owner": "mjbvz",
					"comment": "Understanding which workspace chunk search strategy is used",
					"strategy": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chosen strategy" },
					"errorDiagMessage": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The reason why the search failed" },
					"embeddingType": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "The type of embeddings used" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total time in ms for workspace chunk search" },
					"workspaceIndexFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of files in our workspace index" },
					"wasFirstSearchInWorkspace": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Tracks if this was the first time we triggered a workspace search" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('workspaceChunkSearchStrategy', {
				strategy: searchResult.isOk() ? 'codesearch' : 'none', // For backwards compatibility with existing telemetry only
				errorDiagMessage: searchResult.isError() ? searchResult.err.errorDiagMessage : undefined,
				embeddingType: this._embeddingType.id,
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			}, {
				execTime: searchSw.elapsed(),
				workspaceIndexFileCount: this._workspaceFileIndex.fileCount,
				wasFirstSearchInWorkspace: wasFirstSearchInWorkspace ? 1 : 0,
			});

			if (searchResult.isError()) {
				this._logService.error(`WorkspaceChunkSearch.searchFileChunks: no strategies succeeded`);
				if (this._simulationTestContext.isInSimulationTests) {
					throw new Error('All workspace search strategies failed');
				}

				return {
					chunks: [],
					alerts: searchResult.err.alerts,
				};
			}

			this._logService.trace(`WorkspaceChunkSearch.searchFileChunks: found ${searchResult.val.chunks.length} chunks`);

			const filteredChunks = await raceCancellationError(this.filterIgnoredChunks(searchResult.val.chunks), token);
			if (this._simulationTestContext.isInSimulationTests) {
				if (!filteredChunks.length) {
					throw new Error('No chunks returned');
				}
			}

			const filteredResult = {
				...searchResult.val,
				result: {
					alerts: searchResult.val.alerts,
					chunks: filteredChunks,
				}
			};

			// If explicit rerank is enabled, use the remote reranker
			if (options.enableRerank && this._rerankerService.isAvailable) {
				try {
					const reranked = await this._rerankerService.rerank(query.queryText, filteredResult.result.chunks, token);
					return {
						chunks: reranked.slice(0, this.getMaxChunks(sizing)),
						alerts: filteredResult.result.alerts,
					};
				} catch (e) {
					this._logService.error(e, 'Reranker service failed; falling back to local rerank');
				}
			}

			return this.rerankResultIfNeeded(queryWithEmbeddings, filteredResult, this.getMaxChunks(sizing), telemetryInfo, progress, token);
		}, (execTime, status) => {
			/* __GDPR__
				"workspaceChunkSearch.perf.searchFileChunks" : {
					"owner": "mjbvz",
					"comment": "Total time for searchFileChunks to complete",
					"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
					"embeddingType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Type of embeddings used" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('workspaceChunkSearch.perf.searchFileChunks', {
				status,
				embeddingType: this._embeddingType.id,
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			}, {
				execTime
			});
		});
	}

	private toQueryWithEmbeddings(query: WorkspaceChunkQuery, token: CancellationToken): WorkspaceChunkQueryWithEmbeddings {
		const queryEmbeddings: Promise<Embedding> = logExecTime(this._logService, 'WorkspaceChunkSearch.resolveQueryEmbeddings', async () => {
			const result = await this.computeEmbeddings('query', [query.queryText], token);
			const first = result.values.at(0);
			if (!first) {
				throw new Error('Could not resolve query embeddings');
			}
			return first;
		});

		return {
			...query,
			resolveQueryEmbeddings: (_token) => queryEmbeddings
		};
	}

	private async doSearchFileChunks(
		sizing: StrategySearchSizing,
		query: WorkspaceChunkQueryWithEmbeddings,
		options: WorkspaceChunkSearchOptions,
		telemetryInfo: TelemetryCorrelationId,
		token: CancellationToken,
	): Promise<StrategySearchOutcome> {
		this._logService.debug(`Searching for ${sizing.maxResultCountHint} chunks in workspace`);

		try {
			await raceCancellationError(this._codeSearchChunkSearch.prepareSearchWorkspace(telemetryInfo, token), token);

			const result = await raceCancellationError(this._codeSearchChunkSearch.searchWorkspace(sizing, query, options, telemetryInfo, token), token);
			if (result) {
				return Result.ok<StrategySearchResult>(result);
			}
		} catch (e) {
			if (isCancellationError(e)) {
				throw e;
			}

			this._logService.error(e, `Error during code search chunk search`);
		}

		return Result.error<StrategySearchErr>({
			errorDiagMessage: 'semantic search not available',
			alerts: [new ChatResponseWarningPart(l10n.t('Semantic search is not available for this workspace.'))],
		});
	}

	private getMaxChunks(sizing: WorkspaceChunkSearchSizing): number {
		let maxResults: number | undefined;
		if (typeof sizing.tokenBudget === 'number') {
			maxResults = Math.floor(sizing.tokenBudget / MAX_CHUNK_SIZE_TOKENS);
		}

		if (typeof sizing.maxResults === 'number') {
			maxResults = typeof maxResults === 'number' ? Math.min(sizing.maxResults, maxResults) : sizing.maxResults;
		}

		if (typeof maxResults !== 'number') {
			throw new Error('Either maxResults or tokenBudget must be provided');
		}

		return maxResults;
	}

	private async filterIgnoredChunks(chunks: readonly FileChunkAndScore[]): Promise<FileChunkAndScore[]> {
		return coalesce(await Promise.all(chunks.map(async (entry) => {
			const isIgnored = await this._ignoreService.isCopilotIgnored(entry.chunk.file);
			return isIgnored ? null : entry;
		})));
	}

	@LogExecTime(self => self._logService, 'WorkspaceChunkSearch::rerankResultIfNeeded')
	private async rerankResultIfNeeded(query: WorkspaceChunkQueryWithEmbeddings, result: StrategySearchResult, maxResults: number, telemetryInfo: TelemetryCorrelationId, progress: vscode.Progress<vscode.ChatResponsePart> | undefined, token: CancellationToken): Promise<WorkspaceChunkSearchResult> {
		const chunks = result.chunks;
		const orderedChunks = await this.rerankChunks(query, chunks, maxResults, telemetryInfo, progress, token);
		return {
			chunks: orderedChunks,
			alerts: result.alerts,
		};
	}

	@LogExecTime(self => self._logService, 'WorkspaceChunkSearch::rerankChunks')
	private async rerankChunks(query: WorkspaceChunkQueryWithEmbeddings, inChunks: readonly FileChunkAndScore[], maxResults: number, telemetryInfo: TelemetryCorrelationId, progress: vscode.Progress<vscode.ChatResponsePart> | undefined, token: CancellationToken): Promise<FileChunkAndScore[]> {
		if (!inChunks.length) {
			return [];
		}

		try {
			let sortedChunks: ScoredFileChunk<FileChunk>[];

			// Handle special case where all chunks have the same embedding type even if this doesn't match the current embedding type.
			// Since we don't care about raw scores, we'll sort them by the distance value instead of recomputing the embeddings.
			const firstChunkEmbeddingType = inChunks.at(0)?.distance?.embeddingType;
			if (firstChunkEmbeddingType && inChunks.every(x => typeof x.distance !== 'undefined' && x.distance.embeddingType.equals(firstChunkEmbeddingType))) {
				sortedChunks = [...inChunks as Array<ScoredFileChunk<FileChunk>>]
					.sort((a, b) => b.distance!.value - a.distance!.value);
			} else {
				// In this case, we are either missing a distance value or have a mix of embedding types
				const chunksPlusIndexes = inChunks.map((x, i) => ({ ...x.chunk, distance: x.distance, index: i }));

				const unscoredChunks = chunksPlusIndexes.filter(entry => typeof entry.distance === 'undefined' || !entry.distance.embeddingType.equals(this._embeddingType));
				let newlyScoredChunks: Array<ScoredFileChunk<FileChunk & { index: number }>> | undefined;

				if (unscoredChunks.length) {
					this._logService.debug(`WorkspaceChunkSearch.rerankChunks. Scoring ${unscoredChunks.length} new chunks`);

					// Only show progress when we're doing a potentially long running operation
					const scoreTask = this.scoreChunks(query, unscoredChunks, telemetryInfo, token);
					progress?.report(new ChatResponseProgressPart2(l10n.t('Filtering to most relevant information'), async () => { await scoreTask; }));
					newlyScoredChunks = await raceCancellationError(scoreTask, token);
				}

				const out: ScoredFileChunk[] = [];
				for (let i = 0; i < inChunks.length; i++) {
					const entry = inChunks[i];
					if (typeof entry.distance !== 'undefined') {
						out[i] = { chunk: entry.chunk, distance: entry.distance };
					}
				}

				for (const entry of newlyScoredChunks ?? []) {
					out[entry.chunk.index] = entry;
				}

				for (let i = 0; i < inChunks.length; i++) {
					if (!out[i]) {
						this._logService.error(`Missing out chunk ${i}`);
					}
				}

				sortedChunks = out
					.filter(chunk => chunk?.distance?.embeddingType.equals(this._embeddingType))
					.sort((a, b) => b.distance.value - a.distance.value);
			}

			if (!sortedChunks.length) {
				return sortedChunks;
			}

			sortedChunks = sortedChunks.slice(0, maxResults);

			// Filter out low quality results based on the top result
			const topScore = sortedChunks[0].distance.value;
			const lowestAllowedScore = topScore * maxEmbeddingSpread;
			const filteredChunks = sortedChunks.filter(x => x.distance.value >= lowestAllowedScore);
			this._logService.debug(`Eagerly filtered out ${sortedChunks.length - filteredChunks.length} chunks due to low quality`);
			return filteredChunks;
		} catch (e) {
			if (!isCancellationError(e)) {
				this._logService.error(e, 'Failed to search chunk embeddings index');
			}
			return inChunks.slice(0, maxResults);
		}
	}

	private async scoreChunks<T extends FileChunk>(
		query: WorkspaceChunkQueryWithEmbeddings,
		chunks: readonly T[],
		telemetryInfo: TelemetryCorrelationId,
		token: CancellationToken,
	): Promise<ScoredFileChunk<T>[]> {
		return logExecTime(this._logService, 'WorkspaceChunkSearch.scoreChunks', async () => {
			if (!chunks.length) {
				return [];
			}

			const chunkStrings = chunks.map(chunk => this.chunkToIndexString(chunk));

			const [queryEmbeddings, chunkEmbeddings] = await raceCancellationError(Promise.all([
				query.resolveQueryEmbeddings(token),
				this.computeEmbeddings('document', chunkStrings, token)
			]), token);

			return chunkEmbeddings.values.map((embedding, index): ScoredFileChunk<T> => ({
				chunk: chunks[index],
				distance: distance(queryEmbeddings, embedding),
			}));
		}, (execTime, status) => {
			/* __GDPR__
				"workspaceChunkSearch.perf.adaRerank" : {
					"owner": "mjbvz",
					"comment": "Understanding how effective ADA re-ranking is",
					"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
					"embeddingType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Type of embeddings used" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('workspaceChunkSearch.perf.adaRerank', {
				status,
				embeddingType: this._embeddingType.id,
				workspaceSearchSource: telemetryInfo.callTracker,
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			}, { execTime });
		});
	}

	private computeEmbeddings(inputType: 'query' | 'document', strings: readonly string[], token: CancellationToken): Promise<Embeddings> {
		return this._embeddingsComputer.computeEmbeddings(this._embeddingType, strings, { inputType }, new TelemetryCorrelationId('WorkspaceChunkSearchService::computeEmbeddings'), token);
	}

	/**
	 * Get the string used to used to calculate embeddings for a chunk.
	 */
	private chunkToIndexString(chunk: FileChunk): string {
		// TODO: could performance be improved here if we process chunks per file first?
		const displayPath = getWorkspaceFileDisplayPath(this._workspaceService, chunk.file);
		return this.toStringForEmbeddingsComputer(chunk, displayPath);
	}

	private toStringForEmbeddingsComputer(chunk: FileChunk, displayPath: string) {
		return `File: \`${displayPath}\`\n${createFencedCodeBlock(getLanguageId(chunk.file), chunk.text)}`;
	}
}

export class NullWorkspaceChunkSearchService implements IWorkspaceChunkSearchService {
	_serviceBrand: undefined;
	onDidChangeIndexState: Event<void> = Event.None;
	isAvailable(): Promise<boolean> {
		return Promise.resolve(false);
	}
	getIndexState(): Promise<WorkspaceIndexState> {
		throw new Error('Method not implemented.');
	}
	searchFileChunks(sizing: WorkspaceChunkSearchSizing, query: WorkspaceChunkQuery, options: WorkspaceChunkSearchOptions, telemetryInfo: TelemetryCorrelationId, progress: vscode.Progress<vscode.ChatResponsePart> | undefined, token: CancellationToken): Promise<WorkspaceChunkSearchResult> {
		throw new Error('Method not implemented.');
	}
	triggerIndexing(_trigger?: BuildIndexTriggerReason, _onProgress?: (message: string) => void, _telemetryInfo?: TelemetryCorrelationId, _token?: CancellationToken): Promise<Result<true, TriggerIndexingError>> {
		return Promise.resolve(Result.ok(true));
	}
	deleteExternalIngestWorkspaceIndex(): Promise<void> {
		return Promise.resolve();
	}
	dispose(): void {
		// noop
	}
}

