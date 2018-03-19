/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI, { UriComponents } from 'vs/base/common/uri';
import { TPromise, PPromise } from 'vs/base/common/winjs.base';
import { ExtHostContext, MainContext, IExtHostContext, MainThreadFileSystemShape, ExtHostFileSystemShape, IFileChangeDto } from '../node/extHost.protocol';
import { IFileService, IFileSystemProvider, IStat, IFileChange } from 'vs/platform/files/common/files';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IProgress } from 'vs/platform/progress/common/progress';
import { ISearchResultProvider, ISearchQuery, ISearchComplete, ISearchProgressItem, QueryType, IFileMatch, ISearchService, ILineMatch } from 'vs/platform/search/common/search';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { onUnexpectedError } from 'vs/base/common/errors';
import { values } from 'vs/base/common/map';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';

@extHostNamedCustomer(MainContext.MainThreadFileSystem)
export class MainThreadFileSystem implements MainThreadFileSystemShape {

	private readonly _proxy: ExtHostFileSystemShape;
	private readonly _provider = new Map<number, RemoteFileSystemProvider>();

	constructor(
		extHostContext: IExtHostContext,
		@IFileService private readonly _fileService: IFileService,
		@ISearchService private readonly _searchService: ISearchService,
		@IWorkspaceEditingService private readonly _workspaceEditingService: IWorkspaceEditingService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystem);
	}

	dispose(): void {
		this._provider.forEach(value => dispose());
		this._provider.clear();
	}

	$registerFileSystemProvider(handle: number, scheme: string): void {
		this._provider.set(handle, new RemoteFileSystemProvider(this._fileService, this._searchService, scheme, handle, this._proxy));
	}

	$unregisterFileSystemProvider(handle: number): void {
		dispose(this._provider.get(handle));
		this._provider.delete(handle);
	}

	$onDidAddFileSystemRoot(data: UriComponents): void {
		this._workspaceEditingService.addFolders([{ uri: URI.revive(data) }], true).done(null, onUnexpectedError);
	}

	$onFileSystemChange(handle: number, changes: IFileChangeDto[]): void {
		this._provider.get(handle).$onFileSystemChange(changes);
	}

	$reportFileChunk(handle: number, session: number, chunk: number[]): void {
		this._provider.get(handle).reportFileChunk(session, chunk);
	}

	// --- search

	$handleFindMatch(handle: number, session, data: UriComponents | [UriComponents, ILineMatch]): void {
		this._provider.get(handle).handleFindMatch(session, data);
	}
}

class FileReadOperation {

	private static _idPool = 0;

	constructor(
		readonly progress: IProgress<Uint8Array>,
		readonly id: number = ++FileReadOperation._idPool
	) {
		//
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
}

class RemoteFileSystemProvider implements IFileSystemProvider, ISearchResultProvider {

	private readonly _onDidChange = new Emitter<IFileChange[]>();
	private readonly _registrations: IDisposable[];
	private readonly _reads = new Map<number, FileReadOperation>();
	private readonly _searches = new Map<number, SearchOperation>();

	readonly onDidChange: Event<IFileChange[]> = this._onDidChange.event;


	constructor(
		fileService: IFileService,
		searchService: ISearchService,
		private readonly _scheme: string,
		private readonly _handle: number,
		private readonly _proxy: ExtHostFileSystemShape
	) {
		this._registrations = [
			fileService.registerProvider(_scheme, this),
			searchService.registerSearchResultProvider(this),
		];
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

	utimes(resource: URI, mtime: number, atime: number): TPromise<IStat, any> {
		return this._proxy.$utimes(this._handle, resource, mtime, atime);
	}
	stat(resource: URI): TPromise<IStat, any> {
		return this._proxy.$stat(this._handle, resource);
	}
	read(resource: URI, offset: number, count: number, progress: IProgress<Uint8Array>): TPromise<number, any> {
		const read = new FileReadOperation(progress);
		this._reads.set(read.id, read);
		return this._proxy.$read(this._handle, read.id, offset, count, resource).then(value => {
			this._reads.delete(read.id);
			return value;
		});
	}
	reportFileChunk(session: number, chunk: number[]): void {
		this._reads.get(session).progress.report(Buffer.from(chunk));
	}
	write(resource: URI, content: Uint8Array): TPromise<void, any> {
		return this._proxy.$write(this._handle, resource, [].slice.call(content));
	}
	unlink(resource: URI): TPromise<void, any> {
		return this._proxy.$unlink(this._handle, resource);
	}
	move(resource: URI, target: URI): TPromise<IStat, any> {
		return this._proxy.$move(this._handle, resource, target);
	}
	mkdir(resource: URI): TPromise<IStat, any> {
		return this._proxy.$mkdir(this._handle, resource);
	}
	readdir(resource: URI): TPromise<[URI, IStat][], any> {
		return this._proxy.$readdir(this._handle, resource).then(data => {
			return data.map(tuple => <[URI, IStat]>[URI.revive(tuple[0]), tuple[1]]);
		});
	}
	rmdir(resource: URI): TPromise<void, any> {
		return this._proxy.$rmdir(this._handle, resource);
	}

	// --- search

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

		return new PPromise((resolve, reject, report) => {

			const search = new SearchOperation(report);
			this._searches.set(search.id, search);

			const promise = query.type === QueryType.File
				? this._proxy.$findFiles(this._handle, search.id, query.filePattern)
				: this._proxy.$provideTextSearchResults(this._handle, search.id, query.contentPattern, { excludes: Object.keys(excludes), includes: Object.keys(includes) });

			promise.then(() => {
				this._searches.delete(search.id);
				resolve(({ results: values(search.matches), stats: undefined }));
			}, err => {
				this._searches.delete(search.id);
				reject(err);
			});
		});
	}

	handleFindMatch(session: number, dataOrUri: UriComponents | [UriComponents, ILineMatch]): void {
		let resource: URI;
		let match: ILineMatch;

		if (Array.isArray(dataOrUri)) {
			resource = URI.revive(dataOrUri[0]);
			match = dataOrUri[1];
		} else {
			resource = URI.revive(dataOrUri);
		}

		const { matches } = this._searches.get(session);
		if (!matches.has(resource.toString())) {
			matches.set(resource.toString(), { resource, lineMatches: [] });
		}
		if (match) {
			matches.get(resource.toString()).lineMatches.push(match);
		}
	}
}
