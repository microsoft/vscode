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
var SuggestWidget_1;
import * as dom from '../../../../base/browser/dom.js';
import '../../../../base/browser/ui/codicons/codiconStyles.js'; // The codicon symbol styles are defined here and must be loaded
import { List } from '../../../../base/browser/ui/list/listWidget.js';
import { createCancelablePromise, disposableTimeout, TimeoutTimer } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, PauseableEmitter } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import * as strings from '../../../../base/common/strings.js';
import './media/suggest.css';
import { EmbeddedCodeEditorWidget } from '../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { SuggestWidgetStatus } from './suggestWidgetStatus.js';
import '../../symbolIcons/browser/symbolIcons.js'; // The codicon symbol colors are defined here and must be loaded to get colors
import * as nls from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { activeContrastBorder, editorForeground, editorWidgetBackground, editorWidgetBorder, listFocusHighlightForeground, listHighlightForeground, quickInputListFocusBackground, quickInputListFocusForeground, quickInputListFocusIconForeground, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ResizableHTMLElement } from '../../../../base/browser/ui/resizable/resizable.js';
import { Context as SuggestContext, suggestWidgetStatusbarMenu } from './suggest.js';
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
var State;
(function (State) {
    State[State["Hidden"] = 0] = "Hidden";
    State[State["Loading"] = 1] = "Loading";
    State[State["Empty"] = 2] = "Empty";
    State[State["Open"] = 3] = "Open";
    State[State["Frozen"] = 4] = "Frozen";
    State[State["Details"] = 5] = "Details";
    State[State["onDetailsKeyDown"] = 6] = "onDetailsKeyDown";
})(State || (State = {}));
class PersistedWidgetSize {
    constructor(_service, editor) {
        this._service = _service;
        this._key = `suggestWidget.size/${editor.getEditorType()}/${editor instanceof EmbeddedCodeEditorWidget}`;
    }
    restore() {
        const raw = this._service.get(this._key, 0 /* StorageScope.PROFILE */) ?? '';
        try {
            const obj = JSON.parse(raw);
            if (dom.Dimension.is(obj)) {
                return dom.Dimension.lift(obj);
            }
        }
        catch {
            // ignore
        }
        return undefined;
    }
    store(size) {
        this._service.store(this._key, JSON.stringify(size), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
    reset() {
        this._service.remove(this._key, 0 /* StorageScope.PROFILE */);
    }
}
let SuggestWidget = class SuggestWidget {
    static { SuggestWidget_1 = this; }
    static { this.LOADING_MESSAGE = nls.localize('suggestWidget.loading', "Loading..."); }
    static { this.NO_SUGGESTIONS_MESSAGE = nls.localize('suggestWidget.noSuggestions', "No suggestions."); }
    constructor(editor, _storageService, _contextKeyService, _themeService, instantiationService) {
        this.editor = editor;
        this._storageService = _storageService;
        this._state = 0 /* State.Hidden */;
        this._isAuto = false;
        this._pendingLayout = new MutableDisposable();
        this._pendingShowDetails = new MutableDisposable();
        this._ignoreFocusEvents = false;
        this._forceRenderingAbove = false;
        this._explainMode = false;
        this._showTimeout = new TimeoutTimer();
        this._disposables = new DisposableStore();
        this._onDidSelect = new PauseableEmitter();
        this._onDidFocus = new PauseableEmitter();
        this._onDidHide = new Emitter();
        this._onDidShow = new Emitter();
        this.onDidSelect = this._onDidSelect.event;
        this.onDidFocus = this._onDidFocus.event;
        this.onDidHide = this._onDidHide.event;
        this.onDidShow = this._onDidShow.event;
        this._onDetailsKeydown = new Emitter();
        this.onDetailsKeyDown = this._onDetailsKeydown.event;
        this.element = new ResizableHTMLElement();
        this.element.domNode.classList.add('editor-widget', 'suggest-widget');
        this._contentWidget = new SuggestContentWidget(this, editor);
        this._persistedSize = new PersistedWidgetSize(_storageService, editor);
        class ResizeState {
            constructor(persistedSize, currentSize, persistHeight = false, persistWidth = false) {
                this.persistedSize = persistedSize;
                this.currentSize = currentSize;
                this.persistHeight = persistHeight;
                this.persistWidth = persistWidth;
            }
        }
        let state;
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
        const applyIconStyle = () => this.element.domNode.classList.toggle('no-icons', !this.editor.getOption(134 /* EditorOption.suggest */).showIcons);
        applyIconStyle();
        const renderer = instantiationService.createInstance(ItemRenderer, this.editor);
        this._disposables.add(renderer);
        this._disposables.add(renderer.onDidToggleDetails(() => this.toggleDetails()));
        this._list = new List('SuggestWidget', this._listElement, {
            getHeight: (_element) => this.getLayoutInfo().itemHeight,
            getTemplateId: (_element) => 'suggestion'
        }, [renderer], {
            alwaysConsumeMouseWheel: true,
            useShadows: false,
            mouseSupport: false,
            multipleSelectionSupport: false,
            accessibilityProvider: {
                getRole: () => isWindows ? 'listitem' : 'option',
                getWidgetAriaLabel: () => nls.localize('suggest', "Suggest"),
                getWidgetRole: () => 'listbox',
                getAriaLabel: (item) => {
                    let label = item.textLabel;
                    const kindLabel = CompletionItemKinds.toLabel(item.completion.kind);
                    if (typeof item.completion.label !== 'string') {
                        const { detail, description } = item.completion.label;
                        if (detail && description) {
                            label = nls.localize('label.full', '{0} {1}, {2}, {3}', label, detail, description, kindLabel);
                        }
                        else if (detail) {
                            label = nls.localize('label.detail', '{0} {1}, {2}', label, detail, kindLabel);
                        }
                        else if (description) {
                            label = nls.localize('label.desc', '{0}, {1}, {2}', label, description, kindLabel);
                        }
                    }
                    else {
                        label = nls.localize('label', '{0}, {1}', label, kindLabel);
                    }
                    if (!item.isResolved || !this._isDetailsVisible()) {
                        return label;
                    }
                    const { documentation, detail } = item.completion;
                    const docs = strings.format('{0}{1}', detail || '', documentation ? (typeof documentation === 'string' ? documentation : documentation.value) : '');
                    return nls.localize('ariaCurrenttSuggestionReadDetails', "{0}, docs: {1}", label, docs);
                },
            }
        });
        this._list.style(getListStyles({
            listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
            listInactiveFocusOutline: activeContrastBorder
        }));
        this._status = instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode, suggestWidgetStatusbarMenu, undefined);
        const applyStatusBarStyle = () => this.element.domNode.classList.toggle('with-status-bar', this.editor.getOption(134 /* EditorOption.suggest */).showStatusBar);
        applyStatusBarStyle();
        this._disposables.add(this._list.onMouseDown(e => this._onListMouseDownOrTap(e)));
        this._disposables.add(this._list.onTap(e => this._onListMouseDownOrTap(e)));
        this._disposables.add(this._list.onDidChangeSelection(e => this._onListSelection(e)));
        this._disposables.add(this._list.onDidChangeFocus(e => this._onListFocus(e)));
        this._disposables.add(this.editor.onDidChangeCursorSelection(() => this._onCursorSelectionChanged()));
        this._disposables.add(this.editor.onDidChangeConfiguration(e => {
            if (e.hasChanged(134 /* EditorOption.suggest */)) {
                applyStatusBarStyle();
                applyIconStyle();
            }
            if (this._completionModel && (e.hasChanged(59 /* EditorOption.fontInfo */) || e.hasChanged(135 /* EditorOption.suggestFontSize */) || e.hasChanged(136 /* EditorOption.suggestLineHeight */))) {
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
        this._disposables.add(this.editor.onMouseDown((e) => this._onEditorMouseDown(e)));
    }
    dispose() {
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
        this._onDidSelect.dispose();
        this._onDidFocus.dispose();
        this._onDidHide.dispose();
        this._onDidShow.dispose();
        this._onDetailsKeydown.dispose();
    }
    _onEditorMouseDown(mouseEvent) {
        if (this._details.widget.domNode.contains(mouseEvent.target.element)) {
            // Clicking inside details
            this._details.widget.domNode.focus();
        }
        else {
            // Clicking outside details and inside suggest
            if (this.element.domNode.contains(mouseEvent.target.element)) {
                this.editor.focus();
            }
        }
    }
    _onCursorSelectionChanged() {
        if (this._state !== 0 /* State.Hidden */) {
            this._contentWidget.layout();
        }
    }
    _onListMouseDownOrTap(e) {
        if (typeof e.element === 'undefined' || typeof e.index === 'undefined') {
            return;
        }
        // prevent stealing browser focus from the editor
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
            this.editor.focus();
        }
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
            this._currentSuggestionDetails = createCancelablePromise(async (token) => {
                const loading = disposableTimeout(() => {
                    if (this._isDetailsVisible()) {
                        this._showDetails(true, false);
                    }
                }, 250);
                const sub = token.onCancellationRequested(() => loading.dispose());
                try {
                    return await item.resolve(token);
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
                this.editor.setAriaOptions({ activeDescendant: this._list.getElementID(index) });
            }).catch(onUnexpectedError);
        }
        // emit an event
        this._onDidFocus.fire({ item, index, model: this._completionModel });
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
            case 1 /* State.Loading */:
                this.element.domNode.classList.add('message');
                this._messageElement.textContent = SuggestWidget_1.LOADING_MESSAGE;
                dom.hide(this._listElement, this._status.element);
                dom.show(this._messageElement);
                this._details.hide();
                this._show();
                this._focusedItem = undefined;
                status(SuggestWidget_1.LOADING_MESSAGE);
                break;
            case 2 /* State.Empty */:
                this.element.domNode.classList.add('message');
                this._messageElement.textContent = SuggestWidget_1.NO_SUGGESTIONS_MESSAGE;
                dom.hide(this._listElement, this._status.element);
                dom.show(this._messageElement);
                this._details.hide();
                this._show();
                this._focusedItem = undefined;
                status(SuggestWidget_1.NO_SUGGESTIONS_MESSAGE);
                break;
            case 3 /* State.Open */:
                dom.hide(this._messageElement);
                dom.show(this._listElement, this._status.element);
                this._show();
                break;
            case 4 /* State.Frozen */:
                dom.hide(this._messageElement);
                dom.show(this._listElement, this._status.element);
                this._show();
                break;
            case 5 /* State.Details */:
                dom.hide(this._messageElement);
                dom.show(this._listElement, this._status.element);
                this._details.show();
                this._show();
                this._details.widget.focus();
                break;
        }
    }
    _show() {
        this._status.show();
        this._contentWidget.show();
        this._layout(this._persistedSize.restore());
        this._ctxSuggestWidgetVisible.set(true);
        this._showTimeout.cancelAndSet(() => {
            this.element.domNode.classList.add('visible');
            this._onDidShow.fire(this);
        }, 100);
    }
    showTriggered(auto, delay) {
        if (this._state !== 0 /* State.Hidden */) {
            return;
        }
        this._contentWidget.setPosition(this.editor.getPosition());
        this._isAuto = !!auto;
        if (!this._isAuto) {
            this._loadingTimeout = disposableTimeout(() => this._setState(1 /* State.Loading */), delay);
        }
    }
    showSuggestions(completionModel, selectionIndex, isFrozen, isAuto, noFocus) {
        this._contentWidget.setPosition(this.editor.getPosition());
        this._loadingTimeout?.dispose();
        this._currentSuggestionDetails?.cancel();
        this._currentSuggestionDetails = undefined;
        if (this._completionModel !== completionModel) {
            this._completionModel = completionModel;
        }
        if (isFrozen && this._state !== 2 /* State.Empty */ && this._state !== 0 /* State.Hidden */) {
            this._setState(4 /* State.Frozen */);
            return;
        }
        const visibleCount = this._completionModel.items.length;
        const isEmpty = visibleCount === 0;
        this._ctxSuggestWidgetMultipleSuggestions.set(visibleCount > 1);
        if (isEmpty) {
            this._setState(isAuto ? 0 /* State.Hidden */ : 2 /* State.Empty */);
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
            this._setState(isFrozen ? 4 /* State.Frozen */ : 3 /* State.Open */);
            this._list.reveal(selectionIndex, 0, selectionIndex === 0 ? 0 : this.getLayoutInfo().itemHeight * 0.33);
            this._list.setFocus(noFocus ? [] : [selectionIndex]);
        }
        finally {
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
    focusSelected() {
        if (this._list.length > 0) {
            this._list.setFocus([0]);
        }
    }
    selectNextPage() {
        switch (this._state) {
            case 0 /* State.Hidden */:
                return false;
            case 5 /* State.Details */:
                this._details.widget.pageDown();
                return true;
            case 1 /* State.Loading */:
                return !this._isAuto;
            default:
                this._list.focusNextPage();
                return true;
        }
    }
    selectNext() {
        switch (this._state) {
            case 0 /* State.Hidden */:
                return false;
            case 1 /* State.Loading */:
                return !this._isAuto;
            default:
                this._list.focusNext(1, true);
                return true;
        }
    }
    selectLast() {
        switch (this._state) {
            case 0 /* State.Hidden */:
                return false;
            case 5 /* State.Details */:
                this._details.widget.scrollBottom();
                return true;
            case 1 /* State.Loading */:
                return !this._isAuto;
            default:
                this._list.focusLast();
                return true;
        }
    }
    selectPreviousPage() {
        switch (this._state) {
            case 0 /* State.Hidden */:
                return false;
            case 5 /* State.Details */:
                this._details.widget.pageUp();
                return true;
            case 1 /* State.Loading */:
                return !this._isAuto;
            default:
                this._list.focusPreviousPage();
                return true;
        }
    }
    selectPrevious() {
        switch (this._state) {
            case 0 /* State.Hidden */:
                return false;
            case 1 /* State.Loading */:
                return !this._isAuto;
            default:
                this._list.focusPrevious(1, true);
                return false;
        }
    }
    selectFirst() {
        switch (this._state) {
            case 0 /* State.Hidden */:
                return false;
            case 5 /* State.Details */:
                this._details.widget.scrollTop();
                return true;
            case 1 /* State.Loading */:
                return !this._isAuto;
            default:
                this._list.focusFirst();
                return true;
        }
    }
    getFocusedItem() {
        if (this._state !== 0 /* State.Hidden */
            && this._state !== 2 /* State.Empty */
            && this._state !== 1 /* State.Loading */
            && this._completionModel
            && this._list.getFocus().length > 0) {
            return {
                item: this._list.getFocusedElements()[0],
                index: this._list.getFocus()[0],
                model: this._completionModel
            };
        }
        return undefined;
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
            this._ctxSuggestWidgetDetailsVisible.set(false);
            this._setDetailsVisible(false);
            this._details.hide();
            this.element.domNode.classList.remove('shows-details');
        }
        else if ((canExpandCompletionItem(this._list.getFocusedElements()[0]) || this._explainMode) && (this._state === 3 /* State.Open */ || this._state === 5 /* State.Details */ || this._state === 4 /* State.Frozen */)) {
            // show details widget (iff possible)
            this._ctxSuggestWidgetDetailsVisible.set(true);
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
                this.editor.focus();
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
    resetPersistedSize() {
        this._persistedSize.reset();
    }
    hideWidget() {
        this._pendingLayout.clear();
        this._pendingShowDetails.clear();
        this._loadingTimeout?.dispose();
        this._setState(0 /* State.Hidden */);
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
    isFrozen() {
        return this._state === 4 /* State.Frozen */;
    }
    _afterRender(position) {
        if (position === null) {
            if (this._isDetailsVisible()) {
                this._details.hide(); //todo@jrieken soft-hide
            }
            return;
        }
        if (this._state === 2 /* State.Empty */ || this._state === 1 /* State.Loading */) {
            // no special positioning when widget isn't showing list
            return;
        }
        if (this._isDetailsVisible() && !this._details.widget.isEmpty) {
            this._details.show();
        }
        this._positionDetails();
    }
    _layout(size) {
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
        if (this._state === 2 /* State.Empty */ || this._state === 1 /* State.Loading */) {
            // showing a message only
            height = info.itemHeight + info.borderHeight;
            width = info.defaultSize.width / 2;
            this.element.enableSashes(false, false, false, false);
            this.element.minSize = this.element.maxSize = new dom.Dimension(width, height);
            this._contentWidget.setPreference(2 /* ContentWidgetPositionPreference.BELOW */);
        }
        else {
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
                this._contentWidget.setPreference(1 /* ContentWidgetPositionPreference.ABOVE */);
                this.element.enableSashes(true, true, false, false);
                maxHeight = maxHeightAbove;
            }
            else {
                this._contentWidget.setPreference(2 /* ContentWidgetPositionPreference.BELOW */);
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
    _resize(width, height) {
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
    _positionDetails() {
        if (this._isDetailsVisible()) {
            this._details.placeAtAnchor(this.element.domNode, this._contentWidget.getPosition()?.preference[0] === 2 /* ContentWidgetPositionPreference.BELOW */);
        }
    }
    getLayoutInfo() {
        const fontInfo = this.editor.getOption(59 /* EditorOption.fontInfo */);
        const itemHeight = clamp(this.editor.getOption(136 /* EditorOption.suggestLineHeight */) || fontInfo.lineHeight, 8, 1000);
        const statusBarHeight = !this.editor.getOption(134 /* EditorOption.suggest */).showStatusBar || this._state === 2 /* State.Empty */ || this._state === 1 /* State.Loading */ ? 0 : itemHeight;
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
SuggestWidget = SuggestWidget_1 = __decorate([
    __param(1, IStorageService),
    __param(2, IContextKeyService),
    __param(3, IThemeService),
    __param(4, IInstantiationService)
], SuggestWidget);
export { SuggestWidget };
export class SuggestContentWidget {
    constructor(_widget, _editor) {
        this._widget = _widget;
        this._editor = _editor;
        this.allowEditorOverflow = true;
        this.suppressMouseDown = false;
        this._preferenceLocked = false;
        this._added = false;
        this._hidden = false;
    }
    dispose() {
        if (this._added) {
            this._added = false;
            this._editor.removeContentWidget(this);
        }
    }
    getId() {
        return 'editor.widget.suggestWidget';
    }
    getDomNode() {
        return this._widget.element.domNode;
    }
    show() {
        this._hidden = false;
        if (!this._added) {
            this._added = true;
            this._editor.addContentWidget(this);
        }
    }
    hide() {
        if (!this._hidden) {
            this._hidden = true;
            this.layout();
        }
    }
    layout() {
        this._editor.layoutContentWidget(this);
    }
    getPosition() {
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
    afterRender(position) {
        this._widget._afterRender(position);
    }
    setPreference(preference) {
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
    setPosition(position) {
        this._position = position;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdFdpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0V2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBRXZELE9BQU8sdURBQXVELENBQUMsQ0FBQyxnRUFBZ0U7QUFFaEksT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RFLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDL0gsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBUyxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxlQUFlLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0QsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLHFCQUFxQixDQUFDO0FBRTdCLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBRzFHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9ELE9BQU8sMENBQTBDLENBQUMsQ0FBQyw4RUFBOEU7QUFDakksT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FB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