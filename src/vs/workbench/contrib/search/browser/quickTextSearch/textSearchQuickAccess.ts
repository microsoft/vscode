/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IMatch } from 'vs/base/common/filters';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ResourceSet } from 'vs/base/common/map';
import { basenameOrAuthority, dirname } from 'vs/base/common/resources';
import { ThemeIcon } from 'vs/base/common/themables';
import { IRange } from 'vs/editor/common/core/range';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { WorkbenchCompressibleObjectTree, getSelectionKeyboardEvent } from 'vs/platform/list/browser/listService';
import { FastAndSlowPicks, IPickerQuickAccessItem, IPickerQuickAccessSeparator, PickerQuickAccessProvider, Picks, TriggerAction } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { DefaultQuickAccessFilterValue, IQuickAccessProviderRunOptions } from 'vs/platform/quickinput/common/quickAccess';
import { IKeyMods, IQuickPick, IQuickPickItem, QuickInputButtonLocation, QuickInputHideReason } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { searchDetailsIcon, searchOpenInFileIcon, searchActivityBarIcon } from 'vs/workbench/contrib/search/browser/searchIcons';
import { FileMatch, Match, RenderableMatch, SearchModel, SearchModelLocation, searchComparer } from 'vs/workbench/contrib/search/browser/searchModel';
import { SearchView, getEditorSelectionFromMatch } from 'vs/workbench/contrib/search/browser/searchView';
import { IWorkbenchSearchConfiguration, getOutOfWorkspaceEditorResources } from 'vs/workbench/contrib/search/common/search';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { ITextQueryBuilderOptions, QueryBuilder } from 'vs/workbench/services/search/common/queryBuilder';
import { IPatternInfo, ISearchComplete, ITextQuery, VIEW_ID } from 'vs/workbench/services/search/common/search';
import { Event } from 'vs/base/common/event';
import { PickerEditorState } from 'vs/workbench/browser/quickaccess';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { Sequencer } from 'vs/base/common/async';
import { URI } from 'vs/base/common/uri';
import { Codicon } from 'vs/base/common/codicons';

export const TEXT_SEARCH_QUICK_ACCESS_PREFIX = '%';

const DEFAULT_TEXT_QUERY_BUILDER_OPTIONS: ITextQueryBuilderOptions = {
	_reason: 'quickAccessSearch',
	disregardIgnoreFiles: false,
	disregardExcludeSettings: false,
	onlyOpenEditors: false,
	expandPatterns: true
};

const MAX_FILES_SHOWN = 30;
const MAX_RESULTS_PER_FILE = 10;
const DEBOUNCE_DELAY = 75;

interface ITextSearchQuickAccessItem extends IPickerQuickAccessItem {
	match?: Match;
}
export class TextSearchQuickAccess extends PickerQuickAccessProvider<ITextSearchQuickAccessItem> {

	private editorSequencer: Sequencer;
	private queryBuilder: QueryBuilder;
	private searchModel: SearchModel;
	private currentAsyncSearch: Promise<ISearchComplete> = Promise.resolve({
		results: [],
		messages: []
	});
	private readonly editorViewState: PickerEditorState;

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
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super(TEXT_SEARCH_QUICK_ACCESS_PREFIX, { canAcceptInBackground: true, shouldSkipTrimPickFilter: true });

		this.queryBuilder = this._instantiationService.createInstance(QueryBuilder);
		this.searchModel = this._register(this._instantiationService.createInstance(SearchModel));
		this.editorViewState = this._register(this._instantiationService.createInstance(PickerEditorState));
		this.searchModel.location = SearchModelLocation.QUICK_ACCESS;
		this.editorSequencer = new Sequencer();
	}

	override dispose(): void {
		this.searchModel.dispose();
		super.dispose();
	}

	override provide(picker: IQuickPick<ITextSearchQuickAccessItem, { useSeparators: true }>, token: CancellationToken, runOptions?: IQuickAccessProviderRunOptions): IDisposable {
		const disposables = new DisposableStore();
		if (TEXT_SEARCH_QUICK_ACCESS_PREFIX.length < picker.value.length) {
			picker.valueSelection = [TEXT_SEARCH_QUICK_ACCESS_PREFIX.length, picker.value.length];
		}
		picker.buttons = [{
			location: QuickInputButtonLocation.Inline,
			iconClass: ThemeIcon.asClassName(Codicon.goToSearch),
			tooltip: localize('goToSearch', "See in Search Panel")
		}];
		this.editorViewState.reset();
		disposables.add(picker.onDidTriggerButton(() => {
			if (this.searchModel.searchResult.count() > 0) {
				this.moveToSearchViewlet(undefined);
			} else {
				this._viewsService.openView(VIEW_ID, true);
			}
			picker.hide();
		}));

		const onDidChangeActive = () => {
			const [item] = picker.activeItems;

			if (item?.match) {
				// we must remember our curret view state to be able to restore (will automatically track if there is already stored state)
				this.editorViewState.set();
				const itemMatch = item.match;
				this.editorSequencer.queue(async () => {
					await this.editorViewState.openTransientEditor({
						resource: itemMatch.parent().resource,
						options: { preserveFocus: true, revealIfOpened: true, ignoreError: true, selection: itemMatch.range() }
					});
				});
			}
		};

		disposables.add(Event.debounce(picker.onDidChangeActive, (last, event) => event, DEBOUNCE_DELAY, true)(onDidChangeActive));
		disposables.add(Event.once(picker.onWillHide)(({ reason }) => {
			// Restore view state upon cancellation if we changed it
			// but only when the picker was closed via explicit user
			// gesture and not e.g. when focus was lost because that
			// could mean the user clicked into the editor directly.
			if (reason === QuickInputHideReason.Gesture) {
				this.editorViewState.restore();
			}
		}));

		disposables.add(Event.once(picker.onDidHide)(({ reason }) => {
			this.searchModel.searchResult.toggleHighlights(false);
		}));

		disposables.add(super.provide(picker, token, runOptions));
		disposables.add(picker.onDidAccept(() => this.searchModel.searchResult.toggleHighlights(false)));
		return disposables;
	}

	private get configuration() {
		const editorConfig = this._configurationService.getValue<IWorkbenchEditorConfiguration>().workbench?.editor;
		const searchConfig = this._configurationService.getValue<IWorkbenchSearchConfiguration>().search;

		return {
			openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview,
			preserveInput: searchConfig.quickAccess.preserveInput,
			maxResults: searchConfig.maxResults,
			smartCase: searchConfig.smartCase,
			sortOrder: searchConfig.sortOrder,
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
		this.searchModel.searchResult.toggleHighlights(false);
		const charsPerLine = content.isRegExp ? 10000 : 1000; // from https://github.com/microsoft/vscode/blob/e7ad5651ac26fa00a40aa1e4010e81b92f655569/src/vs/workbench/contrib/search/browser/searchView.ts#L1508

		const query: ITextQuery = this.queryBuilder.text(content, folderResources.map(folder => folder.uri), this._getTextQueryBuilderOptions(charsPerLine));

		const result = this.searchModel.search(query, undefined, token);

		const getAsyncResults = async () => {
			this.currentAsyncSearch = result.asyncResults;
			await result.asyncResults;
			const syncResultURIs = new ResourceSet(result.syncResults.map(e => e.resource));
			return this.searchModel.searchResult.matches().filter(e => !syncResultURIs.has(e.resource));
		};
		return {
			syncResults: this.searchModel.searchResult.matches(),
			asyncResults: getAsyncResults()
		};
	}

	private moveToSearchViewlet(currentElem: RenderableMatch | undefined) {
		// this function takes this._searchModel and moves it to the search viewlet's search model.
		// then, this._searchModel will construct a new (empty) SearchModel.
		this._viewsService.openView(VIEW_ID, false);
		const viewlet: SearchView | undefined = this._viewsService.getActiveViewWithId(VIEW_ID) as SearchView;
		viewlet.replaceSearchModel(this.searchModel, this.currentAsyncSearch);

		this.searchModel = this._instantiationService.createInstance(SearchModel);
		this.searchModel.location = SearchModelLocation.QUICK_ACCESS;

		const viewer: WorkbenchCompressibleObjectTree<RenderableMatch> | undefined = viewlet?.getControl();
		if (currentElem) {
			viewer.setFocus([currentElem], getSelectionKeyboardEvent());
			viewer.setSelection([currentElem], getSelectionKeyboardEvent());
			viewer.reveal(currentElem);
		} else {
			viewlet.searchAndReplaceWidget.focus();
		}
	}


	private _getPicksFromMatches(matches: FileMatch[], limit: number, firstFile?: URI): (IPickerQuickAccessSeparator | ITextSearchQuickAccessItem)[] {
		matches = matches.sort((a, b) => {
			if (firstFile) {
				if (firstFile === a.resource) {
					return -1;
				} else if (firstFile === b.resource) {
					return 1;
				}
			}
			return searchComparer(a, b, this.configuration.sortOrder);
		});

		const files = matches.length > limit ? matches.slice(0, limit) : matches;
		const picks: Array<ITextSearchQuickAccessItem | IPickerQuickAccessSeparator> = [];

		for (let fileIndex = 0; fileIndex < matches.length; fileIndex++) {
			if (fileIndex === limit) {

				picks.push({
					type: 'separator',
				});

				picks.push({
					label: localize('QuickSearchSeeMoreFiles', "See More Files"),
					iconClass: ThemeIcon.asClassName(searchDetailsIcon),
					accept: async () => {
						this.moveToSearchViewlet(matches[limit]);
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
				description,
				buttons: [{
					iconClass: ThemeIcon.asClassName(searchOpenInFileIcon),
					tooltip: localize('QuickSearchOpenInFile', "Open File")
				}],
				trigger: async (): Promise<TriggerAction> => {
					await this.handleAccept(fileMatch, {});
					return TriggerAction.CLOSE_PICKER;
				},
			});

			const results: Match[] = fileMatch.matches() ?? [];
			for (let matchIndex = 0; matchIndex < results.length; matchIndex++) {
				const element = results[matchIndex];

				if (matchIndex === MAX_RESULTS_PER_FILE) {
					picks.push({
						label: localize('QuickSearchMore', "More"),
						iconClass: ThemeIcon.asClassName(searchDetailsIcon),
						accept: async () => {
							this.moveToSearchViewlet(element);
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
					buttons: [{
						iconClass: ThemeIcon.asClassName(searchActivityBarIcon),
						tooltip: localize('showMore', "See in Search Panel"),
					}],
					ariaLabel: `Match at location ${element.range().startLineNumber}:${element.range().startColumn} - ${previewText}`,
					accept: async (keyMods, event) => {
						await this.handleAccept(fileMatch, {
							keyMods,
							selection: getEditorSelectionFromMatch(element, this.searchModel),
							preserveFocus: event.inBackground,
							forcePinned: event.inBackground
						});
					},
					trigger: (): TriggerAction => {
						this.moveToSearchViewlet(element);
						return TriggerAction.CLOSE_PICKER;
					},
					match: element
				});
			}
		}
		return picks;
	}

	private async handleAccept(fileMatch: FileMatch, options: { keyMods?: IKeyMods; selection?: ITextEditorSelection; preserveFocus?: boolean; range?: IRange; forcePinned?: boolean; forceOpenSideBySide?: boolean }): Promise<void> {
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

		const searchModelAtTimeOfSearch = this.searchModel;
		if (contentPattern === '') {

			this.searchModel.searchResult.clear();
			return [{
				label: localize('enterSearchTerm', "Enter a term to search for across your files.")
			}];
		}

		const conditionalTokenCts = disposables.add(new CancellationTokenSource());

		disposables.add(token.onCancellationRequested(() => {
			if (searchModelAtTimeOfSearch.location === SearchModelLocation.QUICK_ACCESS) {
				// if the search model has not been imported to the panel, you can cancel
				conditionalTokenCts.cancel();
			}
		}));
		const allMatches = this.doSearch(contentPattern, conditionalTokenCts.token);

		if (!allMatches) {
			return null;
		}
		const matches = allMatches.syncResults;
		const syncResult = this._getPicksFromMatches(matches, MAX_FILES_SHOWN, this._editorService.activeEditor?.resource);
		if (syncResult.length > 0) {
			this.searchModel.searchResult.toggleHighlights(true);
		}

		if (matches.length >= MAX_FILES_SHOWN) {
			return syncResult;
		}

		return {
			picks: syncResult,
			additionalPicks: allMatches.asyncResults
				.then(asyncResults => (asyncResults.length + syncResult.length === 0) ? [{
					label: localize('noAnythingResults', "No matching results")
				}] : this._getPicksFromMatches(asyncResults, MAX_FILES_SHOWN - matches.length))
				.then(picks => {
					if (picks.length > 0) {
						this.searchModel.searchResult.toggleHighlights(true);
					}
					return picks;
				})
		};

	}
}
