/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { AiSettingsSearchProviderOptions, AiSettingsSearchResult, IAiSettingsSearchProvider, IAiSettingsSearchService } from '../../services/aiSettingsSearch/common/aiSettingsSearch.js';
import { ExtHostContext, ExtHostAiSettingsSearchShape, MainContext, MainThreadAiSettingsSearchShape, } from '../common/extHost.protocol.js';
import { CancellationToken } from '../../../base/common/cancellation.js';

@extHostNamedCustomer(MainContext.MainThreadAiSettingsSearch)
export class MainThreadAiSettingsSearch extends Disposable implements MainThreadAiSettingsSearchShape {
	private readonly _proxy: ExtHostAiSettingsSearchShape;
	private readonly _registrations = this._register(new DisposableMap<number>());

	constructor(
		context: IExtHostContext,
		@IAiSettingsSearchService private readonly _settingsSearchService: IAiSettingsSearchService,
	) {
		super();
		this._proxy = context.getProxy(ExtHostContext.ExtHostAiSettingsSearch);
	}

	$registerAiSettingsSearchProvider(handle: number): void {
		const provider: IAiSettingsSearchProvider = {
			provideEmbeddingsSearchResults: (query, option, token) => {
				return this._proxy.$provideEmbeddingsSearchResults(handle, query, option, token);
			},
			provideLLMRankedSearchResults: (query, option, token) => {
				return this._proxy.$provideLLMRankedSearchResults(handle, query, option, token);
			}
		};
		this._registrations.set(handle, this._settingsSearchService.registerSettingsSearchProvider(provider));
	}

	$unregisterAiSettingsSearchProvider(handle: number): void {
		this._registrations.deleteAndDispose(handle);
	}

	$getEmbeddingsSearchResults(query: string, option: AiSettingsSearchProviderOptions, token: CancellationToken): Promise<AiSettingsSearchResult[]> {
		return this._settingsSearchService.getEmbeddingsSearchResults(query, option, token);
	}

	$getLLMRankedSearchResults(query: string, option: AiSettingsSearchProviderOptions, token: CancellationToken): Promise<AiSettingsSearchResult[]> {
		return this._settingsSearchService.getLLMRankedSearchResults(query, option, token);
	}
}
