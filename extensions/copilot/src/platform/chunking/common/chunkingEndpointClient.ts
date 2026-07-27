/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { CallTracker } from '../../../util/common/telemetryCorrelationId';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { URI } from '../../../util/vs/base/common/uri';
import { EmbeddingType } from '../../embeddings/common/embeddingsComputer';
import { FileChunkWithEmbedding, FileChunkWithOptionalEmbedding } from './chunk';


export class ComputeBatchInfo {
	recomputedFileCount = 0;
	sentContentTextLength = 0;
}

export enum EmbeddingsComputeQos {
	Batch = 'Batch',
	Online = 'Online',
}

export const IChunkingEndpointClient = createServiceIdentifier<IChunkingEndpointClient>('IChunkingEndpointClient');

export interface ChunkableContent {
	readonly uri: URI;

	/**
	 * Overrides the language ID GitHub uses to chunk the file
	 *
	 * If not provided, the language ID will be inferred from path and content of the file.
	 *
	 * Ids can be found in https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml
	 */
	readonly githubLanguageId?: number;

	getText(): Promise<string>;
}


/**
 * The chunking and embedding endpoint client.
 */
export interface IChunkingEndpointClient {
	readonly _serviceBrand: undefined;

	computeChunks(
		authToken: string,
		embeddingType: EmbeddingType,
		content: ChunkableContent,
		batchInfo: ComputeBatchInfo,
		qos: EmbeddingsComputeQos,
		cache: ReadonlyMap</* hash */string, FileChunkWithEmbedding> | undefined,
		telemetryInfo: CallTracker,
		token: CancellationToken,
	): Promise<readonly FileChunkWithOptionalEmbedding[] | undefined>;

	computeChunksAndEmbeddings(
		authToken: string,
		embeddingType: EmbeddingType,
		content: ChunkableContent,
		batchInfo: ComputeBatchInfo,
		qos: EmbeddingsComputeQos,
		cache: ReadonlyMap</* hash */string, FileChunkWithEmbedding> | undefined,
		telemetryInfo: CallTracker,
		token: CancellationToken,
	): Promise<readonly FileChunkWithEmbedding[] | undefined>;
}
