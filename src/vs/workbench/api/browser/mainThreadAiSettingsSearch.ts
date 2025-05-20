/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { AiSettingsSearchResult, IAiSettingsSearchProvider, IAiSettingsSearchService } from '../../services/aiSettingsSearch/common/aiSettingsSearch.js';
import { ExtHostContext, ExtHostAiSettingsSearchShape, MainContext, MainThreadAiSettingsSearchShape, } from '../common/extHost.protocol.js';

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
			searchSettings: (query, option, token) => {
				return this._proxy.$startSearch(handle, query, option, token);
			}
		};
		this._registrations.set(handle, this._settingsSearchService.registerSettingsSearchProvider(provider));
	}

	$unregisterAiSettingsSearchProvider(handle: number): void {
		this._registrations.deleteAndDispose(handle);
	}

	$handleSearchResult(handle: number, result: AiSettingsSearchResult): void {
		if (!this._registrations.has(handle)) {
			throw new Error(`No AI settings search provider found`);
		}

		this._settingsSearchService.handleSearchResult(result);
	}
}
