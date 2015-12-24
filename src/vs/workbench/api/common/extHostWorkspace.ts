/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {isPromiseCanceledError} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {ISearchService, QueryType} from 'vs/platform/search/common/search';
import {IWorkspaceContextService, IWorkspace} from 'vs/platform/workspace/common/workspace';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {ITextFileService} from 'vs/workbench/parts/files/common/files';
import {ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {bulkEdit, IResourceEdit} from 'vs/editor/common/services/bulkEdit';
import {TPromise} from 'vs/base/common/winjs.base';
import {fromRange} from 'vs/workbench/api/common/extHostTypeConverters';
import {Uri, CancellationToken} from 'vscode';

export class ExtHostWorkspace {

	private static _requestIdPool = 0;

	private _proxy: MainThreadWorkspace;
	private _workspacePath: string;

	constructor( @IThreadService threadService: IThreadService, workspacePath:string) {
		this._proxy = threadService.getRemotable(MainThreadWorkspace);
		this._workspacePath = workspacePath;
	}

	getPath(): string {
		return this._workspacePath;
	}

	getRelativePath(pathOrUri: string|Uri): string {

		let path: string;
		if (typeof pathOrUri === 'string') {
			path = pathOrUri;
		} else {
			path = pathOrUri.fsPath;
		}

		if (this._workspacePath && this._workspacePath.length < path.length) {
			// return relative(workspacePath, path);
			return path.substring(this._workspacePath.length);
		}

		return path;
	}

	findFiles(include: string, exclude: string, maxResults?: number, token?: CancellationToken): Thenable<Uri[]> {
		const requestId = ExtHostWorkspace._requestIdPool++;
		const result = this._proxy.$startSearch(include, exclude, maxResults, requestId);
		if (token) {
			token.onCancellationRequested(() => this._proxy.$cancelSearch(requestId));
		}
		return result;
	}

	saveAll(includeUntitled?: boolean): Thenable<boolean> {
		return this._proxy.$saveAll(includeUntitled);
	}

	appyEdit(edit: vscode.WorkspaceEdit): TPromise<boolean> {

		let resourceEdits: IResourceEdit[] = [];

		let entries = edit.entries();
		for (let entry of entries) {
			let [uri, edits] = entry;

			for (let edit of edits) {
				resourceEdits.push({
					resource: <URI>uri,
					newText: edit.newText,
					range: fromRange(edit.range)
				});
			}
		}

		return this._proxy.$applyWorkspaceEdit(resourceEdits);
	}
}

@Remotable.MainContext('MainThreadWorkspace')
export class MainThreadWorkspace {

	private _activeSearches: { [id: number]: TPromise<Uri[]> } = Object.create(null);
	private _searchService: ISearchService;
	private _workspace: IWorkspace;
	private _textFileService: ITextFileService;
	private _editorService:IWorkbenchEditorService;
	private _eventService:IEventService;

	constructor( @ISearchService searchService: ISearchService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ITextFileService textFileService,
		@IWorkbenchEditorService editorService,
		@IEventService eventService) {

		this._searchService = searchService;
		this._workspace = contextService.getWorkspace();
		this._textFileService = textFileService;
		this._editorService = editorService;
		this._eventService = eventService;
	}

	$startSearch(include: string, exclude: string, maxResults: number, requestId: number): Thenable<Uri[]> {

		if (!this._workspace) {
			return;
		}

		const search = this._searchService.search({
			rootResources: [this._workspace.resource],
			type: QueryType.File,
			maxResults,
			includePattern: { [include]: true },
			excludePattern: { [exclude]: true },
		}).then(result => {
			return result.results.map(m => m.resource);
		}, err => {
			if (!isPromiseCanceledError(err)) {
				return TPromise.wrapError(err);
			}
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
	}

	$saveAll(includeUntitled?: boolean): Thenable<boolean> {
		return this._textFileService.saveAll(includeUntitled).then(result => {
			return result.results.every(each => each.success === true);
		});
	}

	$applyWorkspaceEdit(edits: IResourceEdit[]): TPromise<boolean> {

		let codeEditor: ICommonCodeEditor;
		let editor = this._editorService.getActiveEditor();
		if (editor) {
			let candidate = <ICommonCodeEditor> editor.getControl();
			if (typeof candidate.getEditorType === 'function') {
				// enough proof
				codeEditor = candidate;
			}
		}

		return bulkEdit(this._eventService, this._editorService, codeEditor, edits)
			.then(() => true);
	}
}