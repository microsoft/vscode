/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestMetadata, RequestType } from '@vscode/copilot-api';
import { ITokenizer } from '../../../util/common/tokenizer';
import { IEmbeddingsEndpoint } from '../../networking/common/networking';
import { ITokenizerProvider } from '../../tokenizer/node/tokenizer';
import { IEmbeddingModelInformation } from '../common/endpointProvider';

export class EmbeddingEndpoint implements IEmbeddingsEndpoint {
	public readonly maxBatchSize: number;
	public readonly modelMaxPromptTokens: number;

	public readonly name = this._modelInfo.name;
	public readonly version = this._modelInfo.version;
	public readonly family = this._modelInfo.capabilities.family;
	public readonly tokenizer = this._modelInfo.capabilities.tokenizer;

	constructor(
		private _modelInfo: IEmbeddingModelInformation,
		@ITokenizerProvider private readonly _tokenizerProvider: ITokenizerProvider
	) {
		this.maxBatchSize = this._modelInfo.capabilities.limits?.max_inputs ?? 256;
		this.modelMaxPromptTokens = 8192;
	}

	public acquireTokenizer(): ITokenizer {
		return this._tokenizerProvider.acquireTokenizer(this);
	}

	public get urlOrRequestMetadata(): string | RequestMetadata {
		return { type: RequestType.CAPIEmbeddings };
	}
}
