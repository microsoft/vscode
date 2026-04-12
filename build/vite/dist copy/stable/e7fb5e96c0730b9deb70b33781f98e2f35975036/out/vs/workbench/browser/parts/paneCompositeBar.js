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
var ViewContainerActivityAction_1;
import { localize } from '../../../nls.js';
import { IActivityService } from '../../services/activity/common/activity.js';
import { IWorkbenchLayoutService } from '../../services/layout/browser/layoutService.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { DisposableStore, Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { CompositeBar, CompositeDragAndDrop } from './compositeBar.js';
import { Dimension, isMouseEvent } from '../../../base/browser/dom.js';
import { createCSSRule } from '../../../base/browser/domStylesheets.js';
import { asCSSUrl } from '../../../base/browser/cssValue.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { URI } from '../../../base/common/uri.js';
import { ToggleCompositePinnedAction, ToggleCompositeBadgeAction, CompositeBarAction } from './compositeBarActions.js';
import { IViewDescriptorService } from '../../common/views.js';
import { IContextKeyService, ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { isString } from '../../../base/common/types.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { isNative } from '../../../base/common/platform.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { Separator, SubmenuAction, toAction } from '../../../base/common/actions.js';
import { StringSHA1 } from '../../../base/common/hash.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IViewsService } from '../../services/views/common/viewsService.js';
let PaneCompositeBar = class PaneCompositeBar extends Disposable {
    constructor(location, options, part, paneCompositePart, instantiationService, storageService, extensionService, viewDescriptorService, viewService, contextKeyService, environmentService, layoutService) {
        super();
        this.location = location;
        this.options = options;
        this.part = part;
        this.paneCompositePart = paneCompositePart;
        this.instantiationService = instantiationService;
        this.storageService = storageService;
        this.extensionService = extensionService;
        this.viewDescriptorService = viewDescriptorService;
        this.viewService = viewService;
        this.contextKeyService = contextKeyService;
        this.environmentService = environmentService;
        this.layoutService = layoutService;
        this.viewContainerDisposables = this._register(new DisposableMap());
        this.compositeActions = new Map();
        this.hasExtensionsRegistered = false;
        this._cachedViewContainers = undefined;
        this.dndHandler = new CompositeDragAndDrop(this.viewDescriptorService, this.location, this.options.orientation, async (id, focus) => { return await this.paneCompositePart.openPaneComposite(id, focus) ?? null; }, (from, to, before) => this.compositeBar.move(from, to, this.options.orientation === 1 /* ActionsOrientation.VERTICAL */ ? before?.verticallyBefore : before?.horizontallyBefore), () => this.compositeBar.getCompositeBarItems());
        const cachedItems = this.cachedViewContainers
            .map(container => ({
            id: container.id,
            name: container.name,
            visible: !this.shouldBeHidden(container.id, container),
            order: container.order,
            pinned: container.pinned,
        }));
        this.compositeBar = this.createCompositeBar(cachedItems);
        this.onDidRegisterViewContainers(this.getViewContainers());
        this.registerListeners();
    }
    createCompositeBar(cachedItems) {
        return this._register(this.instantiationService.createInstance(CompositeBar, cachedItems, {
            icon: this.options.icon,
            compact: this.options.compact,
            orientation: this.options.orientation,
            activityHoverOptions: this.options.activityHoverOptions,
            preventLoopNavigation: this.options.preventLoopNavigation,
            openComposite: async (compositeId, preserveFocus) => {
                return (await this.paneCompositePart.openPaneComposite(compositeId, !preserveFocus)) ?? null;
            },
            getActivityAction: compositeId => this.getCompositeActions(compositeId).activityAction,
            getCompositePinnedAction: compositeId => this.getCompositeActions(compositeId).pinnedAction,
            getCompositeBadgeAction: compositeId => this.getCompositeActions(compositeId).badgeAction,
            getOnCompositeClickAction: compositeId => this.getCompositeActions(compositeId).activityAction,
            fillExtraContextMenuActions: (actions, e) => this.options.fillExtraContextMenuActions(actions, e),
            getContextMenuActionsForComposite: compositeId => this.getContextMenuActionsForComposite(compositeId),
            getDefaultCompositeId: () => this.viewDescriptorService.getDefaultViewContainer(this.location)?.id,
            dndHandler: this.dndHandler,
            compositeSize: this.options.compositeSize,
            overflowActionSize: this.options.overflowActionSize,
            colors: theme => this.options.colors(theme),
        }));
    }
    getContextMenuActionsForComposite(compositeId) {
        const actions = [new Separator()];
        const viewContainer = this.viewDescriptorService.getViewContainerById(compositeId);
        const defaultLocation = this.viewDescriptorService.getDefaultViewContainerLocation(viewContainer);
        const currentLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
        // Move View Container
        const moveActions = [];
        for (const location of [0 /* ViewContainerLocation.Sidebar */, 2 /* ViewContainerLocation.AuxiliaryBar */, 1 /* ViewContainerLocation.Panel */]) {
            if (currentLocation !== location) {
                moveActions.push(this.createMoveAction(viewContainer, location, defaultLocation));
            }
        }
        actions.push(new SubmenuAction('moveToMenu', localize('moveToMenu', "Move To"), moveActions));
        // Reset Location
        if (defaultLocation !== currentLocation) {
            actions.push(toAction({
                id: 'resetLocationAction', label: localize('resetLocation', "Reset Location"), run: () => {
                    this.viewDescriptorService.moveViewContainerToLocation(viewContainer, defaultLocation, undefined, 'resetLocationAction');
                    this.viewService.openViewContainer(viewContainer.id, true);
                }
            }));
        }
        else {
            const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
            if (viewContainerModel.allViewDescriptors.length === 1) {
                const viewToReset = viewContainerModel.allViewDescriptors[0];
                const defaultContainer = this.viewDescriptorService.getDefaultContainerById(viewToReset.id);
                if (defaultContainer !== viewContainer) {
                    actions.push(toAction({
                        id: 'resetLocationAction', label: localize('resetLocation', "Reset Location"), run: () => {
                            this.viewDescriptorService.moveViewsToContainer([viewToReset], defaultContainer, undefined, 'resetLocationAction');
                            this.viewService.openViewContainer(viewContainer.id, true);
                        }
                    }));
                }
            }
        }
        return actions;
    }
    createMoveAction(viewContainer, newLocation, defaultLocation) {
        return toAction({
            id: `moveViewContainerTo${newLocation}`,
            label: newLocation === 1 /* ViewContainerLocation.Panel */ ? localize('panel', "Panel") : newLocation === 0 /* ViewContainerLocation.Sidebar */ ? localize('sidebar', "Primary Side Bar") : localize('auxiliarybar', "Secondary Side Bar"),
            run: () => {
                let index;
                if (newLocation !== defaultLocation) {
                    index = this.viewDescriptorService.getViewContainersByLocation(newLocation).length; // move to the end of the location
                }
                else {
                    index = undefined; // restore default location
                }
                this.viewDescriptorService.moveViewContainerToLocation(viewContainer, newLocation, index);
                this.viewService.openViewContainer(viewContainer.id, true);
            }
        });
    }
    registerListeners() {
        // View Container Changes
        this._register(this.viewDescriptorService.onDidChangeViewContainers(({ added, removed }) => this.onDidChangeViewContainers(added, removed)));
        this._register(this.viewDescriptorService.onDidChangeContainerLocation(({ viewContainer, from, to }) => this.onDidChangeViewContainerLocation(viewContainer, from, to)));
        // View Container Visibility Changes
        this._register(this.paneCompositePart.onDidPaneCompositeOpen(e => this.onDidChangeViewContainerVisibility(e.getId(), true)));
        this._register(this.paneCompositePart.onDidPaneCompositeClose(e => this.onDidChangeViewContainerVisibility(e.getId(), false)));
        // Extension registration
        this.extensionService.whenInstalledExtensionsRegistered().then(() => {
            if (this._store.isDisposed) {
                return;
            }
            this.onDidRegisterExtensions();
            this._register(this.compositeBar.onDidChange(() => {
                this.updateCompositeBarItemsFromStorage(true);
                this.saveCachedViewContainers();
            }));
            this._register(this.storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, this.options.pinnedViewContainersKey, this._store)(() => this.updateCompositeBarItemsFromStorage(false)));
        });
    }
    onDidChangeViewContainers(added, removed) {
        removed.filter(({ location }) => location === this.location).forEach(({ container }) => this.onDidDeregisterViewContainer(container));
        this.onDidRegisterViewContainers(added.filter(({ location }) => location === this.location).map(({ container }) => container));
    }
    onDidChangeViewContainerLocation(container, from, to) {
        if (from === this.location) {
            this.onDidDeregisterViewContainer(container);
        }
        if (to === this.location) {
            this.onDidRegisterViewContainers([container]);
        }
    }
    onDidChangeViewContainerVisibility(id, visible) {
        if (visible) {
            // Activate view container action on opening of a view container
            this.onDidViewContainerVisible(id);
        }
        else {
            // Deactivate view container action on close
            this.compositeBar.deactivateComposite(id);
        }
    }
    onDidRegisterExtensions() {
        this.hasExtensionsRegistered = true;
        // show/hide/remove composites
        for (const { id } of this.cachedViewContainers) {
            const viewContainer = this.getViewContainer(id);
            if (viewContainer) {
                this.showOrHideViewContainer(viewContainer);
            }
            else {
                if (this.viewDescriptorService.isViewContainerRemovedPermanently(id)) {
                    this.removeComposite(id);
                }
                else {
                    this.hideComposite(id);
                }
            }
        }
        this.saveCachedViewContainers();
    }
    onDidViewContainerVisible(id) {
        const viewContainer = this.getViewContainer(id);
        if (viewContainer) {
            // Update the composite bar by adding
            this.addComposite(viewContainer);
            this.compositeBar.activateComposite(viewContainer.id);
            if (this.shouldBeHidden(viewContainer)) {
                const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
                if (viewContainerModel.activeViewDescriptors.length === 0) {
                    // Update the composite bar by hiding
                    this.hideComposite(viewContainer.id);
                }
            }
        }
    }
    create(parent) {
        return this.compositeBar.create(parent);
    }
    getCompositeActions(compositeId) {
        let compositeActions = this.compositeActions.get(compositeId);
        if (!compositeActions) {
            const viewContainer = this.getViewContainer(compositeId);
            if (viewContainer) {
                const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
                compositeActions = {
                    activityAction: this._register(this.instantiationService.createInstance(ViewContainerActivityAction, this.toCompositeBarActionItemFrom(viewContainerModel), this.part, this.paneCompositePart)),
                    pinnedAction: this._register(new ToggleCompositePinnedAction(this.toCompositeBarActionItemFrom(viewContainerModel), this.compositeBar)),
                    badgeAction: this._register(new ToggleCompositeBadgeAction(this.toCompositeBarActionItemFrom(viewContainerModel), this.compositeBar))
                };
            }
            else {
                const cachedComposite = this.cachedViewContainers.filter(c => c.id === compositeId)[0];
                compositeActions = {
                    activityAction: this._register(this.instantiationService.createInstance(PlaceHolderViewContainerActivityAction, this.toCompositeBarActionItem(compositeId, cachedComposite?.name ?? compositeId, cachedComposite?.icon, undefined), this.part, this.paneCompositePart)),
                    pinnedAction: this._register(new PlaceHolderToggleCompositePinnedAction(compositeId, this.compositeBar)),
                    badgeAction: this._register(new PlaceHolderToggleCompositeBadgeAction(compositeId, this.compositeBar))
                };
            }
            this.compositeActions.set(compositeId, compositeActions);
        }
        return compositeActions;
    }
    onDidRegisterViewContainers(viewContainers) {
        for (const viewContainer of viewContainers) {
            this.addComposite(viewContainer);
            // Pin it by default if it is new
            const cachedViewContainer = this.cachedViewContainers.filter(({ id }) => id === viewContainer.id)[0];
            if (!cachedViewContainer) {
                this.compositeBar.pin(viewContainer.id);
            }
            // Active
            const visibleViewContainer = this.paneCompositePart.getActivePaneComposite();
            if (visibleViewContainer?.getId() === viewContainer.id) {
                this.compositeBar.activateComposite(viewContainer.id);
            }
            const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
            this.updateCompositeBarActionItem(viewContainer, viewContainerModel);
            this.showOrHideViewContainer(viewContainer);
            const disposables = new DisposableStore();
            disposables.add(viewContainerModel.onDidChangeContainerInfo(() => this.updateCompositeBarActionItem(viewContainer, viewContainerModel)));
            disposables.add(viewContainerModel.onDidChangeActiveViewDescriptors(() => this.showOrHideViewContainer(viewContainer)));
            this.viewContainerDisposables.set(viewContainer.id, disposables);
        }
    }
    onDidDeregisterViewContainer(viewContainer) {
        this.viewContainerDisposables.deleteAndDispose(viewContainer.id);
        this.removeComposite(viewContainer.id);
    }
    updateCompositeBarActionItem(viewContainer, viewContainerModel) {
        const compositeBarActionItem = this.toCompositeBarActionItemFrom(viewContainerModel);
        const { activityAction, pinnedAction } = this.getCompositeActions(viewContainer.id);
        activityAction.updateCompositeBarActionItem(compositeBarActionItem);
        if (pinnedAction instanceof PlaceHolderToggleCompositePinnedAction) {
            pinnedAction.setActivity(compositeBarActionItem);
        }
        if (this.options.recomputeSizes) {
            this.compositeBar.recomputeSizes();
        }
        this.saveCachedViewContainers();
    }
    toCompositeBarActionItemFrom(viewContainerModel) {
        return this.toCompositeBarActionItem(viewContainerModel.viewContainer.id, viewContainerModel.title, viewContainerModel.icon, viewContainerModel.keybindingId);
    }
    toCompositeBarActionItem(id, name, icon, keybindingId) {
        let classNames = undefined;
        let iconUrl = undefined;
        if (this.options.icon) {
            if (URI.isUri(icon)) {
                iconUrl = icon;
                const cssUrl = asCSSUrl(icon);
                const hash = new StringSHA1();
                hash.update(cssUrl);
                const iconId = `activity-${id.replace(/\./g, '-')}-${hash.digest()}`;
                const iconClass = `.monaco-workbench .${this.options.partContainerClass} .monaco-action-bar .action-label.${iconId}`;
                classNames = [iconId, 'uri-icon'];
                createCSSRule(iconClass, `
				mask: ${cssUrl} no-repeat 50% 50%;
				mask-size: var(--activity-bar-icon-size, ${this.options.iconSize}px);
				-webkit-mask: ${cssUrl} no-repeat 50% 50%;
				-webkit-mask-size: var(--activity-bar-icon-size, ${this.options.iconSize}px);
				mask-origin: padding;
				-webkit-mask-origin: padding;
			`);
            }
            else if (ThemeIcon.isThemeIcon(icon)) {
                classNames = ThemeIcon.asClassNameArray(icon);
            }
        }
        return { id, name, classNames, iconUrl, keybindingId };
    }
    showOrHideViewContainer(viewContainer) {
        if (this.shouldBeHidden(viewContainer)) {
            this.hideComposite(viewContainer.id);
        }
        else {
            this.addComposite(viewContainer);
            // Activate if this is the active pane composite
            const activePaneComposite = this.paneCompositePart.getActivePaneComposite();
            if (activePaneComposite?.getId() === viewContainer.id) {
                this.compositeBar.activateComposite(viewContainer.id);
            }
        }
    }
    shouldBeHidden(viewContainerOrId, cachedViewContainer) {
        const viewContainer = isString(viewContainerOrId) ? this.getViewContainer(viewContainerOrId) : viewContainerOrId;
        const viewContainerId = isString(viewContainerOrId) ? viewContainerOrId : viewContainerOrId.id;
        if (viewContainer) {
            if (viewContainer.hideIfEmpty) {
                if (this.viewService.isViewContainerActive(viewContainerId)) {
                    return false;
                }
            }
            else {
                return false;
            }
        }
        // Check cache only if extensions are not yet registered and current window is not native (desktop) remote connection window
        if (!this.hasExtensionsRegistered && !(this.part === "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */ && this.environmentService.remoteAuthority && isNative)) {
            cachedViewContainer = cachedViewContainer || this.cachedViewContainers.find(({ id }) => id === viewContainerId);
            // Show builtin ViewContainer if not registered yet
            if (!viewContainer && cachedViewContainer?.isBuiltin && cachedViewContainer?.visible) {
                return false;
            }
            if (cachedViewContainer?.views?.length) {
                return cachedViewContainer.views.every(({ when }) => !!when && !this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(when)));
            }
        }
        return true;
    }
    addComposite(viewContainer) {
        this.compositeBar.addComposite({ id: viewContainer.id, name: typeof viewContainer.title === 'string' ? viewContainer.title : viewContainer.title.value, order: viewContainer.order, requestedIndex: viewContainer.requestedIndex });
    }
    hideComposite(compositeId) {
        this.compositeBar.hideComposite(compositeId);
        const compositeActions = this.compositeActions.get(compositeId);
        if (compositeActions) {
            compositeActions.activityAction.dispose();
            compositeActions.pinnedAction.dispose();
            this.compositeActions.delete(compositeId);
        }
    }
    removeComposite(compositeId) {
        this.compositeBar.removeComposite(compositeId);
        const compositeActions = this.compositeActions.get(compositeId);
        if (compositeActions) {
            compositeActions.activityAction.dispose();
            compositeActions.pinnedAction.dispose();
            this.compositeActions.delete(compositeId);
        }
    }
    getPinnedPaneCompositeIds() {
        const pinnedCompositeIds = this.compositeBar.getPinnedComposites().map(v => v.id);
        return this.getViewContainers()
            .filter(v => this.compositeBar.isPinned(v.id))
            .sort((v1, v2) => pinnedCompositeIds.indexOf(v1.id) - pinnedCompositeIds.indexOf(v2.id))
            .map(v => v.id);
    }
    getVisiblePaneCompositeIds() {
        return this.compositeBar.getVisibleComposites()
            .filter(v => this.paneCompositePart.getActivePaneComposite()?.getId() === v.id || this.compositeBar.isPinned(v.id))
            .map(v => v.id);
    }
    getPaneCompositeIds() {
        return this.compositeBar.getVisibleComposites()
            .map(v => v.id);
    }
    getContextMenuActions() {
        return this.compositeBar.getContextMenuActions();
    }
    focus(index) {
        this.compositeBar.focus(index);
    }
    layout(width, height) {
        this.compositeBar.layout(new Dimension(width, height));
    }
    getViewContainer(id) {
        const viewContainer = this.viewDescriptorService.getViewContainerById(id);
        return viewContainer && this.viewDescriptorService.getViewContainerLocation(viewContainer) === this.location ? viewContainer : undefined;
    }
    getViewContainers() {
        return this.viewDescriptorService.getViewContainersByLocation(this.location);
    }
    updateCompositeBarItemsFromStorage(retainExisting) {
        if (this.pinnedViewContainersValue === this.getStoredPinnedViewContainersValue()) {
            return;
        }
        this._placeholderViewContainersValue = undefined;
        this._pinnedViewContainersValue = undefined;
        this._cachedViewContainers = undefined;
        const newCompositeItems = [];
        const compositeItems = this.compositeBar.getCompositeBarItems();
        for (const cachedViewContainer of this.cachedViewContainers) {
            newCompositeItems.push({
                id: cachedViewContainer.id,
                name: cachedViewContainer.name,
                order: cachedViewContainer.order,
                pinned: cachedViewContainer.pinned,
                visible: cachedViewContainer.visible && !!this.getViewContainer(cachedViewContainer.id),
            });
        }
        for (const viewContainer of this.getViewContainers()) {
            // Add missing view containers
            if (!newCompositeItems.some(({ id }) => id === viewContainer.id)) {
                const index = compositeItems.findIndex(({ id }) => id === viewContainer.id);
                if (index !== -1) {
                    const compositeItem = compositeItems[index];
                    newCompositeItems.splice(index, 0, {
                        id: viewContainer.id,
                        name: typeof viewContainer.title === 'string' ? viewContainer.title : viewContainer.title.value,
                        order: compositeItem.order,
                        pinned: compositeItem.pinned,
                        visible: compositeItem.visible,
                    });
                }
                else {
                    newCompositeItems.push({
                        id: viewContainer.id,
                        name: typeof viewContainer.title === 'string' ? viewContainer.title : viewContainer.title.value,
                        order: viewContainer.order,
                        pinned: true,
                        visible: !this.shouldBeHidden(viewContainer),
                    });
                }
            }
        }
        if (retainExisting) {
            for (const compositeItem of compositeItems) {
                const newCompositeItem = newCompositeItems.find(({ id }) => id === compositeItem.id);
                if (!newCompositeItem) {
                    newCompositeItems.push(compositeItem);
                }
            }
        }
        this.compositeBar.setCompositeBarItems(newCompositeItems);
    }
    saveCachedViewContainers() {
        const state = [];
        const compositeItems = this.compositeBar.getCompositeBarItems();
        for (const compositeItem of compositeItems) {
            const viewContainer = this.getViewContainer(compositeItem.id);
            if (viewContainer) {
                const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
                const views = [];
                for (const { when } of viewContainerModel.allViewDescriptors) {
                    views.push({ when: when ? when.serialize() : undefined });
                }
                state.push({
                    id: compositeItem.id,
                    name: viewContainerModel.title,
                    icon: URI.isUri(viewContainerModel.icon) && this.environmentService.remoteAuthority ? undefined : viewContainerModel.icon, // Do not cache uri icons with remote connection
                    views,
                    pinned: compositeItem.pinned,
                    order: compositeItem.order,
                    visible: compositeItem.visible,
                    isBuiltin: !viewContainer.extensionId
                });
            }
            else {
                state.push({ id: compositeItem.id, name: compositeItem.name, pinned: compositeItem.pinned, order: compositeItem.order, visible: false, isBuiltin: false });
            }
        }
        this.storeCachedViewContainersState(state);
    }
    get cachedViewContainers() {
        if (this._cachedViewContainers === undefined) {
            this._cachedViewContainers = this.getPinnedViewContainers();
            for (const placeholderViewContainer of this.getPlaceholderViewContainers()) {
                const cachedViewContainer = this._cachedViewContainers.find(cached => cached.id === placeholderViewContainer.id);
                if (cachedViewContainer) {
                    cachedViewContainer.visible = placeholderViewContainer.visible ?? cachedViewContainer.visible;
                    cachedViewContainer.name = placeholderViewContainer.name;
                    cachedViewContainer.icon = placeholderViewContainer.themeIcon ? placeholderViewContainer.themeIcon :
                        placeholderViewContainer.iconUrl ? URI.revive(placeholderViewContainer.iconUrl) : undefined;
                    if (URI.isUri(cachedViewContainer.icon) && this.environmentService.remoteAuthority) {
                        cachedViewContainer.icon = undefined; // Do not cache uri icons with remote connection
                    }
                    cachedViewContainer.views = placeholderViewContainer.views;
                    cachedViewContainer.isBuiltin = placeholderViewContainer.isBuiltin;
                }
            }
            for (const viewContainerWorkspaceState of this.getViewContainersWorkspaceState()) {
                const cachedViewContainer = this._cachedViewContainers.find(cached => cached.id === viewContainerWorkspaceState.id);
                if (cachedViewContainer) {
                    cachedViewContainer.visible = viewContainerWorkspaceState.visible ?? cachedViewContainer.visible;
                }
            }
        }
        return this._cachedViewContainers;
    }
    storeCachedViewContainersState(cachedViewContainers) {
        const pinnedViewContainers = this.getPinnedViewContainers();
        this.setPinnedViewContainers(cachedViewContainers.map(({ id, pinned, order }) => ({
            id,
            pinned,
            visible: Boolean(pinnedViewContainers.find(({ id: pinnedId }) => pinnedId === id)?.visible),
            order
        })));
        this.setPlaceholderViewContainers(cachedViewContainers.map(({ id, icon, name, views, isBuiltin }) => ({
            id,
            iconUrl: URI.isUri(icon) ? icon : undefined,
            themeIcon: ThemeIcon.isThemeIcon(icon) ? icon : undefined,
            name,
            isBuiltin,
            views
        })));
        this.setViewContainersWorkspaceState(cachedViewContainers.map(({ id, visible }) => ({
            id,
            visible,
        })));
    }
    getPinnedViewContainers() {
        return JSON.parse(this.pinnedViewContainersValue);
    }
    setPinnedViewContainers(pinnedViewContainers) {
        this.pinnedViewContainersValue = JSON.stringify(pinnedViewContainers);
    }
    get pinnedViewContainersValue() {
        if (!this._pinnedViewContainersValue) {
            this._pinnedViewContainersValue = this.getStoredPinnedViewContainersValue();
        }
        return this._pinnedViewContainersValue;
    }
    set pinnedViewContainersValue(pinnedViewContainersValue) {
        if (this.pinnedViewContainersValue !== pinnedViewContainersValue) {
            this._pinnedViewContainersValue = pinnedViewContainersValue;
            this.setStoredPinnedViewContainersValue(pinnedViewContainersValue);
        }
    }
    getStoredPinnedViewContainersValue() {
        return this.storageService.get(this.options.pinnedViewContainersKey, 0 /* StorageScope.PROFILE */, '[]');
    }
    setStoredPinnedViewContainersValue(value) {
        this.storageService.store(this.options.pinnedViewContainersKey, value, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
    getPlaceholderViewContainers() {
        return JSON.parse(this.placeholderViewContainersValue);
    }
    setPlaceholderViewContainers(placeholderViewContainers) {
        this.placeholderViewContainersValue = JSON.stringify(placeholderViewContainers);
    }
    get placeholderViewContainersValue() {
        if (!this._placeholderViewContainersValue) {
            this._placeholderViewContainersValue = this.getStoredPlaceholderViewContainersValue();
        }
        return this._placeholderViewContainersValue;
    }
    set placeholderViewContainersValue(placeholderViewContainesValue) {
        if (this.placeholderViewContainersValue !== placeholderViewContainesValue) {
            this._placeholderViewContainersValue = placeholderViewContainesValue;
            this.setStoredPlaceholderViewContainersValue(placeholderViewContainesValue);
        }
    }
    getStoredPlaceholderViewContainersValue() {
        return this.storageService.get(this.options.placeholderViewContainersKey, 0 /* StorageScope.PROFILE */, '[]');
    }
    setStoredPlaceholderViewContainersValue(value) {
        this.storageService.store(this.options.placeholderViewContainersKey, value, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
    getViewContainersWorkspaceState() {
        return JSON.parse(this.viewContainersWorkspaceStateValue);
    }
    setViewContainersWorkspaceState(viewContainersWorkspaceState) {
        this.viewContainersWorkspaceStateValue = JSON.stringify(viewContainersWorkspaceState);
    }
    get viewContainersWorkspaceStateValue() {
        if (!this._viewContainersWorkspaceStateValue) {
            this._viewContainersWorkspaceStateValue = this.getStoredViewContainersWorkspaceStateValue();
        }
        return this._viewContainersWorkspaceStateValue;
    }
    set viewContainersWorkspaceStateValue(viewContainersWorkspaceStateValue) {
        if (this.viewContainersWorkspaceStateValue !== viewContainersWorkspaceStateValue) {
            this._viewContainersWorkspaceStateValue = viewContainersWorkspaceStateValue;
            this.setStoredViewContainersWorkspaceStateValue(viewContainersWorkspaceStateValue);
        }
    }
    getStoredViewContainersWorkspaceStateValue() {
        return this.storageService.get(this.options.viewContainersWorkspaceStateKey, 1 /* StorageScope.WORKSPACE */, '[]');
    }
    setStoredViewContainersWorkspaceStateValue(value) {
        this.storageService.store(this.options.viewContainersWorkspaceStateKey, value, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
};
PaneCompositeBar = __decorate([
    __param(4, IInstantiationService),
    __param(5, IStorageService),
    __param(6, IExtensionService),
    __param(7, IViewDescriptorService),
    __param(8, IViewsService),
    __param(9, IContextKeyService),
    __param(10, IWorkbenchEnvironmentService),
    __param(11, IWorkbenchLayoutService)
], PaneCompositeBar);
export { PaneCompositeBar };
let ViewContainerActivityAction = class ViewContainerActivityAction extends CompositeBarAction {
    static { ViewContainerActivityAction_1 = this; }
    static { this.preventDoubleClickDelay = 300; }
    constructor(compositeBarActionItem, part, paneCompositePart, layoutService, configurationService, activityService) {
        super(compositeBarActionItem);
        this.part = part;
        this.paneCompositePart = paneCompositePart;
        this.layoutService = layoutService;
        this.configurationService = configurationService;
        this.activityService = activityService;
        this.lastRun = 0;
        this.updateActivity();
        this._register(this.activityService.onDidChangeActivity(viewContainerOrAction => {
            if (!isString(viewContainerOrAction) && viewContainerOrAction.id === this.compositeBarActionItem.id) {
                this.updateActivity();
            }
        }));
    }
    updateCompositeBarActionItem(compositeBarActionItem) {
        this.compositeBarActionItem = compositeBarActionItem;
    }
    updateActivity() {
        this.activities = this.activityService.getViewContainerActivities(this.compositeBarActionItem.id);
    }
    async run(event) {
        if (isMouseEvent(event) && event.button === 2) {
            return; // do not run on right click
        }
        // prevent accident trigger on a doubleclick (to help nervous people)
        const now = Date.now();
        if (now > this.lastRun /* https://github.com/microsoft/vscode/issues/25830 */ && now - this.lastRun < ViewContainerActivityAction_1.preventDoubleClickDelay) {
            return;
        }
        this.lastRun = now;
        const focus = (event && 'preserveFocus' in event) ? !event.preserveFocus : true;
        if (this.part === "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */) {
            const sideBarVisible = this.layoutService.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
            const activeViewlet = this.paneCompositePart.getActivePaneComposite();
            const focusBehavior = this.configurationService.getValue('workbench.activityBar.iconClickBehavior');
            if (sideBarVisible && activeViewlet?.getId() === this.compositeBarActionItem.id) {
                switch (focusBehavior) {
                    case 'focus':
                        this.paneCompositePart.openPaneComposite(this.compositeBarActionItem.id, focus);
                        break;
                    case 'toggle':
                    default:
                        // Hide sidebar if selected viewlet already visible
                        this.layoutService.setPartHidden(true, "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
                        break;
                }
                return;
            }
        }
        await this.paneCompositePart.openPaneComposite(this.compositeBarActionItem.id, focus);
        return this.activate();
    }
};
ViewContainerActivityAction = ViewContainerActivityAction_1 = __decorate([
    __param(3, IWorkbenchLayoutService),
    __param(4, IConfigurationService),
    __param(5, IActivityService)
], ViewContainerActivityAction);
class PlaceHolderViewContainerActivityAction extends ViewContainerActivityAction {
}
class PlaceHolderToggleCompositePinnedAction extends ToggleCompositePinnedAction {
    constructor(id, compositeBar) {
        super({ id, name: id, classNames: undefined }, compositeBar);
    }
    setActivity(activity) {
        this.label = activity.name;
    }
}
class PlaceHolderToggleCompositeBadgeAction extends ToggleCompositeBadgeAction {
    constructor(id, compositeBar) {
        super({ id, name: id, classNames: undefined }, compositeBar);
    }
    setCompositeBarActionItem(actionItem) {
        this.label = actionItem.name;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFuZUNvbXBvc2l0ZUJhci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3BhbmVDb21wb3NpdGVCYXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUUzQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsdUJBQXVCLEVBQVMsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQWUsZUFBZSxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUU1RyxPQUFPLEVBQUUsWUFBWSxFQUFxQixvQkFBb0IsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzFGLE9BQU8sRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDdkUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLDZDQUE2QyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sNkJBQTZCLENBQUM7QUFDakUsT0FBTyxFQUFFLDJCQUEyQixFQUE4QywwQkFBMEIsRUFBRSxrQkFBa0IsRUFBMEMsTUFBTSwwQkFBMEIsQ0FBQztBQUMzTSxPQUFPLEVBQUUsc0JBQXNCLEVBQTZELE1BQU0sdUJBQXVCLENBQUM7QUFDMUgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN2RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFNUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlELE9BQU8sRUFBVyxTQUFTLEVBQUUsYUFBYSxFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzlGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUcxRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUF1RHJFLElBQU0sZ0JBQWdCLEdBQXRCLE1BQU0sZ0JBQWlCLFNBQVEsVUFBVTtJQVUvQyxZQUNrQixRQUErQixFQUM3QixPQUFpQyxFQUNqQyxJQUFXLEVBQ2IsaUJBQXFDLEVBQy9CLG9CQUE4RCxFQUNwRSxjQUFnRCxFQUM5QyxnQkFBb0QsRUFDL0MscUJBQThELEVBQ3ZFLFdBQTJDLEVBQ3RDLGlCQUF3RCxFQUM5QyxrQkFBaUUsRUFDdEUsYUFBeUQ7UUFFbEYsS0FBSyxFQUFFLENBQUM7UUFiUyxhQUFRLEdBQVIsUUFBUSxDQUF1QjtRQUM3QixZQUFPLEdBQVAsT0FBTyxDQUEwQjtRQUNqQyxTQUFJLEdBQUosSUFBSSxDQUFPO1FBQ2Isc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUNaLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDbkQsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBQzdCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFDOUIsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF3QjtRQUN0RCxnQkFBVyxHQUFYLFdBQVcsQ0FBZTtRQUNuQixzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBQzdCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBOEI7UUFDbkQsa0JBQWEsR0FBYixhQUFhLENBQXlCO1FBcEJsRSw2QkFBd0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksYUFBYSxFQUF1QixDQUFDLENBQUM7UUFJcEYscUJBQWdCLEdBQUcsSUFBSSxHQUFHLEVBQStJLENBQUM7UUFFbkwsNEJBQXVCLEdBQVksS0FBSyxDQUFDO1FBd2dCekMsMEJBQXFCLEdBQXVDLFNBQVMsQ0FBQztRQXRmN0UsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUM3RyxLQUFLLEVBQUUsRUFBVSxFQUFFLEtBQWUsRUFBRSxFQUFFLEdBQUcsT0FBTyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUNwSCxDQUFDLElBQVksRUFBRSxFQUFVLEVBQUUsTUFBaUIsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsd0NBQWdDLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLGtCQUFrQixDQUFDLEVBQ25NLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsb0JBQW9CLEVBQUUsQ0FDOUMsQ0FBQztRQUVGLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxvQkFBb0I7YUFDM0MsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNsQixFQUFFLEVBQUUsU0FBUyxDQUFDLEVBQUU7WUFDaEIsSUFBSSxFQUFFLFNBQVMsQ0FBQyxJQUFJO1lBQ3BCLE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxTQUFTLENBQUM7WUFDdEQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxLQUFLO1lBQ3RCLE1BQU0sRUFBRSxTQUFTLENBQUMsTUFBTTtTQUN4QixDQUFDLENBQUMsQ0FBQztRQUNMLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3pELElBQUksQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1FBQzNELElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFFTyxrQkFBa0IsQ0FBQyxXQUFnQztRQUMxRCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxZQUFZLEVBQUUsV0FBVyxFQUFFO1lBQ3pGLElBQUksRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUk7WUFDdkIsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTztZQUM3QixXQUFXLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ3JDLG9CQUFvQixFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsb0JBQW9CO1lBQ3ZELHFCQUFxQixFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMscUJBQXFCO1lBQ3pELGFBQWEsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxFQUFFO2dCQUNuRCxPQUFPLENBQUMsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsaUJBQWlCLENBQUMsV0FBVyxFQUFFLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUM7WUFDOUYsQ0FBQztZQUNELGlCQUFpQixFQUFFLFdBQVcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxDQUFDLGNBQWM7WUFDdEYsd0JBQXdCLEVBQUUsV0FBVyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsV0FBVyxDQUFDLENBQUMsWUFBWTtZQUMzRix1QkFBdUIsRUFBRSxXQUFXLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxXQUFXO1lBQ3pGLHlCQUF5QixFQUFFLFdBQVcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxDQUFDLGNBQWM7WUFDOUYsMkJBQTJCLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLDJCQUEyQixDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDakcsaUNBQWlDLEVBQUUsV0FBVyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsaUNBQWlDLENBQUMsV0FBVyxDQUFDO1lBQ3JHLHFCQUFxQixFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRTtZQUNsRyxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVU7WUFDM0IsYUFBYSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYTtZQUN6QyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLGtCQUFrQjtZQUNuRCxNQUFNLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7U0FDM0MsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8saUNBQWlDLENBQUMsV0FBbUI7UUFDNUQsTUFBTSxPQUFPLEdBQWMsQ0FBQyxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFN0MsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBRSxDQUFDO1FBQ3BGLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQywrQkFBK0IsQ0FBQyxhQUFhLENBQUUsQ0FBQztRQUNuRyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsd0JBQXdCLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFM0Ysc0JBQXNCO1FBQ3RCLE1BQU0sV0FBVyxHQUFHLEVBQUUsQ0FBQztRQUN2QixLQUFLLE1BQU0sUUFBUSxJQUFJLHdIQUFnRyxFQUFFLENBQUM7WUFDekgsSUFBSSxlQUFlLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQ2xDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsRUFBRSxRQUFRLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQztZQUNuRixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxhQUFhLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxZQUFZLEVBQUUsU0FBUyxDQUFDLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUU5RixpQkFBaUI7UUFDakIsSUFBSSxlQUFlLEtBQUssZUFBZSxFQUFFLENBQUM7WUFDekMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7Z0JBQ3JCLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUU7b0JBQ3hGLElBQUksQ0FBQyxxQkFBcUIsQ0FBQywyQkFBMkIsQ0FBQyxhQUFhLEVBQUUsZUFBZSxFQUFFLFNBQVMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO29CQUN6SCxJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQzVELENBQUM7YUFDRCxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMscUJBQXFCLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDM0YsSUFBSSxrQkFBa0IsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3hELE1BQU0sV0FBVyxHQUFHLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM3RCxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFFLENBQUM7Z0JBQzdGLElBQUksZ0JBQWdCLEtBQUssYUFBYSxFQUFFLENBQUM7b0JBQ3hDLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO3dCQUNyQixFQUFFLEVBQUUscUJBQXFCLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxlQUFlLEVBQUUsZ0JBQWdCLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFOzRCQUN4RixJQUFJLENBQUMscUJBQXFCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUscUJBQXFCLENBQUMsQ0FBQzs0QkFDbkgsSUFBSSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxhQUFhLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO3dCQUM1RCxDQUFDO3FCQUNELENBQUMsQ0FBQyxDQUFDO2dCQUNMLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7SUFFTyxnQkFBZ0IsQ0FBQyxhQUE0QixFQUFFLFdBQWtDLEVBQUUsZUFBc0M7UUFDaEksT0FBTyxRQUFRLENBQUM7WUFDZixFQUFFLEVBQUUsc0JBQXNCLFdBQVcsRUFBRTtZQUN2QyxLQUFLLEVBQUUsV0FBVyx3Q0FBZ0MsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVywwQ0FBa0MsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLG9CQUFvQixDQUFDO1lBQzFOLEdBQUcsRUFBRSxHQUFHLEVBQUU7Z0JBQ1QsSUFBSSxLQUF5QixDQUFDO2dCQUM5QixJQUFJLFdBQVcsS0FBSyxlQUFlLEVBQUUsQ0FBQztvQkFDckMsS0FBSyxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQywyQkFBMkIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxrQ0FBa0M7Z0JBQ3ZILENBQUM7cUJBQU0sQ0FBQztvQkFDUCxLQUFLLEdBQUcsU0FBUyxDQUFDLENBQUMsMkJBQTJCO2dCQUMvQyxDQUFDO2dCQUNELElBQUksQ0FBQyxxQkFBcUIsQ0FBQywyQkFBMkIsQ0FBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUMxRixJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDNUQsQ0FBQztTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxpQkFBaUI7UUFFeEIseUJBQXlCO1FBQ3pCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLHlCQUF5QixDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdJLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLDRCQUE0QixDQUFDLENBQUMsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFekssb0NBQW9DO1FBQ3BDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGtDQUFrQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0gsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsa0NBQWtDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUUvSCx5QkFBeUI7UUFDekIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGlDQUFpQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUNuRSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQzVCLE9BQU87WUFDUixDQUFDO1lBQ0QsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUU7Z0JBQ2pELElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDOUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLENBQUM7WUFDakMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNKLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsK0JBQXVCLElBQUksQ0FBQyxPQUFPLENBQUMsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckwsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8seUJBQXlCLENBQUMsS0FBK0UsRUFBRSxPQUFpRjtRQUNuTSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUN0SSxJQUFJLENBQUMsMkJBQTJCLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztJQUNoSSxDQUFDO0lBRU8sZ0NBQWdDLENBQUMsU0FBd0IsRUFBRSxJQUEyQixFQUFFLEVBQXlCO1FBQ3hILElBQUksSUFBSSxLQUFLLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUM1QixJQUFJLENBQUMsNEJBQTRCLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUVELElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQy9DLENBQUM7SUFDRixDQUFDO0lBRU8sa0NBQWtDLENBQUMsRUFBVSxFQUFFLE9BQWdCO1FBQ3RFLElBQUksT0FBTyxFQUFFLENBQUM7WUFDYixnRUFBZ0U7WUFDaEUsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3BDLENBQUM7YUFBTSxDQUFDO1lBQ1AsNENBQTRDO1lBQzVDLElBQUksQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDM0MsQ0FBQztJQUNGLENBQUM7SUFFTyx1QkFBdUI7UUFDOUIsSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQztRQUVwQyw4QkFBOEI7UUFDOUIsS0FBSyxNQUFNLEVBQUUsRUFBRSxFQUFFLElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDaEQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2hELElBQUksYUFBYSxFQUFFLENBQUM7Z0JBQ25CLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUM3QyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsSUFBSSxJQUFJLENBQUMscUJBQXFCLENBQUMsaUNBQWlDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztvQkFDdEUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDMUIsQ0FBQztxQkFBTSxDQUFDO29CQUNQLElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3hCLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO0lBQ2pDLENBQUM7SUFFTyx5QkFBeUIsQ0FBQyxFQUFVO1FBQzNDLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNoRCxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBRW5CLHFDQUFxQztZQUNyQyxJQUFJLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxZQUFZLENBQUMsaUJBQWlCLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXRELElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO2dCQUN4QyxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxxQkFBcUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDM0YsSUFBSSxrQkFBa0IsQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQzNELHFDQUFxQztvQkFDckMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3RDLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxNQUFNLENBQUMsTUFBbUI7UUFDekIsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRU8sbUJBQW1CLENBQUMsV0FBbUI7UUFDOUMsSUFBSSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzlELElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3ZCLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN6RCxJQUFJLGFBQWEsRUFBRSxDQUFDO2dCQUNuQixNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxxQkFBcUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDM0YsZ0JBQWdCLEdBQUc7b0JBQ2xCLGNBQWMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLEVBQUUsSUFBSSxDQUFDLDRCQUE0QixDQUFDLGtCQUFrQixDQUFDLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztvQkFDL0wsWUFBWSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSwyQkFBMkIsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsa0JBQWtCLENBQUMsRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7b0JBQ3ZJLFdBQVcsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksMEJBQTBCLENBQUMsSUFBSSxDQUFDLDRCQUE0QixDQUFDLGtCQUFrQixDQUFDLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO2lCQUNySSxDQUFDO1lBQ0gsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2RixnQkFBZ0IsR0FBRztvQkFDbEIsY0FBYyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxzQ0FBc0MsRUFBRSxJQUFJLENBQUMsd0JBQXdCLENBQUMsV0FBVyxFQUFFLGVBQWUsRUFBRSxJQUFJLElBQUksV0FBVyxFQUFFLGVBQWUsRUFBRSxJQUFJLEVBQUUsU0FBUyxDQUFDLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztvQkFDdlEsWUFBWSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxzQ0FBc0MsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO29CQUN4RyxXQUFXLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLHFDQUFxQyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7aUJBQ3RHLENBQUM7WUFDSCxDQUFDO1lBRUQsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUMxRCxDQUFDO1FBRUQsT0FBTyxnQkFBZ0IsQ0FBQztJQUN6QixDQUFDO0lBRU8sMkJBQTJCLENBQUMsY0FBd0M7UUFDM0UsS0FBSyxNQUFNLGFBQWEsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUM1QyxJQUFJLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBRWpDLGlDQUFpQztZQUNqQyxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEtBQUssYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JHLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO2dCQUMxQixJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDekMsQ0FBQztZQUVELFNBQVM7WUFDVCxNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1lBQzdFLElBQUksb0JBQW9CLEVBQUUsS0FBSyxFQUFFLEtBQUssYUFBYSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUN4RCxJQUFJLENBQUMsWUFBWSxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN2RCxDQUFDO1lBRUQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMscUJBQXFCLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDM0YsSUFBSSxDQUFDLDRCQUE0QixDQUFDLGFBQWEsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1lBQ3JFLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUU1QyxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1lBQzFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsd0JBQXdCLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLDRCQUE0QixDQUFDLGFBQWEsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6SSxXQUFXLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLGdDQUFnQyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFeEgsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ2xFLENBQUM7SUFDRixDQUFDO0lBRU8sNEJBQTRCLENBQUMsYUFBNEI7UUFDaEUsSUFBSSxDQUFDLHdCQUF3QixDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsZUFBZSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRU8sNEJBQTRCLENBQUMsYUFBNEIsRUFBRSxrQkFBdUM7UUFDekcsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLENBQUMsNEJBQTRCLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUNyRixNQUFNLEVBQUUsY0FBYyxFQUFFLFlBQVksRUFBRSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDcEYsY0FBYyxDQUFDLDRCQUE0QixDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFFcEUsSUFBSSxZQUFZLFlBQVksc0NBQXNDLEVBQUUsQ0FBQztZQUNwRSxZQUFZLENBQUMsV0FBVyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDbEQsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNqQyxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3BDLENBQUM7UUFFRCxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztJQUNqQyxDQUFDO0lBRU8sNEJBQTRCLENBQUMsa0JBQXVDO1FBQzNFLE9BQU8sSUFBSSxDQUFDLHdCQUF3QixDQUFDLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxFQUFFLEVBQUUsa0JBQWtCLENBQUMsS0FBSyxFQUFFLGtCQUFrQixDQUFDLElBQUksRUFBRSxrQkFBa0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUMvSixDQUFDO0lBRU8sd0JBQXdCLENBQUMsRUFBVSxFQUFFLElBQVksRUFBRSxJQUFpQyxFQUFFLFlBQWdDO1FBQzdILElBQUksVUFBVSxHQUF5QixTQUFTLENBQUM7UUFDakQsSUFBSSxPQUFPLEdBQW9CLFNBQVMsQ0FBQztRQUN6QyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDdkIsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQ3JCLE9BQU8sR0FBRyxJQUFJLENBQUM7Z0JBQ2YsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUM5QixNQUFNLElBQUksR0FBRyxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUM5QixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNwQixNQUFNLE1BQU0sR0FBRyxZQUFZLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO2dCQUNyRSxNQUFNLFNBQVMsR0FBRyxzQkFBc0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IscUNBQXFDLE1BQU0sRUFBRSxDQUFDO2dCQUNySCxVQUFVLEdBQUcsQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUM7Z0JBQ2xDLGFBQWEsQ0FBQyxTQUFTLEVBQUU7WUFDakIsTUFBTTsrQ0FDNkIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRO29CQUNoRCxNQUFNO3VEQUM2QixJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVE7OztJQUd4RSxDQUFDLENBQUM7WUFDSCxDQUFDO2lCQUFNLElBQUksU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUN4QyxVQUFVLEdBQUcsU0FBUyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQy9DLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsQ0FBQztJQUN4RCxDQUFDO0lBRU8sdUJBQXVCLENBQUMsYUFBNEI7UUFDM0QsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7WUFDeEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdEMsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBRWpDLGdEQUFnRDtZQUNoRCxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1lBQzVFLElBQUksbUJBQW1CLEVBQUUsS0FBSyxFQUFFLEtBQUssYUFBYSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUN2RCxJQUFJLENBQUMsWUFBWSxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN2RCxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFTyxjQUFjLENBQUMsaUJBQXlDLEVBQUUsbUJBQTBDO1FBQzNHLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUM7UUFDakgsTUFBTSxlQUFlLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7UUFFL0YsSUFBSSxhQUFhLEVBQUUsQ0FBQztZQUNuQixJQUFJLGFBQWEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDL0IsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7b0JBQzdELE9BQU8sS0FBSyxDQUFDO2dCQUNkLENBQUM7WUFDRixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDO1FBQ0YsQ0FBQztRQUVELDRIQUE0SDtRQUM1SCxJQUFJLENBQUMsSUFBSSxDQUFDLHVCQUF1QixJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSx1REFBdUIsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsZUFBZSxJQUFJLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDakksbUJBQW1CLEdBQUcsbUJBQW1CLElBQUksSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxlQUFlLENBQUMsQ0FBQztZQUVoSCxtREFBbUQ7WUFDbkQsSUFBSSxDQUFDLGFBQWEsSUFBSSxtQkFBbUIsRUFBRSxTQUFTLElBQUksbUJBQW1CLEVBQUUsT0FBTyxFQUFFLENBQUM7Z0JBQ3RGLE9BQU8sS0FBSyxDQUFDO1lBQ2QsQ0FBQztZQUVELElBQUksbUJBQW1CLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxDQUFDO2dCQUN4QyxPQUFPLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLG1CQUFtQixDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQy9JLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRU8sWUFBWSxDQUFDLGFBQTRCO1FBQ2hELElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLEVBQUUsRUFBRSxFQUFFLGFBQWEsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sYUFBYSxDQUFDLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxhQUFhLENBQUMsS0FBSyxFQUFFLGNBQWMsRUFBRSxhQUFhLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQztJQUNyTyxDQUFDO0lBRU8sYUFBYSxDQUFDLFdBQW1CO1FBQ3hDLElBQUksQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBRTdDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNoRSxJQUFJLGdCQUFnQixFQUFFLENBQUM7WUFDdEIsZ0JBQWdCLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQzFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN4QyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzNDLENBQUM7SUFDRixDQUFDO0lBRU8sZUFBZSxDQUFDLFdBQW1CO1FBQzFDLElBQUksQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBRS9DLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNoRSxJQUFJLGdCQUFnQixFQUFFLENBQUM7WUFDdEIsZ0JBQWdCLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQzFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN4QyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzNDLENBQUM7SUFDRixDQUFDO0lBRUQseUJBQXlCO1FBQ3hCLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNsRixPQUFPLElBQUksQ0FBQyxpQkFBaUIsRUFBRTthQUM3QixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7YUFDN0MsSUFBSSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQ3ZGLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNsQixDQUFDO0lBRUQsMEJBQTBCO1FBQ3pCLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxvQkFBb0IsRUFBRTthQUM3QyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsc0JBQXNCLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQzthQUNsSCxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDbEIsQ0FBQztJQUVELG1CQUFtQjtRQUNsQixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsb0JBQW9CLEVBQUU7YUFDN0MsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxxQkFBcUI7UUFDcEIsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLHFCQUFxQixFQUFFLENBQUM7SUFDbEQsQ0FBQztJQUVELEtBQUssQ0FBQyxLQUFjO1FBQ25CLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFRCxNQUFNLENBQUMsS0FBYSxFQUFFLE1BQWM7UUFDbkMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsSUFBSSxTQUFTLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUVPLGdCQUFnQixDQUFDLEVBQVU7UUFDbEMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzFFLE9BQU8sYUFBYSxJQUFJLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyx3QkFBd0IsQ0FBQyxhQUFhLENBQUMsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUMxSSxDQUFDO0lBRU8saUJBQWlCO1FBQ3hCLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM5RSxDQUFDO0lBRU8sa0NBQWtDLENBQUMsY0FBdUI7UUFDakUsSUFBSSxJQUFJLENBQUMseUJBQXlCLEtBQUssSUFBSSxDQUFDLGtDQUFrQyxFQUFFLEVBQUUsQ0FBQztZQUNsRixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQywrQkFBK0IsR0FBRyxTQUFTLENBQUM7UUFDakQsSUFBSSxDQUFDLDBCQUEwQixHQUFHLFNBQVMsQ0FBQztRQUM1QyxJQUFJLENBQUMscUJBQXFCLEdBQUcsU0FBUyxDQUFDO1FBRXZDLE1BQU0saUJBQWlCLEdBQXdCLEVBQUUsQ0FBQztRQUNsRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFFaEUsS0FBSyxNQUFNLG1CQUFtQixJQUFJLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQzdELGlCQUFpQixDQUFDLElBQUksQ0FBQztnQkFDdEIsRUFBRSxFQUFFLG1CQUFtQixDQUFDLEVBQUU7Z0JBQzFCLElBQUksRUFBRSxtQkFBbUIsQ0FBQyxJQUFJO2dCQUM5QixLQUFLLEVBQUUsbUJBQW1CLENBQUMsS0FBSztnQkFDaEMsTUFBTSxFQUFFLG1CQUFtQixDQUFDLE1BQU07Z0JBQ2xDLE9BQU8sRUFBRSxtQkFBbUIsQ0FBQyxPQUFPLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7YUFDdkYsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELEtBQUssTUFBTSxhQUFhLElBQUksSUFBSSxDQUFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQztZQUN0RCw4QkFBOEI7WUFDOUIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxhQUFhLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFDbEUsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzVFLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2xCLE1BQU0sYUFBYSxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDNUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUU7d0JBQ2xDLEVBQUUsRUFBRSxhQUFhLENBQUMsRUFBRTt3QkFDcEIsSUFBSSxFQUFFLE9BQU8sYUFBYSxDQUFDLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsS0FBSzt3QkFDL0YsS0FBSyxFQUFFLGFBQWEsQ0FBQyxLQUFLO3dCQUMxQixNQUFNLEVBQUUsYUFBYSxDQUFDLE1BQU07d0JBQzVCLE9BQU8sRUFBRSxhQUFhLENBQUMsT0FBTztxQkFDOUIsQ0FBQyxDQUFDO2dCQUNKLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxpQkFBaUIsQ0FBQyxJQUFJLENBQUM7d0JBQ3RCLEVBQUUsRUFBRSxhQUFhLENBQUMsRUFBRTt3QkFDcEIsSUFBSSxFQUFFLE9BQU8sYUFBYSxDQUFDLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsS0FBSzt3QkFDL0YsS0FBSyxFQUFFLGFBQWEsQ0FBQyxLQUFLO3dCQUMxQixNQUFNLEVBQUUsSUFBSTt3QkFDWixPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQztxQkFDNUMsQ0FBQyxDQUFDO2dCQUNKLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsS0FBSyxNQUFNLGFBQWEsSUFBSSxjQUFjLEVBQUUsQ0FBQztnQkFDNUMsTUFBTSxnQkFBZ0IsR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEtBQUssYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNyRixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztvQkFDdkIsaUJBQWlCLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUN2QyxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLENBQUMsWUFBWSxDQUFDLG9CQUFvQixDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVPLHdCQUF3QjtRQUMvQixNQUFNLEtBQUssR0FBMkIsRUFBRSxDQUFDO1FBRXpDLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUNoRSxLQUFLLE1BQU0sYUFBYSxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQzVDLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDOUQsSUFBSSxhQUFhLEVBQUUsQ0FBQztnQkFDbkIsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMscUJBQXFCLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQzNGLE1BQU0sS0FBSyxHQUFtQyxFQUFFLENBQUM7Z0JBQ2pELEtBQUssTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLGtCQUFrQixDQUFDLGtCQUFrQixFQUFFLENBQUM7b0JBQzlELEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7Z0JBQzNELENBQUM7Z0JBQ0QsS0FBSyxDQUFDLElBQUksQ0FBQztvQkFDVixFQUFFLEVBQUUsYUFBYSxDQUFDLEVBQUU7b0JBQ3BCLElBQUksRUFBRSxrQkFBa0IsQ0FBQyxLQUFLO29CQUM5QixJQUFJLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxnREFBZ0Q7b0JBQzNLLEtBQUs7b0JBQ0wsTUFBTSxFQUFFLGFBQWEsQ0FBQyxNQUFNO29CQUM1QixLQUFLLEVBQUUsYUFBYSxDQUFDLEtBQUs7b0JBQzFCLE9BQU8sRUFBRSxhQUFhLENBQUMsT0FBTztvQkFDOUIsU0FBUyxFQUFFLENBQUMsYUFBYSxDQUFDLFdBQVc7aUJBQ3JDLENBQUMsQ0FBQztZQUNKLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLGFBQWEsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLGFBQWEsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLGFBQWEsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLGFBQWEsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUM1SixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBR0QsSUFBWSxvQkFBb0I7UUFDL0IsSUFBSSxJQUFJLENBQUMscUJBQXFCLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDOUMsSUFBSSxDQUFDLHFCQUFxQixHQUFHLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1lBQzVELEtBQUssTUFBTSx3QkFBd0IsSUFBSSxJQUFJLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxDQUFDO2dCQUM1RSxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxLQUFLLHdCQUF3QixDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNqSCxJQUFJLG1CQUFtQixFQUFFLENBQUM7b0JBQ3pCLG1CQUFtQixDQUFDLE9BQU8sR0FBRyx3QkFBd0IsQ0FBQyxPQUFPLElBQUksbUJBQW1CLENBQUMsT0FBTyxDQUFDO29CQUM5RixtQkFBbUIsQ0FBQyxJQUFJLEdBQUcsd0JBQXdCLENBQUMsSUFBSSxDQUFDO29CQUN6RCxtQkFBbUIsQ0FBQyxJQUFJLEdBQUcsd0JBQXdCLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsQ0FBQzt3QkFDbkcsd0JBQXdCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLHdCQUF3QixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7b0JBQzdGLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsZUFBZSxFQUFFLENBQUM7d0JBQ3BGLG1CQUFtQixDQUFDLElBQUksR0FBRyxTQUFTLENBQUMsQ0FBQyxnREFBZ0Q7b0JBQ3ZGLENBQUM7b0JBQ0QsbUJBQW1CLENBQUMsS0FBSyxHQUFHLHdCQUF3QixDQUFDLEtBQUssQ0FBQztvQkFDM0QsbUJBQW1CLENBQUMsU0FBUyxHQUFHLHdCQUF3QixDQUFDLFNBQVMsQ0FBQztnQkFDcEUsQ0FBQztZQUNGLENBQUM7WUFDRCxLQUFLLE1BQU0sMkJBQTJCLElBQUksSUFBSSxDQUFDLCtCQUErQixFQUFFLEVBQUUsQ0FBQztnQkFDbEYsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSywyQkFBMkIsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDcEgsSUFBSSxtQkFBbUIsRUFBRSxDQUFDO29CQUN6QixtQkFBbUIsQ0FBQyxPQUFPLEdBQUcsMkJBQTJCLENBQUMsT0FBTyxJQUFJLG1CQUFtQixDQUFDLE9BQU8sQ0FBQztnQkFDbEcsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMscUJBQXFCLENBQUM7SUFDbkMsQ0FBQztJQUVPLDhCQUE4QixDQUFDLG9CQUE0QztRQUNsRixNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQzVELElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDakYsRUFBRTtZQUNGLE1BQU07WUFDTixPQUFPLEVBQUUsT0FBTyxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQyxRQUFRLEtBQUssRUFBRSxDQUFDLEVBQUUsT0FBTyxDQUFDO1lBQzNGLEtBQUs7U0FDMkIsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUVwQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDckcsRUFBRTtZQUNGLE9BQU8sRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDM0MsU0FBUyxFQUFFLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUztZQUN6RCxJQUFJO1lBQ0osU0FBUztZQUNULEtBQUs7U0FDZ0MsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUV6QyxJQUFJLENBQUMsK0JBQStCLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDbkYsRUFBRTtZQUNGLE9BQU87U0FDaUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztJQUM3QyxDQUFDO0lBRU8sdUJBQXVCO1FBQzlCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRU8sdUJBQXVCLENBQUMsb0JBQTRDO1FBQzNFLElBQUksQ0FBQyx5QkFBeUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDLENBQUM7SUFDdkUsQ0FBQztJQUdELElBQVkseUJBQXlCO1FBQ3BDLElBQUksQ0FBQyxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztZQUN0QyxJQUFJLENBQUMsMEJBQTBCLEdBQUcsSUFBSSxDQUFDLGtDQUFrQyxFQUFFLENBQUM7UUFDN0UsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLDBCQUEwQixDQUFDO0lBQ3hDLENBQUM7SUFFRCxJQUFZLHlCQUF5QixDQUFDLHlCQUFpQztRQUN0RSxJQUFJLElBQUksQ0FBQyx5QkFBeUIsS0FBSyx5QkFBeUIsRUFBRSxDQUFDO1lBQ2xFLElBQUksQ0FBQywwQkFBMEIsR0FBRyx5QkFBeUIsQ0FBQztZQUM1RCxJQUFJLENBQUMsa0NBQWtDLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUNwRSxDQUFDO0lBQ0YsQ0FBQztJQUVPLGtDQUFrQztRQUN6QyxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsdUJBQXVCLGdDQUF3QixJQUFJLENBQUMsQ0FBQztJQUNsRyxDQUFDO0lBRU8sa0NBQWtDLENBQUMsS0FBYTtRQUN2RCxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLHVCQUF1QixFQUFFLEtBQUssMkRBQTJDLENBQUM7SUFDbEgsQ0FBQztJQUVPLDRCQUE0QjtRQUNuQyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLDhCQUE4QixDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUVPLDRCQUE0QixDQUFDLHlCQUFzRDtRQUMxRixJQUFJLENBQUMsOEJBQThCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQ2pGLENBQUM7SUFHRCxJQUFZLDhCQUE4QjtRQUN6QyxJQUFJLENBQUMsSUFBSSxDQUFDLCtCQUErQixFQUFFLENBQUM7WUFDM0MsSUFBSSxDQUFDLCtCQUErQixHQUFHLElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxDQUFDO1FBQ3ZGLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQywrQkFBK0IsQ0FBQztJQUM3QyxDQUFDO0lBRUQsSUFBWSw4QkFBOEIsQ0FBQyw2QkFBcUM7UUFDL0UsSUFBSSxJQUFJLENBQUMsOEJBQThCLEtBQUssNkJBQTZCLEVBQUUsQ0FBQztZQUMzRSxJQUFJLENBQUMsK0JBQStCLEdBQUcsNkJBQTZCLENBQUM7WUFDckUsSUFBSSxDQUFDLHVDQUF1QyxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFDN0UsQ0FBQztJQUNGLENBQUM7SUFFTyx1Q0FBdUM7UUFDOUMsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLDRCQUE0QixnQ0FBd0IsSUFBSSxDQUFDLENBQUM7SUFDdkcsQ0FBQztJQUVPLHVDQUF1QyxDQUFDLEtBQWE7UUFDNUQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyw0QkFBNEIsRUFBRSxLQUFLLDhEQUE4QyxDQUFDO0lBQzFILENBQUM7SUFFTywrQkFBK0I7UUFDdEMsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFTywrQkFBK0IsQ0FBQyw0QkFBNEQ7UUFDbkcsSUFBSSxDQUFDLGlDQUFpQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsNEJBQTRCLENBQUMsQ0FBQztJQUN2RixDQUFDO0lBR0QsSUFBWSxpQ0FBaUM7UUFDNUMsSUFBSSxDQUFDLElBQUksQ0FBQyxrQ0FBa0MsRUFBRSxDQUFDO1lBQzlDLElBQUksQ0FBQyxrQ0FBa0MsR0FBRyxJQUFJLENBQUMsMENBQTBDLEVBQUUsQ0FBQztRQUM3RixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsa0NBQWtDLENBQUM7SUFDaEQsQ0FBQztJQUVELElBQVksaUNBQWlDLENBQUMsaUNBQXlDO1FBQ3RGLElBQUksSUFBSSxDQUFDLGlDQUFpQyxLQUFLLGlDQUFpQyxFQUFFLENBQUM7WUFDbEYsSUFBSSxDQUFDLGtDQUFrQyxHQUFHLGlDQUFpQyxDQUFDO1lBQzVFLElBQUksQ0FBQywwQ0FBMEMsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQ3BGLENBQUM7SUFDRixDQUFDO0lBRU8sMENBQTBDO1FBQ2pELE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQywrQkFBK0Isa0NBQTBCLElBQUksQ0FBQyxDQUFDO0lBQzVHLENBQUM7SUFFTywwQ0FBMEMsQ0FBQyxLQUFhO1FBQy9ELElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsK0JBQStCLEVBQUUsS0FBSyxnRUFBZ0QsQ0FBQztJQUMvSCxDQUFDO0NBQ0QsQ0FBQTtBQXBxQlksZ0JBQWdCO0lBZTFCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFdBQUEsc0JBQXNCLENBQUE7SUFDdEIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFlBQUEsNEJBQTRCLENBQUE7SUFDNUIsWUFBQSx1QkFBdUIsQ0FBQTtHQXRCYixnQkFBZ0IsQ0FvcUI1Qjs7QUFFRCxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUE0QixTQUFRLGtCQUFrQjs7YUFFbkMsNEJBQXVCLEdBQUcsR0FBRyxBQUFOLENBQU87SUFJdEQsWUFDQyxzQkFBK0MsRUFDOUIsSUFBVyxFQUNYLGlCQUFxQyxFQUM3QixhQUF1RCxFQUN6RCxvQkFBNEQsRUFDakUsZUFBa0Q7UUFFcEUsS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFOYixTQUFJLEdBQUosSUFBSSxDQUFPO1FBQ1gsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUNaLGtCQUFhLEdBQWIsYUFBYSxDQUF5QjtRQUN4Qyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQ2hELG9CQUFlLEdBQWYsZUFBZSxDQUFrQjtRQVI3RCxZQUFPLEdBQUcsQ0FBQyxDQUFDO1FBV25CLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUN0QixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUMscUJBQXFCLENBQUMsRUFBRTtZQUMvRSxJQUFJLENBQUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLElBQUkscUJBQXFCLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDckcsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3ZCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELDRCQUE0QixDQUFDLHNCQUErQztRQUMzRSxJQUFJLENBQUMsc0JBQXNCLEdBQUcsc0JBQXNCLENBQUM7SUFDdEQsQ0FBQztJQUVPLGNBQWM7UUFDckIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNuRyxDQUFDO0lBRVEsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFpQztRQUNuRCxJQUFJLFlBQVksQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQy9DLE9BQU8sQ0FBQyw0QkFBNEI7UUFDckMsQ0FBQztRQUVELHFFQUFxRTtRQUNyRSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDdkIsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxzREFBc0QsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLE9BQU8sR0FBRyw2QkFBMkIsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1lBQzNKLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUM7UUFFbkIsTUFBTSxLQUFLLEdBQUcsQ0FBQyxLQUFLLElBQUksZUFBZSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztRQUVoRixJQUFJLElBQUksQ0FBQyxJQUFJLCtEQUEyQixFQUFFLENBQUM7WUFDMUMsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLG9EQUFvQixDQUFDO1lBQ3hFLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1lBQ3RFLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQVMseUNBQXlDLENBQUMsQ0FBQztZQUU1RyxJQUFJLGNBQWMsSUFBSSxhQUFhLEVBQUUsS0FBSyxFQUFFLEtBQUssSUFBSSxDQUFDLHNCQUFzQixDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUNqRixRQUFRLGFBQWEsRUFBRSxDQUFDO29CQUN2QixLQUFLLE9BQU87d0JBQ1gsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7d0JBQ2hGLE1BQU07b0JBQ1AsS0FBSyxRQUFRLENBQUM7b0JBQ2Q7d0JBQ0MsbURBQW1EO3dCQUNuRCxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxJQUFJLHFEQUFxQixDQUFDO3dCQUMzRCxNQUFNO2dCQUNSLENBQUM7Z0JBRUQsT0FBTztZQUNSLENBQUM7UUFDRixDQUFDO1FBRUQsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RixPQUFPLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUN4QixDQUFDOztBQXBFSSwyQkFBMkI7SUFVOUIsV0FBQSx1QkFBdUIsQ0FBQTtJQUN2QixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsZ0JBQWdCLENBQUE7R0FaYiwyQkFBMkIsQ0FxRWhDO0FBRUQsTUFBTSxzQ0FBdUMsU0FBUSwyQkFBMkI7Q0FBSTtBQUVwRixNQUFNLHNDQUF1QyxTQUFRLDJCQUEyQjtJQUUvRSxZQUFZLEVBQVUsRUFBRSxZQUEyQjtRQUNsRCxLQUFLLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUVELFdBQVcsQ0FBQyxRQUFpQztRQUM1QyxJQUFJLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUM7SUFDNUIsQ0FBQztDQUNEO0FBRUQsTUFBTSxxQ0FBc0MsU0FBUSwwQkFBMEI7SUFFN0UsWUFBWSxFQUFVLEVBQUUsWUFBMkI7UUFDbEQsS0FBSyxDQUFDLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFRCx5QkFBeUIsQ0FBQyxVQUFtQztRQUM1RCxJQUFJLENBQUMsS0FBSyxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUM7SUFDOUIsQ0FBQztDQUNEIn0=