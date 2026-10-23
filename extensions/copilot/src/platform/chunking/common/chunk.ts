/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../util/vs/base/common/uri';
import { Range } from '../../../util/vs/editor/common/core/range';
import { Embedding, EmbeddingDistance } from '../../embeddings/common/embeddingsComputer';

export interface Chunk {
	/**
	 * The text content of the chunk.
	 */
	readonly text: string;
}

/**
 * A single {@linkcode Chunk} from a file.
 *
 * File chunk {@linkcode Chunk.text text} may include `...` style markup for emitted and additional prefix and suffix text that provide context.
 */
export interface FileChunk extends Chunk {

	/**
	 * Just the code in the chunk's range, without any additional prefix or suffix.
	 */
	readonly rawText: string | undefined;

	/**
	 * File this chunk came from from.
	 */
	readonly file: URI;

	/**
	 * The primary range the chunk was taken from.
	 */
	readonly range: Range;

	/**
	 * Whether the chunk represents the whole file.
	 */
	readonly isFullFile?: boolean;
}

export interface FileChunkAndScore<T extends FileChunk = FileChunk> {
	readonly chunk: T;
	readonly distance: EmbeddingDistance | undefined;
}

export type FileChunkWithOptionalEmbedding = {
	readonly chunk: FileChunk;
	readonly chunkHash: string | undefined;
	readonly embedding: Embedding | undefined;
};

export type FileChunkWithEmbedding = {
	readonly chunk: FileChunk;
	readonly embedding: Embedding;
	readonly chunkHash: string | undefined;
};
