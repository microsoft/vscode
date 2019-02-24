/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISearchService, ITextQueryProps, ISearchProgressItem, ISearchComplete, IFileQueryProps, SearchProviderType, ISearchResultProvider } from 'vs/workbench/services/search/common/search';
import { URI } from 'vs/base/common/uri';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class SimpleSearchService implements ISearchService {

	_serviceBrand: any;

	textSearch(query: ITextQueryProps<URI>, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete> {
		return Promise.resolve(undefined);
	}

	fileSearch(query: IFileQueryProps<URI>, token?: CancellationToken): Promise<ISearchComplete> {
		return Promise.resolve(undefined);
	}

	clearCache(cacheKey: string): Promise<void> {
		return Promise.resolve(undefined);
	}

	registerSearchResultProvider(scheme: string, type: SearchProviderType, provider: ISearchResultProvider): IDisposable {
		return Disposable.None;
	}
}

registerSingleton(ISearchService, SimpleSearchService, true);