/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./suggest';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, disposeAll } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import Event, { Emitter } from 'vs/base/common/event';
import { append, addClass, removeClass, emmet as $ } from 'vs/base/browser/dom';
import Tree = require('vs/base/parts/tree/common/tree');
import TreeImpl = require('vs/base/parts/tree/browser/treeImpl');
import TreeDefaults = require('vs/base/parts/tree/browser/treeDefaults');
import HighlightedLabel = require('vs/base/browser/ui/highlightedlabel/highlightedLabel');
import { SuggestModel, ICancelEvent, ISuggestEvent, ITriggerEvent } from './suggestModel';
import Mouse = require('vs/base/browser/mouseEvent');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import EventEmitter = require('vs/base/common/eventEmitter');
import Timer = require('vs/base/common/timer');
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { SuggestRegistry, CONTEXT_SUGGESTION_SUPPORTS_ACCEPT_ON_KEY } from '../common/suggest';
import { IKeybindingService, IKeybindingContextKey } from 'vs/platform/keybinding/common/keybindingService';
import { ISuggestSupport, ISuggestResult, ISuggestion, ISuggestionCompare, ISuggestionFilter } from 'vs/editor/common/modes';
import { DefaultFilter, IMatch } from 'vs/editor/common/modes/modesFilters';
import { ISuggestResult2 } from '../common/suggest';
import URI from 'vs/base/common/uri';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { onUnexpectedError, isPromiseCanceledError, illegalArgument } from 'vs/base/common/errors';
const DefaultCompare: ISuggestionCompare = (a, b) => a.label.localeCompare(b.label);

class CompletionItem {

	private static _idPool = 0;

	id: string;
	suggestion: ISuggestion;
	highlights: IMatch[];
	support: ISuggestSupport;
	container: ISuggestResult;

	private _resolveDetails:TPromise<CompletionItem>

	constructor(public group: CompletionGroup, suggestion: ISuggestion, container:ISuggestResult2) {
		this.id = '_completion_item_#' + CompletionItem._idPool++;
		this.support = container.support;
		this.suggestion = suggestion;
		this.container = container;
	}

	resolveDetails(resource:URI, position:EditorCommon.IPosition): TPromise<CompletionItem> {
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
	items: CompletionItem[];
	size: number;
	compare: ISuggestionCompare;
	filter: ISuggestionFilter;

	constructor(public model: CompletionModel, public index: number, raw: ISuggestResult2[]) {
		this.incomplete = false;
		this.size = 0;

		this.items = raw.reduce<CompletionItem[]>((items, result) => {
			this.incomplete = result.incomplete || this.incomplete;
			this.size += result.suggestions.length;

			return items.concat(
				result.suggestions
					.map(suggestion => new CompletionItem(this, suggestion, result))
			);
		}, []);

		this.compare = DefaultCompare;
		this.filter = DefaultFilter;

		if (this.items.length > 0) {
			const [first] = this.items;

			if (first.support) {
				this.compare = first.support.getSorter && first.support.getSorter() || this.compare;
				this.filter = first.support.getFilter && first.support.getFilter() || this.filter;
			}
		}
	}
}

class CompletionModel {

	incomplete: boolean;
	size: number;

	private groups: CompletionGroup[];

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
			});
	}

	get items(): CompletionItem[] {
		return this.groups.reduce((r, groups) => r.concat(groups.items), []);
	}
}

// To be used as a tree element when we want to show a message
export class Message {
	constructor(public parent: MessageRoot, public message: string) {
		// nothing to do
	}
}

export class MessageRoot {
	public child: Message;

	constructor(message: string) {
		this.child = new Message(this, message);
	}
}

function isRoot(element: any) : boolean {
	return element instanceof MessageRoot || element instanceof CompletionModel;
}

class DataSource implements Tree.IDataSource {

	public getId(tree: Tree.ITree, element: any): string {
		if (element instanceof MessageRoot) {
			return 'messageroot';
		} else if (element instanceof Message) {
			return 'message' + element.message;
		} else if (element instanceof CompletionModel) {
			return 'root';
		} else if (element instanceof CompletionItem) {
			return (<CompletionItem>element).id;
		}

		throw illegalArgument('element');
	}

	public getParent(tree: Tree.ITree, element: any): TPromise<any> {
		if (isRoot(element)) {
			return TPromise.as(null);
		} else if (element instanceof Message) {
			return TPromise.as(element.parent);
		}

		return TPromise.as((<CompletionItem>element).group.model);
	}

	public getChildren(tree: Tree.ITree, element: any): TPromise<any[]> {
		if (element instanceof MessageRoot) {
			return TPromise.as([element.child]);
		} else if (element instanceof CompletionModel) {
			return TPromise.as((<CompletionModel>element).items);
		}

		return TPromise.as([]);
	}

	public hasChildren(tree: Tree.ITree, element: any): boolean {
		return isRoot(element);
	}
}

class Controller extends TreeDefaults.DefaultController {

	/* protected */ public onLeftClick(tree:Tree.ITree, element:any, event:Mouse.StandardMouseEvent):boolean {
		event.preventDefault();
		event.stopPropagation();

		if (!(element instanceof Message)) {
			tree.setSelection([element], { origin: 'mouse' });
		}

		return true;
	}
}

class Filter implements Tree.IFilter {

	constructor(private getState: () => State) {}

	isVisible(tree: Tree.ITree, element: any): boolean {
		if (isRoot(element)) {
			return false;
		} else if (element instanceof Message) {
			return true;
		}

		const item: CompletionItem = element;
		const filter = item.group.filter;
		const currentWord = item.group.model.currentWord;
		item.highlights = filter(currentWord, item.suggestion);
		return !isFalsyOrEmpty(item.highlights);
	}
}

class Sorter implements Tree.ISorter {

	compare(tree: Tree.ITree, item: CompletionItem, otherItem: CompletionItem): number {
		const group = item.group;
		const otherGroup = otherItem.group;
		const result = group.index - otherGroup.index

		if (result !== 0) {
			return result;
		}

		return group.compare(item.suggestion, otherItem.suggestion);
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
	documentation: HTMLElement;
}

class Renderer implements Tree.IRenderer {

	public getHeight(tree:Tree.ITree, element:any):number {
		// var suggestion = <Modes.ISuggestion>element;

		if (element instanceof CompletionItem) {
			if ((<CompletionItem>element).suggestion.documentationLabel && tree.isFocused(element)) {
				return 35;
			}
		}

		return 19;
	}

	public getTemplateId(tree: Tree.ITree, element: any): string {
		return (element instanceof Message) ? 'message' : 'suggestion';
	}

	public renderTemplate(tree: Tree.ITree, templateId: string, container: HTMLElement): any {
		if (templateId === 'message') {
			var span = $('span');
			span.style.opacity = '0.7';
			container.appendChild(span);
			return <IMessageTemplateData> { element: span };
		}

		var data = <ISuggestionTemplateData> Object.create(null);
		data.root = container;

		data.icon = append(container, $('.icon'));
		data.colorspan = append(data.icon, $('span.colorspan'));

		var text = append(container, $('.text'));
		var main = append(text, $('.main'));
		data.highlightedLabel = new HighlightedLabel.HighlightedLabel(main);
		data.typeLabel = append(main, $('span.type-label'));
		data.documentation = append(text, $('.docs'));

		return data;
	}

	public renderElement(tree: Tree.ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === 'message') {
			(<IMessageTemplateData> templateData).element.textContent = element.message;
			return;
		}

		var data = <ISuggestionTemplateData> templateData;
		var suggestion = (<CompletionItem> element).suggestion;

		if (suggestion.type && suggestion.type.charAt(0) === '#') {
			data.root.setAttribute('aria-label', 'color');
			data.icon.className = 'icon customcolor';
			data.colorspan.style.backgroundColor = suggestion.type.substring(1);
		} else {
			data.root.setAttribute('aria-label', suggestion.type);
			data.icon.className = 'icon ' + suggestion.type;
			data.colorspan.style.backgroundColor = '';
		}

		data.highlightedLabel.set(suggestion.label, (<CompletionItem> element).highlights);
		data.typeLabel.textContent = suggestion.typeLabel || '';
		data.documentation.textContent = suggestion.documentationLabel || '';
	}

	public disposeTemplate(tree: Tree.ITree, templateId: string, templateData: any): void {
		if (templateId === 'message') {
			return;
		}

		var data = <ISuggestionTemplateData> templateData;
		data.highlightedLabel.dispose();
	}
}

function computeScore(suggestion:string, currentWord:string, currentWordLowerCase:string) : number {
	var suggestionLowerCase = suggestion.toLowerCase();
	var score = 0;

	for (var i = 0; i < currentWord.length && i < suggestion.length; i++) {
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
	Open
}

export class SuggestWidget implements EditorBrowser.IContentWidget, IDisposable {

	static ID = 'editor.widget.suggestWidget';
	static WIDTH = 438;

	static LOADING_MESSAGE = nls.localize('suggestWidget.loading', "Loading...");
	static NO_SUGGESTIONS_MESSAGE = nls.localize('suggestWidget.noSuggestions', "No suggestions.");

	private state: State;
	private shouldShowEmptySuggestionList: boolean;
	private isActive: boolean;
	private isLoading: boolean;
	private isAuto: boolean;
	private listenersToRemove: EventEmitter.ListenerUnbind[];
	private modelListenersToRemove: IDisposable[];
	private suggestionSupportsAutoAccept: IKeybindingContextKey<boolean>;
	private loadingTimeout: number;

	private telemetryData: ITelemetryData;
	private telemetryService: ITelemetryService;
	private telemetryTimer: Timer.ITimerEvent;

	private element: HTMLElement;
	private messageElement: HTMLElement;
	private treeElement: HTMLElement;
	private tree: Tree.ITree;
	private renderer: Renderer;

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	private currentSuggestionDetails:TPromise<CompletionItem>;

	private _onDidVisibilityChange: Emitter<boolean> = new Emitter();
	public get onDidVisibilityChange(): Event<boolean> { return this._onDidVisibilityChange.event; }

	constructor(
		private editor: EditorBrowser.ICodeEditor,
		private model: SuggestModel,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		this.isActive = false;
		this.isLoading = false;
		this.isAuto = false;
		this.modelListenersToRemove = [];
		this.suggestionSupportsAutoAccept = keybindingService.createKey<boolean>(CONTEXT_SUGGESTION_SUPPORTS_ACCEPT_ON_KEY, true);

		this.telemetryData = null;
		this.telemetryService = telemetryService;

		var onModelModeChanged = () => {
			var model = this.editor.getModel();
			this.shouldShowEmptySuggestionList = SuggestRegistry.all(model)
				.some(support => support.shouldShowEmptySuggestionList());
		};

		onModelModeChanged();
		this.listenersToRemove = [];
		this.listenersToRemove.push(editor.addListener(EditorCommon.EventType.ModelChanged, onModelModeChanged));
		this.listenersToRemove.push(editor.addListener(EditorCommon.EventType.ModelModeChanged, onModelModeChanged));
		this.listenersToRemove.push(editor.addListener(EditorCommon.EventType.ModelModeSupportChanged, (e: EditorCommon.IModeSupportChangedEvent) => {
			if (e.suggestSupport) {
				onModelModeChanged();
			}
		}));
		let subscription = SuggestRegistry.onDidChange(onModelModeChanged);
		this.listenersToRemove.push(() => subscription.dispose());

		this.element = $('.editor-widget.suggest-widget.monaco-editor-background');
		this.element.style.width = SuggestWidget.WIDTH + 'px';
		this.element.style.top = '0';
		this.element.style.left = '0';

		this.messageElement = append(this.element, $('.message'));
		this.messageElement.style.display = 'none';

		if (!this.editor.getConfiguration().iconsInSuggestions) {
			addClass(this.element, 'no-icons');
		}

		const configuration = {
			renderer: this.renderer = new Renderer(),
			dataSource: new DataSource(),
			controller: new Controller(),
			filter: new Filter(() => this.state),
			sorter: new Sorter()
		};

		this.treeElement = append(this.element, $('.tree'));
		this.tree = new TreeImpl.Tree(this.treeElement, configuration, {
			twistiePixels: 0,
			alwaysFocused: true,
			verticalScrollMode: 'visible',
			useShadows: false
		});

		this.listenersToRemove.push(editor.addListener(EditorCommon.EventType.EditorTextBlur, () => {
			TPromise.timeout(150).done(() => {
				if (this.tree && !this.tree.isDOMFocused()) {
					this.hide();
				}
			});
		}));

		this.listenersToRemove.push(this.tree.addListener('selection', (e:Tree.ISelectionEvent) => {
			if (e.selection && e.selection.length > 0) {
				var element = e.selection[0];
				if (!element.hasOwnProperty('suggestions') && !(element instanceof MessageRoot) && !(element instanceof Message)) {
					const item: CompletionItem = element;
					const navigator = this.tree.getNavigator();

					this.telemetryData.selectedIndex = 0;
					this.telemetryData.wasCancelled = false;

					while (navigator.next() !== item) {
						this.telemetryData.selectedIndex++;
					}

					this.submitTelemetryData();

					const container = item.container;
					const overwriteBefore = (typeof container.overwriteBefore === 'undefined') ? container.currentWord.length : container.overwriteBefore;
					const overwriteAfter = (typeof container.overwriteAfter === 'undefined') ? 0 : Math.max(0, container.overwriteAfter);
					this.model.accept(item.suggestion, overwriteBefore, overwriteAfter);

					this.editor.focus();
				}
			}
		}));

		var oldFocus: any = null;

		this.listenersToRemove.push(this.tree.addListener('focus', (e:Tree.IFocusEvent) => {
			var focus = e.focus;
			var payload = e.payload;

			if(focus instanceof CompletionItem) {
				this.resolveDetails(<CompletionItem>focus);
				this.suggestionSupportsAutoAccept.set(!(<CompletionItem>focus).suggestion.noAutoAccept);
			}

			if (focus === oldFocus) {
				return;
			}

			var elementsToRefresh: any[] = [];

			if (oldFocus) {
				elementsToRefresh.push(oldFocus);
			}

			if (focus) {
				elementsToRefresh.push(focus);
			}

			oldFocus = focus;

			this.tree.refreshAll(elementsToRefresh).done(() => {
				this.updateWidgetHeight();

				if (focus) {
					return this.tree.reveal(focus, (payload && payload.firstSuggestion) ? 0 : null);
				}
			}, onUnexpectedError);
		}));

		this.editor.addContentWidget(this);

		this.listenersToRemove.push(this.editor.addListener(EditorCommon.EventType.CursorSelectionChanged, (e: EditorCommon.ICursorSelectionChangedEvent) => {
			if (this.isActive) {
				this.editor.layoutContentWidget(this);
			}
		}));

		var timer : Timer.ITimerEvent = null, loadingHandle:number;
		this.modelListenersToRemove.push(this.model.onDidTrigger(e => this.onDidTrigger(e)));
		this.modelListenersToRemove.push(this.model.onDidSuggest(e => this.onDidSuggest(e)));
		this.modelListenersToRemove.push(this.model.onDidCancel(e => this.onDidCancel(e)));

		this.setState(State.Hidden);
	}

	private setState(state: State): void {
		this.state = state;

		switch (state) {
			case State.Hidden:
				this.messageElement.style.display = 'none';
				this.treeElement.style.display = 'block';
				this.hide();
				return;
			case State.Loading:
				this.messageElement.innerText = SuggestWidget.LOADING_MESSAGE;
				this.messageElement.style.display = 'block';
				this.treeElement.style.display = 'none';
				break;
			case State.Empty:
				this.messageElement.innerText = SuggestWidget.NO_SUGGESTIONS_MESSAGE;
				this.messageElement.style.display = 'block';
				this.treeElement.style.display = 'none';
				break;
			case State.Open:
				this.messageElement.style.display = 'none';
				this.treeElement.style.display = 'block';
				break;
		}

		this.updateWidgetHeight();
		this.show();
	}

	private onDidTrigger(e: ITriggerEvent) {
		if (!this.isActive) {
			this.telemetryTimer = this.telemetryService.start('suggestWidgetLoadingTime');
			this.isLoading = true;
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
	}

	private onDidSuggest(e: ISuggestEvent): void {
		this.isLoading = false;
		clearTimeout(this.loadingTimeout);

		let model: CompletionModel = this.tree.getInput();
		let promise: TPromise<void>;

		if (model && model.raw === e.suggestions) {
			model.currentWord = e.currentWord;
			promise = this.tree.refresh();
		} else {
			model = new CompletionModel(e.suggestions, e.currentWord);
			promise = this.tree.setInput(model);
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
				var score = computeScore(item.suggestion.label, currentWord, currentWordLowerCase);
				if (score > bestScore) {
					bestScore = score;
					bestSuggestion = item;
					bestSuggestionIndex = index;
				}
				index++;
			}

			this.telemetryData = this.telemetryData || {};
			let reason: string;

			if (index === 0) { // no suggestions
				if (e.auto) {
					this.setState(State.Hidden);
				} else {
					if (this.shouldShowEmptySuggestionList) {
						this.setState(State.Empty);
					} else {
						this.setState(State.Hidden);
					}
				}

				reason = 'empty';
			} else {
				this.tree.setFocus(bestSuggestion, { firstSuggestion: true });

				this.telemetryData.suggestionCount = suggestions.length;
				this.telemetryData.suggestedIndex = bestSuggestionIndex;
				this.telemetryData.hintLength = currentWord.length;
				reason = 'results';

				this.setState(State.Open);
			}

			if(this.telemetryTimer) {
				this.telemetryTimer.data = { reason };
				this.telemetryTimer.stop();
				this.telemetryTimer = null;
			}
		}, onUnexpectedError);
	}

	private onDidCancel(e: ICancelEvent) {
		this.isLoading = false;

		if (!e.retrigger) {
			this.hide();

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
		if (item) {
			if(this.currentSuggestionDetails) {
				this.currentSuggestionDetails.cancel();
			}

			this.currentSuggestionDetails = item.resolveDetails(this.editor.getModel().getAssociatedResource(),
				this.model.getRequestPosition() || this.editor.getPosition());

			this.currentSuggestionDetails.then(() => {
				this.currentSuggestionDetails = undefined;
				return this.tree.refresh(item).then(() => this.updateWidgetHeight());
			})
			.done(null, err => !isPromiseCanceledError(err) && onUnexpectedError(err));
		}
	}

	public selectNextPage(): boolean {
		if (this.isLoading) {
			return !this.isAuto;
		}
		if (this.isActive) {
			this.tree.focusNextPage();
			return true;
		}
		return false;
	}

	public selectNext(): boolean {
		if (this.isLoading) {
			return !this.isAuto;
		}
		if (this.isActive) {
			var focus = this.tree.getFocus();
			this.tree.focusNext(1);
			if (focus === this.tree.getFocus()) {
				this.tree.focusFirst();
			}
			return true;
		}
		return false;
	}

	public selectPreviousPage(): boolean {
		if (this.isLoading) {
			return !this.isAuto;
		}
		if (this.isActive) {
			this.tree.focusPreviousPage();
			return true;
		}
		return false;
	}

	public selectPrevious(): boolean {
		if (this.isLoading) {
			return !this.isAuto;
		}
		if (this.isActive) {
			var focus = this.tree.getFocus();
			this.tree.focusPrevious(1);
			if (focus === this.tree.getFocus()) {
				this.tree.focusLast();
			}
			return true;
		}
		return false;
	}

	public acceptSelectedSuggestion() : boolean {
		if (this.isLoading) {
			return !this.isAuto;
		}
		if (this.isActive) {
			var focus = this.tree.getFocus();
			if (focus) {
				this.tree.setSelection([focus]);
			} else {
				this.model.cancel();
			}
			return true;
		}
		return false;
	}

	public show(): void {
		this._onDidVisibilityChange.fire(true);
		this.isActive = true;
		this.tree.layout();
		this.editor.layoutContentWidget(this);
		TPromise.timeout(100).done(() => {
			addClass(this.element, 'visible');
		});
	}

	public cancel(): void {
		this.model.cancel();
	}

	public hide(): void {
		this._onDidVisibilityChange.fire(false);
		this.isActive = false;
		removeClass(this.element, 'visible');
		this.editor.layoutContentWidget(this);
	}

	public getPosition():EditorBrowser.IContentWidgetPosition {
		if (this.isActive) {
			return {
				position: this.editor.getPosition(),
				preference: [EditorBrowser.ContentWidgetPositionPreference.BELOW, EditorBrowser.ContentWidgetPositionPreference.ABOVE]
			};
		}
		return null;
	}

	public getDomNode() : HTMLElement {
		return this.element;
	}

	public getId() : string {
		return SuggestWidget.ID;
	}

	private submitTelemetryData() : void {
		this.telemetryService.publicLog('suggestWidget', this.telemetryData);
		this.telemetryData = null;
	}

	private updateWidgetHeight(): void {
		var input = this.tree.getInput();
		var maxHeight = 1000;
		var height = 0;

		if (this.state === State.Empty || this.state === State.Loading) {
			height = 19;
		} else {
			var focus = this.tree.getFocus();
			var focusHeight = focus ? this.renderer.getHeight(this.tree, focus) : 19;
			height += focusHeight;

			const suggestionCount = (this.tree.getContentHeight() - focusHeight) / 19;
			const maxSuggestions = Math.floor((maxHeight - focusHeight) / 19);
			height += Math.min(suggestionCount, 11, maxSuggestions) * 19;
		}

		this.element.style.height = height + 'px';
		this.tree.layout(height);
		this.editor.layoutContentWidget(this);
	}

	public dispose() : void {
		this.modelListenersToRemove = disposeAll(this.modelListenersToRemove);
		this.model = null;
		this.tree.dispose();
		this.tree = null;
		this.element = null;

		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = null;
	}
}