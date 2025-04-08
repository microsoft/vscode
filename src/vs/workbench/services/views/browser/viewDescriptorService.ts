/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ViewContainerLocation, IViewDescriptorService, ViewContainer, IViewsRegistry, IViewContainersRegistry, IViewDescriptor, Extensions as ViewExtensions, ViewVisibilityState, defaultViewIcon, ViewContainerLocationToString, VIEWS_LOG_ID, VIEWS_LOG_NAME } from '../../../common/views.js';
import { IContextKey, RawContextKey, IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { toDisposable, DisposableStore, Disposable, IDisposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { ViewPaneContainer, ViewPaneContainerAction, ViewsSubMenu } from '../../../browser/parts/views/viewPaneContainer.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { getViewsStateStorageId, ViewContainerModel } from '../common/viewContainerModel.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { localize, localize2 } from '../../../../nls.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { ILogger, ILoggerService } from '../../../../platform/log/common/log.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { IViewsService } from '../common/viewsService.js';
import { windowLogGroup } from '../../log/common/logConstants.js';

interface IViewsCustomizations {
	viewContainerLocations: IStringDictionary<ViewContainerLocation>;
	viewLocations: IStringDictionary<string>;
	viewContainerBadgeEnablementStates: IStringDictionary<boolean>;
}

function getViewContainerStorageId(viewContainerId: string): string { return `${viewContainerId}.state`; }

export class ViewDescriptorService extends Disposable implements IViewDescriptorService {

	declare readonly _serviceBrand: undefined;

	private static readonly VIEWS_CUSTOMIZATIONS = 'views.customizations';
	private static readonly COMMON_CONTAINER_ID_PREFIX = 'workbench.views.service';

	private readonly _onDidChangeContainer: Emitter<{ views: IViewDescriptor[]; from: ViewContainer; to: ViewContainer }> = this._register(new Emitter<{ views: IViewDescriptor[]; from: ViewContainer; to: ViewContainer }>());
	readonly onDidChangeContainer: Event<{ views: IViewDescriptor[]; from: ViewContainer; to: ViewContainer }> = this._onDidChangeContainer.event;

	private readonly _onDidChangeLocation: Emitter<{ views: IViewDescriptor[]; from: ViewContainerLocation; to: ViewContainerLocation }> = this._register(new Emitter<{ views: IViewDescriptor[]; from: ViewContainerLocation; to: ViewContainerLocation }>());
	readonly onDidChangeLocation: Event<{ views: IViewDescriptor[]; from: ViewContainerLocation; to: ViewContainerLocation }> = this._onDidChangeLocation.event;

	private readonly _onDidChangeContainerLocation: Emitter<{ viewContainer: ViewContainer; from: ViewContainerLocation; to: ViewContainerLocation }> = this._register(new Emitter<{ viewContainer: ViewContainer; from: ViewContainerLocation; to: ViewContainerLocation }>());
	readonly onDidChangeContainerLocation: Event<{ viewContainer: ViewContainer; from: ViewContainerLocation; to: ViewContainerLocation }> = this._onDidChangeContainerLocation.event;

	private readonly viewContainerModels = this._register(new DisposableMap<ViewContainer, { viewContainerModel: ViewContainerModel; disposables: DisposableStore } & IDisposable>());
	private readonly viewsVisibilityActionDisposables = this._register(new DisposableMap<ViewContainer, IDisposable>());
	private canRegisterViewsVisibilityActions: boolean = false;
	private readonly activeViewContextKeys: Map<string, IContextKey<boolean>>;
	private readonly movableViewContextKeys: Map<string, IContextKey<boolean>>;
	private readonly defaultViewLocationContextKeys: Map<string, IContextKey<boolean>>;
	private readonly defaultViewContainerLocationContextKeys: Map<string, IContextKey<boolean>>;

	private readonly viewsRegistry: IViewsRegistry;
	private readonly viewContainersRegistry: IViewContainersRegistry;

	private viewContainersCustomLocations: Map<string, ViewContainerLocation>;
	private viewDescriptorsCustomLocations: Map<string, string>;
	private viewContainerBadgeEnablementStates: Map<string, boolean>;

	private readonly _onDidChangeViewContainers = this._register(new Emitter<{ added: ReadonlyArray<{ container: ViewContainer; location: ViewContainerLocation }>; removed: ReadonlyArray<{ container: ViewContainer; location: ViewContainerLocation }> }>());
	readonly onDidChangeViewContainers = this._onDidChangeViewContainers.event;
	get viewContainers(): ReadonlyArray<ViewContainer> { return this.viewContainersRegistry.all; }

	private readonly logger: Lazy<ILogger>;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILoggerService loggerService: ILoggerService,
	) {
		super();

		this.logger = new Lazy(() => loggerService.createLogger(VIEWS_LOG_ID, { name: VIEWS_LOG_NAME, group: windowLogGroup }));

		this.activeViewContextKeys = new Map<string, IContextKey<boolean>>();
		this.movableViewContextKeys = new Map<string, IContextKey<boolean>>();
		this.defaultViewLocationContextKeys = new Map<string, IContextKey<boolean>>();
		this.defaultViewContainerLocationContextKeys = new Map<string, IContextKey<boolean>>();

		this.viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		this.viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);

		this.migrateToViewsCustomizationsStorage();
		this.viewContainersCustomLocations = new Map<string, ViewContainerLocation>(Object.entries(this.viewCustomizations.viewContainerLocations));
		this.viewDescriptorsCustomLocations = new Map<string, string>(Object.entries(this.viewCustomizations.viewLocations));
		this.viewContainerBadgeEnablementStates = new Map<string, boolean>(Object.entries(this.viewCustomizations.viewContainerBadgeEnablementStates));

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

		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, ViewDescriptorService.VIEWS_CUSTOMIZATIONS, this._store)(() => this.onDidStorageChange()));

		this.extensionService.whenInstalledExtensionsRegistered().then(() => this.whenExtensionsRegistered());

	}

	private migrateToViewsCustomizationsStorage(): void {
		if (this.storageService.get(ViewDescriptorService.VIEWS_CUSTOMIZATIONS, StorageScope.PROFILE)) {
			return;
		}

		const viewContainerLocationsValue = this.storageService.get('views.cachedViewContainerLocations', StorageScope.PROFILE);
		const viewDescriptorLocationsValue = this.storageService.get('views.cachedViewPositions', StorageScope.PROFILE);
		if (!viewContainerLocationsValue && !viewDescriptorLocationsValue) {
			return;
		}

		const viewContainerLocations: [string, ViewContainerLocation][] = viewContainerLocationsValue ? JSON.parse(viewContainerLocationsValue) : [];
		const viewDescriptorLocations: [string, { containerId: string }][] = viewDescriptorLocationsValue ? JSON.parse(viewDescriptorLocationsValue) : [];
		const viewsCustomizations: IViewsCustomizations = {
			viewContainerLocations: viewContainerLocations.reduce<IStringDictionary<ViewContainerLocation>>((result, [id, location]) => { result[id] = location; return result; }, {}),
			viewLocations: viewDescriptorLocations.reduce<IStringDictionary<string>>((result, [id, { containerId }]) => { result[id] = containerId; return result; }, {}),
			viewContainerBadgeEnablementStates: {}
		};
		this.storageService.store(ViewDescriptorService.VIEWS_CUSTOMIZATIONS, JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);
		this.storageService.remove('views.cachedViewContainerLocations', StorageScope.PROFILE);
		this.storageService.remove('views.cachedViewPositions', StorageScope.PROFILE);
	}

	private registerGroupedViews(groupedViews: Map<string, IViewDescriptor[]>): void {
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

	private deregisterGroupedViews(groupedViews: Map<string, IViewDescriptor[]>): void {
		for (const [viewContainerId, views] of groupedViews.entries()) {
			const viewContainer = this.viewContainersRegistry.get(viewContainerId);

			// The container has not been registered yet
			if (!viewContainer || !this.viewContainerModels.has(viewContainer)) {
				continue;
			}

			this.removeViews(viewContainer, views);
		}
	}

	private moveOrphanViewsToDefaultLocation(): void {
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

	whenExtensionsRegistered(): void {

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

	private onDidRegisterViews(views: { views: IViewDescriptor[]; viewContainer: ViewContainer }[]): void {
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

	private isGeneratedContainerId(id: string): boolean {
		return id.startsWith(ViewDescriptorService.COMMON_CONTAINER_ID_PREFIX);
	}

	private onDidDeregisterViews(views: IViewDescriptor[], viewContainer: ViewContainer): void {
		// When views are registered, we need to regroup them based on the customizations
		const regroupedViews = this.regroupViews(viewContainer.id, views);
		this.deregisterGroupedViews(regroupedViews);
		this.contextKeyService.bufferChangeEvents(() => {
			views.forEach(viewDescriptor => this.getOrCreateMovableViewContextKey(viewDescriptor).set(false));
		});
	}

	private regroupViews(containerId: string, views: IViewDescriptor[]): Map<string, IViewDescriptor[]> {
		const viewsByContainer = new Map<string, IViewDescriptor[]>();

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

	getViewDescriptorById(viewId: string): IViewDescriptor | null {
		return this.viewsRegistry.getView(viewId);
	}

	getViewLocationById(viewId: string): ViewContainerLocation | null {
		const container = this.getViewContainerByViewId(viewId);
		if (container === null) {
			return null;
		}

		return this.getViewContainerLocation(container);
	}

	getViewContainerByViewId(viewId: string): ViewContainer | null {
		const containerId = this.viewDescriptorsCustomLocations.get(viewId);

		return containerId ?
			this.viewContainersRegistry.get(containerId) ?? null :
			this.getDefaultContainerById(viewId);
	}

	getViewContainerLocation(viewContainer: ViewContainer): ViewContainerLocation {
		return this.viewContainersCustomLocations.get(viewContainer.id) ?? this.getDefaultViewContainerLocation(viewContainer);
	}

	getDefaultViewContainerLocation(viewContainer: ViewContainer): ViewContainerLocation {
		return this.viewContainersRegistry.getViewContainerLocation(viewContainer);
	}

	getDefaultContainerById(viewId: string): ViewContainer | null {
		return this.viewsRegistry.getViewContainer(viewId) ?? null;
	}

	getViewContainerModel(container: ViewContainer): ViewContainerModel {
		return this.getOrRegisterViewContainerModel(container);
	}

	getViewContainerById(id: string): ViewContainer | null {
		return this.viewContainersRegistry.get(id) || null;
	}

	getViewContainersByLocation(location: ViewContainerLocation): ViewContainer[] {
		return this.viewContainers.filter(v => this.getViewContainerLocation(v) === location);
	}

	getDefaultViewContainer(location: ViewContainerLocation): ViewContainer | undefined {
		return this.viewContainersRegistry.getDefaultViewContainer(location);
	}

	moveViewContainerToLocation(viewContainer: ViewContainer, location: ViewContainerLocation, requestedIndex?: number, reason?: string): void {
		this.logger.value.info(`moveViewContainerToLocation: viewContainer:${viewContainer.id} location:${location} reason:${reason}`);
		this.moveViewContainerToLocationWithoutSaving(viewContainer, location, requestedIndex);
		this.saveViewCustomizations();
	}

	getViewContainerBadgeEnablementState(id: string): boolean {
		return this.viewContainerBadgeEnablementStates.get(id) ?? true;
	}

	setViewContainerBadgeEnablementState(id: string, badgesEnabled: boolean): void {
		this.viewContainerBadgeEnablementStates.set(id, badgesEnabled);
		this.saveViewCustomizations();
	}

	moveViewToLocation(view: IViewDescriptor, location: ViewContainerLocation, reason?: string): void {
		this.logger.value.info(`moveViewToLocation: view:${view.id} location:${location} reason:${reason}`);
		const container = this.registerGeneratedViewContainer(location);
		this.moveViewsToContainer([view], container);
	}

	moveViewsToContainer(views: IViewDescriptor[], viewContainer: ViewContainer, visibilityState?: ViewVisibilityState, reason?: string): void {
		if (!views.length) {
			return;
		}

		this.logger.value.info(`moveViewsToContainer: views:${views.map(view => view.id).join(',')} viewContainer:${viewContainer.id} reason:${reason}`);

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

	reset(): void {
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

	isViewContainerRemovedPermanently(viewContainerId: string): boolean {
		return this.isGeneratedContainerId(viewContainerId) && !this.viewContainersCustomLocations.has(viewContainerId);
	}

	private onDidChangeDefaultContainer(views: IViewDescriptor[], from: ViewContainer, to: ViewContainer): void {
		const viewsToMove = views.filter(view =>
			!this.viewDescriptorsCustomLocations.has(view.id) // Move views which are not already moved
			|| (!this.viewContainers.includes(from) && this.viewDescriptorsCustomLocations.get(view.id) === from.id) // Move views which are moved from a removed container
		);
		if (viewsToMove.length) {
			this.moveViewsWithoutSaving(viewsToMove, from, to);
		}
	}

	private reportMovedViews(views: IViewDescriptor[], from: ViewContainer, to: ViewContainer): void {
		const containerToString = (container: ViewContainer): string => {
			if (container.id.startsWith(ViewDescriptorService.COMMON_CONTAINER_ID_PREFIX)) {
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
		const fromLocation = oldLocation === ViewContainerLocation.Panel ? 'panel' : 'sidebar';
		const toLocation = newLocation === ViewContainerLocation.Panel ? 'panel' : 'sidebar';

		interface ViewDescriptorServiceMoveViewsEvent {
			viewCount: number;
			fromContainer: string;
			toContainer: string;
			fromLocation: string;
			toLocation: string;
		}

		type ViewDescriptorServiceMoveViewsClassification = {
			owner: 'benibenj';
			comment: 'Logged when views are moved from one view container to another';
			viewCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of views moved' };
			fromContainer: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The starting view container of the moved views' };
			toContainer: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The destination view container of the moved views' };
			fromLocation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The location of the starting view container. e.g. Primary Side Bar' };
			toLocation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The location of the destination view container. e.g. Panel' };
		};

		this.telemetryService.publicLog2<ViewDescriptorServiceMoveViewsEvent, ViewDescriptorServiceMoveViewsClassification>('viewDescriptorService.moveViews', { viewCount, fromContainer, toContainer, fromLocation, toLocation });
	}

	private moveViewsWithoutSaving(views: IViewDescriptor[], from: ViewContainer, to: ViewContainer, visibilityState: ViewVisibilityState = ViewVisibilityState.Expand): void {
		this.removeViews(from, views);
		this.addViews(to, views, visibilityState);

		const oldLocation = this.getViewContainerLocation(from);
		const newLocation = this.getViewContainerLocation(to);

		if (oldLocation !== newLocation) {
			this._onDidChangeLocation.fire({ views, from: oldLocation, to: newLocation });
		}

		this._onDidChangeContainer.fire({ views, from, to });
	}

	private moveViewContainerToLocationWithoutSaving(viewContainer: ViewContainer, location: ViewContainerLocation, requestedIndex?: number): void {
		const from = this.getViewContainerLocation(viewContainer);
		const to = location;
		if (from !== to) {
			const isGeneratedViewContainer = this.isGeneratedContainerId(viewContainer.id);
			const isDefaultViewContainerLocation = to === this.getDefaultViewContainerLocation(viewContainer);
			if (isGeneratedViewContainer || !isDefaultViewContainerLocation) {
				this.viewContainersCustomLocations.set(viewContainer.id, to);
			} else {
				this.viewContainersCustomLocations.delete(viewContainer.id);
			}
			this.getOrCreateDefaultViewContainerLocationContextKey(viewContainer).set(isGeneratedViewContainer || isDefaultViewContainerLocation);

			viewContainer.requestedIndex = requestedIndex;
			this._onDidChangeContainerLocation.fire({ viewContainer, from, to });

			const views = this.getViewsByContainer(viewContainer);
			this._onDidChangeLocation.fire({ views, from, to });
		}
	}

	private cleanUpGeneratedViewContainer(viewContainerId: string): void {
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
		this.storageService.remove(getViewsStateStorageId(viewContainer?.storageId || getViewContainerStorageId(viewContainerId)), StorageScope.PROFILE);
	}

	private registerGeneratedViewContainer(location: ViewContainerLocation, existingId?: string): ViewContainer {
		const id = existingId || this.generateContainerId(location);

		const container = this.viewContainersRegistry.registerViewContainer({
			id,
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [id, { mergeViewWithContainerWhenSingleView: true }]),
			title: { value: localize('user', "User View Container"), original: 'User View Container' }, // having a placeholder title - this should not be shown anywhere
			icon: location === ViewContainerLocation.Sidebar ? defaultViewIcon : undefined,
			storageId: getViewContainerStorageId(id),
			hideIfEmpty: true
		}, location, { doNotRegisterOpenCommand: true });

		if (this.viewContainersCustomLocations.get(container.id) !== location) {
			this.viewContainersCustomLocations.set(container.id, location);
		}

		this.getOrCreateDefaultViewContainerLocationContextKey(container).set(true);

		return container;
	}

	private onDidStorageChange(): void {
		if (JSON.stringify(this.viewCustomizations) !== this.getStoredViewCustomizationsValue() /* This checks if current window changed the value or not */) {
			this.onDidViewCustomizationsStorageChange();
		}
	}

	private onDidViewCustomizationsStorageChange(): void {
		this._viewCustomizations = undefined;

		const newViewContainerCustomizations = new Map<string, ViewContainerLocation>(Object.entries(this.viewCustomizations.viewContainerLocations));
		const newViewDescriptorCustomizations = new Map<string, string>(Object.entries(this.viewCustomizations.viewLocations));
		const viewContainersToMove: [ViewContainer, ViewContainerLocation][] = [];
		const viewsToMove: { views: IViewDescriptor[]; from: ViewContainer; to: ViewContainer }[] = [];

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
	private generateContainerId(location: ViewContainerLocation): string {
		return `${ViewDescriptorService.COMMON_CONTAINER_ID_PREFIX}.${ViewContainerLocationToString(location)}.${generateUuid()}`;
	}

	private saveViewCustomizations(): void {
		const viewCustomizations: IViewsCustomizations = { viewContainerLocations: {}, viewLocations: {}, viewContainerBadgeEnablementStates: {} };

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

	private _viewCustomizations: IViewsCustomizations | undefined;
	private get viewCustomizations(): IViewsCustomizations {
		if (!this._viewCustomizations) {
			this._viewCustomizations = JSON.parse(this.getStoredViewCustomizationsValue()) as IViewsCustomizations;
			this._viewCustomizations.viewContainerLocations = this._viewCustomizations.viewContainerLocations ?? {};
			this._viewCustomizations.viewLocations = this._viewCustomizations.viewLocations ?? {};
			this._viewCustomizations.viewContainerBadgeEnablementStates = this._viewCustomizations.viewContainerBadgeEnablementStates ?? {};
		}
		return this._viewCustomizations;
	}

	private set viewCustomizations(viewCustomizations: IViewsCustomizations) {
		const value = JSON.stringify(viewCustomizations);
		if (JSON.stringify(this.viewCustomizations) !== value) {
			this._viewCustomizations = viewCustomizations;
			this.setStoredViewCustomizationsValue(value);
		}
	}

	private getStoredViewCustomizationsValue(): string {
		return this.storageService.get(ViewDescriptorService.VIEWS_CUSTOMIZATIONS, StorageScope.PROFILE, '{}');
	}

	private setStoredViewCustomizationsValue(value: string): void {
		this.storageService.store(ViewDescriptorService.VIEWS_CUSTOMIZATIONS, value, StorageScope.PROFILE, StorageTarget.USER);
	}

	private getViewsByContainer(viewContainer: ViewContainer): IViewDescriptor[] {
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

	private onDidRegisterViewContainer(viewContainer: ViewContainer): void {
		const defaultLocation = this.isGeneratedContainerId(viewContainer.id) ? true : this.getViewContainerLocation(viewContainer) === this.getDefaultViewContainerLocation(viewContainer);
		this.getOrCreateDefaultViewContainerLocationContextKey(viewContainer).set(defaultLocation);
		this.getOrRegisterViewContainerModel(viewContainer);
	}

	private getOrRegisterViewContainerModel(viewContainer: ViewContainer): ViewContainerModel {
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

	private onDidDeregisterViewContainer(viewContainer: ViewContainer): void {
		this.viewContainerModels.deleteAndDispose(viewContainer);
		this.viewsVisibilityActionDisposables.deleteAndDispose(viewContainer);
	}

	private onDidChangeActiveViews({ added, removed }: { added: ReadonlyArray<IViewDescriptor>; removed: ReadonlyArray<IViewDescriptor> }): void {
		this.contextKeyService.bufferChangeEvents(() => {
			added.forEach(viewDescriptor => this.getOrCreateActiveViewContextKey(viewDescriptor).set(true));
			removed.forEach(viewDescriptor => this.getOrCreateActiveViewContextKey(viewDescriptor).set(false));
		});
	}

	private onDidChangeVisibleViews({ added, removed }: { added: IViewDescriptor[]; removed: IViewDescriptor[] }): void {
		this.contextKeyService.bufferChangeEvents(() => {
			added.forEach(viewDescriptor => this.getOrCreateVisibleViewContextKey(viewDescriptor).set(true));
			removed.forEach(viewDescriptor => this.getOrCreateVisibleViewContextKey(viewDescriptor).set(false));
		});
	}

	private registerViewsVisibilityActions(viewContainer: ViewContainer, { viewContainerModel, disposables }: { viewContainerModel: ViewContainerModel; disposables: DisposableStore }): void {
		this.viewsVisibilityActionDisposables.deleteAndDispose(viewContainer);
		this.viewsVisibilityActionDisposables.set(viewContainer, this.registerViewsVisibilityActionsForContainer(viewContainerModel));
		disposables.add(Event.any(
			viewContainerModel.onDidChangeActiveViewDescriptors,
			viewContainerModel.onDidAddVisibleViewDescriptors,
			viewContainerModel.onDidRemoveVisibleViewDescriptors,
			viewContainerModel.onDidMoveVisibleViewDescriptors
		)(e => {
			this.viewsVisibilityActionDisposables.deleteAndDispose(viewContainer);
			this.viewsVisibilityActionDisposables.set(viewContainer, this.registerViewsVisibilityActionsForContainer(viewContainerModel));
		}));
	}

	private registerViewsVisibilityActionsForContainer(viewContainerModel: ViewContainerModel): IDisposable {
		const disposables = new DisposableStore();
		viewContainerModel.activeViewDescriptors.forEach((viewDescriptor, index) => {
			if (!viewDescriptor.remoteAuthority) {
				disposables.add(registerAction2(class extends ViewPaneContainerAction<ViewPaneContainer> {
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
					async runInViewPaneContainer(serviceAccessor: ServicesAccessor, viewPaneContainer: ViewPaneContainer): Promise<void> {
						viewPaneContainer.toggleViewVisibility(viewDescriptor.id);
					}
				}));
				disposables.add(registerAction2(class extends ViewPaneContainerAction<ViewPaneContainer> {
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
								when: ContextKeyExpr.and(
									ContextKeyExpr.equals('view', viewDescriptor.id),
									ContextKeyExpr.has(`${viewDescriptor.id}.visible`),
								),
								group: '1_hide',
								order: 1
							}]
						});
					}
					async runInViewPaneContainer(serviceAccessor: ServicesAccessor, viewPaneContainer: ViewPaneContainer): Promise<void> {
						if (viewPaneContainer.getView(viewDescriptor.id)?.isVisible()) {
							viewPaneContainer.toggleViewVisibility(viewDescriptor.id);
						}
					}
				}));
			}
		});
		return disposables;
	}

	private registerResetViewContainerAction(viewContainer: ViewContainer): IDisposable {
		const that = this;
		return registerAction2(class ResetViewLocationAction extends Action2 {
			constructor() {
				super({
					id: `${viewContainer.id}.resetViewContainerLocation`,
					title: localize2('resetViewLocation', "Reset Location"),
					menu: [{
						id: MenuId.ViewContainerTitleContext,
						group: '1_viewActions',
						when: ContextKeyExpr.or(
							ContextKeyExpr.and(
								ContextKeyExpr.equals('viewContainer', viewContainer.id),
								ContextKeyExpr.equals(`${viewContainer.id}.defaultViewContainerLocation`, false)
							)
						)
					}],
				});
			}
			run(accessor: ServicesAccessor) {
				that.moveViewContainerToLocation(viewContainer, that.getDefaultViewContainerLocation(viewContainer), undefined, this.desc.id);
				accessor.get(IViewsService).openViewContainer(viewContainer.id, true);
			}
		});
	}

	private addViews(container: ViewContainer, views: IViewDescriptor[], visibilityState: ViewVisibilityState = ViewVisibilityState.Default): void {
		this.contextKeyService.bufferChangeEvents(() => {
			views.forEach(view => {
				const isDefaultContainer = this.getDefaultContainerById(view.id) === container;
				this.getOrCreateDefaultViewLocationContextKey(view).set(isDefaultContainer);
				if (isDefaultContainer) {
					this.viewDescriptorsCustomLocations.delete(view.id);
				} else {
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

	private removeViews(container: ViewContainer, views: IViewDescriptor[]): void {
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

	private getOrCreateActiveViewContextKey(viewDescriptor: IViewDescriptor): IContextKey<boolean> {
		const activeContextKeyId = `${viewDescriptor.id}.active`;
		let contextKey = this.activeViewContextKeys.get(activeContextKeyId);
		if (!contextKey) {
			contextKey = new RawContextKey(activeContextKeyId, false).bindTo(this.contextKeyService);
			this.activeViewContextKeys.set(activeContextKeyId, contextKey);
		}
		return contextKey;
	}

	private getOrCreateVisibleViewContextKey(viewDescriptor: IViewDescriptor): IContextKey<boolean> {
		const activeContextKeyId = `${viewDescriptor.id}.visible`;
		let contextKey = this.activeViewContextKeys.get(activeContextKeyId);
		if (!contextKey) {
			contextKey = new RawContextKey(activeContextKeyId, false).bindTo(this.contextKeyService);
			this.activeViewContextKeys.set(activeContextKeyId, contextKey);
		}
		return contextKey;
	}

	private getOrCreateMovableViewContextKey(viewDescriptor: IViewDescriptor): IContextKey<boolean> {
		const movableViewContextKeyId = `${viewDescriptor.id}.canMove`;
		let contextKey = this.movableViewContextKeys.get(movableViewContextKeyId);
		if (!contextKey) {
			contextKey = new RawContextKey(movableViewContextKeyId, false).bindTo(this.contextKeyService);
			this.movableViewContextKeys.set(movableViewContextKeyId, contextKey);
		}
		return contextKey;
	}

	private getOrCreateDefaultViewLocationContextKey(viewDescriptor: IViewDescriptor): IContextKey<boolean> {
		const defaultViewLocationContextKeyId = `${viewDescriptor.id}.defaultViewLocation`;
		let contextKey = this.defaultViewLocationContextKeys.get(defaultViewLocationContextKeyId);
		if (!contextKey) {
			contextKey = new RawContextKey(defaultViewLocationContextKeyId, false).bindTo(this.contextKeyService);
			this.defaultViewLocationContextKeys.set(defaultViewLocationContextKeyId, contextKey);
		}
		return contextKey;
	}

	private getOrCreateDefaultViewContainerLocationContextKey(viewContainer: ViewContainer): IContextKey<boolean> {
		const defaultViewContainerLocationContextKeyId = `${viewContainer.id}.defaultViewContainerLocation`;
		let contextKey = this.defaultViewContainerLocationContextKeys.get(defaultViewContainerLocationContextKeyId);
		if (!contextKey) {
			contextKey = new RawContextKey(defaultViewContainerLocationContextKeyId, false).bindTo(this.contextKeyService);
			this.defaultViewContainerLocationContextKeys.set(defaultViewContainerLocationContextKeyId, contextKey);
		}
		return contextKey;
	}
}

registerSingleton(IViewDescriptorService, ViewDescriptorService, InstantiationType.Delayed);
