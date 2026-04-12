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
import { Dimension, getActiveWindow, trackFocus } from '../../../../../base/browser/dom.js';
import { createCancelablePromise, DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { MicrotaskDelay } from '../../../../../base/common/symbols.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { isCellTextEditOperationArray } from '../../../chat/common/model/chatModel.js';
import { ChatMode } from '../../../chat/common/chatModes.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { InlineChatWidget } from '../../../inlineChat/browser/inlineChatWidget.js';
import { MENU_INLINE_CHAT_WIDGET_SECONDARY } from '../../../inlineChat/common/inlineChat.js';
import { TerminalStickyScrollContribution } from '../../stickyScroll/browser/terminalStickyScrollContribution.js';
import './media/terminalChatWidget.css';
import { MENU_TERMINAL_CHAT_WIDGET_INPUT_SIDE_TOOLBAR, MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatContextKeys } from './terminalChat.js';
var Constants;
(function (Constants) {
    Constants[Constants["HorizontalMargin"] = 10] = "HorizontalMargin";
    Constants[Constants["VerticalMargin"] = 30] = "VerticalMargin";
    /** The right padding of the widget, this should align exactly with that in the editor. */
    Constants[Constants["RightPadding"] = 12] = "RightPadding";
    /** The max allowed height of the widget. */
    Constants[Constants["MaxHeight"] = 480] = "MaxHeight";
    /** The max allowed height of the widget as a percentage of the terminal viewport. */
    Constants[Constants["MaxHeightPercentageOfViewport"] = 0.75] = "MaxHeightPercentageOfViewport";
})(Constants || (Constants = {}));
var Message;
(function (Message) {
    Message[Message["None"] = 0] = "None";
    Message[Message["AcceptSession"] = 1] = "AcceptSession";
    Message[Message["CancelSession"] = 2] = "CancelSession";
    Message[Message["PauseSession"] = 4] = "PauseSession";
    Message[Message["CancelRequest"] = 8] = "CancelRequest";
    Message[Message["CancelInput"] = 16] = "CancelInput";
    Message[Message["AcceptInput"] = 32] = "AcceptInput";
    Message[Message["ReturnInput"] = 64] = "ReturnInput";
})(Message || (Message = {}));
let TerminalChatWidget = class TerminalChatWidget extends Disposable {
    get inlineChatWidget() { return this._inlineChatWidget; }
    get lastResponseContent() {
        return this._lastResponseContent;
    }
    constructor(_terminalElement, _instance, _xterm, contextKeyService, _chatService, _storageService, instantiationService, _chatAgentService, _chatWidgetService) {
        super();
        this._terminalElement = _terminalElement;
        this._instance = _instance;
        this._xterm = _xterm;
        this._chatService = _chatService;
        this._storageService = _storageService;
        this._chatAgentService = _chatAgentService;
        this._chatWidgetService = _chatWidgetService;
        this._onDidHide = this._register(new Emitter());
        this.onDidHide = this._onDidHide.event;
        this._messages = this._store.add(new Emitter());
        this._viewStateStorageKey = 'terminal-inline-chat-view-state';
        this._terminalAgentName = 'terminal';
        this._model = this._register(new MutableDisposable());
        this._sessionDisposables = this._register(new MutableDisposable());
        this._requestInProgress = observableValue(this, false);
        this.requestInProgress = this._requestInProgress;
        this._focusedContextKey = TerminalChatContextKeys.focused.bindTo(contextKeyService);
        this._visibleContextKey = TerminalChatContextKeys.visible.bindTo(contextKeyService);
        this._requestActiveContextKey = TerminalChatContextKeys.requestActive.bindTo(contextKeyService);
        this._responseContainsCodeBlockContextKey = TerminalChatContextKeys.responseContainsCodeBlock.bindTo(contextKeyService);
        this._responseContainsMulitpleCodeBlocksContextKey = TerminalChatContextKeys.responseContainsMultipleCodeBlocks.bindTo(contextKeyService);
        this._container = document.createElement('div');
        this._container.classList.add('terminal-inline-chat');
        this._terminalElement.appendChild(this._container);
        this._inlineChatWidget = instantiationService.createInstance(InlineChatWidget, {
            location: ChatAgentLocation.Terminal,
            resolveData: () => {
                // TODO@meganrogge return something that identifies this terminal
                return undefined;
            }
        }, {
            statusMenuId: {
                menu: MENU_TERMINAL_CHAT_WIDGET_STATUS,
                options: {
                    buttonConfigProvider: action => ({
                        showLabel: action.id !== "workbench.action.terminal.chat.rerunRequest" /* TerminalChatCommandId.RerunRequest */,
                        showIcon: action.id === "workbench.action.terminal.chat.rerunRequest" /* TerminalChatCommandId.RerunRequest */,
                        isSecondary: action.id !== "workbench.action.terminal.chat.runCommand" /* TerminalChatCommandId.RunCommand */ && action.id !== "workbench.action.terminal.chat.runFirstCommand" /* TerminalChatCommandId.RunFirstCommand */
                    })
                }
            },
            secondaryMenuId: MENU_INLINE_CHAT_WIDGET_SECONDARY,
            chatWidgetViewOptions: {
                menus: {
                    telemetrySource: 'terminal-inline-chat',
                    executeToolbar: MenuId.ChatExecute,
                    inputSideToolbar: MENU_TERMINAL_CHAT_WIDGET_INPUT_SIDE_TOOLBAR,
                },
                defaultMode: ChatMode.Ask
            }
        });
        this._register(this._inlineChatWidget.chatWidget.onDidChangeViewModel(() => this._saveViewState()));
        this._register(Event.any(this._inlineChatWidget.onDidChangeHeight, this._instance.onDimensionsChanged, this._inlineChatWidget.chatWidget.onDidChangeContentHeight, Event.fromObservableLight(this._inlineChatWidget.chatWidget.input.selectedLanguageModel), Event.debounce(this._xterm.raw.onCursorMove, () => void 0, MicrotaskDelay))(() => this._relayout()));
        const observer = new ResizeObserver(() => this._relayout());
        observer.observe(this._terminalElement);
        this._register(toDisposable(() => observer.disconnect()));
        this._resetPlaceholder();
        this._container.appendChild(this._inlineChatWidget.domNode);
        this._focusTracker = this._register(trackFocus(this._container));
        this._register(this._focusTracker.onDidFocus(() => this._focusedContextKey.set(true)));
        this._register(this._focusTracker.onDidBlur(() => this._focusedContextKey.set(false)));
        this._register(autorun(r => {
            const isBusy = this._inlineChatWidget.requestInProgress.read(r);
            this._container.classList.toggle('busy', isBusy);
            this._inlineChatWidget.toggleStatus(!!this._inlineChatWidget.responseContent);
            if (isBusy || !this._inlineChatWidget.responseContent) {
                this._responseContainsCodeBlockContextKey.set(false);
                this._responseContainsMulitpleCodeBlocksContextKey.set(false);
            }
            else {
                Promise.all([
                    this._inlineChatWidget.getCodeBlockInfo(0),
                    this._inlineChatWidget.getCodeBlockInfo(1)
                ]).then(([firstCodeBlock, secondCodeBlock]) => {
                    this._responseContainsCodeBlockContextKey.set(!!firstCodeBlock);
                    this._responseContainsMulitpleCodeBlocksContextKey.set(!!secondCodeBlock);
                    this._inlineChatWidget.updateToolbar(true);
                });
            }
        }));
        this.hide();
    }
    _relayout() {
        if (this._dimension) {
            this._doLayout();
        }
    }
    _doLayout() {
        const xtermElement = this._xterm.raw.element;
        if (!xtermElement) {
            return;
        }
        const style = getActiveWindow().getComputedStyle(xtermElement);
        // Calculate width
        const xtermLeftPadding = parseInt(style.paddingLeft);
        const width = xtermElement.clientWidth - xtermLeftPadding - 12 /* Constants.RightPadding */;
        if (width === 0) {
            return;
        }
        // Calculate height
        const terminalViewportHeight = this._getTerminalViewportHeight();
        const widgetAllowedPercentBasedHeight = (terminalViewportHeight ?? 0) * 0.75 /* Constants.MaxHeightPercentageOfViewport */;
        const height = Math.max(Math.min(480 /* Constants.MaxHeight */, this._inlineChatWidget.contentHeight, widgetAllowedPercentBasedHeight), this._inlineChatWidget.minHeight);
        if (height === 0) {
            return;
        }
        // Layout
        this._dimension = new Dimension(width, height);
        this._inlineChatWidget.layout(this._dimension);
        this._inlineChatWidget.domNode.style.paddingLeft = `${xtermLeftPadding}px`;
        this._updateXtermViewportPosition();
    }
    _resetPlaceholder() {
        const defaultAgent = this._chatAgentService.getDefaultAgent(ChatAgentLocation.Terminal);
        this.inlineChatWidget.placeholder = defaultAgent?.description ?? localize('askAboutCommands', 'Ask about commands');
    }
    async reveal() {
        await this._createSession();
        this._doLayout();
        this._container.classList.remove('hide');
        this._visibleContextKey.set(true);
        this._resetPlaceholder();
        this._inlineChatWidget.focus();
        this._instance.scrollToBottom();
    }
    _getTerminalCursorTop() {
        const font = this._instance.xterm?.getFont();
        if (!font?.charHeight) {
            return;
        }
        const terminalWrapperHeight = this._getTerminalViewportHeight() ?? 0;
        const cellHeight = font.charHeight * font.lineHeight;
        const topPadding = terminalWrapperHeight - (this._instance.rows * cellHeight);
        const cursorY = (this._instance.xterm?.raw.buffer.active.cursorY ?? 0) + 1;
        return topPadding + cursorY * cellHeight;
    }
    _updateXtermViewportPosition() {
        const top = this._getTerminalCursorTop();
        if (!top) {
            return;
        }
        this._container.style.top = `${top}px`;
        const terminalViewportHeight = this._getTerminalViewportHeight();
        if (!terminalViewportHeight) {
            return;
        }
        const widgetAllowedPercentBasedHeight = terminalViewportHeight * 0.75 /* Constants.MaxHeightPercentageOfViewport */;
        const height = Math.max(Math.min(480 /* Constants.MaxHeight */, this._inlineChatWidget.contentHeight, widgetAllowedPercentBasedHeight), this._inlineChatWidget.minHeight);
        if (top > terminalViewportHeight - height && terminalViewportHeight - height > 0) {
            this._setTerminalViewportOffset(top - (terminalViewportHeight - height));
        }
        else {
            this._setTerminalViewportOffset(undefined);
        }
    }
    _getTerminalViewportHeight() {
        return this._terminalElement.clientHeight;
    }
    hide() {
        this._container.classList.add('hide');
        this._inlineChatWidget.reset();
        this._resetPlaceholder();
        this._inlineChatWidget.updateToolbar(false);
        this._visibleContextKey.set(false);
        this._inlineChatWidget.value = '';
        this._instance.focus();
        this._setTerminalViewportOffset(undefined);
        this._onDidHide.fire();
    }
    _setTerminalViewportOffset(offset) {
        if (offset === undefined || this._container.classList.contains('hide')) {
            this._terminalElement.style.position = '';
            this._terminalElement.style.bottom = '';
            TerminalStickyScrollContribution.get(this._instance)?.hideUnlock();
        }
        else {
            this._terminalElement.style.position = 'relative';
            this._terminalElement.style.bottom = `${offset}px`;
            TerminalStickyScrollContribution.get(this._instance)?.hideLock();
        }
    }
    focus() {
        this.inlineChatWidget.focus();
    }
    hasFocus() {
        return this._inlineChatWidget.hasFocus();
    }
    setValue(value) {
        this._inlineChatWidget.value = value ?? '';
    }
    async acceptCommand(shouldExecute) {
        const code = await this.inlineChatWidget.getCodeBlockInfo(0);
        if (!code) {
            return;
        }
        const value = code.getValue();
        this._instance.runCommand(value, shouldExecute);
        this.clear();
    }
    get focusTracker() {
        return this._focusTracker;
    }
    async _createSession() {
        this._sessionCtor = createCancelablePromise(async (token) => {
            if (!this._model.value) {
                const modelRef = this._chatService.startNewLocalSession(ChatAgentLocation.Terminal);
                this._model.value = modelRef;
                const model = modelRef.object;
                this._inlineChatWidget.setChatModel(model);
                this._resetPlaceholder();
            }
        });
        this._sessionDisposables.value = toDisposable(() => this._sessionCtor?.cancel());
    }
    _saveViewState() {
        const viewState = this._inlineChatWidget.chatWidget.getViewState();
        if (viewState) {
            this._storageService.store(this._viewStateStorageKey, JSON.stringify(viewState), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }
    }
    clear() {
        this.cancel();
        this._model.clear();
        this._responseContainsCodeBlockContextKey.reset();
        this._requestActiveContextKey.reset();
        this.hide();
        this.setValue(undefined);
    }
    async acceptInput(query, options) {
        if (!this._model.value) {
            await this.reveal();
        }
        this._messages.fire(32 /* Message.AcceptInput */);
        const lastInput = this._inlineChatWidget.value;
        if (!lastInput) {
            return;
        }
        this._activeRequestCts?.cancel();
        this._activeRequestCts = new CancellationTokenSource();
        const store = new DisposableStore();
        this._requestActiveContextKey.set(true);
        const response = await this._inlineChatWidget.chatWidget.acceptInput(lastInput, { isVoiceInput: options?.isVoiceInput });
        this._currentRequestId = response?.requestId;
        const responsePromise = new DeferredPromise();
        try {
            this._requestActiveContextKey.set(true);
            if (response) {
                store.add(response.onDidChange(async () => {
                    if (response.isCanceled) {
                        this._requestActiveContextKey.set(false);
                        responsePromise.complete(undefined);
                        return;
                    }
                    if (response.isComplete) {
                        this._requestActiveContextKey.set(false);
                        this._requestActiveContextKey.set(false);
                        const firstCodeBlock = await this._inlineChatWidget.getCodeBlockInfo(0);
                        const secondCodeBlock = await this._inlineChatWidget.getCodeBlockInfo(1);
                        this._responseContainsCodeBlockContextKey.set(!!firstCodeBlock);
                        this._responseContainsMulitpleCodeBlocksContextKey.set(!!secondCodeBlock);
                        this._inlineChatWidget.updateToolbar(true);
                        responsePromise.complete(response);
                    }
                }));
            }
            await responsePromise.p;
            this._lastResponseContent = response?.response.getMarkdown();
            return response;
        }
        catch {
            this._lastResponseContent = undefined;
            return;
        }
        finally {
            store.dispose();
        }
    }
    cancel() {
        this._sessionCtor?.cancel();
        this._sessionCtor = undefined;
        this._activeRequestCts?.cancel();
        this._requestActiveContextKey.set(false);
        const model = this._inlineChatWidget.getChatModel();
        if (!model?.sessionResource) {
            return;
        }
        void this._chatService.cancelCurrentRequestForSession(model?.sessionResource, 'terminalChat');
    }
    async viewInChat() {
        const widget = await this._chatWidgetService.revealWidget();
        const currentRequest = this._inlineChatWidget.chatWidget.viewModel?.model.getRequests().find(r => r.id === this._currentRequestId);
        if (!widget || !currentRequest?.response) {
            return;
        }
        const message = [];
        for (const item of currentRequest.response.response.value) {
            if (item.kind === 'textEditGroup') {
                for (const group of item.edits) {
                    message.push({
                        kind: 'textEdit',
                        edits: group,
                        uri: item.uri
                    });
                }
            }
            else if (item.kind === 'notebookEditGroup') {
                for (const group of item.edits) {
                    if (isCellTextEditOperationArray(group)) {
                        message.push({
                            kind: 'textEdit',
                            edits: group.map(e => e.edit),
                            uri: group[0].uri
                        });
                    }
                    else {
                        message.push({
                            kind: 'notebookEdit',
                            edits: group,
                            uri: item.uri
                        });
                    }
                }
            }
            else {
                message.push(item);
            }
        }
        this._chatService.addCompleteRequest(widget.viewModel.sessionResource, `@${this._terminalAgentName} ${currentRequest.message.text}`, currentRequest.variableData, currentRequest.attempt, {
            message,
            result: currentRequest.response.result,
            followups: currentRequest.response.followups
        });
        widget.focusResponseItem();
        this.hide();
    }
};
TerminalChatWidget = __decorate([
    __param(3, IContextKeyService),
    __param(4, IChatService),
    __param(5, IStorageService),
    __param(6, IInstantiationService),
    __param(7, IChatAgentService),
    __param(8, IChatWidgetService)
], TerminalChatWidget);
export { TerminalChatWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDaGF0V2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXQvYnJvd3Nlci90ZXJtaW5hbENoYXRXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQWlCLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNHLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsZUFBZSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEgsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwSSxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBb0IsTUFBTSwwQ0FBMEMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMzRSxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMxRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLG1EQUFtRCxDQUFDO0FBQ2pILE9BQU8sRUFBMkIsa0JBQWtCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUM1RixPQUFPLEVB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