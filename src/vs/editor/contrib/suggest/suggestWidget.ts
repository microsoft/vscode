/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/suggest';
import 'vs/base/browser/ui/codicons/codiconStyles'; // The codicon symbol styles are defined here and must be loaded
import 'vs/editor/contrib/documentSymbols/outlineTree'; // The codicon symbol colors are defined here and must be loaded
import * as nls from 'vs/nls';
import * as strings from 'vs/base/common/strings';
import * as dom from 'vs/base/browser/dom';
import { Event, Emitter } from 'vs/base/common/event';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { IListEvent, IListMouseEvent, IListGestureEvent } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { Context as SuggestContext, CompletionItem } from './suggest';
import { CompletionModel } from './completionModel';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService, IColorTheme, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { registerColor, editorWidgetBackground, listFocusBackground, activeContrastBorder, listHighlightForeground, editorForeground, editorWidgetBorder, focusBorder, textLinkForeground, textCodeBlockBackground } from 'vs/platform/theme/common/colorRegistry';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { TimeoutTimer, CancelablePromise, createCancelablePromise, disposableTimeout } from 'vs/base/common/async';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { SuggestDetailsWidget, canExpandCompletionItem, SuggestDetailsOverlay } from './suggestWidgetDetails';
import { SuggestWidgetStatus } from 'vs/editor/contrib/suggest/suggestWidgetStatus';
import { getAriaId, ItemRenderer } from './suggestWidgetRenderer';
import { ResizableHTMLElement } from './resizable';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IPosition } from 'vs/editor/common/core/position';

/**
 * Suggest widget colors
 */
export const editorSuggestWidgetBackground = registerColor('editorSuggestWidget.background', { dark: editorWidgetBackground, light: editorWidgetBackground, hc: editorWidgetBackground }, nls.localize('editorSuggestWidgetBackground', 'Background color of the suggest widget.'));
export const editorSuggestWidgetBorder = registerColor('editorSuggestWidget.border', { dark: editorWidgetBorder, light: editorWidgetBorder, hc: editorWidgetBorder }, nls.localize('editorSuggestWidgetBorder', 'Border color of the suggest widget.'));
export const editorSuggestWidgetForeground = registerColor('editorSuggestWidget.foreground', { dark: editorForeground, light: editorForeground, hc: editorForeground }, nls.localize('editorSuggestWidgetForeground', 'Foreground color of the suggest widget.'));
export const editorSuggestWidgetSelectedBackground = registerColor('editorSuggestWidget.selectedBackground', { dark: listFocusBackground, light: listFocusBackground, hc: listFocusBackground }, nls.localize('editorSuggestWidgetSelectedBackground', 'Background color of the selected entry in the suggest widget.'));
export const editorSuggestWidgetHighlightForeground = registerColor('editorSuggestWidget.highlightForeground', { dark: listHighlightForeground, light: listHighlightForeground, hc: listHighlightForeground }, nls.localize('editorSuggestWidgetHighlightForeground', 'Color of the match highlights in the suggest widget.'));

const enum State {
	Hidden,
	Loading,
	Empty,
	Open,
	Frozen,
	Details
}

export interface ISelectedSuggestion {
	item: CompletionItem;
	index: number;
	model: CompletionModel;
}

class PersistedWidgetSize {

	private readonly _key: string;

	constructor(
		private readonly _service: IStorageService,
		editor: ICodeEditor
	) {
		this._key = `suggestWidget.size/${editor.getEditorType()}/${editor instanceof EmbeddedCodeEditorWidget}`;
	}

	restore(): dom.Dimension | undefined {
		const raw = this._service.get(this._key, StorageScope.GLOBAL) ?? '';
		try {
			const obj = JSON.parse(raw);
			if (dom.Dimension.is(obj)) {
				return dom.Dimension.lift(obj);
			}
		} catch {
			// ignore
		}
		return undefined;
	}

	store(size: dom.Dimension) {
		this._service.store(this._key, JSON.stringify(size), StorageScope.GLOBAL);
	}
}

export class SuggestWidget implements IDisposable {

	private static LOADING_MESSAGE: string = nls.localize('suggestWidget.loading', "Loading...");
	private static NO_SUGGESTIONS_MESSAGE: string = nls.localize('suggestWidget.noSuggestions', "No suggestions.");

	private state: State = State.Hidden;
	private isAuto: boolean = false;
	private loadingTimeout: IDisposable = Disposable.None;
	private currentSuggestionDetails?: CancelablePromise<void>;
	private focusedItem?: CompletionItem;
	private ignoreFocusEvents: boolean = false;
	private completionModel?: CompletionModel;
	private _cappedHeight?: { wanted: number, capped: number };

	readonly element: ResizableHTMLElement;
	private readonly messageElement: HTMLElement;
	private readonly listElement: HTMLElement;
	private readonly list: List<CompletionItem>;
	private readonly status: SuggestWidgetStatus;
	private readonly _details: SuggestDetailsOverlay;
	private readonly _contentWidget: SuggestContentWidget;

	private readonly ctxSuggestWidgetVisible: IContextKey<boolean>;
	private readonly ctxSuggestWidgetDetailsVisible: IContextKey<boolean>;
	private readonly ctxSuggestWidgetMultipleSuggestions: IContextKey<boolean>;

	private readonly showTimeout = new TimeoutTimer();
	private readonly _disposables = new DisposableStore();

	private readonly _persistedSize: PersistedWidgetSize;

	private readonly onDidSelectEmitter = new Emitter<ISelectedSuggestion>();
	private readonly onDidFocusEmitter = new Emitter<ISelectedSuggestion>();
	private readonly onDidHideEmitter = new Emitter<this>();
	private readonly onDidShowEmitter = new Emitter<this>();

	readonly onDidSelect: Event<ISelectedSuggestion> = this.onDidSelectEmitter.event;
	readonly onDidFocus: Event<ISelectedSuggestion> = this.onDidFocusEmitter.event;
	readonly onDidHide: Event<this> = this.onDidHideEmitter.event;
	readonly onDidShow: Event<this> = this.onDidShowEmitter.event;

	private detailsFocusBorderColor?: string;
	private detailsBorderColor?: string;

	private explainMode: boolean = false;

	private readonly _onDetailsKeydown = new Emitter<IKeyboardEvent>();
	public readonly onDetailsKeyDown: Event<IKeyboardEvent> = this._onDetailsKeydown.event;

	constructor(
		private readonly editor: ICodeEditor,
		@IStorageService private readonly _storageService: IStorageService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@IThemeService _themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.element = new ResizableHTMLElement();
		this.element.domNode.classList.add('editor-widget', 'suggest-widget');

		this._contentWidget = new SuggestContentWidget(this, editor);
		this._persistedSize = new PersistedWidgetSize(_storageService, editor);

		let persistedSize: dom.Dimension | undefined;
		let persistHeight = false;
		let persistWidth = false;
		this._disposables.add(this.element.onDidWillResize(() => {
			this._contentWidget.lockPreference();
			persistedSize = this._persistedSize.restore();
		}));
		this._disposables.add(this.element.onDidResize(e => {

			this._resize(e.dimension.width, e.dimension.height);

			persistHeight = persistHeight || !!e.north || !!e.south;
			persistWidth = persistWidth || !!e.east || !!e.west;
			if (e.done) {

				// only store width or height value that have changed
				let { width, height } = this.element.size;
				if (persistedSize) {
					if (!persistHeight) {
						height = persistedSize.height;
					}
					if (!persistWidth) {
						width = persistedSize.width;
					}
				}
				this._persistedSize.store(new dom.Dimension(width, height));

				// reset working state
				this._contentWidget.unlockPreference();
				persistedSize = undefined;
				persistHeight = false;
				persistWidth = false;
			}
		}));

		this.messageElement = dom.append(this.element.domNode, dom.$('.message'));
		this.listElement = dom.append(this.element.domNode, dom.$('.tree'));

		const details = instantiationService.createInstance(SuggestDetailsWidget, this.editor);
		details.onDidClose(this.toggleDetails, this, this._disposables);
		this._details = new SuggestDetailsOverlay(details, this.editor);

		const applyIconStyle = () => this.element.domNode.classList.toggle('no-icons', !this.editor.getOption(EditorOption.suggest).showIcons);
		applyIconStyle();

		const renderer = instantiationService.createInstance(ItemRenderer, this.editor);
		this._disposables.add(renderer);
		this._disposables.add(renderer.onDidToggleDetails(() => this.toggleDetails()));

		this.list = new List('SuggestWidget', this.listElement, {
			getHeight: (_element: CompletionItem): number => this.getLayoutInfo().itemHeight,
			getTemplateId: (_element: CompletionItem): string => 'suggestion'
		}, [renderer], {
			useShadows: false,
			mouseSupport: false,
			accessibilityProvider: {
				getRole: () => 'option',
				getAriaLabel: (item: CompletionItem) => {
					const textLabel = typeof item.completion.label === 'string' ? item.completion.label : item.completion.label.name;
					if (item.isResolved && this._isDetailsVisible()) {
						const { documentation, detail } = item.completion;
						const docs = strings.format(
							'{0}{1}',
							detail || '',
							documentation ? (typeof documentation === 'string' ? documentation : documentation.value) : '');

						return nls.localize('ariaCurrenttSuggestionReadDetails', "{0}, docs: {1}", textLabel, docs);
					} else {
						return textLabel;
					}
				},
				getWidgetAriaLabel: () => nls.localize('suggest', "Suggest"),
				getWidgetRole: () => 'listbox'
			}
		});

		this.status = instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode);
		const applyStatusBarStyle = () => this.element.domNode.classList.toggle('with-status-bar', this.editor.getOption(EditorOption.suggest).showStatusBar);
		applyStatusBarStyle();

		this._disposables.add(attachListStyler(this.list, _themeService, {
			listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
			listInactiveFocusOutline: activeContrastBorder
		}));
		this._disposables.add(_themeService.onDidColorThemeChange(t => this.onThemeChange(t)));
		this.onThemeChange(_themeService.getColorTheme());

		this._disposables.add(this.list.onMouseDown(e => this.onListMouseDownOrTap(e)));
		this._disposables.add(this.list.onTap(e => this.onListMouseDownOrTap(e)));
		this._disposables.add(this.list.onDidChangeSelection(e => this.onListSelection(e)));
		this._disposables.add(this.list.onDidChangeFocus(e => this.onListFocus(e)));
		this._disposables.add(this.editor.onDidChangeCursorSelection(() => this.onCursorSelectionChanged()));
		this._disposables.add(this.editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.suggest)) {
				applyStatusBarStyle();
				applyIconStyle();
			}
		}));

		this.ctxSuggestWidgetVisible = SuggestContext.Visible.bindTo(_contextKeyService);
		this.ctxSuggestWidgetDetailsVisible = SuggestContext.DetailsVisible.bindTo(_contextKeyService);
		this.ctxSuggestWidgetMultipleSuggestions = SuggestContext.MultipleSuggestions.bindTo(_contextKeyService);


		this._disposables.add(dom.addStandardDisposableListener(this._details.widget.domNode, 'keydown', e => {
			this._onDetailsKeydown.fire(e);
		}));

		this._disposables.add(this.editor.onMouseDown((e: IEditorMouseEvent) => this.onEditorMouseDown(e)));
	}

	dispose(): void {
		this._details.widget.dispose();
		this._details.dispose();
		this.list.dispose();
		this.status.dispose();
		this._disposables.dispose();
		this.loadingTimeout.dispose();
		this.showTimeout.dispose();
		this._contentWidget.dispose();
		this.element.dispose();
	}

	private onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
		if (this._details.widget.domNode.contains(mouseEvent.target.element)) {
			// Clicking inside details
			this._details.widget.domNode.focus();
		} else {
			// Clicking outside details and inside suggest
			if (this.element.domNode.contains(mouseEvent.target.element)) {
				this.editor.focus();
			}
		}
	}

	private onCursorSelectionChanged(): void {
		if (this.state !== State.Hidden) {
			this._contentWidget.layout();
		}
	}

	private onListMouseDownOrTap(e: IListMouseEvent<CompletionItem> | IListGestureEvent<CompletionItem>): void {
		if (typeof e.element === 'undefined' || typeof e.index === 'undefined') {
			return;
		}

		// prevent stealing browser focus from the editor
		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();

		this.select(e.element, e.index);
	}

	private onListSelection(e: IListEvent<CompletionItem>): void {
		if (!e.elements.length) {
			return;
		}

		this.select(e.elements[0], e.indexes[0]);
	}

	private select(item: CompletionItem, index: number): void {
		const completionModel = this.completionModel;

		if (!completionModel) {
			return;
		}

		this.onDidSelectEmitter.fire({ item, index, model: completionModel });
		this.editor.focus();
	}

	private onThemeChange(theme: IColorTheme) {
		const backgroundColor = theme.getColor(editorSuggestWidgetBackground);
		if (backgroundColor) {
			this.element.domNode.style.backgroundColor = backgroundColor.toString();
			this.messageElement.style.backgroundColor = backgroundColor.toString();
			this._details.widget.domNode.style.backgroundColor = backgroundColor.toString();
		}
		const borderColor = theme.getColor(editorSuggestWidgetBorder);
		if (borderColor) {
			this.element.domNode.style.borderColor = borderColor.toString();
			this.messageElement.style.borderColor = borderColor.toString();
			this.status.element.style.borderTopColor = borderColor.toString();
			this._details.widget.domNode.style.borderColor = borderColor.toString();
			this.detailsBorderColor = borderColor.toString();
		}
		const focusBorderColor = theme.getColor(focusBorder);
		if (focusBorderColor) {
			this.detailsFocusBorderColor = focusBorderColor.toString();
		}
		this._details.widget.borderWidth = theme.type === 'hc' ? 2 : 1;
	}

	private onListFocus(e: IListEvent<CompletionItem>): void {
		if (this.ignoreFocusEvents) {
			return;
		}

		if (!e.elements.length) {
			if (this.currentSuggestionDetails) {
				this.currentSuggestionDetails.cancel();
				this.currentSuggestionDetails = undefined;
				this.focusedItem = undefined;
			}

			this.editor.setAriaOptions({ activeDescendant: undefined });
			return;
		}

		if (!this.completionModel) {
			return;
		}

		const item = e.elements[0];
		const index = e.indexes[0];

		if (item !== this.focusedItem) {

			this.currentSuggestionDetails?.cancel();
			this.currentSuggestionDetails = undefined;

			this.focusedItem = item;

			this.list.reveal(index);

			this.currentSuggestionDetails = createCancelablePromise(async token => {
				const loading = disposableTimeout(() => {
					if (this._isDetailsVisible()) {
						this.showDetails(true);
					}
				}, 250);
				token.onCancellationRequested(() => loading.dispose());
				const result = await item.resolve(token);
				loading.dispose();
				return result;
			});

			this.currentSuggestionDetails.then(() => {
				if (index >= this.list.length || item !== this.list.element(index)) {
					return;
				}

				// item can have extra information, so re-render
				this.ignoreFocusEvents = true;
				this.list.splice(index, 1, [item]);
				this.list.setFocus([index]);
				this.ignoreFocusEvents = false;

				if (this._isDetailsVisible()) {
					this.showDetails(false);
				} else {
					this.element.domNode.classList.remove('docs-side');
				}

				this.editor.setAriaOptions({ activeDescendant: getAriaId(index) });
			}).catch(onUnexpectedError);
		}

		// emit an event
		this.onDidFocusEmitter.fire({ item, index, model: this.completionModel });
	}

	private _setState(state: State): void {

		if (this.state === state) {
			return;
		}
		this.state = state;

		this.element.domNode.classList.toggle('frozen', state === State.Frozen);
		this.element.domNode.classList.remove('message');

		switch (state) {
			case State.Hidden:
				dom.hide(this.messageElement, this.listElement, this.status.element);
				this._details.hide(true);
				this._contentWidget.hide();
				this.ctxSuggestWidgetVisible.reset();
				this.ctxSuggestWidgetMultipleSuggestions.reset();
				this.element.domNode.classList.remove('visible');
				this.list.splice(0, this.list.length);
				this.focusedItem = undefined;
				this._cappedHeight = undefined;
				this.explainMode = false;
				break;
			case State.Loading:
				this.element.domNode.classList.add('message');
				this.messageElement.textContent = SuggestWidget.LOADING_MESSAGE;
				dom.hide(this.listElement, this.status.element);
				dom.show(this.messageElement);
				this._details.hide();
				this._show();
				this.focusedItem = undefined;
				break;
			case State.Empty:
				this.element.domNode.classList.add('message');
				this.messageElement.textContent = SuggestWidget.NO_SUGGESTIONS_MESSAGE;
				dom.hide(this.listElement, this.status.element);
				dom.show(this.messageElement);
				this._details.hide();
				this._show();
				this.focusedItem = undefined;
				break;
			case State.Open:
				dom.hide(this.messageElement);
				dom.show(this.listElement, this.status.element);
				this._show();
				break;
			case State.Frozen:
				dom.hide(this.messageElement);
				dom.show(this.listElement, this.status.element);
				this._show();
				break;
			case State.Details:
				dom.hide(this.messageElement);
				dom.show(this.listElement, this.status.element);
				this._details.show();
				this._show();
				break;
		}
	}

	private _show(): void {
		this._contentWidget.show();
		this._layout(this._persistedSize.restore());
		this.ctxSuggestWidgetVisible.set(true);

		this.showTimeout.cancelAndSet(() => {
			this.element.domNode.classList.add('visible');
			this.onDidShowEmitter.fire(this);
		}, 100);
	}

	showTriggered(auto: boolean, delay: number) {
		if (this.state !== State.Hidden) {
			return;
		}
		this._contentWidget.setPosition(this.editor.getPosition());
		this.isAuto = !!auto;

		if (!this.isAuto) {
			this.loadingTimeout = disposableTimeout(() => this._setState(State.Loading), delay);
		}
	}

	showSuggestions(completionModel: CompletionModel, selectionIndex: number, isFrozen: boolean, isAuto: boolean): void {

		this._contentWidget.setPosition(this.editor.getPosition());
		this.loadingTimeout.dispose();

		this.currentSuggestionDetails?.cancel();
		this.currentSuggestionDetails = undefined;

		if (this.completionModel !== completionModel) {
			this.completionModel = completionModel;
		}

		if (isFrozen && this.state !== State.Empty && this.state !== State.Hidden) {
			this._setState(State.Frozen);
			return;
		}

		const visibleCount = this.completionModel.items.length;
		const isEmpty = visibleCount === 0;
		this.ctxSuggestWidgetMultipleSuggestions.set(visibleCount > 1);

		if (isEmpty) {
			this._setState(isAuto ? State.Hidden : State.Empty);
			this.completionModel = undefined;
			return;
		}

		this.focusedItem = undefined;
		this.list.splice(0, this.list.length, this.completionModel.items);
		this._setState(isFrozen ? State.Frozen : State.Open);
		this.list.reveal(selectionIndex, 0);
		this.list.setFocus([selectionIndex]);

		this._layout(this.element.size);
		// Reset focus border
		if (this.detailsBorderColor) {
			this._details.widget.domNode.style.borderColor = this.detailsBorderColor;
		}
	}

	selectNextPage(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Details:
				this._details.widget.pageDown();
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
			case State.Loading:
				return !this.isAuto;
			default:
				this.list.focusNext(1, true);
				return true;
		}
	}

	selectLast(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Details:
				this._details.widget.scrollBottom();
				return true;
			case State.Loading:
				return !this.isAuto;
			default:
				this.list.focusLast();
				return true;
		}
	}

	selectPreviousPage(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Details:
				this._details.widget.pageUp();
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
			case State.Loading:
				return !this.isAuto;
			default:
				this.list.focusPrevious(1, true);
				return false;
		}
	}

	selectFirst(): boolean {
		switch (this.state) {
			case State.Hidden:
				return false;
			case State.Details:
				this._details.widget.scrollTop();
				return true;
			case State.Loading:
				return !this.isAuto;
			default:
				this.list.focusFirst();
				return true;
		}
	}

	getFocusedItem(): ISelectedSuggestion | undefined {
		if (this.state !== State.Hidden
			&& this.state !== State.Empty
			&& this.state !== State.Loading
			&& this.completionModel
		) {

			return {
				item: this.list.getFocusedElements()[0],
				index: this.list.getFocus()[0],
				model: this.completionModel
			};
		}
		return undefined;
	}

	toggleDetailsFocus(): void {
		if (this.state === State.Details) {
			this._setState(State.Open);
			if (this.detailsBorderColor) {
				this._details.widget.domNode.style.borderColor = this.detailsBorderColor;
			}
		} else if (this.state === State.Open && this._isDetailsVisible()) {
			this._setState(State.Details);
			if (this.detailsFocusBorderColor) {
				this._details.widget.domNode.style.borderColor = this.detailsFocusBorderColor;
			}
		}
	}

	toggleDetails(): void {
		if (this._isDetailsVisible()) {
			// hide details widget
			this.ctxSuggestWidgetDetailsVisible.set(false);
			this._setDetailsVisible(false);
			this._details.hide();
			this.element.domNode.classList.remove('shows-details');

		} else if (canExpandCompletionItem(this.list.getFocusedElements()[0]) && (this.state === State.Open || this.state === State.Details || this.state === State.Frozen)) {
			// show details widget (iff possible)
			this.ctxSuggestWidgetDetailsVisible.set(true);
			this._setDetailsVisible(true);
			this.showDetails(false);
		}
	}

	showDetails(loading: boolean): void {
		this._details.show();
		if (loading) {
			this._details.widget.renderLoading();
		} else {
			this._details.widget.renderItem(this.list.getFocusedElements()[0], this.explainMode);
		}
		this._positionDetails();
		this.editor.focus();
		this.element.domNode.classList.add('shows-details');
	}

	toggleExplainMode(): void {
		if (this.list.getFocusedElements()[0] && this._isDetailsVisible()) {
			this.explainMode = !this.explainMode;
			this.showDetails(false);
		}
	}

	hideWidget(): void {
		this.loadingTimeout.dispose();
		this._setState(State.Hidden);
		this.onDidHideEmitter.fire(this);
	}

	isFrozen(): boolean {
		return this.state === State.Frozen;
	}

	_afterRender(position: ContentWidgetPositionPreference | null) {
		if (position === null) {
			if (this._isDetailsVisible()) {
				this._details.hide(); //todo@jrieken soft-hide
			}
			return;
		}
		if (this.state === State.Empty || this.state === State.Loading) {
			// no special positioning when widget isn't showing list
			return;
		}
		if (this._isDetailsVisible()) {
			this._details.show();
		}
		this._positionDetails();
	}

	private _layout(size: dom.Dimension | undefined): void {
		if (!this.editor.hasModel()) {
			return;
		}
		if (!this.editor.getDomNode()) {
			// happens when running tests
			return;
		}

		let height = size?.height;
		let width = size?.width;

		const bodyBox = dom.getClientArea(document.body);
		const info = this.getLayoutInfo();

		// status bar
		this.status.element.style.lineHeight = `${info.itemHeight}px`;

		if (this.state === State.Empty || this.state === State.Loading) {
			// showing a message only
			height = info.itemHeight + info.borderHeight;
			width = 230;
			this.element.enableSashes(false, false, false, false);
			this.element.minSize = this.element.maxSize = new dom.Dimension(width, height);
			this._contentWidget.setPreference(ContentWidgetPositionPreference.BELOW);

		} else {
			// showing items

			// width math
			const maxWidth = bodyBox.width - info.borderHeight - 2 * info.horizontalPadding;
			if (width === undefined) {
				width = 430;
			}
			if (width > maxWidth) {
				width = maxWidth;
			}
			const preferredWidth = this.completionModel ? this.completionModel.stats.pLabelLen * info.typicalHalfwidthCharacterWidth : width;

			// height math
			const fullHeight = info.statusBarHeight + this.list.contentHeight + info.borderHeight;
			const preferredHeight = info.statusBarHeight + 12 * info.itemHeight + info.borderHeight;
			const minHeight = info.itemHeight + info.statusBarHeight;
			const editorBox = dom.getDomNodePagePosition(this.editor.getDomNode());
			const cursorBox = this.editor.getScrolledVisiblePosition(this.editor.getPosition());
			const cursorBottom = editorBox.top + cursorBox.top + cursorBox.height;
			const maxHeightBelow = Math.min(bodyBox.height - cursorBottom - info.verticalPadding, fullHeight);
			const maxHeightAbove = Math.min(editorBox.top + cursorBox.top - info.verticalPadding, fullHeight);
			let maxHeight = Math.min(Math.max(maxHeightAbove, maxHeightBelow) + info.borderHeight, fullHeight);

			if (height && height === this._cappedHeight?.capped) {
				// Restore the old (wanted) height when the current
				// height is capped to fit
				height = this._cappedHeight.wanted;
			}

			if (height === undefined) {
				height = Math.min(preferredHeight, fullHeight);
			}
			if (height < minHeight) {
				height = minHeight;
			}
			if (height > maxHeight) {
				height = maxHeight;
			}

			if (height > maxHeightBelow) {
				this._contentWidget.setPreference(ContentWidgetPositionPreference.ABOVE);
				this.element.enableSashes(true, true, false, false);
				maxHeight = maxHeightAbove;

			} else {
				this._contentWidget.setPreference(ContentWidgetPositionPreference.BELOW);
				this.element.enableSashes(false, true, true, false);
				maxHeight = maxHeightBelow;
			}
			this.element.preferredSize = new dom.Dimension(preferredWidth, preferredHeight);
			this.element.maxSize = new dom.Dimension(maxWidth, maxHeight);
			this.element.minSize = new dom.Dimension(220, minHeight);

			// Know when the height was capped to fit and remember
			// the wanted height for later. This is required when going
			// left to widen suggestions.
			this._cappedHeight = size && height === fullHeight
				? { wanted: this._cappedHeight?.wanted ?? size.height, capped: height }
				: undefined;
		}
		this._resize(width, height);
	}

	private _resize(width: number, height: number): void {

		const { width: maxWidth, height: maxHeight } = this.element.maxSize;
		width = Math.min(maxWidth, width);
		height = Math.min(maxHeight, height);

		const { statusBarHeight } = this.getLayoutInfo();
		this.list.layout(height - statusBarHeight, width);
		this.listElement.style.height = `${height - statusBarHeight}px`;
		this.element.layout(height, width);
		this._contentWidget.layout();

		this._positionDetails();
	}

	private _positionDetails(): void {
		if (this._isDetailsVisible()) {
			this._details.placeAtAnchor(this.element.domNode);
		}
	}

	getLayoutInfo() {
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		const itemHeight = this.editor.getOption(EditorOption.suggestLineHeight) || fontInfo.lineHeight;
		const statusBarHeight = !this.editor.getOption(EditorOption.suggest).showStatusBar || this.state === State.Empty || this.state === State.Loading ? 0 : itemHeight;
		const borderWidth = this._details.widget.borderWidth;
		const borderHeight = 2 * borderWidth;

		return {
			itemHeight,
			statusBarHeight,
			borderWidth,
			borderHeight,
			typicalHalfwidthCharacterWidth: fontInfo.typicalHalfwidthCharacterWidth,
			verticalPadding: 22,
			horizontalPadding: 14
		};
	}

	private _isDetailsVisible(): boolean {
		return this._storageService.getBoolean('expandSuggestionDocs', StorageScope.GLOBAL, false);
	}

	private _setDetailsVisible(value: boolean) {
		this._storageService.store('expandSuggestionDocs', value, StorageScope.GLOBAL);
	}
}

export class SuggestContentWidget implements IContentWidget {

	readonly allowEditorOverflow = true;
	readonly suppressMouseDown = false;

	private _position?: IPosition | null;
	private _preference?: ContentWidgetPositionPreference;
	private _preferenceLocked = false;

	private _added: boolean = false;
	private _hidden: boolean = false;

	constructor(
		private readonly _widget: SuggestWidget,
		private readonly _editor: ICodeEditor
	) { }

	dispose(): void {
		if (this._added) {
			this._added = false;
			this._editor.removeContentWidget(this);
		}
	}

	getId(): string {
		return 'editor.widget.suggestWidget';
	}

	getDomNode(): HTMLElement {
		return this._widget.element.domNode;
	}

	show(): void {
		this._hidden = false;
		if (!this._added) {
			this._added = true;
			this._editor.addContentWidget(this);
		}
	}

	hide(): void {
		if (!this._hidden) {
			this._hidden = true;
			this.layout();
		}
	}

	layout(): void {
		this._editor.layoutContentWidget(this);
	}

	getPosition(): IContentWidgetPosition | null {
		if (this._hidden || !this._position || !this._preference) {
			return null;
		}
		return {
			position: this._position,
			preference: [this._preference]
		};
	}

	beforeRender() {
		const { height, width } = this._widget.element.size;
		const { borderWidth, horizontalPadding } = this._widget.getLayoutInfo();
		return new dom.Dimension(width + 2 * borderWidth + horizontalPadding, height + 2 * borderWidth);
	}

	afterRender(position: ContentWidgetPositionPreference | null) {
		this._widget._afterRender(position);
	}

	setPreference(preference: ContentWidgetPositionPreference) {
		if (!this._preferenceLocked) {
			this._preference = preference;
		}
	}

	lockPreference() {
		this._preferenceLocked = true;
	}

	unlockPreference() {
		this._preferenceLocked = false;
	}

	setPosition(position: IPosition | null): void {
		this._position = position;
	}
}

registerThemingParticipant((theme, collector) => {
	const matchHighlight = theme.getColor(editorSuggestWidgetHighlightForeground);
	if (matchHighlight) {
		collector.addRule(`.monaco-editor .suggest-widget .monaco-list .monaco-list-row .monaco-highlighted-label .highlight { color: ${matchHighlight}; }`);
	}
	const foreground = theme.getColor(editorSuggestWidgetForeground);
	if (foreground) {
		collector.addRule(`.monaco-editor .suggest-widget, .monaco-editor .suggest-details { color: ${foreground}; }`);
	}

	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-editor .suggest-details a { color: ${link}; }`);
	}

	const codeBackground = theme.getColor(textCodeBlockBackground);
	if (codeBackground) {
		collector.addRule(`.monaco-editor .suggest-details code { background-color: ${codeBackground}; }`);
	}
});
