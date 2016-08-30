/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./suggest';
import * as nls from 'vs/nls';
import * as strings from 'vs/base/common/strings';
import Event, { Emitter } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { isPromiseCanceledError, onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { addClass, append, $, hide, removeClass, show, toggleClass } from 'vs/base/browser/dom';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IDelegate, IFocusChangeEvent, IRenderer, ISelectionChangeEvent } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationChangedEvent } from 'vs/editor/common/editorCommon';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { Context as SuggestContext } from '../common/suggest';
import { ICompletionItem, CompletionModel } from '../common/completionModel';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

interface ISuggestionTemplateData {
	root: HTMLElement;
	icon: HTMLElement;
	colorspan: HTMLElement;
	highlightedLabel: HighlightedLabel;
	typeLabel: HTMLElement;
	documentationDetails: HTMLElement;
	documentation: HTMLElement;
	disposables: IDisposable[];
}

const colorRegExp = /^(#([\da-f]{3}){1,2}|(rgb|hsl)a\(\s*(\d{1,3}%?\s*,\s*){3}(1|0?\.\d+)\)|(rgb|hsl)\(\s*\d{1,3}%?(\s*,\s*\d{1,3}%?){2}\s*\))$/i;
function matchesColor(text: string) {
	return text && text.match(colorRegExp) ? text : null;
}

class Renderer implements IRenderer<ICompletionItem, ISuggestionTemplateData> {

	private triggerKeybindingLabel: string;

	constructor(
		private widget: SuggestWidget,
		private editor: ICodeEditor,
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
		data.disposables = [];
		data.root = container;
		data.icon = append(container, $('.icon'));
		data.colorspan = append(data.icon, $('span.colorspan'));

		const text = append(container, $('.text'));
		const main = append(text, $('.main'));
		data.highlightedLabel = new HighlightedLabel(main);
		data.disposables.push(data.highlightedLabel);
		data.typeLabel = append(main, $('span.type-label'));

		const docs = append(text, $('.docs'));
		data.documentation = append(docs, $('span.docs-text'));
		data.documentationDetails = append(docs, $('span.docs-details'));
		data.documentationDetails.title = nls.localize('readMore', "Read More...{0}", this.triggerKeybindingLabel);

		const configureFont = () => {
			const fontInfo = this.editor.getConfiguration().fontInfo;
			main.style.fontFamily = fontInfo.fontFamily;
		};

		configureFont();

		data.disposables.push(this.editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			if (e.fontInfo) {
				configureFont();
			}
		}));

		return data;
	}

	renderElement(element: ICompletionItem, index: number, templateData: ISuggestionTemplateData): void {
		const data = <ISuggestionTemplateData>templateData;
		const suggestion = (<ICompletionItem>element).suggestion;

		if (suggestion.documentation) {
			data.root.setAttribute('aria-label', nls.localize('suggestionWithDetailsAriaLabel', "{0}, suggestion, has details", suggestion.label));
		} else {
			data.root.setAttribute('aria-label', nls.localize('suggestionAriaLabel', "{0}, suggestion", suggestion.label));
		}

		data.icon.className = 'icon ' + suggestion.type;
		data.colorspan.style.backgroundColor = '';

		if (suggestion.type === 'color') {
			let color = matchesColor(suggestion.label) || matchesColor(suggestion.documentation);
			if (color) {
				data.icon.className = 'icon customcolor';
				data.colorspan.style.backgroundColor = color;
			}
		}

		data.highlightedLabel.set(suggestion.label, (<ICompletionItem>element).highlights);
		data.typeLabel.textContent = suggestion.detail || '';
		data.documentation.textContent = suggestion.documentation || '';

		if (suggestion.documentation) {
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
		templateData.disposables = dispose(templateData.disposables);
	}
}

const FocusHeight = 35;
const UnfocusedHeight = 19;

class Delegate implements IDelegate<ICompletionItem> {

	constructor(private listProvider: () => List<ICompletionItem>) { }

	getHeight(element: ICompletionItem): number {
		const focus = this.listProvider().getFocusedElements()[0];

		if (element.suggestion.documentation && element === focus) {
			return FocusHeight;
		}

		return UnfocusedHeight;
	}

	getTemplateId(element: ICompletionItem): string {
		return 'suggestion';
	}
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
	private scrollbar: DomScrollableElement;
	private body: HTMLElement;
	private type: HTMLElement;
	private docs: HTMLElement;
	private ariaLabel: string;
	private disposables: IDisposable[];

	constructor(
		container: HTMLElement,
		private widget: SuggestWidget,
		private editor: ICodeEditor
	) {
		this.disposables = [];

		this.el = append(container, $('.details'));
		this.disposables.push(toDisposable(() => container.removeChild(this.el)));

		const header = append(this.el, $('.header'));
		this.title = append(header, $('span.title'));
		this.back = append(header, $('span.go-back'));
		this.back.title = nls.localize('goback', "Go back");
		this.body = $('.body');

		this.scrollbar = new DomScrollableElement(this.body, { canUseTranslate3d: false });
		append(this.el, this.scrollbar.getDomNode());
		this.disposables.push(this.scrollbar);

		this.type = append(this.body, $('p.type'));
		this.docs = append(this.body, $('p.docs'));
		this.ariaLabel = null;

		this.configureFont();

		this.disposables.push(this.editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			if (e.fontInfo) {
				this.configureFont();
			}
		}));
	}

	get element() {
		return this.el;
	}

	render(item: ICompletionItem): void {
		if (!item) {
			this.title.textContent = '';
			this.type.textContent = '';
			this.docs.textContent = '';
			this.ariaLabel = null;
			return;
		}

		this.title.innerText = item.suggestion.label;
		this.type.innerText = item.suggestion.detail || '';
		this.docs.innerText = item.suggestion.documentation;
		this.back.onmousedown = e => {
			e.preventDefault();
			e.stopPropagation();
		};
		this.back.onclick = e => {
			e.preventDefault();
			e.stopPropagation();
			this.widget.toggleDetails();
		};

		this.scrollbar.scanDomNode();

		this.ariaLabel = strings.format('{0}\n{1}\n{2}', item.suggestion.label || '', item.suggestion.detail || '', item.suggestion.documentation || '');
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

	private configureFont() {
		const fontInfo = this.editor.getConfiguration().fontInfo;
		this.title.style.fontFamily = fontInfo.fontFamily;
		this.type.style.fontFamily = fontInfo.fontFamily;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class SuggestWidget implements IContentWidget, IDisposable {

	private static ID: string = 'editor.widget.suggestWidget';

	static LOADING_MESSAGE: string = nls.localize('suggestWidget.loading', "Loading...");
	static NO_SUGGESTIONS_MESSAGE: string = nls.localize('suggestWidget.noSuggestions', "No suggestions.");

	allowEditorOverflow: boolean = true; // Editor.IContentWidget.allowEditorOverflow

	private state: State;
	private isAuto: boolean;
	private loadingTimeout: number;
	private currentSuggestionDetails: TPromise<void>;
	private focusedItem: ICompletionItem;
	private completionModel: CompletionModel;

	private element: HTMLElement;
	private messageElement: HTMLElement;
	private listElement: HTMLElement;
	private details: SuggestionDetails;
	private delegate: IDelegate<ICompletionItem>;
	private list: List<ICompletionItem>;

	private suggestWidgetVisible: IContextKey<boolean>;
	private suggestWidgetMultipleSuggestions: IContextKey<boolean>;
	private suggestionSupportsAutoAccept: IContextKey<boolean>;

	private onDidSelectEmitter = new Emitter<ICompletionItem>();

	private editorBlurTimeout: TPromise<void>;
	private showTimeout: TPromise<void>;
	private toDispose: IDisposable[];

	constructor(
		private editor: ICodeEditor,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.isAuto = false;
		this.focusedItem = null;

		this.element = $('.editor-widget.suggest-widget');

		if (!this.editor.getConfiguration().contribInfo.iconsInSuggestions) {
			addClass(this.element, 'no-icons');
		}

		this.messageElement = append(this.element, $('.message'));
		this.listElement = append(this.element, $('.tree'));
		this.details = new SuggestionDetails(this.element, this, this.editor);

		let renderer: IRenderer<ICompletionItem, any> = instantiationService.createInstance(Renderer, this, this.editor);

		this.delegate = new Delegate(() => this.list);
		this.list = new List(this.listElement, this.delegate, [renderer], {
			useShadows: false
		});

		this.toDispose = [
			editor.onDidBlurEditorText(() => this.onEditorBlur()),
			this.list.onSelectionChange(e => this.onListSelection(e)),
			this.list.onFocusChange(e => this.onListFocus(e)),
			this.editor.onDidChangeCursorSelection(() => this.onCursorSelectionChanged())
		];

		this.suggestWidgetVisible = SuggestContext.Visible.bindTo(contextKeyService);
		this.suggestWidgetMultipleSuggestions = SuggestContext.MultipleSuggestions.bindTo(contextKeyService);
		this.suggestionSupportsAutoAccept = SuggestContext.AcceptOnKey.bindTo(contextKeyService);

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

	private onListSelection(e: ISelectionChangeEvent<ICompletionItem>): void {
		if (!e.elements.length) {
			return;
		}

		const item = e.elements[0];
		this.onDidSelectEmitter.fire(item);

		alert(nls.localize('suggestionAriaAccepted', "{0}, accepted", item.suggestion.label));

		this.editor.focus();
	}

	private _getSuggestionAriaAlertLabel(item:ICompletionItem): string {
		if (item.suggestion.documentation) {
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

	private onListFocus(e: IFocusChangeEvent<ICompletionItem>): void {
		if (!e.elements.length) {
			if (this.currentSuggestionDetails) {
				this.currentSuggestionDetails.cancel();
				this.currentSuggestionDetails = null;
				this.focusedItem = null;
			}

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

		if (this.currentSuggestionDetails) {
			this.currentSuggestionDetails.cancel();
			this.currentSuggestionDetails = null;
		}

		const index = e.indexes[0];

		this.suggestionSupportsAutoAccept.set(!item.suggestion.noAutoAccept);
		this.focusedItem = item;
		this.updateWidgetHeight();
		this.list.reveal(index);

		this.currentSuggestionDetails = item.resolve()
			.then(() => {
				this.list.setFocus(index);
				this.updateWidgetHeight();
				this.list.reveal(index);

				this._ariaAlert(this._getSuggestionAriaAlertLabel(item));
			})
			.then(null, err => !isPromiseCanceledError(err) && onUnexpectedError(err))
			.then(() => this.currentSuggestionDetails = null);
	}

	private setState(state: State): void {
		if (!this.element) {
			return;
		}

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

	get onDidSelect():Event<ICompletionItem> {
		return this.onDidSelectEmitter.event;
	}

	showTriggered(auto: boolean) {
		if (this.state !== State.Hidden) {
			return;
		}

		this.isAuto = !!auto;

		if (!this.isAuto) {
			this.loadingTimeout = setTimeout(() => {
				this.loadingTimeout = null;
				this.setState(State.Loading);
			}, 50);
		}
	}

	showSuggestions(completionModel: CompletionModel, isFrozen: boolean, isAuto: boolean): void {
		if (this.loadingTimeout) {
			clearTimeout(this.loadingTimeout);
			this.loadingTimeout = null;
		}

		this.completionModel = completionModel;

		if (isFrozen && this.state !== State.Empty) {
			this.setState(State.Frozen);
			return;
		}

		let visibleCount = this.completionModel.items.length;

		const isEmpty = visibleCount === 0;
		this.suggestWidgetMultipleSuggestions.set(visibleCount > 1);

		if (isEmpty) {
			if (isAuto) {
				this.setState(State.Hidden);
			} else {
				this.setState(State.Empty);
			}

			this.completionModel = null;

		} else {
			const {stats}  = this.completionModel;
			stats['wasAutomaticallyTriggered'] = !!isAuto;
			this.telemetryService.publicLog('suggestWidget', stats);

			this.list.splice(0, this.list.length, ...this.completionModel.items);
			this.list.setFocus(this.completionModel.topScoreIdx);
			this.list.reveal(this.completionModel.topScoreIdx, 0);

			this.setState(State.Open);
		}
	}

	selectNextPage(): boolean {
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

	selectNext(): boolean {
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

	selectPreviousPage(): boolean {
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

	selectPrevious(): boolean {
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
				return false;
		}
	}

	getFocusedItem(): ICompletionItem {
		if (this.state !== State.Hidden
			&& this.state !== State.Empty
			&& this.state !== State.Loading) {

			return this.list.getFocusedElements()[0];
		}
	}

	toggleDetails(): void {
		if (this.state === State.Details) {
			this.setState(State.Open);
			this.editor.focus();
			return;
		}

		if (this.state !== State.Open) {
			return;
		}

		const item = this.list.getFocusedElements()[0];

		if (!item || !item.suggestion.documentation) {
			return;
		}

		this.setState(State.Details);
		this.editor.focus();
	}

	private show(): void {
		this.updateWidgetHeight();
		this.suggestWidgetVisible.set(true);
		this.renderDetails();
		this.showTimeout = TPromise.timeout(100).then(() => {
			addClass(this.element, 'visible');
		});
	}

	private hide(): void {
		this.suggestWidgetVisible.reset();
		removeClass(this.element, 'visible');
	}

	hideWidget(): void {
		clearTimeout(this.loadingTimeout);
		this.setState(State.Hidden);
	}

	hideDetailsOrHideWidget(): void {
		if (this.state === State.Details) {
			this.toggleDetails();
		} else {
			this.hideWidget();
		}
	}

	getPosition(): IContentWidgetPosition {
		if (this.state === State.Hidden) {
			return null;
		}

		return {
			position: this.editor.getPosition(),
			preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE]
		};
	}

	getDomNode(): HTMLElement {
		return this.element;
	}

	getId(): string {
		return SuggestWidget.ID;
	}

	private updateWidgetHeight(): number {
		let height = 0;

		if (this.state === State.Empty || this.state === State.Loading) {
			height = UnfocusedHeight;
		} else if (this.state === State.Details) {
			height = 12 * UnfocusedHeight;
		} else {
			const focus = this.list.getFocusedElements()[0];
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
			this.details.render(this.list.getFocusedElements()[0]);
		}
	}

	dispose(): void {
		this.state = null;
		this.suggestionSupportsAutoAccept = null;
		this.currentSuggestionDetails = null;
		this.focusedItem = null;
		this.element = null;
		this.messageElement = null;
		this.listElement = null;
		this.details.dispose();
		this.details = null;
		this.list.dispose();
		this.list = null;
		this.toDispose = dispose(this.toDispose);
		if (this.loadingTimeout) {
			clearTimeout(this.loadingTimeout);
			this.loadingTimeout = null;
		}

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
