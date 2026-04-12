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
var ChatWidget_1;
import './media/chat.css';
import './media/chatAgentHover.css';
import './media/chatViewWelcome.css';
import * as dom from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { disposableTimeout, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { hash } from '../../../../../base/common/hash.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, MutableDisposable, thenIfNotDisposed } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { filter } from '../../../../../base/common/objects.js';
import { autorun, derived, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { extUri, isEqual } from '../../../../../base/common/resources.js';
import { MicrotaskDelay } from '../../../../../base/common/symbols.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatPerfMark, markChat } from '../../common/chatPerf.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import product from '../../../../../platform/product/common/product.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { checkModeOption } from '../../common/chat.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { applyingChatEditsFailedContextKey, decidedChatEditingResourceContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, inChatEditingSessionContextKey } from '../../common/editing/chatEditingService.js';
import { IChatLayoutService } from '../../common/widget/chatLayoutService.js';
import { ChatMode, getModeNameForTelemetry, IChatModeService } from '../../common/chatModes.js';
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestDynamicVariablePart, ChatRequestSlashPromptPart, ChatRequestToolPart, ChatRequestToolSetPart, chatSubcommandLeader, formatChatQuestion, IParsedChatRequest } from '../../common/requestParser/chatParserTypes.js';
import { ChatRequestParser } from '../../common/requestParser/chatRequestParser.js';
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from '../attachments/chatVariables.js';
import { ChatSendResult, IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { IChatSlashCommandService } from '../../common/participants/chatSlashCommands.js';
import { IChatTodoListService } from '../../common/tools/chatTodoListService.js';
import { isPromptFileVariableEntry, isPromptTextVariableEntry, isWorkspaceVariableEntry, PromptFileVariableKind, toPromptFileVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ChatViewModel, isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, ThinkingDisplayMode } from '../../common/constants.js';
import { ILanguageModelToolsService, isToolSet } from '../../common/tools/languageModelToolsService.js';
import { ComputeAutomaticInstructions } from '../../common/promptSyntax/computeAutomaticInstructions.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, handleModeSwitch } from '../actions/chatActions.js';
import { IChatAccessibilityService, IChatWidgetService, isIChatResourceViewContext, isIChatViewViewContext } from '../chat.js';
import { IChatAttachmentResolveService } from '../attachments/chatAttachmentResolveService.js';
import { ChatDynamicVariableModel } from '../attachments/chatDynamicVariables.js';
import { ChatSuggestNextWidget } from './chatContentParts/chatSuggestNextWidget.js';
import { ChatInputPart } from './input/chatInputPart.js';
import { ChatListWidget } from './chatListWidget.js';
import { ChatEditorOptions } from './chatOptions.js';
import { ChatViewWelcomePart } from '../viewsWelcome/chatViewWelcomeController.js';
import { IChatTipService } from '../chatTipService.js';
import { ChatTipContentPart } from './chatContentParts/chatTipContentPart.js';
import { ChatContentMarkdownRenderer } from './chatContentMarkdownRenderer.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
const $ = dom.$;
export function isQuickChat(widget) {
    return isIChatResourceViewContext(widget.viewContext) && Boolean(widget.viewContext.isQuickChat);
}
function isInlineChat(widget) {
    return isIChatResourceViewContext(widget.viewContext) && Boolean(widget.viewContext.isInlineChat);
}
const supportsAllAttachments = {
    supportsFileAttachments: true,
    supportsToolAttachments: true,
    supportsMCPAttachments: true,
    supportsImageAttachments: true,
    supportsSearchResultAttachments: true,
    supportsInstructionAttachments: true,
    supportsSourceControlAttachments: true,
    supportsProblemAttachments: true,
    supportsSymbolAttachments: true,
    supportsTerminalAttachments: true,
    supportsPromptAttachments: true,
    supportsHandOffs: true,
    supportsCheckpoints: true,
};
const DISCLAIMER = localize('chatDisclaimer', "AI responses may be inaccurate");
let ChatWidget = class ChatWidget extends Disposable {
    static { ChatWidget_1 = this; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static { this.CONTRIBS = []; }
    get domNode() { return this.container; }
    get visible() { return this._visible; }
    set viewModel(viewModel) {
        if (this._viewModel === viewModel) {
            return;
        }
        const previousSessionResource = this._viewModel?.sessionResource;
        this.viewModelDisposables.clear();
        this._viewModel = viewModel;
        if (viewModel) {
            this.viewModelDisposables.add(viewModel);
            this.logService.debug('ChatWidget#setViewModel: have viewModel');
            // If switching to a model with a request in progress, play progress sound
            if (viewModel.model.requestInProgress.get()) {
                this.chatAccessibilityService.acceptRequest(viewModel.sessionResource, true);
            }
        }
        else {
            this.logService.debug('ChatWidget#setViewModel: no viewModel');
        }
        this._onDidChangeViewModel.fire({ previousSessionResource, currentSessionResource: this._viewModel?.sessionResource });
    }
    get viewModel() {
        return this._viewModel;
    }
    get parsedInput() {
        if (this.parsedChatRequest === undefined) {
            if (!this.viewModel) {
                return { text: '', parts: [] };
            }
            this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser)
                .parseChatRequestWithReferences(getDynamicVariablesForWidget(this), getSelectedToolAndToolSetsForWidget(this), this.getInput(), this.location, {
                selectedAgent: this._lastSelectedAgent,
                mode: this.input.currentModeKind,
                attachmentCapabilities: this.attachmentCapabilities,
                forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : undefined
            });
            this._onDidChangeParsedInput.fire();
        }
        return this.parsedChatRequest;
    }
    get scopedContextKeyService() {
        return this.contextKeyService;
    }
    get location() {
        return this._location.location;
    }
    get supportsChangingModes() {
        return !!this.viewOptions.supportsChangingModes;
    }
    get locationData() {
        return this._location.resolveData?.();
    }
    constructor(location, viewContext, viewOptions, styles, codeEditorService, configurationService, dialogService, contextKeyService, instantiationService, chatService, chatAgentService, chatWidgetService, chatAccessibilityService, logService, themeService, chatSlashCommandService, chatEditingService, telemetryService, promptsService, toolsService, chatModeService, chatLayoutService, chatEntitlementService, chatSessionsService, agentSessionsService, chatTodoListService, lifecycleService, chatAttachmentResolveService, chatTipService, chatDebugService) {
        super();
        this.viewOptions = viewOptions;
        this.styles = styles;
        this.codeEditorService = codeEditorService;
        this.configurationService = configurationService;
        this.dialogService = dialogService;
        this.contextKeyService = contextKeyService;
        this.instantiationService = instantiationService;
        this.chatService = chatService;
        this.chatAgentService = chatAgentService;
        this.chatWidgetService = chatWidgetService;
        this.chatAccessibilityService = chatAccessibilityService;
        this.logService = logService;
        this.themeService = themeService;
        this.chatSlashCommandService = chatSlashCommandService;
        this.telemetryService = telemetryService;
        this.promptsService = promptsService;
        this.toolsService = toolsService;
        this.chatModeService = chatModeService;
        this.chatLayoutService = chatLayoutService;
        this.chatEntitlementService = chatEntitlementService;
        this.chatSessionsService = chatSessionsService;
        this.agentSessionsService = agentSessionsService;
        this.chatTodoListService = chatTodoListService;
        this.lifecycleService = lifecycleService;
        this.chatAttachmentResolveService = chatAttachmentResolveService;
        this.chatTipService = chatTipService;
        this.chatDebugService = chatDebugService;
        this._onDidSubmitAgent = this._register(new Emitter());
        this.onDidSubmitAgent = this._onDidSubmitAgent.event;
        this._onDidChangeAgent = this._register(new Emitter());
        this.onDidChangeAgent = this._onDidChangeAgent.event;
        this._onDidFocus = this._register(new Emitter());
        this.onDidFocus = this._onDidFocus.event;
        this._onDidChangeViewModel = this._register(new Emitter());
        this.onDidChangeViewModel = this._onDidChangeViewModel.event;
        this._onDidScroll = this._register(new Emitter());
        this.onDidScroll = this._onDidScroll.event;
        this._onDidAcceptInput = this._register(new Emitter());
        this.onDidAcceptInput = this._onDidAcceptInput.event;
        this._onDidHide = this._register(new Emitter());
        this.onDidHide = this._onDidHide.event;
        this._onDidShow = this._register(new Emitter());
        this.onDidShow = this._onDidShow.event;
        this._onDidChangeParsedInput = this._register(new Emitter());
        this.onDidChangeParsedInput = this._onDidChangeParsedInput.event;
        this._onDidChangeActiveInputEditor = this._register(new Emitter());
        this.onDidChangeActiveInputEditor = this._onDidChangeActiveInputEditor.event;
        this._onWillMaybeChangeHeight = this._register(new Emitter());
        this.onWillMaybeChangeHeight = this._onWillMaybeChangeHeight.event;
        this._onDidChangeHeight = this._register(new Emitter());
        this.onDidChangeHeight = this._onDidChangeHeight.event;
        this._onDidChangeContentHeight = this._register(new Emitter());
        this.onDidChangeContentHeight = this._onDidChangeContentHeight.event;
        this._onDidChangeEmptyState = this._register(new Emitter());
        this.onDidChangeEmptyState = this._onDidChangeEmptyState.event;
        this.contribs = [];
        this.visibilityTimeoutDisposable = this._register(new MutableDisposable());
        this.visibilityAnimationFrameDisposable = this._register(new MutableDisposable());
        this.inputPartDisposable = this._register(new MutableDisposable());
        this.inlineInputPartDisposable = this._register(new MutableDisposable());
        this.recentlyRestoredCheckpoint = false;
        this.welcomePart = this._register(new MutableDisposable());
        this._gettingStartedTipPart = this._register(new MutableDisposable());
        this.visibleChangeCount = 0;
        this._visible = false;
        this._isRenderingWelcome = false;
        this._attachmentCapabilities = supportsAllAttachments;
        this.viewModelDisposables = this._register(new DisposableStore());
        this._editingSession = observableValue(this, undefined);
        this._viewModelObs = observableFromEvent(this, this.onDidChangeViewModel, () => this.viewModel);
        this._lockedToCodingAgentContextKey = ChatContextKeys.lockedToCodingAgent.bindTo(this.contextKeyService);
        this._lockedCodingAgentIdContextKey = ChatContextKeys.lockedCodingAgentId.bindTo(this.contextKeyService);
        this._chatSessionSupportsForkContextKey = ChatContextKeys.chatSessionSupportsFork.bindTo(this.contextKeyService);
        this._agentSupportsAttachmentsContextKey = ChatContextKeys.agentSupportsAttachments.bindTo(this.contextKeyService);
        this._sessionIsEmptyContextKey = ChatContextKeys.chatSessionIsEmpty.bindTo(this.contextKeyService);
        this._hasPendingRequestsContextKey = ChatContextKeys.hasPendingRequests.bindTo(this.contextKeyService);
        this._sessionHasDebugDataContextKey = ChatContextKeys.chatSessionHasDebugData.bindTo(this.contextKeyService);
        this._register(this.chatDebugService.onDidAddEvent(e => {
            const sessionResource = this.viewModel?.sessionResource;
            if (sessionResource && e.sessionResource.toString() === sessionResource.toString()) {
                this._sessionHasDebugDataContextKey.set(true);
            }
        }));
        this.viewContext = viewContext ?? {};
        const viewModelObs = this._viewModelObs;
        if (typeof location === 'object') {
            this._location = location;
        }
        else {
            this._location = { location };
        }
        ChatContextKeys.inChatSession.bindTo(contextKeyService).set(true);
        ChatContextKeys.location.bindTo(contextKeyService).set(this._location.location);
        ChatContextKeys.inQuickChat.bindTo(contextKeyService).set(isQuickChat(this));
        this.agentInInput = ChatContextKeys.inputHasAgent.bindTo(contextKeyService);
        this.requestInProgress = ChatContextKeys.requestInProgress.bindTo(contextKeyService);
        this._register(this.chatEntitlementService.onDidChangeAnonymous(() => this.renderWelcomeViewContentIfNeeded()));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('chat.tips.enabled')) {
                if (!this.configurationService.getValue('chat.tips.enabled')) {
                    // Clear the existing tip so it doesn't linger
                    if (this.inputPart) {
                        this._gettingStartedTipPartRef = undefined;
                        this._gettingStartedTipPart.clear();
                        const tipContainer = this.inputPart.gettingStartedTipContainerElement;
                        dom.clearNode(tipContainer);
                        dom.setVisibility(false, tipContainer);
                    }
                }
                else {
                    this.updateChatViewVisibility();
                }
            }
        }));
        this._register(bindContextKey(decidedChatEditingResourceContextKey, contextKeyService, (reader) => {
            const currentSession = this._editingSession.read(reader);
            if (!currentSession) {
                return;
            }
            const entries = currentSession.entries.read(reader);
            const decidedEntries = entries.filter(entry => entry.state.read(reader) !== 0 /* ModifiedFileEntryState.Modified */);
            return decidedEntries.map(entry => entry.entryId);
        }));
        this._register(bindContextKey(hasUndecidedChatEditingResourceContextKey, contextKeyService, (reader) => {
            const currentSession = this._editingSession.read(reader);
            const entries = currentSession?.entries.read(reader) ?? []; // using currentSession here
            const decidedEntries = entries.filter(entry => entry.state.read(reader) === 0 /* ModifiedFileEntryState.Modified */);
            return decidedEntries.length > 0;
        }));
        this._register(bindContextKey(hasAppliedChatEditsContextKey, contextKeyService, (reader) => {
            const currentSession = this._editingSession.read(reader);
            if (!currentSession) {
                return false;
            }
            const entries = currentSession.entries.read(reader);
            return entries.length > 0;
        }));
        this._register(bindContextKey(inChatEditingSessionContextKey, contextKeyService, (reader) => {
            return this._editingSession.read(reader) !== null;
        }));
        this._register(bindContextKey(ChatContextKeys.chatEditingCanUndo, contextKeyService, (r) => {
            return this._editingSession.read(r)?.canUndo.read(r) || false;
        }));
        this._register(bindContextKey(ChatContextKeys.chatEditingCanRedo, contextKeyService, (r) => {
            return this._editingSession.read(r)?.canRedo.read(r) || false;
        }));
        this._register(bindContextKey(applyingChatEditsFailedContextKey, contextKeyService, (r) => {
            const chatModel = viewModelObs.read(r)?.model;
            const editingSession = this._editingSession.read(r);
            if (!editingSession || !chatModel) {
                return false;
            }
            const lastResponse = observableFromEvent(this, chatModel.onDidChange, () => chatModel.getRequests().at(-1)?.response).read(r);
            return lastResponse?.result?.errorDetails && !lastResponse?.result?.errorDetails.responseIsIncomplete;
        }));
        this.chatSuggestNextWidget = this._register(this.instantiationService.createInstance(ChatSuggestNextWidget));
        this._register(autorun(r => {
            const viewModel = viewModelObs.read(r);
            const sessions = chatEditingService.editingSessionsObs.read(r);
            const session = sessions.find(candidate => isEqual(candidate.chatSessionResource, viewModel?.sessionResource));
            this._editingSession.set(undefined, undefined);
            this.renderChatEditingSessionState(); // this is necessary to make sure we dispose previous buttons, etc.
            if (!session) {
                // none or for a different chat widget
                return;
            }
            const entries = session.entries.read(r);
            for (const entry of entries) {
                entry.state.read(r); // SIGNAL
            }
            this._editingSession.set(session, undefined);
            r.store.add(session.onDidDispose(() => {
                this._editingSession.set(undefined, undefined);
                this.renderChatEditingSessionState();
            }));
            r.store.add(this.inputEditor.onDidChangeModelContent(() => {
                if (this.getInput() === '') {
                    this.refreshParsedInput();
                }
            }));
            this.renderChatEditingSessionState();
        }));
        this._register(this.codeEditorService.registerCodeEditorOpenHandler(async (input, _source, _sideBySide) => {
            const resource = input.resource;
            if (resource.scheme !== Schemas.vscodeChatCodeBlock) {
                return null;
            }
            const responseId = resource.path.split('/').at(1);
            if (!responseId) {
                return null;
            }
            const item = this.viewModel?.getItems().find(item => item.id === responseId);
            if (!item) {
                return null;
            }
            // TODO: needs to reveal the chat view
            this.reveal(item);
            await timeout(0); // wait for list to actually render
            for (const codeBlockPart of this.listWidget.editorsInUse()) {
                if (extUri.isEqual(codeBlockPart.uri, resource, true)) {
                    const editor = codeBlockPart.editor;
                    let relativeTop = 0;
                    const editorDomNode = editor.getDomNode();
                    if (editorDomNode) {
                        const row = dom.findParentWithClass(editorDomNode, 'monaco-list-row');
                        if (row) {
                            relativeTop = dom.getTopLeftOffset(editorDomNode).top - dom.getTopLeftOffset(row).top;
                        }
                    }
                    if (input.options?.selection) {
                        const editorSelectionTopOffset = editor.getTopForPosition(input.options.selection.startLineNumber, input.options.selection.startColumn);
                        relativeTop += editorSelectionTopOffset;
                        editor.focus();
                        editor.setSelection({
                            startLineNumber: input.options.selection.startLineNumber,
                            startColumn: input.options.selection.startColumn,
                            endLineNumber: input.options.selection.endLineNumber ?? input.options.selection.startLineNumber,
                            endColumn: input.options.selection.endColumn ?? input.options.selection.startColumn
                        });
                    }
                    this.reveal(item, relativeTop);
                    return editor;
                }
            }
            return null;
        }));
        this._register(this.onDidChangeParsedInput(() => this.updateChatInputContext()));
        this._register(this.chatTodoListService.onDidUpdateTodos((sessionResource) => {
            if (isEqual(this.viewModel?.sessionResource, sessionResource)) {
                this.inputPart.renderChatTodoListWidget(sessionResource);
            }
        }));
    }
    set lastSelectedAgent(agent) {
        this.parsedChatRequest = undefined;
        this._lastSelectedAgent = agent;
        this._updateAgentCapabilitiesContextKeys(agent);
        this._onDidChangeParsedInput.fire();
    }
    get lastSelectedAgent() {
        return this._lastSelectedAgent;
    }
    _updateAgentCapabilitiesContextKeys(agent) {
        // Check if the agent has capabilities defined directly
        const capabilities = agent?.capabilities ?? (this._lockedAgent ? this.chatSessionsService.getCapabilitiesForSessionType(this._lockedAgent.id) : undefined);
        this._attachmentCapabilities = capabilities ?? supportsAllAttachments;
        const supportsAttachments = Object.keys(filter(this._attachmentCapabilities, (key, value) => value === true)).length > 0;
        this._agentSupportsAttachmentsContextKey.set(supportsAttachments);
    }
    get supportsFileReferences() {
        return !!this.viewOptions.supportsFileReferences;
    }
    get attachmentCapabilities() {
        return this._attachmentCapabilities;
    }
    /**
     * Either the inline input (when editing) or the main input part
     */
    get input() {
        return this.viewModel?.editing && this.configurationService.getValue('chat.editRequests') !== 'input' ? this.inlineInputPart : this.inputPart;
    }
    /**
     * The main input part at the buttom of the chat widget. Use `input` to get the active input (main or inline editing part).
     */
    get inputPart() {
        return this.inputPartDisposable.value;
    }
    get inlineInputPart() {
        return this.inlineInputPartDisposable.value;
    }
    get inputEditor() {
        return this.input.inputEditor;
    }
    get contentHeight() {
        return this.input.height.get() + this.listWidget.contentHeight + this.chatSuggestNextWidget.height;
    }
    get scrollTop() {
        return this.listWidget.scrollTop;
    }
    set scrollTop(value) {
        this.listWidget.scrollTop = value;
    }
    get attachmentModel() {
        return this.input.attachmentModel;
    }
    render(parent) {
        const viewId = isIChatViewViewContext(this.viewContext) ? this.viewContext.viewId : undefined;
        this.editorOptions = this._register(this.instantiationService.createInstance(ChatEditorOptions, viewId, this.styles.listForeground, this.styles.inputEditorBackground, this.styles.resultEditorBackground));
        const renderInputOnTop = this.viewOptions.renderInputOnTop ?? false;
        const renderFollowups = this.viewOptions.renderFollowups ?? !renderInputOnTop;
        const renderStyle = this.viewOptions.renderStyle;
        const renderInputToolbarBelowInput = this.viewOptions.renderInputToolbarBelowInput ?? false;
        this.container = dom.append(parent, $('.interactive-session'));
        this.welcomeMessageContainer = dom.append(this.container, $('.chat-welcome-view-container', { style: 'display: none' }));
        this._register(dom.addStandardDisposableListener(this.welcomeMessageContainer, dom.EventType.CLICK, () => this.focusInput()));
        this._register(this.chatSuggestNextWidget.onDidChangeHeight(() => {
            if (this.bodyDimension) {
                this.layout(this.bodyDimension.height, this.bodyDimension.width);
            }
        }));
        this._register(this.chatSuggestNextWidget.onDidSelectPrompt(({ handoff, agentId, withAutopilot }) => {
            this.handleNextPromptSelection(handoff, agentId, withAutopilot);
        }));
        if (renderInputOnTop) {
            this.createInput(this.container, { renderFollowups, renderStyle, renderInputToolbarBelowInput });
            this.listContainer = dom.append(this.container, $(`.interactive-list`));
        }
        else {
            this.listContainer = dom.append(this.container, $(`.interactive-list`));
            dom.append(this.container, this.chatSuggestNextWidget.domNode);
            this.createInput(this.container, { renderFollowups, renderStyle, renderInputToolbarBelowInput });
        }
        this.renderWelcomeViewContentIfNeeded();
        this.createList(this.listContainer, { editable: !isInlineChat(this) && !isQuickChat(this), ...this.viewOptions.rendererOptions, renderStyle });
        // Forward scroll events from the parent container margins (outside the max-width area) to the chat list
        this._register(dom.addDisposableListener(parent, dom.EventType.MOUSE_WHEEL, (e) => {
            if (e.defaultPrevented) {
                return;
            }
            if (dom.isAncestor(e.target, this.container)) {
                return;
            }
            this.listWidget.delegateScrollFromMouseWheelEvent(e);
        }));
        // Update the font family and size
        this._register(autorun(reader => {
            const fontFamily = this.chatLayoutService.fontFamily.read(reader);
            const fontSize = this.chatLayoutService.fontSize.read(reader);
            this.container.style.setProperty('--vscode-chat-font-family', fontFamily);
            this.container.style.fontSize = `${fontSize}px`;
            if (this.visible) {
                this.listWidget.rerender();
            }
        }));
        this._register(Event.runAndSubscribe(this.editorOptions.onDidChange, () => this.onDidStyleChange()));
        // Do initial render
        if (this.viewModel) {
            this.onDidChangeItems();
            this.listWidget.scrollToEnd();
        }
        this.contribs = ChatWidget_1.CONTRIBS.map(contrib => {
            try {
                return this._register(this.instantiationService.createInstance(contrib, this));
            }
            catch (err) {
                this.logService.error('Failed to instantiate chat widget contrib', toErrorMessage(err));
                return undefined;
            }
        }).filter(isDefined);
        this._register(this.chatWidgetService.register(this));
        const parsedInput = observableFromEvent(this.onDidChangeParsedInput, () => this.parsedInput);
        this._register(autorun(r => {
            const input = parsedInput.read(r);
            const newPromptAttachments = new Map();
            const oldPromptAttachments = new Set();
            // get all attachments, know those that are prompt-referenced
            for (const attachment of this.attachmentModel.attachments) {
                if (attachment.range) {
                    oldPromptAttachments.add(attachment.id);
                }
            }
            // update/insert prompt-referenced attachments
            for (const part of input.parts) {
                if (part instanceof ChatRequestToolPart || part instanceof ChatRequestToolSetPart || part instanceof ChatRequestDynamicVariablePart) {
                    const entry = part.toVariableEntry();
                    newPromptAttachments.set(entry.id, entry);
                    oldPromptAttachments.delete(entry.id);
                }
            }
            this.attachmentModel.updateContext(oldPromptAttachments, newPromptAttachments.values());
        }));
        if (!this.focusedInputDOM) {
            this.focusedInputDOM = this.container.appendChild(dom.$('.focused-input-dom'));
        }
    }
    focusInput() {
        this.input.focus();
        // Sometimes focusing the input part is not possible,
        // but we'd like to be the last focused chat widget,
        // so we emit an optimistic onDidFocus event nonetheless.
        this._onDidFocus.fire();
    }
    focusTodosView() {
        if (!this.input.hasVisibleTodos()) {
            return false;
        }
        return this.input.focusTodoList();
    }
    toggleTodosViewFocus() {
        if (!this.input.hasVisibleTodos()) {
            return false;
        }
        if (this.input.isTodoListFocused()) {
            this.focusInput();
            return true;
        }
        return this.input.focusTodoList();
    }
    focusQuestionCarousel() {
        if (!this.input.questionCarousel) {
            return false;
        }
        return this.input.focusQuestionCarousel();
    }
    toggleQuestionCarouselFocus() {
        if (!this.input.questionCarousel) {
            return false;
        }
        if (this.input.isQuestionCarouselFocused()) {
            this.focusInput();
            return true;
        }
        return this.input.focusQuestionCarousel();
    }
    navigateToPreviousQuestion() {
        if (!this.input.questionCarousel) {
            return false;
        }
        return this.input.navigateToPreviousQuestion();
    }
    navigateToNextQuestion() {
        if (!this.input.questionCarousel) {
            return false;
        }
        return this.input.navigateToNextQuestion();
    }
    toggleTipFocus() {
        if (this._gettingStartedTipPartRef?.hasFocus()) {
            this.focusInput();
            return true;
        }
        if (!this._gettingStartedTipPartRef) {
            return false;
        }
        this._gettingStartedTipPartRef.focus();
        return true;
    }
    hasInputFocus() {
        return this.input.hasFocus();
    }
    refreshParsedInput() {
        if (!this.viewModel) {
            return;
        }
        const previous = this.parsedChatRequest;
        this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequestWithReferences(getDynamicVariablesForWidget(this), getSelectedToolAndToolSetsForWidget(this), this.getInput(), this.location, { selectedAgent: this._lastSelectedAgent, mode: this.input.currentModeKind, attachmentCapabilities: this.attachmentCapabilities });
        if (!previous || !IParsedChatRequest.equals(previous, this.parsedChatRequest)) {
            this._onDidChangeParsedInput.fire();
        }
    }
    getSibling(item, type) {
        if (!isResponseVM(item)) {
            return;
        }
        const items = this.viewModel?.getItems();
        if (!items) {
            return;
        }
        const responseItems = items.filter(i => isResponseVM(i));
        const targetIndex = responseItems.indexOf(item);
        if (targetIndex === undefined) {
            return;
        }
        const indexToFocus = type === 'next' ? targetIndex + 1 : targetIndex - 1;
        if (indexToFocus < 0 || indexToFocus > responseItems.length - 1) {
            return;
        }
        return responseItems[indexToFocus];
    }
    async clear() {
        this.logService.debug('ChatWidget#clear');
        if (this._dynamicMessageLayoutData) {
            this._dynamicMessageLayoutData.enabled = true;
        }
        if (this.viewModel?.editing) {
            this.finishedEditing();
        }
        if (this.viewModel) {
            this.viewModel.resetInputPlaceholder();
        }
        if (this._lockedAgent) {
            this.lockToCodingAgent(this._lockedAgent.name, this._lockedAgent.displayName, this._lockedAgent.id);
        }
        else {
            this.unlockFromCodingAgent();
        }
        this.inputPart.clearTodoListWidget(this.viewModel?.sessionResource, true);
        this.inputPart.clearArtifactsWidget();
        this.chatSuggestNextWidget.hide();
        await this.viewOptions.clear?.();
    }
    onDidChangeItems(skipDynamicLayout) {
        if (this._visible || !this.viewModel) {
            const items = this.viewModel?.getItems() ?? [];
            if (items.length > 0) {
                this.updateChatViewVisibility();
            }
            else {
                this.renderWelcomeViewContentIfNeeded();
            }
            this._onWillMaybeChangeHeight.fire();
            // Update list widget state and refresh
            this.listWidget.setVisibleChangeCount(this.visibleChangeCount);
            this.listWidget.refresh();
            if (!skipDynamicLayout && this._dynamicMessageLayoutData) {
                this.layoutDynamicChatTreeItemMode();
            }
            this.renderFollowups();
        }
    }
    /**
     * Updates the DOM visibility of welcome view and chat list immediately
     */
    updateChatViewVisibility() {
        if (this.viewModel) {
            const isStandardLayout = this.viewOptions.renderStyle !== 'compact' && this.viewOptions.renderStyle !== 'minimal';
            const numItems = this.viewModel.getItems().length;
            dom.setVisibility(numItems === 0, this.welcomeMessageContainer);
            dom.setVisibility(numItems !== 0, this.listContainer);
            // Show/hide the getting-started tip container based on empty state.
            // Only use this in the standard chat layout where the welcome view is shown.
            if (isStandardLayout && this.inputPart) {
                const tipContainer = this.inputPart.gettingStartedTipContainerElement;
                if (numItems === 0) {
                    this.renderGettingStartedTipIfNeeded();
                }
                else {
                    // Dispose the cached tip part so the next empty state picks a
                    // fresh (rotated) tip instead of re-showing the stale one.
                    this._gettingStartedTipPartRef = undefined;
                    this._gettingStartedTipPart.clear();
                    dom.clearNode(tipContainer);
                    dom.setVisibility(false, tipContainer);
                }
            }
        }
        // Only show welcome getting started until setup is completed
        this.container.classList.toggle('chat-view-getting-started-disabled', this.chatEntitlementService.sentiment.completed);
        this._onDidChangeEmptyState.fire();
    }
    isEmpty() {
        return (this.viewModel?.getItems().length ?? 0) === 0;
    }
    /**
     * Renders the welcome view content when needed.
     */
    renderWelcomeViewContentIfNeeded() {
        if (this._isRenderingWelcome) {
            return;
        }
        this._isRenderingWelcome = true;
        try {
            if (this.viewOptions.renderStyle === 'compact' || this.viewOptions.renderStyle === 'minimal' || this.lifecycleService.willShutdown) {
                return;
            }
            const numItems = this.viewModel?.getItems().length ?? 0;
            if (!numItems) {
                const defaultAgent = this.chatAgentService.getDefaultAgent(this.location, this.input.currentModeKind);
                let additionalMessage;
                if (this.chatEntitlementService.anonymous && !this.chatEntitlementService.sentiment.completed) {
                    const providers = product.defaultChatAgent.provider;
                    additionalMessage = new MarkdownString(localize({ key: 'settings', comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3}).", providers.default.name, providers.default.name, product.defaultChatAgent.termsStatementUrl, product.defaultChatAgent.privacyStatementUrl), { isTrusted: true });
                }
                else {
                    additionalMessage = defaultAgent?.metadata.additionalWelcomeMessage;
                }
                if (!additionalMessage && !this._lockedAgent) {
                    additionalMessage = this._getGenerateInstructionsMessage();
                }
                const welcomeContent = this.getWelcomeViewContent(additionalMessage);
                if (!this.welcomePart.value || this.welcomePart.value.needsRerender(welcomeContent)) {
                    dom.clearNode(this.welcomeMessageContainer);
                    this.welcomePart.value = this.instantiationService.createInstance(ChatViewWelcomePart, welcomeContent, {
                        location: this.location,
                        isWidgetAgentWelcomeViewContent: this.input?.currentModeKind === ChatModeKind.Agent
                    });
                    dom.append(this.welcomeMessageContainer, this.welcomePart.value.element);
                }
            }
            this.updateChatViewVisibility();
        }
        finally {
            this._isRenderingWelcome = false;
        }
    }
    renderGettingStartedTipIfNeeded() {
        if (!this.inputPart) {
            return;
        }
        const tipContainer = this.inputPart.gettingStartedTipContainerElement;
        const tip = this.chatTipService.getWelcomeTip(this.contextKeyService);
        if (!tip) {
            if (this._gettingStartedTipPart.value) {
                this._gettingStartedTipPartRef = undefined;
                this._gettingStartedTipPart.clear();
                dom.clearNode(tipContainer);
            }
            dom.setVisibility(false, tipContainer);
            return;
        }
        // Already showing an eligible tip
        if (this._gettingStartedTipPart.value) {
            dom.setVisibility(true, tipContainer);
            return;
        }
        const store = new DisposableStore();
        const renderer = this.instantiationService.createInstance(ChatContentMarkdownRenderer);
        const tipPart = store.add(this.instantiationService.createInstance(ChatTipContentPart, tip, renderer));
        this._gettingStartedTipPartRef = tipPart;
        store.add(tipPart.onDidHide(() => {
            tipPart.domNode.remove();
            this._gettingStartedTipPartRef = undefined;
            this._gettingStartedTipPart.clear();
            dom.setVisibility(false, tipContainer);
            this.focusInput();
        }));
        // Set the guard before appending to DOM so that any re-entrant calls
        // triggered by context-key changes during construction see the guard
        // and return early without adding a duplicate tip node.
        this._gettingStartedTipPart.value = store;
        // Clear any stale nodes left from a previous tip that was not properly
        // removed (e.g. if re-entrancy bypassed the guard above).
        dom.clearNode(tipContainer);
        tipContainer.appendChild(tipPart.domNode);
        dom.setVisibility(true, tipContainer);
    }
    _getGenerateInstructionsMessage() {
        // Start checking for instruction files immediately if not already done
        if (!this._instructionFilesCheckPromise) {
            this._instructionFilesCheckPromise = this._checkForAgentInstructionFiles();
            // Use VS Code's idiomatic pattern for disposal-safe promise callbacks
            this._register(thenIfNotDisposed(this._instructionFilesCheckPromise, hasFiles => {
                this._instructionFilesExist = hasFiles;
                // Only re-render if the current view still doesn't have items and we're showing the welcome message
                const hasViewModelItems = this.viewModel?.getItems().length ?? 0;
                if (hasViewModelItems === 0) {
                    this.renderWelcomeViewContentIfNeeded();
                }
            }));
        }
        // If we already know the result, use it
        if (this._instructionFilesExist === true) {
            // Don't show generate instructions message if files exist
            return new MarkdownString('');
        }
        else if (this._instructionFilesExist === false) {
            // Show generate instructions message if no files exist
            return new MarkdownString(localize('chatWidget.instructions', "[Generate Agent Instructions]({0}) to onboard AI onto your codebase.", `command:${GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID}`), { isTrusted: { enabledCommands: [GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID] } });
        }
        // While checking, don't show the generate instructions message
        return new MarkdownString('');
    }
    /**
     * Checks if any agent instruction files (.github/copilot-instructions.md or AGENTS.md) exist in the workspace.
     * Used to determine whether to show the "Generate Agent Instructions" hint.
     *
     * @returns true if instruction files exist OR if instruction features are disabled (to hide the hint)
     */
    async _checkForAgentInstructionFiles() {
        try {
            return (await this.promptsService.listAgentInstructions(CancellationToken.None)).length > 0;
        }
        catch (error) {
            // On error, assume no instruction files exist to be safe
            this.logService.warn('[ChatWidget] Error checking for instruction files:', error);
            return false;
        }
    }
    getWelcomeViewContent(additionalMessage) {
        if (this.isLockedToCodingAgent) {
            // Check for provider-specific customizations from chat sessions service
            const contribution = this._lockedAgent ? this.chatSessionsService.getChatSessionContribution(this._lockedAgent.id) : undefined;
            const providerIcon = contribution?.icon;
            const providerTitle = contribution?.welcomeTitle;
            const providerMessage = contribution?.welcomeMessage;
            // Fallback to default messages if provider doesn't specify
            const message = providerMessage
                ? new MarkdownString(providerMessage)
                : (this._lockedAgent?.prefix === '@copilot '
                    ? new MarkdownString(localize('copilotCodingAgentMessage', "This chat session will be forwarded to the {0} [coding agent]({1}) where work is completed in the background. ", this._lockedAgent.prefix, 'https://aka.ms/coding-agent-docs') + DISCLAIMER, { isTrusted: true })
                    : new MarkdownString(localize('genericCodingAgentMessage', "This chat session will be forwarded to the {0} coding agent where work is completed in the background. ", this._lockedAgent?.prefix) + DISCLAIMER));
            return {
                title: providerTitle ?? localize('codingAgentTitle', "Delegate to {0}", this._lockedAgent?.prefix),
                message,
                icon: providerIcon ?? Codicon.sendToRemoteAgent,
                additionalMessage,
                useLargeIcon: !!providerIcon,
            };
        }
        let title;
        if (this.input.currentModeKind === ChatModeKind.Ask) {
            title = localize('chatDescription', "Ask about your code");
        }
        else if (this.input.currentModeKind === ChatModeKind.Edit) {
            title = localize('editsTitle', "Edit in context");
        }
        else {
            title = localize('agentTitle', "Build with Agent");
        }
        return {
            title,
            message: new MarkdownString(DISCLAIMER),
            icon: Codicon.chatSparkle,
            additionalMessage,
        };
    }
    async renderChatEditingSessionState() {
        if (!this.input) {
            return;
        }
        this.input.renderChatEditingSessionState(this._editingSession.get() ?? null);
    }
    async renderFollowups() {
        const lastItem = this.listWidget.lastItem;
        if (lastItem && isResponseVM(lastItem) && lastItem.isComplete) {
            this.input.renderFollowups(lastItem.replyFollowups, lastItem);
        }
        else {
            this.input.renderFollowups(undefined, undefined);
        }
    }
    renderChatSuggestNextWidget() {
        if (this.lifecycleService.willShutdown) {
            return;
        }
        // Skip rendering in coding agent sessions unless the agent supports hand-offs
        if (this.isLockedToCodingAgent && !this._attachmentCapabilities.supportsHandOffs) {
            this.chatSuggestNextWidget.hide();
            return;
        }
        const items = this.viewModel?.getItems() ?? [];
        if (!items.length) {
            return;
        }
        const lastItem = items[items.length - 1];
        const lastResponseComplete = lastItem && isResponseVM(lastItem) && lastItem.isComplete;
        if (!lastResponseComplete || lastItem.isCanceled) {
            this.chatSuggestNextWidget.hide();
            return;
        }
        // Derive handoffs from the mode that generated the last response, not the current UI selection.
        // This ensures handoffs reflect what the response agent offers, regardless of mode picker state.
        // Fall back to the current mode picker for old sessions where modeInfo was not persisted.
        const modeInfo = lastItem.model.request?.modeInfo;
        let responseMode;
        if (modeInfo?.modeInstructions?.name) {
            responseMode = this.chatModeService.findModeByName(modeInfo.modeInstructions.name);
        }
        else if (modeInfo?.modeId) {
            responseMode = this.chatModeService.findModeById(modeInfo.modeId);
        }
        else {
            responseMode = this.input.currentModeObs.get();
        }
        const handoffs = responseMode?.handOffs?.get();
        if (responseMode && handoffs && handoffs.length > 0) {
            // In Autopilot mode, automatically trigger the first auto-send handoff
            // so the plan flows seamlessly into implementation without user interaction.
            const permissionLevel = this.inputPart.currentModeInfo.permissionLevel;
            if (permissionLevel === ChatPermissionLevel.Autopilot) {
                const autoSendHandoff = handoffs.find(h => h.send);
                if (autoSendHandoff) {
                    this.handleNextPromptSelection(autoSendHandoff);
                    return;
                }
            }
            // Log telemetry only when widget transitions from hidden to visible
            const wasHidden = this.chatSuggestNextWidget.domNode.style.display === 'none';
            this.chatSuggestNextWidget.render(responseMode);
            if (wasHidden) {
                this.telemetryService.publicLog2('chat.handoffWidgetShown', {
                    agent: getModeNameForTelemetry(responseMode),
                    handoffCount: handoffs.length
                });
            }
        }
        else {
            this.chatSuggestNextWidget.hide();
        }
        // Trigger layout update
        if (this.bodyDimension) {
            this.layout(this.bodyDimension.height, this.bodyDimension.width);
        }
    }
    handleNextPromptSelection(handoff, agentId, withAutopilot) {
        // Hide the widget after selection
        this.chatSuggestNextWidget.hide();
        // If starting with Autopilot, set permission level before submitting
        if (withAutopilot) {
            this.inputPart.setPermissionLevel(ChatPermissionLevel.Autopilot);
        }
        const promptToUse = handoff.prompt;
        // Log telemetry
        const currentMode = this.input.currentModeObs.get();
        const toMode = handoff.agent ? this.chatModeService.findModeByName(handoff.agent) : undefined;
        this.telemetryService.publicLog2('chat.handoffClicked', {
            fromAgent: getModeNameForTelemetry(currentMode),
            toAgent: agentId || (toMode ? getModeNameForTelemetry(toMode) : ''),
            hasPrompt: Boolean(promptToUse),
            autoSend: Boolean(handoff.send)
        });
        this.executeHandoff(handoff, agentId).catch(e => {
            const target = agentId ?? handoff.agent ?? 'unknown';
            this.logService.error(`[Handoff] Failed to execute handoff '${handoff.label}' to '${target}'`, e);
        });
    }
    async executeHandoff(handoff, agentId) {
        this.chatSuggestNextWidget.hide();
        const promptToUse = handoff.prompt;
        // If agentId is provided (from chevron dropdown), delegate to that chat session
        // Otherwise, switch to the handoff agent
        if (agentId) {
            // Delegate to chat session (e.g., @background or @cloud)
            this.input.setValue(`@${agentId} ${promptToUse}`, false);
            this.input.focus();
            // Auto-submit for delegated chat sessions
            this.acceptInput().catch(e => this.logService.error(`[Handoff] Failed to submit delegated handoff to '@${agentId}'`, e));
        }
        else if (handoff.agent) {
            // Regular handoff to specified agent
            this._switchToAgentByName(handoff.agent);
            // Switch to the specified model if provided
            if (handoff.model) {
                this.input.switchModelByQualifiedName([handoff.model]);
            }
            // Insert the handoff prompt into the input
            this.input.setValue(promptToUse, false);
            this.input.focus();
            // Auto-submit if send flag is true
            if (handoff.send) {
                this.acceptInput();
            }
        }
    }
    async handleDelegationExitIfNeeded(sourceAgent, targetAgent) {
        if (!this._shouldExitAfterDelegation(sourceAgent, targetAgent)) {
            return;
        }
        this.logService.debug(`[Delegation] Will exit after delegation: sourceAgent=${sourceAgent?.id}, targetAgent=${targetAgent?.id}`);
        try {
            await this._handleDelegationExit();
        }
        catch (e) {
            this.logService.error('[Delegation] Failed to handle delegation exit', e);
        }
    }
    _shouldExitAfterDelegation(sourceAgent, targetAgent) {
        if (!targetAgent) {
            this.logService.debug('[Delegation] _shouldExitAfterDelegation: false (no targetAgent)');
            return false;
        }
        if (!this.configurationService.getValue(ChatConfiguration.ExitAfterDelegation)) {
            this.logService.debug('[Delegation] _shouldExitAfterDelegation: false (ExitAfterDelegation config disabled)');
            return false;
        }
        // Never exit if the source and target are the same (that means that you're providing a follow up, etc.)
        // NOTE: sourceAgent would be the chatWidget's 'lockedAgent'
        if (sourceAgent && sourceAgent.id === targetAgent.id) {
            this.logService.debug('[Delegation] _shouldExitAfterDelegation: false (source and target agents are the same)');
            return false;
        }
        if (!isIChatViewViewContext(this.viewContext)) {
            this.logService.debug('[Delegation] _shouldExitAfterDelegation: false (not in chat view context)');
            return false;
        }
        const contribution = this.chatSessionsService.getChatSessionContribution(targetAgent.id);
        if (!contribution) {
            this.logService.debug(`[Delegation] _shouldExitAfterDelegation: false (no contribution found for targetAgent.id=${targetAgent.id})`);
            return false;
        }
        if (contribution.canDelegate !== true) {
            this.logService.debug(`[Delegation] _shouldExitAfterDelegation: false (contribution.canDelegate=${contribution.canDelegate}, expected true)`);
            return false;
        }
        this.logService.debug('[Delegation] _shouldExitAfterDelegation: true');
        return true;
    }
    /**
     * Handles the exit of the panel chat when a delegation to another session occurs.
     * Waits for the response to complete and any pending confirmations to be resolved,
     * then clears the widget unless the final message is an error.
     */
    async _handleDelegationExit() {
        const viewModel = this.viewModel;
        if (!viewModel) {
            this.logService.debug('[Delegation] _handleDelegationExit: no viewModel, returning');
            return;
        }
        const parentSessionResource = viewModel.sessionResource;
        this.logService.debug(`[Delegation] _handleDelegationExit: parentSessionResource=${parentSessionResource.toString()}`);
        // Check if response is complete, not pending confirmation, and has no error
        const checkIfShouldClear = () => {
            const items = viewModel.getItems();
            const lastItem = items[items.length - 1];
            if (lastItem && isResponseVM(lastItem) && lastItem.model && lastItem.isComplete && !lastItem.model.isPendingConfirmation.get()) {
                const hasError = Boolean(lastItem.result?.errorDetails);
                return !hasError;
            }
            return false;
        };
        if (checkIfShouldClear()) {
            this.logService.debug('[Delegation] Response complete, archiving session before clearing');
            // Archive BEFORE clearing to ensure session still exists in agentSessionsService
            await this.archiveLocalParentSession(parentSessionResource);
            await this.clear();
            return;
        }
        this.logService.debug('[Delegation] Waiting for response to complete...');
        const shouldClear = await new Promise(resolve => {
            const disposable = viewModel.onDidChange(() => {
                const result = checkIfShouldClear();
                if (result) {
                    cleanup();
                    resolve(true);
                }
            });
            const timeout = setTimeout(() => {
                this.logService.debug('[Delegation] Timeout waiting for response to complete');
                cleanup();
                resolve(false);
            }, 30_000); // 30 second timeout
            const cleanup = () => {
                clearTimeout(timeout);
                disposable.dispose();
            };
        });
        if (shouldClear) {
            this.logService.debug('[Delegation] Response completed, archiving session before clearing');
            await this.archiveLocalParentSession(parentSessionResource);
            await this.clear();
        }
        else {
            this.logService.debug('[Delegation] Not clearing (timeout or error)');
        }
    }
    async archiveLocalParentSession(sessionResource) {
        // In the regular workbench, only archive local chat sessions.
        // In the sessions window, allow archiving any session type after delegation.
        if (sessionResource.scheme !== Schemas.vscodeLocalChatSession && !IsSessionsWindowContext.getValue(this.contextKeyService)) {
            return;
        }
        this.logService.debug(`[Delegation] archiveLocalParentSession: archiving session ${sessionResource.toString()}`);
        // Implicitly keep parent session's changes as they've now been delegated to the new agent.
        await this.chatService.getSession(sessionResource)?.editingSession?.accept();
        const session = this.agentSessionsService.getSession(sessionResource);
        if (session) {
            session.setArchived(true);
            this.logService.debug('[Delegation] archiveLocalParentSession: session archived successfully');
        }
        else {
            this.logService.warn(`[Delegation] archiveLocalParentSession: session not found in agentSessionsService for ${sessionResource.toString()}`);
        }
    }
    setVisible(visible) {
        const wasVisible = this._visible;
        this._visible = visible;
        this.visibleChangeCount++;
        this.listWidget.setVisible(visible);
        this.input.setVisible(visible);
        if (visible) {
            if (!wasVisible) {
                this.visibilityTimeoutDisposable.value = disposableTimeout(() => {
                    // Progressive rendering paused while hidden, so start it up again.
                    // Do it after a timeout because the container is not visible yet (it should be but offsetHeight returns 0 here)
                    if (this._visible) {
                        this.onDidChangeItems(true);
                    }
                }, 0);
                this.visibilityAnimationFrameDisposable.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
                    this._onDidShow.fire();
                });
            }
        }
        else if (wasVisible) {
            this._onDidHide.fire();
        }
    }
    createList(listContainer, options) {
        // Create a dom element to hold UI from editor widgets embedded in chat messages
        const overflowWidgetsContainer = document.createElement('div');
        overflowWidgetsContainer.classList.add('chat-overflow-widget-container', 'monaco-editor');
        listContainer.append(overflowWidgetsContainer);
        // Create chat list widget
        this.listWidget = this._register(this.instantiationService.createInstance(ChatListWidget, listContainer, {
            rendererOptions: options,
            renderStyle: this.viewOptions.renderStyle,
            defaultElementHeight: this.viewOptions.defaultElementHeight ?? 200,
            overflowWidgetsDomNode: overflowWidgetsContainer,
            styles: {
                listForeground: this.styles.listForeground,
                listBackground: this.styles.listBackground,
            },
            currentChatMode: () => this.input.currentModeKind,
            filter: this.viewOptions.filter ? { filter: this.viewOptions.filter.bind(this.viewOptions) } : undefined,
            viewModel: this.viewModel,
            editorOptions: this.editorOptions,
            location: this.location,
            getCurrentLanguageModelId: () => this.input.currentLanguageModel,
            getCurrentModeInfo: () => this.input.currentModeInfo,
        }));
        // Wire up ChatWidget-specific list widget events
        this._register(this.listWidget.onDidClickRequest(async (item) => {
            this.clickedRequest(item);
        }));
        this._register(this.listWidget.onDidRerender(item => {
            if (isRequestVM(item.currentElement) && this.configurationService.getValue('chat.editRequests') !== 'input') {
                if (!item.rowContainer.contains(this.inputContainer)) {
                    item.rowContainer.appendChild(this.inputContainer);
                }
                this.input.focus();
            }
        }));
        this._register(this.listWidget.onDidDispose(() => {
            this.focusedInputDOM.appendChild(this.inputContainer);
            this.input.focus();
        }));
        this._register(this.listWidget.onDidFocusOutside(() => {
            this.finishedEditing();
        }));
        this._register(this.listWidget.onDidClickFollowup(item => {
            // is this used anymore?
            this.acceptInput(item.message);
        }));
        this._register(this.listWidget.onDidChangeContentHeight(() => {
            this._onDidChangeContentHeight.fire();
        }));
        this._register(this.listWidget.onDidFocus(() => {
            this._onDidFocus.fire();
        }));
        this._register(this.listWidget.onDidScroll(() => {
            this._onDidScroll.fire();
        }));
    }
    startEditing(requestId) {
        const editedRequest = this.listWidget.getTemplateDataForRequestId(requestId);
        if (editedRequest) {
            this.clickedRequest(editedRequest);
        }
    }
    clickedRequest(item) {
        const currentElement = item.currentElement;
        if (isRequestVM(currentElement) && !this.viewModel?.editing) {
            const requests = this.viewModel?.model.getRequests();
            if (!requests || !this.viewModel?.sessionResource) {
                return;
            }
            // this will only ever be true if we restored a checkpoint
            if (this.viewModel?.model.checkpoint) {
                this.recentlyRestoredCheckpoint = true;
            }
            this.viewModel?.model.setCheckpoint(currentElement.id);
            // set contexts and request to false
            const currentContext = [];
            const addedContextIds = new Set();
            const addToContext = (entry) => {
                const dedupKey = entry.range ? `${entry.id}:${entry.range.start}-${entry.range.endExclusive}` : entry.id;
                if (addedContextIds.has(dedupKey) || isWorkspaceVariableEntry(entry)) {
                    return;
                }
                if ((isPromptFileVariableEntry(entry) || isPromptTextVariableEntry(entry)) && entry.automaticallyAdded) {
                    return;
                }
                addedContextIds.add(dedupKey);
                currentContext.push(entry);
            };
            for (let i = requests.length - 1; i >= 0; i -= 1) {
                const request = requests[i];
                if (request.id === currentElement.id) {
                    request.setShouldBeBlocked(false); // unblocking just this request.
                    request.attachedContext?.forEach(addToContext);
                }
            }
            currentElement.variables.forEach(addToContext);
            // set states
            this.viewModel?.setEditing(currentElement);
            if (item?.contextKeyService) {
                ChatContextKeys.currentlyEditing.bindTo(item.contextKeyService).set(true);
            }
            const isEditingSentRequest = currentElement.pendingKind === undefined
                ? "s" /* ChatContextKeys.EditingRequestType.Sent */
                : currentElement.pendingKind === "queued" /* ChatRequestQueueKind.Queued */
                    ? "q" /* ChatContextKeys.EditingRequestType.Queue */
                    : "st" /* ChatContextKeys.EditingRequestType.Steer */;
            const isInput = this.configurationService.getValue('chat.editRequests') === 'input';
            this.inputPart?.setEditing(!!this.viewModel?.editing && isInput, isEditingSentRequest);
            if (!isInput) {
                const rowContainer = item.rowContainer;
                this.inputContainer = dom.$('.chat-edit-input-container');
                rowContainer.appendChild(this.inputContainer);
                this.createInput(this.inputContainer);
                this.input.setChatMode(this.inputPart.currentModeObs.get().id);
                this.input.setPermissionLevel(this.inputPart.currentModeInfo.permissionLevel ?? ChatPermissionLevel.Default);
                this.input.setEditing(true, isEditingSentRequest);
                this._onDidChangeActiveInputEditor.fire();
            }
            else {
                this.inputPart.element.classList.add('editing');
            }
            this.inputPart.toggleChatInputOverlay(!isInput);
            if (currentContext.length > 0) {
                this.input.attachmentModel.addContext(...currentContext);
            }
            // rerenders
            this.inputPart.dnd.setDisabledOverlay(!isInput);
            this.input.renderAttachedContext();
            this.input.setValue(currentElement.messageText, false);
            // restore dynamic variables in the model so decorations and parsing work
            const dynamicVariableModel = this.getContrib(ChatDynamicVariableModel.ID);
            const editorModel = this.input.inputEditor.getModel();
            if (dynamicVariableModel && editorModel) {
                const modelTextLength = editorModel.getValueLength();
                for (const entry of currentContext) {
                    if (entry.range) {
                        if (entry.range.start >= entry.range.endExclusive) {
                            continue;
                        }
                        if (entry.range.start < 0 || entry.range.endExclusive > modelTextLength) {
                            continue;
                        }
                        const startPos = editorModel.getPositionAt(entry.range.start);
                        const endPos = editorModel.getPositionAt(entry.range.endExclusive);
                        dynamicVariableModel.addReference({
                            id: entry.id,
                            range: new Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
                            data: entry.value,
                            fullName: entry.fullName,
                            icon: entry.icon,
                            modelDescription: entry.modelDescription,
                            isFile: entry.kind === 'file',
                            isDirectory: entry.kind === 'directory',
                        });
                    }
                }
            }
            this.listWidget.suppressAutoScroll = true;
            this.onDidChangeItems();
            this.input.inputEditor.focus();
            this._register(this.inputPart.onDidClickOverlay(() => {
                if (this.viewModel?.editing && this.configurationService.getValue('chat.editRequests') !== 'input') {
                    this.finishedEditing();
                }
            }));
            // listeners
            if (!isInput) {
                this._register(this.inlineInputPart.inputEditor.onDidChangeModelContent(() => {
                    this.listWidget.scrollToCurrentItem(currentElement);
                }));
                this._register(this.inlineInputPart.inputEditor.onDidChangeCursorSelection((e) => {
                    this.listWidget.scrollToCurrentItem(currentElement);
                }));
            }
        }
        this.telemetryService.publicLog2('chat.startEditingRequests', {
            editRequestType: this.configurationService.getValue('chat.editRequests'),
        });
    }
    finishedEditing(completedEdit) {
        // reset states
        this.listWidget.suppressAutoScroll = false;
        const editedRequest = this.listWidget.getTemplateDataForRequestId(this.viewModel?.editing?.id);
        if (this.recentlyRestoredCheckpoint) {
            this.recentlyRestoredCheckpoint = false;
        }
        else {
            this.viewModel?.model.setCheckpoint(undefined);
        }
        this.inputPart.dnd.setDisabledOverlay(false);
        if (editedRequest?.contextKeyService) {
            ChatContextKeys.currentlyEditing.bindTo(editedRequest.contextKeyService).set(false);
        }
        const isInput = this.configurationService.getValue('chat.editRequests') === 'input';
        if (!isInput) {
            this.inputPart.setChatMode(this.input.currentModeObs.get().id);
            this.inputPart.setPermissionLevel(this.input.currentModeInfo.permissionLevel ?? ChatPermissionLevel.Default);
            const currentModel = this.input.selectedLanguageModel.get();
            if (currentModel) {
                this.inputPart.switchModel(currentModel.metadata);
            }
            this.inputPart?.toggleChatInputOverlay(false);
            try {
                if (editedRequest?.rowContainer?.contains(this.inputContainer)) {
                    editedRequest.rowContainer.removeChild(this.inputContainer);
                }
                else if (this.inputContainer.parentElement) {
                    this.inputContainer.parentElement.removeChild(this.inputContainer);
                }
            }
            catch (e) {
                this.logService.error('Error occurred while finishing editing:', e);
            }
            this.inputContainer = dom.$('.empty-chat-state');
            // only dispose if we know the input is not the bottom input object.
            this.input.dispose();
        }
        if (isInput) {
            this.inputPart.element.classList.remove('editing');
        }
        this.viewModel?.setEditing(undefined);
        this.inputPart?.setEditing(false, undefined);
        if (!isInput) {
            this._onDidChangeActiveInputEditor.fire();
        }
        this.onDidChangeItems();
        this.telemetryService.publicLog2('chat.editRequestsFinished', {
            editRequestType: this.configurationService.getValue('chat.editRequests'),
            editCanceled: !completedEdit
        });
        this.inputPart.focus();
    }
    getWidgetViewKindTag() {
        if (!this.viewContext) {
            return 'editor';
        }
        else if (isIChatViewViewContext(this.viewContext)) {
            return 'view';
        }
        else {
            return 'quick';
        }
    }
    createInput(container, options) {
        const commonConfig = {
            renderFollowups: options?.renderFollowups ?? true,
            renderStyle: options?.renderStyle === 'minimal' ? 'compact' : options?.renderStyle,
            renderInputToolbarBelowInput: options?.renderInputToolbarBelowInput ?? false,
            menus: {
                executeToolbar: MenuId.ChatExecute,
                telemetrySource: 'chatWidget',
                ...this.viewOptions.menus
            },
            editorOverflowWidgetsDomNode: this.viewOptions.editorOverflowWidgetsDomNode,
            enableImplicitContext: this.viewOptions.enableImplicitContext,
            renderWorkingSet: this.viewOptions.enableWorkingSet === 'explicit',
            supportsChangingModes: this.viewOptions.supportsChangingModes,
            dndContainer: this.viewOptions.dndContainer,
            inputEditorMinLines: this.viewOptions.inputEditorMinLines,
            widgetViewKindTag: this.getWidgetViewKindTag(),
            defaultMode: this.viewOptions.defaultMode,
            sessionTypePickerDelegate: this.viewOptions.sessionTypePickerDelegate,
            workspacePickerDelegate: this.viewOptions.workspacePickerDelegate,
            isSessionsWindow: this.viewOptions.isSessionsWindow,
        };
        if (this.viewModel?.editing) {
            const editedRequest = this.listWidget.getTemplateDataForRequestId(this.viewModel?.editing?.id);
            const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editedRequest?.contextKeyService])));
            this.inlineInputPartDisposable.value = scopedInstantiationService.createInstance(ChatInputPart, this.location, commonConfig, this.styles, true);
        }
        else {
            this.inputPartDisposable.value = this.instantiationService.createInstance(ChatInputPart, this.location, commonConfig, this.styles, false);
            this._register(autorun(reader => {
                this.inputPart.height.read(reader);
                if (!this.listWidget) {
                    // This is set up before the list/renderer are created
                    return;
                }
                if (this.bodyDimension) {
                    // Only re-layout the list/containers to match the new input
                    // height. Do NOT re-call this.layout() here: the input part
                    // has already laid itself out and re-entering inputPart.layout
                    // creates a layout loop when the viewPane also reacts.
                    this._layoutListForInputHeight();
                }
                this._onDidChangeContentHeight.fire();
            }));
        }
        this.input.render(container, '', this);
        if (this.bodyDimension?.width) {
            this.input.layout(this.bodyDimension.width);
        }
        this._register(this.input.onDidLoadInputState(() => {
            this.refreshParsedInput();
        }));
        this._register(this.input.onDidFocus(() => this._onDidFocus.fire()));
        this._register(this.input.onDidAcceptFollowup(e => {
            if (!this.viewModel) {
                return;
            }
            let msg = '';
            if (e.followup.agentId && e.followup.agentId !== this.chatAgentService.getDefaultAgent(this.location, this.input.currentModeKind)?.id) {
                const agent = this.chatAgentService.getAgent(e.followup.agentId);
                if (!agent) {
                    return;
                }
                this.lastSelectedAgent = agent;
                msg = `${chatAgentLeader}${agent.name} `;
                if (e.followup.subCommand) {
                    msg += `${chatSubcommandLeader}${e.followup.subCommand} `;
                }
            }
            else if (!e.followup.agentId && e.followup.subCommand && this.chatSlashCommandService.hasCommand(e.followup.subCommand)) {
                msg = `${chatSubcommandLeader}${e.followup.subCommand} `;
            }
            msg += e.followup.message;
            this.acceptInput(msg);
            if (!e.response) {
                // Followups can be shown by the welcome message, then there is no response associated.
                // At some point we probably want telemetry for these too.
                return;
            }
            this.chatService.notifyUserAction({
                sessionResource: this.viewModel.sessionResource,
                requestId: e.response.requestId,
                agentId: e.response.agent?.id,
                command: e.response.slashCommand?.name,
                result: e.response.result,
                action: {
                    kind: 'followUp',
                    followup: e.followup
                },
            });
        }));
        this._register(this.inputEditor.onDidChangeModelContent(() => {
            this.parsedChatRequest = undefined;
            this.updateChatInputContext();
        }));
        this._register(this.chatAgentService.onDidChangeAgents(() => {
            this.parsedChatRequest = undefined;
            // Tools agent loads -> welcome content changes
            this.renderWelcomeViewContentIfNeeded();
        }));
        this._register(this.input.onDidChangeCurrentChatMode(() => {
            this.renderWelcomeViewContentIfNeeded();
            this.refreshParsedInput();
            this.renderFollowups();
            this.renderChatSuggestNextWidget();
        }));
        const foregroundSessionCountContextKeys = new Set([ChatContextKeys.foregroundSessionCount.key]);
        this._register(this.contextKeyService.onDidChangeContext(e => {
            if (e.affectsSome(foregroundSessionCountContextKeys) && this.isEmpty()) {
                this.renderGettingStartedTipIfNeeded();
            }
        }));
        let previousModelIdentifier;
        this._register(autorun(reader => {
            const modelIdentifier = this.inputPart.selectedLanguageModel.read(reader)?.identifier;
            if (previousModelIdentifier === undefined) {
                previousModelIdentifier = modelIdentifier;
                return;
            }
            if (previousModelIdentifier === modelIdentifier) {
                return;
            }
            previousModelIdentifier = modelIdentifier;
            if (!this._gettingStartedTipPartRef) {
                return;
            }
            this.chatTipService.getWelcomeTip(this.contextKeyService);
        }));
        this._register(autorun(r => {
            const toolSetIds = new Set();
            const toolIds = new Set();
            for (const [entry, enabled] of this.input.selectedToolsModel.entriesMap.read(r)) {
                if (enabled) {
                    if (isToolSet(entry)) {
                        toolSetIds.add(entry.id);
                    }
                    else {
                        toolIds.add(entry.id);
                    }
                }
            }
            const disabledTools = this.input.attachmentModel.attachments
                .filter(a => a.kind === 'tool' && !toolIds.has(a.id) || a.kind === 'toolset' && !toolSetIds.has(a.id))
                .map(a => a.id);
            this.input.attachmentModel.updateContext(disabledTools, Iterable.empty());
            this.refreshParsedInput();
        }));
    }
    onDidStyleChange() {
        this.container.style.setProperty('--vscode-interactive-result-editor-background-color', this.editorOptions.configuration.resultEditor.backgroundColor?.toString() ?? '');
        this.container.style.setProperty('--vscode-interactive-session-foreground', this.editorOptions.configuration.foreground?.toString() ?? '');
        this.container.style.setProperty('--vscode-chat-list-background', this.themeService.getColorTheme().getColor(this.styles.listBackground)?.toString() ?? '');
    }
    setModel(model) {
        if (!this.container) {
            throw new Error('Call render() before setModel()');
        }
        if (!model) {
            if (this.viewModel?.editing) {
                this.finishedEditing();
            }
            this.viewModel = undefined;
            this.onDidChangeItems();
            this._hasPendingRequestsContextKey.set(false);
            return;
        }
        if (isEqual(model.sessionResource, this.viewModel?.sessionResource)) {
            return;
        }
        if (this.viewModel?.editing) {
            this.finishedEditing();
        }
        this.inputPart.clearTodoListWidget(model.sessionResource, false);
        this.inputPart.clearArtifactsWidget();
        this.chatSuggestNextWidget.hide();
        this.chatTipService.resetSession();
        // Switching sessions resets tip service state; clear any rendered tip so
        // empty-state rendering picks a fresh, context-appropriate tip.
        this._gettingStartedTipPartRef = undefined;
        this._gettingStartedTipPart.clear();
        const tipContainer = this.inputPart.gettingStartedTipContainerElement;
        dom.clearNode(tipContainer);
        dom.setVisibility(false, tipContainer);
        // Set the input model on the inputPart before assigning this.viewModel. Assigning this.viewModel
        // fires onDidChangeViewModel, which ChatInputPart listens to and expects the input model to be initialized.
        // Pass input model reference to input part for state syncing
        this.inputPart.setInputModel(model.inputModel, model.getRequests().length === 0);
        this.viewModel = this.instantiationService.createInstance(ChatViewModel, model, undefined);
        this.listWidget.setViewModel(this.viewModel);
        if (this._lockedAgent) {
            let placeholder = this.chatSessionsService.getChatSessionContribution(this._lockedAgent.id)?.inputPlaceholder;
            if (!placeholder) {
                placeholder = localize('chat.input.placeholder.lockedToAgent', "Chat with {0}", this._lockedAgent.displayName || this._lockedAgent.name);
            }
            this.viewModel.setInputPlaceholder(placeholder);
            this.inputEditor.updateOptions({ placeholder });
        }
        else if (this.viewModel.inputPlaceholder) {
            this.inputEditor.updateOptions({ placeholder: this.viewModel.inputPlaceholder });
        }
        const renderImmediately = this.configurationService.getValue('chat.experimental.renderMarkdownImmediately');
        const delay = renderImmediately ? MicrotaskDelay : 0;
        this.viewModelDisposables.add(Event.runAndSubscribe(Event.accumulate(this.viewModel.onDidChange, delay), (events => {
            if (!this.viewModel || this._store.isDisposed) {
                // See https://github.com/microsoft/vscode/issues/278969
                return;
            }
            this.requestInProgress.set(this.viewModel.model.requestInProgress.get());
            // Update the editor's placeholder text when it changes in the view model
            if (events?.some(e => e?.kind === 'changePlaceholder')) {
                this.inputEditor.updateOptions({ placeholder: this.viewModel.inputPlaceholder });
            }
            this.onDidChangeItems();
            if (events?.some(e => e?.kind === 'addRequest') && this.visible) {
                this.listWidget.scrollToEnd();
            }
        })));
        this.viewModelDisposables.add(this.viewModel.onDidDisposeModel(() => {
            // Ensure that view state is saved here, because we will load it again when a new model is assigned
            if (this.viewModel?.editing) {
                this.finishedEditing();
            }
            // Disposes the viewmodel and listeners
            this.viewModel = undefined;
            this.onDidChangeItems();
        }));
        this._sessionIsEmptyContextKey.set(model.getRequests().length === 0);
        const supportsFork = this.chatSessionsService.sessionSupportsFork(model.sessionResource);
        this._chatSessionSupportsForkContextKey.set(supportsFork);
        this.listWidget?.updateRendererOptions({ supportsFork });
        this._sessionHasDebugDataContextKey.set(this.chatDebugService.getEvents(model.sessionResource).length > 0);
        let lastSteeringCount = 0;
        const updatePendingRequestKeys = (announceSteering) => {
            const pendingRequests = model.getPendingRequests();
            const pendingCount = pendingRequests.length;
            this._hasPendingRequestsContextKey.set(pendingCount > 0);
            const steeringCount = pendingRequests.filter(pending => pending.kind === "steering" /* ChatRequestQueueKind.Steering */).length;
            if (announceSteering && steeringCount > 0 && lastSteeringCount === 0) {
                status(localize('chat.pendingRequests.steeringQueued', "Steering"));
            }
            lastSteeringCount = steeringCount;
        };
        updatePendingRequestKeys(false);
        this.viewModelDisposables.add(model.onDidChangePendingRequests(() => updatePendingRequestKeys(true)));
        this.refreshParsedInput();
        this.viewModelDisposables.add(model.onDidChange((e) => {
            if (e.kind === 'setAgent') {
                this._onDidChangeAgent.fire({ agent: e.agent, slashCommand: e.command });
                // Update capabilities context keys when agent changes
                this._updateAgentCapabilitiesContextKeys(e.agent);
            }
            if (e.kind === 'addRequest') {
                this.inputPart.clearTodoListWidget(this.viewModel?.sessionResource, false);
                this._sessionIsEmptyContextKey.set(false);
                this.chatSuggestNextWidget.hide();
            }
            // Hide widget on request removal
            if (e.kind === 'removeRequest') {
                this.inputPart.clearTodoListWidget(this.viewModel?.sessionResource, true);
                this.chatSuggestNextWidget.hide();
                this._sessionIsEmptyContextKey.set((this.viewModel?.model.getRequests().length ?? 0) === 0);
            }
            // Show next steps widget when response completes (not when request starts)
            if (e.kind === 'completedRequest') {
                const lastRequest = this.viewModel?.model.getRequests().at(-1);
                const wasCancelled = lastRequest?.response?.isCanceled ?? false;
                if (wasCancelled) {
                    // Clear todo list when request is cancelled
                    this.inputPart.clearTodoListWidget(this.viewModel?.sessionResource, true);
                }
                // Only show if response wasn't canceled
                this.renderChatSuggestNextWidget();
                // Mark the session as read when the request completes and the widget is visible
                if (this.visible && this.viewModel?.sessionResource) {
                    this.agentSessionsService.getSession(this.viewModel.sessionResource)?.setRead(true);
                }
            }
        }));
        if (this.listWidget && this.visible) {
            this.onDidChangeItems();
            this.listWidget.scrollToEnd();
        }
        this.renderChatSuggestNextWidget();
        this.updateChatInputContext();
        this.input.renderChatTodoListWidget(this.viewModel.sessionResource);
        this.input.renderArtifactsWidget(this.viewModel.sessionResource);
    }
    getFocus() {
        return this.listWidget.getFocus()[0] ?? undefined;
    }
    reveal(item, relativeTop) {
        this.listWidget.reveal(item, relativeTop);
    }
    focus(item) {
        if (!this.listWidget.hasElement(item)) {
            return;
        }
        this.listWidget.focusItem(item);
    }
    setInputPlaceholder(placeholder) {
        this.viewModel?.setInputPlaceholder(placeholder);
    }
    resetInputPlaceholder() {
        this.viewModel?.resetInputPlaceholder();
    }
    setInput(value = '') {
        this.input.setValue(value, false);
        this.refreshParsedInput();
    }
    getInput() {
        return this.input.inputEditor.getValue();
    }
    getContrib(id) {
        return this.contribs.find(c => c.id === id);
    }
    // Coding agent locking methods
    lockToCodingAgent(name, displayName, agentId) {
        this._lockedAgent = {
            id: agentId,
            name,
            prefix: `@${name} `,
            displayName
        };
        this._lockedToCodingAgentContextKey.set(true);
        this._lockedCodingAgentIdContextKey.set(agentId);
        this.renderWelcomeViewContentIfNeeded();
        // Update capabilities for the locked agent
        const agent = this.chatAgentService.getAgent(agentId);
        this._updateAgentCapabilitiesContextKeys(agent);
        const supportsCheckpoints = this._attachmentCapabilities.supportsCheckpoints ?? false;
        this.listWidget?.updateRendererOptions({ restorable: supportsCheckpoints, editable: supportsCheckpoints, noFooter: true, progressMessageAtBottomOfResponse: true });
        if (this.visible) {
            this.listWidget?.rerender();
        }
    }
    unlockFromCodingAgent() {
        // Clear all state related to locking
        this._lockedAgent = undefined;
        this._lockedToCodingAgentContextKey.set(false);
        this._lockedCodingAgentIdContextKey.set('');
        this._chatSessionSupportsForkContextKey.set(false);
        this._updateAgentCapabilitiesContextKeys(undefined);
        // Explicitly update the DOM to reflect unlocked state
        this.renderWelcomeViewContentIfNeeded();
        // Reset to default placeholder
        if (this.viewModel) {
            this.viewModel.resetInputPlaceholder();
        }
        this.inputEditor?.updateOptions({ placeholder: undefined });
        this.listWidget?.updateRendererOptions({ restorable: true, editable: true, noFooter: false, progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask });
        if (this.visible) {
            this.listWidget?.rerender();
        }
    }
    get isLockedToCodingAgent() {
        return !!this._lockedAgent;
    }
    get lockedAgentId() {
        return this._lockedAgent?.id;
    }
    logInputHistory() {
        this.input.logInputHistory();
    }
    async acceptInput(query, options) {
        if (this.viewModel) {
            markChat(this.viewModel.sessionResource, ChatPerfMark.RequestStart);
        }
        return this._acceptInput(query ? { query } : undefined, options);
    }
    async rerunLastRequest() {
        if (!this.viewModel) {
            return;
        }
        const sessionResource = this.viewModel.sessionResource;
        const lastRequest = this.chatService.getSession(sessionResource)?.getRequests().at(-1);
        if (!lastRequest) {
            return;
        }
        const options = {
            attempt: lastRequest.attempt + 1,
            location: this.location,
            userSelectedModelId: this.input.currentLanguageModel,
            modeInfo: this.input.currentModeInfo,
        };
        const result = await this.chatService.resendRequest(lastRequest, options);
        this.logThinkingStyleUsage('rerun');
        return result;
    }
    getConfiguredThinkingStyle() {
        const thinkingStyle = this.configurationService.getValue(ChatConfiguration.ThinkingStyle);
        switch (thinkingStyle) {
            case ThinkingDisplayMode.Collapsed:
            case ThinkingDisplayMode.CollapsedPreview:
            case ThinkingDisplayMode.FixedScrolling:
                return thinkingStyle;
            default:
                return ThinkingDisplayMode.FixedScrolling;
        }
    }
    logThinkingStyleUsage(requestKind) {
        this.telemetryService.publicLog2('chat.thinkingStyleUsage', {
            thinkingStyle: this.getConfiguredThinkingStyle(),
            location: this.location,
            requestKind,
        });
    }
    async _applyPromptFileIfSet(requestInput) {
        // first check if the input has a prompt slash command
        const agentSlashPromptPart = this.parsedInput.parts.find((r) => r instanceof ChatRequestSlashPromptPart);
        if (!agentSlashPromptPart) {
            return;
        }
        // Prompt slash commands are transformed out of the input before sendRequest.
        // Track them now so tip exclusions still update for commands like /init.
        this.chatTipService.recordSlashCommandUsage(agentSlashPromptPart.name);
        // need to resolve the slash command to get the prompt file
        const slashCommand = await this.promptsService.resolvePromptSlashCommand(agentSlashPromptPart.name, CancellationToken.None);
        if (!slashCommand) {
            return;
        }
        const parseResult = slashCommand.parsedPromptFile;
        // add the prompt file to the context
        const refs = parseResult.body?.variableReferences.map(({ name, offset, fullLength }) => ({ name, range: new OffsetRange(offset, offset + fullLength) })) ?? [];
        const toolReferences = this.toolsService.toToolReferences(refs);
        requestInput.attachedContext.insertFirst(toPromptFileVariableEntry(parseResult.uri, PromptFileVariableKind.PromptFile, undefined, true, toolReferences));
        const promptRunEvent = {
            storage: slashCommand.storage,
        };
        if (slashCommand.extension) {
            promptRunEvent.extensionId = slashCommand.extension.identifier.value;
            promptRunEvent.promptName = slashCommand.name;
        }
        else {
            promptRunEvent.promptNameHash = hash(slashCommand.name).toString(16);
        }
        this.telemetryService.publicLog2('chat.promptRun', promptRunEvent);
        if (parseResult.header) {
            await this._applyPromptMetadata(parseResult.header, requestInput);
        }
    }
    async _acceptInput(query, options = {}) {
        if (!query && this.input.generating) {
            // if the user submits the input and generation finishes quickly, just submit it for them
            const generatingAutoSubmitWindow = 500;
            const start = Date.now();
            await this.input.generating;
            if (Date.now() - start > generatingAutoSubmitWindow) {
                return;
            }
        }
        while (!this._viewModel && !this._store.isDisposed) {
            await Event.toPromise(this.onDidChangeViewModel, this._store);
        }
        if (!this.viewModel) {
            return;
        }
        // Check if a custom submit handler wants to handle this submission
        if (this.viewOptions.submitHandler) {
            const inputValue = !query ? this.getInput() : query.query;
            const handled = await this.viewOptions.submitHandler(inputValue, this.input.currentModeKind);
            if (handled) {
                return;
            }
        }
        this._onDidAcceptInput.fire();
        this.listWidget.setScrollLock(this.isLockedToCodingAgent || !!checkModeOption(this.input.currentModeKind, this.viewOptions.autoScroll));
        const editorValue = this.getInput();
        const requestInputs = {
            input: !query ? editorValue : query.query,
            attachedContext: options?.enableImplicitContext === false ? this.input.getAttachedContext() : this.input.getAttachedAndImplicitContext(),
        };
        const isUserQuery = !query;
        const isEditing = this.viewModel?.editing;
        if (isEditing) {
            const editingPendingRequest = this.viewModel.editing.pendingKind;
            if (editingPendingRequest !== undefined) {
                const editingRequestId = this.viewModel.editing.id;
                this.chatService.removePendingRequest(this.viewModel.sessionResource, editingRequestId);
                options.queue ??= editingPendingRequest;
            }
            else {
                await this.chatService.cancelCurrentRequestForSession(this.viewModel.sessionResource, 'acceptInput-editing');
                options.queue = undefined;
            }
            // For agents that support checkpoints, preserve the checkpoint
            // through finishedEditing so blocked requests are removed below
            // and the agent host can dispatch a protocol truncation action.
            const preserveCheckpoint = this._lockedAgent && !!this._attachmentCapabilities.supportsCheckpoints;
            if (preserveCheckpoint) {
                this.recentlyRestoredCheckpoint = true;
            }
            this.finishedEditing(true);
            if (!preserveCheckpoint) {
                this.viewModel.model?.setCheckpoint(undefined);
            }
        }
        const model = this.viewModel.model;
        const requestInProgress = model.requestInProgress.get();
        // Cancel the request if the user chooses to take a different path.
        // This is a bit of a heuristic for the common case of tool confirmation+reroute.
        // But we don't do this if there are queued messages, because we would either
        // discard them or need a prompt (as in `confirmPendingRequestsBeforeSend`)
        // which could be a surprising behavior if the user finishes typing a steering
        // request just as confirmation is triggered.
        if (model.requestNeedsInput.get() && !model.getPendingRequests().length) {
            await this.chatService.cancelCurrentRequestForSession(this.viewModel.sessionResource, 'acceptInput-needsInput');
            options.queue ??= "queued" /* ChatRequestQueueKind.Queued */;
        }
        if (requestInProgress) {
            options.queue ??= "queued" /* ChatRequestQueueKind.Queued */;
        }
        if (!requestInProgress && !isEditing && !(await this.confirmPendingRequestsBeforeSend(model, options))) {
            return;
        }
        // process the prompt command
        await this._applyPromptFileIfSet(requestInputs);
        markChat(this.viewModel.sessionResource, ChatPerfMark.WillCollectInstructions);
        await this._autoAttachInstructions(requestInputs);
        markChat(this.viewModel.sessionResource, ChatPerfMark.DidCollectInstructions);
        if (this.viewOptions.enableWorkingSet !== undefined && this.input.currentModeKind === ChatModeKind.Edit) {
            const uniqueWorkingSetEntries = new ResourceSet(); // NOTE: this is used for bookkeeping so the UI can avoid rendering references in the UI that are already shown in the working set
            const editingSessionAttachedContext = requestInputs.attachedContext;
            // Collect file variables from previous requests before sending the request
            const previousRequests = this.viewModel.model.getRequests();
            for (const request of previousRequests) {
                for (const variable of request.variableData.variables) {
                    if (URI.isUri(variable.value) && variable.kind === 'file') {
                        const uri = variable.value;
                        if (!uniqueWorkingSetEntries.has(uri)) {
                            editingSessionAttachedContext.add(variable);
                            uniqueWorkingSetEntries.add(variable.value);
                        }
                    }
                }
            }
            requestInputs.attachedContext = editingSessionAttachedContext;
            this.telemetryService.publicLog2('chatEditing/workingSetSize', { originalSize: uniqueWorkingSetEntries.size, actualSize: uniqueWorkingSetEntries.size });
        }
        this.input.validateAgentMode();
        if (this.viewModel.model.checkpoint) {
            const requests = this.viewModel.model.getRequests();
            for (let i = requests.length - 1; i >= 0; i -= 1) {
                const request = requests[i];
                if (request.shouldBeBlocked) {
                    this.chatService.removeRequest(this.viewModel.sessionResource, request.id);
                }
            }
            this.viewModel.model.setCheckpoint(undefined);
        }
        // Expand directory attachments: extract images as binary entries
        const resolvedImageVariables = await this._resolveDirectoryImageAttachments(requestInputs.attachedContext.asArray());
        const submittedSessionResource = this.viewModel.sessionResource;
        const result = await this.chatService.sendRequest(this.viewModel.sessionResource, requestInputs.input, {
            userSelectedModelId: this.input.currentLanguageModel,
            location: this.location,
            locationData: this._location.resolveData?.(),
            parserContext: { selectedAgent: this._lastSelectedAgent, mode: this.input.currentModeKind, attachmentCapabilities: this._lastSelectedAgent?.capabilities ?? this.attachmentCapabilities },
            attachedContext: requestInputs.attachedContext.asArray(),
            resolvedVariables: resolvedImageVariables,
            noCommandDetection: options?.noCommandDetection,
            ...this.getModeRequestOptions(),
            modeInfo: this.input.currentModeInfo,
            agentIdSilent: this._lockedAgent?.id,
            queue: options?.queue,
        });
        if (ChatSendResult.isRejected(result)) {
            return;
        }
        this.logThinkingStyleUsage('submit');
        // visibility sync before firing events to hide the welcome view
        this.updateChatViewVisibility();
        this.input.acceptInput(options?.storeToHistory ?? isUserQuery);
        const sent = ChatSendResult.isQueued(result) ? await result.deferred : result;
        if (!ChatSendResult.isSent(sent)) {
            return;
        }
        this._onDidSubmitAgent.fire({ agent: sent.data.agent, slashCommand: sent.data.slashCommand });
        this.handleDelegationExitIfNeeded(this._lockedAgent, sent.data.agent);
        // If the session was replaced (untitled -> real contributed session), swap the widget's model
        if (sent.newSessionResource) {
            const newModel = this.chatService.getSession(sent.newSessionResource);
            if (newModel) {
                this.setModel(newModel);
            }
        }
        sent.data.responseCreatedPromise.then(() => {
            // Only start accessibility progress once a real request/response model exists.
            this.chatAccessibilityService.acceptRequest(submittedSessionResource);
            sent.data.responseCompletePromise.then(() => {
                const responses = this.viewModel?.getItems().filter(isResponseVM);
                const lastResponse = responses?.[responses.length - 1];
                this.chatAccessibilityService.acceptResponse(this, this.container, lastResponse, submittedSessionResource, options?.isVoiceInput);
                if (lastResponse?.result?.nextQuestion) {
                    const { prompt, participant, command } = lastResponse.result.nextQuestion;
                    const question = formatChatQuestion(this.chatAgentService, this.location, prompt, participant, command);
                    if (question) {
                        this.input.setValue(question, false);
                    }
                }
            });
        });
        return sent.data.responseCreatedPromise;
    }
    // Resolve images from directory attachments to send as additional variables.
    async _resolveDirectoryImageAttachments(attachments) {
        const imagePromises = [];
        for (const attachment of attachments) {
            if (attachment.kind === 'directory' && URI.isUri(attachment.value)) {
                imagePromises.push(this.chatAttachmentResolveService.resolveDirectoryImages(attachment.value));
            }
        }
        if (imagePromises.length === 0) {
            return [];
        }
        const resolved = await Promise.all(imagePromises);
        return resolved.flat();
    }
    async confirmPendingRequestsBeforeSend(model, options) {
        if (options.queue) {
            return true;
        }
        const hasPendingRequests = model.getPendingRequests().length > 0;
        if (!hasPendingRequests) {
            return true;
        }
        const promptResult = await this.dialogService.prompt({
            type: 'question',
            message: localize('chat.pendingRequests.prompt.message', "You already have pending requests."),
            detail: localize('chat.pendingRequests.prompt.detail', "Do you want to keep them in the queue or remove them before sending this message?"),
            buttons: [
                {
                    label: localize('chat.pendingRequests.prompt.keep', "Keep Pending Requests"),
                    run: () => 'keep'
                },
                {
                    label: localize('chat.pendingRequests.prompt.remove', "Remove Pending Requests"),
                    run: () => 'remove'
                }
            ],
            cancelButton: true
        });
        if (!promptResult.result) {
            return false;
        }
        if (promptResult.result === 'remove') {
            for (const pendingRequest of [...model.getPendingRequests()]) {
                this.chatService.removePendingRequest(model.sessionResource, pendingRequest.request.id);
            }
        }
        return true;
    }
    getModeRequestOptions() {
        const sessionResource = this.viewModel?.sessionResource;
        const capturedModeId = this.input.currentModeObs.get().id;
        const userSelectedTools = this.input.selectedToolsModel.userSelectedTools;
        let lastToolsSnapshot = userSelectedTools.get();
        // When the widget has loaded a new session, return a snapshot of the tools for this session.
        // Only sync with the tools model when this session is shown with the same mode.
        const scopedTools = derived(reader => {
            const activeSession = this._viewModelObs.read(reader)?.sessionResource;
            const currentModeId = this.input.currentModeObs.read(reader).id;
            if (isEqual(activeSession, sessionResource) && currentModeId === capturedModeId) {
                const tools = userSelectedTools.read(reader);
                lastToolsSnapshot = tools;
                return tools;
            }
            return lastToolsSnapshot;
        });
        return {
            modeInfo: this.input.currentModeInfo,
            userSelectedTools: scopedTools,
        };
    }
    getCodeBlockInfosForResponse(response) {
        return this.listWidget.getCodeBlockInfosForResponse(response);
    }
    getCodeBlockInfoForEditor(uri) {
        return this.listWidget.getCodeBlockInfoForEditor(uri);
    }
    getFileTreeInfosForResponse(response) {
        return this.listWidget.getFileTreeInfosForResponse(response);
    }
    getLastFocusedFileTreeForResponse(response) {
        return this.listWidget.getLastFocusedFileTreeForResponse(response);
    }
    focusResponseItem(lastFocused) {
        this.listWidget.focusLastItem(lastFocused);
    }
    setInputPartMaxHeightOverride(maxHeight) {
        this.inputPartMaxHeightOverride = maxHeight;
    }
    layout(height, width) {
        width = Math.min(width, this.viewOptions.renderStyle === 'minimal' ? width : 950); // no min width of inline chat
        this.bodyDimension = new dom.Dimension(width, height);
        if (this.viewModel?.editing) {
            this.inlineInputPart?.layout(width);
        }
        const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
        const inputMaxHeight = this._dynamicMessageLayoutData || this.location !== ChatAgentLocation.Chat
            ? undefined
            : this.inputPartMaxHeightOverride !== undefined
                ? Math.max(0, this.inputPartMaxHeightOverride - chatSuggestNextWidgetHeight - MIN_LIST_HEIGHT)
                : Math.max(0, height - chatSuggestNextWidgetHeight - MIN_LIST_HEIGHT);
        this.inputPart.setMaxHeight(inputMaxHeight);
        this.inputPart.layout(width);
        this._layoutListForInputHeight();
    }
    /**
     * Re-layout just the list, welcome container, and list container to match
     * the current input-part height. Called both from {@link layout} and from
     * the inputPart.height autorun so we never re-enter inputPart.layout when
     * only the input height changed.
     */
    _layoutListForInputHeight() {
        if (!this.bodyDimension) {
            return;
        }
        const { height, width } = this.bodyDimension;
        const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
        const inputHeight = this.inputPart.height.get();
        const lastElementVisible = this.listWidget.isScrolledToBottom;
        const lastItem = this.listWidget.lastItem;
        const contentHeight = Math.max(0, height - inputHeight - chatSuggestNextWidgetHeight);
        this.listWidget.layout(contentHeight, width);
        this.welcomeMessageContainer.style.height = `${contentHeight}px`;
        const lastResponseIsRendering = isResponseVM(lastItem) && lastItem.renderData;
        if (lastElementVisible && (!lastResponseIsRendering || checkModeOption(this.input.currentModeKind, this.viewOptions.autoScroll))) {
            this.listWidget.scrollToEnd();
        }
        this.listContainer.style.height = `${contentHeight}px`;
        this._onDidChangeHeight.fire(height);
    }
    // An alternative to layout, this allows you to specify the number of ChatTreeItems
    // you want to show, and the max height of the container. It will then layout the
    // tree to show that many items.
    // TODO@TylerLeonhardt: This could use some refactoring to make it clear which layout strategy is being used
    setDynamicChatTreeItemLayout(numOfChatTreeItems, maxHeight) {
        this._dynamicMessageLayoutData = { numOfMessages: numOfChatTreeItems, maxHeight, enabled: true };
        this._register(this.listWidget.onDidChangeItemHeight(() => this.layoutDynamicChatTreeItemMode()));
        const mutableDisposable = this._register(new MutableDisposable());
        this._register(this.listWidget.onDidScroll((e) => {
            // TODO@TylerLeonhardt this should probably just be disposed when this is disabled
            // and then set up again when it is enabled again
            if (!this._dynamicMessageLayoutData?.enabled) {
                return;
            }
            mutableDisposable.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
                if (!e.scrollTopChanged || e.heightChanged || e.scrollHeightChanged) {
                    return;
                }
                const renderHeight = e.height;
                const diff = e.scrollHeight - renderHeight - e.scrollTop;
                if (diff === 0) {
                    return;
                }
                const possibleMaxHeight = (this._dynamicMessageLayoutData?.maxHeight ?? maxHeight);
                const width = this.bodyDimension?.width ?? this.container.offsetWidth;
                this.input.layout(width);
                const inputPartHeight = this.input.height.get();
                const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
                const newHeight = Math.min(renderHeight + diff, possibleMaxHeight - inputPartHeight - chatSuggestNextWidgetHeight);
                this.layout(newHeight + inputPartHeight + chatSuggestNextWidgetHeight, width);
            });
        }));
    }
    updateDynamicChatTreeItemLayout(numOfChatTreeItems, maxHeight) {
        this._dynamicMessageLayoutData = { numOfMessages: numOfChatTreeItems, maxHeight, enabled: true };
        let hasChanged = false;
        let height = this.bodyDimension.height;
        let width = this.bodyDimension.width;
        if (maxHeight < this.bodyDimension.height) {
            height = maxHeight;
            hasChanged = true;
        }
        const containerWidth = this.container.offsetWidth;
        if (this.bodyDimension?.width !== containerWidth) {
            width = containerWidth;
            hasChanged = true;
        }
        if (hasChanged) {
            this.layout(height, width);
        }
    }
    get isDynamicChatTreeItemLayoutEnabled() {
        return this._dynamicMessageLayoutData?.enabled ?? false;
    }
    set isDynamicChatTreeItemLayoutEnabled(value) {
        if (!this._dynamicMessageLayoutData) {
            return;
        }
        this._dynamicMessageLayoutData.enabled = value;
    }
    layoutDynamicChatTreeItemMode() {
        if (!this.viewModel || !this._dynamicMessageLayoutData?.enabled) {
            return;
        }
        const width = this.bodyDimension?.width ?? this.container.offsetWidth;
        this.input.layout(width);
        const inputHeight = this.input.height.get();
        const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
        const totalMessages = this.viewModel.getItems();
        // grab the last N messages
        const messages = totalMessages.slice(-this._dynamicMessageLayoutData.numOfMessages);
        const needsRerender = messages.some(m => m.currentRenderedHeight === undefined);
        const listHeight = needsRerender
            ? this._dynamicMessageLayoutData.maxHeight
            : messages.reduce((acc, message) => acc + message.currentRenderedHeight, 0);
        this.layout(Math.min(
        // we add an additional 18px in order to show that there is scrollable content
        inputHeight + chatSuggestNextWidgetHeight + listHeight + (totalMessages.length > 2 ? 18 : 0), this._dynamicMessageLayoutData.maxHeight), width);
        if (needsRerender || !listHeight) {
            this.listWidget.scrollToEnd();
        }
    }
    saveState() {
        // no-op
    }
    getViewState() {
        return this.input.getCurrentInputState();
    }
    updateChatInputContext() {
        const currentAgent = this.parsedInput.parts.find(part => part instanceof ChatRequestAgentPart);
        this.agentInInput.set(!!currentAgent);
    }
    async _switchToAgentByName(agentName) {
        const currentAgent = this.input.currentModeObs.get();
        // switch to appropriate agent if needed
        if (agentName !== currentAgent.name.get()) {
            // Find the mode object to get its kind
            const agent = this.chatModeService.findModeByName(agentName);
            if (agent) {
                if (currentAgent.kind !== agent.kind) {
                    const chatModeCheck = await this.instantiationService.invokeFunction(handleModeSwitch, currentAgent.kind, agent.kind, this.viewModel?.model.getRequests().length ?? 0, this.viewModel?.model);
                    if (!chatModeCheck) {
                        return;
                    }
                    if (chatModeCheck.needToClearSession) {
                        await this.clear();
                    }
                }
                this.input.setChatMode(agent.id);
            }
        }
    }
    async _applyPromptMetadata({ agent, tools, model }, requestInput) {
        if (tools !== undefined && !agent && this.input.currentModeKind !== ChatModeKind.Agent) {
            agent = ChatMode.Agent.name.get();
        }
        // switch to appropriate agent if needed
        if (agent) {
            this._switchToAgentByName(agent);
        }
        // if not tools to enable are present, we are done
        if (tools !== undefined && this.input.currentModeKind === ChatModeKind.Agent) {
            const enablementMap = this.toolsService.toToolAndToolSetEnablementMap(tools, this.input.selectedLanguageModel.get()?.metadata);
            this.input.selectedToolsModel.set(enablementMap, true);
        }
        if (model !== undefined) {
            this.input.switchModelByQualifiedName(model);
        }
    }
    /**
     * Adds additional instructions to the context
     * - instructions that have a 'applyTo' pattern that matches the current input
     * - instructions referenced in the copilot settings 'copilot-instructions'
     * - instructions referenced in an already included instruction file
     */
    async _autoAttachInstructions({ attachedContext }) {
        const contribution = this._lockedAgent ? this.chatSessionsService.getChatSessionContribution(this._lockedAgent.id) : undefined;
        // For contributed session types, default to false for autoAttachReferences.
        const isContributedSession = !!contribution;
        const autoAttachEnabled = isContributedSession ?
            contribution.autoAttachReferences === true : true;
        if (!autoAttachEnabled) {
            this.logService.debug(`ChatWidget#_autoAttachInstructions: skipped, autoAttachReferences is disabled`);
            return;
        }
        try {
            this.logService.debug(`ChatWidget#_autoAttachInstructions: prompt files are enabled`);
            const enabledTools = this.input.currentModeKind === ChatModeKind.Agent ? this.input.selectedToolsModel.userSelectedTools.get() : undefined;
            const enabledSubAgents = this.input.currentModeKind === ChatModeKind.Agent ? this.input.currentModeObs.get().agents?.get() : undefined;
            const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, this.input.currentModeKind, enabledTools, enabledSubAgents);
            await computer.collect(attachedContext, CancellationToken.None);
        }
        catch (err) {
            this.logService.error(`ChatWidget#_autoAttachInstructions: failed to compute automatic instructions`, err);
        }
    }
    delegateScrollFromMouseWheelEvent(browserEvent) {
        this.listWidget.delegateScrollFromMouseWheelEvent(browserEvent);
    }
};
ChatWidget = ChatWidget_1 = __decorate([
    __param(4, ICodeEditorService),
    __param(5, IConfigurationService),
    __param(6, IDialogService),
    __param(7, IContextKeyService),
    __param(8, IInstantiationService),
    __param(9, IChatService),
    __param(10, IChatAgentService),
    __param(11, IChatWidgetService),
    __param(12, IChatAccessibilityService),
    __param(13, ILogService),
    __param(14, IThemeService),
    __param(15, IChatSlashCommandService),
    __param(16, IChatEditingService),
    __param(17, ITelemetryService),
    __param(18, IPromptsService),
    __param(19, ILanguageModelToolsService),
    __param(20, IChatModeService),
    __param(21, IChatLayoutService),
    __param(22, IChatEntitlementService),
    __param(23, IChatSessionsService),
    __param(24, IAgentSessionsService),
    __param(25, IChatTodoListService),
    __param(26, ILifecycleService),
    __param(27, IChatAttachmentResolveService),
    __param(28, IChatTipService),
    __param(29, IChatDebugService)
], ChatWidget);
export { ChatWidget };
const MIN_LIST_HEIGHT = 50;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFdpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdFdpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxrQkFBa0IsQ0FBQztBQUMxQixPQUFPLDRCQUE0QixDQUFDO0FBQ3BDLE9BQU8sNkJBQTZCLENBQUM7QUFDckMsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFckUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDNUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFtQixjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM1RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsaUJBQWlCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN6SSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8s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