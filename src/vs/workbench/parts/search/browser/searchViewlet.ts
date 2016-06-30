/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/searchviewlet';
import nls = require('vs/nls');
import {TPromise, PPromise} from 'vs/base/common/winjs.base';
import {EditorType} from 'vs/editor/common/editorCommon';
import {IDiffEditor} from 'vs/editor/browser/editorBrowser';
import lifecycle = require('vs/base/common/lifecycle');
import errors = require('vs/base/common/errors');
import aria = require('vs/base/browser/ui/aria/aria');
import { IExpression } from 'vs/base/common/glob';
import {isFunction} from 'vs/base/common/types';
import URI from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import dom = require('vs/base/browser/dom');
import {IAction, Action} from 'vs/base/common/actions';
import {StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import timer = require('vs/base/common/timer');
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
import {ITree} from 'vs/base/parts/tree/browser/tree';
import {Tree} from 'vs/base/parts/tree/browser/treeImpl';
import {Scope} from 'vs/workbench/common/memento';
import {OpenGlobalSettingsAction} from 'vs/workbench/browser/actions/openSettings';
import {UntitledEditorEvent, EventType as WorkbenchEventType} from 'vs/workbench/common/events';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {getOutOfWorkspaceEditorResources} from 'vs/workbench/common/editor';
import {FileChangeType, FileChangesEvent, EventType as FileEventType} from 'vs/platform/files/common/files';
import {Viewlet} from 'vs/workbench/browser/viewlet';
import {Match, EmptyMatch, FileMatch, SearchResult, FileMatchOrMatch} from 'vs/workbench/parts/search/common/searchModel';
import {getExcludes, QueryBuilder} from 'vs/workbench/parts/search/common/searchQuery';
import {VIEWLET_ID} from 'vs/workbench/parts/search/common/constants';
import {MessageType, InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import {ISearchProgressItem, IFileMatch, ISearchComplete, ISearchQuery, IQueryOptions, ISearchConfiguration} from 'vs/platform/search/common/search';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService} from 'vs/platform/message/common/message';
import {ISearchService} from 'vs/platform/search/common/search';
import {IProgressService} from 'vs/platform/progress/common/progress';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {KeyCode, CommonKeybindings} from 'vs/base/common/keyCodes';
import { PatternInputWidget } from 'vs/workbench/parts/search/browser/patternInputWidget';
import { SearchRenderer, SearchDataSource, SearchSorter, SearchController, SearchAccessibilityProvider, SearchFilter } from 'vs/workbench/parts/search/browser/searchResultsView';
import { SearchWidget } from 'vs/workbench/parts/search/browser/searchWidget';
import { RefreshAction, CollapseAllAction, ClearSearchResultsAction, ConfigureGlobalExclusionsAction } from 'vs/workbench/parts/search/browser/searchActions';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import Severity from 'vs/base/common/severity';

export class SearchViewlet extends Viewlet {

	private static MAX_TEXT_RESULTS = 2048;

	private isDisposed: boolean;
	private toDispose: lifecycle.IDisposable[];

	private currentRequest: PPromise<ISearchComplete, ISearchProgressItem>;
	private loading: boolean;
	private queryBuilder: QueryBuilder;
	private viewModel: SearchResult;
	private callOnModelChange: lifecycle.IDisposable[];

	private replacingAll:boolean= false;
	private viewletVisible: IKeybindingContextKey<boolean>;
	private actionRegistry: { [key: string]: Action; };
	private tree: ITree;
	private viewletSettings: any;
	private domNode: Builder;
	private messages: Builder;
	private searchWidgetsContainer: Builder;
	private searchWidget: SearchWidget;
	private size: Dimension;
	private queryDetails: HTMLElement;
	private inputPatternExclusions: PatternInputWidget;
	private inputPatternGlobalExclusions: InputBox;
	private inputPatternGlobalExclusionsContainer: Builder;
	private inputPatternIncludes: PatternInputWidget;
	private results: Builder;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IEventService private eventService: IEventService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IProgressService private progressService: IProgressService,
		@IMessageService private messageService: IMessageService,
		@IStorageService private storageService: IStorageService,
		@IContextViewService private contextViewService: IContextViewService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ISearchService private searchService: ISearchService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IReplaceService private replaceService: IReplaceService
	) {
		super(VIEWLET_ID, telemetryService);

		this.toDispose = [];
		this.viewletVisible = keybindingService.createKey<boolean>('searchViewletVisible', true);
		this.callOnModelChange = [];

		this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
		this.viewletSettings = this.getMemento(storageService, Scope.WORKSPACE);

		this.toUnbind.push(this.eventService.addListener2(FileEventType.FILE_CHANGES, (e) => this.onFilesChanged(e)));
		this.toUnbind.push(this.eventService.addListener2(WorkbenchEventType.UNTITLED_FILE_SAVED, (e) => this.onUntitledFileSaved(e)));
		this.toUnbind.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(e.config)));
	}

	private onConfigurationUpdated(configuration: any): void {
		this.updateGlobalPatternExclusions(configuration);
	}

	public getResults(): Builder {
		return this.results;
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);

		let builder: Builder;
		this.domNode = parent.div({
			'class': 'search-viewlet'
		}, (div) => {
			builder = div;
		});

		builder.div({'class': ['search-widgets-container']}, (div) => {
			this.searchWidgetsContainer= div;
		});
		this.createSearchWidget(this.searchWidgetsContainer);

		let filePatterns = this.viewletSettings['query.filePatterns'] || '';
		let patternExclusions = this.viewletSettings['query.folderExclusions'] || '';
		let exclusionsUsePattern = this.viewletSettings['query.exclusionsUsePattern'];
		let includesUsePattern = this.viewletSettings['query.includesUsePattern'];
		let patternIncludes = this.viewletSettings['query.folderIncludes'] || '';

		let onKeyUp = (e: KeyboardEvent) => {
			if (e.keyCode === KeyCode.Enter) {
				this.onQueryChanged(true);
			} else if (e.keyCode === KeyCode.Escape) {
				this.cancelSearch();
			}
		};

		this.queryDetails = this.searchWidgetsContainer.div({ 'class': ['query-details'] }, (builder) => {
			builder.div({ 'class': 'more', 'tabindex': 0, 'role': 'button', 'title': nls.localize('moreSearch', "Toggle Search Details") })
				.on(dom.EventType.CLICK, (e) => {
					dom.EventHelper.stop(e);
					this.toggleFileTypes(true);
				}).on(dom.EventType.KEY_UP, (e: KeyboardEvent) => {
					let event = new StandardKeyboardEvent(e);

					if (event.equals(CommonKeybindings.ENTER) || event.equals(CommonKeybindings.SPACE)) {
						dom.EventHelper.stop(e);
						this.toggleFileTypes();
					}
				});

			//folder includes list
			builder.div({ 'class': 'file-types' }, (builder) => {
				let title = nls.localize('searchScope.includes', "files to include");
				builder.element('h4', { text: title });

				this.inputPatternIncludes = new PatternInputWidget(builder.getContainer(), this.contextViewService, {
					ariaLabel: nls.localize('label.includes', 'Search Include Patterns')
				});

				this.inputPatternIncludes.setIsGlobPattern(includesUsePattern);
				this.inputPatternIncludes.setValue(patternIncludes);

				this.inputPatternIncludes
					.on(dom.EventType.KEY_UP, onKeyUp)
					.on(dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
						let keyboardEvent = new StandardKeyboardEvent(e);
						if (keyboardEvent.equals(CommonKeybindings.UP_ARROW)) {
							dom.EventHelper.stop(e);
							this.searchWidget.focus(true, true);
						} else if (keyboardEvent.equals(CommonKeybindings.DOWN_ARROW)) {
							dom.EventHelper.stop(e);
							this.inputPatternExclusions.focus();
							this.inputPatternExclusions.select();
						}
					}).on(FindInput.OPTION_CHANGE, (e) => {
						this.onQueryChanged(false);
					});

					this.inputPatternIncludes.onSubmit(() => this.onQueryChanged(true));
			});

			//pattern exclusion list
			builder.div({ 'class': 'file-types' }, (builder) => {
				let title = nls.localize('searchScope.excludes', "files to exclude");
				builder.element('h4', { text: title });

				this.inputPatternExclusions = new PatternInputWidget(builder.getContainer(), this.contextViewService, {
					ariaLabel: nls.localize('label.excludes', 'Search Exclude Patterns')
				});

				this.inputPatternExclusions.setIsGlobPattern(exclusionsUsePattern);
				this.inputPatternExclusions.setValue(patternExclusions);

				this.inputPatternExclusions
					.on(dom.EventType.KEY_UP, onKeyUp)
					.on(dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
						let keyboardEvent = new StandardKeyboardEvent(e);
						if (keyboardEvent.equals(CommonKeybindings.UP_ARROW)) {
							dom.EventHelper.stop(e);
							this.inputPatternIncludes.focus();
							this.inputPatternIncludes.select();
						} else if (keyboardEvent.equals(CommonKeybindings.DOWN_ARROW)) {
							dom.EventHelper.stop(e);
							this.selectTreeIfNotSelected();
						}
					}).on(FindInput.OPTION_CHANGE, (e) => {
						this.onQueryChanged(false);
					});

					this.inputPatternExclusions.onSubmit(() => this.onQueryChanged(true));
			});

			// add hint if we have global exclusion
			this.inputPatternGlobalExclusionsContainer = builder.div({ 'class': 'file-types global-exclude disabled' }, (builder) => {
				let title = nls.localize('global.searchScope.folders', "files excluded through settings");
				builder.element('h4', { text: title });

				this.inputPatternGlobalExclusions = new InputBox(builder.getContainer(), this.contextViewService, {
					actions: [this.instantiationService.createInstance(ConfigureGlobalExclusionsAction)],
					ariaLabel: nls.localize('label.global.excludes', 'Configured Search Exclude Patterns')
				});
				this.inputPatternGlobalExclusions.inputElement.readOnly = true;
				$(this.inputPatternGlobalExclusions.inputElement).attr('aria-readonly', 'true');
				$(this.inputPatternGlobalExclusions.inputElement).addClass('disabled');
			}).hide();
		}).getHTMLElement();

		this.messages = builder.div({ 'class': 'messages' }).hide().clone();

		this.createSearchResultsView(builder);

		this.actionRegistry = <any>{};
		let actions: Action[] = [new CollapseAllAction(this), new RefreshAction(this), new ClearSearchResultsAction(this)];
		actions.forEach((action) => {
			this.actionRegistry[action.id] = action;
		});

		if (filePatterns !== '' || patternExclusions !== '' || patternIncludes !== '') {
			this.toggleFileTypes(true, true, true);
		}

		this.updateGlobalPatternExclusions(this.configurationService.getConfiguration<ISearchConfiguration>());

		return TPromise.as(null);
	}

	private createSearchWidget(builder: Builder): void {
		let contentPattern = this.viewletSettings['query.contentPattern'] || '';
		let isRegex = this.viewletSettings['query.regex'] === true;
		let isWholeWords = this.viewletSettings['query.wholeWords'] === true;
		let isCaseSensitive = this.viewletSettings['query.caseSensitive'] === true;

		this.searchWidget= new SearchWidget(builder, this.contextViewService, {
			value: contentPattern,
			isRegex: isRegex,
			isCaseSensitive: isCaseSensitive,
			isWholeWords: isWholeWords
		}, this.instantiationService);

		this.searchWidget.onSearchSubmit((refresh) => this.onQueryChanged(refresh));
		this.searchWidget.onSearchCancel(() => this.cancelSearch());
		this.searchWidget.searchInput.onDidOptionChange((viaKeyboard) => this.onQueryChanged(true, viaKeyboard));

		this.searchWidget.onReplaceToggled((state) => this.layout(this.size));
		this.searchWidget.onReplaceStateChange((state) => {
			if (this.viewModel) {
				this.viewModel.replaceText= this.searchWidget.getReplaceValue();
			}
			this.tree.refresh();
		});
		this.searchWidget.onReplaceValueChanged((value) => {
			if (this.viewModel) {
				this.viewModel.replaceText= this.searchWidget.getReplaceValue();
			}
			this.refreshInputs();
			this.tree.refresh();
		});

		this.searchWidget.onKeyDownArrow(() => {
			if (this.showsFileTypes()) {
				this.toggleFileTypes(true, this.showsFileTypes());
			} else {
				this.selectTreeIfNotSelected();
			}
		});
		this.searchWidget.onReplaceAll(() => this.replaceAll());
	}

	public showReplace(): void {
		this.searchWidget.showReplace();
	}

	private refreshInputs(): void {
		if (this.viewModel) {
			this.viewModel.matches().forEach((fileMatch) => {
				this.replaceService.refreshInput(fileMatch, this.viewModel.replaceText);
			});
		}
	}

	private replaceAll(): void {
		if (this.viewModel.count() === 0) {
			return;
		}

		let progressRunner= this.progressService.show(100);

		let occurrences= this.viewModel.count();
		let fileCount= this.viewModel.fileCount();
		let replaceValue= this.searchWidget.getReplaceValue() || '';
		let afterReplaceAllMessage= replaceValue ? nls.localize('replaceAll.message', "Replaced {0} occurrences across {1} files with {2}.", occurrences, fileCount, replaceValue)
													: nls.localize('removeAll.message', "Removed {0} occurrences across {1} files.", occurrences, fileCount);

		let confirmation= {
			title: nls.localize('replaceAll.confirmation.title', "Replace All"),
			message: replaceValue ? nls.localize('replaceAll.confirmation.message', "Replace {0} occurrences across {1} files with '{2}'?", occurrences, fileCount, replaceValue)
									: nls.localize('removeAll.confirmation.message', "Remove {0} occurrences across {1} files?", occurrences, fileCount),
			primaryButton: nls.localize('replaceAll.confirm.button', "Replace")
		};

		if (this.messageService.confirm(confirmation)) {
			let replaceAllTimer = this.telemetryService.timedPublicLog('replaceAll.started');
			this.replacingAll= true;
			this.replaceService.replace(this.viewModel.matches(), replaceValue, progressRunner).then(() => {
				replaceAllTimer.stop();
				this.replacingAll= false;
				setTimeout(() => {
					progressRunner.done();
					this.showEmptyStage();
					this.showMessage(afterReplaceAllMessage);
				}, 200);
			}, (error) => {
				replaceAllTimer.stop();
				progressRunner.done();
				this.replacingAll= false;
				errors.isPromiseCanceledError(error);
				this.messageService.show(Severity.Error, error);
			});
		}
	}

	private showMessage(text: string): Builder {
		return this.messages.empty().show().asContainer().div({ 'class': 'message', text: text });
	}

	private createSearchResultsView(builder: Builder): void {
		builder.div({ 'class': 'results' }, (div) => {
			this.results = div;

			let dataSource = new SearchDataSource();
			let renderer = this.instantiationService.createInstance(SearchRenderer, this.getActionRunner(), this);

			this.tree = new Tree(div.getHTMLElement(), {
				dataSource: dataSource,
				renderer: renderer,
				sorter: new SearchSorter(),
				filter: new SearchFilter(),
				controller: new SearchController(this),
				accessibilityProvider: this.instantiationService.createInstance(SearchAccessibilityProvider)
			}, {
					ariaLabel: nls.localize('treeAriaLabel', "Search Results")
				});

			this.toUnbind.push(renderer);

			this.toUnbind.push(this.tree.addListener2('selection', (event: any) => {
				let element: any;
				let keyboard = event.payload && event.payload.origin === 'keyboard';
				if (keyboard) {
					element = this.tree.getFocus();
				} else {
					element = event.selection[0];
				}

				let originalEvent: KeyboardEvent | MouseEvent = event.payload && event.payload.originalEvent;

				let doubleClick = (event.payload && event.payload.origin === 'mouse' && originalEvent && originalEvent.detail === 2);
				if (doubleClick) {
					originalEvent.preventDefault(); // focus moves to editor, we need to prevent default
				}

				let sideBySide = (originalEvent && (originalEvent.ctrlKey || originalEvent.metaKey));
				let focusEditor = keyboard || doubleClick;

				this.onFocus(element, !focusEditor, sideBySide, doubleClick);
			}));
		});
	}

	private updateGlobalPatternExclusions(configuration: ISearchConfiguration): void {
		if (this.inputPatternGlobalExclusionsContainer) {
			let excludes = getExcludes(configuration);
			if (excludes) {
				let exclusions = Object.getOwnPropertyNames(excludes).filter(exclude => excludes[exclude] === true || typeof excludes[exclude].when === 'string').map(exclude => {
					if (excludes[exclude] === true) {
						return exclude;
					}

					return nls.localize('globLabel', "{0} when {1}", exclude, excludes[exclude].when);
				});

				if (exclusions.length) {
					const values = exclusions.join(', ');
					this.inputPatternGlobalExclusions.value = values;
					this.inputPatternGlobalExclusions.inputElement.title = values;
					this.inputPatternGlobalExclusionsContainer.show();
				} else {
					this.inputPatternGlobalExclusionsContainer.hide();
				}
			}
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
			this.viewModel.toggleHighlights(visible);
		}

		// Open focused element from results in case the editor area is otherwise empty
		if (visible && !this.editorService.getActiveEditor()) {
			let focus = this.tree.getFocus();
			if (focus) {
				this.onFocus(focus);
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

		if (this.storageService.getBoolean('show.replace.firstTime', StorageScope.GLOBAL, true)) {
			this.searchWidget.showReplace();
			this.storageService.store('show.replace.firstTime', false, StorageScope.GLOBAL);
		}
	}

	public moveFocusFromResults(): void {
		if (this.showsFileTypes()) {
			this.toggleFileTypes(true, true, false, true);
		} else {
			this.searchWidget.focus(true, true);
		}
	}

	private reLayout(): void {
		if (this.isDisposed) {
			return;
		}

		this.searchWidget.setWidth(this.size.width - 34 /* container margin */);

		this.inputPatternExclusions.setWidth(this.size.width - 36 /* container margin */);
		this.inputPatternIncludes.setWidth(this.size.width - 36 /* container margin */);
		this.inputPatternGlobalExclusions.width = this.size.width - 36 /* container margin */ - 24 /* actions */;

		let searchResultContainerSize = this.size.height - dom.getTotalHeight(this.searchWidgetsContainer.getContainer()) - 6 /** container margin top */;
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
		this.disposeModel();
		this.showEmptyStage();
		this.searchWidget.clear();
		if (this.currentRequest) {
			this.currentRequest.cancel();
			this.currentRequest = null;
		}
	}

	public cancelSearch(): boolean {
		if (this.currentRequest) {
			this.searchWidget.focus();

			this.currentRequest.cancel();
			this.currentRequest = null;

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

		let editorControl: any = this.editorService.getActiveEditor().getControl();
		if (!editorControl || !isFunction(editorControl.getEditorType) || editorControl.getEditorType() !== EditorType.ICodeEditor) { // Substitute for (editor instanceof ICodeEditor)
			return null;
		}

		let range = editorControl.getSelection();
		if (range && !range.isEmpty() && range.startLineNumber === range.endLineNumber) {
			let searchText = editorControl.getModel().getLineContent(range.startLineNumber);
			searchText = searchText.substring(range.startColumn - 1, range.endColumn - 1);
			return searchText;
		}

		return null;
	}

	private showsFileTypes(): boolean {
		return dom.hasClass(this.queryDetails, 'more');
	}

	public toggleFileTypes(moveFocus?: boolean, show?: boolean, skipLayout?: boolean, reverse?: boolean): void {
		let cls = 'more';
		show = typeof show === 'undefined' ? !dom.hasClass(this.queryDetails, cls) : Boolean(show);
		skipLayout = Boolean(skipLayout);

		if (show) {
			dom.addClass(this.queryDetails, cls);
			if (moveFocus) {
				if (reverse) {
					this.inputPatternExclusions.focus();
					this.inputPatternExclusions.select();
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
		if (!this.showsFileTypes()) {
			this.toggleFileTypes(true, true);
		}

		let workspaceRelativePath = this.contextService.toWorkspaceRelativePath(resource);
		if (workspaceRelativePath) {
			this.inputPatternIncludes.setIsGlobPattern(false);
			this.inputPatternIncludes.setValue(workspaceRelativePath);
			this.searchWidget.focus(false);
		}
	}

	public onQueryChanged(rerunQuery: boolean, preserveFocus?: boolean): void {
		let isRegex = this.searchWidget.searchInput.getRegex();
		let isWholeWords = this.searchWidget.searchInput.getWholeWords();
		let isCaseSensitive = this.searchWidget.searchInput.getCaseSensitive();
		let contentPattern = this.searchWidget.searchInput.getValue();
		let patternExcludes = this.inputPatternExclusions.getValue().trim();
		let exclusionsUsePattern = this.inputPatternExclusions.isGlobPattern();
		let patternIncludes = this.inputPatternIncludes.getValue().trim();
		let includesUsePattern = this.inputPatternIncludes.isGlobPattern();

		// store memento
		this.viewletSettings['query.contentPattern'] = contentPattern;
		this.viewletSettings['query.regex'] = isRegex;
		this.viewletSettings['query.wholeWords'] = isWholeWords;
		this.viewletSettings['query.caseSensitive'] = isCaseSensitive;
		this.viewletSettings['query.folderExclusions'] = patternExcludes;
		this.viewletSettings['query.exclusionsUsePattern'] = exclusionsUsePattern;
		this.viewletSettings['query.folderIncludes'] = patternIncludes;
		this.viewletSettings['query.includesUsePattern'] = includesUsePattern;

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

		let content = {
			pattern: contentPattern,
			isRegExp: isRegex,
			isCaseSensitive: isCaseSensitive,
			isWordMatch: isWholeWords
		};

		let excludes: IExpression = this.inputPatternExclusions.getGlob();
		let includes: IExpression = this.inputPatternIncludes.getGlob();

		let options: IQueryOptions = {
			folderResources: this.contextService.getWorkspace() ? [this.contextService.getWorkspace().resource] : [],
			extraFileResources: getOutOfWorkspaceEditorResources(this.editorGroupService, this.contextService),
			excludePattern: excludes,
			maxResults: SearchViewlet.MAX_TEXT_RESULTS,
			includePattern: includes
		};

		this.onQueryTriggered(this.queryBuilder.text(content, options), patternExcludes, patternIncludes);

		if (!preserveFocus) {
			this.searchWidget.focus(false); // focus back to input field
		}
	}

	private onQueryTriggered(query: ISearchQuery, excludePattern: string, includePattern: string): void {
		if (this.currentRequest) {
			this.currentRequest.cancel();
			this.currentRequest = null;
		}

		let progressTimer = this.telemetryService.timedPublicLog('searchResultsFirstRender');
		let doneTimer = this.telemetryService.timedPublicLog('searchResultsFinished');

		// Progress total is 100%
		let progressTotal = 100;
		let progressRunner = this.progressService.show(progressTotal);
		let progressWorked = 0;

		this.loading = true;
		this.searchWidget.searchInput.clearMessage();
		this.disposeModel();
		this.showEmptyStage();

		let handledMatches: { [id: string]: boolean } = Object.create(null);
		let autoExpand = (alwaysExpandIfOneResult: boolean) => {
			// Auto-expand / collapse based on number of matches:
			// - alwaysExpandIfOneResult: expand file results if we have just one file result and less than 50 matches on a file
			// - expand file results if we have more than one file result and less than 10 matches on a file
			if (this.viewModel) {
				let matches = this.viewModel.matches();
				matches.forEach((match) => {
					if (handledMatches[match.id()]) {
						return; // if we once handled a result, do not do it again to keep results stable (the user might have expanded/collapsed meanwhile)
					}

					handledMatches[match.id()] = true;

					let length = match.matches().length;
					if (length < 10 || (alwaysExpandIfOneResult && matches.length === 1 && length < 50)) {
						this.tree.expand(match).done(null, errors.onUnexpectedError);
					} else {
						this.tree.collapse(match).done(null, errors.onUnexpectedError);
					}
				});
			}
		};

		let timerEvent = timer.start(timer.Topic.WORKBENCH, 'Search');
		let isDone = false;
		let onComplete = (completed?: ISearchComplete) => {
			timerEvent.stop();
			isDone = true;

			// Complete up to 100% as needed
			if (completed) {
				progressRunner.worked(progressTotal - progressWorked);
				setTimeout(() => progressRunner.done(), 200);
			} else {
				progressRunner.done();
			}

			// Show the final results
			if (!this.viewModel) {
				this.viewModel = this.instantiationService.createInstance(SearchResult, query.contentPattern);

				if (completed) {
					this.viewModel.append(completed.results);
				}
			}
			this.viewModel.replaceText= this.searchWidget.getReplaceValue();

			this.tree.refresh().then(() => {
				autoExpand(true);
			}).done(undefined, errors.onUnexpectedError);

			let hasResults = !this.viewModel.isEmpty();
			this.loading = false;
			this.telemetryService.publicLog('searchResultsShown', { count: this.viewModel.count(), fileCount: this.viewModel.fileCount() });

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
				let hasExcludes = !!excludePattern;
				let hasIncludes = !!includePattern;
				let message: string;

				if (!completed) {
					message = nls.localize('searchCanceled', "Search was canceled before any results could be found - ");
				} else if (hasIncludes && hasExcludes) {
					message = nls.localize('noResultsIncludesExcludes', "No results found in '{0}' excluding '{1}' - ", includePattern, excludePattern);
				} else if (hasIncludes) {
					message = nls.localize('noResultsIncludes', "No results found in '{0}' - ", includePattern);
				} else if (hasExcludes) {
					message = nls.localize('noResultsExcludes', "No results found excluding '{0}' - ", excludePattern);
				} else {
					message = nls.localize('noResultsFound', "No results found. Review your settings for configured exclusions - ");
				}

				// Indicate as status to ARIA
				aria.status(message);

				this.tree.onHidden();
				this.results.hide();
				let div = this.showMessage(message);

				if (!completed) {
					$(div).a({
						'class': ['pointer', 'prominent'],
						text: nls.localize('rerunSearch.message', "Search again")
					}).on(dom.EventType.CLICK, (e: MouseEvent) => {
						dom.EventHelper.stop(e, false);

						this.onQueryChanged(true);
					});
				} else if (hasIncludes || hasExcludes) {
					$(div).a({
						'class': ['pointer', 'prominent'],
						'tabindex': '0',
						text: nls.localize('rerunSearchInAll.message', "Search again in all files")
					}).on(dom.EventType.CLICK, (e: MouseEvent) => {
						dom.EventHelper.stop(e, false);

						this.inputPatternExclusions.setValue('');
						this.inputPatternIncludes.setValue('');

						this.onQueryChanged(true);
					});
				} else {
					$(div).a({
						'class': ['pointer', 'prominent'],
						'tabindex': '0',
						text: nls.localize('openSettings.message', "Open Settings")
					}).on(dom.EventType.CLICK, (e: MouseEvent) => {
						dom.EventHelper.stop(e, false);

						let action = this.instantiationService.createInstance(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL);
						action.run().done(() => action.dispose(), errors.onUnexpectedError);
					});
				}
			} else {
				this.viewModel.toggleHighlights(true); // show highlights

				// Indicate as status to ARIA
				aria.status(nls.localize('ariaSearchResultsStatus', "Search returned {0} results in {1} files", this.viewModel.count(), this.viewModel.fileCount()));
			}

			doneTimer.stop();
			this.searchWidget.setReplaceAllActionState(this.viewModel.count() > 0);
		};

		let onError = (e: any) => {
			if (errors.isPromiseCanceledError(e)) {
				onComplete(null);
			} else {
				this.loading = false;
				isDone = true;
				progressRunner.done();
				progressTimer.stop();
				doneTimer.stop();

				this.messageService.show(2 /* ERROR */, e);
			}
		};

		let total: number = 0;
		let worked: number = 0;
		let visibleMatches = 0;
		let matches: IFileMatch[] = [];
		let onProgress = (p: ISearchProgressItem) => {

			// Progress
			if (p.total) {
				total = p.total;
			}

			if (p.worked) {
				worked = p.worked;
			}

			// Results
			if (p.resource) {
				matches.push(p);

				// Create view model
				if (!this.viewModel) {
					this.viewModel = this.instantiationService.createInstance(SearchResult, query.contentPattern);
					this.tree.setInput(this.viewModel).then(() => {
						autoExpand(false);
						this.callOnModelChange.push(this.viewModel.addListener2('changed', (e: any) => {
							if (!this.replacingAll) {
								this.tree.refresh(e, true);
								if (e instanceof FileMatch) {
									this.replaceService.refreshInput(e, this.viewModel.replaceText, true);
								}
							}
						}));
					}).done(null, errors.onUnexpectedError);
				}

				this.viewModel.append([p]);
				progressTimer.stop();
			}
		};

		// Handle UI updates in an interval to show frequent progress and results
		let uiRefreshHandle = setInterval(() => {
			if (isDone) {
				window.clearInterval(uiRefreshHandle);
				return;
			}

			// Progress bar update
			let fakeProgress = true;
			if (total > 0 && worked > 0) {
				let ratio = Math.round((worked / total) * 100);
				if (ratio > progressWorked) { // never show less progress than what we have already
					progressRunner.worked(ratio - progressWorked);
					progressWorked = ratio;
					fakeProgress = false;
				}
			}

			// Fake progress up to 90%
			if (fakeProgress && progressWorked < 90) {
				progressWorked++;
				progressRunner.worked(1);
			}

			// Search result tree update
			if (visibleMatches !== matches.length) {
				visibleMatches = matches.length;

				this.tree.refresh().then(() => {
					autoExpand(false);
				}).done(null, errors.onUnexpectedError);

				// since we have results now, enable some actions
				if (!this.actionRegistry['vs.tree.collapse'].enabled) {
					this.actionRegistry['vs.tree.collapse'].enabled = true;
				}
			}
		}, 200);

		this.searchWidget.setReplaceAllActionState(false);
		this.replaceService.disposeAllInputs();
		this.currentRequest = this.searchService.search(query);
		this.currentRequest.then(onComplete, onError, onProgress);
	}

	private showEmptyStage(): void {

		// disable 'result'-actions
		this.actionRegistry['refresh'].enabled = false;
		this.actionRegistry['vs.tree.collapse'].enabled = false;
		this.actionRegistry['clearSearchResults'].enabled = false;

		// clean up ui
		this.replaceService.disposeAllInputs();
		this.messages.hide();
		this.tree.setInput(this.instantiationService.createInstance(SearchResult, null)).done(null, errors.onUnexpectedError);
		this.results.show();
		this.tree.onVisible();
	}

	private onFocus(lineMatch: Match, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): TPromise<any> {
		if (!(lineMatch instanceof Match)) {
			return TPromise.as(true);
		}

		this.telemetryService.publicLog('searchResultChosen');

		return this.viewModel.isReplaceActive() ? this.openReplacePreviewEditor(lineMatch, preserveFocus, sideBySide, pinned) : this.open(lineMatch, preserveFocus, sideBySide, pinned);
	}

	public open(element: FileMatchOrMatch, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): TPromise<any> {
		let selection= this.getSelectionFrom(element);
		let resource= element instanceof Match ? element.parent().resource() : (<FileMatch>element).resource();
		return this.editorService.openEditor({
			resource: resource,
			options: {
				preserveFocus: preserveFocus,
				pinned: pinned,
				selection: selection
			}
		}, sideBySide);
	}

	private openReplacePreviewEditor(element: FileMatchOrMatch, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): TPromise<any> {
		this.telemetryService.publicLog('replace.open.previewEditor');
		return this.replaceService.getInput(element instanceof Match ? element.parent() : element, this.viewModel.replaceText).then((editorInput) => {
			this.editorService.openEditor(editorInput, {preserveFocus: preserveFocus, pinned: pinned}).then((editor) => {
				let editorControl= (<IDiffEditor>editor.getControl());
				if (element instanceof Match) {
					editorControl.revealLineInCenter(element.range().startLineNumber);
				}
			}, errors.onUnexpectedError);
		}, errors.onUnexpectedError);
	}

	private getSelectionFrom(element: FileMatchOrMatch): any {
		if (element instanceof EmptyMatch) {
			return void 0;
		}

		let match: Match= null;
		if (element instanceof Match) {
			match= element;
		}
		if (element instanceof FileMatch && element.count() > 0) {
			match= element.matches()[element.matches().length - 1];
		}
		if (match) {
			let range= match.range();
			if (this.viewModel.isReplaceActive()) {
				let replaceText= this.viewModel.replaceText;
				return {
					startLineNumber: range.startLineNumber,
					startColumn: range.startColumn + replaceText.length,
					endLineNumber: range.startLineNumber,
					endColumn: range.startColumn + replaceText.length
				};
			}
			return range;
		}
		return void 0;
	}

	private onUntitledFileSaved(e: UntitledEditorEvent): void {
		if (!this.viewModel) {
			return;
		}

		let matches = this.viewModel.matches();
		for (let i = 0, len = matches.length; i < len; i++) {
			if (e.resource.toString() === matches[i].resource().toString()) {
				this.viewModel.remove(matches[i]);
			}
		}
	}

	private onFilesChanged(e: FileChangesEvent): void {
		if (!this.viewModel) {
			return;
		}

		let matches = this.viewModel.matches();

		for (let i = 0, len = matches.length; i < len; i++) {
			if (e.contains(matches[i].resource(), FileChangeType.DELETED)) {
				this.viewModel.remove(matches[i]);
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

	public dispose(): void {
		this.isDisposed = true;

		this.toDispose = lifecycle.dispose(this.toDispose);

		if (this.tree) {
			this.tree.dispose();
		}

		this.searchWidget.dispose();
		this.inputPatternIncludes.dispose();
		this.inputPatternExclusions.dispose();

		this.disposeModel();

		super.dispose();
	}


	private disposeModel(): void {
		if (this.viewModel) {
			this.viewModel.dispose();
			this.viewModel = null;
		}
		this.callOnModelChange = lifecycle.dispose(this.callOnModelChange);
	}
}