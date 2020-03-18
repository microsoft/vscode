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
import { ISearchService, IFileMatch } from 'vs/workbench/services/search/common/search';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { untildify } from 'vs/base/common/labels';
import { IRemotePathService } from 'vs/workbench/services/path/common/remotePathService';
import { URI } from 'vs/base/common/uri';
import { toLocalResource, dirname, basenameOrAuthority } from 'vs/base/common/resources';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFileService } from 'vs/platform/files/common/files';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
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

interface IAnythingQuickPickItem extends IPickerQuickAccessItem {
	resource: URI | undefined;
}

export class AnythingQuickAccessProvider extends PickerQuickAccessProvider<IAnythingQuickPickItem> {

	static PREFIX = '';

	private static readonly MAX_RESULTS = 512;

	private static readonly TYPING_SEARCH_DELAY = 200; // this delay accommodates for the user typing a word and then stops typing to start searching

	private readonly pickState = new class {
		scorerCache: ScorerCache = Object.create(null);
		fileQueryCache: FileQueryCacheState | undefined;

		constructor(private readonly provider: AnythingQuickAccessProvider) { }

		reset(): void {
			this.fileQueryCache = this.provider.createFileQueryCache();
			this.scorerCache = Object.create(null);
		}
	}(this);

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
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService
	) {
		super(AnythingQuickAccessProvider.PREFIX, { canAcceptInBackground: true });
	}

	private get configuration() {
		const editorConfig = this.configurationService.getValue<IWorkbenchEditorConfiguration>().workbench.editor;
		const searchConfig = this.configurationService.getValue<IWorkbenchSearchConfiguration>();

		return {
			openEditorPinned: !editorConfig.enablePreviewFromQuickOpen,
			openSideBySideDirection: editorConfig.openSideBySideDirection,
			includeSymbols: searchConfig.search.quickOpen.includeSymbols,
			includeHistory: searchConfig.search.quickOpen.includeHistory,
			shortAutoSaveDelay: this.filesConfigurationService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY
		};
	}

	provide(picker: IQuickPick<IAnythingQuickPickItem>, token: CancellationToken): IDisposable {

		// Reset the pick state for this run
		this.pickState.reset();

		// Start picker
		return super.provide(picker, token);
	}

	protected getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): FastAndSlowPicksType<IAnythingQuickPickItem> {

		// Find a suitable range from the pattern looking for ":", "#" or ","
		let range: IRange | undefined = undefined;
		const filterWithRange = extractRangeFromFilter(filter);
		if (filterWithRange) {
			filter = filterWithRange.filter;
			range = filterWithRange.range;
		}

		const query = prepareQuery(filter);

		const historyEditorPicks = this.getEditorHistoryPicks(query, range);

		return {

			// Fast picks: editor history
			picks: historyEditorPicks.length > 0 ?
				[
					{ type: 'separator', label: localize('recentlyOpenedSeparator', "recently opened") },
					...historyEditorPicks
				] : [],

			// Slow picks: files and symbols
			additionalPicks: (async (): Promise<Array<IAnythingQuickPickItem | IQuickPickSeparator>> => {

				// Exclude any result that is already present in editor history
				const additionalPicksExcludes = new ResourceMap<boolean>();
				for (const historyEditorPick of historyEditorPicks) {
					if (historyEditorPick.resource) {
						additionalPicksExcludes.set(historyEditorPick.resource, true);
					}
				}

				const additionalPicks = await this.getAdditionalPicks(query, range, additionalPicksExcludes, token);
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

	private async getAdditionalPicks(query: IPreparedQuery, range: IRange | undefined, excludes: ResourceMap<boolean>, token: CancellationToken): Promise<Array<IAnythingQuickPickItem>> {

		// Resolve file and symbol picks (if enabled)
		const [filePicks, symbolPicks] = await Promise.all([
			this.getFilePicks(query, range, excludes, token),
			this.getSymbolPicks(query, range, token)
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

	protected getEditorHistoryPicks(query: IPreparedQuery, range: IRange | undefined): Array<IAnythingQuickPickItem> {

		// Just return all history entries if not searching
		if (!query.value) {
			return this.historyService.getHistory().map(editor => this.createAnythingPick(editor, range));
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

			const editorHistoryPick = this.createAnythingPick(editor, range);

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

		return editorHistoryPicks.sort((editorA, editorB) => compareItemsByScore(editorA, editorB, query, false, editorHistoryScorerAccessor, this.pickState.scorerCache, () => -1));
	}

	//#endregion


	//#region File Search

	private fileQueryDelayer = this._register(new ThrottledDelayer<IFileMatch[]>(AnythingQuickAccessProvider.TYPING_SEARCH_DELAY));

	private fileQueryBuilder = this.instantiationService.createInstance(QueryBuilder);

	private createFileQueryCache(): FileQueryCacheState {
		return new FileQueryCacheState(
			cacheKey => this.fileQueryBuilder.file(this.contextService.getWorkspace().folders, this.getFileQueryOptions({ cacheKey })),
			query => this.searchService.fileSearch(query),
			cacheKey => this.searchService.clearCache(cacheKey),
			this.pickState.fileQueryCache
		).load();
	}

	protected async getFilePicks(query: IPreparedQuery, range: IRange | undefined, excludes: ResourceMap<boolean>, token: CancellationToken): Promise<Array<IAnythingQuickPickItem>> {
		if (!query.value) {
			return [];
		}

		// Absolute path result
		const absolutePathResult = await this.getAbsolutePathFileResult(query, token);
		if (token.isCancellationRequested) {
			return [];
		}

		// Use absolute path result as only results if present
		let fileMatches: Array<IFileMatch<URI>>;
		if (absolutePathResult) {
			fileMatches = [{ resource: absolutePathResult }];
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
		return fileMatches
			.filter(fileMatch => !excludes.has(fileMatch.resource))
			.map(fileMatch => this.createAnythingPick(fileMatch.resource, range));
	}

	private async doFileSearch(query: IPreparedQuery, token: CancellationToken): Promise<IFileMatch[]> {
		const { results } = await this.searchService.fileSearch(
			this.fileQueryBuilder.file(
				this.contextService.getWorkspace().folders,
				this.getFileQueryOptions({
					filePattern: query.original,
					cacheKey: this.pickState.fileQueryCache?.cacheKey,
					maxResults: AnythingQuickAccessProvider.MAX_RESULTS
				})
			), token);

		return results;
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
		const detildifiedQuery = untildify(query.original, (await this.remotePathService.userHome).path);
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
				return (await this.fileService.resolve(resource)).isDirectory ? undefined : resource;
			} catch (error) {
				// ignore
			}
		}

		return;
	}

	//#endregion


	//#region Symbols (if enabled)

	private symbolsQuickAccess = this._register(this.instantiationService.createInstance(SymbolsQuickAccessProvider));

	protected async getSymbolPicks(query: IPreparedQuery, range: IRange | undefined, token: CancellationToken): Promise<Array<IAnythingQuickPickItem>> {
		if (
			!query.value ||							// we need a value for search for
			!this.configuration.includeSymbols ||	// we need to enable symbols in search
			range									// a range is an indicator for just searching for files
		) {
			return [];
		}

		// Delegate to the existing symbols quick access
		// but skip local results and also do not sort
		return this.symbolsQuickAccess.getSymbolPicks(query.value, { skipLocal: true, skipSorting: true, delay: AnythingQuickAccessProvider.TYPING_SEARCH_DELAY }, token);
	}

	//#endregion


	//#region Helpers

	private createAnythingPick(resourceOrEditor: URI | IEditorInput | IResourceEditorInput, range: IRange | undefined): IAnythingQuickPickItem {
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
			isDirty = this.workingCopyService.isDirty(resource) && !this.configuration.shortAutoSaveDelay;
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
				const openSideBySideDirection = this.configuration.openSideBySideDirection;
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
			trigger: async (buttonIndex, keyMods) => {
				switch (buttonIndex) {

					// Open to side / below
					case 0:
						this.openAnything(resourceOrEditor, { keyMods, range, forceOpenSideBySide: true });
						return TriggerAction.CLOSE_PICKER;

					// Remove from History
					case 1:
						if (!URI.isUri(resourceOrEditor)) {
							this.historyService.remove(resourceOrEditor);

							return TriggerAction.REFRESH_PICKER;
						}
				}

				return TriggerAction.NO_ACTION;
			},
			accept: (keyMods, event) => this.openAnything(resourceOrEditor, { keyMods, range, preserveFocus: event.inBackground })
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
