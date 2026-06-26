/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITokenizer, TokenizerType } from '../../../util/common/tokenizer';
import { EmbeddingType } from '../../embeddings/common/embeddingsComputer';
import { IEmbeddingsEndpoint } from '../../networking/common/networking';

/**
 * Embeddings endpoint that wraps an extension-contributed embedding model
 * (registered via `vscode.lm.registerEmbeddingsProvider`). Delegates
 * embedding computation to `vscode.lm.computeEmbeddings` rather than
 * making HTTP requests to a CAPI endpoint.
 */
export class ExtensionContributedEmbeddingEndpoint implements IEmbeddingsEndpoint {

	public readonly isExtensionContributed = true;
	public readonly maxBatchSize: number;
	public readonly modelMaxPromptTokens: number;

	private _embeddingType: EmbeddingType;
	private _dimensions: number | undefined;

	private static readonly DEFAULT_MAX_BATCH_SIZE = 100;
	private static readonly DEFAULT_MAX_PROMPT_TOKENS = 8191;

	constructor(
		private readonly _modelId: string,
	) {
		this.maxBatchSize = ExtensionContributedEmbeddingEndpoint.DEFAULT_MAX_BATCH_SIZE;
		this.modelMaxPromptTokens = ExtensionContributedEmbeddingEndpoint.DEFAULT_MAX_PROMPT_TOKENS;
		this._embeddingType = new EmbeddingType(this._modelId);
	}

	/**
	 * The embedding type for this endpoint.
	 * After the first successful computeEmbeddings call, this will include
	 * the probed dimensions.
	 */
	get embeddingType(): EmbeddingType {
		return this._embeddingType;
	}

	/**
	 * The probed dimensions of the embedding output, or undefined if not yet probed.
	 */
	get dimensions(): number | undefined {
		return this._dimensions;
	}

	get urlOrRequestMetadata(): string {
		// Not used for extension-contributed endpoints; the computeEmbeddings
		// method is called directly instead of going through postRequest.
		return '';
	}

	get name(): string {
		return this._modelId;
	}

	get version(): string {
		return '';
	}

	get family(): string {
		return this._modelId;
	}

	get tokenizer(): TokenizerType {
		return TokenizerType.O200K;
	}

	acquireTokenizer(): ITokenizer {
		// ITokenizer is used for token counting in RemoteEmbeddingsComputer.
		// For extension-contributed endpoints we don't have a real tokenizer,
		// so we throw and let the caller handle the fallback.
		throw new Error('acquireTokenizer is not supported for extension-contributed embedding endpoints');
	}

	/**
	 * Computes embeddings for the given inputs by delegating to the
	 * extension-contributed provider via `vscode.lm.computeEmbeddings`.
	 *
	 * On first successful call, probes the dimensions of the output
	 * and updates {@link embeddingType} accordingly.
	 *
	 * @param inputs Array of strings to embed.
	 * @param token Cancellation token.
	 * @returns Array of embedding vectors, one per input.
	 */
	async computeEmbeddings(inputs: string[], token?: vscode.CancellationToken): Promise<number[][]> {
		const results = await vscode.lm.computeEmbeddings(this._modelId, inputs, token);
		const vectors = results.map(r => r.values);

		// Probe dimensions on first successful call
		if (this._dimensions === undefined && vectors.length > 0 && vectors[0].length > 0) {
			this._dimensions = vectors[0].length;
			// Update the embedding type with the probed dimensions.
			// This ensures downstream consumers (cache, distance checks) get
			// the correct dimension information.
			this._embeddingType = new EmbeddingType(this._modelId, this._dimensions);
		}

		return vectors;
	}
}
