/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import { GlobIncludeOptions, shouldInclude } from '../../../util/common/glob';
import { CallTracker, TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { Limiter, raceCancellationError, raceTimeout } from '../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { CancellationError } from '../../../util/vs/base/common/errors';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Lazy } from '../../../util/vs/base/common/lazy';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { extname } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { FileChunk, FileChunkAndScore, FileChunkWithEmbedding, FileChunkWithOptionalEmbedding } from '../../chunking/common/chunk';
import { ComputeBatchInfo, EmbeddingsComputeQos, IChunkingEndpointClient } from '../../chunking/common/chunkingEndpointClient';
import { distance, Embedding, EmbeddingType, rankEmbeddings } from '../../embeddings/common/embeddingsComputer';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { logExecTime } from '../../log/common/logExecTime';
import { ILogService } from '../../log/common/logService';
import { ISimulationTestContext } from '../../simulationTestContext/common/simulationTestContext';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { WorkspaceChunkSearchOptions } from '../common/workspaceChunkSearch';
import { BuildIndexTriggerReason } from './codeSearch/codeSearchRepo';
import { createWorkspaceChunkAndEmbeddingCache, IWorkspaceChunkAndEmbeddingCache } from './workspaceChunkAndEmbeddingCache';
import { FileRepresentation, IWorkspaceFileIndex } from './workspaceFileIndex';


export interface WorkspaceChunkEmbeddingsIndexState {
	readonly indexedFileCount: number;
	readonly totalFileCount: number;
}

/**
 * Maximum number of concurrent file processing operations during indexing and embedding.
 */
const maxParallelEmbeddingOps = 50;

export class WorkspaceChunkEmbeddingsIndex extends Disposable {

	private readonly _cache: Lazy<Promise<IWorkspaceChunkAndEmbeddingCache>>;

	private readonly _onDidChangeWorkspaceIndexState = this._register(new Emitter<void>());
	public readonly onDidChangeWorkspaceIndexState = Event.debounce(this._onDidChangeWorkspaceIndexState.event, () => { }, 2500, undefined, undefined, undefined, this._store);

	private readonly _cacheRoot: URI | undefined;

	private readonly _onDisposeCts = this._register(new CancellationTokenSource());

	private _isDisposed = false;

	constructor(
		private readonly _embeddingType: EmbeddingType,
		@IVSCodeExtensionContext vsExtensionContext: IVSCodeExtensionContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@ISimulationTestContext private readonly _simulationTestContext: ISimulationTestContext,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWorkspaceFileIndex private readonly _workspaceIndex: IWorkspaceFileIndex,
		@IChunkingEndpointClient private readonly _chunkingEndpointClient: IChunkingEndpointClient,
	) {
		super();

		this._cacheRoot = vsExtensionContext.storageUri;

		this._cache = new Lazy(async () => {
			const cache = this._register(await instantiationService.invokeFunction(accessor => createWorkspaceChunkAndEmbeddingCache(accessor, this._embeddingType, this._cacheRoot, this._workspaceIndex, this._onDisposeCts.token)));

			// Make sure we dispose the cache if the index is disposed while the cache is still initializing
			if (this._isDisposed) {
				cache.dispose();
			}

			this._onDidChangeWorkspaceIndexState.fire();
			return cache;
		});

		this._register(Event.any(
			this._workspaceIndex.onDidChangeFiles,
			this._workspaceIndex.onDidCreateFiles,
			this._workspaceIndex.onDidDeleteFiles,
		)(() => {
			this._onDidChangeWorkspaceIndexState.fire();
		}));
	}

	override dispose(): void {
		this._isDisposed = true;
		this._onDisposeCts.cancel();
		super.dispose();
	}

	async getIndexState(): Promise<WorkspaceChunkEmbeddingsIndexState | undefined> {
		if (!this._cache.hasValue) {
			return undefined;
		}

		const cache = await this._cache.value;
		const allWorkspaceFiles = Array.from(this._workspaceIndex.values());

		let indexedCount = 0;
		await Promise.all(allWorkspaceFiles.map(async file => {
			if (await cache.isIndexed(file)) {
				indexedCount++;
			}
		}));

		return {
			totalFileCount: allWorkspaceFiles.length,
			indexedFileCount: indexedCount,
		};
	}

	get fileCount(): number {
		return this._workspaceIndex.fileCount;
	}

	public async isUpToDateAndIndexed(uri: URI): Promise<boolean> {
		const fileRep = this._workspaceIndex.get(uri);
		if (!fileRep) {
			return false;
		}

		const cache = await this._cache.value;
		return cache.isIndexed(fileRep);
	}

	private _initializePromise?: Promise<void>;
	initialize(): Promise<void> {
		this._initializePromise ??= this._workspaceIndex.initialize();
		return this._initializePromise;
	}

	async triggerIndexingOfWorkspace(trigger: BuildIndexTriggerReason, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<void> {
		return logExecTime(this._logService, 'WorkspaceChunkEmbeddingIndex.triggerIndexingOfWorkspace', async () => {
			await raceCancellationError(this._workspaceIndex.initialize(), token);

			await this.indexAllWorkspaceFiles(trigger, {}, telemetryInfo.addCaller('WorkspaceChunkEmbeddingIndex::triggerIndexingOfWorkspace'), token);
		}, (execTime, status) => {
			/* __GDPR__
				"workspaceChunkEmbeddingsIndex.perf.triggerIndexingOfWorkspace" : {
					"owner": "mjbvz",
					"comment": "Total time for triggerIndexingOfWorkspace to complete",
					"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
					"trigger": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "What triggered the call" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('workspaceChunkEmbeddingsIndex.perf.triggerIndexingOfWorkspace', {
				status,
				trigger,
			}, { execTime });
		});
	}

	async triggerIndexingOfFile(uri: URI, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<void> {
		if (!await this._workspaceIndex.shouldIndexWorkspaceFile(uri, token)) {
			return;
		}

		await raceCancellationError(this._workspaceIndex.initialize(), token);

		const file = this._workspaceIndex.get(uri);
		if (!file) {
			return;
		}

		const authToken = (await this._authService.getGitHubSession('any', { silent: true }))?.accessToken;
		if (authToken) {
			await this.getChunksAndEmbeddings(authToken, file, new ComputeBatchInfo(), EmbeddingsComputeQos.Batch, telemetryInfo.callTracker.add('WorkspaceChunkEmbeddingsIndex::triggerIndexingOfFile'), token);
		}
	}

	async searchWorkspace(
		query: Promise<Embedding>,
		maxResults: number,
		options: WorkspaceChunkSearchOptions,
		telemetryInfo: TelemetryCorrelationId,
		token: CancellationToken,
	): Promise<FileChunkAndScore[]> {
		return logExecTime(this._logService, 'WorkspaceChunkEmbeddingIndex.searchWorkspace', async () => {
			const [queryEmbedding, fileChunksAndEmbeddings] = await raceCancellationError(Promise.all([
				query,
				this.getAllWorkspaceEmbeddings('manual', options.globPatterns ?? {}, telemetryInfo, token)
			]), token);

			return this.rankEmbeddings(queryEmbedding, fileChunksAndEmbeddings, maxResults);
		}, (execTime, status) => {
			/* __GDPR__
				"workspaceChunkEmbeddingsIndex.perf.searchWorkspace" : {
					"owner": "mjbvz",
					"comment": "Total time for searchWorkspace to complete",
					"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('workspaceChunkEmbeddingsIndex.perf.searchWorkspace', {
				status,
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			}, { execTime });
		});
	}

	async searchSubsetOfFiles(
		files: readonly URI[],
		query: Promise<Embedding>,
		maxResults: number,
		options: WorkspaceChunkSearchOptions,
		telemetry: { info: TelemetryCorrelationId; batchInfo?: ComputeBatchInfo },
		token: CancellationToken,
	): Promise<FileChunkAndScore[]> {
		return logExecTime(this._logService, 'WorkspaceChunkEmbeddingIndex.searchSubsetOfFiles', async () => {
			const [queryEmbedding, fileChunksAndEmbeddings] = await raceCancellationError(Promise.all([
				query,
				this.getEmbeddingsForFiles(files, options.globPatterns ?? {}, EmbeddingsComputeQos.Batch, telemetry, token)
			]), token);

			return this.rankEmbeddings(queryEmbedding, fileChunksAndEmbeddings, maxResults);
		}, (execTime, status) => {
			/* __GDPR__
				"workspaceChunkEmbeddingsIndex.perf.searchSubsetOfFiles" : {
					"owner": "mjbvz",
					"comment": "Total time for searchSubsetOfFiles to complete",
					"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('workspaceChunkEmbeddingsIndex.perf.searchSubsetOfFiles', {
				status,
				workspaceSearchSource: telemetry.info.callTracker.toString(),
				workspaceSearchCorrelationId: telemetry.info.correlationId,
			}, { execTime });
		});
	}

	public async toSemanticChunks(query: Promise<Embedding>, tfidfResults: readonly FileChunk[], options: { semanticTimeout?: number; telemetryInfo: TelemetryCorrelationId }, token: CancellationToken): Promise<FileChunkAndScore[]> {
		const chunksByFile = new ResourceMap<FileChunk[]>();
		for (const chunk of tfidfResults) {
			const existingChunks = chunksByFile.get(chunk.file);
			if (existingChunks) {
				existingChunks.push(chunk);
			} else {
				chunksByFile.set(chunk.file, [chunk]);
			}
		}

		const authToken = await this.tryGetAuthToken();

		const allResolvedChunks = new Set<FileChunkAndScore>();

		const batchInfo = new ComputeBatchInfo();
		await Promise.all(Array.from(chunksByFile.entries(), async ([uri, chunks]) => {
			const file = this._workspaceIndex.get(uri);
			if (!file) {
				console.error('Could not load file', uri);
				return;
			}

			// TODO scope this to just get embeddings for the desired ranges
			const qos = this._simulationTestContext.isInSimulationTests ? EmbeddingsComputeQos.Batch : EmbeddingsComputeQos.Online;

			let semanticChunks: readonly FileChunkWithOptionalEmbedding[] | undefined;
			if (authToken) {
				const cts = new CancellationTokenSource(token);
				try {
					semanticChunks = await raceTimeout(this.getChunksWithOptionalEmbeddings(authToken, file, batchInfo, qos, options.telemetryInfo.callTracker.add('toSemanticChunks'), cts.token), options.semanticTimeout ?? Infinity, () => cts.cancel());
				} finally {
					cts.dispose();
				}
			}

			const resolvedFileSemanticChunks = new Map<string, FileChunkAndScore>();
			if (!semanticChunks) {
				this._logService.error(`toSemanticChunks - Could not get semantic chunks for ${uri}`);

				for (const chunk of chunks) {
					const key = chunk.range.toString();
					if (!resolvedFileSemanticChunks.has(key)) {
						resolvedFileSemanticChunks.set(key, { chunk, distance: undefined });
					}
				}
			} else {
				for (const chunk of chunks) {
					for (const semanticChunk of semanticChunks) {
						if (semanticChunk.chunk.range.intersectRanges(chunk.range)) {
							const key = semanticChunk.chunk.range.toString();
							resolvedFileSemanticChunks.set(key, {
								chunk: semanticChunk.chunk,
								distance: semanticChunk.embedding ? distance(await query, semanticChunk.embedding) : undefined
							});
						}
					}

					// If we didn't find any semantic chunks we still want to make sure the original chunk is included
					if (!resolvedFileSemanticChunks.size) {
						this._logService.error(`No semantic chunk found for in ${uri} for chunk ${chunk.range}`,);

						const key = chunk.range.toString();
						if (!resolvedFileSemanticChunks.has(key)) {
							resolvedFileSemanticChunks.set(key, { chunk, distance: undefined });
						}

						/* __GDPR__
							"workspaceChunkEmbeddingsIndex.toSemanticChunks.noSemanticChunkFound" : {
								"owner": "mjbvz",
								"comment": "Tracks errors related to mapping to semantic chunks",
								"extname": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The file's extension" },
								"semanticChunkCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of semantic chunks returned" }
							}
						*/
						this._telemetryService.sendMSFTTelemetryEvent('workspaceChunkEmbeddingsIndex.toSemanticChunks.noSemanticChunkFound', {
							extname: extname(file.uri),
						}, {
							semanticChunkCount: semanticChunks.length,
						});
					}
				}
			}

			for (const chunk of resolvedFileSemanticChunks.values()) {
				allResolvedChunks.add(chunk);
			}
		}));

		return Array.from(allResolvedChunks);
	}

	private rankEmbeddings(queryEmbedding: Embedding, fileChunksAndEmbeddings: readonly FileChunkWithEmbedding[], maxResults: number): FileChunkAndScore[] {
		return rankEmbeddings(queryEmbedding, fileChunksAndEmbeddings.map(x => [x.chunk, x.embedding]), maxResults)
			.map((x): FileChunkAndScore => ({ chunk: x.value, distance: x.distance }));
	}

	/**
	 * Index all workspace files without accumulating results. Used by triggerIndexingOfWorkspace
	 * where only the side effect of populating the DB cache matters.
	 */
	private async indexAllWorkspaceFiles(trigger: BuildIndexTriggerReason, include: GlobIncludeOptions, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<void> {
		const allWorkspaceFiles = Array.from(this._workspaceIndex.values());
		const batchInfo = new ComputeBatchInfo();

		// Telemetry event name kept as 'getAllWorkspaceEmbeddings' for dashboard backward compatibility
		return logExecTime(this._logService, 'WorkspaceChunkEmbeddingIndex.indexAllWorkspaceFiles', async () => {
			const authToken = trigger === 'auto'
				? (await this._authService.getGitHubSession('any', { silent: true }))?.accessToken
				: (await this._authService.getGitHubSession('any', { createIfNone: { detail: l10n.t('Sign in to GitHub to index workspace files.') } }))?.accessToken;
			if (!authToken) {
				throw new Error('Unable to get auth token');
			}

			const limiter = new Limiter(maxParallelEmbeddingOps);
			await raceCancellationError(Promise.all(allWorkspaceFiles.map(file => {
				return limiter.queue(async () => {
					if (token.isCancellationRequested) {
						throw new CancellationError();
					}
					if (shouldInclude(file.uri, include)) {
						await this.getChunksAndEmbeddings(authToken, file, batchInfo, EmbeddingsComputeQos.Batch, telemetryInfo.callTracker.add('WorkspaceChunkEmbeddingsIndex::getAllWorkspaceEmbeddings'), token);
					}
				});
			})), token);
		}, (execTime, status) => {
			/* __GDPR__
				"workspaceChunkEmbeddingsIndex.perf.getAllWorkspaceEmbeddings" : {
					"owner": "mjbvz",
					"comment": "Total time for getAllWorkspaceEmbeddings to complete",
					"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" },
					"totalFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of files we have in the workspace" },
					"recomputedFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of files that were not in the cache" },
					"recomputedTotalContentLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total length of text for recomputed files" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('workspaceChunkEmbeddingsIndex.perf.getAllWorkspaceEmbeddings', {
				status,
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			}, {
				execTime,
				totalFileCount: allWorkspaceFiles.length,
				recomputedFileCount: batchInfo.recomputedFileCount,
				recomputedTotalContentLength: batchInfo.sentContentTextLength,
			});
		});
	}

	private async getAllWorkspaceEmbeddings(trigger: BuildIndexTriggerReason, include: GlobIncludeOptions, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<FileChunkWithEmbedding[]> {
		await this.indexAllWorkspaceFiles(trigger, include, telemetryInfo, token);

		// Read back from DB cache with bounded concurrency.
		// This avoids keeping all chunk data in memory during indexing.
		const cache = await this._cache.value;
		const allFiles = Array.from(this._workspaceIndex.values());
		const limiter = new Limiter<readonly FileChunkWithEmbedding[] | undefined>(maxParallelEmbeddingOps);
		const perFileChunks = await raceCancellationError(Promise.all(allFiles.map(file => {
			return limiter.queue(async () => {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				if (!shouldInclude(file.uri, include)) {
					return;
				}
				return cache.get(file);
			});
		})), token);
		return coalesce(perFileChunks).flat();
	}

	private async getEmbeddingsForFiles(files: readonly URI[], include: GlobIncludeOptions, qos: EmbeddingsComputeQos, telemetry: { info: TelemetryCorrelationId; batchInfo?: ComputeBatchInfo }, token: CancellationToken): Promise<FileChunkWithEmbedding[]> {
		const batchInfo = telemetry.batchInfo ?? new ComputeBatchInfo();

		return logExecTime(this._logService, 'workspaceChunkEmbeddingsIndex.getEmbeddingsForFiles', async () => {
			this._logService.trace(`workspaceChunkEmbeddingsIndex: Getting auth token `);
			const authToken = await this.tryGetAuthToken();
			if (!authToken) {
				throw new Error('Unable to get auth token');
			}

			const limiter = new Limiter<readonly FileChunkWithEmbedding[] | undefined>(maxParallelEmbeddingOps);
			const chunksAndEmbeddings = await raceCancellationError(Promise.all(files.map(uri => {
				return limiter.queue(async () => {
					if (token.isCancellationRequested) {
						throw new CancellationError();
					}
					if (!shouldInclude(uri, include)) {
						return;
					}

					const file = await raceCancellationError(this._workspaceIndex.tryLoad(uri), token);
					if (!file) {
						return;
					}

					return raceCancellationError(this.getChunksAndEmbeddings(authToken, file, batchInfo, qos, telemetry.info.callTracker.add('WorkspaceChunkEmbeddingsIndex::getEmbeddingsForFiles'), token), token);
				});
			})), token);
			return coalesce(chunksAndEmbeddings).flat();
		}, (execTime, status) => {
			/* __GDPR__
				"workspaceChunkEmbeddingsIndex.perf.getEmbeddingsForFiles" : {
					"owner": "mjbvz",
					"comment": "Total time for getEmbeddingsForFiles to complete",
					"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" },
					"totalFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of files we are searching" },
					"recomputedFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of files that were not in the cache" },
					"recomputedTotalContentLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total length of text for recomputed files" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('workspaceChunkEmbeddingsIndex.perf.getEmbeddingsForFiles', {
				status,
				workspaceSearchSource: telemetry.info.callTracker,
				workspaceSearchCorrelationId: telemetry.info.correlationId,
			}, {
				execTime,
				totalFileCount: files.length,
				recomputedFileCount: batchInfo.recomputedFileCount,
				recomputedTotalContentLength: batchInfo.sentContentTextLength,
			});
		});
	}

	/**
	 * Get the chunks and embeddings for a file.
	*/
	private async getChunksAndEmbeddings(authToken: string, file: FileRepresentation, batchInfo: ComputeBatchInfo, qos: EmbeddingsComputeQos, telemetryInfo: CallTracker, token: CancellationToken): Promise<readonly FileChunkWithEmbedding[] | undefined> {
		const cache = await raceCancellationError(this._cache.value, token);
		const existing = await raceCancellationError(cache.get(file), token);
		if (existing) {
			return existing;
		}

		const cachedChunks = cache.getCurrentChunksForUri(file.uri);
		const chunksAndEmbeddings = await cache.update(file, async token => {
			return this._chunkingEndpointClient.computeChunksAndEmbeddings(authToken, this._embeddingType, file, batchInfo, qos, cachedChunks, telemetryInfo, token);
		});
		this._onDidChangeWorkspaceIndexState.fire();
		return chunksAndEmbeddings;
	}

	/**
	 * Get the chunks for a file as well as the embeddings if we have them already
	 */
	private async getChunksWithOptionalEmbeddings(authToken: string, file: FileRepresentation, batchInfo: ComputeBatchInfo, qos: EmbeddingsComputeQos, telemetryInfo: CallTracker, token: CancellationToken): Promise<readonly FileChunkWithOptionalEmbedding[] | undefined> {
		const cache = await raceCancellationError(this._cache.value, token);
		const existing = await raceCancellationError(cache.get(file), token);
		if (existing) {
			return existing;
		}

		const cachedChunks = cache.getCurrentChunksForUri(file.uri);
		return this._chunkingEndpointClient.computeChunks(authToken, this._embeddingType, file, batchInfo, qos, cachedChunks, telemetryInfo, token);
	}

	private async tryGetAuthToken(): Promise<string | undefined> {
		return (await this._authService.getGitHubSession('any', { createIfNone: { detail: l10n.t('Sign in to GitHub to index workspace files.') } }))?.accessToken;
	}
}
