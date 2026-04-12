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
var ChatListItemRenderer_1;
import * as dom from '../../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../../base/browser/formattedTextRenderer.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { CachedListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { coalesce, distinct } from '../../../../../base/common/arrays.js';
import { findLast } from '../../../../../base/common/arraysFind.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { canceledName } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { FileAccess, Schemas } from '../../../../../base/common/network.js';
import { clamp } from '../../../../../base/common/numbers.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { MenuEntryActionViewItem, createActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { isDark } from '../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { CodiconActionViewItem } from '../../../notebook/browser/view/cellParts/cellActionView.js';
import { annotateSpecialMarkdownContent, extractSubAgentInvocationIdFromText, hasCodeblockUriTag, hasEditCodeblockUriTag } from '../../common/widget/annotations.js';
import { checkModeOption } from '../../common/chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { chatSubcommandLeader } from '../../common/requestParser/chatParserTypes.js';
import { ChatAgentVoteDirection, ChatErrorLevel, IChatService, IChatToolInvocation, isChatFollowup } from '../../common/chatService/chatService.js';
import { ChatQuestionCarouselData } from '../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { isRequestVM, isResponseVM, isPendingDividerVM } from '../../common/model/chatViewModel.js';
import { getNWords } from '../../common/model/chatWordCounter.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, CollapsedToolsDisplayMode, ThinkingDisplayMode } from '../../common/constants.js';
import { MarkHelpfulActionId } from '../actions/chatTitleActions.js';
import { IChatWidgetService } from '../chat.js';
import { ChatAgentHover, getChatAgentHoverOptions } from './chatAgentHover.js';
import { ChatContentMarkdownRenderer } from './chatContentMarkdownRenderer.js';
import { ChatAgentCommandContentPart } from './chatContentParts/chatAgentCommandContentPart.js';
import { ChatAnonymousRateLimitedPart } from './chatContentParts/chatAnonymousRateLimitedPart.js';
import { ChatAttachmentsContentPart } from './chatContentParts/chatAttachmentsContentPart.js';
import { ChatCheckpointFileChangesSummaryContentPart } from './chatContentParts/chatChangesSummaryPart.js';
import { ChatCodeCitationContentPart } from './chatContentParts/chatCodeCitationContentPart.js';
import { ChatCommandButtonContentPart } from './chatContentParts/chatCommandContentPart.js';
import { ChatConfirmationContentPart } from './chatContentParts/chatConfirmationContentPart.js';
import { DiffEditorPool, EditorPool } from './chatContentParts/chatContentCodePools.js';
import { InlineTextModelCollection } from './chatContentParts/chatContentParts.js';
import { ChatElicitationContentPart } from './chatContentParts/chatElicitationContentPart.js';
import { ChatErrorConfirmationContentPart } from './chatContentParts/chatErrorConfirmationPart.js';
import { ChatErrorContentPart } from './chatContentParts/chatErrorContentPart.js';
import { ChatQuestionCarouselPart } from './chatContentParts/chatQuestionCarouselPart.js';
import { ChatExtensionsContentPart } from './chatContentParts/chatExtensionsContentPart.js';
import { ChatMarkdownContentPart, codeblockHasClosingBackticks } from './chatContentParts/chatMarkdownContentPart.js';
import { ChatMcpServersInteractionContentPart } from './chatContentParts/chatMcpServersInteractionContentPart.js';
import { ChatDisabledClaudeHooksContentPart } from './chatContentParts/chatDisabledClaudeHooksContentPart.js';
import { ChatMultiDiffContentPart } from './chatContentParts/chatMultiDiffContentPart.js';
import { ChatProgressContentPart, ChatProgressSubPart, ChatWorkingProgressContentPart } from './chatContentParts/chatProgressContentPart.js';
import { ChatPullRequestContentPart } from './chatContentParts/chatPullRequestContentPart.js';
import { ChatQuotaExceededPart } from './chatContentParts/chatQuotaExceededPart.js';
import { ChatUsedReferencesListContentPart, CollapsibleListPool } from './chatContentParts/chatReferencesContentPart.js';
import { ChatTaskContentPart } from './chatContentParts/chatTaskContentPart.js';
import { ChatTextEditContentPart } from './chatContentParts/chatTextEditContentPart.js';
import { ChatThinkingContentPart } from './chatContentParts/chatThinkingContentPart.js';
import { ChatSubagentContentPart } from './chatContentParts/chatSubagentContentPart.js';
import { ChatTreeContentPart, TreePool } from './chatContentParts/chatTreeContentPart.js';
import { ChatWorkspaceEditContentPart } from './chatContentParts/chatWorkspaceEditContentPart.js';
import { ChatToolInvocationPart } from './chatContentParts/toolInvocationParts/chatToolInvocationPart.js';
import { ChatMarkdownDecorationsRenderer } from './chatContentParts/chatMarkdownDecorationsRenderer.js';
import { ChatCodeBlockContentProvider } from './chatContentParts/codeBlockPart.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { ChatHookContentPart } from './chatContentParts/chatHookContentPart.js';
import { HookType } from '../../common/promptSyntax/hookTypes.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { isMcpToolInvocation } from './chatContentParts/toolInvocationParts/chatToolPartUtilities.js';
import { isAgentHostTarget } from '../agentSessions/agentSessions.js';
const $ = dom.$;
const COPILOT_USERNAME = 'GitHub Copilot';
const WORKING_CAUGHT_UP_DEBOUNCE_MS = 50;
const forceVerboseLayoutTracing = false;
const mostRecentResponseClassName = 'chat-most-recent-response';
function upvoteAnimationSettingToEnum(value) {
    switch (value) {
        case 'confetti': return 1 /* ClickAnimation.Confetti */;
        case 'floatingThumbs': return 2 /* ClickAnimation.FloatingIcons */;
        case 'pulseWave': return 3 /* ClickAnimation.PulseWave */;
        case 'radiantLines': return 4 /* ClickAnimation.RadiantLines */;
        default: return undefined;
    }
}
let ChatListItemRenderer = class ChatListItemRenderer extends Disposable {
    static { ChatListItemRenderer_1 = this; }
    static { this.ID = 'item'; }
    constructor(editorOptions, rendererOptions, delegate, overflowWidgetsDomNode, viewModel, instantiationService, configService, logService, contextKeyService, themeService, commandService, hoverService, chatWidgetService, chatEntitlementService, chatService, accessibilitySignalService, accessibilityService, environmentService) {
        super();
        this.rendererOptions = rendererOptions;
        this.delegate = delegate;
        this.viewModel = viewModel;
        this.instantiationService = instantiationService;
        this.configService = configService;
        this.logService = logService;
        this.contextKeyService = contextKeyService;
        this.themeService = themeService;
        this.commandService = commandService;
        this.hoverService = hoverService;
        this.chatWidgetService = chatWidgetService;
        this.chatEntitlementService = chatEntitlementService;
        this.chatService = chatService;
        this.accessibilitySignalService = accessibilitySignalService;
        this.accessibilityService = accessibilityService;
        this.environmentService = environmentService;
        this.codeBlocksByResponseId = new Map();
        this.codeBlocksByEditorUri = new ResourceMap();
        this.fileTreesByResponseId = new Map();
        this.focusedFileTreesByResponseId = new Map();
        this.templateDataByRequestId = new Map();
        this.responseTemplateDataByRequestId = new Map();
        /** Track pending question carousels by session resource for auto-skip on chat submission */
        this.pendingQuestionCarousels = new ResourceMap();
        this._notifiedQuestionCarousels = new Set();
        this._onDidClickFollowup = this._register(new Emitter());
        this.onDidClickFollowup = this._onDidClickFollowup.event;
        this._onDidClickRerunWithAgentOrCommandDetection = this._register(new Emitter());
        this.onDidClickRerunWithAgentOrCommandDetection = this._onDidClickRerunWithAgentOrCommandDetection.event;
        this._onDidClickRequest = this._register(new Emitter());
        this.onDidClickRequest = this._onDidClickRequest.event;
        this._onDidRerender = this._register(new Emitter());
        this.onDidRerender = this._onDidRerender.event;
        this._onDidDispose = this._register(new Emitter());
        this.onDidDispose = this._onDidDispose.event;
        this._onDidFocusOutside = this._register(new Emitter());
        this.onDidFocusOutside = this._onDidFocusOutside.event;
        this._onDidChangeItemHeight = this._register(new Emitter());
        this.onDidChangeItemHeight = this._onDidChangeItemHeight.event;
        this._onDidUpdateViewModel = this._register(new Emitter());
        this._currentLayoutWidth = observableValue(this, 0);
        this._isVisible = true;
        this._onDidChangeVisibility = this._register(new Emitter());
        /**
         * Prevents re-announcement of already rendered chat progress
         * by screen readers
         */
        this._announcedToolProgressKeys = new Set();
        this.chatContentMarkdownRenderer = this.instantiationService.createInstance(ChatContentMarkdownRenderer);
        this.markdownDecorationsRenderer = this.instantiationService.createInstance(ChatMarkdownDecorationsRenderer);
        this._editorPool = this._register(this.instantiationService.createInstance(EditorPool, editorOptions, delegate, overflowWidgetsDomNode, false));
        this._toolEditorPool = this._register(this.instantiationService.createInstance(EditorPool, editorOptions, delegate, overflowWidgetsDomNode, true));
        this._diffEditorPool = this._register(this.instantiationService.createInstance(DiffEditorPool, editorOptions, delegate, overflowWidgetsDomNode, false));
        this._treePool = this._register(this.instantiationService.createInstance(TreePool, this._onDidChangeVisibility.event));
        this._contentReferencesListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event, undefined, undefined));
        this._inlineTextModels = this._register(this.instantiationService.createInstance(InlineTextModelCollection));
        this._register(this.instantiationService.createInstance(ChatCodeBlockContentProvider));
        // Auto-skip pending question carousels when user submits a new chat message
        this._register(this.chatService.onDidSubmitRequest(e => {
            const carousels = this.pendingQuestionCarousels.get(e.chatSessionResource);
            if (carousels) {
                for (const carousel of carousels) {
                    carousel.skip();
                }
                carousels.clear();
            }
        }));
        // Auto-skip all pending question carousels when auto-reply is enabled mid-session
        this._register(this.configService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ChatConfiguration.AutoReply) && this.configService.getValue(ChatConfiguration.AutoReply)) {
                for (const [, carousels] of this.pendingQuestionCarousels) {
                    for (const carousel of carousels) {
                        carousel.skip();
                    }
                    carousels.clear();
                }
            }
        }));
    }
    set pendingDragController(controller) {
        this._pendingDragController = controller;
    }
    updateOptions(options) {
        this.rendererOptions = { ...this.rendererOptions, ...options };
    }
    get templateId() {
        return ChatListItemRenderer_1.ID;
    }
    editorsInUse() {
        return Iterable.concat(this._editorPool.inUse(), this._toolEditorPool.inUse());
    }
    traceLayout(method, message) {
        if (forceVerboseLayoutTracing) {
            this.logService.info(`ChatListItemRenderer#${method}: ${message}`);
        }
        else {
            this.logService.trace(`ChatListItemRenderer#${method}: ${message}`);
        }
    }
    fireItemHeightChange(template, measuredHeight) {
        if (!template.currentElement || !template.rowContainer.isConnected) {
            return;
        }
        const height = measuredHeight ?? template.rowContainer.getBoundingClientRect().height;
        if (height === 0 || !height) {
            return;
        }
        const normalizedHeight = Math.ceil(height);
        template.currentElement.currentRenderedHeight = normalizedHeight;
        if (template.currentElement !== this._elementBeingRendered) {
            this._onDidChangeItemHeight.fire({ element: template.currentElement, height: normalizedHeight });
        }
    }
    /**
     * Compute a rate to render at in words/s.
     */
    getProgressiveRenderRate(element) {
        let Rate;
        (function (Rate) {
            Rate[Rate["Min"] = 40] = "Min";
            Rate[Rate["Max"] = 2000] = "Max";
        })(Rate || (Rate = {}));
        const minAfterComplete = 80;
        const rate = element.contentUpdateTimings?.impliedWordLoadRate;
        if (element.isComplete) {
            if (typeof rate === 'number') {
                return clamp(rate, minAfterComplete, 2000 /* Rate.Max */);
            }
            else {
                return minAfterComplete;
            }
        }
        if (typeof rate === 'number') {
            return clamp(rate, 40 /* Rate.Min */, 2000 /* Rate.Max */);
        }
        return 8;
    }
    getCodeBlockInfosForResponse(response) {
        const codeBlocks = this.codeBlocksByResponseId.get(response.id);
        return codeBlocks ?? [];
    }
    updateViewModel(viewModel) {
        this.viewModel = viewModel;
        this._announcedToolProgressKeys.clear();
        this._notifiedQuestionCarousels.clear();
        this.codeBlocksByEditorUri.clear();
        this.codeBlocksByResponseId.clear();
        this.fileTreesByResponseId.clear();
        this.focusedFileTreesByResponseId.clear();
        this.responseTemplateDataByRequestId.clear();
        this._editorPool.clear();
        this._toolEditorPool.clear();
        this._diffEditorPool.clear();
        this._treePool.clear();
        this._contentReferencesListPool.clear();
        this._onDidUpdateViewModel.fire();
    }
    getCodeBlockInfoForEditor(uri) {
        return this.codeBlocksByEditorUri.get(uri);
    }
    getFileTreeInfosForResponse(response) {
        const fileTrees = this.fileTreesByResponseId.get(response.id);
        return fileTrees ?? [];
    }
    getLastFocusedFileTreeForResponse(response) {
        const fileTrees = this.fileTreesByResponseId.get(response.id);
        const lastFocusedFileTreeIndex = this.focusedFileTreesByResponseId.get(response.id);
        if (fileTrees?.length && lastFocusedFileTreeIndex !== undefined && lastFocusedFileTreeIndex < fileTrees.length) {
            return fileTrees[lastFocusedFileTreeIndex];
        }
        return undefined;
    }
    getTemplateDataForRequestId(requestId) {
        if (!requestId) {
            return undefined;
        }
        const templateData = this.templateDataByRequestId.get(requestId);
        if (templateData && templateData.currentElement?.id === requestId) {
            return templateData;
        }
        if (templateData) {
            this.templateDataByRequestId.delete(requestId);
        }
        return undefined;
    }
    setVisible(visible) {
        this._isVisible = visible;
        this._onDidChangeVisibility.fire(visible);
    }
    layout(width) {
        const newWidth = width - 40; // padding
        if (newWidth !== this._currentLayoutWidth.get()) {
            this._currentLayoutWidth.set(newWidth, undefined);
            for (const editor of this._editorPool.inUse()) {
                editor.layout(newWidth);
            }
            for (const toolEditor of this._toolEditorPool.inUse()) {
                toolEditor.layout(newWidth);
            }
            for (const diffEditor of this._diffEditorPool.inUse()) {
                diffEditor.layout(newWidth);
            }
        }
    }
    renderTemplate(container) {
        const templateDisposables = new DisposableStore();
        const disabledOverlay = dom.append(container, $('.chat-row-disabled-overlay'));
        const rowContainer = dom.append(container, $('.interactive-item-container'));
        if (this.rendererOptions.renderStyle === 'compact') {
            rowContainer.classList.add('interactive-item-compact');
        }
        let headerParent = rowContainer;
        let valueParent = rowContainer;
        let detailContainerParent;
        if (this.rendererOptions.renderStyle === 'minimal') {
            rowContainer.classList.add('interactive-item-compact');
            rowContainer.classList.add('minimal');
            // -----------------------------------------------------
            //  icon | details
            //       | references
            //       | value
            // -----------------------------------------------------
            const lhsContainer = dom.append(rowContainer, $('.column.left'));
            const rhsContainer = dom.append(rowContainer, $('.column.right'));
            headerParent = lhsContainer;
            detailContainerParent = rhsContainer;
            valueParent = rhsContainer;
        }
        const header = dom.append(headerParent, $('.header'));
        const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
        const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
        const requestHover = dom.append(rowContainer, $('.request-hover'));
        let titleToolbar;
        if (this.rendererOptions.noHeader) {
            header.classList.add('hidden');
        }
        else {
            titleToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, requestHover, MenuId.ChatMessageTitle, {
                menuOptions: {
                    shouldForwardArgs: true
                },
                toolbarOptions: {
                    shouldInlineSubmenu: submenu => submenu.actions.length <= 1
                },
            }));
        }
        this.hoverHidden(requestHover);
        const checkpointContainer = dom.append(rowContainer, $('.checkpoint-container'));
        dom.append(checkpointContainer, $('.checkpoint-line-left'));
        const checkpointToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, checkpointContainer, MenuId.ChatMessageCheckpoint, {
            actionViewItemProvider: (action, options) => {
                if (action instanceof MenuItemAction) {
                    return this.instantiationService.createInstance(CodiconActionViewItem, action, { hoverDelegate: options.hoverDelegate });
                }
                return undefined;
            },
            renderDropdownAsChildElement: true,
            menuOptions: {
                shouldForwardArgs: true
            },
            toolbarOptions: {
                shouldInlineSubmenu: submenu => submenu.actions.length <= 1
            },
        }));
        dom.append(checkpointContainer, $('.checkpoint-line-right'));
        const user = dom.append(header, $('.user'));
        const avatarContainer = dom.append(user, $('.avatar-container'));
        const username = dom.append(user, $('h3.username'));
        username.tabIndex = 0;
        const detailContainer = dom.append(detailContainerParent ?? user, $('span.detail-container'));
        const detail = dom.append(detailContainer, $('span.detail'));
        dom.append(detailContainer, $('span.chat-animated-ellipsis'));
        const value = dom.append(valueParent, $('.value'));
        const elementDisposables = templateDisposables.add(new DisposableStore());
        const footerToolbarContainer = dom.append(rowContainer, $('.chat-footer-toolbar'));
        if (this.rendererOptions.noFooter) {
            footerToolbarContainer.classList.add('hidden');
        }
        const footerToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, footerToolbarContainer, MenuId.ChatMessageFooter, {
            menuOptions: { shouldForwardArgs: true, renderShortTitle: true },
            toolbarOptions: { shouldInlineSubmenu: submenu => submenu.actions.length <= 1 },
            actionViewItemProvider: (action, options) => {
                if (action instanceof MenuItemAction && action.item.id === MarkHelpfulActionId) {
                    const animation = upvoteAnimationSettingToEnum(this.configService.getValue('chat.upvoteAnimation'));
                    return scopedInstantiationService.createInstance(MenuEntryActionViewItem, action, { ...options, onClickAnimation: animation });
                }
                return createActionViewItem(scopedInstantiationService, action, options);
            }
        }));
        // Insert the details container into the toolbar's internal element structure
        const footerDetailsContainer = dom.append(footerToolbar.getElement(), $('.chat-footer-details'));
        footerDetailsContainer.tabIndex = 0;
        const checkpointRestoreContainer = dom.append(rowContainer, $('.checkpoint-restore-container'));
        dom.append(checkpointRestoreContainer, $('.checkpoint-line-left'));
        const label = dom.append(checkpointRestoreContainer, $('span.checkpoint-label-text'));
        label.textContent = localize('checkpointRestore', 'Checkpoint Restored');
        const dot = dom.append(checkpointRestoreContainer, $('span.checkpoint-dot-separator'));
        dot.textContent = '\u00B7';
        dot.setAttribute('aria-hidden', 'true');
        const checkpointRestoreToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, checkpointRestoreContainer, MenuId.ChatMessageRestoreCheckpoint, {
            actionViewItemProvider: (action, options) => {
                if (action instanceof MenuItemAction) {
                    return this.instantiationService.createInstance(CodiconActionViewItem, action, { hoverDelegate: options.hoverDelegate });
                }
                return undefined;
            },
            renderDropdownAsChildElement: true,
            menuOptions: {
                shouldForwardArgs: true
            },
            toolbarOptions: {
                shouldInlineSubmenu: submenu => submenu.actions.length <= 1
            },
        }));
        dom.append(checkpointRestoreContainer, $('.checkpoint-line-right'));
        const agentHover = templateDisposables.add(this.instantiationService.createInstance(ChatAgentHover));
        const hoverContent = () => {
            if (isResponseVM(template.currentElement) && template.currentElement.agent && !template.currentElement.agent.isDefault) {
                agentHover.setAgent(template.currentElement.agent.id);
                return agentHover.domNode;
            }
            return undefined;
        };
        const hoverOptions = getChatAgentHoverOptions(() => isResponseVM(template.currentElement) ? template.currentElement.agent : undefined, this.commandService);
        templateDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), user, hoverContent, hoverOptions));
        templateDisposables.add(dom.addDisposableListener(user, dom.EventType.KEY_DOWN, e => {
            const ev = new StandardKeyboardEvent(e);
            if (ev.equals(10 /* KeyCode.Space */) || ev.equals(3 /* KeyCode.Enter */)) {
                const content = hoverContent();
                if (content) {
                    this.hoverService.showInstantHover({ content, target: user, trapFocus: true, actions: hoverOptions.actions }, true);
                }
            }
            else if (ev.equals(9 /* KeyCode.Escape */)) {
                this.hoverService.hideHover();
            }
        }));
        const connectionObserver = document.createElement('connection-observer');
        dom.append(container, connectionObserver);
        const template = { header, avatarContainer, requestHover, username, detail, value, rowContainer, elementDisposables, templateDisposables, contextKeyService, instantiationService: scopedInstantiationService, agentHover, titleToolbar, footerToolbar, footerDetailsContainer, disabledOverlay, checkpointToolbar, checkpointRestoreToolbar, checkpointContainer, checkpointRestoreContainer };
        connectionObserver.onDidDisconnect = () => {
            template.renderedPartsMounted = false;
        };
        templateDisposables.add(this._onDidUpdateViewModel.event(() => {
            if (!template.currentElement || !this.viewModel?.sessionResource || !isEqual(template.currentElement.sessionResource, this.viewModel.sessionResource)) {
                this.clearRenderedParts(template);
            }
        }));
        templateDisposables.add(dom.addDisposableListener(disabledOverlay, dom.EventType.CLICK, e => {
            if (!this.viewModel?.editing) {
                return;
            }
            const current = template.currentElement;
            if (!current || current.id === this.viewModel.editing.id) {
                return;
            }
            if (disabledOverlay.classList.contains('disabled')) {
                e.preventDefault();
                e.stopPropagation();
                this._onDidFocusOutside.fire();
            }
        }));
        const resizeObserver = templateDisposables.add(new dom.DisposableResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                this.fireItemHeightChange(template, entry.borderBoxSize.at(0)?.blockSize);
            }
        }));
        templateDisposables.add(resizeObserver.observe(rowContainer));
        return template;
    }
    renderElement(node, index, templateData) {
        this._elementBeingRendered = node.element;
        try {
            this.renderChatTreeItem(node.element, index, templateData);
        }
        finally {
            this._elementBeingRendered = undefined;
        }
    }
    /**
     * Dispose the rendered parts in the template, which aren't done in disposeElement
     * so they can be reused when a new render is started.
     */
    clearRenderedParts(templateData) {
        if (templateData.renderedParts) {
            dispose(coalesce(templateData.renderedParts));
            templateData.renderedParts = undefined;
            dom.clearNode(templateData.value);
        }
        else if (isPendingDividerVM(templateData.currentElement)) {
            dom.clearNode(templateData.value);
        }
        // This template item is no longer in use, or having another element rendered into it,
        // clear the context on toolbars so it doesn't retain the viewmodel.
        if (templateData.titleToolbar) {
            templateData.titleToolbar.context = undefined;
        }
        templateData.footerToolbar.context = undefined;
        templateData.checkpointToolbar.context = undefined;
        templateData.checkpointRestoreToolbar.context = undefined;
    }
    renderChatTreeItem(element, index, templateData) {
        if (templateData.currentElement && templateData.currentElement.id !== element.id) {
            this.traceLayout('renderChatTreeItem', `Rendering a different element into the template, index=${index}`);
            const mappedTemplateData = this.templateDataByRequestId.get(templateData.currentElement.id);
            if (mappedTemplateData && (mappedTemplateData.currentElement?.id !== templateData.currentElement.id)) {
                this.templateDataByRequestId.delete(templateData.currentElement.id);
            }
            this.clearRenderedParts(templateData);
        }
        templateData.currentElement = element;
        this.templateDataByRequestId.set(element.id, templateData);
        // Clear pending-related classes and drag handle from previous renders
        // Do this before element-type checks to ensure dividers also get cleaned up
        templateData.rowContainer.classList.remove('pending-item', 'pending-divider', 'pending-request', 'chat-pending-dragging');
        templateData.dragHandle?.remove();
        templateData.dragHandle = undefined;
        delete templateData.rowContainer.dataset.pendingRequestId;
        delete templateData.rowContainer.dataset.pendingKind;
        // Handle pending divider with simplified rendering
        if (isPendingDividerVM(element)) {
            this.renderPendingDivider(element, templateData);
            return;
        }
        const kind = isRequestVM(element) ? 'request' :
            isResponseVM(element) ? 'response' :
                isPendingDividerVM(element) ? 'pendingDivider' :
                    'welcome';
        this.traceLayout('renderElement', `${kind}, index=${index}`);
        ChatContextKeys.isResponse.bindTo(templateData.contextKeyService).set(isResponseVM(element));
        ChatContextKeys.itemId.bindTo(templateData.contextKeyService).set(element.id);
        ChatContextKeys.isRequest.bindTo(templateData.contextKeyService).set(isRequestVM(element));
        ChatContextKeys.isFirstRequest.bindTo(templateData.contextKeyService).set(isRequestVM(element) && this.viewModel?.model.getRequests()[0]?.id === element.id);
        ChatContextKeys.isPendingRequest.bindTo(templateData.contextKeyService).set(isRequestVM(element) && !!element.pendingKind);
        ChatContextKeys.responseDetectedAgentCommand.bindTo(templateData.contextKeyService).set(isResponseVM(element) && element.agentOrSlashCommandDetected);
        if (isResponseVM(element)) {
            ChatContextKeys.responseSupportsIssueReporting.bindTo(templateData.contextKeyService).set(!!element.agent?.metadata.supportIssueReporting);
            ChatContextKeys.responseVote.bindTo(templateData.contextKeyService).set(element.vote === ChatAgentVoteDirection.Up ? 'up' : element.vote === ChatAgentVoteDirection.Down ? 'down' : '');
        }
        else {
            ChatContextKeys.responseVote.bindTo(templateData.contextKeyService).set('');
        }
        if (templateData.titleToolbar) {
            templateData.titleToolbar.context = element;
        }
        templateData.footerToolbar.context = element;
        // Render result details in footer if available
        if (isResponseVM(element) && element.result?.details) {
            templateData.footerDetailsContainer.textContent = element.result.details;
            templateData.footerDetailsContainer.classList.remove('hidden');
        }
        else {
            templateData.footerDetailsContainer.classList.add('hidden');
        }
        ChatContextKeys.responseHasError.bindTo(templateData.contextKeyService).set(isResponseVM(element) && !!element.errorDetails);
        const isFiltered = !!(isResponseVM(element) && element.errorDetails?.responseIsFiltered);
        ChatContextKeys.responseIsFiltered.bindTo(templateData.contextKeyService).set(isFiltered);
        const location = this.chatWidgetService.getWidgetBySessionResource(element.sessionResource)?.location;
        templateData.rowContainer.classList.toggle('editing-session', location === ChatAgentLocation.Chat);
        templateData.rowContainer.classList.toggle('interactive-request', isRequestVM(element));
        templateData.rowContainer.classList.toggle('interactive-response', isResponseVM(element));
        const progressMessageAtBottomOfResponse = checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.progressMessageAtBottomOfResponse);
        templateData.rowContainer.classList.toggle('show-detail-progress', isResponseVM(element) && !element.isComplete && !element.progressMessages.length && !progressMessageAtBottomOfResponse);
        // Toggle show-checkmarks class at the container level for the accessibility setting,
        // so child content parts can use CSS descendant selectors instead of each subscribing individually.
        const updateContainerCheckmarks = () => templateData.rowContainer.classList.toggle('show-checkmarks', !!this.configService.getValue("accessibility.chat.showCheckmarks" /* AccessibilityWorkbenchSettingId.ShowChatCheckmarks */));
        updateContainerCheckmarks();
        templateData.elementDisposables.add(this.configService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("accessibility.chat.showCheckmarks" /* AccessibilityWorkbenchSettingId.ShowChatCheckmarks */)) {
                updateContainerCheckmarks();
            }
        }));
        if (!this.rendererOptions.noHeader) {
            this.renderAvatar(element, templateData);
        }
        const isSystemInitiatedRequest = isRequestVM(element) && !!element.isSystemInitiated;
        templateData.username.textContent = element.username;
        templateData.username.classList.toggle('hidden', element.username === COPILOT_USERNAME || this.environmentService.isSessionsWindow || isSystemInitiatedRequest);
        templateData.avatarContainer.classList.toggle('hidden', element.username === COPILOT_USERNAME || this.environmentService.isSessionsWindow || isSystemInitiatedRequest);
        this.hoverHidden(templateData.requestHover);
        dom.clearNode(templateData.detail);
        if (isResponseVM(element)) {
            this.renderDetail(element, templateData);
        }
        templateData.checkpointToolbar.context = element;
        const supportsForkOrRestoration = this.rendererOptions.supportsFork || (this.rendererOptions.restorable ?? true);
        const checkpointEnabled = this.configService.getValue(ChatConfiguration.CheckpointsEnabled)
            && supportsForkOrRestoration;
        const isPendingRequest = isRequestVM(element) && !!element.pendingKind;
        templateData.checkpointContainer.classList.toggle('hidden', isResponseVM(element) || isPendingRequest || isSystemInitiatedRequest || !(checkpointEnabled));
        // Force toolbars to synchronously re-evaluate after context key changes
        // to avoid size measurement issues from the debounced menu update.
        templateData.footerToolbar.refresh();
        templateData.checkpointToolbar.refresh();
        templateData.checkpointRestoreToolbar.refresh();
        // Track response template data by request ID for cross-row hover effects
        if (isResponseVM(element)) {
            this.responseTemplateDataByRequestId.set(element.requestId, templateData);
            templateData.elementDisposables.add(toDisposable(() => this.responseTemplateDataByRequestId.delete(element.requestId)));
        }
        // unified hovering
        if (!isPendingRequest) {
            const setGroupHover = (hovered) => {
                const requestId = isRequestVM(element) ? element.id : isResponseVM(element) ? element.requestId : undefined;
                if (!requestId) {
                    return;
                }
                const reqData = this.templateDataByRequestId.get(requestId);
                const resData = this.responseTemplateDataByRequestId.get(requestId);
                reqData?.checkpointContainer.classList.toggle('group-hovered', hovered);
                resData?.rowContainer.classList.toggle('group-hovered', hovered);
            };
            templateData.elementDisposables.add(dom.addDisposableListener(templateData.rowContainer, dom.EventType.MOUSE_ENTER, () => setGroupHover(true)));
            templateData.elementDisposables.add(dom.addDisposableListener(templateData.rowContainer, dom.EventType.MOUSE_LEAVE, () => setGroupHover(false)));
            templateData.elementDisposables.add(toDisposable(() => setGroupHover(false)));
        }
        // Only show restore container when we have a checkpoint and not editing, and not a pending request
        const shouldShowRestore = this.viewModel?.model.checkpoint && !this.viewModel?.editing && (index === this.delegate.getListLength() - 1) && !isPendingRequest;
        templateData.checkpointRestoreContainer.classList.toggle('hidden', !(shouldShowRestore && checkpointEnabled));
        const editing = element.id === this.viewModel?.editing?.id;
        const isInput = this.configService.getValue('chat.editRequests') === 'input';
        templateData.elementDisposables.add(autorun(r => {
            const shouldBeBlocked = element.shouldBeBlocked.read(r);
            templateData.disabledOverlay.classList.toggle('disabled', shouldBeBlocked && !editing && this.viewModel?.editing !== undefined);
        }));
        templateData.rowContainer.classList.toggle('editing', editing && !isInput);
        templateData.rowContainer.classList.toggle('editing-input', editing && isInput);
        templateData.requestHover.classList.toggle('editing', editing && isInput);
        templateData.requestHover.classList.toggle('hidden', (!!this.viewModel?.editing && !editing) || isResponseVM(element) || !this.rendererOptions.editable || isSystemInitiatedRequest);
        templateData.requestHover.classList.toggle('expanded', this.configService.getValue('chat.editRequests') === 'hover');
        templateData.requestHover.classList.toggle('checkpoints-enabled', checkpointEnabled);
        templateData.elementDisposables.add(dom.addStandardDisposableListener(templateData.rowContainer, dom.EventType.CLICK, (e) => {
            const current = templateData.currentElement;
            if (current && this.viewModel?.editing && current.id !== this.viewModel.editing.id) {
                e.stopPropagation();
                e.preventDefault();
                this._onDidFocusOutside.fire();
            }
        }));
        // Overlay click listener removed: overlay is non-interactive in cancel-on-any-row mode.
        // hack @joaomoreno
        const rowRoot = templateData.rowContainer.parentElement?.parentElement?.parentElement;
        rowRoot?.classList.toggle('request', isRequestVM(element));
        rowRoot?.classList.toggle('response', isResponseVM(element));
        templateData.rowContainer.classList.toggle(mostRecentResponseClassName, index === this.delegate.getListLength() - 1);
        templateData.rowContainer.classList.toggle('confirmation-message', isRequestVM(element) && !!element.confirmation);
        // TODO: @justschen decide if we want to hide the header for requests or not
        const shouldShowHeader = (isResponseVM(element) && !this.rendererOptions.noHeader) && !isSystemInitiatedRequest;
        templateData.header?.classList.toggle('header-disabled', !shouldShowHeader);
        if (isRequestVM(element) && element.confirmation) {
            this.renderConfirmationAction(element, templateData);
        }
        // Do a progressive render if
        // - This the last response in the list
        // - And it has some content
        // - And the response is not complete
        //   - Or, we previously started a progressive rendering of this element (if the element is complete, we will finish progressive rendering with a very fast rate)
        if (isResponseVM(element) && index === this.delegate.getListLength() - 1 && (!element.isComplete || element.renderData)) {
            this.traceLayout('renderElement', `start progressive render, index=${index}`);
            const timer = templateData.elementDisposables.add(new dom.WindowIntervalTimer());
            const runProgressiveRender = (initial) => {
                try {
                    if (this.doNextProgressiveRender(element, index, templateData, !!initial)) {
                        timer.cancel();
                    }
                }
                catch (err) {
                    // Kill the timer if anything went wrong, avoid getting stuck in a nasty rendering loop.
                    timer.cancel();
                    this.logService.error(err);
                }
            };
            timer.cancelAndSet(runProgressiveRender, 50, dom.getWindow(templateData.rowContainer));
            runProgressiveRender(true);
        }
        else {
            if (isResponseVM(element)) {
                this.renderChatResponseBasic(element, index, templateData);
            }
            else if (isRequestVM(element)) {
                this.renderChatRequest(element, index, templateData);
            }
        }
        templateData.renderedPartsMounted = true;
    }
    renderPendingDivider(element, templateData) {
        templateData.rowContainer.classList.add('pending-item');
        templateData.rowContainer.classList.add('pending-divider');
        templateData.rowContainer.classList.remove('interactive-request', 'interactive-response', 'pending-request');
        // Hide header elements not applicable to pending divider
        templateData.avatarContainer.classList.add('hidden');
        templateData.username.classList.add('hidden');
        templateData.requestHover.classList.add('hidden');
        templateData.checkpointContainer.classList.add('hidden');
        templateData.checkpointRestoreContainer.classList.add('hidden');
        templateData.footerToolbar.getElement().classList.add('hidden');
        if (templateData.titleToolbar) {
            templateData.titleToolbar.getElement().classList.add('hidden');
        }
        dom.clearNode(templateData.value);
        dom.clearNode(templateData.detail);
        const dividerContent = dom.$('.pending-divider-content');
        const label = dom.append(dividerContent, dom.$('span.pending-divider-label'));
        if (element.dividerKind === "steering" /* ChatRequestQueueKind.Steering */) {
            label.textContent = localize('steeringDivider', "Steering");
            label.title = localize('steeringDividerTooltip', "Steering message will be sent after the next tool call happens");
        }
        else {
            label.textContent = localize('queuedDivider', "Queued");
            label.title = localize('queuedDividerTooltip', "Queued messages will be sent after the current request completes");
        }
        templateData.value.appendChild(dividerContent);
    }
    renderDetail(element, templateData) {
        dom.clearNode(templateData.detail);
        if (element.agentOrSlashCommandDetected) {
            const msg = element.slashCommand ? localize('usedAgentSlashCommand', "used {0} [[(rerun without)]]", `${chatSubcommandLeader}${element.slashCommand.name}`) : localize('usedAgent', "[[(rerun without)]]");
            dom.reset(templateData.detail, renderFormattedText(msg, {
                actionHandler: {
                    disposables: templateData.elementDisposables,
                    callback: (content) => {
                        this._onDidClickRerunWithAgentOrCommandDetection.fire(element);
                    },
                }
            }, $('span.agentOrSlashCommandDetected')));
        }
        else if (this.rendererOptions.renderStyle !== 'minimal' && !element.isComplete && !checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.progressMessageAtBottomOfResponse)) {
            templateData.detail.textContent = localize('working', "Working");
        }
    }
    renderConfirmationAction(element, templateData) {
        dom.clearNode(templateData.detail);
        if (element.confirmation) {
            dom.append(templateData.detail, $('span.codicon.codicon-check', { 'aria-hidden': 'true' }));
            dom.append(templateData.detail, $('span.confirmation-text', undefined, localize('chatConfirmationAction', 'Selected "{0}"', element.confirmation)));
            templateData.header?.classList.remove('header-disabled');
            templateData.header?.classList.add('partially-disabled');
        }
    }
    renderAvatar(element, templateData) {
        if (isPendingDividerVM(element)) {
            return;
        }
        let icon;
        if (isResponseVM(element)) {
            icon = this.getAgentIcon(element.agent?.metadata);
        }
        else if (isRequestVM(element)) {
            icon = element.avatarIcon ?? Codicon.account;
        }
        else {
            icon = Codicon.account;
        }
        if (icon instanceof URI) {
            const avatarIcon = dom.$('img.icon');
            avatarIcon.src = FileAccess.uriToBrowserUri(icon).toString(true);
            templateData.avatarContainer.replaceChildren(dom.$('.avatar', undefined, avatarIcon));
        }
        else {
            const avatarIcon = dom.$(ThemeIcon.asCSSSelector(icon));
            templateData.avatarContainer.replaceChildren(dom.$('.avatar.codicon-avatar', undefined, avatarIcon));
        }
    }
    getAgentIcon(agent) {
        if (agent?.themeIcon) {
            return agent.themeIcon;
        }
        else if (agent?.iconDark && isDark(this.themeService.getColorTheme().type)) {
            return agent.iconDark;
        }
        else if (agent?.icon) {
            return agent.icon;
        }
        else {
            return Codicon.chatSparkle;
        }
    }
    renderChatResponseBasic(element, index, templateData) {
        templateData.rowContainer.classList.toggle('chat-response-loading', (isResponseVM(element) && !element.isComplete));
        if (element.isComplete || element.isCanceled) {
            const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
            if (lastThinking?.domNode && lastThinking.getIsActive()) {
                lastThinking.finalizeTitleIfDefault();
                lastThinking.markAsInactive();
            }
            this.finalizeAllSubagentParts(templateData);
        }
        const content = [];
        const isFiltered = !!element.errorDetails?.responseIsFiltered;
        if (!isFiltered) {
            // Always add the references to avoid shifting the content parts when a reference is added, and having to re-diff all the content.
            // The part will hide itself if the list is empty.
            content.push({ kind: 'references', references: element.contentReferences });
            content.push(...annotateSpecialMarkdownContent(element.response.value));
            if (element.codeCitations.length) {
                content.push({ kind: 'codeCitations', citations: element.codeCitations });
            }
        }
        if (element.model.response === element.model.entireResponse && element.errorDetails?.message && element.errorDetails.message !== canceledName) {
            content.push({ kind: 'errorDetails', errorDetails: element.errorDetails, isLast: index === this.delegate.getListLength() - 1 });
        }
        const fileChangesSummaryPart = this.getChatFileChangesSummaryPart(element);
        if (fileChangesSummaryPart) {
            content.push(fileChangesSummaryPart);
        }
        const diff = this.diff(templateData.renderedParts ?? [], content, element);
        this.renderChatContentDiff(diff, content, element, index, templateData);
    }
    shouldShowWorkingProgress(element, partsToRender, moreContentAvailable, templateData) {
        if (element.agentOrSlashCommandDetected || this.rendererOptions.renderStyle === 'minimal' || element.isComplete || !checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.progressMessageAtBottomOfResponse)) {
            return false;
        }
        // Don't show working if a streaming tool invocation is already present
        if (partsToRender.some(part => part.kind === 'toolInvocation' && IChatToolInvocation.isStreaming(part))) {
            return false;
        }
        // Don't show working spinner when there's an in-progress MCP tool - MCP tools have their own progress indicator
        if (partsToRender.some(part => part.kind === 'toolInvocation' && !IChatToolInvocation.isComplete(part) && isMcpToolInvocation(part))) {
            return false;
        }
        // Show if no content, only "used references", ends with a complete tool call, or ends with complete text edits and there is no incomplete tool call (edits are still being applied some time after they are all generated)
        const lastPart = findLast(partsToRender, part => part.kind !== 'markdownContent' || part.content.value.trim().length > 0);
        // never show working progress when there is an active thinking piece
        const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
        if (lastThinking) {
            return false;
        }
        // Never show working when the last part is a tool invocation that is attached to thinking,
        // or *will be* attached to thinking during the upcoming render pass
        if (lastPart && (lastPart.kind === 'toolInvocation' || lastPart.kind === 'toolInvocationSerialized')) {
            if (lastPart.isAttachedToThinking) {
                return false;
            }
            const collapsedToolsMode = this.configService.getValue('chat.agent.thinking.collapsedTools');
            if (collapsedToolsMode !== CollapsedToolsDisplayMode.Off && this.shouldPinPart(lastPart, isResponseVM(element) ? element : undefined)) {
                return false;
            }
        }
        const hasRenderedThinkingPart = (templateData.renderedParts ?? []).some(part => part instanceof ChatThinkingContentPart);
        const hasEditPillMarkdown = partsToRender.some(part => part.kind === 'markdownContent' && this.hasEditCodeblockUri(part));
        if (hasRenderedThinkingPart && hasEditPillMarkdown) {
            return false;
        }
        // Don't show working spinner when there's any active subagent - subagents have their own progress indicator
        if (this.getSubagentPart(templateData.renderedParts)) {
            return false;
        }
        if (!lastPart ||
            lastPart.kind === 'references' ||
            (lastPart.kind === 'markdownContent' && !moreContentAvailable && this.hasBeenCaughtUpLongEnough(element)) ||
            ((lastPart.kind === 'toolInvocation' || lastPart.kind === 'toolInvocationSerialized') && (IChatToolInvocation.isComplete(lastPart) || IChatToolInvocation.isEffectivelyHidden(lastPart))) ||
            ((lastPart.kind === 'textEditGroup' || lastPart.kind === 'notebookEditGroup') && lastPart.done && !partsToRender.some(part => part.kind === 'toolInvocation' && !IChatToolInvocation.isComplete(part))) ||
            (lastPart.kind === 'progressTask' && lastPart.deferred.isSettled) ||
            lastPart.kind === 'mcpServersStarting' ||
            lastPart.kind === 'disabledClaudeHooks' ||
            lastPart.kind === 'hook') {
            return true;
        }
        return false;
    }
    /**
     *  Adds a debounce on when to show "working" shimmer.
     */
    hasBeenCaughtUpLongEnough(element) {
        const lastRenderTime = element.renderData?.lastRenderTime;
        if (typeof lastRenderTime !== 'number' || lastRenderTime === 0) {
            return false;
        }
        return (Date.now() - lastRenderTime) >= WORKING_CAUGHT_UP_DEBOUNCE_MS;
    }
    getChatFileChangesSummaryPart(element) {
        if (!this.shouldShowFileChangesSummary(element)) {
            return undefined;
        }
        if (!element.model.entireResponse.value.some(part => part.kind === 'textEditGroup' || part.kind === 'notebookEditGroup')) {
            return undefined;
        }
        return { kind: 'changesSummary', requestId: element.requestId, sessionResource: element.sessionResource };
    }
    renderChatRequest(element, index, templateData) {
        templateData.rowContainer.classList.toggle('chat-response-loading', false);
        templateData.rowContainer.classList.toggle('pending-request', !!element.pendingKind);
        templateData.rowContainer.classList.toggle('system-initiated-request', !!element.isSystemInitiated);
        // System-initiated requests render as compact progress-style messages
        if (element.isSystemInitiated) {
            this.renderSystemInitiatedRequest(element, templateData);
            return;
        }
        if (element.pendingKind && this._pendingDragController) {
            templateData.rowContainer.dataset.pendingRequestId = element.id;
            templateData.rowContainer.dataset.pendingKind = element.pendingKind;
            const sameKindCount = (this.viewModel?.model.getPendingRequests() ?? []).filter(p => p.kind === element.pendingKind).length;
            if (sameKindCount > 1) {
                const handle = dom.$('.chat-pending-drag-handle' + ThemeIcon.asCSSSelector(Codicon.gripper));
                templateData.rowContainer.prepend(handle);
                templateData.dragHandle = handle;
                this._pendingDragController.attachDragHandle(element, handle, templateData.rowContainer, templateData.elementDisposables);
            }
        }
        if (element.id === this.viewModel?.editing?.id) {
            this._onDidRerender.fire(templateData);
        }
        if (this.configService.getValue('chat.editRequests') !== 'none' && this.rendererOptions.editable) {
            templateData.elementDisposables.add(dom.addDisposableListener(templateData.rowContainer, dom.EventType.KEY_DOWN, e => {
                const ev = new StandardKeyboardEvent(e);
                if (ev.equals(10 /* KeyCode.Space */) || ev.equals(3 /* KeyCode.Enter */)) {
                    if (this.viewModel?.editing?.id !== element.id) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        this._onDidClickRequest.fire(templateData);
                    }
                }
            }));
        }
        let content = [];
        if (!element.confirmation) {
            const markdown = isChatFollowup(element.message) ?
                element.message.message :
                this.markdownDecorationsRenderer.convertParsedRequestToMarkdown(element.sessionResource, element.message);
            content = [{ content: new MarkdownString(markdown), kind: 'markdownContent' }];
            if (this.rendererOptions.renderStyle === 'minimal' && !element.isComplete) {
                templateData.value.classList.add('inline-progress');
                templateData.elementDisposables.add(toDisposable(() => templateData.value.classList.remove('inline-progress')));
                content.push({ content: new MarkdownString('<span></span>', { supportHtml: true }), kind: 'markdownContent' });
            }
            else {
                templateData.value.classList.remove('inline-progress');
            }
        }
        dom.clearNode(templateData.value);
        const parts = [];
        let inlineSlashCommandRendered = false;
        let codeBlockStartIndex = 0;
        content.forEach((data, contentIndex) => {
            const context = {
                element,
                elementIndex: index,
                contentIndex: contentIndex,
                content: content,
                container: templateData.rowContainer,
                editorPool: this._editorPool,
                diffEditorPool: this._diffEditorPool,
                currentWidth: this._currentLayoutWidth,
                onDidChangeVisibility: this._onDidChangeVisibility.event,
                inlineTextModels: this._inlineTextModels,
                codeBlockStartIndex,
                treeStartIndex: 0, // no trees in requests
            };
            const newPart = this.renderChatContentPart(data, templateData, context);
            if (newPart) {
                if (this.rendererOptions.renderDetectedCommandsWithRequest
                    && !inlineSlashCommandRendered
                    && element.agentOrSlashCommandDetected && element.slashCommand
                    && data.kind === 'markdownContent' // TODO this is fishy but I didn't find a better way to render on the same inline as the MD request part
                ) {
                    if (newPart.domNode) {
                        newPart.domNode.style.display = 'inline-flex';
                    }
                    const cmdPart = this.instantiationService.createInstance(ChatAgentCommandContentPart, element.slashCommand, () => this._onDidClickRerunWithAgentOrCommandDetection.fire({ sessionResource: element.sessionResource, requestId: element.id }));
                    templateData.value.appendChild(cmdPart.domNode);
                    parts.push(cmdPart);
                    inlineSlashCommandRendered = true;
                }
                if (newPart.domNode && !newPart.domNode.parentElement) {
                    templateData.value.appendChild(newPart.domNode);
                }
                parts.push(newPart);
                codeBlockStartIndex += newPart.codeblocks?.length ?? 0;
            }
        });
        if (templateData.renderedParts) {
            dispose(templateData.renderedParts);
        }
        templateData.renderedParts = parts;
        if (element.variables.length) {
            const newPart = this.renderAttachments(element.variables, element.contentReferences, templateData);
            if (newPart.domNode) {
                // p has a :last-child rule for margin
                templateData.value.appendChild(newPart.domNode);
            }
            templateData.elementDisposables.add(newPart);
        }
    }
    renderSystemInitiatedRequest(element, templateData) {
        dom.clearNode(templateData.value);
        if (templateData.renderedParts) {
            dispose(templateData.renderedParts);
        }
        templateData.renderedParts = [];
        const label = element.systemInitiatedLabel ?? element.messageText;
        const rendered = this.chatContentMarkdownRenderer.render(new MarkdownString(label));
        templateData.elementDisposables.add(rendered);
        rendered.element.classList.add('progress-step');
        const progressPart = this.instantiationService.createInstance(ChatProgressSubPart, rendered.element, Codicon.check, undefined);
        templateData.elementDisposables.add(progressPart);
        templateData.value.appendChild(progressPart.domNode);
    }
    /**
     *	@returns true if progressive rendering should be considered complete- the element's data is fully rendered or the view is not visible
     */
    doNextProgressiveRender(element, index, templateData, isInRenderElement) {
        if (!this._isVisible) {
            return true;
        }
        if (element.isCanceled) {
            this.traceLayout('doNextProgressiveRender', `canceled, index=${index}`);
            element.renderData = undefined;
            this.renderChatResponseBasic(element, index, templateData);
            return true;
        }
        templateData.rowContainer.classList.toggle('chat-response-loading', true);
        this.traceLayout('doNextProgressiveRender', `START progressive render, index=${index}`);
        const contentForThisTurn = this.getNextProgressiveRenderContent(element, templateData);
        const partsToRender = this.diff(templateData.renderedParts ?? [], contentForThisTurn.content, element);
        const contentIsAlreadyRendered = partsToRender.every(part => part === null);
        if (contentIsAlreadyRendered) {
            if (contentForThisTurn.moreContentAvailable) {
                // The content that we want to render in this turn is already rendered, but there is more content to render on the next tick
                this.traceLayout('doNextProgressiveRender', 'not rendering any new content this tick, but more available');
                return false;
            }
            else if (element.isComplete) {
                // All content is rendered, and response is done, so do a normal render
                this.traceLayout('doNextProgressiveRender', `END progressive render, index=${index} and clearing renderData, response is complete`);
                element.renderData = undefined;
                this.renderChatResponseBasic(element, index, templateData);
                return true;
            }
            else {
                // Nothing new to render, stop rendering until next model update
                this.traceLayout('doNextProgressiveRender', 'caught up with the stream- no new content to render');
                return true;
            }
        }
        // Do an actual progressive render
        this.traceLayout('doNextProgressiveRender', `doing progressive render, ${partsToRender.length} parts to render`);
        this.renderChatContentDiff(partsToRender, contentForThisTurn.content, element, index, templateData);
        return false;
    }
    renderChatContentDiff(partsToRender, contentForThisTurn, element, elementIndex, templateData) {
        const renderedParts = templateData.renderedParts ?? [];
        templateData.renderedParts = renderedParts;
        let codeBlockStartIndex = 0;
        let treeStartIndex = 0;
        partsToRender.forEach((partToRender, contentIndex) => {
            // Accumulate counts from the part that ended up at the previous index
            if (contentIndex > 0) {
                const prevPart = renderedParts[contentIndex - 1];
                if (prevPart) {
                    codeBlockStartIndex += prevPart.codeblocks?.length ?? 0;
                    if (prevPart instanceof ChatTreeContentPart) {
                        treeStartIndex++;
                    }
                }
            }
            const alreadyRenderedPart = templateData.renderedParts?.[contentIndex];
            if (!partToRender) {
                // null=no change
                if (!templateData.renderedPartsMounted) {
                    alreadyRenderedPart?.onDidRemount?.();
                }
                return;
            }
            // keep existing thinking part instance during streaming and update it in place
            if (alreadyRenderedPart) {
                if (partToRender.kind === 'thinking' && alreadyRenderedPart instanceof ChatThinkingContentPart) {
                    if (!Array.isArray(partToRender.value)) {
                        alreadyRenderedPart.updateThinking(partToRender);
                    }
                    renderedParts[contentIndex] = alreadyRenderedPart;
                    return;
                }
                else if (alreadyRenderedPart instanceof ChatThinkingContentPart && this.shouldPinPart(partToRender, element)) {
                    // keep existing thinking part if we are pinning it (combining tool calls into it)
                    renderedParts[contentIndex] = alreadyRenderedPart;
                    return;
                }
                alreadyRenderedPart.dispose();
                // Replace old DOM from thinking wrapper to prevent accumulation
                // of duplicate entries when re-rendering pinned parts.
                if (alreadyRenderedPart.domNode) {
                    const thinkingToolWrapper = dom.findParentWithClass(alreadyRenderedPart.domNode, 'chat-thinking-tool-wrapper');
                    if (thinkingToolWrapper) {
                        thinkingToolWrapper.replaceWith(alreadyRenderedPart.domNode);
                    }
                }
            }
            const context = {
                element,
                elementIndex: elementIndex,
                content: contentForThisTurn,
                contentIndex: contentIndex,
                container: templateData.rowContainer,
                editorPool: this._editorPool,
                diffEditorPool: this._diffEditorPool,
                currentWidth: this._currentLayoutWidth,
                onDidChangeVisibility: this._onDidChangeVisibility.event,
                inlineTextModels: this._inlineTextModels,
                codeBlockStartIndex,
                treeStartIndex,
            };
            // combine tool invocations into thinking part if needed. render the tool, but do not replace the working spinner with the new part's dom node since it is already inside the thinking part.
            const lastThinking = this.getLastThinkingPart(renderedParts);
            if (lastThinking && (partToRender.kind === 'toolInvocation' || partToRender.kind === 'toolInvocationSerialized' || partToRender.kind === 'markdownContent' || partToRender.kind === 'textEditGroup' || partToRender.kind === 'hook') && this.shouldPinPart(partToRender, element)) {
                const newPart = this.renderChatContentPart(partToRender, templateData, context);
                if (newPart) {
                    renderedParts[contentIndex] = newPart;
                    if (alreadyRenderedPart instanceof ChatWorkingProgressContentPart && alreadyRenderedPart?.domNode) {
                        alreadyRenderedPart.domNode.remove();
                    }
                }
                return;
            }
            const newPart = this.renderChatContentPart(partToRender, templateData, context);
            if (newPart) {
                renderedParts[contentIndex] = newPart;
                // Maybe the part can't be rendered in this context, but this shouldn't really happen
                try {
                    if (alreadyRenderedPart?.domNode) {
                        if (newPart.domNode) {
                            alreadyRenderedPart.domNode.replaceWith(newPart.domNode);
                        }
                        else {
                            alreadyRenderedPart.domNode.remove();
                        }
                    }
                    else if (newPart.domNode && !newPart.domNode.parentElement) {
                        // Only append if not already attached somewhere else (e.g. inside a thinking wrapper)
                        templateData.value.appendChild(newPart.domNode);
                    }
                }
                catch (err) {
                    this.logService.error('ChatListItemRenderer#renderChatContentDiff: error replacing part', err);
                }
            }
            else {
                alreadyRenderedPart?.domNode?.remove();
            }
        });
        // Delete previously rendered parts that are removed
        for (let i = partsToRender.length; i < renderedParts.length; i++) {
            const part = renderedParts[i];
            if (part) {
                part.dispose();
                part.domNode?.remove();
                delete renderedParts[i];
            }
        }
    }
    /**
     * Returns all content parts that should be rendered, and trimmed markdown content. We will diff this with the current rendered set.
     */
    getNextProgressiveRenderContent(element, templateData) {
        const data = this.getDataForProgressiveRender(element);
        // An unregistered setting for development- skip the word counting and smoothing, just render content as it comes in
        const renderImmediately = this.configService.getValue('chat.experimental.renderMarkdownImmediately') === true;
        const renderableResponse = annotateSpecialMarkdownContent(element.response.value);
        this.traceLayout('getNextProgressiveRenderContent', `Want to render ${data.numWordsToRender} at ${data.rate} words/s, counting...`);
        let numNeededWords = data.numWordsToRender;
        const partsToRender = [];
        // Always add the references to avoid shifting the content parts when a reference is added, and having to re-diff all the content.
        // The part will hide itself if the list is empty.
        partsToRender.push({ kind: 'references', references: element.contentReferences });
        let moreContentAvailable = false;
        for (let i = 0; i < renderableResponse.length; i++) {
            const part = renderableResponse[i];
            if (part.kind === 'markdownContent' && !renderImmediately) {
                const wordCountResult = getNWords(part.content.value, numNeededWords);
                this.traceLayout('getNextProgressiveRenderContent', `  Chunk ${i}: Want to render ${numNeededWords} words and found ${wordCountResult.returnedWordCount} words. Total words in chunk: ${wordCountResult.totalWordCount}`);
                numNeededWords -= wordCountResult.returnedWordCount;
                if (wordCountResult.isFullString) {
                    partsToRender.push(part);
                    // Consumed full markdown chunk- need to ensure that all following non-markdown parts are rendered
                    for (const nextPart of renderableResponse.slice(i + 1)) {
                        if (nextPart.kind !== 'markdownContent') {
                            i++;
                            partsToRender.push(nextPart);
                        }
                        else {
                            break;
                        }
                    }
                }
                else {
                    // Only taking part of this markdown part
                    moreContentAvailable = true;
                    partsToRender.push({ ...part, content: new MarkdownString(wordCountResult.value, part.content) });
                }
                if (numNeededWords <= 0) {
                    // Collected all words and following non-markdown parts if needed, done
                    if (renderableResponse.slice(i + 1).some(part => part.kind === 'markdownContent')) {
                        moreContentAvailable = true;
                    }
                    break;
                }
            }
            else {
                partsToRender.push(part);
            }
        }
        const lastWordCount = element.contentUpdateTimings?.lastWordCount ?? 0;
        const newRenderedWordCount = data.numWordsToRender - numNeededWords;
        const bufferWords = lastWordCount - newRenderedWordCount;
        this.traceLayout('getNextProgressiveRenderContent', `Want to render ${data.numWordsToRender} words. Rendering ${newRenderedWordCount} words. Buffer: ${bufferWords} words`);
        if (newRenderedWordCount > 0 && newRenderedWordCount !== element.renderData?.renderedWordCount) {
            // Only update lastRenderTime when we actually render new content
            element.renderData = { lastRenderTime: Date.now(), renderedWordCount: newRenderedWordCount, renderedParts: partsToRender };
        }
        if (this.shouldShowWorkingProgress(element, partsToRender, moreContentAvailable, templateData)) {
            partsToRender.push({ kind: 'working' });
        }
        const fileChangesSummaryPart = this.getChatFileChangesSummaryPart(element);
        if (fileChangesSummaryPart) {
            partsToRender.push(fileChangesSummaryPart);
        }
        return { content: partsToRender, moreContentAvailable };
    }
    shouldShowFileChangesSummary(element) {
        // Only show file changes summary for local sessions - background sessions already have their own file changes part
        const sessionType = getChatSessionType(element.sessionResource);
        const isLocalSession = sessionType === localChatSessionType || isAgentHostTarget(sessionType);
        return element.isComplete && isLocalSession && this.configService.getValue('chat.checkpoints.showFileChanges');
    }
    getDataForProgressiveRender(element) {
        const hasMarkdownParts = element.response.value.some(part => part.kind === 'markdownContent' && part.content.value.trim().length > 0);
        if (!element.isComplete && hasMarkdownParts && (element.contentUpdateTimings ? element.contentUpdateTimings.lastWordCount : 0) === 0) {
            /**
             * None of the content parts in the ongoing response have been rendered yet,
             * so we should render all existing parts without animation.
             */
            return {
                numWordsToRender: Number.MAX_SAFE_INTEGER,
                rate: Number.MAX_SAFE_INTEGER
            };
        }
        const renderData = element.renderData ?? { lastRenderTime: 0, renderedWordCount: 0 };
        const rate = this.getProgressiveRenderRate(element);
        const numWordsToRender = renderData.lastRenderTime === 0 ?
            1 :
            renderData.renderedWordCount +
                // Additional words to render beyond what's already rendered
                Math.floor((Date.now() - renderData.lastRenderTime) / 1000 * rate);
        return {
            numWordsToRender,
            rate
        };
    }
    diff(renderedParts, contentToRender, element) {
        const diff = [];
        for (let i = 0; i < contentToRender.length; i++) {
            const content = contentToRender[i];
            const renderedPart = renderedParts[i];
            if (!renderedPart || !renderedPart.hasSameContent(content, contentToRender.slice(i + 1), element)) {
                diff.push(content);
            }
            else {
                // null -> no change
                diff.push(null);
            }
        }
        return diff;
    }
    hasEditCodeblockUri(part) {
        if (part.kind !== 'markdownContent') {
            return false;
        }
        return hasEditCodeblockUriTag(part.content.value);
    }
    isCodeblockComplete(part, element) {
        if (part.kind !== 'markdownContent') {
            return true;
        }
        return !isResponseVM(element) || element.isComplete || codeblockHasClosingBackticks(part.content.value);
    }
    // todo @justschen initially split up each of the checks to easily see what should be pinned/not pinned, we can probably consolidate this down by a lot once we're more confident in the logic.
    shouldPinPart(part, element) {
        const collapsedToolsMode = this.configService.getValue('chat.agent.thinking.collapsedTools');
        // thinking and working content are always pinned (they are the thinking container itself)
        if (part.kind === 'thinking' || part.kind === 'working') {
            return true;
        }
        // should not finalize thinking
        if (part.kind === 'undoStop') {
            return true;
        }
        // only tool related hooks will be inside thinking containers.
        if (part.kind === 'hook') {
            if (part.subAgentInvocationId) {
                return false;
            }
            return part.hookType === HookType.PreToolUse || part.hookType === HookType.PostToolUse;
        }
        if (collapsedToolsMode === CollapsedToolsDisplayMode.Off) {
            return false;
        }
        // is an edit related part
        if (this.hasEditCodeblockUri(part) || part.kind === 'textEditGroup') {
            return true;
        }
        // Don't pin MCP tools + for CLI specficially, we parse tool name since CLI tools are "external" tools.
        const isMcpTool = (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && isMcpToolInvocation(part);
        if (isMcpTool) {
            return false;
        }
        // don't pin Mermaid tools since it has rendered output
        const isMermaidTool = (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && part.toolId.toLowerCase().includes('mermaid');
        if (isMermaidTool) {
            return false;
        }
        // don't pin ask questions tool invocations
        const isAskQuestionsTool = (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && (part.toolId === 'copilot_askQuestions' || part.toolId === 'vscode_askQuestions');
        if (isAskQuestionsTool) {
            return false;
        }
        // Don't pin subagent tools to thinking parts - they have their own grouping
        if ((part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && isSubagentToolInvocation(part)) {
            return false;
        }
        // only pin terminal tools based on settings
        const isTerminalTool = (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && part.toolSpecificData?.kind === 'terminal';
        const isContributedTerminalToolInvocation = element
            && (element.sessionResource.scheme !== Schemas.vscodeChatInput && element.sessionResource.scheme !== Schemas.vscodeLocalChatSession) // contributed sessions
            && part.kind === 'toolInvocationSerialized' && part.toolSpecificData?.kind === 'terminal'; // contributed serialized terminal tool invocations data
        if (isTerminalTool && !isContributedTerminalToolInvocation) {
            // don't pin terminals with confirmation
            if (part.kind === 'toolInvocation' && IChatToolInvocation.getConfirmationMessages(part)) {
                return false;
            }
            const terminalToolsInThinking = this.configService.getValue(ChatConfiguration.TerminalToolsInThinking);
            return !!terminalToolsInThinking;
        }
        if (part.kind === 'toolInvocation') {
            // pin when streaming since we don't know if we have confirmation yet or not
            if (IChatToolInvocation.isStreaming(part)) {
                return true;
            }
            // don't pin if waiting for confirmation or post-approval
            const state = part.state.get();
            if (state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ || state.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
                return false;
            }
            return !IChatToolInvocation.getConfirmationMessages(part);
        }
        if (part.kind === 'toolInvocationSerialized') {
            return true;
        }
        return false;
    }
    getLastThinkingPart(renderedParts) {
        if (!renderedParts || renderedParts.length === 0) {
            return undefined;
        }
        // Search backwards for the most recent active thinking part
        for (let i = renderedParts.length - 1; i >= 0; i--) {
            const part = renderedParts[i];
            if (part instanceof ChatThinkingContentPart && part.getIsActive()) {
                return part;
            }
        }
        return undefined;
    }
    /**
     * Determines if a thinking part at the given content index is "look-ahead complete".
     * A thinking part is look-ahead complete if there are subsequent parts that will NOT
     * be pinned to it, meaning we know this thinking part is already done even though
     * the overall response is still in progress.
     */
    isThinkingLookAheadComplete(context, element) {
        // If element is already complete, no need for look-ahead
        if (element?.isComplete) {
            return true;
        }
        // Look at all parts after the current content index
        for (let i = context.contentIndex + 1; i < context.content.length; i++) {
            const nextPart = context.content[i];
            // If there's any part that would NOT be pinned to the thinking part,
            // then this thinking part is already complete
            if (!this.shouldPinPart(nextPart, element)) {
                return true;
            }
        }
        return false;
    }
    getSubagentPart(renderedParts, subAgentInvocationId) {
        if (!renderedParts || renderedParts.length === 0) {
            return undefined;
        }
        // Search backwards for the most recent subagent part
        for (let i = renderedParts.length - 1; i >= 0; i--) {
            const part = renderedParts[i];
            if (part instanceof ChatSubagentContentPart) {
                // If looking for a specific ID, return the part with that ID regardless of active state
                if (subAgentInvocationId && part.subAgentInvocationId === subAgentInvocationId) {
                    return part;
                }
                // If no ID specified, only return active parts
                if (!subAgentInvocationId && part.getIsActive()) {
                    return part;
                }
            }
        }
        return undefined;
    }
    finalizeAllSubagentParts(templateData) {
        if (!templateData.renderedParts) {
            return;
        }
        // Finalize all active subagent parts (there can be multiple parallel subagents)
        for (const part of templateData.renderedParts) {
            if (part instanceof ChatSubagentContentPart && part.getIsActive()) {
                part.markAsInactive();
            }
        }
    }
    handleSubagentToolGrouping(toolInvocation, subagentId, context, templateData, codeBlockStartIndex) {
        // Finalize any active thinking part since subagent tools have their own grouping
        this.finalizeCurrentThinkingPart(context, templateData);
        const lastSubagent = this.getSubagentPart(templateData.renderedParts, subagentId);
        if (lastSubagent) {
            // Append to existing subagent part with matching ID
            // But skip the parent subagent tool itself - we only want child tools
            if (!isParentSubagentTool(toolInvocation)) {
                lastSubagent.appendToolInvocation(toolInvocation, codeBlockStartIndex);
            }
            return lastSubagent;
        }
        // Create a new subagent part - it will extract description/agentName/prompt and watch for completion
        const subagentPart = this.instantiationService.createInstance(ChatSubagentContentPart, subagentId, toolInvocation, context, this.chatContentMarkdownRenderer, this._contentReferencesListPool, this._toolEditorPool, () => this._currentLayoutWidth.get(), this._announcedToolProgressKeys);
        // Don't append the parent subagent tool itself - its description is already shown in the title
        // Only append child tools (those with subAgentInvocationId)
        if (!isParentSubagentTool(toolInvocation)) {
            subagentPart.appendToolInvocation(toolInvocation, codeBlockStartIndex);
        }
        return subagentPart;
    }
    finalizeCurrentThinkingPart(context, templateData) {
        const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
        if (!lastThinking) {
            return;
        }
        const style = this.configService.getValue('chat.agent.thinkingStyle');
        if (style === ThinkingDisplayMode.CollapsedPreview) {
            lastThinking.collapseContent();
        }
        lastThinking.finalizeTitleIfDefault();
        lastThinking.resetId();
        lastThinking.markAsInactive();
    }
    renderChatContentPart(content, templateData, context) {
        try {
            // if we get an empty thinking part, mark thinking as finished
            if (content.kind === 'thinking' && (Array.isArray(content.value) ? content.value.length === 0 : content.value === '')) {
                const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
                lastThinking?.resetId();
                return this.renderNoContent(other => content.kind === other.kind);
            }
            const isResponseElement = isResponseVM(context.element);
            const shouldPin = this.shouldPinPart(content, isResponseElement ? context.element : undefined);
            // sometimes content is rendered out of order on re-renders so instead of looking at the current chat content part's
            // context and templateData, we have to look globally to find the active thinking part.
            if (context.element.isComplete && !shouldPin) {
                for (const templateData of this.templateDataByRequestId.values()) {
                    if (templateData.renderedParts) {
                        const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
                        if (lastThinking?.getIsActive()) {
                            this.finalizeCurrentThinkingPart(context, templateData);
                        }
                    }
                }
            }
            // Check if this is subagent content
            const isSubagentContent = (content.kind === 'toolInvocation' || content.kind === 'toolInvocationSerialized')
                && isSubagentToolInvocation(content);
            // Finalize all subagent parts when element is complete
            // Note: We don't finalize when non-subagent content arrives because parallel subagents may still be running
            if (context.element.isComplete && !isSubagentContent) {
                for (const templateData of this.templateDataByRequestId.values()) {
                    this.finalizeAllSubagentParts(templateData);
                }
            }
            if (content.kind === 'treeData') {
                return this.renderTreeData(content, templateData, context);
            }
            else if (content.kind === 'multiDiffData') {
                return this.renderMultiDiffData(content, templateData, context);
            }
            else if (content.kind === 'progressMessage') {
                return this.instantiationService.createInstance(ChatProgressContentPart, content, this.chatContentMarkdownRenderer, context, undefined, undefined, undefined, undefined, content.shimmer);
            }
            else if (content.kind === 'working') {
                return this.instantiationService.createInstance(ChatWorkingProgressContentPart, content, this.chatContentMarkdownRenderer, context);
            }
            else if (content.kind === 'progressTask' || content.kind === 'progressTaskSerialized') {
                return this.renderProgressTask(content, templateData, context);
            }
            else if (content.kind === 'command') {
                return this.instantiationService.createInstance(ChatCommandButtonContentPart, content, context);
            }
            else if (content.kind === 'textEditGroup') {
                return this.renderTextEdit(context, content, templateData);
            }
            else if (content.kind === 'confirmation') {
                return this.renderConfirmation(context, content, templateData);
            }
            else if (content.kind === 'warning') {
                return this.instantiationService.createInstance(ChatErrorContentPart, ChatErrorLevel.Warning, content.content, content, this.chatContentMarkdownRenderer);
            }
            else if (content.kind === 'hook') {
                return this.renderHookPart(content, context, templateData);
            }
            else if (content.kind === 'markdownContent') {
                return this.renderMarkdown(content, templateData, context);
            }
            else if (content.kind === 'references') {
                // Only show references for chat participants, not agents
                if (isResponseVM(context.element) && context.element.agent?.isDefault && !context.element.agent.modes.includes(ChatModeKind.Ask)) {
                    return this.renderNoContent(other => other.kind === content.kind);
                }
                return this.renderContentReferencesListData(content, undefined, context, templateData);
            }
            else if (content.kind === 'codeCitations') {
                return this.renderCodeCitations(content, context, templateData);
            }
            else if (content.kind === 'toolInvocation' || content.kind === 'toolInvocationSerialized') {
                return this.renderToolInvocation(content, context, templateData);
            }
            else if (content.kind === 'extensions') {
                return this.renderExtensionsContent(content, context, templateData);
            }
            else if (content.kind === 'pullRequest') {
                return this.renderPullRequestContent(content, context, templateData);
            }
            else if (content.kind === 'undoStop') {
                return this.renderUndoStop(content);
            }
            else if (content.kind === 'errorDetails') {
                return this.renderChatErrorDetails(context, content, templateData);
            }
            else if (content.kind === 'elicitation2' || content.kind === 'elicitationSerialized') {
                return this.renderElicitation(context, content, templateData);
            }
            else if (content.kind === 'questionCarousel') {
                return this.renderQuestionCarousel(context, content, templateData);
            }
            else if (content.kind === 'changesSummary') {
                return this.renderChangesSummary(content, context, templateData);
            }
            else if (content.kind === 'mcpServersStarting') {
                return this.renderMcpServersInteractionRequired(content, context, templateData);
            }
            else if (content.kind === 'disabledClaudeHooks') {
                return this.renderDisabledClaudeHooks(content, context);
            }
            else if (content.kind === 'thinking') {
                return this.renderThinkingPart(content, context, templateData);
            }
            else if (content.kind === 'workspaceEdit') {
                return this.instantiationService.createInstance(ChatWorkspaceEditContentPart, content, context, this.chatContentMarkdownRenderer);
            }
            return this.renderNoContent(other => content.kind === other.kind);
        }
        catch (err) {
            alert(`Chat error: ${toErrorMessage(err, false)}`);
            this.logService.error('ChatListItemRenderer#renderChatContentPart: error rendering content', toErrorMessage(err, true));
            const errorPart = this.instantiationService.createInstance(ChatErrorContentPart, ChatErrorLevel.Error, new MarkdownString(localize('renderFailMsg', "Failed to render content") + `: ${toErrorMessage(err, false)}`), content, this.chatContentMarkdownRenderer);
            return {
                dispose: () => errorPart.dispose(),
                domNode: errorPart.domNode,
                hasSameContent: (other => content.kind === other.kind),
            };
        }
    }
    dispose() {
        this._announcedToolProgressKeys.clear();
        super.dispose();
    }
    renderChatErrorDetails(context, content, templateData) {
        if (!isResponseVM(context.element)) {
            return this.renderNoContent(other => content.kind === other.kind);
        }
        const isLast = context.elementIndex === this.delegate.getListLength() - 1;
        if (content.errorDetails.isQuotaExceeded) {
            const renderedError = this.instantiationService.createInstance(ChatQuotaExceededPart, context.element, content, this.chatContentMarkdownRenderer);
            return renderedError;
        }
        else if (content.errorDetails.isRateLimited && this.chatEntitlementService.anonymous) {
            const renderedError = this.instantiationService.createInstance(ChatAnonymousRateLimitedPart, content);
            return renderedError;
        }
        else if (content.errorDetails.confirmationButtons && isLast) {
            const level = content.errorDetails.level ?? ChatErrorLevel.Error;
            const errorConfirmation = this.instantiationService.createInstance(ChatErrorConfirmationContentPart, level, new MarkdownString(content.errorDetails.message), content, content.errorDetails.confirmationButtons, this.chatContentMarkdownRenderer, context);
            return errorConfirmation;
        }
        else {
            const level = content.errorDetails.level ?? ChatErrorLevel.Error;
            return this.instantiationService.createInstance(ChatErrorContentPart, level, new MarkdownString(content.errorDetails.message), content, this.chatContentMarkdownRenderer);
        }
    }
    renderUndoStop(content) {
        return this.renderNoContent(other => other.kind === content.kind && other.id === content.id);
    }
    renderNoContent(equals) {
        return {
            dispose: () => { },
            domNode: undefined,
            hasSameContent: equals,
        };
    }
    renderTreeData(content, templateData, context) {
        const data = content.treeData;
        const treePart = this.instantiationService.createInstance(ChatTreeContentPart, data, this._treePool);
        if (isResponseVM(context.element)) {
            const fileTreeFocusInfo = {
                treeDataId: data.uri.toString(),
                treeIndex: context.treeStartIndex,
                focus() {
                    treePart.domFocus();
                }
            };
            // TODO@roblourens there's got to be a better way to navigate trees
            treePart.addDisposable(treePart.onDidFocus(() => {
                this.focusedFileTreesByResponseId.set(context.element.id, fileTreeFocusInfo.treeIndex);
            }));
            const fileTrees = this.fileTreesByResponseId.get(context.element.id) ?? [];
            fileTrees.push(fileTreeFocusInfo);
            this.fileTreesByResponseId.set(context.element.id, distinct(fileTrees, (v) => v.treeDataId));
            treePart.addDisposable(toDisposable(() => this.fileTreesByResponseId.set(context.element.id, fileTrees.filter(v => v.treeDataId !== data.uri.toString()))));
        }
        return treePart;
    }
    renderMultiDiffData(content, templateData, context) {
        const multiDiffPart = this.instantiationService.createInstance(ChatMultiDiffContentPart, content, context.element);
        return multiDiffPart;
    }
    renderContentReferencesListData(references, labelOverride, context, templateData) {
        const referencesPart = this.instantiationService.createInstance(ChatUsedReferencesListContentPart, references.references, labelOverride, context, this._contentReferencesListPool, { expandedWhenEmptyResponse: checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.referencesExpandedWhenEmptyResponse) });
        return referencesPart;
    }
    renderCodeCitations(citations, context, templateData) {
        const citationsPart = this.instantiationService.createInstance(ChatCodeCitationContentPart, citations, context);
        return citationsPart;
    }
    handleRenderedCodeblocks(element, part, codeBlockStartIndex) {
        if (!part.addDisposable || part.codeblocksPartId === undefined) {
            return;
        }
        const codeBlocksByResponseId = this.codeBlocksByResponseId.get(element.id) ?? [];
        this.codeBlocksByResponseId.set(element.id, codeBlocksByResponseId);
        part.addDisposable(toDisposable(() => {
            const codeBlocksByResponseId = this.codeBlocksByResponseId.get(element.id);
            if (codeBlocksByResponseId) {
                // Only delete if this is my code block
                part.codeblocks?.forEach((info, i) => {
                    const codeblock = codeBlocksByResponseId[codeBlockStartIndex + i];
                    if (codeblock?.ownerMarkdownPartId === part.codeblocksPartId) {
                        delete codeBlocksByResponseId[codeBlockStartIndex + i];
                    }
                });
            }
        }));
        part.codeblocks?.forEach((info, i) => {
            codeBlocksByResponseId[codeBlockStartIndex + i] = info;
            const uri = info.uri;
            if (uri) {
                this.codeBlocksByEditorUri.set(uri, info);
                part.addDisposable(toDisposable(() => {
                    const codeblock = this.codeBlocksByEditorUri.get(uri);
                    if (codeblock?.ownerMarkdownPartId === part.codeblocksPartId) {
                        this.codeBlocksByEditorUri.delete(uri);
                    }
                }));
            }
        });
    }
    renderToolInvocation(toolInvocation, context, templateData) {
        if (this.configService.getValue('chat.agent.thinking.collapsedTools') === CollapsedToolsDisplayMode.Off) {
            this.finalizeCurrentThinkingPart(context, templateData);
        }
        const codeBlockStartIndex = context.codeBlockStartIndex;
        // Factory that creates the tool invocation part with all necessary setup
        let lazilyCreatedPart = undefined;
        const createToolPart = () => {
            lazilyCreatedPart = this.instantiationService.createInstance(ChatToolInvocationPart, toolInvocation, context, this.chatContentMarkdownRenderer, this._contentReferencesListPool, this._toolEditorPool, () => this._currentLayoutWidth.get(), this._announcedToolProgressKeys, codeBlockStartIndex);
            this.handleRenderedCodeblocks(context.element, lazilyCreatedPart, codeBlockStartIndex);
            return { domNode: lazilyCreatedPart.domNode, disposable: lazilyCreatedPart, part: lazilyCreatedPart };
        };
        // handling for when we want to put tool invocations inside a thinking part
        const collapsedToolsMode = this.configService.getValue('chat.agent.thinking.collapsedTools');
        if (isResponseVM(context.element) && collapsedToolsMode !== CollapsedToolsDisplayMode.Off) {
            const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
            // create thinking part if it doesn't exist yet
            if (!lastThinking && !IChatToolInvocation.isEffectivelyHidden(toolInvocation) && this.shouldPinPart(toolInvocation, context.element) && collapsedToolsMode === CollapsedToolsDisplayMode.Always) {
                const thinkingPart = this.renderThinkingPart({
                    kind: 'thinking',
                }, context, templateData);
                if (thinkingPart instanceof ChatThinkingContentPart) {
                    // Append using factory - thinking part decides whether to render lazily
                    toolInvocation.isAttachedToThinking = true;
                    thinkingPart.appendItem(createToolPart, toolInvocation.toolId, toolInvocation, templateData.value);
                    this.setupConfirmationTransitionWatcher(toolInvocation, thinkingPart, () => lazilyCreatedPart, createToolPart, context, templateData);
                }
                return thinkingPart;
            }
            if (this.shouldPinPart(toolInvocation, context.element)) {
                if (lastThinking && !IChatToolInvocation.isEffectivelyHidden(toolInvocation)) {
                    // Append using factory - thinking part decides whether to render lazily
                    toolInvocation.isAttachedToThinking = true;
                    lastThinking.appendItem(createToolPart, toolInvocation.toolId, toolInvocation, templateData.value);
                    this.setupConfirmationTransitionWatcher(toolInvocation, lastThinking, () => lazilyCreatedPart, createToolPart, context, templateData);
                    return this.renderNoContent((other, followingContent, element) => lazilyCreatedPart ?
                        lazilyCreatedPart.hasSameContent(other, followingContent, element) :
                        toolInvocation.kind === other.kind);
                }
            }
            else {
                this.finalizeCurrentThinkingPart(context, templateData);
            }
        }
        // Check for subagent grouping before creating tool part - subagent part handles lazy creation
        const subagentId = getSubagentId(toolInvocation);
        if (subagentId && isResponseVM(context.element) && !IChatToolInvocation.isEffectivelyHidden(toolInvocation)) {
            return this.handleSubagentToolGrouping(toolInvocation, subagentId, context, templateData, codeBlockStartIndex);
        }
        // For cases not handled above (no thinking part, no subagent, etc.), create the part now
        const { part } = createToolPart();
        return part;
    }
    // watch for confirmation part transition when tool invocation is streaming
    setupConfirmationTransitionWatcher(toolInvocation, thinkingPart, getCreatedPart, createToolPart, context, templateData) {
        if (toolInvocation.kind !== 'toolInvocation') {
            return;
        }
        const removeConfirmationWidget = () => {
            const createdPart = getCreatedPart();
            // move the created part out of thinking and into the main template
            toolInvocation.isAttachedToThinking = false;
            if (createdPart?.domNode) {
                const wrapper = createdPart.domNode.parentElement;
                if (wrapper?.classList.contains('chat-thinking-tool-wrapper')) {
                    wrapper.remove();
                }
                templateData.value.appendChild(createdPart.domNode);
                // Decrement thinking part counters for the materialized item that was moved out
                thinkingPart.removeMaterializedItem(toolInvocation.toolCallId);
            }
            else {
                thinkingPart.removeLazyItem(toolInvocation.toolId);
                const { domNode } = createToolPart();
                templateData.value.appendChild(domNode);
            }
            this.finalizeCurrentThinkingPart(context, templateData);
            // if the thinking part is now completely empty (no tools, no thinking text)
            if (thinkingPart.isEffectivelyEmpty()) {
                thinkingPart.domNode?.remove();
                thinkingPart.dispose();
            }
        };
        const currentState = toolInvocation.state.get();
        if (currentState.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ || currentState.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
            removeConfirmationWidget();
            return;
        }
        const isWorkingState = (type) => type === 0 /* IChatToolInvocation.StateKind.Streaming */ || type === 2 /* IChatToolInvocation.StateKind.Executing */;
        if (!isWorkingState(currentState.type)) {
            return;
        }
        let didRemoveConfirmationWidget = false;
        const disposable = autorun(reader => {
            const state = toolInvocation.state.read(reader);
            if (state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ || state.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
                if (didRemoveConfirmationWidget) {
                    return;
                }
                didRemoveConfirmationWidget = true;
                disposable.dispose();
                removeConfirmationWidget();
            }
        });
        thinkingPart.addDisposable(disposable);
    }
    renderExtensionsContent(extensionsContent, context, templateData) {
        const part = this.instantiationService.createInstance(ChatExtensionsContentPart, extensionsContent);
        return part;
    }
    renderHookPart(hookPart, context, templateData) {
        if (!(hookPart.stopReason || hookPart.systemMessage)) {
            return this.renderNoContent(other => other.kind === 'hook' && other.hookType === hookPart.hookType);
        }
        if (hookPart.subAgentInvocationId) {
            const subagentPart = this.getSubagentPart(templateData.renderedParts, hookPart.subAgentInvocationId);
            if (subagentPart) {
                subagentPart.appendHookItem(() => {
                    const part = this.instantiationService.createInstance(ChatHookContentPart, hookPart, context);
                    return { domNode: part.domNode, disposable: part };
                }, hookPart);
                return this.renderNoContent(other => other.kind === 'hook' && other.hookType === hookPart.hookType && other.subAgentInvocationId === hookPart.subAgentInvocationId);
            }
        }
        // Only pin preTool/postTool hooks into the thinking part
        const shouldPinToThinking = hookPart.hookType === HookType.PreToolUse || hookPart.hookType === HookType.PostToolUse;
        if (shouldPinToThinking) {
            const hookTitle = hookPart.stopReason
                ? (hookPart.toolDisplayName
                    ? localize('hook.thinking.blocked', "Blocked {0}", hookPart.toolDisplayName)
                    : localize('hook.thinking.blockedGeneric', "Blocked by hook"))
                : (hookPart.toolDisplayName
                    ? localize('hook.thinking.warning', "Used {0}, but received a warning", hookPart.toolDisplayName)
                    : localize('hook.thinking.warningGeneric', "Tool call received a warning"));
            let thinkingPart = this.getLastThinkingPart(templateData.renderedParts);
            if (!thinkingPart) {
                // Create a thinking part if one doesn't exist yet (e.g. hook arrives before/with its tool in the same turn)
                const newThinking = this.renderThinkingPart({ kind: 'thinking' }, context, templateData);
                if (newThinking instanceof ChatThinkingContentPart) {
                    thinkingPart = newThinking;
                }
            }
            if (thinkingPart) {
                thinkingPart.appendItem(() => {
                    const part = this.instantiationService.createInstance(ChatHookContentPart, hookPart, context);
                    return { domNode: part.domNode, disposable: part };
                }, hookTitle, undefined, templateData.value);
                return thinkingPart;
            }
        }
        const part = this.instantiationService.createInstance(ChatHookContentPart, hookPart, context);
        return part;
    }
    renderPullRequestContent(pullRequestContent, context, templateData) {
        const part = this.instantiationService.createInstance(ChatPullRequestContentPart, pullRequestContent);
        return part;
    }
    renderProgressTask(task, templateData, context) {
        if (!isResponseVM(context.element)) {
            return;
        }
        this.finalizeCurrentThinkingPart(context, templateData);
        const taskPart = this.instantiationService.createInstance(ChatTaskContentPart, task, this._contentReferencesListPool, this.chatContentMarkdownRenderer, context);
        return taskPart;
    }
    renderConfirmation(context, confirmation, templateData) {
        const part = this.instantiationService.createInstance(ChatConfirmationContentPart, confirmation, context);
        return part;
    }
    renderElicitation(context, elicitation, templateData) {
        if (elicitation.kind === 'elicitationSerialized' ? elicitation.isHidden : elicitation.isHidden?.get()) {
            return this.renderNoContent(other => elicitation.kind === other.kind);
        }
        this.finalizeCurrentThinkingPart(context, templateData);
        const part = this.instantiationService.createInstance(ChatElicitationContentPart, elicitation, context);
        return part;
    }
    renderQuestionCarousel(context, carousel, templateData) {
        this.finalizeCurrentThinkingPart(context, templateData);
        this._notifyOnQuestionCarousel(context, carousel);
        const widget = isResponseVM(context.element) ? this.chatWidgetService.getWidgetBySessionResource(context.element.sessionResource) : undefined;
        const shouldAutoFocus = widget ? widget.getInput() === '' : true;
        const responseId = isResponseVM(context.element) ? context.element.requestId : undefined;
        const handleSubmit = async (answers, part) => {
            // Mark the carousel as used and store the answers
            const answersRecord = answers ? Object.fromEntries(answers) : undefined;
            carousel.data = answersRecord ?? {};
            carousel.isUsed = true;
            if (carousel instanceof ChatQuestionCarouselData) {
                carousel.draftAnswers = undefined;
                carousel.draftCurrentIndex = undefined;
                carousel.completion.complete({ answers: answersRecord });
            }
            // Notify the extension about the carousel answers to resolve the deferred promise
            if (isResponseVM(context.element) && carousel.resolveId) {
                this.chatService.notifyQuestionCarouselAnswer(context.element.requestId, carousel.resolveId, answersRecord);
            }
            // Remove from pending carousels
            this.removeCarouselFromTracking(context, part);
            // Clear from input part (clear only the submitted carousel by its key)
            const carouselKey = carousel.resolveId ?? `${responseId}_${context.contentIndex}`;
            widget?.input.clearQuestionCarousel(undefined, carouselKey);
        };
        // If carousel is already used or response is complete/canceled, render summary inline in the list
        const responseIsComplete = isResponseVM(context.element) && context.element.isComplete;
        const inputPartHasCarousel = widget?.input.questionCarousel !== undefined;
        if (carousel.isUsed || responseIsComplete) {
            if (responseIsComplete && !carousel.isUsed && isResponseVM(context.element) && carousel.resolveId) {
                carousel.data = {};
                carousel.isUsed = true;
                if (carousel instanceof ChatQuestionCarouselData) {
                    carousel.draftAnswers = undefined;
                    carousel.draftCurrentIndex = undefined;
                    carousel.completion.complete({ answers: undefined });
                }
                this.chatService.notifyQuestionCarouselAnswer(context.element.requestId, carousel.resolveId, undefined);
                this.pendingQuestionCarousels.get(context.element.sessionResource)?.clear();
            }
            // Clear the carousel from input part when response completes (stopped/canceled)
            // Only clear if this response's carousel is currently displayed (pass responseId)
            if (responseIsComplete && inputPartHasCarousel && responseId) {
                widget?.input.clearQuestionCarousel(responseId);
            }
            const part = this.instantiationService.createInstance(ChatQuestionCarouselPart, carousel, context, {
                shouldAutoFocus: false,
                onSubmit: async (answers) => handleSubmit(answers, part)
            });
            return part;
        }
        // Render the active carousel in the input part (above the input box, not while editing)
        const isEditing = !!this.viewModel?.editing;
        const part = isEditing ? undefined : widget?.input.renderQuestionCarousel(carousel, context, {
            shouldAutoFocus,
            onSubmit: async (answers) => handleSubmit(answers, part)
        });
        // If we couldn't render in the input part, fall back to inline rendering
        if (!part) {
            const fallbackPart = this.instantiationService.createInstance(ChatQuestionCarouselPart, carousel, context, {
                shouldAutoFocus,
                onSubmit: async (answers) => handleSubmit(answers, fallbackPart)
            });
            return fallbackPart;
        }
        // Track the carousel for auto-skip when user submits a new message
        // Only add tracking if not already tracked (prevents duplicate tracking on re-render)
        if (isResponseVM(context.element) && carousel.allowSkip && !carousel.isUsed) {
            let carousels = this.pendingQuestionCarousels.get(context.element.sessionResource);
            if (!carousels) {
                carousels = new Set();
                this.pendingQuestionCarousels.set(context.element.sessionResource, carousels);
            }
            if (!carousels.has(part)) {
                carousels.add(part);
                // Clean up when the part is disposed
                part.addDisposable({ dispose: () => this.removeCarouselFromTracking(context, part) });
            }
        }
        // Return a placeholder that will re-render as a summary when the carousel is used or response is complete/stopped
        return this.renderNoContent((other, _followingContent, element) => {
            // Re-render (return false) if:
            // - carousel was used/submitted
            // - response is complete (stopped)
            if (carousel.isUsed || (isResponseVM(element) && element.isComplete)) {
                return false;
            }
            // Use resolveId for comparison instead of object identity to handle re-rendering during scrolling
            if (other.kind === 'questionCarousel') {
                const otherCarousel = other;
                // Compare by resolveId if available, otherwise fall back to object identity
                if (carousel.resolveId && otherCarousel.resolveId) {
                    return carousel.resolveId === otherCarousel.resolveId;
                }
                return other === carousel;
            }
            return false;
        });
    }
    _getCarouselStableKey(context, carousel) {
        const requestId = isResponseVM(context.element) ? context.element.requestId : undefined;
        if (!requestId || !carousel.resolveId) {
            return undefined;
        }
        return `${requestId}::${carousel.resolveId}`;
    }
    _notifyOnQuestionCarousel(context, carousel) {
        if (carousel.isUsed) {
            return;
        }
        // Only notify once per carousel to avoid duplicate toasts on rerender.
        // Use a stable key based on requestId + resolveId instead of object identity.
        const stableKey = this._getCarouselStableKey(context, carousel);
        if (stableKey ? this._notifiedQuestionCarousels.has(stableKey) : false) {
            return;
        }
        // Alert screen readers with the question
        const questionCount = carousel.questions.length;
        const question = carousel.questions.length > 0 && carousel.questions[0].message ? carousel.questions[0].message : localize('chat.questionCarouselNeedsInputSR', "Chat input required.");
        const stringQuestion = typeof question === 'string' ? question : question.value;
        const alertMessage = questionCount === 1
            ? localize('chat.questionCarouselAlertOne', "Chat input required (1 question): {0}", stringQuestion)
            : localize('chat.questionCarouselAlertMany', "Chat input required ({0} questions): {1}", questionCount, stringQuestion);
        this.accessibilityService.alert(alertMessage);
        if (stableKey) {
            this._notifiedQuestionCarousels.add(stableKey);
        }
        // Play accessibility signal regardless of notification setting
        const signalMessage = questionCount === 1
            ? localize('chat.questionCarouselSignalOne', "Chat needs your input (1 question).")
            : localize('chat.questionCarouselSignalMany', "Chat needs your input ({0} questions).", questionCount);
        this.accessibilitySignalService.playSignal(AccessibilitySignal.chatUserActionRequired, { allowManyInParallel: true, customAlertMessage: signalMessage });
        // OS toast notification is handled by ChatWindowNotifier
    }
    removeCarouselFromTracking(context, part) {
        if (isResponseVM(context.element)) {
            const carousels = this.pendingQuestionCarousels.get(context.element.sessionResource);
            if (carousels) {
                carousels.delete(part);
            }
        }
    }
    renderChangesSummary(content, context, templateData) {
        const part = this.instantiationService.createInstance(ChatCheckpointFileChangesSummaryContentPart, content, context);
        return part;
    }
    renderAttachments(variables, contentReferences, templateData) {
        return this.instantiationService.createInstance(ChatAttachmentsContentPart, {
            variables,
            contentReferences,
            domNode: undefined
        });
    }
    renderTextEdit(context, chatTextEdit, templateData) {
        const textEditPart = this.instantiationService.createInstance(ChatTextEditContentPart, chatTextEdit, context, this.rendererOptions, this._diffEditorPool, this._currentLayoutWidth.get());
        return textEditPart;
    }
    renderMarkdown(markdown, templateData, context) {
        const element = context.element;
        const isBlankMarkdown = !markdown.content.value.trim();
        // Don't finalize thinking if the markdown has an incomplete codeblock with a
        // vscode_codeblock_uri tag — the isEdit annotation may not have arrived yet.
        // Only check codeblocks that contain a URI tag to avoid catching regular non-edit codeblocks.
        const hasPendingEditCodeblock = isResponseVM(element) && !element.isComplete
            && hasCodeblockUriTag(markdown.content.value)
            && !codeblockHasClosingBackticks(markdown.content.value);
        if (!this.hasEditCodeblockUri(markdown) && !isBlankMarkdown && !hasPendingEditCodeblock) {
            this.finalizeCurrentThinkingPart(context, templateData);
        }
        const fillInIncompleteTokens = isResponseVM(element) && (!element.isComplete || element.isCanceled || element.errorDetails?.responseIsFiltered || element.errorDetails?.responseIsIncomplete || !!element.renderData);
        const codeBlockStartIndex = context.codeBlockStartIndex;
        const markdownPart = templateData.instantiationService.createInstance(ChatMarkdownContentPart, markdown, context, this._editorPool, fillInIncompleteTokens, codeBlockStartIndex, this.chatContentMarkdownRenderer, undefined, this._currentLayoutWidth.get(), {});
        markdownPart.addDisposable(markdownPart.onDidChangeHeight(() => this.fireItemHeightChange(templateData)));
        if (isRequestVM(element)) {
            markdownPart.domNode.tabIndex = 0;
            if (this.configService.getValue('chat.editRequests') === 'inline' && this.rendererOptions.editable) {
                markdownPart.domNode.classList.add('clickable');
                markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.CLICK, (e) => {
                    if (this.viewModel?.editing?.id === element.id) {
                        return;
                    }
                    // Don't handle clicks on links
                    const clickedElement = e.target;
                    if (clickedElement.tagName === 'A') {
                        return;
                    }
                    // Don't handle if there's a text selection in the window
                    const selection = dom.getWindow(templateData.rowContainer).getSelection();
                    if (selection && !selection.isCollapsed && selection.toString().length > 0) {
                        return;
                    }
                    // Don't handle if there's a selection in code block
                    const monacoEditor = dom.findParentWithClass(clickedElement, 'monaco-editor');
                    if (monacoEditor) {
                        const editorPart = Array.from(this.editorsInUse()).find(editor => editor.element.contains(monacoEditor));
                        if (editorPart?.editor.getSelection()?.isEmpty() === false) {
                            return;
                        }
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    this._onDidClickRequest.fire(templateData);
                }));
                markdownPart.addDisposable(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), markdownPart.domNode, localize('requestMarkdownPartTitle', "Click to Edit"), { trapFocus: true }));
            }
            markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.FOCUS, () => {
                this.hoverVisible(templateData.requestHover);
            }));
            markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.BLUR, () => {
                this.hoverHidden(templateData.requestHover);
            }));
        }
        this.handleRenderedCodeblocks(element, markdownPart, codeBlockStartIndex);
        const collapsedToolsMode = this.configService.getValue('chat.agent.thinking.collapsedTools');
        if (isResponseVM(context.element) && collapsedToolsMode !== CollapsedToolsDisplayMode.Off) {
            // append to thinking part when the codeblock is complete
            const isComplete = this.isCodeblockComplete(markdown, context.element);
            // Check if this markdown should be routed to a subagent content part
            const subAgentInvocationId = extractSubAgentInvocationIdFromText(markdown.content.value);
            if (subAgentInvocationId) {
                const subagentPart = this.getSubagentPart(templateData.renderedParts, subAgentInvocationId);
                if (subagentPart && markdownPart?.domNode && isComplete) {
                    subagentPart.appendMarkdownItem(() => ({ domNode: markdownPart.domNode, disposable: markdownPart }), markdownPart.codeblocksPartId, markdown, templateData.value);
                    return subagentPart;
                }
            }
            // create thinking part if it doesn't exist yet
            const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
            if (!lastThinking && markdownPart?.domNode && this.shouldPinPart(markdown, context.element) && collapsedToolsMode === CollapsedToolsDisplayMode.Always && isComplete) {
                const thinkingPart = this.renderThinkingPart({
                    kind: 'thinking',
                }, context, templateData);
                if (thinkingPart instanceof ChatThinkingContentPart) {
                    // Factory wrapping already-created markdown part
                    thinkingPart.appendItem(() => ({ domNode: markdownPart.domNode, disposable: markdownPart }), markdownPart.codeblocksPartId, markdown, templateData.value, markdownPart.onDidChangeDiff);
                }
                return thinkingPart;
            }
            if (this.shouldPinPart(markdown, context.element) && isComplete) {
                if (lastThinking && markdownPart?.domNode) {
                    // Factory wrapping already-created markdown part
                    lastThinking.appendItem(() => ({ domNode: markdownPart.domNode, disposable: markdownPart }), markdownPart.codeblocksPartId, markdown, templateData.value, markdownPart.onDidChangeDiff);
                }
            }
            else if (!this.shouldPinPart(markdown, context.element) && !isBlankMarkdown && !hasPendingEditCodeblock) {
                this.finalizeCurrentThinkingPart(context, templateData);
            }
        }
        return markdownPart;
    }
    renderThinkingPart(content, context, templateData) {
        // TODO @justschen @karthiknadig: remove this when OSWE moves off commentary channel
        if (!content.id) {
            content.id = Date.now().toString();
        }
        // Determine if this thinking part is already complete based on look-ahead
        // (i.e., there are subsequent parts that won't be pinned to this thinking part)
        const element = isResponseVM(context.element) ? context.element : undefined;
        const streamingCompleted = this.isThinkingLookAheadComplete(context, element);
        // if array, we do a naive part by part rendering for now
        if (Array.isArray(content.value)) {
            if (content.value.length < 1) {
                const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
                lastThinking?.finalizeTitleIfDefault();
                return this.renderNoContent(other => content.kind === other.kind);
            }
            let lastPart;
            for (const item of content.value) {
                if (item) {
                    const lastThinkingPart = lastPart instanceof ChatThinkingContentPart && lastPart.getIsActive() ? lastPart : undefined;
                    if (lastThinkingPart) {
                        lastThinkingPart.setupThinkingContainer({ ...content, value: item });
                    }
                    else {
                        const itemContent = { ...content, value: item };
                        const itemPart = templateData.instantiationService.createInstance(ChatThinkingContentPart, itemContent, context, this.chatContentMarkdownRenderer, streamingCompleted);
                        lastPart = itemPart;
                    }
                }
            }
            return lastPart ?? this.renderNoContent(other => content.kind === other.kind);
            // non-array, handle case where we are currently thinking vs. starting a new thinking part
        }
        else {
            const lastActiveThinking = this.getLastThinkingPart(templateData.renderedParts);
            if (lastActiveThinking) {
                lastActiveThinking.setupThinkingContainer(content);
                return lastActiveThinking;
            }
            else {
                const part = templateData.instantiationService.createInstance(ChatThinkingContentPart, content, context, this.chatContentMarkdownRenderer, streamingCompleted);
                return part;
            }
        }
    }
    disposeElement(node, index, templateData, details) {
        this.traceLayout('disposeElement', `Disposing element, index=${index}`);
        templateData.elementDisposables.clear();
        if (templateData.currentElement && !this.viewModel?.editing) {
            this.templateDataByRequestId.delete(templateData.currentElement.id);
        }
        // These maps are only read for the focused response which is always visible,
        // so we can clean up entries for elements that leave the viewport.
        const codeBlocks = this.codeBlocksByResponseId.get(node.element.id);
        if (codeBlocks) {
            for (const info of codeBlocks) {
                if (info?.uri) {
                    this.codeBlocksByEditorUri.delete(info.uri);
                }
            }
            this.codeBlocksByResponseId.delete(node.element.id);
        }
        this.fileTreesByResponseId.delete(node.element.id);
        this.focusedFileTreesByResponseId.delete(node.element.id);
        if (isRequestVM(node.element) && node.element.id === this.viewModel?.editing?.id && details?.onScroll) {
            this._onDidDispose.fire(templateData);
        }
        // Don't retain the toolbar context which includes chat viewmodels
        if (templateData.titleToolbar) {
            templateData.titleToolbar.context = undefined;
        }
        templateData.footerToolbar.context = undefined;
        templateData.checkpointToolbar.context = undefined;
        templateData.checkpointRestoreToolbar.context = undefined;
    }
    renderMcpServersInteractionRequired(content, context, templateData) {
        return this.instantiationService.createInstance(ChatMcpServersInteractionContentPart, content, context);
    }
    renderDisabledClaudeHooks(content, context) {
        return this.instantiationService.createInstance(ChatDisabledClaudeHooksContentPart, context);
    }
    disposeTemplate(templateData) {
        this.clearRenderedParts(templateData);
        templateData.templateDisposables.dispose();
    }
    hoverVisible(requestHover) {
        requestHover.style.opacity = '1';
    }
    hoverHidden(requestHover) {
        requestHover.style.opacity = '0';
    }
};
ChatListItemRenderer = ChatListItemRenderer_1 = __decorate([
    __param(5, IInstantiationService),
    __param(6, IConfigurationService),
    __param(7, ILogService),
    __param(8, IContextKeyService),
    __param(9, IThemeService),
    __param(10, ICommandService),
    __param(11, IHoverService),
    __param(12, IChatWidgetService),
    __param(13, IChatEntitlementService),
    __param(14, IChatService),
    __param(15, IAccessibilitySignalService),
    __param(16, IAccessibilityService),
    __param(17, IWorkbenchEnvironmentService)
], ChatListItemRenderer);
export { ChatListItemRenderer };
export class ChatListDelegate extends CachedListVirtualDelegate {
    constructor(defaultElementHeight) {
        super();
        this.defaultElementHeight = defaultElementHeight;
    }
    estimateHeight(element) {
        // currentRenderedHeight is not load-bearing here- probably if it's ever set, then the superclass cache will have the height.
        return element.currentRenderedHeight ?? this.defaultElementHeight;
    }
    getTemplateId(element) {
        return ChatListItemRenderer.ID;
    }
    hasDynamicHeight(element) {
        return true;
    }
}
/**
 * Check if a tool invocation is the parent subagent tool (the tool that spawns a subagent).
 * A parent subagent tool has subagent toolSpecificData but no subAgentInvocationId.
 */
function isParentSubagentTool(invocation) {
    return invocation.toolSpecificData?.kind === 'subagent' && !invocation.subAgentInvocationId;
}
/**
 * Get the subagent invocation ID for grouping tools.
 * For parent subagent tools, use their toolCallId.
 * For child tools, use their subAgentInvocationId.
 */
function getSubagentId(invocation) {
    if (isParentSubagentTool(invocation)) {
        return invocation.toolCallId;
    }
    return invocation.subAgentInvocationId;
}
/**
 * Check if a tool invocation is part of a subagent (either parent or child).
 */
function isSubagentToolInvocation(invocation) {
    return !!getSubagentId(invocation);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdExpc3RSZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdExpc3RSZW5kZXJlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMzRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUVyRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDdkcsT0FBTyxFQUFFLHlCQUF5QixFQUE2QixNQUFNLDZDQUE2QyxDQUFDO0FBR25ILE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUVyRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FB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