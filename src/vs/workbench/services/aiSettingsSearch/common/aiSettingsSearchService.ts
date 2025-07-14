/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { AiSettingsSearchResult, AiSettingsSearchResultKind, IAiSettingsSearchProvider, IAiSettingsSearchService } from './aiSettingsSearch.js';

export class AiSettingsSearchService extends Disposable implements IAiSettingsSearchService {
	readonly _serviceBrand: undefined;
	private static readonly MAX_PICKS = 5;

	private _providers: IAiSettingsSearchProvider[] = [];
	private _llmRankedResultsPromises: Map<string, DeferredPromise<string[]>> = new Map();
	private _embeddingsResultsPromises: Map<string, DeferredPromise<string[]>> = new Map();

	private _onProviderRegistered: Emitter<void> = this._register(new Emitter<void>());
	readonly onProviderRegistered: Event<void> = this._onProviderRegistered.event;

	isEnabled(): boolean {
		return this._providers.length > 0;
	}

	registerSettingsSearchProvider(provider: IAiSettingsSearchProvider): IDisposable {
		this._providers.push(provider);
		this._onProviderRegistered.fire();
		return {
			dispose: () => {
				const index = this._providers.indexOf(provider);
				if (index !== -1) {
					this._providers.splice(index, 1);
				}
			}
		};
	}

	startSearch(query: string, embeddingsOnly: boolean, token: CancellationToken): void {
		if (!this.isEnabled()) {
			throw new Error('No settings search providers registered');
		}

		this._embeddingsResultsPromises.delete(query);
		this._llmRankedResultsPromises.delete(query);

		this._providers.forEach(provider => provider.searchSettings(query, { limit: AiSettingsSearchService.MAX_PICKS, embeddingsOnly }, token));
	}

	async getEmbeddingsResults(query: string, token: CancellationToken): Promise<string[] | null> {
		if (!this.isEnabled()) {
			throw new Error('No settings search providers registered');
		}

		const existingPromise = this._embeddingsResultsPromises.get(query);
		if (existingPromise) {
			const result = await existingPromise.p;
			return result ?? null;
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

		const existingPromise = this._llmRankedResultsPromises.get(query);
		if (existingPromise) {
			const result = await existingPromise.p;
			return result ?? null;
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
			} else {
				const parkedPromise = new DeferredPromise<string[]>();
				parkedPromise.complete(result.settings);
				this._embeddingsResultsPromises.set(result.query, parkedPromise);
			}
		} else if (result.kind === AiSettingsSearchResultKind.LLM_RANKED) {
			const promise = this._llmRankedResultsPromises.get(result.query);
			if (promise) {
				promise.complete(result.settings);
			} else {
				const parkedPromise = new DeferredPromise<string[]>();
				parkedPromise.complete(result.settings);
				this._llmRankedResultsPromises.set(result.query, parkedPromise);
			}
		}
	}
}

registerSingleton(IAiSettingsSearchService, AiSettingsSearchService, InstantiationType.Delayed);
