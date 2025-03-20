/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { AiSettingsSearchProviderOptions, AiSettingsSearchResult, IAiSettingsSearchProvider, IAiSettingsSearchService } from './aiSettingsSearch.js';

export class AiSettingsSearchService implements IAiSettingsSearchService {
	readonly _serviceBrand: undefined;

	static readonly DEFAULT_TIMEOUT = 1000 * 10; // 10 seconds

	private _providers: IAiSettingsSearchProvider[] = [];

	isEnabled(): boolean {
		return this._providers.length > 0;
	}

	registerSettingsSearchProvider(provider: IAiSettingsSearchProvider): IDisposable {
		this._providers.push(provider);
		return {
			dispose: () => {
				const index = this._providers.indexOf(provider);
				if (index !== -1) {
					this._providers.splice(index, 1);
				}
			}
		};
	}

	getEmbeddingsSearchResults(query: string, options: AiSettingsSearchProviderOptions, token: CancellationToken): Promise<AiSettingsSearchResult[]> {
		if (!this.isEnabled()) {
			return Promise.resolve([]);
		}

		const promises = this._providers.map(provider => provider.provideEmbeddingsSearchResults(query, options, token));
		return this.filterProviderResults(promises);
	}

	getLLMRankedSearchResults(query: string, options: AiSettingsSearchProviderOptions, token: CancellationToken): Promise<AiSettingsSearchResult[]> {
		if (!this.isEnabled()) {
			return Promise.resolve([]);
		}

		const promises = this._providers.map(provider => provider.provideLLMRankedSearchResults(query, options, token));
		return this.filterProviderResults(promises);
	}

	private async filterProviderResults(providerResults: Promise<AiSettingsSearchResult[]>[]): Promise<AiSettingsSearchResult[]> {
		const timeoutPromises = providerResults.map(p => raceTimeout(p, AiSettingsSearchService.DEFAULT_TIMEOUT));
		return Promise.allSettled(timeoutPromises).then(results => {
			const searchResults: AiSettingsSearchResult[] = [];
			for (const result of results) {
				if (result.status === 'fulfilled') {
					const fulfilledResult = result.value;
					if (fulfilledResult && fulfilledResult.length > 0) {
						searchResults.push(...fulfilledResult);
					}
				}
			}
			return searchResults;
		});
	}
}

registerSingleton(IAiSettingsSearchService, AiSettingsSearchService, InstantiationType.Delayed);
