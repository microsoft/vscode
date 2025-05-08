/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { MessageType } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { IIdentityProvider } from '../../../../base/browser/ui/list/list.js';
import { IAsyncDataSource, ITreeContextMenuEvent, ObjectTreeElementCollapseState } from '../../../../base/browser/ui/tree/tree.js';
import { Delayer, RunOnceScheduler, Throttler } from '../../../../base/common/async.js';
import * as errors from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import * as env from '../../../../base/common/platform.js';
import * as strings from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import * as network from '../../../../base/common/network.js';
import './media/searchview.css';
import { getCodeEditor, isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { IEditor } from '../../../../editor/common/editorCommon.js';
import { CommonFindController } from '../../../../editor/contrib/find/browser/findController.js';
import { MultiCursorSelectionController } from '../../../../editor/contrib/multicursor/browser/multicursor.js';
import * as nls from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfirmation, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { getSelectionKeyboardEvent, WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService, withSelection } from '../../../../platform/opener/common/opener.js';
import { IProgress, IProgressService, IProgressStep } from '../../../../platform/progress/common/progress.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { defaultInputBoxStyles, defaultToggleStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IFileIconTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { OpenFileFolderAction, OpenFolderAction } from '../../../browser/actions/workspaceActions.js';
import { ResourceListDnDHandler } from '../../../browser/dnd.js';
import { ResourceLabels } from '../../../browser/labels.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IEditorPane } from '../../../common/editor.js';
import { Memento, MementoObject } from '../../../common/memento.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { NotebookEditor } from '../../notebook/browser/notebookEditor.js';
import { ExcludePatternInputWidget, IncludePatternInputWidget } from './patternInputWidget.js';
import { appendKeyBindingLabel } from './searchActionsBase.js';
import { IFindInFilesArgs } from './searchActionsFind.js';
import { searchDetailsIcon } from './searchIcons.js';
import { renderSearchMessage } from './searchMessage.js';
import { FileMatchRenderer, FolderMatchRenderer, MatchRenderer, SearchAccessibilityProvider, SearchDelegate, TextSearchResultRenderer } from './searchResultsView.js';
import { SearchWidget } from './searchWidget.js';
import * as Constants from '../common/constants.js';
import { IReplaceService } from './replace.js';
import { getOutOfWorkspaceEditorResources, SearchStateKey, SearchUIState } from '../common/search.js';
import { ISearchHistoryService, ISearchHistoryValues, SearchHistoryService } from '../common/searchHistoryService.js';
import { createEditorFromSearchResult } from '../../searchEditor/browser/searchEditorActions.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IPreferencesService, ISettingsEditorOptions } from '../../../services/preferences/common/preferences.js';
import { ITextQueryBuilderOptions, QueryBuilder } from '../../../services/search/common/queryBuilder.js';
import { IPatternInfo, ISearchComplete, ISearchConfiguration, ISearchConfigurationProperties, ISearchService, ITextQuery, SearchCompletionExitCode, SearchSortOrder, TextSearchCompleteMessageType, ViewMode } from '../../../services/search/common/search.js';
import { AISearchKeyword, TextSearchCompleteMessage } from '../../../services/search/common/searchExtTypes.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ISearchViewModelWorkbenchService } from './searchTreeModel/searchViewModelWorkbenchService.js';
import { ISearchTreeMatch, isSearchTreeMatch, RenderableMatch, SearchModelLocation, IChangeEvent, FileMatchOrMatch, ISearchTreeFileMatch, ISearchTreeFolderMatch, ISearchModel, ISearchResult, isSearchTreeFileMatch, isSearchTreeFolderMatch, isSearchTreeFolderMatchNoRoot, isSearchTreeFolderMatchWithResource, isSearchTreeFolderMatchWorkspaceRoot, isSearchResult, isTextSearchHeading, ITextSearchHeading, isSearchHeader } from './searchTreeModel/searchTreeCommon.js';
import { INotebookFileInstanceMatch, isIMatchInNotebook } from './notebookSearch/notebookSearchModelBase.js';
import { searchMatchComparer } from './searchCompare.js';
import { AIFolderMatchWorkspaceRootImpl } from './AISearch/aiSearchModel.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';

const $ = dom.$;

export enum SearchViewPosition {
	SideBar,
	Panel
}

const SEARCH_CANCELLED_MESSAGE = nls.localize('searchCanceled', "Search was canceled before any results could be found - ");
const DEBOUNCE_DELAY = 75;
export class SearchView extends ViewPane {

	private static readonly ACTIONS_RIGHT_CLASS_NAME = 'actions-right';

	private isDisposed = false;

	private container!: HTMLElement;
	private queryBuilder: QueryBuilder;
	private viewModel: ISearchModel;
	private memento: Memento;

	private viewletVisible: IContextKey<boolean>;
	private inputBoxFocused: IContextKey<boolean>;
	private inputPatternIncludesFocused: IContextKey<boolean>;
	private inputPatternExclusionsFocused: IContextKey<boolean>;
	private firstMatchFocused: IContextKey<boolean>;
	private fileMatchOrMatchFocused: IContextKey<boolean>;
	private fileMatchOrFolderMatchFocus: IContextKey<boolean>;
	private fileMatchOrFolderMatchWithResourceFocus: IContextKey<boolean>;
	private fileMatchFocused: IContextKey<boolean>;
	private folderMatchFocused: IContextKey<boolean>;
	private folderMatchWithResourceFocused: IContextKey<boolean>;
	private matchFocused: IContextKey<boolean>;
	private searchResultHeaderFocused: IContextKey<boolean>;
	private isEditableItem: IContextKey<boolean>;
	private hasSearchResultsKey: IContextKey<boolean>;
	private lastFocusState: 'input' | 'tree' = 'input';

	private searchStateKey: IContextKey<SearchUIState>;
	private hasSearchPatternKey: IContextKey<boolean>;
	private hasReplacePatternKey: IContextKey<boolean>;
	private hasFilePatternKey: IContextKey<boolean>;
	private hasSomeCollapsibleResultKey: IContextKey<boolean>;

	private tree!: WorkbenchCompressibleAsyncDataTree<ISearchResult, RenderableMatch>;
	private treeLabels!: ResourceLabels;
	private viewletState: MementoObject;
	private messagesElement!: HTMLElement;
	private readonly messageDisposables: DisposableStore = new DisposableStore();
	private searchWidgetsContainerElement!: HTMLElement;
	private searchWidget!: SearchWidget;
	private size!: dom.Dimension;
	private queryDetails!: HTMLElement;
	private toggleQueryDetailsButton!: HTMLElement;
	private inputPatternExcludes!: ExcludePatternInputWidget;
	private inputPatternIncludes!: IncludePatternInputWidget;
	private resultsElement!: HTMLElement;

	private currentSelectedFileMatch: ISearchTreeFileMatch | undefined;

	private delayedRefresh: Delayer<void>;
	private changedWhileHidden: boolean;

	private searchWithoutFolderMessageElement: HTMLElement | undefined;

	private currentSearchQ = Promise.resolve();
	private addToSearchHistoryDelayer: Delayer<void>;

	private toggleCollapseStateDelayer: Delayer<void>;

	private triggerQueryDelayer: Delayer<void>;
	private pauseSearching = false;

	private treeAccessibilityProvider: SearchAccessibilityProvider;

	private treeViewKey: IContextKey<boolean>;

	private _visibleMatches: number = 0;

	private _refreshResultsScheduler: RunOnceScheduler;

	private _onSearchResultChangedDisposable: IDisposable | undefined;
	private _onAIResultChangedDisposable: IDisposable | undefined;

	private searchDataSource: SearchViewDataSource | undefined;

	private refreshTreeController: RefreshTreeController;
	constructor(
		options: IViewPaneOptions,
		@IFileService private readonly fileService: IFileService,
		@IEditorService private readonly editorService: IEditorService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IProgressService private readonly progressService: IProgressService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ISearchViewModelWorkbenchService private readonly searchViewModelWorkbenchService: ISearchViewModelWorkbenchService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IReplaceService private readonly replaceService: IReplaceService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IThemeService themeService: IThemeService,
		@ISearchHistoryService private readonly searchHistoryService: ISearchHistoryService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IStorageService private readonly storageService: IStorageService,
		@ISearchService private readonly searchService: ISearchService,
		@IOpenerService openerService: IOpenerService,
		@IHoverService hoverService: IHoverService,
		@INotebookService private readonly notebookService: INotebookService,
		@ILogService private readonly logService: ILogService,
		@IAccessibilitySignalService private readonly accessibilitySignalService: IAccessibilitySignalService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {

		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.container = dom.$('.search-view');

		// globals
		this.viewletVisible = Constants.SearchContext.SearchViewVisibleKey.bindTo(this.contextKeyService);
		this.firstMatchFocused = Constants.SearchContext.FirstMatchFocusKey.bindTo(this.contextKeyService);
		this.fileMatchOrMatchFocused = Constants.SearchContext.FileMatchOrMatchFocusKey.bindTo(this.contextKeyService);
		this.fileMatchOrFolderMatchFocus = Constants.SearchContext.FileMatchOrFolderMatchFocusKey.bindTo(this.contextKeyService);
		this.fileMatchOrFolderMatchWithResourceFocus = Constants.SearchContext.FileMatchOrFolderMatchWithResourceFocusKey.bindTo(this.contextKeyService);
		this.fileMatchFocused = Constants.SearchContext.FileFocusKey.bindTo(this.contextKeyService);
		this.folderMatchFocused = Constants.SearchContext.FolderFocusKey.bindTo(this.contextKeyService);
		this.folderMatchWithResourceFocused = Constants.SearchContext.ResourceFolderFocusKey.bindTo(this.contextKeyService);
		this.searchResultHeaderFocused = Constants.SearchContext.SearchResultHeaderFocused.bindTo(this.contextKeyService);
		this.hasSearchResultsKey = Constants.SearchContext.HasSearchResults.bindTo(this.contextKeyService);
		this.matchFocused = Constants.SearchContext.MatchFocusKey.bindTo(this.contextKeyService);
		this.searchStateKey = SearchStateKey.bindTo(this.contextKeyService);
		this.hasSearchPatternKey = Constants.SearchContext.ViewHasSearchPatternKey.bindTo(this.contextKeyService);
		this.hasReplacePatternKey = Constants.SearchContext.ViewHasReplacePatternKey.bindTo(this.contextKeyService);
		this.hasFilePatternKey = Constants.SearchContext.ViewHasFilePatternKey.bindTo(this.contextKeyService);
		this.hasSomeCollapsibleResultKey = Constants.SearchContext.ViewHasSomeCollapsibleKey.bindTo(this.contextKeyService);
		this.treeViewKey = Constants.SearchContext.InTreeViewKey.bindTo(this.contextKeyService);
		this.refreshTreeController = this._register(this.instantiationService.createInstance(RefreshTreeController, this, () => this.searchConfig));

		this._register(this.contextKeyService.onDidChangeContext(e => {
			const keys = Constants.SearchContext.hasAIResultProvider.keys();
			if (e.affectsSome(new Set(keys))) {
				this.refreshHasAISetting();
			}
		}));

		// scoped
		this.contextKeyService = this._register(this.contextKeyService.createScoped(this.container));
		Constants.SearchContext.SearchViewFocusedKey.bindTo(this.contextKeyService).set(true);
		this.inputBoxFocused = Constants.SearchContext.InputBoxFocusedKey.bindTo(this.contextKeyService);
		this.inputPatternIncludesFocused = Constants.SearchContext.PatternIncludesFocusedKey.bindTo(this.contextKeyService);
		this.inputPatternExclusionsFocused = Constants.SearchContext.PatternExcludesFocusedKey.bindTo(this.contextKeyService);
		this.isEditableItem = Constants.SearchContext.IsEditableItemKey.bindTo(this.contextKeyService);

		this.instantiationService = this._register(this.instantiationService.createChild(
			new ServiceCollection([IContextKeyService, this.contextKeyService])));

		this._register(this.configurationService.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration('search.sortOrder')) {
				if (this.searchConfig.sortOrder === SearchSortOrder.Modified) {
					// If changing away from modified, remove all fileStats
					// so that updated files are re-retrieved next time.
					this.removeFileStats();
				}
				await this.refreshTreeController.queue();
			}
		}));

		this.viewModel = this.searchViewModelWorkbenchService.searchModel;
		this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
		this.memento = new Memento(this.id, storageService);
		this.viewletState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);

		this._register(this.fileService.onDidFilesChange(e => this.onFilesChanged(e)));
		this._register(this.textFileService.untitled.onWillDispose(model => this.onUntitledDidDispose(model.resource)));
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.onDidChangeWorkbenchState()));
		this._register(this.searchHistoryService.onDidClearHistory(() => this.clearHistory()));
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));

		this.delayedRefresh = this._register(new Delayer<void>(250));

		this.addToSearchHistoryDelayer = this._register(new Delayer<void>(2000));
		this.toggleCollapseStateDelayer = this._register(new Delayer<void>(100));
		this.triggerQueryDelayer = this._register(new Delayer<void>(0));

		this.treeAccessibilityProvider = this.instantiationService.createInstance(SearchAccessibilityProvider, this);
		this.isTreeLayoutViewVisible = this.viewletState['view.treeLayout'] ?? (this.searchConfig.defaultViewMode === ViewMode.Tree);

		this._refreshResultsScheduler = this._register(new RunOnceScheduler(this._updateResults.bind(this), 80));

		// storage service listener for for roaming changes
		this._register(this.storageService.onWillSaveState(() => {
			this._saveSearchHistoryService();
		}));

		this._register(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, SearchHistoryService.SEARCH_HISTORY_KEY, this._store)(() => {
			const restoredHistory = this.searchHistoryService.load();

			if (restoredHistory.include) {
				this.inputPatternIncludes.prependHistory(restoredHistory.include);
			}
			if (restoredHistory.exclude) {
				this.inputPatternExcludes.prependHistory(restoredHistory.exclude);
			}
			if (restoredHistory.search) {
				this.searchWidget.prependSearchHistory(restoredHistory.search);
			}
			if (restoredHistory.replace) {
				this.searchWidget.prependReplaceHistory(restoredHistory.replace);
			}
		}));

		this.changedWhileHidden = this.hasSearchResults();
	}

	async queueRefreshTree(): Promise<void> {
		return this.refreshTreeController.queue();
	}
	get isTreeLayoutViewVisible(): boolean {
		return this.treeViewKey.get() ?? false;
	}

	private set isTreeLayoutViewVisible(visible: boolean) {
		this.treeViewKey.set(visible);
	}

	async setTreeView(visible: boolean): Promise<void> {
		if (visible === this.isTreeLayoutViewVisible) {
			return;
		}
		this.isTreeLayoutViewVisible = visible;
		this.updateIndentStyles(this.themeService.getFileIconTheme());
		return this.refreshTreeController.queue();
	}

	private get state(): SearchUIState {
		return this.searchStateKey.get() ?? SearchUIState.Idle;
	}

	private set state(v: SearchUIState) {
		this.searchStateKey.set(v);
	}

	getContainer(): HTMLElement {
		return this.container;
	}

	get searchResult(): ISearchResult {
		return this.viewModel && this.viewModel.searchResult;
	}

	get model(): ISearchModel {
		return this.viewModel;
	}

	private async refreshHasAISetting(): Promise<void> {
		const shouldShowAI = this.shouldShowAIResults();
		if (!this.tree.hasNode(this.searchResult)) {
			return;
		}
		if (shouldShowAI && !this.tree.hasNode(this.searchResult.aiTextSearchResult)) {
			if (this.model.searchResult.getCachedSearchComplete(false)) {
				return this.refreshAndUpdateCount();
			}
		} else if (!shouldShowAI && this.tree.hasNode(this.searchResult.aiTextSearchResult)) {
			return this.refreshAndUpdateCount();
		}
	}

	private onDidChangeWorkbenchState(): void {
		if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.searchWithoutFolderMessageElement) {
			dom.hide(this.searchWithoutFolderMessageElement);
		}
	}

	private refreshInputs() {
		this.pauseSearching = true;
		this.searchWidget.setValue(this.viewModel.searchResult.query?.contentPattern.pattern ?? '');
		this.searchWidget.setReplaceAllActionState(false);
		this.searchWidget.toggleReplace(true);
		this.inputPatternIncludes.setOnlySearchInOpenEditors(this.viewModel.searchResult.query?.onlyOpenEditors || false);
		this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(!this.viewModel.searchResult.query?.userDisabledExcludesAndIgnoreFiles || true);
		this.searchIncludePattern.setValue('');
		this.searchExcludePattern.setValue('');
		this.pauseSearching = false;
	}

	public async replaceSearchModel(searchModel: ISearchModel, asyncResults: Promise<ISearchComplete>): Promise<void> {
		let progressComplete: () => void;
		this.progressService.withProgress({ location: this.getProgressLocation(), delay: 0 }, _progress => {
			return new Promise<void>(resolve => progressComplete = resolve);
		});

		const slowTimer = setTimeout(() => {
			this.state = SearchUIState.SlowSearch;
		}, 2000);

		this._refreshResultsScheduler.schedule();

		// remove old model and use the new searchModel
		searchModel.location = SearchModelLocation.PANEL;
		searchModel.replaceActive = this.viewModel.isReplaceActive();
		searchModel.replaceString = this.searchWidget.getReplaceValue();
		this._onSearchResultChangedDisposable?.dispose();
		this._onSearchResultChangedDisposable = this._register(searchModel.onSearchResultChanged(async (event) => this.onSearchResultsChanged(event)));

		// this call will also dispose of the old model
		this.searchViewModelWorkbenchService.searchModel = searchModel;
		this.viewModel = searchModel;
		this.tree.setInput(this.viewModel.searchResult);

		await this.onSearchResultsChanged();
		this.refreshInputs();

		asyncResults.then((complete) => {
			clearTimeout(slowTimer);
			return this.onSearchComplete(progressComplete, undefined, undefined, complete);
		}, (e) => {
			clearTimeout(slowTimer);
			return this.onSearchError(e, progressComplete, undefined, undefined);
		});

		await this.expandIfSingularResult();
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);
		this.container = dom.append(parent, dom.$('.search-view'));

		this.searchWidgetsContainerElement = dom.append(this.container, $('.search-widgets-container'));
		this.createSearchWidget(this.searchWidgetsContainerElement);

		const history = this.searchHistoryService.load();
		const filePatterns = this.viewletState['query.filePatterns'] || '';
		const patternExclusions = this.viewletState['query.folderExclusions'] || '';
		const patternExclusionsHistory: string[] = history.exclude || [];
		const patternIncludes = this.viewletState['query.folderIncludes'] || '';
		const patternIncludesHistory: string[] = history.include || [];
		const onlyOpenEditors = this.viewletState['query.onlyOpenEditors'] || false;

		const queryDetailsExpanded = this.viewletState['query.queryDetailsExpanded'] || '';
		const useExcludesAndIgnoreFiles = typeof this.viewletState['query.useExcludesAndIgnoreFiles'] === 'boolean' ?
			this.viewletState['query.useExcludesAndIgnoreFiles'] : true;

		this.queryDetails = dom.append(this.searchWidgetsContainerElement, $('.query-details'));

		// Toggle query details button
		const toggleQueryDetailsLabel = nls.localize('moreSearch', "Toggle Search Details");
		this.toggleQueryDetailsButton = dom.append(this.queryDetails,
			$('.more' + ThemeIcon.asCSSSelector(searchDetailsIcon), { tabindex: 0, role: 'button', 'aria-label': toggleQueryDetailsLabel }));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this.toggleQueryDetailsButton, toggleQueryDetailsLabel));

		this._register(dom.addDisposableListener(this.toggleQueryDetailsButton, dom.EventType.CLICK, e => {
			dom.EventHelper.stop(e);
			this.toggleQueryDetails(!this.accessibilityService.isScreenReaderOptimized());
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
					this.searchWidget.isReplaceShown() ? this.searchWidget.replaceInput?.focusOnPreserve() : this.searchWidget.focusRegexAction();
				}
				dom.EventHelper.stop(e);
			}
		}));

		// folder includes list
		const folderIncludesList = dom.append(this.queryDetails, $('.file-types.includes'));
		const filesToIncludeTitle = nls.localize('searchScope.includes', "files to include");
		dom.append(folderIncludesList, $('h4', undefined, filesToIncludeTitle));

		this.inputPatternIncludes = this._register(this.instantiationService.createInstance(IncludePatternInputWidget, folderIncludesList, this.contextViewService, {
			ariaLabel: filesToIncludeTitle,
			placeholder: nls.localize('placeholder.includes', "e.g. *.ts, src/**/include"),
			showPlaceholderOnFocus: true,
			history: patternIncludesHistory,
			inputBoxStyles: defaultInputBoxStyles
		}));

		this.inputPatternIncludes.setValue(patternIncludes);
		this.inputPatternIncludes.setOnlySearchInOpenEditors(onlyOpenEditors);

		this._register(this.inputPatternIncludes.onCancel(() => this.cancelSearch(false)));
		this._register(this.inputPatternIncludes.onChangeSearchInEditorsBox(() => this.triggerQueryChange()));

		this.trackInputBox(this.inputPatternIncludes.inputFocusTracker, this.inputPatternIncludesFocused);

		// excludes list
		const excludesList = dom.append(this.queryDetails, $('.file-types.excludes'));
		const excludesTitle = nls.localize('searchScope.excludes', "files to exclude");
		dom.append(excludesList, $('h4', undefined, excludesTitle));
		this.inputPatternExcludes = this._register(this.instantiationService.createInstance(ExcludePatternInputWidget, excludesList, this.contextViewService, {
			ariaLabel: excludesTitle,
			placeholder: nls.localize('placeholder.excludes', "e.g. *.ts, src/**/exclude"),
			showPlaceholderOnFocus: true,
			history: patternExclusionsHistory,
			inputBoxStyles: defaultInputBoxStyles
		}));

		this.inputPatternExcludes.setValue(patternExclusions);
		this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(useExcludesAndIgnoreFiles);

		this._register(this.inputPatternExcludes.onCancel(() => this.cancelSearch(false)));
		this._register(this.inputPatternExcludes.onChangeIgnoreBox(() => this.triggerQueryChange()));
		this.trackInputBox(this.inputPatternExcludes.inputFocusTracker, this.inputPatternExclusionsFocused);

		const updateHasFilePatternKey = () => this.hasFilePatternKey.set(this.inputPatternIncludes.getValue().length > 0 || this.inputPatternExcludes.getValue().length > 0);
		updateHasFilePatternKey();
		const onFilePatternSubmit = (triggeredOnType: boolean) => {
			this.triggerQueryChange({ triggeredOnType, delay: this.searchConfig.searchOnTypeDebouncePeriod });
			if (triggeredOnType) {
				updateHasFilePatternKey();
			}
		};
		this._register(this.inputPatternIncludes.onSubmit(onFilePatternSubmit));
		this._register(this.inputPatternExcludes.onSubmit(onFilePatternSubmit));

		this.messagesElement = dom.append(this.container, $('.messages.text-search-provider-messages'));
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.showSearchWithoutFolderMessage();
		}

		this.createSearchResultsView(this.container);

		if (filePatterns !== '' || patternExclusions !== '' || patternIncludes !== '' || queryDetailsExpanded !== '' || !useExcludesAndIgnoreFiles) {
			this.toggleQueryDetails(true, true, true);
		}

		this._onSearchResultChangedDisposable = this._register(this.viewModel.onSearchResultChanged(async (event) => await this.onSearchResultsChanged(event)));

		// Subscribe to AI search result changes and update the tree when new AI results are reported
		this._onAIResultChangedDisposable?.dispose();
		this._onAIResultChangedDisposable = this._register(
			this.viewModel.searchResult.aiTextSearchResult.onChange(() => {
				// Only refresh the AI node, not the whole tree
				if (this.tree && this.tree.hasNode(this.searchResult.aiTextSearchResult)) {
					this.tree.updateChildren(this.searchResult.aiTextSearchResult);
				}
			})
		);

		this._register(this.onDidChangeBodyVisibility(visible => this.onVisibilityChanged(visible)));

		this.updateIndentStyles(this.themeService.getFileIconTheme());
		this._register(this.themeService.onDidFileIconThemeChange(this.updateIndentStyles, this));
	}

	private updateIndentStyles(theme: IFileIconTheme): void {
		this.resultsElement.classList.toggle('hide-arrows', this.isTreeLayoutViewVisible && theme.hidesExplorerArrows);
	}

	private async onVisibilityChanged(visible: boolean): Promise<void> {
		this.viewletVisible.set(visible);
		if (visible) {
			if (this.changedWhileHidden) {
				// Render if results changed while viewlet was hidden - #37818
				await this.refreshAndUpdateCount();
				this.changedWhileHidden = false;
			}
		} else {
			// Reset last focus to input to preserve opening the viewlet always focusing the query editor.
			this.lastFocusState = 'input';
		}

		// Enable highlights if there are searchresults
		this.viewModel?.searchResult.toggleHighlights(visible);
	}

	get searchAndReplaceWidget(): SearchWidget {
		return this.searchWidget;
	}

	get searchIncludePattern(): IncludePatternInputWidget {
		return this.inputPatternIncludes;
	}

	get searchExcludePattern(): ExcludePatternInputWidget {
		return this.inputPatternExcludes;
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
		const preserveCase = this.viewletState['query.preserveCase'] === true;

		const isInNotebookMarkdownInput = this.viewletState['query.isInNotebookMarkdownInput'] ?? true;
		const isInNotebookMarkdownPreview = this.viewletState['query.isInNotebookMarkdownPreview'] ?? true;
		const isInNotebookCellInput = this.viewletState['query.isInNotebookCellInput'] ?? true;
		const isInNotebookCellOutput = this.viewletState['query.isInNotebookCellOutput'] ?? true;


		this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, container, {
			value: contentPattern,
			replaceValue: replaceText,
			isRegex: isRegex,
			isCaseSensitive: isCaseSensitive,
			isWholeWords: isWholeWords,
			searchHistory: searchHistory,
			replaceHistory: replaceHistory,
			preserveCase: preserveCase,
			inputBoxStyles: defaultInputBoxStyles,
			toggleStyles: defaultToggleStyles,
			notebookOptions: {
				isInNotebookMarkdownInput,
				isInNotebookMarkdownPreview,
				isInNotebookCellInput,
				isInNotebookCellOutput,
			}
		}));

		if (!this.searchWidget.searchInput || !this.searchWidget.replaceInput) {
			this.logService.warn(`Cannot fully create search widget. Search or replace input undefined. SearchInput: ${this.searchWidget.searchInput}, ReplaceInput: ${this.searchWidget.replaceInput}`);
			return;
		}

		if (showReplace) {
			this.searchWidget.toggleReplace(true);
		}

		this._register(this.searchWidget.onSearchSubmit(options => this.triggerQueryChange(options)));
		this._register(this.searchWidget.onSearchCancel(({ focus }) => this.cancelSearch(focus)));
		this._register(this.searchWidget.searchInput.onDidOptionChange(() => {
			this.triggerQueryChange({ shouldKeepAIResults: true });
		}));

		this._register(this.searchWidget.getNotebookFilters().onDidChange(() => this.triggerQueryChange({ shouldKeepAIResults: true })));

		const updateHasPatternKey = () => this.hasSearchPatternKey.set(this.searchWidget.searchInput ? (this.searchWidget.searchInput.getValue().length > 0) : false);
		updateHasPatternKey();
		this._register(this.searchWidget.searchInput.onDidChange(() => updateHasPatternKey()));

		const updateHasReplacePatternKey = () => this.hasReplacePatternKey.set(this.searchWidget.getReplaceValue().length > 0);
		updateHasReplacePatternKey();
		this._register(this.searchWidget.replaceInput.inputBox.onDidChange(() => updateHasReplacePatternKey()));

		this._register(this.searchWidget.onDidHeightChange(() => this.reLayout()));

		this._register(this.searchWidget.onReplaceToggled(() => this.reLayout()));
		this._register(this.searchWidget.onReplaceStateChange(async (state) => {
			this.viewModel.replaceActive = state;
			await this.refreshTreeController.queue();
		}));

		this._register(this.searchWidget.onPreserveCaseChange(async (state) => {
			this.viewModel.preserveCase = state;
			await this.refreshTreeController.queue();
		}));

		this._register(this.searchWidget.onReplaceValueChanged(() => {
			this.viewModel.replaceString = this.searchWidget.getReplaceValue();
			this.delayedRefresh.trigger(async () => this.refreshTreeController.queue());
		}));

		this._register(this.searchWidget.onBlur(() => {
			this.toggleQueryDetailsButton.focus();
		}));

		this._register(this.searchWidget.onReplaceAll(() => this.replaceAll()));

		this.trackInputBox(this.searchWidget.searchInputFocusTracker);
		this.trackInputBox(this.searchWidget.replaceInputFocusTracker);
	}

	public shouldShowAIResults(): boolean {
		const hasProvider = Constants.SearchContext.hasAIResultProvider.getValue(this.contextKeyService);
		return !!hasProvider;
	}
	private async onConfigurationUpdated(event?: IConfigurationChangeEvent): Promise<void> {
		if (event && (event.affectsConfiguration('search.decorations.colors') || event.affectsConfiguration('search.decorations.badges'))) {
			return this.refreshTreeController.queue();
		}
	}

	private trackInputBox(inputFocusTracker: dom.IFocusTracker | undefined, contextKey?: IContextKey<boolean>): void {
		if (!inputFocusTracker) {
			return;
		}

		this._register(inputFocusTracker.onDidFocus(() => {
			this.lastFocusState = 'input';
			this.inputBoxFocused.set(true);
			contextKey?.set(true);
		}));
		this._register(inputFocusTracker.onDidBlur(() => {
			this.inputBoxFocused.set(this.searchWidget.searchInputHasFocus()
				|| this.searchWidget.replaceInputHasFocus()
				|| this.inputPatternIncludes.inputHasFocus()
				|| this.inputPatternExcludes.inputHasFocus());
			contextKey?.set(false);
		}));
	}

	private async onSearchResultsChanged(event?: IChangeEvent): Promise<void> {
		if (this.isVisible()) {
			return this.refreshAndUpdateCount(event);
		} else {
			this.changedWhileHidden = true;
		}
	}

	private async refreshAndUpdateCount(event?: IChangeEvent): Promise<void> {
		this.searchWidget.setReplaceAllActionState(!this.viewModel.searchResult.isEmpty());
		this.updateSearchResultCount(this.viewModel.searchResult.query!.userDisabledExcludesAndIgnoreFiles, this.viewModel.searchResult.query?.onlyOpenEditors, event?.clearingAll);
		return this.refreshTreeController.queue(event);
	}

	private originalShouldCollapse(match: RenderableMatch) {
		const collapseResults = this.searchConfig.collapseResults;
		return (collapseResults === 'alwaysCollapse' ||
			(!(isSearchTreeMatch(match)) && match.count() > 10 && collapseResults !== 'alwaysExpand')) ?
			ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded;
	}

	private shouldCollapseAccordingToConfig(match: RenderableMatch): boolean {
		const collapseResults = this.originalShouldCollapse(match);
		if (collapseResults === ObjectTreeElementCollapseState.PreserveOrCollapsed) {
			return true;
		}
		return false;
	}

	private replaceAll(): void {
		if (this.viewModel.searchResult.count() === 0) {
			return;
		}

		const occurrences = this.viewModel.searchResult.count();
		const fileCount = this.viewModel.searchResult.fileCount();
		const replaceValue = this.searchWidget.getReplaceValue() || '';
		const afterReplaceAllMessage = this.buildAfterReplaceAllMessage(occurrences, fileCount, replaceValue);

		let progressComplete: () => void;
		let progressReporter: IProgress<IProgressStep>;

		this.progressService.withProgress({ location: this.getProgressLocation(), delay: 100, total: occurrences }, p => {
			progressReporter = p;

			return new Promise<void>(resolve => progressComplete = resolve);
		});

		const confirmation: IConfirmation = {
			title: nls.localize('replaceAll.confirmation.title', "Replace All"),
			message: this.buildReplaceAllConfirmationMessage(occurrences, fileCount, replaceValue),
			primaryButton: nls.localize({ key: 'replaceAll.confirm.button', comment: ['&& denotes a mnemonic'] }, "&&Replace")
		};

		this.dialogService.confirm(confirmation).then(res => {
			if (res.confirmed) {
				this.searchWidget.setReplaceAllActionState(false);
				this.viewModel.searchResult.replaceAll(progressReporter).then(() => {
					progressComplete();
					const messageEl = this.clearMessage();
					dom.append(messageEl, afterReplaceAllMessage);
					this.reLayout();
				}, (error) => {
					progressComplete();
					errors.isCancellationError(error);
					this.notificationService.error(error);
				});
			} else {
				progressComplete();
			}
		});
	}

	private buildAfterReplaceAllMessage(occurrences: number, fileCount: number, replaceValue?: string) {
		if (occurrences === 1) {
			if (fileCount === 1) {
				if (replaceValue) {
					return nls.localize('replaceAll.occurrence.file.message', "Replaced {0} occurrence across {1} file with '{2}'.", occurrences, fileCount, replaceValue);
				}

				return nls.localize('removeAll.occurrence.file.message', "Replaced {0} occurrence across {1} file.", occurrences, fileCount);
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

			return nls.localize('removeAll.occurrences.file.message', "Replaced {0} occurrences across {1} file.", occurrences, fileCount);
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

				return nls.localize('replaceAll.occurrence.file.confirmation.message', "Replace {0} occurrence across {1} file?", occurrences, fileCount);
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

			return nls.localize('replaceAll.occurrences.file.confirmation.message', "Replace {0} occurrences across {1} file?", occurrences, fileCount);
		}

		if (replaceValue) {
			return nls.localize('removeAll.occurrences.files.confirmation.message', "Replace {0} occurrences across {1} files with '{2}'?", occurrences, fileCount, replaceValue);
		}

		return nls.localize('replaceAll.occurrences.files.confirmation.message', "Replace {0} occurrences across {1} files?", occurrences, fileCount);
	}

	private clearMessage(): HTMLElement {
		this.searchWithoutFolderMessageElement = undefined;

		const wasHidden = this.messagesElement.style.display === 'none';
		dom.clearNode(this.messagesElement);
		dom.show(this.messagesElement);
		this.messageDisposables.clear();

		const newMessage = dom.append(this.messagesElement, $('.message'));
		if (wasHidden) {
			this.reLayout();
		}

		return newMessage;
	}

	private createSearchResultsView(container: HTMLElement): void {
		this.resultsElement = dom.append(container, $('.results.show-file-icons.file-icon-themable-tree'));
		const delegate = this.instantiationService.createInstance(SearchDelegate);

		const identityProvider: IIdentityProvider<RenderableMatch> = {
			getId(element: RenderableMatch) {
				return element.id();
			}
		};

		this.searchDataSource = this.instantiationService.createInstance(SearchViewDataSource, this);
		this.treeLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));
		this.tree = this._register(this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree<ISearchResult, RenderableMatch>,
			'SearchView',
			this.resultsElement,
			delegate,
			{
				isIncompressible: (element: RenderableMatch) => {

					if (isSearchTreeFolderMatch(element) && !isTextSearchHeading(element.parent()) && !(isSearchTreeFolderMatchWorkspaceRoot(element.parent())) && !(isSearchTreeFolderMatchNoRoot(element.parent()))) {
						return false;
					}
					return true;
				}
			},
			[
				this._register(this.instantiationService.createInstance(FolderMatchRenderer, this, this.treeLabels)),
				this._register(this.instantiationService.createInstance(FileMatchRenderer, this, this.treeLabels)),
				this._register(this.instantiationService.createInstance(TextSearchResultRenderer, this.treeLabels)),
				this._register(this.instantiationService.createInstance(MatchRenderer, this)),
			],
			this.searchDataSource,
			{
				identityProvider,
				accessibilityProvider: this.treeAccessibilityProvider,
				dnd: this.instantiationService.createInstance(ResourceListDnDHandler, element => {
					if (isSearchTreeFileMatch(element)) {
						return element.resource;
					}
					if (isSearchTreeMatch(element)) {
						return withSelection(element.parent().resource, element.range());
					}
					return null;
				}),
				multipleSelectionSupport: true,
				selectionNavigation: true,
				overrideStyles: this.getLocationBasedColors().listOverrideStyles,
				paddingBottom: SearchDelegate.ITEM_HEIGHT,
				collapseByDefault: (e: RenderableMatch) => {
					if (isTextSearchHeading(e)) {
						// always collapse the ai text search result, but always expand the text result
						return e.isAIContributed;
					}

					// always expand compressed nodes
					if (isSearchTreeFolderMatch(e) && e.matches().length === 1 && isSearchTreeFolderMatch(e.matches()[0])) {
						return false;
					}
					return this.shouldCollapseAccordingToConfig(e);
				}
			}));

		Constants.SearchContext.SearchResultListFocusedKey.bindTo(this.tree.contextKeyService);

		this.tree.setInput(this.viewModel.searchResult);
		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));
		const updateHasSomeCollapsible = () => this.toggleCollapseStateDelayer.trigger(() => this.hasSomeCollapsibleResultKey.set(this.hasSomeCollapsible()));
		updateHasSomeCollapsible();
		this._register(this.tree.onDidChangeCollapseState(() => updateHasSomeCollapsible()));
		this._register(this.tree.onDidChangeModel(() => updateHasSomeCollapsible()));

		this._register(Event.debounce(this.tree.onDidOpen, (last, event) => event, DEBOUNCE_DELAY, true)(options => {
			if (isSearchTreeMatch(options.element)) {
				const selectedMatch: ISearchTreeMatch = options.element;
				this.currentSelectedFileMatch?.setSelectedMatch(null);
				this.currentSelectedFileMatch = selectedMatch.parent();
				this.currentSelectedFileMatch.setSelectedMatch(selectedMatch);

				this.onFocus(selectedMatch, options.editorOptions.preserveFocus, options.sideBySide, options.editorOptions.pinned);
			}
		}));

		this._register(Event.debounce(this.tree.onDidChangeFocus, (last, event) => event, DEBOUNCE_DELAY, true)(() => {
			const selection = this.tree.getSelection();
			const focus = this.tree.getFocus()[0];
			if (selection.length > 1 && isSearchTreeMatch(focus)) {
				this.onFocus(focus, true);
			}
		}));

		this._register(Event.any<any>(this.tree.onDidFocus, this.tree.onDidChangeFocus)(() => {
			const focus = this.tree.getFocus()[0];

			if (this.tree.isDOMFocused()) {
				const firstElem = this.tree.getFirstElementChild(this.tree.getInput());
				this.firstMatchFocused.set(firstElem === focus);
				this.fileMatchOrMatchFocused.set(!!focus);
				this.fileMatchFocused.set(isSearchTreeFileMatch(focus));
				this.folderMatchFocused.set(isSearchTreeFolderMatch(focus));
				this.matchFocused.set(isSearchTreeMatch(focus));
				this.fileMatchOrFolderMatchFocus.set(isSearchTreeFileMatch(focus) || isSearchTreeFolderMatch(focus));
				this.fileMatchOrFolderMatchWithResourceFocus.set(isSearchTreeFileMatch(focus) || isSearchTreeFolderMatchWithResource(focus));
				this.folderMatchWithResourceFocused.set(isSearchTreeFolderMatchWithResource(focus));
				this.searchResultHeaderFocused.set(isSearchHeader(focus));
				this.lastFocusState = 'tree';
			}

			let editable = false;
			if (isSearchTreeMatch(focus)) {
				editable = !focus.isReadonly;
			} else if (isSearchTreeFileMatch(focus)) {
				editable = !focus.hasOnlyReadOnlyMatches();
			} else if (isSearchTreeFolderMatch(focus)) {
				editable = !focus.hasOnlyReadOnlyMatches();
			}
			this.isEditableItem.set(editable);
		}));

		this._register(this.tree.onDidBlur(() => {
			this.firstMatchFocused.reset();
			this.fileMatchOrMatchFocused.reset();
			this.fileMatchFocused.reset();
			this.folderMatchFocused.reset();
			this.matchFocused.reset();
			this.fileMatchOrFolderMatchFocus.reset();
			this.fileMatchOrFolderMatchWithResourceFocus.reset();
			this.folderMatchWithResourceFocused.reset();
			this.searchResultHeaderFocused.reset();
			this.isEditableItem.reset();
		}));
	}

	private onContextMenu(e: ITreeContextMenuEvent<RenderableMatch | null>): void {

		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();
		const selection = this.tree.getSelection();
		let arg: any;
		let context: any;
		if (selection && selection.length > 0) {
			arg = e.element;
			context = selection;
		} else {
			context = e.element;
		}

		this.contextMenuService.showContextMenu({
			menuId: MenuId.SearchContext,
			menuActionOptions: { shouldForwardArgs: true, arg },
			contextKeyService: this.contextKeyService,
			getAnchor: () => e.anchor,
			getActionsContext: () => context,
		});
	}

	private hasSomeCollapsible(): boolean {
		const viewer = this.getControl();
		const navigator = viewer.navigate();
		let node = navigator.first();
		const shouldShowAI = this.shouldShowAIResults();
		do {
			if (node && !viewer.isCollapsed(node) && (!shouldShowAI || !(isTextSearchHeading(node)))) {
				// ignore the ai text search result id
				return true;
			}
		} while (node = navigator.next());

		return false;
	}

	async selectNextMatch(): Promise<void> {
		if (!this.hasSearchResults()) {
			return;
		}

		const [selected] = this.tree.getSelection();

		// Expand the initial selected node, if needed
		if (selected && !(isSearchTreeMatch(selected))) {
			if (this.tree.isCollapsed(selected)) {
				await this.tree.expand(selected);
			}
		}

		const navigator = this.tree.navigate(selected);

		let next = navigator.next();
		if (!next) {
			next = navigator.first();
		}

		// Expand until first child is a Match
		while (next && !(isSearchTreeMatch(next))) {
			if (this.tree.isCollapsed(next)) {
				await this.tree.expand(next);
			}

			// Select the first child
			next = navigator.next();
		}

		// Reveal the newly selected element
		if (next) {
			if (next === selected) {
				this.tree.setFocus([]);
			}
			const event = getSelectionKeyboardEvent(undefined, false, false);
			this.tree.setFocus([next], event);
			this.tree.setSelection([next], event);
			this.tree.reveal(next);
			const ariaLabel = this.treeAccessibilityProvider.getAriaLabel(next);
			if (ariaLabel) { aria.status(ariaLabel); }
		}
	}

	async selectPreviousMatch(): Promise<void> {
		if (!this.hasSearchResults()) {
			return;
		}

		const [selected] = this.tree.getSelection();
		let navigator = this.tree.navigate(selected);

		let prev = navigator.previous();

		// Select previous until find a Match or a collapsed item
		while (!prev || (!(isSearchTreeMatch(prev)) && !this.tree.isCollapsed(prev))) {
			const nextPrev = prev ? navigator.previous() : navigator.last();

			if (!prev && !nextPrev) {
				return;
			}

			prev = nextPrev;
		}

		// Expand until last child is a Match
		while (prev && !(isSearchTreeMatch(prev))) {
			const nextItem = navigator.next();
			if (!nextItem) {
				break;
			}
			await this.tree.expand(prev);
			navigator = this.tree.navigate(nextItem); // recreate navigator because modifying the tree can invalidate it
			prev = nextItem ? navigator.previous() : navigator.last(); // select last child
		}

		// Reveal the newly selected element
		if (prev) {
			if (prev === selected) {
				this.tree.setFocus([]);
			}
			const event = getSelectionKeyboardEvent(undefined, false, false);
			this.tree.setFocus([prev], event);
			this.tree.setSelection([prev], event);
			this.tree.reveal(prev);
			const ariaLabel = this.treeAccessibilityProvider.getAriaLabel(prev);
			if (ariaLabel) { aria.status(ariaLabel); }
		}
	}

	moveFocusToResults(): void {
		this.tree.domFocus();
	}

	override focus(): void {
		super.focus();
		if (this.lastFocusState === 'input' || !this.hasSearchResults()) {
			const updatedText = this.searchConfig.seedOnFocus ? this.updateTextFromSelection({ allowSearchOnType: false }) : false;
			this.searchWidget.focus(undefined, undefined, updatedText);
		} else {
			this.tree.domFocus();
		}
	}

	updateTextFromFindWidgetOrSelection({ allowUnselectedWord = true, allowSearchOnType = true }): boolean {
		let activeEditor = this.editorService.activeTextEditorControl;
		if (isCodeEditor(activeEditor) && !activeEditor?.hasTextFocus()) {
			const controller = CommonFindController.get(activeEditor);
			if (controller && controller.isFindInputFocused()) {
				return this.updateTextFromFindWidget(controller, { allowSearchOnType });
			}

			const editors = this.codeEditorService.listCodeEditors();
			activeEditor = editors.find(editor => editor instanceof EmbeddedCodeEditorWidget && editor.getParentEditor() === activeEditor && editor.hasTextFocus())
				?? activeEditor;
		}

		return this.updateTextFromSelection({ allowUnselectedWord, allowSearchOnType }, activeEditor);
	}

	private updateTextFromFindWidget(controller: CommonFindController, { allowSearchOnType = true }): boolean {
		if (!this.searchConfig.seedWithNearestWord && (dom.getActiveWindow().getSelection()?.toString() ?? '') === '') {
			return false;
		}

		const searchString = controller.getState().searchString;
		if (searchString === '') {
			return false;
		}

		this.searchWidget.searchInput?.setCaseSensitive(controller.getState().matchCase);
		this.searchWidget.searchInput?.setWholeWords(controller.getState().wholeWord);
		this.searchWidget.searchInput?.setRegex(controller.getState().isRegex);
		this.updateText(searchString, allowSearchOnType);

		return true;
	}

	private updateTextFromSelection({ allowUnselectedWord = true, allowSearchOnType = true }, editor?: IEditor): boolean {
		const seedSearchStringFromSelection = this.configurationService.getValue<IEditorOptions>('editor').find!.seedSearchStringFromSelection;
		if (!seedSearchStringFromSelection || seedSearchStringFromSelection === 'never') {
			return false;
		}

		let selectedText = this.getSearchTextFromEditor(allowUnselectedWord, editor);
		if (selectedText === null) {
			return false;
		}

		if (this.searchWidget.searchInput?.getRegex()) {
			selectedText = strings.escapeRegExpCharacters(selectedText);
		}

		this.updateText(selectedText, allowSearchOnType);
		return true;
	}

	private updateText(text: string, allowSearchOnType: boolean = true) {
		if (allowSearchOnType && !this.viewModel.searchResult.isDirty) {
			this.searchWidget.setValue(text);
		} else {
			this.pauseSearching = true;
			this.searchWidget.setValue(text);
			this.pauseSearching = false;
		}
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
		if (this.isDisposed || !this.size) {
			return;
		}

		const actionsPosition = this.searchConfig.actionsPosition;
		this.getContainer().classList.toggle(SearchView.ACTIONS_RIGHT_CLASS_NAME, actionsPosition === 'right');

		this.searchWidget.setWidth(this.size.width - 28 /* container margin */);

		this.inputPatternExcludes.setWidth(this.size.width - 28 /* container margin */);
		this.inputPatternIncludes.setWidth(this.size.width - 28 /* container margin */);

		const widgetHeight = dom.getTotalHeight(this.searchWidgetsContainerElement);
		const messagesHeight = dom.getTotalHeight(this.messagesElement);
		this.tree.layout(this.size.height - widgetHeight - messagesHeight, this.size.width - 28);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.size = new dom.Dimension(width, height);
		this.reLayout();
	}

	getControl() {
		return this.tree;
	}

	allSearchFieldsClear(): boolean {
		return this.searchWidget.getReplaceValue() === '' &&
			(!this.searchWidget.searchInput || this.searchWidget.searchInput.getValue() === '');
	}

	allFilePatternFieldsClear(): boolean {
		return this.searchExcludePattern.getValue() === '' &&
			this.searchIncludePattern.getValue() === '';
	}

	hasSearchResults(): boolean {
		return !this.viewModel.searchResult.isEmpty();
	}

	clearSearchResults(clearInput = true): void {
		this.viewModel.searchResult.clear();
		this.showEmptyStage(true);
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.showSearchWithoutFolderMessage();
		}
		if (clearInput) {
			if (this.allSearchFieldsClear()) {
				this.clearFilePatternFields();
			}
			this.searchWidget.clear();
		}
		this.viewModel.cancelSearch();
		this.tree.ariaLabel = nls.localize('emptySearch', "Empty Search");

		this.accessibilitySignalService.playSignal(AccessibilitySignal.clear);
		this.reLayout();
	}

	clearFilePatternFields(): void {
		this.searchExcludePattern.clear();
		this.searchIncludePattern.clear();
	}

	cancelSearch(focus: boolean = true): boolean {
		if (this.viewModel.cancelSearch() && this.viewModel.cancelAISearch()) {
			if (focus) { this.searchWidget.focus(); }
			return true;
		}
		return false;
	}

	private selectTreeIfNotSelected(): void {
		if (this.tree.getNode(undefined)) {
			this.tree.domFocus();
			const selection = this.tree.getSelection();
			if (selection.length === 0) {
				const event = getSelectionKeyboardEvent();
				this.tree.focusNext(undefined, undefined, event);
				this.tree.setSelection(this.tree.getFocus(), event);
			}
		}
	}

	private getSearchTextFromEditor(allowUnselectedWord: boolean, editor?: IEditor): string | null {
		if (dom.isAncestorOfActiveElement(this.getContainer())) {
			return null;
		}

		editor = editor ?? this.editorService.activeTextEditorControl;

		if (!editor) {
			return null;
		}

		const allowUnselected = this.searchConfig.seedWithNearestWord && allowUnselectedWord;
		return getSelectionTextFromEditor(allowUnselected, editor);
	}

	private showsFileTypes(): boolean {
		return this.queryDetails.classList.contains('more');
	}

	toggleCaseSensitive(): void {
		this.searchWidget.searchInput?.setCaseSensitive(!this.searchWidget.searchInput.getCaseSensitive());
		this.triggerQueryChange({ shouldKeepAIResults: true });
	}

	toggleWholeWords(): void {
		this.searchWidget.searchInput?.setWholeWords(!this.searchWidget.searchInput.getWholeWords());
		this.triggerQueryChange({ shouldKeepAIResults: true });
	}

	toggleRegex(): void {
		this.searchWidget.searchInput?.setRegex(!this.searchWidget.searchInput.getRegex());
		this.triggerQueryChange({ shouldKeepAIResults: true });
	}

	togglePreserveCase(): void {
		this.searchWidget.replaceInput?.setPreserveCase(!this.searchWidget.replaceInput.getPreserveCase());
		this.triggerQueryChange({ shouldKeepAIResults: true });
	}

	setSearchParameters(args: IFindInFilesArgs = {}): void {
		if (typeof args.isCaseSensitive === 'boolean') {
			this.searchWidget.searchInput?.setCaseSensitive(args.isCaseSensitive);
		}
		if (typeof args.matchWholeWord === 'boolean') {
			this.searchWidget.searchInput?.setWholeWords(args.matchWholeWord);
		}
		if (typeof args.isRegex === 'boolean') {
			this.searchWidget.searchInput?.setRegex(args.isRegex);
		}
		if (typeof args.filesToInclude === 'string') {
			this.searchIncludePattern.setValue(String(args.filesToInclude));
		}
		if (typeof args.filesToExclude === 'string') {
			this.searchExcludePattern.setValue(String(args.filesToExclude));
		}
		if (typeof args.query === 'string') {
			this.searchWidget.searchInput?.setValue(args.query);
		}
		if (typeof args.replace === 'string') {
			this.searchWidget.replaceInput?.setValue(args.replace);
		} else {
			if (this.searchWidget.replaceInput && this.searchWidget.replaceInput.getValue() !== '') {
				this.searchWidget.replaceInput.setValue('');
			}
		}
		if (typeof args.triggerSearch === 'boolean' && args.triggerSearch) {
			this.triggerQueryChange();
		}
		if (typeof args.preserveCase === 'boolean') {
			this.searchWidget.replaceInput?.setPreserveCase(args.preserveCase);
		}
		if (typeof args.useExcludeSettingsAndIgnoreFiles === 'boolean') {
			this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(args.useExcludeSettingsAndIgnoreFiles);
		}
		if (typeof args.onlyOpenEditors === 'boolean') {
			this.searchIncludePattern.setOnlySearchInOpenEditors(args.onlyOpenEditors);
		}
	}

	toggleQueryDetails(moveFocus = true, show?: boolean, skipLayout?: boolean, reverse?: boolean): void {
		const cls = 'more';
		show = typeof show === 'undefined' ? !this.queryDetails.classList.contains(cls) : Boolean(show);
		this.viewletState['query.queryDetailsExpanded'] = show;
		skipLayout = Boolean(skipLayout);

		if (show) {
			this.toggleQueryDetailsButton.setAttribute('aria-expanded', 'true');
			this.queryDetails.classList.add(cls);
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
			this.queryDetails.classList.remove(cls);
			if (moveFocus) {
				this.searchWidget.focus();
			}
		}

		if (!skipLayout && this.size) {
			this.reLayout();
		}
	}

	searchInFolders(folderPaths: string[] = []): void {
		this._searchWithIncludeOrExclude(true, folderPaths);
	}

	searchOutsideOfFolders(folderPaths: string[] = []): void {
		this._searchWithIncludeOrExclude(false, folderPaths);
	}

	private _searchWithIncludeOrExclude(include: boolean, folderPaths: string[]) {
		if (!folderPaths.length || folderPaths.some(folderPath => folderPath === '.')) {
			this.inputPatternIncludes.setValue('');
			this.searchWidget.focus();
			return;
		}

		// Show 'files to include' box
		if (!this.showsFileTypes()) {
			this.toggleQueryDetails(true, true);
		}

		(include ? this.inputPatternIncludes : this.inputPatternExcludes).setValue(folderPaths.join(', '));
		this.searchWidget.focus(false);
	}

	triggerQueryChange(_options?: { preserveFocus?: boolean; triggeredOnType?: boolean; delay?: number; shouldKeepAIResults?: boolean; shouldUpdateAISearch?: boolean }): void {
		const options = { preserveFocus: true, triggeredOnType: false, delay: 0, ..._options };

		if (options.triggeredOnType && !this.searchConfig.searchOnType) { return; }

		if (!this.pauseSearching) {

			const delay = options.triggeredOnType ? options.delay : 0;
			this.triggerQueryDelayer.trigger(() => {
				this._onQueryChanged(options.preserveFocus, options.triggeredOnType, options.shouldKeepAIResults, options.shouldUpdateAISearch);
			}, delay);
		}
	}

	private _getExcludePattern(): string {
		return this.inputPatternExcludes.getValue().trim();
	}

	private _getIncludePattern(): string {
		return this.inputPatternIncludes.getValue().trim();
	}

	private _onQueryChanged(preserveFocus: boolean, triggeredOnType = false, shouldKeepAIResults = false, shouldUpdateAISearch = false): void {
		if (!(this.searchWidget.searchInput?.inputBox.isInputValid())) {
			return;
		}

		const isRegex = this.searchWidget.searchInput.getRegex();
		const isInNotebookMarkdownInput = this.searchWidget.getNotebookFilters().markupInput;
		const isInNotebookMarkdownPreview = this.searchWidget.getNotebookFilters().markupPreview;
		const isInNotebookCellInput = this.searchWidget.getNotebookFilters().codeInput;
		const isInNotebookCellOutput = this.searchWidget.getNotebookFilters().codeOutput;

		const isWholeWords = this.searchWidget.searchInput.getWholeWords();
		const isCaseSensitive = this.searchWidget.searchInput.getCaseSensitive();
		const contentPattern = this.searchWidget.searchInput.getValue();
		const excludePatternText = this._getExcludePattern();
		const includePatternText = this._getIncludePattern();
		const useExcludesAndIgnoreFiles = this.inputPatternExcludes.useExcludesAndIgnoreFiles();
		const onlySearchInOpenEditors = this.inputPatternIncludes.onlySearchInOpenEditors();

		if (contentPattern.length === 0) {
			this.clearSearchResults(false);
			this.clearMessage();
			return;
		}

		const content: IPatternInfo = {
			pattern: contentPattern,
			isRegExp: isRegex,
			isCaseSensitive: isCaseSensitive,
			isWordMatch: isWholeWords,
			notebookInfo: {
				isInNotebookMarkdownInput,
				isInNotebookMarkdownPreview,
				isInNotebookCellInput,
				isInNotebookCellOutput
			}
		};

		const excludePattern = [{ pattern: this.inputPatternExcludes.getValue() }];
		const includePattern = this.inputPatternIncludes.getValue();

		// Need the full match line to correctly calculate replace text, if this is a search/replace with regex group references ($1, $2, ...).
		// 10000 chars is enough to avoid sending huge amounts of text around, if you do a replace with a longer match, it may or may not resolve the group refs correctly.
		// https://github.com/microsoft/vscode/issues/58374
		const charsPerLine = content.isRegExp ? 10000 : 1000;

		const options: ITextQueryBuilderOptions = {
			_reason: 'searchView',
			extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
			maxResults: this.searchConfig.maxResults ?? undefined,
			disregardIgnoreFiles: !useExcludesAndIgnoreFiles || undefined,
			disregardExcludeSettings: !useExcludesAndIgnoreFiles || undefined,
			onlyOpenEditors: onlySearchInOpenEditors,
			excludePattern,
			includePattern,
			previewOptions: {
				matchLines: 1,
				charsPerLine
			},
			isSmartCase: this.searchConfig.smartCase,
			expandPatterns: true
		};
		const folderResources = this.contextService.getWorkspace().folders;

		const onQueryValidationError = (err: Error) => {
			this.searchWidget.searchInput?.showMessage({ content: err.message, type: MessageType.ERROR });
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
			// ensure that the node is closed when a new search is triggered
			if (!shouldKeepAIResults && !shouldUpdateAISearch && this.tree.hasNode(this.searchResult.aiTextSearchResult)) {
				this.tree.collapse(this.searchResult.aiTextSearchResult);
			}

			this.onQueryTriggered(query, options, excludePatternText, includePatternText, triggeredOnType, shouldKeepAIResults, shouldUpdateAISearch);

			if (!preserveFocus) {
				this.searchWidget.focus(false, undefined, true); // focus back to input field
			}
		}, onQueryValidationError);
	}

	private validateQuery(query: ITextQuery): Promise<void> {
		// Validate folderQueries
		const folderQueriesExistP =
			query.folderQueries.map(fq => {
				return this.fileService.exists(fq.folder).catch(() => false);
			});

		return Promise.all(folderQueriesExistP).then(existResults => {
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

	private onQueryTriggered(query: ITextQuery, options: ITextQueryBuilderOptions, excludePatternText: string, includePatternText: string, triggeredOnType: boolean, shouldKeepAIResults: boolean, shouldUpdateAISearch: boolean): void {
		this.addToSearchHistoryDelayer.trigger(() => {
			this.searchWidget.searchInput?.onSearchSubmit();
			this.inputPatternExcludes.onSearchSubmit();
			this.inputPatternIncludes.onSearchSubmit();
		});

		this.viewModel.cancelSearch(true);
		this.viewModel.cancelAISearch(true);

		this.currentSearchQ = this.currentSearchQ
			.then(() => this.doSearch(query, excludePatternText, includePatternText, triggeredOnType, shouldKeepAIResults, shouldUpdateAISearch))
			.then(() => undefined, () => undefined);
	}


	private async _updateResults() {
		if (this.state === SearchUIState.Idle) {
			return;
		}
		try {
			// Search result tree update
			const fileCount = this.viewModel.searchResult.fileCount();
			if (this._visibleMatches !== fileCount) {
				this._visibleMatches = fileCount;
				await this.refreshAndUpdateCount();
			}
		} finally {
			// show frequent progress and results by scheduling updates 80 ms after the last one
			this._refreshResultsScheduler.schedule();
		}
	}

	private async expandIfSingularResult() {
		// expand if just 1 file with less than 50 matches

		const collapseResults = this.searchConfig.collapseResults;
		if (collapseResults !== 'alwaysCollapse' && this.viewModel.searchResult.matches().length === 1) {
			const onlyMatch = this.viewModel.searchResult.matches()[0];
			await this.tree.expandTo(onlyMatch);
			if (onlyMatch.count() < 50) {
				await this.tree.expand(onlyMatch);
			}
		}
	}

	private async onSearchComplete(progressComplete: () => void, excludePatternText?: string, includePatternText?: string, completed?: ISearchComplete, shouldDoFinalRefresh = true) {

		this.state = SearchUIState.Idle;

		// Complete up to 100% as needed
		progressComplete();

		if (shouldDoFinalRefresh) {
			// anything that gets called from `getChildren` should not do this, since the tree will refresh anyways.
			await this.refreshAndUpdateCount();
		}

		const allResults = !this.viewModel.searchResult.isEmpty();
		const aiResults = this.searchResult.getCachedSearchComplete(true);
		if (completed?.exit === SearchCompletionExitCode.NewSearchStarted) {
			return;
		}

		// Special case for when we have an AI provider registered
		Constants.SearchContext.AIResultsRequested.bindTo(this.contextKeyService).set(this.shouldShowAIResults() && !!aiResults);

		if (this.shouldShowAIResults() && !allResults) {
			const messageEl = this.clearMessage();
			const noResultsMessage = nls.localize('noResultsFallback', "No results found. ");
			dom.append(messageEl, noResultsMessage);

			let aiName = 'Copilot';
			try {
				aiName = (await this.searchService.getAIName()) || aiName;
			} catch (e) {
				// ignore
			}

			if (aiName) {
				const searchWithAIButtonTooltip = appendKeyBindingLabel(
					nls.localize('triggerAISearch.tooltip', "Search with {0}", aiName),
					this.keybindingService.lookupKeybinding(Constants.SearchCommandIds.SearchWithAIActionId)
				);
				const searchWithAIButtonText = nls.localize('searchWithAIButtonTooltip', "Search with {0}.", aiName);
				const searchWithAIButton = this.messageDisposables.add(new SearchLinkButton(
					searchWithAIButtonText,
					() => {
						this.commandService.executeCommand(Constants.SearchCommandIds.SearchWithAIActionId);
					}, this.hoverService, searchWithAIButtonTooltip));
				dom.append(messageEl, searchWithAIButton.element);
			}

			if (!aiResults) {
				return;
			}
		}

		if (!allResults) {
			const hasExcludes = !!excludePatternText;
			const hasIncludes = !!includePatternText;
			let message: string;

			if (!completed) {
				message = SEARCH_CANCELLED_MESSAGE;
			} else if (this.inputPatternIncludes.onlySearchInOpenEditors()) {
				if (hasIncludes && hasExcludes) {
					message = nls.localize('noOpenEditorResultsIncludesExcludes', "No results found in open editors matching '{0}' excluding '{1}' - ", includePatternText, excludePatternText);
				} else if (hasIncludes) {
					message = nls.localize('noOpenEditorResultsIncludes', "No results found in open editors matching '{0}' - ", includePatternText);
				} else if (hasExcludes) {
					message = nls.localize('noOpenEditorResultsExcludes', "No results found in open editors excluding '{0}' - ", excludePatternText);
				} else {
					message = nls.localize('noOpenEditorResultsFound', "No results found in open editors. Review your settings for configured exclusions and check your gitignore files - ");
				}
			} else {
				if (hasIncludes && hasExcludes) {
					message = nls.localize('noResultsIncludesExcludes', "No results found in '{0}' excluding '{1}' - ", includePatternText, excludePatternText);
				} else if (hasIncludes) {
					message = nls.localize('noResultsIncludes', "No results found in '{0}' - ", includePatternText);
				} else if (hasExcludes) {
					message = nls.localize('noResultsExcludes', "No results found excluding '{0}' - ", excludePatternText);
				} else {
					message = nls.localize('noResultsFound', "No results found. Review your settings for configured exclusions and check your gitignore files - ");
				}
			}

			// Indicate as status to ARIA
			aria.status(message);

			const messageEl = this.clearMessage();
			dom.append(messageEl, message);

			if (!completed) {
				const searchAgainButton = this.messageDisposables.add(new SearchLinkButton(
					nls.localize('rerunSearch.message', "Search again"),
					() => this.triggerQueryChange({ preserveFocus: false }), this.hoverService));
				dom.append(messageEl, searchAgainButton.element);
			} else if (hasIncludes || hasExcludes) {
				const searchAgainButton = this.messageDisposables.add(new SearchLinkButton(nls.localize('rerunSearchInAll.message', "Search again in all files"), this.onSearchAgain.bind(this), this.hoverService));
				dom.append(messageEl, searchAgainButton.element);
			} else {
				const openSettingsButton = this.messageDisposables.add(new SearchLinkButton(nls.localize('openSettings.message', "Open Settings"), this.onOpenSettings.bind(this), this.hoverService));
				dom.append(messageEl, openSettingsButton.element);
			}

			if (completed) {
				dom.append(messageEl, $('span', undefined, ' - '));

				const learnMoreButton = this.messageDisposables.add(new SearchLinkButton(nls.localize('openSettings.learnMore', "Learn More"), this.onLearnMore.bind(this), this.hoverService));
				dom.append(messageEl, learnMoreButton.element);
			}

			if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
				this.showSearchWithoutFolderMessage();
			}
			this.reLayout();
		} else {
			this.viewModel.searchResult.toggleHighlights(this.isVisible()); // show highlights

			// Indicate final search result count for ARIA
			aria.status(nls.localize('ariaSearchResultsStatus', "Search returned {0} results in {1} files", this.viewModel.searchResult.count(), this.viewModel.searchResult.fileCount()));
		}


		if (completed && completed.limitHit) {
			completed.messages.push({ type: TextSearchCompleteMessageType.Warning, text: nls.localize('searchMaxResultsWarning', "The result set only contains a subset of all matches. Be more specific in your search to narrow down the results.") });
		}

		if (completed && completed.messages) {
			for (const message of completed.messages) {
				this.addMessage(message);
			}
		}

		this.reLayout();
	}

	private async onSearchError(e: any, progressComplete: () => void, excludePatternText?: string, includePatternText?: string, completed?: ISearchComplete, shouldDoFinalRefresh = true) {
		this.state = SearchUIState.Idle;
		if (errors.isCancellationError(e)) {
			return this.onSearchComplete(progressComplete, excludePatternText, includePatternText, completed, shouldDoFinalRefresh);
		} else {
			progressComplete();
			this.searchWidget.searchInput?.showMessage({ content: e.message, type: MessageType.ERROR });
			this.viewModel.searchResult.clear();

			return Promise.resolve();
		}
	}

	public async addAIResults(element: ITextSearchHeading, createIterator: (e: ITextSearchHeading) => Iterable<RenderableMatch>) {
		const excludePatternText = this._getExcludePattern();
		const includePatternText = this._getIncludePattern();
		let progressComplete: () => void;
		this.progressService.withProgress({ location: this.getProgressLocation(), delay: 0 }, _progress => {
			return new Promise<void>(resolve => progressComplete = resolve);
		});

		this.searchWidget.searchInput?.clearMessage();
		this.state = SearchUIState.Searching;
		this.showEmptyStage();

		const slowTimer = setTimeout(() => {
			this.state = SearchUIState.SlowSearch;
		}, 2000);

		this._visibleMatches = 0;

		this.tree.setSelection([]);
		this.tree.setFocus([]);

		this.viewModel.replaceString = this.searchWidget.getReplaceValue();
		this.viewModel.searchResult.setAIQueryUsingTextQuery();
		const result = this.viewModel.aiSearch();
		result.then((complete) => {
			clearTimeout(slowTimer);
			if (complete.aiKeywords && complete.aiKeywords.length > 0) {
				this.updateKeywordSuggestion(complete.aiKeywords);
			} else {
				this.updateSearchResultCount(this.viewModel.searchResult.query?.userDisabledExcludesAndIgnoreFiles, this.viewModel.searchResult.query?.onlyOpenEditors, false);
			}
			return this.onSearchComplete(progressComplete, excludePatternText, includePatternText, complete, false);
		}, (e) => {
			clearTimeout(slowTimer);
			return this.onSearchError(e, progressComplete, excludePatternText, includePatternText, undefined, false);
		});
		return new Promise<Iterable<RenderableMatch>>(resolve => {
			const disposable = element.onChange(() => {
				disposable.dispose(); // Clean up listener after first result
				resolve(createIterator(element));
			});
		});
	}

	private doSearch(query: ITextQuery, excludePatternText: string, includePatternText: string, triggeredOnType: boolean, shouldKeepAIResults: boolean, shouldUpdateAISearch: boolean): Thenable<void> {
		let progressComplete: () => void;
		this.progressService.withProgress({ location: this.getProgressLocation(), delay: triggeredOnType ? 300 : 0 }, _progress => {
			return new Promise<void>(resolve => progressComplete = resolve);
		});

		this.searchWidget.searchInput?.clearMessage();
		this.state = SearchUIState.Searching;
		this.showEmptyStage();
		this.model.searchResult.aiTextSearchResult.hidden = !shouldKeepAIResults && !shouldUpdateAISearch;

		const slowTimer = setTimeout(() => {
			this.state = SearchUIState.SlowSearch;
		}, 2000);

		this._visibleMatches = 0;

		this._refreshResultsScheduler.schedule();

		this.searchWidget.setReplaceAllActionState(false);

		this.tree.setSelection([]);
		this.tree.setFocus([]);

		this.viewModel.replaceString = this.searchWidget.getReplaceValue();
		const result = this.viewModel.search(query);

		if (!shouldKeepAIResults || shouldUpdateAISearch) {
			this.viewModel.searchResult.setAIQueryUsingTextQuery(query);
		}

		if (shouldUpdateAISearch) {
			this.tree.updateChildren(this.searchResult.aiTextSearchResult);
		}

		return result.asyncResults.then((complete) => {
			clearTimeout(slowTimer);
			return this.onSearchComplete(progressComplete, excludePatternText, includePatternText, complete);
		}, (e) => {
			clearTimeout(slowTimer);
			return this.onSearchError(e, progressComplete, excludePatternText, includePatternText);
		});
	}

	private onOpenSettings(e: dom.EventLike): void {
		dom.EventHelper.stop(e, false);
		this.openSettings('@id:files.exclude,search.exclude,search.useParentIgnoreFiles,search.useGlobalIgnoreFiles,search.useIgnoreFiles');
	}

	private openSettings(query: string): Promise<IEditorPane | undefined> {
		const options: ISettingsEditorOptions = { query };
		return this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ?
			this.preferencesService.openWorkspaceSettings(options) :
			this.preferencesService.openUserSettings(options);
	}

	private onLearnMore(): void {
		this.openerService.open(URI.parse('https://go.microsoft.com/fwlink/?linkid=853977'));
	}

	private onSearchAgain(): void {
		this.inputPatternExcludes.setValue('');
		this.inputPatternIncludes.setValue('');
		this.inputPatternIncludes.setOnlySearchInOpenEditors(false);

		this.triggerQueryChange({ preserveFocus: false });
	}

	private onEnableExcludes(): void {
		this.toggleQueryDetails(false, true);
		this.searchExcludePattern.setUseExcludesAndIgnoreFiles(true);
	}

	private onDisableSearchInOpenEditors(): void {
		this.toggleQueryDetails(false, true);
		this.inputPatternIncludes.setOnlySearchInOpenEditors(false);
	}

	private updateSearchResultCount(disregardExcludesAndIgnores?: boolean, onlyOpenEditors?: boolean, clear: boolean = false): void {
		const fileCount = this.viewModel.searchResult.fileCount();
		const resultCount = this.viewModel.searchResult.count();
		this.hasSearchResultsKey.set(fileCount > 0);

		const msgWasHidden = this.messagesElement.style.display === 'none';

		const messageEl = this.clearMessage();
		const resultMsg = clear ? '' : this.buildResultCountMessage(resultCount, fileCount);
		this.tree.ariaLabel = resultMsg + nls.localize('forTerm', " - Search: {0}", this.searchResult.query?.contentPattern.pattern ?? '');
		dom.append(messageEl, resultMsg);

		if (fileCount > 0) {
			if (disregardExcludesAndIgnores) {
				const excludesDisabledMessage = ' - ' + nls.localize('useIgnoresAndExcludesDisabled', "exclude settings and ignore files are disabled") + ' ';
				const enableExcludesButton = this.messageDisposables.add(new SearchLinkButton(nls.localize('excludes.enable', "enable"), this.onEnableExcludes.bind(this), this.hoverService, nls.localize('useExcludesAndIgnoreFilesDescription', "Use Exclude Settings and Ignore Files")));
				dom.append(messageEl, $('span', undefined, excludesDisabledMessage, '(', enableExcludesButton.element, ')'));
			}

			if (onlyOpenEditors) {
				const searchingInOpenMessage = ' - ' + nls.localize('onlyOpenEditors', "searching only in open files") + ' ';
				const disableOpenEditorsButton = this.messageDisposables.add(new SearchLinkButton(nls.localize('openEditors.disable', "disable"), this.onDisableSearchInOpenEditors.bind(this), this.hoverService, nls.localize('disableOpenEditors', "Search in entire workspace")));
				dom.append(messageEl, $('span', undefined, searchingInOpenMessage, '(', disableOpenEditorsButton.element, ')'));
			}

			dom.append(messageEl, ' - ');

			const openInEditorTooltip = appendKeyBindingLabel(
				nls.localize('openInEditor.tooltip', "Copy current search results to an editor"),
				this.keybindingService.lookupKeybinding(Constants.SearchCommandIds.OpenInEditorCommandId));
			const openInEditorButton = this.messageDisposables.add(new SearchLinkButton(
				nls.localize('openInEditor.message', "Open in editor"),
				() => this.instantiationService.invokeFunction(createEditorFromSearchResult, this.searchResult, this.searchIncludePattern.getValue(), this.searchExcludePattern.getValue(), this.searchIncludePattern.onlySearchInOpenEditors()), this.hoverService,
				openInEditorTooltip));
			dom.append(messageEl, openInEditorButton.element);

			this.reLayout();
		} else if (!msgWasHidden) {
			dom.hide(this.messagesElement);
		}
	}

	private handleKeywordClick(keyword: string, index: number, maxKeywords: number) {
		this.searchWidget.searchInput?.setValue(keyword);
		this.triggerQueryChange({ preserveFocus: false, triggeredOnType: false, shouldKeepAIResults: false });
		type KeywordClickClassification = {
			owner: 'osortega';
			comment: 'Fired when the user clicks on a keyword suggestion';
			index: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The index of the keyword clicked' };
			maxKeywords: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The total number of suggested keywords' };
		};
		type KeywordClickEvent = {
			index: number;
			maxKeywords: number;
		};
		this.telemetryService.publicLog2<KeywordClickEvent, KeywordClickClassification>('searchKeywordClick', {
			index,
			maxKeywords
		});
	}

	private updateKeywordSuggestion(keywords: AISearchKeyword[]) {
		const messageEl = this.clearMessage();
		messageEl.classList.add('ai-keywords');

		if (keywords.length === 0) {
			// Do not display anything if there are no keywords
			return;
		}

		// Add unclickable message
		const resultMsg = nls.localize('keywordSuggestion.message', "Search instead for: ");
		dom.append(messageEl, resultMsg);

		const topKeywords = keywords.slice(0, 3);
		topKeywords.forEach((keyword, index) => {
			if (index > 0 && index < topKeywords.length) {
				dom.append(messageEl, ', ');
			}
			const button = this.messageDisposables.add(new SearchLinkButton(
				keyword.keyword,
				() => this.handleKeywordClick(keyword.keyword, index, topKeywords.length),
				this.hoverService
			));
			dom.append(messageEl, button.element);
		});
	}

	private addMessage(message: TextSearchCompleteMessage) {
		const messageBox = this.messagesElement.firstChild as HTMLDivElement;
		if (!messageBox) { return; }
		dom.append(messageBox, renderSearchMessage(message, this.instantiationService, this.notificationService, this.openerService, this.commandService, this.messageDisposables, () => this.triggerQueryChange()));
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
			$('p', undefined, nls.localize('searchWithoutFolder', "You have not opened or specified a folder. Only open files are currently searched - ")));

		const openFolderButton = this.messageDisposables.add(new SearchLinkButton(
			nls.localize('openFolder', "Open Folder"),
			() => {
				this.commandService.executeCommand(env.isMacintosh && env.isNative ? OpenFileFolderAction.ID : OpenFolderAction.ID).catch(err => errors.onUnexpectedError(err));
			}, this.hoverService));
		dom.append(textEl, openFolderButton.element);
	}

	private showEmptyStage(forceHideMessages = false): void {
		const showingCancelled = (this.messagesElement.firstChild?.textContent?.indexOf(SEARCH_CANCELLED_MESSAGE) ?? -1) > -1;

		// clean up ui
		// this.replaceService.disposeAllReplacePreviews();
		if (showingCancelled || forceHideMessages || !this.configurationService.getValue<ISearchConfiguration>().search.searchOnType) {
			// when in search to type, don't preemptively hide, as it causes flickering and shifting of the live results
			dom.hide(this.messagesElement);
		}

		dom.show(this.resultsElement);
		this.currentSelectedFileMatch = undefined;
	}

	private shouldOpenInNotebookEditor(match: ISearchTreeMatch, uri: URI): boolean {
		// Untitled files will return a false positive for getContributedNotebookTypes.
		// Since untitled files are already open, then untitled notebooks should return NotebookMatch results.
		return isIMatchInNotebook(match) || (uri.scheme !== network.Schemas.untitled && this.notebookService.getContributedNotebookTypes(uri).length > 0);
	}

	private onFocus(lineMatch: ISearchTreeMatch, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): Promise<any> {
		const useReplacePreview = this.configurationService.getValue<ISearchConfiguration>().search.useReplacePreview;

		const resource = isSearchTreeMatch(lineMatch) ? lineMatch.parent().resource : (<ISearchTreeFileMatch>lineMatch).resource;
		return (useReplacePreview && this.viewModel.isReplaceActive() && !!this.viewModel.replaceString && !(this.shouldOpenInNotebookEditor(lineMatch, resource))) ?
			this.replaceService.openReplacePreview(lineMatch, preserveFocus, sideBySide, pinned) :
			this.open(lineMatch, preserveFocus, sideBySide, pinned, resource);
	}

	async open(element: FileMatchOrMatch, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean, resourceInput?: URI): Promise<void> {
		const selection = getEditorSelectionFromMatch(element, this.viewModel);
		const oldParentMatches = isSearchTreeMatch(element) ? element.parent().matches() : [];
		const resource = resourceInput ?? (isSearchTreeMatch(element) ? element.parent().resource : (<ISearchTreeFileMatch>element).resource);
		let editor: IEditorPane | undefined;

		const options = {
			preserveFocus,
			pinned,
			selection,
			revealIfVisible: true,
		};

		try {
			editor = await this.editorService.openEditor({
				resource: resource,
				options,
			}, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);

			const editorControl = editor?.getControl();
			if (isSearchTreeMatch(element) && preserveFocus && isCodeEditor(editorControl)) {
				this.viewModel.searchResult.getRangeHighlightDecorations().highlightRange(
					editorControl.getModel()!,
					element.range()
				);
			} else {
				this.viewModel.searchResult.getRangeHighlightDecorations().removeHighlightRange();
			}
		} catch (err) {
			errors.onUnexpectedError(err);
			return;
		}

		if (editor instanceof NotebookEditor) {
			const elemParent = element.parent() as INotebookFileInstanceMatch;
			if (isSearchTreeMatch(element)) {
				if (isIMatchInNotebook(element)) {
					element.parent().showMatch(element);
				} else {
					const editorWidget = editor.getControl();
					if (editorWidget) {
						// Ensure that the editor widget is binded. If if is, then this should return immediately.
						// Otherwise, it will bind the widget.
						elemParent.bindNotebookEditorWidget(editorWidget);
						await elemParent.updateMatchesForEditorWidget();

						const matchIndex = oldParentMatches.findIndex(e => e.id() === element.id());
						const matches = elemParent.matches();
						const match = matchIndex >= matches.length ? matches[matches.length - 1] : matches[matchIndex];

						if (isIMatchInNotebook(match)) {
							elemParent.showMatch(match);
							if (!this.tree.getFocus().includes(match) || !this.tree.getSelection().includes(match)) {
								this.tree.setSelection([match], getSelectionKeyboardEvent());
								this.tree.setFocus([match]);
							}
						}
					}
				}
			}
		}
	}

	openEditorWithMultiCursor(element: FileMatchOrMatch): Promise<void> {
		const resource = isSearchTreeMatch(element) ? element.parent().resource : (<ISearchTreeFileMatch>element).resource;
		return this.editorService.openEditor({
			resource: resource,
			options: {
				preserveFocus: false,
				pinned: true,
				revealIfVisible: true
			}
		}).then(editor => {
			if (editor) {
				let fileMatch = null;
				if (isSearchTreeFileMatch(element)) {
					fileMatch = element;
				}
				else if (isSearchTreeMatch(element)) {
					fileMatch = element.parent();
				}

				if (fileMatch) {
					const selections = fileMatch.matches().map(m => new Selection(m.range().startLineNumber, m.range().startColumn, m.range().endLineNumber, m.range().endColumn));
					const codeEditor = getCodeEditor(editor.getControl());
					if (codeEditor) {
						const multiCursorController = MultiCursorSelectionController.get(codeEditor);
						multiCursorController?.selectAllUsingSelections(selections);
					}
				}
			}
			this.viewModel.searchResult.getRangeHighlightDecorations().removeHighlightRange();
		}, errors.onUnexpectedError);
	}

	private onUntitledDidDispose(resource: URI): void {
		if (!this.viewModel) {
			return;
		}

		// remove search results from this resource as it got disposed
		let matches = this.viewModel.searchResult.matches();
		for (let i = 0, len = matches.length; i < len; i++) {
			if (resource.toString() === matches[i].resource.toString()) {
				this.viewModel.searchResult.remove(matches[i]);
			}
		}
		matches = this.viewModel.searchResult.matches(true);
		for (let i = 0, len = matches.length; i < len; i++) {
			if (resource.toString() === matches[i].resource.toString()) {
				this.viewModel.searchResult.remove(matches[i]);
			}
		}
	}

	private onFilesChanged(e: FileChangesEvent): void {
		if (!this.viewModel || (this.searchConfig.sortOrder !== SearchSortOrder.Modified && !e.gotDeleted())) {
			return;
		}

		const matches = this.viewModel.searchResult.matches();
		if (e.gotDeleted()) {
			const deletedMatches = matches.filter(m => e.contains(m.resource, FileChangeType.DELETED));

			this.viewModel.searchResult.remove(deletedMatches);
		} else {
			// Check if the changed file contained matches
			const changedMatches = matches.filter(m => e.contains(m.resource));
			if (changedMatches.length && this.searchConfig.sortOrder === SearchSortOrder.Modified) {
				// No matches need to be removed, but modified files need to have their file stat updated.
				this.updateFileStats(changedMatches).then(async () => this.refreshTreeController.queue());
			}
		}
	}

	private get searchConfig(): ISearchConfigurationProperties {
		return this.configurationService.getValue<ISearchConfigurationProperties>('search');
	}

	private clearHistory(): void {
		this.searchWidget.clearHistory();
		this.inputPatternExcludes.clearHistory();
		this.inputPatternIncludes.clearHistory();
	}

	public override saveState(): void {
		// This can be called before renderBody() method gets called for the first time
		// if we move the searchView inside another viewPaneContainer
		if (!this.searchWidget) {
			return;
		}

		const patternExcludes = this.inputPatternExcludes?.getValue().trim() ?? '';
		const patternIncludes = this.inputPatternIncludes?.getValue().trim() ?? '';
		const onlyOpenEditors = this.inputPatternIncludes?.onlySearchInOpenEditors() ?? false;
		const useExcludesAndIgnoreFiles = this.inputPatternExcludes?.useExcludesAndIgnoreFiles() ?? true;
		const preserveCase = this.viewModel.preserveCase;

		if (this.searchWidget.searchInput) {
			const isRegex = this.searchWidget.searchInput.getRegex();
			const isWholeWords = this.searchWidget.searchInput.getWholeWords();
			const isCaseSensitive = this.searchWidget.searchInput.getCaseSensitive();
			const contentPattern = this.searchWidget.searchInput.getValue();

			const isInNotebookCellInput = this.searchWidget.getNotebookFilters().codeInput;
			const isInNotebookCellOutput = this.searchWidget.getNotebookFilters().codeOutput;
			const isInNotebookMarkdownInput = this.searchWidget.getNotebookFilters().markupInput;
			const isInNotebookMarkdownPreview = this.searchWidget.getNotebookFilters().markupPreview;

			this.viewletState['query.contentPattern'] = contentPattern;
			this.viewletState['query.regex'] = isRegex;
			this.viewletState['query.wholeWords'] = isWholeWords;
			this.viewletState['query.caseSensitive'] = isCaseSensitive;

			this.viewletState['query.isInNotebookMarkdownInput'] = isInNotebookMarkdownInput;
			this.viewletState['query.isInNotebookMarkdownPreview'] = isInNotebookMarkdownPreview;
			this.viewletState['query.isInNotebookCellInput'] = isInNotebookCellInput;
			this.viewletState['query.isInNotebookCellOutput'] = isInNotebookCellOutput;
		}

		this.viewletState['query.folderExclusions'] = patternExcludes;
		this.viewletState['query.folderIncludes'] = patternIncludes;
		this.viewletState['query.useExcludesAndIgnoreFiles'] = useExcludesAndIgnoreFiles;
		this.viewletState['query.preserveCase'] = preserveCase;
		this.viewletState['query.onlyOpenEditors'] = onlyOpenEditors;

		const isReplaceShown = this.searchAndReplaceWidget.isReplaceShown();
		this.viewletState['view.showReplace'] = isReplaceShown;
		this.viewletState['view.treeLayout'] = this.isTreeLayoutViewVisible;
		this.viewletState['query.replaceText'] = isReplaceShown && this.searchWidget.getReplaceValue();

		this._saveSearchHistoryService();

		this.memento.saveMemento();

		super.saveState();
	}

	private _saveSearchHistoryService() {
		if (this.searchWidget === undefined) {
			return;
		}
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
	}


	private async updateFileStats(elements: ISearchTreeFileMatch[]): Promise<void> {
		const files = elements.map(f => f.resolveFileStat(this.fileService));
		await Promise.all(files);
	}

	private removeFileStats(): void {
		for (const fileMatch of this.searchResult.matches()) {
			fileMatch.fileStat = undefined;
		}
		for (const fileMatch of this.searchResult.matches(true)) {
			fileMatch.fileStat = undefined;
		}
	}

	override dispose(): void {
		this.isDisposed = true;
		this.saveState();
		super.dispose();
	}
}


class SearchLinkButton extends Disposable {
	public readonly element: HTMLElement;

	constructor(label: string, handler: (e: dom.EventLike) => unknown, hoverService: IHoverService, tooltip?: string) {
		super();
		this.element = $('a.pointer', { tabindex: 0 }, label);
		this._register(hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.element, tooltip));
		this.addEventHandlers(handler);
	}

	private addEventHandlers(handler: (e: dom.EventLike) => unknown): void {
		const wrappedHandler = (e: dom.EventLike) => {
			dom.EventHelper.stop(e, false);
			handler(e);
		};

		this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, wrappedHandler));
		this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
				wrappedHandler(e);
				event.preventDefault();
				event.stopPropagation();
			}
		}));
	}
}

export function getEditorSelectionFromMatch(element: FileMatchOrMatch, viewModel: ISearchModel) {
	let match: ISearchTreeMatch | null = null;
	if (isSearchTreeMatch(element)) {
		match = element;
	}
	if (isSearchTreeFileMatch(element) && element.count() > 0) {
		match = element.matches()[element.matches().length - 1];
	}
	if (match) {
		const range = match.range();
		if (viewModel.isReplaceActive() && !!viewModel.replaceString) {
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

export function getSelectionTextFromEditor(allowUnselectedWord: boolean, activeEditor: IEditor): string | null {

	let editor = activeEditor;

	if (isDiffEditor(editor)) {
		if (editor.getOriginalEditor().hasTextFocus()) {
			editor = editor.getOriginalEditor();
		} else {
			editor = editor.getModifiedEditor();
		}
	}

	if (!isCodeEditor(editor) || !editor.hasModel()) {
		return null;
	}

	const range = editor.getSelection();
	if (!range) {
		return null;
	}

	if (range.isEmpty()) {
		if (allowUnselectedWord) {
			const wordAtPosition = editor.getModel().getWordAtPosition(range.getStartPosition());
			return wordAtPosition?.word ?? null;
		} else {
			return null;
		}
	}

	let searchText = '';
	for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
		let lineText = editor.getModel().getLineContent(i);
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

class SearchViewDataSource implements IAsyncDataSource<ISearchResult, RenderableMatch> {

	constructor(
		private searchView: SearchView,
		@IConfigurationService private configurationService: IConfigurationService,
	) { }


	private get searchConfig(): ISearchConfigurationProperties {
		return this.configurationService.getValue<ISearchConfigurationProperties>('search');
	}

	private createSearchResultIterator(searchResult: ISearchResult): Iterable<RenderableMatch> {

		const ret: ITextSearchHeading[] = [];

		if (this.searchView.shouldShowAIResults() && searchResult.searchModel.hasPlainResults && !searchResult.aiTextSearchResult.hidden) {
			// as long as there is a query present, we can load AI results
			ret.push(searchResult.aiTextSearchResult);
		}

		if (!searchResult.plainTextSearchResult.isEmpty()) {
			if (!this.searchView.shouldShowAIResults() || searchResult.aiTextSearchResult.hidden) {
				// only one root, so just return the children
				return this.createTextSearchResultIterator(searchResult.plainTextSearchResult);
			}
			ret.push(searchResult.plainTextSearchResult);

		}

		return ret;

	}

	private createTextSearchResultIterator(textSearchResult: ITextSearchHeading): Iterable<ISearchTreeFolderMatch | ISearchTreeFileMatch> {
		const folderMatches = textSearchResult.folderMatches()
			.filter(fm => !fm.isEmpty())
			.sort(searchMatchComparer);

		if (folderMatches.length === 1) {
			return this.createFolderIterator(folderMatches[0]);
		}
		return folderMatches;
	}

	private createFolderIterator(folderMatch: ISearchTreeFolderMatch): Iterable<ISearchTreeFolderMatch | ISearchTreeFileMatch> {
		const matchArray = this.searchView.isTreeLayoutViewVisible ? folderMatch.matches() : folderMatch.allDownstreamFileMatches();
		let matches = matchArray;
		if (!(folderMatch instanceof AIFolderMatchWorkspaceRootImpl)) {
			matches = matchArray.sort((a, b) => searchMatchComparer(a, b, this.searchConfig.sortOrder));
		}

		return matches;
	}

	private createFileIterator(fileMatch: ISearchTreeFileMatch): Iterable<ISearchTreeMatch> {
		const matches = fileMatch.matches().sort(searchMatchComparer);
		return matches;
	}

	hasChildren(element: RenderableMatch): boolean {
		if (isSearchTreeMatch(element)) {
			return false;
		}

		if (isTextSearchHeading(element) && element.isAIContributed) {
			return true;
		}

		const hasChildren = element.hasChildren;
		return hasChildren;
	}

	getChildren(element: RenderableMatch | ISearchResult): Iterable<RenderableMatch> | Promise<Iterable<RenderableMatch>> {
		if (isSearchResult(element)) {
			return this.createSearchResultIterator(element);
		} else if (isTextSearchHeading(element)) {
			if (element.isAIContributed && !this.searchView.model.hasAIResults) {
				return this.searchView.addAIResults(element, (e: ITextSearchHeading) => this.createTextSearchResultIterator(e));
			}
			return this.createTextSearchResultIterator(element);
		} else if (isSearchTreeFolderMatch(element)) {
			return this.createFolderIterator(element);
		} else if (isSearchTreeFileMatch(element)) {
			return this.createFileIterator(element);
		}

		return [];

	}
	getParent(element: RenderableMatch): RenderableMatch {
		const parent = element.parent();
		if (isSearchResult(parent)) {
			throw new Error('Invalid element passed to getParent');
		}
		return parent;
	}
}

class RefreshTreeController extends Disposable {

	private refreshTreeThrottler: Throttler;

	constructor(
		private readonly searchView: SearchView,
		private readonly geSearchConfig: () => ISearchConfigurationProperties,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this.refreshTreeThrottler = this._register(new Throttler());
	}

	private queuedIChangeEvents: IChangeEvent[] = [];

	public async queue(e?: IChangeEvent): Promise<void> {
		if (e) {
			this.queuedIChangeEvents.push(e);
		}
		return this.refreshTreeThrottler.queue(this.refreshTreeUsingQueue.bind(this));
	}

	private async refreshTreeUsingQueue(): Promise<void> {
		const aggregateChangeEvent: IChangeEvent | undefined = this.queuedIChangeEvents.length === 0 ? undefined : {
			elements: this.queuedIChangeEvents.map(e => e.elements).flat(),
			added: this.queuedIChangeEvents.some(e => e.added),
			removed: this.queuedIChangeEvents.some(e => e.removed),
			clearingAll: this.queuedIChangeEvents.some(e => e.clearingAll),
		};
		this.queuedIChangeEvents = [];
		return this.refreshTree(aggregateChangeEvent);
	}

	private async retrieveFileStats(): Promise<void> {
		const files = this.searchView.model.searchResult.matches().filter(f => !f.fileStat).map(f => f.resolveFileStat(this.fileService));
		await Promise.all(files);
	}

	private async refreshTree(event?: IChangeEvent): Promise<void> {
		const searchConfig = this.geSearchConfig();
		if (!event || event.added || event.removed) {
			// Refresh whole tree
			if (searchConfig.sortOrder === SearchSortOrder.Modified) {
				// Ensure all matches have retrieved their file stat
				await this.retrieveFileStats()
					.then(() => this.searchView.getControl().updateChildren(undefined));
			} else {
				await this.searchView.getControl().updateChildren(undefined);
			}
		} else {
			// If updated counts affect our search order, re-sort the view.
			if (searchConfig.sortOrder === SearchSortOrder.CountAscending ||
				searchConfig.sortOrder === SearchSortOrder.CountDescending) {

				await this.searchView.getControl().updateChildren(undefined);
			} else {
				const treeHasAllElements = event.elements.every(elem => this.searchView.getControl().hasNode(elem));
				if (treeHasAllElements) {
					// IFileMatchInstance modified, refresh those elements
					await Promise.all(event.elements.map(async element => {
						await this.searchView.getControl().updateChildren(element);
						this.searchView.getControl().rerender(element);
					}));
				} else {
					this.searchView.getControl().updateChildren(undefined);
				}
			}
		}
	}
}
