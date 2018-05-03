/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { values } from 'vs/base/common/map';
import URI, { UriComponents } from 'vs/base/common/uri';
import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import { IFileMatch, ILineMatch, ISearchComplete, ISearchProgressItem, ISearchQuery, ISearchResultProvider, ISearchService, QueryType } from 'vs/platform/search/common/search';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ExtHostContext, ExtHostSearchShape, IExtHostContext, MainContext, MainThreadSearchShape } from '../node/extHost.protocol';

@extHostNamedCustomer(MainContext.MainThreadSearch)
export class MainThreadSearch implements MainThreadSearchShape {

	private readonly _proxy: ExtHostSearchShape;
	private readonly _searchProvider = new Map<number, RemoteSearchProvider>();

	constructor(
		extHostContext: IExtHostContext,
		@ISearchService private readonly _searchService: ISearchService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSearch);
	}

	dispose(): void {
		this._searchProvider.forEach(value => dispose());
		this._searchProvider.clear();
	}

	$registerSearchProvider(handle: number, scheme: string): void {
		this._searchProvider.set(handle, new RemoteSearchProvider(this._searchService, scheme, handle, this._proxy));
	}

	$unregisterProvider(handle: number): void {
		dispose(this._searchProvider.get(handle));
		this._searchProvider.delete(handle);
	}

	$handleFindMatch(handle: number, session, data: UriComponents | [UriComponents, ILineMatch]): void {
		this._searchProvider.get(handle).handleFindMatch(session, data);
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

	addMatch(resource: URI, match: ILineMatch): void {
		if (!this.matches.has(resource.toString())) {
			this.matches.set(resource.toString(), { resource, lineMatches: [] });
		}
		if (match) {
			this.matches.get(resource.toString()).lineMatches.push(match);
		}
		this.progress(this.matches.get(resource.toString()));
	}
}

class RemoteSearchProvider implements ISearchResultProvider {

	private readonly _registrations: IDisposable[];
	private readonly _searches = new Map<number, SearchOperation>();


	constructor(
		searchService: ISearchService,
		private readonly _scheme: string,
		private readonly _handle: number,
		private readonly _proxy: ExtHostSearchShape
	) {
		this._registrations = [searchService.registerSearchResultProvider(this)];
	}

	dispose(): void {
		dispose(this._registrations);
	}

	search(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {

		if (isFalsyOrEmpty(query.folderQueries)) {
			return PPromise.as(undefined);
		}

		let includes = { ...query.includePattern };
		let excludes = { ...query.excludePattern };

		for (const folderQuery of query.folderQueries) {
			if (folderQuery.folder.scheme === this._scheme) {
				includes = { ...includes, ...folderQuery.includePattern };
				excludes = { ...excludes, ...folderQuery.excludePattern };
			}
		}

		let outer: TPromise;

		return new PPromise((resolve, reject, report) => {

			const search = new SearchOperation(report);
			this._searches.set(search.id, search);

			outer = query.type === QueryType.File
				? this._proxy.$provideFileSearchResults(this._handle, search.id, query.filePattern)
				: this._proxy.$provideTextSearchResults(this._handle, search.id, query.contentPattern, { excludes: Object.keys(excludes), includes: Object.keys(includes) });

			outer.then(() => {
				this._searches.delete(search.id);
				resolve(({ results: values(search.matches), stats: undefined }));
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

	handleFindMatch(session: number, dataOrUri: UriComponents | [UriComponents, ILineMatch]): void {
		if (!this._searches.has(session)) {
			// ignore...
			return;
		}
		let resource: URI;
		let match: ILineMatch;

		if (Array.isArray(dataOrUri)) {
			resource = URI.revive(dataOrUri[0]);
			match = dataOrUri[1];
		} else {
			resource = URI.revive(dataOrUri);
		}

		this._searches.get(session).addMatch(resource, match);
	}
}
