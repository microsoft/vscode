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
var AbstractPaneCompositePart_1;
import './media/paneCompositePart.css';
import { Event } from '../../../base/common/event.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IViewDescriptorService } from '../../common/views.js';
import { DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { IWorkbenchLayoutService } from '../../services/layout/browser/layoutService.js';
import { CompositePart } from './compositePart.js';
import { PaneCompositeBar } from './paneCompositeBar.js';
import { Dimension, EventHelper, trackFocus, $, addDisposableListener, EventType, prepend, getWindow } from '../../../base/browser/dom.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { localize } from '../../../nls.js';
import { CompositeDragAndDropObserver, toggleDropEffect } from '../dnd.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../common/theme.js';
import { IMenuService } from '../../../platform/actions/common/actions.js';
import { Gesture, EventType as GestureEventType } from '../../../base/browser/touch.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { SubmenuAction } from '../../../base/common/actions.js';
import { ViewsSubMenu } from './views/viewPaneContainer.js';
import { getActionBarActions } from '../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { DeferredPromise } from '../../../base/common/async.js';
export var CompositeBarPosition;
(function (CompositeBarPosition) {
    CompositeBarPosition[CompositeBarPosition["TOP"] = 0] = "TOP";
    CompositeBarPosition[CompositeBarPosition["TITLE"] = 1] = "TITLE";
    CompositeBarPosition[CompositeBarPosition["BOTTOM"] = 2] = "BOTTOM";
})(CompositeBarPosition || (CompositeBarPosition = {}));
let AbstractPaneCompositePart = class AbstractPaneCompositePart extends CompositePart {
    static { AbstractPaneCompositePart_1 = this; }
    static { this.MIN_COMPOSITE_BAR_WIDTH = 50; }
    get snap() {
        // Always allow snapping closed
        // Only allow dragging open if the panel contains view containers
        return this.layoutService.isVisible(this.partId) || !!this.paneCompositeBar.value?.getVisiblePaneCompositeIds().length;
    }
    get onDidPaneCompositeOpen() { return Event.map(this.onDidCompositeOpen.event, compositeEvent => compositeEvent.composite); }
    constructor(partId, partOptions, activePaneCompositeSettingsKey, activePaneContextKey, paneFocusContextKey, nameForTelemetry, compositeCSSClass, titleForegroundColor, titleBorderColor, location, registryId, globalActionsMenuId, globalLeftActionsMenuId, notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, viewDescriptorService, contextKeyService, extensionService, menuService) {
        super(notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, Registry.as(registryId), activePaneCompositeSettingsKey, viewDescriptorService.getDefaultViewContainer(location)?.id || '', nameForTelemetry, compositeCSSClass, titleForegroundColor, titleBorderColor, partId, partOptions);
        this.partId = partId;
        this.activePaneContextKey = activePaneContextKey;
        this.paneFocusContextKey = paneFocusContextKey;
        this.location = location;
        this.registryId = registryId;
        this.globalActionsMenuId = globalActionsMenuId;
        this.globalLeftActionsMenuId = globalLeftActionsMenuId;
        this.viewDescriptorService = viewDescriptorService;
        this.contextKeyService = contextKeyService;
        this.extensionService = extensionService;
        this.menuService = menuService;
        this.onDidPaneCompositeClose = this.onDidCompositeClose.event;
        this.headerFooterCompositeBarDispoables = this._register(new DisposableStore());
        this.paneCompositeBar = this._register(new MutableDisposable());
        this.compositeBarPosition = undefined;
        this.blockOpening = undefined;
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.onDidPaneCompositeOpen(composite => this.onDidOpen(composite)));
        this._register(this.onDidPaneCompositeClose(this.onDidClose, this));
        this._register(this.registry.onDidDeregister((viewletDescriptor) => {
            const activeContainers = this.viewDescriptorService.getViewContainersByLocation(this.location)
                .filter(container => this.viewDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0);
            if (activeContainers.length) {
                if (this.getActiveComposite()?.getId() === viewletDescriptor.id) {
                    const defaultViewletId = this.viewDescriptorService.getDefaultViewContainer(this.location)?.id;
                    const containerToOpen = activeContainers.filter(c => c.id === defaultViewletId)[0] || activeContainers[0];
                    this.doOpenPaneComposite(containerToOpen.id);
                }
            }
            else {
                this.layoutService.setPartHidden(true, this.partId);
            }
            this.removeComposite(viewletDescriptor.id);
        }));
        this._register(this.extensionService.onDidRegisterExtensions(() => {
            this.layoutCompositeBar();
        }));
    }
    onDidOpen(composite) {
        this.activePaneContextKey.set(composite.getId());
    }
    onDidClose(composite) {
        const id = composite.getId();
        if (this.activePaneContextKey.get() === id) {
            this.activePaneContextKey.reset();
        }
    }
    showComposite(composite) {
        super.showComposite(composite);
        this.layoutCompositeBar();
        this.layoutEmptyMessage();
    }
    hideActiveComposite() {
        const composite = super.hideActiveComposite();
        this.layoutCompositeBar();
        this.layoutEmptyMessage();
        return composite;
    }
    create(parent) {
        this.element = parent;
        this.element.classList.add('pane-composite-part');
        super.create(parent);
        if (this.contentArea) {
            this.createEmptyPaneMessage(this.contentArea);
        }
        this.updateCompositeBar();
        const focusTracker = this._register(trackFocus(parent));
        this._register(focusTracker.onDidFocus(() => this.paneFocusContextKey.set(true)));
        this._register(focusTracker.onDidBlur(() => this.paneFocusContextKey.set(false)));
    }
    createEmptyPaneMessage(parent) {
        this.emptyPaneMessageElement = $('.empty-pane-message-area');
        const messageElement = $('.empty-pane-message');
        messageElement.textContent = localize('pane.emptyMessage', "Drag a view here to display.");
        this.emptyPaneMessageElement.appendChild(messageElement);
        parent.appendChild(this.emptyPaneMessageElement);
        const setDropBackgroundFeedback = (visible) => {
            const updateActivityBarBackground = !this.getActiveComposite() || !visible;
            const backgroundColor = visible ? this.theme.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND)?.toString() || '' : '';
            if (this.titleContainer && updateActivityBarBackground) {
                this.titleContainer.style.backgroundColor = backgroundColor;
            }
            if (this.headerFooterCompositeBarContainer && updateActivityBarBackground) {
                this.headerFooterCompositeBarContainer.style.backgroundColor = backgroundColor;
            }
            this.emptyPaneMessageElement.style.backgroundColor = backgroundColor;
        };
        if (this.viewDescriptorService.canMoveViews()) {
            this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(this.element, {
                onDragOver: (e) => {
                    EventHelper.stop(e.eventData, true);
                    if (this.paneCompositeBar.value) {
                        const validDropTarget = this.paneCompositeBar.value.dndHandler.onDragEnter(e.dragAndDropData, undefined, e.eventData);
                        toggleDropEffect(e.eventData.dataTransfer, 'move', validDropTarget);
                    }
                },
                onDragEnter: (e) => {
                    EventHelper.stop(e.eventData, true);
                    if (this.paneCompositeBar.value) {
                        const validDropTarget = this.paneCompositeBar.value.dndHandler.onDragEnter(e.dragAndDropData, undefined, e.eventData);
                        setDropBackgroundFeedback(validDropTarget);
                    }
                },
                onDragLeave: (e) => {
                    EventHelper.stop(e.eventData, true);
                    setDropBackgroundFeedback(false);
                },
                onDragEnd: (e) => {
                    EventHelper.stop(e.eventData, true);
                    setDropBackgroundFeedback(false);
                },
                onDrop: (e) => {
                    EventHelper.stop(e.eventData, true);
                    setDropBackgroundFeedback(false);
                    if (this.paneCompositeBar.value) {
                        this.paneCompositeBar.value.dndHandler.drop(e.dragAndDropData, undefined, e.eventData);
                    }
                    else {
                        // Allow opening views/composites if the composite bar is hidden
                        const dragData = e.dragAndDropData.getData();
                        if (dragData.type === 'composite') {
                            const currentContainer = this.viewDescriptorService.getViewContainerById(dragData.id);
                            this.viewDescriptorService.moveViewContainerToLocation(currentContainer, this.location, undefined, 'dnd');
                            this.openPaneComposite(currentContainer.id, true);
                        }
                        else if (dragData.type === 'view') {
                            const viewToMove = this.viewDescriptorService.getViewDescriptorById(dragData.id);
                            if (viewToMove.canMoveView) {
                                this.viewDescriptorService.moveViewToLocation(viewToMove, this.location, 'dnd');
                                const newContainer = this.viewDescriptorService.getViewContainerByViewId(viewToMove.id);
                                this.openPaneComposite(newContainer.id, true).then(composite => {
                                    composite?.openView(viewToMove.id, true);
                                });
                            }
                        }
                    }
                },
            }));
        }
    }
    createTitleArea(parent) {
        const titleArea = super.createTitleArea(parent);
        if (!titleArea) {
            return undefined;
        }
        this._register(addDisposableListener(titleArea, EventType.CONTEXT_MENU, e => {
            this.onTitleAreaContextMenu(new StandardMouseEvent(getWindow(titleArea), e));
        }));
        this._register(Gesture.addTarget(titleArea));
        this._register(addDisposableListener(titleArea, GestureEventType.Contextmenu, e => {
            this.onTitleAreaContextMenu(new StandardMouseEvent(getWindow(titleArea), e));
        }));
        if (this.globalLeftActionsMenuId) {
            const globalLeftTitleActionsContainer = titleArea.appendChild($('.global-actions-left'));
            this.globalLeftToolBar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, globalLeftTitleActionsContainer, this.globalLeftActionsMenuId, {
                actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
                orientation: 0 /* ActionsOrientation.HORIZONTAL */,
                getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
                anchorAlignmentProvider: () => this.getTitleAreaDropDownAnchorAlignment(),
                hoverDelegate: this.toolbarHoverDelegate,
                hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
                highlightToggledItems: false,
                telemetrySource: this.nameForTelemetry
            }));
        }
        const globalTitleActionsContainer = titleArea.appendChild($('.global-actions'));
        // Global Actions Toolbar
        this.globalToolBar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, globalTitleActionsContainer, this.globalActionsMenuId, {
            actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
            orientation: 0 /* ActionsOrientation.HORIZONTAL */,
            getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
            anchorAlignmentProvider: () => this.getTitleAreaDropDownAnchorAlignment(),
            toggleMenuTitle: localize('moreActions', "More Actions..."),
            hoverDelegate: this.toolbarHoverDelegate,
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            highlightToggledItems: true,
            telemetrySource: this.nameForTelemetry
        }));
        return titleArea;
    }
    createTitleLabel(parent) {
        this.titleContainer = parent;
        const titleLabel = super.createTitleLabel(parent);
        this.titleLabelElement.draggable = this.viewDescriptorService.canMoveViews();
        const draggedItemProvider = () => {
            const activeViewlet = this.getActivePaneComposite();
            return { type: 'composite', id: activeViewlet.getId() };
        };
        this._register(CompositeDragAndDropObserver.INSTANCE.registerDraggable(this.titleLabelElement, draggedItemProvider, {}));
        return titleLabel;
    }
    updateCompositeBar(updateCompositeBarOption = false) {
        const wasCompositeBarVisible = this.compositeBarPosition !== undefined;
        const isCompositeBarVisible = this.shouldShowCompositeBar();
        const previousPosition = this.compositeBarPosition;
        const newPosition = isCompositeBarVisible ? this.getCompositeBarPosition() : undefined;
        // Only update if the visibility or position has changed or if the composite bar options should be updated
        if (!updateCompositeBarOption && previousPosition === newPosition) {
            return;
        }
        // Remove old composite bar
        if (wasCompositeBarVisible) {
            const previousCompositeBarContainer = previousPosition === CompositeBarPosition.TITLE ? this.titleContainer : this.headerFooterCompositeBarContainer;
            if (!this.paneCompositeBarContainer || !this.paneCompositeBar.value || !previousCompositeBarContainer) {
                throw new Error('Composite bar containers should exist when removing the previous composite bar');
            }
            this.paneCompositeBarContainer.remove();
            this.paneCompositeBarContainer = undefined;
            this.paneCompositeBar.value = undefined;
            previousCompositeBarContainer.classList.remove('has-composite-bar');
            if (previousPosition === CompositeBarPosition.TOP) {
                this.removeFooterHeaderArea(true);
            }
            else if (previousPosition === CompositeBarPosition.BOTTOM) {
                this.removeFooterHeaderArea(false);
            }
        }
        // Create new composite bar
        let newCompositeBarContainer;
        switch (newPosition) {
            case CompositeBarPosition.TOP:
                newCompositeBarContainer = this.createHeaderArea();
                break;
            case CompositeBarPosition.TITLE:
                newCompositeBarContainer = this.titleContainer;
                break;
            case CompositeBarPosition.BOTTOM:
                newCompositeBarContainer = this.createFooterArea();
                break;
        }
        if (isCompositeBarVisible) {
            if (this.paneCompositeBarContainer || this.paneCompositeBar.value || !newCompositeBarContainer) {
                throw new Error('Invalid composite bar state when creating the new composite bar');
            }
            newCompositeBarContainer.classList.add('has-composite-bar');
            this.paneCompositeBarContainer = prepend(newCompositeBarContainer, $('.composite-bar-container'));
            this.paneCompositeBar.value = this.createCompositeBar();
            this.paneCompositeBar.value.create(this.paneCompositeBarContainer);
            if (newPosition === CompositeBarPosition.TOP) {
                this.setHeaderArea(newCompositeBarContainer);
            }
            else if (newPosition === CompositeBarPosition.BOTTOM) {
                this.setFooterArea(newCompositeBarContainer);
            }
        }
        this.compositeBarPosition = newPosition;
        if (updateCompositeBarOption) {
            this.layoutCompositeBar();
        }
    }
    createHeaderArea() {
        const headerArea = super.createHeaderArea();
        return this.createHeaderFooterCompositeBarArea(headerArea);
    }
    createFooterArea() {
        const footerArea = super.createFooterArea();
        return this.createHeaderFooterCompositeBarArea(footerArea);
    }
    createHeaderFooterCompositeBarArea(area) {
        if (this.headerFooterCompositeBarContainer) {
            // A pane composite part has either a header or a footer, but not both
            throw new Error('Header or Footer composite bar already exists');
        }
        this.headerFooterCompositeBarContainer = area;
        this.headerFooterCompositeBarDispoables.add(addDisposableListener(area, EventType.CONTEXT_MENU, e => {
            this.onCompositeBarAreaContextMenu(new StandardMouseEvent(getWindow(area), e));
        }));
        this.headerFooterCompositeBarDispoables.add(Gesture.addTarget(area));
        this.headerFooterCompositeBarDispoables.add(addDisposableListener(area, GestureEventType.Contextmenu, e => {
            this.onCompositeBarAreaContextMenu(new StandardMouseEvent(getWindow(area), e));
        }));
        return area;
    }
    removeFooterHeaderArea(header) {
        this.headerFooterCompositeBarContainer = undefined;
        this.headerFooterCompositeBarDispoables.clear();
        if (header) {
            this.removeHeaderArea();
        }
        else {
            this.removeFooterArea();
        }
    }
    createCompositeBar() {
        return this.instantiationService.createInstance(PaneCompositeBar, this.location, this.getCompositeBarOptions(), this.partId, this);
    }
    onTitleAreaUpdate(compositeId) {
        super.onTitleAreaUpdate(compositeId);
        // If title actions change, relayout the composite bar
        this.layoutCompositeBar();
    }
    async openPaneComposite(id, focus) {
        if (typeof id === 'string' && this.getPaneComposite(id)) {
            return this.doOpenPaneComposite(id, focus);
        }
        await this.extensionService.whenInstalledExtensionsRegistered();
        if (typeof id === 'string' && this.getPaneComposite(id)) {
            return this.doOpenPaneComposite(id, focus);
        }
        return undefined;
    }
    async doOpenPaneComposite(id, focus) {
        if (this.blockOpening) {
            // Workaround against a potential race condition when calling
            // `setPartHidden` we may end up in `openPaneComposite` again.
            // But we still want to return the result of the original call,
            // so we return the promise of the original call.
            return this.blockOpening.p;
        }
        let blockOpening;
        if (!this.layoutService.isVisible(this.partId)) {
            try {
                blockOpening = this.blockOpening = new DeferredPromise();
                this.layoutService.setPartHidden(false, this.partId);
            }
            finally {
                this.blockOpening = undefined;
            }
        }
        try {
            const result = this.openComposite(id, focus);
            blockOpening?.complete(result);
            return result;
        }
        catch (error) {
            blockOpening?.error(error);
            throw error;
        }
    }
    getPaneComposite(id) {
        return this.registry.getPaneComposite(id);
    }
    getPaneComposites() {
        return this.registry.getPaneComposites()
            .sort((v1, v2) => {
            if (typeof v1.order !== 'number') {
                return 1;
            }
            if (typeof v2.order !== 'number') {
                return -1;
            }
            return v1.order - v2.order;
        });
    }
    getPinnedPaneCompositeIds() {
        return this.paneCompositeBar.value?.getPinnedPaneCompositeIds() ?? [];
    }
    getVisiblePaneCompositeIds() {
        return this.paneCompositeBar.value?.getVisiblePaneCompositeIds() ?? [];
    }
    getPaneCompositeIds() {
        return this.paneCompositeBar.value?.getPaneCompositeIds() ?? [];
    }
    getActivePaneComposite() {
        return this.getActiveComposite();
    }
    getLastActivePaneCompositeId() {
        return this.getLastActiveCompositeId();
    }
    hideActivePaneComposite() {
        if (this.layoutService.isVisible(this.partId)) {
            this.layoutService.setPartHidden(true, this.partId);
        }
        this.hideActiveComposite();
    }
    focusCompositeBar() {
        this.paneCompositeBar.value?.focus();
    }
    layout(width, height, top, left) {
        if (!this.layoutService.isVisible(this.partId)) {
            return;
        }
        this.contentDimension = new Dimension(width, height);
        // Layout contents
        super.layout(this.contentDimension.width, this.contentDimension.height, top, left);
        // Layout composite bar
        this.layoutCompositeBar();
        // Add empty pane message
        this.layoutEmptyMessage();
    }
    layoutCompositeBar() {
        if (this.contentDimension && this.dimension && this.paneCompositeBar.value) {
            const padding = this.compositeBarPosition === CompositeBarPosition.TITLE ? 16 : 8;
            const borderWidth = this.partId === "workbench.parts.panel" /* Parts.PANEL_PART */ ? 0 : 1;
            let availableWidth = this.contentDimension.width - padding - borderWidth;
            availableWidth = Math.max(AbstractPaneCompositePart_1.MIN_COMPOSITE_BAR_WIDTH, availableWidth - this.getToolbarWidth());
            this.paneCompositeBar.value.layout(availableWidth, this.dimension.height);
        }
    }
    layoutEmptyMessage() {
        const visible = !this.getActiveComposite();
        this.element.classList.toggle('empty', visible);
        if (visible) {
            this.titleLabel?.updateTitle('', '');
        }
    }
    getToolbarWidth() {
        if (!this.toolBar || this.compositeBarPosition !== CompositeBarPosition.TITLE) {
            return 0;
        }
        const activePane = this.getActivePaneComposite();
        if (!activePane) {
            return 0;
        }
        // Each toolbar item has 4px margin
        const toolBarWidth = this.toolBar.getItemsWidth() + this.toolBar.getItemsLength() * 4;
        const globalToolBarWidth = this.globalToolBar ? this.globalToolBar.getItemsWidth() + this.globalToolBar.getItemsLength() * 4 : 0;
        const globalLeftToolBarWidth = this.globalLeftToolBar ? this.globalLeftToolBar.getItemsWidth() + this.globalLeftToolBar.getItemsLength() * 4 : 0;
        return toolBarWidth + globalToolBarWidth + globalLeftToolBarWidth + 8; // 8px padding left
    }
    onTitleAreaContextMenu(event) {
        if (this.shouldShowCompositeBar() && this.getCompositeBarPosition() === CompositeBarPosition.TITLE) {
            return this.onCompositeBarContextMenu(event);
        }
        else {
            const activePaneComposite = this.getActivePaneComposite();
            const activePaneCompositeActions = activePaneComposite ? activePaneComposite.getContextMenuActions() : [];
            if (activePaneCompositeActions.length) {
                this.contextMenuService.showContextMenu({
                    getAnchor: () => event,
                    getActions: () => activePaneCompositeActions,
                    getActionViewItem: (action, options) => this.actionViewItemProvider(action, options),
                    actionRunner: activePaneComposite.getActionRunner(),
                    skipTelemetry: true
                });
            }
        }
    }
    onCompositeBarAreaContextMenu(event) {
        return this.onCompositeBarContextMenu(event);
    }
    onCompositeBarContextMenu(event) {
        if (this.paneCompositeBar.value) {
            const actions = [...this.paneCompositeBar.value.getContextMenuActions()];
            if (actions.length) {
                this.contextMenuService.showContextMenu({
                    getAnchor: () => event,
                    getActions: () => actions,
                    skipTelemetry: true
                });
            }
        }
    }
    getViewsSubmenuAction() {
        const viewPaneContainer = this.getActivePaneComposite()?.getViewPaneContainer();
        if (viewPaneContainer) {
            const disposables = new DisposableStore();
            const scopedContextKeyService = disposables.add(this.contextKeyService.createScoped(this.element));
            scopedContextKeyService.createKey('viewContainer', viewPaneContainer.viewContainer.id);
            const menu = this.menuService.getMenuActions(ViewsSubMenu, scopedContextKeyService, { shouldForwardArgs: true, renderShortTitle: true });
            const viewsActions = getActionBarActions(menu, () => true).primary;
            disposables.dispose();
            return viewsActions.length > 1 && viewsActions.some(a => a.enabled) ? new SubmenuAction('views', localize('views', "Views"), viewsActions) : undefined;
        }
        return undefined;
    }
};
AbstractPaneCompositePart = AbstractPaneCompositePart_1 = __decorate([
    __param(13, INotificationService),
    __param(14, IStorageService),
    __param(15, IContextMenuService),
    __param(16, IWorkbenchLayoutService),
    __param(17, IKeybindingService),
    __param(18, IHoverService),
    __param(19, IInstantiationService),
    __param(20, IThemeService),
    __param(21, IViewDescriptorService),
    __param(22, IContextKeyService),
    __param(23, IExtensionService),
    __param(24, IMenuService)
], AbstractPaneCompositePart);
export { AbstractPaneCompositePart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFuZUNvbXBvc2l0ZVBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9wYW5lQ29tcG9zaXRlUGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTywrQkFBK0IsQ0FBQztBQUN2QyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFJaEcsT0FBTyxFQUFFLHNCQUFzQixFQUF5QixNQUFNLHVCQUF1QixDQUFDO0FBQ3RGLE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV2RixPQUFPLEVBQUUsdUJBQXVCLEVBQThCLE1BQU0sZ0RBQWdELENBQUM7QUFDckgsT0FBTyxFQUFFLGFBQWEsRUFBK0MsTUFBTSxvQkFBb0IsQ0FBQztBQUNoRyxPQUFPLEVBQTRCLGdCQUFnQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDbkYsT0FBTyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzNJLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDM0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdkYsT0FB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