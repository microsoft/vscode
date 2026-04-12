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
import { $, addDisposableListener, DragAndDropObserver, EventType, getWindow, isAncestor } from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { EventType as TouchEventType, Gesture } from '../../../../base/browser/touch.js';
import { PaneView } from '../../../../base/browser/ui/splitview/paneview.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { combinedDisposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import './media/paneviewlet.css';
import * as nls from '../../../../nls.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { activeContrastBorder, asCssVariable } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CompositeDragAndDropObserver, toggleDropEffect } from '../../dnd.js';
import { Component } from '../../../common/component.js';
import { PANEL_SECTION_BORDER, PANEL_SECTION_DRAG_AND_DROP_BACKGROUND, PANEL_SECTION_HEADER_BACKGROUND, PANEL_SECTION_HEADER_BORDER, PANEL_SECTION_HEADER_FOREGROUND, SIDE_BAR_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_SECTION_HEADER_BACKGROUND, SIDE_BAR_SECTION_HEADER_BORDER, SIDE_BAR_SECTION_HEADER_FOREGROUND } from '../../../common/theme.js';
import { IViewDescriptorService, ViewVisibilityState } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { FocusedViewContext } from '../../../common/contextkeys.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { isHorizontal, IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ViewContainerMenuActions } from './viewMenuActions.js';
export const ViewsSubMenu = new MenuId('Views');
MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
    submenu: ViewsSubMenu,
    title: nls.localize('views', "Views"),
    order: 1,
});
var DropDirection;
(function (DropDirection) {
    DropDirection[DropDirection["UP"] = 0] = "UP";
    DropDirection[DropDirection["DOWN"] = 1] = "DOWN";
    DropDirection[DropDirection["LEFT"] = 2] = "LEFT";
    DropDirection[DropDirection["RIGHT"] = 3] = "RIGHT";
})(DropDirection || (DropDirection = {}));
class ViewPaneDropOverlay extends Themable {
    static { this.OVERLAY_ID = 'monaco-pane-drop-overlay'; }
    get currentDropOperation() {
        return this._currentDropOperation;
    }
    constructor(paneElement, orientation, bounds, location, themeService) {
        super(themeService);
        this.paneElement = paneElement;
        this.orientation = orientation;
        this.bounds = bounds;
        this.location = location;
        this.cleanupOverlayScheduler = this._register(new RunOnceScheduler(() => this.dispose(), 300));
        this.create();
    }
    get disposed() {
        return !!this._disposed;
    }
    create() {
        // Container
        this.container = $('div', { id: ViewPaneDropOverlay.OVERLAY_ID });
        this.container.style.top = '0px';
        // Parent
        this.paneElement.appendChild(this.container);
        this.paneElement.classList.add('dragged-over');
        this._register(toDisposable(() => {
            this.container.remove();
            this.paneElement.classList.remove('dragged-over');
        }));
        // Overlay
        this.overlay = $('.pane-overlay-indicator');
        this.container.appendChild(this.overlay);
        // Overlay Event Handling
        this.registerListeners();
        // Styles
        this.updateStyles();
    }
    updateStyles() {
        // Overlay drop background
        this.overlay.style.backgroundColor = this.getColor(this.location === 1 /* ViewContainerLocation.Panel */ ? PANEL_SECTION_DRAG_AND_DROP_BACKGROUND : SIDE_BAR_DRAG_AND_DROP_BACKGROUND) || '';
        // Overlay contrast border (if any)
        const activeContrastBorderColor = this.getColor(activeContrastBorder);
        this.overlay.style.outlineColor = activeContrastBorderColor || '';
        this.overlay.style.outlineOffset = activeContrastBorderColor ? '-2px' : '';
        this.overlay.style.outlineStyle = activeContrastBorderColor ? 'dashed' : '';
        this.overlay.style.outlineWidth = activeContrastBorderColor ? '2px' : '';
        this.overlay.style.borderColor = activeContrastBorderColor || '';
        this.overlay.style.borderStyle = 'solid';
        this.overlay.style.borderWidth = '0px';
    }
    registerListeners() {
        this._register(new DragAndDropObserver(this.container, {
            onDragOver: e => {
                // Position overlay
                this.positionOverlay(e.offsetX, e.offsetY);
                // Make sure to stop any running cleanup scheduler to remove the overlay
                if (this.cleanupOverlayScheduler.isScheduled()) {
                    this.cleanupOverlayScheduler.cancel();
                }
            },
            onDragLeave: e => this.dispose(),
            onDragEnd: e => this.dispose(),
            onDrop: e => {
                // Dispose overlay
                this.dispose();
            }
        }));
        this._register(addDisposableListener(this.container, EventType.MOUSE_OVER, () => {
            // Under some circumstances we have seen reports where the drop overlay is not being
            // cleaned up and as such the editor area remains under the overlay so that you cannot
            // type into the editor anymore. This seems related to using VMs and DND via host and
            // guest OS, though some users also saw it without VMs.
            // To protect against this issue we always destroy the overlay as soon as we detect a
            // mouse event over it. The delay is used to guarantee we are not interfering with the
            // actual DROP event that can also trigger a mouse over event.
            if (!this.cleanupOverlayScheduler.isScheduled()) {
                this.cleanupOverlayScheduler.schedule();
            }
        }));
    }
    positionOverlay(mousePosX, mousePosY) {
        const paneWidth = this.paneElement.clientWidth;
        const paneHeight = this.paneElement.clientHeight;
        const splitWidthThreshold = paneWidth / 2;
        const splitHeightThreshold = paneHeight / 2;
        let dropDirection;
        if (this.orientation === 0 /* Orientation.VERTICAL */) {
            if (mousePosY < splitHeightThreshold) {
                dropDirection = 0 /* DropDirection.UP */;
            }
            else if (mousePosY >= splitHeightThreshold) {
                dropDirection = 1 /* DropDirection.DOWN */;
            }
        }
        else if (this.orientation === 1 /* Orientation.HORIZONTAL */) {
            if (mousePosX < splitWidthThreshold) {
                dropDirection = 2 /* DropDirection.LEFT */;
            }
            else if (mousePosX >= splitWidthThreshold) {
                dropDirection = 3 /* DropDirection.RIGHT */;
            }
        }
        // Draw overlay based on split direction
        switch (dropDirection) {
            case 0 /* DropDirection.UP */:
                this.doPositionOverlay({ top: '0', left: '0', width: '100%', height: '50%' });
                break;
            case 1 /* DropDirection.DOWN */:
                this.doPositionOverlay({ bottom: '0', left: '0', width: '100%', height: '50%' });
                break;
            case 2 /* DropDirection.LEFT */:
                this.doPositionOverlay({ top: '0', left: '0', width: '50%', height: '100%' });
                break;
            case 3 /* DropDirection.RIGHT */:
                this.doPositionOverlay({ top: '0', right: '0', width: '50%', height: '100%' });
                break;
            default: {
                // const top = this.bounds?.top || 0;
                // const left = this.bounds?.bottom || 0;
                let top = '0';
                let left = '0';
                let width = '100%';
                let height = '100%';
                if (this.bounds) {
                    const boundingRect = this.container.getBoundingClientRect();
                    top = `${this.bounds.top - boundingRect.top}px`;
                    left = `${this.bounds.left - boundingRect.left}px`;
                    height = `${this.bounds.bottom - this.bounds.top}px`;
                    width = `${this.bounds.right - this.bounds.left}px`;
                }
                this.doPositionOverlay({ top, left, width, height });
            }
        }
        if ((this.orientation === 0 /* Orientation.VERTICAL */ && paneHeight <= 25) ||
            (this.orientation === 1 /* Orientation.HORIZONTAL */ && paneWidth <= 25)) {
            this.doUpdateOverlayBorder(dropDirection);
        }
        else {
            this.doUpdateOverlayBorder(undefined);
        }
        // Make sure the overlay is visible now
        this.overlay.style.opacity = '1';
        // Enable transition after a timeout to prevent initial animation
        setTimeout(() => this.overlay.classList.add('overlay-move-transition'), 0);
        // Remember as current split direction
        this._currentDropOperation = dropDirection;
    }
    doUpdateOverlayBorder(direction) {
        this.overlay.style.borderTopWidth = direction === 0 /* DropDirection.UP */ ? '2px' : '0px';
        this.overlay.style.borderLeftWidth = direction === 2 /* DropDirection.LEFT */ ? '2px' : '0px';
        this.overlay.style.borderBottomWidth = direction === 1 /* DropDirection.DOWN */ ? '2px' : '0px';
        this.overlay.style.borderRightWidth = direction === 3 /* DropDirection.RIGHT */ ? '2px' : '0px';
    }
    doPositionOverlay(options) {
        // Container
        this.container.style.height = '100%';
        // Overlay
        this.overlay.style.top = options.top || '';
        this.overlay.style.left = options.left || '';
        this.overlay.style.bottom = options.bottom || '';
        this.overlay.style.right = options.right || '';
        this.overlay.style.width = options.width;
        this.overlay.style.height = options.height;
    }
    contains(element) {
        return element === this.container || element === this.overlay;
    }
    dispose() {
        super.dispose();
        this._disposed = true;
    }
}
let ViewPaneContainer = class ViewPaneContainer extends Component {
    get onDidSashChange() {
        return assertReturnsDefined(this.paneview).onDidSashChange;
    }
    get panes() {
        return this.paneItems.map(i => i.pane);
    }
    get views() {
        return this.panes;
    }
    get length() {
        return this.paneItems.length;
    }
    get menuActions() {
        return this._menuActions;
    }
    constructor(id, options, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService) {
        super(id, themeService, storageService);
        this.options = options;
        this.instantiationService = instantiationService;
        this.configurationService = configurationService;
        this.layoutService = layoutService;
        this.contextMenuService = contextMenuService;
        this.telemetryService = telemetryService;
        this.extensionService = extensionService;
        this.storageService = storageService;
        this.contextService = contextService;
        this.viewDescriptorService = viewDescriptorService;
        this.logService = logService;
        this.paneItems = [];
        this.visible = false;
        this.areExtensionsReady = false;
        this.didLayout = false;
        this._onTitleAreaUpdate = this._register(new Emitter());
        this.onTitleAreaUpdate = this._onTitleAreaUpdate.event;
        this._onDidChangeVisibility = this._register(new Emitter());
        this.onDidChangeVisibility = this._onDidChangeVisibility.event;
        this._onDidAddViews = this._register(new Emitter());
        this.onDidAddViews = this._onDidAddViews.event;
        this._onDidRemoveViews = this._register(new Emitter());
        this.onDidRemoveViews = this._onDidRemoveViews.event;
        this._onDidChangeViewVisibility = this._register(new Emitter());
        this.onDidChangeViewVisibility = this._onDidChangeViewVisibility.event;
        this._onDidFocusView = this._register(new Emitter());
        this.onDidFocusView = this._onDidFocusView.event;
        this._onDidBlurView = this._register(new Emitter());
        this.onDidBlurView = this._onDidBlurView.event;
        const container = this.viewDescriptorService.getViewContainerById(id);
        if (!container) {
            throw new Error('Could not find container');
        }
        this.viewContainer = container;
        this.visibleViewsStorageId = `${id}.numberOfVisibleViews`;
        this.visibleViewsCountFromCache = this.storageService.getNumber(this.visibleViewsStorageId, 1 /* StorageScope.WORKSPACE */, undefined);
        this.viewContainerModel = this.viewDescriptorService.getViewContainerModel(container);
    }
    create(parent) {
        const options = this.options;
        options.orientation = this.orientation;
        this.paneview = this._register(new PaneView(parent, this.options));
        if (this._boundarySashes) {
            this.paneview.setBoundarySashes(this._boundarySashes);
        }
        this._register(this.paneview.onDidDrop(({ from, to }) => this.movePane(from, to)));
        this._register(this.paneview.onDidScroll(_ => this.onDidScrollPane()));
        this._register(this.paneview.onDidSashReset((index) => this.onDidSashReset(index)));
        this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, (e) => this.showContextMenu(new StandardMouseEvent(getWindow(parent), e))));
        this._register(Gesture.addTarget(parent));
        this._register(addDisposableListener(parent, TouchEventType.Contextmenu, (e) => this.showContextMenu(new StandardMouseEvent(getWindow(parent), e))));
        this._menuActions = this._register(this.instantiationService.createInstance(ViewContainerMenuActions, this.paneview.element, this.viewContainer));
        this._register(this._menuActions.onDidChange(() => this.updateTitleArea()));
        let overlay;
        const getOverlayBounds = () => {
            const fullSize = parent.getBoundingClientRect();
            const lastPane = this.panes[this.panes.length - 1].element.getBoundingClientRect();
            const top = this.orientation === 0 /* Orientation.VERTICAL */ ? lastPane.bottom : fullSize.top;
            const left = this.orientation === 1 /* Orientation.HORIZONTAL */ ? lastPane.right : fullSize.left;
            return {
                top,
                bottom: fullSize.bottom,
                left,
                right: fullSize.right,
            };
        };
        const inBounds = (bounds, pos) => {
            return pos.x >= bounds.left && pos.x <= bounds.right && pos.y >= bounds.top && pos.y <= bounds.bottom;
        };
        let bounds;
        if (this.viewDescriptorService.canMoveViews()) {
            this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(parent, {
                onDragEnter: (e) => {
                    bounds = getOverlayBounds();
                    if (overlay?.disposed) {
                        overlay = undefined;
                    }
                    if (!overlay && inBounds(bounds, e.eventData)) {
                        const dropData = e.dragAndDropData.getData();
                        if (dropData.type === 'view') {
                            const oldViewContainer = this.viewDescriptorService.getViewContainerByViewId(dropData.id);
                            const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dropData.id);
                            if (oldViewContainer !== this.viewContainer && (!viewDescriptor || !viewDescriptor.canMoveView || this.viewContainer.rejectAddedViews)) {
                                return;
                            }
                            overlay = new ViewPaneDropOverlay(parent, undefined, bounds, this.viewDescriptorService.getViewContainerLocation(this.viewContainer), this.themeService);
                        }
                        if (dropData.type === 'composite' && dropData.id !== this.viewContainer.id) {
                            const container = this.viewDescriptorService.getViewContainerById(dropData.id);
                            const viewsToMove = this.viewDescriptorService.getViewContainerModel(container).allViewDescriptors;
                            if (!viewsToMove.some(v => !v.canMoveView) && viewsToMove.length > 0) {
                                overlay = new ViewPaneDropOverlay(parent, undefined, bounds, this.viewDescriptorService.getViewContainerLocation(this.viewContainer), this.themeService);
                            }
                        }
                    }
                },
                onDragOver: (e) => {
                    if (overlay?.disposed) {
                        overlay = undefined;
                    }
                    if (overlay && !inBounds(bounds, e.eventData)) {
                        overlay.dispose();
                        overlay = undefined;
                    }
                    if (inBounds(bounds, e.eventData)) {
                        toggleDropEffect(e.eventData.dataTransfer, 'move', overlay !== undefined);
                    }
                },
                onDragLeave: (e) => {
                    overlay?.dispose();
                    overlay = undefined;
                },
                onDrop: (e) => {
                    if (overlay) {
                        const dropData = e.dragAndDropData.getData();
                        const viewsToMove = [];
                        if (dropData.type === 'composite' && dropData.id !== this.viewContainer.id) {
                            const container = this.viewDescriptorService.getViewContainerById(dropData.id);
                            const allViews = this.viewDescriptorService.getViewContainerModel(container).allViewDescriptors;
                            if (!allViews.some(v => !v.canMoveView)) {
                                viewsToMove.push(...allViews);
                            }
                        }
                        else if (dropData.type === 'view') {
                            const oldViewContainer = this.viewDescriptorService.getViewContainerByViewId(dropData.id);
                            const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dropData.id);
                            if (oldViewContainer !== this.viewContainer && viewDescriptor?.canMoveView) {
                                this.viewDescriptorService.moveViewsToContainer([viewDescriptor], this.viewContainer, undefined, 'dnd');
                            }
                        }
                        const paneCount = this.panes.length;
                        if (viewsToMove.length > 0) {
                            this.viewDescriptorService.moveViewsToContainer(viewsToMove, this.viewContainer, undefined, 'dnd');
                        }
                        if (paneCount > 0) {
                            for (const view of viewsToMove) {
                                const paneToMove = this.panes.find(p => p.id === view.id);
                                if (paneToMove) {
                                    this.movePane(paneToMove, this.panes[this.panes.length - 1]);
                                }
                            }
                        }
                    }
                    overlay?.dispose();
                    overlay = undefined;
                }
            }));
        }
        this._register(this.onDidSashChange(() => this.saveViewSizes()));
        this._register(this.viewContainerModel.onDidAddVisibleViewDescriptors(added => this.onDidAddViewDescriptors(added)));
        this._register(this.viewContainerModel.onDidRemoveVisibleViewDescriptors(removed => this.onDidRemoveViewDescriptors(removed)));
        const addedViews = this.viewContainerModel.visibleViewDescriptors.map((viewDescriptor, index) => {
            const size = this.viewContainerModel.getSize(viewDescriptor.id);
            const collapsed = this.viewContainerModel.isCollapsed(viewDescriptor.id);
            return ({ viewDescriptor, index, size, collapsed });
        });
        if (addedViews.length) {
            this.onDidAddViewDescriptors(addedViews);
        }
        // Update headers after and title contributed views after available, since we read from cache in the beginning to know if the viewlet has single view or not. Ref #29609
        this.extensionService.whenInstalledExtensionsRegistered().then(() => {
            this.areExtensionsReady = true;
            if (this.panes.length) {
                this.updateTitleArea();
                this.updateViewHeaders();
            }
            this._register(this.configurationService.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */)) {
                    this.updateViewHeaders();
                }
            }));
        });
        this._register(this.viewContainerModel.onDidChangeActiveViewDescriptors(() => this._onTitleAreaUpdate.fire()));
    }
    getTitle() {
        const containerTitle = this.viewContainerModel.title;
        if (this.isViewMergedWithContainer()) {
            const singleViewPaneContainerTitle = this.paneItems[0].pane.singleViewPaneContainerTitle;
            if (singleViewPaneContainerTitle) {
                return singleViewPaneContainerTitle;
            }
            const paneItemTitle = this.paneItems[0].pane.title;
            if (containerTitle === paneItemTitle) {
                return paneItemTitle;
            }
            return paneItemTitle ? `${containerTitle}: ${paneItemTitle}` : containerTitle;
        }
        return containerTitle;
    }
    showContextMenu(event) {
        for (const paneItem of this.paneItems) {
            // Do not show context menu if target is coming from inside pane views
            if (isAncestor(event.target, paneItem.pane.element)) {
                return;
            }
        }
        event.stopPropagation();
        event.preventDefault();
        this.contextMenuService.showContextMenu({
            getAnchor: () => event,
            getActions: () => this.menuActions?.getContextMenuActions() ?? []
        });
    }
    getActionsContext() {
        if (this.isViewMergedWithContainer()) {
            return this.panes[0].getActionsContext();
        }
        return undefined;
    }
    getActionViewItem(action, options) {
        if (this.isViewMergedWithContainer()) {
            return this.paneItems[0].pane.createActionViewItem(action, options);
        }
        return createActionViewItem(this.instantiationService, action, options);
    }
    focus() {
        let paneToFocus = undefined;
        if (this.lastFocusedPane) {
            paneToFocus = this.lastFocusedPane;
        }
        else if (this.paneItems.length > 0) {
            for (const { pane } of this.paneItems) {
                if (pane.isExpanded()) {
                    paneToFocus = pane;
                    break;
                }
            }
        }
        if (paneToFocus) {
            paneToFocus.focus();
        }
    }
    get orientation() {
        switch (this.viewDescriptorService.getViewContainerLocation(this.viewContainer)) {
            case 0 /* ViewContainerLocation.Sidebar */:
            case 2 /* ViewContainerLocation.AuxiliaryBar */:
                return 0 /* Orientation.VERTICAL */;
            case 1 /* ViewContainerLocation.Panel */: {
                return isHorizontal(this.layoutService.getPanelPosition()) ? 1 /* Orientation.HORIZONTAL */ : 0 /* Orientation.VERTICAL */;
            }
        }
        return 0 /* Orientation.VERTICAL */;
    }
    layout(dimension) {
        if (this.paneview) {
            if (this.paneview.orientation !== this.orientation) {
                this.paneview.flipOrientation(dimension.height, dimension.width);
            }
            this.paneview.layout(dimension.height, dimension.width);
        }
        this.dimension = dimension;
        if (this.didLayout) {
            this.saveViewSizes();
        }
        else {
            this.didLayout = true;
            this.restoreViewSizes();
        }
    }
    setBoundarySashes(sashes) {
        this._boundarySashes = sashes;
        this.paneview?.setBoundarySashes(sashes);
    }
    getOptimalWidth() {
        const additionalMargin = 16;
        const optimalWidth = Math.max(...this.panes.map(view => view.getOptimalWidth() || 0));
        return optimalWidth + additionalMargin;
    }
    addPanes(panes) {
        const wasMerged = this.isViewMergedWithContainer();
        for (const { pane, size, index, disposable } of panes) {
            this.addPane(pane, size, disposable, index);
        }
        this.updateViewHeaders();
        if (this.isViewMergedWithContainer() !== wasMerged) {
            this.updateTitleArea();
        }
        this._onDidAddViews.fire(panes.map(({ pane }) => pane));
    }
    setVisible(visible) {
        if (this.visible !== !!visible) {
            this.visible = visible;
            this._onDidChangeVisibility.fire(visible);
        }
        this.panes.filter(view => view.isVisible() !== visible)
            .map((view) => view.setVisible(visible));
    }
    isVisible() {
        return this.visible;
    }
    updateTitleArea() {
        this._onTitleAreaUpdate.fire();
    }
    createView(viewDescriptor, options) {
        return this.instantiationService.createInstance(viewDescriptor.ctorDescriptor.ctor, ...(viewDescriptor.ctorDescriptor.staticArguments || []), options);
    }
    getView(id) {
        return this.panes.filter(view => view.id === id)[0];
    }
    saveViewSizes() {
        // Save size only when the layout has happened
        if (this.didLayout) {
            this.viewContainerModel.setSizes(this.panes.map(view => ({ id: view.id, size: this.getPaneSize(view) })));
        }
    }
    restoreViewSizes() {
        // Restore sizes only when the layout has happened
        if (this.didLayout) {
            let initialSizes;
            for (let i = 0; i < this.viewContainerModel.visibleViewDescriptors.length; i++) {
                const pane = this.panes[i];
                const viewDescriptor = this.viewContainerModel.visibleViewDescriptors[i];
                const size = this.viewContainerModel.getSize(viewDescriptor.id);
                if (typeof size === 'number') {
                    this.resizePane(pane, size);
                }
                else {
                    initialSizes = initialSizes ? initialSizes : this.computeInitialSizes();
                    this.resizePane(pane, initialSizes.get(pane.id) || 200);
                }
            }
        }
    }
    computeInitialSizes() {
        const sizes = new Map();
        if (this.dimension) {
            const totalWeight = this.viewContainerModel.visibleViewDescriptors.reduce((totalWeight, { weight }) => totalWeight + (weight || 20), 0);
            for (const viewDescriptor of this.viewContainerModel.visibleViewDescriptors) {
                if (this.orientation === 0 /* Orientation.VERTICAL */) {
                    sizes.set(viewDescriptor.id, this.dimension.height * (viewDescriptor.weight || 20) / totalWeight);
                }
                else {
                    sizes.set(viewDescriptor.id, this.dimension.width * (viewDescriptor.weight || 20) / totalWeight);
                }
            }
        }
        return sizes;
    }
    saveState() {
        this.panes.forEach((view) => view.saveState());
        this.storageService.store(this.visibleViewsStorageId, this.length, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
    onContextMenu(event, viewPane) {
        event.stopPropagation();
        event.preventDefault();
        const actions = viewPane.menuActions.getContextMenuActions();
        this.contextMenuService.showContextMenu({
            getAnchor: () => event,
            getActions: () => actions
        });
    }
    openView(id, focus) {
        let view = this.getView(id);
        if (!view) {
            this.toggleViewVisibility(id);
        }
        view = this.getView(id);
        if (view) {
            view.setExpanded(true);
            if (focus) {
                view.focus();
            }
        }
        return view;
    }
    onDidAddViewDescriptors(added) {
        const panesToAdd = [];
        for (const { viewDescriptor, collapsed, index, size } of added) {
            const pane = this.createView(viewDescriptor, {
                id: viewDescriptor.id,
                title: viewDescriptor.name.value,
                fromExtensionId: viewDescriptor.extensionId,
                expanded: !collapsed,
                singleViewPaneContainerTitle: viewDescriptor.singleViewPaneContainerTitle,
            });
            try {
                pane.render();
            }
            catch (error) {
                this.logService.error(`Fail to render view ${viewDescriptor.id}`, error);
                continue;
            }
            if (pane.draggableElement) {
                const contextMenuDisposable = addDisposableListener(pane.draggableElement, 'contextmenu', e => {
                    e.stopPropagation();
                    e.preventDefault();
                    this.onContextMenu(new StandardMouseEvent(getWindow(pane.draggableElement), e), pane);
                });
                const collapseDisposable = Event.latch(Event.map(pane.onDidChange, () => !pane.isExpanded()))(collapsed => {
                    this.viewContainerModel.setCollapsed(viewDescriptor.id, collapsed);
                });
                panesToAdd.push({ pane, size: size || pane.minimumSize, index, disposable: combinedDisposable(contextMenuDisposable, collapseDisposable) });
            }
        }
        this.addPanes(panesToAdd);
        this.restoreViewSizes();
        const panes = [];
        for (const { pane } of panesToAdd) {
            pane.setVisible(this.isVisible());
            panes.push(pane);
        }
        return panes;
    }
    onDidRemoveViewDescriptors(removed) {
        removed = removed.sort((a, b) => b.index - a.index);
        const panesToRemove = [];
        for (const { index } of removed) {
            const paneItem = this.paneItems[index];
            if (paneItem) {
                panesToRemove.push(this.paneItems[index].pane);
            }
        }
        if (panesToRemove.length) {
            this.removePanes(panesToRemove);
            for (const pane of panesToRemove) {
                pane.setVisible(false);
            }
        }
    }
    toggleViewVisibility(viewId) {
        // Check if view is active
        if (this.viewContainerModel.activeViewDescriptors.some(viewDescriptor => viewDescriptor.id === viewId)) {
            const visible = !this.viewContainerModel.isVisible(viewId);
            this.viewContainerModel.setVisible(viewId, visible);
        }
    }
    addPane(pane, size, disposable, index = this.paneItems.length - 1) {
        const onDidFocus = pane.onDidFocus(() => {
            this._onDidFocusView.fire(pane);
            this.lastFocusedPane = pane;
        });
        const onDidBlur = pane.onDidBlur(() => this._onDidBlurView.fire(pane));
        const onDidChangeTitleArea = pane.onDidChangeTitleArea(() => {
            if (this.isViewMergedWithContainer()) {
                this.updateTitleArea();
            }
        });
        const onDidChangeVisibility = pane.onDidChangeBodyVisibility(() => this._onDidChangeViewVisibility.fire(pane));
        const onDidChange = pane.onDidChange(() => {
            if (pane === this.lastFocusedPane && !pane.isExpanded()) {
                this.lastFocusedPane = undefined;
            }
        });
        const isPanel = this.viewDescriptorService.getViewContainerLocation(this.viewContainer) === 1 /* ViewContainerLocation.Panel */;
        pane.style({
            headerForeground: asCssVariable(isPanel ? PANEL_SECTION_HEADER_FOREGROUND : SIDE_BAR_SECTION_HEADER_FOREGROUND),
            headerBackground: asCssVariable(isPanel ? PANEL_SECTION_HEADER_BACKGROUND : SIDE_BAR_SECTION_HEADER_BACKGROUND),
            headerBorder: asCssVariable(isPanel ? PANEL_SECTION_HEADER_BORDER : SIDE_BAR_SECTION_HEADER_BORDER),
            dropBackground: asCssVariable(isPanel ? PANEL_SECTION_DRAG_AND_DROP_BACKGROUND : SIDE_BAR_DRAG_AND_DROP_BACKGROUND),
            leftBorder: isPanel ? asCssVariable(PANEL_SECTION_BORDER) : undefined
        });
        const store = new DisposableStore();
        store.add(disposable);
        store.add(combinedDisposable(pane, onDidFocus, onDidBlur, onDidChangeTitleArea, onDidChange, onDidChangeVisibility));
        const paneItem = { pane, disposable: store };
        this.paneItems.splice(index, 0, paneItem);
        assertReturnsDefined(this.paneview).addPane(pane, size, index);
        let overlay;
        if (this.viewDescriptorService.canMoveViews()) {
            if (pane.draggableElement) {
                store.add(CompositeDragAndDropObserver.INSTANCE.registerDraggable(pane.draggableElement, () => { return { type: 'view', id: pane.id }; }, {}));
            }
            store.add(CompositeDragAndDropObserver.INSTANCE.registerTarget(pane.dropTargetElement, {
                onDragEnter: (e) => {
                    if (!overlay) {
                        const dropData = e.dragAndDropData.getData();
                        if (dropData.type === 'view' && dropData.id !== pane.id) {
                            const oldViewContainer = this.viewDescriptorService.getViewContainerByViewId(dropData.id);
                            const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dropData.id);
                            if (oldViewContainer !== this.viewContainer && (!viewDescriptor || !viewDescriptor.canMoveView || this.viewContainer.rejectAddedViews)) {
                                return;
                            }
                            overlay = new ViewPaneDropOverlay(pane.dropTargetElement, this.orientation ?? 0 /* Orientation.VERTICAL */, undefined, this.viewDescriptorService.getViewContainerLocation(this.viewContainer), this.themeService);
                        }
                        if (dropData.type === 'composite' && dropData.id !== this.viewContainer.id && !this.viewContainer.rejectAddedViews) {
                            const container = this.viewDescriptorService.getViewContainerById(dropData.id);
                            const viewsToMove = this.viewDescriptorService.getViewContainerModel(container).allViewDescriptors;
                            if (!viewsToMove.some(v => !v.canMoveView) && viewsToMove.length > 0) {
                                overlay = new ViewPaneDropOverlay(pane.dropTargetElement, this.orientation ?? 0 /* Orientation.VERTICAL */, undefined, this.viewDescriptorService.getViewContainerLocation(this.viewContainer), this.themeService);
                            }
                        }
                    }
                },
                onDragOver: (e) => {
                    toggleDropEffect(e.eventData.dataTransfer, 'move', overlay !== undefined);
                },
                onDragLeave: (e) => {
                    overlay?.dispose();
                    overlay = undefined;
                },
                onDrop: (e) => {
                    if (overlay) {
                        const dropData = e.dragAndDropData.getData();
                        const viewsToMove = [];
                        let anchorView;
                        if (dropData.type === 'composite' && dropData.id !== this.viewContainer.id && !this.viewContainer.rejectAddedViews) {
                            const container = this.viewDescriptorService.getViewContainerById(dropData.id);
                            const allViews = this.viewDescriptorService.getViewContainerModel(container).allViewDescriptors;
                            if (allViews.length > 0 && !allViews.some(v => !v.canMoveView)) {
                                viewsToMove.push(...allViews);
                                anchorView = allViews[0];
                            }
                        }
                        else if (dropData.type === 'view') {
                            const oldViewContainer = this.viewDescriptorService.getViewContainerByViewId(dropData.id);
                            const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dropData.id);
                            if (oldViewContainer !== this.viewContainer && viewDescriptor && viewDescriptor.canMoveView && !this.viewContainer.rejectAddedViews) {
                                viewsToMove.push(viewDescriptor);
                            }
                            if (viewDescriptor) {
                                anchorView = viewDescriptor;
                            }
                        }
                        if (viewsToMove) {
                            this.viewDescriptorService.moveViewsToContainer(viewsToMove, this.viewContainer, undefined, 'dnd');
                        }
                        if (anchorView) {
                            if (overlay.currentDropOperation === 1 /* DropDirection.DOWN */ ||
                                overlay.currentDropOperation === 3 /* DropDirection.RIGHT */) {
                                const fromIndex = this.panes.findIndex(p => p.id === anchorView.id);
                                let toIndex = this.panes.findIndex(p => p.id === pane.id);
                                if (fromIndex >= 0 && toIndex >= 0) {
                                    if (fromIndex > toIndex) {
                                        toIndex++;
                                    }
                                    if (toIndex < this.panes.length && toIndex !== fromIndex) {
                                        this.movePane(this.panes[fromIndex], this.panes[toIndex]);
                                    }
                                }
                            }
                            if (overlay.currentDropOperation === 0 /* DropDirection.UP */ ||
                                overlay.currentDropOperation === 2 /* DropDirection.LEFT */) {
                                const fromIndex = this.panes.findIndex(p => p.id === anchorView.id);
                                let toIndex = this.panes.findIndex(p => p.id === pane.id);
                                if (fromIndex >= 0 && toIndex >= 0) {
                                    if (fromIndex < toIndex) {
                                        toIndex--;
                                    }
                                    if (toIndex >= 0 && toIndex !== fromIndex) {
                                        this.movePane(this.panes[fromIndex], this.panes[toIndex]);
                                    }
                                }
                            }
                            if (viewsToMove.length > 1) {
                                viewsToMove.slice(1).forEach(view => {
                                    let toIndex = this.panes.findIndex(p => p.id === anchorView.id);
                                    const fromIndex = this.panes.findIndex(p => p.id === view.id);
                                    if (fromIndex >= 0 && toIndex >= 0) {
                                        if (fromIndex > toIndex) {
                                            toIndex++;
                                        }
                                        if (toIndex < this.panes.length && toIndex !== fromIndex) {
                                            this.movePane(this.panes[fromIndex], this.panes[toIndex]);
                                            anchorView = view;
                                        }
                                    }
                                });
                            }
                        }
                    }
                    overlay?.dispose();
                    overlay = undefined;
                }
            }));
        }
    }
    removePanes(panes) {
        const wasMerged = this.isViewMergedWithContainer();
        panes.forEach(pane => this.removePane(pane));
        this.updateViewHeaders();
        if (wasMerged !== this.isViewMergedWithContainer()) {
            this.updateTitleArea();
        }
        this._onDidRemoveViews.fire(panes);
    }
    removePane(pane) {
        const index = this.paneItems.findIndex(i => i.pane === pane);
        if (index === -1) {
            return;
        }
        if (this.lastFocusedPane === pane) {
            this.lastFocusedPane = undefined;
        }
        assertReturnsDefined(this.paneview).removePane(pane);
        const [paneItem] = this.paneItems.splice(index, 1);
        paneItem.disposable.dispose();
    }
    movePane(from, to) {
        const fromIndex = this.paneItems.findIndex(item => item.pane === from);
        const toIndex = this.paneItems.findIndex(item => item.pane === to);
        const fromViewDescriptor = this.viewContainerModel.visibleViewDescriptors[fromIndex];
        const toViewDescriptor = this.viewContainerModel.visibleViewDescriptors[toIndex];
        if (fromIndex < 0 || fromIndex >= this.paneItems.length) {
            return;
        }
        if (toIndex < 0 || toIndex >= this.paneItems.length) {
            return;
        }
        const [paneItem] = this.paneItems.splice(fromIndex, 1);
        this.paneItems.splice(toIndex, 0, paneItem);
        assertReturnsDefined(this.paneview).movePane(from, to);
        this.viewContainerModel.move(fromViewDescriptor.id, toViewDescriptor.id);
        this.updateTitleArea();
    }
    resizePane(pane, size) {
        assertReturnsDefined(this.paneview).resizePane(pane, size);
    }
    getPaneSize(pane) {
        return assertReturnsDefined(this.paneview).getPaneSize(pane);
    }
    updateViewHeaders() {
        if (this.isViewMergedWithContainer()) {
            if (this.paneItems[0].pane.isExpanded()) {
                this.lastMergedCollapsedPane = undefined;
            }
            else {
                this.lastMergedCollapsedPane = this.paneItems[0].pane;
                this.paneItems[0].pane.setExpanded(true);
            }
            this.paneItems[0].pane.headerVisible = false;
            this.paneItems[0].pane.collapsible = true;
        }
        else {
            if (this.paneItems.length === 1) {
                this.paneItems[0].pane.headerVisible = true;
                if (this.paneItems[0].pane === this.lastMergedCollapsedPane) {
                    this.paneItems[0].pane.setExpanded(false);
                }
                this.paneItems[0].pane.collapsible = false;
            }
            else {
                this.paneItems.forEach(i => {
                    i.pane.headerVisible = true;
                    i.pane.collapsible = true;
                    if (i.pane === this.lastMergedCollapsedPane) {
                        i.pane.setExpanded(false);
                    }
                });
            }
            this.lastMergedCollapsedPane = undefined;
        }
    }
    isViewMergedWithContainer() {
        if (!(this.options.mergeViewWithContainerWhenSingleView && this.paneItems.length === 1)) {
            return false;
        }
        if (!this.areExtensionsReady) {
            if (this.visibleViewsCountFromCache === undefined) {
                return this.paneItems[0].pane.isExpanded();
            }
            // Check in cache so that view do not jump. See #29609
            return this.visibleViewsCountFromCache === 1;
        }
        return true;
    }
    onDidScrollPane() {
        for (const pane of this.panes) {
            pane.onDidScrollRoot();
        }
    }
    onDidSashReset(index) {
        let firstPane = undefined;
        let secondPane = undefined;
        // Deal with collapsed views: to be clever, we split the space taken by the nearest uncollapsed views
        for (let i = index; i >= 0; i--) {
            if (this.paneItems[i].pane?.isVisible() && this.paneItems[i]?.pane.isExpanded()) {
                firstPane = this.paneItems[i].pane;
                break;
            }
        }
        for (let i = index + 1; i < this.paneItems.length; i++) {
            if (this.paneItems[i].pane?.isVisible() && this.paneItems[i]?.pane.isExpanded()) {
                secondPane = this.paneItems[i].pane;
                break;
            }
        }
        if (firstPane && secondPane) {
            const firstPaneSize = this.getPaneSize(firstPane);
            const secondPaneSize = this.getPaneSize(secondPane);
            // Avoid rounding errors and be consistent when resizing
            // The first pane always get half rounded up and the second is half rounded down
            const newFirstPaneSize = Math.ceil((firstPaneSize + secondPaneSize) / 2);
            const newSecondPaneSize = Math.floor((firstPaneSize + secondPaneSize) / 2);
            // Shrink the larger pane first, then grow the smaller pane
            // This prevents interfering with other view sizes
            if (firstPaneSize > secondPaneSize) {
                this.resizePane(firstPane, newFirstPaneSize);
                this.resizePane(secondPane, newSecondPaneSize);
            }
            else {
                this.resizePane(secondPane, newSecondPaneSize);
                this.resizePane(firstPane, newFirstPaneSize);
            }
        }
    }
    dispose() {
        super.dispose();
        this.paneItems.forEach(i => i.disposable.dispose());
        if (this.paneview) {
            this.paneview.dispose();
        }
    }
};
ViewPaneContainer = __decorate([
    __param(2, IInstantiationService),
    __param(3, IConfigurationService),
    __param(4, IWorkbenchLayoutService),
    __param(5, IContextMenuService),
    __param(6, ITelemetryService),
    __param(7, IExtensionService),
    __param(8, IThemeService),
    __param(9, IStorageService),
    __param(10, IWorkspaceContextService),
    __param(11, IViewDescriptorService),
    __param(12, ILogService)
], ViewPaneContainer);
export { ViewPaneContainer };
export class ViewPaneContainerAction extends Action2 {
    constructor(desc) {
        super(desc);
        this.desc = desc;
    }
    run(accessor, ...args) {
        const viewPaneContainer = accessor.get(IViewsService).getActiveViewPaneContainerWithId(this.desc.viewPaneContainerId);
        if (viewPaneContainer) {
            return this.runInViewPaneContainer(accessor, viewPaneContainer, ...args);
        }
        return undefined;
    }
}
class MoveViewPosition extends Action2 {
    constructor(desc, offset) {
        super(desc);
        this.offset = offset;
    }
    async run(accessor) {
        const viewDescriptorService = accessor.get(IViewDescriptorService);
        const contextKeyService = accessor.get(IContextKeyService);
        const viewId = FocusedViewContext.getValue(contextKeyService);
        if (viewId === undefined) {
            return;
        }
        const viewContainer = viewDescriptorService.getViewContainerByViewId(viewId);
        const model = viewDescriptorService.getViewContainerModel(viewContainer);
        const viewDescriptor = model.visibleViewDescriptors.find(vd => vd.id === viewId);
        const currentIndex = model.visibleViewDescriptors.indexOf(viewDescriptor);
        if (currentIndex + this.offset < 0 || currentIndex + this.offset >= model.visibleViewDescriptors.length) {
            return;
        }
        const newPosition = model.visibleViewDescriptors[currentIndex + this.offset];
        model.move(viewDescriptor.id, newPosition.id);
    }
}
registerAction2(class MoveViewUp extends MoveViewPosition {
    constructor() {
        super({
            id: 'views.moveViewUp',
            title: nls.localize('viewMoveUp', "Move View Up"),
            keybinding: {
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ + 41 /* KeyCode.KeyK */, 16 /* KeyCode.UpArrow */),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                when: FocusedViewContext.notEqualsTo('')
            }
        }, -1);
    }
});
registerAction2(class MoveViewLeft extends MoveViewPosition {
    constructor() {
        super({
            id: 'views.moveViewLeft',
            title: nls.localize('viewMoveLeft', "Move View Left"),
            keybinding: {
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ + 41 /* KeyCode.KeyK */, 15 /* KeyCode.LeftArrow */),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                when: FocusedViewContext.notEqualsTo('')
            }
        }, -1);
    }
});
registerAction2(class MoveViewDown extends MoveViewPosition {
    constructor() {
        super({
            id: 'views.moveViewDown',
            title: nls.localize('viewMoveDown', "Move View Down"),
            keybinding: {
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ + 41 /* KeyCode.KeyK */, 18 /* KeyCode.DownArrow */),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                when: FocusedViewContext.notEqualsTo('')
            }
        }, 1);
    }
});
registerAction2(class MoveViewRight extends MoveViewPosition {
    constructor() {
        super({
            id: 'views.moveViewRight',
            title: nls.localize('viewMoveRight', "Move View Right"),
            keybinding: {
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ + 41 /* KeyCode.KeyK */, 17 /* KeyCode.RightArrow */),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                when: FocusedViewContext.notEqualsTo('')
            }
        }, 1);
    }
});
registerAction2(class MoveViews extends Action2 {
    constructor() {
        super({
            id: 'vscode.moveViews',
            title: nls.localize('viewsMove', "Move Views"),
        });
    }
    async run(accessor, options) {
        if (!Array.isArray(options?.viewIds) || typeof options?.destinationId !== 'string') {
            return Promise.reject('Invalid arguments');
        }
        const viewDescriptorService = accessor.get(IViewDescriptorService);
        const destination = viewDescriptorService.getViewContainerById(options.destinationId);
        if (!destination) {
            return;
        }
        // FYI, don't use `moveViewsToContainer` in 1 shot, because it expects all views to have the same current location
        for (const viewId of options.viewIds) {
            const viewDescriptor = viewDescriptorService.getViewDescriptorById(viewId);
            if (viewDescriptor?.canMoveView) {
                viewDescriptorService.moveViewsToContainer([viewDescriptor], destination, ViewVisibilityState.Default, this.desc.id);
            }
        }
        await accessor.get(IViewsService).openViewContainer(destination.id, true);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld1BhbmVDb250YWluZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZUNvbnRhaW5lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFhLG1CQUFtQixFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0ksT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFNBQVMsSUFBSSxjQUFjLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFHekYsT0FBTyxFQUFvQixRQUFRLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUUvRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQW1CLE1BQU0scUNBQXFDLENBQUM7QUFDaEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN0SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RSxPQUFPLHlCQUF5QixDQUFDO0FBQ2pDLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDdkcsT0FBTyxFQUFFLE9BQU8sRUFBaUMsTUFBTSxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvSSxP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