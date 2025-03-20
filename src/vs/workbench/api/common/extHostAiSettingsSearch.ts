/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SettingsSearchProvider } from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { AiSettingsSearchProviderOptions, AiSettingsSearchResult } from '../../services/aiSettingsSearch/common/aiSettingsSearch.js';
import { ExtHostAiSettingsSearchShape, IMainContext, MainContext, MainThreadAiSettingsSearchShape } from './extHost.protocol.js';
import { Disposable } from './extHostTypes.js';

export class ExtHostAiSettingsSearch implements ExtHostAiSettingsSearchShape {
	private _settingsSearchProviders: Map<number, SettingsSearchProvider> = new Map();
	private _nextHandle = 0;

	private readonly _proxy: MainThreadAiSettingsSearchShape;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadAiSettingsSearch);
	}

	async $provideEmbeddingsSearchResults(handle: number, query: string, option: AiSettingsSearchProviderOptions, token: CancellationToken): Promise<AiSettingsSearchResult[]> {
		if (this._settingsSearchProviders.size === 0) {
			throw new Error('No related information providers registered');
		}

		const provider = this._settingsSearchProviders.get(handle);
		if (!provider) {
			throw new Error('Settings search provider not found');
		}

		const results = await provider.provideEmbeddingsSearchResults(query, option, token);
		return results;
	}

	async $provideLLMRankedSearchResults(handle: number, query: string, option: AiSettingsSearchProviderOptions, token: CancellationToken): Promise<AiSettingsSearchResult[]> {
		if (this._settingsSearchProviders.size === 0) {
			throw new Error('No related information providers registered');
		}

		const provider = this._settingsSearchProviders.get(handle);
		if (!provider) {
			throw new Error('Settings search provider not found');
		}

		const results = await provider.provideLLMRankedSearchResults(query, option, token);
		return results;
	}

	registerSettingsSearchProvider(extension: IExtensionDescription, provider: SettingsSearchProvider): Disposable {
		const handle = this._nextHandle;
		this._nextHandle++;
		this._settingsSearchProviders.set(handle, provider);
		this._proxy.$registerAiSettingsSearchProvider(handle);
		return new Disposable(() => {
			this._proxy.$unregisterAiSettingsSearchProvider(handle);
			this._settingsSearchProviders.delete(handle);
		});
	}
}
