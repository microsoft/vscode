/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/anythingQuickAccess';
import { IQuickPickSeparator, IQuickInputButton, IKeyMods, quickPickItemScorerAccessor, QuickPickItemScorerAccessor, IQuickPick } from 'vs/platform/quickinput/common/quickInput';
import { IPickerQuickAccessItem, PickerQuickAccessProvider, TriggerAction, FastAndSlowPicksType } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { prepareQuery, IPreparedQuery, compareItemsByScore, scoreItem, ScorerCache } from 'vs/base/common/fuzzyScorer';
import { IFileQueryBuilderOptions, QueryBuilder } from 'vs/workbench/contrib/search/common/queryBuilder';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { getOutOfWorkspaceEditorResources, extractRangeFromFilter, IWorkbenchSearchConfiguration } from 'vs/workbench/contrib/search/common/search';
import { ISearchService } from 'vs/workbench/services/search/common/search';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { untildify } from 'vs/base/common/labels';
import { IRemotePathService } from 'vs/workbench/services/path/common/remotePathService';
import { URI } from 'vs/base/common/uri';
import { toLocalResource, dirname, basenameOrAuthority, isEqual } from 'vs/base/common/resources';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFileService } from 'vs/platform/files/common/files';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore, IDisposable, toDisposable, MutableDisposable, Disposable } from 'vs/base/common/lifecycle';
import { ILabelService } from 'vs/platform/label/common/label';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { localize } from 'vs/nls';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchEditorConfiguration, IEditorInput, EditorInput } from 'vs/workbench/common/editor';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { Range, IRange } from 'vs/editor/common/core/range';
import { ThrottledDelayer } from 'vs/base/common/async';
import { top } from 'vs/base/common/arrays';
import { FileQueryCacheState } from 'vs/workbench/contrib/search/common/cacheState';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IResourceEditorInput, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { Schemas } from 'vs/base/common/network';
import { IFilesConfigurationService, AutoSaveMode } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ResourceMap } from 'vs/base/common/map';
import { SymbolsQuickAccessProvider } from 'vs/workbench/contrib/search/browser/symbolsQuickAccess';
import { DefaultQuickAccessFilterValue } from 'vs/platform/quickinput/common/quickAccess';
import { IWorkbenchQuickOpenConfiguration } from 'vs/workbench/browser/quickopen';
import { GotoSymbolQuickAccessProvider } from 'vs/workbench/contrib/codeEditor/browser/quickaccess/gotoSymbolQuickAccess';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ScrollType, IEditor, ICodeEditorViewState, IDiffEditorViewState } from 'vs/editor/common/editorCommon';
import { once } from 'vs/base/common/functional';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { withNullAsUndefined } from 'vs/base/common/types';

interface IAnythingQuickPickItem extends IPickerQuickAccessItem {
	resource: URI | undefined;
}

interface IEditorSymbolAnythingQuickPickItem extends IAnythingQuickPickItem {
	resource: URI;
	range: { decoration: IRange, selection: IRange }
}

function isEditorSymbolQuickPickItem(pick?: IAnythingQuickPickItem): pick is IEditorSymbolAnythingQuickPickItem {
	const candidate = pick ? pick as IEditorSymbolAnythingQuickPickItem : undefined;

	return !!candidate && !!candidate.range && !!candidate.resource;
}

export class AnythingQuickAccessProvider extends PickerQuickAccessProvider<IAnythingQuickPickItem> {

	static PREFIX = '';

	private static readonly MAX_RESULTS = 512;

	private static readonly TYPING_SEARCH_DELAY = 200; // this delay accommodates for the user typing a word and then stops typing to start searching

	private readonly pickState = new class {

		picker: IQuickPick<IAnythingQuickPickItem> | undefined = undefined;

		editorViewState: {
			editor: IEditorInput,
			group: IEditorGroup,
			state: ICodeEditorViewState | IDiffEditorViewState | undefined
		} | undefined = undefined;

		scorerCache: ScorerCache = Object.create(null);
		fileQueryCache: FileQueryCacheState | undefined = undefined;

		lastOriginalFilter: string | undefined = undefined;
		lastFilter: string | undefined = undefined;
		lastRange: IRange | undefined = undefined;
		lastActiveGlobalPick: IAnythingQuickPickItem | undefined = undefined;

		isQuickNavigating: boolean | undefined = undefined;

		constructor(private readonly provider: AnythingQuickAccessProvider, private readonly editorService: IEditorService) { }

		set(picker: IQuickPick<IAnythingQuickPickItem>): void {

			// Picker for this run
			this.picker = picker;
			once(picker.onDispose)(() => {
				if (picker === this.picker) {
					this.picker = undefined; // clear the picker when disposed to not keep it in memory for too long
				}
			});

			// Caches
			const isQuickNavigating = !!picker.quickNavigate;
			if (!isQuickNavigating) {
				this.fileQueryCache = this.provider.createFileQueryCache();
				this.scorerCache = Object.create(null);
			}

			// Other
			this.isQuickNavigating = isQuickNavigating;
			this.lastOriginalFilter = undefined;
			this.lastFilter = undefined;
			this.lastRange = undefined;
			this.lastActiveGlobalPick = undefined;
			this.editorViewState = undefined;
		}

		rememberEditorViewState(): void {
			if (this.editorViewState) {
				return; // return early if already done
			}

			const activeEditorPane = this.editorService.activeEditorPane;
			if (activeEditorPane) {
				this.editorViewState = {
					group: activeEditorPane.group,
					editor: activeEditorPane.input,
					state: withNullAsUndefined(getCodeEditor(activeEditorPane.getControl())?.saveViewState())
				};
			}
		}
	}(this, this.editorService);

	get defaultFilterValue(): DefaultQuickAccessFilterValue | undefined {
		if (this.configuration.preserveInput) {
			return DefaultQuickAccessFilterValue.LAST;
		}

		return undefined;
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISearchService private readonly searchService: ISearchService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IRemotePathService private readonly remotePathService: IRemotePathService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@ILabelService private readonly labelService: ILabelService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@ITextModelService private readonly textModelService: ITextModelService
	) {
		super(AnythingQuickAccessProvider.PREFIX, { canAcceptInBackground: true });
	}

	private get configuration() {
		const editorConfig = this.configurationService.getValue<IWorkbenchEditorConfiguration>().workbench.editor;
		const searchConfig = this.configurationService.getValue<IWorkbenchSearchConfiguration>().search;
		const quickOpenConfig = this.configurationService.getValue<IWorkbenchQuickOpenConfiguration>().workbench.quickOpen;

		return {
			openEditorPinned: !editorConfig.enablePreviewFromQuickOpen,
			openSideBySideDirection: editorConfig.openSideBySideDirection,
			includeSymbols: searchConfig.quickOpen.includeSymbols,
			includeHistory: searchConfig.quickOpen.includeHistory,
			historyFilterSortOrder: searchConfig.quickOpen.history.filterSortOrder,
			shortAutoSaveDelay: this.filesConfigurationService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY,
			preserveInput: quickOpenConfig.preserveInput
		};
	}

	provide(picker: IQuickPick<IAnythingQuickPickItem>, token: CancellationToken): IDisposable {
		const disposables = new DisposableStore();

		// Update the pick state for this run
		this.pickState.set(picker);

		// Add editor decorations for active editor symbol picks
		const editorDecorationsDisposable = disposables.add(new MutableDisposable());
		disposables.add(picker.onDidChangeActive(() => {

			// Clear old decorations
			editorDecorationsDisposable.value = undefined;

			// Add new decoration if editor symbol is active
			const [item] = picker.activeItems;
			if (isEditorSymbolQuickPickItem(item)) {
				editorDecorationsDisposable.value = this.decorateAndRevealSymbolRange(item);
			}
		}));

		// Restore view state upon cancellation if we changed it
		disposables.add(once(token.onCancellationRequested)(() => {
			if (this.pickState.editorViewState) {
				this.editorService.openEditor(
					this.pickState.editorViewState.editor,
					{ viewState: this.pickState.editorViewState.state, preserveFocus: true /* import to not close the picker as a result */ },
					this.pickState.editorViewState.group
				);
			}
		}));

		// Start picker
		disposables.add(super.provide(picker, token));

		return disposables;
	}

	private decorateAndRevealSymbolRange(pick: IEditorSymbolAnythingQuickPickItem): IDisposable {
		const activeEditor = this.editorService.activeEditor;
		if (!isEqual(pick.resource, activeEditor?.resource)) {
			return Disposable.None; // active editor needs to be for resource
		}

		const activeEditorControl = this.editorService.activeTextEditorControl;
		if (!activeEditorControl) {
			return Disposable.None; // we need a text editor control to decorate and reveal
		}

		// we must remember our curret view state to be able to restore
		this.pickState.rememberEditorViewState();

		// Reveal
		activeEditorControl.revealRangeInCenter(pick.range.selection, ScrollType.Smooth);

		// Decorate
		this.addDecorations(activeEditorControl, pick.range.decoration);

		return toDisposable(() => this.clearDecorations(activeEditorControl));
	}

	protected getPicks(originalFilter: string, disposables: DisposableStore, token: CancellationToken): Promise<Array<IAnythingQuickPickItem | IQuickPickSeparator>> | FastAndSlowPicksType<IAnythingQuickPickItem> | null {

		// Find a suitable range from the pattern looking for ":", "#" or ","
		// unless we have the `@` editor symbol character inside the filter
		const filterWithRange = extractRangeFromFilter(originalFilter, [GotoSymbolQuickAccessProvider.PREFIX]);

		// Update filter with normalized values
		let filter: string;
		if (filterWithRange) {
			filter = filterWithRange.filter;
		} else {
			filter = originalFilter;
		}

		// Remember as last range
		this.pickState.lastRange = filterWithRange?.range;

		// If the original filter value has changed but the normalized
		// one has not, we return early with a `null` result indicating
		// that the results should preserve because the range information
		// (:<line>:<column>) does not need to trigger any re-sorting.
		if (originalFilter !== this.pickState.lastOriginalFilter && filter === this.pickState.lastFilter) {
			return null;
		}

		// Remember as last filter
		this.pickState.lastOriginalFilter = originalFilter;
		this.pickState.lastFilter = filter;

		// Remember last active pick (unless editor symbol)
		const activePick = this.pickState.picker?.activeItems[0];
		if (activePick && !isEditorSymbolQuickPickItem(activePick)) {
			this.pickState.lastActiveGlobalPick = activePick;
		}

		return this.doGetPicks(filter, disposables, token);
	}

	private doGetPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Promise<Array<IAnythingQuickPickItem | IQuickPickSeparator>> | FastAndSlowPicksType<IAnythingQuickPickItem> | null {
		const query = prepareQuery(filter);

		// Return early if we have editor symbol picks. We support this by:
		// - having a previously active global pick (e.g. a file)
		// - the user typing `@` to start the local symbol query
		const editorSymbolPicks = this.getEditorSymbolPicks(query, disposables, token);
		if (editorSymbolPicks) {
			return editorSymbolPicks;
		}

		// Otherwise return normally with history and file/symbol results
		const historyEditorPicks = this.getEditorHistoryPicks(query);

		return {

			// Fast picks: editor history
			picks:
				(this.pickState.isQuickNavigating || historyEditorPicks.length === 0) ?
					historyEditorPicks :
					[
						{ type: 'separator', label: localize('recentlyOpenedSeparator', "recently opened") },
						...historyEditorPicks
					],

			// Slow picks: files and symbols
			additionalPicks: (async (): Promise<Array<IAnythingQuickPickItem | IQuickPickSeparator>> => {

				// Exclude any result that is already present in editor history
				const additionalPicksExcludes = new ResourceMap<boolean>();
				for (const historyEditorPick of historyEditorPicks) {
					if (historyEditorPick.resource) {
						additionalPicksExcludes.set(historyEditorPick.resource, true);
					}
				}

				const additionalPicks = await this.getAdditionalPicks(query, additionalPicksExcludes, token);
				if (token.isCancellationRequested) {
					return [];
				}

				return additionalPicks.length > 0 ? [
					{ type: 'separator', label: this.configuration.includeSymbols ? localize('fileAndSymbolResultsSeparator', "file and symbol results") : localize('fileResultsSeparator', "file results") },
					...additionalPicks
				] : [];
			})()
		};
	}

	private async getAdditionalPicks(query: IPreparedQuery, excludes: ResourceMap<boolean>, token: CancellationToken): Promise<Array<IAnythingQuickPickItem>> {

		// Resolve file and symbol picks (if enabled)
		const [filePicks, symbolPicks] = await Promise.all([
			this.getFilePicks(query, excludes, token),
			this.getWorkspaceSymbolPicks(query, token)
		]);

		if (token.isCancellationRequested) {
			return [];
		}

		// Sort top 512 items by score
		const sortedAnythingPicks = top(
			[...filePicks, ...symbolPicks],
			(anyPickA, anyPickB) => compareItemsByScore(anyPickA, anyPickB, query, true, quickPickItemScorerAccessor, this.pickState.scorerCache),
			AnythingQuickAccessProvider.MAX_RESULTS
		);

		// Adjust highlights
		for (const anythingPick of sortedAnythingPicks) {
			if (anythingPick.highlights) {
				continue; // preserve any highlights we got already (e.g. symbols)
			}

			const { labelMatch, descriptionMatch } = scoreItem(anythingPick, query, true, quickPickItemScorerAccessor, this.pickState.scorerCache);

			anythingPick.highlights = {
				label: labelMatch,
				description: descriptionMatch
			};
		}

		return sortedAnythingPicks;
	}


	//#region Editor History

	private readonly labelOnlyEditorHistoryPickAccessor = new QuickPickItemScorerAccessor({ skipDescription: true });

	private getEditorHistoryPicks(query: IPreparedQuery): Array<IAnythingQuickPickItem> {
		const configuration = this.configuration;

		// Just return all history entries if not searching
		if (!query.value) {
			return this.historyService.getHistory().map(editor => this.createAnythingPick(editor, configuration));
		}

		if (!this.configuration.includeHistory) {
			return []; // disabled when searching
		}

		// Only match on label of the editor unless the search includes path separators
		const editorHistoryScorerAccessor = query.containsPathSeparator ? quickPickItemScorerAccessor : this.labelOnlyEditorHistoryPickAccessor;

		// Otherwise filter and sort by query
		const editorHistoryPicks: Array<IAnythingQuickPickItem> = [];
		for (const editor of this.historyService.getHistory()) {
			const resource = editor.resource;
			if (!resource || (!this.fileService.canHandleResource(resource) && resource.scheme !== Schemas.untitled)) {
				continue; // exclude editors without file resource if we are searching by pattern
			}

			const editorHistoryPick = this.createAnythingPick(editor, configuration);

			const { score, labelMatch, descriptionMatch } = scoreItem(editorHistoryPick, query, false, editorHistoryScorerAccessor, this.pickState.scorerCache);
			if (!score) {
				continue; // exclude editors not matching query
			}

			editorHistoryPick.highlights = {
				label: labelMatch,
				description: descriptionMatch
			};

			editorHistoryPicks.push(editorHistoryPick);
		}

		// Return without sorting if settings tell to sort by recency
		if (this.configuration.historyFilterSortOrder === 'recency') {
			return editorHistoryPicks;
		}

		return editorHistoryPicks.sort((editorA, editorB) => compareItemsByScore(editorA, editorB, query, false, editorHistoryScorerAccessor, this.pickState.scorerCache));
	}

	//#endregion


	//#region File Search

	private fileQueryDelayer = this._register(new ThrottledDelayer<URI[]>(AnythingQuickAccessProvider.TYPING_SEARCH_DELAY));

	private fileQueryBuilder = this.instantiationService.createInstance(QueryBuilder);

	private createFileQueryCache(): FileQueryCacheState {
		return new FileQueryCacheState(
			cacheKey => this.fileQueryBuilder.file(this.contextService.getWorkspace().folders, this.getFileQueryOptions({ cacheKey })),
			query => this.searchService.fileSearch(query),
			cacheKey => this.searchService.clearCache(cacheKey),
			this.pickState.fileQueryCache
		).load();
	}

	private async getFilePicks(query: IPreparedQuery, excludes: ResourceMap<boolean>, token: CancellationToken): Promise<Array<IAnythingQuickPickItem>> {
		if (!query.value) {
			return [];
		}

		// Absolute path result
		const absolutePathResult = await this.getAbsolutePathFileResult(query, token);
		if (token.isCancellationRequested) {
			return [];
		}

		// Use absolute path result as only results if present
		let fileMatches: Array<URI>;
		if (absolutePathResult) {
			fileMatches = [absolutePathResult];
		}

		// Otherwise run the file search (with a delayer if cache is not ready yet)
		else {
			if (this.pickState.fileQueryCache?.isLoaded) {
				fileMatches = await this.doFileSearch(query, token);
			} else {
				fileMatches = await this.fileQueryDelayer.trigger(async () => {
					if (token.isCancellationRequested) {
						return [];
					}

					return this.doFileSearch(query, token);
				});
			}
		}

		if (token.isCancellationRequested) {
			return [];
		}

		// Filter excludes & convert to picks
		const configuration = this.configuration;
		return fileMatches
			.filter(resource => !excludes.has(resource))
			.map(resource => this.createAnythingPick(resource, configuration));
	}

	private async doFileSearch(query: IPreparedQuery, token: CancellationToken): Promise<URI[]> {
		const [fileSearchResults, relativePathFileResults] = await Promise.all([

			// File search: this is a search over all files of the workspace using the provided pattern
			this.searchService.fileSearch(
				this.fileQueryBuilder.file(
					this.contextService.getWorkspace().folders,
					this.getFileQueryOptions({
						filePattern: query.original,
						cacheKey: this.pickState.fileQueryCache?.cacheKey,
						maxResults: AnythingQuickAccessProvider.MAX_RESULTS
					})
				), token),

			// Relative path search: we also want to consider results that match files inside the workspace
			// by looking for relative paths that the user typed as query. This allows to return even excluded
			// results into the picker if found (e.g. helps for opening compilation results that are otherwise
			// excluded)
			this.getRelativePathFileResults(query, token)
		]);

		// Return quickly if no relative results are present
		if (!relativePathFileResults) {
			return fileSearchResults.results.map(result => result.resource);
		}

		// Otherwise, make sure to filter relative path results from
		// the search results to prevent duplicates
		const relativePathFileResultsMap = new ResourceMap<boolean>();
		for (const relativePathFileResult of relativePathFileResults) {
			relativePathFileResultsMap.set(relativePathFileResult, true);
		}

		return [
			...fileSearchResults.results.filter(result => !relativePathFileResultsMap.has(result.resource)).map(result => result.resource),
			...relativePathFileResults
		];
	}

	private getFileQueryOptions(input: { filePattern?: string, cacheKey?: string, maxResults?: number }): IFileQueryBuilderOptions {
		const fileQueryOptions: IFileQueryBuilderOptions = {
			_reason: 'openFileHandler', // used for telemetry - do not change
			extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
			filePattern: input.filePattern || '',
			cacheKey: input.cacheKey,
			maxResults: input.maxResults || 0,
			sortByScore: true
		};

		return fileQueryOptions;
	}

	private async getAbsolutePathFileResult(query: IPreparedQuery, token: CancellationToken): Promise<URI | undefined> {
		if (!query.containsPathSeparator) {
			return;
		}

		const detildifiedQuery = untildify(query.value, (await this.remotePathService.userHome).path);
		if (token.isCancellationRequested) {
			return;
		}

		const isAbsolutePathQuery = (await this.remotePathService.path).isAbsolute(detildifiedQuery);
		if (token.isCancellationRequested) {
			return;
		}

		if (isAbsolutePathQuery) {
			const resource = toLocalResource(
				await this.remotePathService.fileURI(detildifiedQuery),
				this.environmentService.configuration.remoteAuthority
			);

			if (token.isCancellationRequested) {
				return;
			}

			try {
				if ((await this.fileService.resolve(resource)).isFile) {
					return resource;
				}
			} catch (error) {
				// ignore if file does not exist
			}
		}

		return;
	}

	private async getRelativePathFileResults(query: IPreparedQuery, token: CancellationToken): Promise<URI[] | undefined> {
		if (!query.containsPathSeparator) {
			return;
		}

		// Convert relative paths to absolute paths over all folders of the workspace
		// and return them as results if the absolute paths exist
		const isAbsolutePathQuery = (await this.remotePathService.path).isAbsolute(query.value);
		if (!isAbsolutePathQuery) {
			const resources: URI[] = [];
			for (const folder of this.contextService.getWorkspace().folders) {
				if (token.isCancellationRequested) {
					break;
				}

				const resource = toLocalResource(
					folder.toResource(query.value),
					this.environmentService.configuration.remoteAuthority
				);

				try {
					if ((await this.fileService.resolve(resource)).isFile) {
						resources.push(resource);
					}
				} catch (error) {
					// ignore if file does not exist
				}
			}

			return resources;
		}

		return;
	}

	//#endregion


	//#region Workspace Symbols (if enabled)

	private workspaceSymbolsQuickAccess = this._register(this.instantiationService.createInstance(SymbolsQuickAccessProvider));

	private async getWorkspaceSymbolPicks(query: IPreparedQuery, token: CancellationToken): Promise<Array<IAnythingQuickPickItem>> {
		const configuration = this.configuration;
		if (
			!query.value ||						// we need a value for search for
			!configuration.includeSymbols ||	// we need to enable symbols in search
			this.pickState.lastRange			// a range is an indicator for just searching for files
		) {
			return [];
		}

		// Delegate to the existing symbols quick access
		// but skip local results and also do not sort
		return this.workspaceSymbolsQuickAccess.getSymbolPicks(query.value, {
			skipLocal: true,
			skipSorting: true,
			delay: AnythingQuickAccessProvider.TYPING_SEARCH_DELAY
		}, token);
	}

	//#endregion


	//#region Editor Symbols (if narrowing down into a global pick via `@`)

	private readonly editorSymbolsQuickAccess = this.instantiationService.createInstance(GotoSymbolQuickAccessProvider);

	private getEditorSymbolPicks(query: IPreparedQuery, disposables: DisposableStore, token: CancellationToken): Promise<Array<IAnythingQuickPickItem | IQuickPickSeparator>> | null {
		const filter = query.original.split(GotoSymbolQuickAccessProvider.PREFIX)[1]?.trim();
		if (typeof filter !== 'string') {
			return null; // we need to be searched for editor symbols via `@`
		}

		const activeGlobalPick = this.pickState.lastActiveGlobalPick;
		if (!activeGlobalPick) {
			return null; // we need an active global pick to find symbols for
		}

		const activeGlobalResource = activeGlobalPick.resource;
		if (!activeGlobalResource || (!this.fileService.canHandleResource(activeGlobalResource) && activeGlobalResource.scheme !== Schemas.untitled)) {
			return null; // we need a resource that we can resolve
		}

		return this.doGetEditorSymbolPicks(activeGlobalPick, activeGlobalResource, filter, disposables, token);
	}

	private async doGetEditorSymbolPicks(activeGlobalPick: IAnythingQuickPickItem, activeGlobalResource: URI, filter: string, disposables: DisposableStore, token: CancellationToken): Promise<Array<IAnythingQuickPickItem | IQuickPickSeparator>> {

		// Bring the editor to front to review symbols to go to
		try {

			// we must remember our curret view state to be able to restore
			this.pickState.rememberEditorViewState();

			// open it
			await this.editorService.openEditor({
				resource: activeGlobalResource,
				options: { preserveFocus: true, revealIfOpened: true, ignoreError: true }
			});
		} catch (error) {
			return []; // return if resource cannot be opened
		}

		if (token.isCancellationRequested) {
			return [];
		}

		// Obtain model from resource
		let model = this.modelService.getModel(activeGlobalResource);
		if (!model) {
			try {
				const modelReference = disposables.add(await this.textModelService.createModelReference(activeGlobalResource));
				if (token.isCancellationRequested) {
					return [];
				}

				model = modelReference.object.textEditorModel;
			} catch (error) {
				return []; // return if model cannot be resolved
			}
		}

		// Ask provider for editor symbols
		const editorSymbolPicks = (await this.editorSymbolsQuickAccess.getSymbolPicks(model, filter, disposables, token));
		if (token.isCancellationRequested) {
			return [];
		}

		return editorSymbolPicks.map(editorSymbolPick => {

			// Preserve separators
			if (editorSymbolPick.type === 'separator') {
				return editorSymbolPick;
			}

			// Convert editor symbols to anything pick
			return {
				...editorSymbolPick,
				resource: activeGlobalResource,
				description: editorSymbolPick.description ? `${activeGlobalPick.label} • ${editorSymbolPick.description}` : activeGlobalPick.label,
				trigger: (buttonIndex, keyMods) => {
					this.openAnything(activeGlobalResource, { keyMods, range: editorSymbolPick.range?.selection, forceOpenSideBySide: true });

					return TriggerAction.CLOSE_PICKER;
				},
				accept: (keyMods, event) => this.openAnything(activeGlobalResource, { keyMods, range: editorSymbolPick.range?.selection, preserveFocus: event.inBackground })
			};
		});
	}

	addDecorations(editor: IEditor, range: IRange): void {
		this.editorSymbolsQuickAccess.addDecorations(editor, range);
	}

	clearDecorations(editor: IEditor): void {
		this.editorSymbolsQuickAccess.clearDecorations(editor);
	}

	//#endregion


	//#region Helpers

	private createAnythingPick(resourceOrEditor: URI | IEditorInput | IResourceEditorInput, configuration: { shortAutoSaveDelay: boolean, openSideBySideDirection: 'right' | 'down' | undefined }): IAnythingQuickPickItem {
		const isEditorHistoryEntry = !URI.isUri(resourceOrEditor);

		let resource: URI | undefined;
		let label: string;
		let description: string | undefined = undefined;
		let isDirty: boolean | undefined = undefined;

		if (resourceOrEditor instanceof EditorInput) {
			resource = resourceOrEditor.resource;
			label = resourceOrEditor.getName();
			description = resourceOrEditor.getDescription();
			isDirty = resourceOrEditor.isDirty() && !resourceOrEditor.isSaving();
		} else {
			resource = URI.isUri(resourceOrEditor) ? resourceOrEditor : (resourceOrEditor as IResourceEditorInput).resource;
			label = basenameOrAuthority(resource);
			description = this.labelService.getUriLabel(dirname(resource), { relative: true });
			isDirty = this.workingCopyService.isDirty(resource) && !configuration.shortAutoSaveDelay;
		}

		return {
			resource,
			label,
			ariaLabel: isEditorHistoryEntry ?
				localize('historyPickAriaLabel', "{0}, recently opened", label) :
				localize('filePickAriaLabel', "{0}, file picker", label),
			description,
			iconClasses: getIconClasses(this.modelService, this.modeService, resource),
			buttons: (() => {
				if (this.pickState.isQuickNavigating) {
					return undefined; // no actions when quick navigating
				}

				const openSideBySideDirection = configuration.openSideBySideDirection;
				const buttons: IQuickInputButton[] = [];

				// Open to side / below
				buttons.push({
					iconClass: openSideBySideDirection === 'right' ? 'codicon-split-horizontal' : 'codicon-split-vertical',
					tooltip: openSideBySideDirection === 'right' ? localize('openToSide', "Open to the Side") : localize('openToBottom', "Open to the Bottom")
				});

				// Remove from History
				if (isEditorHistoryEntry) {
					buttons.push({
						iconClass: isDirty ? 'dirty-anything codicon-circle-filled' : 'codicon-close',
						tooltip: localize('closeEditor', "Remove from Recently Opened"),
						alwaysVisible: isDirty
					});
				}

				return buttons;
			})(),
			trigger: (buttonIndex, keyMods) => {
				switch (buttonIndex) {

					// Open to side / below
					case 0:
						this.openAnything(resourceOrEditor, { keyMods, range: this.pickState.lastRange, forceOpenSideBySide: true });

						return TriggerAction.CLOSE_PICKER;

					// Remove from History
					case 1:
						if (!URI.isUri(resourceOrEditor)) {
							this.historyService.remove(resourceOrEditor);

							return TriggerAction.REMOVE_ITEM;
						}
				}

				return TriggerAction.NO_ACTION;
			},
			accept: (keyMods, event) => this.openAnything(resourceOrEditor, { keyMods, range: this.pickState.lastRange, preserveFocus: event.inBackground })
		};
	}

	private async openAnything(resourceOrEditor: URI | IEditorInput | IResourceEditorInput, options: { keyMods?: IKeyMods, preserveFocus?: boolean, range?: IRange, forceOpenSideBySide?: boolean }): Promise<void> {
		const editorOptions: ITextEditorOptions = {
			preserveFocus: options.preserveFocus,
			pinned: options.keyMods?.alt || this.configuration.openEditorPinned,
			selection: options.range ? Range.collapseToStart(options.range) : undefined
		};

		const targetGroup = options.keyMods?.ctrlCmd || options.forceOpenSideBySide ? SIDE_GROUP : ACTIVE_GROUP;

		if (resourceOrEditor instanceof EditorInput) {
			await this.editorService.openEditor(resourceOrEditor, editorOptions);
		} else {
			await this.editorService.openEditor({
				resource: URI.isUri(resourceOrEditor) ? resourceOrEditor : resourceOrEditor.resource,
				options: editorOptions
			}, targetGroup);
		}
	}

	//#endregion
}
