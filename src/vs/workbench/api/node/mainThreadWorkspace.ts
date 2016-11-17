/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { isPromiseCanceledError } from 'vs/base/common/errors';
import { ISearchService, QueryType } from 'vs/platform/search/common/search';
import { IWorkspaceContextService, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { IEventService } from 'vs/platform/event/common/event';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { bulkEdit, IResourceEdit } from 'vs/editor/common/services/bulkEdit';
import { TPromise } from 'vs/base/common/winjs.base';
import { Uri } from 'vscode';
import { MainThreadWorkspaceShape } from './extHost.protocol';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';

export class MainThreadWorkspace extends MainThreadWorkspaceShape {

	private _activeSearches: { [id: number]: TPromise<Uri[]> } = Object.create(null);
	private _searchService: ISearchService;
	private _workspace: IWorkspace;
	private _textFileService: ITextFileService;
	private _editorService: IWorkbenchEditorService;
	private _textModelResolverService: ITextModelResolverService;
	private _eventService: IEventService;

	constructor(
		@ISearchService searchService: ISearchService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ITextFileService textFileService,
		@IWorkbenchEditorService editorService,
		@ITextModelResolverService textModelResolverService,
		@IEventService eventService
	) {
		super();

		this._searchService = searchService;
		this._workspace = contextService.getWorkspace();
		this._textFileService = textFileService;
		this._editorService = editorService;
		this._eventService = eventService;
		this._textModelResolverService = textModelResolverService;
	}

	$startSearch(include: string, exclude: string, maxResults: number, requestId: number): Thenable<Uri[]> {

		if (!this._workspace) {
			return;
		}

		const search = this._searchService.search({
			folderResources: [this._workspace.resource],
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
			let candidate = <ICommonCodeEditor>editor.getControl();
			if (typeof candidate.getEditorType === 'function') {
				// enough proof
				codeEditor = candidate;
			}
		}

		return bulkEdit(this._eventService, this._textModelResolverService, codeEditor, edits)
			.then(() => true);
	}
}
