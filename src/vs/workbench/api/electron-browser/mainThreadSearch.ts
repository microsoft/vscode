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
import { IFileMatch, ISearchComplete, ISearchProgressItem, ISearchQuery, ISearchResultProvider, ISearchService, QueryType, IRawFileMatch2 } from 'vs/platform/search/common/search';
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

	$handleFindMatch(handle: number, session, data: UriComponents | IRawFileMatch2[]): void {
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

	addMatch(match: IFileMatch): void {
		if (this.matches.has(match.resource.toString())) {
			// Merge with previous IFileMatches
			this.matches.get(match.resource.toString()).lineMatches.push(...match.lineMatches);
		} else {
			this.matches.set(match.resource.toString(), match);
		}

		this.progress(this.matches.get(match.resource.toString()));
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

		const folderQueriesForScheme = query.folderQueries.filter(fq => fq.folder.scheme === this._scheme);

		query = {
			...query,
			folderQueries: folderQueriesForScheme
		};

		let outer: TPromise;

		return new PPromise((resolve, reject, report) => {

			const search = new SearchOperation(report);
			this._searches.set(search.id, search);

			outer = query.type === QueryType.File
				? this._proxy.$provideFileSearchResults(this._handle, search.id, query)
				: this._proxy.$provideTextSearchResults(this._handle, search.id, query.contentPattern, query);

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

	handleFindMatch(session: number, dataOrUri: UriComponents | IRawFileMatch2[]): void {
		if (!this._searches.has(session)) {
			// ignore...
			return;
		}

		const searchOp = this._searches.get(session);
		if (Array.isArray(dataOrUri)) {
			dataOrUri.forEach(m => {
				searchOp.addMatch({
					resource: URI.revive(m.resource),
					lineMatches: m.lineMatches
				});
			});
		} else {
			searchOp.addMatch({ resource: URI.revive(dataOrUri) });
		}
	}
}
