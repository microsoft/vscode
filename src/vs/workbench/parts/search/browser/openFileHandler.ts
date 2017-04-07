/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import nls = require('vs/nls');
import paths = require('vs/base/common/paths');
import labels = require('vs/base/common/labels');
import * as objects from 'vs/base/common/objects';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import URI from 'vs/base/common/uri';
import { IIconLabelOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IRange } from 'vs/editor/common/editorCommon';
import { IModeService } from 'vs/editor/common/services/modeService';
import { getIconClasses } from 'vs/workbench/browser/labels';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler, EditorQuickOpenEntry } from 'vs/workbench/browser/quickopen';
import { QueryBuilder } from 'vs/workbench/parts/search/common/searchQuery';
import { EditorInput, getOutOfWorkspaceEditorResources, IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQueryOptions, ISearchService, ISearchStats, ISearchQuery } from 'vs/platform/search/common/search';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

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
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(editorService);
	}

	public getLabel(): string {
		return this.name;
	}

	public getLabelOptions(): IIconLabelOptions {
		return {
			extraClasses: getIconClasses(this.modelService, this.modeService, this.resource)
		};
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
	forceUseIcons: boolean;
}

export class OpenFileHandler extends QuickOpenHandler {
	private options: IOpenFileOptions;
	private queryBuilder: QueryBuilder;
	private cacheState: CacheState;

	constructor(
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService,
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
			folderResources: this.contextService.hasWorkspace() ? [this.contextService.getWorkspace().resource] : [],
			extraFileResources: getOutOfWorkspaceEditorResources(this.editorGroupService, this.contextService),
			filePattern: searchValue,
			cacheKey: cacheKey
		};

		if (typeof maxSortedResults === 'number') {
			query.maxResults = maxSortedResults;
			query.sortByScore = true;
		}

		let iconClass: string;
		if (this.options && this.options.forceUseIcons && !this.themeService.getFileIconTheme()) {
			iconClass = 'file'; // only use a generic file icon if we are forced to use an icon and have no icon theme set otherwise
		}

		return this.searchService.search(this.queryBuilder.file(query)).then((complete) => {
			const results: QuickOpenEntry[] = [];
			for (let i = 0; i < complete.results.length; i++) {
				const fileMatch = complete.results[i];

				const label = paths.basename(fileMatch.resource.fsPath);
				const description = labels.getPathLabel(paths.dirname(fileMatch.resource.fsPath), this.contextService);

				results.push(this.instantiationService.createInstance(FileEntry, fileMatch.resource, label, description, iconClass));
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
			folderResources: this.contextService.hasWorkspace() ? [this.contextService.getWorkspace().resource] : [],
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

enum LoadingPhase {
	Created = 1,
	Loading,
	Loaded,
	Errored,
	Disposed
}

/**
 * Exported for testing.
 */
export class CacheState {

	private _cacheKey = defaultGenerator.nextId();
	private query: ISearchQuery;

	private loadingPhase = LoadingPhase.Created;
	private promise: TPromise<void>;

	constructor(cacheQuery: (cacheKey: string) => ISearchQuery, private doLoad: (query: ISearchQuery) => TPromise<any>, private doDispose: (cacheKey: string) => TPromise<void>, private previous: CacheState) {
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
		return this.loadingPhase === LoadingPhase.Loaded || !this.previous ? this._cacheKey : this.previous.cacheKey;
	}

	public get isLoaded(): boolean {
		const isLoaded = this.loadingPhase === LoadingPhase.Loaded;
		return isLoaded || !this.previous ? isLoaded : this.previous.isLoaded;
	}

	public get isUpdating(): boolean {
		const isUpdating = this.loadingPhase === LoadingPhase.Loading;
		return isUpdating || !this.previous ? isUpdating : this.previous.isUpdating;
	}

	public load(): void {
		if (this.isUpdating) {
			return;
		}
		this.loadingPhase = LoadingPhase.Loading;
		this.promise = this.doLoad(this.query)
			.then(() => {
				this.loadingPhase = LoadingPhase.Loaded;
				if (this.previous) {
					this.previous.dispose();
					this.previous = null;
				}
			}, err => {
				this.loadingPhase = LoadingPhase.Errored;
				errors.onUnexpectedError(err);
			});
	}

	public dispose(): void {
		if (this.promise) {
			this.promise.then(null, () => { })
				.then(() => {
					this.loadingPhase = LoadingPhase.Disposed;
					return this.doDispose(this._cacheKey);
				}).then(null, err => {
					errors.onUnexpectedError(err);
				});
		} else {
			this.loadingPhase = LoadingPhase.Disposed;
		}
		if (this.previous) {
			this.previous.dispose();
			this.previous = null;
		}
	}
}
