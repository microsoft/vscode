/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { values } from 'vs/base/common/map';
import { URI, UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFileMatch, IRawFileMatch2, ISearchComplete, ISearchCompleteStats, ISearchProgressItem, ISearchQuery, ISearchResultProvider, ISearchService, QueryType, SearchProviderType } from 'vs/platform/search/common/search';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ExtHostContext, ExtHostSearchShape, IExtHostContext, MainContext, MainThreadSearchShape } from '../node/extHost.protocol';

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
		readonly progress: (match: IFileMatch) => any,
		readonly id: number = ++SearchOperation._idPool,
		readonly matches = new Map<string, IFileMatch>()
	) {
		//
	}

	addMatch(match: IFileMatch): void {
		if (this.matches.has(match.resource.toString())) {
			// Merge with previous IFileMatches
			this.matches.get(match.resource.toString()).matches.push(...match.matches);
		} else {
			this.matches.set(match.resource.toString(), match);
		}

		this.progress(this.matches.get(match.resource.toString()));
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

	search(query: ISearchQuery, onProgress?: (p: ISearchProgressItem) => void): TPromise<ISearchComplete> {

		if (isFalsyOrEmpty(query.folderQueries)) {
			return TPromise.as(undefined);
		}

		let outer: TPromise;

		return new TPromise((resolve, reject) => {

			const search = new SearchOperation(onProgress);
			this._searches.set(search.id, search);

			outer = query.type === QueryType.File
				? this._proxy.$provideFileSearchResults(this._handle, search.id, query)
				: this._proxy.$provideTextSearchResults(this._handle, search.id, query.contentPattern, query);

			outer.then((result: ISearchCompleteStats) => {
				this._searches.delete(search.id);
				resolve(({ results: values(search.matches), stats: result.stats, limitHit: result.limitHit }));
			}, err => {
				this._searches.delete(search.id);
				reject(err);
			});
		}, () => {
			if (outer) {
				outer.cancel();
			}
		});
	}

	clearCache(cacheKey: string): TPromise<void> {
		return this._proxy.$clearCache(cacheKey);
	}

	handleFindMatch(session: number, dataOrUri: (UriComponents | IRawFileMatch2)[]): void {
		if (!this._searches.has(session)) {
			// ignore...
			return;
		}

		const searchOp = this._searches.get(session);
		dataOrUri.forEach(result => {
			if ((<IRawFileMatch2>result).matches) {
				searchOp.addMatch({
					resource: URI.revive((<IRawFileMatch2>result).resource),
					matches: (<IRawFileMatch2>result).matches
				});
			} else {
				searchOp.addMatch({
					resource: URI.revive(result)
				});
			}
		});
	}
}
