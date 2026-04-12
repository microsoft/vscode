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
import './media/inlineChatOverlayWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { renderAsPlaintext, renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, observableFromEvent, observableFromEventOpts, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatEditingAcceptRejectActionViewItem } from '../../chat/browser/chatEditing/chatEditingEditorOverlay.js';
import { CTX_INLINE_CHAT_INPUT_HAS_TEXT, CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED } from '../common/inlineChat.js';
import { StickyScrollController } from '../../../../editor/contrib/stickyScroll/browser/stickyScrollController.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { PlaceholderTextContribution } from '../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { assertType } from '../../../../base/common/types.js';
import { IInlineChatHistoryService } from './inlineChatHistoryService.js';
/**
 * Overlay widget that displays a vertical action bar menu.
 */
let InlineChatInputWidget = class InlineChatInputWidget extends Disposable {
    constructor(_editorObs, _contextKeyService, _menuService, instantiationService, modelService, configurationService, _historyService) {
        super();
        this._editorObs = _editorObs;
        this._contextKeyService = _contextKeyService;
        this._menuService = _menuService;
        this._historyService = _historyService;
        this._position = observableValue(this, null);
        this.position = this._position;
        this._showStore = this._store.add(new DisposableStore());
        this._anchorLineNumber = 0;
        this._anchorLeft = 0;
        this._anchorAbove = false;
        // Create container
        this._domNode = dom.$('.inline-chat-gutter-menu');
        // Create inner container (background + focus border)
        this._container = dom.append(this._domNode, dom.$('.inline-chat-gutter-container'));
        // Create input editor container
        this._inputContainer = dom.append(this._container, dom.$('.input'));
        // Create toolbar container
        this._toolbarContainer = dom.append(this._container, dom.$('.toolbar'));
        // Create vertical actions bar below the input container
        const actionsContainer = dom.append(this._domNode, dom.$('.inline-chat-gutter-actions'));
        const actionBar = this._store.add(new ActionBar(actionsContainer, {
            orientation: 1 /* ActionsOrientation.VERTICAL */,
            preventLoopNavigation: true,
        }));
        const actionsMenu = this._store.add(this._menuService.createMenu(MenuId.ChatEditorInlineMenu, this._contextKeyService));
        const updateActions = () => {
            const actions = getFlatActionBarActions(actionsMenu.getActions({ shouldForwardArgs: true }));
            actionBar.clear();
            actionBar.push(actions);
            dom.setVisibility(actions.length > 0, actionsContainer);
        };
        this._store.add(actionsMenu.onDidChange(updateActions));
        updateActions();
        // Create editor options
        const options = getSimpleEditorOptions(configurationService);
        options.wordWrap = 'off';
        options.wrappingStrategy = 'advanced';
        options.lineNumbers = 'off';
        options.glyphMargin = false;
        options.lineDecorationsWidth = 0;
        options.lineNumbersMinChars = 0;
        options.folding = false;
        options.minimap = { enabled: false };
        options.scrollbar = { vertical: 'hidden', horizontal: 'hidden', alwaysConsumeMouseWheel: true };
        options.renderLineHighlight = 'none';
        options.fontFamily = DEFAULT_FONT_FAMILY;
        options.fontSize = 13;
        options.lineHeight = 20;
        options.cursorWidth = 1;
        options.padding = { top: 2, bottom: 2 };
        const codeEditorWidgetOptions = {
            isSimpleWidget: true,
            contributions: EditorExtensionsRegistry.getSomeEditorContributions([
                PlaceholderTextContribution.ID,
            ])
        };
        this._input = this._store.add(instantiationService.createInstance(CodeEditorWidget, this._inputContainer, options, codeEditorWidgetOptions));
        const model = this._store.add(modelService.createModel('', null, URI.parse(`gutter-input:${Date.now()}`), true));
        this._input.setModel(model);
        // Create toolbar
        const toolbar = this._store.add(instantiationService.createInstance(MenuWorkbenchToolBar, this._toolbarContainer, MenuId.InlineChatInput, {
            telemetrySource: 'inlineChatInput.toolbar',
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            toolbarOptions: {
                primaryGroup: () => true,
            },
            menuOptions: { shouldForwardArgs: true },
        }));
        // Initialize sticky scroll height observable
        const stickyScrollController = StickyScrollController.get(this._editorObs.editor);
        this._stickyScrollHeight = stickyScrollController ? observableFromEvent(stickyScrollController.onDidChangeStickyScrollHeight, () => stickyScrollController.stickyScrollWidgetHeight) : constObservable(0);
        // Track toolbar width changes
        const toolbarWidth = observableValue(this, 0);
        const resizeObserver = new dom.DisposableResizeObserver(() => {
            toolbarWidth.set(dom.getTotalWidth(toolbar.getElement()), undefined);
        });
        this._store.add(resizeObserver);
        this._store.add(resizeObserver.observe(toolbar.getElement()));
        const contentWidth = observableFromEvent(this, this._input.onDidChangeModelContent, () => this._input.getContentWidth());
        const contentHeight = observableFromEvent(this, this._input.onDidContentSizeChange, () => this._input.getContentHeight());
        this._layoutData = derived(r => {
            const editorPad = 6;
            const totalWidth = contentWidth.read(r) + editorPad + toolbarWidth.read(r);
            const minWidth = 220;
            const maxWidth = 600;
            const midWidth = Math.round(maxWidth / 1.618);
            let clampedWidth;
            if (this._input.getOption(149 /* EditorOption.wordWrap */) === 'on') {
                clampedWidth = maxWidth;
            }
            else if (totalWidth <= minWidth) {
                clampedWidth = minWidth;
            }
            else if (totalWidth <= midWidth) {
                clampedWidth = midWidth;
            }
            else {
                clampedWidth = maxWidth;
            }
            const lineHeight = this._input.getOption(75 /* EditorOption.lineHeight */);
            const clampedHeight = Math.min(contentHeight.read(r), (3 * lineHeight));
            if (totalWidth > clampedWidth) {
                // enable word wrap
                this._input.updateOptions({ wordWrap: 'on', });
            }
            return {
                editorPad,
                toolbarWidth: toolbarWidth.read(r),
                totalWidth: clampedWidth,
                height: clampedHeight
            };
        });
        // Update container width and editor layout when width changes
        this._store.add(autorun(r => {
            const { editorPad, toolbarWidth, totalWidth, height } = this._layoutData.read(r);
            const inputWidth = totalWidth - toolbarWidth - editorPad;
            this._container.style.width = `${totalWidth}px`;
            this._inputContainer.style.width = `${inputWidth}px`;
            this._input.layout({ width: inputWidth, height });
        }));
        // Toggle focus class on the container
        this._store.add(this._input.onDidFocusEditorText(() => this._container.classList.add('focused')));
        this._store.add(this._input.onDidBlurEditorText(() => this._container.classList.remove('focused')));
        // Toggle scroll decoration on the toolbar
        this._store.add(this._input.onDidScrollChange(e => {
            this._toolbarContainer.classList.toggle('fake-scroll-decoration', e.scrollTop > 0);
        }));
        // Track input text for context key and adjust width based on content
        const inputHasText = CTX_INLINE_CHAT_INPUT_HAS_TEXT.bindTo(this._contextKeyService);
        this._store.add(this._input.onDidChangeModelContent(() => {
            inputHasText.set(this._input.getModel().getValue().trim().length > 0);
        }));
        this._store.add(toDisposable(() => inputHasText.reset()));
        // Track focus state
        const inputWidgetFocused = CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED.bindTo(this._contextKeyService);
        this._store.add(this._input.onDidFocusEditorText(() => inputWidgetFocused.set(true)));
        this._store.add(this._input.onDidBlurEditorText(() => inputWidgetFocused.set(false)));
        this._store.add(toDisposable(() => inputWidgetFocused.reset()));
        // Handle key events: ArrowUp/ArrowDown for history navigation and action bar focus
        this._store.add(this._input.onKeyDown(e => {
            if (e.keyCode === 16 /* KeyCode.UpArrow */) {
                const position = this._input.getPosition();
                if (position && position.lineNumber === 1) {
                    this._showPreviousHistoryValue();
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
            else if (e.keyCode === 18 /* KeyCode.DownArrow */) {
                const model = this._input.getModel();
                const position = this._input.getPosition();
                if (position && position.lineNumber === model.getLineCount()) {
                    if (!this._historyService.isAtEnd()) {
                        this._showNextHistoryValue();
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    else if (!actionBar.isEmpty()) {
                        e.preventDefault();
                        e.stopPropagation();
                        actionBar.focus(0);
                    }
                }
            }
        }));
        // ArrowUp on first action bar item moves focus back to input editor
        // Escape on action bar hides the widget
        this._store.add(dom.addDisposableListener(actionBar.domNode, 'keydown', (e) => {
            const event = new StandardKeyboardEvent(e);
            if (event.keyCode === 9 /* KeyCode.Escape */) {
                event.preventDefault();
                event.stopPropagation();
                this.hide();
            }
            else if (event.keyCode === 16 /* KeyCode.UpArrow */) {
                const firstItem = actionBar.viewItems[0];
                if (firstItem?.element && dom.isAncestorOfActiveElement(firstItem.element)) {
                    event.preventDefault();
                    event.stopPropagation();
                    this._input.focus();
                }
            }
        }, true));
        // Track focus - hide when focus leaves
        const focusTracker = this._store.add(dom.trackFocus(this._domNode));
        this._store.add(focusTracker.onDidBlur(() => this.hide()));
    }
    get value() {
        return this._input.getModel().getValue().trim();
    }
    addToHistory(value) {
        this._historyService.addToHistory(value);
    }
    _showPreviousHistoryValue() {
        if (this._historyService.isAtEnd()) {
            this._historyService.replaceLast(this._input.getModel().getValue());
        }
        const value = this._historyService.previousValue();
        if (value !== undefined) {
            this._input.getModel().setValue(value);
        }
    }
    _showNextHistoryValue() {
        if (this._historyService.isAtEnd()) {
            return;
        }
        const value = this._historyService.nextValue();
        if (value !== undefined) {
            this._input.getModel().setValue(value);
        }
    }
    /**
     * Show the widget at the specified line.
     * @param lineNumber The line number to anchor the widget to
     * @param left Left offset relative to editor
     * @param anchorAbove Whether to anchor above the position (widget grows upward)
     */
    show(lineNumber, left, anchorAbove, placeholder, value) {
        this._showStore.clear();
        // Reset history cursor to the end (current uncommitted text)
        this._historyService.resetCursor();
        // Clear input state
        this._input.updateOptions({ wordWrap: 'off', placeholder });
        this._input.getModel().setValue(value ?? '');
        // Store anchor info for scroll updates
        this._anchorLineNumber = lineNumber;
        this._anchorLeft = left;
        this._anchorAbove = anchorAbove;
        // Set initial position
        this._updatePosition();
        // Create overlay widget via observable pattern
        this._showStore.add(this._editorObs.createOverlayWidget({
            domNode: this._domNode,
            position: this._position,
            minContentWidthInPx: constObservable(0),
            allowEditorOverflow: true,
        }));
        // If anchoring above, adjust position after render to account for widget height
        if (anchorAbove) {
            this._updatePosition();
        }
        // Update position on scroll, hide if anchor line is out of view (only when input is empty)
        this._showStore.add(this._editorObs.editor.onDidScrollChange(() => {
            const visibleRanges = this._editorObs.editor.getVisibleRanges();
            const isLineVisible = visibleRanges.some(range => this._anchorLineNumber >= range.startLineNumber && this._anchorLineNumber <= range.endLineNumber);
            const hasContent = !!this._input.getModel().getValue();
            if (!isLineVisible && !hasContent) {
                this.hide();
            }
            else {
                this._updatePosition();
            }
        }));
        // Focus the input editor
        setTimeout(() => {
            this._input.focus();
            if (value) {
                this._input.setSelection(this._input.getModel().getFullModelRange());
            }
        }, 0);
    }
    _updatePosition() {
        const editor = this._editorObs.editor;
        const lineHeight = editor.getOption(75 /* EditorOption.lineHeight */);
        const top = editor.getTopForLineNumber(this._anchorLineNumber) - editor.getScrollTop();
        let adjustedTop = top;
        if (this._anchorAbove) {
            const widgetHeight = this._domNode.offsetHeight;
            adjustedTop = top - widgetHeight;
        }
        else {
            adjustedTop = top + lineHeight;
        }
        // Clamp to viewport bounds when anchor line is out of view
        const stickyScrollHeight = this._stickyScrollHeight.get();
        const layoutInfo = editor.getLayoutInfo();
        const widgetHeight = this._domNode.offsetHeight;
        const minTop = stickyScrollHeight;
        const maxTop = layoutInfo.height - widgetHeight;
        const clampedTop = Math.max(minTop, Math.min(adjustedTop, maxTop));
        const isClamped = clampedTop !== adjustedTop;
        this._domNode.classList.toggle('clamped', isClamped);
        this._position.set({
            preference: { top: clampedTop, left: this._anchorLeft },
            stackOrdinal: 10000,
        }, undefined);
    }
    /**
     * Hide the widget (removes from editor but does not dispose).
     */
    hide() {
        // Focus editor if focus is still within the editor's DOM
        const editorDomNode = this._editorObs.editor.getDomNode();
        if (editorDomNode && dom.isAncestorOfActiveElement(editorDomNode)) {
            this._editorObs.editor.focus();
        }
        this._position.set(null, undefined);
        this._input.getModel().setValue('');
        this._showStore.clear();
    }
};
InlineChatInputWidget = __decorate([
    __param(1, IContextKeyService),
    __param(2, IMenuService),
    __param(3, IInstantiationService),
    __param(4, IModelService),
    __param(5, IConfigurationService),
    __param(6, IInlineChatHistoryService)
], InlineChatInputWidget);
export { InlineChatInputWidget };
/**
 * Overlay widget that displays progress messages during inline chat requests.
 */
let InlineChatSessionOverlayWidget = class InlineChatSessionOverlayWidget extends Disposable {
    constructor(_editorObs, _instaService, _keybindingService, _logService) {
        super();
        this._editorObs = _editorObs;
        this._instaService = _instaService;
        this._keybindingService = _keybindingService;
        this._logService = _logService;
        this._domNode = document.createElement('div');
        this._showStore = this._store.add(new DisposableStore());
        this._position = observableValue(this, null);
        this._minContentWidthInPx = constObservable(0);
        this._domNode.classList.add('inline-chat-session-overlay-widget');
        this._container = document.createElement('div');
        this._domNode.appendChild(this._container);
        this._container.classList.add('inline-chat-session-overlay-container');
        this._markdownContainer = document.createElement('div');
        this._markdownContainer.classList.add('markdown-scroll-container');
        this._markdownMessage = document.createElement('div');
        this._markdownMessage.classList.add('markdown-message');
        this._markdownContainer.appendChild(this._markdownMessage);
        this._markdownScrollable = this._store.add(new DomScrollableElement(this._markdownContainer, {
            consumeMouseWheelIfScrollbarIsNeeded: true,
            horizontal: 2 /* ScrollbarVisibility.Hidden */,
            vertical: 1 /* ScrollbarVisibility.Auto */,
        }));
        this._container.appendChild(this._markdownScrollable.getDomNode());
        this._contentRow = document.createElement('div');
        this._contentRow.classList.add('content-row');
        this._container.appendChild(this._contentRow);
        // Create status node with icon and message
        this._statusNode = document.createElement('div');
        this._statusNode.classList.add('status');
        this._icon = dom.append(this._statusNode, dom.$('span'));
        this._message = dom.append(this._statusNode, dom.$('span.message'));
        this._contentRow.appendChild(this._statusNode);
        // Create toolbar node
        this._toolbarNode = document.createElement('div');
        this._toolbarNode.classList.add('toolbar');
        // Initialize sticky scroll height observable
        const stickyScrollController = StickyScrollController.get(this._editorObs.editor);
        this._stickyScrollHeight = stickyScrollController ? observableFromEvent(stickyScrollController.onDidChangeStickyScrollHeight, () => stickyScrollController.stickyScrollWidgetHeight) : constObservable(0);
    }
    show(session) {
        assertType(this._editorObs.editor.hasModel());
        this._showStore.clear();
        // Derived entry observable for this session
        const entry = derived(r => session.editingSession.readEntry(session.uri, r));
        // Set up status message and icon observable
        const requestMessage = derived(r => {
            const chatModel = session?.chatModel;
            if (!session || !chatModel) {
                return undefined;
            }
            const terminationState = session.terminationState.read(r);
            if (terminationState) {
                return {
                    markdown: terminationState,
                    icon: Codicon.info
                };
            }
            const response = chatModel.lastRequestObs.read(r)?.response;
            if (!response) {
                return { message: localize('working', "Working..."), icon: ThemeIcon.modify(Codicon.loading, 'spin') };
            }
            if (response.isComplete) {
                // Check for errors first
                const result = response.result;
                if (result?.errorDetails) {
                    return {
                        message: localize('error', "Sorry, your request failed"),
                        icon: Codicon.error
                    };
                }
                const changes = entry.read(r)?.changesCount.read(r) ?? 0;
                return {
                    message: changes === 0
                        ? localize('done', "Done")
                        : changes === 1
                            ? localize('done1', "Done, 1 change")
                            : localize('doneN', "Done, {0} changes", changes),
                    icon: Codicon.check
                };
            }
            const pendingConfirmation = response.isPendingConfirmation.read(r);
            if (pendingConfirmation) {
                return {
                    message: localize('needsApproval', "Sorry, but an expected error happened"),
                    icon: Codicon.error
                };
            }
            const lastPart = observableFromEventOpts({ equalsFn: () => false }, response.onDidChange, () => response.response.value)
                .read(r)
                .filter(part => part.kind === 'progressMessage' || part.kind === 'toolInvocation')
                .at(-1);
            if (lastPart?.kind === 'toolInvocation') {
                return { message: lastPart.invocationMessage, icon: ThemeIcon.modify(Codicon.loading, 'spin') };
            }
            else if (lastPart?.kind === 'progressMessage') {
                return { message: lastPart.content, icon: ThemeIcon.modify(Codicon.loading, 'spin') };
            }
            else {
                return { message: localize('working', "Working..."), icon: ThemeIcon.modify(Codicon.loading, 'spin') };
            }
        });
        const markdownStore = this._showStore.add(new DisposableStore());
        this._showStore.add(autorun(r => {
            const value = requestMessage.read(r);
            if (value) {
                if (value.message && value.icon) {
                    this._message.innerText = renderAsPlaintext(value.message);
                    this._icon.className = '';
                    this._icon.classList.add(...ThemeIcon.asClassNameArray(value.icon));
                    this._statusNode.classList.remove('hidden');
                    this._contentRow.classList.remove('status-hidden');
                }
                else {
                    this._message.innerText = '';
                    this._icon.className = '';
                    this._statusNode.classList.add('hidden');
                    this._contentRow.classList.add('status-hidden');
                }
                markdownStore.clear();
                this._markdownMessage.replaceChildren();
                if (value.markdown) {
                    this._markdownScrollable.getDomNode().classList.remove('hidden');
                    const markdown = typeof value.markdown === 'string' ? new MarkdownString(value.markdown) : value.markdown;
                    const rendered = markdownStore.add(renderMarkdown(markdown));
                    this._markdownMessage.appendChild(rendered.element);
                    this._markdownScrollable.scanDomNode();
                }
                else {
                    this._markdownScrollable.getDomNode().classList.add('hidden');
                }
            }
            else {
                this._message.innerText = '';
                this._icon.className = '';
                this._statusNode.classList.add('hidden');
                this._contentRow.classList.add('status-hidden');
                markdownStore.clear();
                this._markdownMessage.replaceChildren();
                this._markdownScrollable.getDomNode().classList.add('hidden');
            }
        }));
        // Log when pending confirmation changes
        this._showStore.add(autorun(r => {
            const response = session.chatModel.lastRequestObs.read(r)?.response;
            const pending = response?.isPendingConfirmation.read(r);
            if (pending) {
                this._logService.info(`[InlineChat] UNEXPECTED approval needed: ${pending.detail ?? 'unknown'}`);
            }
        }));
        // Add toolbar
        this._contentRow.appendChild(this._toolbarNode);
        this._showStore.add(toDisposable(() => this._toolbarNode.remove()));
        const that = this;
        this._showStore.add(this._instaService.createInstance(MenuWorkbenchToolBar, this._toolbarNode, MenuId.ChatEditorInlineExecute, {
            telemetrySource: 'inlineChatProgress.overlayToolbar',
            hiddenItemStrategy: 0 /* HiddenItemStrategy.Ignore */,
            toolbarOptions: {
                primaryGroup: () => true,
                useSeparatorsInPrimaryActions: true
            },
            menuOptions: { renderShortTitle: true },
            actionViewItemProvider: (action, options) => {
                const primaryActions = ['inlineChat2.cancel', 'inlineChat2.keep', 'inlineChat2.rephrase'];
                const labeledActions = primaryActions.concat(['inlineChat2.undo']);
                if (!labeledActions.includes(action.id)) {
                    return undefined; // use default action view item with label
                }
                return new ChatEditingAcceptRejectActionViewItem(action, { ...options, keybinding: undefined }, entry, undefined, that._keybindingService, primaryActions);
            }
        }));
        // Position in top right of editor, below sticky scroll
        const lineHeight = this._editorObs.getOption(75 /* EditorOption.lineHeight */);
        // Track widget width changes
        const widgetWidth = observableValue(this, 0);
        const resizeObserver = new dom.DisposableResizeObserver(() => {
            widgetWidth.set(this._domNode.offsetWidth, undefined);
        });
        this._showStore.add(resizeObserver);
        this._showStore.add(resizeObserver.observe(this._domNode));
        this._showStore.add(autorun(r => {
            const layoutInfo = this._editorObs.layoutInfo.read(r);
            const stickyScrollHeight = this._stickyScrollHeight.read(r);
            const width = widgetWidth.read(r);
            const padding = Math.round(lineHeight.read(r) * 2 / 3);
            // Cap max-width to the editor viewport (content area)
            const maxWidth = Math.min(400, layoutInfo.contentWidth - 2 * padding);
            const maxHeight = Math.min(150, Math.floor(layoutInfo.height / 3));
            this._domNode.style.maxWidth = `${maxWidth}px`;
            this._markdownScrollable.getDomNode().style.maxHeight = `${maxHeight}px`;
            this._markdownContainer.style.maxHeight = `${maxHeight}px`;
            this._markdownScrollable.scanDomNode();
            // Position: top right, below sticky scroll with padding, left of minimap and scrollbar
            const top = stickyScrollHeight + padding;
            const left = layoutInfo.width - width - layoutInfo.verticalScrollbarWidth - layoutInfo.minimap.minimapWidth - padding;
            this._position.set({
                preference: { top, left },
                stackOrdinal: 10000,
            }, undefined);
        }));
        // Create overlay widget
        this._showStore.add(this._editorObs.createOverlayWidget({
            domNode: this._domNode,
            position: this._position,
            minContentWidthInPx: this._minContentWidthInPx,
            allowEditorOverflow: false,
        }));
    }
    hide() {
        this._position.set(null, undefined);
        this._showStore.clear();
    }
};
InlineChatSessionOverlayWidget = __decorate([
    __param(1, IInstantiationService),
    __param(2, IKeybindingService),
    __param(3, ILogService)
], InlineChatSessionOverlayWidget);
export { InlineChatSessionOverlayWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdE92ZXJsYXlXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdE92ZXJsYXlXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxxQ0FBcUMsQ0FBQztBQUM3QyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNqRyxPQUFPLEVBQUUsU0FBUyxFQUFzQixNQUFNLG9EQUFvRCxDQUFDO0FBRW5HLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakcsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFlLG1CQUFtQixFQUFFLHVCQUF1QixFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXRLLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFJckQsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0RBQWdELENB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