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
import './media/agentFeedbackEditorInput.css';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { addStandardDisposableListener, getWindow, ModifierKeyEmitter } from '../../../../base/browser/dom.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { createAgentFeedbackContext, getSessionForResource } from './agentFeedbackEditorUtils.js';
import { localize } from '../../../../nls.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Emitter } from '../../../../base/common/event.js';
class AgentFeedbackInputWidget {
    static { this._ID = 'agentFeedback.inputWidget'; }
    static { this._MIN_WIDTH = 150; }
    static { this._MAX_WIDTH = 400; }
    constructor(_editor) {
        this._editor = _editor;
        this.allowEditorOverflow = false;
        this._position = null;
        this._lineHeight = 0;
        this._onDidTriggerAdd = new Emitter();
        this.onDidTriggerAdd = this._onDidTriggerAdd.event;
        this._onDidTriggerAddAndSubmit = new Emitter();
        this.onDidTriggerAddAndSubmit = this._onDidTriggerAddAndSubmit.event;
        this._isShowingAlt = false;
        this._domNode = document.createElement('div');
        this._domNode.classList.add('agent-feedback-input-widget');
        this._domNode.style.display = 'none';
        this._inputElement = document.createElement('textarea');
        this._inputElement.rows = 1;
        this._inputElement.placeholder = localize('agentFeedback.addFeedback', "Add Feedback");
        this._domNode.appendChild(this._inputElement);
        // Hidden element used to measure text width for auto-growing
        this._measureElement = document.createElement('span');
        this._measureElement.classList.add('agent-feedback-input-measure');
        this._domNode.appendChild(this._measureElement);
        // Action bar with add/submit actions
        const actionsContainer = document.createElement('div');
        actionsContainer.classList.add('agent-feedback-input-actions');
        this._domNode.appendChild(actionsContainer);
        this._addAction = new Action('agentFeedback.add', localize('agentFeedback.add', "Add Feedback (Enter)"), ThemeIcon.asClassName(Codicon.plus), false, () => { this._onDidTriggerAdd.fire(); return Promise.resolve(); });
        this._addAndSubmitAction = new Action('agentFeedback.addAndSubmit', localize('agentFeedback.addAndSubmit', "Add Feedback and Submit (Alt+Enter)"), ThemeIcon.asClassName(Codicon.send), false, () => { this._onDidTriggerAddAndSubmit.fire(); return Promise.resolve(); });
        this._actionBar = new ActionBar(actionsContainer);
        this._actionBar.push(this._addAction, { icon: true, label: false, keybinding: localize('enter', "Enter") });
        // Toggle to alt action when Alt key is held
        const modifierKeyEmitter = ModifierKeyEmitter.getInstance();
        modifierKeyEmitter.event(status => {
            this._updateActionForAlt(status.altKey);
        });
        this._lineHeight = 22;
        this._inputElement.style.lineHeight = `${this._lineHeight}px`;
    }
    _updateActionForAlt(altKey) {
        if (altKey && !this._isShowingAlt) {
            this._isShowingAlt = true;
            this._actionBar.clear();
            this._actionBar.push(this._addAndSubmitAction, { icon: true, label: false, keybinding: localize('altEnter', "Alt+Enter") });
        }
        else if (!altKey && this._isShowingAlt) {
            this._isShowingAlt = false;
            this._actionBar.clear();
            this._actionBar.push(this._addAction, { icon: true, label: false, keybinding: localize('enter', "Enter") });
        }
    }
    getId() {
        return AgentFeedbackInputWidget._ID;
    }
    getDomNode() {
        return this._domNode;
    }
    getPosition() {
        return this._position;
    }
    get inputElement() {
        return this._inputElement;
    }
    setPosition(position) {
        this._position = position;
        this._editor.layoutOverlayWidget(this);
    }
    show() {
        this._domNode.style.display = '';
    }
    hide() {
        this._domNode.style.display = 'none';
    }
    clearInput() {
        this._inputElement.value = '';
        this._updateActionEnabled();
        this._autoSize();
    }
    autoSize() {
        this._autoSize();
    }
    updateActionEnabled() {
        this._updateActionEnabled();
    }
    _updateActionEnabled() {
        const hasText = this._inputElement.value.trim().length > 0;
        this._addAction.enabled = hasText;
        this._addAndSubmitAction.enabled = hasText;
    }
    _autoSize() {
        const text = this._inputElement.value || this._inputElement.placeholder;
        // Measure the text width using the hidden span
        this._measureElement.textContent = text;
        const textWidth = this._measureElement.scrollWidth;
        // Clamp width between min and max
        const width = Math.max(AgentFeedbackInputWidget._MIN_WIDTH, Math.min(textWidth + 10, AgentFeedbackInputWidget._MAX_WIDTH));
        this._inputElement.style.width = `${width}px`;
        // Reset height to auto then expand to fit all content, with a minimum of 1 line
        this._inputElement.style.height = 'auto';
        const newHeight = Math.max(this._inputElement.scrollHeight, this._lineHeight);
        this._inputElement.style.height = `${newHeight}px`;
    }
    dispose() {
        this._actionBar.dispose();
        this._addAction.dispose();
        this._addAndSubmitAction.dispose();
        this._onDidTriggerAdd.dispose();
        this._onDidTriggerAddAndSubmit.dispose();
    }
}
let AgentFeedbackEditorInputContribution = class AgentFeedbackEditorInputContribution extends Disposable {
    static { this.ID = 'agentFeedback.editorInputContribution'; }
    constructor(_editor, _agentFeedbackService, _chatEditingService, _sessionsManagementService, _codeEditorService) {
        super();
        this._editor = _editor;
        this._agentFeedbackService = _agentFeedbackService;
        this._chatEditingService = _chatEditingService;
        this._sessionsManagementService = _sessionsManagementService;
        this._codeEditorService = _codeEditorService;
        this._visible = false;
        this._mouseDown = false;
        this._suppressSelectionChangeOnce = false;
        this._widgetListeners = this._store.add(new DisposableStore());
        this._store.add(this._editor.onDidChangeCursorSelection(() => this._onSelectionChanged()));
        this._store.add(this._editor.onDidChangeModel(() => this._onModelChanged()));
        this._store.add(this._editor.onDidScrollChange(() => {
            if (this._visible) {
                this._updatePosition();
            }
        }));
        this._store.add(this._editor.onMouseDown((e) => {
            if (this._isWidgetTarget(e.event.target)) {
                return;
            }
            this._mouseDown = true;
            this._hide();
        }));
        this._store.add(this._editor.onMouseUp((e) => {
            this._mouseDown = false;
            if (this._isWidgetTarget(e.event.target)) {
                return;
            }
            this._onSelectionChanged();
        }));
        this._store.add(this._editor.onDidBlurEditorWidget(() => {
            if (!this._visible) {
                return;
            }
            // Defer so focus has settled to the new target
            getWindow(this._editor.getDomNode()).setTimeout(() => {
                if (!this._visible) {
                    return;
                }
                if (this._isWidgetTarget(getWindow(this._editor.getDomNode()).document.activeElement)) {
                    return;
                }
                this._hide();
            }, 0);
        }));
        this._store.add(this._editor.onDidFocusEditorText(() => this._onSelectionChanged()));
    }
    _isWidgetTarget(target) {
        return !!this._widget && !!target && this._widget.getDomNode().contains(target);
    }
    _ensureWidget() {
        if (!this._widget) {
            this._widget = new AgentFeedbackInputWidget(this._editor);
            this._store.add(this._widget.onDidTriggerAdd(() => this._addFeedback()));
            this._store.add(this._widget.onDidTriggerAddAndSubmit(() => this._addFeedbackAndSubmit()));
            this._editor.addOverlayWidget(this._widget);
        }
        return this._widget;
    }
    _onModelChanged() {
        this._hide();
        this._suppressSelectionChangeOnce = false;
        this._sessionResource = undefined;
    }
    _onSelectionChanged() {
        if (this._suppressSelectionChangeOnce) {
            this._suppressSelectionChangeOnce = false;
            return;
        }
        if (this._mouseDown || !this._editor.hasTextFocus()) {
            return;
        }
        const selection = this._editor.getSelection();
        if (!selection || (selection.isEmpty() && !this._getDiffHunkForSelection(selection))) {
            this._hide();
            return;
        }
        const model = this._editor.getModel();
        if (!model) {
            this._hide();
            return;
        }
        const sessionResource = getSessionForResource(model.uri, this._chatEditingService, this._sessionsManagementService);
        if (!sessionResource) {
            this._hide();
            return;
        }
        this._sessionResource = sessionResource;
        this._show();
    }
    _show() {
        const widget = this._ensureWidget();
        if (!this._visible) {
            this._visible = true;
            this._registerWidgetListeners(widget);
        }
        widget.clearInput();
        widget.show();
        this._updatePosition();
    }
    _hide() {
        if (!this._visible) {
            return;
        }
        this._visible = false;
        this._widgetListeners.clear();
        if (this._widget) {
            this._widget.hide();
            this._widget.setPosition(null);
            this._widget.clearInput();
        }
    }
    _registerWidgetListeners(widget) {
        this._widgetListeners.clear();
        // Listen for keydown on the editor dom node to detect when the user starts typing
        const editorDomNode = this._editor.getDomNode();
        if (editorDomNode) {
            this._widgetListeners.add(addStandardDisposableListener(editorDomNode, 'keydown', e => {
                if (!this._visible) {
                    return;
                }
                // Only steal focus when the editor text area itself is focused,
                // not when an overlay widget (e.g. find widget) has focus
                if (!this._editor.hasTextFocus()) {
                    return;
                }
                // Don't focus if a modifier key is pressed alone
                if (e.keyCode === 5 /* KeyCode.Ctrl */ || e.keyCode === 4 /* KeyCode.Shift */ || e.keyCode === 6 /* KeyCode.Alt */ || e.keyCode === 57 /* KeyCode.Meta */) {
                    return;
                }
                // Don't capture Escape at this level - let it fall through to the input handler if focused
                if (e.keyCode === 9 /* KeyCode.Escape */) {
                    this._hide();
                    this._editor.focus();
                    return;
                }
                // Ctrl+I / Cmd+I explicitly focuses the feedback input
                if ((e.ctrlKey || e.metaKey) && e.keyCode === 39 /* KeyCode.KeyI */) {
                    e.preventDefault();
                    e.stopPropagation();
                    widget.inputElement.focus();
                    return;
                }
                // Don't focus if any modifier is held (keyboard shortcuts)
                if (e.ctrlKey || e.altKey || e.metaKey) {
                    return;
                }
                // Keep caret/navigation keys in the editor. Only actual typing should move focus.
                if (e.keyCode === 16 /* KeyCode.UpArrow */
                    || e.keyCode === 18 /* KeyCode.DownArrow */
                    || e.keyCode === 15 /* KeyCode.LeftArrow */
                    || e.keyCode === 17 /* KeyCode.RightArrow */) {
                    return;
                }
                // Only auto-focus the input on typing when the document is readonly;
                // when editable the user must click or use Ctrl+I to focus.
                if (!this._editor.getOption(104 /* EditorOption.readOnly */)) {
                    return;
                }
                // If the input is not focused, focus it and let the keystroke go through
                if (getWindow(widget.inputElement).document.activeElement !== widget.inputElement) {
                    widget.inputElement.focus();
                }
            }));
        }
        // Listen for keydown on the input element
        this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, 'keydown', e => {
            if (e.keyCode === 9 /* KeyCode.Escape */) {
                e.preventDefault();
                e.stopPropagation();
                this._hide();
                this._editor.focus();
                return;
            }
            if (e.keyCode === 3 /* KeyCode.Enter */ && e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                this._addFeedbackAndSubmit();
                return;
            }
            if (e.keyCode === 3 /* KeyCode.Enter */) {
                e.preventDefault();
                e.stopPropagation();
                this._addFeedback();
                return;
            }
        }));
        // Stop propagation of input events so the editor doesn't handle them
        this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, 'keypress', e => {
            e.stopPropagation();
        }));
        // Auto-size the textarea as the user types
        this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, 'input', () => {
            widget.autoSize();
            widget.updateActionEnabled();
            this._updatePosition();
        }));
        // Hide when input loses focus to something outside both editor and widget
        this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, 'blur', () => {
            const win = getWindow(widget.inputElement);
            win.setTimeout(() => {
                if (!this._visible) {
                    return;
                }
                if (this._editor.hasWidgetFocus()) {
                    return;
                }
                this._hide();
            }, 0);
        }));
    }
    focusInput() {
        if (this._visible && this._widget) {
            this._widget.inputElement.focus();
        }
    }
    _hideAndRefocusEditor() {
        this._suppressSelectionChangeOnce = true;
        this._hide();
        this._editor.focus();
    }
    _addFeedback() {
        if (!this._widget) {
            return false;
        }
        const text = this._widget.inputElement.value.trim();
        if (!text) {
            return false;
        }
        const selection = this._editor.getSelection();
        const model = this._editor.getModel();
        if (!selection || !model || !this._sessionResource) {
            return false;
        }
        this._agentFeedbackService.addFeedback(this._sessionResource, model.uri, selection, text, undefined, createAgentFeedbackContext(this._editor, this._codeEditorService, model.uri, selection));
        this._hideAndRefocusEditor();
        return true;
    }
    _addFeedbackAndSubmit() {
        if (!this._widget) {
            return;
        }
        const text = this._widget.inputElement.value.trim();
        if (!text) {
            return;
        }
        const selection = this._editor.getSelection();
        const model = this._editor.getModel();
        if (!selection || !model || !this._sessionResource) {
            return;
        }
        const sessionResource = this._sessionResource;
        this._hideAndRefocusEditor();
        this._agentFeedbackService.addFeedbackAndSubmit(sessionResource, model.uri, selection, text, undefined, createAgentFeedbackContext(this._editor, this._codeEditorService, model.uri, selection));
    }
    _getContainingDiffEditor() {
        return this._codeEditorService.listDiffEditors().find(diffEditor => diffEditor.getModifiedEditor() === this._editor || diffEditor.getOriginalEditor() === this._editor);
    }
    _getDiffHunkForSelection(selection) {
        if (!selection.isEmpty()) {
            return undefined;
        }
        const diffEditor = this._getContainingDiffEditor();
        if (!diffEditor) {
            return undefined;
        }
        const diffResult = diffEditor.getDiffComputationResult();
        if (!diffResult) {
            return undefined;
        }
        const position = selection.getStartPosition();
        const lineNumber = position.lineNumber;
        const isModifiedEditor = diffEditor.getModifiedEditor() === this._editor;
        for (const change of diffResult.changes2) {
            const lineRange = isModifiedEditor ? change.modified : change.original;
            if (!lineRange.isEmpty && lineRange.contains(lineNumber)) {
                // Don't show when cursor is at the start or end position of the hunk
                const isAtHunkStart = lineNumber === lineRange.startLineNumber && position.column === 1;
                const lastHunkLine = lineRange.endLineNumberExclusive - 1;
                const model = this._editor.getModel();
                const isAtHunkEnd = model && lineNumber === lastHunkLine && position.column === model.getLineMaxColumn(lastHunkLine);
                if (isAtHunkStart || isAtHunkEnd) {
                    return undefined;
                }
                return {
                    startLineNumber: lineRange.startLineNumber,
                    endLineNumberExclusive: lineRange.endLineNumberExclusive,
                };
            }
        }
        return undefined;
    }
    _updatePosition() {
        if (!this._widget || !this._visible) {
            return;
        }
        const selection = this._editor.getSelection();
        if (!selection) {
            this._hide();
            return;
        }
        const lineHeight = this._editor.getOption(75 /* EditorOption.lineHeight */);
        const layoutInfo = this._editor.getLayoutInfo();
        const widgetDom = this._widget.getDomNode();
        const widgetHeight = widgetDom.offsetHeight || 30;
        const widgetWidth = widgetDom.offsetWidth || 150;
        if (selection.isEmpty()) {
            const diffHunk = this._getDiffHunkForSelection(selection);
            if (!diffHunk) {
                this._hide();
                return;
            }
            const cursorPosition = selection.getStartPosition();
            const scrolledPosition = this._editor.getScrolledVisiblePosition(cursorPosition);
            if (!scrolledPosition) {
                this._widget.setPosition(null);
                return;
            }
            const hunkLineCount = diffHunk.endLineNumberExclusive - diffHunk.startLineNumber;
            const cursorLineOffset = cursorPosition.lineNumber - diffHunk.startLineNumber;
            const topHalfLineCount = Math.ceil(hunkLineCount / 2);
            const top = hunkLineCount < 10
                ? cursorLineOffset < topHalfLineCount
                    ? scrolledPosition.top - (cursorLineOffset * lineHeight) - widgetHeight
                    : scrolledPosition.top + ((diffHunk.endLineNumberExclusive - cursorPosition.lineNumber) * lineHeight)
                : scrolledPosition.top - widgetHeight;
            const left = Math.max(0, Math.min(scrolledPosition.left, layoutInfo.width - widgetWidth));
            this._widget.setPosition({
                preference: {
                    top: Math.max(0, Math.min(top, layoutInfo.height - widgetHeight)),
                    left,
                }
            });
            return;
        }
        const cursorPosition = selection.getDirection() === 0 /* SelectionDirection.LTR */
            ? selection.getEndPosition()
            : selection.getStartPosition();
        const scrolledPosition = this._editor.getScrolledVisiblePosition(cursorPosition);
        if (!scrolledPosition) {
            this._widget.setPosition(null);
            return;
        }
        // Compute vertical position, flipping if out of bounds
        let top;
        if (selection.getDirection() === 0 /* SelectionDirection.LTR */) {
            // Cursor at end (bottom) of selection → prefer below the cursor line
            top = scrolledPosition.top + lineHeight;
            if (top + widgetHeight > layoutInfo.height) {
                // Not enough space below → place above the cursor line
                top = scrolledPosition.top - widgetHeight;
            }
        }
        else {
            // Cursor at start (top) of selection → prefer above the cursor line
            top = scrolledPosition.top - widgetHeight;
            if (top < 0) {
                // Not enough space above → place below the cursor line
                top = scrolledPosition.top + lineHeight;
            }
        }
        // Clamp vertical position within editor bounds
        top = Math.max(0, Math.min(top, layoutInfo.height - widgetHeight));
        // Clamp horizontal position so the widget stays within the editor
        const left = Math.max(0, Math.min(scrolledPosition.left, layoutInfo.width - widgetWidth));
        this._widget.setPosition({ preference: { top, left } });
    }
    dispose() {
        if (this._widget) {
            this._editor.removeOverlayWidget(this._widget);
            this._widget.dispose();
            this._widget = undefined;
        }
        super.dispose();
    }
};
AgentFeedbackEditorInputContribution = __decorate([
    __param(1, IAgentFeedbackService),
    __param(2, IChatEditingService),
    __param(3, ISessionsManagementService),
    __param(4, ICodeEditorService)
], AgentFeedbackEditorInputContribution);
export { AgentFeedbackEditorInputContribution };
registerEditorContribution(AgentFeedbackEditorInputContribution.ID, AgentFeedbackEditorInputContribution, 3 /* EditorContributionInstantiation.Eventually */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRGZWVkYmFja0VkaXRvcklucHV0Q29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvYWdlbnRGZWVkYmFja0VkaXRvcklucHV0Q29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sc0NBQXNDLENBQUM7QUFDOUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUduRixPQUFPLEVBQW1DLDBCQUEwQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDN0gsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFJOUYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLFNBQVMsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRS9HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBQzlHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2xHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDL0UsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7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