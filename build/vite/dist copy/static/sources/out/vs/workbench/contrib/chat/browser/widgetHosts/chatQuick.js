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
var QuickChat_1;
import * as dom from '../../../../../base/browser/dom.js';
import { Sash } from '../../../../../base/browser/ui/sash/sash.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import product from '../../../../../platform/product/common/product.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { editorBackground, inputBackground, quickInputBackground, quickInputForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../common/theme.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { isCellTextEditOperationArray } from '../../common/model/chatModel.js';
import { ChatMode } from '../../common/chatModes.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatWidgetService } from '../chat.js';
import { ChatWidget } from '../widget/chatWidget.js';
let QuickChatService = class QuickChatService extends Disposable {
    get onDidClose() { return this._onDidClose.event; }
    constructor(quickInputService, chatService, instantiationService) {
        super();
        this.quickInputService = quickInputService;
        this.chatService = chatService;
        this.instantiationService = instantiationService;
        this._onDidClose = this._register(new Emitter());
    }
    get enabled() {
        return !!this.chatService.isEnabled(ChatAgentLocation.Chat);
    }
    get focused() {
        const widget = this._input?.widget;
        if (!widget) {
            return false;
        }
        return dom.isAncestorOfActiveElement(widget);
    }
    get sessionResource() {
        return this._input && this._currentChat?.sessionResource;
    }
    toggle(options) {
        // If the input is already shown, hide it. This provides a toggle behavior of the quick
        // pick. This should not happen when there is a query.
        if (this.focused && !options?.query) {
            this.close();
        }
        else {
            this.open(options);
            // If this is a partial query, the value should be cleared when closed as otherwise it
            // would remain for the next time the quick chat is opened in any context.
            if (options?.isPartialQuery) {
                const disposable = this._store.add(Event.once(this.onDidClose)(() => {
                    this._currentChat?.clearValue();
                    this._store.delete(disposable);
                }));
            }
        }
    }
    open(options) {
        if (this._input) {
            if (this._currentChat && options?.query) {
                this._currentChat.focus();
                this._currentChat.setValue(options.query, options.selection);
                if (!options.isPartialQuery) {
                    this._currentChat.acceptInput();
                }
                return;
            }
            return this.focus();
        }
        const disposableStore = new DisposableStore();
        this._input = this.quickInputService.createQuickWidget();
        this._input.contextKey = 'chatInputVisible';
        this._input.ignoreFocusOut = true;
        disposableStore.add(this._input);
        this._container ??= dom.$('.interactive-session');
        this._input.widget = this._container;
        this._input.show();
        if (!this._currentChat) {
            this._currentChat = this.instantiationService.createInstance(QuickChat);
            // show needs to come after the quickpick is shown
            this._currentChat.render(this._container);
        }
        else {
            this._currentChat.show();
        }
        disposableStore.add(this._input.onDidHide(() => {
            disposableStore.dispose();
            this._currentChat.hide();
            this._input = undefined;
            this._onDidClose.fire();
        }));
        this._currentChat.focus();
        if (options?.query) {
            this._currentChat.setValue(options.query, options.selection);
            if (!options.isPartialQuery) {
                this._currentChat.acceptInput();
            }
        }
    }
    focus() {
        this._currentChat?.focus();
    }
    close() {
        this._input?.dispose();
        this._input = undefined;
    }
    async openInChatView() {
        await this._currentChat?.openChatView();
        this.close();
    }
};
QuickChatService = __decorate([
    __param(0, IQuickInputService),
    __param(1, IChatService),
    __param(2, IInstantiationService)
], QuickChatService);
export { QuickChatService };
let QuickChat = class QuickChat extends Disposable {
    static { QuickChat_1 = this; }
    // TODO@TylerLeonhardt: be responsive to window size
    static { this.DEFAULT_MIN_HEIGHT = 200; }
    static { this.DEFAULT_HEIGHT_OFFSET = 100; }
    get sessionResource() {
        return this.modelRef?.object.sessionResource;
    }
    constructor(instantiationService, contextKeyService, chatService, layoutService, chatWidgetService, chatEntitlementService, markdownRendererService) {
        super();
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.chatService = chatService;
        this.layoutService = layoutService;
        this.chatWidgetService = chatWidgetService;
        this.chatEntitlementService = chatEntitlementService;
        this.markdownRendererService = markdownRendererService;
        this.maintainScrollTimer = this._register(new MutableDisposable());
        this._deferUpdatingDynamicLayout = false;
    }
    clear() {
        this.modelRef?.dispose();
        this.modelRef = undefined;
        this.updateModel();
        this.widget.inputEditor.setValue('');
        return Promise.resolve();
    }
    focus(selection) {
        if (this.widget) {
            this.widget.focusInput();
            const value = this.widget.inputEditor.getValue();
            if (value) {
                this.widget.inputEditor.setSelection(selection ?? {
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: 1,
                    endColumn: value.length + 1
                });
            }
        }
    }
    hide() {
        this.widget.setVisible(false);
        // Maintain scroll position for a short time so that if the user re-shows the chat
        // the same scroll position will be used.
        this.maintainScrollTimer.value = disposableTimeout(() => {
            // At this point, clear this mutable disposable which will be our signal that
            // the timer has expired and we should stop maintaining scroll position
            this.maintainScrollTimer.clear();
        }, 30 * 1000); // 30 seconds
    }
    show() {
        this.widget.setVisible(true);
        // If the mutable disposable is set, then we are keeping the existing scroll position
        // so we should not update the layout.
        if (this._deferUpdatingDynamicLayout) {
            this._deferUpdatingDynamicLayout = false;
            this.widget.updateDynamicChatTreeItemLayout(2, this.maxHeight);
        }
        if (!this.maintainScrollTimer.value) {
            this.widget.layoutDynamicChatTreeItemMode();
        }
    }
    render(parent) {
        if (this.widget) {
            // NOTE: if this changes, we need to make sure disposables in this function are tracked differently.
            throw new Error('Cannot render quick chat twice');
        }
        const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([
            IContextKeyService,
            this._register(this.contextKeyService.createScoped(parent))
        ])));
        this.widget = this._register(scopedInstantiationService.createInstance(ChatWidget, ChatAgentLocation.Chat, { isQuickChat: true }, {
            autoScroll: true,
            renderInputOnTop: true,
            renderStyle: 'compact',
            menus: { inputSideToolbar: MenuId.ChatInputSide, telemetrySource: 'chatQuick' },
            enableImplicitContext: true,
            defaultMode: ChatMode.Ask,
            clear: () => this.clear(),
        }, {
            listForeground: quickInputForeground,
            listBackground: quickInputBackground,
            overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
            inputEditorBackground: inputBackground,
            resultEditorBackground: editorBackground
        }));
        this.widget.render(parent);
        this.widget.setVisible(true);
        this.widget.setDynamicChatTreeItemLayout(2, this.maxHeight);
        this.updateModel();
        this.sash = this._register(new Sash(parent, { getHorizontalSashTop: () => parent.offsetHeight }, { orientation: 1 /* Orientation.HORIZONTAL */ }));
        this.setupDisclaimer(parent);
        this.registerListeners(parent);
    }
    setupDisclaimer(parent) {
        const disclaimerElement = dom.append(parent, dom.$('.disclaimer.hidden'));
        const disposables = this._store.add(new DisposableStore());
        this._register(autorun(reader => {
            disposables.clear();
            dom.reset(disclaimerElement);
            const sentiment = this.chatEntitlementService.sentimentObs.read(reader);
            const anonymous = this.chatEntitlementService.anonymousObs.read(reader);
            const requestInProgress = this.chatService.requestInProgressObs.read(reader);
            const showDisclaimer = !sentiment.completed && anonymous && !requestInProgress;
            disclaimerElement.classList.toggle('hidden', !showDisclaimer);
            if (showDisclaimer) {
                const renderedMarkdown = disposables.add(this.markdownRendererService.render(new MarkdownString(localize({ key: 'termsDisclaimer', comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})", product.defaultChatAgent?.provider?.default?.name ?? '', product.defaultChatAgent?.provider?.default?.name ?? '', product.defaultChatAgent?.termsStatementUrl ?? '', product.defaultChatAgent?.privacyStatementUrl ?? ''), { isTrusted: true })));
                disclaimerElement.appendChild(renderedMarkdown.element);
            }
        }));
    }
    get maxHeight() {
        return this.layoutService.mainContainerDimension.height - QuickChat_1.DEFAULT_HEIGHT_OFFSET;
    }
    registerListeners(parent) {
        this._register(this.layoutService.onDidLayoutMainContainer(() => {
            if (this.widget.visible) {
                this.widget.updateDynamicChatTreeItemLayout(2, this.maxHeight);
            }
            else {
                // If the chat is not visible, then we should defer updating the layout
                // because it relies on offsetHeight which only works correctly
                // when the chat is visible.
                this._deferUpdatingDynamicLayout = true;
            }
        }));
        this._register(this.widget.onDidChangeHeight((e) => this.sash.layout()));
        const width = parent.offsetWidth;
        this._register(this.sash.onDidStart(() => {
            this.widget.isDynamicChatTreeItemLayoutEnabled = false;
        }));
        this._register(this.sash.onDidChange((e) => {
            if (e.currentY < QuickChat_1.DEFAULT_MIN_HEIGHT || e.currentY > this.maxHeight) {
                return;
            }
            this.widget.layout(e.currentY, width);
            this.sash.layout();
        }));
        this._register(this.sash.onDidReset(() => {
            this.widget.isDynamicChatTreeItemLayoutEnabled = true;
            this.widget.layoutDynamicChatTreeItemMode();
        }));
    }
    async acceptInput() {
        return this.widget.acceptInput();
    }
    async openChatView() {
        const widget = await this.chatWidgetService.revealWidget();
        const model = this.modelRef?.object;
        if (!widget?.viewModel || !model) {
            return;
        }
        for (const request of model.getRequests()) {
            if (request.response?.response.value || request.response?.result) {
                const message = [];
                for (const item of request.response.response.value) {
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
                this.chatService.addCompleteRequest(widget.viewModel.sessionResource, request.message, request.variableData, request.attempt, {
                    message,
                    result: request.response.result,
                    followups: request.response.followups
                });
            }
            else if (request.message) {
            }
        }
        const value = this.widget.getViewState();
        if (value) {
            widget.viewModel.model.inputModel.setState(value);
        }
        widget.focusInput();
    }
    setValue(value, selection) {
        this.widget.inputEditor.setValue(value);
        this.focus(selection);
    }
    clearValue() {
        this.widget.inputEditor.setValue('');
    }
    updateModel() {
        this.modelRef ??= this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { disableBackgroundKeepAlive: true, debugOwner: 'ChatQuick#updateModel' });
        const model = this.modelRef?.object;
        if (!model) {
            throw new Error('Could not start chat session');
        }
        this.modelRef.object.inputModel.setState({ inputText: '', selections: [] });
        this.widget.setModel(model);
    }
    dispose() {
        this.modelRef?.dispose();
        this.modelRef = undefined;
        super.dispose();
    }
};
QuickChat = QuickChat_1 = __decorate([
    __param(0, IInstantiationService),
    __param(1, IContextKeyService),
    __param(2, IChatService),
    __param(3, IWorkbenchLayoutService),
    __param(4, IChatWidgetService),
    __param(5, IChatEntitlementService),
    __param(6, IMarkdownRendererService)
], QuickChat);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFF1aWNrLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldEhvc3RzL2NoYXRRdWljay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQWUsSUFBSSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDaEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDeEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0SCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFHbkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMzRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN4RyxPQUFPLE9BQU8sTUFBTSxtREFBbUQsQ0FBQztBQUN4RSxPQUFPLEVBQUUsa0JBQWtCLEVBQWdCLE1BQU0seURBQXlELENBQUM7QUFDM0csT0FBTyxFQUFF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