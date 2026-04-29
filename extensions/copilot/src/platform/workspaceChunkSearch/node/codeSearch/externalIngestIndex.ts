/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ingestUtils = require('@github/blackbird-external-ingest-utils');
import * as l10n from '@vscode/l10n';
import * as fs from 'node:fs';
import sql from 'node:sqlite';
import { toErrorMessage } from '../../../../util/common/errorMessage';
import { Result } from '../../../../util/common/result';
import { TelemetryCorrelationId } from '../../../../util/common/telemetryCorrelationId';
import { coalesce } from '../../../../util/vs/base/common/arrays';
import { CancelablePromise, createCancelablePromise, Limiter, raceCancellationError, timeout } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../../util/vs/base/common/errors';
import { Emitter } from '../../../../util/vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../util/vs/base/common/lifecycle';
import { ResourceMap, ResourceSet } from '../../../../util/vs/base/common/map';
import { Schemas } from '../../../../util/vs/base/common/network';
import { isEqualOrParent, relativePath } from '../../../../util/vs/base/common/resources';
import { StopWatch } from '../../../../util/vs/base/common/stopwatch';
import { URI } from '../../../../util/vs/base/common/uri';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { Range } from '../../../../util/vs/editor/common/core/range';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { FileChunkAndScore } from '../../../chunking/common/chunk';
import { stripChunkTextMetadata } from '../../../chunking/common/chunkingStringUtils';
import { EmbeddingType } from '../../../embeddings/common/embeddingsComputer';
import { IEnvService } from '../../../env/common/envService';
import { IVSCodeExtensionContext } from '../../../extContext/common/extensionContext';
import { IFileSystemService } from '../../../filesystem/common/fileSystemService';
import { RelativePattern } from '../../../filesystem/common/fileTypes';
import { IIgnoreService } from '../../../ignore/common/ignoreService';
import { ILogService } from '../../../log/common/logService';
import { ISearchService } from '../../../search/common/searchService';
import { ITelemetryService } from '../../../telemetry/common/telemetry';
import { IWorkspaceService } from '../../../workspace/common/workspaceService';
import { StrategySearchSizing, WorkspaceChunkQueryWithEmbeddings } from '../../common/workspaceChunkSearch';
import { shouldPotentiallyIndexFile } from '../workspaceFileIndex';
import { CodeSearchRepoStatus, TriggerIndexingError, TriggerRemoteIndexingError } from './codeSearchRepo';
import { computeCheckpointHash, ExternalIngestFile, ExternalIngestFileSet, ExternalIngestRequestError, IExternalIngestClient } from './externalIngestClient';
import { WorkspaceFolderIdMap } from './workspaceFolderIdMap';

const debug = false;

const enum ShouldIngestState {
	/** File is tracked but we haven't yet determined if it should be ingested */
	Undetermined = 0,
	/** File should not be ingested */
	No = 1,
	/** File should be ingested */
	Yes = 2,
}

interface DbFileEntry {
	path: string;
	size: number;
	mtime: number;
	docSha: Uint8Array | null;
	shouldIngest: ShouldIngestState;
}

export interface ExternalIngestStatus {
	readonly status: CodeSearchRepoStatus;
	readonly progressMessage: string | undefined;
}

/**
 * Manages external ingest indexing for files that are NOT covered by GitHub/ADO code search.
 */
export class ExternalIngestIndex extends Disposable {

	private static readonly storageKeys = Object.freeze({
		Checkpoint: 'externalIngest.checkpoint',
		FileSetName: 'externalIngest.fileSetName',
	});

	private readonly _db: sql.DatabaseSync;

	private readonly _readLimiter = this._register(new Limiter<Uint8Array>(20));
	private readonly _watchers = this._register(new MutableDisposable<IDisposable>());

	private readonly workspaceFolderIdMap: WorkspaceFolderIdMap;

	private _isDisposed = false;

	/**
	 * Set of repo root URIs that are covered by code search.
	 *
	 * Files under these roots should NOT be indexed by external ingest.
	 */
	private readonly _codeSearchRepoRoots = new ResourceSet();

	/**
	 * Set of file URIs that should be force-included in external ingest,
	 * even if they fall under code search repo roots.
	 * Used for out-of-sync diff files that need to be re-indexed locally.
	 */
	private readonly _forceIncludeFiles = new ResourceSet();

	private readonly _client: IExternalIngestClient;

	private readonly _onDidChangeState = this._register(new Emitter<void>());
	public readonly onDidChangeState = this._onDidChangeState.event;

	private _currentIngestOperation?: {
		promise: CancelablePromise<Result<true, TriggerIndexingError>>;

		progressMessage: string | undefined;

		completed: boolean;

		readonly checkpointHash: string;
	};

	/**
	 * Returns the current index state.
	 */
	public getState(): ExternalIngestStatus {
		if (this._currentIngestOperation) {
			if (this._currentIngestOperation.completed) {
				return {
					status: CodeSearchRepoStatus.Ready,
					progressMessage: undefined,
				};
			} else {
				return {
					status: CodeSearchRepoStatus.BuildingIndex,
					progressMessage: this._currentIngestOperation.progressMessage,
				};
			}
		}

		if (this.getCurrentIndexCheckpoint()) {
			return {
				status: CodeSearchRepoStatus.Ready,
				progressMessage: undefined,
			};
		}

		return {
			status: CodeSearchRepoStatus.NotYetIndexed,
			progressMessage: undefined,
		};
	}

	constructor(
		client: IExternalIngestClient,
		initialCodeSearchRoots: URI[],
		@IEnvService private readonly _envService: IEnvService,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@ISearchService private readonly _searchService: ISearchService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IVSCodeExtensionContext private readonly _vsExtensionContext: IVSCodeExtensionContext,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) {
		super();

		this._client = client;
		this.workspaceFolderIdMap = new WorkspaceFolderIdMap(this._vsExtensionContext.workspaceState);

		for (const root of initialCodeSearchRoots) {
			this._codeSearchRepoRoots.add(root);
		}

		let dbPath: string;
		if (debug || !this._vsExtensionContext.storageUri || this._vsExtensionContext.storageUri.scheme !== Schemas.file) {
			dbPath = ':memory:';
		} else {
			dbPath = URI.joinPath(this._vsExtensionContext.storageUri, 'codebase-external.sqlite').fsPath;
		}

		try {
			this._db = this.openOrCreateDatabase(dbPath);
		} catch (error) {
			this._logService.error('Failed to create database. Falling back to in-memory db', error);
			this._db = this.createFreshDatabase(':memory:');
		}
	}

	override dispose(): void {
		this._isDisposed = true;

		super.dispose();

		this._db.close();
	}

	private getCurrentIndexCheckpoint(): string | undefined {
		return this._vsExtensionContext.workspaceState.get<string>(ExternalIngestIndex.storageKeys.Checkpoint);
	}

	private setCurrentIndexCheckpoint(checkpoint: string): void {
		this._vsExtensionContext.workspaceState.update(ExternalIngestIndex.storageKeys.Checkpoint, checkpoint);
	}

	private clearCurrentIndexCheckpoint(): void {
		this._vsExtensionContext.workspaceState.update(ExternalIngestIndex.storageKeys.Checkpoint, undefined);
	}

	/**
	 * Deletes the external ingest index for the current workspace.
	 *
	 * This deletes the remote file set and the checkpoint. We keep around the local database because it
	 * has a cache of file shas.
	 */
	public async deleteIndex(telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<void> {
		const filesetName = this.getFilesetName();
		if (!filesetName) {
			return;
		}
		this._logService.info(`ExternalIngestIndex: Deleting index for fileset ${filesetName}`);

		try {
			await this._client.deleteFileset(filesetName, telemetryInfo.callTracker, token);
			this.clearCurrentIndexCheckpoint();
			this._onDidChangeState.fire();

			this._logService.info(`ExternalIngestIndex: Deleted index for fileset ${filesetName}`);

			/* __GDPR__
				"externalIngestIndex.deleteIndex" : {
					"owner": "mjbvz",
					"comment": "Logged when external ingest index is deleted successfully",
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the operation" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the operation" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('externalIngestIndex.deleteIndex', {
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			});
		} catch (e) {
			/* __GDPR__
				"externalIngestIndex.deleteIndex.error" : {
					"owner": "mjbvz",
					"comment": "Logged when deleting external ingest index fails",
					"error": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The error message" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the operation" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the operation" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryErrorEvent('externalIngestIndex.deleteIndex.error', {
				error: (e as Error).message,
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			});
			throw e;
		}
	}

	/**
	 * Updates the set of roots that are covered by code search.
	 *
	 * Files under these roots will be excluded from external ingest indexing.
	 */
	public updateCodeSearchRoots(roots: readonly URI[]): void {
		this._codeSearchRepoRoots.clear();
		for (const root of roots) {
			this._codeSearchRepoRoots.add(root);
		}

		this._logService.trace(`ExternalIngestIndex: Updated code search roots: ${roots.map(r => r.toString()).join(', ')}`);
	}

	/**
	 * Updates the set of files that should always be considered for external ingest.
	 *
	 * This lets us index local-diff files that live under code-search repo roots,
	 * so we can blend local updates with remote code-search results.
	 */
	public async updateForceIncludeFiles(files: readonly URI[], token: CancellationToken): Promise<void> {
		await raceCancellationError(this.initialize(), token);

		this._forceIncludeFiles.clear();
		for (const file of files) {
			this._forceIncludeFiles.add(file);
		}

		await raceCancellationError(
			Promise.all(files.map(async file => {
				if (await this.shouldTrackFile(file, token)) {
					await this.tryAddOrUpdateFile(file);
				} else {
					this.delete(file);
				}
			})),
			token);

		this._logService.trace(`ExternalIngestIndex: Updated force-included files (${files.length})`);
	}

	private _initializePromise: Promise<void> | undefined;

	async initialize(): Promise<void> {
		this._initializePromise ??= (async () => {
			await this._ignoreService.init();
			if (this._isDisposed) {
				return;
			}

			await this.reconcileDbFiles();
			if (this._isDisposed) {
				return;
			}

			this.registerWatcher();
		})();

		return this._initializePromise;
	}

	async doIngest(telemetryInfo: TelemetryCorrelationId, onProgress: (message: string) => void, callerToken: CancellationToken): Promise<Result<true, TriggerIndexingError>> {
		await raceCancellationError(this.initialize(), callerToken);

		const filesetName = this.getFilesetName();
		if (!filesetName) {
			return Result.error(TriggerRemoteIndexingError.noWorkspace);
		}

		const currentCheckpoint = this.getCurrentIndexCheckpoint();

		// Pre-collect all files and compute the checkpoint hash so we can
		// detect whether the workspace state has actually changed.
		const allFiles: ExternalIngestFile[] = [];
		for await (const file of this.getFilesToIndexFromDb(callerToken)) {
			allFiles.push(file);
		}
		const checkpointHash = computeCheckpointHash(allFiles);

		const fileSet: ExternalIngestFileSet = { files: allFiles, checkpoint: checkpointHash };

		// If the checkpoint matches the stored one, the index is already up to date.
		if (checkpointHash === currentCheckpoint) {
			this._logService.info('ExternalIngestIndex::doIngest(): Checkpoint matches current checkpoint, skipping ingest.');
			return Result.ok(true);
		}

		// If there is a running operation with the same checkpoint hash,
		// the workspace state has not changed — reuse the existing operation.
		if (this._currentIngestOperation && !this._currentIngestOperation.completed && this._currentIngestOperation.checkpointHash === checkpointHash) {
			this._logService.info('ExternalIngestIndex::doIngest(): Workspace state unchanged, reusing existing ingest operation');
			return this._currentIngestOperation.promise;
		}

		// Track building state
		const operation: typeof this._currentIngestOperation = {
			promise: undefined!,
			progressMessage: undefined,
			completed: false,
			checkpointHash,
		};

		const sw = new StopWatch();

		// We generally don't want to cancel an ingest just because the caller's token is canceled.
		// If we do this, the index will often never be built successfully
		const updatePromise = createCancelablePromise(async (token): Promise<Result<true, TriggerIndexingError>> => {
			const wrappedOnProgress = (message: string) => {
				if (this._currentIngestOperation === operation) {
					operation.progressMessage = message;
					this._onDidChangeState.fire();
				}

				onProgress(message);
			};

			try {
				const result = await this._client.updateIndex(
					filesetName,
					fileSet,
					telemetryInfo.callTracker,
					token,
					wrappedOnProgress
				);
				if (result.isOk()) {
					this.setCurrentIndexCheckpoint(result.val.checkpoint);

					/* __GDPR__
						"externalIngestIndex.updateIndex.success" : {
							"owner": "mjbvz",
							"comment": "Logged when external ingest index update completes successfully",
"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the operation" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the operation" },
					"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time taken to complete the update in milliseconds" },
					"totalFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of files in the index" },
					"updatedFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of files that were updated" }
					}
				*/
					this._telemetryService.sendMSFTTelemetryEvent('externalIngestIndex.updateIndex.success', {
						workspaceSearchSource: telemetryInfo.callTracker.toString(),
						workspaceSearchCorrelationId: telemetryInfo.correlationId,
					}, { durationMs: sw.elapsed(), totalFileCount: result.val.totalFileCount, updatedFileCount: result.val.updatedFileCount });

					return Result.ok(true);
				} else {
					/* __GDPR__
						"externalIngestIndex.updateIndex.error" : {
							"owner": "mjbvz",
							"comment": "Logged when external ingest index update fails",
							"error": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The error message" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the operation" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the operation" },
					"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time taken before failure in milliseconds" }
					}
				*/
					this._telemetryService.sendMSFTTelemetryErrorEvent('externalIngestIndex.updateIndex.error', {
						error: result.err.message,
						workspaceSearchSource: telemetryInfo.callTracker.toString(),
						workspaceSearchCorrelationId: telemetryInfo.correlationId,
					}, { durationMs: sw.elapsed() });
					return Result.error({
						id: 'external-ingest-error',
						userMessage: l10n.t("Failed to update external ingest index: {0}", result.err.message)
					});
				}
			} catch (e) {
				if (isCancellationError(e)) {
					throw e;
				}

				/* __GDPR__
					"externalIngestIndex.updateIndex.exception" : {
						"owner": "mjbvz",
						"comment": "Logged when external ingest index update throws an exception",
						"error": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The exception message" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the operation" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the operation" },
					"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time taken before exception in milliseconds" }
					}
				*/
				this._telemetryService.sendMSFTTelemetryErrorEvent('externalIngestIndex.updateIndex.exception', {
					error: (e as Error).message,
					workspaceSearchSource: telemetryInfo.callTracker.toString(),
					workspaceSearchCorrelationId: telemetryInfo.correlationId,
				}, { durationMs: sw.elapsed() });
				return Result.error({
					id: 'external-ingest-error',
					userMessage: l10n.t("Exception updating external ingest index: {0}", (e as Error).message)
				});
			} finally {
				if (this._currentIngestOperation === operation) {
					operation.completed = true;
				}
				this._onDidChangeState.fire();
			}
		});

		// Cancel existing since workspace state has changed
		this._currentIngestOperation?.promise.cancel();

		operation.promise = updatePromise;
		this._currentIngestOperation = operation;
		this._onDidChangeState.fire();

		return updatePromise;
	}

	async search(sizing: StrategySearchSizing, query: WorkspaceChunkQueryWithEmbeddings, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<readonly FileChunkAndScore[] | undefined> {
		const filesetName = this.getFilesetName();
		if (!filesetName) {
			return undefined;
		}

		const callTracker = telemetryInfo.callTracker.add('ExternalIngestIndex::search');
		const sw = new StopWatch();

		try {
			const resolvedQuery = query.queryText;

			const ingestResult = await raceCancellationError(this.doIngest(telemetryInfo, () => { }, token), token);
			if (!ingestResult.isOk()) {
				return undefined;
			}

			const searchResult = await raceCancellationError(
				(async () => {
					try {
						return await this._client.searchFilesets(filesetName, resolvedQuery, sizing.maxResultCountHint, callTracker, token);
					} catch (err) {
						if (err instanceof ExternalIngestRequestError && err.response.status === 404) {
							// On the first index or a large workspace, there might be a slight delay on the service
							// before the index is actually ready. Workaround by retrying just once after a short delay.
							await raceCancellationError(timeout(2000), token);
							return await this._client.searchFilesets(filesetName, resolvedQuery, sizing.maxResultCountHint, callTracker, token);
						}
						throw err;
					}
				})(),
				token);

			if (!searchResult || !searchResult.results) {
				return [];
			}

			const embeddingType = new EmbeddingType(searchResult.embedding_model);
			const primaryRoot = this._workspaceService.getWorkspaceFolders().at(0);

			const chunks: readonly FileChunkAndScore[] = coalesce(searchResult.results.map((r): FileChunkAndScore | undefined => {
				let file = this.fromIndexPath(r.location.path);
				if (!file) {
					this._logService.warn(`ExternalIngestIndex: Could not resolve file for search result path: ${r.location.path}`);

					// Make a best effort guess
					if (primaryRoot) {
						file = URI.joinPath(primaryRoot, r.location.path);
					}
				}

				if (!file) {
					return undefined;
				}

				return {
					distance: {
						embeddingType,
						value: r.distance,
					},
					chunk: {
						text: stripChunkTextMetadata(r.chunk.text),
						rawText: undefined,
						file,
						range: new Range(r.chunk.line_range.start, 0, r.chunk.line_range.end, 0),
					},
				};
			}));

			/* __GDPR__
				"externalIngestIndex.search.success" : {
					"owner": "mjbvz",
					"comment": "Logged when external ingest search completes successfully",
					"resultEmbeddingType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The embedding model used for the search" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"resultCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of chunks returned from the search" },
					"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time taken to complete the search in milliseconds" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('externalIngestIndex.search.success', {
				resultEmbeddingType: embeddingType.toString(),
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			}, {
				resultCount: chunks.length,
				durationMs: sw.elapsed()
			});

			return chunks;
		} catch (e) {
			if (isCancellationError(e)) {
				/* __GDPR__
					"externalIngestIndex.search.cancelled" : {
						"owner": "mjbvz",
						"comment": "Logged info about cancellation of external ingest search. Mostly for timeouts",
						"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
						"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
						"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time taken before the search was cancelled or aborted in milliseconds" }
					}
				*/
				this._telemetryService.sendMSFTTelemetryEvent('externalIngestIndex.search.cancelled', {
					workspaceSearchSource: telemetryInfo.callTracker.toString(),
					workspaceSearchCorrelationId: telemetryInfo.correlationId,
				}, {
					durationMs: sw.elapsed()
				});
				throw e;
			}

			/* __GDPR__
				"externalIngestIndex.search.error" : {
					"owner": "mjbvz",
					"comment": "Logged when external ingest search fails",
					"error": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The error message" },
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time taken before failure in milliseconds" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryErrorEvent('externalIngestIndex.search.error', {
				error: (e as Error).message,
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			}, { durationMs: sw.elapsed() });
			throw e;
		}
	}

	private openOrCreateDatabase(dbPath: string | ':memory:'): sql.DatabaseSync {
		this._logService.trace(`ExternalIngestIndex: Opening database at path: ${dbPath}`);

		// For in-memory databases, always create fresh
		if (dbPath === ':memory:') {
			return this.createFreshDatabase(dbPath);
		}

		// Try to open existing database and check cache version
		if (fs.existsSync(dbPath)) {
			try {
				const db = new sql.DatabaseSync(dbPath, {
					open: true,
					enableForeignKeyConstraints: true,
				});

				const storedVersion = this.getStoredCacheVersion(db);
				if (storedVersion === ingestUtils.cacheVersion()) {
					this._logService.trace(`ExternalIngestIndex: Cache version matches (${ingestUtils.cacheVersion()})`);
					return db;
				}

				// Version mismatch - close and delete
				this._logService.info(`ExternalIngestIndex: Cache version mismatch (stored: ${storedVersion}, current: ${ingestUtils.cacheVersion()}). Recreating database.`);
				db.close();
			} catch (error) {
				this._logService.warn(`ExternalIngestIndex: Failed to open existing database, will recreate: ${error}`);
			}

			// Delete the old database file
			try {
				fs.unlinkSync(dbPath);
			} catch (error) {
				this._logService.warn(`ExternalIngestIndex: Failed to delete old database file: ${error}`);
			}
		}

		return this.createFreshDatabase(dbPath);
	}

	private getStoredCacheVersion(db: sql.DatabaseSync): number | undefined {
		try {
			const row = db.prepare('SELECT value FROM Metadata WHERE key = ?').get('cacheVersion');
			if (row && typeof row.value === 'number') {
				return row.value;
			}
		} catch {
			// Table may not exist in older databases
		}
		return undefined;
	}

	private createFreshDatabase(dbPath: string | ':memory:'): sql.DatabaseSync {
		this._logService.trace(`ExternalIngestIndex: Creating fresh database at path: ${dbPath}`);

		const db = new sql.DatabaseSync(dbPath, {
			open: true,
			enableForeignKeyConstraints: true,
		});

		db.exec(`PRAGMA foreign_keys = ON;`);
		db.exec(`
			PRAGMA journal_mode = OFF;
			PRAGMA synchronous = 0;
			PRAGMA cache_size = 1000000;
			PRAGMA locking_mode = EXCLUSIVE;
			PRAGMA temp_store = MEMORY;
		`);

		db.exec(`
			CREATE TABLE IF NOT EXISTS Metadata (
				key TEXT PRIMARY KEY,
				value INTEGER NOT NULL
			);
		`);

		db.exec(`
			CREATE TABLE IF NOT EXISTS Files (
				path TEXT PRIMARY KEY,
				size INTEGER NOT NULL,
				mtime INTEGER NOT NULL,
				docSha BLOB,
				shouldIngest INTEGER NOT NULL DEFAULT 0
			);
		`);

		// Store the current cache version
		db.prepare('INSERT OR REPLACE INTO Metadata (key, value) VALUES (?, ?)').run('cacheVersion', ingestUtils.cacheVersion());

		return db;
	}

	private async tryAddOrUpdateFile(uri: URI) {
		const stat = await this.safeStat(uri);
		if (!stat) {
			this.delete(uri);
			return;
		}

		// Check if file already exists and hasn't changed
		const existing = this.get(uri);
		if (existing && existing.size === stat.size && existing.mtime === stat.mtime) {
			// File unchanged, keep existing state
			return;
		}

		// New or changed file - set to Undetermined so it will be evaluated later
		this._db.prepare(`
			INSERT INTO Files (path, size, mtime, docSha, shouldIngest)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(path) DO UPDATE SET size = excluded.size, mtime = excluded.mtime, docSha = NULL, shouldIngest = excluded.shouldIngest
		`).run(uri.toString(), stat.size, stat.mtime, null, ShouldIngestState.Undetermined);
	}

	/**
	 * Determines whether the given file should be tracked by the external ingest index.
	 *
	 * This does NOT consider whether the file should be ingested, only whether it should be tracked.
	 */
	public async shouldTrackFile(uri: URI, token: CancellationToken): Promise<boolean> {
		// Only track files within the current workspace
		if (!this._instantiationService.invokeFunction(accessor => shouldPotentiallyIndexFile(accessor, uri))) {
			return false;
		}

		// Don't index files that aren't part of the workspace
		if (!this._workspaceService.getWorkspaceFolder(uri)) {
			return false;
		}

		// Don't index files that are under a code search repo root
		// (unless they are force-included as diff files)
		if (!this._forceIncludeFiles.has(uri)) {
			for (const root of this._codeSearchRepoRoots) {
				if (isEqualOrParent(uri, root)) {
					return false;
				}
			}
		}

		return !await this._ignoreService.isCopilotIgnored(uri, token);
	}

	private async shouldIngestFile(uri: URI, stat: { readonly size: number; readonly mtime: number }, token: CancellationToken): Promise<Result<{ readonly docSha: Uint8Array }, false>> {
		if (!await this.shouldTrackFile(uri, token)) {
			return Result.error(false);
		}

		// Quick check based on path and size
		if (!this._client.canIngestPathAndSize(uri.fsPath, stat.size)) {
			return Result.error(false);
		}

		// Complete check based on document contents
		try {
			const data = await this._readLimiter.queue(() => this._fileSystemService.readFile(uri));
			if (!this._client.canIngestDocument(uri.fsPath, data)) {
				return Result.error(false);
			}
			const docSha = this.computeIngestDocShaFromContents(uri, data);
			if (!docSha) {
				return Result.error(false);
			}
			return Result.ok({ docSha });
		} catch (err) {
			this._logService.warn(`ExternalIngestIndex: Failed to read file for shouldIngest check, skipping file: ${uri.toString()}. Error: ${toErrorMessage(err, true)}`);
			return Result.error(false);
		}
	}

	private delete(uri: URI) {
		this._db.prepare('DELETE FROM Files WHERE path = ?').run(uri.toString());
	}

	private get(uri: URI): DbFileEntry | undefined {
		const row = this._db.prepare('SELECT size, mtime, docSha, shouldIngest FROM Files WHERE path = ?').get(uri.toString());
		if (!row) {
			return undefined;
		}

		return {
			path: uri.toString(),
			size: row.size as number,
			mtime: row.mtime as number,
			docSha: row.docSha as Uint8Array | null,
			shouldIngest: row.shouldIngest as ShouldIngestState
		};
	}

	private toIndexPath(uri: URI): string | undefined {
		const folder = this._workspaceService.getWorkspaceFolder(uri);
		if (folder) {
			const rel = relativePath(folder, uri);
			if (rel) {
				const folderId = this.workspaceFolderIdMap.getIdForFolder(folder);
				return `${folderId}/${rel}`;
			}
		}
		return undefined;
	}

	private fromIndexPath(indexPath: string): URI | undefined {
		const [folderId, ...rest] = indexPath.split('/');
		const folderUri = this.workspaceFolderIdMap.getFolderForId(folderId);
		if (folderUri) {
			return URI.joinPath(folderUri, ...rest);
		}

		// Old style indexes always use the first workspace folder as the root
		const primaryRoot = this._workspaceService.getWorkspaceFolders().at(0);
		if (!primaryRoot) {
			return undefined;
		}

		return URI.joinPath(primaryRoot, indexPath);
	}

	private createExternalIngestFile(uri: URI, docSha: Uint8Array): ExternalIngestFile | undefined {
		const relativePath = this.toIndexPath(uri);
		if (!relativePath) {
			return undefined;
		}

		return {
			uri,
			relativePath,
			docSha,
			read: () => this._readLimiter.queue(() => this._fileSystemService.readFile(uri)),
		};
	}

	private async *getFilesToIndexFromDb(token: CancellationToken): AsyncIterable<ExternalIngestFile> {
		// Get files that are either already marked "Yes" or "need to be evaluated" (Undetermined).
		// Order by path for deterministic results (important for stable checkpoint hashes).
		const rows = this._db.prepare('SELECT path, size, mtime, docSha, shouldIngest FROM Files WHERE shouldIngest IN (?, ?) ORDER BY path').all(ShouldIngestState.Yes, ShouldIngestState.Undetermined) as unknown as Array<DbFileEntry>;

		const limiter = new Limiter<ExternalIngestFile | undefined>(20);

		const processRow = async (row: DbFileEntry): Promise<ExternalIngestFile | undefined> => {
			const uri = URI.parse(row.path);

			// Skip files that are now under code search repos
			if (!await this.shouldTrackFile(uri, token)) {
				this.delete(uri);
				return undefined;
			}

			const stat = await raceCancellationError(this.safeStat(uri), token);
			if (!stat) {
				this.delete(uri);
				return undefined;
			}

			const storedSize = row.size;
			const storedMtime = row.mtime;
			const fileUnchanged = storedSize === stat.size && storedMtime === stat.mtime;

			// If file state is undetermined, we need to evaluate it
			if (row.shouldIngest === ShouldIngestState.Undetermined) {
				const result = await this.shouldIngestFile(uri, stat, token);
				if (result.isOk()) {
					this._db.prepare('UPDATE Files SET shouldIngest = ?, docSha = ?, size = ?, mtime = ? WHERE path = ?')
						.run(ShouldIngestState.Yes, result.val.docSha, stat.size, stat.mtime, uri.toString());

					return this.createExternalIngestFile(uri, result.val.docSha);
				} else {
					this._db.prepare('UPDATE Files SET shouldIngest = ?, size = ?, mtime = ? WHERE path = ?')
						.run(ShouldIngestState.No, stat.size, stat.mtime, uri.toString());
				}
				return undefined;
			}

			// File is already marked Yes - use cached docSha if file unchanged
			let docSha: Uint8Array | undefined = fileUnchanged ? row.docSha ?? undefined : undefined;

			if (!docSha) {
				docSha = await raceCancellationError(this.computeIngestDocSha(uri), token);
				if (!docSha) {
					return undefined;
				}

				// Store the computed docSha in the database
				this._db.prepare('UPDATE Files SET docSha = ? WHERE path = ?').run(docSha, uri.toString());
			}

			return this.createExternalIngestFile(uri, docSha);
		};

		// Queue all work upfront to run in parallel, then yield results in order as they complete
		const pendingResults = rows.map(row => limiter.queue(() => processRow(row)));

		for (const pending of pendingResults) {
			const result = await raceCancellationError(pending, token);
			if (result) {
				yield result;
			}
		}
	}

	private async reconcileDbFiles(): Promise<void> {
		await this._workspaceService.ensureWorkspaceIsFullyLoaded();
		await this._ignoreService.init();

		const initialDbFiles = new ResourceSet();
		for (const uri of this.iterateDbFiles()) {
			initialDbFiles.add(uri);
		}

		this._logService.trace(`ExternalIngestIndex::reconcileDbFiles() Found ${initialDbFiles.size} initial file entries in database.`);

		let addedFileCount = 0;
		let updatedFileCount = 0;
		let removedFileCount = 0;

		const seen = new ResourceSet();
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();

		for (const folder of workspaceFolders) {
			const paths = await this._searchService.findFilesWithDefaultExcludes(
				new RelativePattern(folder, '**/*'),
				Number.MAX_SAFE_INTEGER,
				CancellationToken.None
			);

			this._logService.trace(`ExternalIngestIndex::reconcileDbFiles() Found ${paths.length} candidate files in workspace folder ${folder.toString()}.`);

			for (const uri of paths) {
				// Skip files under code search repos
				if (!await this.shouldTrackFile(uri, CancellationToken.None)) {
					continue;
				}

				const stat = await this.safeStat(uri);
				if (!stat) {
					continue;
				}

				seen.add(uri);

				const existing = this.get(uri);
				if (!existing) {
					await this.tryAddOrUpdateFile(uri);
					addedFileCount++;
				} else if (existing.size !== stat.size || existing.mtime !== stat.mtime) {
					await this.tryAddOrUpdateFile(uri);
					updatedFileCount++;
				}
			}
		}

		// Remove files that no longer exist
		for (const uri of initialDbFiles) {
			if (!seen.has(uri)) {
				this.delete(uri);
				removedFileCount++;
			}
		}
		this._logService.trace(`ExternalIngestIndex::reconcileDbFiles() Reconciled database. Added: ${addedFileCount}, updated: ${updatedFileCount}, removed: ${removedFileCount}`);
	}

	private registerWatcher(): void {
		if (this._watchers.value) {
			return;
		}

		const addWatchersFolder = (folder: URI): IDisposable => {
			const disposables = new DisposableStore();

			const watcher = disposables.add(this._fileSystemService.createFileSystemWatcher(new RelativePattern(folder, '**/*')));
			disposables.add(watcher.onDidCreate(uri => this.onFileAdded(uri)));
			disposables.add(watcher.onDidChange(uri => this.onFileChanged(uri)));
			disposables.add(watcher.onDidDelete(uri => this.onFileDeleted(uri)));

			return disposables;
		};

		const watchersForWorkspaceFolders = new ResourceMap<IDisposable>();
		for (const folder of this._workspaceService.getWorkspaceFolders()) {
			watchersForWorkspaceFolders.set(folder, addWatchersFolder(folder));
		}

		const folderChangeSubscription = this._workspaceService.onDidChangeWorkspaceFolders(e => {
			for (const removed of e.removed) {
				const disposable = watchersForWorkspaceFolders.get(removed.uri);
				if (disposable) {
					disposable.dispose();
					watchersForWorkspaceFolders.delete(removed.uri);
				}
			}

			for (const added of e.added) {
				if (!watchersForWorkspaceFolders.has(added.uri)) {
					watchersForWorkspaceFolders.set(added.uri, addWatchersFolder(added.uri));
				}
			}
		});

		this._watchers.value = toDisposable(() => {
			folderChangeSubscription.dispose();

			for (const disposable of watchersForWorkspaceFolders.values()) {
				disposable.dispose();
			}
			watchersForWorkspaceFolders.clear();
		});
	}

	private async onFileAdded(uri: URI): Promise<void> {
		if (!await this.shouldTrackFile(uri, CancellationToken.None)) {
			return;
		}

		await this.tryAddOrUpdateFile(uri);
	}

	private async onFileChanged(uri: URI): Promise<void> {
		if (!await this.shouldTrackFile(uri, CancellationToken.None)) {
			return;
		}

		await this.tryAddOrUpdateFile(uri);
	}

	private onFileDeleted(uri: URI): void {
		this.delete(uri);
		this.deleteFolder(uri);
	}

	private deleteFolder(folder: URI): void {
		const folderKey = folder.toString().replace(/\/?$/, '/');
		this._db.prepare('DELETE FROM Files WHERE path LIKE ?').run(`${folderKey}%`);
	}

	private async safeStat(uri: URI): Promise<{ size: number; mtime: number } | undefined> {
		try {
			const stat = await this._fileSystemService.stat(uri);
			// Check it's a file, not a directory
			if (stat.type !== 1) { // FileType.File = 1
				return undefined;
			}
			return { size: stat.size, mtime: stat.mtime };
		} catch {
			return undefined;
		}
	}

	private computeIngestDocShaFromContents(uri: URI, data: Uint8Array): Uint8Array | undefined {
		const relativePath = this.toIndexPath(uri);
		if (!relativePath) {
			return undefined;
		}
		return ingestUtils.getDocSha(relativePath, new ingestUtils.DocumentContents(data));
	}

	private async computeIngestDocSha(uri: URI): Promise<Uint8Array | undefined> {
		try {
			const data = await this._readLimiter.queue(() => this._fileSystemService.readFile(uri));
			return this.computeIngestDocShaFromContents(uri, data);
		} catch {
			return undefined;
		}
	}

	private getFilesetName(): string | undefined {
		const stored = this._vsExtensionContext.workspaceState.get<string>(ExternalIngestIndex.storageKeys.FileSetName);
		if (stored) {
			return stored;
		}

		// Don't bother building up external ingest sets if there's no workspace as often these are transient and only
		// have a handful of files.
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();
		if (!workspaceFolders.length) {
			return undefined;
		}

		const name = `vscode.${this._envService.getName()}.${generateUuid()}`;
		this._vsExtensionContext.workspaceState.update(ExternalIngestIndex.storageKeys.FileSetName, name);
		return name;
	}

	private *iterateDbFiles(): Iterable<URI> {
		const rows = this._db.prepare('SELECT path FROM Files').all() as Array<{ path: string }>;
		for (const row of rows) {
			yield URI.parse(row.path);
		}
	}
}


