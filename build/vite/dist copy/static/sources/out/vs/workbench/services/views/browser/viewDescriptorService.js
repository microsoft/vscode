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
var ViewDescriptorService_1;
import { IViewDescriptorService, Extensions as ViewExtensions, ViewVisibilityState, defaultViewIcon, ViewContainerLocationToString, VIEWS_LOG_ID, VIEWS_LOG_NAME } from '../../../common/views.js';
import { RawContextKey, IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { toDisposable, DisposableStore, Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { ViewPaneContainer, ViewPaneContainerAction, ViewsSubMenu } from '../../../browser/parts/views/viewPaneContainer.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { getViewsStateStorageId, ViewContainerModel } from '../common/viewContainerModel.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { IViewsService } from '../common/viewsService.js';
import { windowLogGroup } from '../../log/common/logConstants.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
function getViewContainerStorageId(viewContainerId) { return `${viewContainerId}.state`; }
let ViewDescriptorService = class ViewDescriptorService extends Disposable {
    static { ViewDescriptorService_1 = this; }
    static { this.VIEWS_CUSTOMIZATIONS = 'views.customizations'; }
    static { this.COMMON_CONTAINER_ID_PREFIX = 'workbench.views.service'; }
    get viewContainers() { return this.viewContainersRegistry.all; }
    constructor(instantiationService, contextKeyService, storageService, extensionService, telemetryService, loggerService, environmentService) {
        super();
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.storageService = storageService;
        this.extensionService = extensionService;
        this.telemetryService = telemetryService;
        this._onDidChangeContainer = this._register(new Emitter());
        this.onDidChangeContainer = this._onDidChangeContainer.event;
        this._onDidChangeLocation = this._register(new Emitter());
        this.onDidChangeLocation = this._onDidChangeLocation.event;
        this._onDidChangeContainerLocation = this._register(new Emitter());
        this.onDidChangeContainerLocation = this._onDidChangeContainerLocation.event;
        this.viewContainerModels = this._register(new DisposableMap());
        this.viewsVisibilityActionDisposables = this._register(new DisposableMap());
        this.canRegisterViewsVisibilityActions = false;
        this._onDidChangeViewContainers = this._register(new Emitter());
        this.onDidChangeViewContainers = this._onDidChangeViewContainers.event;
        this.logger = new Lazy(() => loggerService.createLogger(VIEWS_LOG_ID, { name: VIEWS_LOG_NAME, group: windowLogGroup }));
        this.isSessionsWindow = environmentService.isSessionsWindow;
        this.activeViewContextKeys = new Map();
        this.movableViewContextKeys = new Map();
        this.defaultViewLocationContextKeys = new Map();
        this.defaultViewContainerLocationContextKeys = new Map();
        this.viewContainersRegistry = Registry.as(ViewExtensions.ViewContainersRegistry);
        this.viewsRegistry = Registry.as(ViewExtensions.ViewsRegistry);
        this.migrateToViewsCustomizationsStorage();
        this.viewContainersCustomLocations = new Map(Object.entries(this.viewCustomizations.viewContainerLocations));
        this.viewDescriptorsCustomLocations = new Map(Object.entries(this.viewCustomizations.viewLocations));
        this.viewContainerBadgeEnablementStates = new Map(Object.entries(this.viewCustomizations.viewContainerBadgeEnablementStates));
        // Register all containers that were registered before this ctor
        this.viewContainers.forEach(viewContainer => this.onDidRegisterViewContainer(viewContainer));
        this._register(this.viewsRegistry.onViewsRegistered(views => this.onDidRegisterViews(views)));
        this._register(this.viewsRegistry.onViewsDeregistered(({ views, viewContainer }) => this.onDidDeregisterViews(views, viewContainer)));
        this._register(this.viewsRegistry.onDidChangeContainer(({ views, from, to }) => this.onDidChangeDefaultContainer(views, from, to)));
        this._register(this.viewContainersRegistry.onDidRegister(({ viewContainer }) => {
            this.onDidRegisterViewContainer(viewContainer);
            this._onDidChangeViewContainers.fire({ added: [{ container: viewContainer, location: this.getViewContainerLocation(viewContainer) }], removed: [] });
        }));
        this._register(this.viewContainersRegistry.onDidDeregister(({ viewContainer, viewContainerLocation }) => {
            this.onDidDeregisterViewContainer(viewContainer);
            this._onDidChangeViewContainers.fire({ removed: [{ container: viewContainer, location: viewContainerLocation }], added: [] });
        }));
        this._register(this.storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, ViewDescriptorService_1.VIEWS_CUSTOMIZATIONS, this._store)(() => this.onDidStorageChange()));
        this.extensionService.whenInstalledExtensionsRegistered().then(() => this.whenExtensionsRegistered());
    }
    migrateToViewsCustomizationsStorage() {
        if (this.storageService.get(ViewDescriptorService_1.VIEWS_CUSTOMIZATIONS, 0 /* StorageScope.PROFILE */)) {
            return;
        }
        const viewContainerLocationsValue = this.storageService.get('views.cachedViewContainerLocations', 0 /* StorageScope.PROFILE */);
        const viewDescriptorLocationsValue = this.storageService.get('views.cachedViewPositions', 0 /* StorageScope.PROFILE */);
        if (!viewContainerLocationsValue && !viewDescriptorLocationsValue) {
            return;
        }
        const viewContainerLocations = viewContainerLocationsValue ? JSON.parse(viewContainerLocationsValue) : [];
        const viewDescriptorLocations = viewDescriptorLocationsValue ? JSON.parse(viewDescriptorLocationsValue) : [];
        const viewsCustomizations = {
            viewContainerLocations: viewContainerLocations.reduce((result, [id, location]) => { result[id] = location; return result; }, {}),
            viewLocations: viewDescriptorLocations.reduce((result, [id, { containerId }]) => { result[id] = containerId; return result; }, {}),
            viewContainerBadgeEnablementStates: {}
        };
        this.storageService.store(ViewDescriptorService_1.VIEWS_CUSTOMIZATIONS, JSON.stringify(viewsCustomizations), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.storageService.remove('views.cachedViewContainerLocations', 0 /* StorageScope.PROFILE */);
        this.storageService.remove('views.cachedViewPositions', 0 /* StorageScope.PROFILE */);
    }
    registerGroupedViews(groupedViews) {
        for (const [containerId, views] of groupedViews.entries()) {
            const viewContainer = this.viewContainersRegistry.get(containerId);
            // The container has not been registered yet
            if (!viewContainer || !this.viewContainerModels.has(viewContainer)) {
                // Register if the container is a genarated container
                if (this.isGeneratedContainerId(containerId)) {
                    const viewContainerLocation = this.viewContainersCustomLocations.get(containerId);
                    if (viewContainerLocation !== undefined) {
                        this.registerGeneratedViewContainer(viewContainerLocation, containerId);
                    }
                }
                // Registration of the container handles registration of its views
                continue;
            }
            // Filter out views that have already been added to the view container model
            // This is needed when statically-registered views are moved to
            // other statically registered containers as they will both try to add on startup
            const viewsToAdd = views.filter(view => this.getViewContainerModel(viewContainer).allViewDescriptors.filter(vd => vd.id === view.id).length === 0);
            this.addViews(viewContainer, viewsToAdd);
        }
    }
    deregisterGroupedViews(groupedViews) {
        for (const [viewContainerId, views] of groupedViews.entries()) {
            const viewContainer = this.viewContainersRegistry.get(viewContainerId);
            // The container has not been registered yet
            if (!viewContainer || !this.viewContainerModels.has(viewContainer)) {
                continue;
            }
            this.removeViews(viewContainer, views);
        }
    }
    moveOrphanViewsToDefaultLocation() {
        for (const [viewId, containerId] of this.viewDescriptorsCustomLocations.entries()) {
            // check if the view container exists
            if (this.viewContainersRegistry.get(containerId)) {
                continue;
            }
            // check if view has been registered to default location
            const viewContainer = this.viewsRegistry.getViewContainer(viewId);
            const viewDescriptor = this.getViewDescriptorById(viewId);
            if (viewContainer && viewDescriptor) {
                this.addViews(viewContainer, [viewDescriptor]);
            }
        }
    }
    whenExtensionsRegistered() {
        // Handle those views whose custom parent view container does not exist anymore
        // May be the extension contributing this view container is no longer installed
        // Or the parent view container is generated and no longer available.
        this.moveOrphanViewsToDefaultLocation();
        // Clean up empty generated view containers
        for (const viewContainerId of [...this.viewContainersCustomLocations.keys()]) {
            this.cleanUpGeneratedViewContainer(viewContainerId);
        }
        // Save updated view customizations after cleanup
        this.saveViewCustomizations();
        // Register visibility actions for all views
        for (const [key, value] of this.viewContainerModels) {
            this.registerViewsVisibilityActions(key, value);
        }
        this.canRegisterViewsVisibilityActions = true;
    }
    onDidRegisterViews(views) {
        this.contextKeyService.bufferChangeEvents(() => {
            views.forEach(({ views, viewContainer }) => {
                // When views are registered, we need to regroup them based on the customizations
                const regroupedViews = this.regroupViews(viewContainer.id, views);
                // Once they are grouped, try registering them which occurs
                // if the container has already been registered within this service
                // or we can generate the container from the source view id
                this.registerGroupedViews(regroupedViews);
                views.forEach(viewDescriptor => this.getOrCreateMovableViewContextKey(viewDescriptor).set(!!viewDescriptor.canMoveView));
            });
        });
    }
    isGeneratedContainerId(id) {
        return id.startsWith(ViewDescriptorService_1.COMMON_CONTAINER_ID_PREFIX);
    }
    onDidDeregisterViews(views, viewContainer) {
        // When views are registered, we need to regroup them based on the customizations
        const regroupedViews = this.regroupViews(viewContainer.id, views);
        this.deregisterGroupedViews(regroupedViews);
        this.contextKeyService.bufferChangeEvents(() => {
            views.forEach(viewDescriptor => this.getOrCreateMovableViewContextKey(viewDescriptor).set(false));
        });
    }
    regroupViews(containerId, views) {
        const viewsByContainer = new Map();
        for (const viewDescriptor of views) {
            const correctContainerId = this.viewDescriptorsCustomLocations.get(viewDescriptor.id) ?? containerId;
            let containerViews = viewsByContainer.get(correctContainerId);
            if (!containerViews) {
                viewsByContainer.set(correctContainerId, containerViews = []);
            }
            containerViews.push(viewDescriptor);
        }
        return viewsByContainer;
    }
    getViewDescriptorById(viewId) {
        const view = this.viewsRegistry.getView(viewId);
        if (view && !this.isViewVisible(view)) {
            return null;
        }
        return view;
    }
    getViewLocationById(viewId) {
        const container = this.getViewContainerByViewId(viewId);
        if (container === null) {
            return null;
        }
        return this.getViewContainerLocation(container);
    }
    getViewContainerByViewId(viewId) {
        // Check if the view itself should be visible in current workspace
        const view = this.viewsRegistry.getView(viewId);
        if (view && !this.isViewVisible(view)) {
            return null;
        }
        const containerId = this.viewDescriptorsCustomLocations.get(viewId);
        return containerId ?
            this.viewContainersRegistry.get(containerId) ?? null :
            this.getDefaultContainerById(viewId);
    }
    getViewContainerLocation(viewContainer) {
        const location = this.viewContainersCustomLocations.get(viewContainer.id) ?? this.getDefaultViewContainerLocation(viewContainer);
        return this.getEffectiveViewContainerLocation(location);
    }
    getDefaultViewContainerLocation(viewContainer) {
        return this.getEffectiveViewContainerLocation(this.viewContainersRegistry.getViewContainerLocation(viewContainer));
    }
    getEffectiveViewContainerLocation(location) {
        // When not in agent sessions workspace, view containers contributed to ChatBar
        // should be registered at the AuxiliaryBar location instead
        if (!this.isSessionsWindow && location === 3 /* ViewContainerLocation.ChatBar */) {
            return 2 /* ViewContainerLocation.AuxiliaryBar */;
        }
        return location;
    }
    getDefaultContainerById(viewId) {
        return this.viewsRegistry.getViewContainer(viewId) ?? null;
    }
    getViewContainerModel(container) {
        return this.getOrRegisterViewContainerModel(container);
    }
    getViewContainerById(id) {
        const viewContainer = this.viewContainersRegistry.get(id) || null;
        if (viewContainer && !this.isViewContainerVisible(viewContainer)) {
            return null;
        }
        return viewContainer;
    }
    getViewContainersByLocation(location) {
        return this.viewContainers.filter(v => this.getViewContainerLocation(v) === location && this.isViewContainerVisible(v));
    }
    isViewContainerVisible(viewContainer) {
        const layoutVisibility = viewContainer.windowVisibility;
        if (this.isSessionsWindow) {
            return layoutVisibility === 2 /* WindowVisibility.Sessions */ || layoutVisibility === 3 /* WindowVisibility.Both */;
        }
        return !layoutVisibility || layoutVisibility === 1 /* WindowVisibility.Editor */ || layoutVisibility === 3 /* WindowVisibility.Both */;
    }
    isViewVisible(view) {
        const layoutVisibility = view.windowVisibility;
        if (this.isSessionsWindow) {
            return layoutVisibility === 2 /* WindowVisibility.Sessions */ || layoutVisibility === 3 /* WindowVisibility.Both */;
        }
        return !layoutVisibility || layoutVisibility === 1 /* WindowVisibility.Editor */ || layoutVisibility === 3 /* WindowVisibility.Both */;
    }
    getDefaultViewContainer(location) {
        const viewContainers = this.viewContainersRegistry.getDefaultViewContainers(location);
        return viewContainers.find(viewContainer => this.isViewContainerVisible(viewContainer));
    }
    canMoveViews() {
        return !this.isSessionsWindow;
    }
    moveViewContainerToLocation(viewContainer, location, requestedIndex, reason) {
        if (!this.canMoveViews()) {
            return;
        }
        this.logger.value.trace(`moveViewContainerToLocation: viewContainer:${viewContainer.id} location:${location} reason:${reason}`);
        this.moveViewContainerToLocationWithoutSaving(viewContainer, location, requestedIndex);
        this.saveViewCustomizations();
    }
    getViewContainerBadgeEnablementState(id) {
        return this.viewContainerBadgeEnablementStates.get(id) ?? true;
    }
    setViewContainerBadgeEnablementState(id, badgesEnabled) {
        this.viewContainerBadgeEnablementStates.set(id, badgesEnabled);
        this.saveViewCustomizations();
    }
    moveViewToLocation(view, location, reason) {
        if (!this.canMoveViews()) {
            return;
        }
        this.logger.value.trace(`moveViewToLocation: view:${view.id} location:${location} reason:${reason}`);
        const container = this.registerGeneratedViewContainer(location);
        this.moveViewsToContainer([view], container);
    }
    moveViewsToContainer(views, viewContainer, visibilityState, reason) {
        if (!views.length) {
            return;
        }
        if (!this.canMoveViews()) {
            return;
        }
        this.logger.value.trace(`moveViewsToContainer: views:${views.map(view => view.id).join(',')} viewContainer:${viewContainer.id} reason:${reason}`);
        const from = this.getViewContainerByViewId(views[0].id);
        const to = viewContainer;
        if (from && to && from !== to) {
            // Move views
            this.moveViewsWithoutSaving(views, from, to, visibilityState);
            this.cleanUpGeneratedViewContainer(from.id);
            // Save new locations
            this.saveViewCustomizations();
            // Log to telemetry
            this.reportMovedViews(views, from, to);
        }
    }
    reset() {
        for (const viewContainer of this.viewContainers) {
            const viewContainerModel = this.getViewContainerModel(viewContainer);
            for (const viewDescriptor of viewContainerModel.allViewDescriptors) {
                const defaultContainer = this.getDefaultContainerById(viewDescriptor.id);
                const currentContainer = this.getViewContainerByViewId(viewDescriptor.id);
                if (currentContainer && defaultContainer && currentContainer !== defaultContainer) {
                    this.moveViewsWithoutSaving([viewDescriptor], currentContainer, defaultContainer);
                }
            }
            const defaultContainerLocation = this.getDefaultViewContainerLocation(viewContainer);
            const currentContainerLocation = this.getViewContainerLocation(viewContainer);
            if (defaultContainerLocation !== null && currentContainerLocation !== defaultContainerLocation) {
                this.moveViewContainerToLocationWithoutSaving(viewContainer, defaultContainerLocation);
            }
            this.cleanUpGeneratedViewContainer(viewContainer.id);
        }
        this.viewContainersCustomLocations.clear();
        this.viewDescriptorsCustomLocations.clear();
        this.saveViewCustomizations();
    }
    isViewContainerRemovedPermanently(viewContainerId) {
        return this.isGeneratedContainerId(viewContainerId) && !this.viewContainersCustomLocations.has(viewContainerId);
    }
    onDidChangeDefaultContainer(views, from, to) {
        const viewsToMove = views.filter(view => !this.viewDescriptorsCustomLocations.has(view.id) // Move views which are not already moved
            || (!this.viewContainers.includes(from) && this.viewDescriptorsCustomLocations.get(view.id) === from.id) // Move views which are moved from a removed container
        );
        if (viewsToMove.length) {
            this.moveViewsWithoutSaving(viewsToMove, from, to);
        }
    }
    reportMovedViews(views, from, to) {
        const containerToString = (container) => {
            if (container.id.startsWith(ViewDescriptorService_1.COMMON_CONTAINER_ID_PREFIX)) {
                return 'custom';
            }
            if (!container.extensionId) {
                return container.id;
            }
            return 'extension';
        };
        const oldLocation = this.getViewContainerLocation(from);
        const newLocation = this.getViewContainerLocation(to);
        const viewCount = views.length;
        const fromContainer = containerToString(from);
        const toContainer = containerToString(to);
        const fromLocation = oldLocation === 1 /* ViewContainerLocation.Panel */ ? 'panel' : 'sidebar';
        const toLocation = newLocation === 1 /* ViewContainerLocation.Panel */ ? 'panel' : 'sidebar';
        this.telemetryService.publicLog2('viewDescriptorService.moveViews', { viewCount, fromContainer, toContainer, fromLocation, toLocation });
    }
    moveViewsWithoutSaving(views, from, to, visibilityState = ViewVisibilityState.Expand) {
        this.removeViews(from, views);
        this.addViews(to, views, visibilityState);
        const oldLocation = this.getViewContainerLocation(from);
        const newLocation = this.getViewContainerLocation(to);
        if (oldLocation !== newLocation) {
            this._onDidChangeLocation.fire({ views, from: oldLocation, to: newLocation });
        }
        this._onDidChangeContainer.fire({ views, from, to });
    }
    moveViewContainerToLocationWithoutSaving(viewContainer, location, requestedIndex) {
        const from = this.getViewContainerLocation(viewContainer);
        const to = location;
        if (from !== to) {
            const isGeneratedViewContainer = this.isGeneratedContainerId(viewContainer.id);
            const isDefaultViewContainerLocation = to === this.getDefaultViewContainerLocation(viewContainer);
            if (isGeneratedViewContainer || !isDefaultViewContainerLocation) {
                this.viewContainersCustomLocations.set(viewContainer.id, to);
            }
            else {
                this.viewContainersCustomLocations.delete(viewContainer.id);
            }
            this.getOrCreateDefaultViewContainerLocationContextKey(viewContainer).set(isGeneratedViewContainer || isDefaultViewContainerLocation);
            viewContainer.requestedIndex = requestedIndex;
            this._onDidChangeContainerLocation.fire({ viewContainer, from, to });
            const views = this.getViewsByContainer(viewContainer);
            this._onDidChangeLocation.fire({ views, from, to });
        }
    }
    cleanUpGeneratedViewContainer(viewContainerId) {
        // Skip if container is not generated
        if (!this.isGeneratedContainerId(viewContainerId)) {
            return;
        }
        // Skip if container has views registered
        const viewContainer = this.getViewContainerById(viewContainerId);
        if (viewContainer && this.getViewContainerModel(viewContainer)?.allViewDescriptors.length) {
            return;
        }
        // Skip if container has moved views
        if ([...this.viewDescriptorsCustomLocations.values()].includes(viewContainerId)) {
            return;
        }
        // Deregister the container
        if (viewContainer) {
            this.viewContainersRegistry.deregisterViewContainer(viewContainer);
        }
        this.viewContainersCustomLocations.delete(viewContainerId);
        this.viewContainerBadgeEnablementStates.delete(viewContainerId);
        // Clean up caches of container
        this.storageService.remove(getViewsStateStorageId(viewContainer?.storageId || getViewContainerStorageId(viewContainerId)), 0 /* StorageScope.PROFILE */);
    }
    registerGeneratedViewContainer(location, existingId) {
        const id = existingId || this.generateContainerId(location);
        const container = this.viewContainersRegistry.registerViewContainer({
            id,
            ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [id, { mergeViewWithContainerWhenSingleView: true }]),
            title: { value: localize('user', "User View Container"), original: 'User View Container' }, // having a placeholder title - this should not be shown anywhere
            icon: location === 0 /* ViewContainerLocation.Sidebar */ ? defaultViewIcon : undefined,
            storageId: getViewContainerStorageId(id),
            hideIfEmpty: true
        }, location, { doNotRegisterOpenCommand: true });
        if (this.viewContainersCustomLocations.get(container.id) !== location) {
            this.viewContainersCustomLocations.set(container.id, location);
        }
        this.getOrCreateDefaultViewContainerLocationContextKey(container).set(true);
        return container;
    }
    onDidStorageChange() {
        if (JSON.stringify(this.viewCustomizations) !== this.getStoredViewCustomizationsValue() /* This checks if current window changed the value or not */) {
            this.onDidViewCustomizationsStorageChange();
        }
    }
    onDidViewCustomizationsStorageChange() {
        this._viewCustomizations = undefined;
        const newViewContainerCustomizations = new Map(Object.entries(this.viewCustomizations.viewContainerLocations));
        const newViewDescriptorCustomizations = new Map(Object.entries(this.viewCustomizations.viewLocations));
        const viewContainersToMove = [];
        const viewsToMove = [];
        for (const [containerId, location] of newViewContainerCustomizations.entries()) {
            const container = this.getViewContainerById(containerId);
            if (container) {
                if (location !== this.getViewContainerLocation(container)) {
                    viewContainersToMove.push([container, location]);
                }
            }
            // If the container is generated and not registered, we register it now
            else if (this.isGeneratedContainerId(containerId)) {
                this.registerGeneratedViewContainer(location, containerId);
            }
        }
        for (const viewContainer of this.viewContainers) {
            if (!newViewContainerCustomizations.has(viewContainer.id)) {
                const currentLocation = this.getViewContainerLocation(viewContainer);
                const defaultLocation = this.getDefaultViewContainerLocation(viewContainer);
                if (currentLocation !== defaultLocation) {
                    viewContainersToMove.push([viewContainer, defaultLocation]);
                }
            }
        }
        for (const [viewId, viewContainerId] of newViewDescriptorCustomizations.entries()) {
            const viewDescriptor = this.getViewDescriptorById(viewId);
            if (viewDescriptor) {
                const prevViewContainer = this.getViewContainerByViewId(viewId);
                const newViewContainer = this.viewContainersRegistry.get(viewContainerId);
                if (prevViewContainer && newViewContainer && newViewContainer !== prevViewContainer) {
                    viewsToMove.push({ views: [viewDescriptor], from: prevViewContainer, to: newViewContainer });
                }
            }
        }
        // If a value is not present in the cache, it must be reset to default
        for (const viewContainer of this.viewContainers) {
            const viewContainerModel = this.getViewContainerModel(viewContainer);
            for (const viewDescriptor of viewContainerModel.allViewDescriptors) {
                if (!newViewDescriptorCustomizations.has(viewDescriptor.id)) {
                    const currentContainer = this.getViewContainerByViewId(viewDescriptor.id);
                    const defaultContainer = this.getDefaultContainerById(viewDescriptor.id);
                    if (currentContainer && defaultContainer && currentContainer !== defaultContainer) {
                        viewsToMove.push({ views: [viewDescriptor], from: currentContainer, to: defaultContainer });
                    }
                }
            }
        }
        // Execute View Container Movements
        for (const [container, location] of viewContainersToMove) {
            this.moveViewContainerToLocationWithoutSaving(container, location);
        }
        // Execute View Movements
        for (const { views, from, to } of viewsToMove) {
            this.moveViewsWithoutSaving(views, from, to, ViewVisibilityState.Default);
        }
        this.viewContainersCustomLocations = newViewContainerCustomizations;
        this.viewDescriptorsCustomLocations = newViewDescriptorCustomizations;
    }
    // Generated Container Id Format
    // {Common Prefix}.{Location}.{Uniqueness Id}
    // Old Format (deprecated)
    // {Common Prefix}.{Uniqueness Id}.{Source View Id}
    generateContainerId(location) {
        return `${ViewDescriptorService_1.COMMON_CONTAINER_ID_PREFIX}.${ViewContainerLocationToString(location)}.${generateUuid()}`;
    }
    saveViewCustomizations() {
        const viewCustomizations = { viewContainerLocations: {}, viewLocations: {}, viewContainerBadgeEnablementStates: {} };
        for (const [containerId, location] of this.viewContainersCustomLocations) {
            const container = this.getViewContainerById(containerId);
            // Skip if the view container is not a generated container and in default location
            if (container && !this.isGeneratedContainerId(containerId) && location === this.getDefaultViewContainerLocation(container)) {
                continue;
            }
            viewCustomizations.viewContainerLocations[containerId] = location;
        }
        for (const [viewId, viewContainerId] of this.viewDescriptorsCustomLocations) {
            const viewContainer = this.getViewContainerById(viewContainerId);
            if (viewContainer) {
                const defaultContainer = this.getDefaultContainerById(viewId);
                // Skip if the view is at default location
                // https://github.com/microsoft/vscode/issues/90414
                if (defaultContainer?.id === viewContainer.id) {
                    continue;
                }
            }
            viewCustomizations.viewLocations[viewId] = viewContainerId;
        }
        // Loop through viewContainerBadgeEnablementStates and save only the ones that are disabled
        for (const [viewContainerId, badgeEnablementState] of this.viewContainerBadgeEnablementStates) {
            if (badgeEnablementState === false) {
                viewCustomizations.viewContainerBadgeEnablementStates[viewContainerId] = badgeEnablementState;
            }
        }
        this.viewCustomizations = viewCustomizations;
    }
    get viewCustomizations() {
        if (!this._viewCustomizations) {
            this._viewCustomizations = JSON.parse(this.getStoredViewCustomizationsValue());
            this._viewCustomizations.viewContainerLocations = this._viewCustomizations.viewContainerLocations ?? {};
            this._viewCustomizations.viewLocations = this._viewCustomizations.viewLocations ?? {};
            this._viewCustomizations.viewContainerBadgeEnablementStates = this._viewCustomizations.viewContainerBadgeEnablementStates ?? {};
        }
        return this._viewCustomizations;
    }
    set viewCustomizations(viewCustomizations) {
        const value = JSON.stringify(viewCustomizations);
        if (JSON.stringify(this.viewCustomizations) !== value) {
            this._viewCustomizations = viewCustomizations;
            this.setStoredViewCustomizationsValue(value);
        }
    }
    getStoredViewCustomizationsValue() {
        if (this.isSessionsWindow) {
            return '{}';
        }
        return this.storageService.get(ViewDescriptorService_1.VIEWS_CUSTOMIZATIONS, 0 /* StorageScope.PROFILE */, '{}');
    }
    setStoredViewCustomizationsValue(value) {
        if (this.isSessionsWindow) {
            return;
        }
        this.storageService.store(ViewDescriptorService_1.VIEWS_CUSTOMIZATIONS, value, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
    getViewsByContainer(viewContainer) {
        const result = this.viewsRegistry.getViews(viewContainer).filter(viewDescriptor => {
            const viewDescriptorViewContainerId = this.viewDescriptorsCustomLocations.get(viewDescriptor.id) ?? viewContainer.id;
            return viewDescriptorViewContainerId === viewContainer.id;
        });
        for (const [viewId, viewContainerId] of this.viewDescriptorsCustomLocations.entries()) {
            if (viewContainerId !== viewContainer.id) {
                continue;
            }
            if (this.viewsRegistry.getViewContainer(viewId) === viewContainer) {
                continue;
            }
            const viewDescriptor = this.getViewDescriptorById(viewId);
            if (viewDescriptor) {
                result.push(viewDescriptor);
            }
        }
        return result;
    }
    onDidRegisterViewContainer(viewContainer) {
        const defaultLocation = this.isGeneratedContainerId(viewContainer.id) ? true : this.getViewContainerLocation(viewContainer) === this.getDefaultViewContainerLocation(viewContainer);
        this.getOrCreateDefaultViewContainerLocationContextKey(viewContainer).set(defaultLocation);
        this.getOrRegisterViewContainerModel(viewContainer);
    }
    getOrRegisterViewContainerModel(viewContainer) {
        let viewContainerModel = this.viewContainerModels.get(viewContainer)?.viewContainerModel;
        if (!viewContainerModel) {
            const disposables = new DisposableStore();
            viewContainerModel = disposables.add(this.instantiationService.createInstance(ViewContainerModel, viewContainer));
            this.onDidChangeActiveViews({ added: viewContainerModel.activeViewDescriptors, removed: [] });
            viewContainerModel.onDidChangeActiveViewDescriptors(changed => this.onDidChangeActiveViews(changed), this, disposables);
            this.onDidChangeVisibleViews({ added: [...viewContainerModel.visibleViewDescriptors], removed: [] });
            viewContainerModel.onDidAddVisibleViewDescriptors(added => this.onDidChangeVisibleViews({ added: added.map(({ viewDescriptor }) => viewDescriptor), removed: [] }), this, disposables);
            viewContainerModel.onDidRemoveVisibleViewDescriptors(removed => this.onDidChangeVisibleViews({ added: [], removed: removed.map(({ viewDescriptor }) => viewDescriptor) }), this, disposables);
            disposables.add(toDisposable(() => this.viewsVisibilityActionDisposables.deleteAndDispose(viewContainer)));
            disposables.add(this.registerResetViewContainerAction(viewContainer));
            const value = { viewContainerModel: viewContainerModel, disposables, dispose: () => disposables.dispose() };
            this.viewContainerModels.set(viewContainer, value);
            // Register all views that were statically registered to this container
            // Potentially, this is registering something that was handled by another container
            // addViews() handles this by filtering views that are already registered
            this.onDidRegisterViews([{ views: this.viewsRegistry.getViews(viewContainer), viewContainer }]);
            // Add views that were registered prior to this view container
            const viewsToRegister = this.getViewsByContainer(viewContainer).filter(view => this.getDefaultContainerById(view.id) !== viewContainer);
            if (viewsToRegister.length) {
                this.addViews(viewContainer, viewsToRegister);
                this.contextKeyService.bufferChangeEvents(() => {
                    viewsToRegister.forEach(viewDescriptor => this.getOrCreateMovableViewContextKey(viewDescriptor).set(!!viewDescriptor.canMoveView));
                });
            }
            if (this.canRegisterViewsVisibilityActions) {
                this.registerViewsVisibilityActions(viewContainer, value);
            }
        }
        return viewContainerModel;
    }
    onDidDeregisterViewContainer(viewContainer) {
        this.viewContainerModels.deleteAndDispose(viewContainer);
        this.viewsVisibilityActionDisposables.deleteAndDispose(viewContainer);
    }
    onDidChangeActiveViews({ added, removed }) {
        this.contextKeyService.bufferChangeEvents(() => {
            added.forEach(viewDescriptor => this.getOrCreateActiveViewContextKey(viewDescriptor).set(true));
            removed.forEach(viewDescriptor => this.getOrCreateActiveViewContextKey(viewDescriptor).set(false));
        });
    }
    onDidChangeVisibleViews({ added, removed }) {
        this.contextKeyService.bufferChangeEvents(() => {
            added.forEach(viewDescriptor => this.getOrCreateVisibleViewContextKey(viewDescriptor).set(true));
            removed.forEach(viewDescriptor => this.getOrCreateVisibleViewContextKey(viewDescriptor).set(false));
        });
    }
    registerViewsVisibilityActions(viewContainer, { viewContainerModel, disposables }) {
        this.viewsVisibilityActionDisposables.deleteAndDispose(viewContainer);
        this.viewsVisibilityActionDisposables.set(viewContainer, this.registerViewsVisibilityActionsForContainer(viewContainerModel));
        disposables.add(Event.any(viewContainerModel.onDidChangeActiveViewDescriptors, viewContainerModel.onDidAddVisibleViewDescriptors, viewContainerModel.onDidRemoveVisibleViewDescriptors, viewContainerModel.onDidMoveVisibleViewDescriptors)(e => {
            this.viewsVisibilityActionDisposables.deleteAndDispose(viewContainer);
            this.viewsVisibilityActionDisposables.set(viewContainer, this.registerViewsVisibilityActionsForContainer(viewContainerModel));
        }));
    }
    registerViewsVisibilityActionsForContainer(viewContainerModel) {
        const disposables = new DisposableStore();
        viewContainerModel.activeViewDescriptors.forEach((viewDescriptor, index) => {
            if (!viewDescriptor.remoteAuthority) {
                disposables.add(registerAction2(class extends ViewPaneContainerAction {
                    constructor() {
                        super({
                            id: `${viewDescriptor.id}.toggleVisibility`,
                            viewPaneContainerId: viewContainerModel.viewContainer.id,
                            precondition: viewDescriptor.canToggleVisibility && (!viewContainerModel.isVisible(viewDescriptor.id) || viewContainerModel.visibleViewDescriptors.length > 1) ? ContextKeyExpr.true() : ContextKeyExpr.false(),
                            toggled: ContextKeyExpr.has(`${viewDescriptor.id}.visible`),
                            title: viewDescriptor.name,
                            metadata: {
                                description: localize2('toggleVisibilityDescription', 'Toggles the visibility of the {0} view if the view container it is located in is visible', viewDescriptor.name.value)
                            },
                            menu: [{
                                    id: ViewsSubMenu,
                                    when: ContextKeyExpr.equals('viewContainer', viewContainerModel.viewContainer.id),
                                    order: index,
                                }, {
                                    id: MenuId.ViewContainerTitleContext,
                                    when: ContextKeyExpr.equals('viewContainer', viewContainerModel.viewContainer.id),
                                    order: index,
                                    group: '1_toggleVisibility'
                                }, {
                                    id: MenuId.ViewTitleContext,
                                    when: ContextKeyExpr.or(...viewContainerModel.visibleViewDescriptors.map(v => ContextKeyExpr.equals('view', v.id))),
                                    order: index,
                                    group: '2_toggleVisibility'
                                }]
                        });
                    }
                    async runInViewPaneContainer(serviceAccessor, viewPaneContainer) {
                        viewPaneContainer.toggleViewVisibility(viewDescriptor.id);
                    }
                }));
                disposables.add(registerAction2(class extends ViewPaneContainerAction {
                    constructor() {
                        super({
                            id: `${viewDescriptor.id}.removeView`,
                            viewPaneContainerId: viewContainerModel.viewContainer.id,
                            title: localize('hideView', "Hide '{0}'", viewDescriptor.name.value),
                            metadata: {
                                description: localize2('hideViewDescription', 'Hides the {0} view if it is visible and the view container it is located in is visible', viewDescriptor.name.value)
                            },
                            precondition: viewDescriptor.canToggleVisibility && (!viewContainerModel.isVisible(viewDescriptor.id) || viewContainerModel.visibleViewDescriptors.length > 1) ? ContextKeyExpr.true() : ContextKeyExpr.false(),
                            menu: [{
                                    id: MenuId.ViewTitleContext,
                                    when: ContextKeyExpr.and(ContextKeyExpr.equals('view', viewDescriptor.id), ContextKeyExpr.has(`${viewDescriptor.id}.visible`)),
                                    group: '1_hide',
                                    order: 1
                                }]
                        });
                    }
                    async runInViewPaneContainer(serviceAccessor, viewPaneContainer) {
                        if (viewPaneContainer.getView(viewDescriptor.id)?.isVisible()) {
                            viewPaneContainer.toggleViewVisibility(viewDescriptor.id);
                        }
                    }
                }));
            }
        });
        return disposables;
    }
    registerResetViewContainerAction(viewContainer) {
        const that = this;
        return registerAction2(class ResetViewLocationAction extends Action2 {
            constructor() {
                super({
                    id: `${viewContainer.id}.resetViewContainerLocation`,
                    title: localize2('resetViewLocation', "Reset Location"),
                    menu: [{
                            id: MenuId.ViewContainerTitleContext,
                            group: '1_viewActions',
                            when: ContextKeyExpr.or(ContextKeyExpr.and(ContextKeyExpr.equals('viewContainer', viewContainer.id), ContextKeyExpr.equals(`${viewContainer.id}.defaultViewContainerLocation`, false)))
                        }],
                });
            }
            run(accessor) {
                that.moveViewContainerToLocation(viewContainer, that.getDefaultViewContainerLocation(viewContainer), undefined, this.desc.id);
                accessor.get(IViewsService).openViewContainer(viewContainer.id, true);
            }
        });
    }
    addViews(container, views, visibilityState = ViewVisibilityState.Default) {
        this.contextKeyService.bufferChangeEvents(() => {
            views.forEach(view => {
                const isDefaultContainer = this.getDefaultContainerById(view.id) === container;
                this.getOrCreateDefaultViewLocationContextKey(view).set(isDefaultContainer);
                if (isDefaultContainer) {
                    this.viewDescriptorsCustomLocations.delete(view.id);
                }
                else {
                    this.viewDescriptorsCustomLocations.set(view.id, container.id);
                }
            });
        });
        this.getViewContainerModel(container).add(views.map(view => {
            return {
                viewDescriptor: view,
                collapsed: visibilityState === ViewVisibilityState.Default ? undefined : false,
                visible: visibilityState === ViewVisibilityState.Default ? undefined : true
            };
        }));
    }
    removeViews(container, views) {
        // Set view default location keys to false
        this.contextKeyService.bufferChangeEvents(() => {
            views.forEach(view => {
                if (this.viewDescriptorsCustomLocations.get(view.id) === container.id) {
                    this.viewDescriptorsCustomLocations.delete(view.id);
                }
                this.getOrCreateDefaultViewLocationContextKey(view).set(false);
            });
        });
        // Remove the views
        this.getViewContainerModel(container).remove(views);
    }
    getOrCreateActiveViewContextKey(viewDescriptor) {
        const activeContextKeyId = `${viewDescriptor.id}.active`;
        let contextKey = this.activeViewContextKeys.get(activeContextKeyId);
        if (!contextKey) {
            contextKey = new RawContextKey(activeContextKeyId, false).bindTo(this.contextKeyService);
            this.activeViewContextKeys.set(activeContextKeyId, contextKey);
        }
        return contextKey;
    }
    getOrCreateVisibleViewContextKey(viewDescriptor) {
        const activeContextKeyId = `${viewDescriptor.id}.visible`;
        let contextKey = this.activeViewContextKeys.get(activeContextKeyId);
        if (!contextKey) {
            contextKey = new RawContextKey(activeContextKeyId, false).bindTo(this.contextKeyService);
            this.activeViewContextKeys.set(activeContextKeyId, contextKey);
        }
        return contextKey;
    }
    getOrCreateMovableViewContextKey(viewDescriptor) {
        const movableViewContextKeyId = `${viewDescriptor.id}.canMove`;
        let contextKey = this.movableViewContextKeys.get(movableViewContextKeyId);
        if (!contextKey) {
            contextKey = new RawContextKey(movableViewContextKeyId, false).bindTo(this.contextKeyService);
            this.movableViewContextKeys.set(movableViewContextKeyId, contextKey);
        }
        return contextKey;
    }
    getOrCreateDefaultViewLocationContextKey(viewDescriptor) {
        const defaultViewLocationContextKeyId = `${viewDescriptor.id}.defaultViewLocation`;
        let contextKey = this.defaultViewLocationContextKeys.get(defaultViewLocationContextKeyId);
        if (!contextKey) {
            contextKey = new RawContextKey(defaultViewLocationContextKeyId, false).bindTo(this.contextKeyService);
            this.defaultViewLocationContextKeys.set(defaultViewLocationContextKeyId, contextKey);
        }
        return contextKey;
    }
    getOrCreateDefaultViewContainerLocationContextKey(viewContainer) {
        const defaultViewContainerLocationContextKeyId = `${viewContainer.id}.defaultViewContainerLocation`;
        let contextKey = this.defaultViewContainerLocationContextKeys.get(defaultViewContainerLocationContextKeyId);
        if (!contextKey) {
            contextKey = new RawContextKey(defaultViewContainerLocationContextKeyId, false).bindTo(this.contextKeyService);
            this.defaultViewContainerLocationContextKeys.set(defaultViewContainerLocationContextKeyId, contextKey);
        }
        return contextKey;
    }
};
ViewDescriptorService = ViewDescriptorService_1 = __decorate([
    __param(0, IInstantiationService),
    __param(1, IContextKeyService),
    __param(2, IStorageService),
    __param(3, IExtensionService),
    __param(4, ITelemetryService),
    __param(5, ILoggerService),
    __param(6, IWorkbenchEnvironmentService)
], ViewDescriptorService);
export { ViewDescriptorService };
registerSingleton(IViewDescriptorService, ViewDescriptorService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3ZpZXdzL2Jyb3dzZXIvdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQXlCLHNCQUFzQixFQUEyRSxVQUFVLElBQUksY0FBYyxFQUFFLG1CQUFtQixFQUFFLGVBQWUsRUFBRSw2QkFBNkIsRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFvQixNQUFNLDBCQUEwQixDQUFDO0FBQ3JULE9BQU8sRUFBZSxhQUFhLEVBQUUsa0JBQWtCLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEksT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsVUFBVSxFQUFlLGFBQWEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzdILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUM3SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFN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