/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/views';
import { Disposable, IDisposable, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IViewDescriptorService, ViewContainer, IViewDescriptor, IViewContainersRegistry, Extensions as ViewExtensions, IView, ViewContainerLocation, IViewsService, IViewPaneContainer, getVisbileViewContextKey } from 'vs/workbench/common/views';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService, StorageScope, IWorkspaceStorageChangeEvent } from 'vs/platform/storage/common/storage';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Event, Emitter } from 'vs/base/common/event';
import { firstIndex, move } from 'vs/base/common/arrays';
import { isUndefinedOrNull, isUndefined, isString } from 'vs/base/common/types';
import { MenuId, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { localize } from 'vs/nls';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { values } from 'vs/base/common/map';
import { toggleClass, addClass } from 'vs/base/browser/dom';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { PaneCompositePanel, PanelRegistry, PanelDescriptor, Extensions as PanelExtensions } from 'vs/workbench/browser/panel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, IFileIconTheme } from 'vs/platform/theme/common/themeService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Viewlet, ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions } from 'vs/workbench/browser/viewlet';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { URI } from 'vs/base/common/uri';
import { IProgressIndicator } from 'vs/platform/progress/common/progress';
import { IStorageKeysSyncRegistryService } from 'vs/platform/userDataSync/common/storageKeys';

export interface IViewState {
	visibleGlobal: boolean | undefined;
	visibleWorkspace: boolean | undefined;
	collapsed: boolean | undefined;
	order?: number;
	size?: number;
}

export interface IViewDescriptorRef {
	viewDescriptor: IViewDescriptor;
	index: number;
}

export interface IAddedViewDescriptorRef extends IViewDescriptorRef {
	collapsed: boolean;
	size?: number;
}

export class ContributableViewsModel extends Disposable {

	private _viewDescriptors: IViewDescriptor[] = [];
	get viewDescriptors(): ReadonlyArray<IViewDescriptor> {
		return this._viewDescriptors;
	}

	get visibleViewDescriptors(): IViewDescriptor[] {
		return this.viewDescriptors.filter(v => this.isViewDescriptorVisible(v));
	}

	private _onDidAdd = this._register(new Emitter<IAddedViewDescriptorRef[]>());
	readonly onDidAdd: Event<IAddedViewDescriptorRef[]> = this._onDidAdd.event;

	private _onDidRemove = this._register(new Emitter<IViewDescriptorRef[]>());
	readonly onDidRemove: Event<IViewDescriptorRef[]> = this._onDidRemove.event;

	private _onDidMove = this._register(new Emitter<{ from: IViewDescriptorRef; to: IViewDescriptorRef; }>());
	readonly onDidMove: Event<{ from: IViewDescriptorRef; to: IViewDescriptorRef; }> = this._onDidMove.event;

	private _onDidChangeViewState = this._register(new Emitter<IViewDescriptorRef>());
	protected readonly onDidChangeViewState: Event<IViewDescriptorRef> = this._onDidChangeViewState.event;

	private _onDidChangeActiveViews = this._register(new Emitter<ReadonlyArray<IViewDescriptor>>());
	readonly onDidChangeActiveViews: Event<ReadonlyArray<IViewDescriptor>> = this._onDidChangeActiveViews.event;

	constructor(
		container: ViewContainer,
		viewsService: IViewDescriptorService,
		protected viewStates = new Map<string, IViewState>(),
	) {
		super();
		const viewDescriptorCollection = viewsService.getViewDescriptors(container);
		this._register(viewDescriptorCollection.onDidChangeActiveViews(() => this.onDidChangeViewDescriptors(viewDescriptorCollection.activeViewDescriptors)));
		this.onDidChangeViewDescriptors(viewDescriptorCollection.activeViewDescriptors);
	}

	isVisible(id: string): boolean {
		const viewDescriptor = this.viewDescriptors.filter(v => v.id === id)[0];

		if (!viewDescriptor) {
			throw new Error(`Unknown view ${id}`);
		}

		return this.isViewDescriptorVisible(viewDescriptor);
	}

	setVisible(id: string, visible: boolean, size?: number): void {
		this.doSetVisible([{ id, visible, size }]);
	}

	protected doSetVisible(viewDescriptors: { id: string, visible: boolean, size?: number }[]): void {
		const added: IAddedViewDescriptorRef[] = [];
		const removed: IViewDescriptorRef[] = [];

		for (const { visibleIndex, viewDescriptor, state, visible, size } of viewDescriptors.map(({ id, visible, size }) => ({ ...this.find(id), visible, size }))) {

			if (!viewDescriptor.canToggleVisibility) {
				throw new Error(`Can't toggle this view's visibility`);
			}

			if (this.isViewDescriptorVisible(viewDescriptor) === visible) {
				return;
			}

			if (viewDescriptor.workspace) {
				state.visibleWorkspace = visible;
			} else {
				state.visibleGlobal = visible;
			}

			if (typeof size === 'number') {
				state.size = size;
			}

			if (visible) {
				added.push({ index: visibleIndex, viewDescriptor, size: state.size, collapsed: !!state.collapsed });
			} else {
				removed.push({ index: visibleIndex, viewDescriptor });
			}
		}

		if (added.length) {
			this._onDidAdd.fire(added);
		}
		if (removed.length) {
			this._onDidRemove.fire(removed);
		}
	}

	isCollapsed(id: string): boolean {
		const state = this.viewStates.get(id);

		if (!state) {
			throw new Error(`Unknown view ${id}`);
		}

		return !!state.collapsed;
	}

	setCollapsed(id: string, collapsed: boolean): void {
		const { index, state, viewDescriptor } = this.find(id);
		if (state.collapsed !== collapsed) {
			state.collapsed = collapsed;
			this._onDidChangeViewState.fire({ viewDescriptor, index });
		}
	}

	getSize(id: string): number | undefined {
		const state = this.viewStates.get(id);

		if (!state) {
			throw new Error(`Unknown view ${id}`);
		}

		return state.size;
	}

	setSize(id: string, size: number): void {
		const { index, state, viewDescriptor } = this.find(id);
		if (state.size !== size) {
			state.size = size;
			this._onDidChangeViewState.fire({ viewDescriptor, index });
		}
	}

	move(from: string, to: string): void {
		const fromIndex = firstIndex(this.viewDescriptors, v => v.id === from);
		const toIndex = firstIndex(this.viewDescriptors, v => v.id === to);

		const fromViewDescriptor = this.viewDescriptors[fromIndex];
		const toViewDescriptor = this.viewDescriptors[toIndex];

		move(this._viewDescriptors, fromIndex, toIndex);

		for (let index = 0; index < this.viewDescriptors.length; index++) {
			const state = this.viewStates.get(this.viewDescriptors[index].id)!;
			state.order = index;
		}

		this._onDidMove.fire({
			from: { index: fromIndex, viewDescriptor: fromViewDescriptor },
			to: { index: toIndex, viewDescriptor: toViewDescriptor }
		});
	}

	private isViewDescriptorVisible(viewDescriptor: IViewDescriptor): boolean {
		const viewState = this.viewStates.get(viewDescriptor.id);
		if (!viewState) {
			throw new Error(`Unknown view ${viewDescriptor.id}`);
		}
		return viewDescriptor.workspace ? !!viewState.visibleWorkspace : !!viewState.visibleGlobal;
	}

	private find(id: string): { index: number, visibleIndex: number, viewDescriptor: IViewDescriptor, state: IViewState; } {
		for (let i = 0, visibleIndex = 0; i < this.viewDescriptors.length; i++) {
			const viewDescriptor = this.viewDescriptors[i];
			const state = this.viewStates.get(viewDescriptor.id);
			if (!state) {
				throw new Error(`View state for ${id} not found`);
			}

			if (viewDescriptor.id === id) {
				return { index: i, visibleIndex, viewDescriptor, state };
			}

			if (viewDescriptor.workspace ? state.visibleWorkspace : state.visibleGlobal) {
				visibleIndex++;
			}
		}

		throw new Error(`view descriptor ${id} not found`);
	}

	private compareViewDescriptors(a: IViewDescriptor, b: IViewDescriptor): number {
		if (a.id === b.id) {
			return 0;
		}

		return (this.getViewOrder(a) - this.getViewOrder(b)) || this.getGroupOrderResult(a, b);
	}

	private getGroupOrderResult(a: IViewDescriptor, b: IViewDescriptor) {
		if (!a.group || !b.group) {
			return 0;
		}

		if (a.group === b.group) {
			return 0;
		}

		return a.group < b.group ? -1 : 1;
	}

	private getViewOrder(viewDescriptor: IViewDescriptor): number {
		const viewState = this.viewStates.get(viewDescriptor.id);
		const viewOrder = viewState && typeof viewState.order === 'number' ? viewState.order : viewDescriptor.order;
		return typeof viewOrder === 'number' ? viewOrder : Number.MAX_VALUE;
	}

	private onDidChangeViewDescriptors(viewDescriptors: IViewDescriptor[]): void {
		for (const viewDescriptor of viewDescriptors) {
			const viewState = this.viewStates.get(viewDescriptor.id);
			if (viewState) {
				// set defaults if not set
				if (viewDescriptor.workspace) {
					viewState.visibleWorkspace = isUndefinedOrNull(viewState.visibleWorkspace) ? !viewDescriptor.hideByDefault : viewState.visibleWorkspace;
				} else {
					viewState.visibleGlobal = isUndefinedOrNull(viewState.visibleGlobal) ? !viewDescriptor.hideByDefault : viewState.visibleGlobal;
				}
				viewState.collapsed = isUndefinedOrNull(viewState.collapsed) ? !!viewDescriptor.collapsed : viewState.collapsed;
			} else {
				this.viewStates.set(viewDescriptor.id, {
					visibleGlobal: !viewDescriptor.hideByDefault,
					visibleWorkspace: !viewDescriptor.hideByDefault,
					collapsed: !!viewDescriptor.collapsed
				});
			}
		}

		viewDescriptors = viewDescriptors.sort(this.compareViewDescriptors.bind(this));

		const toRemove: { index: number, viewDescriptor: IViewDescriptor; }[] = [];
		for (let index = 0; index < this._viewDescriptors.length; index++) {
			const previousViewDescriptor = this._viewDescriptors[index];
			if (this.isViewDescriptorVisible(previousViewDescriptor) && viewDescriptors.every(viewDescriptor => viewDescriptor.id !== previousViewDescriptor.id)) {
				const { visibleIndex } = this.find(previousViewDescriptor.id);
				toRemove.push({ index: visibleIndex, viewDescriptor: previousViewDescriptor });
			}
		}

		const previous = this._viewDescriptors;
		this._viewDescriptors = viewDescriptors.slice(0);

		const toAdd: { index: number, viewDescriptor: IViewDescriptor, size?: number, collapsed: boolean; }[] = [];
		for (let i = 0; i < this._viewDescriptors.length; i++) {
			const viewDescriptor = this._viewDescriptors[i];
			if (this.isViewDescriptorVisible(viewDescriptor) && previous.every(previousViewDescriptor => previousViewDescriptor.id !== viewDescriptor.id)) {
				const { visibleIndex, state } = this.find(viewDescriptor.id);
				toAdd.push({ index: visibleIndex, viewDescriptor, size: state.size, collapsed: !!state.collapsed });
			}
		}

		if (toRemove.length) {
			this._onDidRemove.fire(toRemove);
		}

		if (toAdd.length) {
			this._onDidAdd.fire(toAdd);
		}

		this._onDidChangeActiveViews.fire(this.viewDescriptors);
	}
}

interface IStoredWorkspaceViewState {
	collapsed: boolean;
	isHidden: boolean;
	size?: number;
	order?: number;
}

interface IStoredGlobalViewState {
	id: string;
	isHidden: boolean;
	order?: number;
}

export class PersistentContributableViewsModel extends ContributableViewsModel {

	private readonly workspaceViewsStateStorageId: string;
	private readonly globalViewsStateStorageId: string;

	private storageService: IStorageService;

	constructor(
		container: ViewContainer,
		viewletStateStorageId: string,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IStorageService storageService: IStorageService,
		@IStorageKeysSyncRegistryService storageKeysSyncRegistryService: IStorageKeysSyncRegistryService
	) {
		const globalViewsStateStorageId = `${viewletStateStorageId}.hidden`;
		storageKeysSyncRegistryService.registerStorageKey({ key: globalViewsStateStorageId, version: 1 });
		const viewStates = PersistentContributableViewsModel.loadViewsStates(viewletStateStorageId, globalViewsStateStorageId, storageService);

		super(container, viewDescriptorService, viewStates);

		this.storageService = storageService;
		this.workspaceViewsStateStorageId = viewletStateStorageId;
		this.globalViewsStateStorageId = globalViewsStateStorageId;

		this._register(Event.any(
			this.onDidAdd,
			this.onDidRemove,
			Event.map(this.onDidMove, ({ from, to }) => [from, to]),
			Event.map(this.onDidChangeViewState, viewDescriptorRef => [viewDescriptorRef]))
			(viewDescriptorRefs => this.saveViewsStates()));

		this._globalViewsStatesValue = this.getStoredGlobalViewsStatesValue();
		this._register(this.storageService.onDidChangeStorage(e => this.onDidStorageChange(e)));
	}

	private onDidStorageChange(e: IWorkspaceStorageChangeEvent): void {
		if (e.key === this.globalViewsStateStorageId && e.scope === StorageScope.GLOBAL
			&& this.globalViewsStatesValue !== this.getStoredGlobalViewsStatesValue() /* This checks if current window changed the value or not */) {
			this._globalViewsStatesValue = undefined;
			const storedViewsVisibilityStates = PersistentContributableViewsModel.loadGlobalViewsState(this.globalViewsStateStorageId, this.storageService, StorageScope.GLOBAL);
			const changedViews: { id: string, visible: boolean }[] = [];
			for (const [id, state] of storedViewsVisibilityStates) {
				const viewState = this.viewStates.get(id);
				if (viewState) {
					if (viewState.visibleGlobal !== !state.isHidden) {
						changedViews.push({ id, visible: !state.isHidden });
					}
				}
			}
			if (changedViews.length) {
				this.doSetVisible(changedViews);
			}
		}
	}

	private saveViewsStates(): void {
		this.saveWorkspaceViewsStates();
		this.saveGlobalViewsStates();
	}

	private saveWorkspaceViewsStates(): void {
		const storedViewsStates: { [id: string]: IStoredWorkspaceViewState; } = JSON.parse(this.storageService.get(this.workspaceViewsStateStorageId, StorageScope.WORKSPACE, '{}'));
		for (const viewDescriptor of this.viewDescriptors) {
			const viewState = this.viewStates.get(viewDescriptor.id);
			if (viewState) {
				storedViewsStates[viewDescriptor.id] = {
					collapsed: !!viewState.collapsed,
					isHidden: !viewState.visibleWorkspace,
					size: viewState.size,
					order: viewDescriptor.workspace && viewState ? viewState.order : undefined
				};
			}
		}

		if (Object.keys(storedViewsStates).length > 0) {
			this.storageService.store(this.workspaceViewsStateStorageId, JSON.stringify(storedViewsStates), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(this.workspaceViewsStateStorageId, StorageScope.WORKSPACE);
		}
	}

	private saveGlobalViewsStates(): void {
		const storedViewsVisibilityStates = PersistentContributableViewsModel.loadGlobalViewsState(this.globalViewsStateStorageId, this.storageService, StorageScope.GLOBAL);
		for (const viewDescriptor of this.viewDescriptors) {
			const viewState = this.viewStates.get(viewDescriptor.id);
			storedViewsVisibilityStates.set(viewDescriptor.id, {
				id: viewDescriptor.id,
				isHidden: viewState && viewDescriptor.canToggleVisibility ? !viewState.visibleGlobal : false,
				order: !viewDescriptor.workspace && viewState ? viewState.order : undefined
			});
		}
		this.globalViewsStatesValue = JSON.stringify(values(storedViewsVisibilityStates));
	}

	private _globalViewsStatesValue: string | undefined;
	private get globalViewsStatesValue(): string {
		if (!this._globalViewsStatesValue) {
			this._globalViewsStatesValue = this.getStoredGlobalViewsStatesValue();
		}

		return this._globalViewsStatesValue;
	}

	private set globalViewsStatesValue(globalViewsStatesValue: string) {
		if (this.globalViewsStatesValue !== globalViewsStatesValue) {
			this._globalViewsStatesValue = globalViewsStatesValue;
			this.setStoredGlobalViewsStatesValue(globalViewsStatesValue);
		}
	}

	private getStoredGlobalViewsStatesValue(): string {
		return this.storageService.get(this.globalViewsStateStorageId, StorageScope.GLOBAL, '[]');
	}

	private setStoredGlobalViewsStatesValue(value: string): void {
		this.storageService.store(this.globalViewsStateStorageId, value, StorageScope.GLOBAL);
	}

	private static loadViewsStates(workspaceViewsStateStorageId: string, globalViewsStateStorageId: string, storageService: IStorageService): Map<string, IViewState> {
		const viewStates = new Map<string, IViewState>();
		const workspaceViewsStates = <{ [id: string]: IStoredWorkspaceViewState; }>JSON.parse(storageService.get(workspaceViewsStateStorageId, StorageScope.WORKSPACE, '{}'));
		for (const id of Object.keys(workspaceViewsStates)) {
			const workspaceViewState = workspaceViewsStates[id];
			viewStates.set(id, {
				visibleGlobal: undefined,
				visibleWorkspace: isUndefined(workspaceViewState.isHidden) ? undefined : !workspaceViewState.isHidden,
				collapsed: workspaceViewState.collapsed,
				order: workspaceViewState.order,
				size: workspaceViewState.size
			});
		}

		// Migrate to `viewletStateStorageId`
		const workspaceVisibilityStates = this.loadGlobalViewsState(globalViewsStateStorageId, storageService, StorageScope.WORKSPACE);
		if (workspaceVisibilityStates.size > 0) {
			for (const { id, isHidden } of values(workspaceVisibilityStates)) {
				let viewState = viewStates.get(id);
				// Not migrated to `viewletStateStorageId`
				if (viewState) {
					if (isUndefined(viewState.visibleWorkspace)) {
						viewState.visibleWorkspace = !isHidden;
					}
				} else {
					viewStates.set(id, {
						collapsed: undefined,
						visibleGlobal: undefined,
						visibleWorkspace: !isHidden,
					});
				}
			}
			storageService.remove(globalViewsStateStorageId, StorageScope.WORKSPACE);
		}

		const globalViewsStates = this.loadGlobalViewsState(globalViewsStateStorageId, storageService, StorageScope.GLOBAL);
		for (const { id, isHidden, order } of values(globalViewsStates)) {
			let viewState = viewStates.get(id);
			if (viewState) {
				viewState.visibleGlobal = !isHidden;
				if (!isUndefined(order)) {
					viewState.order = order;
				}
			} else {
				viewStates.set(id, {
					visibleGlobal: !isHidden,
					order,
					collapsed: undefined,
					visibleWorkspace: undefined,
				});
			}
		}
		return viewStates;
	}

	private static loadGlobalViewsState(globalViewsStateStorageId: string, storageService: IStorageService, scope: StorageScope): Map<string, IStoredGlobalViewState> {
		const storedValue = <Array<string | IStoredGlobalViewState>>JSON.parse(storageService.get(globalViewsStateStorageId, scope, '[]'));
		let hasDuplicates = false;
		const storedGlobalViewsState = storedValue.reduce((result, storedState) => {
			if (typeof storedState === 'string' /* migration */) {
				hasDuplicates = hasDuplicates || result.has(storedState);
				result.set(storedState, { id: storedState, isHidden: true });
			} else {
				hasDuplicates = hasDuplicates || result.has(storedState.id);
				result.set(storedState.id, storedState);
			}
			return result;
		}, new Map<string, IStoredGlobalViewState>());

		if (hasDuplicates) {
			storageService.store(globalViewsStateStorageId, JSON.stringify(values(storedGlobalViewsState)), scope);
		}

		return storedGlobalViewsState;
	}
}

export class ViewsService extends Disposable implements IViewsService {

	_serviceBrand: undefined;

	private readonly viewContainersRegistry: IViewContainersRegistry;
	private readonly viewDisposable: Map<IViewDescriptor, IDisposable>;

	private readonly _onDidChangeViewVisibility: Emitter<{ id: string, visible: boolean }> = this._register(new Emitter<{ id: string, visible: boolean }>());
	readonly onDidChangeViewVisibility: Event<{ id: string, visible: boolean }> = this._onDidChangeViewVisibility.event;

	private readonly visibleViewContextKeys: Map<string, IContextKey<boolean>>;

	private readonly viewPaneContainers: Map<string, ViewPaneContainer>;

	constructor(
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IPanelService private readonly panelService: IPanelService,
		@IViewletService private readonly viewletService: IViewletService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super();

		this.viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		this.viewDisposable = new Map<IViewDescriptor, IDisposable>();
		this.visibleViewContextKeys = new Map<string, IContextKey<boolean>>();
		this.viewPaneContainers = new Map<string, ViewPaneContainer>();

		this._register(toDisposable(() => {
			this.viewDisposable.forEach(disposable => disposable.dispose());
			this.viewDisposable.clear();
		}));

		this.viewContainersRegistry.all.forEach(viewContainer => this.onDidRegisterViewContainer(viewContainer, this.viewContainersRegistry.getViewContainerLocation(viewContainer)));
		this._register(this.viewContainersRegistry.onDidRegister(({ viewContainer, viewContainerLocation }) => this.onDidRegisterViewContainer(viewContainer, viewContainerLocation)));

		this._register(this.viewContainersRegistry.onDidDeregister(e => this.viewPaneContainers.delete(e.viewContainer.id)));
	}

	private registerViewPaneContainer(viewPaneContainer: ViewPaneContainer): void {
		this._register(viewPaneContainer.onDidAddViews(views => this.onViewsAdded(views)));
		this._register(viewPaneContainer.onDidChangeViewVisibility(view => this.onViewsVisibilityChanged(view, view.isBodyVisible())));
		this._register(viewPaneContainer.onDidRemoveViews(views => this.onViewsRemoved(views)));

		this.viewPaneContainers.set(viewPaneContainer.getId(), viewPaneContainer);
	}

	private onViewsAdded(added: IView[]): void {
		for (const view of added) {
			this.onViewsVisibilityChanged(view, view.isBodyVisible());
		}
	}

	private onViewsVisibilityChanged(view: IView, visible: boolean): void {
		this.getOrCreateActiveViewContextKey(view).set(visible);
		this._onDidChangeViewVisibility.fire({ id: view.id, visible: visible });
	}

	private onViewsRemoved(removed: IView[]): void {
		for (const view of removed) {
			this.onViewsVisibilityChanged(view, false);
		}
	}

	private getOrCreateActiveViewContextKey(view: IView): IContextKey<boolean> {
		const visibleContextKeyId = getVisbileViewContextKey(view.id);
		let contextKey = this.visibleViewContextKeys.get(visibleContextKeyId);
		if (!contextKey) {
			contextKey = new RawContextKey(visibleContextKeyId, false).bindTo(this.contextKeyService);
			this.visibleViewContextKeys.set(visibleContextKeyId, contextKey);
		}
		return contextKey;
	}

	private onDidRegisterViewContainer(viewContainer: ViewContainer, viewContainerLocation: ViewContainerLocation): void {
		this.registerViewletOrPanel(viewContainer, viewContainerLocation);
		const viewDescriptorCollection = this.viewDescriptorService.getViewDescriptors(viewContainer);
		this.onViewDescriptorsAdded(viewDescriptorCollection.allViewDescriptors, viewContainer);
		this._register(viewDescriptorCollection.onDidChangeViews(({ added, removed }) => {
			this.onViewDescriptorsAdded(added, viewContainer);
			this.onViewDescriptorsRemoved(removed);
		}));
	}

	private onViewDescriptorsAdded(views: IViewDescriptor[], container: ViewContainer): void {
		const location = this.viewContainersRegistry.getViewContainerLocation(container);
		if (location === undefined) {
			return;
		}

		const composite = this.getComposite(container.id, location);
		for (const viewDescriptor of views) {
			const disposables = new DisposableStore();
			disposables.add(registerAction2(class FocusViewAction extends Action2 {
				constructor() {
					super({
						id: viewDescriptor.focusCommand ? viewDescriptor.focusCommand.id : `${viewDescriptor.id}.focus`,
						title: { original: `Focus on ${viewDescriptor.name} View`, value: localize('focus view', "Focus on {0} View", viewDescriptor.name) },
						category: composite ? composite.name : localize('view category', "View"),
						menu: [{
							id: MenuId.CommandPalette,
						}],
						keybinding: {
							when: ContextKeyExpr.has(`${viewDescriptor.id}.active`),
							weight: KeybindingWeight.WorkbenchContrib,
							primary: viewDescriptor.focusCommand?.keybindings?.primary,
							secondary: viewDescriptor.focusCommand?.keybindings?.secondary,
							linux: viewDescriptor.focusCommand?.keybindings?.linux,
							mac: viewDescriptor.focusCommand?.keybindings?.mac,
							win: viewDescriptor.focusCommand?.keybindings?.win
						}
					});
				}
				run(accessor: ServicesAccessor): void {
					accessor.get(IViewsService).openView(viewDescriptor.id, true);
				}
			}));

			disposables.add(registerAction2(class ResetViewLocationAction extends Action2 {
				constructor() {
					super({
						id: `${viewDescriptor.id}.resetViewLocation`,
						title: {
							original: 'Reset View Location',
							value: localize('resetViewLocation', "Reset View Location")
						},
						menu: [{
							id: MenuId.ViewTitleContext,
							when: ContextKeyExpr.or(
								ContextKeyExpr.and(
									ContextKeyExpr.equals('view', viewDescriptor.id),
									ContextKeyExpr.equals(`${viewDescriptor.id}.defaultViewLocation`, false)
								)
							)
						}],
					});
				}
				run(accessor: ServicesAccessor): void {
					const viewDescriptorService = accessor.get(IViewDescriptorService);
					viewDescriptorService.moveViewsToContainer([viewDescriptor], viewDescriptorService.getDefaultContainer(viewDescriptor.id)!);
					accessor.get(IViewsService).openView(viewDescriptor.id, true);
				}
			}));

			this.viewDisposable.set(viewDescriptor, disposables);
		}
	}

	private onViewDescriptorsRemoved(views: IViewDescriptor[]): void {
		for (const view of views) {
			const disposable = this.viewDisposable.get(view);
			if (disposable) {
				disposable.dispose();
				this.viewDisposable.delete(view);
			}
		}
	}

	private async openComposite(compositeId: string, location: ViewContainerLocation, focus?: boolean): Promise<IPaneComposite | undefined> {
		if (location === ViewContainerLocation.Sidebar) {
			return this.viewletService.openViewlet(compositeId, focus);
		} else if (location === ViewContainerLocation.Panel) {
			return this.panelService.openPanel(compositeId, focus) as Promise<IPaneComposite>;
		}
		return undefined;
	}

	private getComposite(compositeId: string, location: ViewContainerLocation): { id: string, name: string } | undefined {
		if (location === ViewContainerLocation.Sidebar) {
			return this.viewletService.getViewlet(compositeId);
		} else if (location === ViewContainerLocation.Panel) {
			return this.panelService.getPanel(compositeId);
		}

		return undefined;
	}

	isViewVisible(id: string): boolean {
		const activeView = this.getActiveViewWithId(id);
		return activeView?.isBodyVisible() || false;
	}

	getActiveViewWithId<T extends IView>(id: string): T | null {
		const viewContainer = this.viewDescriptorService.getViewContainer(id);
		if (viewContainer) {
			const activeViewPaneContainer = this.getActiveViewPaneContainer(viewContainer);
			if (activeViewPaneContainer) {
				return activeViewPaneContainer.getView(id) as T;
			}
		}
		return null;
	}

	async openView<T extends IView>(id: string, focus: boolean): Promise<T | null> {
		const viewContainer = this.viewDescriptorService.getViewContainer(id);
		if (viewContainer) {
			const location = this.viewContainersRegistry.getViewContainerLocation(viewContainer);
			const compositeDescriptor = this.getComposite(viewContainer.id, location!);
			if (compositeDescriptor) {
				const paneComposite = await this.openComposite(compositeDescriptor.id, location!) as IPaneComposite | undefined;
				if (paneComposite && paneComposite.openView) {
					return paneComposite.openView(id, focus) as T;
				} else if (focus) {
					paneComposite?.focus();
				}
			}
		}

		return null;
	}

	closeView(id: string): void {
		const viewContainer = this.viewDescriptorService.getViewContainer(id);
		if (viewContainer) {
			const activeViewPaneContainer = this.getActiveViewPaneContainer(viewContainer);
			if (activeViewPaneContainer) {
				const view = activeViewPaneContainer.getView(id);
				if (view) {
					if (activeViewPaneContainer.views.length === 1) {
						const location = this.viewContainersRegistry.getViewContainerLocation(viewContainer);
						if (location === ViewContainerLocation.Sidebar) {
							this.layoutService.setSideBarHidden(true);
						} else if (location === ViewContainerLocation.Panel) {
							this.panelService.hideActivePanel();
						}
					} else {
						view.setExpanded(false);
					}
				}
			}
		}
	}

	private getActiveViewPaneContainer(viewContainer: ViewContainer): IViewPaneContainer | null {
		const location = this.viewContainersRegistry.getViewContainerLocation(viewContainer);

		if (location === ViewContainerLocation.Sidebar) {
			const activeViewlet = this.viewletService.getActiveViewlet();
			if (activeViewlet?.getId() === viewContainer.id) {
				return activeViewlet.getViewPaneContainer() || null;
			}
		} else if (location === ViewContainerLocation.Panel) {
			const activePanel = this.panelService.getActivePanel();
			if (activePanel?.getId() === viewContainer.id) {
				return (activePanel as IPaneComposite).getViewPaneContainer() || null;
			}
		}

		return null;
	}

	getProgressIndicator(id: string): IProgressIndicator | undefined {
		const viewContainer = this.viewDescriptorService.getViewContainer(id);
		if (viewContainer === null) {
			return undefined;
		}

		const view = this.viewPaneContainers.get(viewContainer.id)?.getView(id);
		return view?.getProgressIndicator();
	}

	private registerViewletOrPanel(viewContainer: ViewContainer, viewContainerLocation: ViewContainerLocation): void {
		switch (viewContainerLocation) {
			case ViewContainerLocation.Panel:
				this.registerPanel(viewContainer);
				break;
			case ViewContainerLocation.Sidebar:
				if (viewContainer.ctorDescriptor) {
					this.registerViewlet(viewContainer);
				}
				break;
		}
	}

	private registerPanel(viewContainer: ViewContainer): void {
		const that = this;
		class PaneContainerPanel extends PaneCompositePanel {
			constructor(
				@ITelemetryService telemetryService: ITelemetryService,
				@IStorageService storageService: IStorageService,
				@IInstantiationService instantiationService: IInstantiationService,
				@IThemeService themeService: IThemeService,
				@IContextMenuService contextMenuService: IContextMenuService,
				@IExtensionService extensionService: IExtensionService,
				@IWorkspaceContextService contextService: IWorkspaceContextService,
			) {
				// Use composite's instantiation service to get the editor progress service for any editors instantiated within the composite
				const viewPaneContainer = (instantiationService as any).createInstance(viewContainer.ctorDescriptor!.ctor, ...(viewContainer.ctorDescriptor!.staticArguments || []));
				super(viewContainer.id, viewPaneContainer, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);
				that.registerViewPaneContainer(this.viewPaneContainer);
			}
		}
		Registry.as<PanelRegistry>(PanelExtensions.Panels).registerPanel(PanelDescriptor.create(
			PaneContainerPanel,
			viewContainer.id,
			viewContainer.name,
			isString(viewContainer.icon) ? viewContainer.icon : undefined,
			viewContainer.order,
			viewContainer.focusCommand?.id,
		));
	}

	private registerViewlet(viewContainer: ViewContainer): void {
		const that = this;
		class PaneContainerViewlet extends Viewlet {
			constructor(
				@IConfigurationService configurationService: IConfigurationService,
				@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
				@ITelemetryService telemetryService: ITelemetryService,
				@IWorkspaceContextService contextService: IWorkspaceContextService,
				@IStorageService storageService: IStorageService,
				@IInstantiationService instantiationService: IInstantiationService,
				@IThemeService themeService: IThemeService,
				@IContextMenuService contextMenuService: IContextMenuService,
				@IExtensionService extensionService: IExtensionService,
			) {
				// Use composite's instantiation service to get the editor progress service for any editors instantiated within the composite
				const viewPaneContainer = (instantiationService as any).createInstance(viewContainer.ctorDescriptor!.ctor, ...(viewContainer.ctorDescriptor!.staticArguments || []));
				super(viewContainer.id, viewPaneContainer, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService, layoutService, configurationService);
				that.registerViewPaneContainer(this.viewPaneContainer);
			}
		}
		Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(ViewletDescriptor.create(
			PaneContainerViewlet,
			viewContainer.id,
			viewContainer.name,
			isString(viewContainer.icon) ? viewContainer.icon : undefined,
			viewContainer.order,
			viewContainer.icon instanceof URI ? viewContainer.icon : undefined
		));
	}
}

export function createFileIconThemableTreeContainerScope(container: HTMLElement, themeService: IThemeService): IDisposable {
	addClass(container, 'file-icon-themable-tree');
	addClass(container, 'show-file-icons');

	const onDidChangeFileIconTheme = (theme: IFileIconTheme) => {
		toggleClass(container, 'align-icons-and-twisties', theme.hasFileIcons && !theme.hasFolderIcons);
		toggleClass(container, 'hide-arrows', theme.hidesExplorerArrows === true);
	};

	onDidChangeFileIconTheme(themeService.getFileIconTheme());
	return themeService.onDidFileIconThemeChange(onDidChangeFileIconTheme);
}

registerSingleton(IViewsService, ViewsService);
