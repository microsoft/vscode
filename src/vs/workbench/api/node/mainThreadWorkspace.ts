/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { isPromiseCanceledError } from 'vs/base/common/errors';
import { ISearchService, QueryType } from 'vs/platform/search/common/search';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { bulkEdit, IResourceEdit } from 'vs/editor/common/services/bulkEdit';
import { TPromise } from 'vs/base/common/winjs.base';
import { Uri } from 'vscode';
import { MainThreadWorkspaceShape } from './extHost.protocol';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { IFileService } from 'vs/platform/files/common/files';

export class MainThreadWorkspace extends MainThreadWorkspaceShape {

	private _activeSearches: { [id: number]: TPromise<Uri[]> } = Object.create(null);
	private _searchService: ISearchService;
	private _contextService: IWorkspaceContextService;
	private _textFileService: ITextFileService;
	private _editorService: IWorkbenchEditorService;
	private _textModelResolverService: ITextModelResolverService;
	private _fileService: IFileService;

	constructor(
		@ISearchService searchService: ISearchService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ITextFileService textFileService: ITextFileService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@ITextModelResolverService textModelResolverService: ITextModelResolverService,
		@IFileService fileService: IFileService
	) {
		super();

		this._searchService = searchService;
		this._contextService = contextService;
		this._textFileService = textFileService;
		this._editorService = editorService;
		this._fileService = fileService;
		this._textModelResolverService = textModelResolverService;
	}

	$startSearch(include: string, exclude: string, maxResults: number, requestId: number): Thenable<Uri[]> {
		const workspace = this._contextService.getWorkspace();
		if (!workspace) {
			return undefined;
		}

		const search = this._searchService.search({
			folderResources: [workspace.resource],
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

		return bulkEdit(this._textModelResolverService, codeEditor, edits, this._fileService)
			.then(() => true);
	}
}
