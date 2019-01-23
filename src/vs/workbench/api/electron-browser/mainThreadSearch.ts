/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { values } from 'vs/base/common/map';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IFileMatch, IRawFileMatch2, ISearchComplete, ISearchCompleteStats, ISearchProgressItem, ISearchResultProvider, ISearchService, QueryType, SearchProviderType, ITextQuery, IFileQuery } from 'vs/platform/search/common/search';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ExtHostContext, ExtHostSearchShape, IExtHostContext, MainContext, MainThreadSearchShape } from '../node/extHost.protocol';
import { CancellationToken } from 'vs/base/common/cancellation';

@extHostNamedCustomer(MainContext.MainThreadSearch)
export class MainThreadSearch implements MainThreadSearchShape {

	private readonly _proxy: ExtHostSearchShape;
	private readonly _searchProvider = new Map<number, RemoteSearchProvider>();

	constructor(
		extHostContext: IExtHostContext,
		@ISearchService private readonly _searchService: ISearchService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSearch);
	}

	dispose(): void {
		this._searchProvider.forEach(value => value.dispose());
		this._searchProvider.clear();
	}

	$registerTextSearchProvider(handle: number, scheme: string): void {
		this._searchProvider.set(handle, new RemoteSearchProvider(this._searchService, SearchProviderType.text, scheme, handle, this._proxy));
	}

	$registerFileSearchProvider(handle: number, scheme: string): void {
		this._searchProvider.set(handle, new RemoteSearchProvider(this._searchService, SearchProviderType.file, scheme, handle, this._proxy));
	}

	$registerFileIndexProvider(handle: number, scheme: string): void {
		this._searchProvider.set(handle, new RemoteSearchProvider(this._searchService, SearchProviderType.fileIndex, scheme, handle, this._proxy));
	}

	$unregisterProvider(handle: number): void {
		dispose(this._searchProvider.get(handle));
		this._searchProvider.delete(handle);
	}

	$handleFileMatch(handle: number, session, data: UriComponents[]): void {
		this._searchProvider.get(handle).handleFindMatch(session, data);
	}

	$handleTextMatch(handle: number, session, data: IRawFileMatch2[]): void {
		this._searchProvider.get(handle).handleFindMatch(session, data);
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
		readonly matches = new Map<string, IFileMatch>()
	) {
		//
	}

	addMatch(match: IFileMatch): void {
		if (this.matches.has(match.resource.toString())) {
			// Merge with previous IFileMatches
			this.matches.get(match.resource.toString()).results.push(...match.results);
		} else {
			this.matches.set(match.resource.toString(), match);
		}

		if (this.progress) {
			this.progress(match);
		}
	}
}

class RemoteSearchProvider implements ISearchResultProvider, IDisposable {

	private readonly _registrations: IDisposable[];
	private readonly _searches = new Map<number, SearchOperation>();

	constructor(
		searchService: ISearchService,
		type: SearchProviderType,
		private readonly _scheme: string,
		private readonly _handle: number,
		private readonly _proxy: ExtHostSearchShape
	) {
		this._registrations = [searchService.registerSearchResultProvider(this._scheme, type, this)];
	}

	dispose(): void {
		dispose(this._registrations);
	}

	fileSearch(query: IFileQuery, token: CancellationToken = CancellationToken.None): Promise<ISearchComplete> {
		return this.doSearch(query, null, token);
	}

	textSearch(query: ITextQuery, onProgress?: (p: ISearchProgressItem) => void, token: CancellationToken = CancellationToken.None): Promise<ISearchComplete> {
		return this.doSearch(query, onProgress, token);
	}

	doSearch(query: ITextQuery | IFileQuery, onProgress?: (p: ISearchProgressItem) => void, token: CancellationToken = CancellationToken.None): Promise<ISearchComplete> {
		if (isFalsyOrEmpty(query.folderQueries)) {
			return Promise.resolve(undefined);
		}

		const search = new SearchOperation(onProgress);
		this._searches.set(search.id, search);

		const searchP = query.type === QueryType.File
			? this._proxy.$provideFileSearchResults(this._handle, search.id, query, token)
			: this._proxy.$provideTextSearchResults(this._handle, search.id, query, token);

		return Promise.resolve(searchP).then((result: ISearchCompleteStats) => {
			this._searches.delete(search.id);
			return { results: values(search.matches), stats: result.stats, limitHit: result.limitHit };
		}, err => {
			this._searches.delete(search.id);
			return Promise.reject(err);
		});
	}

	clearCache(cacheKey: string): Promise<void> {
		return Promise.resolve(this._proxy.$clearCache(cacheKey));
	}

	handleFindMatch(session: number, dataOrUri: Array<UriComponents | IRawFileMatch2>): void {
		if (!this._searches.has(session)) {
			// ignore...
			return;
		}

		const searchOp = this._searches.get(session);
		dataOrUri.forEach(result => {
			if ((<IRawFileMatch2>result).results) {
				searchOp.addMatch({
					resource: URI.revive((<IRawFileMatch2>result).resource),
					results: (<IRawFileMatch2>result).results
				});
			} else {
				searchOp.addMatch({
					resource: URI.revive(result)
				});
			}
		});
	}
}
