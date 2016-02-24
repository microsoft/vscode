/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/searchviewlet';
import {TPromise, PPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {EditorType} from 'vs/editor/common/editorCommon';
import lifecycle = require('vs/base/common/lifecycle');
import errors = require('vs/base/common/errors');
import assert = require('vs/base/common/assert');
import aria = require('vs/base/browser/ui/aria/aria');
import {IExpression, splitGlobAware} from 'vs/base/common/glob';
import {isFunction} from 'vs/base/common/types';
import URI from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import paths = require('vs/base/common/paths');
import dom = require('vs/base/browser/dom');
import {IAction, Action, IActionRunner} from 'vs/base/common/actions';
import {StandardKeyboardEvent, IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import timer = require('vs/base/common/timer');
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import {FileLabel} from 'vs/base/browser/ui/filelabel/fileLabel';
import {FindInput, IFindInputOptions} from 'vs/base/browser/ui/findinput/findInput';
import {LeftRightWidget, IRenderer} from 'vs/base/browser/ui/leftRightWidget/leftRightWidget';
import {CountBadge} from 'vs/base/browser/ui/countBadge/countBadge';
import {ITree, IElementCallback, IFilter, ISorter, IDataSource, IAccessibilityProvider} from 'vs/base/parts/tree/browser/tree';
import {Tree} from 'vs/base/parts/tree/browser/treeImpl';
import {ClickBehavior, DefaultController} from 'vs/base/parts/tree/browser/treeDefaults';
import {ActionsRenderer} from 'vs/base/parts/tree/browser/actionsRenderer';
import {ContributableActionProvider} from 'vs/workbench/browser/actionBarRegistry';
import {Scope} from 'vs/workbench/common/memento';
import {OpenGlobalSettingsAction} from 'vs/workbench/browser/actions/openSettings';
import {UntitledEditorEvent, EventType as WorkbenchEventType} from 'vs/workbench/common/events';
import {ITextFileService} from 'vs/workbench/parts/files/common/files';
import {FileChangeType, FileChangesEvent, EventType as FileEventType} from 'vs/platform/files/common/files';
import {Viewlet} from 'vs/workbench/browser/viewlet';
import {Match, EmptyMatch, SearchResult, FileMatch} from 'vs/workbench/parts/search/common/searchModel';
import {getExcludes, QueryBuilder} from 'vs/workbench/parts/search/common/searchQuery';
import {Checkbox} from 'vs/base/browser/ui/checkbox/checkbox';
import {VIEWLET_ID} from 'vs/workbench/parts/search/browser/search.contribution';
import {MessageType, InputBox, IInputValidator} from 'vs/base/browser/ui/inputbox/inputBox';
import {IContextViewProvider} from 'vs/base/browser/ui/contextview/contextview';
import {ISearchProgressItem, IFileMatch, ISearchComplete, ISearchQuery, IQueryOptions, ISearchConfiguration} from 'vs/platform/search/common/search';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {Range} from 'vs/editor/common/core/range';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IConfigurationService, IConfigurationServiceEvent, ConfigurationServiceEventTypes} from 'vs/platform/configuration/common/configuration';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService} from 'vs/platform/message/common/message';
import {ISearchService} from 'vs/platform/search/common/search';
import {IProgressService} from 'vs/platform/progress/common/progress';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ISelection, StructuredSelection} from 'vs/platform/selection/common/selection';
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {KeyCode, CommonKeybindings} from 'vs/base/common/keyCodes';

const ID = VIEWLET_ID;

export class FindInFolderAction extends Action {

	private viewletService: IViewletService;
	private resource: URI;

	constructor(resource: URI, @IViewletService viewletService: IViewletService) {
		super('workbench.search.action.findInFolder', nls.localize('findInFolder', "Find in Folder"));
		this.viewletService = viewletService;
		this.resource = resource;
	}

	public run(event?: any): TPromise<any> {
		return this.viewletService.openViewlet(ID, true).then((viewlet: SearchViewlet) => {
			viewlet.searchInFolder(this.resource);
		});
	}
}

export class SearchDataSource implements IDataSource {

	public getId(tree: ITree, element: any): string {
		if (element instanceof FileMatch) {
			return element.id();
		} else if (element instanceof Match) {
			return element.id();
		} else if (element instanceof SearchResult) {
			return 'root';
		}
		assert.ok(false);
	}

	public getChildren(tree: ITree, element: any): TPromise<any[]> {
		let value: any[] = [];
		if (element instanceof FileMatch) {
			value = element.matches();
		} else if (element instanceof SearchResult) {
			value = element.matches();
		}
		return TPromise.as(value);
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof FileMatch || element instanceof SearchResult;
	}

	public getParent(tree: ITree, element: any): TPromise<any> {
		let value: any = null;
		if (element instanceof Match) {
			value = element.parent();
		} else if (element instanceof FileMatch) {
			value = element.parent();
		}
		return TPromise.as(value);
	}
}

export type FileMatchOrMatch = FileMatch | Match;

export class SearchSorter implements ISorter {

	public compare(tree: ITree, elementA: FileMatchOrMatch, elementB: FileMatchOrMatch): number {
		if (elementA instanceof FileMatch && elementB instanceof FileMatch) {
			return strings.localeCompare(elementA.resource().fsPath, elementB.resource().fsPath) || strings.localeCompare(elementA.name(), elementB.name());
		}

		if (elementA instanceof Match && elementB instanceof Match) {
			return Range.compareRangesUsingStarts(elementA.range(), elementB.range());
		}
	}
}

export class SearchAccessibilityProvider implements IAccessibilityProvider {

	constructor(@IWorkspaceContextService private contextService: IWorkspaceContextService) {
	}

	public getAriaLabel(tree: ITree, element: FileMatchOrMatch): string {
		if (element instanceof FileMatch) {
			const path = this.contextService.toWorkspaceRelativePath(element.resource()) || element.resource().fsPath;

			return nls.localize('fileMatchAriaLabel', "{0} matches in file {1} of folder {2}, Search result", element.count(), element.name(), paths.dirname(path));
		}

		if (element instanceof Match) {
			return nls.localize('searchResultAria', "{0}, Search result", element.text());
		}
	}
}

class SearchController extends DefaultController {

	constructor() {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_DOWN });
		this.downKeyBindingDispatcher.set(CommonKeybindings.DELETE, (tree: ITree, event: any) => { this.onDelete(tree, event); });
	}

	private onDelete(tree: ITree, event: any): boolean {
		let result = false;
		let elements = tree.getSelection();
		for (let i = 0; i < elements.length; i++) {
			let element = elements[i];
			if (element instanceof FileMatch) {
				new RemoveAction(tree, element).run().done(null, errors.onUnexpectedError);
				result = true;
			}
		}
		return result;
	}
}

class SearchFilter implements IFilter {

	public isVisible(tree: ITree, element: any): boolean {
		return !(element instanceof FileMatch) || element.matches().length > 0;
	}
}

class SearchActionProvider extends ContributableActionProvider {

	public hasActions(tree: ITree, element: any): boolean {
		return element instanceof FileMatch || super.hasActions(tree, element);
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		return super.getActions(tree, element).then(actions => {
			if (element instanceof FileMatch) {
				actions.unshift(new RemoveAction(tree, element));
			}

			return actions;
		});
	}
}

class RemoveAction extends Action {

	private _viewer: ITree;
	private _fileMatch: FileMatch;

	constructor(viewer: ITree, element: FileMatch) {
		super('remove', nls.localize('RemoveAction.label', "Remove"), 'action-remove');

		this._viewer = viewer;
		this._fileMatch = element;
	}

	public run(): TPromise<any> {
		let parent = this._fileMatch.parent();
		parent.remove(this._fileMatch);
		return this._viewer.refresh(parent);
	}
}

class SearchRenderer extends ActionsRenderer {

	private _contextService: IWorkspaceContextService;

	constructor(actionRunner: IActionRunner, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super({
			actionProvider: new SearchActionProvider(),
			actionRunner: actionRunner
		});

		this._contextService = contextService;
	}

	public getContentHeight(tree: ITree, element: any): number {
		return 22;
	}

	public renderContents(tree: ITree, element: FileMatchOrMatch, domElement: HTMLElement, previousCleanupFn: IElementCallback): IElementCallback {

		if (element instanceof FileMatch) {

			let fileMatch = <FileMatch>element;

			let container = $('.filematch'),
				leftRenderer: IRenderer,
				rightRenderer: IRenderer,
				widget: LeftRightWidget;

			leftRenderer = (left: HTMLElement): any => {
				new FileLabel(left, fileMatch.resource(), this._contextService);

				return null;
			};

			rightRenderer = (right: HTMLElement) => {
				let len = fileMatch.count();
				return new CountBadge(right, len, len > 1 ? nls.localize('searchMatches', "{0} matches found", len) : nls.localize('searchMatch', "{0} match found", len));
			};

			widget = new LeftRightWidget(container, leftRenderer, rightRenderer);

			container.appendTo(domElement);

			return widget.dispose.bind(widget);

		} else if (element instanceof EmptyMatch) {

			dom.addClass(domElement, 'linematch');
			$('a.plain.label').innerHtml(nls.localize('noMatches', "no matches")).appendTo(domElement);

		} else if (element instanceof Match) {

			dom.addClass(domElement, 'linematch');

			let elements: string[] = [],
				preview = element.preview();

			elements.push('<span>');
			elements.push(strings.escape(preview.before));
			elements.push('</span><span class="findInFileMatch">');
			elements.push(strings.escape(preview.inside));
			elements.push('</span><span>');
			elements.push(strings.escape(preview.after));
			elements.push('</span>');

			$('a.plain').innerHtml(elements.join(strings.empty)).appendTo(domElement);
		}

		return null;
	}
}

export class RefreshAction extends Action {

	private viewlet: SearchViewlet;

	constructor(viewlet: SearchViewlet) {
		super('refresh');

		this.label = nls.localize('RefreshAction.label', "Refresh");
		this.enabled = false;
		this.class = 'search-action refresh';
		this.viewlet = viewlet;
	}

	public run(): TPromise<void> {
		this.viewlet.onQueryChanged(true);
		return TPromise.as(null);
	}
}

export class SelectOrRemoveAction extends Action {

	private selectMode: boolean;
	private viewlet: SearchViewlet;

	constructor(viewlet: SearchViewlet) {
		super('selectOrRemove');

		this.label = nls.localize('SelectOrRemoveAction.selectLabel', "Select");
		this.enabled = false;
		this.selectMode = true;
		this.viewlet = viewlet;
	}

	public run(): TPromise<any> {
		let result: TPromise<any>;
		if (this.selectMode) {
			result = this.runAsSelect();
		} else {
			result = this.runAsRemove();
		}
		this.selectMode = !this.selectMode;
		this.label = this.selectMode ? nls.localize('SelectOrRemoveAction.selectLabel', "Select") : nls.localize('SelectOrRemoveAction.removeLabel', "Remove");
		return result;
	}

	private runAsSelect(): TPromise<void> {
		this.viewlet.getResults().addClass('select');
		return TPromise.as(null);
	}

	private runAsRemove(): TPromise<void> {

		let elements: any[] = [],
			tree: ITree = this.viewlet.getControl();

		tree.getInput().matches().forEach((fileMatch: FileMatch) => {
			fileMatch.matches().filter((lineMatch: Match) => {
				return (<any>lineMatch).$checked;
			}).forEach(function(lineMatch: Match) {
				lineMatch.parent().remove(lineMatch);
				elements.push(lineMatch.parent());
			});
		});

		this.viewlet.getResults().removeClass('select');


		if (elements.length > 0) {
			return tree.refreshAll(elements).then(function() {
				return tree.refresh();
			});
		}

		return TPromise.as(null);
	}
}

export class CollapseAllAction extends Action {

	private viewlet: SearchViewlet;

	constructor(viewlet: SearchViewlet) {
		super('collapseAll');

		this.label = nls.localize('CollapseAllAction.label', "Collapse");
		this.enabled = false;
		this.class = 'search-action collapse';
		this.viewlet = viewlet;
	}

	public run(): TPromise<void> {
		let tree = this.viewlet.getControl();
		if (tree) {
			tree.collapseAll();
			tree.clearSelection();
			tree.clearFocus();
			tree.DOMFocus();
			tree.focusFirst();
		}

		return TPromise.as(null);
	}
}

export class ClearSearchResultsAction extends Action {
	private viewlet: SearchViewlet;

	constructor(viewlet: SearchViewlet) {
		super('clearSearchResults');

		this.label = nls.localize('ClearSearchResultsAction.label', "Clear Search Results");
		this.enabled = false;
		this.class = 'search-action clear-search-results';
		this.viewlet = viewlet;
	}

	public run(): TPromise<void> {
		this.viewlet.clearSearchResults();

		return TPromise.as(null);
	}
}

class ConfigureGlobalExclusionsAction extends Action {
	private instantiationService: IInstantiationService;

	constructor( @IInstantiationService instantiationService: IInstantiationService) {
		super('configureGlobalExclusionsAction');

		this.label = nls.localize('ConfigureGlobalExclusionsAction.label', "Open Settings");
		this.enabled = true;
		this.class = 'search-configure-exclusions';

		this.instantiationService = instantiationService;
	}

	public run(): TPromise<void> {
		let action = this.instantiationService.createInstance(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL);
		action.run().done(() => action.dispose(), errors.onUnexpectedError);

		return TPromise.as(null);
	}
}

interface IOptions {
	placeholder?: string;
	width?: number;
	validation?: IInputValidator;
	ariaLabel?: string;
}

class PatternInput {

	static OPTION_CHANGE: string = 'optionChange';

	private contextViewProvider: IContextViewProvider;
	private onOptionChange: (event: Event) => void;
	private width: number;
	private placeholder: string;
	private ariaLabel: string;

	private listenersToRemove: any[];
	private pattern: Checkbox;
	public domNode: HTMLElement;
	private inputNode: HTMLInputElement;
	private inputBox: InputBox;

	constructor(parent: HTMLElement, contextViewProvider: IContextViewProvider, options: IOptions = Object.create(null)) {
		this.contextViewProvider = contextViewProvider;
		this.onOptionChange = null;
		this.width = options.width || 100;
		this.placeholder = options.placeholder || '';
		this.ariaLabel = options.ariaLabel || nls.localize('defaultLabel', "input");

		this.listenersToRemove = [];
		this.pattern = null;
		this.domNode = null;
		this.inputNode = null;
		this.inputBox = null;

		this.buildDomNode();

		if (Boolean(parent)) {
			parent.appendChild(this.domNode);
		}
	}

	public destroy(): void {
		this.pattern.dispose();
		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = [];
	}

	public on(eventType: string, handler: (event: Event) => void): PatternInput {
		switch (eventType) {
			case 'keydown':
			case 'keyup':
				$(this.inputBox.inputElement).on(eventType, handler);
				break;
			case PatternInput.OPTION_CHANGE:
				this.onOptionChange = handler;
				break;
		}
		return this;
	}

	public setWidth(newWidth: number): void {
		this.width = newWidth;
		this.domNode.style.width = this.width + 'px';
		this.contextViewProvider.layout();
		this.setInputWidth();
	}

	public getValue(): string {
		return this.inputBox.value;
	}

	public setValue(value: string): void {
		if (this.inputBox.value !== value) {
			this.inputBox.value = value;
		}
	}

	public getGlob(): IExpression {
		let pattern = this.getValue();
		let isGlobPattern = this.isGlobPattern();

		if (!pattern) {
			return void 0;
		}

		let glob: IExpression = Object.create(null);

		let segments: string[];
		if (isGlobPattern) {
			segments = splitGlobAware(pattern, ',').map(s => s.trim()).filter(s => !!s.length);
		} else {
			segments = pattern.split(',').map(s => strings.trim(s.trim(), '/')).filter(s => !!s.length).map(p => {
				if (p[0] === '.') {
					p = '*' + p; // convert ".js" to "*.js"
				}

				return strings.format('{{0}/**,**/{1}}', p, p); // convert foo to {foo/**,**/foo} to cover files and folders
			});
		}

		return segments.reduce((prev, cur) => { glob[cur] = true; return glob; }, glob);
	}

	public select(): void {
		this.inputBox.select();
	}

	public focus(): void {
		this.inputBox.focus();
	}

	public isGlobPattern(): boolean {
		return this.pattern.checked;
	}

	public setIsGlobPattern(value: boolean): void {
		this.pattern.checked = value;
		this.setInputWidth();
	}

	private setInputWidth(): void {
		let w = this.width - this.pattern.width();
		this.inputBox.width = w;
	}

	private buildDomNode(): void {
		this.domNode = document.createElement('div');
		this.domNode.style.width = this.width + 'px';
		$(this.domNode).addClass('monaco-findInput');

		this.inputBox = new InputBox(this.domNode, this.contextViewProvider, {
			placeholder: this.placeholder || '',
			ariaLabel: this.ariaLabel || '',
			validationOptions: {
				validation: null,
				showMessage: true
			}
		});

		this.pattern = new Checkbox({
			actionClassName: 'pattern',
			title: nls.localize('patternDescription', "Use Glob Patterns"),
			isChecked: false,
			onChange: (viaKeyboard) => {
				this.onOptionChange(null);
				if (!viaKeyboard) {
					this.inputBox.focus();
				}
				this.setInputWidth();

				if (this.isGlobPattern()) {
					this.showGlobHelp();
				} else {
					this.inputBox.hideMessage();
				}
			}
		});

		$(this.pattern.domNode).on('mouseover', () => {
			if (this.isGlobPattern()) {
				this.showGlobHelp();
			}
		});

		$(this.pattern.domNode).on(['mouseleave', 'mouseout'], () => {
			this.inputBox.hideMessage();
		});

		this.setInputWidth();

		let controls = document.createElement('div');
		controls.className = 'controls';
		controls.appendChild(this.pattern.domNode);

		this.domNode.appendChild(controls);
	}

	private showGlobHelp(): void {
		this.inputBox.showMessage({
			type: MessageType.INFO,
			formatContent: true,
			content: nls.localize('patternHelpInclude',
				"The pattern to match. e.g. **\\*\\*/*.js** to match all JavaScript files or **myFolder/\\*\\*** to match that folder with all children.\n\n**Reference**:\n**\\*** matches 0 or more characters\n**?** matches 1 character\n**\\*\\*** matches zero or more directories\n**[a-z]** matches a range of characters\n**{a,b}** matches any of the patterns)"
			)
		}, true);
	}
}

export class SearchViewlet extends Viewlet {

	private static MAX_TEXT_RESULTS = 2048;

	private eventService: IEventService;
	private editorService: IWorkbenchEditorService;
	private progressService: IProgressService;
	private messageService: IMessageService;
	private contextViewService: IContextViewService;
	private storageService: IStorageService;
	private searchService: ISearchService;
	private instantiationService: IInstantiationService;
	private configurationService: IConfigurationService;
	private textFileService: ITextFileService;
	private contextService: IWorkspaceContextService;

	private isDisposed: boolean;
	private currentRequest: PPromise<ISearchComplete, ISearchProgressItem>;
	private loading: boolean;
	private queryBuilder: QueryBuilder;
	private viewModel: SearchResult;
	private callOnModelChange: Function[];

	private _viewletVisible: IKeybindingContextKey<boolean>;
	private actionRegistry: { [key: string]: Action; };
	private tree: ITree;
	private viewletSettings: any;
	private domNode: Builder;
	private queryBox: HTMLElement;
	private messages: Builder;
	private findInput: FindInput;
	private size: Dimension;
	private queryDetails: HTMLElement;
	private inputPatternExclusions: PatternInput;
	private inputPatternGlobalExclusions: InputBox;
	private inputPatternGlobalExclusionsContainer: Builder;
	private inputPatternIncludes: PatternInput;
	private results: Builder;

	constructor( @ITelemetryService telemetryService: ITelemetryService,
		@IEventService eventService: IEventService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IProgressService progressService: IProgressService,
		@IMessageService messageService: IMessageService,
		@IStorageService storageService: IStorageService,
		@IContextViewService contextViewService: IContextViewService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ISearchService searchService: ISearchService,
		@ITextFileService textFileService: ITextFileService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(ID, telemetryService);

		this.eventService = eventService;
		this.editorService = editorService;
		this.progressService = progressService;
		this.messageService = messageService;
		this.storageService = storageService;
		this.contextViewService = contextViewService;
		this.instantiationService = instantiationService;
		this.configurationService = configurationService;
		this.searchService = searchService;
		this.textFileService = textFileService;
		this.contextService = contextService;
		this._viewletVisible = keybindingService.createKey<boolean>('searchViewletVisible', true);
		this.callOnModelChange = [];

		this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
		this.viewletSettings = this.getMemento(storageService, Scope.WORKSPACE);

		this.toUnbind.push(this.eventService.addListener(FileEventType.FILE_CHANGES, (e) => this.onFilesChanged(e)));
		this.toUnbind.push(this.eventService.addListener(WorkbenchEventType.UNTITLED_FILE_DELETED, (e) => this.onUntitledFileDeleted(e)));
		this.toUnbind.push(this.configurationService.addListener(ConfigurationServiceEventTypes.UPDATED, (e: IConfigurationServiceEvent) => this.onConfigurationUpdated(e.config)));
	}

	private onConfigurationUpdated(configuration: any): void {
		this.updateGlobalPatternExclusions(configuration);
	}

	public getResults(): Builder {
		return this.results;
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);

		let filePatterns = this.viewletSettings['query.filePatterns'] || '';
		let patternExclusions = this.viewletSettings['query.folderExclusions'] || '';
		let exclusionsUsePattern = this.viewletSettings['query.exclusionsUsePattern'];
		let includesUsePattern = this.viewletSettings['query.includesUsePattern'];
		let patternIncludes = this.viewletSettings['query.folderIncludes'] || '';
		let contentPattern = this.viewletSettings['query.contentPattern'] || '';
		let isRegex = this.viewletSettings['query.regex'] === true;
		let isWholeWords = this.viewletSettings['query.wholeWords'] === true;
		let isCaseSensitive = this.viewletSettings['query.caseSensitive'] === true;

		let builder: Builder;
		this.domNode = parent.div({
			'class': 'search-viewlet'
		}, (div) => {
			builder = div;
		});

		let onStandardKeyUp = (keyboardEvent: IKeyboardEvent) => {
			if (keyboardEvent.keyCode === KeyCode.Enter) {
				this.onQueryChanged(true);
			} else if (keyboardEvent.keyCode === KeyCode.Escape) {
				this.findInput.focus();
				this.findInput.select();

				if (this.currentRequest) {
					this.currentRequest.cancel();
					this.currentRequest = null;
				}
			}
		};

		let onKeyUp = (e: KeyboardEvent) => {
			onStandardKeyUp(new StandardKeyboardEvent(e));
		};

		this.queryBox = builder.div({ 'class': 'query-box' }, (div) => {
			let options: IFindInputOptions = {
				label: nls.localize('label.Search', 'Search: Type Search Term and press Enter to search or Escape to cancel'),
				validation: (value: string) => {
					if (value.length === 0) {
						return null;
					}
					if (!this.findInput.getRegex()) {
						return null;
					}
					let regExp: RegExp;
					try {
						regExp = new RegExp(value);
					} catch (e) {
						return { content: e.message };
					}
					if (strings.regExpLeadsToEndlessLoop(regExp)) {
						return { content: nls.localize('regexp.validationFailure', "Expression matches everything") };
					}
				},
				placeholder: nls.localize('findPlaceHolder', "Press Enter to Search, ESC to Cancel")
			};
			this.findInput = new FindInput(div.getHTMLElement(), this.contextViewService, options);
			this.findInput.onKeyUp(onStandardKeyUp);
			this.findInput.onKeyDown((keyboardEvent: IKeyboardEvent) => {
				if (keyboardEvent.keyCode === KeyCode.DownArrow) {
					dom.EventHelper.stop(keyboardEvent);
					if (this.showsFileTypes()) {
						this.toggleFileTypes(true, true);
					} else {
						this.selectTreeIfNotSelected(keyboardEvent);
					}
				}
			});
			this.findInput.onDidOptionChange((viaKeyboard) => {
				this.onQueryChanged(true, viaKeyboard);
			});
			this.findInput.setValue(contentPattern);
			this.findInput.setRegex(isRegex);
			this.findInput.setCaseSensitive(isCaseSensitive);
			this.findInput.setWholeWords(isWholeWords);
		}).style({ position: 'relative' }).getHTMLElement();

		this.queryDetails = builder.div({ 'class': ['query-details', 'separator'] }, (builder) => {
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

				this.inputPatternIncludes = new PatternInput(builder.getContainer(), this.contextViewService, {
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
							this.findInput.focus();
							this.findInput.select();
						} else if (keyboardEvent.equals(CommonKeybindings.DOWN_ARROW)) {
							dom.EventHelper.stop(e);
							this.inputPatternExclusions.focus();
							this.inputPatternExclusions.select();
						}
					}).on(FindInput.OPTION_CHANGE, (e) => {
						this.onQueryChanged(false);
					});
			});

			//pattern exclusion list
			builder.div({ 'class': 'file-types' }, (builder) => {
				let title = nls.localize('searchScope.excludes', "files to exclude");
				builder.element('h4', { text: title });

				this.inputPatternExclusions = new PatternInput(builder.getContainer(), this.contextViewService, {
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
							this.selectTreeIfNotSelected(keyboardEvent);
						}
					}).on(FindInput.OPTION_CHANGE, (e) => {
						this.onQueryChanged(false);
					});
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

		builder.div({ 'class': 'results' }, (div) => {
			this.results = div;

			let dataSource = new SearchDataSource();
			let renderer = this.instantiationService.createInstance(SearchRenderer, this.getActionRunner());

			this.tree = new Tree(div.getHTMLElement(), {
				dataSource: dataSource,
				renderer: renderer,
				sorter: new SearchSorter(),
				filter: new SearchFilter(),
				controller: new SearchController(),
				accessibilityProvider: this.instantiationService.createInstance(SearchAccessibilityProvider)
			}, {
				ariaLabel: nls.localize('treeAriaLabel', "Search Results")
			});

			this.toUnbind.push(() => renderer.dispose());

			this.toUnbind.push(this.tree.addListener('selection', (event: any) => {
				let element: any, keyboard = event.payload && event.payload.origin === 'keyboard';
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

				this.onFocus(element, !keyboard && !doubleClick, sideBySide);
			}));
		});

		this.actionRegistry = <any>{};
		let actions: Action[] = [new CollapseAllAction(this), new RefreshAction(this), new ClearSearchResultsAction(this), new SelectOrRemoveAction(this)];
		actions.forEach((action) => {
			this.actionRegistry[action.id] = action;
		});

		if (filePatterns !== '' || patternExclusions !== '' || patternIncludes !== '') {
			this.toggleFileTypes(true, true, true);
		}

		this.configurationService.loadConfiguration().then((configuration) => {
			this.updateGlobalPatternExclusions(configuration);
		}).done(null, errors.onUnexpectedError);

		return TPromise.as(null);
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
		this._viewletVisible.set(visible);
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
		if (visible && !this.editorService.getActiveEditorInput()) {
			let focus = this.tree.getFocus();
			if (focus) {
				this.onFocus(focus, false, false);
			}
		}

		return promise;
	}

	public focus(): void {
		super.focus();

		let selectedText = this.getSelectionFromEditor();
		if (selectedText) {
			this.findInput.setValue(selectedText);
		}
		this.findInput.focus();
		this.findInput.select();
	}

	private reLayout(): void {
		if (this.isDisposed) {
			return;
		}

		this.findInput.setWidth(this.size.width - 34 /* container margin */);

		this.inputPatternExclusions.setWidth(this.size.width - 42 /* container margin */);
		this.inputPatternIncludes.setWidth(this.size.width - 42 /* container margin */);
		this.inputPatternGlobalExclusions.width = this.size.width - 42 /* container margin */ - 24 /* actions */;

		let queryBoxHeight = dom.getTotalHeight(this.queryBox);
		let queryDetailsHeight = dom.getTotalHeight(this.queryDetails);
		let searchResultContainerSize = this.size.height - queryBoxHeight - queryDetailsHeight;
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
		this.findInput.clear();
		if (this.currentRequest) {
			this.currentRequest.cancel();
			this.currentRequest = null;
		}
	}

	private selectTreeIfNotSelected(keyboardEvent: IKeyboardEvent): void {
		if (this.tree.getInput()) {
			this.tree.DOMFocus();
			let selection = this.tree.getSelection();
			if (selection.length === 0) {
				this.tree.focusNext();
			}
		}
	}

	private getSelectionFromEditor(): string {
		if (!this.editorService.getActiveEditor()) {
			return null;
		}

		let editor: any = this.editorService.getActiveEditor().getControl();
		// Substitute for (editor instanceof ICodeEditor)
		if (!editor || !isFunction(editor.getEditorType) || editor.getEditorType() !== EditorType.ICodeEditor) {
			return null;
		}

		let range = editor.getSelection();
		if (range && !range.isEmpty() && range.startLineNumber === range.endLineNumber) {
			let r = editor.getModel().getLineContent(range.startLineNumber);
			r = r.substring(range.startColumn - 1, range.endColumn - 1);
			return r;
		}
		return null;
	}

	private showsFileTypes(): boolean {
		return dom.hasClass(this.queryDetails, 'more');
	}

	public toggleFileTypes(moveFocus?: boolean, show?: boolean, skipLayout?: boolean): void {
		let cls = 'more';
		show = typeof show === 'undefined' ? !dom.hasClass(this.queryDetails, cls) : Boolean(show);
		skipLayout = Boolean(skipLayout);

		if (show) {
			dom.addClass(this.queryDetails, cls);
			if (moveFocus) {
				this.inputPatternIncludes.focus();
				this.inputPatternIncludes.select();
			}
		} else {
			dom.removeClass(this.queryDetails, cls);
			if (moveFocus) {
				this.findInput.focus();
				this.findInput.select();
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
			this.findInput.focus();
		}
	}

	public onQueryChanged(rerunQuery: boolean, preserveFocus?: boolean): void {

		let isRegex = this.findInput.getRegex(),
			isWholeWords = this.findInput.getWholeWords(),
			isCaseSensitive = this.findInput.getCaseSensitive(),
			contentPattern = this.findInput.getValue(),
			patternExcludes = this.inputPatternExclusions.getValue().trim(),
			exclusionsUsePattern = this.inputPatternExclusions.isGlobPattern(),
			patternIncludes = this.inputPatternIncludes.getValue().trim(),
			includesUsePattern = this.inputPatternIncludes.isGlobPattern();

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

		if (/^\s+|\s$/.test(contentPattern)) {
			contentPattern = strings.escapeRegExpCharacters(contentPattern);
			isRegex = true;
		}

		if (contentPattern.length === 0) {
			return;
		}

		if (isRegex) {
			let regExp: RegExp;
			try {
				regExp = new RegExp(contentPattern);
			} catch (e) {
				return;
			}
			if (strings.regExpLeadsToEndlessLoop(regExp)) {
				return;
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
			extraFileResources: this.textFileService.getWorkingFilesModel().getOutOfWorkspaceContextEntries().map(e => e.resource),
			excludePattern: excludes,
			includePattern: includes,
			maxResults: SearchViewlet.MAX_TEXT_RESULTS,
		};

		this.queryBuilder.text(content, options)
			.then(query => this.onQueryTriggered(query, patternExcludes, patternIncludes), errors.onUnexpectedError);

		if (!preserveFocus) {
			this.findInput.focus(); // focus back to input field
		}
	}

	private onQueryTriggered(query: ISearchQuery, excludePattern: string, includePattern: string): void {

		if (this.currentRequest) {
			this.currentRequest.cancel();
			this.currentRequest = null;
		}

		let progressTimer = this.telemetryService.start('searchResultsFirstRender');
		let doneTimer = this.telemetryService.start('searchResultsFinished');

		// Progress total is 100%
		let progressTotal = 100;
		let progressRunner = this.progressService.show(progressTotal);
		let progressWorked = 0;

		this.loading = true;
		this.findInput.clearMessage();
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

			this.tree.refresh().then(() => {
				autoExpand(true);
			}).done(undefined, errors.onUnexpectedError);

			let hasResults = !this.viewModel.isEmpty();
			this.loading = false;
			this.telemetryService.publicLog('searchResultsShown', { count: this.viewModel.count(), fileCount: this.viewModel.fileCount() });

			this.actionRegistry['refresh'].enabled = true;
			this.actionRegistry['selectOrRemove'].enabled = hasResults;
			this.actionRegistry['collapseAll'].enabled = hasResults;
			this.actionRegistry['clearSearchResults'].enabled = hasResults;

			if (completed && completed.limitHit) {
				this.findInput.showMessage({
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
				let div = this.messages.empty().show().asContainer().div({ 'class': 'message', text: message });

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
						this.callOnModelChange.push(this.viewModel.addListener('changed', (e: any) => this.tree.refresh(e, true)));
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
				if (!this.actionRegistry['collapseAll'].enabled) {
					this.actionRegistry['collapseAll'].enabled = true;
				}
			}
		}, 200);

		this.currentRequest = this.searchService.search(query);
		this.currentRequest.then(onComplete, onError, onProgress);
	}

	private showEmptyStage(): void {
		// disable 'result'-actions
		this.actionRegistry['refresh'].enabled = false;
		this.actionRegistry['selectOrRemove'].enabled = false;
		this.actionRegistry['collapseAll'].enabled = false;
		this.actionRegistry['clearSearchResults'].enabled = false;

		// clean up ui
		this.messages.hide();
		this.tree.setInput(this.instantiationService.createInstance(SearchResult, null)).done(null, errors.onUnexpectedError);
		this.results.show();
		this.tree.onVisible();
	}

	private onFocus(lineMatch: Match, preserveFocus: boolean, sideBySide: boolean): TPromise<any> {
		if (!(lineMatch instanceof Match)) {
			return TPromise.as(true);
		}

		this.telemetryService.publicLog('searchResultChosen');

		return this.editorService.openEditor({
			resource: lineMatch.parent().resource(),
			options: {
				preserveFocus: preserveFocus,
				selection: lineMatch instanceof EmptyMatch ? void 0 : lineMatch.range()
			}
		}, sideBySide);
	}

	private onUntitledFileDeleted(e: UntitledEditorEvent): void {
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

	public getSelection(): ISelection {
		return new StructuredSelection(this.tree.getSelection());
	}

	public getActions(): IAction[] {
		return [
			this.actionRegistry['refresh'],
			this.actionRegistry['collapseAll'],
			this.actionRegistry['clearSearchResults']
		];
	}

	public dispose(): void {
		this.isDisposed = true;

		if (this.tree) {
			this.tree.dispose();
		}

		this.disposeModel();

		super.dispose();
	}


	private disposeModel(): void {
		if (this.viewModel) {
			this.viewModel.dispose();
			this.viewModel = null;
		}
		lifecycle.cAll(this.callOnModelChange);
	}
}