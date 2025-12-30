/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import '../../../../base/browser/ui/codicons/codiconStyles.js'; // The codicon symbol styles are defined here and must be loaded
import { IListEvent, IListGestureEvent, IListMouseEvent } from '../../../../base/browser/ui/list/list.js';
import { List } from '../../../../base/browser/ui/list/listWidget.js';
import { CancelablePromise, createCancelablePromise, disposableTimeout, TimeoutTimer } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event, PauseableEmitter } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import * as strings from '../../../../base/common/strings.js';
import './media/suggest.css';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition, IEditorMouseEvent } from '../../../browser/editorBrowser.js';
import { EmbeddedCodeEditorWidget } from '../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { IPosition } from '../../../common/core/position.js';
import { SuggestWidgetStatus } from './suggestWidgetStatus.js';
import '../../symbolIcons/browser/symbolIcons.js'; // The codicon symbol colors are defined here and must be loaded to get colors
import * as nls from '../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { activeContrastBorder, editorForeground, editorWidgetBackground, editorWidgetBorder, listFocusHighlightForeground, listHighlightForeground, quickInputListFocusBackground, quickInputListFocusForeground, quickInputListFocusIconForeground, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { CompletionModel } from './completionModel.js';
import { ResizableHTMLElement } from '../../../../base/browser/ui/resizable/resizable.js';
import { CompletionItem, Context as SuggestContext, suggestWidgetStatusbarMenu } from './suggest.js';
import { canExpandCompletionItem, SuggestDetailsOverlay, SuggestDetailsWidget } from './suggestWidgetDetails.js';
import { ItemRenderer } from './suggestWidgetRenderer.js';
import { getListStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { CompletionItemKinds } from '../../../common/languages.js';
import { isWindows } from '../../../../base/common/platform.js';

/**
 * Suggest widget colors
 */
registerColor('editorSuggestWidget.background', editorWidgetBackground, nls.localize('editorSuggestWidgetBackground', 'Background color of the suggest widget.'));
registerColor('editorSuggestWidget.border', editorWidgetBorder, nls.localize('editorSuggestWidgetBorder', 'Border color of the suggest widget.'));
export const editorSuggestWidgetForeground = registerColor('editorSuggestWidget.foreground', editorForeground, nls.localize('editorSuggestWidgetForeground', 'Foreground color of the suggest widget.'));
registerColor('editorSuggestWidget.selectedForeground', quickInputListFocusForeground, nls.localize('editorSuggestWidgetSelectedForeground', 'Foreground color of the selected entry in the suggest widget.'));
registerColor('editorSuggestWidget.selectedIconForeground', quickInputListFocusIconForeground, nls.localize('editorSuggestWidgetSelectedIconForeground', 'Icon foreground color of the selected entry in the suggest widget.'));
export const editorSuggestWidgetSelectedBackground = registerColor('editorSuggestWidget.selectedBackground', quickInputListFocusBackground, nls.localize('editorSuggestWidgetSelectedBackground', 'Background color of the selected entry in the suggest widget.'));
registerColor('editorSuggestWidget.highlightForeground', listHighlightForeground, nls.localize('editorSuggestWidgetHighlightForeground', 'Color of the match highlights in the suggest widget.'));
registerColor('editorSuggestWidget.focusHighlightForeground', listFocusHighlightForeground, nls.localize('editorSuggestWidgetFocusHighlightForeground', 'Color of the match highlights in the suggest widget when an item is focused.'));
registerColor('editorSuggestWidgetStatus.foreground', transparent(editorSuggestWidgetForeground, .5), nls.localize('editorSuggestWidgetStatusForeground', 'Foreground color of the suggest widget status.'));

const enum State {
	Hidden,
	Loading,
	Empty,
	Open,
	Frozen,
	Details,
	onDetailsKeyDown
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
		const raw = this._service.get(this._key, StorageScope.PROFILE) ?? '';
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
		this._service.store(this._key, JSON.stringify(size), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	reset(): void {
		this._service.remove(this._key, StorageScope.PROFILE);
	}
}

export class SuggestWidget implements IDisposable {

	private static LOADING_MESSAGE: string = nls.localize('suggestWidget.loading', "Loading...");
	private static NO_SUGGESTIONS_MESSAGE: string = nls.localize('suggestWidget.noSuggestions', "No suggestions.");

	private _state: State = State.Hidden;
	private _isAuto: boolean = false;
	private _loadingTimeout?: IDisposable;
	private readonly _pendingLayout = new MutableDisposable();
	private readonly _pendingShowDetails = new MutableDisposable();
	private _currentSuggestionDetails?: CancelablePromise<void>;
	private _focusedItem?: CompletionItem;
	private _ignoreFocusEvents: boolean = false;
	private _completionModel?: CompletionModel;
	private _cappedHeight?: { wanted: number; capped: number };
	private _forceRenderingAbove: boolean = false;
	private _explainMode: boolean = false;

	readonly element: ResizableHTMLElement;
	private readonly _messageElement: HTMLElement;
	private readonly _listElement: HTMLElement;
	private readonly _list: List<CompletionItem>;
	private readonly _status: SuggestWidgetStatus;
	private readonly _details: SuggestDetailsOverlay;
	private readonly _contentWidget: SuggestContentWidget;
	private readonly _persistedSize: PersistedWidgetSize;

	private readonly _ctxSuggestWidgetVisible: IContextKey<boolean>;
	private readonly _ctxSuggestWidgetDetailsVisible: IContextKey<boolean>;
	private readonly _ctxSuggestWidgetMultipleSuggestions: IContextKey<boolean>;
	private readonly _ctxSuggestWidgetHasFocusedSuggestion: IContextKey<boolean>;
	private readonly _ctxSuggestWidgetDetailsFocused: IContextKey<boolean>;

	private readonly _showTimeout = new TimeoutTimer();
	private readonly _disposables = new DisposableStore();


	private readonly _onDidSelect = new PauseableEmitter<ISelectedSuggestion>();
	private readonly _onDidFocus = new PauseableEmitter<ISelectedSuggestion>();
	private readonly _onDidHide = new Emitter<this>();
	private readonly _onDidShow = new Emitter<this>();

	readonly onDidSelect: Event<ISelectedSuggestion> = this._onDidSelect.event;
	readonly onDidFocus: Event<ISelectedSuggestion> = this._onDidFocus.event;
	readonly onDidHide: Event<this> = this._onDidHide.event;
	readonly onDidShow: Event<this> = this._onDidShow.event;

	private readonly _onDetailsKeydown = new Emitter<IKeyboardEvent>();
	readonly onDetailsKeyDown: Event<IKeyboardEvent> = this._onDetailsKeydown.event;

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

		class ResizeState {
			constructor(
				readonly persistedSize: dom.Dimension | undefined,
				readonly currentSize: dom.Dimension,
				public persistHeight = false,
				public persistWidth = false,
			) { }
		}

		let state: ResizeState | undefined;
		this._disposables.add(this.element.onDidWillResize(() => {
			this._contentWidget.lockPreference();
			state = new ResizeState(this._persistedSize.restore(), this.element.size);
		}));
		this._disposables.add(this.element.onDidResize(e => {

			this._resize(e.dimension.width, e.dimension.height);

			if (state) {
				state.persistHeight = state.persistHeight || !!e.north || !!e.south;
				state.persistWidth = state.persistWidth || !!e.east || !!e.west;
			}

			if (!e.done) {
				return;
			}

			if (state) {
				// only store width or height value that have changed and also
				// only store changes that are above a certain threshold
				const { itemHeight, defaultSize } = this.getLayoutInfo();
				const threshold = Math.round(itemHeight / 2);
				let { width, height } = this.element.size;
				if (!state.persistHeight || Math.abs(state.currentSize.height - height) <= threshold) {
					height = state.persistedSize?.height ?? defaultSize.height;
				}
				if (!state.persistWidth || Math.abs(state.currentSize.width - width) <= threshold) {
					width = state.persistedSize?.width ?? defaultSize.width;
				}
				this._persistedSize.store(new dom.Dimension(width, height));
			}

			// reset working state
			this._contentWidget.unlockPreference();
			state = undefined;
		}));

		this._messageElement = dom.append(this.element.domNode, dom.$('.message'));
		this._listElement = dom.append(this.element.domNode, dom.$('.tree'));

		const details = this._disposables.add(instantiationService.createInstance(SuggestDetailsWidget, this.editor));
		details.onDidClose(() => this.toggleDetails(), this, this._disposables);
		this._details = new SuggestDetailsOverlay(details, this.editor);

		const applyIconStyle = () => this.element.domNode.classList.toggle('no-icons', !this.editor.getOption(EditorOption.suggest).showIcons);
		applyIconStyle();

		const renderer = instantiationService.createInstance(ItemRenderer, this.editor);
		this._disposables.add(renderer);
		this._disposables.add(renderer.onDidToggleDetails(() => this.toggleDetails()));

		this._list = new List('SuggestWidget', this._listElement, {
			getHeight: (_element: CompletionItem): number => this.getLayoutInfo().itemHeight,
			getTemplateId: (_element: CompletionItem): string => 'suggestion'
		}, [renderer], {
			alwaysConsumeMouseWheel: true,
			useShadows: false,
			mouseSupport: false,
			multipleSelectionSupport: false,
			accessibilityProvider: {
				getRole: () => isWindows ? 'listitem' : 'option',
				getWidgetAriaLabel: () => nls.localize('suggest', "Suggest"),
				getWidgetRole: () => 'listbox',
				getAriaLabel: (item: CompletionItem) => {

					let label = item.textLabel;
					const kindLabel = CompletionItemKinds.toLabel(item.completion.kind);
					if (typeof item.completion.label !== 'string') {
						const { detail, description } = item.completion.label;
						if (detail && description) {
							label = nls.localize('label.full', '{0} {1}, {2}, {3}', label, detail, description, kindLabel);
						} else if (detail) {
							label = nls.localize('label.detail', '{0} {1}, {2}', label, detail, kindLabel);
						} else if (description) {
							label = nls.localize('label.desc', '{0}, {1}, {2}', label, description, kindLabel);
						}
					} else {
						label = nls.localize('label', '{0}, {1}', label, kindLabel);
					}
					if (!item.isResolved || !this._isDetailsVisible()) {
						return label;
					}

					const { documentation, detail } = item.completion;
					const docs = strings.format(
						'{0}{1}',
						detail || '',
						documentation ? (typeof documentation === 'string' ? documentation : documentation.value) : '');

					return nls.localize('ariaCurrenttSuggestionReadDetails', "{0}, docs: {1}", label, docs);
				},
			}
		});
		this._list.style(getListStyles({
			listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
			listInactiveFocusOutline: activeContrastBorder
		}));

		this._status = instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode, suggestWidgetStatusbarMenu, { allowIcons: true });
		const applyStatusBarStyle = () => this.element.domNode.classList.toggle('with-status-bar', this.editor.getOption(EditorOption.suggest).showStatusBar);
		applyStatusBarStyle();

		this._disposables.add(this._list.onMouseDown(e => this._onListMouseDownOrTap(e)));
		this._disposables.add(this._list.onTap(e => this._onListMouseDownOrTap(e)));
		this._disposables.add(this._list.onDidChangeSelection(e => this._onListSelection(e)));
		this._disposables.add(this._list.onDidChangeFocus(e => this._onListFocus(e)));
		this._disposables.add(this.editor.onDidChangeCursorSelection(() => this._onCursorSelectionChanged()));
		this._disposables.add(this.editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.suggest)) {
				applyStatusBarStyle();
				applyIconStyle();
			}
			if (this._completionModel && (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.suggestFontSize) || e.hasChanged(EditorOption.suggestLineHeight))) {
				this._list.splice(0, this._list.length, this._completionModel.items);
			}
		}));

		this._ctxSuggestWidgetVisible = SuggestContext.Visible.bindTo(_contextKeyService);
		this._ctxSuggestWidgetDetailsVisible = SuggestContext.DetailsVisible.bindTo(_contextKeyService);
		this._ctxSuggestWidgetMultipleSuggestions = SuggestContext.MultipleSuggestions.bindTo(_contextKeyService);
		this._ctxSuggestWidgetHasFocusedSuggestion = SuggestContext.HasFocusedSuggestion.bindTo(_contextKeyService);
		this._ctxSuggestWidgetDetailsFocused = SuggestContext.DetailsFocused.bindTo(_contextKeyService);

		const detailsFocusTracker = dom.trackFocus(this._details.widget.domNode);
		this._disposables.add(detailsFocusTracker);
		this._disposables.add(detailsFocusTracker.onDidFocus(() => this._ctxSuggestWidgetDetailsFocused.set(true)));
		this._disposables.add(detailsFocusTracker.onDidBlur(() => this._ctxSuggestWidgetDetailsFocused.set(false)));

		this._disposables.add(dom.addStandardDisposableListener(this._details.widget.domNode, 'keydown', e => {
			this._onDetailsKeydown.fire(e);
		}));

		this._disposables.add(this.editor.onMouseDown((e: IEditorMouseEvent) => this._onEditorMouseDown(e)));
	}

	dispose(): void {
		this._details.widget.dispose();
		this._details.dispose();
		this._list.dispose();
		this._status.dispose();
		this._disposables.dispose();
		this._loadingTimeout?.dispose();
		this._pendingLayout.dispose();
		this._pendingShowDetails.dispose();
		this._showTimeout.dispose();
		this._contentWidget.dispose();
		this.element.dispose();
	}

	private _onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
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

	private _onCursorSelectionChanged(): void {
		if (this._state !== State.Hidden) {
			this._contentWidget.layout();
		}
	}

	private _onListMouseDownOrTap(e: IListMouseEvent<CompletionItem> | IListGestureEvent<CompletionItem>): void {
		if (typeof e.element === 'undefined' || typeof e.index === 'undefined') {
			return;
		}

		// prevent stealing browser focus from the editor
		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();

		this._select(e.element, e.index);
	}

	private _onListSelection(e: IListEvent<CompletionItem>): void {
		if (e.elements.length) {
			this._select(e.elements[0], e.indexes[0]);
		}
	}

	private _select(item: CompletionItem, index: number): void {
		const completionModel = this._completionModel;
		if (completionModel) {
			this._onDidSelect.fire({ item, index, model: completionModel });
			this.editor.focus();
		}
	}

	private _onListFocus(e: IListEvent<CompletionItem>): void {
		if (this._ignoreFocusEvents) {
			return;
		}

		if (this._state === State.Details) {
			// This can happen when focus is in the details-panel and when
			// arrow keys are pressed to select next/prev items
			this._setState(State.Open);
		}

		if (!e.elements.length) {
			if (this._currentSuggestionDetails) {
				this._currentSuggestionDetails.cancel();
				this._currentSuggestionDetails = undefined;
				this._focusedItem = undefined;
			}

			this.editor.setAriaOptions({ activeDescendant: undefined });
			this._ctxSuggestWidgetHasFocusedSuggestion.set(false);
			return;
		}

		if (!this._completionModel) {
			return;
		}

		this._ctxSuggestWidgetHasFocusedSuggestion.set(true);
		const item = e.elements[0];
		const index = e.indexes[0];

		if (item !== this._focusedItem) {

			this._currentSuggestionDetails?.cancel();
			this._currentSuggestionDetails = undefined;

			this._focusedItem = item;

			this._list.reveal(index);

			this._currentSuggestionDetails = createCancelablePromise(async token => {
				const loading = disposableTimeout(() => {
					if (this._isDetailsVisible()) {
						this._showDetails(true, false);
					}
				}, 250);
				const sub = token.onCancellationRequested(() => loading.dispose());
				try {
					return await item.resolve(token);
				} finally {
					loading.dispose();
					sub.dispose();
				}
			});

			this._currentSuggestionDetails.then(() => {
				if (index >= this._list.length || item !== this._list.element(index)) {
					return;
				}

				// item can have extra information, so re-render
				this._ignoreFocusEvents = true;
				this._list.splice(index, 1, [item]);
				this._list.setFocus([index]);
				this._ignoreFocusEvents = false;

				if (this._isDetailsVisible()) {
					this._showDetails(false, false);
				} else {
					this.element.domNode.classList.remove('docs-side');
				}

				this.editor.setAriaOptions({ activeDescendant: this._list.getElementID(index) });
			}).catch(onUnexpectedError);
		}

		// emit an event
		this._onDidFocus.fire({ item, index, model: this._completionModel });
	}

	private _setState(state: State): void {

		if (this._state === state) {
			return;
		}
		this._state = state;

		this.element.domNode.classList.toggle('frozen', state === State.Frozen);
		this.element.domNode.classList.remove('message');

		switch (state) {
			case State.Hidden:
				dom.hide(this._messageElement, this._listElement, this._status.element);
				this._details.hide(true);
				this._status.hide();
				this._contentWidget.hide();
				this._ctxSuggestWidgetVisible.reset();
				this._ctxSuggestWidgetMultipleSuggestions.reset();
				this._ctxSuggestWidgetHasFocusedSuggestion.reset();
				this._showTimeout.cancel();
				this.element.domNode.classList.remove('visible');
				this._list.splice(0, this._list.length);
				this._focusedItem = undefined;
				this._cappedHeight = undefined;
				this._explainMode = false;
				break;
			case State.Loading:
				this.element.domNode.classList.add('message');
				this._messageElement.textContent = SuggestWidget.LOADING_MESSAGE;
				dom.hide(this._listElement, this._status.element);
				dom.show(this._messageElement);
				this._details.hide();
				this._show();
				this._focusedItem = undefined;
				status(SuggestWidget.LOADING_MESSAGE);
				break;
			case State.Empty:
				this.element.domNode.classList.add('message');
				this._messageElement.textContent = SuggestWidget.NO_SUGGESTIONS_MESSAGE;
				dom.hide(this._listElement, this._status.element);
				dom.show(this._messageElement);
				this._details.hide();
				this._show();
				this._focusedItem = undefined;
				status(SuggestWidget.NO_SUGGESTIONS_MESSAGE);
				break;
			case State.Open:
				dom.hide(this._messageElement);
				dom.show(this._listElement, this._status.element);
				this._show();
				break;
			case State.Frozen:
				dom.hide(this._messageElement);
				dom.show(this._listElement, this._status.element);
				this._show();
				break;
			case State.Details:
				dom.hide(this._messageElement);
				dom.show(this._listElement, this._status.element);
				this._details.show();
				this._show();
				this._details.widget.focus();
				break;
		}
	}

	private _show(): void {
		this._status.show();
		this._contentWidget.show();
		this._layout(this._persistedSize.restore());
		this._ctxSuggestWidgetVisible.set(true);

		this._showTimeout.cancelAndSet(() => {
			this.element.domNode.classList.add('visible');
			this._onDidShow.fire(this);
		}, 100);
	}

	showTriggered(auto: boolean, delay: number) {
		if (this._state !== State.Hidden) {
			return;
		}
		this._contentWidget.setPosition(this.editor.getPosition());
		this._isAuto = !!auto;

		if (!this._isAuto) {
			this._loadingTimeout = disposableTimeout(() => this._setState(State.Loading), delay);
		}
	}

	showSuggestions(completionModel: CompletionModel, selectionIndex: number, isFrozen: boolean, isAuto: boolean, noFocus: boolean): void {

		this._contentWidget.setPosition(this.editor.getPosition());
		this._loadingTimeout?.dispose();

		this._currentSuggestionDetails?.cancel();
		this._currentSuggestionDetails = undefined;

		if (this._completionModel !== completionModel) {
			this._completionModel = completionModel;
		}

		if (isFrozen && this._state !== State.Empty && this._state !== State.Hidden) {
			this._setState(State.Frozen);
			return;
		}

		const visibleCount = this._completionModel.items.length;
		const isEmpty = visibleCount === 0;
		this._ctxSuggestWidgetMultipleSuggestions.set(visibleCount > 1);

		if (isEmpty) {
			this._setState(isAuto ? State.Hidden : State.Empty);
			this._completionModel = undefined;
			return;
		}

		this._focusedItem = undefined;

		// calling list.splice triggers focus event which this widget forwards. That can lead to
		// suggestions being cancelled and the widget being cleared (and hidden). All this happens
		// before revealing and focusing is done which means revealing and focusing will fail when
		// they get run.
		this._onDidFocus.pause();
		this._onDidSelect.pause();
		try {
			this._list.splice(0, this._list.length, this._completionModel.items);
			this._setState(isFrozen ? State.Frozen : State.Open);
			this._list.reveal(selectionIndex, 0, selectionIndex === 0 ? 0 : this.getLayoutInfo().itemHeight * 0.33);
			this._list.setFocus(noFocus ? [] : [selectionIndex]);
		} finally {
			this._onDidFocus.resume();
			this._onDidSelect.resume();
		}

		this._pendingLayout.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.element.domNode), () => {
			this._pendingLayout.clear();
			this._layout(this.element.size);
			// Reset focus border
			this._details.widget.domNode.classList.remove('focused');
		});
	}

	focusSelected(): void {
		if (this._list.length > 0) {
			this._list.setFocus([0]);
		}
	}

	selectNextPage(): boolean {
		switch (this._state) {
			case State.Hidden:
				return false;
			case State.Details:
				this._details.widget.pageDown();
				return true;
			case State.Loading:
				return !this._isAuto;
			default:
				this._list.focusNextPage();
				return true;
		}
	}

	selectNext(): boolean {
		switch (this._state) {
			case State.Hidden:
				return false;
			case State.Loading:
				return !this._isAuto;
			default:
				this._list.focusNext(1, true);
				return true;
		}
	}

	selectLast(): boolean {
		switch (this._state) {
			case State.Hidden:
				return false;
			case State.Details:
				this._details.widget.scrollBottom();
				return true;
			case State.Loading:
				return !this._isAuto;
			default:
				this._list.focusLast();
				return true;
		}
	}

	selectPreviousPage(): boolean {
		switch (this._state) {
			case State.Hidden:
				return false;
			case State.Details:
				this._details.widget.pageUp();
				return true;
			case State.Loading:
				return !this._isAuto;
			default:
				this._list.focusPreviousPage();
				return true;
		}
	}

	selectPrevious(): boolean {
		switch (this._state) {
			case State.Hidden:
				return false;
			case State.Loading:
				return !this._isAuto;
			default:
				this._list.focusPrevious(1, true);
				return false;
		}
	}

	selectFirst(): boolean {
		switch (this._state) {
			case State.Hidden:
				return false;
			case State.Details:
				this._details.widget.scrollTop();
				return true;
			case State.Loading:
				return !this._isAuto;
			default:
				this._list.focusFirst();
				return true;
		}
	}

	getFocusedItem(): ISelectedSuggestion | undefined {
		if (this._state !== State.Hidden
			&& this._state !== State.Empty
			&& this._state !== State.Loading
			&& this._completionModel
			&& this._list.getFocus().length > 0
		) {

			return {
				item: this._list.getFocusedElements()[0],
				index: this._list.getFocus()[0],
				model: this._completionModel
			};
		}
		return undefined;
	}

	toggleDetailsFocus(): void {
		if (this._state === State.Details) {
			// Should return the focus to the list item.
			this._list.setFocus(this._list.getFocus());
			this._setState(State.Open);
		} else if (this._state === State.Open) {
			this._setState(State.Details);
			if (!this._isDetailsVisible()) {
				this.toggleDetails(true);
			} else {
				this._details.widget.focus();
			}
		}
	}

	toggleDetails(focused: boolean = false): void {
		if (this._isDetailsVisible()) {
			// hide details widget
			this._pendingShowDetails.clear();
			this._ctxSuggestWidgetDetailsVisible.set(false);
			this._setDetailsVisible(false);
			this._details.hide();
			this.element.domNode.classList.remove('shows-details');

		} else if ((canExpandCompletionItem(this._list.getFocusedElements()[0]) || this._explainMode) && (this._state === State.Open || this._state === State.Details || this._state === State.Frozen)) {
			// show details widget (iff possible)
			this._ctxSuggestWidgetDetailsVisible.set(true);
			this._setDetailsVisible(true);
			this._showDetails(false, focused);
		}
	}

	private _showDetails(loading: boolean, focused: boolean): void {
		this._pendingShowDetails.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.element.domNode), () => {
			this._pendingShowDetails.clear();
			this._details.show();
			let didFocusDetails = false;
			if (loading) {
				this._details.widget.renderLoading();
			} else {
				this._details.widget.renderItem(this._list.getFocusedElements()[0], this._explainMode);
			}
			if (!this._details.widget.isEmpty) {
				this._positionDetails();
				this.element.domNode.classList.add('shows-details');
				if (focused) {
					this._details.widget.focus();
					didFocusDetails = true;
				}
			} else {
				this._details.hide();
			}
			if (!didFocusDetails) {
				this.editor.focus();
			}
		});
	}

	toggleExplainMode(): void {
		if (this._list.getFocusedElements()[0]) {
			this._explainMode = !this._explainMode;
			if (!this._isDetailsVisible()) {
				this.toggleDetails();
			} else {
				this._showDetails(false, false);
			}
		}
	}

	resetPersistedSize(): void {
		this._persistedSize.reset();
	}

	hideWidget(): void {
		this._pendingLayout.clear();
		this._pendingShowDetails.clear();
		this._loadingTimeout?.dispose();

		this._setState(State.Hidden);
		this._onDidHide.fire(this);
		this.element.clearSashHoverState();

		// ensure that a reasonable widget height is persisted so that
		// accidential "resize-to-single-items" cases aren't happening
		const dim = this._persistedSize.restore();
		const minPersistedHeight = Math.ceil(this.getLayoutInfo().itemHeight * 4.3);
		if (dim && dim.height < minPersistedHeight) {
			this._persistedSize.store(dim.with(undefined, minPersistedHeight));
		}
	}

	isFrozen(): boolean {
		return this._state === State.Frozen;
	}

	_afterRender(position: ContentWidgetPositionPreference | null) {
		if (position === null) {
			if (this._isDetailsVisible()) {
				this._details.hide(); //todo@jrieken soft-hide
			}
			return;
		}
		if (this._state === State.Empty || this._state === State.Loading) {
			// no special positioning when widget isn't showing list
			return;
		}
		if (this._isDetailsVisible() && !this._details.widget.isEmpty) {
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

		const bodyBox = dom.getClientArea(this.element.domNode.ownerDocument.body);
		const info = this.getLayoutInfo();

		if (!size) {
			size = info.defaultSize;
		}

		let height = size.height;
		let width = size.width;

		// status bar
		this._status.element.style.height = `${info.itemHeight}px`;

		if (this._state === State.Empty || this._state === State.Loading) {
			// showing a message only
			height = info.itemHeight + info.borderHeight;
			width = info.defaultSize.width / 2;
			this.element.enableSashes(false, false, false, false);
			this.element.minSize = this.element.maxSize = new dom.Dimension(width, height);
			this._contentWidget.setPreference(ContentWidgetPositionPreference.BELOW);

		} else {
			// showing items

			// width math
			const maxWidth = bodyBox.width - info.borderHeight - 2 * info.horizontalPadding;
			if (width > maxWidth) {
				width = maxWidth;
			}
			const preferredWidth = this._completionModel ? this._completionModel.stats.pLabelLen * info.typicalHalfwidthCharacterWidth : width;

			// height math
			const fullHeight = info.statusBarHeight + this._list.contentHeight + info.borderHeight;
			const minHeight = info.itemHeight + info.statusBarHeight;
			const editorBox = dom.getDomNodePagePosition(this.editor.getDomNode());
			const cursorBox = this.editor.getScrolledVisiblePosition(this.editor.getPosition());
			const cursorBottom = editorBox.top + cursorBox.top + cursorBox.height;
			const maxHeightBelow = Math.min(bodyBox.height - cursorBottom - info.verticalPadding, fullHeight);
			const availableSpaceAbove = editorBox.top + cursorBox.top - info.verticalPadding;
			const maxHeightAbove = Math.min(availableSpaceAbove, fullHeight);
			let maxHeight = Math.min(Math.max(maxHeightAbove, maxHeightBelow) + info.borderHeight, fullHeight);

			if (height === this._cappedHeight?.capped) {
				// Restore the old (wanted) height when the current
				// height is capped to fit
				height = this._cappedHeight.wanted;
			}

			if (height < minHeight) {
				height = minHeight;
			}
			if (height > maxHeight) {
				height = maxHeight;
			}

			const forceRenderingAboveRequiredSpace = 150;
			if ((height > maxHeightBelow && maxHeightAbove > maxHeightBelow) || (this._forceRenderingAbove && availableSpaceAbove > forceRenderingAboveRequiredSpace)) {
				this._contentWidget.setPreference(ContentWidgetPositionPreference.ABOVE);
				this.element.enableSashes(true, true, false, false);
				maxHeight = maxHeightAbove;
			} else {
				this._contentWidget.setPreference(ContentWidgetPositionPreference.BELOW);
				this.element.enableSashes(false, true, true, false);
				maxHeight = maxHeightBelow;
			}
			this.element.preferredSize = new dom.Dimension(preferredWidth, info.defaultSize.height);
			this.element.maxSize = new dom.Dimension(maxWidth, maxHeight);
			this.element.minSize = new dom.Dimension(220, minHeight);

			// Know when the height was capped to fit and remember
			// the wanted height for later. This is required when going
			// left to widen suggestions.
			this._cappedHeight = height === fullHeight
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
		this._list.layout(height - statusBarHeight, width);
		this._listElement.style.height = `${height - statusBarHeight}px`;
		this.element.layout(height, width);
		this._contentWidget.layout();

		this._positionDetails();
	}

	private _positionDetails(): void {
		if (this._isDetailsVisible()) {
			this._details.placeAtAnchor(this.element.domNode, this._contentWidget.getPosition()?.preference[0] === ContentWidgetPositionPreference.BELOW);
		}
	}

	getLayoutInfo() {
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		const itemHeight = clamp(this.editor.getOption(EditorOption.suggestLineHeight) || fontInfo.lineHeight, 8, 1000);
		const statusBarHeight = !this.editor.getOption(EditorOption.suggest).showStatusBar || this._state === State.Empty || this._state === State.Loading ? 0 : itemHeight;
		const borderWidth = this._details.widget.getLayoutInfo().borderWidth;
		const borderHeight = 2 * borderWidth;

		return {
			itemHeight,
			statusBarHeight,
			borderWidth,
			borderHeight,
			typicalHalfwidthCharacterWidth: fontInfo.typicalHalfwidthCharacterWidth,
			verticalPadding: 22,
			horizontalPadding: 14,
			defaultSize: new dom.Dimension(430, statusBarHeight + 12 * itemHeight)
		};
	}

	private _isDetailsVisible(): boolean {
		return this._storageService.getBoolean('expandSuggestionDocs', StorageScope.PROFILE, false);
	}

	private _setDetailsVisible(value: boolean) {
		this._storageService.store('expandSuggestionDocs', value, StorageScope.PROFILE, StorageTarget.USER);
	}

	forceRenderingAbove() {
		if (!this._forceRenderingAbove) {
			this._forceRenderingAbove = true;
			this._layout(this._persistedSize.restore());
		}
	}

	stopForceRenderingAbove() {
		this._forceRenderingAbove = false;
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
