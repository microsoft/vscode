/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/suggest.css';
import * as dom from '../../../../base/browser/dom.js';
import { IListEvent, IListGestureEvent, IListMouseEvent } from '../../../../base/browser/ui/list/list.js';
import { IListStyles, List } from '../../../../base/browser/ui/list/listWidget.js';
import { ResizableHTMLElement } from '../../../../base/browser/ui/resizable/resizable.js';
import { SimpleCompletionItem } from './simpleCompletionItem.js';
import { LineContext, SimpleCompletionModel } from './simpleCompletionModel.js';
import { getAriaId, SimpleSuggestWidgetItemRenderer, type ISimpleSuggestWidgetFontInfo } from './simpleSuggestWidgetRenderer.js';
import { CancelablePromise, createCancelablePromise, disposableTimeout, TimeoutTimer } from '../../../../base/common/async.js';
import { Emitter, Event, PauseableEmitter } from '../../../../base/common/event.js';
import { MutableDisposable, Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SuggestWidgetStatus } from '../../../../editor/contrib/suggest/browser/suggestWidgetStatus.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { canExpandCompletionItem, SimpleSuggestDetailsOverlay, SimpleSuggestDetailsWidget, type SimpleSuggestDetailsPlacement } from './simpleSuggestWidgetDetails.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import * as strings from '../../../../base/common/strings.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { isWindows } from '../../../../base/common/platform.js';
import { editorSuggestWidgetForeground, editorSuggestWidgetSelectedBackground } from '../../../../editor/contrib/suggest/browser/suggestWidget.js';
import { getListStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { activeContrastBorder, focusBorder } from '../../../../platform/theme/common/colorRegistry.js';

const $ = dom.$;

const enum State {
	Hidden,
	Loading,
	Empty,
	Open,
	Frozen,
	Details
}

export interface ISimpleSelectedSuggestion<T extends SimpleCompletionItem> {
	item: T;
	index: number;
	model: SimpleCompletionModel<T>;
}

interface IPersistedWidgetSizeDelegate {
	restore(): dom.Dimension | undefined;
	store(size: dom.Dimension): void;
	reset(): void;
}

const enum WidgetPositionPreference {
	Above,
	Below
}

export const SimpleSuggestContext = {
	HasFocusedSuggestion: new RawContextKey<boolean>('simpleSuggestWidgetHasFocusedSuggestion', false, localize('simpleSuggestWidgetHasFocusedSuggestion', "Whether any simple suggestion is focused")),
	HasNavigated: new RawContextKey<boolean>('simpleSuggestWidgetHasNavigated', false, localize('simpleSuggestWidgetHasNavigated', "Whether the simple suggestion widget has been navigated downwards")),
	FirstSuggestionFocused: new RawContextKey<boolean>('simpleSuggestWidgetFirstSuggestionFocused', false, localize('simpleSuggestWidgetFirstSuggestionFocused', "Whether the first simple suggestion is focused")),
};

export interface IWorkbenchSuggestWidgetOptions {
	/**
	 * The {@link MenuId} to use for the status bar. Items on the menu must use the groups `'left'`
	 * and `'right'`.
	 */
	statusBarMenuId?: MenuId;

	/**
	 * The setting for showing the status bar.
	 */
	showStatusBarSettingId?: string;

	/**
	 * The setting for selection mode.
	 */
	selectionModeSettingId?: string;

	/**
	 * Disables specific detail placements when positioning the details overlay.
	 */
	preventDetailsPlacements?: readonly SimpleSuggestDetailsPlacement[];
}

/**
 * Controls how suggest selection works
*/
export const enum SuggestSelectionMode {
	/**
	 * Default. Will show a border and only accept via Tab until navigation has occurred. After that, it will show selection and accept via Enter or Tab.
	 */
	Partial = 'partial',
	/**
	 * Always select, what enter does depends on runOnEnter.
	 */
	Always = 'always',
	/**
	 * User needs to press down to select.
	 */
	Never = 'never'
}

const enum Classes {
	PartialSelection = 'partial-selection',
}

export class SimpleSuggestWidget<TModel extends SimpleCompletionModel<TItem>, TItem extends SimpleCompletionItem> extends Disposable {

	private static LOADING_MESSAGE: string = localize('suggestWidget.loading', "Loading...");
	private static NO_SUGGESTIONS_MESSAGE: string = localize('suggestWidget.noSuggestions', "No suggestions.");

	private _state: State = State.Hidden;
	private _explicitlyInvoked: boolean = false;
	private _loadingTimeout?: IDisposable;
	private _completionModel?: TModel;
	private _cappedHeight?: { wanted: number; capped: number };
	private _forceRenderingAbove: boolean = false;
	private _explainMode: boolean = false;

	private _preference?: WidgetPositionPreference;
	private readonly _pendingShowDetails = this._register(new MutableDisposable());
	private readonly _pendingLayout = this._register(new MutableDisposable());
	private _currentSuggestionDetails?: CancelablePromise<void>;
	private _focusedItem?: TItem;
	private _ignoreFocusEvents: boolean = false;
	readonly element: ResizableHTMLElement;
	private readonly _messageElement: HTMLElement;
	private readonly _listElement: HTMLElement;
	private readonly _list: List<TItem>;
	private _status?: SuggestWidgetStatus;
	private readonly _details: SimpleSuggestDetailsOverlay;

	private readonly _showTimeout = this._register(new TimeoutTimer());

	private readonly _onDidSelect = this._register(new Emitter<ISimpleSelectedSuggestion<TItem>>());
	readonly onDidSelect: Event<ISimpleSelectedSuggestion<TItem>> = this._onDidSelect.event;
	private readonly _onDidHide = this._register(new Emitter<this>());
	readonly onDidHide: Event<this> = this._onDidHide.event;
	private readonly _onDidShow = this._register(new Emitter<this>());
	readonly onDidShow: Event<this> = this._onDidShow.event;
	private readonly _onDidFocus = new PauseableEmitter<ISimpleSelectedSuggestion<TItem>>();
	readonly onDidFocus: Event<ISimpleSelectedSuggestion<TItem>> = this._onDidFocus.event;
	private readonly _onDidBlurDetails = this._register(new Emitter<FocusEvent>());
	readonly onDidBlurDetails = this._onDidBlurDetails.event;

	get list(): List<TItem> { return this._list; }

	private readonly _ctxSuggestWidgetHasFocusedSuggestion: IContextKey<boolean>;
	private readonly _ctxSuggestWidgetHasBeenNavigated: IContextKey<boolean>;
	private readonly _ctxFirstSuggestionFocused: IContextKey<boolean>;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _persistedSize: IPersistedWidgetSizeDelegate,
		private readonly _options: IWorkbenchSuggestWidgetOptions,
		private readonly _getFontInfo: () => ISimpleSuggestWidgetFontInfo,
		private readonly _onDidFontConfigurationChange: Event<void>,
		private readonly _getAdvancedExplainModeDetails: () => string | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IContextKeyService _contextKeyService: IContextKeyService
	) {
		super();

		this.element = this._register(new ResizableHTMLElement());
		this.element.domNode.classList.add('workbench-suggest-widget');
		this._container.appendChild(this.element.domNode);
		this._ctxSuggestWidgetHasFocusedSuggestion = SimpleSuggestContext.HasFocusedSuggestion.bindTo(_contextKeyService);
		this._ctxSuggestWidgetHasBeenNavigated = SimpleSuggestContext.HasNavigated.bindTo(_contextKeyService);
		this._ctxFirstSuggestionFocused = SimpleSuggestContext.FirstSuggestionFocused.bindTo(_contextKeyService);

		class ResizeState {
			constructor(
				readonly persistedSize: dom.Dimension | undefined,
				readonly currentSize: dom.Dimension,
				public persistHeight = false,
				public persistWidth = false,
			) { }
		}

		let state: ResizeState | undefined;
		this._register(this.element.onDidWillResize(() => {
			// this._preferenceLocked = true;
			state = new ResizeState(this._persistedSize.restore(), this.element.size);
		}));
		this._register(this.element.onDidResize(e => {

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
				const { itemHeight, defaultSize } = this._getLayoutInfo();
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
			// this._preferenceLocked = false;
			state = undefined;
		}));

		const applyIconStyle = () => this.element.domNode.classList.toggle('no-icons', !_configurationService.getValue('editor.suggest.showIcons'));
		applyIconStyle();

		const renderer = this._instantiationService.createInstance(SimpleSuggestWidgetItemRenderer, this._getFontInfo.bind(this), this._onDidFontConfigurationChange.bind(this));
		this._register(renderer);
		this._listElement = dom.append(this.element.domNode, $('.tree'));
		this._list = this._register(new List<TItem>('SuggestWidget', this._listElement, {
			getHeight: (): number => this._getLayoutInfo().itemHeight,
			getTemplateId: (): string => 'suggestion'
		}, [renderer], {
			alwaysConsumeMouseWheel: true,
			useShadows: false,
			mouseSupport: false,
			multipleSelectionSupport: false,
			accessibilityProvider: {
				getRole: () => isWindows ? 'listitem' : 'option',
				getWidgetAriaLabel: () => localize('suggest', "Suggest"),
				getWidgetRole: () => 'listbox',
				getAriaLabel: (item: SimpleCompletionItem) => {
					let label = item.textLabel;
					const kindLabel = item.completion.kindLabel ?? '';
					if (typeof item.completion.label !== 'string') {
						const { detail, description } = item.completion.label;
						if (detail && description) {
							label = localize('label.full', '{0}{1}, {2} {3}', label, detail, description, kindLabel);
						} else if (detail) {
							label = localize('label.detail', '{0}{1} {2}', label, detail, kindLabel);
						} else if (description) {
							label = localize('label.desc', '{0}, {1} {2}', label, description, kindLabel);
						}
					} else {
						label = localize('label', '{0}, {1}', label, kindLabel);
					}
					const { documentation, detail } = item.completion;
					const docs = strings.format(
						'{0}{1}',
						detail || '',
						documentation ? (typeof documentation === 'string' ? documentation : documentation.value) : '');

					return localize('ariaCurrenttSuggestionReadDetails', "{0}, docs: {1}", label, docs);
				},
			}
		}));
		this._register(this._list.onDidChangeFocus(e => {
			if (e.indexes.length && e.indexes[0] !== 0) {
				this._ctxSuggestWidgetHasBeenNavigated.set(true);
			}
		}));
		this._messageElement = dom.append(this.element.domNode, dom.$('.message'));

		const details: SimpleSuggestDetailsWidget = this._register(_instantiationService.createInstance(SimpleSuggestDetailsWidget, this._getFontInfo.bind(this), this._onDidFontConfigurationChange.bind(this), this._getAdvancedExplainModeDetails.bind(this)));
		this._register(details.onDidClose(() => this.toggleDetails()));
		this._details = this._register(new SimpleSuggestDetailsOverlay(details, this._listElement, this._options.preventDetailsPlacements));
		this._register(dom.addDisposableListener(this._details.widget.domNode, 'blur', (e) => this._onDidBlurDetails.fire(e)));

		if (_options.statusBarMenuId && _options.showStatusBarSettingId && _configurationService.getValue(_options.showStatusBarSettingId)) {
			this._status = this._register(_instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode, _options.statusBarMenuId));
			this.element.domNode.classList.toggle('with-status-bar', true);
		}

		this._register(this._list.onMouseDown(e => this._onListMouseDownOrTap(e)));
		this._register(this._list.onTap(e => this._onListMouseDownOrTap(e)));
		this._register(this._list.onDidChangeFocus(e => this._onListFocus(e)));
		this._register(this._list.onDidChangeSelection(e => this._onListSelection(e)));
		this._register(this._onDidFontConfigurationChange(() => {
			if (this._completionModel) {
				this._list.splice(0, this._completionModel.items.length, this._completionModel!.items);
			}
		}));
		this._register(_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.suggest.showIcons')) {
				applyIconStyle();
			}
			if (_options.statusBarMenuId && _options.showStatusBarSettingId && e.affectsConfiguration(_options.showStatusBarSettingId)) {
				const showStatusBar: boolean = _configurationService.getValue(_options.showStatusBarSettingId);
				if (showStatusBar && !this._status) {
					this._status = this._register(_instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode, _options.statusBarMenuId));
					this._status.show();
				} else if (showStatusBar && this._status) {
					this._status.show();
				} else if (this._status) {
					this._status.element.remove();
					this._status.dispose();
					this._status = undefined;
					this._layout(undefined);
				}
				this.element.domNode.classList.toggle('with-status-bar', showStatusBar);
			}
		}));
	}

	private _onListFocus(e: IListEvent<TItem>): void {
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
				this._ctxSuggestWidgetHasFocusedSuggestion.set(false);
			}
			this._clearAriaActiveDescendant();
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

			const id = getAriaId(index);
			const node = dom.getActiveWindow().document.activeElement;
			if (node && id) {
				node.setAttribute('aria-haspopup', 'true');
				node.setAttribute('aria-autocomplete', 'list');
				node.setAttribute('aria-activedescendant', id);
			} else {
				this._clearAriaActiveDescendant();
			}

			this._currentSuggestionDetails = createCancelablePromise(async token => {
				const loading = disposableTimeout(() => {
					if (this._isDetailsVisible()) {
						this._showDetails(true, false);
					}
				}, 250);
				const sub = token.onCancellationRequested(() => loading.dispose());
				try {
					return await Promise.resolve();
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

			}).catch();
		}

		this._ctxFirstSuggestionFocused.set(index === 0);
		// emit an event
		this._onDidFocus.fire({ item, index, model: this._completionModel });
	}

	private _clearAriaActiveDescendant(): void {
		const node = dom.getActiveWindow().document.activeElement;
		if (!node) {
			return;
		}
		node.setAttribute('aria-haspopup', 'false');
		node.setAttribute('aria-autocomplete', 'both');
		node.removeAttribute('aria-activedescendant');
	}

	private _cursorPosition?: { top: number; left: number; height: number };

	setCompletionModel(completionModel: TModel) {
		this._completionModel = completionModel;
	}

	hasCompletions(): boolean {
		return this._completionModel?.items.length !== 0;
	}

	resetWidgetSize(): void {
		this._persistedSize.reset();
	}

	showTriggered(explicitlyInvoked: boolean, cursorPosition: { top: number; left: number; height: number }) {
		if (this._state !== State.Hidden) {
			return;
		}
		this._cursorPosition = cursorPosition;
		this._explicitlyInvoked = !!explicitlyInvoked;

		if (this._explicitlyInvoked) {
			this._loadingTimeout = disposableTimeout(() => this._setState(State.Loading), 250);
		}
	}

	showSuggestions(selectionIndex: number, isFrozen: boolean, isAuto: boolean, cursorPosition: { top: number; left: number; height: number }): void {
		this._cursorPosition = cursorPosition;

		this._loadingTimeout?.dispose();

		// this._currentSuggestionDetails?.cancel();
		// this._currentSuggestionDetails = undefined;

		if (isFrozen && this._state !== State.Empty && this._state !== State.Hidden) {
			this._setState(State.Frozen);
			return;
		}

		const visibleCount = this._completionModel?.items.length ?? 0;
		const isEmpty = visibleCount === 0;
		// this._ctxSuggestWidgetMultipleSuggestions.set(visibleCount > 1);

		if (isEmpty) {
			this._setState(isAuto ? State.Hidden : State.Empty);
			this._completionModel = undefined;
			return;
		}

		// this._focusedItem = undefined;

		// calling list.splice triggers focus event which this widget forwards. That can lead to
		// suggestions being cancelled and the widget being cleared (and hidden). All this happens
		// before revealing and focusing is done which means revealing and focusing will fail when
		// they get run.
		// this._onDidFocus.pause();
		// this._onDidSelect.pause();
		try {
			this._list.splice(0, this._list.length, this._completionModel?.items ?? []);
			this._setState(isFrozen ? State.Frozen : State.Open);
			this._list.reveal(selectionIndex, 0);
			this._list.setFocus([selectionIndex]);
			const noFocus = this._options?.selectionModeSettingId ? this._configurationService.getValue<SuggestSelectionMode>(this._options.selectionModeSettingId) === SuggestSelectionMode.Never : false;
			this._list.setFocus(noFocus ? [] : [selectionIndex]);
		} finally {
			// this._onDidFocus.resume();
			// this._onDidSelect.resume();
		}

		this._pendingLayout.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.element.domNode), () => {
			this._pendingLayout.clear();
			this._layout(this.element.size);
			// Reset focus border
			// this._details.widget.domNode.classList.remove('focused');
		});
		this._updateListStyles();
		this._afterRender();
	}

	private _updateListStyles(): void {
		if (this._options.selectionModeSettingId) {
			const selectionMode = this._configurationService.getValue<SuggestSelectionMode>(this._options.selectionModeSettingId);
			this._list.style(getListStylesWithMode(selectionMode === SuggestSelectionMode.Partial));
			this.element.domNode.classList.toggle(Classes.PartialSelection, selectionMode === SuggestSelectionMode.Partial);
		}
	}

	setLineContext(lineContext: LineContext): void {
		if (this._completionModel) {
			this._completionModel.lineContext = lineContext;
		}
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
				if (this._status) {
					dom.hide(this._status.element);
				}
				dom.hide(this._listElement);
				dom.hide(this._messageElement);
				dom.hide(this.element.domNode);
				this._details.hide(true);
				this._status?.hide();
				// this._contentWidget.hide();
				// this._ctxSuggestWidgetVisible.reset();
				// this._ctxSuggestWidgetMultipleSuggestions.reset();
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
				this._messageElement.textContent = SimpleSuggestWidget.LOADING_MESSAGE;
				dom.hide(this._listElement);
				if (this._status) {
					dom.hide(this._status.element);
				}
				dom.show(this._messageElement);
				this._details.hide();
				this._show();
				this._focusedItem = undefined;
				status(SimpleSuggestWidget.LOADING_MESSAGE);
				break;
			case State.Empty:
				this.element.domNode.classList.add('message');
				this._messageElement.textContent = SimpleSuggestWidget.NO_SUGGESTIONS_MESSAGE;
				dom.hide(this._listElement);
				if (this._status) {
					dom.hide(this._status.element);
				}
				dom.show(this._messageElement);
				this._details.hide();
				this._show();
				this._focusedItem = undefined;
				status(SimpleSuggestWidget.NO_SUGGESTIONS_MESSAGE);
				break;
			case State.Open:
				dom.hide(this._messageElement);
				this._showListAndStatus();
				this._show();
				break;
			case State.Frozen:
				dom.hide(this._messageElement);
				this._showListAndStatus();
				this._show();
				break;
			case State.Details:
				dom.hide(this._messageElement);
				this._showListAndStatus();
				this._details.show();
				this._show();
				break;
		}
	}

	private _showListAndStatus(): void {
		if (this._status) {
			dom.show(this._listElement, this._status.element);
		} else {
			dom.show(this._listElement);
		}
	}

	private _show(): void {
		// this._layout(this._persistedSize.restore());
		// dom.show(this.element.domNode);
		// this._onDidShow.fire();


		this._status?.show();
		// this._contentWidget.show();
		dom.show(this.element.domNode);
		this._layout(this._persistedSize.restore());
		// this._ctxSuggestWidgetVisible.set(true);

		this._onDidShow.fire(this);
		this._showTimeout.cancelAndSet(() => {
			this.element.domNode.classList.add('visible');
		}, 100);
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
			// this._ctxSuggestWidgetDetailsVisible.set(false);

			this._setDetailsVisible(false);
			this._details.hide();
			this.element.domNode.classList.remove('shows-details');

		} else if ((canExpandCompletionItem(this._list.getFocusedElements()[0]) || this._explainMode) && (this._state === State.Open || this._state === State.Details || this._state === State.Frozen)) {
			// show details widget (iff possible)
			// this._ctxSuggestWidgetDetailsVisible.set(true);

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
				// this.editor.focus();
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

	hide(): void {
		this._pendingLayout.clear();
		this._pendingShowDetails.clear();
		this._loadingTimeout?.dispose();
		this._ctxSuggestWidgetHasBeenNavigated.reset();
		this._ctxFirstSuggestionFocused.reset();
		this._setState(State.Hidden);
		this._onDidHide.fire(this);
		dom.hide(this.element.domNode);
		this.element.clearSashHoverState();
		// ensure that a reasonable widget height is persisted so that
		// accidential "resize-to-single-items" cases aren't happening
		const dim = this._persistedSize.restore();
		const minPersistedHeight = Math.ceil(this._getLayoutInfo().itemHeight * 4.3);
		if (dim && dim.height < minPersistedHeight) {
			this._persistedSize.store(dim.with(undefined, minPersistedHeight));
		}
	}

	private _layout(size: dom.Dimension | undefined): void {
		if (!this._cursorPosition) {
			return;
		}
		// if (!this.editor.hasModel()) {
		// 	return;
		// }
		// if (!this.editor.getDomNode()) {
		// 	// happens when running tests
		// 	return;
		// }

		const bodyBox = dom.getClientArea(this._container.ownerDocument.body);
		const info = this._getLayoutInfo();

		if (!size) {
			size = info.defaultSize;
		}

		let height = size.height;
		let width = size.width;

		// status bar
		if (this._status) {
			this._status.element.style.height = `${info.itemHeight}px`;
		}

		// if (this._state === State.Empty || this._state === State.Loading) {
		// 	// showing a message only
		// 	height = info.itemHeight + info.borderHeight;
		// 	width = info.defaultSize.width / 2;
		// 	this.element.enableSashes(false, false, false, false);
		// 	this.element.minSize = this.element.maxSize = new dom.Dimension(width, height);
		// 	this._preference = WidgetPositionPreference.Below;

		// } else {
		// showing items

		// width math
		const maxWidth = bodyBox.width - info.borderHeight - 2 * info.horizontalPadding;
		if (width > maxWidth) {
			width = maxWidth;
		}
		const preferredWidth = this._completionModel ? this._completionModel.stats.pLabelLen * info.typicalHalfwidthCharacterWidth : width;

		// height math
		// Cap list content height to a reasonable maximum (12 items worth), matching suggestWidget behavior
		const cappedListContentHeight = Math.min(this._list.contentHeight, info.itemHeight * 12);
		const fullHeight = info.statusBarHeight + cappedListContentHeight + this._messageElement.clientHeight + info.borderHeight;
		const minHeight = info.itemHeight + info.statusBarHeight;
		// const editorBox = dom.getDomNodePagePosition(this.editor.getDomNode());
		// const cursorBox = this.editor.getScrolledVisiblePosition(this.editor.getPosition());
		const editorBox = dom.getDomNodePagePosition(this._container);
		// Convert absolute cursor position to relative position (relative to container)
		const cursorBox = {
			top: this._cursorPosition.top - editorBox.top,
			left: this._cursorPosition.left,
			height: this._cursorPosition.height
		};
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
			this._preference = WidgetPositionPreference.Above;
			this.element.enableSashes(true, true, false, false);
			maxHeight = maxHeightAbove;
		} else {
			this._preference = WidgetPositionPreference.Below;
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
		// }
		// Horizontal positioning: Position widget at cursor, flip to left if would overflow right
		let anchorLeft = this._cursorPosition.left;
		const wouldOverflowRight = anchorLeft + width > bodyBox.width;

		if (wouldOverflowRight) {
			// Position right edge at cursor (extends left)
			anchorLeft = this._cursorPosition.left - width;
		}

		this.element.domNode.style.left = `${anchorLeft}px`;
		if (this._preference === WidgetPositionPreference.Above) {
			this.element.domNode.style.top = `${this._cursorPosition.top - height - info.borderHeight}px`;
		} else {
			this.element.domNode.style.top = `${this._cursorPosition.top + this._cursorPosition.height}px`;
		}
		// }
		this._resize(width, height);
	}

	_afterRender() {
		// if (position === null) {
		// 	if (this._isDetailsVisible()) {
		// 		this._details.hide(); //todo@jrieken soft-hide
		// 	}
		// 	return;
		// }
		if (this._state === State.Empty || this._state === State.Loading) {
			// no special positioning when widget isn't showing list
			return;
		}
		if (this._isDetailsVisible() && !this._details.widget.isEmpty) {
			this._details.show();
		}
		this._positionDetails();
	}

	private _resize(width: number, height: number): void {
		const { width: maxWidth, height: maxHeight } = this.element.maxSize;
		width = Math.min(maxWidth, width);
		if (maxHeight) {
			height = Math.min(maxHeight, height);
		}

		const { statusBarHeight } = this._getLayoutInfo();
		this._list.layout(height - statusBarHeight, width);
		this._listElement.style.height = `${height - statusBarHeight}px`;

		this._listElement.style.width = `${width}px`;
		this.element.layout(height, width);
		if (this._cursorPosition && this._preference === WidgetPositionPreference.Above) {
			this.element.domNode.style.top = `${this._cursorPosition.top - height}px`;
		}
		this._positionDetails();
	}

	private _positionDetails(): void {
		if (this._isDetailsVisible()) {
			this._details.placeAtAnchor(this.element.domNode);
		}
	}

	private _getLayoutInfo() {
		const fontInfo = this._getFontInfo();
		const itemHeight = clamp(fontInfo.lineHeight, 8, 1000);
		const statusBarHeight = !this._options.statusBarMenuId || !this._options.showStatusBarSettingId || !this._configurationService.getValue(this._options.showStatusBarSettingId) || this._state === State.Empty || this._state === State.Loading ? 0 : itemHeight;
		const borderWidth = this._details.widget.borderWidth;
		const borderHeight = 2 * borderWidth;

		return {
			itemHeight,
			statusBarHeight,
			borderWidth,
			borderHeight,
			typicalHalfwidthCharacterWidth: 10,
			verticalPadding: 22,
			horizontalPadding: 14,
			defaultSize: new dom.Dimension(430, statusBarHeight + 12 * itemHeight + borderHeight)
		};
	}

	private _onListMouseDownOrTap(e: IListMouseEvent<TItem> | IListGestureEvent<TItem>): void {
		if (typeof e.element === 'undefined' || typeof e.index === 'undefined') {
			return;
		}

		// prevent stealing browser focus from the terminal
		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();

		this._select(e.element, e.index);
	}

	private _onListSelection(e: IListEvent<TItem>): void {
		if (e.elements.length) {
			this._select(e.elements[0], e.indexes[0]);
		}
	}

	private _select(item: TItem, index: number): void {
		const completionModel = this._completionModel;
		if (completionModel) {
			this._onDidSelect.fire({ item, index, model: completionModel });
		}
	}

	selectNext(): boolean {
		this._clearPartialSelectionState();
		this._list.focusNext(1, true);
		const focus = this._list.getFocus();
		if (focus.length > 0) {
			this._list.reveal(focus[0]);
		}
		return true;
	}

	selectNextPage(): boolean {
		this._clearPartialSelectionState();
		this._list.focusNextPage();
		const focus = this._list.getFocus();
		if (focus.length > 0) {
			this._list.reveal(focus[0]);
		}
		return true;
	}

	selectPrevious(): boolean {
		this._clearPartialSelectionState();
		this._list.focusPrevious(1, true);
		const focus = this._list.getFocus();
		if (focus.length > 0) {
			this._list.reveal(focus[0]);
		}
		return true;
	}

	selectPreviousPage(): boolean {
		this._clearPartialSelectionState();
		this._list.focusPreviousPage();
		const focus = this._list.getFocus();
		if (focus.length > 0) {
			this._list.reveal(focus[0]);
		}
		return true;
	}

	private _clearPartialSelectionState(): void {
		this._list.style(getListStylesWithMode(false));
		this.element.domNode.classList.remove(Classes.PartialSelection);
	}

	getFocusedItem(): ISimpleSelectedSuggestion<TItem> | undefined {
		if (this._completionModel) {
			return {
				item: this._list.getFocusedElements()[0],
				index: this._list.getFocus()[0],
				model: this._completionModel
			};
		}
		return undefined;
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

function getListStylesWithMode(partial?: boolean): IListStyles {
	// The suggest widget uses the list's inactive focus to mean selection since it's not actually
	// focused.
	if (partial) {
		return getListStyles({
			listInactiveFocusOutline: focusBorder,
			listInactiveFocusForeground: editorSuggestWidgetForeground,
		});
	} else {
		return getListStyles({
			listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
			listInactiveFocusOutline: activeContrastBorder
		});
	}
}
