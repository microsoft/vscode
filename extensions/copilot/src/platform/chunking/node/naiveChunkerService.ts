/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Uri } from '../../../vscodeTypes';
import { ITokenizerProvider, TokenizationEndpoint } from '../../tokenizer/node/tokenizer';
import { FileChunk } from '../common/chunk';
import { MAX_CHUNK_SIZE_TOKENS, NaiveChunker } from './naiveChunker';

interface NaiveChunkingOptions {
	/**
	 * The desired maximum length of each chunk in tokens
	 */
	readonly maxTokenLength?: number;
	readonly validateChunkLengths?: boolean;
	readonly includeExtraBodyOutsideRange?: boolean; // only gets applied if limitToRange is set
}

export interface INaiveChunkingService {

	/**
	 * Splits `text` into smaller chunks of roughly equal length using a scrolling window approach.
	 */
	chunkFile(endpoint: TokenizationEndpoint, fileUri: Uri, text: string, options: NaiveChunkingOptions, token: CancellationToken): Promise<FileChunk[]>;
}

export const INaiveChunkingService = createServiceIdentifier<INaiveChunkingService>('INaiveChunkingService');

export class NaiveChunkingService implements INaiveChunkingService {

	declare _serviceBrand: undefined;

	private readonly naiveChunkers = new Map</*endpoint */ string, NaiveChunker>();

	constructor(
		@ITokenizerProvider private readonly tokenizerProvider: ITokenizerProvider,
	) { }

	async chunkFile(endpoint: TokenizationEndpoint, uri: Uri, text: string, options: NaiveChunkingOptions, token: CancellationToken): Promise<FileChunk[]> {
		const maxTokenLength = options?.maxTokenLength ?? MAX_CHUNK_SIZE_TOKENS;

		const out = await this.getNaiveChunker(endpoint).chunkFile(uri, text, { maxTokenLength }, token);
		if (options?.validateChunkLengths) {
			await this.validateChunkLengths(out, maxTokenLength, endpoint);
		}

		return out.filter(x => x.text);
	}

	private getNaiveChunker(endpoint: TokenizationEndpoint): NaiveChunker {
		const cached = this.naiveChunkers.get(endpoint.tokenizer);
		if (cached) {
			return cached;
		}

		const chunker = new NaiveChunker(endpoint, this.tokenizerProvider);
		this.naiveChunkers.set(endpoint.tokenizer, chunker);
		return chunker;
	}

	private async validateChunkLengths(chunks: FileChunk[], maxTokenLength: number, endpoint: TokenizationEndpoint) {
		for (const chunk of chunks) {
			const tokenLength = await this.tokenizerProvider.acquireTokenizer(endpoint).tokenLength(chunk.text);
			if (tokenLength > maxTokenLength * 1.2) {
				console.warn('Produced chunk that is over length limit', { file: chunk.file + '', range: chunk.range, chunkTokenLength: tokenLength, maxLength: maxTokenLength });
			}
		}
	}
}

