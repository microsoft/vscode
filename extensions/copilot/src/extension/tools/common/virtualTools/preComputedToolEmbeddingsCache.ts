/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Embedding, EmbeddingType, EmbeddingVector } from '../../../../platform/embeddings/common/embeddingsComputer';
import { EmbeddingCacheType, IEmbeddingsCache, RemoteCacheType, RemoteEmbeddingsCache } from '../../../../platform/embeddings/common/embeddingsIndex';
import { IEnvService } from '../../../../platform/env/common/envService';
import { ILogService } from '../../../../platform/log/common/logService';
import { sanitizeVSCodeVersion } from '../../../../util/common/vscodeVersion';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IToolEmbeddingsCache } from './toolEmbeddingsComputer';

export const EMBEDDING_TYPE_FOR_TOOL_GROUPING = EmbeddingType.metis_1024_I16_Binary;

type ToolEmbeddingCacheData =
	| Record<string, { readonly embedding: EmbeddingVector }>
	| readonly { readonly key: string; readonly embedding: EmbeddingVector }[];

export class PreComputedToolEmbeddingsCache implements IToolEmbeddingsCache {
	private readonly cache: IEmbeddingsCache;
	private embeddingsMap: Map<string, Embedding> | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEnvService envService: IEnvService
	) {
		const cacheVersion = sanitizeVSCodeVersion(envService.getEditorInfo().version);
		this.cache = instantiationService.createInstance(RemoteEmbeddingsCache, EmbeddingCacheType.GLOBAL, 'toolEmbeddings', cacheVersion, EMBEDDING_TYPE_FOR_TOOL_GROUPING, RemoteCacheType.Tools);
	}

	public get embeddingType(): EmbeddingType {
		return this.cache.embeddingType;
	}

	public async initialize(): Promise<void> {
		this.embeddingsMap = await this._loadEmbeddings();
	}

	public get(tool: { name: string }): Embedding | undefined {
		return this.embeddingsMap?.get(tool.name);
	}

	public set(): void {
		// Read-only cache
	}

	private async _loadEmbeddings() {
		try {
			const embeddingsData = await this.cache.getCache<ToolEmbeddingCacheData>();
			const embeddingsMap = new Map<string, Embedding>();

			if (Array.isArray(embeddingsData)) {
				for (const entry of embeddingsData) {
					embeddingsMap.set(entry.key, {
						type: this.embeddingType,
						value: entry.embedding
					});
				}
			} else if (embeddingsData) {
				for (const [key, entry] of Object.entries(embeddingsData)) {
					embeddingsMap.set(key, {
						type: this.embeddingType,
						value: entry.embedding
					});
				}
			}

			return embeddingsMap;
		} catch (e) {
			this._logService.error('Failed to load pre-computed tool embeddings', e);
			return new Map<string, Embedding>();
		}
	}
}
