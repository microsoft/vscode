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
import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { asCssVariable, buttonSecondaryBackground, buttonSecondaryForeground, buttonSecondaryHoverBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { katexContainerClassName } from '../../../markdown/common/markedKatexExtension.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
import { ChatAccessibilityProvider } from '../accessibility/chatAccessibilityProvider.js';
import { IChatAccessibilityService } from '../chat.js';
import { ChatListDelegate, ChatListItemRenderer } from './chatListRenderer.js';
import { ChatEditorOptions } from './chatOptions.js';
import { ChatPendingDragController } from './chatPendingDragAndDrop.js';
/**
 * A reusable widget that encapsulates chat list/tree rendering.
 * This can be used in various contexts such as the main chat widget,
 * hover previews, etc.
 */
let ChatListWidget = class ChatListWidget extends Disposable {
    /**
     * Event fired when a request item is clicked.
     */
    get onDidClickRequest() {
        return this._renderer.onDidClickRequest;
    }
    /**
     * Event fired when an item is re-rendered.
     */
    get onDidRerender() {
        return this._renderer.onDidRerender;
    }
    /**
     * Event fired when a template is disposed.
     */
    get onDidDispose() {
        return this._renderer.onDidDispose;
    }
    /**
     * Event fired when focus moves outside the editing area.
     */
    get onDidFocusOutside() {
        return this._renderer.onDidFocusOutside;
    }
    //#endregion
    //#region Properties
    get domNode() {
        return this._container;
    }
    get scrollTop() {
        return this._tree.scrollTop;
    }
    set scrollTop(value) {
        this._tree.scrollTop = value;
    }
    get scrollHeight() {
        return this._tree.scrollHeight;
    }
    get renderHeight() {
        return this._tree.renderHeight;
    }
    get contentHeight() {
        return this._tree.contentHeight;
    }
    /**
     * Whether the list is scrolled to the bottom.
     */
    get isScrolledToBottom() {
        return this._tree.scrollTop + this._tree.renderHeight >= this._tree.scrollHeight - 2;
    }
    /**
     * The last item in the list.
     */
    get lastItem() {
        return this._lastItem;
    }
    //#endregion
    constructor(container, options, instantiationService, contextKeyService, chatService, contextMenuService, logService, configurationService, chatAccessibilityService) {
        super();
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.chatService = chatService;
        this.contextMenuService = contextMenuService;
        this.logService = logService;
        this.configurationService = configurationService;
        this.chatAccessibilityService = chatAccessibilityService;
        //#region Events
        this._onDidScroll = this._register(new Emitter());
        this.onDidScroll = this._onDidScroll.event;
        this._onDidChangeContentHeight = this._register(new Emitter());
        this.onDidChangeContentHeight = this._onDidChangeContentHeight.event;
        this._onDidClickFollowup = this._register(new Emitter());
        this.onDidClickFollowup = this._onDidClickFollowup.event;
        this._onDidFocus = this._register(new Emitter());
        this.onDidFocus = this._onDidFocus.event;
        this._onDidChangeItemHeight = this._register(new Emitter());
        /** Event fired when an item's height changes. Used for dynamic layout mode. */
        this.onDidChangeItemHeight = this._onDidChangeItemHeight.event;
        this._visible = true;
        this._mostRecentlyFocusedItemIndex = -1;
        this._scrollLock = true;
        this._suppressAutoScroll = false;
        this._settingChangeCounter = 0;
        this._visibleChangeCount = 0;
        this._bodyDimension = null;
        this._previousLastItemMinHeight = null;
        this._viewModel = options.viewModel;
        this._location = options.location;
        this._getCurrentLanguageModelId = options.getCurrentLanguageModelId;
        this._getCurrentModeInfo = options.getCurrentModeInfo;
        this._lastItemIdContextKey = ChatContextKeys.lastItemId.bindTo(this.contextKeyService);
        this._container = container;
        // Toggle link-style for inline reference widgets based on configuration (single listener for all widgets)
        const updateInlineReferencesStyle = () => {
            const style = this.configurationService.getValue(ChatConfiguration.InlineReferencesStyle);
            this._container.classList.toggle('chat-inline-references-link-style', style === 'link');
        };
        updateInlineReferencesStyle();
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ChatConfiguration.InlineReferencesStyle)) {
                updateInlineReferencesStyle();
            }
        }));
        const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService])));
        this._renderStyle = options.renderStyle;
        // Create overflow widgets container
        const overflowWidgetsContainer = options.overflowWidgetsDomNode ?? document.createElement('div');
        if (!options.overflowWidgetsDomNode) {
            overflowWidgetsContainer.classList.add('chat-overflow-widget-container', 'monaco-editor');
            this._container.append(overflowWidgetsContainer);
            this._register(toDisposable(() => overflowWidgetsContainer.remove()));
        }
        // Create editor options (use provided or create new)
        const editorOptions = options.editorOptions ?? this._register(scopedInstantiationService.createInstance(ChatEditorOptions, options.viewId, 'foreground', options.inputEditorBackground ?? 'chat.requestEditor.background', options.resultEditorBackground ?? 'chat.responseEditor.background'));
        // Create delegate
        const delegate = scopedInstantiationService.createInstance(ChatListDelegate, options.defaultElementHeight ?? 200);
        // Create renderer delegate
        const rendererDelegate = {
            getListLength: () => this._tree.getNode(null).visibleChildrenCount,
            onDidScroll: this.onDidScroll,
            container: this._container,
            currentChatMode: options.currentChatMode ?? (() => ChatModeKind.Ask),
        };
        // Create renderer
        this._renderer = this._register(scopedInstantiationService.createInstance(ChatListItemRenderer, editorOptions, options.rendererOptions ?? {}, rendererDelegate, overflowWidgetsContainer, this._viewModel));
        // Wire up renderer events
        this._register(this._renderer.onDidClickFollowup(item => {
            this._onDidClickFollowup.fire(item);
        }));
        this._register(this._renderer.onDidChangeItemHeight(e => {
            this._updateElementHeight(e.element, e.height);
            // If the second-to-last item's height changed, update the last item's min height
            const secondToLastItem = this._viewModel?.getItems().at(-2);
            if (e.element.id === secondToLastItem?.id) {
                this.updateLastItemMinHeight();
            }
            this._onDidChangeItemHeight.fire(e);
        }));
        // Handle rerun with agent or command detection internally
        this._register(this._renderer.onDidClickRerunWithAgentOrCommandDetection(e => {
            const request = this.chatService.getSession(e.sessionResource)?.getRequests().find(candidate => candidate.id === e.requestId);
            if (request) {
                const sendOptions = {
                    noCommandDetection: true,
                    attempt: request.attempt + 1,
                    location: this._location,
                    userSelectedModelId: this._getCurrentLanguageModelId?.(),
                    modeInfo: this._getCurrentModeInfo?.(),
                };
                this.chatAccessibilityService.acceptRequest(e.sessionResource);
                this.chatService.resendRequest(request, sendOptions).catch(e => this.logService.error('FAILED to rerun request', e));
            }
        }));
        // Create drag-and-drop controller for reordering pending requests
        this._renderer.pendingDragController = this._register(scopedInstantiationService.createInstance(ChatPendingDragController, this._container, () => this._viewModel));
        // Create tree
        const styles = options.styles ?? {};
        this._tree = this._register(scopedInstantiationService.createInstance((WorkbenchObjectTree), 'ChatList', this._container, delegate, [this._renderer], {
            identityProvider: { getId: (e) => e.id },
            horizontalScrolling: false,
            alwaysConsumeMouseWheel: false,
            supportDynamicHeights: true,
            hideTwistiesOfChildlessElements: true,
            accessibilityProvider: this.instantiationService.createInstance(ChatAccessibilityProvider),
            keyboardNavigationLabelProvider: {
                getKeyboardNavigationLabel: (e) => isRequestVM(e) ? e.message : isResponseVM(e) ? e.response.value : ''
            },
            setRowLineHeight: false,
            scrollToActiveElement: true,
            filter: options.filter,
            overrideStyles: {
                listFocusBackground: styles.listBackground,
                listInactiveFocusBackground: styles.listBackground,
                listActiveSelectionBackground: styles.listBackground,
                listFocusAndSelectionBackground: styles.listBackground,
                listInactiveSelectionBackground: styles.listBackground,
                listHoverBackground: styles.listBackground,
                listBackground: styles.listBackground,
                listFocusForeground: styles.listForeground,
                listHoverForeground: styles.listForeground,
                listInactiveFocusForeground: styles.listForeground,
                listInactiveSelectionForeground: styles.listForeground,
                listActiveSelectionForeground: styles.listForeground,
                listFocusAndSelectionForeground: styles.listForeground,
                listActiveSelectionIconForeground: undefined,
                listInactiveSelectionIconForeground: undefined,
            }
        }));
        // Create scroll-down button
        this._scrollDownButton = this._register(new Button(this._container, {
            buttonBackground: asCssVariable(buttonSecondaryBackground),
            buttonForeground: asCssVariable(buttonSecondaryForeground),
            buttonHoverBackground: asCssVariable(buttonSecondaryHoverBackground),
            buttonSecondaryBackground: undefined,
            buttonSecondaryForeground: undefined,
            buttonSecondaryHoverBackground: undefined,
            buttonSeparator: undefined,
            supportIcons: true,
        }));
        this._scrollDownButton.element.classList.add('chat-scroll-down');
        this._scrollDownButton.label = `$(${Codicon.chevronDown.id})`;
        this._scrollDownButton.element.style.display = 'none'; // Hidden by default
        this._register(this._scrollDownButton.onDidClick(() => {
            this.setScrollLock(true);
            this.scrollToEnd();
        }));
        // Wire up tree events
        // Handle content height changes (fires high-level event, internal scroll handling)
        this._register(this._tree.onDidChangeContentHeight(() => {
            this._onDidChangeContentHeight.fire();
        }));
        this._register(this._tree.onDidFocus(() => {
            this._onDidFocus.fire();
        }));
        // Handle focus changes internally (update mostRecentlyFocusedItemIndex)
        this._register(this._tree.onDidChangeFocus(() => {
            const focused = this.getFocus();
            if (focused && focused.length > 0) {
                const focusedItem = focused[0];
                const items = this.getItems();
                const idx = items.findIndex(i => i === focusedItem);
                if (idx !== -1) {
                    this._mostRecentlyFocusedItemIndex = idx;
                }
            }
        }));
        // Handle scroll events (fire public event and manage scroll-down button)
        this._register(this._tree.onDidScroll((e) => {
            this._onDidScroll.fire(e);
            this.updateScrollDownButtonVisibility();
        }));
        // Handle context menu internally
        this._register(this._tree.onContextMenu(e => {
            this.handleContextMenu(e);
        }));
        this._register(this.configurationService.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(ChatConfiguration.EditRequests) || e.affectsConfiguration(ChatConfiguration.CheckpointsEnabled)) {
                this._settingChangeCounter++;
                this.refresh();
            }
        }));
    }
    //#region Internal event handlers
    /**
     * Update scroll-down button visibility based on scroll position and scroll lock.
     */
    updateScrollDownButtonVisibility() {
        const show = !this.isScrolledToBottom && !this._scrollLock;
        this._scrollDownButton.element.style.display = show ? '' : 'none';
    }
    /**
     * Handle context menu events.
     */
    handleContextMenu(e) {
        e.browserEvent.preventDefault();
        e.browserEvent.stopPropagation();
        const selected = e.element;
        // Check if the context menu was opened on a KaTeX element
        const target = e.browserEvent.target;
        const isKatexElement = target.closest(`.${katexContainerClassName}`) !== null;
        const scopedContextKeyService = this.contextKeyService.createOverlay([
            [ChatContextKeys.isResponse.key, isResponseVM(selected)],
            [ChatContextKeys.responseIsFiltered.key, isResponseVM(selected) && !!selected.errorDetails?.responseIsFiltered],
            [ChatContextKeys.isKatexMathElement.key, isKatexElement]
        ]);
        this.contextMenuService.showContextMenu({
            menuId: MenuId.ChatContext,
            menuActionOptions: { shouldForwardArgs: true },
            contextKeyService: scopedContextKeyService,
            getAnchor: () => e.anchor,
            getActionsContext: () => selected,
        });
    }
    //#endregion
    //#region ViewModel methods
    /**
     * Set the view model for the list to render.
     */
    setViewModel(viewModel) {
        this._viewModel = viewModel;
        this._renderer.updateViewModel(viewModel);
    }
    /**
     * Refresh the list from the current view model.
     * Uses internal state for diff identity calculation.
     */
    refresh() {
        if (!this._viewModel) {
            this._tree.setChildren(null, []);
            this._lastItem = undefined;
            this._lastItemIdContextKey.set([]);
            return;
        }
        const items = this._viewModel.getItems();
        this._lastItem = items.at(-1);
        this._lastItemIdContextKey.set(this._lastItem ? [this._lastItem.id] : []);
        const treeItems = items.map(item => ({
            element: item,
            collapsed: false,
            collapsible: false,
        }));
        const editing = this._viewModel.editing;
        this._withPersistedAutoScroll(() => {
            this._tree.setChildren(null, treeItems, {
                diffIdentityProvider: {
                    getId: (element) => {
                        // Pending types only have 'id', request/response have 'dataId'
                        const baseId = (isRequestVM(element) || isResponseVM(element)) ? element.dataId : element.id;
                        const disablement = (isRequestVM(element) || isResponseVM(element)) ? element.shouldBeRemovedOnSend : undefined;
                        // Per-element editing state: only re-render items whose editing role changed
                        const isEditTarget = isRequestVM(element) && editing?.id === element.id;
                        const isBlocked = (isRequestVM(element) || isResponseVM(element)) ? element.shouldBeBlocked.get() : false;
                        return baseId +
                            // If a response is in the process of progressive rendering, we need to ensure that it will
                            // be re-rendered so progressive rendering is restarted, even if the model wasn't updated.
                            `${isResponseVM(element) && element.renderData ? `_${this._visibleChangeCount}` : ''}` +
                            // Re-render once content references are loaded
                            (isResponseVM(element) ? `_${element.contentReferences.length}` : '') +
                            // Re-render if element becomes hidden due to undo/redo
                            `_${disablement ? `${disablement.afterUndoStop || '1'}` : '0'}` +
                            // Re-render the request being edited and requests whose blocked state changed
                            `_${isEditTarget ? 'edit' : ''}` +
                            `_${isBlocked ? 'blocked' : ''}` +
                            // Re-render requests when editing starts/stops (for hover button visibility, click handlers)
                            (isRequestVM(element) ? `_${editing ? '1' : '0'}` : '') +
                            // Re-render all if invoked by setting change
                            `_setting${this._settingChangeCounter}` +
                            // Rerender request if we got new content references in the response
                            // since this may change how we render the corresponding attachments in the request
                            (isRequestVM(element) && element.contentReferences ? `_${element.contentReferences?.length}` : '');
                    },
                }
            });
        });
    }
    /**
     * Set scroll lock state.
     */
    setScrollLock(value) {
        this._scrollLock = value;
        this.updateScrollDownButtonVisibility();
    }
    /**
     * Get scroll lock state.
     */
    get scrollLock() {
        return this._scrollLock;
    }
    /**
     * Set the visible change count (for diff identity).
     */
    setVisibleChangeCount(value) {
        this._visibleChangeCount = value;
    }
    /**
     * Scroll to reveal an element if editing.
     */
    scrollToCurrentItem(currentElement) {
        if (!this._viewModel?.editing || !currentElement) {
            return;
        }
        if (!this._tree.hasElement(currentElement)) {
            return;
        }
        const relativeTop = this._tree.getRelativeTop(currentElement);
        if (relativeTop === null || relativeTop < 0 || relativeTop > 1) {
            this._tree.reveal(currentElement, 0);
        }
    }
    //#endregion
    //#region Tree methods
    /**
     * Rerender the tree.
     */
    rerender() {
        this._tree.rerender();
    }
    getItems() {
        const items = [];
        const root = this._tree.getNode(null);
        for (const child of root.children) {
            if (child.element) {
                items.push(child.element);
            }
        }
        return items;
    }
    /**
     * Delegate scroll events from a mouse wheel event to the tree.
     */
    delegateScrollFromMouseWheelEvent(event) {
        this._tree.delegateScrollFromMouseWheelEvent(event);
    }
    /**
     * Whether the tree has a specific element.
     */
    hasElement(element) {
        return this._tree.hasElement(element);
    }
    /**
     * Update the height of an element.
     */
    _updateElementHeight(element, height) {
        if (this._tree.hasElement(element) && this._visible) {
            this._withPersistedAutoScroll(() => {
                this._tree.updateElementHeight(element, height);
            });
        }
    }
    /**
     * Scroll to reveal an element.
     */
    reveal(element, relativeTop) {
        this._tree.reveal(element, relativeTop);
    }
    /**
     * Get the focused elements.
     */
    getFocus() {
        return this._tree.getFocus().filter((e) => e !== null);
    }
    /**
     * Set the focused elements.
     */
    setFocus(elements) {
        this._tree.setFocus(elements);
    }
    focusItem(item) {
        if (!this.hasElement(item)) {
            return;
        }
        this._tree.setFocus([item]);
        this._tree.domFocus();
    }
    /**
     * Focus the last item in the list. Returns the index of the focused item.
     * @param useMostRecentlyFocusedIndex If true, use the mostRecentlyFocusedIndex if valid
     */
    focusLastItem(useMostRecentlyFocusedIndex) {
        const items = this.getItems();
        if (items.length === 0) {
            return -1;
        }
        let focusIndex;
        if (useMostRecentlyFocusedIndex && this._mostRecentlyFocusedItemIndex >= 0 && this._mostRecentlyFocusedItemIndex < items.length) {
            focusIndex = this._mostRecentlyFocusedItemIndex;
        }
        else {
            focusIndex = items.length - 1;
        }
        this._tree.setFocus([items[focusIndex]]);
        this._tree.domFocus();
        return focusIndex;
    }
    /**
     * Scroll the list to reveal the last item.
     */
    scrollToEnd() {
        if (this._lastItem) {
            const offset = Math.max(this._lastItem.currentRenderedHeight ?? 0, 1e6);
            if (this._tree.hasElement(this._lastItem)) {
                this._tree.reveal(this._lastItem, offset);
            }
        }
    }
    /**
     * Suppress auto-scroll behavior temporarily. While suppressed,
     * _withPersistedAutoScroll will not scroll to bottom after operations.
     */
    set suppressAutoScroll(value) {
        this._suppressAutoScroll = value;
    }
    _withPersistedAutoScroll(fn) {
        if (this._suppressAutoScroll) {
            fn();
            return;
        }
        const wasScrolledToBottom = this.isScrolledToBottom;
        fn();
        if (wasScrolledToBottom) {
            this.scrollToEnd();
        }
    }
    /**
     * Focus the list.
     */
    focus() {
        this._tree.domFocus();
    }
    /**
     * Get the DOM focus state.
     */
    isDOMFocused() {
        return this._tree.isDOMFocused();
    }
    //#endregion
    //#region Renderer methods
    /**
     * Get code block info for a response.
     */
    getCodeBlockInfosForResponse(response) {
        return this._renderer.getCodeBlockInfosForResponse(response);
    }
    /**
     * Get code block info by URI.
     */
    getCodeBlockInfoForEditor(uri) {
        return this._renderer.getCodeBlockInfoForEditor(uri);
    }
    /**
     * Get file tree info for a response.
     */
    getFileTreeInfosForResponse(response) {
        return this._renderer.getFileTreeInfosForResponse(response);
    }
    /**
     * Get the last focused file tree for a response.
     */
    getLastFocusedFileTreeForResponse(response) {
        return this._renderer.getLastFocusedFileTreeForResponse(response);
    }
    /**
     * Get editors currently in use.
     */
    editorsInUse() {
        return this._renderer.editorsInUse();
    }
    /**
     * Get template data for a request ID.
     */
    getTemplateDataForRequestId(requestId) {
        if (!requestId) {
            return undefined;
        }
        return this._renderer.getTemplateDataForRequestId(requestId);
    }
    /**
     * Update renderer options.
     */
    updateRendererOptions(options) {
        this._renderer.updateOptions(options);
    }
    /**
     * Set the visibility of the list.
     */
    setVisible(visible) {
        this._visible = visible;
        this._renderer.setVisible(visible);
    }
    /**
     * Layout the list.
     */
    layout(height, width) {
        this._bodyDimension = new dom.Dimension(width ?? this._container.clientWidth, height);
        this.updateLastItemMinHeight();
        this._tree.layout(height, width);
        this._renderer.layout(width ?? this._container.clientWidth);
    }
    updateLastItemMinHeight() {
        if (!this._bodyDimension) {
            return;
        }
        const contentHeight = this._bodyDimension.height;
        if (this._renderStyle === 'compact' || this._renderStyle === 'minimal') {
            this._container.style.removeProperty('--chat-current-response-min-height');
        }
        else {
            const secondToLastItem = this._viewModel?.getItems().at(-2);
            const maxRequestShownHeight = 200;
            const secondToLastItemHeight = Math.min((isRequestVM(secondToLastItem) || isResponseVM(secondToLastItem)) ?
                secondToLastItem.currentRenderedHeight ?? 150 : 150, maxRequestShownHeight);
            const lastItemMinHeight = Math.max(contentHeight - (secondToLastItemHeight + 10), 0);
            this._container.style.setProperty('--chat-current-response-min-height', lastItemMinHeight + 'px');
            if (lastItemMinHeight !== this._previousLastItemMinHeight) {
                this._previousLastItemMinHeight = lastItemMinHeight;
                const lastItem = this._viewModel?.getItems().at(-1);
                if (lastItem && this._visible && this._tree.hasElement(lastItem)) {
                    this._updateElementHeight(lastItem, undefined);
                }
            }
        }
    }
};
ChatListWidget = __decorate([
    __param(2, IInstantiationService),
    __param(3, IContextKeyService),
    __param(4, IChatService),
    __param(5, IContextMenuService),
    __param(6, ILogService),
    __param(7, IConfigurationService),
    __param(8, IChatAccessibilityService)
], ChatListWidget);
export { ChatListWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdExpc3RXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRMaXN0V2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFFMUQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRXpFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0scUNBQXFDLENBQUM7QUFFckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUduRixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDM0UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFlLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDMUcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDakcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDdEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDMUYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxhQUFhLEVBQUUseUJBQXlCLEVBQUUseUJBQXlCLEVBQUUsOEJBQThCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM1SyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUEwQyxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRS9GLE9BQU8sRUFBaUUsV0FBVyxFQUFFLFlBQVksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9JLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzFGLE9BQU8sRUFBZ0IseUJBQXlCLEVBQXVFLE1BQU0sWUFBWSxDQUFDO0FBRTFJLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxvQkFBb0IsRUFBZ0QsTUFBTSx1QkFBdUIsQ0FBQztBQUM3SCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUNyRCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQXFGeEU7Ozs7R0FJRztBQUNJLElBQU0sY0FBYyxHQUFwQixNQUFNLGNBQWUsU0FBUSxVQUFVO0lBb0I3Qzs7T0FFRztJQUNILElBQUksaUJBQWlCO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQztJQUN6QyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxJQUFJLGFBQWE7UUFDaEIsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQztJQUNyQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxJQUFJLFlBQVk7UUFDZixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDO0lBQ3BDLENBQUM7SUFFRDs7T0FFRztJQUNILElBQUksaUJBQWlCO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQztJQUN6QyxDQUFDO0lBMkJELFlBQVk7SUFFWixvQkFBb0I7SUFFcEIsSUFBSSxPQUFPO1FBQ1YsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDO0lBQ3hCLENBQUM7SUFFRCxJQUFJLFNBQVM7UUFDWixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDO0lBQzdCLENBQUM7SUFFRCxJQUFJLFNBQVMsQ0FBQyxLQUFhO1FBQzFCLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztJQUM5QixDQUFDO0lBRUQsSUFBSSxZQUFZO1FBQ2YsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQztJQUNoQyxDQUFDO0lBRUQsSUFBSSxZQUFZO1FBQ2YsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQztJQUNoQyxDQUFDO0lBRUQsSUFBSSxhQUFhO1FBQ2hCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUM7SUFDakMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsSUFBSSxrQkFBa0I7UUFDckIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksR0FBRyxDQUFDLENBQUM7SUFDdEYsQ0FBQztJQUVEOztPQUVHO0lBQ0gsSUFBSSxRQUFRO1FBQ1gsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDO0lBQ3ZCLENBQUM7SUFJRCxZQUFZO0lBRVosWUFDQyxTQUFzQixFQUN0QixPQUErQixFQUNSLG9CQUE0RCxFQUMvRCxpQkFBc0QsRUFDNUQsV0FBMEMsRUFDbkMsa0JBQXdELEVBQ2hFLFVBQXdDLEVBQzlCLG9CQUE0RCxFQUN4RCx3QkFBb0U7UUFFL0YsS0FBSyxFQUFFLENBQUM7UUFSZ0MseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUM5QyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBQzNDLGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ2xCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFDL0MsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUNiLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDdkMsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEyQjtRQTlIaEcsZ0JBQWdCO1FBRUMsaUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFlLENBQUMsQ0FBQztRQUNsRSxnQkFBVyxHQUF1QixJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztRQUVsRCw4QkFBeUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUN4RSw2QkFBd0IsR0FBZ0IsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQztRQUVyRSx3QkFBbUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFpQixDQUFDLENBQUM7UUFDM0UsdUJBQWtCLEdBQXlCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7UUFFbEUsZ0JBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUMxRCxlQUFVLEdBQWdCLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDO1FBRXpDLDJCQUFzQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQTZDLENBQUMsQ0FBQztRQUNuSCwrRUFBK0U7UUFDdEUsMEJBQXFCLEdBQXFELElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLENBQUM7UUFzQzdHLGFBQVEsR0FBRyxJQUFJLENBQUM7UUFFaEIsa0NBQTZCLEdBQVcsQ0FBQyxDQUFDLENBQUM7UUFDM0MsZ0JBQVcsR0FBWSxJQUFJLENBQUM7UUFDNUIsd0JBQW1CLEdBQVksS0FBSyxDQUFDO1FBQ3JDLDBCQUFxQixHQUFXLENBQUMsQ0FBQztRQUNsQyx3QkFBbUIsR0FBVyxDQUFDLENBQUM7UUFvb0JoQyxtQkFBYyxHQUF5QixJQUFJLENBQUM7UUFDNUMsK0JBQTBCLEdBQWtCLElBQUksQ0FBQztRQS9qQnhELElBQUksQ0FBQyxVQUFVLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztRQUNwQyxJQUFJLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUM7UUFDbEMsSUFBSSxDQUFDLDBCQUEwQixHQUFHLE9BQU8sQ0FBQyx5QkFBeUIsQ0FBQztRQUNwRSxJQUFJLENBQUMsbUJBQW1CLEdBQUcsT0FBTyxDQUFDLGtCQUFrQixDQUFDO1FBQ3RELElBQUksQ0FBQyxxQkFBcUIsR0FBRyxlQUFlLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUN2RixJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQztRQUU1QiwwR0FBMEc7UUFDMUcsTUFBTSwyQkFBMkIsR0FBRyxHQUFHLEVBQUU7WUFDeEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBUyxpQkFBaUIsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1lBQ2xHLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxtQ0FBbUMsRUFBRSxLQUFLLEtBQUssTUFBTSxDQUFDLENBQUM7UUFDekYsQ0FBQyxDQUFDO1FBQ0YsMkJBQTJCLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNyRSxJQUFJLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxpQkFBaUIsQ0FBQyxxQkFBcUIsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JFLDJCQUEyQixFQUFFLENBQUM7WUFDL0IsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLDBCQUEwQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FDdEYsSUFBSSxpQkFBaUIsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQ25FLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxZQUFZLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQztRQUV4QyxvQ0FBb0M7UUFDcEMsTUFBTSx3QkFBd0IsR0FBRyxPQUFPLENBQUMsc0JBQXNCLElBQUksUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNqRyxJQUFJLENBQUMsT0FBTyxDQUFDLHNCQUFzQixFQUFFLENBQUM7WUFDckMsd0JBQXdCLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUMxRixJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1lBQ2pELElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLHdCQUF3QixDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN2RSxDQUFDO1FBRUQscURBQXFEO1FBQ3JELE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxhQUFhLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQywwQkFBMEIsQ0FBQyxjQUFjLENBQ3RHLGlCQUFpQixFQUNqQixPQUFPLENBQUMsTUFBTSxFQUNkLFlBQVksRUFDWixPQUFPLENBQUMscUJBQXFCLElBQUksK0JBQStCLEVBQ2hFLE9BQU8sQ0FBQyxzQkFBc0IsSUFBSSxnQ0FBZ0MsQ0FDbEUsQ0FBQyxDQUFDO1FBRUgsa0JBQWtCO1FBQ2xCLE1BQU0sUUFBUSxHQUFHLDBCQUEwQixDQUFDLGNBQWMsQ0FDekQsZ0JBQWdCLEVBQ2hCLE9BQU8sQ0FBQyxvQkFBb0IsSUFBSSxHQUFHLENBQ25DLENBQUM7UUFFRiwyQkFBMkI7UUFDM0IsTUFBTSxnQkFBZ0IsR0FBMEI7WUFDL0MsYUFBYSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLG9CQUFvQjtZQUNsRSxXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7WUFDN0IsU0FBUyxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQzFCLGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQztTQUNwRSxDQUFDO1FBRUYsa0JBQWtCO1FBQ2xCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQywwQkFBMEIsQ0FBQyxjQUFjLENBQ3hFLG9CQUFvQixFQUNwQixhQUFhLEVBQ2IsT0FBTyxDQUFDLGVBQWUsSUFBSSxFQUFFLEVBQzdCLGdCQUFnQixFQUNoQix3QkFBd0IsRUFDeEIsSUFBSSxDQUFDLFVBQVUsQ0FDZixDQUFDLENBQUM7UUFFSCwwQkFBMEI7UUFDMUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFO1lBQ3ZELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUN2RCxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFL0MsaUZBQWlGO1lBQ2pGLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFVBQVUsRUFBRSxRQUFRLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1RCxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLGdCQUFnQixFQUFFLEVBQUUsRUFBRSxDQUFDO2dCQUMzQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUNoQyxDQUFDO1lBRUQsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosMERBQTBEO1FBQzFELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUM1RSxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDOUgsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDYixNQUFNLFdBQVcsR0FBNEI7b0JBQzVDLGtCQUFrQixFQUFFLElBQUk7b0JBQ3hCLE9BQU8sRUFBRSxPQUFPLENBQUMsT0FBTyxHQUFHLENBQUM7b0JBQzVCLFFBQVEsRUFBRSxJQUFJLENBQUMsU0FBUztvQkFDeEIsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLDBCQUEwQixFQUFFLEVBQUU7b0JBQ3hELFFBQVEsRUFBRSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsRUFBRTtpQkFDdEMsQ0FBQztnQkFDRixJQUFJLENBQUMsd0JBQXdCLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDL0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLHlCQUF5QixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEgsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixrRUFBa0U7UUFDbEUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxxQkFBcUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUNwRCwwQkFBMEIsQ0FBQyxjQUFjLENBQUMseUJBQXlCLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQzVHLENBQUM7UUFFRixjQUFjO1FBQ2QsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU0sSUFBSSxFQUFFLENBQUM7UUFDcEMsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLDBCQUEwQixDQUFDLGNBQWMsQ0FDcEUsQ0FBQSxtQkFBNkMsQ0FBQSxFQUM3QyxVQUFVLEVBQ1YsSUFBSSxDQUFDLFVBQVUsRUFDZixRQUFRLEVBQ1IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQ2hCO1lBQ0MsZ0JBQWdCLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFlLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7WUFDdEQsbUJBQW1CLEVBQUUsS0FBSztZQUMxQix1QkFBdUIsRUFBRSxLQUFLO1lBQzlCLHFCQUFxQixFQUFFLElBQUk7WUFDM0IsK0JBQStCLEVBQUUsSUFBSTtZQUNyQyxxQkFBcUIsRUFBRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHlCQUF5QixDQUFDO1lBQzFGLCtCQUErQixFQUFFO2dCQUNoQywwQkFBMEIsRUFBRSxDQUFDLENBQWUsRUFBRSxFQUFFLENBQy9DLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRTthQUNyRTtZQUNELGdCQUFnQixFQUFFLEtBQUs7WUFDdkIscUJBQXFCLEVBQUUsSUFBSTtZQUMzQixNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU07WUFDdEIsY0FBYyxFQUFFO2dCQUNmLG1CQUFtQixFQUFFLE1BQU0sQ0FBQyxjQUFjO2dCQUMxQywyQkFBMkIsRUFBRSxNQUFNLENBQUMsY0FBYztnQkFDbEQsNkJBQTZCLEVBQUUsTUFBTSxDQUFDLGNBQWM7Z0JBQ3BELCtCQUErQixFQUFFLE1BQU0sQ0FBQyxjQUFjO2dCQUN0RCwrQkFBK0IsRUFBRSxNQUFNLENBQUMsY0FBYztnQkFDdEQsbUJBQW1CLEVBQUUsTUFBTSxDQUFDLGNBQWM7Z0JBQzFDLGNBQWMsRUFBRSxNQUFNLENBQUMsY0FBYztnQkFDckMsbUJBQW1CLEVBQUUsTUFBTSxDQUFDLGNBQWM7Z0JBQzFDLG1CQUFtQixFQUFFLE1BQU0sQ0FBQyxjQUFjO2dCQUMxQywyQkFBMkIsRUFBRSxNQUFNLENBQUMsY0FBYztnQkFDbEQsK0JBQStCLEVBQUUsTUFBTSxDQUFDLGNBQWM7Z0JBQ3RELDZCQUE2QixFQUFFLE1BQU0sQ0FBQyxjQUFjO2dCQUNwRCwrQkFBK0IsRUFBRSxNQUFNLENBQUMsY0FBYztnQkFDdEQsaUNBQWlDLEVBQUUsU0FBUztnQkFDNUMsbUNBQW1DLEVBQUUsU0FBUzthQUM5QztTQUNELENBQ0QsQ0FBQyxDQUFDO1FBRUgsNEJBQTRCO1FBQzVCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUU7WUFDbkUsZ0JBQWdCLEVBQUUsYUFBYSxDQUFDLHlCQUF5QixDQUFDO1lBQzFELGdCQUFnQixFQUFFLGFBQWEsQ0FBQyx5QkFBeUIsQ0FBQztZQUMxRCxxQkFBcUIsRUFBRSxhQUFhLENBQUMsOEJBQThCLENBQUM7WUFDcEUseUJBQXlCLEVBQUUsU0FBUztZQUNwQyx5QkFBeUIsRUFBRSxTQUFTO1lBQ3BDLDhCQUE4QixFQUFFLFNBQVM7WUFDekMsZUFBZSxFQUFFLFNBQVM7WUFDMUIsWUFBWSxFQUFFLElBQUk7U0FDbEIsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxHQUFHLEtBQUssT0FBTyxDQUFDLFdBQVcsQ0FBQyxFQUFFLEdBQUcsQ0FBQztRQUM5RCxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLENBQUMsb0JBQW9CO1FBRTNFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFDckQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6QixJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDcEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLHNCQUFzQjtRQUV0QixtRkFBbUY7UUFDbkYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLHdCQUF3QixDQUFDLEdBQUcsRUFBRTtZQUN2RCxJQUFJLENBQUMseUJBQXlCLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDdkMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ3pDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDekIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLHdFQUF3RTtRQUN4RSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFO1lBQy9DLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNoQyxJQUFJLE9BQU8sSUFBSSxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNuQyxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQy9CLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDOUIsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxXQUFXLENBQUMsQ0FBQztnQkFDcEQsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDaEIsSUFBSSxDQUFDLDZCQUE2QixHQUFHLEdBQUcsQ0FBQztnQkFDMUMsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUoseUVBQXlFO1FBQ3pFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtZQUMzQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxQixJQUFJLENBQUMsZ0NBQWdDLEVBQUUsQ0FBQztRQUN6QyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosaUNBQWlDO1FBQ2pDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDM0MsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQ3ZFLElBQUksQ0FBQyxDQUFDLG9CQUFvQixDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxpQkFBaUIsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUM7Z0JBQzVILElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO2dCQUM3QixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDaEIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsaUNBQWlDO0lBRWpDOztPQUVHO0lBQ0ssZ0NBQWdDO1FBQ3ZDLE1BQU0sSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLGtCQUFrQixJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQztRQUMzRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUNuRSxDQUFDO0lBRUQ7O09BRUc7SUFDSyxpQkFBaUIsQ0FBQyxDQUE2QztRQUN0RSxDQUFDLENBQUMsWUFBWSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ2hDLENBQUMsQ0FBQyxZQUFZLENBQUMsZUFBZSxFQUFFLENBQUM7UUFFakMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUUzQiwwREFBMEQ7UUFDMUQsTUFBTSxNQUFNLEdBQUcsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFxQixDQUFDO1FBQ3BELE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSx1QkFBdUIsRUFBRSxDQUFDLEtBQUssSUFBSSxDQUFDO1FBRTlFLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQztZQUNwRSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN4RCxDQUFDLGVBQWUsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsWUFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLGtCQUFrQixDQUFDO1lBQy9HLENBQUMsZUFBZSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxjQUFjLENBQUM7U0FDeEQsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQztZQUN2QyxNQUFNLEVBQUUsTUFBTSxDQUFDLFdBQVc7WUFDMUIsaUJBQWlCLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUU7WUFDOUMsaUJBQWlCLEVBQUUsdUJBQXVCO1lBQzFDLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTTtZQUN6QixpQkFBaUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxRQUFRO1NBQ2pDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxZQUFZO0lBRVosMkJBQTJCO0lBRTNCOztPQUVHO0lBQ0gsWUFBWSxDQUFDLFNBQXFDO1FBQ2pELElBQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDO1FBQzVCLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFRDs7O09BR0c7SUFDSCxPQUFPO1FBQ04sSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDakMsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7WUFDM0IsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNuQyxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDekMsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUIsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRTFFLE1BQU0sU0FBUyxHQUFpQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNsRSxPQUFPLEVBQUUsSUFBSTtZQUNiLFNBQVMsRUFBRSxLQUFLO1lBQ2hCLFdBQVcsRUFBRSxLQUFLO1NBQ2xCLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUM7UUFFeEMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEdBQUcsRUFBRTtZQUNsQyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFO2dCQUN2QyxvQkFBb0IsRUFBRTtvQkFDckIsS0FBSyxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUU7d0JBQ2xCLCtEQUErRDt3QkFDL0QsTUFBTSxNQUFNLEdBQUcsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7d0JBQzdGLE1BQU0sV0FBVyxHQUFHLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQzt3QkFDaEgsNkVBQTZFO3dCQUM3RSxNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksT0FBTyxFQUFFLEVBQUUsS0FBSyxPQUFPLENBQUMsRUFBRSxDQUFDO3dCQUN4RSxNQUFNLFNBQVMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsSUFBSSxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO3dCQUMxRyxPQUFPLE1BQU07NEJBQ1osMkZBQTJGOzRCQUMzRiwwRkFBMEY7NEJBQzFGLEdBQUcsWUFBWSxDQUFDLE9BQU8sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTs0QkFDdEYsK0NBQStDOzRCQUMvQyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxPQUFPLENBQUMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzs0QkFDckUsdURBQXVEOzRCQUN2RCxJQUFJLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxXQUFXLENBQUMsYUFBYSxJQUFJLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUU7NEJBQy9ELDhFQUE4RTs0QkFDOUUsSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFOzRCQUNoQyxJQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7NEJBQ2hDLDZGQUE2Rjs0QkFDN0YsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7NEJBQ3ZELDZDQUE2Qzs0QkFDN0MsV0FBVyxJQUFJLENBQUMscUJBQXFCLEVBQUU7NEJBQ3ZDLG9FQUFvRTs0QkFDcEUsbUZBQW1GOzRCQUNuRixDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsSUFBSSxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDLGlCQUFpQixFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDckcsQ0FBQztpQkFDRDthQUNELENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVEOztPQUVHO0lBQ0gsYUFBYSxDQUFDLEtBQWM7UUFDM0IsSUFBSSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7UUFDekIsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLENBQUM7SUFDekMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsSUFBSSxVQUFVO1FBQ2IsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7T0FFRztJQUNILHFCQUFxQixDQUFDLEtBQWE7UUFDbEMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLEtBQUssQ0FBQztJQUNsQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxtQkFBbUIsQ0FBQyxjQUFxQztRQUN4RCxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxPQUFPLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNsRCxPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1lBQzVDLE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDOUQsSUFBSSxXQUFXLEtBQUssSUFBSSxJQUFJLFdBQVcsR0FBRyxDQUFDLElBQUksV0FBVyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2hFLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0QyxDQUFDO0lBQ0YsQ0FBQztJQUVELFlBQVk7SUFFWixzQkFBc0I7SUFFdEI7O09BRUc7SUFDSCxRQUFRO1FBQ1AsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBRU8sUUFBUTtRQUNmLE1BQU0sS0FBSyxHQUFtQixFQUFFLENBQUM7UUFDakMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEMsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbkMsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ25CLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzNCLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBR0Q7O09BRUc7SUFDSCxpQ0FBaUMsQ0FBQyxLQUF1QjtRQUN4RCxJQUFJLENBQUMsS0FBSyxDQUFDLGlDQUFpQyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFRDs7T0FFRztJQUNILFVBQVUsQ0FBQyxPQUFxQjtRQUMvQixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRDs7T0FFRztJQUNLLG9CQUFvQixDQUFDLE9BQXFCLEVBQUUsTUFBZTtRQUNsRSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNyRCxJQUFJLENBQUMsd0JBQXdCLENBQUMsR0FBRyxFQUFFO2dCQUNsQyxJQUFJLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNqRCxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7SUFDRixDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsT0FBcUIsRUFBRSxXQUFvQjtRQUNqRCxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsUUFBUTtRQUNQLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQXFCLEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7SUFDM0UsQ0FBQztJQUVEOztPQUVHO0lBQ0gsUUFBUSxDQUFDLFFBQXdCO1FBQ2hDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFRCxTQUFTLENBQUMsSUFBa0I7UUFDM0IsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUM1QixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM1QixJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFRDs7O09BR0c7SUFDSCxhQUFhLENBQUMsMkJBQXFDO1FBQ2xELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUM5QixJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDeEIsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNYLENBQUM7UUFFRCxJQUFJLFVBQWtCLENBQUM7UUFDdkIsSUFBSSwyQkFBMkIsSUFBSSxJQUFJLENBQUMsNkJBQTZCLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyw2QkFBNkIsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDakksVUFBVSxHQUFHLElBQUksQ0FBQyw2QkFBNkIsQ0FBQztRQUNqRCxDQUFDO2FBQU0sQ0FBQztZQUNQLFVBQVUsR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUMvQixDQUFDO1FBRUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDdEIsT0FBTyxVQUFVLENBQUM7SUFDbkIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsV0FBVztRQUNWLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3BCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxxQkFBcUIsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDeEUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztnQkFDM0MsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUMzQyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRDs7O09BR0c7SUFDSCxJQUFJLGtCQUFrQixDQUFDLEtBQWM7UUFDcEMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLEtBQUssQ0FBQztJQUNsQyxDQUFDO0lBRU8sd0JBQXdCLENBQUMsRUFBYztRQUM5QyxJQUFJLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQzlCLEVBQUUsRUFBRSxDQUFDO1lBQ0wsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQztRQUNwRCxFQUFFLEVBQUUsQ0FBQztRQUNMLElBQUksbUJBQW1CLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDcEIsQ0FBQztJQUNGLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUs7UUFDSixJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFRDs7T0FFRztJQUNILFlBQVk7UUFDWCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUM7SUFDbEMsQ0FBQztJQUVELFlBQVk7SUFFWiwwQkFBMEI7SUFFMUI7O09BRUc7SUFDSCw0QkFBNEIsQ0FBQyxRQUFnQztRQUM1RCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsNEJBQTRCLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUVEOztPQUVHO0lBQ0gseUJBQXlCLENBQUMsR0FBUTtRQUNqQyxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMseUJBQXlCLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsMkJBQTJCLENBQUMsUUFBZ0M7UUFDM0QsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLDJCQUEyQixDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFFRDs7T0FFRztJQUNILGlDQUFpQyxDQUFDLFFBQWdDO1FBQ2pFLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxpQ0FBaUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBRUQ7O09BRUc7SUFDSCxZQUFZO1FBQ1gsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksRUFBRSxDQUFDO0lBQ3RDLENBQUM7SUFJRDs7T0FFRztJQUNILDJCQUEyQixDQUFDLFNBQTZCO1FBQ3hELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLDJCQUEyQixDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFRDs7T0FFRztJQUNILHFCQUFxQixDQUFDLE9BQXFDO1FBQzFELElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRDs7T0FFRztJQUNILFVBQVUsQ0FBQyxPQUFnQjtRQUMxQixJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQztRQUN4QixJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsTUFBYyxFQUFFLEtBQWE7UUFDbkMsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3RGLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQy9CLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBS08sdUJBQXVCO1FBQzlCLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDMUIsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQztRQUNqRCxJQUFJLElBQUksQ0FBQyxZQUFZLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQyxZQUFZLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDeEUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7UUFDNUUsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDNUQsTUFBTSxxQkFBcUIsR0FBRyxHQUFHLENBQUM7WUFDbEMsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUN0QyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbEUsZ0JBQWdCLENBQUMscUJBQXFCLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQ3BELHFCQUFxQixDQUFDLENBQUM7WUFDeEIsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGFBQWEsR0FBRyxDQUFDLHNCQUFzQixHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JGLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsRUFBRSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUNsRyxJQUFJLGlCQUFpQixLQUFLLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO2dCQUMzRCxJQUFJLENBQUMsMEJBQTBCLEdBQUcsaUJBQWlCLENBQUM7Z0JBQ3BELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BELElBQUksUUFBUSxJQUFJLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztvQkFDbEUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDaEQsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztDQUlELENBQUE7QUFsdUJZLGNBQWM7SUEwSHhCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxXQUFXLENBQUE7SUFDWCxXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEseUJBQXlCLENBQUE7R0FoSWYsY0FBYyxDQWt1QjFCIn0=