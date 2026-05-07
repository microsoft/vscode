/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EmbeddingVector } from '../../src/platform/embeddings/common/embeddingsComputer';
import { SQLiteCache } from './cache';
import { CacheableEmbeddingRequest, IEmbeddingsCache } from './cachingEmbeddingsFetcher';
import { CurrentTestRunInfo } from './simulationContext';

export const usedEmbeddingsCaches = new Set<string>();

export class EmbeddingsSQLiteCache extends SQLiteCache<CacheableEmbeddingRequest, EmbeddingVector> implements IEmbeddingsCache {
	constructor(salt: string, currentTestRunInfo: CurrentTestRunInfo) {
		super('embeddings', salt, currentTestRunInfo);
	}
}