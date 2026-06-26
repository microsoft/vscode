/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import { createHash } from 'crypto';
import { GlobIncludeOptions, shouldInclude } from '../../../util/common/glob';
import { CallTracker, TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { Limiter, raceCancellationError, raceTimeout } from '../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { CancellationError } from '../../../util/vs/base/common/errors';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap, ResourceSet } from '../../../util/vs/base/common/map';
import { Schemas } from '../../../util/vs/base/common/network';
import { extname } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { IConfigurationService } from '../../configuration/common/configurationService';
import { FileChunk, FileChunkAndScore, FileChunkWithEmbedding, FileChunkWithOptionalEmbedding } from '../../chunking/common/chunk';
import { ComputeBatchInfo, EmbeddingsComputeQos, IChunkingEndpointClient } from '../../chunking/common/chunkingEndpointClient';
import { distance, Embedding, EmbeddingType, rankEmbeddings } from '../../embeddings/common/embeddingsComputer';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { logExecTime } from '../../log/common/logExecTime';
import { ILogService } from '../../log/common/logService';
import { ISimulationTestContext } from '../../simulationTestContext/common/simulationTestContext';
import { ISearchService } from '../../search/common/searchService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { ExcludeSettingOptions } from '../../../vscodeTypes';
import { WorkspaceChunkSearchOptions } from '../common/workspaceChunkSearch';
import { BYOK_CHUNKING_AUTH_TOKEN, isByokEmbeddingModelConfigured } from '../common/byokEmbeddingModel';
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

/** Max files to lexically pre-filter before computing BYOK document embeddings. */
const byokMaxCandidateFiles = 20;

/** Max chunks embedded per file during BYOK search (skips huge generated assets). */
const byokMaxChunksPerFile = 16;

/**
 * BYOK embedding backends (e.g. CPU vLLM) cannot absorb Copilot's default indexing parallelism.
 * Keep search-path concurrency low to avoid 503 overload and long upstream queues.
 */
const byokMaxParallelEmbeddingOps = 3;

/** Max text-search matches collected per lexical query term. */
const byokMaxTextSearchMatchesPerTerm = 150;

/** Higher cap for longer/specific query terms so matches are less likely to be cut off. */
const byokMaxTextSearchMatchesPerSpecificTerm = 400;

/** Query tokens at or above this length are treated as specific (shorter tokens are high-frequency). */
const byokSpecificLexicalTermMinLength = 8;

/** Strict lexical filter: >=2 matched terms with at least one specific term. */
const byokMinMatchedLexicalTerms = 2;
const byokMinSpecificLexicalTerms = 1;

/** Non-source file extensions deprioritized in lexical pre-filter (extension-only, stack-agnostic). */
const byokLexicalDocumentationExtensions = new Set([
	'.adoc', '.md', '.markdown', '.rst', '.txt',
]);
const byokLexicalConfigurationExtensions = new Set([
	'.cfg', '.conf', '.csv', '.ini', '.json', '.toml', '.xml', '.yaml', '.yml',
]);

export class WorkspaceChunkEmbeddingsIndex extends Disposable {

	private _cachePromise: Promise<IWorkspaceChunkAndEmbeddingCache> | undefined;

	private readonly _onDidChangeWorkspaceIndexState = this._register(new Emitter<void>());
	public readonly onDidChangeWorkspaceIndexState = Event.debounce(this._onDidChangeWorkspaceIndexState.event, () => { }, 2500, undefined, undefined, undefined, this._store);

	private readonly _cacheRoot: URI | undefined;

	/**
	 * Whether {@link _cacheRoot} points at a cache shared across windows/processes
	 * (the per-folder BYOK cache under global storage) rather than the per-window
	 * workspace storage. Controls the SQLite open mode (WAL vs exclusive).
	 */
	private readonly _isSharedCache: boolean;

	private _isDisposed = false;

	constructor(
		private readonly _embeddingType: EmbeddingType,
		@IVSCodeExtensionContext vsExtensionContext: IVSCodeExtensionContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@ISimulationTestContext private readonly _simulationTestContext: ISimulationTestContext,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWorkspaceFileIndex private readonly _workspaceIndex: IWorkspaceFileIndex,
		@IChunkingEndpointClient private readonly _chunkingEndpointClient: IChunkingEndpointClient,
		@ISearchService private readonly _searchService: ISearchService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) {
		super();

		const cache = this.resolveCacheRoot(vsExtensionContext);
		this._cacheRoot = cache.root;
		this._isSharedCache = cache.shared;

		this._register(Event.any(
			this._workspaceIndex.onDidChangeFiles,
			this._workspaceIndex.onDidCreateFiles,
			this._workspaceIndex.onDidDeleteFiles,
		)(() => {
			this._onDidChangeWorkspaceIndexState.fire();
		}));
	}

	/**
	 * Resolves where the BYOK embedding cache lives.
	 *
	 * To keep behaviour aligned between the main window and the Agents window we
	 * key the cache by the workspace folder set under the (profile-shared) global
	 * storage, rather than the per-window workspace storage. That way both windows
	 * opening the same project reuse one warm `workspace-chunks.db` instead of each
	 * rebuilding embeddings from scratch.
	 *
	 * Falls back to the per-window workspace storage when there are no stable
	 * workspace folders or no on-disk global storage.
	 */
	private resolveCacheRoot(vsExtensionContext: IVSCodeExtensionContext): { readonly root: URI | undefined; readonly shared: boolean } {
		const folders = this._workspaceService.getWorkspaceFolders();
		const globalStorage = vsExtensionContext.globalStorageUri;
		if (!folders.length || globalStorage?.scheme !== Schemas.file) {
			return { root: vsExtensionContext.storageUri, shared: false };
		}

		const folderKey = createHash('sha256')
			.update(folders.map(folder => folder.toString()).sort().join('\n').toLowerCase())
			.digest('hex')
			.slice(0, 32);
		return { root: URI.joinPath(globalStorage, 'byokWorkspaceChunks', folderKey), shared: true };
	}

	override dispose(): void {
		this._isDisposed = true;
		this._cachePromise = undefined;
		super.dispose();
	}

	private async getCache(token: CancellationToken): Promise<IWorkspaceChunkAndEmbeddingCache> {
		if (this._isDisposed) {
			throw new CancellationError();
		}

		if (!this._cachePromise) {
			this._cachePromise = this.initCache().catch(e => {
				this._cachePromise = undefined;
				throw e;
			});
		}

		return raceCancellationError(this._cachePromise, token);
	}

	private async initCache(): Promise<IWorkspaceChunkAndEmbeddingCache> {
		const cache = await this._instantiationService.invokeFunction(accessor =>
			createWorkspaceChunkAndEmbeddingCache(
				accessor,
				this._embeddingType,
				this._cacheRoot,
				this._workspaceIndex,
				CancellationToken.None,
				this._isSharedCache,
			));

		if (this._isDisposed) {
			cache.dispose();
			throw new CancellationError();
		}

		const cacheLocation = this._cacheRoot?.scheme === Schemas.file
			? URI.joinPath(this._cacheRoot, 'workspace-chunks.db').fsPath
			: ':memory:';
		this._logService.info(`WorkspaceChunkEmbeddingsIndex: opened embedding cache (${cacheLocation}, shared=${this._isSharedCache})`);

		this._onDidChangeWorkspaceIndexState.fire();
		return this._register(cache);
	}

	async getIndexState(): Promise<WorkspaceChunkEmbeddingsIndexState | undefined> {
		if (!this._cachePromise) {
			return undefined;
		}

		const cache = await this._cachePromise;
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

		const cache = await this.getCache(CancellationToken.None);
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

		const authToken = await this.tryGetAuthToken();
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

	/**
	 * BYOK semantic search: embed up to 20 lexical candidates, union with all cached embeddings, rank.
	 */
	async searchByokWorkspace(
		queryText: string,
		query: Promise<Embedding>,
		maxResults: number,
		options: WorkspaceChunkSearchOptions,
		telemetryInfo: TelemetryCorrelationId,
		token: CancellationToken,
	): Promise<FileChunkAndScore[]> {
		return logExecTime(this._logService, 'WorkspaceChunkEmbeddingIndex.searchByokWorkspace', async () => {
			await raceCancellationError(this._workspaceIndex.initialize(), token);

			const candidateFiles = await raceCancellationError(
				this.findByokCandidateFiles(queryText, options, token),
				token,
			);
			this._logService.info(
				`WorkspaceChunkEmbeddingsIndex: BYOK search found ${candidateFiles.length} lexical candidate file(s) for query`,
			);

			const batchInfo = new ComputeBatchInfo();
			const [queryEmbedding, lexicalEmbeddings] = await raceCancellationError(Promise.all([
				query,
				candidateFiles.length > 0
					? this.getEmbeddingsForFiles(
						candidateFiles,
						options.globPatterns ?? {},
						EmbeddingsComputeQos.Batch,
						{ info: telemetryInfo.addCaller('WorkspaceChunkEmbeddingsIndex::searchByokWorkspace'), batchInfo },
						token,
						byokMaxParallelEmbeddingOps,
						byokMaxChunksPerFile,
					)
					: Promise.resolve([]),
			]), token);

			if (candidateFiles.length > 0) {
				const lexicalCacheHits = candidateFiles.length - batchInfo.recomputedFileCount;
				const lexicalCacheHitPct = Math.round((lexicalCacheHits / candidateFiles.length) * 100);
				this._logService.info(
					`WorkspaceChunkEmbeddingsIndex: BYOK lexical candidates: ${lexicalCacheHits}/${candidateFiles.length} files from cache ` +
					`(${lexicalCacheHitPct}% cache hit), ${batchInfo.recomputedFileCount} newly embedded, ${lexicalEmbeddings.length} chunk(s)`,
				);
			}

			const cachedEmbeddings = await raceCancellationError(
				this.getAllCachedEmbeddings(options.globPatterns ?? {}, token),
				token,
			);

			const searchEmbeddings = this.mergeByokLexicalAndCachedEmbeddings(
				candidateFiles,
				lexicalEmbeddings,
				cachedEmbeddings,
			);

			const lexicalFileUris = new Set(candidateFiles.map(uri => uri.toString()));
			const cachedOnlyChunks = cachedEmbeddings.filter(
				chunk => !lexicalFileUris.has(chunk.chunk.file.toString()),
			);
			const cachedOnlyFileCount = new Set(cachedOnlyChunks.map(chunk => chunk.chunk.file.toString())).size;
			const cache = await this.getCache(token);
			const { fileCount: dbFileCount, chunkCount: dbChunkCount } = cache.getCachedStats();

			this._logService.info(
				`WorkspaceChunkEmbeddingsIndex: BYOK rank pool: ${searchEmbeddings.length} chunk(s) ` +
				`(${lexicalEmbeddings.length} from lexical candidates + ${cachedOnlyChunks.length} from ${cachedOnlyFileCount} other cached file(s); ` +
				`database: ${dbFileCount} file(s), ${dbChunkCount} chunk(s))`,
			);

			if (searchEmbeddings.length === 0) {
				this._logService.warn(`WorkspaceChunkEmbeddingsIndex: BYOK search has no embeddings to rank`);
				return [];
			}

			const results = this.rankEmbeddings(queryEmbedding, searchEmbeddings, maxResults);
			this.logByokResultSourceMetrics(candidateFiles, searchEmbeddings, results);
			return results;
		}, (execTime, status) => {
			this._telemetryService.sendMSFTTelemetryEvent('workspaceChunkEmbeddingsIndex.perf.searchByokWorkspace', {
				status,
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			}, { execTime });
		});
	}

	/** Lexical candidate chunks plus all other cached chunks (lexical wins on overlap). */
	private mergeByokLexicalAndCachedEmbeddings(
		lexicalCandidateFiles: readonly URI[],
		lexicalEmbeddings: readonly FileChunkWithEmbedding[],
		cachedEmbeddings: readonly FileChunkWithEmbedding[],
	): FileChunkWithEmbedding[] {
		const lexicalFileUris = new Set(lexicalCandidateFiles.map(uri => uri.toString()));
		const cachedOutsideLexical = cachedEmbeddings.filter(
			chunk => !lexicalFileUris.has(chunk.chunk.file.toString()),
		);
		return [...cachedOutsideLexical, ...lexicalEmbeddings];
	}

	/**
	 * Logs how much of the rank pool and final results came from lexical keyword candidates
	 * vs the broader cached embedding pool (semantic-only discovery outside ripgrep pre-filter).
	 */
	private logByokResultSourceMetrics(
		lexicalCandidateFiles: readonly URI[],
		searchEmbeddings: readonly FileChunkWithEmbedding[],
		results: readonly FileChunkAndScore[],
	): void {
		const lexicalFileUris = new Set(lexicalCandidateFiles.map(uri => uri.toString()));

		const poolFromCached = searchEmbeddings.filter(
			chunk => !lexicalFileUris.has(chunk.chunk.file.toString()),
		).length;
		const poolFromLexical = searchEmbeddings.length - poolFromCached;
		const poolCachedPct = searchEmbeddings.length > 0
			? Math.round((poolFromCached / searchEmbeddings.length) * 100)
			: 0;

		const resultsFromCached = results.filter(
			r => !lexicalFileUris.has(r.chunk.file.toString()),
		);
		const resultsFromLexical = results.length - resultsFromCached.length;
		const resultCachedPct = results.length > 0
			? Math.round((resultsFromCached.length / results.length) * 100)
			: 0;
		const resultLexicalPct = results.length > 0 ? 100 - resultCachedPct : 0;

		const resultCachedFiles = new Set(resultsFromCached.map(r => r.chunk.file.toString())).size;
		const resultLexicalFiles = new Set(
			results.filter(r => lexicalFileUris.has(r.chunk.file.toString())).map(r => r.chunk.file.toString()),
		).size;

		this._logService.info(
			`WorkspaceChunkEmbeddingsIndex: BYOK search returned ${results.length} result chunk(s) ` +
			`(${resultsFromLexical} lexical / ${resultsFromCached.length} cached-pool)`,
		);
		this._logService.info(
			`WorkspaceChunkEmbeddingsIndex: BYOK result source: ${resultLexicalPct}% (${resultsFromLexical}/${results.length} chunks, ` +
			`${resultLexicalFiles} file(s)) from lexical keyword candidates, ` +
			`${resultCachedPct}% (${resultsFromCached.length}/${results.length} chunks, ${resultCachedFiles} file(s)) ` +
			`from cached embedding pool outside lexical pre-filter`,
		);
		this._logService.info(
			`WorkspaceChunkEmbeddingsIndex: BYOK rank pool source: ${100 - poolCachedPct}% (${poolFromLexical}/${searchEmbeddings.length} chunks) lexical, ` +
			`${poolCachedPct}% (${poolFromCached}/${searchEmbeddings.length} chunks) cached pool — ` +
			`embedding pool result lift: ${resultCachedPct - poolCachedPct >= 0 ? '+' : ''}${resultCachedPct - poolCachedPct}pp vs pool share`,
		);
	}

	private async findByokCandidateFiles(
		queryText: string,
		options: WorkspaceChunkSearchOptions,
		token: CancellationToken,
	): Promise<URI[]> {
		const candidateScores = new ResourceMap<number>();
		const candidateMatchedTerms = new ResourceMap<Set<string>>();
		const searchTerms = this.getByokLexicalSearchTerms(queryText);

		for (const term of this.orderByokLexicalSearchTerms(searchTerms)) {
			if (token.isCancellationRequested) {
				break;
			}
			const termWeight = this.getByokLexicalTermWeight(term);
			await this.collectByokTextSearchMatches(term, termWeight, options, candidateScores, candidateMatchedTerms, token);
		}

		this.applyByokLexicalPathBoost(candidateScores, searchTerms);

		const sorted = Array.from(candidateScores.entries())
			.filter(([uri]) => shouldInclude(uri, options.globPatterns ?? {}) && !this.isExcludedByokSearchFile(uri))
			.sort((a, b) => this.compareByokLexicalCandidates(a, b, candidateMatchedTerms));

		const ranked = this.selectByokLexicalCandidates(sorted, candidateMatchedTerms);

		return ranked.map(([uri]) => uri);
	}

	private selectByokLexicalCandidates(
		sorted: [URI, number][],
		candidateMatchedTerms: ResourceMap<Set<string>>,
	): [URI, number][] {
		const selected: [URI, number][] = [];
		const selectedUris = new ResourceSet();

		const tryAdd = (
			predicate: (matchedTerms: Set<string> | undefined) => boolean,
			excludeLowPriority: boolean,
		) => {
			for (const entry of sorted) {
				if (selected.length >= byokMaxCandidateFiles) {
					break;
				}
				if (selectedUris.has(entry[0])) {
					continue;
				}
				if (excludeLowPriority && this.isLowPriorityByokLexicalFile(entry[0])) {
					continue;
				}
				if (!predicate(candidateMatchedTerms.get(entry[0]))) {
					continue;
				}
				selected.push(entry);
				selectedUris.add(entry[0]);
			}
		};

		tryAdd(
			matched => (matched?.size ?? 0) >= byokMinMatchedLexicalTerms
				&& this.getByokSpecificTermMatchCount(matched) >= byokMinSpecificLexicalTerms,
			true,
		);
		if (selected.length < byokMaxCandidateFiles) {
			this._logService.info(
				`WorkspaceChunkEmbeddingsIndex: BYOK lexical pre-filter found ${selected.length} file(s) with ` +
				`>=${byokMinMatchedLexicalTerms} term(s) including >=${byokMinSpecificLexicalTerms} specific; relaxing to specific-only`,
			);
			tryAdd(
				matched => this.getByokSpecificTermMatchCount(matched) >= byokMinSpecificLexicalTerms,
				true,
			);
		}
		if (selected.length < byokMaxCandidateFiles) {
			tryAdd(matched => (matched?.size ?? 0) >= byokMinMatchedLexicalTerms, true);
		}
		if (selected.length < byokMaxCandidateFiles) {
			for (const entry of sorted) {
				if (selected.length >= byokMaxCandidateFiles) {
					break;
				}
				if (selectedUris.has(entry[0]) || this.isLowPriorityByokLexicalFile(entry[0])) {
					continue;
				}
				selected.push(entry);
				selectedUris.add(entry[0]);
			}
		}

		return selected;
	}

	private isExcludedByokSearchFile(uri: URI): boolean {
		const path = uri.path.toLowerCase();
		if (path.endsWith('.tmlanguage.json')) {
			return true;
		}
		if (path.endsWith('thirdpartynotices.txt')) {
			return true;
		}
		if (path.includes('icon-theme.json') || path.endsWith('-icon-theme.json')) {
			return true;
		}
		if (path.includes('.fixture.')) {
			return true;
		}
		// BYOK search implementation matches its own query-term constants in source.
		if (path.includes('/workspacechunksearch/')) {
			return true;
		}
		return false;
	}

	private orderByokLexicalSearchTerms(searchTerms: readonly string[]): string[] {
		const specificTerms = searchTerms.filter(term => this.isByokSpecificLexicalTerm(term)).sort();
		const commonTerms = searchTerms.filter(term => !this.isByokSpecificLexicalTerm(term)).sort();
		return [...specificTerms, ...commonTerms];
	}

	private getByokLexicalSearchTerms(queryText: string): string[] {
		const trimmed = queryText.trim();
		const terms = new Set<string>();

		for (const word of trimmed.split(/\s+/)) {
			const normalized = word.replace(/[^\p{L}\p{N}_-]/gu, '').toLowerCase();
			if (normalized.length >= 3) {
				terms.add(normalized);
			}
		}

		// Sorted for stable term processing order across runs.
		return Array.from(terms).sort();
	}

	/** Longer tokens are usually more specific in natural-language queries. */
	private getByokLexicalTermWeight(term: string): number {
		return Math.max(1, Math.min(4, Math.ceil(term.length / 2)));
	}

	private applyByokLexicalPathBoost(candidateScores: ResourceMap<number>, searchTerms: readonly string[]): void {
		for (const [uri, score] of candidateScores) {
			const pathLower = uri.fsPath.toLowerCase();
			let boost = 0;
			for (const term of searchTerms) {
				if (!this.isByokSpecificLexicalTerm(term)) {
					continue;
				}
				if (pathLower.includes(term)) {
					boost += 2;
				}
			}
			if (boost > 0) {
				candidateScores.set(uri, score + boost);
			}
		}
	}

	private isByokSpecificLexicalTerm(term: string): boolean {
		return term.length >= byokSpecificLexicalTermMinLength;
	}

	private getByokSpecificTermMatchCount(matchedTerms: Set<string> | undefined): number {
		if (!matchedTerms) {
			return 0;
		}
		let count = 0;
		for (const term of matchedTerms) {
			if (this.isByokSpecificLexicalTerm(term)) {
				count++;
			}
		}
		return count;
	}

	private isLowPriorityByokLexicalFile(uri: URI): boolean {
		const category = this.getByokLexicalFileCategory(uri);
		return category === 'documentation' || category === 'configuration';
	}

	private getByokLexicalFileCategory(uri: URI): 'configuration' | 'documentation' | 'source' {
		const extension = extname(uri).toLowerCase();
		if (byokLexicalDocumentationExtensions.has(extension)) {
			return 'documentation';
		}
		if (byokLexicalConfigurationExtensions.has(extension)) {
			return 'configuration';
		}
		return 'source';
	}

	private getByokPathMatchedTermCount(uri: URI, matchedTerms: Set<string> | undefined): number {
		if (!matchedTerms) {
			return 0;
		}
		const pathLower = uri.fsPath.toLowerCase();
		let count = 0;
		for (const term of matchedTerms) {
			if (pathLower.includes(term)) {
				count++;
			}
		}
		return count;
	}

	private compareByokLexicalCandidates(
		a: [URI, number],
		b: [URI, number],
		candidateMatchedTerms: ResourceMap<Set<string>>,
	): number {
		const aMatched = candidateMatchedTerms.get(a[0]);
		const bMatched = candidateMatchedTerms.get(b[0]);
		const aSpecific = this.getByokSpecificTermMatchCount(aMatched);
		const bSpecific = this.getByokSpecificTermMatchCount(bMatched);
		if (bSpecific !== aSpecific) {
			return bSpecific - aSpecific;
		}

		const aTotal = aMatched?.size ?? 0;
		const bTotal = bMatched?.size ?? 0;
		if (bTotal !== aTotal) {
			return bTotal - aTotal;
		}

		const pathTermDiff = this.getByokPathMatchedTermCount(b[0], bMatched) - this.getByokPathMatchedTermCount(a[0], aMatched);
		if (pathTermDiff !== 0) {
			return pathTermDiff;
		}

		if (b[1] !== a[1]) {
			return b[1] - a[1];
		}
		const pathPriorityDiff = this.getByokLexicalPathPriority(b[0]) - this.getByokLexicalPathPriority(a[0]);
		if (pathPriorityDiff !== 0) {
			return pathPriorityDiff;
		}
		return a[0].fsPath.localeCompare(b[0].fsPath);
	}

	private getByokLexicalPathPriority(uri: URI): number {
		const category = this.getByokLexicalFileCategory(uri);
		if (category === 'documentation' || category === 'configuration') {
			return -1;
		}
		const path = uri.path.toLowerCase();
		const baseName = path.slice(path.lastIndexOf('/') + 1);
		if (path.includes('/test/') || path.includes('/tests/') || path.includes('__tests__')
			|| baseName.includes('.test.') || baseName.includes('.spec.')) {
			return 1;
		}
		return 2;
	}

	private async collectByokTextSearchMatches(
		term: string,
		termWeight: number,
		options: WorkspaceChunkSearchOptions,
		candidateScores: ResourceMap<number>,
		candidateMatchedTerms: ResourceMap<Set<string>>,
		token: CancellationToken,
	): Promise<void> {
		const matchedFilesThisTerm = new ResourceSet();
		const maxResults = this.isByokSpecificLexicalTerm(term)
			? byokMaxTextSearchMatchesPerSpecificTerm
			: byokMaxTextSearchMatchesPerTerm;
		const searchResult = this._searchService.findTextInFiles2(
			{ pattern: term, isRegExp: false },
			{
				include: options.globPatterns?.include,
				exclude: options.globPatterns?.exclude,
				maxResults,
				useExcludeSettings: ExcludeSettingOptions.SearchAndFilesExclude,
				caseInsensitive: true,
			},
			token,
		);

		for await (const item of searchResult.results) {
			if (token.isCancellationRequested) {
				break;
			}
			if (!item.uri || !shouldInclude(item.uri, options.globPatterns ?? {}) || this.isExcludedByokSearchFile(item.uri)) {
				continue;
			}
			if (matchedFilesThisTerm.has(item.uri)) {
				continue;
			}
			matchedFilesThisTerm.add(item.uri);
			candidateScores.set(item.uri, (candidateScores.get(item.uri) ?? 0) + termWeight);

			let matchedTerms = candidateMatchedTerms.get(item.uri);
			if (!matchedTerms) {
				matchedTerms = new Set<string>();
				candidateMatchedTerms.set(item.uri, matchedTerms);
			}
			matchedTerms.add(term);
		}

		await raceCancellationError(searchResult.complete, token);
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
		const authToken = await this.tryGetAuthToken(trigger !== 'auto');
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
		const cache = await this.getCache(token);
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

	private async getAllCachedEmbeddings(include: GlobIncludeOptions, token: CancellationToken): Promise<FileChunkWithEmbedding[]> {
		const cache = await this.getCache(token);
		const cachedUris = cache.getCachedFileUris();

		const limiter = new Limiter<readonly FileChunkWithEmbedding[] | undefined>(maxParallelEmbeddingOps);
		const perFileChunks = await raceCancellationError(Promise.all(cachedUris.map(uri => {
			return limiter.queue(async () => {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				if (!shouldInclude(uri, include)) {
					return;
				}

				const file = this._workspaceIndex.get(uri);
				if (!file) {
					return;
				}

				return raceCancellationError(cache.get(file), token);
			});
		})), token);

		return coalesce(perFileChunks).flat();
	}

	private async getEmbeddingsForFiles(files: readonly URI[], include: GlobIncludeOptions, qos: EmbeddingsComputeQos, telemetry: { info: TelemetryCorrelationId; batchInfo?: ComputeBatchInfo }, token: CancellationToken, maxParallel = maxParallelEmbeddingOps, maxChunksPerFile?: number): Promise<FileChunkWithEmbedding[]> {
		const batchInfo = telemetry.batchInfo ?? new ComputeBatchInfo();

		return logExecTime(this._logService, 'workspaceChunkEmbeddingsIndex.getEmbeddingsForFiles', async () => {
			this._logService.trace(`workspaceChunkEmbeddingsIndex: Getting auth token `);
			const authToken = await this.tryGetAuthToken();
			if (!authToken) {
				throw new Error('Unable to get auth token');
			}

			const limiter = new Limiter<readonly FileChunkWithEmbedding[] | undefined>(maxParallel);
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

					return raceCancellationError(this.getChunksAndEmbeddings(authToken, file, batchInfo, qos, telemetry.info.callTracker.add('WorkspaceChunkEmbeddingsIndex::getEmbeddingsForFiles'), token, maxChunksPerFile), token);
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
	private async getChunksAndEmbeddings(authToken: string, file: FileRepresentation, batchInfo: ComputeBatchInfo, qos: EmbeddingsComputeQos, telemetryInfo: CallTracker, token: CancellationToken, maxChunksPerFile?: number): Promise<readonly FileChunkWithEmbedding[] | undefined> {
		const cache = await this.getCache(token);
		const existing = await raceCancellationError(cache.get(file), token);
		if (existing) {
			this._logService.trace(`WorkspaceChunkEmbeddingsIndex: cache hit (${existing.length} chunk(s))`);
			return existing;
		}

		this._logService.trace(`WorkspaceChunkEmbeddingsIndex: cache miss, computing embeddings`);
		const cachedChunks = cache.getCurrentChunksForUri(file.uri);
		const chunksAndEmbeddings = await cache.update(file, async token => {
			return this._chunkingEndpointClient.computeChunksAndEmbeddings(
				authToken,
				this._embeddingType,
				file,
				batchInfo,
				qos,
				cachedChunks,
				telemetryInfo,
				token,
				maxChunksPerFile !== undefined ? { maxChunks: maxChunksPerFile } : undefined,
			);
		});
		this._onDidChangeWorkspaceIndexState.fire();
		return chunksAndEmbeddings;
	}

	/**
	 * Get the chunks for a file as well as the embeddings if we have them already
	 */
	private async getChunksWithOptionalEmbeddings(authToken: string, file: FileRepresentation, batchInfo: ComputeBatchInfo, qos: EmbeddingsComputeQos, telemetryInfo: CallTracker, token: CancellationToken): Promise<readonly FileChunkWithOptionalEmbedding[] | undefined> {
		const cache = await this.getCache(token);
		const existing = await raceCancellationError(cache.get(file), token);
		if (existing) {
			return existing;
		}

		const cachedChunks = cache.getCurrentChunksForUri(file.uri);
		return this._chunkingEndpointClient.computeChunks(authToken, this._embeddingType, file, batchInfo, qos, cachedChunks, telemetryInfo, token);
	}

	private async tryGetAuthToken(interactive = false): Promise<string | undefined> {
		if (isByokEmbeddingModelConfigured(this._configurationService)) {
			return BYOK_CHUNKING_AUTH_TOKEN;
		}

		if (interactive) {
			return (await this._authService.getGitHubSession('any', { createIfNone: { detail: l10n.t('Sign in to GitHub to index workspace files.') } }))?.accessToken;
		}

		return (await this._authService.getGitHubSession('any', { silent: true }))?.accessToken;
	}
}
