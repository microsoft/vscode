/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/searchviewlet';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { Emitter, debounceEvent } from 'vs/base/common/event';
import { ICommonCodeEditor, isCommonCodeEditor, isCommonDiffEditor } from 'vs/editor/common/editorCommon';
import lifecycle = require('vs/base/common/lifecycle');
import errors = require('vs/base/common/errors');
import aria = require('vs/base/browser/ui/aria/aria');
import env = require('vs/base/common/platform');
import { Delayer } from 'vs/base/common/async';
import URI from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import * as paths from 'vs/base/common/paths';
import dom = require('vs/base/browser/dom');
import { IAction, Action } from 'vs/base/common/actions';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Dimension, Builder, $ } from 'vs/base/browser/builder';
import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { Scope } from 'vs/workbench/common/memento';
import { IPreferencesService } from 'vs/workbench/parts/preferences/common/preferences';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { FileChangeType, FileChangesEvent, IFileService } from 'vs/platform/files/common/files';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { Match, FileMatch, SearchModel, FileMatchOrMatch, IChangeEvent, ISearchWorkbenchService } from 'vs/workbench/parts/search/common/searchModel';
import { QueryBuilder } from 'vs/workbench/parts/search/common/queryBuilder';
import { MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { ISearchProgressItem, ISearchComplete, ISearchQuery, IQueryOptions, ISearchConfiguration } from 'vs/platform/search/common/search';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, IConfirmation } from 'vs/platform/message/common/message';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { PatternInputWidget, ExcludePatternInputWidget } from 'vs/workbench/parts/search/browser/patternInputWidget';
import { SearchRenderer, SearchDataSource, SearchSorter, SearchAccessibilityProvider, SearchFilter } from 'vs/workbench/parts/search/browser/searchResultsView';
import { SearchWidget, ISearchWidgetOptions } from 'vs/workbench/parts/search/browser/searchWidget';
import { RefreshAction, CollapseAllAction, ClearSearchResultsAction } from 'vs/workbench/parts/search/browser/searchActions';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import Severity from 'vs/base/common/severity';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { OpenFolderAction, OpenFileFolderAction } from 'vs/workbench/browser/actions/workspaceActions';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { IListService } from 'vs/platform/list/browser/listService';
import { IThemeService, ITheme, ICssStyleCollector, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorFindMatchHighlight, diffInserted, diffRemoved, diffInsertedOutline, diffRemovedOutline, activeContrastBorder } from 'vs/platform/theme/common/colorRegistry';
import FileResultsNavigation from 'vs/workbench/parts/files/browser/fileResultsNavigation';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IOutputService } from 'vs/workbench/parts/output/common/output';
import { getOutOfWorkspaceEditorResources } from 'vs/workbench/parts/search/common/search';
import { PreferencesEditor } from 'vs/workbench/parts/preferences/browser/preferencesEditor';
import { SimpleFileResourceDragAndDrop } from 'vs/base/parts/tree/browser/treeDnd';

export class SearchViewlet extends Viewlet {

	private static MAX_TEXT_RESULTS = 10000;
	private static SHOW_REPLACE_STORAGE_KEY = 'vs.search.show.replace';

	private isDisposed: boolean;

	private loading: boolean;
	private queryBuilder: QueryBuilder;
	private viewModel: SearchModel;
	private callOnModelChange: lifecycle.IDisposable[];

	private viewletVisible: IContextKey<boolean>;
	private inputBoxFocused: IContextKey<boolean>;
	private inputPatternIncludesFocused: IContextKey<boolean>;
	private inputPatternExclusionsFocused: IContextKey<boolean>;
	private firstMatchFocused: IContextKey<boolean>;
	private fileMatchOrMatchFocused: IContextKey<boolean>;
	private fileMatchFocused: IContextKey<boolean>;
	private matchFocused: IContextKey<boolean>;

	private actionRegistry: { [key: string]: Action; };
	private tree: ITree;
	private viewletSettings: any;
	private domNode: Builder;
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

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IFileService private fileService: IFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IProgressService private progressService: IProgressService,
		@IMessageService private messageService: IMessageService,
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
		@IListService private listService: IListService,
		@IThemeService protected themeService: IThemeService,
		@IOutputService private outputService: IOutputService
	) {
		super(Constants.VIEWLET_ID, telemetryService, themeService);

		this.viewletVisible = Constants.SearchViewletVisibleKey.bindTo(contextKeyService);
		this.inputBoxFocused = Constants.InputBoxFocusedKey.bindTo(this.contextKeyService);
		this.inputPatternIncludesFocused = Constants.PatternIncludesFocusedKey.bindTo(this.contextKeyService);
		this.inputPatternExclusionsFocused = Constants.PatternExcludesFocusedKey.bindTo(this.contextKeyService);
		this.firstMatchFocused = Constants.FirstMatchFocusKey.bindTo(contextKeyService);
		this.fileMatchOrMatchFocused = Constants.FileMatchOrMatchFocusKey.bindTo(contextKeyService);
		this.fileMatchFocused = Constants.FileFocusKey.bindTo(contextKeyService);
		this.matchFocused = Constants.MatchFocusKey.bindTo(this.contextKeyService);
		this.callOnModelChange = [];

		this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
		this.viewletSettings = this.getMemento(storageService, Scope.WORKSPACE);

		this.toUnbind.push(this.fileService.onFileChanges(e => this.onFilesChanged(e)));
		this.toUnbind.push(this.untitledEditorService.onDidChangeDirty(e => this.onUntitledDidChangeDirty(e)));

		this.selectCurrentMatchEmitter = new Emitter<string>();
		debounceEvent(this.selectCurrentMatchEmitter.event, (l, e) => e, 100, /*leading=*/true)
			(() => this.selectCurrentMatch());

		this.delayedRefresh = new Delayer<void>(250);
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.viewModel = this.searchWorkbenchService.searchModel;
		let builder: Builder;
		this.domNode = parent.div({
			'class': 'search-viewlet'
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
		const useIgnoreFiles = typeof this.viewletSettings['query.useIgnoreFiles'] === 'boolean' ?
			this.viewletSettings['query.useIgnoreFiles'] :
			this.configurationService.getConfiguration<ISearchConfiguration>().search.useIgnoreFilesByDefault;
		const useExcludeSettings = true;

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

				this.inputPatternExcludes = new ExcludePatternInputWidget(builder.getContainer(), this.contextViewService, this.themeService, this.telemetryService, {
					ariaLabel: nls.localize('label.excludes', 'Search Exclude Patterns')
				});

				this.inputPatternExcludes.setValue(patternExclusions);
				this.inputPatternExcludes.setUseIgnoreFiles(useIgnoreFiles);
				this.inputPatternExcludes.setUseExcludeSettings(useExcludeSettings);
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
		if (!this.contextService.hasWorkspace()) {
			this.searchWithoutFolderMessage(this.clearMessage());
		}

		this.createSearchResultsView(builder);

		this.actionRegistry = <any>{};
		let actions: Action[] = [new CollapseAllAction(this), new RefreshAction(this), new ClearSearchResultsAction(this)];
		actions.forEach((action) => {
			this.actionRegistry[action.id] = action;
		});

		if (filePatterns !== '' || patternExclusions !== '' || patternIncludes !== '' || queryDetailsExpanded !== '') {
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

		if (this.storageService.getBoolean(SearchViewlet.SHOW_REPLACE_STORAGE_KEY, StorageScope.WORKSPACE, true)) {
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
		this.toUnbind.push(inputFocusTracker.addFocusListener(() => {
			this.inputBoxFocused.set(true);
			if (contextKey) {
				contextKey.set(true);
			}
		}));
		this.toUnbind.push(inputFocusTracker.addBlurListener(() => {
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
			this.storageService.store(SearchViewlet.SHOW_REPLACE_STORAGE_KEY, false, StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(SearchViewlet.SHOW_REPLACE_STORAGE_KEY);
		}
	}

	private onSearchResultsChanged(event?: IChangeEvent): TPromise<any> {
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
			primaryButton: nls.localize('replaceAll.confirm.button', "Replace"),
			type: 'question'
		};

		if (this.messageService.confirm(confirmation)) {
			this.searchWidget.setReplaceAllActionState(false);
			this.viewModel.searchResult.replaceAll(progressRunner).then(() => {
				progressRunner.done();
				this.clearMessage()
					.p({ text: afterReplaceAllMessage });
			}, (error) => {
				progressRunner.done();
				errors.isPromiseCanceledError(error);
				this.messageService.show(Severity.Error, error);
			});
		}
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
		return this.messages.empty().show()
			.asContainer().div({ 'class': 'message' })
			.asContainer();
	}

	private createSearchResultsView(builder: Builder): void {
		builder.div({ 'class': 'results' }, (div) => {
			this.results = div;
			this.results.addClass('show-file-icons');

			let dataSource = new SearchDataSource(this.contextService.hasMultiFolderWorkspace());
			let renderer = this.instantiationService.createInstance(SearchRenderer, this.getActionRunner(), this);
			let dnd = new SimpleFileResourceDragAndDrop(obj => obj instanceof FileMatch ? obj.resource() : void 0);

			this.tree = new Tree(div.getHTMLElement(), {
				dataSource: dataSource,
				renderer: renderer,
				sorter: new SearchSorter(),
				filter: new SearchFilter(),
				accessibilityProvider: this.instantiationService.createInstance(SearchAccessibilityProvider),
				dnd
			}, {
					ariaLabel: nls.localize('treeAriaLabel', "Search Results"),
					keyboardSupport: false
				});

			this.toUnbind.push(attachListStyler(this.tree, this.themeService));

			this.tree.setInput(this.viewModel.searchResult);
			this.toUnbind.push(renderer);

			this.toUnbind.push(this.listService.register(this.tree));
			const fileResultsNavigation = this._register(new FileResultsNavigation(this.tree));
			this._register(debounceEvent(fileResultsNavigation.openFile, (last, event) => event, 75, true)(options => {
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

			this.toUnbind.push(this.tree.onDOMFocus(e => {
				const focus = this.tree.getFocus();
				this.firstMatchFocused.set(this.tree.getNavigator().first() === this.tree.getFocus());
				this.fileMatchOrMatchFocused.set(true);
				this.fileMatchFocused.set(focus instanceof FileMatch);
				this.matchFocused.set(focus instanceof Match);
			}));

			this.toUnbind.push(this.tree.onDOMBlur(e => {
				this.firstMatchFocused.reset();
				this.fileMatchOrMatchFocused.reset();
				this.fileMatchFocused.reset();
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
		const eventPayload = { preventEditorOpen: true };
		this.tree.setFocus(next, eventPayload);
		this.tree.setSelection([next], eventPayload);
		this.tree.reveal(next);
		this.selectCurrentMatchEmitter.fire();
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

		let selectedText = this.getSearchTextFromEditor();
		if (selectedText) {
			this.searchWidget.searchInput.setValue(selectedText);
		}
		this.searchWidget.focus();
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

	public clearSearchResults(): void {
		this.viewModel.searchResult.clear();
		this.showEmptyStage();
		if (!this.contextService.hasWorkspace()) {
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
			this.tree.DOMFocus();
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
		if (isCommonDiffEditor(editorControl)) {
			if (editorControl.getOriginalEditor().isFocused()) {
				editorControl = editorControl.getOriginalEditor();
			} else {
				editorControl = editorControl.getModifiedEditor();
			}
		}

		if (!isCommonCodeEditor(editorControl)) {
			return null;
		}

		const codeEditor: ICommonCodeEditor = <ICommonCodeEditor>editorControl;
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
		this.telemetryService.publicLog('search.toggleQueryDetails');

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

	public searchInFolder(resource: URI): void {
		let folderPath = null;
		const workspace = this.contextService.getWorkspace();
		if (workspace && resource) {
			if (this.contextService.hasFolderWorkspace()) {
				// Show relative path from the root for single-root mode
				folderPath = paths.relative(workspace.roots[0].fsPath, resource.fsPath);
				if (folderPath && folderPath !== '.') {
					folderPath = './' + folderPath;
				}
			} else {
				const owningRoot = this.contextService.getRoot(resource);
				if (owningRoot) {
					const owningRootBasename = paths.basename(owningRoot.fsPath);

					// If this root is the only one with its basename, use a relative ./ path. If there is another, use an absolute path
					const isUniqueRoot = workspace.roots.filter(root => paths.basename(root.fsPath) === owningRootBasename).length === 1;
					if (isUniqueRoot) {
						folderPath = `./${owningRootBasename}/${paths.relative(owningRoot.fsPath, resource.fsPath)}`;
					} else {
						folderPath = resource.fsPath;
					}
				}
			}
		}

		if (!folderPath || folderPath === '.') {
			this.inputPatternIncludes.setValue('');
			this.searchWidget.focus();
			return;
		}

		// Show 'files to include' box
		if (!this.showsFileTypes()) {
			this.toggleQueryDetails(true, true);
		}

		this.inputPatternIncludes.setValue(folderPath);
		this.searchWidget.focus(false);
	}

	public onQueryChanged(rerunQuery: boolean, preserveFocus?: boolean): void {
		const isRegex = this.searchWidget.searchInput.getRegex();
		const isWholeWords = this.searchWidget.searchInput.getWholeWords();
		const isCaseSensitive = this.searchWidget.searchInput.getCaseSensitive();
		const contentPattern = this.searchWidget.searchInput.getValue();
		const excludePatternText = this.inputPatternExcludes.getValue().trim();
		const includePatternText = this.inputPatternIncludes.getValue().trim();
		const useIgnoreFiles = this.inputPatternExcludes.useIgnoreFiles();
		const useExcludeSettings = this.inputPatternExcludes.useExcludeSettings();

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

		const content = {
			pattern: contentPattern,
			isRegExp: isRegex,
			isCaseSensitive: isCaseSensitive,
			isWordMatch: isWholeWords,
			wordSeparators: this.configurationService.getConfiguration<ISearchConfiguration>().editor.wordSeparators
		};

		const excludePattern = this.inputPatternExcludes.getValue();
		const includePattern = this.inputPatternIncludes.getValue();

		const options: IQueryOptions = {
			extraFileResources: getOutOfWorkspaceEditorResources(this.editorGroupService, this.contextService),
			maxResults: SearchViewlet.MAX_TEXT_RESULTS,
			disregardIgnoreFiles: !useIgnoreFiles,
			disregardExcludeSettings: !useExcludeSettings,
			excludePattern,
			includePattern
		};
		const folderResources = this.contextService.hasWorkspace() ? this.contextService.getWorkspace().roots : [];

		const onQueryValidationError = (err: Error) => {
			this.searchWidget.searchInput.showMessage({ content: err.message, type: MessageType.ERROR });
			this.viewModel.searchResult.clear();
		};

		let query: ISearchQuery;
		try {
			query = this.queryBuilder.text(content, folderResources, options);
		} catch (err) {
			onQueryValidationError(err);
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
			const nonExistantFolders = existResults.map((exists, i) => ({ exists, query: query.folderQueries[i] }))
				.filter(folderExists => !folderExists.exists);

			if (nonExistantFolders.length) {
				const nonExistantPath = nonExistantFolders[0].query.folder.fsPath;
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

		this.loading = true;
		this.searchWidget.searchInput.clearMessage();
		this.showEmptyStage();

		let isDone = false;
		const outputChannel = this.outputService.getChannel('search');
		let onComplete = (completed?: ISearchComplete) => {
			if (query.useRipgrep) {
				outputChannel.append('\n');
			}

			isDone = true;

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
			this.loading = false;

			this.actionRegistry['refresh'].enabled = true;
			this.actionRegistry['vs.tree.collapse'].enabled = hasResults;
			this.actionRegistry['clearSearchResults'].enabled = hasResults;

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

						let editorPromise = this.contextService.hasWorkspace() ? this.preferencesService.openWorkspaceSettings() : this.preferencesService.openGlobalSettings();
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

				if (!this.contextService.hasWorkspace()) {
					this.searchWithoutFolderMessage(div);
				}
			} else {
				this.viewModel.searchResult.toggleHighlights(true); // show highlights

				// Indicate final search result count for ARIA
				aria.status(nls.localize('ariaSearchResultsStatus', "Search returned {0} results in {1} files", this.viewModel.searchResult.count(), this.viewModel.searchResult.fileCount()));
			}
		};

		let onError = (e: any) => {
			if (query.useRipgrep) {
				outputChannel.append('\n');
			}

			if (errors.isPromiseCanceledError(e)) {
				onComplete(null);
			} else {
				this.loading = false;
				isDone = true;
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

			if (p.message) {
				outputChannel.append(p.message);
			}
		};

		// Handle UI updates in an interval to show frequent progress and results
		let uiRefreshHandle = setInterval(() => {
			if (isDone) {
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
				// since we have results now, enable some actions
				if (!this.actionRegistry['vs.tree.collapse'].enabled) {
					this.actionRegistry['vs.tree.collapse'].enabled = true;
				}
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
		$(div).p({ text: nls.localize('searchWithoutFolder', "You have not yet opened a folder. Only open files are currently searched - ") })
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
		this.actionRegistry['refresh'].enabled = false;
		this.actionRegistry['vs.tree.collapse'].enabled = false;
		this.actionRegistry['clearSearchResults'].enabled = false;

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

		this.telemetryService.publicLog('searchResultChosen');

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
				revealIfVisible: !sideBySide
			}
		}, sideBySide).then(editor => {
			if (editor && element instanceof Match && preserveFocus) {
				this.viewModel.searchResult.rangeHighlightDecorations.highlightRange({
					resource,
					range: element.range()
				}, <ICommonCodeEditor>editor.getControl());
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
		return [
			this.actionRegistry['refresh'],
			this.actionRegistry['vs.tree.collapse'],
			this.actionRegistry['clearSearchResults']
		];
	}

	public shutdown(): void {
		const isRegex = this.searchWidget.searchInput.getRegex();
		const isWholeWords = this.searchWidget.searchInput.getWholeWords();
		const isCaseSensitive = this.searchWidget.searchInput.getCaseSensitive();
		const contentPattern = this.searchWidget.searchInput.getValue();
		const patternExcludes = this.inputPatternExcludes.getValue().trim();
		const patternIncludes = this.inputPatternIncludes.getValue().trim();
		const useIgnoreFiles = this.inputPatternExcludes.useIgnoreFiles();
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
		this.viewletSettings['query.useIgnoreFiles'] = useIgnoreFiles;

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
		collector.addRule(`.monaco-workbench .search-viewlet .findInFileMatch { background-color: ${matchHighlightColor}; }`);
	}

	const diffInsertedColor = theme.getColor(diffInserted);
	if (diffInsertedColor) {
		collector.addRule(`.monaco-workbench .search-viewlet .replaceMatch { background-color: ${diffInsertedColor}; }`);
	}

	const diffRemovedColor = theme.getColor(diffRemoved);
	if (diffRemovedColor) {
		collector.addRule(`.monaco-workbench .search-viewlet .replace.findInFileMatch { background-color: ${diffRemovedColor}; }`);
	}

	const diffInsertedOutlineColor = theme.getColor(diffInsertedOutline);
	if (diffInsertedOutlineColor) {
		collector.addRule(`.monaco-workbench .search-viewlet .replaceMatch:not(:empty) { border: 1px dashed ${diffInsertedOutlineColor}; }`);
	}

	const diffRemovedOutlineColor = theme.getColor(diffRemovedOutline);
	if (diffRemovedOutlineColor) {
		collector.addRule(`.monaco-workbench .search-viewlet .replace.findInFileMatch { border: 1px dashed ${diffRemovedOutlineColor}; }`);
	}

	const activeContrastBorderColor = theme.getColor(activeContrastBorder);
	if (activeContrastBorderColor) {
		collector.addRule(`
			.monaco-workbench .search-viewlet .findInFileMatch { border: 1px dashed ${activeContrastBorderColor}; }
		`);
	}
});