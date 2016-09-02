/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import nls = require('vs/nls');
import paths = require('vs/base/common/paths');
import labels = require('vs/base/common/labels');
import * as objects from 'vs/base/common/objects';
import uuid = require('vs/base/common/uuid');
import URI from 'vs/base/common/uri';
import {IRange} from 'vs/editor/common/editorCommon';
import {IAutoFocus} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenEntry, QuickOpenModel} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {QuickOpenHandler, EditorQuickOpenEntry} from 'vs/workbench/browser/quickopen';
import {QueryBuilder} from 'vs/workbench/parts/search/common/searchQuery';
import {EditorInput, getOutOfWorkspaceEditorResources, IWorkbenchEditorConfiguration} from 'vs/workbench/common/editor';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IResourceInput} from 'vs/platform/editor/common/editor';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IQueryOptions, ISearchService, ISearchStats, ISearchQuery} from 'vs/platform/search/common/search';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export class FileQuickOpenModel extends QuickOpenModel {

	constructor(entries: QuickOpenEntry[], public stats?: ISearchStats) {
		super(entries);
	}
}

export class FileEntry extends EditorQuickOpenEntry {
	private range: IRange;

	constructor(
		private resource: URI,
		private name: string,
		private description: string,
		private icon: string,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(editorService);

		this.resource = resource;
		this.name = name;
		this.description = description;
	}

	public getLabel(): string {
		return this.name;
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, file picker", this.getLabel());
	}

	public getDescription(): string {
		return this.description;
	}

	public getIcon(): string {
		return this.icon;
	}

	public getResource(): URI {
		return this.resource;
	}

	public setRange(range: IRange): void {
		this.range = range;
	}

	public isFile(): boolean {
		return true; // TODO@Ben debt with editor history merging
	}

	public getInput(): IResourceInput | EditorInput {
		const input: IResourceInput = {
			resource: this.resource,
			options: {
				pinned: !this.configurationService.getConfiguration<IWorkbenchEditorConfiguration>().workbench.editor.enablePreviewFromQuickOpen
			}
		};

		if (this.range) {
			input.options.selection = this.range;
		}

		return input;
	}
}

export interface IOpenFileOptions {
	useIcons: boolean;
}

export class OpenFileHandler extends QuickOpenHandler {
	private options: IOpenFileOptions;
	private queryBuilder: QueryBuilder;
	private cacheState: CacheState;

	constructor(
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ISearchService private searchService: ISearchService
	) {
		super();

		this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
	}

	public setOptions(options: IOpenFileOptions) {
		this.options = options;
	}

	public getResults(searchValue: string, maxSortedResults?: number): TPromise<FileQuickOpenModel> {
		searchValue = searchValue.trim();

		// Respond directly to empty search
		if (!searchValue) {
			return TPromise.as(new FileQuickOpenModel([]));
		}

		// Do find results
		return this.doFindResults(searchValue, this.cacheState.cacheKey, maxSortedResults);
	}

	private doFindResults(searchValue: string, cacheKey?: string, maxSortedResults?: number): TPromise<FileQuickOpenModel> {
		const query: IQueryOptions = {
			folderResources: this.contextService.getWorkspace() ? [this.contextService.getWorkspace().resource] : [],
			extraFileResources: getOutOfWorkspaceEditorResources(this.editorGroupService, this.contextService),
			filePattern: searchValue,
			cacheKey: cacheKey
		};

		if (typeof maxSortedResults === 'number') {
			query.maxResults = maxSortedResults;
			query.sortByScore = true;
		}

		return this.searchService.search(this.queryBuilder.file(query)).then((complete) => {
			const results: QuickOpenEntry[] = [];
			for (let i = 0; i < complete.results.length; i++) {
				const fileMatch = complete.results[i];

				const label = paths.basename(fileMatch.resource.fsPath);
				const description = labels.getPathLabel(paths.dirname(fileMatch.resource.fsPath), this.contextService);

				results.push(this.instantiationService.createInstance(FileEntry, fileMatch.resource, label, description, (this.options && this.options.useIcons) ? 'file' : null));
			}

			return new FileQuickOpenModel(results, complete.stats);
		});
	}

	public hasShortResponseTime(): boolean {
		return this.isCacheLoaded;
	}

	public onOpen(): void {
		this.cacheState = new CacheState(cacheKey => this.cacheQuery(cacheKey), query => this.searchService.search(query), cacheKey => this.searchService.clearCache(cacheKey), this.cacheState);
		this.cacheState.load();
	}

	private cacheQuery(cacheKey: string): ISearchQuery {
		const options: IQueryOptions = {
			folderResources: this.contextService.getWorkspace() ? [this.contextService.getWorkspace().resource] : [],
			extraFileResources: getOutOfWorkspaceEditorResources(this.editorGroupService, this.contextService),
			filePattern: '',
			cacheKey: cacheKey,
			maxResults: 0,
			sortByScore: true
		};

		const query = this.queryBuilder.file(options);
		this.searchService.extendQuery(query);

		return query;
	}

	public get isCacheLoaded(): boolean {
		return this.cacheState && this.cacheState.isLoaded;
	}

	public getGroupLabel(): string {
		return nls.localize('searchResults', "search results");
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: true
		};
	}
}

class CacheState {

	public query: ISearchQuery;

	private _cacheKey = uuid.generateUuid();
	private _isLoaded = false;

	private promise: TPromise<void>;

	constructor(private cacheQuery: (cacheKey: string) => ISearchQuery, private doLoad: (query: ISearchQuery) => TPromise<any>, private doDispose: (cacheKey: string) => TPromise<void>, private previous: CacheState) {
		this.query = cacheQuery(this._cacheKey);
		if (this.previous) {
			const current = objects.assign({}, this.query, { cacheKey: null });
			const previous = objects.assign({}, this.previous.query, { cacheKey: null });
			if (!objects.equals(current, previous)) {
				this.previous.dispose();
				this.previous = null;
			}
		}
	}

	public get cacheKey(): string {
		return this._isLoaded || !this.previous ? this._cacheKey : this.previous.cacheKey;
	}

	public get isLoaded(): boolean {
		return this._isLoaded || !this.previous ? this._isLoaded : this.previous.isLoaded;
	}

	public load(): void {
		this.promise = this.doLoad(this.query)
			.then(() => {
				this._isLoaded = true;
				if (this.previous) {
					this.previous.dispose();
					this.previous = null;
				}
			}, err => {
				errors.onUnexpectedError(err);
			});
	}

	public dispose(): void {
		this.promise.then(null, () => { })
			.then(() => {
				this._isLoaded = false;
				return this.doDispose(this._cacheKey);
			}).then(null, err => {
				errors.onUnexpectedError(err);
			});
		if (this.previous) {
			this.previous.dispose();
			this.previous = null;
		}
	}
}