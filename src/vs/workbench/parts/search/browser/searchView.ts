/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/searchview';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { Emitter, debounceEvent } from 'vs/base/common/event';
import errors = require('vs/base/common/errors');
import aria = require('vs/base/browser/ui/aria/aria');
import env = require('vs/base/common/platform');
import { Delayer } from 'vs/base/common/async';
import URI from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import * as paths from 'vs/base/common/paths';
import dom = require('vs/base/browser/dom');
import { IAction } from 'vs/base/common/actions';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Dimension, Builder, $ } from 'vs/base/browser/builder';
import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
import { ITree, IFocusEvent } from 'vs/base/parts/tree/browser/tree';
import { Scope } from 'vs/workbench/common/memento';
import { IPreferencesService } from 'vs/workbench/parts/preferences/common/preferences';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { FileChangeType, FileChangesEvent, IFileService } from 'vs/platform/files/common/files';
import { Match, FileMatch, SearchModel, FileMatchOrMatch, IChangeEvent, ISearchWorkbenchService, FolderMatch } from 'vs/workbench/parts/search/common/searchModel';
import { QueryBuilder } from 'vs/workbench/parts/search/common/queryBuilder';
import { MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { ISearchProgressItem, ISearchComplete, ISearchQuery, IQueryOptions, ISearchConfiguration, IPatternInfo, VIEW_ID } from 'vs/platform/search/common/search';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { PatternInputWidget, ExcludePatternInputWidget } from 'vs/workbench/parts/search/browser/patternInputWidget';
import { SearchRenderer, SearchDataSource, SearchSorter, SearchAccessibilityProvider, SearchFilter } from 'vs/workbench/parts/search/browser/searchResultsView';
import { SearchWidget, ISearchWidgetOptions } from 'vs/workbench/parts/search/browser/searchWidget';
import { RefreshAction, CollapseDeepestExpandedLevelAction, ClearSearchResultsAction, CancelSearchAction } from 'vs/workbench/parts/search/browser/searchActions';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { OpenFolderAction, OpenFileFolderAction } from 'vs/workbench/browser/actions/workspaceActions';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { IThemeService, ITheme, ICssStyleCollector, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorFindMatchHighlight, diffInserted, diffRemoved, diffInsertedOutline, diffRemovedOutline, editorFindMatchHighlightBorder } from 'vs/platform/theme/common/colorRegistry';
import { getOutOfWorkspaceEditorResources } from 'vs/workbench/parts/search/common/search';
import { PreferencesEditor } from 'vs/workbench/parts/preferences/browser/preferencesEditor';
import { isDiffEditor, isCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { TreeResourceNavigator, WorkbenchTree } from 'vs/platform/list/browser/listService';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { SimpleFileResourceDragAndDrop } from 'vs/workbench/browser/dnd';
import { IConfirmation, IConfirmationService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IPanel } from 'vs/workbench/common/panel';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { IPartService } from 'vs/workbench/services/part/common/partService';

export class SearchView extends Viewlet implements IViewlet, IPanel {

	private static readonly MAX_TEXT_RESULTS = 10000;
	private static readonly SHOW_REPLACE_STORAGE_KEY = 'vs.search.show.replace';

	private isDisposed: boolean;

	private queryBuilder: QueryBuilder;
	private viewModel: SearchModel;

	private viewletVisible: IContextKey<boolean>;
	private inputBoxFocused: IContextKey<boolean>;
	private inputPatternIncludesFocused: IContextKey<boolean>;
	private inputPatternExclusionsFocused: IContextKey<boolean>;
	private firstMatchFocused: IContextKey<boolean>;
	private fileMatchOrMatchFocused: IContextKey<boolean>;
	private fileMatchFocused: IContextKey<boolean>;
	private folderMatchFocused: IContextKey<boolean>;
	private matchFocused: IContextKey<boolean>;
	private searchSubmitted: boolean;
	private searching: boolean;

	private actions: (RefreshAction | CollapseDeepestExpandedLevelAction | ClearSearchResultsAction | CancelSearchAction)[] = [];
	private tree: WorkbenchTree;
	private viewletSettings: any;
	private messages: Builder;
	private searchWidgetsContainer: Builder;
	private searchWidget: SearchWidget;
	private size: Dimension;
	private queryDetails: HTMLElement;
	private inputPatternExcludes: ExcludePatternInputWidget;
	private inputPatternIncludes: PatternInputWidget;
	private results: Builder;

	private currentSelectedFileMatch: FileMatch;

	private selectCurrentMatchEmitter: Emitter<string>;
	private delayedRefresh: Delayer<void>;
	private changedWhileHidden: boolean;

	private searchWithoutFolderMessageBuilder: Builder;

	constructor(
		@IPartService partService: IPartService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IFileService private fileService: IFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IProgressService private progressService: IProgressService,
		@INotificationService private notificationService: INotificationService,
		@IConfirmationService private confirmationService: IConfirmationService,
		@IStorageService private storageService: IStorageService,
		@IContextViewService private contextViewService: IContextViewService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ISearchWorkbenchService private searchWorkbenchService: ISearchWorkbenchService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IReplaceService private replaceService: IReplaceService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IThemeService protected themeService: IThemeService
	) {
		super(VIEW_ID, partService, telemetryService, themeService);

		this.viewletVisible = Constants.SearchViewVisibleKey.bindTo(contextKeyService);
		this.inputBoxFocused = Constants.InputBoxFocusedKey.bindTo(this.contextKeyService);
		this.inputPatternIncludesFocused = Constants.PatternIncludesFocusedKey.bindTo(this.contextKeyService);
		this.inputPatternExclusionsFocused = Constants.PatternExcludesFocusedKey.bindTo(this.contextKeyService);
		this.firstMatchFocused = Constants.FirstMatchFocusKey.bindTo(contextKeyService);
		this.fileMatchOrMatchFocused = Constants.FileMatchOrMatchFocusKey.bindTo(contextKeyService);
		this.fileMatchFocused = Constants.FileFocusKey.bindTo(contextKeyService);
		this.folderMatchFocused = Constants.FolderFocusKey.bindTo(contextKeyService);
		this.matchFocused = Constants.MatchFocusKey.bindTo(this.contextKeyService);

		this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
		this.viewletSettings = this.getMemento(storageService, Scope.WORKSPACE);

		this.toUnbind.push(this.fileService.onFileChanges(e => this.onFilesChanged(e)));
		this.toUnbind.push(this.untitledEditorService.onDidChangeDirty(e => this.onUntitledDidChangeDirty(e)));
		this.toUnbind.push(this.contextService.onDidChangeWorkbenchState(() => this.onDidChangeWorkbenchState()));

		this.selectCurrentMatchEmitter = new Emitter<string>();
		debounceEvent(this.selectCurrentMatchEmitter.event, (l, e) => e, 100, /*leading=*/true)
			(() => this.selectCurrentMatch());

		this.delayedRefresh = new Delayer<void>(250);
	}

	private onDidChangeWorkbenchState(): void {
		if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.searchWithoutFolderMessageBuilder) {
			this.searchWithoutFolderMessageBuilder.hide();
		}
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.viewModel = this.searchWorkbenchService.searchModel;
		let builder: Builder;
		parent.div({
			'class': 'search-view'
		}, (div) => {
			builder = div;
		});

		builder.div({ 'class': ['search-widgets-container'] }, (div) => {
			this.searchWidgetsContainer = div;
		});
		this.createSearchWidget(this.searchWidgetsContainer);

		const filePatterns = this.viewletSettings['query.filePatterns'] || '';
		const patternExclusions = this.viewletSettings['query.folderExclusions'] || '';
		const patternExclusionsHistory = this.viewletSettings['query.folderExclusionsHistory'] || [];
		const patternIncludes = this.viewletSettings['query.folderIncludes'] || '';
		const patternIncludesHistory = this.viewletSettings['query.folderIncludesHistory'] || [];
		const queryDetailsExpanded = this.viewletSettings['query.queryDetailsExpanded'] || '';
		const useExcludesAndIgnoreFiles = typeof this.viewletSettings['query.useExcludesAndIgnoreFiles'] === 'boolean' ?
			this.viewletSettings['query.useExcludesAndIgnoreFiles'] : true;

		this.queryDetails = this.searchWidgetsContainer.div({ 'class': ['query-details'] }, (builder) => {
			builder.div({ 'class': 'more', 'tabindex': 0, 'role': 'button', 'title': nls.localize('moreSearch', "Toggle Search Details") })
				.on(dom.EventType.CLICK, (e) => {
					dom.EventHelper.stop(e);
					this.toggleQueryDetails(true);
				}).on(dom.EventType.KEY_UP, (e: KeyboardEvent) => {
					let event = new StandardKeyboardEvent(e);

					if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
						dom.EventHelper.stop(e);
						this.toggleQueryDetails();
					}
				});

			//folder includes list
			builder.div({ 'class': 'file-types' }, (builder) => {
				let title = nls.localize('searchScope.includes', "files to include");
				builder.element('h4', { text: title });

				this.inputPatternIncludes = new PatternInputWidget(builder.getContainer(), this.contextViewService, this.themeService, {
					ariaLabel: nls.localize('label.includes', 'Search Include Patterns')
				});

				this.inputPatternIncludes.setValue(patternIncludes);
				this.inputPatternIncludes.setHistory(patternIncludesHistory);

				this.inputPatternIncludes
					.on(FindInput.OPTION_CHANGE, (e) => {
						this.onQueryChanged(false);
					});

				this.inputPatternIncludes.onSubmit(() => this.onQueryChanged(true, true));
				this.inputPatternIncludes.onCancel(() => this.viewModel.cancelSearch()); // Cancel search without focusing the search widget
				this.trackInputBox(this.inputPatternIncludes.inputFocusTracker, this.inputPatternIncludesFocused);
			});

			//pattern exclusion list
			builder.div({ 'class': 'file-types' }, (builder) => {
				let title = nls.localize('searchScope.excludes', "files to exclude");
				builder.element('h4', { text: title });

				this.inputPatternExcludes = new ExcludePatternInputWidget(builder.getContainer(), this.contextViewService, this.themeService, {
					ariaLabel: nls.localize('label.excludes', 'Search Exclude Patterns')
				});

				this.inputPatternExcludes.setValue(patternExclusions);
				this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(useExcludesAndIgnoreFiles);
				this.inputPatternExcludes.setHistory(patternExclusionsHistory);

				this.inputPatternExcludes
					.on(FindInput.OPTION_CHANGE, (e) => {
						this.onQueryChanged(false);
					});

				this.inputPatternExcludes.onSubmit(() => this.onQueryChanged(true, true));
				this.inputPatternExcludes.onSubmit(() => this.onQueryChanged(true, true));
				this.inputPatternExcludes.onCancel(() => this.viewModel.cancelSearch()); // Cancel search without focusing the search widget
				this.trackInputBox(this.inputPatternExcludes.inputFocusTracker, this.inputPatternExclusionsFocused);
			});
		}).getHTMLElement();

		this.messages = builder.div({ 'class': 'messages' }).hide().clone();
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.searchWithoutFolderMessage(this.clearMessage());
		}

		this.createSearchResultsView(builder);

		this.actions = [
			this.instantiationService.createInstance(RefreshAction, RefreshAction.ID, RefreshAction.LABEL),
			this.instantiationService.createInstance(CollapseDeepestExpandedLevelAction, CollapseDeepestExpandedLevelAction.ID, CollapseDeepestExpandedLevelAction.LABEL),
			this.instantiationService.createInstance(ClearSearchResultsAction, ClearSearchResultsAction.ID, ClearSearchResultsAction.LABEL)
		];

		if (filePatterns !== '' || patternExclusions !== '' || patternIncludes !== '' || queryDetailsExpanded !== '' || !useExcludesAndIgnoreFiles) {
			this.toggleQueryDetails(true, true, true);
		}

		this.toUnbind.push(this.viewModel.searchResult.onChange((event) => this.onSearchResultsChanged(event)));

		return TPromise.as(null);
	}

	public get searchAndReplaceWidget(): SearchWidget {
		return this.searchWidget;
	}

	public get searchIncludePattern(): PatternInputWidget {
		return this.inputPatternIncludes;
	}

	public get searchExcludePattern(): PatternInputWidget {
		return this.inputPatternExcludes;
	}

	private updateActions(): void {
		for (const action of this.actions) {
			action.update();
		}
	}

	private createSearchWidget(builder: Builder): void {
		let contentPattern = this.viewletSettings['query.contentPattern'] || '';
		let isRegex = this.viewletSettings['query.regex'] === true;
		let isWholeWords = this.viewletSettings['query.wholeWords'] === true;
		let isCaseSensitive = this.viewletSettings['query.caseSensitive'] === true;
		let searchHistory = this.viewletSettings['query.searchHistory'] || [];

		this.searchWidget = this.instantiationService.createInstance(SearchWidget, builder, <ISearchWidgetOptions>{
			value: contentPattern,
			isRegex: isRegex,
			isCaseSensitive: isCaseSensitive,
			isWholeWords: isWholeWords,
			history: searchHistory
		});

		if (this.storageService.getBoolean(SearchView.SHOW_REPLACE_STORAGE_KEY, StorageScope.WORKSPACE, true)) {
			this.searchWidget.toggleReplace(true);
		}

		this.toUnbind.push(this.searchWidget);

		this.toUnbind.push(this.searchWidget.onSearchSubmit((refresh) => this.onQueryChanged(refresh)));
		this.toUnbind.push(this.searchWidget.onSearchCancel(() => this.cancelSearch()));
		this.toUnbind.push(this.searchWidget.searchInput.onDidOptionChange((viaKeyboard) => this.onQueryChanged(true, viaKeyboard)));

		this.toUnbind.push(this.searchWidget.onReplaceToggled(() => this.onReplaceToggled()));
		this.toUnbind.push(this.searchWidget.onReplaceStateChange((state) => {
			this.viewModel.replaceActive = state;
			this.tree.refresh();
		}));
		this.toUnbind.push(this.searchWidget.onReplaceValueChanged((value) => {
			this.viewModel.replaceString = this.searchWidget.getReplaceValue();
			this.delayedRefresh.trigger(() => this.tree.refresh());
		}));

		this.toUnbind.push(this.searchWidget.onReplaceAll(() => this.replaceAll()));
		this.trackInputBox(this.searchWidget.searchInputFocusTracker);
		this.trackInputBox(this.searchWidget.replaceInputFocusTracker);
	}

	private trackInputBox(inputFocusTracker: dom.IFocusTracker, contextKey?: IContextKey<boolean>): void {
		this.toUnbind.push(inputFocusTracker.onDidFocus(() => {
			this.inputBoxFocused.set(true);
			if (contextKey) {
				contextKey.set(true);
			}
		}));
		this.toUnbind.push(inputFocusTracker.onDidBlur(() => {
			this.inputBoxFocused.set(this.searchWidget.searchInputHasFocus()
				|| this.searchWidget.replaceInputHasFocus()
				|| this.inputPatternIncludes.inputHasFocus()
				|| this.inputPatternExcludes.inputHasFocus());
			if (contextKey) {
				contextKey.set(false);
			}
		}));
	}

	private onReplaceToggled(): void {
		this.layout(this.size);

		const isReplaceShown = this.searchAndReplaceWidget.isReplaceShown();
		if (!isReplaceShown) {
			this.storageService.store(SearchView.SHOW_REPLACE_STORAGE_KEY, false, StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(SearchView.SHOW_REPLACE_STORAGE_KEY);
		}
	}

	private onSearchResultsChanged(event?: IChangeEvent): TPromise<any> {
		if (this.isVisible()) {
			return this.refreshAndUpdateCount(event);
		} else {
			this.changedWhileHidden = true;
			return TPromise.wrap(null);
		}
	}

	private refreshAndUpdateCount(event?: IChangeEvent): TPromise<void> {
		return this.refreshTree(event).then(() => {
			this.searchWidget.setReplaceAllActionState(!this.viewModel.searchResult.isEmpty());
			this.updateSearchResultCount();
		});
	}

	private refreshTree(event?: IChangeEvent): TPromise<any> {
		if (!event || event.added || event.removed) {
			return this.tree.refresh(this.viewModel.searchResult);
		} else {
			if (event.elements.length === 1) {
				return this.tree.refresh(event.elements[0]);
			} else {
				return this.tree.refresh(event.elements);
			}
		}
	}

	private replaceAll(): void {
		if (this.viewModel.searchResult.count() === 0) {
			return;
		}

		let progressRunner = this.progressService.show(100);

		let occurrences = this.viewModel.searchResult.count();
		let fileCount = this.viewModel.searchResult.fileCount();
		let replaceValue = this.searchWidget.getReplaceValue() || '';
		let afterReplaceAllMessage = this.buildAfterReplaceAllMessage(occurrences, fileCount, replaceValue);

		let confirmation: IConfirmation = {
			title: nls.localize('replaceAll.confirmation.title', "Replace All"),
			message: this.buildReplaceAllConfirmationMessage(occurrences, fileCount, replaceValue),
			primaryButton: nls.localize('replaceAll.confirm.button', "&&Replace"),
			type: 'question'
		};

		this.confirmationService.confirm(confirmation).then(confirmed => {
			if (confirmed) {
				this.searchWidget.setReplaceAllActionState(false);
				this.viewModel.searchResult.replaceAll(progressRunner).then(() => {
					progressRunner.done();
					this.clearMessage()
						.p({ text: afterReplaceAllMessage });
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

	private clearMessage(): Builder {
		this.searchWithoutFolderMessageBuilder = void 0;

		return this.messages.empty().show()
			.asContainer().div({ 'class': 'message' })
			.asContainer();
	}

	private createSearchResultsView(builder: Builder): void {
		builder.div({ 'class': 'results' }, (div) => {
			this.results = div;
			this.results.addClass('show-file-icons');

			let dataSource = this.instantiationService.createInstance(SearchDataSource);
			this.toUnbind.push(dataSource);

			let renderer = this.instantiationService.createInstance(SearchRenderer, this.getActionRunner(), this);
			this.toUnbind.push(renderer);

			let dnd = this.instantiationService.createInstance(SimpleFileResourceDragAndDrop, (obj: any) => obj instanceof FileMatch ? obj.resource() : void 0);

			this.tree = this.instantiationService.createInstance(WorkbenchTree, div.getHTMLElement(), {
				dataSource: dataSource,
				renderer: renderer,
				sorter: new SearchSorter(),
				filter: new SearchFilter(),
				accessibilityProvider: this.instantiationService.createInstance(SearchAccessibilityProvider),
				dnd
			}, {
					ariaLabel: nls.localize('treeAriaLabel', "Search Results")
				});

			this.tree.setInput(this.viewModel.searchResult);
			this.toUnbind.push(renderer);

			const searchResultsNavigator = this._register(new TreeResourceNavigator(this.tree, { openOnFocus: true }));
			this._register(debounceEvent(searchResultsNavigator.openResource, (last, event) => event, 75, true)(options => {
				if (options.element instanceof Match) {
					let selectedMatch: Match = options.element;
					if (this.currentSelectedFileMatch) {
						this.currentSelectedFileMatch.setSelectedMatch(null);
					}
					this.currentSelectedFileMatch = selectedMatch.parent();
					this.currentSelectedFileMatch.setSelectedMatch(selectedMatch);
					if (!(options.payload && options.payload.preventEditorOpen)) {
						this.onFocus(selectedMatch, options.editorOptions.preserveFocus, options.sideBySide, options.editorOptions.pinned);
					}
				}
			}));

			let treeHasFocus = false;
			this.tree.onDidFocus(() => {
				treeHasFocus = true;
			});

			this.toUnbind.push(this.tree.onDidChangeFocus((e: IFocusEvent) => {
				if (treeHasFocus) {
					const focus = e.focus;
					this.firstMatchFocused.set(this.tree.getNavigator().first() === focus);
					this.fileMatchOrMatchFocused.set(true);
					this.fileMatchFocused.set(focus instanceof FileMatch);
					this.folderMatchFocused.set(focus instanceof FolderMatch);
					this.matchFocused.set(focus instanceof Match);
				}
			}));

			this.toUnbind.push(this.tree.onDidBlur(e => {
				treeHasFocus = false;
				this.firstMatchFocused.reset();
				this.fileMatchOrMatchFocused.reset();
				this.fileMatchFocused.reset();
				this.folderMatchFocused.reset();
				this.matchFocused.reset();
			}));


		});
	}

	public selectCurrentMatch(): void {
		const focused = this.tree.getFocus();
		const eventPayload = { focusEditor: true };
		this.tree.setSelection([focused], eventPayload);
	}

	public selectNextMatch(): void {
		const [selected]: FileMatchOrMatch[] = this.tree.getSelection();

		// Expand the initial selected node, if needed
		if (selected instanceof FileMatch) {
			if (!this.tree.isExpanded(selected)) {
				this.tree.expand(selected);
			}
		}

		let navigator = this.tree.getNavigator(selected, /*subTreeOnly=*/false);

		let next = navigator.next();
		if (!next) {
			// Reached the end - get a new navigator from the root.
			// .first and .last only work when subTreeOnly = true. Maybe there's a simpler way.
			navigator = this.tree.getNavigator(this.tree.getInput(), /*subTreeOnly*/true);
			next = navigator.first();
		}

		// Expand and go past FileMatch nodes
		if (!(next instanceof Match)) {
			if (!this.tree.isExpanded(next)) {
				this.tree.expand(next);
			}

			// Select the FileMatch's first child
			next = navigator.next();
		}

		// Reveal the newly selected element
		if (next) {
			const eventPayload = { preventEditorOpen: true };
			this.tree.setFocus(next, eventPayload);
			this.tree.setSelection([next], eventPayload);
			this.tree.reveal(next);
			this.selectCurrentMatchEmitter.fire();
		}
	}

	public selectPreviousMatch(): void {
		const [selected]: FileMatchOrMatch[] = this.tree.getSelection();
		let navigator = this.tree.getNavigator(selected, /*subTreeOnly=*/false);

		let prev = navigator.previous();

		// Expand and go past FileMatch nodes
		if (!(prev instanceof Match)) {
			prev = navigator.previous();
			if (!prev) {
				// Wrap around. Get a new tree starting from the root
				navigator = this.tree.getNavigator(this.tree.getInput(), /*subTreeOnly*/true);
				prev = navigator.last();

				// This is complicated because .last will set the navigator to the last FileMatch,
				// so expand it and FF to its last child
				this.tree.expand(prev);
				let tmp;
				while (tmp = navigator.next()) {
					prev = tmp;
				}
			}

			if (!(prev instanceof Match)) {
				// There is a second non-Match result, which must be a collapsed FileMatch.
				// Expand it then select its last child.
				navigator.next();
				this.tree.expand(prev);
				prev = navigator.previous();
			}
		}

		// Reveal the newly selected element
		if (prev) {
			const eventPayload = { preventEditorOpen: true };
			this.tree.setFocus(prev, eventPayload);
			this.tree.setSelection([prev], eventPayload);
			this.tree.reveal(prev);
			this.selectCurrentMatchEmitter.fire();
		}
	}

	public setVisible(visible: boolean): TPromise<void> {
		let promise: TPromise<void>;
		this.viewletVisible.set(visible);
		if (visible) {
			if (this.changedWhileHidden) {
				// Render if results changed while viewlet was hidden - #37818
				this.refreshAndUpdateCount();
				this.changedWhileHidden = false;
			}

			promise = super.setVisible(visible);
			this.tree.onVisible();
		} else {
			this.tree.onHidden();
			promise = super.setVisible(visible);
		}

		// Enable highlights if there are searchresults
		if (this.viewModel) {
			this.viewModel.searchResult.toggleHighlights(visible);
		}

		// Open focused element from results in case the editor area is otherwise empty
		if (visible && !this.editorService.getActiveEditor()) {
			let focus = this.tree.getFocus();
			if (focus) {
				this.onFocus(focus, true);
			}
		}

		return promise;
	}

	public focus(): void {
		super.focus();

		let updatedText = false;
		const seedSearchStringFromSelection = this.configurationService.getValue<IEditorOptions>('editor').find.seedSearchStringFromSelection;
		if (seedSearchStringFromSelection) {
			const selectedText = this.getSearchTextFromEditor();
			if (selectedText) {
				this.searchWidget.searchInput.setValue(selectedText);
				updatedText = true;
			}
		}

		this.searchWidget.focus(undefined, undefined, updatedText);
	}

	public focusNextInputBox(): void {
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

	public focusPreviousInputBox(): void {
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

		this.searchWidget.setWidth(this.size.width - 28 /* container margin */);

		this.inputPatternExcludes.setWidth(this.size.width - 28 /* container margin */);
		this.inputPatternIncludes.setWidth(this.size.width - 28 /* container margin */);

		const messagesSize = this.messages.isHidden() ? 0 : dom.getTotalHeight(this.messages.getHTMLElement());
		const searchResultContainerSize = this.size.height -
			messagesSize -
			dom.getTotalHeight(this.searchWidgetsContainer.getContainer());

		this.results.style({ height: searchResultContainerSize + 'px' });

		this.tree.layout(searchResultContainerSize);
	}

	public layout(dimension: Dimension): void {
		this.size = dimension;
		this.reLayout();
	}

	public getControl(): ITree {
		return this.tree;
	}

	public isSearchSubmitted(): boolean {
		return this.searchSubmitted;
	}

	public isSearching(): boolean {
		return this.searching;
	}

	public hasSearchResults(): boolean {
		return !this.viewModel.searchResult.isEmpty();
	}

	public clearSearchResults(): void {
		this.viewModel.searchResult.clear();
		this.showEmptyStage();
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.searchWithoutFolderMessage(this.clearMessage());
		}
		this.searchWidget.clear();
		this.viewModel.cancelSearch();
	}

	public cancelSearch(): boolean {
		if (this.viewModel.cancelSearch()) {
			this.searchWidget.focus();
			return true;
		}
		return false;
	}

	private selectTreeIfNotSelected(): void {
		if (this.tree.getInput()) {
			this.tree.domFocus();
			let selection = this.tree.getSelection();
			if (selection.length === 0) {
				this.tree.focusNext();
			}
		}
	}

	private getSearchTextFromEditor(): string {
		if (!this.editorService.getActiveEditor()) {
			return null;
		}

		let editorControl = this.editorService.getActiveEditor().getControl();
		if (isDiffEditor(editorControl)) {
			if (editorControl.getOriginalEditor().isFocused()) {
				editorControl = editorControl.getOriginalEditor();
			} else {
				editorControl = editorControl.getModifiedEditor();
			}
		}

		if (!isCodeEditor(editorControl)) {
			return null;
		}

		const codeEditor: ICodeEditor = <ICodeEditor>editorControl;
		const range = codeEditor.getSelection();
		if (!range) {
			return null;
		}

		if (range.isEmpty() && !this.searchWidget.searchInput.getValue()) {
			const wordAtPosition = codeEditor.getModel().getWordAtPosition(range.getStartPosition());
			if (wordAtPosition) {
				return wordAtPosition.word;
			}
		}

		if (!range.isEmpty() && range.startLineNumber === range.endLineNumber) {
			let searchText = editorControl.getModel().getLineContent(range.startLineNumber);
			searchText = searchText.substring(range.startColumn - 1, range.endColumn - 1);
			return searchText;
		}

		return null;
	}

	private showsFileTypes(): boolean {
		return dom.hasClass(this.queryDetails, 'more');
	}

	public toggleCaseSensitive(): void {
		this.searchWidget.searchInput.setCaseSensitive(!this.searchWidget.searchInput.getCaseSensitive());
		this.onQueryChanged(true, true);
	}

	public toggleWholeWords(): void {
		this.searchWidget.searchInput.setWholeWords(!this.searchWidget.searchInput.getWholeWords());
		this.onQueryChanged(true, true);
	}

	public toggleRegex(): void {
		this.searchWidget.searchInput.setRegex(!this.searchWidget.searchInput.getRegex());
		this.onQueryChanged(true, true);
	}

	public toggleQueryDetails(moveFocus?: boolean, show?: boolean, skipLayout?: boolean, reverse?: boolean): void {
		let cls = 'more';
		show = typeof show === 'undefined' ? !dom.hasClass(this.queryDetails, cls) : Boolean(show);
		this.viewletSettings['query.queryDetailsExpanded'] = show;
		skipLayout = Boolean(skipLayout);

		if (show) {
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
			dom.removeClass(this.queryDetails, cls);
			if (moveFocus) {
				this.searchWidget.focus();
			}
		}

		if (!skipLayout && this.size) {
			this.layout(this.size);
		}
	}

	public searchInFolders(resources: URI[], pathToRelative: (from: string, to: string) => string): void {
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
						const owningRootBasename = paths.basename(owningFolder.uri.fsPath);

						// If this root is the only one with its basename, use a relative ./ path. If there is another, use an absolute path
						const isUniqueFolder = workspace.folders.filter(folder => paths.basename(folder.uri.fsPath) === owningRootBasename).length === 1;
						if (isUniqueFolder) {
							folderPath = `./${owningRootBasename}/${paths.normalize(pathToRelative(owningFolder.uri.fsPath, resource.fsPath))}`;
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

	public onQueryChanged(rerunQuery: boolean, preserveFocus?: boolean): void {
		const isRegex = this.searchWidget.searchInput.getRegex();
		const isWholeWords = this.searchWidget.searchInput.getWholeWords();
		const isCaseSensitive = this.searchWidget.searchInput.getCaseSensitive();
		const contentPattern = this.searchWidget.searchInput.getValue();
		const excludePatternText = this.inputPatternExcludes.getValue().trim();
		const includePatternText = this.inputPatternIncludes.getValue().trim();
		const useExcludesAndIgnoreFiles = this.inputPatternExcludes.useExcludesAndIgnoreFiles();

		if (!rerunQuery) {
			return;
		}

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
			isWordMatch: isWholeWords,
			wordSeparators: this.configurationService.getValue<ISearchConfiguration>().editor.wordSeparators,
			isSmartCase: this.configurationService.getValue<ISearchConfiguration>().search.smartCase
		};

		const excludePattern = this.inputPatternExcludes.getValue();
		const includePattern = this.inputPatternIncludes.getValue();

		const options: IQueryOptions = {
			extraFileResources: getOutOfWorkspaceEditorResources(this.editorGroupService, this.contextService),
			maxResults: SearchView.MAX_TEXT_RESULTS,
			disregardIgnoreFiles: !useExcludesAndIgnoreFiles,
			disregardExcludeSettings: !useExcludesAndIgnoreFiles,
			excludePattern,
			includePattern
		};
		const folderResources = this.contextService.getWorkspace().folders;

		const onQueryValidationError = (err: Error) => {
			this.searchWidget.searchInput.showMessage({ content: err.message, type: MessageType.ERROR });
			this.viewModel.searchResult.clear();
		};

		let query: ISearchQuery;
		try {
			query = this.queryBuilder.text(content, folderResources.map(folder => folder.uri), options);
		} catch (err) {
			onQueryValidationError(err);
			return;
		}

		this.validateQuery(query).then(() => {
			this.onQueryTriggered(query, excludePatternText, includePatternText);

			if (!preserveFocus) {
				this.searchWidget.focus(false); // focus back to input field
			}
		}, onQueryValidationError);
	}

	private validateQuery(query: ISearchQuery): TPromise<void> {
		// Validate folderQueries
		const folderQueriesExistP =
			query.folderQueries.map(fq => {
				return this.fileService.existsFile(fq.folder);
			});

		return TPromise.join(folderQueriesExistP).then(existResults => {
			// If no folders exist, show an error message about the first one
			const existingFolderQueries = query.folderQueries.filter((folderQuery, i) => existResults[i]);
			if (!query.folderQueries.length || existingFolderQueries.length) {
				query.folderQueries = existingFolderQueries;
			} else {
				const nonExistantPath = query.folderQueries[0].folder.fsPath;
				const searchPathNotFoundError = nls.localize('searchPathNotFoundError', "Search path not found: {0}", nonExistantPath);
				return TPromise.wrapError(new Error(searchPathNotFoundError));
			}

			return undefined;
		});
	}

	private onQueryTriggered(query: ISearchQuery, excludePatternText: string, includePatternText: string): void {
		this.inputPatternExcludes.onSearchSubmit();
		this.inputPatternIncludes.onSearchSubmit();

		this.viewModel.cancelSearch();

		// Progress total is 100.0% for more progress bar granularity
		let progressTotal = 1000;
		let progressWorked = 0;

		let progressRunner = query.useRipgrep ?
			this.progressService.show(/*infinite=*/true) :
			this.progressService.show(progressTotal);

		this.searchWidget.searchInput.clearMessage();
		this.searching = true;
		setTimeout(() => {
			if (this.searching) {
				this.changeActionAtPosition(0, this.instantiationService.createInstance(CancelSearchAction, CancelSearchAction.ID, CancelSearchAction.LABEL));
			}
		}, 2000);
		this.showEmptyStage();

		let onComplete = (completed?: ISearchComplete) => {
			this.searching = false;
			this.changeActionAtPosition(0, this.instantiationService.createInstance(RefreshAction, RefreshAction.ID, RefreshAction.LABEL));

			// Complete up to 100% as needed
			if (completed && !query.useRipgrep) {
				progressRunner.worked(progressTotal - progressWorked);
				setTimeout(() => progressRunner.done(), 200);
			} else {
				progressRunner.done();
			}

			// Do final render, then expand if just 1 file with less than 50 matches
			this.onSearchResultsChanged().then(() => {
				if (this.viewModel.searchResult.count() === 1) {
					const onlyMatch = this.viewModel.searchResult.matches()[0];
					if (onlyMatch.count() < 50) {
						return this.tree.expand(onlyMatch);
					}
				}

				return null;
			}).done(null, errors.onUnexpectedError);

			this.viewModel.replaceString = this.searchWidget.getReplaceValue();

			let hasResults = !this.viewModel.searchResult.isEmpty();

			this.searchSubmitted = true;
			this.updateActions();

			if (completed && completed.limitHit) {
				this.searchWidget.searchInput.showMessage({
					content: nls.localize('searchMaxResultsWarning', "The result set only contains a subset of all matches. Please be more specific in your search to narrow down the results."),
					type: MessageType.WARNING
				});
			}

			if (!hasResults) {
				let hasExcludes = !!excludePatternText;
				let hasIncludes = !!includePatternText;
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

				this.tree.onHidden();
				this.results.hide();
				const div = this.clearMessage();
				const p = $(div).p({ text: message });

				if (!completed) {
					$(p).a({
						'class': ['pointer', 'prominent'],
						text: nls.localize('rerunSearch.message', "Search again")
					}).on(dom.EventType.CLICK, (e: MouseEvent) => {
						dom.EventHelper.stop(e, false);

						this.onQueryChanged(true);
					});
				} else if (hasIncludes || hasExcludes) {
					$(p).a({
						'class': ['pointer', 'prominent'],
						'tabindex': '0',
						text: nls.localize('rerunSearchInAll.message', "Search again in all files")
					}).on(dom.EventType.CLICK, (e: MouseEvent) => {
						dom.EventHelper.stop(e, false);

						this.inputPatternExcludes.setValue('');
						this.inputPatternIncludes.setValue('');

						this.onQueryChanged(true);
					});
				} else {
					$(p).a({
						'class': ['pointer', 'prominent'],
						'tabindex': '0',
						text: nls.localize('openSettings.message', "Open Settings")
					}).on(dom.EventType.CLICK, (e: MouseEvent) => {
						dom.EventHelper.stop(e, false);

						let editorPromise = this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? this.preferencesService.openWorkspaceSettings() : this.preferencesService.openGlobalSettings();
						editorPromise.done(editor => {
							if (editor instanceof PreferencesEditor) {
								editor.focusSearch('.exclude');
							}
						}, errors.onUnexpectedError);
					});
				}

				if (completed) {
					$(p).span({
						text: ' - '
					});

					$(p).a({
						'class': ['pointer', 'prominent'],
						'tabindex': '0',
						text: nls.localize('openSettings.learnMore', "Learn More")
					}).on(dom.EventType.CLICK, (e: MouseEvent) => {
						dom.EventHelper.stop(e, false);

						window.open('https://go.microsoft.com/fwlink/?linkid=853977');
					});
				}

				if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
					this.searchWithoutFolderMessage(div);
				}
			} else {
				this.viewModel.searchResult.toggleHighlights(true); // show highlights

				// Indicate final search result count for ARIA
				aria.status(nls.localize('ariaSearchResultsStatus', "Search returned {0} results in {1} files", this.viewModel.searchResult.count(), this.viewModel.searchResult.fileCount()));
			}
		};

		let onError = (e: any) => {
			if (errors.isPromiseCanceledError(e)) {
				onComplete(null);
			} else {
				this.searching = false;
				this.changeActionAtPosition(0, this.instantiationService.createInstance(RefreshAction, RefreshAction.ID, RefreshAction.LABEL));
				progressRunner.done();
				this.searchWidget.searchInput.showMessage({ content: e.message, type: MessageType.ERROR });
				this.viewModel.searchResult.clear();
			}
		};

		let total: number = 0;
		let worked: number = 0;
		let visibleMatches = 0;
		let onProgress = (p: ISearchProgressItem) => {
			// Progress
			if (p.total) {
				total = p.total;
			}
			if (p.worked) {
				worked = p.worked;
			}
		};

		// Handle UI updates in an interval to show frequent progress and results
		let uiRefreshHandle = setInterval(() => {
			if (!this.searching) {
				window.clearInterval(uiRefreshHandle);
				return;
			}

			if (!query.useRipgrep) {
				// Progress bar update
				let fakeProgress = true;
				if (total > 0 && worked > 0) {
					let ratio = Math.round((worked / total) * progressTotal);
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
				this.tree.refresh().done(null, errors.onUnexpectedError);

				this.updateSearchResultCount();
			}
			if (fileCount > 0) {
				this.updateActions();
			}
		}, 100);

		this.searchWidget.setReplaceAllActionState(false);

		this.viewModel.search(query).done(onComplete, onError, onProgress);
	}

	private updateSearchResultCount(): void {
		const fileCount = this.viewModel.searchResult.fileCount();
		const msgWasHidden = this.messages.isHidden();
		if (fileCount > 0) {
			const div = this.clearMessage();
			$(div).p({ text: this.buildResultCountMessage(this.viewModel.searchResult.count(), fileCount) });
			if (msgWasHidden) {
				this.reLayout();
			}
		} else if (!msgWasHidden) {
			this.messages.hide();
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

	private searchWithoutFolderMessage(div: Builder): void {
		this.searchWithoutFolderMessageBuilder = $(div);

		this.searchWithoutFolderMessageBuilder.p({ text: nls.localize('searchWithoutFolder', "You have not yet opened a folder. Only open files are currently searched - ") })
			.asContainer().a({
				'class': ['pointer', 'prominent'],
				'tabindex': '0',
				text: nls.localize('openFolder', "Open Folder")
			}).on(dom.EventType.CLICK, (e: MouseEvent) => {
				dom.EventHelper.stop(e, false);

				const actionClass = env.isMacintosh ? OpenFileFolderAction : OpenFolderAction;
				const action = this.instantiationService.createInstance<string, string, IAction>(actionClass, actionClass.ID, actionClass.LABEL);
				this.actionRunner.run(action).done(() => {
					action.dispose();
				}, err => {
					action.dispose();
					errors.onUnexpectedError(err);
				});
			});
	}

	private showEmptyStage(): void {

		// disable 'result'-actions
		this.searchSubmitted = false;
		this.updateActions();

		// clean up ui
		// this.replaceService.disposeAllReplacePreviews();
		this.messages.hide();
		this.results.show();
		this.tree.onVisible();
		this.currentSelectedFileMatch = null;
	}

	private onFocus(lineMatch: any, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): TPromise<any> {
		if (!(lineMatch instanceof Match)) {
			this.viewModel.searchResult.rangeHighlightDecorations.removeHighlightRange();
			return TPromise.as(true);
		}

		return (this.viewModel.isReplaceActive() && !!this.viewModel.replaceString) ?
			this.replaceService.openReplacePreview(lineMatch, preserveFocus, sideBySide, pinned) :
			this.open(lineMatch, preserveFocus, sideBySide, pinned);
	}

	public open(element: FileMatchOrMatch, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): TPromise<any> {
		let selection = this.getSelectionFrom(element);
		let resource = element instanceof Match ? element.parent().resource() : (<FileMatch>element).resource();
		return this.editorService.openEditor({
			resource: resource,
			options: {
				preserveFocus,
				pinned,
				selection,
				revealIfVisible: true
			}
		}, sideBySide).then(editor => {
			if (editor && element instanceof Match && preserveFocus) {
				this.viewModel.searchResult.rangeHighlightDecorations.highlightRange(
					(<ICodeEditor>editor.getControl()).getModel(),
					element.range()
				);
			} else {
				this.viewModel.searchResult.rangeHighlightDecorations.removeHighlightRange();
			}
		}, errors.onUnexpectedError);
	}

	private getSelectionFrom(element: FileMatchOrMatch): any {
		let match: Match = null;
		if (element instanceof Match) {
			match = element;
		}
		if (element instanceof FileMatch && element.count() > 0) {
			match = element.matches()[element.matches().length - 1];
		}
		if (match) {
			let range = match.range();
			if (this.viewModel.isReplaceActive() && !!this.viewModel.replaceString) {
				let replaceString = match.replaceString;
				return {
					startLineNumber: range.startLineNumber,
					startColumn: range.startColumn,
					endLineNumber: range.startLineNumber,
					endColumn: range.startColumn + replaceString.length
				};
			}
			return range;
		}
		return void 0;
	}

	private onUntitledDidChangeDirty(resource: URI): void {
		if (!this.viewModel) {
			return;
		}

		// remove search results from this resource as it got disposed
		if (!this.untitledEditorService.isDirty(resource)) {
			let matches = this.viewModel.searchResult.matches();
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

		let matches = this.viewModel.searchResult.matches();

		for (let i = 0, len = matches.length; i < len; i++) {
			if (e.contains(matches[i].resource(), FileChangeType.DELETED)) {
				this.viewModel.searchResult.remove(matches[i]);
			}
		}
	}

	public getActions(): IAction[] {
		return this.actions;
	}

	private changeActionAtPosition(index: number, newAction: ClearSearchResultsAction | CancelSearchAction | RefreshAction | CollapseDeepestExpandedLevelAction): void {
		this.actions.splice(index, 1, newAction);
		this.updateTitleArea();
	}

	public shutdown(): void {
		const isRegex = this.searchWidget.searchInput.getRegex();
		const isWholeWords = this.searchWidget.searchInput.getWholeWords();
		const isCaseSensitive = this.searchWidget.searchInput.getCaseSensitive();
		const contentPattern = this.searchWidget.searchInput.getValue();
		const patternExcludes = this.inputPatternExcludes.getValue().trim();
		const patternIncludes = this.inputPatternIncludes.getValue().trim();
		const useExcludesAndIgnoreFiles = this.inputPatternExcludes.useExcludesAndIgnoreFiles();
		const searchHistory = this.searchWidget.getHistory();
		const patternExcludesHistory = this.inputPatternExcludes.getHistory();
		const patternIncludesHistory = this.inputPatternIncludes.getHistory();

		// store memento
		this.viewletSettings['query.contentPattern'] = contentPattern;
		this.viewletSettings['query.searchHistory'] = searchHistory;
		this.viewletSettings['query.regex'] = isRegex;
		this.viewletSettings['query.wholeWords'] = isWholeWords;
		this.viewletSettings['query.caseSensitive'] = isCaseSensitive;
		this.viewletSettings['query.folderExclusions'] = patternExcludes;
		this.viewletSettings['query.folderIncludes'] = patternIncludes;
		this.viewletSettings['query.folderExclusionsHistory'] = patternExcludesHistory;
		this.viewletSettings['query.folderIncludesHistory'] = patternIncludesHistory;
		this.viewletSettings['query.useExcludesAndIgnoreFiles'] = useExcludesAndIgnoreFiles;

		super.shutdown();
	}

	public dispose(): void {
		this.isDisposed = true;

		if (this.tree) {
			this.tree.dispose();
		}

		this.searchWidget.dispose();
		this.inputPatternIncludes.dispose();
		this.inputPatternExcludes.dispose();

		this.viewModel.dispose();

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
		collector.addRule(`.monaco-workbench .search-view .replaceMatch:not(:empty) { border: 1px dashed ${diffInsertedOutlineColor}; }`);
	}

	const diffRemovedOutlineColor = theme.getColor(diffRemovedOutline);
	if (diffRemovedOutlineColor) {
		collector.addRule(`.monaco-workbench .search-view .replace.findInFileMatch { border: 1px dashed ${diffRemovedOutlineColor}; }`);
	}

	const findMatchHighlightBorder = theme.getColor(editorFindMatchHighlightBorder);
	if (findMatchHighlightBorder) {
		collector.addRule(`.monaco-workbench .search-view .findInFileMatch { border: 1px dashed ${findMatchHighlightBorder}; }`);
	}
});
