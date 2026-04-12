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
var ChatMarkdownContentPart_1;
import * as dom from '../../../../../../base/browser/dom.js';
import { allowedMarkdownHtmlAttributes } from '../../../../../../base/browser/markdownRenderer.js';
import { StandardMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { wrapTablesWithScrollable } from './chatMarkdownTableScrolling.js';
import { coalesce } from '../../../../../../base/common/arrays.js';
import { findLast } from '../../../../../../base/common/arraysFind.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { Disposable, DisposableStore, dispose, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { autorun, autorunSelfDisposable, derived } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { EditDeltaInfo } from '../../../../../../editor/common/textModelEditSource.js';
import { localize } from '../../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { registerOpenEditorListeners } from '../../../../../../platform/editor/browser/editor.js';
import { FileKind } from '../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IEditorService, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { IAiEditTelemetryService } from '../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { MarkedKatexSupport } from '../../../../markdown/browser/markedKatexSupport.js';
import { extractCodeblockUrisFromText, extractVulnerabilitiesFromText } from '../../../common/widget/annotations.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { isRequestVM, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { allowedChatMarkdownHtmlTags } from '../chatContentMarkdownRenderer.js';
import { MarkdownDiffBlockPart, parseUnifiedDiff } from './chatDiffBlockPart.js';
import { ChatMarkdownDecorationsRenderer } from './chatMarkdownDecorationsRenderer.js';
import { CodeBlockPart } from './codeBlockPart.js';
import './media/chatCodeBlockPill.css';
import { ChatExtensionsContentPart } from './chatExtensionsContentPart.js';
import './media/chatMarkdownPart.css';
const $ = dom.$;
let ChatMarkdownContentPart = class ChatMarkdownContentPart extends Disposable {
    static { ChatMarkdownContentPart_1 = this; }
    static { this.ID_POOL = 0; }
    get codeblocks() {
        return this._codeblocks;
    }
    constructor(markdown, context, editorPool, fillInIncompleteTokens = false, codeBlockStartIndex = 0, renderer, markdownRenderOptions, currentWidth, rendererOptions, contextKeyService, configurationService, instantiationService, aiEditTelemetryService) {
        super();
        this.markdown = markdown;
        this.editorPool = editorPool;
        this.rendererOptions = rendererOptions;
        this.instantiationService = instantiationService;
        this.aiEditTelemetryService = aiEditTelemetryService;
        this.codeblocksPartId = String(++ChatMarkdownContentPart_1.ID_POOL);
        // This Event exists for one specific scenario and the pattern shouldn't be copied without a good reason
        this._onDidChangeHeight = this._register(new Emitter());
        this.onDidChangeHeight = this._onDidChangeHeight.event;
        this._onDidChangeDiff = this._register(new Emitter());
        /**
         * Fires when any edit pill (CollapsedCodeBlock) in this markdown part updates its diff.
         * The aggregated stats reflect the total added/removed across all edit pills.
         */
        this.onDidChangeDiff = this._onDidChangeDiff.event;
        this.allRefs = [];
        this._codeblocks = [];
        this.mathLayoutParticipants = new Set();
        const element = context.element;
        const inUndoStop = findLast(context.content, e => e.kind === 'undoStop', context.contentIndex)?.id;
        // Need to track the index of the codeblock within the response so it can have a unique ID,
        // and within this part to find it within the codeblocks array
        let globalCodeBlockIndexStart = codeBlockStartIndex;
        this.domNode = $('div.chat-markdown-part');
        if (this.rendererOptions.accessibilityOptions?.statusMessage) {
            this.domNode.ariaLabel = this.rendererOptions.accessibilityOptions.statusMessage;
            if (configurationService.getValue("accessibility.verboseChatProgressUpdates" /* AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates */)) {
                status(this.rendererOptions.accessibilityOptions.statusMessage);
            }
        }
        const enableMath = configurationService.getValue(ChatConfiguration.EnableMath);
        const renderStore = this._register(new MutableDisposable());
        const doRenderMarkdown = () => {
            if (this._store.isDisposed) {
                return;
            }
            // Dispose previous render and reset state for re-render
            const store = new DisposableStore();
            renderStore.value = store;
            dom.clearNode(this.domNode);
            this.allRefs.length = 0;
            this._codeblocks.length = 0;
            this.mathLayoutParticipants.clear();
            globalCodeBlockIndexStart = codeBlockStartIndex;
            // TODO: Move katex support into chatMarkdownRenderer
            const markedExtensions = enableMath
                ? coalesce([MarkedKatexSupport.getExtension(dom.getWindow(context.container), {
                        throwOnError: false
                    })])
                : [];
            // Enables github-flavored-markdown + line breaks with single newlines
            // (which matches typical expectations but isn't "proper" in markdown)
            const markedOpts = {
                gfm: true,
                breaks: true,
            };
            const result = store.add(renderer.render(markdown.content, {
                sanitizerConfig: MarkedKatexSupport.getSanitizerOptions({
                    allowedTags: allowedChatMarkdownHtmlTags,
                    allowedAttributes: allowedMarkdownHtmlAttributes,
                }),
                fillInIncompleteTokens,
                codeBlockRendererSync: (languageId, text, raw) => {
                    const isCodeBlockComplete = !isResponseVM(context.element) || context.element.isComplete || !raw || codeblockHasClosingBackticks(raw);
                    if ((!text || (text.startsWith('<vscode_codeblock_uri') && !text.includes('\n'))) && !isCodeBlockComplete) {
                        const hideEmptyCodeblock = $('div');
                        hideEmptyCodeblock.style.display = 'none';
                        return hideEmptyCodeblock;
                    }
                    if (languageId === 'diff' && raw && this.rendererOptions.allowInlineDiffs) {
                        const match = raw.match(/^```diff:(\w+)/);
                        if (match && isResponseVM(context.element)) {
                            const actualLanguageId = match[1];
                            const codeBlockUri = extractCodeblockUrisFromText(text);
                            const { before, after } = parseUnifiedDiff(codeBlockUri?.textWithoutResult ?? text);
                            const diffData = {
                                element: context.element,
                                codeBlockIndex: globalCodeBlockIndexStart++,
                                languageId: actualLanguageId,
                                beforeContent: before,
                                afterContent: after,
                                codeBlockResource: codeBlockUri?.uri,
                                isReadOnly: true,
                                horizontalPadding: this.rendererOptions.horizontalPadding,
                            };
                            const diffPart = this.instantiationService.createInstance(MarkdownDiffBlockPart, diffData, context.diffEditorPool, context.currentWidth.get());
                            const ref = {
                                object: diffPart,
                                isStale: () => false,
                                dispose: () => diffPart.dispose()
                            };
                            this.allRefs.push(ref);
                            store.add(ref);
                            return diffPart.element;
                        }
                    }
                    if (languageId === 'vscode-extensions') {
                        const chatExtensions = store.add(instantiationService.createInstance(ChatExtensionsContentPart, { kind: 'extensions', extensions: text.split(',') }));
                        return chatExtensions.domNode;
                    }
                    const globalIndex = globalCodeBlockIndexStart++;
                    let codeBlockText = text;
                    const extractedVulns = extractVulnerabilitiesFromText(text);
                    codeBlockText = fixCodeText(extractedVulns.newText, languageId);
                    const vulns = extractedVulns.vulnerabilities;
                    let codemapperUri;
                    let isEdit;
                    const codeblockUri = extractCodeblockUrisFromText(codeBlockText);
                    if (codeblockUri) {
                        codemapperUri = codeblockUri.uri;
                        isEdit = codeblockUri.isEdit;
                        codeBlockText = codeblockUri.textWithoutResult;
                    }
                    const hideToolbar = isResponseVM(element) && element.errorDetails?.responseIsFiltered;
                    const renderOptions = {
                        ...this.rendererOptions.codeBlockRenderOptions,
                    };
                    if (hideToolbar !== undefined) {
                        renderOptions.hideToolbar = hideToolbar;
                    }
                    const codeBlockInfo = { languageId, text: codeBlockText, codeBlockIndex: globalIndex, element, parentContextKeyService: contextKeyService, vulns, codemapperUri, renderOptions, chatSessionResource: element.sessionResource };
                    const baseCodeBlockInfo = {
                        ownerMarkdownPartId: this.codeblocksPartId,
                        codeBlockIndex: globalIndex,
                        elementId: element.id,
                        chatSessionResource: element.sessionResource,
                        languageId,
                        editDeltaInfo: EditDeltaInfo.fromText(text),
                    };
                    if (element.isCompleteAddedRequest || !codemapperUri || !isEdit) {
                        const ref = this.renderCodeBlock(codeBlockInfo, currentWidth);
                        this._codeblocks.push({
                            ...baseCodeBlockInfo,
                            codemapperUri: codeBlockInfo.codemapperUri,
                            isStreamingEdit: false,
                            get uri() {
                                return ref.object.uri;
                            },
                            focus() {
                                ref.object.focus();
                            },
                        });
                        store.add(ref);
                        return ref.object.element;
                    }
                    const requestId = isRequestVM(element) ? element.id : element.requestId;
                    const ref = this.renderCodeBlockPill(element.sessionResource, requestId, inUndoStop, codemapperUri);
                    this._codeblocks.push({
                        ...baseCodeBlockInfo,
                        codemapperUri,
                        isStreamingEdit: !isCodeBlockComplete,
                        get uri() {
                            return undefined;
                        },
                        focus() {
                            return ref.object.element.focus();
                        },
                    });
                    store.add(ref);
                    return ref.object.element;
                },
                markedOptions: markedOpts,
                markedExtensions,
                ...markdownRenderOptions,
            }, this.domNode));
            // Ideally this would happen earlier, but we need to parse the markdown.
            if (isResponseVM(element) && !element.model.codeBlockInfos && element.model.isComplete) {
                element.model.initializeCodeBlockInfos(this._codeblocks.map(info => {
                    return {
                        suggestionId: this.aiEditTelemetryService.createSuggestionId({
                            presentation: 'codeBlock',
                            feature: 'sideBarChat',
                            editDeltaInfo: info.editDeltaInfo,
                            languageId: info.languageId,
                            modeId: element.model.request?.modeInfo?.modeId,
                            modelId: element.model.request?.modelId,
                            applyCodeBlockSuggestionId: undefined,
                            source: undefined,
                        })
                    };
                }));
            }
            const markdownDecorationsRenderer = instantiationService.createInstance(ChatMarkdownDecorationsRenderer);
            store.add(markdownDecorationsRenderer.walkTreeAndAnnotateReferenceLinks(markdown, result.element));
            const layoutParticipants = new Lazy(() => {
                const observer = new ResizeObserver(() => this.mathLayoutParticipants.forEach(layout => layout()));
                observer.observe(this.domNode);
                store.add(toDisposable(() => observer.disconnect()));
                return this.mathLayoutParticipants;
            });
            // Make katex blocks horizontally scrollable
            // eslint-disable-next-line no-restricted-syntax
            for (const katexBlock of this.domNode.querySelectorAll('.katex-display')) {
                if (!dom.isHTMLElement(katexBlock)) {
                    continue;
                }
                const scrollable = new DomScrollableElement(katexBlock.cloneNode(true), {
                    vertical: 2 /* ScrollbarVisibility.Hidden */,
                    horizontal: 1 /* ScrollbarVisibility.Auto */,
                });
                store.add(scrollable);
                katexBlock.replaceWith(scrollable.getDomNode());
                layoutParticipants.value.add(() => { scrollable.scanDomNode(); });
                scrollable.scanDomNode();
            }
            store.add(wrapTablesWithScrollable(this.domNode, layoutParticipants));
        };
        // Always render immediately
        doRenderMarkdown();
        if (enableMath && !MarkedKatexSupport.getExtension(dom.getWindow(context.container))) {
            // KaTeX not yet loaded - load it and re-render when ready
            MarkedKatexSupport.loadExtension(dom.getWindow(context.container))
                .then(() => {
                doRenderMarkdown();
            })
                .catch(e => {
                console.error('Failed to load MarkedKatexSupport extension:', e);
            });
        }
    }
    dispose() {
        super.dispose();
        dispose(this.allRefs);
        this.allRefs.length = 0;
    }
    renderCodeBlockPill(sessionResource, requestId, inUndoStop, codemapperUri) {
        const codeBlock = this.instantiationService.createInstance(CollapsedCodeBlock, sessionResource, requestId, inUndoStop);
        const diffListenerStore = new DisposableStore();
        const ref = {
            object: codeBlock,
            isStale: () => false,
            dispose: () => {
                codeBlock.dispose();
                diffListenerStore.dispose();
            }
        };
        // Push to allRefs and register the diff listener before calling render(),
        // since diff observables may fire synchronously when the editing session
        // already has finalized diff data (e.g. on session restore).
        this.allRefs.push(ref);
        diffListenerStore.add(codeBlock.onDidChangeDiff(() => this.fireAggregatedDiff()));
        codeBlock.render(codemapperUri);
        return ref;
    }
    fireAggregatedDiff() {
        let totalAdded = 0;
        let totalRemoved = 0;
        for (const ref of this.allRefs) {
            if (ref.object instanceof CollapsedCodeBlock && ref.object.diff) {
                totalAdded += ref.object.diff.added;
                totalRemoved += ref.object.diff.removed;
            }
        }
        this._onDidChangeDiff.fire({ added: totalAdded, removed: totalRemoved });
    }
    renderCodeBlock(data, currentWidth) {
        const key = CodeBlockPart.poolKey(data.element.id, data.codeBlockIndex);
        const ref = this.editorPool.get(key);
        this.allRefs.push(ref);
        ref.object.render(data, currentWidth);
        // There is a scenario where request code block content changes without a ResizeObserver callback.
        // Work around it with this targeted onDidHeightChange. But this pattern generally shouldn't be necessary and
        // shouldn't be copied elsewhere.
        if (!this._store.isDisposed && isRequestVM(data.element)) {
            this._onDidChangeHeight.fire();
        }
        return ref;
    }
    hasSameContent(other) {
        if (other.kind !== 'markdownContent') {
            return false;
        }
        if (other.content.value === this.markdown.content.value) {
            return true;
        }
        // If we are streaming in code shown in an edit pill, do not re-render the entire content as long as it's coming in
        const lastCodeblock = this._codeblocks.at(-1);
        if (lastCodeblock && lastCodeblock.codemapperUri !== undefined && lastCodeblock.isStreamingEdit) {
            return other.content.value.lastIndexOf('```') === this.markdown.content.value.lastIndexOf('```');
        }
        return false;
    }
    layout(width) {
        this.allRefs.forEach((ref, index) => {
            if (ref.object instanceof CodeBlockPart) {
                ref.object.layout(width);
            }
            else if (ref.object instanceof MarkdownDiffBlockPart) {
                ref.object.layout(width);
            }
            else if (ref.object instanceof CollapsedCodeBlock) {
                const codeblockModel = this._codeblocks[index];
                if (codeblockModel.codemapperUri && !isEqual(ref.object.uri, codeblockModel.codemapperUri)) {
                    ref.object.render(codeblockModel.codemapperUri);
                }
            }
        });
        this.mathLayoutParticipants.forEach(layout => layout());
    }
    onDidRemount() {
        for (const ref of this.allRefs) {
            if (ref.object instanceof CodeBlockPart) {
                ref.object.onDidRemount();
            }
        }
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
};
ChatMarkdownContentPart = ChatMarkdownContentPart_1 = __decorate([
    __param(9, IContextKeyService),
    __param(10, IConfigurationService),
    __param(11, IInstantiationService),
    __param(12, IAiEditTelemetryService)
], ChatMarkdownContentPart);
export { ChatMarkdownContentPart };
export function codeblockHasClosingBackticks(str) {
    str = str.trim();
    return !!str.match(/\n```+$/);
}
let CollapsedCodeBlock = class CollapsedCodeBlock extends Disposable {
    get uri() { return this._uri; }
    get diff() {
        return this.currentDiff;
    }
    constructor(sessionResource, requestId, inUndoStop, labelService, editorService, modelService, languageService, contextMenuService, contextKeyService, menuService, hoverService, chatService, configurationService) {
        super();
        this.sessionResource = sessionResource;
        this.requestId = requestId;
        this.inUndoStop = inUndoStop;
        this.labelService = labelService;
        this.editorService = editorService;
        this.modelService = modelService;
        this.languageService = languageService;
        this.contextMenuService = contextMenuService;
        this.contextKeyService = contextKeyService;
        this.menuService = menuService;
        this.hoverService = hoverService;
        this.chatService = chatService;
        this.configurationService = configurationService;
        this.hover = this._register(new MutableDisposable());
        this._onDidChangeDiff = this._register(new Emitter());
        this.onDidChangeDiff = this._onDidChangeDiff.event;
        this.progressStore = this._store.add(new DisposableStore());
        this.element = $('div.chat-codeblock-pill-container');
        this.statusIndicatorContainer = $('div.status-indicator-container');
        this.pillElement = $('.chat-codeblock-pill-widget');
        this.pillElement.tabIndex = 0;
        this.pillElement.classList.add('show-file-icons');
        this.pillElement.role = 'button';
        this.element.appendChild(this.statusIndicatorContainer);
        this.element.appendChild(this.pillElement);
        this.registerListeners();
    }
    registerListeners() {
        this._register(registerOpenEditorListeners(this.pillElement, e => this.showDiff(e)));
        this._register(dom.addDisposableListener(this.pillElement, dom.EventType.CONTEXT_MENU, e => {
            const event = new StandardMouseEvent(dom.getWindow(e), e);
            dom.EventHelper.stop(e, true);
            this.contextMenuService.showContextMenu({
                contextKeyService: this.contextKeyService,
                getAnchor: () => event,
                getActions: () => {
                    if (!this.uri) {
                        return [];
                    }
                    const menu = this.menuService.getMenuActions(MenuId.ChatEditingCodeBlockContext, this.contextKeyService, {
                        arg: {
                            sessionResource: this.sessionResource,
                            requestId: this.requestId,
                            uri: this.uri,
                            stopId: this.inUndoStop
                        }
                    });
                    return getFlatContextMenuActions(menu);
                },
            });
        }));
    }
    showDiff({ editorOptions: options, openToSide }) {
        if (this.currentDiff) {
            this.editorService.openEditor({
                original: { resource: this.currentDiff.originalURI },
                modified: { resource: this.currentDiff.modifiedURI },
                options
            }, openToSide ? SIDE_GROUP : undefined);
        }
        else if (this.uri) {
            this.editorService.openEditor({ resource: this.uri, options }, openToSide ? SIDE_GROUP : undefined);
        }
    }
    /**
     * @param uri URI of the file on-disk being changed
     * @param isStreaming Whether the edit has completed (at the time of this being rendered)
     */
    render(uri) {
        this.progressStore.clear();
        this._uri = uri;
        const session = this.chatService.getSession(this.sessionResource);
        const iconText = this.labelService.getUriBasenameLabel(uri);
        const statusIconEl = dom.$('span.status-icon');
        const statusLabelEl = dom.$('span.status-label', {}, '');
        this.statusIndicatorContainer.replaceChildren(statusIconEl, statusLabelEl);
        const iconEl = dom.$('span.icon');
        const iconLabelEl = dom.$('span.icon-label', {}, iconText);
        const labelDetail = dom.$('span.label-detail', {}, '');
        // Create a progress fill element for the animation
        const progressFill = dom.$('span.progress-fill');
        this.pillElement.replaceChildren(progressFill, iconEl, iconLabelEl, labelDetail);
        const tooltipLabel = this.labelService.getUriLabel(uri, { relative: true });
        this.updateTooltip(tooltipLabel);
        const editSession = session?.editingSession;
        if (!editSession) {
            return;
        }
        const diffObservable = derived(reader => {
            const entry = editSession.readEntry(uri, reader);
            return entry && editSession.getEntryDiffBetweenStops(entry.modifiedURI, this.requestId, this.inUndoStop);
        }).map((d, r) => d?.read(r));
        const isStreaming = derived(r => {
            const entry = editSession.readEntry(uri, r);
            const currentlyModified = entry?.isCurrentlyBeingModifiedBy.read(r);
            return !!currentlyModified && currentlyModified.responseModel.requestId === this.requestId && currentlyModified.undoStopId === this.inUndoStop;
        });
        // Set the icon/classes while edits are streaming
        let statusIconClasses = [];
        let pillIconClasses = [];
        this.progressStore.add(autorun(r => {
            statusIconEl.classList.remove(...statusIconClasses);
            iconEl.classList.remove(...pillIconClasses);
            if (isStreaming.read(r)) {
                const codicon = ThemeIcon.modify(Codicon.loading, 'spin');
                statusIconClasses = ThemeIcon.asClassNameArray(codicon);
                statusIconEl.classList.add(...statusIconClasses);
                const entry = editSession.readEntry(uri, r);
                const rwRatio = Math.floor((entry?.rewriteRatio.read(r) || 0) * 100);
                statusLabelEl.textContent = localize('chat.codeblock.applyingEdits', 'Applying edits');
                const showAnimation = this.configurationService.getValue(ChatConfiguration.ShowCodeBlockProgressAnimation);
                if (showAnimation) {
                    progressFill.style.width = `${rwRatio}%`;
                    this.pillElement.classList.add('progress-filling');
                    labelDetail.textContent = '';
                }
                else {
                    progressFill.style.width = '0%';
                    this.pillElement.classList.remove('progress-filling');
                    labelDetail.textContent = rwRatio === 0 || !rwRatio ? localize('chat.codeblock.generating', "Generating edits...") : localize('chat.codeblock.applyingPercentage', "({0}%)...", rwRatio);
                }
            }
            else {
                const statusCodeicon = Codicon.check;
                statusIconClasses = ThemeIcon.asClassNameArray(statusCodeicon);
                statusIconEl.classList.add(...statusIconClasses);
                statusLabelEl.textContent = localize('chat.codeblock.edited', 'Edited');
                const fileKind = uri.path.endsWith('/') ? FileKind.FOLDER : FileKind.FILE;
                pillIconClasses = getIconClasses(this.modelService, this.languageService, uri, fileKind);
                iconEl.classList.add(...pillIconClasses);
                this.pillElement.classList.remove('progress-filling');
                progressFill.style.width = '0%';
                labelDetail.textContent = '';
            }
        }));
        // Render the +/- diff
        this.progressStore.add(autorunSelfDisposable(r => {
            const changes = diffObservable.read(r);
            if (changes === undefined) {
                return;
            }
            // eslint-disable-next-line no-restricted-syntax
            const labelAdded = this.pillElement.querySelector('.label-added') ?? this.pillElement.appendChild(dom.$('span.label-added'));
            // eslint-disable-next-line no-restricted-syntax
            const labelRemoved = this.pillElement.querySelector('.label-removed') ?? this.pillElement.appendChild(dom.$('span.label-removed'));
            if (changes && !changes?.identical && !changes?.quitEarly) {
                this.currentDiff = changes;
                this._onDidChangeDiff.fire(changes);
                labelAdded.textContent = `+${changes.added}`;
                labelRemoved.textContent = `-${changes.removed}`;
                const insertionsFragment = changes.added === 1 ? localize('chat.codeblock.insertions.one', "1 insertion") : localize('chat.codeblock.insertions', "{0} insertions", changes.added);
                const deletionsFragment = changes.removed === 1 ? localize('chat.codeblock.deletions.one', "1 deletion") : localize('chat.codeblock.deletions', "{0} deletions", changes.removed);
                const summary = localize('summary', 'Edited {0}, {1}, {2}', iconText, insertionsFragment, deletionsFragment);
                this.element.ariaLabel = summary;
                // No need to keep updating once we get the diff info
                if (changes.isFinal) {
                    r.dispose();
                }
            }
        }));
    }
    updateTooltip(tooltip) {
        this.tooltip = tooltip;
        if (!this.hover.value) {
            this.hover.value = this.hoverService.setupDelayedHover(this.pillElement, () => ({
                content: this.tooltip,
                style: 1 /* HoverStyle.Pointer */,
                position: { hoverPosition: 2 /* HoverPosition.BELOW */ },
                persistence: { hideOnKeyDown: true },
            }));
        }
    }
};
CollapsedCodeBlock = __decorate([
    __param(3, ILabelService),
    __param(4, IEditorService),
    __param(5, IModelService),
    __param(6, ILanguageService),
    __param(7, IContextMenuService),
    __param(8, IContextKeyService),
    __param(9, IMenuService),
    __param(10, IHoverService),
    __param(11, IChatService),
    __param(12, IConfigurationService)
], CollapsedCodeBlock);
export { CollapsedCodeBlock };
function fixCodeText(text, languageId) {
    if (languageId === 'php') {
        // <?php or short tag version <?
        if (!text.trim().startsWith('<?')) {
            return `<?php\n${text}`;
        }
    }
    return text;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1hcmtkb3duQ29udGVudFBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdE1hcmtkb3duQ29udGVudFBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLDZCQUE2QixFQUE2RCxNQUFNLG9EQUFvRCxDQUFDO0FBQzlKLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUd4RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN4RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFlLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2hKLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE9BQU8sRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXRHLE9BQU8sRUFBRSxTQUFTLEVB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