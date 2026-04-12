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
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { getBaseLayerHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate2.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { List } from '../../../../base/browser/ui/list/listWidget.js';
import * as arrays from '../../../../base/common/arrays.js';
import { DeferredPromise, raceCancellation } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { assertType, isDefined } from '../../../../base/common/types.js';
import './renameWidget.css';
import * as domFontInfo from '../../../browser/config/domFontInfo.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { NewSymbolNameTag, NewSymbolNameTriggerKind } from '../../../common/languages.js';
import * as nls from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { getListStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { editorWidgetBackground, inputBackground, inputBorder, inputForeground, quickInputListFocusBackground, quickInputListFocusForeground, widgetBorder, widgetShadow } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
/** for debugging */
const _sticky = false;
export const CONTEXT_RENAME_INPUT_VISIBLE = new RawContextKey('renameInputVisible', false, nls.localize('renameInputVisible', "Whether the rename input widget is visible"));
export const CONTEXT_RENAME_INPUT_FOCUSED = new RawContextKey('renameInputFocused', false, nls.localize('renameInputFocused', "Whether the rename input widget is focused"));
let RenameWidget = class RenameWidget {
    constructor(_editor, _acceptKeybindings, _themeService, _keybindingService, contextKeyService, _logService) {
        this._editor = _editor;
        this._acceptKeybindings = _acceptKeybindings;
        this._themeService = _themeService;
        this._keybindingService = _keybindingService;
        this._logService = _logService;
        // implement IContentWidget
        this.allowEditorOverflow = true;
        this._disposables = new DisposableStore();
        this._visibleContextKey = CONTEXT_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);
        this._isEditingRenameCandidate = false;
        this._nRenameSuggestionsInvocations = 0;
        this._hadAutomaticRenameSuggestionsInvocation = false;
        this._candidates = new Set();
        this._beforeFirstInputFieldEditSW = new StopWatch();
        this._inputWithButton = new InputWithButton();
        this._disposables.add(this._inputWithButton);
        this._editor.addContentWidget(this);
        this._disposables.add(this._editor.onDidChangeConfiguration(e => {
            if (e.hasChanged(59 /* EditorOption.fontInfo */)) {
                this._updateFont();
            }
        }));
        this._disposables.add(_themeService.onDidColorThemeChange(this._updateStyles, this));
    }
    dispose() {
        this._disposables.dispose();
        this._editor.removeContentWidget(this);
    }
    getId() {
        return '__renameInputWidget';
    }
    getDomNode() {
        if (!this._domNode) {
            this._domNode = document.createElement('div');
            this._domNode.className = 'monaco-editor rename-box';
            this._domNode.appendChild(this._inputWithButton.domNode);
            this._renameCandidateListView = this._disposables.add(new RenameCandidateListView(this._domNode, {
                fontInfo: this._editor.getOption(59 /* EditorOption.fontInfo */),
                onFocusChange: (newSymbolName) => {
                    this._inputWithButton.input.value = newSymbolName;
                    this._isEditingRenameCandidate = false; // @ulugbekna: reset
                },
                onSelectionChange: () => {
                    this._isEditingRenameCandidate = false; // @ulugbekna: because user picked a rename suggestion
                    this.acceptInput(false); // we don't allow preview with mouse click for now
                }
            }));
            this._disposables.add(this._inputWithButton.onDidInputChange(() => {
                if (this._renameCandidateListView?.focusedCandidate !== undefined) {
                    this._isEditingRenameCandidate = true;
                }
                this._timeBeforeFirstInputFieldEdit ??= this._beforeFirstInputFieldEditSW.elapsed();
                if (this._renameCandidateProvidersCts?.token.isCancellationRequested === false) {
                    this._renameCandidateProvidersCts.cancel();
                }
                this._renameCandidateListView?.clearFocus();
            }));
            this._label = document.createElement('div');
            this._label.className = 'rename-label';
            this._domNode.appendChild(this._label);
            this._updateFont();
            this._updateStyles(this._themeService.getColorTheme());
        }
        return this._domNode;
    }
    _updateStyles(theme) {
        if (!this._domNode) {
            return;
        }
        const widgetShadowColor = theme.getColor(widgetShadow);
        const widgetBorderColor = theme.getColor(widgetBorder);
        this._domNode.style.backgroundColor = String(theme.getColor(editorWidgetBackground) ?? '');
        this._domNode.style.boxShadow = widgetShadowColor ? ` 0 0 8px 2px ${widgetShadowColor}` : '';
        this._domNode.style.border = widgetBorderColor ? `1px solid ${widgetBorderColor}` : '';
        this._domNode.style.color = String(theme.getColor(inputForeground) ?? '');
        const border = theme.getColor(inputBorder);
        this._inputWithButton.domNode.style.backgroundColor = String(theme.getColor(inputBackground) ?? '');
        this._inputWithButton.input.style.backgroundColor = String(theme.getColor(inputBackground) ?? '');
        this._inputWithButton.domNode.style.borderWidth = border ? '1px' : '0px';
        this._inputWithButton.domNode.style.borderStyle = border ? 'solid' : 'none';
        this._inputWithButton.domNode.style.borderColor = border?.toString() ?? 'none';
    }
    _updateFont() {
        if (this._domNode === undefined) {
            return;
        }
        assertType(this._label !== undefined, 'RenameWidget#_updateFont: _label must not be undefined given _domNode is defined');
        this._editor.applyFontInfo(this._inputWithButton.input);
        const fontInfo = this._editor.getOption(59 /* EditorOption.fontInfo */);
        this._label.style.fontSize = `${this._computeLabelFontSize(fontInfo.fontSize)}px`;
    }
    _computeLabelFontSize(editorFontSize) {
        return editorFontSize * 0.8;
    }
    getPosition() {
        if (!this._visible) {
            return null;
        }
        if (!this._editor.hasModel() || // @ulugbekna: shouldn't happen
            !this._editor.getDomNode() // @ulugbekna: can happen during tests based on suggestWidget's similar predicate check
        ) {
            return null;
        }
        const bodyBox = dom.getClientArea(this.getDomNode().ownerDocument.body);
        const editorBox = dom.getDomNodePagePosition(this._editor.getDomNode());
        const cursorBoxTop = this._getTopForPosition();
        this._nPxAvailableAbove = cursorBoxTop + editorBox.top;
        this._nPxAvailableBelow = bodyBox.height - this._nPxAvailableAbove;
        const lineHeight = this._editor.getOption(75 /* EditorOption.lineHeight */);
        const { totalHeight: candidateViewHeight } = RenameCandidateView.getLayoutInfo({ lineHeight });
        const positionPreference = this._nPxAvailableBelow > candidateViewHeight * 6 /* approximate # of candidates to fit in (inclusive of rename input box & rename label) */
            ? [2 /* ContentWidgetPositionPreference.BELOW */, 1 /* ContentWidgetPositionPreference.ABOVE */]
            : [1 /* ContentWidgetPositionPreference.ABOVE */, 2 /* ContentWidgetPositionPreference.BELOW */];
        return {
            position: this._position,
            preference: positionPreference,
        };
    }
    beforeRender() {
        const [accept, preview] = this._acceptKeybindings;
        this._label.innerText = nls.localize({ key: 'label', comment: ['placeholders are keybindings, e.g "F2 to Rename, Shift+F2 to Preview"'] }, "{0} to Rename, {1} to Preview", this._keybindingService.lookupKeybinding(accept)?.getLabel(), this._keybindingService.lookupKeybinding(preview)?.getLabel());
        this._domNode.style.minWidth = `200px`; // to prevent from widening when candidates come in
        return null;
    }
    afterRender(position) {
        // FIXME@ulugbekna: commenting trace log out until we start unmounting the widget from editor properly - https://github.com/microsoft/vscode/issues/226975
        // this._trace('invoking afterRender, position: ', position ? 'not null' : 'null');
        if (position === null) {
            // cancel rename when input widget isn't rendered anymore
            this.cancelInput(true, 'afterRender (because position is null)');
            return;
        }
        if (!this._editor.hasModel() || // shouldn't happen
            !this._editor.getDomNode() // can happen during tests based on suggestWidget's similar predicate check
        ) {
            return;
        }
        assertType(this._renameCandidateListView);
        assertType(this._nPxAvailableAbove !== undefined);
        assertType(this._nPxAvailableBelow !== undefined);
        const inputBoxHeight = dom.getTotalHeight(this._inputWithButton.domNode);
        const labelHeight = dom.getTotalHeight(this._label);
        let totalHeightAvailable;
        if (position === 2 /* ContentWidgetPositionPreference.BELOW */) {
            totalHeightAvailable = this._nPxAvailableBelow;
        }
        else {
            totalHeightAvailable = this._nPxAvailableAbove;
        }
        this._renameCandidateListView.layout({
            height: totalHeightAvailable - labelHeight - inputBoxHeight,
            width: dom.getTotalWidth(this._inputWithButton.domNode),
        });
    }
    acceptInput(wantsPreview) {
        this._trace(`invoking acceptInput`);
        this._currentAcceptInput?.(wantsPreview);
    }
    cancelInput(focusEditor, caller) {
        // this._trace(`invoking cancelInput, caller: ${caller}, _currentCancelInput: ${this._currentAcceptInput ? 'not undefined' : 'undefined'}`);
        this._currentCancelInput?.(focusEditor);
    }
    focusNextRenameSuggestion() {
        if (!this._renameCandidateListView?.focusNext()) {
            this._inputWithButton.input.value = this._currentName;
        }
    }
    focusPreviousRenameSuggestion() {
        if (!this._renameCandidateListView?.focusPrevious()) {
            this._inputWithButton.input.value = this._currentName;
        }
    }
    /**
     * @param requestRenameCandidates is `undefined` when there are no rename suggestion providers
     */
    getInput(where, currentName, supportPreview, requestRenameCandidates, cts) {
        const { start: selectionStart, end: selectionEnd } = this._getSelection(where, currentName);
        this._renameCts = cts;
        const disposeOnDone = new DisposableStore();
        this._nRenameSuggestionsInvocations = 0;
        this._hadAutomaticRenameSuggestionsInvocation = false;
        if (requestRenameCandidates === undefined) {
            this._inputWithButton.button.style.display = 'none';
        }
        else {
            this._inputWithButton.button.style.display = 'flex';
            this._requestRenameCandidatesOnce = requestRenameCandidates;
            this._requestRenameCandidates(currentName, false);
            disposeOnDone.add(dom.addDisposableListener(this._inputWithButton.button, 'click', () => this._requestRenameCandidates(currentName, true)));
            disposeOnDone.add(dom.addDisposableListener(this._inputWithButton.button, dom.EventType.KEY_DOWN, (e) => {
                const keyEvent = new StandardKeyboardEvent(e);
                if (keyEvent.equals(3 /* KeyCode.Enter */) || keyEvent.equals(10 /* KeyCode.Space */)) {
                    keyEvent.stopPropagation();
                    keyEvent.preventDefault();
                    this._requestRenameCandidates(currentName, true);
                }
            }));
        }
        this._isEditingRenameCandidate = false;
        this._domNode.classList.toggle('preview', supportPreview);
        this._position = new Position(where.startLineNumber, where.startColumn);
        this._currentName = currentName;
        this._inputWithButton.input.value = currentName;
        this._inputWithButton.input.setAttribute('selectionStart', selectionStart.toString());
        this._inputWithButton.input.setAttribute('selectionEnd', selectionEnd.toString());
        this._inputWithButton.input.size = Math.max((where.endColumn - where.startColumn) * 1.1, 20); // determines width
        this._beforeFirstInputFieldEditSW.reset();
        disposeOnDone.add(toDisposable(() => {
            this._renameCts = undefined;
            cts.dispose(true);
        })); // @ulugbekna: this may result in `this.cancelInput` being called twice, but it should be safe since we set it to undefined after 1st call
        disposeOnDone.add(toDisposable(() => {
            if (this._renameCandidateProvidersCts !== undefined) {
                this._renameCandidateProvidersCts.dispose(true);
                this._renameCandidateProvidersCts = undefined;
            }
        }));
        disposeOnDone.add(toDisposable(() => this._candidates.clear()));
        const inputResult = new DeferredPromise();
        inputResult.p.finally(() => {
            disposeOnDone.dispose();
            this._hide();
        });
        this._currentCancelInput = (focusEditor) => {
            this._trace('invoking _currentCancelInput');
            this._currentAcceptInput = undefined;
            this._currentCancelInput = undefined;
            // fixme session cleanup
            this._renameCandidateListView?.clearCandidates();
            inputResult.complete(focusEditor);
            return true;
        };
        this._currentAcceptInput = (wantsPreview) => {
            this._trace('invoking _currentAcceptInput');
            assertType(this._renameCandidateListView !== undefined);
            const nRenameSuggestions = this._renameCandidateListView.nCandidates;
            let newName;
            let source;
            const focusedCandidate = this._renameCandidateListView.focusedCandidate;
            if (focusedCandidate !== undefined) {
                this._trace('using new name from renameSuggestion');
                newName = focusedCandidate;
                source = { k: 'renameSuggestion' };
            }
            else {
                this._trace('using new name from inputField');
                newName = this._inputWithButton.input.value;
                source = this._isEditingRenameCandidate ? { k: 'userEditedRenameSuggestion' } : { k: 'inputField' };
            }
            if (newName === currentName || newName.trim().length === 0 /* is just whitespace */) {
                this.cancelInput(true, '_currentAcceptInput (because newName === value || newName.trim().length === 0)');
                return;
            }
            this._currentAcceptInput = undefined;
            this._currentCancelInput = undefined;
            this._renameCandidateListView.clearCandidates();
            // fixme session cleanup
            inputResult.complete({
                newName,
                wantsPreview: supportPreview && wantsPreview,
                stats: {
                    source,
                    nRenameSuggestions,
                    timeBeforeFirstInputFieldEdit: this._timeBeforeFirstInputFieldEdit,
                    nRenameSuggestionsInvocations: this._nRenameSuggestionsInvocations,
                    hadAutomaticRenameSuggestionsInvocation: this._hadAutomaticRenameSuggestionsInvocation,
                }
            });
        };
        disposeOnDone.add(cts.token.onCancellationRequested(() => this.cancelInput(true, 'cts.token.onCancellationRequested')));
        if (!_sticky) {
            disposeOnDone.add(this._editor.onDidBlurEditorWidget(() => this.cancelInput(!this._domNode?.ownerDocument.hasFocus(), 'editor.onDidBlurEditorWidget')));
        }
        this._show();
        return inputResult.p;
    }
    _requestRenameCandidates(currentName, isManuallyTriggered) {
        if (this._requestRenameCandidatesOnce === undefined) {
            return;
        }
        if (this._renameCandidateProvidersCts !== undefined) {
            this._renameCandidateProvidersCts.dispose(true);
        }
        assertType(this._renameCts);
        if (this._inputWithButton.buttonState !== 'stop') {
            this._renameCandidateProvidersCts = new CancellationTokenSource();
            const triggerKind = isManuallyTriggered ? NewSymbolNameTriggerKind.Invoke : NewSymbolNameTriggerKind.Automatic;
            const candidates = this._requestRenameCandidatesOnce(triggerKind, this._renameCandidateProvidersCts.token);
            if (candidates.length === 0) {
                this._inputWithButton.setSparkleButton();
                return;
            }
            if (!isManuallyTriggered) {
                this._hadAutomaticRenameSuggestionsInvocation = true;
            }
            this._nRenameSuggestionsInvocations += 1;
            this._inputWithButton.setStopButton();
            this._updateRenameCandidates(candidates, currentName, this._renameCts.token);
        }
    }
    /**
     * This allows selecting only part of the symbol name in the input field based on the selection in the editor
     */
    _getSelection(where, currentName) {
        assertType(this._editor.hasModel());
        const selection = this._editor.getSelection();
        let start = 0;
        let end = currentName.length;
        if (!Range.isEmpty(selection) && !Range.spansMultipleLines(selection) && Range.containsRange(where, selection)) {
            start = Math.max(0, selection.startColumn - where.startColumn);
            end = Math.min(where.endColumn, selection.endColumn) - where.startColumn;
        }
        return { start, end };
    }
    _show() {
        this._trace('invoking _show');
        this._editor.revealLineInCenterIfOutsideViewport(this._position.lineNumber, 0 /* ScrollType.Smooth */);
        this._visible = true;
        this._visibleContextKey.set(true);
        this._editor.layoutContentWidget(this);
        // TODO@ulugbekna: could this be simply run in `afterRender`?
        setTimeout(() => {
            this._inputWithButton.input.focus();
            this._inputWithButton.input.setSelectionRange(parseInt(this._inputWithButton.input.getAttribute('selectionStart')), parseInt(this._inputWithButton.input.getAttribute('selectionEnd')));
        }, 100);
    }
    async _updateRenameCandidates(candidates, currentName, token) {
        const trace = (...args) => this._trace('_updateRenameCandidates', ...args);
        trace('start');
        const namesListResults = await raceCancellation(Promise.allSettled(candidates), token);
        this._inputWithButton.setSparkleButton();
        if (namesListResults === undefined) {
            trace('returning early - received updateRenameCandidates results - undefined');
            return;
        }
        const newNames = namesListResults.flatMap(namesListResult => namesListResult.status === 'fulfilled' && isDefined(namesListResult.value)
            ? namesListResult.value
            : []);
        trace(`received updateRenameCandidates results - total (unfiltered) ${newNames.length} candidates.`);
        // deduplicate and filter out the current value
        const distinctNames = arrays.distinct(newNames, v => v.newSymbolName);
        trace(`distinct candidates - ${distinctNames.length} candidates.`);
        const validDistinctNames = distinctNames.filter(({ newSymbolName }) => newSymbolName.trim().length > 0 && newSymbolName !== this._inputWithButton.input.value && newSymbolName !== currentName && !this._candidates.has(newSymbolName));
        trace(`valid distinct candidates - ${newNames.length} candidates.`);
        validDistinctNames.forEach(n => this._candidates.add(n.newSymbolName));
        if (validDistinctNames.length < 1) {
            trace('returning early - no valid distinct candidates');
            return;
        }
        // show the candidates
        trace('setting candidates');
        this._renameCandidateListView.setCandidates(validDistinctNames);
        // ask editor to re-layout given that the widget is now of a different size after rendering rename candidates
        trace('asking editor to re-layout');
        this._editor.layoutContentWidget(this);
    }
    _hide() {
        this._trace('invoked _hide');
        this._visible = false;
        this._visibleContextKey.reset();
        this._editor.layoutContentWidget(this);
    }
    _getTopForPosition() {
        const visibleRanges = this._editor.getVisibleRanges();
        let firstLineInViewport;
        if (visibleRanges.length > 0) {
            firstLineInViewport = visibleRanges[0].startLineNumber;
        }
        else {
            this._logService.warn('RenameWidget#_getTopForPosition: this should not happen - visibleRanges is empty');
            firstLineInViewport = Math.max(1, this._position.lineNumber - 5); // @ulugbekna: fallback to current line minus 5
        }
        return this._editor.getTopForLineNumber(this._position.lineNumber) - this._editor.getTopForLineNumber(firstLineInViewport);
    }
    _trace(...args) {
        this._logService.trace('RenameWidget', ...args);
    }
};
RenameWidget = __decorate([
    __param(2, IThemeService),
    __param(3, IKeybindingService),
    __param(4, IContextKeyService),
    __param(5, ILogService)
], RenameWidget);
export { RenameWidget };
class RenameCandidateListView {
    // FIXME@ulugbekna: rewrite using event emitters
    constructor(parent, opts) {
        this._disposables = new DisposableStore();
        this._availableHeight = 0;
        this._minimumWidth = 0;
        this._lineHeight = opts.fontInfo.lineHeight;
        this._typicalHalfwidthCharacterWidth = opts.fontInfo.typicalHalfwidthCharacterWidth;
        this._listContainer = document.createElement('div');
        this._listContainer.className = 'rename-box rename-candidate-list-container';
        parent.appendChild(this._listContainer);
        this._listWidget = RenameCandidateListView._createListWidget(this._listContainer, this._candidateViewHeight, opts.fontInfo);
        this._disposables.add(this._listWidget.onDidChangeFocus(e => {
            if (e.elements.length === 1) {
                opts.onFocusChange(e.elements[0].newSymbolName);
            }
        }, this._disposables));
        this._disposables.add(this._listWidget.onDidChangeSelection(e => {
            if (e.elements.length === 1) {
                opts.onSelectionChange();
            }
        }, this._disposables));
        this._disposables.add(this._listWidget.onDidBlur(e => {
            this._listWidget.setFocus([]);
        }));
        this._listWidget.style(getListStyles({
            listInactiveFocusForeground: quickInputListFocusForeground,
            listInactiveFocusBackground: quickInputListFocusBackground,
        }));
    }
    dispose() {
        this._listWidget.dispose();
        this._disposables.dispose();
    }
    // height - max height allowed by parent element
    layout({ height, width }) {
        this._availableHeight = height;
        this._minimumWidth = width;
    }
    setCandidates(candidates) {
        // insert candidates into list widget
        this._listWidget.splice(0, 0, candidates);
        // adjust list widget layout
        const height = this._pickListHeight(this._listWidget.length);
        const width = this._pickListWidth(candidates);
        this._listWidget.layout(height, width);
        // adjust list container layout
        this._listContainer.style.height = `${height}px`;
        this._listContainer.style.width = `${width}px`;
        aria.status(nls.localize('renameSuggestionsReceivedAria', "Received {0} rename suggestions", candidates.length));
    }
    clearCandidates() {
        this._listContainer.style.height = '0px';
        this._listContainer.style.width = '0px';
        this._listWidget.splice(0, this._listWidget.length, []);
    }
    get nCandidates() {
        return this._listWidget.length;
    }
    get focusedCandidate() {
        if (this._listWidget.length === 0) {
            return;
        }
        const selectedElement = this._listWidget.getSelectedElements()[0];
        if (selectedElement !== undefined) {
            return selectedElement.newSymbolName;
        }
        const focusedElement = this._listWidget.getFocusedElements()[0];
        if (focusedElement !== undefined) {
            return focusedElement.newSymbolName;
        }
        return;
    }
    focusNext() {
        if (this._listWidget.length === 0) {
            return false;
        }
        const focusedIxs = this._listWidget.getFocus();
        if (focusedIxs.length === 0) {
            this._listWidget.focusFirst();
            this._listWidget.reveal(0);
            return true;
        }
        else {
            if (focusedIxs[0] === this._listWidget.length - 1) {
                this._listWidget.setFocus([]);
                this._listWidget.reveal(0); // @ulugbekna: without this, it seems like focused element is obstructed
                return false;
            }
            else {
                this._listWidget.focusNext();
                const focused = this._listWidget.getFocus()[0];
                this._listWidget.reveal(focused);
                return true;
            }
        }
    }
    /**
     * @returns true if focus is moved to previous element
     */
    focusPrevious() {
        if (this._listWidget.length === 0) {
            return false;
        }
        const focusedIxs = this._listWidget.getFocus();
        if (focusedIxs.length === 0) {
            this._listWidget.focusLast();
            const focused = this._listWidget.getFocus()[0];
            this._listWidget.reveal(focused);
            return true;
        }
        else {
            if (focusedIxs[0] === 0) {
                this._listWidget.setFocus([]);
                return false;
            }
            else {
                this._listWidget.focusPrevious();
                const focused = this._listWidget.getFocus()[0];
                this._listWidget.reveal(focused);
                return true;
            }
        }
    }
    clearFocus() {
        this._listWidget.setFocus([]);
    }
    get _candidateViewHeight() {
        const { totalHeight } = RenameCandidateView.getLayoutInfo({ lineHeight: this._lineHeight });
        return totalHeight;
    }
    _pickListHeight(nCandidates) {
        const heightToFitAllCandidates = this._candidateViewHeight * nCandidates;
        const MAX_N_CANDIDATES = 7; // @ulugbekna: max # of candidates we want to show at once
        const height = Math.min(heightToFitAllCandidates, this._availableHeight, this._candidateViewHeight * MAX_N_CANDIDATES);
        return height;
    }
    _pickListWidth(candidates) {
        const longestCandidateWidth = Math.ceil(Math.max(...candidates.map(c => c.newSymbolName.length)) * this._typicalHalfwidthCharacterWidth);
        const width = Math.max(this._minimumWidth, 4 /* padding */ + 16 /* sparkle icon */ + 5 /* margin-left */ + longestCandidateWidth + 10 /* (possibly visible) scrollbar width */ // TODO@ulugbekna: approximate calc - clean this up
        );
        return width;
    }
    static _createListWidget(container, candidateViewHeight, fontInfo) {
        const virtualDelegate = new class {
            getTemplateId(element) {
                return 'candidate';
            }
            getHeight(element) {
                return candidateViewHeight;
            }
        };
        const renderer = new class {
            constructor() {
                this.templateId = 'candidate';
            }
            renderTemplate(container) {
                return new RenameCandidateView(container, fontInfo);
            }
            renderElement(candidate, index, templateData) {
                templateData.populate(candidate);
            }
            disposeTemplate(templateData) {
                templateData.dispose();
            }
        };
        return new List('NewSymbolNameCandidates', container, virtualDelegate, [renderer], {
            keyboardSupport: false, // @ulugbekna: because we handle keyboard events through proper commands & keybinding service, see `rename.ts`
            mouseSupport: true,
            multipleSelectionSupport: false,
        });
    }
}
class InputWithButton {
    constructor() {
        this._buttonHoverContent = '';
        this._disposables = new DisposableStore();
        this._onDidInputChange = this._disposables.add(new Emitter());
        this.onDidInputChange = this._onDidInputChange.event;
    }
    get domNode() {
        if (!this._domNode) {
            this._domNode = document.createElement('div');
            this._domNode.className = 'rename-input-with-button';
            this._domNode.style.display = 'flex';
            this._domNode.style.flexDirection = 'row';
            this._domNode.style.alignItems = 'center';
            this._inputNode = document.createElement('input');
            this._inputNode.className = 'rename-input';
            this._inputNode.type = 'text';
            this._inputNode.style.border = 'none';
            this._inputNode.setAttribute('aria-label', nls.localize('renameAriaLabel', "Rename input. Type new name and press Enter to commit."));
            this._domNode.appendChild(this._inputNode);
            this._buttonNode = document.createElement('div');
            this._buttonNode.className = 'rename-suggestions-button';
            this._buttonNode.setAttribute('tabindex', '0');
            this._buttonGenHoverText = nls.localize('generateRenameSuggestionsButton', "Generate New Name Suggestions");
            this._buttonCancelHoverText = nls.localize('cancelRenameSuggestionsButton', "Cancel");
            this._buttonHoverContent = this._buttonGenHoverText;
            this._disposables.add(getBaseLayerHoverDelegate().setupDelayedHover(this._buttonNode, () => ({
                content: this._buttonHoverContent,
                style: 1 /* HoverStyle.Pointer */,
            })));
            this._domNode.appendChild(this._buttonNode);
            // notify if selection changes to cancel request to rename-suggestion providers
            this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.INPUT, () => this._onDidInputChange.fire()));
            this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.KEY_DOWN, (e) => {
                const keyEvent = new StandardKeyboardEvent(e);
                if (keyEvent.keyCode === 15 /* KeyCode.LeftArrow */ || keyEvent.keyCode === 17 /* KeyCode.RightArrow */) {
                    this._onDidInputChange.fire();
                }
            }));
            this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.CLICK, () => this._onDidInputChange.fire()));
            // focus "container" border instead of input box
            this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.FOCUS, () => {
                this.domNode.style.outlineWidth = '1px';
                this.domNode.style.outlineStyle = 'solid';
                this.domNode.style.outlineOffset = '-1px';
                this.domNode.style.outlineColor = 'var(--vscode-focusBorder)';
            }));
            this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.BLUR, () => {
                this.domNode.style.outline = 'none';
            }));
        }
        return this._domNode;
    }
    get input() {
        assertType(this._inputNode);
        return this._inputNode;
    }
    get button() {
        assertType(this._buttonNode);
        return this._buttonNode;
    }
    get buttonState() {
        return this._buttonState;
    }
    setSparkleButton() {
        this._buttonState = 'sparkle';
        this._sparkleIcon ??= renderIcon(Codicon.sparkle);
        dom.clearNode(this.button);
        this.button.appendChild(this._sparkleIcon);
        this.button.setAttribute('aria-label', 'Generating new name suggestions');
        this._buttonHoverContent = this._buttonGenHoverText;
        this.input.focus();
    }
    setStopButton() {
        this._buttonState = 'stop';
        this._stopIcon ??= renderIcon(Codicon.stopCircle);
        dom.clearNode(this.button);
        this.button.appendChild(this._stopIcon);
        this.button.setAttribute('aria-label', 'Cancel generating new name suggestions');
        this._buttonHoverContent = this._buttonCancelHoverText;
        this.input.focus();
    }
    dispose() {
        this._disposables.dispose();
    }
}
class RenameCandidateView {
    static { this._PADDING = 2; }
    constructor(parent, fontInfo) {
        this._domNode = document.createElement('div');
        this._domNode.className = 'rename-box rename-candidate';
        this._domNode.style.display = `flex`;
        this._domNode.style.columnGap = `5px`;
        this._domNode.style.alignItems = `center`;
        this._domNode.style.height = `${fontInfo.lineHeight}px`;
        this._domNode.style.padding = `${RenameCandidateView._PADDING}px`;
        // @ulugbekna: needed to keep space when the `icon.style.display` is set to `none`
        const iconContainer = document.createElement('div');
        iconContainer.style.display = `flex`;
        iconContainer.style.alignItems = `center`;
        iconContainer.style.width = iconContainer.style.height = `${fontInfo.lineHeight * 0.8}px`;
        this._domNode.appendChild(iconContainer);
        this._icon = renderIcon(Codicon.sparkle);
        this._icon.style.display = `none`;
        iconContainer.appendChild(this._icon);
        this._label = document.createElement('div');
        domFontInfo.applyFontInfo(this._label, fontInfo);
        this._domNode.appendChild(this._label);
        parent.appendChild(this._domNode);
    }
    populate(value) {
        this._updateIcon(value);
        this._updateLabel(value);
    }
    _updateIcon(value) {
        const isAIGenerated = !!value.tags?.includes(NewSymbolNameTag.AIGenerated);
        this._icon.style.display = isAIGenerated ? 'inherit' : 'none';
    }
    _updateLabel(value) {
        this._label.innerText = value.newSymbolName;
    }
    static getLayoutInfo({ lineHeight }) {
        const totalHeight = lineHeight + RenameCandidateView._PADDING * 2 /* top & bottom padding */;
        return { totalHeight };
    }
    dispose() {
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuYW1lV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvcmVuYW1lL2Jyb3dzZXIvcmVuYW1lV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbEYsT0FBTyxLQUFLLElBQUksTUFBTSwwQ0FBMEMsQ0FBQztBQUNqRSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFakYsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RFLE9BQU8sS0FBSyxNQUFNLE1BQU0sbUNBQW1DLENBQUM7QUFDNUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JGLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTNELE9BQU8sRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekUsT0FBTyxvQkFBb0IsQ0FBQztBQUM1QixPQUFPLEtBQUssV0FBVyxNQUFNLHdDQUF3QyxDQUFDO0FBS3RFLE9BQU8s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