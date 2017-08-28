/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { isPromiseCanceledError } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { ISearchService, QueryType, ISearchQuery, ISearchProgressItem, ISearchComplete } from 'vs/platform/search/common/search';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ICommonCodeEditor, isCommonCodeEditor } from 'vs/editor/common/editorCommon';
import { bulkEdit, IResourceEdit } from 'vs/editor/common/services/bulkEdit';
import { TPromise, PPromise } from 'vs/base/common/winjs.base';
import { MainThreadWorkspaceShape, ExtHostWorkspaceShape, ExtHostContext, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IFileService } from 'vs/platform/files/common/files';
import { IDisposable, dispose, combinedDisposable } from 'vs/base/common/lifecycle';
import { RemoteFileService } from 'vs/workbench/services/files/electron-browser/remoteFileService';
import { Emitter } from 'vs/base/common/event';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadWorkspace)
export class MainThreadWorkspace implements MainThreadWorkspaceShape {

	private readonly _toDispose: IDisposable[] = [];
	private readonly _activeSearches: { [id: number]: TPromise<URI[]> } = Object.create(null);
	private readonly _proxy: ExtHostWorkspaceShape;

	constructor(
		extHostContext: IExtHostContext,
		@ISearchService private readonly _searchService: ISearchService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IWorkbenchEditorService private readonly _editorService: IWorkbenchEditorService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@IFileService private readonly _fileService: IFileService
	) {
		this._proxy = extHostContext.get(ExtHostContext.ExtHostWorkspace);
		this._contextService.onDidChangeWorkspaceRoots(this._onDidChangeWorkspace, this, this._toDispose);
	}

	dispose(): void {
		dispose(this._toDispose);

		for (let requestId in this._activeSearches) {
			const search = this._activeSearches[requestId];
			search.cancel();
		}
	}

	// --- workspace ---

	private _onDidChangeWorkspace(): void {
		this._proxy.$acceptWorkspaceData(this._contextService.getWorkspace());
	}

	// --- search ---

	$startSearch(include: string, exclude: string, maxResults: number, requestId: number): Thenable<URI[]> {
		const workspace = this._contextService.getWorkspace();
		if (!workspace) {
			return undefined;
		}

		const query: ISearchQuery = {
			folderQueries: workspace.roots.map(root => ({ folder: root })),
			type: QueryType.File,
			maxResults,
			includePattern: { [include]: true },
			excludePattern: { [exclude]: true },
		};
		this._searchService.extendQuery(query);

		const search = this._searchService.search(query).then(result => {
			return result.results.map(m => m.resource);
		}, err => {
			if (!isPromiseCanceledError(err)) {
				return TPromise.wrapError(err);
			}
			return undefined;
		});

		this._activeSearches[requestId] = search;
		const onDone = () => delete this._activeSearches[requestId];
		search.done(onDone, onDone);

		return search;
	}

	$cancelSearch(requestId: number): Thenable<boolean> {
		const search = this._activeSearches[requestId];
		if (search) {
			delete this._activeSearches[requestId];
			search.cancel();
			return TPromise.as(true);
		}
		return undefined;
	}

	// --- save & edit resources ---

	$saveAll(includeUntitled?: boolean): Thenable<boolean> {
		return this._textFileService.saveAll(includeUntitled).then(result => {
			return result.results.every(each => each.success === true);
		});
	}

	$applyWorkspaceEdit(edits: IResourceEdit[]): TPromise<boolean> {

		let codeEditor: ICommonCodeEditor;
		let editor = this._editorService.getActiveEditor();
		if (editor) {
			let candidate = editor.getControl();
			if (isCommonCodeEditor(candidate)) {
				codeEditor = candidate;
			}
		}

		return bulkEdit(this._textModelResolverService, codeEditor, edits, this._fileService)
			.then(() => true);
	}

	// --- EXPERIMENT: workspace provider

	private _idPool: number = 0;
	private readonly _provider = new Map<number, [IDisposable, Emitter<URI>]>();
	private readonly _searchSessions = new Map<number, { resolve: (result: ISearchComplete) => void, reject: Function, progress: (item: ISearchProgressItem) => void, matches: URI[] }>();

	$registerFileSystemProvider(handle: number, authority: string): void {
		if (!(this._fileService instanceof RemoteFileService)) {
			throw new Error();
		}
		const emitter = new Emitter<URI>();
		const provider = {
			onDidChange: emitter.event,
			resolve: (resource) => {
				return this._proxy.$resolveFile(handle, resource);
			},
			update: (resource, value) => {
				return this._proxy.$storeFile(handle, resource, value);
			}
		};
		const searchProvider = {
			search: (query) => {
				if (query.type !== QueryType.File) {
					return undefined;
				}
				const session = ++this._idPool;
				return new PPromise<any, any>((resolve, reject, progress) => {
					this._searchSessions.set(session, { resolve, reject, progress, matches: [] });
					this._proxy.$startSearch(handle, session, query.filePattern);
				}, () => {
					this._proxy.$cancelSearch(handle, session);
				});
			}
		};
		const registrations = combinedDisposable([
			this._fileService.registerProvider(authority, provider),
			this._searchService.registerSearchResultProvider(searchProvider),
		]);
		this._provider.set(handle, [registrations, emitter]);
	}

	$unregisterFileSystemProvider(handle: number): void {
		if (this._provider.has(handle)) {
			dispose(this._provider.get(handle)[0]);
			this._provider.delete(handle);
		}
	}

	$onFileSystemChange(handle: number, resource: URI) {
		const [, emitter] = this._provider.get(handle);
		emitter.fire(resource);
	};

	$updateSearchSession(session: number, data: URI): void {
		if (this._searchSessions.has(session)) {
			this._searchSessions.get(session).progress({ resource: data });
			this._searchSessions.get(session).matches.push(data);
		}
	}

	$finishSearchSession(session: number, err?: any): void {
		if (this._searchSessions.has(session)) {
			const { matches, resolve, reject } = this._searchSessions.get(session);
			this._searchSessions.delete(session);
			if (err) {
				reject(err);
			} else {
				resolve({
					limitHit: false,
					stats: undefined,
					results: matches.map(resource => ({ resource }))
				});
			}
		}
	}
}

