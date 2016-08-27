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

export class FileEntry extends EditorQuickOpenEntry {
	private name: string;
	private description: string;
	private resource: URI;
	private range: IRange;

	constructor(
		name: string,
		description: string,
		resource: URI,
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
		return 'file';
	}

	public getResource(): URI {
		return this.resource;
	}

	public setRange(range: IRange): void {
		this.range = range;
	}

	public getInput(): IResourceInput | EditorInput {
		let input: IResourceInput = {
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

export class OpenFileHandler extends QuickOpenHandler {

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

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		return this.getResultsWithStats(searchValue)
			.then(result => result[0]);
	}

	public getResultsWithStats(searchValue: string, maxSortedResults?: number): TPromise<[QuickOpenModel, ISearchStats]> {
		searchValue = searchValue.trim();
		let promise: TPromise<[QuickOpenEntry[], ISearchStats]>;

		// Respond directly to empty search
		if (!searchValue) {
			promise = TPromise.as(<[QuickOpenEntry[], ISearchStats]>[[], undefined]);
		} else {
			promise = this.doFindResults(searchValue, this.cacheState.cacheKey, maxSortedResults);
		}

		return promise.then(result => [new QuickOpenModel(result[0]), result[1]]);
	}

	private doFindResults(searchValue: string, cacheKey?: string, maxSortedResults?: number): TPromise<[QuickOpenEntry[], ISearchStats]> {
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
			let results: QuickOpenEntry[] = [];
			for (let i = 0; i < complete.results.length; i++) {
				let fileMatch = complete.results[i];

				let label = paths.basename(fileMatch.resource.fsPath);
				let description = labels.getPathLabel(paths.dirname(fileMatch.resource.fsPath), this.contextService);

				results.push(this.instantiationService.createInstance(FileEntry, label, description, fileMatch.resource));
			}

			return [results, complete.stats];
		});
	}

	public onOpen(): void {
		this.cacheState = new CacheState(cacheKey => this.cacheQuery(cacheKey), query => this.searchService.search(query), cacheKey => this.searchService.clearCache(cacheKey), this.cacheState);
		this.cacheState.load();
	}

	private cacheQuery(cacheKey: string): ISearchQuery {
		const options: IQueryOptions = {
			folderResources: this.contextService.getWorkspace() ? [this.contextService.getWorkspace().resource] : [],
			extraFileResources: [],
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

	constructor (private cacheQuery: (cacheKey: string) => ISearchQuery, private doLoad: (query: ISearchQuery) => TPromise<any>, private doDispose: (cacheKey: string) => TPromise<void>, private previous: CacheState) {
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
				console.error(errors.toErrorMessage(err));
			});
	}

	public dispose(): void {
		this.promise.then(null, () => {})
			.then(() => {
				this._isLoaded = false;
				return this.doDispose(this._cacheKey);
			}).then(null, err => {
				console.error(errors.toErrorMessage(err));
			});
		if (this.previous) {
			this.previous.dispose();
			this.previous = null;
		}
	}
}