/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SettingsSearchProvider, SettingsSearchResult } from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { AiSettingsSearchProviderOptions } from '../../services/aiSettingsSearch/common/aiSettingsSearch.js';
import { ExtHostAiSettingsSearchShape, IMainContext, MainContext, MainThreadAiSettingsSearchShape } from './extHost.protocol.js';
import { Disposable } from './extHostTypes.js';
import { Progress } from '../../../platform/progress/common/progress.js';
import { AiSettingsSearch } from './extHostTypeConverters.js';

export class ExtHostAiSettingsSearch implements ExtHostAiSettingsSearchShape {
	private _settingsSearchProviders: Map<number, SettingsSearchProvider> = new Map();
	private _nextHandle = 0;

	private readonly _proxy: MainThreadAiSettingsSearchShape;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadAiSettingsSearch);
	}

	async $startSearch(handle: number, query: string, option: AiSettingsSearchProviderOptions, token: CancellationToken): Promise<void> {
		if (this._settingsSearchProviders.size === 0) {
			throw new Error('No related information providers registered');
		}

		const provider = this._settingsSearchProviders.get(handle);
		if (!provider) {
			throw new Error('Settings search provider not found');
		}

		const progressReporter = new Progress<SettingsSearchResult>((data) => {
			this._proxy.$handleSearchResult(handle, AiSettingsSearch.fromSettingsSearchResult(data));
		});

		return provider.provideSettingsSearchResults(query, option, progressReporter, token);
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
