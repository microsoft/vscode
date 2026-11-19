/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { shouldInclude } from '../../../../util/common/glob';
import { TelemetryCorrelationId } from '../../../../util/common/telemetryCorrelationId';
import { coalesce } from '../../../../util/vs/base/common/arrays';
import { Limiter, raceCancellationError } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { ResourceMap, ResourceSet } from '../../../../util/vs/base/common/map';
import { URI } from '../../../../util/vs/base/common/uri';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { FileChunkAndScore, FileChunkWithEmbedding } from '../../../chunking/common/chunk';
import { ComputeBatchInfo, EmbeddingsComputeQos, IChunkingEndpointClient } from '../../../chunking/common/chunkingEndpointClient';
import { EmbeddingType, rankEmbeddings } from '../../../embeddings/common/embeddingsComputer';
import { IFileSystemService } from '../../../filesystem/common/fileSystemService';
import { ILogService } from '../../../log/common/logService';
import { WorkspaceChunkQueryWithEmbeddings, WorkspaceChunkSearchOptions } from '../../common/workspaceChunkSearch';
import { FileRepresentation, IWorkspaceFileIndex } from '../workspaceFileIndex';

/**
 * Searches files that differ from what the remote code search index has indexed.
 *
 * Chunks and embeddings come from the Copilot chunks endpoint and are ranked locally. They are cached in memory
 * per file representation and on-disk version, so repeated searches only recompute files that changed again.
 */
export class LocalDiffEmbeddingsSearch {

	/**
	 * Maximum number of changed files we compute embeddings for in a single search.
	 */
	public static readonly maxFileCount = 300;

	private static readonly maxParallelFileOps = 50;

	private readonly _cache = new ResourceMap<{ readonly file: FileRepresentation; readonly diskVersion: string | undefined; readonly chunks: readonly FileChunkWithEmbedding[] }>();

	constructor(
		private readonly _embeddingType: EmbeddingType,
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@IChunkingEndpointClient private readonly _chunkingEndpointClient: IChunkingEndpointClient,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceFileIndex private readonly _workspaceFileIndex: IWorkspaceFileIndex,
	) { }

	/**
	 * @returns The top chunks from {@linkcode files}, or `undefined` if the files could not be searched.
	 */
	async search(files: readonly URI[], query: WorkspaceChunkQueryWithEmbeddings, maxResults: number, options: WorkspaceChunkSearchOptions, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<FileChunkAndScore[] | undefined> {
		// Files that are no longer changed are covered by the remote index again
		const changedFiles = new ResourceSet(files);
		for (const uri of Array.from(this._cache.keys())) {
			if (!changedFiles.has(uri)) {
				this._cache.delete(uri);
			}
		}

		const includedFiles = files.filter(uri => shouldInclude(uri, options.globPatterns));
		if (!includedFiles.length) {
			return [];
		}

		if (includedFiles.length > LocalDiffEmbeddingsSearch.maxFileCount) {
			this._logService.debug(`LocalDiffEmbeddingsSearch: ${includedFiles.length} changed files exceeds limit of ${LocalDiffEmbeddingsSearch.maxFileCount}`);
			return undefined;
		}

		const authToken = (await raceCancellationError(this._authService.getGitHubSession('any', { silent: true }), token))?.accessToken;
		if (!authToken) {
			this._logService.debug('LocalDiffEmbeddingsSearch: no GitHub session');
			return undefined;
		}

		const queryEmbedding = query.resolveQueryEmbeddings(token);
		const batchInfo = new ComputeBatchInfo();
		const limiter = new Limiter<readonly FileChunkWithEmbedding[] | undefined>(LocalDiffEmbeddingsSearch.maxParallelFileOps);
		try {
			const perFileChunks = await raceCancellationError(Promise.all(includedFiles.map(uri => limiter.queue(async () => {
				// Content exclusions may have changed since the file entered the diff
				if (!await this._workspaceFileIndex.shouldIndexWorkspaceFile(uri, token)) {
					this._cache.delete(uri);
					return [];
				}

				const file = await this._workspaceFileIndex.tryLoad(uri);
				return file ? this.getChunksAndEmbeddings(authToken, file, batchInfo, telemetryInfo, token) : [];
			}))), token);

			// Without chunks for a changed file we can't replace its stale remote results, so fail the whole diff search
			if (perFileChunks.some(chunks => !chunks)) {
				this._logService.debug('LocalDiffEmbeddingsSearch: could not compute chunks for some changed files');
				return undefined;
			}

			const chunks = coalesce(perFileChunks).flat();
			return rankEmbeddings(await raceCancellationError(queryEmbedding, token), chunks.map(x => [x.chunk, x.embedding] as const), maxResults)
				.map((x): FileChunkAndScore => ({ chunk: x.value, distance: x.distance }));
		} finally {
			limiter.dispose();
		}
	}

	private async getChunksAndEmbeddings(authToken: string, file: FileRepresentation, batchInfo: ComputeBatchInfo, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<readonly FileChunkWithEmbedding[] | undefined> {
		// The file index replaces a file's representation when it sees a change, but it can miss disk changes
		// (for example under `files.watcherExclude`), so also compare the file's size and mtime
		const diskVersion = await this.getDiskVersion(file.uri);
		const cached = this._cache.get(file.uri);
		if (cached?.file === file && cached.diskVersion === diskVersion) {
			return cached.chunks;
		}

		// Reuse embeddings for chunks that did not change since the last computation
		const previousChunks = new Map(cached?.chunks.flatMap(x => x.chunkHash ? [[x.chunkHash, x] as const] : []));
		const chunks = await this._chunkingEndpointClient.computeChunksAndEmbeddings(authToken, this._embeddingType, file, batchInfo, EmbeddingsComputeQos.Batch, previousChunks, telemetryInfo.callTracker.add('LocalDiffEmbeddingsSearch::getChunksAndEmbeddings'), token);

		// The file index replaces a file's representation when it changes, and a replaced one reads as empty
		if (this._workspaceFileIndex.get(file.uri) !== file) {
			return undefined;
		}

		if (chunks) {
			this._cache.set(file.uri, { file, diskVersion, chunks });
		}
		return chunks;
	}

	private async getDiskVersion(uri: URI): Promise<string | undefined> {
		try {
			const stat = await this._fileSystemService.stat(uri);
			return `${stat.size}-${stat.mtime}`;
		} catch {
			return undefined;
		}
	}
}
