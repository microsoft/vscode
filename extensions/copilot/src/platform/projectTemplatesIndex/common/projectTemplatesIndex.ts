/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { sanitizeVSCodeVersion } from '../../../util/common/vscodeVersion';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Embedding, EmbeddingType, EmbeddingVector, rankEmbeddings } from '../../embeddings/common/embeddingsComputer';
import { EmbeddingCacheType, IEmbeddingsCache, LocalEmbeddingsCache, RemoteCacheType, RemoteEmbeddingsCache } from '../../embeddings/common/embeddingsIndex';
import { IEnvService } from '../../env/common/envService';

export type ProjectTemplateItem = {
	key: string;
	embedding?: EmbeddingVector;
};

export interface IProjectTemplatesIndex {
	readonly _serviceBrand: undefined;
	updateIndex(): Promise<void>;
	nClosestValues(embedding: Embedding, n: number): Promise<string[]>;
}

export const IProjectTemplatesIndex = createServiceIdentifier<IProjectTemplatesIndex>('IProjectTemplatesIndex');

export class ProjectTemplatesIndex implements IProjectTemplatesIndex {
	declare _serviceBrand: undefined;

	private readonly embeddingsCache: IEmbeddingsCache;
	private _embeddings: ProjectTemplateItem[] | undefined;
	private _isIndexLoaded = false;

	constructor(
		useRemoteCache: boolean = true,
		@IEnvService envService: IEnvService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		const cacheVersion = sanitizeVSCodeVersion(envService.getEditorInfo().version);
		this.embeddingsCache = useRemoteCache ?
			instantiationService.createInstance(RemoteEmbeddingsCache, EmbeddingCacheType.GLOBAL, 'projectTemplateEmbeddings', cacheVersion, EmbeddingType.text3small_512, RemoteCacheType.ProjectTemplates)
			: instantiationService.createInstance(LocalEmbeddingsCache, EmbeddingCacheType.GLOBAL, 'projectTemplateEmbeddings', cacheVersion, EmbeddingType.text3small_512);
	}

	async updateIndex(): Promise<void> {
		if (this._isIndexLoaded) {
			return;
		}
		this._isIndexLoaded = true;
		this._embeddings = await this.embeddingsCache.getCache();
	}

	public async nClosestValues(embedding: Embedding, n: number): Promise<string[]> {
		await this.updateIndex();
		if (!this._embeddings) {
			return [];
		}

		return rankEmbeddings(embedding, this._embeddings.filter(x => x.embedding).map(item => [`${item.key} `, { type: this.embeddingsCache.embeddingType, value: item.embedding! } satisfies Embedding] as const), n)
			.map(x => x.value);
	}
}
