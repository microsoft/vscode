/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMatch } from 'vs/base/common/filters';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { basenameOrAuthority, dirname } from 'vs/base/common/resources';
import { ThemeIcon } from 'vs/base/common/themables';
import { IRange, Range } from 'vs/editor/common/core/range';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { WorkbenchCompressibleObjectTree, getSelectionKeyboardEvent } from 'vs/platform/list/browser/listService';
import { FastAndSlowPicks, IPickerQuickAccessItem, PickerQuickAccessProvider, Picks } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { DefaultQuickAccessFilterValue } from 'vs/platform/quickinput/common/quickAccess';
import { IKeyMods, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { IViewsService } from 'vs/workbench/common/views';
import { searchDetailsIcon, searchOpenInFileIcon } from 'vs/workbench/contrib/search/browser/searchIcons';
import { FileMatch, Match, MatchInNotebook, RenderableMatch, SearchModel, searchComparer } from 'vs/workbench/contrib/search/browser/searchModel';
import { SearchView, getEditorSelectionFromMatch } from 'vs/workbench/contrib/search/browser/searchView';
import { IWorkbenchSearchConfiguration, getOutOfWorkspaceEditorResources } from 'vs/workbench/contrib/search/common/search';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { ITextQueryBuilderOptions, QueryBuilder } from 'vs/workbench/services/search/common/queryBuilder';
import { IPatternInfo, ITextQuery, VIEW_ID } from 'vs/workbench/services/search/common/search';

export const TEXT_SEARCH_QUICK_ACCESS_PREFIX = '% ';

const DEFAULT_TEXT_QUERY_BUILDER_OPTIONS: ITextQueryBuilderOptions = {
	_reason: 'quickAccessSearch',
	disregardIgnoreFiles: false,
	disregardExcludeSettings: false,
	onlyOpenEditors: false,
	expandPatterns: true
};

const MAX_FILES_SHOWN = 30;
const MAX_RESULTS_PER_FILE = 10;

export class TextSearchQuickAccess extends PickerQuickAccessProvider<IPickerQuickAccessItem> {
	private queryBuilder: QueryBuilder;
	private searchModel: SearchModel;

	private _getTextQueryBuilderOptions(charsPerLine: number): ITextQueryBuilderOptions {
		return {
			...DEFAULT_TEXT_QUERY_BUILDER_OPTIONS,
			... {
				extraFileResources: this._instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
				maxResults: this.configuration.maxResults ?? undefined,
				isSmartCase: this.configuration.smartCase,
			},

			previewOptions: {
				matchLines: 1,
				charsPerLine
			}
		};
	}

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILabelService private readonly _labelService: ILabelService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super(TEXT_SEARCH_QUICK_ACCESS_PREFIX, { canAcceptInBackground: true });

		this.queryBuilder = this._instantiationService.createInstance(QueryBuilder);
		this.searchModel = this._instantiationService.createInstance(SearchModel);
	}

	private get configuration() {
		const editorConfig = this._configurationService.getValue<IWorkbenchEditorConfiguration>().workbench?.editor;
		const searchConfig = this._configurationService.getValue<IWorkbenchSearchConfiguration>().search;

		return {
			openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview,
			preserveInput: searchConfig.experimental.quickAccess.preserveInput,
			maxResults: searchConfig.maxResults,
			smartCase: searchConfig.smartCase,
		};
	}

	get defaultFilterValue(): DefaultQuickAccessFilterValue | undefined {
		if (this.configuration.preserveInput) {
			return DefaultQuickAccessFilterValue.LAST;
		}

		return undefined;
	}

	private doSearch(contentPattern: string, token: CancellationToken): {
		syncResults: FileMatch[];
		asyncResults: Promise<FileMatch[]>;
	} | undefined {
		if (contentPattern === '') {
			return undefined;
		}

		const folderResources: IWorkspaceFolder[] = this._contextService.getWorkspace().folders;
		const content: IPatternInfo = {
			pattern: contentPattern,
		};
		const charsPerLine = content.isRegExp ? 10000 : 1000; // from https://github.com/microsoft/vscode/blob/e7ad5651ac26fa00a40aa1e4010e81b92f655569/src/vs/workbench/contrib/search/browser/searchView.ts#L1508

		const query: ITextQuery = this.queryBuilder.text(content, folderResources.map(folder => folder.uri), this._getTextQueryBuilderOptions(charsPerLine));

		const result = this.searchModel.search(query, undefined, token);

		const getAsyncResults = async () => {
			await result.asyncResults;
			return this.searchModel.searchResult.matches().filter(e => result.syncResults.indexOf(e) === -1);
		};
		return {
			syncResults: this.searchModel.searchResult.matches(),
			asyncResults: getAsyncResults()
		};
	}

	private moveToSearchViewlet(model: SearchModel, currentElem: RenderableMatch) {
		// this function takes this._searchModel.searchResult and moves it to the search viewlet's search model.
		// then, this._searchModel will construct a new (empty) SearchResult, and the search viewlet's search result will be disposed.
		this._viewsService.openView(VIEW_ID, false);
		const viewlet: SearchView | undefined = this._viewsService.getActiveViewWithId(VIEW_ID) as SearchView;
		viewlet.importSearchResult(model);

		const viewer: WorkbenchCompressibleObjectTree<RenderableMatch> | undefined = viewlet?.getControl();

		viewer.setFocus([currentElem], getSelectionKeyboardEvent());
		viewer.setSelection([currentElem], getSelectionKeyboardEvent());
		viewer.reveal(currentElem);
	}

	private _getPicksFromMatches(matches: FileMatch[], limit: number): (IQuickPickSeparator | IPickerQuickAccessItem)[] {
		matches = matches.sort(searchComparer);

		const files = matches.length > limit ? matches.slice(0, limit) : matches;
		const picks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];

		for (let fileIndex = 0; fileIndex < matches.length; fileIndex++) {
			if (fileIndex === limit) {

				picks.push({
					type: 'separator',
				});

				picks.push({
					label: localize('QuickSearchSeeMoreFiles', "See More Files"),
					iconClass: ThemeIcon.asClassName(searchDetailsIcon),
					accept: async () => {
						this.moveToSearchViewlet(this.searchModel, matches[limit]);
					}
				});
				break;
			}

			const fileMatch = files[fileIndex];

			const label = basenameOrAuthority(fileMatch.resource);
			const description = this._labelService.getUriLabel(dirname(fileMatch.resource), { relative: true });


			picks.push({
				label,
				type: 'separator',
				tooltip: description,
				buttons: [{
					iconClass: ThemeIcon.asClassName(searchOpenInFileIcon),
					tooltip: localize('QuickSearchOpenInFile', "Open File")
				}],
			});

			const results: Match[] = fileMatch.matches() ?? [];
			for (let matchIndex = 0; matchIndex < results.length; matchIndex++) {
				const element = results[matchIndex];

				if (matchIndex === MAX_RESULTS_PER_FILE) {
					picks.push({
						label: localize('QuickSearchMore', "More"),
						iconClass: ThemeIcon.asClassName(searchDetailsIcon),
						accept: async () => {
							this.moveToSearchViewlet(this.searchModel, element);
						}
					});
					break;
				}

				const preview = element.preview();
				const previewText = (preview.before + preview.inside + preview.after).trim().substring(0, 999);
				const match: IMatch[] = [{
					start: preview.before.length,
					end: preview.before.length + preview.inside.length
				}];
				picks.push({
					label: `${previewText}`,
					highlights: {
						label: match
					},
					ariaLabel: `Match at location ${element.range().startLineNumber}:${element.range().startColumn} - ${previewText}`,
					accept: async (keyMods, event) => {
						await this.handleAccept(fileMatch, {
							keyMods,
							selection: getEditorSelectionFromMatch(element, this.searchModel),
							preserveFocus: event.inBackground,
							forcePinned: event.inBackground,
							indexedCellOptions: element instanceof MatchInNotebook ? { index: element.cellIndex, selection: element.range() } : undefined
						});
					}
				});
			}
		}
		return picks;
	}

	private async handleAccept(fileMatch: FileMatch, options: { keyMods?: IKeyMods; selection?: ITextEditorSelection; preserveFocus?: boolean; range?: IRange; forcePinned?: boolean; forceOpenSideBySide?: boolean; indexedCellOptions?: { index: number; selection?: Range } }): Promise<void> {
		const editorOptions = {
			preserveFocus: options.preserveFocus,
			pinned: options.keyMods?.ctrlCmd || options.forcePinned || this.configuration.openEditorPinned,
			selection: options.selection
		};

		// from https://github.com/microsoft/vscode/blob/f40dabca07a1622b2a0ae3ee741cfc94ab964bef/src/vs/workbench/contrib/search/browser/anythingQuickAccess.ts#L1037
		const targetGroup = options.keyMods?.alt || (this.configuration.openEditorPinned && options.keyMods?.ctrlCmd) || options.forceOpenSideBySide ? SIDE_GROUP : ACTIVE_GROUP;

		await this._editorService.openEditor({
			resource: fileMatch.resource,
			options: editorOptions
		}, targetGroup);
	}

	protected _getPicks(contentPattern: string, disposables: DisposableStore, token: CancellationToken): Picks<IQuickPickItem> | Promise<Picks<IQuickPickItem> | FastAndSlowPicks<IQuickPickItem>> | FastAndSlowPicks<IQuickPickItem> | null {

		if (contentPattern === '') {
			this.searchModel.searchResult.clear();
			return [];
		}
		const allMatches = this.doSearch(contentPattern, token);

		if (!allMatches) {
			return null;
		}
		const matches = allMatches.syncResults;
		const syncResult = this._getPicksFromMatches(matches, MAX_FILES_SHOWN);

		if (matches.length >= MAX_FILES_SHOWN) {
			return syncResult;
		}

		return {
			picks: syncResult,
			additionalPicks: allMatches.asyncResults.then((asyncResults) => {
				return this._getPicksFromMatches(asyncResults, MAX_FILES_SHOWN - matches.length);
			})
		};

	}
}
