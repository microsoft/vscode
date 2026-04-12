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
import { Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { Disposable, dispose } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITerminalChatService, ITerminalConfigurationService, ITerminalGroupService, ITerminalService } from './terminal.js';
import { TerminalTabList } from './terminalTabsList.js';
import * as dom from '../../../../base/browser/dom.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { localize } from '../../../../nls.js';
import { openContextMenu } from './terminalContextMenu.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { getInstanceHoverInfo } from './terminalTooltip.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { TerminalTabsChatEntry } from './terminalTabsChatEntry.js';
import { containsDragType } from '../../../../platform/dnd/browser/dnd.js';
import { getTerminalResourcesFromDragEvent, parseTerminalUri } from './terminalUri.js';
const $ = dom.$;
var CssClass;
(function (CssClass) {
    CssClass["ViewIsVertical"] = "terminal-side-view";
})(CssClass || (CssClass = {}));
var WidthConstants;
(function (WidthConstants) {
    WidthConstants[WidthConstants["StatusIcon"] = 30] = "StatusIcon";
    WidthConstants[WidthConstants["SplitAnnotation"] = 30] = "SplitAnnotation";
})(WidthConstants || (WidthConstants = {}));
let TerminalTabbedView = class TerminalTabbedView extends Disposable {
    constructor(parentElement, _terminalService, _terminalChatService, _terminalConfigurationService, _terminalGroupService, _instantiationService, _contextMenuService, _configurationService, menuService, _storageService, contextKeyService, _hoverService) {
        super();
        this._terminalService = _terminalService;
        this._terminalChatService = _terminalChatService;
        this._terminalConfigurationService = _terminalConfigurationService;
        this._terminalGroupService = _terminalGroupService;
        this._instantiationService = _instantiationService;
        this._contextMenuService = _contextMenuService;
        this._configurationService = _configurationService;
        this._storageService = _storageService;
        this._hoverService = _hoverService;
        this._cancelContextMenu = false;
        this._emptyAreaDropTargetCount = 0;
        this._tabContainer = $('.tabs-container');
        const tabListContainer = $('.tabs-list-container');
        this._tabListContainer = tabListContainer;
        this._tabListElement = $('.tabs-list');
        tabListContainer.appendChild(this._tabListElement);
        this._tabContainer.appendChild(tabListContainer);
        this._instanceMenu = this._register(menuService.createMenu(MenuId.TerminalInstanceContext, contextKeyService));
        this._tabsListMenu = this._register(menuService.createMenu(MenuId.TerminalTabContext, contextKeyService));
        this._tabsListEmptyMenu = this._register(menuService.createMenu(MenuId.TerminalTabEmptyAreaContext, contextKeyService));
        this._tabList = this._register(this._instantiationService.createInstance(TerminalTabList, this._tabListElement));
        this._tabListDomElement = this._tabList.getHTMLElement();
        this._chatEntry = this._register(this._instantiationService.createInstance(TerminalTabsChatEntry, tabListContainer, this._tabContainer));
        const terminalOuterContainer = $('.terminal-outer-container');
        this._terminalContainer = $('.terminal-groups-container');
        terminalOuterContainer.appendChild(this._terminalContainer);
        this._terminalService.setContainers(parentElement, this._terminalContainer);
        this._terminalIsTabsNarrowContextKey = TerminalContextKeys.tabsNarrow.bindTo(contextKeyService);
        this._terminalTabsFocusContextKey = TerminalContextKeys.tabsFocus.bindTo(contextKeyService);
        this._terminalTabsMouseContextKey = TerminalContextKeys.tabsMouse.bindTo(contextKeyService);
        this._tabTreeIndex = this._terminalConfigurationService.config.tabs.location === 'left' ? 0 : 1;
        this._terminalContainerIndex = this._terminalConfigurationService.config.tabs.location === 'left' ? 1 : 0;
        this._register(_configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("terminal.integrated.tabs.enabled" /* TerminalSettingId.TabsEnabled */) ||
                e.affectsConfiguration("terminal.integrated.tabs.hideCondition" /* TerminalSettingId.TabsHideCondition */)) {
                this._refreshShowTabs();
            }
            else if (e.affectsConfiguration("terminal.integrated.tabs.location" /* TerminalSettingId.TabsLocation */)) {
                this._tabTreeIndex = this._terminalConfigurationService.config.tabs.location === 'left' ? 0 : 1;
                this._terminalContainerIndex = this._terminalConfigurationService.config.tabs.location === 'left' ? 1 : 0;
                if (this._shouldShowTabs()) {
                    this._splitView.swapViews(0, 1);
                    this._removeSashListener();
                    this._addSashListener();
                    this._splitView.resizeView(this._tabTreeIndex, this._getLastListWidth());
                }
            }
        }));
        this._register(Event.any(this._terminalGroupService.onDidChangeInstances, this._terminalGroupService.onDidChangeGroups)(() => {
            this._refreshShowTabs();
            this._updateChatTerminalsEntry();
        }));
        this._register(Event.any(this._terminalChatService.onDidRegisterTerminalInstanceWithToolSession, this._terminalService.onDidChangeInstances, this._terminalService.onDidDisposeInstance)(() => {
            this._refreshShowTabs();
            this._updateChatTerminalsEntry();
        }));
        this._register(contextKeyService.onDidChangeContext(e => {
            if (e.affectsSome(new Set(["hasHiddenChatTerminals" /* TerminalContribContextKeyStrings.ChatHasHiddenTerminals */]))) {
                this._refreshShowTabs();
                this._updateChatTerminalsEntry();
            }
        }));
        this._attachEventListeners(parentElement, this._terminalContainer);
        this._register(this._terminalGroupService.onDidChangePanelOrientation((orientation) => {
            this._panelOrientation = orientation;
            if (this._panelOrientation === 0 /* Orientation.VERTICAL */) {
                this._terminalContainer.classList.add("terminal-side-view" /* CssClass.ViewIsVertical */);
            }
            else {
                this._terminalContainer.classList.remove("terminal-side-view" /* CssClass.ViewIsVertical */);
            }
        }));
        this._splitView = new SplitView(parentElement, { orientation: 1 /* Orientation.HORIZONTAL */, proportionalLayout: false });
        this._setupSplitView(terminalOuterContainer);
        this._updateChatTerminalsEntry();
    }
    _shouldShowTabs() {
        const enabled = this._terminalConfigurationService.config.tabs.enabled;
        const hide = this._terminalConfigurationService.config.tabs.hideCondition;
        const hiddenChatTerminals = this._terminalChatService.getToolSessionTerminalInstances(true);
        if (!enabled) {
            return false;
        }
        if (hiddenChatTerminals.length > 0) {
            return true;
        }
        switch (hide) {
            case 'never':
                return true;
            case 'singleTerminal':
                if (this._terminalGroupService.instances.length > 1) {
                    return true;
                }
                break;
            case 'singleGroup':
                if (this._terminalGroupService.groups.length > 1) {
                    return true;
                }
                break;
        }
        return false;
    }
    _refreshShowTabs() {
        if (this._shouldShowTabs()) {
            if (this._splitView.length === 1) {
                this._addTabTree();
                this._addSashListener();
                this._splitView.resizeView(this._tabTreeIndex, this._getLastListWidth());
                this.rerenderTabs();
            }
        }
        else {
            if (this._splitView.length === 2 && !this._terminalTabsMouseContextKey.get()) {
                this._splitView.removeView(this._tabTreeIndex);
                this._plusButton?.remove();
                this._removeSashListener();
            }
        }
    }
    _updateChatTerminalsEntry() {
        this._chatEntry?.update();
    }
    _getLastListWidth() {
        const widthKey = this._panelOrientation === 0 /* Orientation.VERTICAL */ ? "tabs-list-width-vertical" /* TerminalStorageKeys.TabsListWidthVertical */ : "tabs-list-width-horizontal" /* TerminalStorageKeys.TabsListWidthHorizontal */;
        const storedValue = this._storageService.get(widthKey, 0 /* StorageScope.PROFILE */);
        if (!storedValue || !parseInt(storedValue)) {
            // we want to use the min width by default for the vertical orientation bc
            // there is such a limited width for the terminal panel to begin w there.
            return this._panelOrientation === 0 /* Orientation.VERTICAL */ ? 46 /* TerminalTabsListSizes.NarrowViewWidth */ : 120 /* TerminalTabsListSizes.DefaultWidth */;
        }
        return parseInt(storedValue);
    }
    _handleOnDidSashReset() {
        // Calculate ideal size of list to display all text based on its contents
        let idealWidth = 80 /* TerminalTabsListSizes.WideViewMinimumWidth */;
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = 1;
        offscreenCanvas.height = 1;
        const ctx = offscreenCanvas.getContext('2d');
        if (ctx) {
            const style = dom.getWindow(this._tabListElement).getComputedStyle(this._tabListElement);
            ctx.font = `${style.fontStyle} ${style.fontSize} ${style.fontFamily}`;
            const maxInstanceWidth = this._terminalGroupService.instances.reduce((p, c) => {
                return Math.max(p, ctx.measureText(c.title + (c.description || '')).width + this._getAdditionalWidth(c));
            }, 0);
            idealWidth = Math.ceil(Math.max(maxInstanceWidth, 80 /* TerminalTabsListSizes.WideViewMinimumWidth */));
        }
        // If the size is already ideal, toggle to collapsed
        const currentWidth = Math.ceil(this._splitView.getViewSize(this._tabTreeIndex));
        if (currentWidth === idealWidth) {
            idealWidth = 46 /* TerminalTabsListSizes.NarrowViewWidth */;
        }
        this._splitView.resizeView(this._tabTreeIndex, idealWidth);
        this._updateListWidth(idealWidth);
    }
    _getAdditionalWidth(instance) {
        // Size to include padding, icon, status icon (if any), split annotation (if any), + a little more
        const additionalWidth = 40;
        const statusIconWidth = instance.statusList.statuses.length > 0 ? 30 /* WidthConstants.StatusIcon */ : 0;
        const splitAnnotationWidth = (this._terminalGroupService.getGroupForInstance(instance)?.terminalInstances.length || 0) > 1 ? 30 /* WidthConstants.SplitAnnotation */ : 0;
        return additionalWidth + splitAnnotationWidth + statusIconWidth;
    }
    _handleOnDidSashChange() {
        const listWidth = this._splitView.getViewSize(this._tabTreeIndex);
        if (!this._width || listWidth <= 0) {
            return;
        }
        this._updateListWidth(listWidth);
    }
    _updateListWidth(width) {
        if (width < 63 /* TerminalTabsListSizes.MidpointViewWidth */ && width >= 46 /* TerminalTabsListSizes.NarrowViewWidth */) {
            width = 46 /* TerminalTabsListSizes.NarrowViewWidth */;
            this._splitView.resizeView(this._tabTreeIndex, width);
        }
        else if (width >= 63 /* TerminalTabsListSizes.MidpointViewWidth */ && width < 80 /* TerminalTabsListSizes.WideViewMinimumWidth */) {
            width = 80 /* TerminalTabsListSizes.WideViewMinimumWidth */;
            this._splitView.resizeView(this._tabTreeIndex, width);
        }
        this.rerenderTabs();
        const widthKey = this._panelOrientation === 0 /* Orientation.VERTICAL */ ? "tabs-list-width-vertical" /* TerminalStorageKeys.TabsListWidthVertical */ : "tabs-list-width-horizontal" /* TerminalStorageKeys.TabsListWidthHorizontal */;
        this._storageService.store(widthKey, width, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
    _setupSplitView(terminalOuterContainer) {
        this._register(this._splitView.onDidSashReset(() => this._handleOnDidSashReset()));
        this._register(this._splitView.onDidSashChange(() => this._handleOnDidSashChange()));
        if (this._shouldShowTabs()) {
            this._addTabTree();
        }
        this._splitView.addView({
            element: terminalOuterContainer,
            layout: width => this._terminalGroupService.groups.forEach(tab => tab.layout(width, this._height || 0)),
            minimumSize: 120,
            maximumSize: Number.POSITIVE_INFINITY,
            onDidChange: () => Disposable.None,
            priority: 2 /* LayoutPriority.High */
        }, Sizing.Distribute, this._terminalContainerIndex);
        if (this._shouldShowTabs()) {
            this._addSashListener();
        }
    }
    _addTabTree() {
        this._splitView.addView({
            element: this._tabContainer,
            layout: width => this._tabList.layout(this._height || 0, width),
            minimumSize: 46 /* TerminalTabsListSizes.NarrowViewWidth */,
            maximumSize: 500 /* TerminalTabsListSizes.MaximumWidth */,
            onDidChange: () => Disposable.None,
            priority: 1 /* LayoutPriority.Low */
        }, Sizing.Distribute, this._tabTreeIndex);
        this.rerenderTabs();
    }
    rerenderTabs() {
        this._updateHasText();
        this._tabList.refresh();
    }
    _addSashListener() {
        let interval;
        this._sashDisposables = [
            this._splitView.sashes[0].onDidStart(e => {
                interval = dom.disposableWindowInterval(dom.getWindow(this._splitView.el), () => {
                    this.rerenderTabs();
                }, 100);
            }),
            this._splitView.sashes[0].onDidEnd(e => {
                interval.dispose();
            })
        ];
    }
    _removeSashListener() {
        if (this._sashDisposables) {
            dispose(this._sashDisposables);
            this._sashDisposables = undefined;
        }
    }
    _updateHasText() {
        const hasText = this._tabListElement.clientWidth > 63 /* TerminalTabsListSizes.MidpointViewWidth */;
        this._tabContainer.classList.toggle('has-text', hasText);
        this._terminalIsTabsNarrowContextKey.set(!hasText);
        this._updateChatTerminalsEntry();
    }
    layout(width, height) {
        const chatItemHeight = this._chatEntry?.element.style.display === 'none' ? 0 : this._chatEntry?.element.clientHeight;
        this._height = height - (chatItemHeight ?? 0);
        this._width = width;
        this._splitView.layout(width);
        if (this._shouldShowTabs()) {
            this._splitView.resizeView(this._tabTreeIndex, this._getLastListWidth());
        }
        this._updateHasText();
    }
    _attachEventListeners(parentDomElement, terminalContainer) {
        this._register(dom.addDisposableListener(this._tabContainer, 'mouseleave', async (event) => {
            this._terminalTabsMouseContextKey.set(false);
            this._refreshShowTabs();
            event.stopPropagation();
        }));
        this._register(dom.addDisposableListener(this._tabContainer, 'mouseenter', async (event) => {
            this._terminalTabsMouseContextKey.set(true);
            event.stopPropagation();
        }));
        this._register(dom.addDisposableListener(this._tabContainer, 'dragenter', (event) => {
            if (!this._shouldHandleEmptyAreaDrop(event)) {
                this._resetEmptyAreaDropState();
                return;
            }
            this._emptyAreaDropTargetCount++;
            this._setEmptyAreaDropState(true);
        }));
        this._register(dom.addDisposableListener(this._tabContainer, 'dragover', (event) => {
            if (!this._shouldHandleEmptyAreaDrop(event)) {
                this._resetEmptyAreaDropState();
                return;
            }
            event.preventDefault();
            this._setEmptyAreaDropState(true);
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }
        }));
        this._register(dom.addDisposableListener(this._tabContainer, 'dragleave', (event) => {
            if (!this._shouldHandleEmptyAreaDrop(event)) {
                if (!this._tabContainer.contains(event.relatedTarget)) {
                    this._resetEmptyAreaDropState();
                }
                return;
            }
            if (this._tabContainer.contains(event.relatedTarget)) {
                return;
            }
            this._emptyAreaDropTargetCount = Math.max(0, this._emptyAreaDropTargetCount - 1);
            if (this._emptyAreaDropTargetCount === 0) {
                this._resetEmptyAreaDropState();
            }
        }));
        this._register(dom.addDisposableListener(this._tabContainer, 'drop', (event) => {
            if (!this._shouldHandleEmptyAreaDrop(event)) {
                return;
            }
            void this._handleContainerDrop(event);
        }));
        this._register(dom.addDisposableListener(terminalContainer, 'mousedown', async (event) => {
            const terminal = this._terminalGroupService.activeInstance;
            if (this._terminalGroupService.instances.length > 0 && terminal) {
                const result = await terminal.handleMouseEvent(event, this._instanceMenu);
                if (typeof result === 'object' && result.cancelContextMenu) {
                    this._cancelContextMenu = true;
                }
            }
        }));
        this._register(dom.addDisposableListener(terminalContainer, 'contextmenu', (event) => {
            const rightClickBehavior = this._terminalConfigurationService.config.rightClickBehavior;
            if (rightClickBehavior === 'nothing' && !event.shiftKey) {
                this._cancelContextMenu = true;
            }
            terminalContainer.focus();
            if (!this._cancelContextMenu) {
                openContextMenu(dom.getWindow(terminalContainer), event, this._terminalGroupService.activeInstance, this._instanceMenu, this._contextMenuService);
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            this._cancelContextMenu = false;
        }));
        this._register(dom.addDisposableListener(this._tabContainer, 'contextmenu', (event) => {
            const rightClickBehavior = this._terminalConfigurationService.config.rightClickBehavior;
            if (rightClickBehavior === 'nothing' && !event.shiftKey) {
                this._cancelContextMenu = true;
            }
            if (!this._cancelContextMenu) {
                const emptyList = this._tabList.getFocus().length === 0;
                if (!emptyList) {
                    this._terminalGroupService.lastAccessedMenu = 'tab-list';
                }
                // Put the focused item first as it's used as the first positional argument
                const selectedInstances = this._tabList.getSelectedElements();
                const focusedInstance = this._tabList.getFocusedElements()?.[0];
                if (focusedInstance) {
                    selectedInstances.splice(selectedInstances.findIndex(e => e.instanceId === focusedInstance.instanceId), 1);
                    selectedInstances.unshift(focusedInstance);
                }
                openContextMenu(dom.getWindow(this._tabContainer), event, selectedInstances, emptyList ? this._tabsListEmptyMenu : this._tabsListMenu, this._contextMenuService, emptyList ? this._getTabActions() : undefined);
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            this._cancelContextMenu = false;
        }));
        this._register(dom.addDisposableListener(terminalContainer.ownerDocument, 'keydown', (event) => {
            terminalContainer.classList.toggle('alt-active', !!event.altKey);
        }));
        this._register(dom.addDisposableListener(terminalContainer.ownerDocument, 'keyup', (event) => {
            terminalContainer.classList.toggle('alt-active', !!event.altKey);
        }));
        this._register(dom.addDisposableListener(parentDomElement, 'keyup', (event) => {
            if (event.keyCode === 27) {
                // Keep terminal open on escape
                event.stopPropagation();
            }
        }));
        this._register(dom.addDisposableListener(this._tabContainer, dom.EventType.FOCUS_IN, () => {
            this._terminalTabsFocusContextKey.set(true);
        }));
        this._register(dom.addDisposableListener(this._tabContainer, dom.EventType.FOCUS_OUT, () => {
            this._terminalTabsFocusContextKey.set(false);
        }));
    }
    _shouldHandleEmptyAreaDrop(event) {
        const targetNode = event.target;
        if (targetNode && (this._tabListDomElement.contains(targetNode) || this._tabListElement.contains(targetNode))) {
            return false;
        }
        return !!event.dataTransfer && containsDragType(event, "Terminals" /* TerminalDataTransfers.Terminals */);
    }
    _setEmptyAreaDropState(active) {
        this._tabListContainer.classList.toggle('drop-target', active);
        this._tabContainer.classList.toggle('drop-target', active);
        this._chatEntry?.element.classList.toggle('drop-target', active);
    }
    _resetEmptyAreaDropState() {
        this._emptyAreaDropTargetCount = 0;
        this._setEmptyAreaDropState(false);
    }
    async _handleContainerDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        this._resetEmptyAreaDropState();
        const primaryBackend = this._terminalService.getPrimaryBackend();
        const resources = getTerminalResourcesFromDragEvent(event);
        let sourceInstances;
        const promises = [];
        if (resources) {
            for (const uri of resources) {
                const instance = this._terminalService.getInstanceFromResource(uri);
                if (instance) {
                    if (sourceInstances) {
                        sourceInstances.push(instance);
                    }
                    else {
                        sourceInstances = [instance];
                    }
                    this._terminalService.moveToTerminalView(instance);
                }
                else if (primaryBackend) {
                    const terminalIdentifier = parseTerminalUri(uri);
                    if (terminalIdentifier.instanceId) {
                        promises.push(primaryBackend.requestDetachInstance(terminalIdentifier.workspaceId, terminalIdentifier.instanceId));
                    }
                }
            }
        }
        if (promises.length) {
            const processes = (await Promise.all(promises)).filter((process) => !!process);
            let lastInstance;
            for (const attachPersistentProcess of processes) {
                lastInstance = await this._terminalService.createTerminal({ config: { attachPersistentProcess } });
            }
            if (lastInstance) {
                this._terminalService.setActiveInstance(lastInstance);
            }
            return;
        }
        if (!sourceInstances || !sourceInstances.length) {
            sourceInstances = this._tabList.getSelectedElements();
            if (!sourceInstances.length) {
                return;
            }
        }
        this._terminalGroupService.moveGroupToEnd(sourceInstances);
        this._terminalService.setActiveInstance(sourceInstances[0]);
        const indexes = sourceInstances
            .map(instance => this._terminalGroupService.instances.indexOf(instance))
            .filter(index => index >= 0);
        if (indexes.length) {
            this._tabList.setSelection(indexes);
            this._tabList.setFocus([indexes[0]]);
        }
    }
    _getTabActions() {
        return [
            new Separator(),
            this._configurationService.inspect("terminal.integrated.tabs.location" /* TerminalSettingId.TabsLocation */).userValue === 'left' ?
                new Action('moveRight', localize('moveTabsRight', "Move Tabs Right"), undefined, undefined, async () => {
                    this._configurationService.updateValue("terminal.integrated.tabs.location" /* TerminalSettingId.TabsLocation */, 'right');
                }) :
                new Action('moveLeft', localize('moveTabsLeft', "Move Tabs Left"), undefined, undefined, async () => {
                    this._configurationService.updateValue("terminal.integrated.tabs.location" /* TerminalSettingId.TabsLocation */, 'left');
                }),
            new Action('hideTabs', localize('hideTabs', "Hide Tabs"), undefined, undefined, async () => {
                this._configurationService.updateValue("terminal.integrated.tabs.enabled" /* TerminalSettingId.TabsEnabled */, false);
            })
        ];
    }
    setEditable(isEditing) {
        if (!isEditing) {
            this._tabList.domFocus();
        }
        this._tabList.refresh(false);
    }
    focusTabs() {
        if (!this._shouldShowTabs()) {
            return;
        }
        this._terminalTabsFocusContextKey.set(true);
        const selected = this._tabList.getSelection();
        this._tabList.domFocus();
        if (selected) {
            this._tabList.setFocus(selected);
        }
    }
    focus() {
        if (this._terminalService.connectionState === 1 /* TerminalConnectionState.Connected */) {
            this._focus();
            return;
        }
        // If the terminal is waiting to reconnect to remote terminals, then there is no TerminalInstance yet that can
        // be focused. So wait for connection to finish, then focus.
        const previousActiveElement = this._tabListElement.ownerDocument.activeElement;
        if (previousActiveElement) {
            const listener = this._register(Event.once(this._terminalService.onDidChangeConnectionState)(() => {
                // Only focus the terminal if the activeElement has not changed since focus() was called
                if (dom.isActiveElement(previousActiveElement)) {
                    this._focus();
                }
                this._store.delete(listener);
            }));
        }
    }
    focusHover() {
        if (this._shouldShowTabs()) {
            this._tabList.focusHover();
            return;
        }
        const instance = this._terminalGroupService.activeInstance;
        if (!instance) {
            return;
        }
        this._hoverService.showInstantHover({
            ...getInstanceHoverInfo(instance, this._storageService),
            target: this._terminalContainer,
            trapFocus: true
        }, true);
    }
    _focus() {
        this._terminalGroupService.activeInstance?.focusWhenReady();
    }
};
TerminalTabbedView = __decorate([
    __param(1, ITerminalService),
    __param(2, ITerminalChatService),
    __param(3, ITerminalConfigurationService),
    __param(4, ITerminalGroupService),
    __param(5, IInstantiationService),
    __param(6, IContextMenuService),
    __param(7, IConfigurationService),
    __param(8, IMenuService),
    __param(9, IStorageService),
    __param(10, IContextKeyService),
    __param(11, IHoverService)
], TerminalTabbedView);
export { TerminalTabbedView };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxUYWJiZWRWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbFRhYmJlZFZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUErQixNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDcEgsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN4RixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLDZCQUE2QixFQUFFLHFCQUFxQixFQUFxQixnQkFBZ0IsRUFBa0QsTUFBTSxlQUFlLENBQUM7QUFDaE0sT0FBTyxFQUF5QixlQUFlLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUMvRSxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxNQUFNLEVBQVcsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEYsT0FBTyxFQUFTLFlBQVksRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM3RixPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUU5RixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0Is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