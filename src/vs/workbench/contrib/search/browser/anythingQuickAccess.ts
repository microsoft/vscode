/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickPickSeparator, IQuickInputButton, IKeyMods, quickPickItemScorerAccessor } from 'vs/platform/quickinput/common/quickInput';
import { IPickerQuickAccessItem, PickerQuickAccessProvider, TriggerAction } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { prepareQuery, IPreparedQuery, compareItemsByScore, scoreItem } from 'vs/base/common/fuzzyScorer';
import { IFileQueryBuilderOptions, QueryBuilder } from 'vs/workbench/contrib/search/common/queryBuilder';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { getOutOfWorkspaceEditorResources, extractRangeFromFilter, IWorkbenchSearchConfiguration } from 'vs/workbench/contrib/search/common/search';
import { ISearchService, IFileMatch } from 'vs/workbench/services/search/common/search';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { untildify } from 'vs/base/common/labels';
import { IRemotePathService } from 'vs/workbench/services/path/common/remotePathService';
import { URI } from 'vs/base/common/uri';
import { toLocalResource, basename, dirname } from 'vs/base/common/resources';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFileService } from 'vs/platform/files/common/files';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ILabelService } from 'vs/platform/label/common/label';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { localize } from 'vs/nls';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { Range, IRange } from 'vs/editor/common/core/range';
import { ThrottledDelayer } from 'vs/base/common/async';
import { top } from 'vs/base/common/arrays';
import { FileQueryCacheState } from 'vs/workbench/contrib/search/common/cacheState';

interface IAnythingQuickPickItem extends IPickerQuickAccessItem {
	resource: URI;
}

export class AnythingQuickAccessProvider extends PickerQuickAccessProvider<IAnythingQuickPickItem> {

	static PREFIX = '';

	private static readonly MAX_RESULTS = 512;

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
		@IEditorService private readonly editorService: IEditorService
	) {
		super(AnythingQuickAccessProvider.PREFIX, { canAcceptInBackground: true });
	}

	private get configuration() {
		const editorConfig = this.configurationService.getValue<IWorkbenchEditorConfiguration>().workbench.editor;
		const searchConfig = this.configurationService.getValue<IWorkbenchSearchConfiguration>();

		return {
			openEditorPinned: !editorConfig.enablePreviewFromQuickOpen,
			openSideBySideDirection: editorConfig.openSideBySideDirection,
			includeSymbols: searchConfig.search.quickOpen.includeSymbols
		};
	}

	protected async getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Promise<Array<IAnythingQuickPickItem | IQuickPickSeparator>> {

		// TODO this should run just once when picker opens
		this.warmUpFileQueryCache();

		// Find a suitable range from the pattern looking for ":", "#" or ","
		let range: IRange | undefined = undefined;
		const filterWithRange = extractRangeFromFilter(filter);
		if (filterWithRange) {
			filter = filterWithRange.filter;
			range = filterWithRange.range;
		}

		const query = prepareQuery(filter);

		// TODO include history results
		// TODO exclude duplicates from editor history!
		// TODO groups ("recently opened", "file results", "file and symbol results")

		// Resolve file and symbol picks (if enabled)
		const [filePicks, symbolPicks] = await Promise.all([
			this.getFilePicks(query, range, token),
			this.getSymbolPicks(query, range, token)
		]);

		if (token.isCancellationRequested) {
			return [];
		}

		// Sort top 512 items by score
		const scorerCache = Object.create(null); // TODO should keep this for as long as the picker is opened (also check other pickers)
		const sortedAnythingPicks = top(
			[...filePicks, ...symbolPicks],
			(anyPickA, anyPickB) => compareItemsByScore(anyPickA, anyPickB, query, true, quickPickItemScorerAccessor, scorerCache),
			AnythingQuickAccessProvider.MAX_RESULTS
		);

		// Adjust highlights
		for (const anythingPick of sortedAnythingPicks) {
			const { labelMatch, descriptionMatch } = scoreItem(anythingPick, query, true, quickPickItemScorerAccessor, scorerCache);

			anythingPick.highlights = {
				label: labelMatch,
				description: descriptionMatch
			};
		}

		return sortedAnythingPicks;
	}

	//#region Editor History

	protected getHistoryPicks(filter: string): Array<IAnythingQuickPickItem> {
		return [];
	}

	//#endregion


	//# File Search

	private static readonly FILE_QUERY_DELAY = 200; // this delay accommodates for the user typing a word and then stops typing to start searching

	private fileQueryDelayer = this._register(new ThrottledDelayer<IFileMatch[]>(AnythingQuickAccessProvider.FILE_QUERY_DELAY));

	private fileQueryBuilder = this.instantiationService.createInstance(QueryBuilder);
	private fileQueryCacheState: FileQueryCacheState | undefined;

	private warmUpFileQueryCache(): void {
		this.fileQueryCacheState = new FileQueryCacheState(
			cacheKey => this.fileQueryBuilder.file(this.contextService.getWorkspace().folders, this.getFileQueryOptions({ cacheKey })),
			query => this.searchService.fileSearch(query),
			cacheKey => this.searchService.clearCache(cacheKey),
			this.fileQueryCacheState
		);
		this.fileQueryCacheState.load();
	}

	protected async getFilePicks(query: IPreparedQuery, range: IRange | undefined, token: CancellationToken): Promise<Array<IAnythingQuickPickItem>> {
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
			if (this.fileQueryCacheState?.isLoaded) {
				fileMatches = await this.doFileSearch(query, token);
			} else {
				fileMatches = await this.fileQueryDelayer.trigger(() => this.doFileSearch(query, token));
			}
		}

		if (token.isCancellationRequested) {
			return [];
		}

		// Convert to picks
		return fileMatches.map(fileMatch => this.createFilePick(fileMatch.resource, range, false));
	}

	private async doFileSearch(query: IPreparedQuery, token: CancellationToken): Promise<IFileMatch[]> {
		if (token.isCancellationRequested) {
			return [];
		}

		const { results } = await this.searchService.fileSearch(
			this.fileQueryBuilder.file(
				this.contextService.getWorkspace().folders,
				this.getFileQueryOptions({
					filePattern: query.original,
					cacheKey: this.fileQueryCacheState?.cacheKey,
					maxResults: AnythingQuickAccessProvider.MAX_RESULTS
				})
			), token);

		return results;
	}

	private createFilePick(resource: URI, range: IRange | undefined, isHistoryResult: boolean): IAnythingQuickPickItem {
		const label = basename(resource);
		const description = this.labelService.getUriLabel(dirname(resource), { relative: true });
		const isDirty = this.workingCopyService.isDirty(resource);
		const openSideBySideDirection = this.configuration.openSideBySideDirection;

		return {
			resource,
			label,
			ariaLabel: localize('filePickAriaLabel', "{0}, file picker", label),
			description,
			iconClasses: getIconClasses(this.modelService, this.modeService, resource), // TODO force 'file' icon if symbols are merged in for better looks
			buttonsAlwaysVisible: isDirty,
			buttons: (() => {
				const buttons: IQuickInputButton[] = [];

				// Open to side / below
				buttons.push({
					iconClass: openSideBySideDirection === 'right' ? 'codicon-split-horizontal' : 'codicon-split-vertical',
					tooltip: openSideBySideDirection === 'right' ? localize('openToSide', "Open to the Side") : localize('openToBottom', "Open to the Bottom")
				});

				// Remove from History
				if (isHistoryResult) {
					buttons.push({
						iconClass: isDirty ? 'codicon-circle-filled' : 'codicon-close',
						tooltip: localize('closeEditor', "Close Editor")
					});
				}

				// Dirty indicator
				else if (isDirty) {
					buttons.push({
						iconClass: 'codicon-circle-filled',
						tooltip: localize('dirtyFile', "Dirty File")
					});
				}

				return buttons;
			})(),
			trigger: async (buttonIndex, keyMods) => {
				switch (buttonIndex) {

					// Open to side / below
					case 0:
						this.openFile(resource, { keyMods, range, forceOpenSideBySide: true });
						return TriggerAction.CLOSE_PICKER;

					// Remove from History / Dirty Indicator
					case 1:
						//TODO
						return TriggerAction.REFRESH_PICKER;

				}

				return TriggerAction.NO_ACTION;
			},
			accept: (keyMods, event) => this.openFile(resource, { keyMods, range, preserveFocus: event.inBackground })
		};
	}

	private async openFile(resource: URI, options: { keyMods?: IKeyMods, preserveFocus?: boolean, range?: IRange, forceOpenSideBySide?: boolean }): Promise<void> {
		await this.editorService.openEditor({
			resource,
			options: {
				preserveFocus: options.preserveFocus,
				pinned: options.keyMods?.alt || this.configuration.openEditorPinned,
				selection: options.range ? Range.collapseToStart(options.range) : undefined
			}
		}, options.keyMods?.ctrlCmd || options.forceOpenSideBySide ? SIDE_GROUP : ACTIVE_GROUP);
	}

	private getFileQueryOptions(input: { filePattern?: string, cacheKey?: string, maxResults?: number }): IFileQueryBuilderOptions {
		const fileQueryOptions: IFileQueryBuilderOptions = {
			_reason: 'openFileHandler',
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

	protected async getSymbolPicks(query: IPreparedQuery, range: IRange | undefined, token: CancellationToken): Promise<Array<IAnythingQuickPickItem>> {
		if (
			!query.value ||							// we need a value for search for
			!this.configuration.includeSymbols ||	// we need to enable symbols in search
			range									// a range is an indicator for just searching for files
		) {
			return [];
		}

		return [];
	}

	//#endregion
}
