/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./suggest';
import * as nls from 'vs/nls';
import * as strings from 'vs/base/common/strings';
import {isPromiseCanceledError, onUnexpectedError} from 'vs/base/common/errors';
import Event, { Emitter } from 'vs/base/common/event';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import * as timer from 'vs/base/common/timer';
import {TPromise} from 'vs/base/common/winjs.base';
import {addClass, append, emmet as $, hide, removeClass, show, toggleClass} from 'vs/base/browser/dom';
import {HighlightedLabel} from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import {IDelegate, IFocusChangeEvent, IRenderer, ISelectionChangeEvent} from 'vs/base/browser/ui/list/list';
import {List} from 'vs/base/browser/ui/list/listWidget';
import {ScrollableElement} from 'vs/base/browser/ui/scrollbar/scrollableElementImpl';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {EventType, IModeSupportChangedEvent} from 'vs/editor/common/editorCommon';
import {ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition} from 'vs/editor/browser/editorBrowser';
import {CONTEXT_SUGGESTION_SUPPORTS_ACCEPT_ON_KEY, SuggestRegistry} from '../common/suggest';
import {CompletionItem, CompletionModel} from './completionModel';
import {ICancelEvent, ISuggestEvent, ITriggerEvent, SuggestModel} from './suggestModel';
import {alert} from 'vs/base/browser/ui/aria/aria';

interface ISuggestionTemplateData {
	root: HTMLElement;
	icon: HTMLElement;
	colorspan: HTMLElement;
	highlightedLabel: HighlightedLabel;
	typeLabel: HTMLElement;
	documentationDetails: HTMLElement;
	documentation: HTMLElement;
}

class Renderer implements IRenderer<CompletionItem, ISuggestionTemplateData> {

	private triggerKeybindingLabel: string;

	constructor(
		private widget: SuggestWidget,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		const keybindings = keybindingService.lookupKeybindings('editor.action.triggerSuggest');
		this.triggerKeybindingLabel = keybindings.length === 0 ? '' : ` (${keybindingService.getLabelFor(keybindings[0])})`;
	}

	get templateId(): string {
		return 'suggestion';
	}

	renderTemplate(container: HTMLElement): ISuggestionTemplateData {
		const data = <ISuggestionTemplateData>Object.create(null);
		data.root = container;

		data.icon = append(container, $('.icon'));
		data.colorspan = append(data.icon, $('span.colorspan'));

		const text = append(container, $('.text'));
		const main = append(text, $('.main'));
		data.highlightedLabel = new HighlightedLabel(main);
		data.typeLabel = append(main, $('span.type-label'));
		const docs = append(text, $('.docs'));
		data.documentation = append(docs, $('span.docs-text'));
		data.documentationDetails = append(docs, $('span.docs-details.octicon.octicon-info'));
		data.documentationDetails.title = nls.localize('readMore', "Read More...{0}", this.triggerKeybindingLabel);

		return data;
	}

	renderElement(element: CompletionItem, index: number, templateData: ISuggestionTemplateData): void {
		const data = <ISuggestionTemplateData>templateData;
		const suggestion = (<CompletionItem>element).suggestion;

		if (suggestion.documentationLabel) {
			data.root.setAttribute('aria-label', nls.localize('suggestionWithDetailsAriaLabel', "{0}, suggestion, has details", suggestion.label));
		} else {
			data.root.setAttribute('aria-label', nls.localize('suggestionAriaLabel', "{0}, suggestion", suggestion.label));
		}

		if (suggestion.type && suggestion.type.charAt(0) === '#') {
			data.icon.className = 'icon customcolor';
			data.colorspan.style.backgroundColor = suggestion.type.substring(1);
		} else {
			data.icon.className = 'icon ' + suggestion.type;
			data.colorspan.style.backgroundColor = '';
		}

		data.highlightedLabel.set(suggestion.label, (<CompletionItem>element).highlights);
		data.typeLabel.textContent = suggestion.typeLabel || '';
		data.documentation.textContent = suggestion.documentationLabel || '';

		if (suggestion.documentationLabel) {
			show(data.documentationDetails);
			data.documentationDetails.onmousedown = e => {
				e.stopPropagation();
				e.preventDefault();
			};
			data.documentationDetails.onclick = e => {
				e.stopPropagation();
				e.preventDefault();
				this.widget.toggleDetails();
			};
		} else {
			hide(data.documentationDetails);
			data.documentationDetails.onmousedown = null;
			data.documentationDetails.onclick = null;
		}
	}

	disposeTemplate(templateData: ISuggestionTemplateData): void {
		templateData.highlightedLabel.dispose();
	}
}

const FocusHeight = 35;
const UnfocusedHeight = 19;

class Delegate implements IDelegate<CompletionItem> {

	constructor(private listProvider: () => List<CompletionItem>) { }

	getHeight(element: CompletionItem): number {
		const focus = this.listProvider().getFocus()[0];

		if (element.suggestion.documentationLabel && element === focus) {
			return FocusHeight;
		}

		return UnfocusedHeight;
	}

	getTemplateId(element: CompletionItem): string {
		return 'suggestion';
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
	private ariaLabel:string;

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

		this.ariaLabel = null;
	}

	get element() {
		return this.el;
	}

	render(item: CompletionItem): void {
		if (!item) {
			this.title.textContent = '';
			this.type.textContent = '';
			this.docs.textContent = '';
			this.ariaLabel = null;
			return;
		}

		this.title.innerText = item.suggestion.label;
		this.type.innerText = item.suggestion.typeLabel || '';
		this.docs.innerText = item.suggestion.documentationLabel;
		this.back.onmousedown = e => {
			e.preventDefault();
			e.stopPropagation();
		};
		this.back.onclick = e => {
			e.preventDefault();
			e.stopPropagation();
			this.widget.toggleDetails();
		};

		this.scrollable.onElementDimensions();
		this.scrollable.onElementInternalDimensions();

		this.ariaLabel = strings.format('{0}\n{1}\n{2}', item.suggestion.label || '', item.suggestion.typeLabel || '', item.suggestion.documentationLabel || '');
	}

	getAriaLabel(): string {
		return this.ariaLabel;
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

export class SuggestWidget implements IContentWidget, IDisposable {

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
	private currentSuggestionDetails: TPromise<void>;
	private focusedItem: CompletionItem;
	private completionModel: CompletionModel;

	private telemetryData: ITelemetryData;
	private telemetryService: ITelemetryService;
	private telemetryTimer: timer.ITimerEvent;

	private element: HTMLElement;
	private messageElement: HTMLElement;
	private listElement: HTMLElement;
	private details: SuggestionDetails;
	private delegate: IDelegate<CompletionItem>;
	private list: List<CompletionItem>;

	private editorBlurTimeout: TPromise<void>;
	private showTimeout: TPromise<void>;
	private toDispose: IDisposable[];

	private _onDidVisibilityChange: Emitter<boolean> = new Emitter();
	public get onDidVisibilityChange(): Event<boolean> { return this._onDidVisibilityChange.event; }

	constructor(
		private editor: ICodeEditor,
		private model: SuggestModel,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.isAuto = false;
		this.focusedItem = null;
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
		this.listElement = append(this.element, $('.tree'));
		this.details = new SuggestionDetails(this.element, this);

		let renderer: IRenderer<CompletionItem, any> = instantiationService.createInstance(Renderer, this);

		this.delegate = new Delegate(() => this.list);
		this.list = new List(this.listElement, this.delegate, [renderer]);

		this.toDispose = [
			editor.addListener2(EventType.ModelChanged, () => this.onModelModeChanged()),
			editor.addListener2(EventType.ModelModeChanged, () => this.onModelModeChanged()),
			editor.addListener2(EventType.ModelModeSupportChanged, (e: IModeSupportChangedEvent) => e.suggestSupport && this.onModelModeChanged()),
			SuggestRegistry.onDidChange(() => this.onModelModeChanged()),
			editor.addListener2(EventType.EditorTextBlur, () => this.onEditorBlur()),
			this.list.onSelectionChange(e => this.onListSelection(e)),
			this.list.onFocusChange(e => this.onListFocus(e)),
			this.editor.addListener2(EventType.CursorSelectionChanged, () => this.onCursorSelectionChanged()),
			this.model.onDidTrigger(e => this.onDidTrigger(e)),
			this.model.onDidSuggest(e => this.onDidSuggest(e)),
			this.model.onDidCancel(e => this.onDidCancel(e))
		];

		this.onModelModeChanged();
		this.editor.addContentWidget(this);
		this.setState(State.Hidden);

		// TODO@Alex: this is useful, but spammy
		// var isVisible = false;
		// this.onDidVisibilityChange((newIsVisible) => {
		// 	if (isVisible === newIsVisible) {
		// 		return;
		// 	}
		// 	isVisible = newIsVisible;
		// 	if (isVisible) {
		// 		alert(nls.localize('suggestWidgetAriaVisible', "Suggestions opened"));
		// 	} else {
		// 		alert(nls.localize('suggestWidgetAriaInvisible', "Suggestions closed"));
		// 	}
		// });
	}

	private onCursorSelectionChanged(): void {
		if (this.state === State.Hidden) {
			return;
		}

		this.editor.layoutContentWidget(this);
	}

	private onEditorBlur(): void {
		this.editorBlurTimeout = TPromise.timeout(150).then(() => {
			if (!this.editor.isFocused()) {
				this.setState(State.Hidden);
			}
		});
	}

	private onListSelection(e: ISelectionChangeEvent<CompletionItem>): void {
		if (!e.elements.length) {
			return;
		}

		this.telemetryData.selectedIndex = 0;
		this.telemetryData.wasCancelled = false;
		this.telemetryData.selectedIndex = e.indexes[0];
		this.submitTelemetryData();

		const item = e.elements[0];
		const container = item.container;
		const overwriteBefore = (typeof item.suggestion.overwriteBefore === 'undefined') ? container.currentWord.length : item.suggestion.overwriteBefore;
		const overwriteAfter = (typeof item.suggestion.overwriteAfter === 'undefined') ? 0 : Math.max(0, item.suggestion.overwriteAfter);
		this.model.accept(item.suggestion, overwriteBefore, overwriteAfter);

		alert(nls.localize('suggestionAriaAccepted', "{0}, accepted", item.suggestion.label));

		this.editor.focus();
	}

	private _getSuggestionAriaAlertLabel(item:CompletionItem): string {
		if (item.suggestion.documentationLabel) {
			return nls.localize('ariaCurrentSuggestionWithDetails',"{0}, suggestion, has details", item.suggestion.label);
		} else {
			return nls.localize('ariaCurrentSuggestion',"{0}, suggestion", item.suggestion.label);
		}
	}

	private _lastAriaAlertLabel: string;
	private _ariaAlert(newAriaAlertLabel:string): void {
		if (this._lastAriaAlertLabel === newAriaAlertLabel) {
			return;
		}
		this._lastAriaAlertLabel = newAriaAlertLabel;
		if (this._lastAriaAlertLabel) {
			alert(this._lastAriaAlertLabel);
		}
	}

	private onListFocus(e: IFocusChangeEvent<CompletionItem>): void {
		if (this.currentSuggestionDetails) {
			this.currentSuggestionDetails.cancel();
			this.currentSuggestionDetails = null;
		}

		if (!e.elements.length) {
			this._ariaAlert(null);

			// TODO@Alex: Chromium bug
			// this.editor.setAriaActiveDescendant(null);

			return;
		}

		const item = e.elements[0];
		this._ariaAlert(this._getSuggestionAriaAlertLabel(item));

		// TODO@Alex: Chromium bug
		// // TODO@Alex: the list is not done rendering...
		// setTimeout(() => {
		// 	this.editor.setAriaActiveDescendant(this.list.getElementId(e.indexes[0]));
		// }, 100);

		if (item === this.focusedItem) {
			return;
		}

		const index = e.indexes[0];

		this.suggestionSupportsAutoAccept.set(!item.suggestion.noAutoAccept);
		this.focusedItem = item;
		this.list.setFocus(index);
		this.updateWidgetHeight();
		this.list.reveal(index);

		const resource = this.editor.getModel().getAssociatedResource();
		const position = this.model.getRequestPosition() || this.editor.getPosition();

		this.currentSuggestionDetails = item.resolveDetails(resource, position)
			.then(details => {
				item.updateDetails(details);
				this.list.setFocus(index);
				this.updateWidgetHeight();
				this.list.reveal(index);

				this._ariaAlert(this._getSuggestionAriaAlertLabel(item));
			})
			.then(null, err => !isPromiseCanceledError(err) && onUnexpectedError(err))
			.then(() => this.currentSuggestionDetails = null);
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
				show(this.listElement);
				this.hide();
				if (stateChanged) {
					this.list.splice(0, this.list.length);
				}
				break;
			case State.Loading:
				this.messageElement.innerText = SuggestWidget.LOADING_MESSAGE;
				hide(this.listElement, this.details.element);
				show(this.messageElement);
				this.show();
				break;
			case State.Empty:
				this.messageElement.innerText = SuggestWidget.NO_SUGGESTIONS_MESSAGE;
				hide(this.listElement, this.details.element);
				show(this.messageElement);
				this.show();
				break;
			case State.Open:
				hide(this.messageElement, this.details.element);
				show(this.listElement);
				this.show();
				break;
			case State.Frozen:
				hide(this.messageElement, this.details.element);
				show(this.listElement);
				this.show();
				break;
			case State.Details:
				hide(this.messageElement, this.listElement);
				show(this.details.element);
				this.show();
				this._ariaAlert(this.details.getAriaLabel());
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

		this.completionModel = e.completionModel;

		if (e.isFrozen && this.state !== State.Empty) {
			this.setState(State.Frozen);
			return;
		}

		let visibleCount = this.completionModel.items.length;

		const isEmpty = visibleCount === 0;

		if (isEmpty) {
			if (e.auto) {
				this.setState(State.Hidden);
			} else {
				if (this.shouldShowEmptySuggestionList) {
					this.setState(State.Empty);
				} else {
					this.setState(State.Hidden);
				}
			}

			this.completionModel = null;

		} else {
			const currentWord = e.currentWord;
			const currentWordLowerCase = currentWord.toLowerCase();
			let bestSuggestionIndex = -1;
			let bestScore = -1;

			this.completionModel.items.forEach((item, index) => {
				const score = computeScore(item.suggestion.label, currentWord, currentWordLowerCase);

				if (score > bestScore) {
					bestScore = score;
					bestSuggestionIndex = index;
				}
			});

			this.telemetryData = this.telemetryData || {};
			this.telemetryData.suggestionCount = this.completionModel.items.length;
			this.telemetryData.suggestedIndex = bestSuggestionIndex;
			this.telemetryData.hintLength = currentWord.length;

			this.list.splice(0, this.list.length, ...this.completionModel.items);
			this.list.setFocus(bestSuggestionIndex);
			this.list.reveal(bestSuggestionIndex, 0);

			this.setState(State.Open);
		}

		if (this.telemetryTimer) {
			this.telemetryTimer.data = { reason: isEmpty ? 'empty' : 'results' };
			this.telemetryTimer.stop();
			this.telemetryTimer = null;
		}
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
				this.list.focusNextPage();
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
				this.list.focusNext(1, true);
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
				this.list.focusPreviousPage();
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
				this.list.focusPrevious(1, true);
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
				const focus = this.list.getFocus()[0];
				if (focus) {
					this.list.setSelection(this.completionModel.items.indexOf(focus));
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

		const item = this.list.getFocus()[0];

		if (!item || !item.suggestion.documentationLabel) {
			return;
		}

		this.setState(State.Details);
		this.editor.focus();
	}

	private show(): void {
		this.updateWidgetHeight();
		this._onDidVisibilityChange.fire(true);
		this.renderDetails();
		this.showTimeout = TPromise.timeout(100).then(() => {
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

	public getPosition(): IContentWidgetPosition {
		if (this.state === State.Hidden) {
			return null;
		}

		return {
			position: this.editor.getPosition(),
			preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE]
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

	private updateWidgetHeight(): number {
		let height = 0;

		if (this.state === State.Empty || this.state === State.Loading) {
			height = UnfocusedHeight;
		} else if (this.state === State.Details) {
			height = 12 * UnfocusedHeight;
		} else {
			const focus = this.list.getFocus()[0];
			const focusHeight = focus ? this.delegate.getHeight(focus) : UnfocusedHeight;
			height = focusHeight;

			const suggestionCount = (this.list.contentHeight - focusHeight) / UnfocusedHeight;
			height += Math.min(suggestionCount, 11) * UnfocusedHeight;
		}

		this.element.style.height = height + 'px';
		this.list.layout(height);
		this.editor.layoutContentWidget(this);

		return height;
	}

	private renderDetails(): void {
		if (this.state !== State.Details) {
			this.details.render(null);
		} else {
			this.details.render(this.list.getFocus()[0]);
		}
	}

	public dispose(): void {
		this.state = null;
		this.suggestionSupportsAutoAccept = null;
		this.currentSuggestionDetails = null;
		this.focusedItem = null;
		this.telemetryData = null;
		this.telemetryService = null;
		this.telemetryTimer = null;
		this.element = null;
		this.messageElement = null;
		this.listElement = null;
		this.details.dispose();
		this.details = null;
		this.list.dispose();
		this.list = null;
		this.toDispose = disposeAll(this.toDispose);
		this._onDidVisibilityChange.dispose();
		this._onDidVisibilityChange = null;
		clearTimeout(this.loadingTimeout);
		this.loadingTimeout = null;

		if (this.editorBlurTimeout) {
			this.editorBlurTimeout.cancel();
			this.editorBlurTimeout = null;
		}

		if (this.showTimeout) {
			this.showTimeout.cancel();
			this.showTimeout = null;
		}
	}
}
