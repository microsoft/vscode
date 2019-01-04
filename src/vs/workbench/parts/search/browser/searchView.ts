/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { ITreeContextMenuEvent, ITreeElement } from 'vs/base/browser/ui/tree/tree';
import { IAction } from 'vs/base/common/actions';
import { Delayer } from 'vs/base/common/async';
import * as errors from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Iterator } from 'vs/base/common/iterator';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import * as paths from 'vs/base/common/paths';
import * as env from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/searchview';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import * as nls from 'vs/nls';
import { fillInContextMenuActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IMenu, IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IConfirmation, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { FileChangesEvent, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TreeResourceNavigator2, WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IPatternInfo, ISearchComplete, ISearchConfiguration, ISearchConfigurationProperties, ISearchHistoryService, ISearchHistoryValues, ISearchProgressItem, ITextQuery, SearchErrorCode, VIEW_ID, IProgress } from 'vs/platform/search/common/search';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { diffInserted, diffInsertedOutline, diffRemoved, diffRemovedOutline, editorFindMatchHighlight, editorFindMatchHighlightBorder, listActiveSelectionForeground } from 'vs/platform/theme/common/colorRegistry';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { OpenFileFolderAction, OpenFolderAction } from 'vs/workbench/browser/actions/workspaceActions';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { IEditor } from 'vs/workbench/common/editor';
import { IPanel } from 'vs/workbench/common/panel';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { ExcludePatternInputWidget, PatternInputWidget } from 'vs/workbench/parts/search/browser/patternInputWidget';
import { CancelSearchAction, ClearSearchResultsAction, CollapseDeepestExpandedLevelAction, RefreshAction, getKeyboardEventForEditorOpen } from 'vs/workbench/parts/search/browser/searchActions';
import { FileMatchRenderer, FolderMatchRenderer, MatchRenderer, SearchDelegate, SearchAccessibilityProvider } from 'vs/workbench/parts/search/browser/searchResultsView';
import { ISearchWidgetOptions, SearchWidget } from 'vs/workbench/parts/search/browser/searchWidget';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { ITextQueryBuilderOptions, QueryBuilder } from 'vs/workbench/parts/search/common/queryBuilder';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import { getOutOfWorkspaceEditorResources } from 'vs/workbench/parts/search/common/search';
import { FileMatch, FileMatchOrMatch, FolderMatch, IChangeEvent, ISearchWorkbenchService, Match, RenderableMatch, SearchModel, SearchResult, searchMatchComparer } from 'vs/workbench/parts/search/common/searchModel';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPreferencesService, ISettingsEditorOptions } from 'vs/workbench/services/preferences/common/preferences';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ResourceLabels } from 'vs/workbench/browser/labels';

const $ = dom.$;

function createResultIterator(searchResult: SearchResult, collapseResults: ISearchConfigurationProperties['collapseResults']): Iterator<ITreeElement<RenderableMatch>> {
	const folderMatches = searchResult.folderMatches()
		.filter(fm => !fm.isEmpty())
		.sort(searchMatchComparer);

	if (folderMatches.length === 1) {
		return createFolderIterator(folderMatches[0], collapseResults);
	}

	const foldersIt = Iterator.fromArray(folderMatches);
	return Iterator.map(foldersIt, folderMatch => {
		const children = createFolderIterator(folderMatch, collapseResults);
		return <ITreeElement<RenderableMatch>>{ element: folderMatch, children };
	});
}

function createFolderIterator(folderMatch: FolderMatch, collapseResults: ISearchConfigurationProperties['collapseResults']): Iterator<ITreeElement<RenderableMatch>> {
	const filesIt = Iterator.fromArray(
		folderMatch.matches()
			.sort(searchMatchComparer));

	return Iterator.map(filesIt, fileMatch => {
		const children = createFileIterator(fileMatch);

		const collapsed = collapseResults === 'alwaysCollapse' || (fileMatch.matches().length > 10 && collapseResults !== 'alwaysExpand');

		return <ITreeElement<RenderableMatch>>{ element: fileMatch, children, collapsed };
	});
}

function createFileIterator(fileMatch: FileMatch): Iterator<ITreeElement<RenderableMatch>> {
	const matchesIt = Iterator.from(
		fileMatch.matches()
			.sort(searchMatchComparer));
	return Iterator.map(matchesIt, r => (<ITreeElement<RenderableMatch>>{ element: r }));
}

export function createIterator(match: FolderMatch | FileMatch | SearchResult, collapseResults: ISearchConfigurationProperties['collapseResults']): Iterator<ITreeElement<RenderableMatch>> {
	return match instanceof SearchResult ? createResultIterator(match, collapseResults) :
		match instanceof FolderMatch ? createFolderIterator(match, collapseResults) :
			createFileIterator(match);
}

export class SearchView extends Viewlet implements IViewlet, IPanel {

	private static readonly MAX_TEXT_RESULTS = 10000;

	private static readonly WIDE_CLASS_NAME = 'wide';
	private static readonly WIDE_VIEW_SIZE = 1000;
	private static readonly ACTIONS_RIGHT_CLASS_NAME = 'actions-right';

	private isDisposed: boolean;

	private queryBuilder: QueryBuilder;
	private viewModel: SearchModel;

	private viewletVisible: IContextKey<boolean>;
	private viewletFocused: IContextKey<boolean>;
	private inputBoxFocused: IContextKey<boolean>;
	private inputPatternIncludesFocused: IContextKey<boolean>;
	private inputPatternExclusionsFocused: IContextKey<boolean>;
	private firstMatchFocused: IContextKey<boolean>;
	private fileMatchOrMatchFocused: IContextKey<boolean>;
	private fileMatchOrFolderMatchFocus: IContextKey<boolean>;
	private fileMatchFocused: IContextKey<boolean>;
	private folderMatchFocused: IContextKey<boolean>;
	private matchFocused: IContextKey<boolean>;
	private hasSearchResultsKey: IContextKey<boolean>;

	private searchSubmitted: boolean;
	private searching: boolean;

	private actions: Array<CollapseDeepestExpandedLevelAction | ClearSearchResultsAction> = [];
	private cancelAction: CancelSearchAction;
	private refreshAction: RefreshAction;
	private contextMenu: IMenu;

	private tree: WorkbenchObjectTree<RenderableMatch>;
	private treeLabels: ResourceLabels;
	private viewletState: object;
	private globalMemento: object;
	private messagesElement: HTMLElement;
	private messageDisposables: IDisposable[] = [];
	private searchWidgetsContainerElement: HTMLElement;
	private searchWidget: SearchWidget;
	private size: dom.Dimension;
	private queryDetails: HTMLElement;
	private toggleQueryDetailsButton: HTMLElement;
	private inputPatternExcludes: ExcludePatternInputWidget;
	private inputPatternIncludes: PatternInputWidget;
	private resultsElement: HTMLElement;

	private currentSelectedFileMatch: FileMatch;

	private readonly selectCurrentMatchEmitter: Emitter<string>;
	private delayedRefresh: Delayer<void>;
	private changedWhileHidden: boolean;

	private searchWithoutFolderMessageElement: HTMLElement;

	private currentSearchQ = Promise.resolve<void>();

	constructor(
		@IPartService partService: IPartService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IFileService private readonly fileService: IFileService,
		@IEditorService private readonly editorService: IEditorService,
		@IProgressService private readonly progressService: IProgressService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IStorageService storageService: IStorageService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ISearchWorkbenchService private readonly searchWorkbenchService: ISearchWorkbenchService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IReplaceService private readonly replaceService: IReplaceService,
		@IUntitledEditorService private readonly untitledEditorService: IUntitledEditorService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IThemeService protected themeService: IThemeService,
		@ISearchHistoryService private readonly searchHistoryService: ISearchHistoryService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService
	) {
		super(VIEW_ID, configurationService, partService, telemetryService, themeService, storageService);

		this.viewletVisible = Constants.SearchViewVisibleKey.bindTo(contextKeyService);
		this.viewletFocused = Constants.SearchViewFocusedKey.bindTo(contextKeyService);
		this.inputBoxFocused = Constants.InputBoxFocusedKey.bindTo(this.contextKeyService);
		this.inputPatternIncludesFocused = Constants.PatternIncludesFocusedKey.bindTo(this.contextKeyService);
		this.inputPatternExclusionsFocused = Constants.PatternExcludesFocusedKey.bindTo(this.contextKeyService);
		this.firstMatchFocused = Constants.FirstMatchFocusKey.bindTo(contextKeyService);
		this.fileMatchOrMatchFocused = Constants.FileMatchOrMatchFocusKey.bindTo(contextKeyService);
		this.fileMatchOrFolderMatchFocus = Constants.FileMatchOrFolderMatchFocusKey.bindTo(contextKeyService);
		this.fileMatchFocused = Constants.FileFocusKey.bindTo(contextKeyService);
		this.folderMatchFocused = Constants.FolderFocusKey.bindTo(contextKeyService);
		this.matchFocused = Constants.MatchFocusKey.bindTo(this.contextKeyService);
		this.hasSearchResultsKey = Constants.HasSearchResults.bindTo(this.contextKeyService);

		this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
		this.viewletState = this.getMemento(StorageScope.WORKSPACE);
		this.globalMemento = this.getMemento(StorageScope.GLOBAL);

		this._register(this.fileService.onFileChanges(e => this.onFilesChanged(e)));
		this._register(this.untitledEditorService.onDidChangeDirty(e => this.onUntitledDidChangeDirty(e)));
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.onDidChangeWorkbenchState()));
		this._register(this.searchHistoryService.onDidClearHistory(() => this.clearHistory()));

		this.selectCurrentMatchEmitter = this._register(new Emitter<string>());
		this._register(Event.debounce(this.selectCurrentMatchEmitter.event, (l, e) => e, 100, /*leading=*/true)
			(() => this.selectCurrentMatch()));

		this.delayedRefresh = this._register(new Delayer<void>(250));

	}

	get searchResult(): SearchResult {
		return this.viewModel && this.viewModel.searchResult;
	}

	private onDidChangeWorkbenchState(): void {
		if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.searchWithoutFolderMessageElement) {
			dom.hide(this.searchWithoutFolderMessageElement);
		}
	}

	create(parent: HTMLElement): void {
		super.create(parent);

		this.viewModel = this._register(this.searchWorkbenchService.searchModel);
		dom.addClass(parent, 'search-view');

		this.searchWidgetsContainerElement = dom.append(parent, $('.search-widgets-container'));
		this.createSearchWidget(this.searchWidgetsContainerElement);

		const history = this.searchHistoryService.load();
		const filePatterns = this.viewletState['query.filePatterns'] || '';
		const patternExclusions = this.viewletState['query.folderExclusions'] || '';
		const patternExclusionsHistory: string[] = history.exclude || [];
		const patternIncludes = this.viewletState['query.folderIncludes'] || '';
		const patternIncludesHistory: string[] = history.include || [];
		const queryDetailsExpanded = this.viewletState['query.queryDetailsExpanded'] || '';
		const useExcludesAndIgnoreFiles = typeof this.viewletState['query.useExcludesAndIgnoreFiles'] === 'boolean' ?
			this.viewletState['query.useExcludesAndIgnoreFiles'] : true;

		this.queryDetails = dom.append(this.searchWidgetsContainerElement, $('.query-details'));

		// Toggle query details button
		this.toggleQueryDetailsButton = dom.append(this.queryDetails,
			$('.more', { tabindex: 0, role: 'button', title: nls.localize('moreSearch', "Toggle Search Details") }));

		this._register(dom.addDisposableListener(this.toggleQueryDetailsButton, dom.EventType.CLICK, e => {
			dom.EventHelper.stop(e);
			this.toggleQueryDetails(!this.isScreenReaderOptimized());
		}));
		this._register(dom.addDisposableListener(this.toggleQueryDetailsButton, dom.EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e);
				this.toggleQueryDetails(false);
			}
		}));
		this._register(dom.addDisposableListener(this.toggleQueryDetailsButton, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			if (event.equals(KeyMod.Shift | KeyCode.Tab)) {
				if (this.searchWidget.isReplaceActive()) {
					this.searchWidget.focusReplaceAllAction();
				} else {
					this.searchWidget.focusRegexAction();
				}
				dom.EventHelper.stop(e);
			}
		}));

		// folder includes list
		const folderIncludesList = dom.append(this.queryDetails,
			$('.file-types.includes'));
		const filesToIncludeTitle = nls.localize('searchScope.includes', "files to include");
		dom.append(folderIncludesList, $('h4', undefined, filesToIncludeTitle));

		this.inputPatternIncludes = this._register(this.instantiationService.createInstance(PatternInputWidget, folderIncludesList, this.contextViewService, {
			ariaLabel: nls.localize('label.includes', 'Search Include Patterns'),
			history: patternIncludesHistory,
		}));

		this.inputPatternIncludes.setValue(patternIncludes);

		this.inputPatternIncludes.onSubmit(() => this.onQueryChanged(true));
		this.inputPatternIncludes.onCancel(() => this.viewModel.cancelSearch()); // Cancel search without focusing the search widget
		this.trackInputBox(this.inputPatternIncludes.inputFocusTracker, this.inputPatternIncludesFocused);

		// excludes list
		const excludesList = dom.append(this.queryDetails, $('.file-types.excludes'));
		const excludesTitle = nls.localize('searchScope.excludes', "files to exclude");
		dom.append(excludesList, $('h4', undefined, excludesTitle));
		this.inputPatternExcludes = this._register(this.instantiationService.createInstance(ExcludePatternInputWidget, excludesList, this.contextViewService, {
			ariaLabel: nls.localize('label.excludes', 'Search Exclude Patterns'),
			history: patternExclusionsHistory,
		}));

		this.inputPatternExcludes.setValue(patternExclusions);
		this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(useExcludesAndIgnoreFiles);

		this.inputPatternExcludes.onSubmit(() => this.onQueryChanged(true));
		this.inputPatternExcludes.onCancel(() => this.viewModel.cancelSearch()); // Cancel search without focusing the search widget
		this.trackInputBox(this.inputPatternExcludes.inputFocusTracker, this.inputPatternExclusionsFocused);

		this.messagesElement = dom.append(parent, $('.messages'));
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.showSearchWithoutFolderMessage();
		}

		this.createSearchResultsView(parent);

		this.actions = [
			this._register(this.instantiationService.createInstance(ClearSearchResultsAction, ClearSearchResultsAction.ID, ClearSearchResultsAction.LABEL)),
			this._register(this.instantiationService.createInstance(CollapseDeepestExpandedLevelAction, CollapseDeepestExpandedLevelAction.ID, CollapseDeepestExpandedLevelAction.LABEL))
		];
		this.refreshAction = this._register(this.instantiationService.createInstance(RefreshAction, RefreshAction.ID, RefreshAction.LABEL));
		this.cancelAction = this._register(this.instantiationService.createInstance(CancelSearchAction, CancelSearchAction.ID, CancelSearchAction.LABEL));

		if (filePatterns !== '' || patternExclusions !== '' || patternIncludes !== '' || queryDetailsExpanded !== '' || !useExcludesAndIgnoreFiles) {
			this.toggleQueryDetails(true, true, true);
		}

		this._register(this.viewModel.searchResult.onChange((event) => this.onSearchResultsChanged(event)));

		this._register(this.searchWidget.searchInput.onInput(() => this.updateActions()));
		this._register(this.searchWidget.replaceInput.onDidChange(() => this.updateActions()));
		this._register(this.searchIncludePattern.inputBox.onDidChange(() => this.updateActions()));
		this._register(this.searchExcludePattern.inputBox.onDidChange(() => this.updateActions()));

		this._register(this.onDidFocus(() => this.viewletFocused.set(true)));
		this._register(this.onDidBlur(() => this.viewletFocused.set(false)));

		this._register(this.onDidChangeVisibility(visible => this.onVisibilityChanged(visible)));
	}

	private onVisibilityChanged(visible: boolean): void {
		this.viewletVisible.set(visible);
		if (visible) {
			if (this.changedWhileHidden) {
				// Render if results changed while viewlet was hidden - #37818
				this.refreshAndUpdateCount();
				this.changedWhileHidden = false;
			}
		}

		// Enable highlights if there are searchresults
		if (this.viewModel) {
			this.viewModel.searchResult.toggleHighlights(visible);
		}

		// Open focused element from results in case the editor area is otherwise empty
		if (visible && !this.editorService.activeEditor) {
			const focus = this.tree.getFocus();
			if (focus) {
				this.onFocus(focus, true);
			}
		}
	}

	get searchAndReplaceWidget(): SearchWidget {
		return this.searchWidget;
	}

	get searchIncludePattern(): PatternInputWidget {
		return this.inputPatternIncludes;
	}

	get searchExcludePattern(): PatternInputWidget {
		return this.inputPatternExcludes;
	}

	private updateActions(): void {
		for (const action of this.actions) {
			action.update();
			this.refreshAction.update();
			this.cancelAction.update();
		}
	}

	private isScreenReaderOptimized() {
		const detected = browser.getAccessibilitySupport() === env.AccessibilitySupport.Enabled;
		const config = this.configurationService.getValue<IEditorOptions>('editor').accessibilitySupport;
		return config === 'on' || (config === 'auto' && detected);
	}

	private createSearchWidget(container: HTMLElement): void {
		const contentPattern = this.viewletState['query.contentPattern'] || '';
		const replaceText = this.viewletState['query.replaceText'] || '';
		const isRegex = this.viewletState['query.regex'] === true;
		const isWholeWords = this.viewletState['query.wholeWords'] === true;
		const isCaseSensitive = this.viewletState['query.caseSensitive'] === true;
		const history = this.searchHistoryService.load();
		const searchHistory = history.search || this.viewletState['query.searchHistory'] || [];
		const replaceHistory = history.replace || this.viewletState['query.replaceHistory'] || [];
		const showReplace = typeof this.viewletState['view.showReplace'] === 'boolean' ? this.viewletState['view.showReplace'] : true;

		this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, container, <ISearchWidgetOptions>{
			value: contentPattern,
			replaceValue: replaceText,
			isRegex: isRegex,
			isCaseSensitive: isCaseSensitive,
			isWholeWords: isWholeWords,
			searchHistory: searchHistory,
			replaceHistory: replaceHistory
		}));

		if (showReplace) {
			this.searchWidget.toggleReplace(true);
		}

		this._register(this.searchWidget.onSearchSubmit(() => this.onQueryChanged()));
		this._register(this.searchWidget.onSearchCancel(() => this.cancelSearch()));
		this._register(this.searchWidget.searchInput.onDidOptionChange(() => this.onQueryChanged(true)));

		this._register(this.searchWidget.onDidHeightChange(() => this.reLayout()));

		this._register(this.searchWidget.onReplaceToggled(() => this.reLayout()));
		this._register(this.searchWidget.onReplaceStateChange((state) => {
			this.viewModel.replaceActive = state;
			this.refreshTree();
		}));
		this._register(this.searchWidget.onReplaceValueChanged((value) => {
			this.viewModel.replaceString = this.searchWidget.getReplaceValue();
			this.delayedRefresh.trigger(() => this.refreshTree());
		}));

		this._register(this.searchWidget.onBlur(() => {
			this.toggleQueryDetailsButton.focus();
		}));

		this._register(this.searchWidget.onReplaceAll(() => this.replaceAll()));

		this.trackInputBox(this.searchWidget.searchInputFocusTracker);
		this.trackInputBox(this.searchWidget.replaceInputFocusTracker);
	}

	private trackInputBox(inputFocusTracker: dom.IFocusTracker, contextKey?: IContextKey<boolean>): void {
		this._register(inputFocusTracker.onDidFocus(() => {
			this.inputBoxFocused.set(true);
			if (contextKey) {
				contextKey.set(true);
			}
		}));
		this._register(inputFocusTracker.onDidBlur(() => {
			this.inputBoxFocused.set(this.searchWidget.searchInputHasFocus()
				|| this.searchWidget.replaceInputHasFocus()
				|| this.inputPatternIncludes.inputHasFocus()
				|| this.inputPatternExcludes.inputHasFocus());
			if (contextKey) {
				contextKey.set(false);
			}
		}));
	}

	private onSearchResultsChanged(event?: IChangeEvent): void {
		if (this.isVisible()) {
			return this.refreshAndUpdateCount(event);
		} else {
			this.changedWhileHidden = true;
		}
	}

	private refreshAndUpdateCount(event?: IChangeEvent): void {
		this.searchWidget.setReplaceAllActionState(!this.viewModel.searchResult.isEmpty());
		this.updateSearchResultCount(this.viewModel.searchResult.query.userDisabledExcludesAndIgnoreFiles);
		return this.refreshTree(event);
	}

	refreshTree(event?: IChangeEvent): void {
		const collapseResults = this.configurationService.getValue<ISearchConfigurationProperties>('search').collapseResults;
		if (!event || event.added || event.removed) {
			this.tree.setChildren(null, createResultIterator(this.viewModel.searchResult, collapseResults));
		} else {
			event.elements.forEach(element => {
				if (element instanceof FolderMatch) {
					// The folder may or may not be in the tree. Refresh the whole thing.
					this.tree.setChildren(null, createResultIterator(this.viewModel.searchResult, collapseResults));
					return;
				}

				const root = element instanceof SearchResult ? null : element;
				this.tree.setChildren(root, createIterator(element, collapseResults));
			});
		}
	}

	private replaceAll(): void {
		if (this.viewModel.searchResult.count() === 0) {
			return;
		}

		const progressRunner = this.progressService.show(100);

		const occurrences = this.viewModel.searchResult.count();
		const fileCount = this.viewModel.searchResult.fileCount();
		const replaceValue = this.searchWidget.getReplaceValue() || '';
		const afterReplaceAllMessage = this.buildAfterReplaceAllMessage(occurrences, fileCount, replaceValue);

		const confirmation: IConfirmation = {
			title: nls.localize('replaceAll.confirmation.title', "Replace All"),
			message: this.buildReplaceAllConfirmationMessage(occurrences, fileCount, replaceValue),
			primaryButton: nls.localize('replaceAll.confirm.button', "&&Replace"),
			type: 'question'
		};

		this.dialogService.confirm(confirmation).then(res => {
			if (res.confirmed) {
				this.searchWidget.setReplaceAllActionState(false);
				this.viewModel.searchResult.replaceAll(progressRunner).then(() => {
					progressRunner.done();
					const messageEl = this.clearMessage();
					dom.append(messageEl, $('p', undefined, afterReplaceAllMessage));
				}, (error) => {
					progressRunner.done();
					errors.isPromiseCanceledError(error);
					this.notificationService.error(error);
				});
			}
		});
	}

	private buildAfterReplaceAllMessage(occurrences: number, fileCount: number, replaceValue?: string) {
		if (occurrences === 1) {
			if (fileCount === 1) {
				if (replaceValue) {
					return nls.localize('replaceAll.occurrence.file.message', "Replaced {0} occurrence across {1} file with '{2}'.", occurrences, fileCount, replaceValue);
				}

				return nls.localize('removeAll.occurrence.file.message', "Replaced {0} occurrence across {1} file'.", occurrences, fileCount);
			}

			if (replaceValue) {
				return nls.localize('replaceAll.occurrence.files.message', "Replaced {0} occurrence across {1} files with '{2}'.", occurrences, fileCount, replaceValue);
			}

			return nls.localize('removeAll.occurrence.files.message', "Replaced {0} occurrence across {1} files.", occurrences, fileCount);
		}

		if (fileCount === 1) {
			if (replaceValue) {
				return nls.localize('replaceAll.occurrences.file.message', "Replaced {0} occurrences across {1} file with '{2}'.", occurrences, fileCount, replaceValue);
			}

			return nls.localize('removeAll.occurrences.file.message', "Replaced {0} occurrences across {1} file'.", occurrences, fileCount);
		}

		if (replaceValue) {
			return nls.localize('replaceAll.occurrences.files.message', "Replaced {0} occurrences across {1} files with '{2}'.", occurrences, fileCount, replaceValue);
		}

		return nls.localize('removeAll.occurrences.files.message', "Replaced {0} occurrences across {1} files.", occurrences, fileCount);
	}

	private buildReplaceAllConfirmationMessage(occurrences: number, fileCount: number, replaceValue?: string) {
		if (occurrences === 1) {
			if (fileCount === 1) {
				if (replaceValue) {
					return nls.localize('removeAll.occurrence.file.confirmation.message', "Replace {0} occurrence across {1} file with '{2}'?", occurrences, fileCount, replaceValue);
				}

				return nls.localize('replaceAll.occurrence.file.confirmation.message', "Replace {0} occurrence across {1} file'?", occurrences, fileCount);
			}

			if (replaceValue) {
				return nls.localize('removeAll.occurrence.files.confirmation.message', "Replace {0} occurrence across {1} files with '{2}'?", occurrences, fileCount, replaceValue);
			}

			return nls.localize('replaceAll.occurrence.files.confirmation.message', "Replace {0} occurrence across {1} files?", occurrences, fileCount);
		}

		if (fileCount === 1) {
			if (replaceValue) {
				return nls.localize('removeAll.occurrences.file.confirmation.message', "Replace {0} occurrences across {1} file with '{2}'?", occurrences, fileCount, replaceValue);
			}

			return nls.localize('replaceAll.occurrences.file.confirmation.message', "Replace {0} occurrences across {1} file'?", occurrences, fileCount);
		}

		if (replaceValue) {
			return nls.localize('removeAll.occurrences.files.confirmation.message', "Replace {0} occurrences across {1} files with '{2}'?", occurrences, fileCount, replaceValue);
		}

		return nls.localize('replaceAll.occurrences.files.confirmation.message', "Replace {0} occurrences across {1} files?", occurrences, fileCount);
	}

	private clearMessage(): HTMLElement {
		this.searchWithoutFolderMessageElement = undefined;

		dom.clearNode(this.messagesElement);
		dom.show(this.messagesElement);
		dispose(this.messageDisposables);
		this.messageDisposables = [];

		return dom.append(this.messagesElement, $('.message'));
	}

	private createSearchResultsView(container: HTMLElement): void {
		this.resultsElement = dom.append(container, $('.results.show-file-icons'));
		const delegate = this.instantiationService.createInstance(SearchDelegate);

		const identityProvider: IIdentityProvider<RenderableMatch> = {
			getId(element: RenderableMatch) {
				return element.id();
			}
		};

		this.treeLabels = this._register(this.instantiationService.createInstance(ResourceLabels, this));
		this.tree = this._register(<WorkbenchObjectTree<RenderableMatch, any>>this.instantiationService.createInstance(WorkbenchObjectTree,
			this.resultsElement,
			delegate,
			[
				this._register(this.instantiationService.createInstance(FolderMatchRenderer, this.viewModel, this, this.treeLabels)),
				this._register(this.instantiationService.createInstance(FileMatchRenderer, this.viewModel, this, this.treeLabels)),
				this._register(this.instantiationService.createInstance(MatchRenderer, this.viewModel, this)),
			],
			{
				identityProvider,
				accessibilityProvider: this.instantiationService.createInstance(SearchAccessibilityProvider, this.viewModel)
			}));
		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));

		const resourceNavigator = this._register(new TreeResourceNavigator2(this.tree, { openOnFocus: true }));
		this._register(Event.debounce(resourceNavigator.openResource, (last, event) => event, 75, true)(options => {
			if (options.element instanceof Match) {
				const selectedMatch: Match = options.element;
				if (this.currentSelectedFileMatch) {
					this.currentSelectedFileMatch.setSelectedMatch(null);
				}
				this.currentSelectedFileMatch = selectedMatch.parent();
				this.currentSelectedFileMatch.setSelectedMatch(selectedMatch);

				this.onFocus(selectedMatch, options.editorOptions.preserveFocus, options.sideBySide, options.editorOptions.pinned);
			}
		}));

		this._register(Event.any<any>(this.tree.onDidFocus, this.tree.onDidChangeFocus)(() => {
			if (this.tree.isDOMFocused()) {
				const focus = this.tree.getFocus()[0];
				this.firstMatchFocused.set(this.tree.navigate().first() === focus);
				this.fileMatchOrMatchFocused.set(!!focus);
				this.fileMatchFocused.set(focus instanceof FileMatch);
				this.folderMatchFocused.set(focus instanceof FolderMatch);
				this.matchFocused.set(focus instanceof Match);
				this.fileMatchOrFolderMatchFocus.set(focus instanceof FileMatch || focus instanceof FolderMatch);
			}
		}));

		this._register(this.tree.onDidBlur(e => {
			this.firstMatchFocused.reset();
			this.fileMatchOrMatchFocused.reset();
			this.fileMatchFocused.reset();
			this.folderMatchFocused.reset();
			this.matchFocused.reset();
			this.fileMatchOrFolderMatchFocus.reset();
		}));
	}

	private onContextMenu(e: ITreeContextMenuEvent<RenderableMatch>): void {
		if (!e.element) {
			return;
		}

		if (!this.contextMenu) {
			this.contextMenu = this._register(this.menuService.createMenu(MenuId.SearchContext, this.contextKeyService));
		}

		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => {
				const actions: IAction[] = [];
				fillInContextMenuActions(this.contextMenu, { shouldForwardArgs: true }, actions, this.contextMenuService);
				return actions;
			},
			getActionsContext: () => e.element
		});
	}

	selectCurrentMatch(): void {
		const focused = this.tree.getFocus()[0];
		const fakeKeyboardEvent = getKeyboardEventForEditorOpen({ preserveFocus: false });
		this.tree.setSelection([focused], fakeKeyboardEvent);
	}

	selectNextMatch(): void {
		const [selected]: RenderableMatch[] = this.tree.getSelection();

		// Expand the initial selected node, if needed
		if (selected instanceof FileMatch) {
			if (this.tree.isCollapsed(selected)) {
				this.tree.expand(selected);
			}
		}

		let navigator = this.tree.navigate(selected);

		let next = navigator.next();
		if (!next) {
			// Reached the end - get a new navigator from the root.
			navigator = this.tree.navigate();
			next = navigator.first();
		}

		// Expand and go past FileMatch nodes
		while (!(next instanceof Match)) {
			if (this.tree.isCollapsed(next)) {
				this.tree.expand(next);
			}

			// Select the FileMatch's first child
			next = navigator.next();
		}

		// Reveal the newly selected element
		if (next) {
			this.tree.setFocus([next]);
			this.tree.setSelection([next]);
			this.tree.reveal(next);
			this.selectCurrentMatchEmitter.fire(undefined);
		}
	}

	selectPreviousMatch(): void {
		const [selected]: RenderableMatch[] = this.tree.getSelection();
		let navigator = this.tree.navigate(selected);

		let prev = navigator.previous();

		// Expand and go past FileMatch nodes
		if (!(prev instanceof Match)) {
			prev = navigator.previous();
			if (!prev) {
				// Wrap around
				prev = navigator.last();

				// This is complicated because .last will set the navigator to the last FileMatch,
				// so expand it and FF to its last child
				this.tree.expand(prev);
				let tmp: RenderableMatch;
				while (tmp = navigator.next()) {
					prev = tmp;
				}
			}

			if (!(prev instanceof Match)) {
				// There is a second non-Match result, which must be a collapsed FileMatch.
				// Expand it then select its last child.
				const nextItem = navigator.next();
				this.tree.expand(prev);
				navigator = this.tree.navigate(nextItem); // recreate navigator because modifying the tree can invalidate it
				prev = navigator.previous();
			}
		}

		// Reveal the newly selected element
		if (prev) {
			this.tree.setFocus([prev]);
			this.tree.setSelection([prev]);
			this.tree.reveal(prev);
			this.selectCurrentMatchEmitter.fire(undefined);
		}
	}

	moveFocusToResults(): void {
		this.tree.domFocus();
	}

	focus(): void {
		super.focus();

		const updatedText = this.updateTextFromSelection();
		this.searchWidget.focus(undefined, undefined, updatedText);
	}

	updateTextFromSelection(allowUnselectedWord = true): boolean {
		let updatedText = false;
		const seedSearchStringFromSelection = this.configurationService.getValue<IEditorOptions>('editor').find.seedSearchStringFromSelection;
		if (seedSearchStringFromSelection) {
			let selectedText = this.getSearchTextFromEditor(allowUnselectedWord);
			if (selectedText) {
				if (this.searchWidget.searchInput.getRegex()) {
					selectedText = strings.escapeRegExpCharacters(selectedText);
				}

				this.searchWidget.searchInput.setValue(selectedText);
				updatedText = true;
			}
		}

		return updatedText;
	}

	focusNextInputBox(): void {
		if (this.searchWidget.searchInputHasFocus()) {
			if (this.searchWidget.isReplaceShown()) {
				this.searchWidget.focus(true, true);
			} else {
				this.moveFocusFromSearchOrReplace();
			}
			return;
		}

		if (this.searchWidget.replaceInputHasFocus()) {
			this.moveFocusFromSearchOrReplace();
			return;
		}

		if (this.inputPatternIncludes.inputHasFocus()) {
			this.inputPatternExcludes.focus();
			this.inputPatternExcludes.select();
			return;
		}

		if (this.inputPatternExcludes.inputHasFocus()) {
			this.selectTreeIfNotSelected();
			return;
		}
	}

	private moveFocusFromSearchOrReplace() {
		if (this.showsFileTypes()) {
			this.toggleQueryDetails(true, this.showsFileTypes());
		} else {
			this.selectTreeIfNotSelected();
		}
	}

	focusPreviousInputBox(): void {
		if (this.searchWidget.searchInputHasFocus()) {
			return;
		}

		if (this.searchWidget.replaceInputHasFocus()) {
			this.searchWidget.focus(true);
			return;
		}

		if (this.inputPatternIncludes.inputHasFocus()) {
			this.searchWidget.focus(true, true);
			return;
		}

		if (this.inputPatternExcludes.inputHasFocus()) {
			this.inputPatternIncludes.focus();
			this.inputPatternIncludes.select();
			return;
		}

		if (this.tree.isDOMFocused()) {
			this.moveFocusFromResults();
			return;
		}
	}

	private moveFocusFromResults(): void {
		if (this.showsFileTypes()) {
			this.toggleQueryDetails(true, true, false, true);
		} else {
			this.searchWidget.focus(true, true);
		}
	}

	private reLayout(): void {
		if (this.isDisposed) {
			return;
		}

		const actionsPosition = this.configurationService.getValue<ISearchConfigurationProperties>('search').actionsPosition;
		dom.toggleClass(this.getContainer(), SearchView.ACTIONS_RIGHT_CLASS_NAME, actionsPosition === 'right');
		dom.toggleClass(this.getContainer(), SearchView.WIDE_CLASS_NAME, this.size.width >= SearchView.WIDE_VIEW_SIZE);

		this.searchWidget.setWidth(this.size.width - 28 /* container margin */);

		this.inputPatternExcludes.setWidth(this.size.width - 28 /* container margin */);
		this.inputPatternIncludes.setWidth(this.size.width - 28 /* container margin */);

		const messagesSize = this.messagesElement.style.display === 'none' ?
			0 :
			dom.getTotalHeight(this.messagesElement);

		const searchResultContainerSize = this.size.height -
			messagesSize -
			dom.getTotalHeight(this.searchWidgetsContainerElement);

		this.resultsElement.style.height = searchResultContainerSize + 'px';

		this.tree.layout(searchResultContainerSize);
	}

	layout(dimension: dom.Dimension): void {
		this.size = dimension;
		this.reLayout();
	}

	getControl() {
		return this.tree;
	}

	isSearchSubmitted(): boolean {
		return this.searchSubmitted;
	}

	isSearching(): boolean {
		return this.searching;
	}

	allSearchFieldsClear(): boolean {
		return this.searchWidget.getReplaceValue() === '' &&
			this.searchWidget.searchInput.getValue() === '' &&
			this.searchIncludePattern.getValue() === '' &&
			this.searchExcludePattern.getValue() === '';
	}

	hasSearchResults(): boolean {
		return !this.viewModel.searchResult.isEmpty();
	}

	clearSearchResults(): void {
		this.viewModel.searchResult.clear();
		this.showEmptyStage();
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.showSearchWithoutFolderMessage();
		}
		this.searchWidget.clear();
		this.searchIncludePattern.setValue('');
		this.searchExcludePattern.setValue('');
		this.viewModel.cancelSearch();
		this.updateActions();
	}

	cancelSearch(): boolean {
		if (this.viewModel.cancelSearch()) {
			this.searchWidget.focus();
			return true;
		}
		return false;
	}

	private selectTreeIfNotSelected(): void {
		if (this.tree.getNode(null)) {
			this.tree.domFocus();
			const selection = this.tree.getSelection();
			if (selection.length === 0) {
				this.tree.focusNext();
			}
		}
	}

	private getSearchTextFromEditor(allowUnselectedWord: boolean): string {
		if (!this.editorService.activeEditor) {
			return null;
		}

		if (dom.isAncestor(document.activeElement, this.getContainer())) {
			return null;
		}

		let activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		if (isDiffEditor(activeTextEditorWidget)) {
			if (activeTextEditorWidget.getOriginalEditor().hasTextFocus()) {
				activeTextEditorWidget = activeTextEditorWidget.getOriginalEditor();
			} else {
				activeTextEditorWidget = activeTextEditorWidget.getModifiedEditor();
			}
		}

		if (!isCodeEditor(activeTextEditorWidget)) {
			return null;
		}

		const range = activeTextEditorWidget.getSelection();
		if (!range) {
			return null;
		}

		if (range.isEmpty() && !this.searchWidget.searchInput.getValue() && allowUnselectedWord) {
			const wordAtPosition = activeTextEditorWidget.getModel().getWordAtPosition(range.getStartPosition());
			if (wordAtPosition) {
				return wordAtPosition.word;
			}
		}

		if (!range.isEmpty()) {
			let searchText = '';
			for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
				let lineText = activeTextEditorWidget.getModel().getLineContent(i);
				if (i === range.endLineNumber) {
					lineText = lineText.substring(0, range.endColumn - 1);
				}

				if (i === range.startLineNumber) {
					lineText = lineText.substring(range.startColumn - 1);
				}

				if (i !== range.startLineNumber) {
					lineText = '\n' + lineText;
				}

				searchText += lineText;
			}

			return searchText;
		}

		return null;
	}

	private showsFileTypes(): boolean {
		return dom.hasClass(this.queryDetails, 'more');
	}

	toggleCaseSensitive(): void {
		this.searchWidget.searchInput.setCaseSensitive(!this.searchWidget.searchInput.getCaseSensitive());
		this.onQueryChanged(true);
	}

	toggleWholeWords(): void {
		this.searchWidget.searchInput.setWholeWords(!this.searchWidget.searchInput.getWholeWords());
		this.onQueryChanged(true);
	}

	toggleRegex(): void {
		this.searchWidget.searchInput.setRegex(!this.searchWidget.searchInput.getRegex());
		this.onQueryChanged(true);
	}

	toggleQueryDetails(moveFocus = true, show?: boolean, skipLayout?: boolean, reverse?: boolean): void {
		const cls = 'more';
		show = typeof show === 'undefined' ? !dom.hasClass(this.queryDetails, cls) : Boolean(show);
		this.viewletState['query.queryDetailsExpanded'] = show;
		skipLayout = Boolean(skipLayout);

		if (show) {
			this.toggleQueryDetailsButton.setAttribute('aria-expanded', 'true');
			dom.addClass(this.queryDetails, cls);
			if (moveFocus) {
				if (reverse) {
					this.inputPatternExcludes.focus();
					this.inputPatternExcludes.select();
				} else {
					this.inputPatternIncludes.focus();
					this.inputPatternIncludes.select();
				}
			}
		} else {
			this.toggleQueryDetailsButton.setAttribute('aria-expanded', 'false');
			dom.removeClass(this.queryDetails, cls);
			if (moveFocus) {
				this.searchWidget.focus();
			}
		}

		if (!skipLayout && this.size) {
			this.layout(this.size);
		}
	}

	searchInFolders(resources: URI[], pathToRelative: (from: string, to: string) => string): void {
		const folderPaths: string[] = [];
		const workspace = this.contextService.getWorkspace();

		if (resources) {
			resources.forEach(resource => {
				let folderPath: string;
				if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
					// Show relative path from the root for single-root mode
					folderPath = paths.normalize(pathToRelative(workspace.folders[0].uri.fsPath, resource.fsPath));
					if (folderPath && folderPath !== '.') {
						folderPath = './' + folderPath;
					}
				} else {
					const owningFolder = this.contextService.getWorkspaceFolder(resource);
					if (owningFolder) {
						const owningRootName = owningFolder.name;

						// If this root is the only one with its basename, use a relative ./ path. If there is another, use an absolute path
						const isUniqueFolder = workspace.folders.filter(folder => folder.name === owningRootName).length === 1;
						if (isUniqueFolder) {
							const relativePath = paths.normalize(pathToRelative(owningFolder.uri.fsPath, resource.fsPath));
							if (relativePath === '.') {
								folderPath = `./${owningFolder.name}`;
							} else {
								folderPath = `./${owningFolder.name}/${relativePath}`;
							}
						} else {
							folderPath = resource.fsPath;
						}
					}
				}

				if (folderPath) {
					folderPaths.push(folderPath);
				}
			});
		}

		if (!folderPaths.length || folderPaths.some(folderPath => folderPath === '.')) {
			this.inputPatternIncludes.setValue('');
			this.searchWidget.focus();
			return;
		}

		// Show 'files to include' box
		if (!this.showsFileTypes()) {
			this.toggleQueryDetails(true, true);
		}

		this.inputPatternIncludes.setValue(folderPaths.join(', '));
		this.searchWidget.focus(false);
	}

	onQueryChanged(preserveFocus?: boolean): void {
		const isRegex = this.searchWidget.searchInput.getRegex();
		const isWholeWords = this.searchWidget.searchInput.getWholeWords();
		const isCaseSensitive = this.searchWidget.searchInput.getCaseSensitive();
		const contentPattern = this.searchWidget.searchInput.getValue();
		const excludePatternText = this.inputPatternExcludes.getValue().trim();
		const includePatternText = this.inputPatternIncludes.getValue().trim();
		const useExcludesAndIgnoreFiles = this.inputPatternExcludes.useExcludesAndIgnoreFiles();

		if (contentPattern.length === 0) {
			return;
		}

		// Validate regex is OK
		if (isRegex) {
			let regExp: RegExp;
			try {
				regExp = new RegExp(contentPattern);
			} catch (e) {
				return; // malformed regex
			}

			if (strings.regExpLeadsToEndlessLoop(regExp)) {
				return; // endless regex
			}
		}

		const content: IPatternInfo = {
			pattern: contentPattern,
			isRegExp: isRegex,
			isCaseSensitive: isCaseSensitive,
			isWordMatch: isWholeWords
		};

		const excludePattern = this.inputPatternExcludes.getValue();
		const includePattern = this.inputPatternIncludes.getValue();

		// Need the full match line to correctly calculate replace text, if this is a search/replace with regex group references ($1, $2, ...).
		// 10000 chars is enough to avoid sending huge amounts of text around, if you do a replace with a longer match, it may or may not resolve the group refs correctly.
		// https://github.com/Microsoft/vscode/issues/58374
		const charsPerLine = content.isRegExp ? 10000 :
			250;

		const options: ITextQueryBuilderOptions = {
			_reason: 'searchView',
			extraFileResources: getOutOfWorkspaceEditorResources(this.editorService, this.contextService),
			maxResults: SearchView.MAX_TEXT_RESULTS,
			disregardIgnoreFiles: !useExcludesAndIgnoreFiles || undefined,
			disregardExcludeSettings: !useExcludesAndIgnoreFiles || undefined,
			excludePattern,
			includePattern,
			previewOptions: {
				matchLines: 1,
				charsPerLine
			},
			isSmartCase: this.configurationService.getValue<ISearchConfiguration>().search.smartCase
		};
		const folderResources = this.contextService.getWorkspace().folders;

		const onQueryValidationError = (err: Error) => {
			this.searchWidget.searchInput.showMessage({ content: err.message, type: MessageType.ERROR });
			this.viewModel.searchResult.clear();
		};

		let query: ITextQuery;
		try {
			query = this.queryBuilder.text(content, folderResources.map(folder => folder.uri), options);
		} catch (err) {
			onQueryValidationError(err);
			return;
		}

		this.validateQuery(query).then(() => {
			this.onQueryTriggered(query, options, excludePatternText, includePatternText);

			if (!preserveFocus) {
				this.searchWidget.focus(false); // focus back to input field
			}
		}, onQueryValidationError);
	}

	private validateQuery(query: ITextQuery): Promise<void> {
		// Validate folderQueries
		const folderQueriesExistP =
			query.folderQueries.map(fq => {
				return this.fileService.existsFile(fq.folder);
			});

		return Promise.resolve(folderQueriesExistP).then(existResults => {
			// If no folders exist, show an error message about the first one
			const existingFolderQueries = query.folderQueries.filter((folderQuery, i) => existResults[i]);
			if (!query.folderQueries.length || existingFolderQueries.length) {
				query.folderQueries = existingFolderQueries;
			} else {
				const nonExistantPath = query.folderQueries[0].folder.fsPath;
				const searchPathNotFoundError = nls.localize('searchPathNotFoundError', "Search path not found: {0}", nonExistantPath);
				return Promise.reject(new Error(searchPathNotFoundError));
			}

			return undefined;
		});
	}

	private onQueryTriggered(query: ITextQuery, options: ITextQueryBuilderOptions, excludePatternText: string, includePatternText: string): void {
		this.searchWidget.searchInput.onSearchSubmit();
		this.inputPatternExcludes.onSearchSubmit();
		this.inputPatternIncludes.onSearchSubmit();

		this.viewModel.cancelSearch();

		this.currentSearchQ = this.currentSearchQ
			.then(() => this.doSearch(query, options, excludePatternText, includePatternText))
			.then(() => { }, () => { });
	}

	private doSearch(query: ITextQuery, options: ITextQueryBuilderOptions, excludePatternText: string, includePatternText: string): Thenable<void> {
		// Progress total is 100.0% for more progress bar granularity
		const progressTotal = 1000;
		let progressWorked = 0;

		const progressRunner = query.useRipgrep ?
			this.progressService.show(/*infinite=*/true) :
			this.progressService.show(progressTotal);

		this.searchWidget.searchInput.clearMessage();
		this.searching = true;
		setTimeout(() => {
			if (this.searching) {
				this.updateActions();
				this.updateTitleArea();
			}
		}, 2000);
		this.showEmptyStage();

		const onComplete = (completed?: ISearchComplete) => {
			this.searching = false;

			// Complete up to 100% as needed
			if (completed && !query.useRipgrep) {
				progressRunner.worked(progressTotal - progressWorked);
				setTimeout(() => progressRunner.done(), 200);
			} else {
				progressRunner.done();
			}

			// Do final render, then expand if just 1 file with less than 50 matches
			this.onSearchResultsChanged();

			const collapseResults = this.configurationService.getValue<ISearchConfigurationProperties>('search').collapseResults;
			if (collapseResults !== 'alwaysCollapse' && this.viewModel.searchResult.matches().length === 1) {
				const onlyMatch = this.viewModel.searchResult.matches()[0];
				if (onlyMatch.count() < 50) {
					this.tree.expand(onlyMatch);
				}
			}

			this.viewModel.replaceString = this.searchWidget.getReplaceValue();

			this.searchSubmitted = true;
			this.updateActions();
			this.updateTitleArea();
			const hasResults = !this.viewModel.searchResult.isEmpty();

			if (completed && completed.limitHit) {
				this.searchWidget.searchInput.showMessage({
					content: nls.localize('searchMaxResultsWarning', "The result set only contains a subset of all matches. Please be more specific in your search to narrow down the results."),
					type: MessageType.WARNING
				});
			}

			if (!hasResults) {
				const hasExcludes = !!excludePatternText;
				const hasIncludes = !!includePatternText;
				let message: string;

				if (!completed) {
					message = nls.localize('searchCanceled', "Search was canceled before any results could be found - ");
				} else if (hasIncludes && hasExcludes) {
					message = nls.localize('noResultsIncludesExcludes', "No results found in '{0}' excluding '{1}' - ", includePatternText, excludePatternText);
				} else if (hasIncludes) {
					message = nls.localize('noResultsIncludes', "No results found in '{0}' - ", includePatternText);
				} else if (hasExcludes) {
					message = nls.localize('noResultsExcludes', "No results found excluding '{0}' - ", excludePatternText);
				} else {
					message = nls.localize('noResultsFound', "No results found. Review your settings for configured exclusions and ignore files - ");
				}

				// Indicate as status to ARIA
				aria.status(message);

				dom.hide(this.resultsElement);

				const messageEl = this.clearMessage();
				const p = dom.append(messageEl, $('p', undefined, message));

				if (!completed) {
					const searchAgainLink = dom.append(p, $('a.pointer.prominent', undefined, nls.localize('rerunSearch.message', "Search again")));
					this.messageDisposables.push(dom.addDisposableListener(searchAgainLink, dom.EventType.CLICK, (e: MouseEvent) => {
						dom.EventHelper.stop(e, false);
						this.onQueryChanged();
					}));
				} else if (hasIncludes || hasExcludes) {
					const searchAgainLink = dom.append(p, $('a.pointer.prominent', { tabindex: 0 }, nls.localize('rerunSearchInAll.message', "Search again in all files")));
					this.messageDisposables.push(dom.addDisposableListener(searchAgainLink, dom.EventType.CLICK, (e: MouseEvent) => {
						dom.EventHelper.stop(e, false);

						this.inputPatternExcludes.setValue('');
						this.inputPatternIncludes.setValue('');

						this.onQueryChanged();
					}));
				} else {
					const openSettingsLink = dom.append(p, $('a.pointer.prominent', { tabindex: 0 }, nls.localize('openSettings.message', "Open Settings")));
					this.addClickEvents(openSettingsLink, this.onOpenSettings);
				}

				if (completed) {
					dom.append(p, $('span', undefined, ' - '));

					const learnMoreLink = dom.append(p, $('a.pointer.prominent', { tabindex: 0 }, nls.localize('openSettings.learnMore', "Learn More")));
					this.addClickEvents(learnMoreLink, this.onLearnMore);
				}

				if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
					this.showSearchWithoutFolderMessage();
				}
			} else {
				this.viewModel.searchResult.toggleHighlights(this.isVisible()); // show highlights

				// Indicate final search result count for ARIA
				aria.status(nls.localize('ariaSearchResultsStatus', "Search returned {0} results in {1} files", this.viewModel.searchResult.count(), this.viewModel.searchResult.fileCount()));
			}
		};

		const onError = (e: any) => {
			if (errors.isPromiseCanceledError(e)) {
				return onComplete(null);
			} else {
				this.searching = false;
				this.updateActions();
				this.updateTitleArea();
				progressRunner.done();
				this.searchWidget.searchInput.showMessage({ content: e.message, type: MessageType.ERROR });
				this.viewModel.searchResult.clear();

				if (e.code === SearchErrorCode.unknownEncoding && !this.configurationService.getValue('search.useLegacySearch')) {
					this.notificationService.prompt(Severity.Info, nls.localize('otherEncodingWarning', "You can enable \"search.useLegacySearch\" to search non-standard file encodings."),
						[{
							label: nls.localize('otherEncodingWarning.openSettingsLabel', "Open Settings"),
							run: () => this.openSettings('search.useLegacySearch')
						}]);
				} else if (e.code === SearchErrorCode.regexParseError && !this.configurationService.getValue('search.usePCRE2')) {
					this.showPcre2Hint();
				}

				return Promise.resolve();
			}
		};

		let total: number = 0;
		let worked: number = 0;
		let visibleMatches = 0;
		const onProgress = (p: ISearchProgressItem) => {
			// Progress
			if ((<IProgress>p).total) {
				total = (<IProgress>p).total;
			}
			if ((<IProgress>p).worked) {
				worked = (<IProgress>p).worked;
			}
		};

		// Handle UI updates in an interval to show frequent progress and results
		const uiRefreshHandle: any = setInterval(() => {
			if (!this.searching) {
				window.clearInterval(uiRefreshHandle);
				return;
			}

			if (!query.useRipgrep) {
				// Progress bar update
				let fakeProgress = true;
				if (total > 0 && worked > 0) {
					const ratio = Math.round((worked / total) * progressTotal);
					if (ratio > progressWorked) { // never show less progress than what we have already
						progressRunner.worked(ratio - progressWorked);
						progressWorked = ratio;
						fakeProgress = false;
					}
				}

				// Fake progress up to 90%, or when actual progress beats it
				const fakeMax = 900;
				const fakeMultiplier = 12;
				if (fakeProgress && progressWorked < fakeMax) {
					// Linearly decrease the rate of fake progress.
					// 1 is the smallest allowed amount of progress.
					const fakeAmt = Math.round((fakeMax - progressWorked) / fakeMax * fakeMultiplier) || 1;
					progressWorked += fakeAmt;
					progressRunner.worked(fakeAmt);
				}
			}

			// Search result tree update
			const fileCount = this.viewModel.searchResult.fileCount();
			if (visibleMatches !== fileCount) {
				visibleMatches = fileCount;
				this.refreshAndUpdateCount();
			}
			if (fileCount > 0) {
				this.updateActions();
			}
		}, 100);

		this.searchWidget.setReplaceAllActionState(false);

		return this.viewModel.search(query, onProgress)
			.then(onComplete, onError);
	}

	private showPcre2Hint(): void {
		if (!this.globalMemento['disablePcre2Hint']) {
			// If the regex parsed in JS but not rg, it likely uses features that are supported in JS and PCRE2 but not Rust
			this.notificationService.prompt(Severity.Info, nls.localize('rgRegexError', "You can enable \"search.usePCRE2\" to enable some extra regex features like lookbehind and backreferences."), [
				{
					label: nls.localize('neverAgain', "Don't Show Again"),
					run: () => this.globalMemento['disablePcre2Hint'] = true,
					isSecondary: true
				},
				{
					label: nls.localize('otherEncodingWarning.openSettingsLabel', "Open Settings"),
					run: () => this.openSettings('search.usePCRE2')
				}
			]);
		}
	}

	private addClickEvents = (element: HTMLElement, handler: (event: any) => void): void => {
		this.messageDisposables.push(dom.addDisposableListener(element, dom.EventType.CLICK, handler));
		this.messageDisposables.push(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			let eventHandled = true;

			if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
				handler(e);
			} else {
				eventHandled = false;
			}

			if (eventHandled) {
				event.preventDefault();
				event.stopPropagation();
			}
		}));
	}

	private onOpenSettings = (e: dom.EventLike): void => {
		dom.EventHelper.stop(e, false);

		this.openSettings('.exclude');
	}

	private openSettings(query: string): Promise<IEditor> {
		const options: ISettingsEditorOptions = { query };
		return this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ?
			this.preferencesService.openWorkspaceSettings(undefined, options) :
			this.preferencesService.openGlobalSettings(undefined, options);
	}

	private onLearnMore = (e: MouseEvent): void => {
		dom.EventHelper.stop(e, false);

		window.open('https://go.microsoft.com/fwlink/?linkid=853977');
	}

	private updateSearchResultCount(disregardExcludesAndIgnores?: boolean): void {
		const fileCount = this.viewModel.searchResult.fileCount();
		this.hasSearchResultsKey.set(fileCount > 0);

		const msgWasHidden = this.messagesElement.style.display === 'none';
		if (fileCount > 0) {
			const messageEl = this.clearMessage();
			let resultMsg = this.buildResultCountMessage(this.viewModel.searchResult.count(), fileCount);
			if (disregardExcludesAndIgnores) {
				resultMsg += nls.localize('useIgnoresAndExcludesDisabled', " - exclude settings and ignore files are disabled");
			}

			dom.append(messageEl, $('p', undefined, resultMsg));
			this.reLayout();
		} else if (!msgWasHidden) {
			dom.hide(this.messagesElement);
		}
	}

	private buildResultCountMessage(resultCount: number, fileCount: number): string {
		if (resultCount === 1 && fileCount === 1) {
			return nls.localize('search.file.result', "{0} result in {1} file", resultCount, fileCount);
		} else if (resultCount === 1) {
			return nls.localize('search.files.result', "{0} result in {1} files", resultCount, fileCount);
		} else if (fileCount === 1) {
			return nls.localize('search.file.results', "{0} results in {1} file", resultCount, fileCount);
		} else {
			return nls.localize('search.files.results', "{0} results in {1} files", resultCount, fileCount);
		}
	}

	private showSearchWithoutFolderMessage(): void {
		this.searchWithoutFolderMessageElement = this.clearMessage();

		const textEl = dom.append(this.searchWithoutFolderMessageElement,
			$('p', undefined, nls.localize('searchWithoutFolder', "You have not yet opened a folder. Only open files are currently searched - ")));

		const openFolderLink = dom.append(textEl,
			$('a.pointer.prominent', { tabindex: 0 }, nls.localize('openFolder', "Open Folder")));

		this.messageDisposables.push(dom.addDisposableListener(openFolderLink, dom.EventType.CLICK, (e: MouseEvent) => {
			dom.EventHelper.stop(e, false);

			const actionClass = env.isMacintosh ? OpenFileFolderAction : OpenFolderAction;
			const action = this.instantiationService.createInstance<string, string, IAction>(actionClass, actionClass.ID, actionClass.LABEL);
			this.actionRunner.run(action).then(() => {
				action.dispose();
			}, err => {
				action.dispose();
				errors.onUnexpectedError(err);
			});
		}));
	}

	private showEmptyStage(): void {

		// disable 'result'-actions
		this.searchSubmitted = false;
		this.updateActions();

		// clean up ui
		// this.replaceService.disposeAllReplacePreviews();
		dom.hide(this.messagesElement);
		dom.show(this.resultsElement);
		this.currentSelectedFileMatch = null;
	}

	private onFocus(lineMatch: any, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): Promise<any> {
		if (!(lineMatch instanceof Match)) {
			this.viewModel.searchResult.rangeHighlightDecorations.removeHighlightRange();
			return Promise.resolve(true);
		}

		const useReplacePreview = this.configurationService.getValue<ISearchConfiguration>().search.useReplacePreview;
		return (useReplacePreview && this.viewModel.isReplaceActive() && !!this.viewModel.replaceString) ?
			this.replaceService.openReplacePreview(lineMatch, preserveFocus, sideBySide, pinned) :
			this.open(lineMatch, preserveFocus, sideBySide, pinned);
	}

	open(element: FileMatchOrMatch, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): Promise<any> {
		const selection = this.getSelectionFrom(element);
		const resource = element instanceof Match ? element.parent().resource() : (<FileMatch>element).resource();
		return this.editorService.openEditor({
			resource: resource,
			options: {
				preserveFocus,
				pinned,
				selection,
				revealIfVisible: true
			}
		}, sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then(editor => {
			if (editor && element instanceof Match && preserveFocus) {
				this.viewModel.searchResult.rangeHighlightDecorations.highlightRange(
					(<ICodeEditor>editor.getControl()).getModel(),
					element.range()
				);
			} else {
				this.viewModel.searchResult.rangeHighlightDecorations.removeHighlightRange();
			}

			if (editor) {
				return this.editorGroupsService.activateGroup(editor.group);
			} else {
				return Promise.resolve(null);
			}
		}, errors.onUnexpectedError);
	}

	private getSelectionFrom(element: FileMatchOrMatch): any {
		let match: Match | null = null;
		if (element instanceof Match) {
			match = element;
		}
		if (element instanceof FileMatch && element.count() > 0) {
			match = element.matches()[element.matches().length - 1];
		}
		if (match) {
			const range = match.range();
			if (this.viewModel.isReplaceActive() && !!this.viewModel.replaceString) {
				const replaceString = match.replaceString;
				return {
					startLineNumber: range.startLineNumber,
					startColumn: range.startColumn,
					endLineNumber: range.startLineNumber,
					endColumn: range.startColumn + replaceString.length
				};
			}
			return range;
		}
		return undefined;
	}

	private onUntitledDidChangeDirty(resource: URI): void {
		if (!this.viewModel) {
			return;
		}

		// remove search results from this resource as it got disposed
		if (!this.untitledEditorService.isDirty(resource)) {
			const matches = this.viewModel.searchResult.matches();
			for (let i = 0, len = matches.length; i < len; i++) {
				if (resource.toString() === matches[i].resource().toString()) {
					this.viewModel.searchResult.remove(matches[i]);
				}
			}
		}
	}

	private onFilesChanged(e: FileChangesEvent): void {
		if (!this.viewModel) {
			return;
		}

		const matches = this.viewModel.searchResult.matches();

		for (let i = 0, len = matches.length; i < len; i++) {
			if (e.contains(matches[i].resource(), FileChangeType.DELETED)) {
				this.viewModel.searchResult.remove(matches[i]);
			}
		}
	}

	getActions(): IAction[] {
		return [
			this.searching ?
				this.cancelAction :
				this.refreshAction,
			...this.actions
		];
	}

	private clearHistory(): void {
		this.searchWidget.clearHistory();
		this.inputPatternExcludes.clearHistory();
		this.inputPatternIncludes.clearHistory();
	}

	protected saveState(): void {
		const isRegex = this.searchWidget.searchInput.getRegex();
		const isWholeWords = this.searchWidget.searchInput.getWholeWords();
		const isCaseSensitive = this.searchWidget.searchInput.getCaseSensitive();
		const contentPattern = this.searchWidget.searchInput.getValue();
		const patternExcludes = this.inputPatternExcludes.getValue().trim();
		const patternIncludes = this.inputPatternIncludes.getValue().trim();
		const useExcludesAndIgnoreFiles = this.inputPatternExcludes.useExcludesAndIgnoreFiles();

		this.viewletState['query.contentPattern'] = contentPattern;
		this.viewletState['query.regex'] = isRegex;
		this.viewletState['query.wholeWords'] = isWholeWords;
		this.viewletState['query.caseSensitive'] = isCaseSensitive;
		this.viewletState['query.folderExclusions'] = patternExcludes;
		this.viewletState['query.folderIncludes'] = patternIncludes;
		this.viewletState['query.useExcludesAndIgnoreFiles'] = useExcludesAndIgnoreFiles;

		const isReplaceShown = this.searchAndReplaceWidget.isReplaceShown();
		this.viewletState['view.showReplace'] = isReplaceShown;
		this.viewletState['query.replaceText'] = isReplaceShown && this.searchWidget.getReplaceValue();

		const history: ISearchHistoryValues = Object.create(null);

		const searchHistory = this.searchWidget.getSearchHistory();
		if (searchHistory && searchHistory.length) {
			history.search = searchHistory;
		}

		const replaceHistory = this.searchWidget.getReplaceHistory();
		if (replaceHistory && replaceHistory.length) {
			history.replace = replaceHistory;
		}

		const patternExcludesHistory = this.inputPatternExcludes.getHistory();
		if (patternExcludesHistory && patternExcludesHistory.length) {
			history.exclude = patternExcludesHistory;
		}

		const patternIncludesHistory = this.inputPatternIncludes.getHistory();
		if (patternIncludesHistory && patternIncludesHistory.length) {
			history.include = patternIncludesHistory;
		}

		this.searchHistoryService.save(history);

		super.saveState();
	}

	dispose(): void {
		this.isDisposed = true;

		super.dispose();
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const matchHighlightColor = theme.getColor(editorFindMatchHighlight);
	if (matchHighlightColor) {
		collector.addRule(`.monaco-workbench .search-view .findInFileMatch { background-color: ${matchHighlightColor}; }`);
	}

	const diffInsertedColor = theme.getColor(diffInserted);
	if (diffInsertedColor) {
		collector.addRule(`.monaco-workbench .search-view .replaceMatch { background-color: ${diffInsertedColor}; }`);
	}

	const diffRemovedColor = theme.getColor(diffRemoved);
	if (diffRemovedColor) {
		collector.addRule(`.monaco-workbench .search-view .replace.findInFileMatch { background-color: ${diffRemovedColor}; }`);
	}

	const diffInsertedOutlineColor = theme.getColor(diffInsertedOutline);
	if (diffInsertedOutlineColor) {
		collector.addRule(`.monaco-workbench .search-view .replaceMatch:not(:empty) { border: 1px ${theme.type === 'hc' ? 'dashed' : 'solid'} ${diffInsertedOutlineColor}; }`);
	}

	const diffRemovedOutlineColor = theme.getColor(diffRemovedOutline);
	if (diffRemovedOutlineColor) {
		collector.addRule(`.monaco-workbench .search-view .replace.findInFileMatch { border: 1px ${theme.type === 'hc' ? 'dashed' : 'solid'} ${diffRemovedOutlineColor}; }`);
	}

	const findMatchHighlightBorder = theme.getColor(editorFindMatchHighlightBorder);
	if (findMatchHighlightBorder) {
		collector.addRule(`.monaco-workbench .search-view .findInFileMatch { border: 1px ${theme.type === 'hc' ? 'dashed' : 'solid'} ${findMatchHighlightBorder}; }`);
	}

	const outlineSelectionColor = theme.getColor(listActiveSelectionForeground);
	if (outlineSelectionColor) {
		collector.addRule(`.monaco-workbench .search-view .monaco-tree.focused .monaco-tree-row.focused.selected:not(.highlighted) .action-label:focus { outline-color: ${outlineSelectionColor} }`);
	}
});
