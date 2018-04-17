/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI, { UriComponents } from 'vs/base/common/uri';
import { TPromise, PPromise } from 'vs/base/common/winjs.base';
import { ExtHostContext, MainContext, IExtHostContext, MainThreadFileSystemShape, ExtHostFileSystemShape, IFileChangeDto } from '../node/extHost.protocol';
import { IFileService, IStat, IFileChange, ISimpleReadWriteProvider, IFileSystemProviderBase, FileOpenFlags } from 'vs/platform/files/common/files';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ISearchResultProvider, ISearchQuery, ISearchComplete, ISearchProgressItem, QueryType, IFileMatch, ISearchService, ILineMatch } from 'vs/platform/search/common/search';
import { values } from 'vs/base/common/map';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';

@extHostNamedCustomer(MainContext.MainThreadFileSystem)
export class MainThreadFileSystem implements MainThreadFileSystemShape {

	private readonly _proxy: ExtHostFileSystemShape;
	private readonly _fileProvider = new Map<number, RemoteFileSystemProvider>();
	private readonly _searchProvider = new Map<number, RemoteSearchProvider>();

	constructor(
		extHostContext: IExtHostContext,
		@IFileService private readonly _fileService: IFileService,
		@ISearchService private readonly _searchService: ISearchService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystem);
	}

	dispose(): void {
		this._fileProvider.forEach(value => dispose());
		this._fileProvider.clear();
	}

	$registerFileSystemProvider(handle: number, scheme: string): void {
		this._fileProvider.set(handle, new RemoteFileSystemProvider(this._fileService, scheme, handle, this._proxy));
	}

	$registerSearchProvider(handle: number, scheme: string): void {
		this._searchProvider.set(handle, new RemoteSearchProvider(this._searchService, scheme, handle, this._proxy));
	}

	$unregisterProvider(handle: number): void {
		dispose(this._fileProvider.get(handle));
		this._fileProvider.delete(handle);

		dispose(this._searchProvider.get(handle));
		this._searchProvider.delete(handle);
	}

	$onFileSystemChange(handle: number, changes: IFileChangeDto[]): void {
		this._fileProvider.get(handle).$onFileSystemChange(changes);
	}
	// --- search

	$handleFindMatch(handle: number, session, data: UriComponents | [UriComponents, ILineMatch]): void {
		this._searchProvider.get(handle).handleFindMatch(session, data);
	}
}

class RemoteFileSystemProvider implements ISimpleReadWriteProvider, IFileSystemProviderBase {

	_type: 'simple' = 'simple';

	private readonly _onDidChange = new Emitter<IFileChange[]>();
	private readonly _registrations: IDisposable[];

	readonly onDidChange: Event<IFileChange[]> = this._onDidChange.event;

	constructor(
		fileService: IFileService,
		scheme: string,
		private readonly _handle: number,
		private readonly _proxy: ExtHostFileSystemShape
	) {
		this._registrations = [fileService.registerProvider(scheme, this)];
	}

	dispose(): void {
		dispose(this._registrations);
		this._onDidChange.dispose();
	}

	$onFileSystemChange(changes: IFileChangeDto[]): void {
		this._onDidChange.fire(changes.map(RemoteFileSystemProvider._createFileChange));
	}

	private static _createFileChange(dto: IFileChangeDto): IFileChange {
		return { resource: URI.revive(dto.resource), type: dto.type };
	}

	// --- forwarding calls

	stat(resource: URI): TPromise<IStat, any> {
		return this._proxy.$stat(this._handle, resource);
	}
	readFile(resource: URI, opts: { flags: FileOpenFlags }): TPromise<Uint8Array, any> {
		return this._proxy.$readFile(this._handle, resource, opts.flags).then(encoded => {
			return Buffer.from(encoded, 'base64');
		});
	}
	writeFile(resource: URI, content: Uint8Array, opts: { flags: FileOpenFlags }): TPromise<void, any> {
		let encoded = Buffer.isBuffer(content)
			? content.toString('base64')
			: Buffer.from(content.buffer, content.byteOffset, content.byteLength).toString('base64');
		return this._proxy.$writeFile(this._handle, resource, encoded, opts.flags);
	}
	delete(resource: URI): TPromise<void, any> {
		return this._proxy.$delete(this._handle, resource);
	}
	rename(resource: URI, target: URI, opts: { flags: FileOpenFlags }): TPromise<IStat, any> {
		return this._proxy.$rename(this._handle, resource, target, opts.flags);
	}
	mkdir(resource: URI): TPromise<IStat, any> {
		return this._proxy.$mkdir(this._handle, resource);
	}
	readdir(resource: URI): TPromise<[string, IStat][], any> {
		return this._proxy.$readdir(this._handle, resource);
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
		private readonly _proxy: ExtHostFileSystemShape
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
