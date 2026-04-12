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
var ChatSubagentContentPart_1;
import * as dom from '../../../../../../base/browser/dom.js';
import { $, AnimationFrameScheduler, DisposableResizeObserver } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { rcut } from '../../../../../../base/common/strings.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { ChatCollapsibleMarkdownContentPart } from './chatCollapsibleMarkdownContentPart.js';
import { renderFileWidgets } from './chatInlineAnchorWidget.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { createThinkingIcon, getToolInvocationIcon } from './chatThinkingContentPart.js';
import { ChatToolInvocationPart } from './toolInvocationParts/chatToolInvocationPart.js';
import './media/chatSubagentContent.css';
const MAX_TITLE_LENGTH = 100;
/**
 * This is generally copied from ChatThinkingContentPart. We are still experimenting with both UIs so I'm not
 * trying to refactor to share code. Both could probably be simplified when stable.
 */
let ChatSubagentContentPart = ChatSubagentContentPart_1 = class ChatSubagentContentPart extends ChatCollapsibleContentPart {
    /**
     * Check if a tool invocation is the parent subagent tool (the tool that spawns a subagent).
     * A parent subagent tool has subagent toolSpecificData but no subAgentInvocationId.
     */
    static isParentSubagentTool(toolInvocation) {
        return toolInvocation.toolSpecificData?.kind === 'subagent' && !toolInvocation.subAgentInvocationId;
    }
    /**
     * Extracts subagent info (description, agentName, prompt) from a tool invocation.
     */
    static extractSubagentInfo(toolInvocation) {
        const defaultDescription = localize('chat.subagent.defaultDescription', 'Running subagent');
        // Only parent subagent tools contain the full subagent info
        if (!ChatSubagentContentPart_1.isParentSubagentTool(toolInvocation)) {
            return { description: defaultDescription, isDefaultDescription: true, agentName: undefined, prompt: undefined, modelName: undefined };
        }
        // Check toolSpecificData first (works for both live and serialized)
        if (toolInvocation.toolSpecificData?.kind === 'subagent') {
            const hasDescription = !!toolInvocation.toolSpecificData.description;
            return {
                description: toolInvocation.toolSpecificData.description ?? defaultDescription,
                isDefaultDescription: !hasDescription,
                agentName: toolInvocation.toolSpecificData.agentName,
                prompt: toolInvocation.toolSpecificData.prompt,
                modelName: toolInvocation.toolSpecificData.modelName,
            };
        }
        // Fallback to parameters for live invocations
        if (toolInvocation.kind === 'toolInvocation') {
            const state = toolInvocation.state.get();
            const params = state.type !== 0 /* IChatToolInvocation.StateKind.Streaming */ ?
                state.parameters
                : undefined;
            const hasDescription = !!params?.description;
            return {
                description: params?.description ?? defaultDescription,
                isDefaultDescription: !hasDescription,
                agentName: params?.agentName,
                prompt: params?.prompt,
                modelName: undefined,
            };
        }
        return { description: defaultDescription, isDefaultDescription: true, agentName: undefined, prompt: undefined, modelName: undefined };
    }
    constructor(subAgentInvocationId, toolInvocation, context, chatContentMarkdownRenderer, listPool, editorPool, currentWidthDelegate, announcedToolProgressKeys, instantiationService, chatMarkdownAnchorService, hoverService, configurationService) {
        // Extract description, agentName, and prompt from toolInvocation
        const { description, isDefaultDescription, agentName, prompt, modelName } = ChatSubagentContentPart_1.extractSubagentInfo(toolInvocation);
        // Build title: "AgentName: description" or "Subagent: description"
        const prefix = agentName || localize('chat.subagent.prefix', 'Subagent');
        const initialTitle = `${prefix}: ${description}`;
        super(initialTitle, context, undefined, hoverService, configurationService);
        this.subAgentInvocationId = subAgentInvocationId;
        this.context = context;
        this.chatContentMarkdownRenderer = chatContentMarkdownRenderer;
        this.listPool = listPool;
        this.editorPool = editorPool;
        this.currentWidthDelegate = currentWidthDelegate;
        this.announcedToolProgressKeys = announcedToolProgressKeys;
        this.instantiationService = instantiationService;
        this.chatMarkdownAnchorService = chatMarkdownAnchorService;
        this.isActive = true;
        this.hasToolItems = false;
        // Lazy rendering support
        this.lazyItems = [];
        this.hasExpandedOnce = false;
        this.pendingPromptRender = false;
        this._hoverDisposable = this._register(new MutableDisposable());
        // Confirmation auto-expand tracking
        this.toolsWaitingForConfirmation = 0;
        this.userManuallyExpanded = false;
        this.autoExpandedForConfirmation = false;
        this._titleDetailRendered = this._register(new MutableDisposable());
        this.description = description;
        this._isDefaultDescription = isDefaultDescription;
        this.agentName = agentName;
        this.prompt = prompt;
        this.modelName = modelName;
        this.isInitiallyComplete = this.element.isComplete;
        const node = this.domNode;
        node.classList.add('chat-thinking-box', 'chat-thinking-fixed-mode', 'chat-subagent-part');
        if (!this.element.isComplete) {
            node.classList.add('chat-thinking-active');
        }
        // Apply shimmer to the initial title when still active
        if (!this.element.isComplete && this._collapseButton) {
            const labelElement = this._collapseButton.labelElement;
            labelElement.textContent = '';
            this.titleShimmerSpan = $('span.chat-thinking-title-shimmer');
            this.titleShimmerSpan.textContent = initialTitle;
            labelElement.appendChild(this.titleShimmerSpan);
        }
        // Note: wrapper is created lazily in initContent(), so we can't set its style here
        if (this._collapseButton && !this.element.isComplete) {
            this._collapseButton.icon = Codicon.circleFilled;
        }
        this._register(autorun(r => {
            this.expanded.read(r);
            if (this._collapseButton) {
                if (!this.element.isComplete && this.isActive) {
                    this._collapseButton.icon = Codicon.circleFilled;
                }
                else {
                    this._collapseButton.icon = Codicon.check;
                }
            }
        }));
        // Materialize lazy items when first expanded
        this._register(autorun(r => {
            if (this._isExpanded.read(r) && !this.hasExpandedOnce) {
                this.hasExpandedOnce = true;
                this.materializePendingContent();
            }
        }));
        // Start collapsed - fixed scrolling mode shows limited height when collapsed
        this.setExpanded(false);
        // Track user manual expansion
        // If the user expands (not via auto-expand for confirmation), mark it as manual
        // Only clear autoExpandedForConfirmation when user collapses, so re-expand is detected as manual
        this._register(autorun(r => {
            const expanded = this._isExpanded.read(r);
            if (expanded) {
                if (!this.autoExpandedForConfirmation) {
                    this.userManuallyExpanded = true;
                }
            }
            else {
                // User collapsed - reset flags so next confirmation cycle can auto-collapse again
                if (this.autoExpandedForConfirmation) {
                    this.autoExpandedForConfirmation = false;
                }
                // Reset manual expansion flag when user collapses, so future confirmation cycles can auto-collapse
                if (this.userManuallyExpanded) {
                    this.userManuallyExpanded = false;
                }
            }
        }));
        // Scheduler for coalescing layout operations
        this.layoutScheduler = this._register(new AnimationFrameScheduler(this.domNode, () => this.performLayout()));
        // Set up hover tooltip with model name if available
        this.updateHover();
        // Render the prompt section at the start if available (must be after wrapper is initialized)
        this.renderPromptSection();
        // Watch for completion and render result
        this.watchToolCompletion(toolInvocation);
    }
    initContent() {
        this.wrapper = $('.chat-used-context-list.chat-thinking-collapsible');
        // Hide initially until there are tool calls
        if (!this.hasToolItems) {
            this.wrapper.style.display = 'none';
        }
        // Materialize any deferred content now that wrapper exists
        // This handles the case where the subclass autorun ran before this base class autorun
        this.materializePendingContent();
        // Use ResizeObserver to trigger layout when wrapper content changes
        const resizeObserver = this._register(new DisposableResizeObserver(() => this.layoutScheduler.schedule()));
        this._register(resizeObserver.observe(this.wrapper));
        return this.wrapper;
    }
    /**
     * Renders the prompt as a collapsible section at the start of the content.
     * If the wrapper doesn't exist yet (lazy init) or subagent is initially complete,
     * this is deferred until expanded.
     */
    renderPromptSection() {
        if (!this.prompt || this.promptContainer) {
            return;
        }
        // Defer rendering when wrapper doesn't exist yet (lazy init) or for old completed subagents until expanded
        if (!this.wrapper || (this.isInitiallyComplete && !this.isExpanded() && !this.hasExpandedOnce)) {
            this.pendingPromptRender = true;
            return;
        }
        this.pendingPromptRender = false;
        this.doRenderPromptSection();
    }
    doRenderPromptSection() {
        if (!this.prompt || this.promptContainer) {
            return;
        }
        // Split into first line and rest
        const lines = this.prompt.split('\n');
        const rawFirstLine = lines[0] || localize('chat.subagent.prompt', 'Prompt');
        const restOfLines = lines.slice(1).join('\n').trim();
        // Limit first line length, moving overflow to content
        const titleContent = rcut(rawFirstLine, MAX_TITLE_LENGTH);
        const wasTruncated = rawFirstLine.length > MAX_TITLE_LENGTH;
        const title = wasTruncated ? titleContent + '…' : titleContent;
        const titleRemainder = rawFirstLine.length > titleContent.length ? rawFirstLine.slice(titleContent.length).trim() : '';
        const content = titleRemainder
            ? (titleRemainder + (restOfLines ? '\n' + restOfLines : ''))
            : (restOfLines || this.prompt);
        // Create collapsible prompt part
        const collapsiblePart = this._register(this.instantiationService.createInstance(ChatCollapsibleMarkdownContentPart, title, content, this.context, this.chatContentMarkdownRenderer));
        // Wrap in a container for chain of thought line styling
        this.promptContainer = $('.chat-thinking-tool-wrapper.chat-subagent-section');
        const promptIcon = createThinkingIcon(Codicon.comment);
        this.promptContainer.appendChild(promptIcon);
        this.promptContainer.appendChild(collapsiblePart.domNode);
        // Insert at the beginning of the wrapper
        // With lazy rendering, wrapper may not be created yet if content hasn't been expanded
        if (this.wrapper) {
            if (this.wrapper.firstChild) {
                this.wrapper.insertBefore(this.promptContainer, this.wrapper.firstChild);
            }
            else {
                dom.append(this.wrapper, this.promptContainer);
            }
            // Show the container if it was hidden (no tool items yet)
            if (this.wrapper.style.display === 'none') {
                this.wrapper.style.display = '';
            }
        }
    }
    getIsActive() {
        return this.isActive;
    }
    markAsInactive() {
        this.isActive = false;
        this.domNode.classList.remove('chat-thinking-active');
        if (this._collapseButton) {
            this._collapseButton.icon = Codicon.check;
        }
        if (this._isDefaultDescription) {
            this.description = localize('chat.subagent.completedDefaultDescription', 'Ran subagent');
        }
        this.finalizeTitle();
        // Collapse when done
        this.setExpanded(false);
    }
    finalizeTitle() {
        this.updateTitle();
        if (this._collapseButton) {
            this._collapseButton.icon = Codicon.check;
        }
    }
    updateTitle() {
        const prefix = this.agentName || localize('chat.subagent.prefix', 'Subagent');
        const shimmerText = `${prefix}: ${this.description}`;
        const toolCallText = this.currentRunningToolMessage && this.isActive ? ` \u2014 ${this.currentRunningToolMessage}` : ``;
        if (!this._collapseButton) {
            return;
        }
        const labelElement = this._collapseButton.labelElement;
        if (!this.isActive) {
            labelElement.textContent = '';
            this.titleShimmerSpan = undefined;
            this._titleDetailRendered.clear();
            this.titleDetailContainer = undefined;
            const prefixSpan = $('span');
            prefixSpan.textContent = `${prefix}:`;
            labelElement.appendChild(prefixSpan);
            const descSpan = $('span.chat-thinking-title-detail-text');
            descSpan.textContent = ` ${this.description}`;
            labelElement.appendChild(descSpan);
            this._collapseButton.element.ariaLabel = shimmerText;
            this._collapseButton.element.ariaExpanded = String(this.isExpanded());
            return;
        }
        // Ensure the persistent shimmer span exists
        if (!this.titleShimmerSpan || !this.titleShimmerSpan.parentElement) {
            labelElement.textContent = '';
            this.titleShimmerSpan = $('span.chat-thinking-title-shimmer');
            labelElement.appendChild(this.titleShimmerSpan);
        }
        this.titleShimmerSpan.textContent = shimmerText;
        // Dispose previous detail rendering
        this._titleDetailRendered.clear();
        if (!toolCallText) {
            if (this.titleDetailContainer) {
                this.titleDetailContainer.remove();
                this.titleDetailContainer = undefined;
            }
        }
        else {
            const result = this.chatContentMarkdownRenderer.render(new MarkdownString(toolCallText));
            result.element.classList.add('collapsible-title-content', 'chat-thinking-title-detail');
            renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._store);
            this._titleDetailRendered.value = result;
            if (this.titleDetailContainer) {
                this.titleDetailContainer.replaceWith(result.element);
            }
            else {
                labelElement.appendChild(result.element);
            }
            this.titleDetailContainer = result.element;
        }
        const fullLabel = `${shimmerText}${toolCallText}`;
        this._collapseButton.element.ariaLabel = fullLabel;
        this._collapseButton.element.ariaExpanded = String(this.isExpanded());
    }
    updateHover() {
        if (!this.modelName || !this._collapseButton) {
            return;
        }
        this._hoverDisposable.value = this.hoverService.setupDelayedHover(this._collapseButton.element, {
            content: localize('chat.subagent.modelTooltip', 'Model: {0}', this.modelName),
        });
    }
    /**
     * Tracks a tool invocation's state for:
     * 1. Updating the title with the current tool message (persists even after completion)
     * 2. Auto-expanding when a tool is waiting for confirmation
     * 3. Auto-collapsing when the confirmation is addressed
     * This method is public to support testing.
     */
    trackToolState(toolInvocation) {
        // Only track live tool invocations
        if (toolInvocation.kind !== 'toolInvocation') {
            return;
        }
        // Set the title immediately when tool is added - like thinking part does
        const message = toolInvocation.invocationMessage;
        const messageText = typeof message === 'string' ? message : message.value;
        this.currentRunningToolMessage = messageText;
        this.updateTitle();
        let wasWaitingForConfirmation = false;
        this._register(autorun(r => {
            const state = toolInvocation.state.read(r);
            // Track confirmation state changes
            const isWaitingForConfirmation = state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ ||
                state.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */;
            if (isWaitingForConfirmation && !wasWaitingForConfirmation) {
                // Tool just started waiting for confirmation
                this.toolsWaitingForConfirmation++;
                if (!this.isExpanded()) {
                    this.autoExpandedForConfirmation = true;
                    this.setExpanded(true);
                }
            }
            else if (!isWaitingForConfirmation && wasWaitingForConfirmation) {
                // Tool is no longer waiting for confirmation
                this.toolsWaitingForConfirmation--;
                if (this.toolsWaitingForConfirmation === 0 && this.autoExpandedForConfirmation && !this.userManuallyExpanded) {
                    // Auto-collapse only if we auto-expanded and user didn't manually expand
                    this.autoExpandedForConfirmation = false;
                    this.setExpanded(false);
                }
            }
            wasWaitingForConfirmation = isWaitingForConfirmation;
        }));
    }
    /**
     * Watches the tool invocation for completion and renders the result.
     * Handles both live and serialized invocations.
     */
    watchToolCompletion(toolInvocation) {
        // Only watch parent subagent tools for completion
        if (!ChatSubagentContentPart_1.isParentSubagentTool(toolInvocation)) {
            return;
        }
        if (toolInvocation.kind === 'toolInvocation') {
            // Watch for completion and render the result
            let wasStreaming = toolInvocation.state.get().type === 0 /* IChatToolInvocation.StateKind.Streaming */;
            this._register(autorun(r => {
                const state = toolInvocation.state.read(r);
                if (state.type === 4 /* IChatToolInvocation.StateKind.Completed */) {
                    wasStreaming = false;
                    // Extract text from result
                    const textParts = (state.contentForModel || [])
                        .filter((part) => part.kind === 'text')
                        .map(part => part.value);
                    if (textParts.length > 0) {
                        this.renderResultText(textParts.join('\n'));
                    }
                    // Update description and model name from toolSpecificData (set during invoke())
                    if (toolInvocation.toolSpecificData?.kind === 'subagent') {
                        if (toolInvocation.toolSpecificData.description) {
                            this.description = toolInvocation.toolSpecificData.description;
                            this._isDefaultDescription = false;
                        }
                        if (toolInvocation.toolSpecificData.modelName) {
                            this.modelName = toolInvocation.toolSpecificData.modelName;
                            this.updateHover();
                        }
                    }
                    // Mark as inactive when the tool completes
                    this.markAsInactive();
                }
                else if (wasStreaming && state.type !== 0 /* IChatToolInvocation.StateKind.Streaming */) {
                    wasStreaming = false;
                    // Update things that change when tool is done streaming
                    const { description, isDefaultDescription, agentName, prompt, modelName } = ChatSubagentContentPart_1.extractSubagentInfo(toolInvocation);
                    this.description = description;
                    this._isDefaultDescription = isDefaultDescription;
                    this.agentName = agentName;
                    this.prompt = prompt;
                    if (modelName) {
                        this.modelName = modelName;
                        this.updateHover();
                    }
                    this.renderPromptSection();
                    this.updateTitle();
                }
            }));
        }
        else if (toolInvocation.toolSpecificData?.kind === 'subagent' && toolInvocation.toolSpecificData.result) {
            // Render the persisted result for serialized invocations
            this.renderResultText(toolInvocation.toolSpecificData.result);
            // Already complete, mark as inactive
            this.markAsInactive();
        }
    }
    /**
     * Renders the result text as a collapsible section.
     * If the wrapper doesn't exist yet (lazy init) or subagent is initially complete,
     * this is deferred until expanded.
     */
    renderResultText(resultText) {
        if (this.resultContainer || !resultText) {
            return; // Already rendered or no content
        }
        // Defer rendering when wrapper doesn't exist yet (lazy init) or for old completed subagents until expanded
        if (!this.wrapper || (this.isInitiallyComplete && !this.isExpanded() && !this.hasExpandedOnce)) {
            this.pendingResultText = resultText;
            return;
        }
        this.pendingResultText = undefined;
        this.doRenderResultText(resultText);
    }
    doRenderResultText(resultText) {
        if (this.resultContainer || !resultText) {
            return;
        }
        // Split into first line and rest
        const lines = resultText.split('\n');
        const rawFirstLine = lines[0] || '';
        const restOfLines = lines.slice(1).join('\n').trim();
        // Limit first line length, moving overflow to content
        const titleContent = rcut(rawFirstLine, MAX_TITLE_LENGTH);
        const wasTruncated = rawFirstLine.length > MAX_TITLE_LENGTH;
        const title = wasTruncated ? titleContent + '…' : titleContent;
        const titleRemainder = rawFirstLine.length > titleContent.length ? rawFirstLine.slice(titleContent.length).trim() : '';
        const content = titleRemainder
            ? (titleRemainder + (restOfLines ? '\n' + restOfLines : ''))
            : restOfLines;
        // Create collapsible result part
        const collapsiblePart = this._register(this.instantiationService.createInstance(ChatCollapsibleMarkdownContentPart, title, content, this.context, this.chatContentMarkdownRenderer));
        // Wrap in a container for chain of thought line styling
        this.resultContainer = $('.chat-thinking-tool-wrapper.chat-subagent-section');
        const resultIcon = createThinkingIcon(Codicon.check);
        this.resultContainer.appendChild(resultIcon);
        this.resultContainer.appendChild(collapsiblePart.domNode);
        // With lazy rendering, wrapper may not be created yet if content hasn't been expanded
        if (this.wrapper) {
            dom.append(this.wrapper, this.resultContainer);
            // Show the container if it was hidden
            if (this.wrapper.style.display === 'none') {
                this.wrapper.style.display = '';
            }
        }
    }
    /**
     * Appends a tool invocation to the subagent group.
     * The tool part is created lazily - only when the subagent section is expanded,
     * unless it's actively streaming (not initially complete), in which case render immediately.
     */
    appendToolInvocation(toolInvocation, codeBlockStartIndex) {
        // Show the container when first tool item is added
        if (!this.hasToolItems) {
            this.hasToolItems = true;
            // With lazy rendering, wrapper may not be created yet if content hasn't been expanded
            if (this.wrapper) {
                this.wrapper.style.display = '';
            }
        }
        // Track tool state for title updates and auto-expand/collapse on confirmation
        this.trackToolState(toolInvocation);
        // Render immediately only if already expanded or has been expanded before
        if (this.isExpanded() || this.hasExpandedOnce) {
            const part = this.createToolPart(toolInvocation, codeBlockStartIndex);
            this.appendToolPartToDOM(part, toolInvocation);
        }
        else {
            // Defer rendering until expanded
            const item = {
                kind: 'tool',
                lazy: new Lazy(() => this.createToolPart(toolInvocation, codeBlockStartIndex)),
                toolInvocation,
                codeBlockStartIndex,
            };
            this.lazyItems.push(item);
        }
    }
    /**
     * Appends a markdown item (e.g., an edit pill) to the subagent content part.
     * This is used to route codeblockUri parts with subAgentInvocationId to this subagent's container.
     */
    appendMarkdownItem(factory, _codeblocksPartId, _markdown, _originalParent) {
        // If expanded or has been expanded once, render immediately
        if (this.isExpanded() || this.hasExpandedOnce) {
            const result = factory();
            this.appendMarkdownItemToDOM(result.domNode);
            if (result.disposable) {
                this._register(result.disposable);
            }
        }
        else {
            // Defer rendering until expanded
            const item = {
                kind: 'markdown',
                lazy: new Lazy(factory),
            };
            this.lazyItems.push(item);
        }
    }
    /**
     * Appends a hook item (blocked/warning) to the subagent content part.
     */
    appendHookItem(factory, hookPart) {
        // update title with hook message
        const hookMessage = hookPart.stopReason
            ? (hookPart.toolDisplayName
                ? localize('hook.subagent.blocked', 'Blocked {0}', hookPart.toolDisplayName)
                : localize('hook.subagent.blockedGeneric', 'Blocked by hook'))
            : (hookPart.toolDisplayName
                ? localize('hook.subagent.warning', 'Warning for {0}', hookPart.toolDisplayName)
                : localize('hook.subagent.warningGeneric', 'Hook warning'));
        this.currentRunningToolMessage = hookMessage;
        this.updateTitle();
        if (this.isExpanded() || this.hasExpandedOnce) {
            const result = factory();
            this.appendHookItemToDOM(result.domNode, hookPart);
            if (result.disposable) {
                this._register(result.disposable);
            }
        }
        else {
            const item = {
                kind: 'hook',
                lazy: new Lazy(factory),
                hookPart,
            };
            this.lazyItems.push(item);
        }
    }
    /**
     * Appends a hook item's DOM node to the wrapper.
     */
    appendHookItemToDOM(domNode, hookPart) {
        const itemWrapper = $('.chat-thinking-tool-wrapper');
        const icon = hookPart.stopReason ? Codicon.error : Codicon.warning;
        const iconElement = createThinkingIcon(icon);
        itemWrapper.appendChild(iconElement);
        itemWrapper.appendChild(domNode);
        // Treat hook items as tool items for visibility purposes
        if (!this.hasToolItems) {
            this.hasToolItems = true;
            if (this.wrapper) {
                this.wrapper.style.display = '';
            }
        }
        if (this.wrapper) {
            if (this.resultContainer) {
                this.wrapper.insertBefore(itemWrapper, this.resultContainer);
            }
            else {
                this.wrapper.appendChild(itemWrapper);
            }
        }
        this.lastItemWrapper = itemWrapper;
        this.layoutScheduler.schedule();
    }
    /**
     * Appends a markdown item's DOM node to the wrapper.
     */
    appendMarkdownItemToDOM(domNode) {
        if (!domNode.hasChildNodes() || domNode.textContent?.trim() === '') {
            return;
        }
        // Wrap with icon like other items
        const itemWrapper = $('.chat-thinking-tool-wrapper');
        const iconElement = createThinkingIcon(Codicon.edit);
        itemWrapper.appendChild(domNode);
        itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);
        // Insert before result container if it exists, otherwise append
        if (this.wrapper) {
            if (this.resultContainer) {
                this.wrapper.insertBefore(itemWrapper, this.resultContainer);
            }
            else {
                this.wrapper.appendChild(itemWrapper);
            }
        }
        this.lastItemWrapper = itemWrapper;
        // Schedule layout to measure last item and scroll
        this.layoutScheduler.schedule();
    }
    shouldInitEarly() {
        // Never init early - subagent is collapsed while running, content only shown on expand
        return false;
    }
    /**
     * Creates a ChatToolInvocationPart for the given tool invocation.
     */
    createToolPart(toolInvocation, codeBlockStartIndex) {
        const part = this.instantiationService.createInstance(ChatToolInvocationPart, toolInvocation, this.context, this.chatContentMarkdownRenderer, this.listPool, this.editorPool, this.currentWidthDelegate, this.announcedToolProgressKeys, codeBlockStartIndex);
        this._register(part);
        return part;
    }
    /**
     * Appends a tool part's DOM node to the wrapper with appropriate icon wrapper.
     */
    appendToolPartToDOM(part, toolInvocation) {
        const content = part.domNode;
        if (!content.hasChildNodes() || content.textContent?.trim() === '') {
            return;
        }
        // Wrap with icon like thinking parts do
        const itemWrapper = $('.chat-thinking-tool-wrapper');
        const icon = getToolInvocationIcon(toolInvocation.toolId, toolInvocation.icon);
        const iconElement = createThinkingIcon(icon);
        itemWrapper.appendChild(content);
        // Dynamically add/remove icon based on confirmation state
        if (toolInvocation.kind === 'toolInvocation') {
            this._register(autorun(r => {
                const state = toolInvocation.state.read(r);
                const hasConfirmation = state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ ||
                    state.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */;
                if (hasConfirmation) {
                    iconElement.remove();
                }
                else if (!iconElement.parentElement) {
                    itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);
                }
            }));
        }
        else {
            // For serialized invocations, always show icon (already completed)
            itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);
        }
        // Insert before result container if it exists, otherwise append
        // With lazy rendering, wrapper may not be created yet if content hasn't been expanded
        if (this.wrapper) {
            if (this.resultContainer) {
                this.wrapper.insertBefore(itemWrapper, this.resultContainer);
            }
            else {
                this.wrapper.appendChild(itemWrapper);
            }
        }
        this.lastItemWrapper = itemWrapper;
        // Schedule layout to measure last item and scroll
        this.layoutScheduler.schedule();
    }
    /**
     * Materializes a lazy item by creating the content and adding it to the DOM.
     */
    materializeLazyItem(item) {
        if (item.lazy.hasValue) {
            return; // Already materialized
        }
        if (item.kind === 'tool') {
            const part = item.lazy.value;
            this.appendToolPartToDOM(part, item.toolInvocation);
        }
        else if (item.kind === 'markdown') {
            const result = item.lazy.value;
            this.appendMarkdownItemToDOM(result.domNode);
            if (result.disposable) {
                this._register(result.disposable);
            }
        }
        else if (item.kind === 'hook') {
            const result = item.lazy.value;
            this.appendHookItemToDOM(result.domNode, item.hookPart);
            if (result.disposable) {
                this._register(result.disposable);
            }
        }
    }
    /**
     * Materializes all pending lazy content (prompt, tool items, result) when the section is expanded.
     * This is called when first expanded, but the wrapper must exist (created by base class initContent).
     */
    materializePendingContent() {
        // Wrapper may not be created yet if this autorun runs before the base class autorun
        // that calls initContent(). In that case, initContent() will call this logic.
        if (!this.wrapper) {
            return;
        }
        // Render pending prompt section
        if (this.pendingPromptRender) {
            this.pendingPromptRender = false;
            this.doRenderPromptSection();
        }
        // Materialize lazy tool items
        for (const item of this.lazyItems) {
            this.materializeLazyItem(item);
        }
        // Render pending result text
        if (this.pendingResultText) {
            const resultText = this.pendingResultText;
            this.pendingResultText = undefined;
            this.doRenderResultText(resultText);
        }
    }
    performLayout() {
        // Measure last item height once after layout, set CSS variable for collapsed max-height
        if (this.lastItemWrapper && this.wrapper) {
            const height = this.lastItemWrapper.offsetHeight;
            if (height > 0) {
                this.wrapper.style.setProperty('--chat-subagent-last-item-height', `${height}px`);
            }
        }
        // Auto-scroll to bottom only when actively streaming (not for completed responses)
        if (this.isActive && !this.isInitiallyComplete && this.wrapper) {
            const scrollHeight = this.wrapper.scrollHeight;
            this.wrapper.scrollTop = scrollHeight;
        }
    }
    hasSameContent(other, _followingContent, _element) {
        if (other.kind === 'markdownContent') {
            return true;
        }
        // Match hook parts with the same subAgentInvocationId to keep them grouped in the subagent dropdown
        if (other.kind === 'hook' && other.subAgentInvocationId) {
            return this.subAgentInvocationId === other.subAgentInvocationId;
        }
        // Match subagent tool invocations with the same subAgentInvocationId to keep them grouped
        if ((other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized') && (other.subAgentInvocationId || ChatSubagentContentPart_1.isParentSubagentTool(other))) {
            // For parent subagent tool, use toolCallId as the effective ID
            const otherEffectiveId = other.subAgentInvocationId ?? other.toolCallId;
            // If both have IDs, they must match
            if (this.subAgentInvocationId && otherEffectiveId) {
                return this.subAgentInvocationId === otherEffectiveId;
            }
            // Fallback for tools without IDs - group if this part has no ID and tool has no ID
            return !this.subAgentInvocationId && !otherEffectiveId;
        }
        return false;
    }
};
ChatSubagentContentPart = ChatSubagentContentPart_1 = __decorate([
    __param(8, IInstantiationService),
    __param(9, IChatMarkdownAnchorService),
    __param(10, IHoverService),
    __param(11, IConfigurationService)
], ChatSubagentContentPart);
export { ChatSubagentContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFN1YmFnZW50Q29udGVudFBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdFN1YmFnZW50Q29udGVudFBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLENBQUMsRUFBRSx1QkFBdUIsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzdHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTdELE9BQU8sRUFBZSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQU16RyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUc3RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUU1RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN6RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN6RixPQUFPLGlDQUFpQyxDQUFDO0FBRXpDLE1BQU0sZ0JBQWdCLEdBQUcsR0FBRyxDQUFDO0FBK0I3Qjs7O0dBR0c7QUFDSSxJQUFNLHVCQUF1QiwrQkFBN0IsTUFBTSx1QkFBd0IsU0FBUSwwQkFBMEI7SUFxQ3RFOzs7T0FHRztJQUNLLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxjQUFtRTtRQUN0RyxPQUFPLGNBQWMsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLEtBQUssVUFBVSxJQUFJLENBQUMsY0FBYyxDQUFDLG9CQUFvQixDQUFDO0lBQ3JHLENBQUM7SUFFRDs7T0FFRztJQUNLLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxjQUFtRTtRQUNyRyxNQUFNLGtCQUFrQixHQUFHLFFBQVEsQ0FBQyxrQ0FBa0MsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBRTVGLDREQUE0RDtRQUM1RCxJQUFJLENBQUMseUJBQXVCLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUNuRSxPQUFPLEVBQUUsV0FBVyxFQUFFLGtCQUFrQixFQUFFLG9CQUFvQixFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxDQUFDO1FBQ3ZJLENBQUM7UUFFRCxvRUFBb0U7UUFDcEUsSUFBSSxjQUFjLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQzFELE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDO1lBQ3JFLE9BQU87Z0JBQ04sV0FBVyxFQUFFLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLElBQUksa0JBQWtCO2dCQUM5RSxvQkFBb0IsRUFBRSxDQUFDLGNBQWM7Z0JBQ3JDLFNBQVMsRUFBRSxjQUFjLENBQUMsZ0JBQWdCLENBQUMsU0FBUztnQkFDcEQsTUFBTSxFQUFFLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNO2dCQUM5QyxTQUFTLEVBQUUsY0FBYyxDQUFDLGdCQUFnQixDQUFDLFNBQVM7YUFDcEQsQ0FBQztRQUNILENBQUM7UUFFRCw4Q0FBOEM7UUFDOUMsSUFBSSxjQUFjLENBQUMsSUFBSSxLQUFLLGdCQUFnQixFQUFFLENBQUM7WUFDOUMsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUN6QyxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsSUFBSSxvREFBNEMsQ0FBQyxDQUFDO2dCQUN0RSxLQUFLLENBQUMsVUFBcUQ7Z0JBQzNELENBQUMsQ0FBQyxTQUFTLENBQUM7WUFDYixNQUFNLGNBQWMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLFdBQVcsQ0FBQztZQUM3QyxPQUFPO2dCQUNOLFdBQVcsRUFBRSxNQUFNLEVBQUUsV0FBVyxJQUFJLGtCQUFrQjtnQkFDdEQsb0JBQW9CLEVBQUUsQ0FBQyxjQUFjO2dCQUNyQyxTQUFTLEVBQUUsTUFBTSxFQUFFLFNBQVM7Z0JBQzVCLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTTtnQkFDdEIsU0FBUyxFQUFFLFNBQVM7YUFDcEIsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLEVBQUUsV0FBVyxFQUFFLGtCQUFrQixFQUFFLG9CQUFvQixFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxDQUFDO0lBQ3ZJLENBQUM7SUFFRCxZQUNpQixvQkFBNEIsRUFDNUMsY0FBbUUsRUFDbEQsT0FBc0MsRUFDdEMsMkJBQThDLEVBQzlDLFFBQTZCLEVBQzdCLFVBQXNCLEVBQ3RCLG9CQUFrQyxFQUNsQyx5QkFBc0MsRUFDaEMsb0JBQTRELEVBQ3ZELHlCQUFzRSxFQUNuRixZQUEyQixFQUNuQixvQkFBMkM7UUFFbEUsaUVBQWlFO1FBQ2pFLE1BQU0sRUFBRSxXQUFXLEVBQUUsb0JBQW9CLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyx5QkFBdUIsQ0FBQyxtQkFBbUIsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUV4SSxtRUFBbUU7UUFDbkUsTUFBTSxNQUFNLEdBQUcsU0FBUyxJQUFJLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUN6RSxNQUFNLFlBQVksR0FBRyxHQUFHLE1BQU0sS0FBSyxXQUFXLEVBQUUsQ0FBQztRQUNqRCxLQUFLLENBQUMsWUFBWSxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFuQjVELHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBUTtRQUUzQixZQUFPLEdBQVAsT0FBTyxDQUErQjtRQUN0QyxnQ0FBMkIsR0FBM0IsMkJBQTJCLENBQW1CO1FBQzlDLGFBQVEsR0FBUixRQUFRLENBQXFCO1FBQzdCLGVBQVUsR0FBVixVQUFVLENBQVk7UUFDdEIseUJBQW9CLEdBQXBCLG9CQUFvQixDQUFjO1FBQ2xDLDhCQUF5QixHQUF6Qix5QkFBeUIsQ0FBYTtRQUNmLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDdEMsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUE0QjtRQS9GM0YsYUFBUSxHQUFZLElBQUksQ0FBQztRQUN6QixpQkFBWSxHQUFZLEtBQUssQ0FBQztRQVV0Qyx5QkFBeUI7UUFDUixjQUFTLEdBQWdCLEVBQUUsQ0FBQztRQUNyQyxvQkFBZSxHQUFZLEtBQUssQ0FBQztRQUNqQyx3QkFBbUIsR0FBWSxLQUFLLENBQUM7UUFTNUIscUJBQWdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixFQUFFLENBQUMsQ0FBQztRQUU1RSxvQ0FBb0M7UUFDNUIsZ0NBQTJCLEdBQVcsQ0FBQyxDQUFDO1FBQ3hDLHlCQUFvQixHQUFZLEtBQUssQ0FBQztRQUN0QyxnQ0FBMkIsR0FBWSxLQUFLLENBQUM7UUFLcEMseUJBQW9CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixFQUFxQixDQUFDLENBQUM7UUEwRWxHLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDO1FBQy9CLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxvQkFBb0IsQ0FBQztRQUNsRCxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUMzQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUMzQixJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUM7UUFFbkQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQztRQUMxQixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSwwQkFBMEIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRTFGLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDNUMsQ0FBQztRQUVELHVEQUF1RDtRQUN2RCxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3RELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDO1lBQ3ZELFlBQVksQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUMsa0NBQWtDLENBQUMsQ0FBQztZQUM5RCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxHQUFHLFlBQVksQ0FBQztZQUNqRCxZQUFZLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFFRCxtRkFBbUY7UUFFbkYsSUFBSSxJQUFJLENBQUMsZUFBZSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN0RCxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDO1FBQ2xELENBQUM7UUFFRCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUMxQixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0QixJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztvQkFDL0MsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQztnQkFDbEQsQ0FBQztxQkFBTSxDQUFDO29CQUNQLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7Z0JBQzNDLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLDZDQUE2QztRQUM3QyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUMxQixJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUN2RCxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztnQkFDNUIsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7WUFDbEMsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSiw2RUFBNkU7UUFDN0UsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV4Qiw4QkFBOEI7UUFDOUIsZ0ZBQWdGO1FBQ2hGLGlHQUFpRztRQUNqRyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUMxQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxQyxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUNkLElBQUksQ0FBQyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztvQkFDdkMsSUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksQ0FBQztnQkFDbEMsQ0FBQztZQUNGLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxrRkFBa0Y7Z0JBQ2xGLElBQUksSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7b0JBQ3RDLElBQUksQ0FBQywyQkFBMkIsR0FBRyxLQUFLLENBQUM7Z0JBQzFDLENBQUM7Z0JBQ0QsbUdBQW1HO2dCQUNuRyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO29CQUMvQixJQUFJLENBQUMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO2dCQUNuQyxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSiw2Q0FBNkM7UUFDN0MsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksdUJBQXVCLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTdHLG9EQUFvRDtRQUNwRCxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFFbkIsNkZBQTZGO1FBQzdGLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBRTNCLHlDQUF5QztRQUN6QyxJQUFJLENBQUMsbUJBQW1CLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUVrQixXQUFXO1FBQzdCLElBQUksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDLG1EQUFtRCxDQUFDLENBQUM7UUFFdEUsNENBQTRDO1FBQzVDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDeEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztRQUNyQyxDQUFDO1FBRUQsMkRBQTJEO1FBQzNELHNGQUFzRjtRQUN0RixJQUFJLENBQUMseUJBQXlCLEVBQUUsQ0FBQztRQUVqQyxvRUFBb0U7UUFDcEUsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLHdCQUF3QixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNHLElBQUksQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUVyRCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDckIsQ0FBQztJQUVEOzs7O09BSUc7SUFDSyxtQkFBbUI7UUFDMUIsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzFDLE9BQU87UUFDUixDQUFDO1FBRUQsMkdBQTJHO1FBQzNHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7WUFDaEcsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztZQUNoQyxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxtQkFBbUIsR0FBRyxLQUFLLENBQUM7UUFDakMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUVPLHFCQUFxQjtRQUM1QixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDMUMsT0FBTztRQUNSLENBQUM7UUFFRCxpQ0FBaUM7UUFDakMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEMsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUM1RSxNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUVyRCxzREFBc0Q7UUFDdEQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzFELE1BQU0sWUFBWSxHQUFHLFlBQVksQ0FBQyxNQUFNLEdBQUcsZ0JBQWdCLENBQUM7UUFDNUQsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxZQUFZLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUM7UUFDL0QsTUFBTSxjQUFjLEdBQUcsWUFBWSxDQUFDLE1BQU0sR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ3ZILE1BQU0sT0FBTyxHQUFHLGNBQWM7WUFDN0IsQ0FBQyxDQUFDLENBQUMsY0FBYyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM1RCxDQUFDLENBQUMsQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRWhDLGlDQUFpQztRQUNqQyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQzlFLGtDQUFrQyxFQUNsQyxLQUFLLEVBQ0wsT0FBTyxFQUNQLElBQUksQ0FBQyxPQUFPLEVBQ1osSUFBSSxDQUFDLDJCQUEyQixDQUNoQyxDQUFDLENBQUM7UUFFSCx3REFBd0Q7UUFDeEQsSUFBSSxDQUFDLGVBQWUsR0FBRyxDQUFDLENBQUMsbURBQW1ELENBQUMsQ0FBQztRQUM5RSxNQUFNLFVBQVUsR0FBRyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdkQsSUFBSSxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRTFELHlDQUF5QztRQUN6QyxzRkFBc0Y7UUFDdEYsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbEIsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUM3QixJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDMUUsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDaEQsQ0FBQztZQUVELDBEQUEwRDtZQUMxRCxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDM0MsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNqQyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFTSxXQUFXO1FBQ2pCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUN0QixDQUFDO0lBRU0sY0FBYztRQUNwQixJQUFJLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUN0QixJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUN0RCxJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDO1FBQzNDLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQ2hDLElBQUksQ0FBQyxXQUFXLEdBQUcsUUFBUSxDQUFDLDJDQUEyQyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQzFGLENBQUM7UUFDRCxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDckIscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVNLGFBQWE7UUFDbkIsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ25CLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7UUFDM0MsQ0FBQztJQUNGLENBQUM7SUFFTyxXQUFXO1FBQ2xCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLElBQUksUUFBUSxDQUFDLHNCQUFzQixFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzlFLE1BQU0sV0FBVyxHQUFHLEdBQUcsTUFBTSxLQUFLLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNyRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMseUJBQXlCLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsV0FBVyxJQUFJLENBQUMseUJBQXlCLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBRXhILElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDM0IsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQztRQUV2RCxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3BCLFlBQVksQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxTQUFTLENBQUM7WUFFbEMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxTQUFTLENBQUM7WUFFdEMsTUFBTSxVQUFVLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzdCLFVBQVUsQ0FBQyxXQUFXLEdBQUcsR0FBRyxNQUFNLEdBQUcsQ0FBQztZQUN0QyxZQUFZLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRXJDLE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO1lBQzNELFFBQVEsQ0FBQyxXQUFXLEdBQUcsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDOUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUVuQyxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEdBQUcsV0FBVyxDQUFDO1lBQ3JELElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLFlBQVksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDdEUsT0FBTztRQUNSLENBQUM7UUFFRCw0Q0FBNEM7UUFDNUMsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNwRSxZQUFZLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQztZQUM5QixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7WUFDOUQsWUFBWSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBQ0QsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7UUFFaEQsb0NBQW9DO1FBQ3BDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUVsQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbkIsSUFBSSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztnQkFDL0IsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNuQyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsU0FBUyxDQUFDO1lBQ3ZDLENBQUM7UUFDRixDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxNQUFNLENBQUMsSUFBSSxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztZQUN6RixNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztZQUN4RixpQkFBaUIsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMseUJBQXlCLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDO1lBRXpDLElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7Z0JBQy9CLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3ZELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxZQUFZLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMxQyxDQUFDO1lBQ0QsSUFBSSxDQUFDLG9CQUFvQixHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFDNUMsQ0FBQztRQUVELE1BQU0sU0FBUyxHQUFHLEdBQUcsV0FBVyxHQUFHLFlBQVksRUFBRSxDQUFDO1FBQ2xELElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDbkQsSUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsWUFBWSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBRU8sV0FBVztRQUNsQixJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUM5QyxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRTtZQUMvRixPQUFPLEVBQUUsUUFBUSxDQUFDLDRCQUE0QixFQUFFLFlBQVksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO1NBQzdFLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSSxjQUFjLENBQUMsY0FBbUU7UUFDeEYsbUNBQW1DO1FBQ25DLElBQUksY0FBYyxDQUFDLElBQUksS0FBSyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzlDLE9BQU87UUFDUixDQUFDO1FBRUQseUVBQXlFO1FBQ3pFLE1BQU0sT0FBTyxHQUFHLGNBQWMsQ0FBQyxpQkFBaUIsQ0FBQztRQUNqRCxNQUFNLFdBQVcsR0FBRyxPQUFPLE9BQU8sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztRQUMxRSxJQUFJLENBQUMseUJBQXlCLEdBQUcsV0FBVyxDQUFDO1FBQzdDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUVuQixJQUFJLHlCQUF5QixHQUFHLEtBQUssQ0FBQztRQUN0QyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUMxQixNQUFNLEtBQUssR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUUzQyxtQ0FBbUM7WUFDbkMsTUFBTSx3QkFBd0IsR0FBRyxLQUFLLENBQUMsSUFBSSxpRUFBeUQ7Z0JBQ25HLEtBQUssQ0FBQyxJQUFJLGlFQUF5RCxDQUFDO1lBRXJFLElBQUksd0JBQXdCLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO2dCQUM1RCw2Q0FBNkM7Z0JBQzdDLElBQUksQ0FBQywyQkFBMkIsRUFBRSxDQUFDO2dCQUNuQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7b0JBQ3hCLElBQUksQ0FBQywyQkFBMkIsR0FBRyxJQUFJLENBQUM7b0JBQ3hDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3hCLENBQUM7WUFDRixDQUFDO2lCQUFNLElBQUksQ0FBQyx3QkFBd0IsSUFBSSx5QkFBeUIsRUFBRSxDQUFDO2dCQUNuRSw2Q0FBNkM7Z0JBQzdDLElBQUksQ0FBQywyQkFBMkIsRUFBRSxDQUFDO2dCQUNuQyxJQUFJLElBQUksQ0FBQywyQkFBMkIsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLDJCQUEyQixJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7b0JBQzlHLHlFQUF5RTtvQkFDekUsSUFBSSxDQUFDLDJCQUEyQixHQUFHLEtBQUssQ0FBQztvQkFDekMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDekIsQ0FBQztZQUNGLENBQUM7WUFFRCx5QkFBeUIsR0FBRyx3QkFBd0IsQ0FBQztRQUN0RCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7T0FHRztJQUNLLG1CQUFtQixDQUFDLGNBQW1FO1FBQzlGLGtEQUFrRDtRQUNsRCxJQUFJLENBQUMseUJBQXVCLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUNuRSxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksY0FBYyxDQUFDLElBQUksS0FBSyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzlDLDZDQUE2QztZQUM3QyxJQUFJLFlBQVksR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksb0RBQTRDLENBQUM7WUFDL0YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQzFCLE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMzQyxJQUFJLEtBQUssQ0FBQyxJQUFJLG9EQUE0QyxFQUFFLENBQUM7b0JBQzVELFlBQVksR0FBRyxLQUFLLENBQUM7b0JBQ3JCLDJCQUEyQjtvQkFDM0IsTUFBTSxTQUFTLEdBQUcsQ0FBQyxLQUFLLENBQUMsZUFBZSxJQUFJLEVBQUUsQ0FBQzt5QkFDN0MsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUEyQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLENBQUM7eUJBQy9FLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFFMUIsSUFBSSxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO3dCQUMxQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUM3QyxDQUFDO29CQUVELGdGQUFnRjtvQkFDaEYsSUFBSSxjQUFjLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO3dCQUMxRCxJQUFJLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLEVBQUUsQ0FBQzs0QkFDakQsSUFBSSxDQUFDLFdBQVcsR0FBRyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDOzRCQUMvRCxJQUFJLENBQUMscUJBQXFCLEdBQUcsS0FBSyxDQUFDO3dCQUNwQyxDQUFDO3dCQUNELElBQUksY0FBYyxDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxDQUFDOzRCQUMvQyxJQUFJLENBQUMsU0FBUyxHQUFHLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUM7NEJBQzNELElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQzt3QkFDcEIsQ0FBQztvQkFDRixDQUFDO29CQUVELDJDQUEyQztvQkFDM0MsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUN2QixDQUFDO3FCQUFNLElBQUksWUFBWSxJQUFJLEtBQUssQ0FBQyxJQUFJLG9EQUE0QyxFQUFFLENBQUM7b0JBQ25GLFlBQVksR0FBRyxLQUFLLENBQUM7b0JBQ3JCLHdEQUF3RDtvQkFDeEQsTUFBTSxFQUFFLFdBQVcsRUFBRSxvQkFBb0IsRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLHlCQUF1QixDQUFDLG1CQUFtQixDQUFDLGNBQWMsQ0FBQyxDQUFDO29CQUN4SSxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztvQkFDL0IsSUFBSSxDQUFDLHFCQUFxQixHQUFHLG9CQUFvQixDQUFDO29CQUNsRCxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztvQkFDM0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7b0JBQ3JCLElBQUksU0FBUyxFQUFFLENBQUM7d0JBQ2YsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7d0JBQzNCLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDcEIsQ0FBQztvQkFDRCxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztvQkFDM0IsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNwQixDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7YUFBTSxJQUFJLGNBQWMsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLEtBQUssVUFBVSxJQUFJLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMzRyx5REFBeUQ7WUFDekQsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM5RCxxQ0FBcUM7WUFDckMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3ZCLENBQUM7SUFDRixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNJLGdCQUFnQixDQUFDLFVBQWtCO1FBQ3pDLElBQUksSUFBSSxDQUFDLGVBQWUsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3pDLE9BQU8sQ0FBQyxpQ0FBaUM7UUFDMUMsQ0FBQztRQUVELDJHQUEyRztRQUMzRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDO1lBQ2hHLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxVQUFVLENBQUM7WUFDcEMsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsU0FBUyxDQUFDO1FBQ25DLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRU8sa0JBQWtCLENBQUMsVUFBa0I7UUFDNUMsSUFBSSxJQUFJLENBQUMsZUFBZSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDekMsT0FBTztRQUNSLENBQUM7UUFFRCxpQ0FBaUM7UUFDakMsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNyQyxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3BDLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBRXJELHNEQUFzRDtRQUN0RCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDMUQsTUFBTSxZQUFZLEdBQUcsWUFBWSxDQUFDLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQztRQUM1RCxNQUFNLEtBQUssR0FBRyxZQUFZLENBQUMsQ0FBQyxDQUFDLFlBQVksR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQztRQUMvRCxNQUFNLGNBQWMsR0FBRyxZQUFZLENBQUMsTUFBTSxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDdkgsTUFBTSxPQUFPLEdBQUcsY0FBYztZQUM3QixDQUFDLENBQUMsQ0FBQyxjQUFjLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzVELENBQUMsQ0FBQyxXQUFXLENBQUM7UUFFZixpQ0FBaUM7UUFDakMsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUM5RSxrQ0FBa0MsRUFDbEMsS0FBSyxFQUNMLE9BQU8sRUFDUCxJQUFJLENBQUMsT0FBTyxFQUNaLElBQUksQ0FBQywyQkFBMkIsQ0FDaEMsQ0FBQyxDQUFDO1FBRUgsd0RBQXdEO1FBQ3hELElBQUksQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDLG1EQUFtRCxDQUFDLENBQUM7UUFDOUUsTUFBTSxVQUFVLEdBQUcsa0JBQWtCLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3JELElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUUxRCxzRkFBc0Y7UUFDdEYsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUUvQyxzQ0FBc0M7WUFDdEMsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQzNDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDakMsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNJLG9CQUFvQixDQUFDLGNBQW1FLEVBQUUsbUJBQTJCO1FBQzNILG1EQUFtRDtRQUNuRCxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3hCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO1lBQ3pCLHNGQUFzRjtZQUN0RixJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDbEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNqQyxDQUFDO1FBQ0YsQ0FBQztRQUVELDhFQUE4RTtRQUM5RSxJQUFJLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRXBDLDBFQUEwRTtRQUMxRSxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDL0MsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxjQUFjLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztZQUN0RSxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ2hELENBQUM7YUFBTSxDQUFDO1lBQ1AsaUNBQWlDO1lBQ2pDLE1BQU0sSUFBSSxHQUFrQjtnQkFDM0IsSUFBSSxFQUFFLE1BQU07Z0JBQ1osSUFBSSxFQUFFLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsY0FBYyxFQUFFLG1CQUFtQixDQUFDLENBQUM7Z0JBQzlFLGNBQWM7Z0JBQ2QsbUJBQW1CO2FBQ25CLENBQUM7WUFDRixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQixDQUFDO0lBQ0YsQ0FBQztJQUVEOzs7T0FHRztJQUNJLGtCQUFrQixDQUN4QixPQUFpRSxFQUNqRSxpQkFBcUMsRUFDckMsU0FBK0IsRUFDL0IsZUFBNkI7UUFFN0IsNERBQTREO1FBQzVELElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUMvQyxNQUFNLE1BQU0sR0FBRyxPQUFPLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsdUJBQXVCLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzdDLElBQUksTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUN2QixJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNuQyxDQUFDO1FBQ0YsQ0FBQzthQUFNLENBQUM7WUFDUCxpQ0FBaUM7WUFDakMsTUFBTSxJQUFJLEdBQXNCO2dCQUMvQixJQUFJLEVBQUUsVUFBVTtnQkFDaEIsSUFBSSxFQUFFLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQzthQUN2QixDQUFDO1lBQ0YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDM0IsQ0FBQztJQUNGLENBQUM7SUFFRDs7T0FFRztJQUNJLGNBQWMsQ0FDcEIsT0FBaUUsRUFDakUsUUFBdUI7UUFFdkIsaUNBQWlDO1FBQ2pDLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxVQUFVO1lBQ3RDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxlQUFlO2dCQUMxQixDQUFDLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLGFBQWEsRUFBRSxRQUFRLENBQUMsZUFBZSxDQUFDO2dCQUM1RSxDQUFDLENBQUMsUUFBUSxDQUFDLDhCQUE4QixFQUFFLGlCQUFpQixDQUFDLENBQUM7WUFDL0QsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLGVBQWU7Z0JBQzFCLENBQUMsQ0FBQyxRQUFRLENBQUMsdUJBQXVCLEVBQUUsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLGVBQWUsQ0FBQztnQkFDaEYsQ0FBQyxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO1FBQzlELElBQUksQ0FBQyx5QkFBeUIsR0FBRyxXQUFXLENBQUM7UUFDN0MsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBRW5CLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUMvQyxNQUFNLE1BQU0sR0FBRyxPQUFPLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNuRCxJQUFJLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDbkMsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxJQUFJLEdBQWtCO2dCQUMzQixJQUFJLEVBQUUsTUFBTTtnQkFDWixJQUFJLEVBQUUsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDO2dCQUN2QixRQUFRO2FBQ1IsQ0FBQztZQUNGLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzNCLENBQUM7SUFDRixDQUFDO0lBRUQ7O09BRUc7SUFDSyxtQkFBbUIsQ0FBQyxPQUFvQixFQUFFLFFBQXVCO1FBQ3hFLE1BQU0sV0FBVyxHQUFHLENBQUMsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBQ3JELE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUM7UUFDbkUsTUFBTSxXQUFXLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0MsV0FBVyxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNyQyxXQUFXLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRWpDLHlEQUF5RDtRQUN6RCxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3hCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO1lBQ3pCLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNsQixJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2pDLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbEIsSUFBSSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQzFCLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDOUQsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ3ZDLENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxDQUFDLGVBQWUsR0FBRyxXQUFXLENBQUM7UUFDbkMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNqQyxDQUFDO0lBRUQ7O09BRUc7SUFDSyx1QkFBdUIsQ0FBQyxPQUFvQjtRQUNuRCxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxJQUFJLE9BQU8sQ0FBQyxXQUFXLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7WUFDcEUsT0FBTztRQUNSLENBQUM7UUFFRCxrQ0FBa0M7UUFDbEMsTUFBTSxXQUFXLEdBQUcsQ0FBQyxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFDckQsTUFBTSxXQUFXLEdBQUcsa0JBQWtCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JELFdBQVcsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDakMsV0FBVyxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRTlELGdFQUFnRTtRQUNoRSxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNsQixJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUM5RCxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDdkMsQ0FBQztRQUNGLENBQUM7UUFDRCxJQUFJLENBQUMsZUFBZSxHQUFHLFdBQVcsQ0FBQztRQUVuQyxrREFBa0Q7UUFDbEQsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNqQyxDQUFDO0lBRWtCLGVBQWU7UUFDakMsdUZBQXVGO1FBQ3ZGLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVEOztPQUVHO0lBQ0ssY0FBYyxDQUFDLGNBQW1FLEVBQUUsbUJBQTJCO1FBQ3RILE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQ3BELHNCQUFzQixFQUN0QixjQUFjLEVBQ2QsSUFBSSxDQUFDLE9BQU8sRUFDWixJQUFJLENBQUMsMkJBQTJCLEVBQ2hDLElBQUksQ0FBQyxRQUFRLEVBQ2IsSUFBSSxDQUFDLFVBQVUsRUFDZixJQUFJLENBQUMsb0JBQW9CLEVBQ3pCLElBQUksQ0FBQyx5QkFBeUIsRUFDOUIsbUJBQW1CLENBQ25CLENBQUM7UUFFRixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVEOztPQUVHO0lBQ0ssbUJBQW1CLENBQUMsSUFBNEIsRUFBRSxjQUFtRTtRQUM1SCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQzdCLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLElBQUksT0FBTyxDQUFDLFdBQVcsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQztZQUNwRSxPQUFPO1FBQ1IsQ0FBQztRQUVELHdDQUF3QztRQUN4QyxNQUFNLFdBQVcsR0FBRyxDQUFDLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUNyRCxNQUFNLElBQUksR0FBRyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvRSxNQUFNLFdBQVcsR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM3QyxXQUFXLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRWpDLDBEQUEwRDtRQUMxRCxJQUFJLGNBQWMsQ0FBQyxJQUFJLEtBQUssZ0JBQWdCLEVBQUUsQ0FBQztZQUM5QyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDMUIsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzNDLE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxJQUFJLGlFQUF5RDtvQkFDMUYsS0FBSyxDQUFDLElBQUksaUVBQXlELENBQUM7Z0JBQ3JFLElBQUksZUFBZSxFQUFFLENBQUM7b0JBQ3JCLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDdEIsQ0FBQztxQkFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDO29CQUN2QyxXQUFXLENBQUMsWUFBWSxDQUFDLFdBQVcsRUFBRSxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQy9ELENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQzthQUFNLENBQUM7WUFDUCxtRUFBbUU7WUFDbkUsV0FBVyxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQy9ELENBQUM7UUFFRCxnRUFBZ0U7UUFDaEUsc0ZBQXNGO1FBQ3RGLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2xCLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUMxQixJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzlELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN2QyxDQUFDO1FBQ0YsQ0FBQztRQUNELElBQUksQ0FBQyxlQUFlLEdBQUcsV0FBVyxDQUFDO1FBRW5DLGtEQUFrRDtRQUNsRCxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ2pDLENBQUM7SUFFRDs7T0FFRztJQUNLLG1CQUFtQixDQUFDLElBQWU7UUFDMUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sQ0FBQyx1QkFBdUI7UUFDaEMsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUMxQixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztZQUM3QixJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUNyRCxDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQ3JDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQy9CLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDN0MsSUFBSSxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ3ZCLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ25DLENBQUM7UUFDRixDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ2pDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQy9CLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN4RCxJQUFJLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDbkMsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQ7OztPQUdHO0lBQ0sseUJBQXlCO1FBQ2hDLG9GQUFvRjtRQUNwRiw4RUFBOEU7UUFDOUUsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNuQixPQUFPO1FBQ1IsQ0FBQztRQUVELGdDQUFnQztRQUNoQyxJQUFJLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxLQUFLLENBQUM7WUFDakMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFDOUIsQ0FBQztRQUVELDhCQUE4QjtRQUM5QixLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUVELDZCQUE2QjtRQUM3QixJQUFJLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzVCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztZQUMxQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsU0FBUyxDQUFDO1lBQ25DLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNyQyxDQUFDO0lBQ0YsQ0FBQztJQUVPLGFBQWE7UUFDcEIsd0ZBQXdGO1FBQ3hGLElBQUksSUFBSSxDQUFDLGVBQWUsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDMUMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUM7WUFDakQsSUFBSSxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ2hCLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxrQ0FBa0MsRUFBRSxHQUFHLE1BQU0sSUFBSSxDQUFDLENBQUM7WUFDbkYsQ0FBQztRQUNGLENBQUM7UUFFRCxtRkFBbUY7UUFDbkYsSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNoRSxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQztZQUMvQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsR0FBRyxZQUFZLENBQUM7UUFDdkMsQ0FBQztJQUNGLENBQUM7SUFFRCxjQUFjLENBQUMsS0FBMkIsRUFBRSxpQkFBeUMsRUFBRSxRQUFzQjtRQUM1RyxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssaUJBQWlCLEVBQUUsQ0FBQztZQUN0QyxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxvR0FBb0c7UUFDcEcsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUN6RCxPQUFPLElBQUksQ0FBQyxvQkFBb0IsS0FBSyxLQUFLLENBQUMsb0JBQW9CLENBQUM7UUFDakUsQ0FBQztRQUVELDBGQUEwRjtRQUMxRixJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxnQkFBZ0IsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLDBCQUEwQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsb0JBQW9CLElBQUkseUJBQXVCLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQzNLLCtEQUErRDtZQUMvRCxNQUFNLGdCQUFnQixHQUFHLEtBQUssQ0FBQyxvQkFBb0IsSUFBSSxLQUFLLENBQUMsVUFBVSxDQUFDO1lBQ3hFLG9DQUFvQztZQUNwQyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO2dCQUNuRCxPQUFPLElBQUksQ0FBQyxvQkFBb0IsS0FBSyxnQkFBZ0IsQ0FBQztZQUN2RCxDQUFDO1lBQ0QsbUZBQW1GO1lBQ25GLE9BQU8sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztRQUN4RCxDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0NBQ0QsQ0FBQTtBQWozQlksdUJBQXVCO0lBZ0dqQyxXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsMEJBQTBCLENBQUE7SUFDMUIsWUFBQSxhQUFhLENBQUE7SUFDYixZQUFBLHFCQUFxQixDQUFBO0dBbkdYLHVCQUF1QixDQWkzQm5DIn0=