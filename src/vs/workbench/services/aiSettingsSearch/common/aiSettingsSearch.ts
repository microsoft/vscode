/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IAiSettingsSearchService = createDecorator<IAiSettingsSearchService>('IAiSettingsSearchService');

export interface AiSettingsSearchResult {
	setting: string;
	weight: number;
}

export interface AiSettingsSearchProviderOptions {
	limit: number;
}

export interface IAiSettingsSearchService {
	readonly _serviceBrand: undefined;

	isEnabled(): boolean;
	registerSettingsSearchProvider(provider: IAiSettingsSearchProvider): IDisposable;

	getEmbeddingsSearchResults(query: string, options: AiSettingsSearchProviderOptions, token: CancellationToken): Promise<AiSettingsSearchResult[]>;
	getLLMRankedSearchResults(query: string, options: AiSettingsSearchProviderOptions, token: CancellationToken): Promise<AiSettingsSearchResult[]>;
}

export interface IAiSettingsSearchProvider {
	provideEmbeddingsSearchResults(query: string, option: AiSettingsSearchProviderOptions, token: CancellationToken): Promise<AiSettingsSearchResult[]>;
	provideLLMRankedSearchResults(query: string, option: AiSettingsSearchProviderOptions, token: CancellationToken): Promise<AiSettingsSearchResult[]>;
}
