/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export const IAiEmbeddingVectorService = createDecorator<IAiEmbeddingVectorService>('IAiEmbeddingVectorService');

export interface IAiEmbeddingVectorService {
	readonly _serviceBrand: undefined;

	isEnabled(): boolean;
	registerAiEmbeddingVectorProvider(model: string, provider: IAiEmbeddingVectorProvider): IDisposable;
}

export interface IAiEmbeddingVectorProvider {
	provideAiEmbeddingVector(strings: string[], token: CancellationToken): Promise<number[][]>;
}

export class AiEmbeddingVectorService implements IAiEmbeddingVectorService {
	readonly _serviceBrand: undefined;

	static readonly DEFAULT_TIMEOUT = 1000 * 10; // 10 seconds

	private readonly _providers: IAiEmbeddingVectorProvider[] = [];

	constructor() { }

	isEnabled(): boolean {
		return this._providers.length > 0;
	}

	registerAiEmbeddingVectorProvider(model: string, provider: IAiEmbeddingVectorProvider): IDisposable {
		this._providers.push(provider);
		return {
			dispose: () => {
				const index = this._providers.indexOf(provider);
				if (index >= 0) {
					this._providers.splice(index, 1);
				}
			}
		};
	}
}

registerSingleton(IAiEmbeddingVectorService, AiEmbeddingVectorService, InstantiationType.Delayed);
