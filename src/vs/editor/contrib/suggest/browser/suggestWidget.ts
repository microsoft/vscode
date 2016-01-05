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
import { append, addClass, removeClass, emmet as $ } from 'vs/base/browser/dom';
import * as Tree from 'vs/base/parts/tree/common/tree';
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
import { ISuggestSupport, ISuggestResult, ISuggestion, ISuggestionCompare, ISuggestionFilter } from 'vs/editor/common/modes';
import { DefaultFilter, IMatch } from 'vs/editor/common/modes/modesFilters';
import { ISuggestResult2 } from '../common/suggest';
import URI from 'vs/base/common/uri';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { onUnexpectedError, isPromiseCanceledError, illegalArgument } from 'vs/base/common/errors';

const defaultCompare: ISuggestionCompare = (a, b) => {
	return (a.sortText || a.label).localeCompare((b.sortText || b.label));
}

class CompletionItem {

	private static _idPool: number = 0;

	id: string;
	suggestion: ISuggestion;
	highlights: IMatch[];
	support: ISuggestSupport;
	container: ISuggestResult;

	private _resolveDetails: TPromise<CompletionItem>

	constructor(public group: CompletionGroup, suggestion: ISuggestion, container: ISuggestResult2) {
		this.id = '_completion_item_#' + CompletionItem._idPool++;
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

		this.compare = defaultCompare;
		this.filter = DefaultFilter;

		if (this.items.length > 0) {
			const [first] = this.items;

			if (first.support) {
				this.compare = first.support.getSorter && first.support.getSorter() || this.compare;
				this.filter = first.support.getFilter && first.support.getFilter() || this.filter;
			}
		}
	}

	get visibleCount(): number {
		return this.items.reduce((r, i) => r + (isFalsyOrEmpty(this.filter(this.model.currentWord, i.suggestion)) ? 0 : 1), 0);
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

	get visibleCount(): number {
		return this.groups.reduce((r, g) => r + g.visibleCount, 0);
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

function isRoot(element: any): boolean {
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

	/* protected */ public onLeftClick(tree: Tree.ITree, element: any, event: Mouse.StandardMouseEvent): boolean {
		event.preventDefault();
		event.stopPropagation();

		if (!(element instanceof Message)) {
			tree.setSelection([element], { origin: 'mouse' });
		}

		return true;
	}
}

class Filter implements Tree.IFilter {

	constructor(private getState: () => State) { }

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

	public getHeight(tree: Tree.ITree, element: any): number {
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
		data.documentation = append(text, $('.docs'));

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
	Triggered,
	Loading,
	Empty,
	Open,
	Frozen
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
	private tree: Tree.ITree;
	private renderer: Renderer;

	private toDispose: IDisposable[];

	private _onDidVisibilityChange: Emitter<boolean> = new Emitter();
	public get onDidVisibilityChange(): Event<boolean> { return this._onDidVisibilityChange.event; }

	constructor(
		private editor: EditorBrowser.ICodeEditor,
		private model: SuggestModel,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService
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
		this.messageElement.style.display = 'none';
		this.treeElement = append(this.element, $('.tree'));

		const configuration = {
			renderer: this.renderer = new Renderer(),
			dataSource: new DataSource(),
			controller: new Controller(),
			filter: new Filter(() => this.state),
			sorter: new Sorter()
		};

		const options = {
			twistiePixels: 0,
			alwaysFocused: true,
			verticalScrollMode: 'visible',
			useShadows: false
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
			if (this.tree && !this.tree.isDOMFocused()) {
				this.setState(State.Hidden);
			}
		});
	}

	private onTreeSelection(e: Tree.ISelectionEvent): void {
		if (!e.selection || e.selection.length === 0) {
			return;
		}

		const element = e.selection[0];

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
		this.state = state;

		switch (state) {
			case State.Hidden:
				this.messageElement.style.display = 'none';
				this.treeElement.style.display = 'block';
				this.hide();
				return;
			case State.Triggered:
				this.messageElement.style.display = 'none';
				this.treeElement.style.display = 'block';
				this.hide();
				return;
			case State.Loading:
				this.messageElement.innerText = SuggestWidget.LOADING_MESSAGE;
				this.messageElement.style.display = 'block';
				this.treeElement.style.display = 'none';
				removeClass(this.element, 'frozen');
				break;
			case State.Empty:
				this.messageElement.innerText = SuggestWidget.NO_SUGGESTIONS_MESSAGE;
				this.messageElement.style.display = 'block';
				this.treeElement.style.display = 'none';
				removeClass(this.element, 'frozen');
				break;
			case State.Open:
				this.messageElement.style.display = 'none';
				this.treeElement.style.display = 'block';
				removeClass(this.element, 'frozen');
				break;
			case State.Frozen:
				this.messageElement.style.display = 'none';
				this.treeElement.style.display = 'block';
				addClass(this.element, 'frozen');
				break;
		}

		this.updateWidgetHeight();
		this.show();
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
			visibleCount = model.visibleCount;

			if (!e.auto && visibleCount === 0) {
				model.currentWord = oldCurrentWord;

				if (model.visibleCount > 0) {
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
			visibleCount = model.visibleCount;
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
			case State.Triggered:
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
			case State.Triggered:
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
			case State.Triggered:
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
			case State.Triggered:
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
			case State.Triggered:
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

	public show(): void {
		this._onDidVisibilityChange.fire(true);
		this.tree.layout();
		this.editor.layoutContentWidget(this);
		TPromise.timeout(100).done(() => {
			addClass(this.element, 'visible');
		});
	}

	public hide(): void {
		this._onDidVisibilityChange.fire(false);
		removeClass(this.element, 'visible');
		this.editor.layoutContentWidget(this);
	}

	public cancel(): void {
		this.model.cancel();
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
		const maxHeight = 1000;
		let height = 0;

		if (this.state === State.Empty || this.state === State.Loading) {
			height = 19;
		} else {
			const focus = this.tree.getFocus();
			const focusHeight = focus ? this.renderer.getHeight(this.tree, focus) : 19;
			height += focusHeight;

			const suggestionCount = (this.tree.getContentHeight() - focusHeight) / 19;
			const maxSuggestions = Math.floor((maxHeight - focusHeight) / 19);
			height += Math.min(suggestionCount, 11, maxSuggestions) * 19;
		}

		this.element.style.height = height + 'px';
		this.tree.layout(height);
		this.editor.layoutContentWidget(this);
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
		this.tree.dispose();
		this.tree = null;
		this.renderer = null;
		this.toDispose = disposeAll(this.toDispose);
		this._onDidVisibilityChange.dispose();
		this._onDidVisibilityChange = null;
	}
}
