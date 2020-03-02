/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIconLabelValueOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { CancellationToken } from 'vs/base/common/cancellation';
import * as errors from 'vs/base/common/errors';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { untildify } from 'vs/base/common/labels';
import * as objects from 'vs/base/common/objects';
import { basename, dirname, toLocalResource } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { QuickOpenEntry, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { IPreparedQuery, prepareQuery } from 'vs/base/parts/quickopen/common/quickOpenScorer';
import { IRange } from 'vs/editor/common/core/range';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { EditorQuickOpenEntry, QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { EditorInput, IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { IFileQueryBuilderOptions, QueryBuilder } from 'vs/workbench/contrib/search/common/queryBuilder';
import { getOutOfWorkspaceEditorResources } from 'vs/workbench/contrib/search/common/search';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IRemotePathService } from 'vs/workbench/services/path/common/remotePathService';
import { IFileQuery, IFileSearchStats, ISearchComplete, ISearchService } from 'vs/workbench/services/search/common/search';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';

export class FileQuickOpenModel extends QuickOpenModel {

	constructor(entries: QuickOpenEntry[], stats?: IFileSearchStats) {
		super(entries);
	}
}

export class FileEntry extends EditorQuickOpenEntry {
	private range: IRange | null = null;

	constructor(
		private resource: URI,
		private name: string,
		private description: string,
		private icon: string | undefined,
		@IEditorService editorService: IEditorService,
		@IModeService private readonly modeService: IModeService,
		@IModelService private readonly modelService: IModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(editorService);
	}

	getLabel(): string {
		return this.name;
	}

	getLabelOptions(): IIconLabelValueOptions {
		return {
			extraClasses: getIconClasses(this.modelService, this.modeService, this.resource)
		};
	}

	getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, file picker", this.getLabel());
	}

	getDescription(): string {
		return this.description;
	}

	getIcon(): string | undefined {
		return this.icon;
	}

	getResource(): URI {
		return this.resource;
	}

	setRange(range: IRange | null): void {
		this.range = range;
	}

	mergeWithEditorHistory(): boolean {
		return true;
	}

	getInput(): IResourceInput | EditorInput {
		const input: IResourceInput = {
			resource: this.resource,
			options: {
				pinned: !this.configurationService.getValue<IWorkbenchEditorConfiguration>().workbench.editor.enablePreviewFromQuickOpen,
				selection: this.range ? this.range : undefined
			}
		};

		return input;
	}
}

export interface IOpenFileOptions {
	forceUseIcons: boolean;
}

export class OpenFileHandler extends QuickOpenHandler {
	private options: IOpenFileOptions | undefined;
	private queryBuilder: QueryBuilder;
	private cacheState: CacheState | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ISearchService private readonly searchService: ISearchService,
		@IRemotePathService private readonly remotePathService: IRemotePathService,
		@IWorkbenchEnvironmentService private readonly workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super();

		this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
	}

	setOptions(options: IOpenFileOptions) {
		this.options = options;
	}

	getResults(searchValue: string, token: CancellationToken, maxSortedResults?: number): Promise<FileQuickOpenModel> {
		const query = prepareQuery(searchValue);

		// Respond directly to empty search
		if (!query.value) {
			return Promise.resolve(new FileQuickOpenModel([]));
		}

		// Do find results
		return this.doFindResults(query, token, this.cacheState ? this.cacheState.cacheKey : undefined, maxSortedResults);
	}

	private async doFindResults(query: IPreparedQuery, token: CancellationToken, cacheKey?: string, maxSortedResults?: number): Promise<FileQuickOpenModel> {
		const queryOptions = this.doResolveQueryOptions(query, cacheKey, maxSortedResults);

		let iconClass: string | undefined = undefined;
		if (this.options && this.options.forceUseIcons && !this.themeService.getFileIconTheme()) {
			iconClass = 'file'; // only use a generic file icon if we are forced to use an icon and have no icon theme set otherwise
		}

		let complete: ISearchComplete | undefined = undefined;

		const result = await this.getAbsolutePathResult(query);
		if (token.isCancellationRequested) {
			complete = <ISearchComplete>{ results: [] };
		}

		// If the original search value is an existing file on disk, return it immediately and bypass the search service
		else if (result) {
			complete = <ISearchComplete>{ results: [{ resource: result }] };
		}

		else {
			let fileQuery = this.queryBuilder.file(
				this.contextService.getWorkspace().folders,
				queryOptions
			);
			complete = await this.searchService.fileSearch(fileQuery, token);
		}

		const results: QuickOpenEntry[] = [];

		if (!token.isCancellationRequested) {
			for (const fileMatch of complete.results) {
				const label = basename(fileMatch.resource);
				const description = this.labelService.getUriLabel(dirname(fileMatch.resource), { relative: true });

				results.push(this.instantiationService.createInstance(FileEntry, fileMatch.resource, label, description, iconClass));
			}
		}

		return new FileQuickOpenModel(results, <IFileSearchStats>complete.stats);
	}

	private async getAbsolutePathResult(query: IPreparedQuery): Promise<URI | undefined> {
		const detildifiedQuery = untildify(query.original, (await this.remotePathService.userHome).path);
		if ((await this.remotePathService.path).isAbsolute(detildifiedQuery)) {
			const resource = toLocalResource(
				await this.remotePathService.fileURI(detildifiedQuery),
				this.workbenchEnvironmentService.configuration.remoteAuthority
			);

			try {
				const stat = await this.fileService.resolve(resource);
				return stat.isDirectory ? undefined : resource;
			} catch (error) {
				// ignore
			}
		}

		return undefined;
	}

	private doResolveQueryOptions(query: IPreparedQuery, cacheKey?: string, maxSortedResults?: number): IFileQueryBuilderOptions {
		const queryOptions: IFileQueryBuilderOptions = {
			_reason: 'openFileHandler',
			extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
			filePattern: query.original,
			cacheKey
		};

		if (typeof maxSortedResults === 'number') {
			queryOptions.maxResults = maxSortedResults;
			queryOptions.sortByScore = true;
		}

		return queryOptions;
	}

	hasShortResponseTime(): boolean {
		return this.isCacheLoaded;
	}

	onOpen(): void {
		this.cacheState = new CacheState(cacheKey => this.cacheQuery(cacheKey), query => this.searchService.fileSearch(query), cacheKey => this.searchService.clearCache(cacheKey), this.cacheState);
		this.cacheState.load();
	}

	private cacheQuery(cacheKey: string): IFileQuery {
		const options: IFileQueryBuilderOptions = {
			_reason: 'openFileHandler',
			extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
			filePattern: '',
			cacheKey: cacheKey,
			maxResults: 0,
			sortByScore: true,
		};

		return this.queryBuilder.file(this.contextService.getWorkspace().folders, options);
	}

	get isCacheLoaded(): boolean {
		return !!this.cacheState && this.cacheState.isLoaded;
	}

	getGroupLabel(): string {
		return nls.localize('searchResults', "search results");
	}

	getAutoFocus(searchValue: string): IAutoFocus {
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
	private query: IFileQuery;

	private loadingPhase = LoadingPhase.Created;
	private promise: Promise<void> | undefined;

	constructor(cacheQuery: (cacheKey: string) => IFileQuery, private doLoad: (query: IFileQuery) => Promise<any>, private doDispose: (cacheKey: string) => Promise<void>, private previous: CacheState | undefined) {
		this.query = cacheQuery(this._cacheKey);
		if (this.previous) {
			const current = objects.assign({}, this.query, { cacheKey: null });
			const previous = objects.assign({}, this.previous.query, { cacheKey: null });
			if (!objects.equals(current, previous)) {
				this.previous.dispose();
				this.previous = undefined;
			}
		}
	}

	get cacheKey(): string {
		return this.loadingPhase === LoadingPhase.Loaded || !this.previous ? this._cacheKey : this.previous.cacheKey;
	}

	get isLoaded(): boolean {
		const isLoaded = this.loadingPhase === LoadingPhase.Loaded;
		return isLoaded || !this.previous ? isLoaded : this.previous.isLoaded;
	}

	get isUpdating(): boolean {
		const isUpdating = this.loadingPhase === LoadingPhase.Loading;
		return isUpdating || !this.previous ? isUpdating : this.previous.isUpdating;
	}

	load(): void {
		if (this.isUpdating) {
			return;
		}
		this.loadingPhase = LoadingPhase.Loading;
		this.promise = this.doLoad(this.query)
			.then(() => {
				this.loadingPhase = LoadingPhase.Loaded;
				if (this.previous) {
					this.previous.dispose();
					this.previous = undefined;
				}
			}, err => {
				this.loadingPhase = LoadingPhase.Errored;
				errors.onUnexpectedError(err);
			});
	}

	dispose(): void {
		if (this.promise) {
			this.promise.then(undefined, () => { })
				.then(() => {
					this.loadingPhase = LoadingPhase.Disposed;
					return this.doDispose(this._cacheKey);
				}).then(undefined, err => {
					errors.onUnexpectedError(err);
				});
		} else {
			this.loadingPhase = LoadingPhase.Disposed;
		}
		if (this.previous) {
			this.previous.dispose();
			this.previous = undefined;
		}
	}
}
