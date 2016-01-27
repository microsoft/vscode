/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./suggest';
import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, disposeAll } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import Event, { Emitter } from 'vs/base/common/event';
import { append, addClass, removeClass, toggleClass, emmet as $, hide, show, addDisposableListener } from 'vs/base/browser/dom';
import * as Tree from 'vs/base/parts/tree/browser/tree';
import * as TreeImpl from 'vs/base/parts/tree/browser/treeImpl';
import * as TreeDefaults from 'vs/base/parts/tree/browser/treeDefaults';
import * as HighlightedLabel from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { SuggestModel, ICancelEvent, ISuggestEvent, ITriggerEvent } from './suggestModel';
import * as Mouse from 'vs/base/browser/mouseEvent';
import * as EditorBrowser from 'vs/editor/browser/editorBrowser';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import * as Timer from 'vs/base/common/timer';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { SuggestRegistry, CONTEXT_SUGGESTION_SUPPORTS_ACCEPT_ON_KEY } from '../common/suggest';
import { IKeybindingService, IKeybindingContextKey } from 'vs/platform/keybinding/common/keybindingService';
import { ISuggestSupport, ISuggestResult, ISuggestion, ISuggestionFilter } from 'vs/editor/common/modes';
import { DefaultFilter, IMatch } from 'vs/editor/common/modes/modesFilters';
import { ISuggestResult2 } from '../common/suggest';
import URI from 'vs/base/common/uri';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { onUnexpectedError, isPromiseCanceledError, illegalArgument } from 'vs/base/common/errors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/impl/scrollableElement';

function completionGroupCompare(one: CompletionGroup, other: CompletionGroup): number {
	return one.index - other.index;
}

function completionItemCompare(item: CompletionItem, otherItem: CompletionItem): number {
	const suggestion = item.suggestion;
	const otherSuggestion = otherItem.suggestion;

	if (typeof suggestion.sortText === 'string' && typeof otherSuggestion.sortText === 'string') {
		const one = suggestion.sortText.toLowerCase();
		const other = otherSuggestion.sortText.toLowerCase();

		if (one < other) {
			return -1;
		} else if (one > other) {
			return 1;
		}
	}

	return suggestion.label.toLowerCase() < otherSuggestion.label.toLowerCase() ? -1 : 1;
}

class CompletionItem {

	private static _idPool: number = 0;

	id: number;
	suggestion: ISuggestion;
	highlights: IMatch[];
	support: ISuggestSupport;
	container: ISuggestResult;

	private _resolveDetails: TPromise<CompletionItem>

	constructor(public group: CompletionGroup, suggestion: ISuggestion, container: ISuggestResult2) {
		this.id = CompletionItem._idPool++;
		this.support = container.support;
		this.suggestion = suggestion;
		this.container = container;
	}

	resolveDetails(resource: URI, position: EditorCommon.IPosition): TPromise<CompletionItem> {
		if (this._resolveDetails) {
			return this._resolveDetails;
		}

		if (!this.support || typeof this.support.getSuggestionDetails !== 'function') {
			return this._resolveDetails = TPromise.as(this);
		}

		return this._resolveDetails = this.support
			.getSuggestionDetails(resource, position, this.suggestion)
			.then(
				value => this.suggestion = assign(this.suggestion, value),
				err => isPromiseCanceledError(err) ? this._resolveDetails = null : onUnexpectedError(err)
			)
			.then(() => this);
	}
}

class CompletionGroup {

	incomplete: boolean;
	private _items: CompletionItem[];
	private cache: CompletionItem[];
	private cacheCurrentWord: string;
	size: number;
	filter: ISuggestionFilter;

	constructor(public model: CompletionModel, public index: number, raw: ISuggestResult2[]) {
		this.incomplete = false;
		this.size = 0;

		this._items = raw.reduce<CompletionItem[]>((items, result) => {
			this.incomplete = result.incomplete || this.incomplete;
			this.size += result.suggestions.length;

			return items.concat(
				result.suggestions
					.map(suggestion => new CompletionItem(this, suggestion, result))
			);
		}, []).sort(completionItemCompare);

		this.filter = DefaultFilter;

		if (this._items.length > 0) {
			const [first] = this._items;

			if (first.support) {
				this.filter = first.support.getFilter && first.support.getFilter() || this.filter;
			}
		}
	}

	getItems(currentWord: string): CompletionItem[] {
		if (currentWord === this.cacheCurrentWord) {
			return this.cache;
		}

		let set: CompletionItem[];

		// try to narrow down when possible, instead of always filtering everything
		if (this.cacheCurrentWord && currentWord.substr(0, this.cacheCurrentWord.length) === this.cacheCurrentWord) {
			set = this.cache;
		} else {
			set = this._items;
		}

		const result = set.filter(item => {
			item.highlights = this.filter(currentWord, item.suggestion);
			return !isFalsyOrEmpty(item.highlights);
		});

		// let's only cache stuff that actually has results
		if (result.length > 0) {
			this.cacheCurrentWord = currentWord;
			this.cache = result;
		}

		return result;
	}
}

class CompletionModel {

	incomplete: boolean;
	size: number;
	private groups: CompletionGroup[];
	private cache: CompletionItem[];
	private cacheCurrentWord: string;

	constructor(public raw: ISuggestResult2[][], public currentWord: string) {
		this.incomplete = false;
		this.size = 0;

		this.groups = raw
			.filter(s => !!s)
			.map((suggestResults, index) => {
				const group = new CompletionGroup(this, index, suggestResults);

				this.incomplete = group.incomplete || this.incomplete;
				this.size += group.size;

				return group;
			})
			.sort(completionGroupCompare);
	}

	get items(): CompletionItem[] {
		if (this.cacheCurrentWord === this.currentWord) {
			return this.cache;
		}

		const result = this.groups.reduce((r, groups) => r.concat(groups.getItems(this.currentWord)), []);

		// let's only cache stuff that actually has results
		if (result.length > 0) {
			this.cache = result;
			this.cacheCurrentWord = this.currentWord;
		}

		return result;
	}
}

function isRoot(element: any): boolean {
	return element instanceof CompletionModel;
}

class DataSource implements Tree.IDataSource {

	public getId(tree: Tree.ITree, element: any): string {
		if (!element) {
			return 'empty';
		} else if (isRoot(element)) {
			return 'root';
		} else if (element instanceof CompletionItem) {
			return (<CompletionItem>element).id.toString();
		}

		throw illegalArgument('element');
	}

	public getParent(tree: Tree.ITree, element: any): TPromise<any> {
		if (isRoot(element)) {
			return TPromise.as(null);
		}

		return TPromise.as((<CompletionItem>element).group.model);
	}

	public getChildren(tree: Tree.ITree, element: any): TPromise<any[]> {
		if (isRoot(element)) {
			return TPromise.as((<CompletionModel>element).items);
		}

		return TPromise.as([]);
	}

	public hasChildren(tree: Tree.ITree, element: any): boolean {
		return isRoot(element);
	}
}

class Controller extends TreeDefaults.DefaultController {

	/* protected */ public onLeftClick(tree: Tree.ITree, element: any, event: Mouse.StandardMouseEvent): boolean {
		event.preventDefault();
		event.stopPropagation();
		tree.setSelection([element], { origin: 'mouse' });
		return true;
	}
}

interface IMessageTemplateData {
	element: HTMLElement;
}

interface ISuggestionTemplateData {
	root: HTMLElement;
	icon: HTMLElement;
	colorspan: HTMLElement;
	highlightedLabel: HighlightedLabel.HighlightedLabel;
	typeLabel: HTMLElement;
	documentationDetails: HTMLElement;
	documentation: HTMLElement;
}

class Renderer implements Tree.IRenderer {

	private triggerKeybindingLabel: string;

	constructor(
		private widget: SuggestWidget,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		const keybindings = keybindingService.lookupKeybindings('editor.action.triggerSuggest');
		this.triggerKeybindingLabel = keybindings.length === 0 ? '' : ` (${keybindingService.getLabelFor(keybindings[0])})`;
	}

	public getHeight(tree: Tree.ITree, element: any): number {
		if (element instanceof CompletionItem) {
			if ((<CompletionItem>element).suggestion.documentationLabel && tree.isFocused(element)) {
				return 35;
			}
		}

		return 19;
	}

	public getTemplateId(tree: Tree.ITree, element: any): string {
		return 'suggestion';
	}

	public renderTemplate(tree: Tree.ITree, templateId: string, container: HTMLElement): any {
		if (templateId === 'message') {
			const span = $('span');
			span.style.opacity = '0.7';
			container.appendChild(span);
			return <IMessageTemplateData>{ element: span };
		}

		const data = <ISuggestionTemplateData>Object.create(null);
		data.root = container;

		data.icon = append(container, $('.icon'));
		data.colorspan = append(data.icon, $('span.colorspan'));

		const text = append(container, $('.text'));
		const main = append(text, $('.main'));
		data.highlightedLabel = new HighlightedLabel.HighlightedLabel(main);
		data.typeLabel = append(main, $('span.type-label'));
		const docs = append(text, $('.docs'));
		data.documentation = append(docs, $('span.docs-text'));
		data.documentationDetails = append(docs, $('span.docs-details.octicon.octicon-info'));
		data.documentationDetails.title = nls.localize('readMore', "Read More...{0}", this.triggerKeybindingLabel);

		return data;
	}

	public renderElement(tree: Tree.ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === 'message') {
			(<IMessageTemplateData>templateData).element.textContent = element.message;
			return;
		}

		const data = <ISuggestionTemplateData>templateData;
		const suggestion = (<CompletionItem>element).suggestion;

		if (suggestion.type && suggestion.type.charAt(0) === '#') {
			data.root.setAttribute('aria-label', 'color');
			data.icon.className = 'icon customcolor';
			data.colorspan.style.backgroundColor = suggestion.type.substring(1);
		} else {
			data.root.setAttribute('aria-label', suggestion.type);
			data.icon.className = 'icon ' + suggestion.type;
			data.colorspan.style.backgroundColor = '';
		}

		data.highlightedLabel.set(suggestion.label, (<CompletionItem>element).highlights);
		data.typeLabel.textContent = suggestion.typeLabel || '';
		data.documentation.textContent = suggestion.documentationLabel || '';

		if (suggestion.documentationLabel) {
			show(data.documentationDetails);

			data.documentationDetails.onclick = e => {
				e.stopPropagation();
				e.preventDefault();
				this.widget.toggleDetails();
			};
		} else {
			hide(data.documentationDetails);
			data.documentationDetails.onclick = null;
		}
	}

	public disposeTemplate(tree: Tree.ITree, templateId: string, templateData: any): void {
		if (templateId === 'message') {
			return;
		}

		const data = <ISuggestionTemplateData>templateData;
		data.highlightedLabel.dispose();
	}
}

function computeScore(suggestion: string, currentWord: string, currentWordLowerCase: string): number {
	const suggestionLowerCase = suggestion.toLowerCase();
	let score = 0;

	for (let i = 0; i < currentWord.length && i < suggestion.length; i++) {
		if (currentWord[i] === suggestion[i]) {
			score += 2;
		} else if (currentWordLowerCase[i] === suggestionLowerCase[i]) {
			score += 1;
		} else {
			break;
		}
	}

	return score;
}

interface ITelemetryData {
	suggestionCount?: number;
	suggestedIndex?: number;
	selectedIndex?: number;
	hintLength?: number;
	wasCancelled?: boolean;
	wasAutomaticallyTriggered?: boolean;
}

enum State {
	Hidden,
	Loading,
	Empty,
	Open,
	Frozen,
	Details
}

class SuggestionDetails {

	private el: HTMLElement;
	private title: HTMLElement;
	private back: HTMLElement;
	private scrollable: ScrollableElement;
	private body: HTMLElement;
	private type: HTMLElement;
	private docs: HTMLElement;

	constructor(container: HTMLElement, private widget: SuggestWidget) {
		this.el = append(container, $('.details'));
		const header = append(this.el, $('.header'));
		this.title = append(header, $('span.title'));
		this.back = append(header, $('span.go-back.octicon.octicon-mail-reply'));
		this.back.title = nls.localize('goback', "Go back");
		this.body = $('.body');
		this.scrollable = new ScrollableElement(this.body, {});
		append(this.el, this.scrollable.getDomNode());
		this.type = append(this.body, $('p.type'));
		this.docs = append(this.body, $('p.docs'));
	}

	get element() {
		return this.el;
	}

	render(item: CompletionItem): void {
		if (!item) {
			this.title.textContent = '';
			this.type.textContent = '';
			this.docs.textContent = '';
			return;
		}

		this.title.innerText = item.suggestion.label;
		this.type.innerText = item.suggestion.typeLabel || '';
		this.docs.innerText = item.suggestion.documentationLabel;
		this.back.onclick = e => {
			e.preventDefault();
			e.stopPropagation();
			this.widget.toggleDetails();
		};

		this.scrollable.onElementDimensions();
		this.scrollable.onElementInternalDimensions();
	}

	scrollDown(much = 8): void {
		this.body.scrollTop += much;
	}

	scrollUp(much = 8): void {
		this.body.scrollTop -= much;
	}

	pageDown(): void {
		this.scrollDown(80);
	}

	pageUp(): void {
		this.scrollUp(80);
	}

	dispose(): void {
		this.el.parentElement.removeChild(this.el);
		this.el = null;
	}
}

export class SuggestWidget implements EditorBrowser.IContentWidget, IDisposable {

	static ID: string = 'editor.widget.suggestWidget';
	static WIDTH: number = 438;

	static LOADING_MESSAGE: string = nls.localize('suggestWidget.loading', "Loading...");
	static NO_SUGGESTIONS_MESSAGE: string = nls.localize('suggestWidget.noSuggestions', "No suggestions.");

	public allowEditorOverflow: boolean = true; // Editor.IContentWidget.allowEditorOverflow

	private state: State;
	private isAuto: boolean;
	private shouldShowEmptySuggestionList: boolean;
	private suggestionSupportsAutoAccept: IKeybindingContextKey<boolean>;
	private loadingTimeout: number;
	private currentSuggestionDetails: TPromise<CompletionItem>;
	private oldFocus: CompletionItem;

	private telemetryData: ITelemetryData;
	private telemetryService: ITelemetryService;
	private telemetryTimer: Timer.ITimerEvent;

	private element: HTMLElement;
	private messageElement: HTMLElement;
	private treeElement: HTMLElement;
	private details: SuggestionDetails;
	private tree: Tree.ITree;
	private renderer: Renderer;

	private toDispose: IDisposable[];

	private _onDidVisibilityChange: Emitter<boolean> = new Emitter();
	public get onDidVisibilityChange(): Event<boolean> { return this._onDidVisibilityChange.event; }

	constructor(
		private editor: EditorBrowser.ICodeEditor,
		private model: SuggestModel,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.isAuto = false;
		this.oldFocus = null;
		this.suggestionSupportsAutoAccept = keybindingService.createKey(CONTEXT_SUGGESTION_SUPPORTS_ACCEPT_ON_KEY, true);

		this.telemetryData = null;
		this.telemetryService = telemetryService;

		this.element = $('.editor-widget.suggest-widget.monaco-editor-background');
		this.element.style.width = SuggestWidget.WIDTH + 'px';
		this.element.style.top = '0';
		this.element.style.left = '0';

		if (!this.editor.getConfiguration().iconsInSuggestions) {
			addClass(this.element, 'no-icons');
		}

		this.messageElement = append(this.element, $('.message'));
		this.treeElement = append(this.element, $('.tree'));
		this.details = new SuggestionDetails(this.element, this);
		this.renderer = instantiationService.createInstance(Renderer, this);

		const configuration = {
			renderer: this.renderer,
			dataSource: new DataSource(),
			controller: new Controller()
		};

		const options = {
			twistiePixels: 0,
			alwaysFocused: true,
			verticalScrollMode: 'visible',
			useShadows: false,
			ariaLabel: nls.localize('treeAriaLabel', "Suggestions")
		};

		this.tree = new TreeImpl.Tree(this.treeElement, configuration, options);

		this.toDispose = [
			editor.addListener2(EditorCommon.EventType.ModelChanged, () => this.onModelModeChanged()),
			editor.addListener2(EditorCommon.EventType.ModelModeChanged, () => this.onModelModeChanged()),
			editor.addListener2(EditorCommon.EventType.ModelModeSupportChanged, (e: EditorCommon.IModeSupportChangedEvent) => e.suggestSupport && this.onModelModeChanged()),
			SuggestRegistry.onDidChange(() => this.onModelModeChanged()),
			editor.addListener2(EditorCommon.EventType.EditorTextBlur, () => this.onEditorBlur()),
			this.tree.addListener2('selection', e => this.onTreeSelection(e)),
			this.tree.addListener2('focus', e => this.onTreeFocus(e)),
			this.editor.addListener2(EditorCommon.EventType.CursorSelectionChanged, () => this.onCursorSelectionChanged()),
			this.model.onDidTrigger(e => this.onDidTrigger(e)),
			this.model.onDidSuggest(e => this.onDidSuggest(e)),
			this.model.onDidCancel(e => this.onDidCancel(e))
		];

		this.onModelModeChanged();
		this.editor.addContentWidget(this);
		this.setState(State.Hidden);
	}

	private onCursorSelectionChanged(): void {
		if (this.state === State.Hidden) {
			return;
		}

		this.editor.layoutContentWidget(this);
	}

	private onEditorBlur(): void {
		TPromise.timeout(150).done(() => {
			if (!this.editor.isFocused()) {
				this.setState(State.Hidden);
			}
		});
	}

	private onTreeSelection(e: Tree.ISelectionEvent): void {
		if (!e.selection || e.selection.length === 0) {
			return;
		}

		const element = e.selection[0];

		if (!element.hasOwnProperty('suggestions')) {
			const item: CompletionItem = element;
			const navigator = this.tree.getNavigator();

			this.telemetryData.selectedIndex = 0;
			this.telemetryData.wasCancelled = false;

			while (navigator.next() !== item) {
				this.telemetryData.selectedIndex++;
			}

			this.submitTelemetryData();

			const container = item.container;
			const overwriteBefore = (typeof item.suggestion.overwriteBefore === 'undefined') ? container.currentWord.length : item.suggestion.overwriteBefore;
			const overwriteAfter = (typeof item.suggestion.overwriteAfter === 'undefined') ? 0 : Math.max(0, item.suggestion.overwriteAfter);
			this.model.accept(item.suggestion, overwriteBefore, overwriteAfter);

			this.editor.focus();
		}
	}

	private onTreeFocus(e: Tree.IFocusEvent): void {
		const focus = e.focus;
		const payload = e.payload;

		if (focus instanceof CompletionItem) {
			this.resolveDetails(<CompletionItem>focus);
			this.suggestionSupportsAutoAccept.set(!(<CompletionItem>focus).suggestion.noAutoAccept);
		}

		const elementsToRefresh: any[] = [];

		if (this.oldFocus) {
			elementsToRefresh.push(this.oldFocus);
		}

		if (focus) {
			elementsToRefresh.push(focus);
		}

		this.oldFocus = focus;

		this.tree.refreshAll(elementsToRefresh).done(() => {
			this.updateWidgetHeight();

			if (focus) {
				return this.tree.reveal(focus, (payload && payload.firstSuggestion) ? 0 : null);
			}
		}, onUnexpectedError);
	}

	private onModelModeChanged(): void {
		const model = this.editor.getModel();
		const supports = SuggestRegistry.all(model);
		this.shouldShowEmptySuggestionList = supports.some(s => s.shouldShowEmptySuggestionList());
	}

	private setState(state: State): void {
		const stateChanged = this.state !== state;
		this.state = state;

		toggleClass(this.element, 'frozen', state === State.Frozen);

		switch (state) {
			case State.Hidden:
				hide(this.messageElement, this.details.element);
				show(this.treeElement);
				this.hide();
				if (stateChanged) this.tree.setInput(null);
				break;
			case State.Loading:
				this.messageElement.innerText = SuggestWidget.LOADING_MESSAGE;
				hide(this.treeElement, this.details.element);
				show(this.messageElement);
				this.show();
				break;
			case State.Empty:
				this.messageElement.innerText = SuggestWidget.NO_SUGGESTIONS_MESSAGE;
				hide(this.treeElement, this.details.element);
				show(this.messageElement);
				this.show();
				break;
			case State.Open:
				hide(this.messageElement, this.details.element);
				show(this.treeElement);
				this.show();
				break;
			case State.Frozen:
				hide(this.messageElement, this.details.element);
				show(this.treeElement);
				this.show();
				break;
			case State.Details:
				hide(this.messageElement, this.treeElement);
				show(this.details.element);
				this.show();
				break;
		}

		if (stateChanged) {
			this.editor.layoutContentWidget(this);
		}
	}

	private onDidTrigger(e: ITriggerEvent) {
		if (this.state !== State.Hidden) {
			return;
		}

		this.telemetryTimer = this.telemetryService.start('suggestWidgetLoadingTime');
		this.isAuto = !!e.auto;

		if (!this.isAuto) {
			this.loadingTimeout = setTimeout(() => {
				this.loadingTimeout = null;
				this.setState(State.Loading);
			}, 50);
		}

		if (!e.retrigger) {
			this.telemetryData = {
				wasAutomaticallyTriggered: e.characterTriggered
			};
		}
	}

	private onDidSuggest(e: ISuggestEvent): void {
		clearTimeout(this.loadingTimeout);

		let model: CompletionModel = this.tree.getInput();
		let promise = TPromise.as(null);
		let visibleCount: number;

		if (model && model.raw === e.suggestions) {
			const oldCurrentWord = model.currentWord;
			model.currentWord = e.currentWord;
			visibleCount = model.items.length;

			if (!e.auto && visibleCount === 0) {
				model.currentWord = oldCurrentWord;

				if (model.items.length > 0) {
					this.setState(State.Frozen);
				} else {
					this.setState(State.Empty);
				}

				return;
			} else {
				promise = this.tree.refresh();
			}
		} else {
			model = new CompletionModel(e.suggestions, e.currentWord);
			visibleCount = model.items.length;
			promise = this.tree.setInput(model);
		}

		if (visibleCount === 0) {
			if (e.auto) {
				this.setState(State.Hidden);
			} else {
				if (this.shouldShowEmptySuggestionList) {
					this.setState(State.Empty);
				} else {
					this.setState(State.Hidden);
				}
			}

			if (this.telemetryTimer) {
				this.telemetryTimer.data = { reason: 'empty' };
				this.telemetryTimer.stop();
				this.telemetryTimer = null;
			}

			return;
		}

		promise.done(() => {
			const navigator = this.tree.getNavigator();
			const currentWord = e.currentWord;
			const currentWordLowerCase = currentWord.toLowerCase();
			const suggestions = model.items;

			let index = 0;
			let bestSuggestionIndex = -1;
			let bestSuggestion = suggestions[0];
			let bestScore = -1;
			let item: CompletionItem;

			while (item = navigator.next()) {
				const score = computeScore(item.suggestion.label, currentWord, currentWordLowerCase);

				if (score > bestScore) {
					bestScore = score;
					bestSuggestion = item;
					bestSuggestionIndex = index;
				}
			}

			this.tree.setFocus(bestSuggestion, { firstSuggestion: true });

			this.telemetryData = this.telemetryData || {};
			this.telemetryData.suggestionCount = suggestions.length;
			this.telemetryData.suggestedIndex = bestSuggestionIndex;
			this.telemetryData.hintLength = currentWord.length;

			this.setState(State.Open);

			if (this.telemetryTimer) {
				this.telemetryTimer.data = { reason: 'results' };
				this.telemetryTimer.stop();
				this.telemetryTimer = null;
			}
		}, onUnexpectedError);
	}

	private onDidCancel(e: ICancelEvent) {
		clearTimeout(this.loadingTimeout);

		if (!e.retrigger) {
			this.setState(State.Hidden);

			if (this.telemetryData) {
				this.telemetryData.selectedIndex = -1;
				this.telemetryData.wasCancelled = true;
				this.submitTelemetryData();
			}
		}

		if (this.telemetryTimer) {
			this.telemetryTimer.data = { reason: 'cancel' };
			this.telemetryTimer.stop();
			this.telemetryTimer = null;
		}
	}

	private resolveDetails(item: CompletionItem): void {
		if (!item) {
			return;
		}

		if (this.currentSuggestionDetails) {
			this.currentSuggestionDetails.cancel();
		}

		this.currentSuggestionDetails = item.resolveDetails(
			this.editor.getModel().getAssociatedResource(),
			this.model.getRequestPosition() || this.editor.getPosition()
		);

		this.currentSuggestionDetails.then(() => {
			this.currentSuggestionDetails = undefined;
			return this.tree.refresh(item).then(() => this.updateWidgetHeight());
		})
			.done(null, err => !isPromiseCanceledError(err) && onUnexpectedError(err));
	}

	public selectNextPage(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Details:
				this.details.pageDown();
				return true;
			case State.Loading:
				return !this.isAuto;
			default:
				this.tree.focusNextPage();
				return true;
		}
	}

	public selectNext(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Details:
				this.details.scrollDown();
				return true;
			case State.Loading:
				return !this.isAuto;
			default:
				const focus = this.tree.getFocus();
				this.tree.focusNext(1);
				if (focus === this.tree.getFocus()) {
					this.tree.focusFirst();
				}
				return true;
		}
	}

	public selectPreviousPage(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Details:
				this.details.pageUp();
				return true;
			case State.Loading:
				return !this.isAuto;
			default:
				this.tree.focusPreviousPage();
				return true;
		}
	}

	public selectPrevious(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Details:
				this.details.scrollUp();
				return true;
			case State.Loading:
				return !this.isAuto;
			default:
				const focus = this.tree.getFocus();
				this.tree.focusPrevious(1);
				if (focus === this.tree.getFocus()) {
					this.tree.focusLast();
				}
				return true;
		}
	}

	public acceptSelectedSuggestion(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Loading:
				return !this.isAuto;
			default:
				const focus = this.tree.getFocus();
				if (focus) {
					this.tree.setSelection([focus]);
				} else {
					this.model.cancel();
				}
				return true;
		}
	}

	public toggleDetails(): void {
		if (this.state === State.Details) {
			this.setState(State.Open);
			this.editor.focus();
			return;
		}

		if (this.state !== State.Open) {
			return;
		}

		const item: CompletionItem = this.tree.getFocus();

		if (!item || !item.suggestion.documentationLabel) {
			return;
		}

		this.setState(State.Details);
		this.editor.focus();
	}

	private show(): void {
		this.updateWidgetHeight();
		this._onDidVisibilityChange.fire(true);
		this.tree.layout();
		this.renderDetails();
		TPromise.timeout(100).done(() => {
			addClass(this.element, 'visible');
		});
	}

	private hide(): void {
		this._onDidVisibilityChange.fire(false);
		removeClass(this.element, 'visible');
	}

	public cancel(): void {
		if (this.state === State.Details) {
			this.toggleDetails();
		} else {
			this.model.cancel();
		}
	}

	public getPosition(): EditorBrowser.IContentWidgetPosition {
		if (this.state === State.Hidden) {
			return null;
		}

		return {
			position: this.editor.getPosition(),
			preference: [EditorBrowser.ContentWidgetPositionPreference.BELOW, EditorBrowser.ContentWidgetPositionPreference.ABOVE]
		};
	}

	public getDomNode(): HTMLElement {
		return this.element;
	}

	public getId(): string {
		return SuggestWidget.ID;
	}

	private submitTelemetryData(): void {
		this.telemetryService.publicLog('suggestWidget', this.telemetryData);
		this.telemetryData = null;
	}

	private updateWidgetHeight(): void {
		let height = 0;

		if (this.state === State.Empty || this.state === State.Loading) {
			height = 19;
		} else if (this.state === State.Details) {
			height = 12 * 19;
		} else {
			const focus = this.tree.getFocus();
			const focusHeight = focus ? this.renderer.getHeight(this.tree, focus) : 19;
			height += focusHeight;

			const suggestionCount = (this.tree.getContentHeight() - focusHeight) / 19;
			height += Math.min(suggestionCount, 11) * 19;
		}

		this.element.style.height = height + 'px';
		this.tree.layout(height);
		this.editor.layoutContentWidget(this);
	}

	private renderDetails(): void {
		if (this.state !== State.Details) {
			this.details.render(null);
		} else {
			this.details.render(this.tree.getFocus());
		}
	}

	public dispose(): void {
		this.state = null;
		this.suggestionSupportsAutoAccept = null;
		this.currentSuggestionDetails = null;
		this.oldFocus = null;
		this.telemetryData = null;
		this.telemetryService = null;
		this.telemetryTimer = null;
		this.element = null;
		this.messageElement = null;
		this.treeElement = null;
		this.details.dispose();
		this.details = null;
		this.tree.dispose();
		this.tree = null;
		this.renderer = null;
		this.toDispose = disposeAll(this.toDispose);
		this._onDidVisibilityChange.dispose();
		this._onDidVisibilityChange = null;
	}
}
