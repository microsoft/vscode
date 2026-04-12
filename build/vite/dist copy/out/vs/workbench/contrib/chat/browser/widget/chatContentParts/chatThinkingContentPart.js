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
var ChatThinkingContentPart_1;
import { $, clearNode, getWindow, hide, scheduleAtNextAnimationFrame } from '../../../../../../base/browser/dom.js';
import { alert } from '../../../../../../base/browser/ui/aria/aria.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { IChatToolInvocation } from '../../../common/chatService/chatService.js';
import { ChatConfiguration, ThinkingDisplayMode } from '../../../common/constants.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { extractCodeblockUrisFromText } from '../../../common/widget/annotations.js';
import { basename } from '../../../../../../base/common/resources.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { renderFileWidgets } from './chatInlineAnchorWidget.js';
import { localize } from '../../../../../../nls.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import './media/chatThinkingContent.css';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { extractImagesFromToolInvocationOutputDetails } from '../../../common/chatImageExtraction.js';
import { ChatThinkingExternalResourceWidget } from './chatThinkingExternalResourcesWidget.js';
import { LocalChatSessionUri, chatSessionResourceToId } from '../../../common/model/chatUri.js';
function extractTextFromPart(content) {
    const raw = Array.isArray(content.value) ? content.value.join('') : (content.value || '');
    return raw.trim();
}
function isEditToolId(toolId) {
    const lowerToolId = toolId.toLowerCase();
    return lowerToolId.includes('edit') ||
        lowerToolId.includes('create') ||
        lowerToolId.includes('replace') ||
        lowerToolId.includes('patch');
}
/**
 * Returns true for edit tools whose generic display name should be replaced
 * with "Editing files" while streaming (e.g. replace, multi-replace, patch, insertEdit).
 * Excludes create and notebook tools which already have good labels.
 */
function isGenericEditToolId(toolId) {
    const lowerToolId = toolId.toLowerCase();
    if (lowerToolId.includes('create') || lowerToolId.includes('notebook')) {
        return false;
    }
    return lowerToolId.includes('replace') ||
        lowerToolId.includes('patch') ||
        lowerToolId.includes('insertedit') ||
        lowerToolId.includes('insert_edit') ||
        lowerToolId.includes('editfile');
}
export function getToolInvocationIcon(toolId, registeredIcon) {
    if (registeredIcon) {
        return registeredIcon;
    }
    const lowerToolId = toolId.toLowerCase();
    if (lowerToolId.includes('search') ||
        lowerToolId.includes('grep') ||
        lowerToolId.includes('find') ||
        lowerToolId.includes('list') ||
        lowerToolId.includes('semantic') ||
        lowerToolId.includes('changes') ||
        lowerToolId.includes('codebase')) {
        return Codicon.search;
    }
    if (lowerToolId.includes('read') ||
        lowerToolId.includes('get_file') ||
        lowerToolId.includes('problems')) {
        return Codicon.book;
    }
    if (isEditToolId(toolId)) {
        return Codicon.pencil;
    }
    if (lowerToolId.includes('terminal')) {
        return Codicon.terminal;
    }
    // default to generic tool icon
    return Codicon.tools;
}
export function createThinkingIcon(icon) {
    const iconElement = $('span.chat-thinking-icon');
    iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
    return iconElement;
}
function extractTitleFromThinkingContent(content) {
    const headerMatch = content.match(/^\*\*([^*]+)\*\*/);
    return headerMatch ? headerMatch[1] : undefined;
}
const THINKING_SCROLL_MAX_HEIGHT = 200;
const TITLE_CACHE_STORAGE_KEY = 'chat.thinkingTitleCache';
const TITLE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TITLE_CACHE_MAX_ENTRIES = 1000;
var WorkingMessageCategory;
(function (WorkingMessageCategory) {
    WorkingMessageCategory["Thinking"] = "thinking";
    WorkingMessageCategory["Terminal"] = "terminal";
    WorkingMessageCategory["Tool"] = "tool";
})(WorkingMessageCategory || (WorkingMessageCategory = {}));
const defaultThinkingMessages = [
    localize('chat.thinking.thinking.1', 'Thinking'),
    localize('chat.thinking.thinking.2', 'Reasoning'),
    localize('chat.thinking.thinking.3', 'Considering'),
    localize('chat.thinking.thinking.4', 'Analyzing'),
    localize('chat.thinking.thinking.5', 'Evaluating'),
];
const terminalMessages = [
    localize('chat.thinking.terminal.1', 'Executing'),
    localize('chat.thinking.terminal.2', 'Running'),
    localize('chat.thinking.terminal.3', 'Processing'),
];
const toolMessages = [
    localize('chat.thinking.tool.1', 'Processing'),
    localize('chat.thinking.tool.2', 'Preparing'),
    localize('chat.thinking.tool.3', 'Loading'),
    localize('chat.thinking.tool.4', 'Analyzing'),
    localize('chat.thinking.tool.5', 'Evaluating'),
];
/**
 * Builds a phrase pool from defaults and user-configured custom phrases.
 * In 'replace' mode, only custom phrases are used; in 'append' mode (default),
 * custom phrases are added to the defaults.
 */
export function buildPhrasePool(defaults, configurationService) {
    const config = configurationService.getValue(ChatConfiguration.ThinkingPhrases);
    const customPhrases = Array.isArray(config?.phrases)
        ? config.phrases
            .filter((phrase) => typeof phrase === 'string')
            .map(phrase => phrase.trim())
            .filter(phrase => phrase.length > 0)
        : [];
    if (customPhrases.length > 0) {
        return config?.mode === 'replace' ? [...customPhrases] : [...defaults, ...customPhrases];
    }
    return [...defaults];
}
let ChatThinkingContentPart = ChatThinkingContentPart_1 = class ChatThinkingContentPart extends ChatCollapsibleContentPart {
    static _codeBlockRendererSync(_languageId, text, _raw) {
        const codeElement = $('code');
        codeElement.textContent = text;
        return codeElement;
    }
    get aggregatedDiff() { return this._aggregatedDiff; }
    getRandomWorkingMessage(category = "tool" /* WorkingMessageCategory.Tool */) {
        let pool = this.availableMessagesByCategory.get(category);
        if (!pool || pool.length === 0) {
            let defaults;
            switch (category) {
                case "thinking" /* WorkingMessageCategory.Thinking */:
                    defaults = defaultThinkingMessages;
                    break;
                case "terminal" /* WorkingMessageCategory.Terminal */:
                    defaults = terminalMessages;
                    break;
                case "tool" /* WorkingMessageCategory.Tool */:
                default:
                    defaults = toolMessages;
                    break;
            }
            pool = buildPhrasePool(defaults, this.configurationService);
            this.availableMessagesByCategory.set(category, pool);
        }
        const index = Math.floor(Math.random() * pool.length);
        return pool.splice(index, 1)[0];
    }
    constructor(content, context, chatContentMarkdownRenderer, streamingCompleted, instantiationService, configurationService, chatMarkdownAnchorService, languageModelsService, hoverService, storageService) {
        const initialText = extractTextFromPart(content);
        const extractedTitle = extractTitleFromThinkingContent(initialText)
            ?? localize('chat.thinking.header.initial', 'Thinking');
        super(extractedTitle, context, undefined, hoverService, configurationService);
        this.chatContentMarkdownRenderer = chatContentMarkdownRenderer;
        this.streamingCompleted = streamingCompleted;
        this.instantiationService = instantiationService;
        this.configurationService = configurationService;
        this.chatMarkdownAnchorService = chatMarkdownAnchorService;
        this.languageModelsService = languageModelsService;
        this.storageService = storageService;
        this._onDidChangeHeight = this._register(new Emitter());
        this._asyncRenderCallback = () => this._onDidChangeHeight.fire();
        this.defaultTitle = localize('chat.thinking.header', 'Thinking');
        this.workingTitle = localize('chat.thinking.header.working', 'Working');
        this._markdownResult = this._register(new MutableDisposable());
        this.fixedScrollingMode = false;
        this.autoScrollEnabled = true;
        this.extractedTitles = [];
        this.toolInvocationCount = 0;
        this.appendedItemCount = 0;
        this.isActive = true;
        this.toolInvocations = [];
        this.allThinkingParts = [];
        this.hookCount = 0;
        this.lazyItems = [];
        this.hasExpandedOnce = false;
        this.availableMessagesByCategory = new Map();
        this.toolWrappersByCallId = new Map();
        this.toolIconsByCallId = new Map();
        this.toolLabelsByCallId = new Map();
        this.toolDisposables = this._register(new DisposableMap());
        this.ownedToolParts = new Map();
        this.pendingRemovals = [];
        this.isUpdatingDimensions = false;
        this.lastKnownContentHeight = 0;
        this.lastKnownScrollTop = 0;
        this._titleDetailRendered = this._register(new MutableDisposable());
        this.diffStatsByPartId = new Map();
        this._aggregatedDiff = { added: 0, removed: 0 };
        this.id = content.id;
        this.content = content;
        this.allThinkingParts.push(content);
        const configuredMode = this.configurationService.getValue('chat.agent.thinkingStyle') ?? ThinkingDisplayMode.Collapsed;
        this.fixedScrollingMode = configuredMode === ThinkingDisplayMode.FixedScrolling;
        this.currentTitle = extractedTitle;
        if (extractedTitle !== this.defaultTitle) {
            this.lastExtractedTitle = extractedTitle;
        }
        this.currentThinkingValue = initialText;
        if (initialText.trim()) {
            this.appendedItemCount++;
        }
        // Alert screen reader users that thinking has started
        if (this.configurationService.getValue("accessibility.verboseChatProgressUpdates" /* AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates */)) {
            alert(localize('chat.thinking.started', 'Thinking'));
        }
        if (configuredMode === ThinkingDisplayMode.Collapsed) {
            this.setExpanded(false);
        }
        else if (configuredMode === ThinkingDisplayMode.CollapsedPreview) {
            // Start expanded if still in progress.
            // streamingCompleted is true when look-ahead finds subsequent non-pinnable
            // parts, meaning this thinking part won't receive more content.
            this.setExpanded(!this.streamingCompleted && !this.element.isComplete);
        }
        else {
            this.setExpanded(false);
        }
        const node = this.domNode;
        node.classList.add('chat-thinking-box');
        this._externalResourceWidget = this._register(this.instantiationService.createInstance(ChatThinkingExternalResourceWidget));
        this._register(this._externalResourceWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
        node.appendChild(this._externalResourceWidget.domNode);
        if (!this.streamingCompleted && !this.element.isComplete) {
            if (!this.fixedScrollingMode) {
                node.classList.add('chat-thinking-active');
            }
        }
        if (!this.fixedScrollingMode && !this.streamingCompleted && !this.element.isComplete && this._collapseButton) {
            const labelElement = this._collapseButton.labelElement;
            labelElement.textContent = '';
            this.titleShimmerSpan = $('span.chat-thinking-title-shimmer');
            this.titleShimmerSpan.textContent = extractedTitle;
            labelElement.appendChild(this.titleShimmerSpan);
        }
        if (this.fixedScrollingMode) {
            node.classList.add('chat-thinking-fixed-mode');
            this.currentTitle = this.defaultTitle;
        }
        this._register(toDisposable(() => {
            for (const d of this.ownedToolParts.values()) {
                d.dispose();
            }
            this.ownedToolParts.clear();
        }));
        // override for codicon chevron in the collapsible part
        this._register(autorun(r => {
            const isExpanded = this.expanded.read(r);
            if (this._collapseButton) {
                if (this.streamingCompleted || this.element.isComplete) {
                    this._collapseButton.icon = Codicon.check;
                }
                else if (!this.fixedScrollingMode) {
                    if (isExpanded) {
                        this._collapseButton.icon = Codicon.chevronDown;
                    }
                    else {
                        this._collapseButton.icon = Codicon.circleFilled;
                    }
                }
            }
        }));
        this._register(autorun(r => {
            const isExpanded = this._isExpanded.read(r);
            // Materialize lazy items when first expanded
            if (isExpanded && !this.hasExpandedOnce && this.lazyItems.length > 0) {
                this.hasExpandedOnce = true;
                // Flush pending removals so that completed hidden tools are removed from lazyItems before materialization
                this.processPendingRemovals();
                for (const item of this.lazyItems) {
                    this.materializeLazyItem(item);
                }
            }
            // If expanded but content matches title and there's nothing else to show, revert immediately.
            // Skip this check while still streaming — more content will arrive.
            if (isExpanded && !this.shouldAllowExpansion() && (this.streamingCompleted || this.element.isComplete)) {
                this.setExpanded(false);
                return;
            }
            this._externalResourceWidget.setCollapsed(!isExpanded);
            // Fire when expanded/collapsed
            this._onDidChangeHeight.fire();
        }));
        const label = this.lastExtractedTitle ?? '';
        if (!this.fixedScrollingMode && !this._isExpanded.get()) {
            this.setTitle(label);
        }
        if (this._collapseButton) {
            this._register(this._collapseButton.onDidClick(() => {
                if (this.streamingCompleted || this.fixedScrollingMode) {
                    return;
                }
                const expanded = this.isExpanded();
                if (expanded) {
                    // Just expanded: show plain 'Working' with no detail
                    this.setTitle(this.defaultTitle, true);
                    this.currentTitle = this.defaultTitle;
                }
                else {
                    // Just collapsed: show latest tool/thinking title with 'Working:' prefix
                    if (this.lastExtractedTitle) {
                        this.setTitle(this.lastExtractedTitle);
                    }
                    else {
                        this.setTitle(this.defaultTitle, true);
                        this.currentTitle = this.defaultTitle;
                    }
                }
            }));
        }
    }
    shouldInitEarly() {
        return this.fixedScrollingMode && !this.streamingCompleted;
    }
    // @TODO: @justschen Convert to template for each setting?
    initContent() {
        this.wrapper = $('.chat-used-context-list.chat-thinking-collapsible');
        if (!this.streamingCompleted) {
            this.wrapper.classList.add('chat-thinking-streaming');
        }
        // Only create textContainer here if there's no pending lazy thinking item.
        // If there's a lazy thinking item, it will be rendered via materializeLazyItem
        // with the latest streaming content.
        const hasLazyThinkingItems = this.lazyItems.some(item => item.kind === 'thinking');
        if (this.currentThinkingValue && !hasLazyThinkingItems) {
            this.textContainer = $('.chat-thinking-item.markdown-content');
            this.wrapper.appendChild(this.textContainer);
            this.renderMarkdown(this.currentThinkingValue);
        }
        // Create the persistent working spinner element only if still streaming
        if (!this.streamingCompleted && !this.element.isComplete) {
            this.workingSpinnerElement = $('.chat-thinking-item.chat-thinking-spinner-item');
            const spinnerIcon = createThinkingIcon(Codicon.circleFilled);
            this.workingSpinnerElement.appendChild(spinnerIcon);
            this.workingSpinnerLabel = $('span.chat-thinking-spinner-label');
            this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage("thinking" /* WorkingMessageCategory.Thinking */);
            this.workingSpinnerElement.appendChild(this.workingSpinnerLabel);
            this.wrapper.appendChild(this.workingSpinnerElement);
        }
        // wrap content in scrollable element for fixed scrolling mode
        if (this.fixedScrollingMode) {
            this.scrollableElement = this._register(new DomScrollableElement(this.wrapper, {
                vertical: 1 /* ScrollbarVisibility.Auto */,
                horizontal: 2 /* ScrollbarVisibility.Hidden */,
                handleMouseWheel: true,
                alwaysConsumeMouseWheel: false
            }));
            this._register(this.scrollableElement.onScroll(e => this.handleScroll(e.scrollTop)));
            // check for content changes to update scroll dimensions
            const mutationObserver = new MutationObserver(() => {
                if (!this.streamingCompleted && this.domNode.classList.contains('chat-used-context-collapsed')) {
                    this.syncDimensionsAndScheduleScroll();
                }
            });
            mutationObserver.observe(this.wrapper, {
                childList: true,
                subtree: true,
                characterData: true
            });
            this.mutationObserverDisposable = { dispose: () => mutationObserver.disconnect() };
            this._register(this.mutationObserverDisposable);
            this._register(this._onDidChangeHeight.event(() => {
                this.syncDimensionsAndScheduleScroll();
            }));
            this.syncDimensionsAndScheduleScroll();
            this.updateDropdownClickability();
            return this.scrollableElement.getDomNode();
        }
        this.updateDropdownClickability();
        return this.wrapper;
    }
    handleScroll(scrollTop) {
        if (!this.scrollableElement || this.isUpdatingDimensions) {
            return;
        }
        this.lastKnownScrollTop = scrollTop;
        const contentHeight = this.lastKnownContentHeight;
        const viewportHeight = Math.min(contentHeight, THINKING_SCROLL_MAX_HEIGHT);
        const maxScrollTop = contentHeight - viewportHeight;
        this.autoScrollEnabled = maxScrollTop <= 0 || scrollTop >= maxScrollTop - 10;
        this.updateFadeClasses(scrollTop, contentHeight, viewportHeight);
    }
    updateFadeClasses(scrollTop, contentHeight, viewportHeight) {
        if (!this.fixedScrollingMode || this.streamingCompleted) {
            this.domNode.classList.remove('chat-thinking-fade-top', 'chat-thinking-fade-bottom');
            return;
        }
        const currentScrollTop = scrollTop ?? this.lastKnownScrollTop;
        const currentContentHeight = contentHeight ?? this.lastKnownContentHeight;
        const currentViewportHeight = viewportHeight ?? Math.min(currentContentHeight, THINKING_SCROLL_MAX_HEIGHT);
        const maxScrollTop = currentContentHeight - currentViewportHeight;
        this.domNode.classList.toggle('chat-thinking-fade-top', currentScrollTop > 5);
        this.domNode.classList.toggle('chat-thinking-fade-bottom', maxScrollTop > 0 && currentScrollTop < maxScrollTop - 5);
    }
    // Schedule a batched scroll dimension update for the next animation frame.
    // All calls during a single frame (from updateThinking, MutationObserver, etc.)
    // are coalesced into one layout read, avoiding forced synchronous layouts
    // during tree splice operations.
    syncDimensionsAndScheduleScroll() {
        if (this.pendingScrollDisposable) {
            return;
        }
        this.pendingScrollDisposable = scheduleAtNextAnimationFrame(getWindow(this.domNode), () => {
            this.pendingScrollDisposable = undefined;
            if (this._store.isDisposed) {
                return;
            }
            this.isUpdatingDimensions = true;
            try {
                const contentHeight = this.updateScrollDimensions();
                if (this.autoScrollEnabled && contentHeight !== undefined) {
                    this.scrollToBottom(contentHeight);
                }
            }
            finally {
                this.isUpdatingDimensions = false;
            }
            // Use the cached values from updateScrollDimensions to avoid extra layout reads
            this.updateFadeClasses(this.lastKnownScrollTop, this.lastKnownContentHeight);
        });
    }
    updateScrollDimensions() {
        if (!this.scrollableElement) {
            return undefined;
        }
        const isCollapsed = this.domNode.classList.contains('chat-used-context-collapsed');
        if (!isCollapsed) {
            return undefined;
        }
        const contentHeight = this.wrapper.scrollHeight;
        this.lastKnownContentHeight = contentHeight;
        const viewportHeight = Math.min(contentHeight, THINKING_SCROLL_MAX_HEIGHT);
        this.scrollableElement.setScrollDimensions({
            width: this.scrollableElement.getDomNode().clientWidth,
            scrollWidth: this.wrapper.scrollWidth,
            height: viewportHeight,
            scrollHeight: contentHeight
        });
        // Cache the scroll position after dimension update
        this.lastKnownScrollTop = this.scrollableElement.getScrollPosition().scrollTop;
        // Re-evaluate hover feedback as content grows past the max height,
        // reusing the already-measured contentHeight to avoid an extra layout read.
        this.updateDropdownClickability(contentHeight);
        return contentHeight;
    }
    scrollToBottom(contentHeight) {
        if (!this.scrollableElement) {
            return;
        }
        const viewportHeight = Math.min(contentHeight, THINKING_SCROLL_MAX_HEIGHT);
        if (contentHeight > viewportHeight) {
            const newScrollTop = contentHeight - viewportHeight;
            this.lastKnownScrollTop = newScrollTop;
            this.scrollableElement.setScrollPosition({ scrollTop: newScrollTop });
        }
    }
    /**
     * updates scroll dimensions when streaming is complete.
     */
    updateScrollDimensionsForCompletion() {
        if (!this.scrollableElement || !this.fixedScrollingMode) {
            return;
        }
        const contentHeight = this.wrapper.scrollHeight;
        const viewportHeight = Math.min(contentHeight, THINKING_SCROLL_MAX_HEIGHT);
        this.scrollableElement.setScrollDimensions({
            width: this.scrollableElement.getDomNode().clientWidth,
            scrollWidth: this.wrapper.scrollWidth,
            height: viewportHeight,
            scrollHeight: contentHeight
        });
        if (contentHeight <= THINKING_SCROLL_MAX_HEIGHT) {
            this.scrollableElement.setScrollPosition({ scrollTop: 0 });
        }
    }
    renderMarkdown(content, reuseExisting) {
        // Guard against rendering after disposal to avoid leaking disposables
        if (this._store.isDisposed) {
            return;
        }
        const cleanedContent = content.trim();
        if (!cleanedContent) {
            this._markdownResult.clear();
            if (this.textContainer) {
                clearNode(this.textContainer);
            }
            return;
        }
        // If the entire content is bolded, strip the bold markers for rendering
        let contentToRender = cleanedContent;
        if (cleanedContent.startsWith('**') && cleanedContent.endsWith('**')) {
            contentToRender = cleanedContent.slice(2, -2);
        }
        const target = reuseExisting ? this._markdownResult.value?.element : undefined;
        const rendered = this.chatContentMarkdownRenderer.render(new MarkdownString(contentToRender), {
            fillInIncompleteTokens: true,
            asyncRenderCallback: this._asyncRenderCallback,
            codeBlockRendererSync: ChatThinkingContentPart_1._codeBlockRendererSync,
        }, target);
        this._markdownResult.value = rendered;
        if (!target) {
            if (this.textContainer) {
                clearNode(this.textContainer);
                this.textContainer.appendChild(createThinkingIcon(Codicon.circleFilled));
                this.textContainer.appendChild(rendered.element);
            }
        }
    }
    setFinalizedTitle(title) {
        if (!this._collapseButton) {
            return;
        }
        const labelElement = this._collapseButton.labelElement;
        labelElement.textContent = '';
        const firstSpaceIndex = title.indexOf(' ');
        if (firstSpaceIndex === -1) {
            // Single word title, no need to split
            labelElement.textContent = title;
        }
        else {
            const verb = title.substring(0, firstSpaceIndex);
            const rest = title.substring(firstSpaceIndex);
            const verbSpan = $('span');
            verbSpan.textContent = verb;
            labelElement.appendChild(verbSpan);
            const restSpan = $('span.chat-thinking-title-detail-text');
            restSpan.textContent = rest;
            labelElement.appendChild(restSpan);
        }
        // Show aggregated diff stats from edit pills (only when there are actual changes)
        if (this.diffStatsByPartId.size > 0) {
            const { added, removed } = this._aggregatedDiff;
            if (added > 0 || removed > 0) {
                const diffContainer = $('span.chat-thinking-title-diff');
                diffContainer.appendChild($('span.label-added', {}, `+${added}`));
                diffContainer.appendChild($('span.label-removed', {}, `-${removed}`));
                labelElement.appendChild(diffContainer);
                const insertionsFragment = added === 1 ? localize('chat.thinking.insertions.one', "1 insertion") : localize('chat.thinking.insertions', "{0} insertions", added);
                const deletionsFragment = removed === 1 ? localize('chat.thinking.deletions.one', "1 deletion") : localize('chat.thinking.deletions', "{0} deletions", removed);
                this._collapseButton.element.ariaLabel = localize('chat.thinking.titleWithDiff', "{0}, {1}, {2}", title, insertionsFragment, deletionsFragment);
            }
            else {
                this._collapseButton.element.ariaLabel = title;
            }
        }
        else {
            this._collapseButton.element.ariaLabel = title;
        }
    }
    setDropdownClickable(clickable) {
        if (this._collapseButton) {
            this._collapseButton.element.style.pointerEvents = clickable ? 'auto' : 'none';
        }
        if (!clickable && this.streamingCompleted) {
            this.setFinalizedTitle(this.lastExtractedTitle ?? this.currentTitle);
        }
    }
    shouldAllowExpansion() {
        // Multiple tool invocations or lazy items mean there's content to show
        if (this.toolInvocationCount > 0 || this.lazyItems.length > 0) {
            return true;
        }
        // Count meaningful children in the wrapper (exclude the working spinner)
        if (this.wrapper) {
            const meaningfulChildren = Array.from(this.wrapper.children).filter(child => child !== this.workingSpinnerElement).length;
            if (meaningfulChildren > 1) {
                return true;
            }
        }
        const contentWithoutTitle = this.currentThinkingValue.trim();
        const titleToCompare = this.lastExtractedTitle ?? this.currentTitle;
        const stripMarkdown = (text) => {
            return text
                .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1').trim();
        };
        const strippedContent = stripMarkdown(contentWithoutTitle);
        // If content is empty or matches the title exactly, nothing to expand
        return !(!strippedContent || strippedContent === titleToCompare);
    }
    updateDropdownClickability(knownContentHeight) {
        let allowExpansion = this.shouldAllowExpansion();
        // don't allow feedback on fixed scrolling before reaching max height.
        if (allowExpansion && this.fixedScrollingMode && !this.streamingCompleted && !this.element.isComplete && this.wrapper) {
            const contentHeight = knownContentHeight ?? this.wrapper.scrollHeight;
            if (contentHeight <= THINKING_SCROLL_MAX_HEIGHT) {
                allowExpansion = false;
            }
        }
        if (!allowExpansion && this.isExpanded() && (this.streamingCompleted || this.element.isComplete)) {
            this.setExpanded(false);
        }
        this.setDropdownClickable(allowExpansion);
    }
    appendToWrapper(element) {
        if (!this.wrapper) {
            return;
        }
        if (this.workingSpinnerElement && this.workingSpinnerElement.parentNode === this.wrapper) {
            this.wrapper.insertBefore(element, this.workingSpinnerElement);
        }
        else {
            this.wrapper.appendChild(element);
        }
    }
    resetId() {
        this.id = undefined;
    }
    collapseContent() {
        this.setExpanded(false);
    }
    updateThinking(content) {
        // If disposed, ignore late updates coming from renderer diffing
        if (this._store.isDisposed) {
            return;
        }
        this.content = content;
        // Update any pending lazy thinking item with matching ID so that
        // when materialized, it will have the latest streaming content
        for (const lazyItem of this.lazyItems) {
            if (lazyItem.kind === 'thinking' && lazyItem.content.id === content.id) {
                lazyItem.content = content;
                break;
            }
        }
        const raw = extractTextFromPart(content);
        const next = raw;
        if (next === this.currentThinkingValue) {
            return;
        }
        const previousValue = this.currentThinkingValue;
        const reuseExisting = !!(this._markdownResult.value && next.startsWith(previousValue) && next.length > previousValue.length);
        this.currentThinkingValue = next;
        this.renderMarkdown(next, reuseExisting);
        if (this.fixedScrollingMode && this.scrollableElement) {
            this.syncDimensionsAndScheduleScroll();
        }
        const extractedTitle = extractTitleFromThinkingContent(raw);
        if (extractedTitle && extractedTitle !== this.currentTitle) {
            if (!this.extractedTitles.includes(extractedTitle)) {
                this.extractedTitles.push(extractedTitle);
            }
            this.lastExtractedTitle = extractedTitle;
        }
        if (!extractedTitle || extractedTitle === this.currentTitle) {
            return;
        }
        const label = this.lastExtractedTitle ?? '';
        if (!this.fixedScrollingMode && !this._isExpanded.get()) {
            this.setTitle(label);
        }
        this.updateDropdownClickability();
    }
    getIsActive() {
        return this.isActive;
    }
    /**
     * Returns true when this thinking part has no meaningful content to display:
     * no tool invocations, no lazy items, no hooks, and no thinking text.
     * This happens when a tool is removed from thinking (e.g. due to confirmation)
     * and the thinking part was only created to hold that tool.
     */
    isEffectivelyEmpty() {
        this.processPendingRemovals();
        if (this.toolInvocationCount > 0 || this.lazyItems.length > 0 || this.hookCount > 0) {
            return false;
        }
        if (this.currentThinkingValue.trim().length > 0) {
            return false;
        }
        return true;
    }
    markAsInactive() {
        this.isActive = false;
        this.domNode.classList.remove('chat-thinking-active');
        this.domNode.classList.remove('chat-thinking-fade-top', 'chat-thinking-fade-bottom');
        this.processPendingRemovals();
        if (this.workingSpinnerElement) {
            this.workingSpinnerElement.remove();
            this.workingSpinnerElement = undefined;
            this.workingSpinnerLabel = undefined;
        }
        // Clear the attached-to-thinking flag on all tool invocations
        for (const toolInvocation of this.toolInvocations) {
            toolInvocation.isAttachedToThinking = false;
        }
    }
    finalizeTitleIfDefault() {
        this.processPendingRemovals();
        // With lazy rendering, wrapper may not be created yet if content hasn't been expanded
        if (this.wrapper) {
            this.wrapper.classList.remove('chat-thinking-streaming');
        }
        this.domNode.classList.remove('chat-thinking-active');
        this.domNode.classList.remove('chat-thinking-fade-top', 'chat-thinking-fade-bottom');
        this.streamingCompleted = true;
        if (this.mutationObserverDisposable) {
            this.mutationObserverDisposable.dispose();
            this.mutationObserverDisposable = undefined;
        }
        if (this.workingSpinnerElement) {
            this.workingSpinnerElement.remove();
            this.workingSpinnerElement = undefined;
            this.workingSpinnerLabel = undefined;
        }
        if (this._collapseButton) {
            this._collapseButton.icon = Codicon.check;
        }
        // Update scroll dimensions now that streaming is complete
        // This removes unnecessary scrollbar when content fits
        this.updateScrollDimensionsForCompletion();
        this.updateDropdownClickability();
        if (this.content.generatedTitle) {
            this.currentTitle = this.content.generatedTitle;
            this.setFinalizedTitle(this.content.generatedTitle);
            return;
        }
        // Reuse any existing generated title from tool invocations or thinking parts.
        const existingTitle = this.toolInvocations.find(t => t.generatedTitle)?.generatedTitle
            ?? this.allThinkingParts.find(t => t.generatedTitle)?.generatedTitle;
        if (existingTitle) {
            this.currentTitle = existingTitle;
            this.content.generatedTitle = existingTitle;
            this.setGeneratedTitleOnAllParts(existingTitle);
            this.setFinalizedTitle(existingTitle);
            return;
        }
        // Only check the persisted cache when re-rendering
        // (all tool invocations are serialized), not during live streaming.
        const allSerialized = this.toolInvocations.length > 0
            && this.toolInvocations.every(t => t.kind === 'toolInvocationSerialized');
        if (allSerialized) {
            // Fallback: check the persisted title cache using the last tool call (non-local sessions only)
            if (!LocalChatSessionUri.isLocalSession(this.element.sessionResource)) {
                const lastToolInvocation = this.toolInvocations[this.toolInvocations.length - 1];
                if (lastToolInvocation) {
                    const cachedTitle = this.getCachedTitle(lastToolInvocation.toolCallId);
                    if (cachedTitle) {
                        this.currentTitle = cachedTitle;
                        this.content.generatedTitle = cachedTitle;
                        this.setGeneratedTitleOnAllParts(cachedTitle);
                        this.setFinalizedTitle(cachedTitle);
                        return;
                    }
                }
            }
        }
        // case where we only have one item (tool or edit) in the thinking container and no thinking parts, we want to move it back to its original position
        if (this.toolInvocationCount === 1 && this.hookCount === 0 && this.currentThinkingValue.trim() === '') {
            // If singleItemInfo wasn't set (item was lazy/deferred), materialize it now
            if (!this.singleItemInfo) {
                const lazyItem = this.lazyItems.find(item => item.kind === 'tool' && item.originalParent);
                if (lazyItem && lazyItem.kind === 'tool') {
                    const toolInvocation = lazyItem.toolInvocationOrMarkdown && (lazyItem.toolInvocationOrMarkdown.kind === 'toolInvocation' || lazyItem.toolInvocationOrMarkdown.kind === 'toolInvocationSerialized') ? lazyItem.toolInvocationOrMarkdown : undefined;
                    const result = lazyItem.lazy.value;
                    this.singleItemInfo = {
                        element: result.domNode,
                        originalParent: lazyItem.originalParent,
                        originalNextSibling: this.domNode,
                        toolInvocation
                    };
                    if (result.disposable) {
                        const toolCallId = toolInvocation?.toolCallId;
                        if (toolCallId) {
                            this.ownedToolParts.set(toolCallId, result.disposable);
                        }
                        else {
                            this._register(result.disposable);
                        }
                    }
                }
            }
            // Only restore if the tool is complete so the progress spinner is resolved
            const toolIsComplete = !this.singleItemInfo?.toolInvocation || IChatToolInvocation.isComplete(this.singleItemInfo.toolInvocation);
            if (toolIsComplete && this.singleItemInfo && this.restoreSingleItemToOriginalPosition()) {
                return;
            }
        }
        // if exactly one actual extracted title and no tool invocations, use that as the final title.
        if (this.extractedTitles.length === 1 && this.toolInvocationCount === 0) {
            const title = this.extractedTitles[0];
            this.currentTitle = title;
            this.content.generatedTitle = title;
            this.setGeneratedTitleOnAllParts(title);
            this.setFinalizedTitle(title);
            return;
        }
        const generateTitles = this.configurationService.getValue(ChatConfiguration.ThinkingGenerateTitles) ?? true;
        if (!generateTitles) {
            this.setFallbackTitle();
            return;
        }
        this.generateTitleViaLLM();
    }
    setGeneratedTitleOnAllParts(title) {
        for (const toolInvocation of this.toolInvocations) {
            toolInvocation.generatedTitle = title;
        }
        for (const thinkingPart of this.allThinkingParts) {
            thinkingPart.generatedTitle = title;
        }
    }
    loadTitleCache() {
        return this.storageService.getObject(TITLE_CACHE_STORAGE_KEY, 0 /* StorageScope.PROFILE */) ?? {};
    }
    saveTitleCache(cache) {
        if (Object.keys(cache).length === 0) {
            this.storageService.remove(TITLE_CACHE_STORAGE_KEY, 0 /* StorageScope.PROFILE */);
        }
        else {
            this.storageService.store(TITLE_CACHE_STORAGE_KEY, JSON.stringify(cache), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        }
    }
    getTitleCacheKey(toolCallId) {
        return `${chatSessionResourceToId(this.element.sessionResource)}:${toolCallId}`;
    }
    getCachedTitle(toolCallId) {
        const entry = this.loadTitleCache()[this.getTitleCacheKey(toolCallId)];
        if (!entry || (Date.now() - entry.storedAt) > TITLE_CACHE_TTL_MS) {
            return undefined;
        }
        return entry.title;
    }
    setCachedTitle(toolCallId, title) {
        const cache = this.loadTitleCache();
        const now = Date.now();
        // Evict expired entries on write
        for (const key of Object.keys(cache)) {
            if ((now - cache[key].storedAt) > TITLE_CACHE_TTL_MS) {
                delete cache[key];
            }
        }
        cache[this.getTitleCacheKey(toolCallId)] = { title, storedAt: now };
        // Cap size by dropping oldest entries
        const keys = Object.keys(cache);
        if (keys.length > TITLE_CACHE_MAX_ENTRIES) {
            const sorted = keys.sort((a, b) => cache[a].storedAt - cache[b].storedAt);
            for (let i = 0; i < sorted.length - TITLE_CACHE_MAX_ENTRIES; i++) {
                delete cache[sorted[i]];
            }
        }
        this.saveTitleCache(cache);
    }
    async generateTitleViaLLM() {
        const cts = new CancellationTokenSource();
        const timeout = setTimeout(() => cts.cancel(), 5000);
        try {
            const models = await this.languageModelsService.selectLanguageModels({ vendor: 'copilot', id: 'copilot-fast' });
            if (!models.length) {
                this.setFallbackTitle();
                return;
            }
            if (cts.token.isCancellationRequested) {
                this.setFallbackTitle();
                return;
            }
            let context;
            if (this.extractedTitles.length > 0) {
                context = this.extractedTitles.join(', ');
            }
            else {
                context = this.currentThinkingValue.substring(0, 1000);
            }
            const prompt = `Summarize the following content in a SINGLE sentence (under 10 words) using past tense. Follow these rules strictly:

			OUTPUT FORMAT:
			- MUST be a single sentence
			- MUST be under 10 words
			- The FIRST word MUST be a past tense verb (e.g. "Updated", "Reviewed", "Created", "Searched", "Analyzed")
			- No quotes, no trailing punctuation

			GENERAL:
			- The content may include tool invocations (file edits, reads, searches, terminal commands), reasoning headers, or raw thinking text
			- For reasoning headers or thinking text (no tool calls), summarize WHAT was considered/analyzed, NOT that thinking occurred
			- For thinking-only summaries, use phrases like: "Considered...", "Planned...", "Analyzed...", "Reviewed..."

			TOOL NAME FILTERING:
			- NEVER include tool names like "Replace String in File", "Multi Replace String in File", "Create File", "Read File", etc. in the output
			- If an action says "Edited X and used Replace String in File", output ONLY the action on X
			- Tool names describe HOW something was done, not WHAT was done - always omit them

			VOCABULARY - Use varied synonyms for natural-sounding summaries:
			- For edits: "Updated", "Modified", "Changed", "Refactored", "Fixed", "Adjusted"
			- For reads: "Reviewed", "Examined", "Checked", "Inspected", "Analyzed", "Explored"
			- For creates: "Created", "Added", "Generated"
			- For searches: "Searched for", "Looked up", "Investigated"
			- For terminal: "Ran command", "Executed"
			- For reasoning/thinking: "Considered", "Planned", "Analyzed", "Reviewed", "Evaluated"
			- Choose the synonym that best fits the context

${this.hookCount > 0 ? `BLOCKED/DENIED CONTENT (hooks detected):
			- Only mention "blocked" if the content explicitly includes hook results that blocked or warned about a tool (e.g. "Blocked terminal" or "Warning for read_file")
			- If blocked items are present alongside normal tool calls, briefly note the block but do NOT let it dominate the summary: e.g. "Updated file.ts, blocked terminal"

			` : `IMPORTANT: Do NOT use words like "blocked", "denied", or "tried" in the summary - there are no hooks or blocked items in this content. Just summarize normally.

			`}RULES FOR TOOL CALLS:
			1. If the SAME file was both edited AND read: Use a combined phrase like "Reviewed and updated <filename>"
			2. If exactly ONE file was edited: Start with an edit synonym + "<filename>" (include actual filename)
			3. If exactly ONE file was read: Start with a read synonym + "<filename>" (include actual filename)
			4. If MULTIPLE files were edited: Start with an edit synonym + "X files"
			5. If MULTIPLE files were read: Start with a read synonym + "X files"
			6. If BOTH edits AND reads occurred on DIFFERENT files: Combine them naturally
			7. For searches: Say "searched for <term>" or "looked up <term>" with the actual search term, NOT "searched for files"
			8. After the file info, you may add a brief summary of other actions if space permits
			9. NEVER say "1 file" - always use the actual filename when there's only one file

			RULES FOR REASONING HEADERS (no tool calls):
			1. If the input contains reasoning/analysis headers without actual tool invocations, summarize the main topic and what was considered
			2. Use past tense verbs that indicate thinking, not doing: "Considered", "Planned", "Analyzed", "Evaluated"
			3. Focus on WHAT was being thought about, not that thinking occurred

			RULES FOR RAW THINKING TEXT:
			1. Extract the main topic or question being considered from the text
			2. Identify any specific files, functions, or concepts mentioned
			3. Summarize as "Analyzed <topic>" or "Considered <specific thing>"
			4. If discussing code structure: "Reviewed <component/architecture>"
			5. If discussing a problem: "Analyzed <problem description>"
			6. If discussing implementation: "Planned <feature/change>"

			EXAMPLES WITH TOOLS:
			- "Read HomePage.tsx, Edited HomePage.tsx" → "Reviewed and updated HomePage.tsx"
			- "Edited HomePage.tsx" → "Updated HomePage.tsx"
			- "Edited config.css and used Replace String in File" → "Modified config.css"
			- "Edited App.tsx, used Multi Replace String in File" → "Refactored App.tsx"
			- "Read config.json, Read package.json" → "Reviewed 2 files"
			- "Edited App.tsx, Read utils.ts" → "Updated App.tsx and checked utils.ts"
			- "Edited App.tsx, Read utils.ts, Read types.ts" → "Updated App.tsx and reviewed 2 files"
			- "Edited index.ts, Edited styles.css, Ran terminal command" → "Modified 2 files and ran command"
			- "Read README.md, Searched for AuthService" → "Checked README.md and searched for AuthService"
			- "Searched for login, Searched for authentication" → "Searched for login and authentication"
			- "Edited api.ts, Edited models.ts, Read schema.json" → "Updated 2 files and reviewed schema.json"
			- "Edited Button.tsx, Edited Button.css, Edited index.ts" → "Modified 3 files"
			- "Searched codebase for error handling" → "Looked up error handling"

${this.hookCount > 0 ? `EXAMPLES WITH BLOCKED CONTENT (from hooks):
			- "Blocked terminal, Edited config.ts" → "Edited config.ts, terminal was blocked"
			- "Blocked terminal, Blocked read_file" → "Two tools were blocked by hooks"
			- "Warning for read_file, Edited utils.ts" → "Edited utils.ts with a hook warning"

			` : ''}EXAMPLES WITH REASONING HEADERS (no tools):
			- "Analyzing component architecture" → "Considered component architecture"
			- "Planning refactor strategy" → "Planned refactor strategy"
			- "Reviewing error handling approach, Considering edge cases" → "Analyzed error handling approach"
			- "Understanding the codebase structure" → "Reviewed codebase structure"
			- "Thinking about implementation options" → "Considered implementation options"

			EXAMPLES WITH RAW THINKING TEXT:
			- "I need to understand how the authentication flow works in this app..." → "Analyzed authentication flow"
			- "Let me think about how to refactor this component to be more maintainable..." → "Planned component refactoring"
			- "The error seems to be coming from the database connection..." → "Investigated database connection issue"
			- "Looking at the UserService class, I see it handles..." → "Reviewed UserService implementation"

			Content: ${context}`;
            const response = await this.languageModelsService.sendChatRequest(models[0], undefined, [{ role: 1 /* ChatMessageRole.User */, content: [{ type: 'text', value: prompt }] }], {}, cts.token);
            let generatedTitle = '';
            for await (const part of response.stream) {
                if (cts.token.isCancellationRequested) {
                    break;
                }
                if (Array.isArray(part)) {
                    for (const p of part) {
                        if (p.type === 'text') {
                            generatedTitle += p.value;
                        }
                    }
                }
                else if (part.type === 'text') {
                    generatedTitle += part.value;
                }
            }
            if (cts.token.isCancellationRequested) {
                this.setFallbackTitle();
                return;
            }
            await response.result;
            generatedTitle = generatedTitle.trim();
            if (generatedTitle.includes('can\'t assist with that')) {
                this.setFallbackTitle();
                return;
            }
            if (generatedTitle && !this._store.isDisposed) {
                this.currentTitle = generatedTitle;
                this.setFinalizedTitle(generatedTitle);
                this.content.generatedTitle = generatedTitle;
                this.setGeneratedTitleOnAllParts(generatedTitle);
                // Persist to storage for non-local sessions only
                if (!LocalChatSessionUri.isLocalSession(this.element.sessionResource)) {
                    const lastTool = this.toolInvocations[this.toolInvocations.length - 1];
                    if (lastTool) {
                        this.setCachedTitle(lastTool.toolCallId, generatedTitle);
                    }
                }
                return;
            }
        }
        catch (error) {
            // fall through to default title
        }
        finally {
            clearTimeout(timeout);
            cts.dispose();
        }
        this.setFallbackTitle();
    }
    restoreSingleItemToOriginalPosition() {
        if (!this.singleItemInfo) {
            return false;
        }
        const { element, originalParent, originalNextSibling, toolInvocation } = this.singleItemInfo;
        // don't restore it to original position - it contains multiple rendered elements
        if (element.childElementCount > 1) {
            this.singleItemInfo = undefined;
            return false;
        }
        if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
            originalParent.insertBefore(element, originalNextSibling);
        }
        else {
            originalParent.appendChild(element);
        }
        if (toolInvocation) {
            toolInvocation.isAttachedToThinking = false;
        }
        hide(this.domNode);
        this.singleItemInfo = undefined;
        return true;
    }
    updateAggregatedDiff() {
        let totalAdded = 0;
        let totalRemoved = 0;
        for (const stats of this.diffStatsByPartId.values()) {
            totalAdded += stats.added;
            totalRemoved += stats.removed;
        }
        this._aggregatedDiff = { added: totalAdded, removed: totalRemoved };
        // Re-render the finalized title if streaming is already complete,
        // since diff events from edit pills may arrive after the title was set.
        if (this.streamingCompleted || this.element.isComplete) {
            this.setFinalizedTitle(this.currentTitle);
        }
    }
    setFallbackTitle() {
        const finalLabel = this.appendedItemCount > 0
            ? this.appendedItemCount === 1
                ? localize('chat.thinking.finished.withStepsSingular', 'Finished with 1 step')
                : localize('chat.thinking.finished.withStepsPlural', 'Finished with {0} steps', this.appendedItemCount)
            : localize('chat.thinking.finished', 'Finished Working');
        this.currentTitle = finalLabel;
        // With lazy rendering, wrapper may not be created yet if content hasn't been expanded
        if (this.wrapper) {
            this.wrapper.classList.remove('chat-thinking-streaming');
        }
        this.domNode.classList.remove('chat-thinking-active');
        this.streamingCompleted = true;
        if (this._collapseButton) {
            this._collapseButton.icon = Codicon.check;
            this.setFinalizedTitle(finalLabel);
        }
        this.updateDropdownClickability();
    }
    /**
     * Appends a tool invocation or content item to the thinking group.
     * The factory is called lazily - only when the thinking section is expanded.
     * If already expanded, the factory is called immediately.
     */
    appendItem(factory, toolInvocationId, toolInvocationOrMarkdown, originalParent, onDidChangeDiff) {
        this.processPendingRemovals();
        // Track tool invocation metadata immediately (for title generation)
        this.trackToolMetadata(toolInvocationId, toolInvocationOrMarkdown);
        this.appendedItemCount++;
        // Listen for diff changes from edit pills
        if (onDidChangeDiff && toolInvocationId) {
            this._register(onDidChangeDiff(stats => {
                this.diffStatsByPartId.set(toolInvocationId, stats);
                this.updateAggregatedDiff();
            }));
        }
        // get random message based on tool type
        if (this.workingSpinnerLabel) {
            const isTerminalTool = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === 'toolInvocation' || toolInvocationOrMarkdown.kind === 'toolInvocationSerialized') && toolInvocationOrMarkdown.toolSpecificData?.kind === 'terminal';
            const category = isTerminalTool ? "terminal" /* WorkingMessageCategory.Terminal */ : "tool" /* WorkingMessageCategory.Tool */;
            this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage(category);
        }
        // If expanded or has been expanded once, render immediately
        if (this.isExpanded() || this.hasExpandedOnce || (this.fixedScrollingMode && !this.streamingCompleted)) {
            const result = factory();
            this.appendItemToDOM(result.domNode, toolInvocationId, toolInvocationOrMarkdown, originalParent);
            if (result.disposable) {
                const toolCallId = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === 'toolInvocation' || toolInvocationOrMarkdown.kind === 'toolInvocationSerialized') ? toolInvocationOrMarkdown.toolCallId : undefined;
                if (toolCallId) {
                    this.ownedToolParts.set(toolCallId, result.disposable);
                }
                else {
                    this._register(result.disposable);
                }
            }
        }
        else {
            // Defer rendering until expanded
            const item = {
                kind: 'tool',
                lazy: new Lazy(factory),
                toolInvocationId,
                toolInvocationOrMarkdown,
                originalParent,
                isHook: !toolInvocationOrMarkdown && !!toolInvocationId
            };
            this.lazyItems.push(item);
        }
        this.updateDropdownClickability();
    }
    removeMaterializedItem(toolCallId) {
        this.toolDisposables.deleteAndDispose(toolCallId);
        this.ownedToolParts.delete(toolCallId);
        const wrapper = this.toolWrappersByCallId.get(toolCallId);
        if (wrapper) {
            this.toolWrappersByCallId.delete(toolCallId);
            this.toolIconsByCallId.delete(toolCallId);
        }
        this.appendedItemCount = Math.max(0, this.appendedItemCount - 1);
        this.toolInvocationCount = Math.max(0, this.toolInvocationCount - 1);
        const toolInvocationsIndex = this.toolInvocations.findIndex(t => (t.kind === 'toolInvocation' || t.kind === 'toolInvocationSerialized') && t.toolCallId === toolCallId);
        if (toolInvocationsIndex !== -1) {
            // Use the tracked displayed label (which may differ from invocationMessage
            // for streaming edit tools that show "Editing files")
            const label = this.toolLabelsByCallId.get(toolCallId);
            if (label) {
                const titleIndex = this.extractedTitles.indexOf(label);
                if (titleIndex !== -1) {
                    this.extractedTitles.splice(titleIndex, 1);
                }
            }
            this.toolInvocations.splice(toolInvocationsIndex, 1);
        }
        this.toolLabelsByCallId.delete(toolCallId);
        this._externalResourceWidget.removeToolInvocation(toolCallId);
        this.updateDropdownClickability();
        this._onDidChangeHeight.fire();
    }
    /**
     * removes/re-establishes a lazy item from the thinking container
     * this is needed so we can check if there are confirmations still needed
     */
    removeLazyItem(toolInvocationId) {
        const index = this.lazyItems.findIndex(item => item.kind === 'tool' && item.toolInvocationId === toolInvocationId);
        if (index === -1) {
            return false;
        }
        const removedItem = this.lazyItems[index];
        this.lazyItems.splice(index, 1);
        this.appendedItemCount--;
        if (removedItem.kind === 'tool' && removedItem.isHook) {
            this.hookCount = Math.max(0, this.hookCount - 1);
        }
        else {
            this.toolInvocationCount--;
        }
        // Clear the attached-to-thinking flag on the removed tool invocation
        if (removedItem.kind === 'tool' && removedItem.toolInvocationOrMarkdown && (removedItem.toolInvocationOrMarkdown.kind === 'toolInvocation' || removedItem.toolInvocationOrMarkdown.kind === 'toolInvocationSerialized')) {
            removedItem.toolInvocationOrMarkdown.isAttachedToThinking = false;
            // Keep extractedTitles in sync when a lazy tool leaves the thinking container.
            // Use the tracked displayed label (which may differ from invocationMessage
            // for streaming edit tools that show "Editing files")
            const toolCallId = removedItem.toolInvocationOrMarkdown.toolCallId;
            this._externalResourceWidget.removeToolInvocation(toolCallId);
            const label = this.toolLabelsByCallId.get(toolCallId);
            if (label) {
                const titleIndex = this.extractedTitles.indexOf(label);
                if (titleIndex !== -1) {
                    this.extractedTitles.splice(titleIndex, 1);
                }
            }
            this.toolLabelsByCallId.delete(toolCallId);
        }
        const toolInvocationsIndex = this.toolInvocations.findIndex(t => (t.kind === 'toolInvocation' || t.kind === 'toolInvocationSerialized') && t.toolId === toolInvocationId);
        if (toolInvocationsIndex !== -1) {
            this.toolInvocations.splice(toolInvocationsIndex, 1);
        }
        this.updateDropdownClickability();
        return true;
    }
    processPendingRemovals() {
        this.pendingRemovalFlushDisposable?.dispose();
        this.pendingRemovalFlushDisposable = undefined;
        if (this.pendingRemovals.length === 0) {
            return;
        }
        const pendingRemovals = this.pendingRemovals;
        this.pendingRemovals = [];
        for (const pending of pendingRemovals) {
            this.removeStreamingToolEntry(pending.toolCallId, pending.toolLabel);
        }
    }
    schedulePendingRemovalsFlush() {
        if (this.pendingRemovalFlushDisposable) {
            return;
        }
        this.pendingRemovalFlushDisposable = scheduleAtNextAnimationFrame(getWindow(this.domNode), () => {
            this.pendingRemovalFlushDisposable = undefined;
            if (this._store.isDisposed) {
                return;
            }
            this.processPendingRemovals();
        });
    }
    // removes the tool entry that was previously streaming and now is not. removes item from dom and internal tracking.
    removeStreamingToolEntry(toolCallId, toolLabel) {
        this.toolDisposables.deleteAndDispose(toolCallId);
        this.ownedToolParts.get(toolCallId)?.dispose();
        this.ownedToolParts.delete(toolCallId);
        const wrapper = this.toolWrappersByCallId.get(toolCallId);
        if (wrapper) {
            wrapper.remove();
            this.toolWrappersByCallId.delete(toolCallId);
            this.toolIconsByCallId.delete(toolCallId);
        }
        // make sure to remove any lazy item as well
        const lazyIndex = this.lazyItems.findIndex(item => item.kind === 'tool' &&
            item.toolInvocationOrMarkdown &&
            (item.toolInvocationOrMarkdown.kind === 'toolInvocation' || item.toolInvocationOrMarkdown.kind === 'toolInvocationSerialized') &&
            item.toolInvocationOrMarkdown.toolCallId === toolCallId);
        if (lazyIndex !== -1) {
            const removedLazyItem = this.lazyItems[lazyIndex];
            if (removedLazyItem.kind === 'tool' && removedLazyItem.toolInvocationOrMarkdown && (removedLazyItem.toolInvocationOrMarkdown.kind === 'toolInvocation' || removedLazyItem.toolInvocationOrMarkdown.kind === 'toolInvocationSerialized')) {
                removedLazyItem.toolInvocationOrMarkdown.isAttachedToThinking = false;
            }
            this.lazyItems.splice(lazyIndex, 1);
        }
        this.appendedItemCount = Math.max(0, this.appendedItemCount - 1);
        this.toolInvocationCount = Math.max(0, this.toolInvocationCount - 1);
        const toolInvocationsIndex = this.toolInvocations.findIndex(t => (t.kind === 'toolInvocation' || t.kind === 'toolInvocationSerialized') && t.toolCallId === toolCallId);
        if (toolInvocationsIndex !== -1) {
            this.toolInvocations.splice(toolInvocationsIndex, 1);
        }
        const titleIndex = this.extractedTitles.indexOf(toolLabel);
        if (titleIndex !== -1) {
            this.extractedTitles.splice(titleIndex, 1);
        }
        this.toolLabelsByCallId.delete(toolCallId);
        this._externalResourceWidget.removeToolInvocation(toolCallId);
        this.updateDropdownClickability();
        this._onDidChangeHeight.fire();
    }
    trackToolMetadata(toolInvocationId, toolInvocationOrMarkdown) {
        if (!toolInvocationId) {
            return;
        }
        // Track hooks separately: if toolInvocationOrMarkdown is undefined, it's a hook item
        const isHook = !toolInvocationOrMarkdown;
        if (isHook) {
            this.hookCount++;
        }
        else {
            this.toolInvocationCount++;
        }
        // Shift default title from 'Thinking' to 'Working' once we have tool calls
        if (this.toolInvocationCount === 1) {
            this.defaultTitle = this.workingTitle;
        }
        let toolCallLabel;
        const isToolInvocation = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === 'toolInvocation' || toolInvocationOrMarkdown.kind === 'toolInvocationSerialized');
        if (isToolInvocation && toolInvocationOrMarkdown.invocationMessage) {
            const message = typeof toolInvocationOrMarkdown.invocationMessage === 'string' ? toolInvocationOrMarkdown.invocationMessage : toolInvocationOrMarkdown.invocationMessage.value;
            // For edit-type tools that are still streaming, use a friendlier label
            // instead of the generic tool display name (e.g. "Replace String in File")
            const isStreamingEditTool = toolInvocationOrMarkdown.kind === 'toolInvocation' && IChatToolInvocation.isStreaming(toolInvocationOrMarkdown) && isGenericEditToolId(toolInvocationOrMarkdown.toolId);
            if (isStreamingEditTool) {
                toolCallLabel = localize('chat.thinking.editingFiles', 'Editing files');
            }
            else {
                toolCallLabel = message;
            }
            this.toolInvocations.push(toolInvocationOrMarkdown);
            // Track the displayed label for consistent cleanup
            const toolCallId = toolInvocationOrMarkdown.toolCallId;
            this.toolLabelsByCallId.set(toolCallId, toolCallLabel);
            // Render external image pills for serialized (already-completed) tool invocations
            if (toolInvocationOrMarkdown.kind === 'toolInvocationSerialized') {
                this.updateExternalResourceParts(toolInvocationOrMarkdown);
                // Queue hidden serialized tools for removal immediately.
                if (IChatToolInvocation.isEffectivelyHidden(toolInvocationOrMarkdown)) {
                    this.pendingRemovals.push({ toolCallId: toolInvocationOrMarkdown.toolCallId, toolLabel: toolCallLabel });
                    this.schedulePendingRemovalsFlush();
                }
            }
            // track state for live/still streaming tools, excluding serialized tools
            if (toolInvocationOrMarkdown.kind === 'toolInvocation') {
                let currentToolLabel = toolCallLabel;
                let isComplete = false;
                let isStreaming = IChatToolInvocation.isStreaming(toolInvocationOrMarkdown);
                const toolStore = new DisposableStore();
                this.toolDisposables.set(toolInvocationOrMarkdown.toolCallId, toolStore);
                const updateTitle = (updatedMessage) => {
                    if (updatedMessage && updatedMessage !== currentToolLabel) {
                        // replace old title if exists, otherwise add new
                        const oldIndex = this.extractedTitles.indexOf(currentToolLabel);
                        const updatedIndex = this.extractedTitles.indexOf(updatedMessage);
                        if (oldIndex !== -1) {
                            if (updatedIndex !== -1 && updatedIndex !== oldIndex) {
                                this.extractedTitles.splice(oldIndex, 1);
                            }
                            else {
                                this.extractedTitles[oldIndex] = updatedMessage;
                            }
                        }
                        else if (updatedIndex === -1) {
                            this.extractedTitles.push(updatedMessage);
                        }
                        currentToolLabel = updatedMessage;
                        this.toolLabelsByCallId.set(toolCallId, updatedMessage);
                        this.lastExtractedTitle = updatedMessage;
                        // make sure not to set title if expanded
                        if (!this.fixedScrollingMode && !this._isExpanded.read(undefined)) {
                            this.setTitle(updatedMessage);
                        }
                    }
                };
                const autorunDisposable = autorun(reader => {
                    if (isComplete) {
                        return;
                    }
                    const currentState = toolInvocationOrMarkdown.state.read(reader);
                    // queue item to be removed if it was streaming and presentation is hidden
                    if (isStreaming && currentState.type !== 0 /* IChatToolInvocation.StateKind.Streaming */) {
                        isStreaming = false;
                        // Update terminal tool icon based on sandbox wrapping state
                        const termData = toolInvocationOrMarkdown.toolSpecificData;
                        if (termData?.kind === 'terminal') {
                            const iconEl = this.toolIconsByCallId.get(toolCallId);
                            if (iconEl) {
                                const newIcon = termData.commandLine?.isSandboxWrapped ? Codicon.terminalSecure : Codicon.terminal;
                                iconEl.className = 'chat-thinking-icon';
                                iconEl.classList.add(...ThemeIcon.asClassNameArray(newIcon));
                            }
                        }
                        if (toolInvocationOrMarkdown.presentation === 'hidden') {
                            this.pendingRemovals.push({ toolCallId: toolInvocationOrMarkdown.toolCallId, toolLabel: currentToolLabel });
                            this.schedulePendingRemovalsFlush();
                            isComplete = true;
                            return;
                        }
                    }
                    if (currentState.type === 4 /* IChatToolInvocation.StateKind.Completed */ ||
                        currentState.type === 5 /* IChatToolInvocation.StateKind.Cancelled */) {
                        // Remove tools that should be hidden now or after completion.
                        if (toolInvocationOrMarkdown.presentation === 'hidden' || toolInvocationOrMarkdown.presentation === 'hiddenAfterComplete') {
                            this.pendingRemovals.push({ toolCallId: toolInvocationOrMarkdown.toolCallId, toolLabel: currentToolLabel });
                            this.schedulePendingRemovalsFlush();
                        }
                        // Render image pills outside the collapsible area for completed tools
                        if (currentState.type === 4 /* IChatToolInvocation.StateKind.Completed */) {
                            this.updateExternalResourceParts(toolInvocationOrMarkdown);
                        }
                        isComplete = true;
                        return;
                    }
                    // streaming
                    if (currentState.type === 0 /* IChatToolInvocation.StateKind.Streaming */) {
                        isStreaming = true;
                        const streamingMessage = currentState.streamingMessage.read(reader);
                        if (streamingMessage) {
                            const updatedMessage = typeof streamingMessage === 'string' ? streamingMessage : streamingMessage.value;
                            updateTitle(updatedMessage);
                        }
                        return;
                    }
                    // executing (something like `Replacing 67 lines.....`)
                    if (currentState.type === 2 /* IChatToolInvocation.StateKind.Executing */) {
                        const progressData = currentState.progress.read(reader);
                        if (progressData.message) {
                            const updatedMessage = typeof progressData.message === 'string' ? progressData.message : progressData.message.value;
                            updateTitle(updatedMessage);
                        }
                        else {
                            const invocationMsg = toolInvocationOrMarkdown.invocationMessage;
                            if (invocationMsg) {
                                const updatedMessage = typeof invocationMsg === 'string' ? invocationMsg : invocationMsg.value;
                                updateTitle(updatedMessage);
                            }
                        }
                        return;
                    }
                    // confirmations, failures, completed, other, etc
                    const invocationMsg = toolInvocationOrMarkdown.invocationMessage;
                    if (invocationMsg) {
                        const updatedMessage = typeof invocationMsg === 'string' ? invocationMsg : invocationMsg.value;
                        updateTitle(updatedMessage);
                    }
                });
                toolStore.add(autorunDisposable);
            }
        }
        else if (toolInvocationOrMarkdown?.kind === 'markdownContent') {
            const codeblockInfo = extractCodeblockUrisFromText(toolInvocationOrMarkdown.content.value);
            if (codeblockInfo?.uri) {
                const filename = basename(codeblockInfo.uri);
                toolCallLabel = localize('chat.thinking.editedFile', 'Edited {0}', filename);
            }
            else {
                toolCallLabel = localize('chat.thinking.editingFile', 'Edited file');
            }
        }
        else {
            toolCallLabel = toolInvocationId;
        }
        // Add tool call to extracted titles for LLM title generation
        if (!this.extractedTitles.includes(toolCallLabel)) {
            this.extractedTitles.push(toolCallLabel);
        }
        this.lastExtractedTitle = toolCallLabel;
        if (!this.fixedScrollingMode && !this._isExpanded.get()) {
            this.setTitle(toolCallLabel);
        }
    }
    updateExternalResourceParts(toolInvocation) {
        const extractedImages = extractImagesFromToolInvocationOutputDetails(toolInvocation, this.element.sessionResource);
        if (extractedImages.length === 0) {
            return;
        }
        const parts = extractedImages.map(image => ({
            kind: 'data',
            value: image.data.buffer,
            mimeType: image.mimeType,
            uri: image.uri,
        }));
        this._externalResourceWidget.setToolInvocationParts(toolInvocation.toolCallId, parts);
    }
    appendItemToDOM(content, toolInvocationId, toolInvocationOrMarkdown, originalParent) {
        if (!content.hasChildNodes() || content.textContent?.trim() === '') {
            return;
        }
        // Save the first item info for potential restoration later
        if (this.toolInvocationCount === 1 && this.hookCount === 0 && originalParent) {
            const toolInvocation = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === 'toolInvocation' || toolInvocationOrMarkdown.kind === 'toolInvocationSerialized') ? toolInvocationOrMarkdown : undefined;
            this.singleItemInfo = {
                element: content,
                originalParent,
                originalNextSibling: this.domNode,
                toolInvocation
            };
        }
        else {
            this.singleItemInfo = undefined;
        }
        const itemWrapper = $('.chat-thinking-tool-wrapper');
        const isMarkdownEdit = toolInvocationOrMarkdown?.kind === 'markdownContent';
        const isTerminalTool = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === 'toolInvocation' || toolInvocationOrMarkdown.kind === 'toolInvocationSerialized') && toolInvocationOrMarkdown.toolSpecificData?.kind === 'terminal';
        const toolInvocationIcon = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === 'toolInvocation' || toolInvocationOrMarkdown.kind === 'toolInvocationSerialized') ? toolInvocationOrMarkdown.icon : undefined;
        let icon;
        if (isMarkdownEdit) {
            icon = Codicon.pencil;
        }
        else if (isTerminalTool) {
            const terminalData = toolInvocationOrMarkdown.toolSpecificData;
            const exitCode = terminalData?.terminalCommandState?.exitCode;
            const isSandboxWrapped = terminalData?.commandLine?.isSandboxWrapped;
            if (exitCode !== undefined && exitCode !== 0) {
                icon = Codicon.error;
            }
            else if (isSandboxWrapped) {
                icon = Codicon.terminalSecure;
            }
            else {
                icon = toolInvocationIcon ?? Codicon.terminal;
            }
        }
        else if (content.classList.contains('chat-hook-outcome-blocked')) {
            icon = Codicon.error;
        }
        else if (content.classList.contains('chat-hook-outcome-warning')) {
            icon = Codicon.warning;
        }
        else {
            icon = toolInvocationId ? getToolInvocationIcon(toolInvocationId, toolInvocationIcon) : Codicon.tools;
        }
        const iconElement = createThinkingIcon(icon);
        itemWrapper.appendChild(iconElement);
        itemWrapper.appendChild(content);
        const isToolInvocation = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === 'toolInvocation' || toolInvocationOrMarkdown.kind === 'toolInvocationSerialized');
        if (isToolInvocation && toolInvocationOrMarkdown.toolCallId) {
            this.toolWrappersByCallId.set(toolInvocationOrMarkdown.toolCallId, itemWrapper);
            this.toolIconsByCallId.set(toolInvocationOrMarkdown.toolCallId, iconElement);
        }
        this.appendToWrapper(itemWrapper);
        if (this.fixedScrollingMode && this.scrollableElement) {
            this.syncDimensionsAndScheduleScroll();
        }
    }
    materializeLazyItem(item) {
        if (item.kind === 'thinking') {
            // Materialize thinking container
            this.appendToWrapper(item.textContainer);
            // Store reference to textContainer for updateThinking calls
            this.textContainer = item.textContainer;
            this.id = item.content.id;
            // Use item.content which is kept up-to-date during streaming via updateThinking
            this.updateThinking(item.content);
            return;
        }
        if (this.workingSpinnerLabel) {
            const isTerminalTool = item.toolInvocationOrMarkdown && (item.toolInvocationOrMarkdown.kind === 'toolInvocation' || item.toolInvocationOrMarkdown.kind === 'toolInvocationSerialized') && item.toolInvocationOrMarkdown.toolSpecificData?.kind === 'terminal';
            const category = isTerminalTool ? "terminal" /* WorkingMessageCategory.Terminal */ : "tool" /* WorkingMessageCategory.Tool */;
            this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage(category);
        }
        // Handle tool items
        if (item.lazy.hasValue) {
            // Already evaluated — but may not have been placed in the DOM yet
            // (e.g. finalizeTitleIfDefault materialized it before the wrapper existed).
            const result = item.lazy.value;
            if (!result.domNode.parentElement) {
                this.appendItemToDOM(result.domNode, item.toolInvocationId, item.toolInvocationOrMarkdown, item.originalParent);
            }
            return;
        }
        const result = item.lazy.value;
        this.appendItemToDOM(result.domNode, item.toolInvocationId, item.toolInvocationOrMarkdown, item.originalParent);
        if (result.disposable) {
            const toolCallId = item.toolInvocationOrMarkdown && (item.toolInvocationOrMarkdown.kind === 'toolInvocation' || item.toolInvocationOrMarkdown.kind === 'toolInvocationSerialized') ? item.toolInvocationOrMarkdown.toolCallId : undefined;
            if (toolCallId) {
                this.ownedToolParts.set(toolCallId, result.disposable);
            }
            else {
                this._register(result.disposable);
            }
        }
    }
    // makes a new text container. when we update, we now update this container.
    setupThinkingContainer(content) {
        // Avoid creating new containers after disposal
        if (this._store.isDisposed) {
            return;
        }
        this.appendedItemCount++;
        this.allThinkingParts.push(content);
        this.textContainer = $('.chat-thinking-item.markdown-content');
        if (content.value) {
            // Use lazy rendering when collapsed to preserve order with tool items
            if (this.isExpanded() || this.hasExpandedOnce || (this.fixedScrollingMode && !this.streamingCompleted)) {
                // Render immediately when expanded
                this.appendToWrapper(this.textContainer);
                this.id = content.id;
                this.updateThinking(content);
            }
            else {
                // Update this.content and this.id so that subsequent updateThinking calls
                // or materializeLazyItem will use the correct content for this section
                this.content = content;
                this.id = content.id;
                // Defer rendering until expanded to preserve order
                const lazyThinking = {
                    kind: 'thinking',
                    textContainer: this.textContainer,
                    content
                };
                this.lazyItems.push(lazyThinking);
            }
            if (this.workingSpinnerLabel) {
                this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage("thinking" /* WorkingMessageCategory.Thinking */);
            }
        }
        this.updateDropdownClickability();
    }
    setTitle(title, omitPrefix) {
        if (!title || this.element.isComplete) {
            return;
        }
        if (omitPrefix) {
            if (this._collapseButton) {
                const labelElement = this._collapseButton.labelElement;
                labelElement.textContent = '';
                const plainSpan = $('span');
                plainSpan.textContent = title;
                labelElement.appendChild(plainSpan);
                this._collapseButton.element.ariaLabel = title;
            }
            this.titleShimmerSpan = undefined;
            this.titleDetailContainer = undefined;
            this._titleDetailRendered.clear();
            this.currentTitle = title;
            return;
        }
        this.lastExtractedTitle = title;
        const thinkingLabel = localize('chat.thinking.label', "{0}: {1}", this.defaultTitle, title);
        this.currentTitle = thinkingLabel;
        if (!this._collapseButton) {
            return;
        }
        const labelElement = this._collapseButton.labelElement;
        // Ensure the persistent shimmer span exists
        if (!this.titleShimmerSpan || !this.titleShimmerSpan.parentElement) {
            labelElement.textContent = '';
            this.titleShimmerSpan = $('span.chat-thinking-title-shimmer');
            labelElement.appendChild(this.titleShimmerSpan);
        }
        this.titleShimmerSpan.textContent = localize('chat.thinking.shimmer', "{0}: ", this.defaultTitle);
        // Dispose previous detail rendering
        this._titleDetailRendered.clear();
        const result = this.chatContentMarkdownRenderer.render(new MarkdownString(title));
        result.element.classList.add('collapsible-title-content', 'chat-thinking-title-detail');
        renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._store);
        this._titleDetailRendered.value = result;
        if (this.titleDetailContainer) {
            // Replace old detail in-place
            this.titleDetailContainer.replaceWith(result.element);
        }
        else {
            labelElement.appendChild(result.element);
        }
        this.titleDetailContainer = result.element;
        this._collapseButton.element.ariaLabel = thinkingLabel;
        this._collapseButton.element.ariaExpanded = String(this.isExpanded());
    }
    hasSameContent(other, _followingContent, _element) {
        if (_element.isComplete) {
            return true;
        }
        if (other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized' || other.kind === 'markdownContent' || other.kind === 'hook') {
            return true;
        }
        if (other.kind !== 'thinking') {
            return false;
        }
        return other?.id !== this.id;
    }
    dispose() {
        this.isActive = false;
        if (this.workingSpinnerElement) {
            this.workingSpinnerElement.remove();
            this.workingSpinnerElement = undefined;
            this.workingSpinnerLabel = undefined;
        }
        this.pendingRemovalFlushDisposable?.dispose();
        this.pendingRemovalFlushDisposable = undefined;
        this.pendingScrollDisposable?.dispose();
        super.dispose();
    }
};
ChatThinkingContentPart = ChatThinkingContentPart_1 = __decorate([
    __param(4, IInstantiationService),
    __param(5, IConfigurationService),
    __param(6, IChatMarkdownAnchorService),
    __param(7, ILanguageModelsService),
    __param(8, IHoverService),
    __param(9, IStorageService)
], ChatThinkingContentPart);
export { ChatThinkingContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRoaW5raW5nQ29udGVudFBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdFRoaW5raW5nQ29udGVudFBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNwSCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDdkUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFFeEcsT0FBTyxFQUE0RSxtQkFBbUIsRUFBaUMsTUFBTSw0Q0FBNEMsQ0FBQztBQUcxTCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUV0RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUV6RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFHOUUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDckYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsT0FB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