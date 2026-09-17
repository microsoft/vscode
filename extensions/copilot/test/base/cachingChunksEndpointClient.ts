/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FileChunkWithEmbedding, FileChunkWithOptionalEmbedding } from '../../src/platform/chunking/common/chunk';
import { ChunkableContent, ComputeBatchInfo, EmbeddingsComputeQos, IChunkingEndpointClient } from '../../src/platform/chunking/common/chunkingEndpointClient';
import { ChunkingEndpointClientImpl } from '../../src/platform/chunking/common/chunkingEndpointClientImpl';
import { EmbeddingType } from '../../src/platform/embeddings/common/embeddingsComputer';
import { createSha256Hash } from '../../src/util/common/crypto';
import { CallTracker } from '../../src/util/common/telemetryCorrelationId';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { URI } from '../../src/util/vs/base/common/uri';
import { Range } from '../../src/util/vs/editor/common/core/range';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { CHUNKING_ENDPOINT_CACHE_SALT } from '../cacheSalt';
import { SQLiteCache } from './cache';
import { CurrentTestRunInfo } from './simulationContext';

class CacheableChunkingEndpointClientRequest {

	static async create(content: ChunkableContent) {
		const hash = await createSha256Hash(CHUNKING_ENDPOINT_CACHE_SALT + await content.getText());
		return new CacheableChunkingEndpointClientRequest(hash, content);
	}

	private constructor(
		readonly hash: string,
		readonly content: ChunkableContent,
	) { }
}

interface IChunkingEndpointClientCache {
	get(req: CacheableChunkingEndpointClientRequest): Promise<FileChunkWithEmbedding[] | undefined>;
	set(req: CacheableChunkingEndpointClientRequest, cachedResponse: readonly FileChunkWithEmbedding[]): Promise<void>;
}

export class ChunkingEndpointClientSQLiteCache extends SQLiteCache<CacheableChunkingEndpointClientRequest, FileChunkWithEmbedding[]> implements IChunkingEndpointClientCache {

	constructor(salt: string, currentTestRunInfo: CurrentTestRunInfo) {
		super('chunks-endpoint', salt, currentTestRunInfo);
	}

	override async get(req: CacheableChunkingEndpointClientRequest): Promise<FileChunkWithEmbedding[] | undefined> {
		const result = await super.get(req);

		// Revive objects from cache
		return result?.map(cachedResponse => {
			const chunk: FileChunkWithEmbedding = {
				chunk: {
					file: URI.from(cachedResponse.chunk.file),
					range: new Range(cachedResponse.chunk.range.startLineNumber, cachedResponse.chunk.range.startColumn, cachedResponse.chunk.range.endLineNumber, cachedResponse.chunk.range.endColumn),
					isFullFile: cachedResponse.chunk.isFullFile,
					text: cachedResponse.chunk.text,
					rawText: cachedResponse.chunk.rawText,
				},
				chunkHash: cachedResponse.chunkHash,
				embedding: cachedResponse.embedding,
			};

			return chunk;
		});
	}
}

export class CachingChunkingEndpointClient implements IChunkingEndpointClient {
	declare readonly _serviceBrand: undefined;
	private readonly _chunkingEndpointClient: IChunkingEndpointClient;

	constructor(
		private readonly _cache: IChunkingEndpointClientCache,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this._chunkingEndpointClient = instantiationService.createInstance(ChunkingEndpointClientImpl);
	}

	async computeChunksAndEmbeddings(authToken: string, embeddingType: EmbeddingType, content: ChunkableContent, batchInfo: ComputeBatchInfo, qos: EmbeddingsComputeQos, cache: ReadonlyMap</* hash */string, FileChunkWithEmbedding> | undefined, telemetryInfo: CallTracker, token: CancellationToken): Promise<readonly FileChunkWithEmbedding[] | undefined> {
		const req = await CacheableChunkingEndpointClientRequest.create(content);
		const cacheValue = await this._cache.get(req);
		if (cacheValue) {
			return cacheValue;
		}

		const result = await this._chunkingEndpointClient.computeChunksAndEmbeddings(authToken, embeddingType, content, batchInfo, qos, cache, telemetryInfo, token);
		if (result) {
			await this._cache.set(req, result);
		}

		return result;
	}

	computeChunks(authToken: string, embeddingType: EmbeddingType, content: ChunkableContent, batchInfo: ComputeBatchInfo, qos: EmbeddingsComputeQos, cache: ReadonlyMap<string, FileChunkWithEmbedding> | undefined, telemetryInfo: CallTracker, token: CancellationToken): Promise<readonly FileChunkWithOptionalEmbedding[] | undefined> {
		return this.computeChunksAndEmbeddings(authToken, embeddingType, content, batchInfo, qos, cache, telemetryInfo, token);
	}
}