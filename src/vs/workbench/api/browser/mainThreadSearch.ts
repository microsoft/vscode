/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableStore, dispose, IDisposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { IFileMatch, IFileQuery, IRawFileMatch2, ISearchComplete, ISearchCompleteStats, ISearchProgressItem, ISearchQuery, ISearchResultProvider, ISearchService, ITextQuery, QueryType, SearchProviderType } from '../../services/search/common/search.js';
import { ExtHostContext, ExtHostSearchShape, MainContext, MainThreadSearchShape } from '../common/extHost.protocol.js';
import { revive } from '../../../base/common/marshalling.js';
import * as Constants from '../../contrib/search/common/constants.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { AISearchKeyword } from '../../services/search/common/searchExtTypes.js';

@extHostNamedCustomer(MainContext.MainThreadSearch)
export class MainThreadSearch implements MainThreadSearchShape {

	private readonly _proxy: ExtHostSearchShape;
	private readonly _searchProvider = new Map<number, RemoteSearchProvider>();

	constructor(
		extHostContext: IExtHostContext,
		@ISearchService private readonly _searchService: ISearchService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService _configurationService: IConfigurationService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSearch);
		this._proxy.$enableExtensionHostSearch();
	}

	dispose(): void {
		this._searchProvider.forEach(value => value.dispose());
		this._searchProvider.clear();
	}

	$registerTextSearchProvider(handle: number, scheme: string): void {
		this._searchProvider.set(handle, new RemoteSearchProvider(this._searchService, SearchProviderType.text, scheme, handle, this._proxy));
	}

	$registerAITextSearchProvider(handle: number, scheme: string): void {
		Constants.SearchContext.hasAIResultProvider.bindTo(this.contextKeyService).set(true);
		this._searchProvider.set(handle, new RemoteSearchProvider(this._searchService, SearchProviderType.aiText, scheme, handle, this._proxy));
	}

	$registerFileSearchProvider(handle: number, scheme: string): void {
		this._searchProvider.set(handle, new RemoteSearchProvider(this._searchService, SearchProviderType.file, scheme, handle, this._proxy));
	}

	$unregisterProvider(handle: number): void {
		dispose(this._searchProvider.get(handle));
		this._searchProvider.delete(handle);
	}

	$handleFileMatch(handle: number, session: number, data: UriComponents[]): void {
		const provider = this._searchProvider.get(handle);
		if (!provider) {
			throw new Error('Got result for unknown provider');
		}

		provider.handleFindMatch(session, data);
	}

	$handleTextMatch(handle: number, session: number, data: IRawFileMatch2[]): void {
		const provider = this._searchProvider.get(handle);
		if (!provider) {
			throw new Error('Got result for unknown provider');
		}

		provider.handleFindMatch(session, data);
	}

	$handleKeywordResult(handle: number, session: number, data: AISearchKeyword): void {
		const provider = this._searchProvider.get(handle);
		if (!provider) {
			throw new Error('Got result for unknown provider');
		}

		provider.handleKeywordResult(session, data);
	}

	$handleTelemetry(eventName: string, data: any): void {
		this._telemetryService.publicLog(eventName, data);
	}
}

class SearchOperation {

	private static _idPool = 0;

	constructor(
		readonly progress?: (match: IFileMatch) => any,
		readonly id: number = ++SearchOperation._idPool,
		readonly matches = new Map<string, IFileMatch>(),
		readonly keywords: AISearchKeyword[] = []
	) {
		//
	}

	addMatch(match: IFileMatch): void {
		const existingMatch = this.matches.get(match.resource.toString());
		if (existingMatch) {
			// TODO@rob clean up text/file result types
			// If a file search returns the same file twice, we would enter this branch.
			// It's possible that could happen, #90813
			if (existingMatch.results && match.results) {
				existingMatch.results.push(...match.results);
			}
		} else {
			this.matches.set(match.resource.toString(), match);
		}

		this.progress?.(match);
	}

	addKeyword(result: AISearchKeyword): void {
		this.keywords.push(result);
	}
}

class RemoteSearchProvider implements ISearchResultProvider, IDisposable {

	private readonly _registrations = new DisposableStore();
	private readonly _searches = new Map<number, SearchOperation>();
	private cachedAIName: string | undefined;

	constructor(
		searchService: ISearchService,
		type: SearchProviderType,
		private readonly _scheme: string,
		private readonly _handle: number,
		private readonly _proxy: ExtHostSearchShape
	) {
		this._registrations.add(searchService.registerSearchResultProvider(this._scheme, type, this));
	}

	async getAIName(): Promise<string | undefined> {
		if (this.cachedAIName === undefined) {
			this.cachedAIName = await this._proxy.$getAIName(this._handle);
		}
		return this.cachedAIName;
	}

	dispose(): void {
		this._registrations.dispose();
	}

	fileSearch(query: IFileQuery, token: CancellationToken = CancellationToken.None): Promise<ISearchComplete> {
		return this.doSearch(query, undefined, token);
	}

	textSearch(query: ITextQuery, onProgress?: (p: ISearchProgressItem) => void, token: CancellationToken = CancellationToken.None): Promise<ISearchComplete> {
		return this.doSearch(query, onProgress, token);
	}

	doSearch(query: ISearchQuery, onProgress?: (p: ISearchProgressItem) => void, token: CancellationToken = CancellationToken.None): Promise<ISearchComplete> {
		if (!query.folderQueries.length) {
			throw new Error('Empty folderQueries');
		}

		const search = new SearchOperation(onProgress);
		this._searches.set(search.id, search);

		const searchP = this._provideSearchResults(query, search.id, token);

		return Promise.resolve(searchP).then((result: ISearchCompleteStats) => {
			this._searches.delete(search.id);
			return { results: Array.from(search.matches.values()), aiKeywords: Array.from(search.keywords), stats: result.stats, limitHit: result.limitHit, messages: result.messages };
		}, err => {
			this._searches.delete(search.id);
			return Promise.reject(err);
		});
	}

	clearCache(cacheKey: string): Promise<void> {
		return Promise.resolve(this._proxy.$clearCache(cacheKey));
	}

	handleFindMatch(session: number, dataOrUri: Array<UriComponents | IRawFileMatch2>): void {
		const searchOp = this._searches.get(session);

		if (!searchOp) {
			// ignore...
			return;
		}

		dataOrUri.forEach(result => {
			if ((<IRawFileMatch2>result).results) {
				searchOp.addMatch(revive((<IRawFileMatch2>result)));
			} else {
				searchOp.addMatch({
					resource: URI.revive(<UriComponents>result)
				});
			}
		});
	}

	handleKeywordResult(session: number, data: AISearchKeyword): void {
		const searchOp = this._searches.get(session);

		if (!searchOp) {
			// ignore...
			return;
		}
		searchOp.addKeyword(data);
	}

	private _provideSearchResults(query: ISearchQuery, session: number, token: CancellationToken, onKeywordResult?: (keyword: AISearchKeyword) => void): Promise<ISearchCompleteStats> {
		switch (query.type) {
			case QueryType.File:
				return this._proxy.$provideFileSearchResults(this._handle, session, query, token);
			case QueryType.Text:
				return this._proxy.$provideTextSearchResults(this._handle, session, query, token);
			default:
				return this._proxy.$provideAITextSearchResults(this._handle, session, query, token);
		}
	}
}
