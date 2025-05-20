/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { AiSettingsSearchResult, AiSettingsSearchResultKind, IAiSettingsSearchProvider, IAiSettingsSearchService } from './aiSettingsSearch.js';

export class AiSettingsSearchService implements IAiSettingsSearchService {
	readonly _serviceBrand: undefined;
	private static readonly MAX_PICKS = 5;

	private _providers: IAiSettingsSearchProvider[] = [];
	private _llmRankedResultsPromises: Map<string, DeferredPromise<string[]>> = new Map();
	private _embeddingsResultsPromises: Map<string, DeferredPromise<string[]>> = new Map();

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
		if (!this.isEnabled()) {
			throw new Error('No settings search providers registered');
		}

		this._providers.forEach(provider => provider.searchSettings(query, { limit: AiSettingsSearchService.MAX_PICKS }, token));
	}

	async getEmbeddingsResults(query: string, token: CancellationToken): Promise<string[] | null> {
		if (!this.isEnabled()) {
			throw new Error('No settings search providers registered');
		}

		const promise = new DeferredPromise<string[]>();
		this._embeddingsResultsPromises.set(query, promise);
		const result = await raceCancellation(promise.p, token);
		return result ?? null;
	}

	async getLLMRankedResults(query: string, token: CancellationToken): Promise<string[] | null> {
		if (!this.isEnabled()) {
			throw new Error('No settings search providers registered');
		}

		const promise = new DeferredPromise<string[]>();
		this._llmRankedResultsPromises.set(query, promise);
		const result = await raceCancellation(promise.p, token);
		return result ?? null;
	}

	handleSearchResult(result: AiSettingsSearchResult): void {
		if (!this.isEnabled()) {
			return;
		}

		if (result.kind === AiSettingsSearchResultKind.EMBEDDED) {
			const promise = this._embeddingsResultsPromises.get(result.query);
			if (promise) {
				promise.complete(result.settings);
				this._embeddingsResultsPromises.delete(result.query);
			}
		} else if (result.kind === AiSettingsSearchResultKind.LLM_RANKED) {
			const promise = this._llmRankedResultsPromises.get(result.query);
			if (promise) {
				promise.complete(result.settings);
				this._llmRankedResultsPromises.delete(result.query);
			}
		}
	}
}

registerSingleton(IAiSettingsSearchService, AiSettingsSearchService, InstantiationType.Delayed);
