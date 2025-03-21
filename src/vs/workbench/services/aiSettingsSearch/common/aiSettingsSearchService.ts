/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { AiSettingsSearchResult, AiSettingsSearchResultBundle, AiSettingsSearchResultBundleKind, IAiSettingsSearchProvider, IAiSettingsSearchService } from './aiSettingsSearch.js';

export class AiSettingsSearchService implements IAiSettingsSearchService {
	readonly _serviceBrand: undefined;
	private static readonly MAX_PICKS = 5;

	private _providers: IAiSettingsSearchProvider[] = [];
	private _resultsCache: Map<AiSettingsSearchResultBundleKind, AiSettingsSearchResult[]> = new Map();

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

	startSearch(query: string, token: CancellationToken): void {
		this._resultsCache.clear();

		if (!this.isEnabled()) {
			throw new Error('No settings search providers registered');
		}

		this._providers.forEach(provider => provider.searchSettings(query, { limit: AiSettingsSearchService.MAX_PICKS }, token));
	}

	getResultsCache(kind: AiSettingsSearchResultBundleKind): AiSettingsSearchResult[] {
		return this._resultsCache.get(kind) ?? [];
	}

	onSettingsSearchResultBundle(bundle: AiSettingsSearchResultBundle): void {
		if (!this.isEnabled()) {
			return;
		}

		console.log('Received settings search result bundle', bundle);
		this._resultsCache.set(bundle.kind, bundle.settings);
	}
}

registerSingleton(IAiSettingsSearchService, AiSettingsSearchService, InstantiationType.Delayed);
