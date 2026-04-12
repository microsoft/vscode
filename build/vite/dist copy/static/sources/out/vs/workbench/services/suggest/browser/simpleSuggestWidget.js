/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SimpleSuggestWidget_1;
import './media/suggest.css';
import * as dom from '../../../../base/browser/dom.js';
import { List } from '../../../../base/browser/ui/list/listWidget.js';
import { ResizableHTMLElement } from '../../../../base/browser/ui/resizable/resizable.js';
import { getAriaId, SimpleSuggestWidgetItemRenderer } from './simpleSuggestWidgetRenderer.js';
import { createCancelablePromise, disposableTimeout, TimeoutTimer } from '../../../../base/common/async.js';
import { Emitter, PauseableEmitter } from '../../../../base/common/event.js';
import { MutableDisposable, Disposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SuggestWidgetStatus } from '../../../../editor/contrib/suggest/browser/suggestWidgetStatus.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { canExpandCompletionItem, SimpleSuggestDetailsOverlay, SimpleSuggestDetailsWidget } from './simpleSuggestWidgetDetails.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import * as strings from '../../../../base/common/strings.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { isWindows } from '../../../../base/common/platform.js';
import { editorSuggestWidgetForeground, editorSuggestWidgetSelectedBackground } from '../../../../editor/contrib/suggest/browser/suggestWidget.js';
import { getListStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { activeContrastBorder, focusBorder } from '../../../../platform/theme/common/colorRegistry.js';
const $ = dom.$;
var State;
(function (State) {
    State[State["Hidden"] = 0] = "Hidden";
    State[State["Loading"] = 1] = "Loading";
    State[State["Empty"] = 2] = "Empty";
    State[State["Open"] = 3] = "Open";
    State[State["Frozen"] = 4] = "Frozen";
    State[State["Details"] = 5] = "Details";
})(State || (State = {}));
var WidgetPositionPreference;
(function (WidgetPositionPreference) {
    WidgetPositionPreference[WidgetPositionPreference["Above"] = 0] = "Above";
    WidgetPositionPreference[WidgetPositionPreference["Below"] = 1] = "Below";
})(WidgetPositionPreference || (WidgetPositionPreference = {}));
export const SimpleSuggestContext = {
    HasFocusedSuggestion: new RawContextKey('simpleSuggestWidgetHasFocusedSuggestion', false, localize('simpleSuggestWidgetHasFocusedSuggestion', "Whether any simple suggestion is focused")),
    HasNavigated: new RawContextKey('simpleSuggestWidgetHasNavigated', false, localize('simpleSuggestWidgetHasNavigated', "Whether the simple suggestion widget has been navigated downwards")),
    FirstSuggestionFocused: new RawContextKey('simpleSuggestWidgetFirstSuggestionFocused', false, localize('simpleSuggestWidgetFirstSuggestionFocused', "Whether the first simple suggestion is focused")),
    ExplicitlyInvoked: new RawContextKey('simpleSuggestWidgetExplicitlyInvoked', false, localize('simpleSuggestWidgetExplicitlyInvoked', "Whether the simple suggestion widget was explicitly invoked")),
};
/**
 * Controls how suggest selection works
*/
export var SuggestSelectionMode;
(function (SuggestSelectionMode) {
    /**
     * Default. Will show a border and only accept via Tab until navigation has occurred. After that, it will show selection and accept via Enter or Tab.
     */
    SuggestSelectionMode["Partial"] = "partial";
    /**
     * Always select, what enter does depends on runOnEnter.
     */
    SuggestSelectionMode["Always"] = "always";
    /**
     * User needs to press down to select.
     */
    SuggestSelectionMode["Never"] = "never";
})(SuggestSelectionMode || (SuggestSelectionMode = {}));
var Classes;
(function (Classes) {
    Classes["PartialSelection"] = "partial-selection";
})(Classes || (Classes = {}));
let SimpleSuggestWidget = class SimpleSuggestWidget extends Disposable {
    static { SimpleSuggestWidget_1 = this; }
    static { this.LOADING_MESSAGE = localize('suggestWidget.loading', "Loading..."); }
    static { this.NO_SUGGESTIONS_MESSAGE = localize('suggestWidget.noSuggestions', "No suggestions."); }
    get list() { return this._list; }
    constructor(_container, _persistedSize, _options, _getFontInfo, _onDidFontConfigurationChange, _getAdvancedExplainModeDetails, _instantiationService, _configurationService, _storageService, _contextKeyService) {
        super();
        this._container = _container;
        this._persistedSize = _persistedSize;
        this._options = _options;
        this._getFontInfo = _getFontInfo;
        this._onDidFontConfigurationChange = _onDidFontConfigurationChange;
        this._getAdvancedExplainModeDetails = _getAdvancedExplainModeDetails;
        this._instantiationService = _instantiationService;
        this._configurationService = _configurationService;
        this._storageService = _storageService;
        this._state = 0 /* State.Hidden */;
        this._forceRenderingAbove = false;
        this._explainMode = false;
        this._pendingShowDetails = this._register(new MutableDisposable());
        this._pendingLayout = this._register(new MutableDisposable());
        this._ignoreFocusEvents = false;
        this._showTimeout = this._register(new TimeoutTimer());
        this._onDidSelect = this._register(new Emitter());
        this.onDidSelect = this._onDidSelect.event;
        this._onDidHide = this._register(new Emitter());
        this.onDidHide = this._onDidHide.event;
        this._onDidShow = this._register(new Emitter());
        this.onDidShow = this._onDidShow.event;
        this._onDidFocus = new PauseableEmitter();
        this.onDidFocus = this._onDidFocus.event;
        this._onDidBlurDetails = this._register(new Emitter());
        this.onDidBlurDetails = this._onDidBlurDetails.event;
        this.element = this._register(new ResizableHTMLElement());
        this.element.domNode.classList.add('workbench-suggest-widget');
        this._container.appendChild(this.element.domNode);
        this._ctxSuggestWidgetHasFocusedSuggestion = SimpleSuggestContext.HasFocusedSuggestion.bindTo(_contextKeyService);
        this._ctxSuggestWidgetHasBeenNavigated = SimpleSuggestContext.HasNavigated.bindTo(_contextKeyService);
        this._ctxFirstSuggestionFocused = SimpleSuggestContext.FirstSuggestionFocused.bindTo(_contextKeyService);
        this._ctxSuggestWidgetExplicitlyInvoked = SimpleSuggestContext.ExplicitlyInvoked.bindTo(_contextKeyService);
        class ResizeState {
            constructor(persistedSize, currentSize, persistHeight = false, persistWidth = false) {
                this.persistedSize = persistedSize;
                this.currentSize = currentSize;
                this.persistHeight = persistHeight;
                this.persistWidth = persistWidth;
            }
        }
        let state;
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
        this._list = this._register(new List('SuggestWidget', this._listElement, {
            getHeight: () => this._getLayoutInfo().itemHeight,
            getTemplateId: () => 'suggestion'
        }, [renderer], {
            alwaysConsumeMouseWheel: true,
            useShadows: false,
            mouseSupport: false,
            multipleSelectionSupport: false,
            accessibilityProvider: {
                getRole: () => isWindows ? 'listitem' : 'option',
                getWidgetAriaLabel: () => localize('suggest', "Suggest"),
                getWidgetRole: () => 'listbox',
                getAriaLabel: (item) => {
                    let label = item.textLabel;
                    const kindLabel = item.completion.kindLabel ?? '';
                    if (typeof item.completion.label !== 'string') {
                        const { detail, description } = item.completion.label;
                        if (detail && description) {
                            label = localize('label.full', '{0}{1}, {2} {3}', label, detail, description, kindLabel);
                        }
                        else if (detail) {
                            label = localize('label.detail', '{0}{1} {2}', label, detail, kindLabel);
                        }
                        else if (description) {
                            label = localize('label.desc', '{0}, {1} {2}', label, description, kindLabel);
                        }
                    }
                    else {
                        label = localize('label', '{0}, {1}', label, kindLabel);
                    }
                    const { documentation, detail } = item.completion;
                    const docs = strings.format('{0}{1}', detail || '', documentation ? (typeof documentation === 'string' ? documentation : documentation.value) : '');
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
        const details = this._register(_instantiationService.createInstance(SimpleSuggestDetailsWidget, this._getFontInfo.bind(this), this._onDidFontConfigurationChange.bind(this), this._getAdvancedExplainModeDetails.bind(this)));
        this._register(details.onDidClose(() => this.toggleDetails()));
        this._details = this._register(new SimpleSuggestDetailsOverlay(details, this._listElement, this._options.preventDetailsPlacements));
        this._register(dom.addDisposableListener(this._details.widget.domNode, 'blur', (e) => this._onDidBlurDetails.fire(e)));
        if (_options.statusBarMenuId && _options.showStatusBarSettingId && _configurationService.getValue(_options.showStatusBarSettingId)) {
            this._status = this._register(_instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode, _options.statusBarMenuId, { showIconsNoKeybindings: true }));
            this.element.domNode.classList.toggle('with-status-bar', true);
        }
        this._register(this._list.onMouseDown(e => this._onListMouseDownOrTap(e)));
        this._register(this._list.onTap(e => this._onListMouseDownOrTap(e)));
        this._register(this._list.onDidChangeFocus(e => this._onListFocus(e)));
        this._register(this._list.onDidChangeSelection(e => this._onListSelection(e)));
        this._register(this._onDidFontConfigurationChange(() => {
            if (this._completionModel) {
                this._list.splice(0, this._completionModel.items.length, this._completionModel.items);
            }
        }));
        this._register(_configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('editor.suggest.showIcons')) {
                applyIconStyle();
            }
            if (_options.statusBarMenuId && _options.showStatusBarSettingId && e.affectsConfiguration(_options.showStatusBarSettingId)) {
                const showStatusBar = _configurationService.getValue(_options.showStatusBarSettingId);
                if (showStatusBar && !this._status) {
                    this._status = this._register(_instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode, _options.statusBarMenuId, { showIconsNoKeybindings: true }));
                    this._status.show();
                }
                else if (showStatusBar && this._status) {
                    this._status.show();
                }
                else if (this._status) {
                    this._status.element.remove();
                    this._status.dispose();
                    this._status = undefined;
                    this._layout(undefined);
                }
                this.element.domNode.classList.toggle('with-status-bar', showStatusBar);
            }
        }));
    }
    _onListFocus(e) {
        if (this._ignoreFocusEvents) {
            return;
        }
        if (this._state === 5 /* State.Details */) {
            // This can happen when focus is in the details-panel and when
            // arrow keys are pressed to select next/prev items
            this._setState(3 /* State.Open */);
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
            }
            else {
                this._clearAriaActiveDescendant();
            }
            this._currentSuggestionDetails = createCancelablePromise(async (token) => {
                const loading = disposableTimeout(() => {
                    if (this._isDetailsVisible()) {
                        this._showDetails(true, false);
                    }
                }, 250);
                const sub = token.onCancellationRequested(() => loading.dispose());
                try {
                    return await Promise.resolve();
                }
                finally {
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
                }
                else {
                    this.element.domNode.classList.remove('docs-side');
                }
            }).catch();
        }
        this._ctxFirstSuggestionFocused.set(index === 0);
        // emit an event
        this._onDidFocus.fire({ item, index, model: this._completionModel });
    }
    _clearAriaActiveDescendant() {
        const node = dom.getActiveWindow().document.activeElement;
        if (!node) {
            return;
        }
        node.setAttribute('aria-haspopup', 'false');
        node.setAttribute('aria-autocomplete', 'both');
        node.removeAttribute('aria-activedescendant');
    }
    setCompletionModel(completionModel) {
        this._completionModel = completionModel;
    }
    hasCompletions() {
        return this._completionModel?.items.length !== 0;
    }
    resetWidgetSize() {
        this._persistedSize.reset();
    }
    relayout(cursorPosition) {
        if (this._state === 0 /* State.Hidden */) {
            return;
        }
        this._cursorPosition = cursorPosition;
        this._layout(this.element.size);
        this._afterRender();
    }
    showTriggered(explicitlyInvoked, cursorPosition) {
        if (this._state !== 0 /* State.Hidden */) {
            return;
        }
        this._cursorPosition = cursorPosition;
        this._ctxSuggestWidgetExplicitlyInvoked.set(!!explicitlyInvoked);
        if (this._ctxSuggestWidgetExplicitlyInvoked.get()) {
            this._loadingTimeout = disposableTimeout(() => this._setState(1 /* State.Loading */), 250);
        }
    }
    showSuggestions(selectionIndex, isFrozen, isAuto, cursorPosition) {
        this._cursorPosition = cursorPosition;
        this._loadingTimeout?.dispose();
        const selectionMode = this._options?.selectionModeSettingId ? this._configurationService.getValue(this._options.selectionModeSettingId) : undefined;
        // When explicitly invoked (not auto), always select the first item regardless of selectionMode
        const noFocus = !this._ctxSuggestWidgetExplicitlyInvoked.get() && selectionMode === "never" /* SuggestSelectionMode.Never */;
        // this._currentSuggestionDetails?.cancel();
        // this._currentSuggestionDetails = undefined;
        if (isFrozen && this._state !== 2 /* State.Empty */ && this._state !== 0 /* State.Hidden */) {
            this._setState(4 /* State.Frozen */);
            return;
        }
        const visibleCount = this._completionModel?.items.length ?? 0;
        const isEmpty = visibleCount === 0;
        // this._ctxSuggestWidgetMultipleSuggestions.set(visibleCount > 1);
        if (isEmpty) {
            this._setState(isAuto ? 0 /* State.Hidden */ : 2 /* State.Empty */);
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
            this._setState(isFrozen ? 4 /* State.Frozen */ : 3 /* State.Open */);
            this._list.reveal(selectionIndex, 0);
            this._list.setFocus(noFocus ? [] : [selectionIndex]);
        }
        finally {
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
    _updateListStyles() {
        if (this._options.selectionModeSettingId) {
            const selectionMode = this._configurationService.getValue(this._options.selectionModeSettingId);
            // When explicitly invoked, always show full selection (background) instead of partial (border)
            const usePartialStyle = !this._ctxSuggestWidgetExplicitlyInvoked.get() && selectionMode === "partial" /* SuggestSelectionMode.Partial */;
            this._list.style(getListStylesWithMode(usePartialStyle));
            this.element.domNode.classList.toggle("partial-selection" /* Classes.PartialSelection */, usePartialStyle);
        }
    }
    setLineContext(lineContext) {
        if (this._completionModel) {
            this._completionModel.lineContext = lineContext;
        }
    }
    _setState(state) {
        if (this._state === state) {
            return;
        }
        this._state = state;
        this.element.domNode.classList.toggle('frozen', state === 4 /* State.Frozen */);
        this.element.domNode.classList.remove('message');
        switch (state) {
            case 0 /* State.Hidden */:
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
            case 1 /* State.Loading */:
                this.element.domNode.classList.add('message');
                this._messageElement.textContent = SimpleSuggestWidget_1.LOADING_MESSAGE;
                dom.hide(this._listElement);
                if (this._status) {
                    dom.hide(this._status.element);
                }
                dom.show(this._messageElement);
                this._details.hide();
                this._show();
                this._focusedItem = undefined;
                status(SimpleSuggestWidget_1.LOADING_MESSAGE);
                break;
            case 2 /* State.Empty */:
                this.element.domNode.classList.add('message');
                this._messageElement.textContent = SimpleSuggestWidget_1.NO_SUGGESTIONS_MESSAGE;
                dom.hide(this._listElement);
                if (this._status) {
                    dom.hide(this._status.element);
                }
                dom.show(this._messageElement);
                this._details.hide();
                this._show();
                this._focusedItem = undefined;
                status(SimpleSuggestWidget_1.NO_SUGGESTIONS_MESSAGE);
                break;
            case 3 /* State.Open */:
                dom.hide(this._messageElement);
                this._showListAndStatus();
                this._show();
                break;
            case 4 /* State.Frozen */:
                dom.hide(this._messageElement);
                this._showListAndStatus();
                this._show();
                break;
            case 5 /* State.Details */:
                dom.hide(this._messageElement);
                this._showListAndStatus();
                this._details.show();
                this._show();
                break;
        }
    }
    _showListAndStatus() {
        if (this._status) {
            dom.show(this._listElement, this._status.element);
        }
        else {
            dom.show(this._listElement);
        }
    }
    _show() {
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
    toggleDetailsFocus() {
        if (this._state === 5 /* State.Details */) {
            // Should return the focus to the list item.
            this._list.setFocus(this._list.getFocus());
            this._setState(3 /* State.Open */);
        }
        else if (this._state === 3 /* State.Open */) {
            this._setState(5 /* State.Details */);
            if (!this._isDetailsVisible()) {
                this.toggleDetails(true);
            }
            else {
                this._details.widget.focus();
            }
        }
    }
    toggleDetails(focused = false) {
        if (this._isDetailsVisible()) {
            // hide details widget
            this._pendingShowDetails.clear();
            // this._ctxSuggestWidgetDetailsVisible.set(false);
            this._setDetailsVisible(false);
            this._details.hide();
            this.element.domNode.classList.remove('shows-details');
        }
        else if ((canExpandCompletionItem(this._list.getFocusedElements()[0]) || this._explainMode) && (this._state === 3 /* State.Open */ || this._state === 5 /* State.Details */ || this._state === 4 /* State.Frozen */)) {
            // show details widget (iff possible)
            // this._ctxSuggestWidgetDetailsVisible.set(true);
            this._setDetailsVisible(true);
            this._showDetails(false, focused);
        }
    }
    _showDetails(loading, focused) {
        this._pendingShowDetails.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.element.domNode), () => {
            this._pendingShowDetails.clear();
            this._details.show();
            let didFocusDetails = false;
            if (loading) {
                this._details.widget.renderLoading();
            }
            else {
                this._details.widget.renderItem(this._list.getFocusedElements()[0], this._explainMode);
            }
            if (!this._details.widget.isEmpty) {
                this._positionDetails();
                this.element.domNode.classList.add('shows-details');
                if (focused) {
                    this._details.widget.focus();
                    didFocusDetails = true;
                }
            }
            else {
                this._details.hide();
            }
            if (!didFocusDetails) {
                // this.editor.focus();
            }
        });
    }
    toggleExplainMode() {
        if (this._list.getFocusedElements()[0]) {
            this._explainMode = !this._explainMode;
            if (!this._isDetailsVisible()) {
                this.toggleDetails();
            }
            else {
                this._showDetails(false, false);
            }
        }
    }
    hide() {
        this._pendingLayout.clear();
        this._pendingShowDetails.clear();
        this._loadingTimeout?.dispose();
        this._ctxSuggestWidgetHasBeenNavigated.reset();
        this._ctxFirstSuggestionFocused.reset();
        this._ctxSuggestWidgetExplicitlyInvoked.reset();
        this._setState(0 /* State.Hidden */);
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
    _layout(size) {
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
            this._preference = 0 /* WidgetPositionPreference.Above */;
            this.element.enableSashes(true, true, false, false);
            maxHeight = maxHeightAbove;
        }
        else {
            this._preference = 1 /* WidgetPositionPreference.Below */;
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
        if (this._preference === 0 /* WidgetPositionPreference.Above */) {
            this.element.domNode.style.top = `${this._cursorPosition.top - height - info.borderHeight}px`;
        }
        else {
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
        if (this._state === 2 /* State.Empty */ || this._state === 1 /* State.Loading */) {
            // no special positioning when widget isn't showing list
            return;
        }
        if (this._isDetailsVisible() && !this._details.widget.isEmpty) {
            this._details.show();
        }
        this._positionDetails();
    }
    _resize(width, height) {
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
        if (this._cursorPosition && this._preference === 0 /* WidgetPositionPreference.Above */) {
            this.element.domNode.style.top = `${this._cursorPosition.top - height}px`;
        }
        this._positionDetails();
    }
    _positionDetails() {
        if (this._isDetailsVisible()) {
            this._details.placeAtAnchor(this.element.domNode);
        }
    }
    _getLayoutInfo() {
        const fontInfo = this._getFontInfo();
        const itemHeight = clamp(fontInfo.lineHeight, 8, 1000);
        const statusBarHeight = !this._options.statusBarMenuId || !this._options.showStatusBarSettingId || !this._configurationService.getValue(this._options.showStatusBarSettingId) || this._state === 2 /* State.Empty */ || this._state === 1 /* State.Loading */ ? 0 : itemHeight;
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
    _onListMouseDownOrTap(e) {
        if (typeof e.element === 'undefined' || typeof e.index === 'undefined') {
            return;
        }
        // prevent stealing browser focus from the terminal
        e.browserEvent.preventDefault();
        e.browserEvent.stopPropagation();
        this._select(e.element, e.index);
    }
    _onListSelection(e) {
        if (e.elements.length) {
            this._select(e.elements[0], e.indexes[0]);
        }
    }
    _select(item, index) {
        const completionModel = this._completionModel;
        if (completionModel) {
            this._onDidSelect.fire({ item, index, model: completionModel });
        }
    }
    selectNext() {
        this._clearPartialSelectionState();
        this._list.focusNext(1, true);
        const focus = this._list.getFocus();
        if (focus.length > 0) {
            this._list.reveal(focus[0]);
        }
        return true;
    }
    selectNextPage() {
        this._clearPartialSelectionState();
        this._list.focusNextPage();
        const focus = this._list.getFocus();
        if (focus.length > 0) {
            this._list.reveal(focus[0]);
        }
        return true;
    }
    selectPrevious() {
        this._clearPartialSelectionState();
        this._list.focusPrevious(1, true);
        const focus = this._list.getFocus();
        if (focus.length > 0) {
            this._list.reveal(focus[0]);
        }
        return true;
    }
    selectPreviousPage() {
        this._clearPartialSelectionState();
        this._list.focusPreviousPage();
        const focus = this._list.getFocus();
        if (focus.length > 0) {
            this._list.reveal(focus[0]);
        }
        return true;
    }
    _clearPartialSelectionState() {
        this._list.style(getListStylesWithMode(false));
        this.element.domNode.classList.remove("partial-selection" /* Classes.PartialSelection */);
    }
    getFocusedItem() {
        if (this._completionModel) {
            return {
                item: this._list.getFocusedElements()[0],
                index: this._list.getFocus()[0],
                model: this._completionModel
            };
        }
        return undefined;
    }
    _isDetailsVisible() {
        return this._storageService.getBoolean('expandSuggestionDocs', 0 /* StorageScope.PROFILE */, false);
    }
    _setDetailsVisible(value) {
        this._storageService.store('expandSuggestionDocs', value, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
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
};
SimpleSuggestWidget = SimpleSuggestWidget_1 = __decorate([
    __param(6, IInstantiationService),
    __param(7, IConfigurationService),
    __param(8, IStorageService),
    __param(9, IContextKeyService)
], SimpleSuggestWidget);
export { SimpleSuggestWidget };
function getListStylesWithMode(partial) {
    // The suggest widget uses the list's inactive focus to mean selection since it's not actually
    // focused.
    if (partial) {
        return getListStyles({
            listInactiveFocusOutline: focusBorder,
            listInactiveFocusForeground: editorSuggestWidgetForeground,
        });
    }
    else {
        return getListStyles({
            listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
            listInactiveFocusOutline: activeContrastBorder
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlU3VnZ2VzdFdpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zdWdnZXN0L2Jyb3dzZXIvc2ltcGxlU3VnZ2VzdFdpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxxQkFBcUIsQ0FBQztBQUM3QixPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBRXZELE9BQU8sRUFBZSxJQUFJLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUcxRixPQUFPLEVBQUUsU0FBUyxFQUFFLCtCQUErQixFQUFxQyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2pJLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDL0gsT0FBTyxFQUFFLE9BQU8sRUFBUyxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBRXhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLDJC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