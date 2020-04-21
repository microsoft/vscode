/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ViewContainerLocation, IViewDescriptorService, ViewContainer, IViewsRegistry, IViewContainersRegistry, IViewDescriptor, Extensions as ViewExtensions, IViewContainerModel, IAddedViewDescriptorRef, IViewDescriptorRef } from 'vs/workbench/common/views';
import { IContextKey, RawContextKey, IContextKeyService, IReadableSet } from 'vs/platform/contextkey/common/contextkey';
import { IStorageService, StorageScope, IWorkspaceStorageChangeEvent } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { toDisposable, DisposableStore, Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';
import { IStorageKeysSyncRegistryService } from 'vs/platform/userDataSync/common/storageKeys';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { generateUuid } from 'vs/base/common/uuid';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { firstIndex, move } from 'vs/base/common/arrays';
import { isUndefined, isUndefinedOrNull } from 'vs/base/common/types';
import { values } from 'vs/base/common/map';
import { isEqual } from 'vs/base/common/resources';

class CounterSet<T> implements IReadableSet<T> {

	private map = new Map<T, number>();

	add(value: T): CounterSet<T> {
		this.map.set(value, (this.map.get(value) || 0) + 1);
		return this;
	}

	delete(value: T): boolean {
		let counter = this.map.get(value) || 0;

		if (counter === 0) {
			return false;
		}

		counter--;

		if (counter === 0) {
			this.map.delete(value);
		} else {
			this.map.set(value, counter);
		}

		return true;
	}

	has(value: T): boolean {
		return this.map.has(value);
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

interface IViewDescriptorState {
	visibleGlobal: boolean | undefined;
	visibleWorkspace: boolean | undefined;
	collapsed: boolean | undefined;
	active: boolean
	order?: number;
	size?: number;
}

class ViewDescriptorsState extends Disposable {

	private readonly workspaceViewsStateStorageId: string;
	private readonly globalViewsStateStorageId: string;
	private readonly state: Map<string, IViewDescriptorState>;

	private _onDidChangeStoredState = this._register(new Emitter<{ id: string, visible: boolean }[]>());
	readonly onDidChangeStoredState = this._onDidChangeStoredState.event;

	constructor(
		viewContainerStorageId: string,
		@IStorageService private readonly storageService: IStorageService,
		@IStorageKeysSyncRegistryService storageKeysSyncRegistryService: IStorageKeysSyncRegistryService
	) {
		super();

		this.globalViewsStateStorageId = `${viewContainerStorageId}.hidden`;
		this.workspaceViewsStateStorageId = viewContainerStorageId;
		storageKeysSyncRegistryService.registerStorageKey({ key: this.globalViewsStateStorageId, version: 1 });
		this._register(this.storageService.onDidChangeStorage(e => this.onDidStorageChange(e)));

		this.state = this.initialize();
	}

	set(id: string, state: IViewDescriptorState): void {
		this.state.set(id, state);
	}

	get(id: string): IViewDescriptorState | undefined {
		return this.state.get(id);
	}

	updateState(viewDescriptors: ReadonlyArray<IViewDescriptor>): void {
		this.updateWorkspaceState(viewDescriptors);
		this.updateGlobalState(viewDescriptors);
	}

	private updateWorkspaceState(viewDescriptors: ReadonlyArray<IViewDescriptor>): void {
		const storedViewsStates: { [id: string]: IStoredWorkspaceViewState; } = JSON.parse(this.storageService.get(this.workspaceViewsStateStorageId, StorageScope.WORKSPACE, '{}'));
		for (const viewDescriptor of viewDescriptors) {
			const viewState = this.state.get(viewDescriptor.id);
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

	private updateGlobalState(viewDescriptors: ReadonlyArray<IViewDescriptor>): void {
		const storedGlobalState = this.getStoredGlobalState();
		for (const viewDescriptor of viewDescriptors) {
			const state = this.state.get(viewDescriptor.id);
			storedGlobalState.set(viewDescriptor.id, {
				id: viewDescriptor.id,
				isHidden: state && viewDescriptor.canToggleVisibility ? !state.visibleGlobal : false,
				order: !viewDescriptor.workspace && state ? state.order : undefined
			});
		}
		this.setStoredGlobalState(storedGlobalState);
	}

	private onDidStorageChange(e: IWorkspaceStorageChangeEvent): void {
		if (e.key === this.globalViewsStateStorageId && e.scope === StorageScope.GLOBAL
			&& this.globalViewsStatesValue !== this.getStoredGlobalViewsStatesValue() /* This checks if current window changed the value or not */) {
			this._globalViewsStatesValue = undefined;
			const storedViewsVisibilityStates = this.getStoredGlobalState();
			const changedStates: { id: string, visible: boolean }[] = [];
			for (const [id, storedState] of storedViewsVisibilityStates) {
				const state = this.state.get(id);
				if (state) {
					if (state.visibleGlobal !== !storedState.isHidden) {
						changedStates.push({ id, visible: !storedState.isHidden });
					}
				}
			}
			if (changedStates.length) {
				this._onDidChangeStoredState.fire(changedStates);
			}
		}
	}

	private initialize(): Map<string, IViewDescriptorState> {
		const viewStates = new Map<string, IViewDescriptorState>();
		const workspaceViewsStates = <{ [id: string]: IStoredWorkspaceViewState; }>JSON.parse(this.storageService.get(this.workspaceViewsStateStorageId, StorageScope.WORKSPACE, '{}'));
		for (const id of Object.keys(workspaceViewsStates)) {
			const workspaceViewState = workspaceViewsStates[id];
			viewStates.set(id, {
				active: false,
				visibleGlobal: undefined,
				visibleWorkspace: isUndefined(workspaceViewState.isHidden) ? undefined : !workspaceViewState.isHidden,
				collapsed: workspaceViewState.collapsed,
				order: workspaceViewState.order,
				size: workspaceViewState.size,
			});
		}

		// Migrate to `viewletStateStorageId`
		const value = this.storageService.get(this.globalViewsStateStorageId, StorageScope.WORKSPACE, '[]');
		const { state: workspaceVisibilityStates } = this.parseStoredGlobalState(value);
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
						active: false,
						collapsed: undefined,
						visibleGlobal: undefined,
						visibleWorkspace: !isHidden,
					});
				}
			}
			this.storageService.remove(this.globalViewsStateStorageId, StorageScope.WORKSPACE);
		}

		const { state, hasDuplicates } = this.parseStoredGlobalState(this.globalViewsStatesValue);
		if (hasDuplicates) {
			this.setStoredGlobalState(state);
		}
		for (const { id, isHidden, order } of values(state)) {
			let viewState = viewStates.get(id);
			if (viewState) {
				viewState.visibleGlobal = !isHidden;
				if (!isUndefined(order)) {
					viewState.order = order;
				}
			} else {
				viewStates.set(id, {
					active: false,
					visibleGlobal: !isHidden,
					order,
					collapsed: undefined,
					visibleWorkspace: undefined,
				});
			}
		}
		return viewStates;
	}

	private getStoredGlobalState(): Map<string, IStoredGlobalViewState> {
		return this.parseStoredGlobalState(this.globalViewsStatesValue).state;
	}

	private setStoredGlobalState(storedGlobalState: Map<string, IStoredGlobalViewState>): void {
		this.globalViewsStatesValue = JSON.stringify(values(storedGlobalState));
	}

	private parseStoredGlobalState(value: string): { state: Map<string, IStoredGlobalViewState>, hasDuplicates: boolean } {
		const storedValue = <Array<string | IStoredGlobalViewState>>JSON.parse(value);
		let hasDuplicates = false;
		const state = storedValue.reduce((result, storedState) => {
			if (typeof storedState === 'string' /* migration */) {
				hasDuplicates = hasDuplicates || result.has(storedState);
				result.set(storedState, { id: storedState, isHidden: true });
			} else {
				hasDuplicates = hasDuplicates || result.has(storedState.id);
				result.set(storedState.id, storedState);
			}
			return result;
		}, new Map<string, IStoredGlobalViewState>());
		return { state, hasDuplicates };
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

}

interface IViewDescriptorItem {
	viewDescriptor: IViewDescriptor;
	state: IViewDescriptorState;
}

class ViewContainerModel extends Disposable implements IViewContainerModel {

	private readonly contextKeys = new CounterSet<string>();
	private viewDescriptorItems: IViewDescriptorItem[] = [];
	private viewDescriptorsState: ViewDescriptorsState;

	// Container Info
	private _title!: string;
	get title(): string { return this._title; }
	private _icon: URI | string | undefined;
	get icon(): URI | string | undefined { return this._icon; }

	private _onDidChangeContainerInfo = this._register(new Emitter<{ title?: boolean, icon?: boolean }>());
	readonly onDidChangeContainerInfo = this._onDidChangeContainerInfo.event;

	// All View Descriptors
	get allViewDescriptors(): ReadonlyArray<IViewDescriptor> { return this.viewDescriptorItems.map(item => item.viewDescriptor); }
	private _onDidChangeAllViewDescriptors = this._register(new Emitter<{ added: ReadonlyArray<IViewDescriptor>, removed: ReadonlyArray<IViewDescriptor> }>());
	readonly onDidChangeAllViewDescriptors = this._onDidChangeAllViewDescriptors.event;

	// Active View Descriptors
	get activeViewDescriptors(): ReadonlyArray<IViewDescriptor> { return this.viewDescriptorItems.filter(item => item.state.active).map(item => item.viewDescriptor); }
	private _onDidChangeActiveViewDescriptors = this._register(new Emitter<{ added: ReadonlyArray<IViewDescriptor>, removed: ReadonlyArray<IViewDescriptor> }>());
	readonly onDidChangeActiveViewDescriptors = this._onDidChangeActiveViewDescriptors.event;

	// Visible View Descriptors
	get visibleViewDescriptors(): ReadonlyArray<IViewDescriptor> { return this.viewDescriptorItems.filter(item => this.isViewDescriptorVisible(item)).map(item => item.viewDescriptor); }

	private _onDidAddVisibleViewDescriptors = this._register(new Emitter<IAddedViewDescriptorRef[]>());
	readonly onDidAddVisibleViewDescriptors: Event<IAddedViewDescriptorRef[]> = this._onDidAddVisibleViewDescriptors.event;

	private _onDidRemoveVisibleViewDescriptors = this._register(new Emitter<IViewDescriptorRef[]>());
	readonly onDidRemoveVisibleViewDescriptors: Event<IViewDescriptorRef[]> = this._onDidRemoveVisibleViewDescriptors.event;

	private _onDidMoveVisibleViewDescriptors = this._register(new Emitter<{ from: IViewDescriptorRef; to: IViewDescriptorRef; }>());
	readonly onDidMoveVisibleViewDescriptors: Event<{ from: IViewDescriptorRef; to: IViewDescriptorRef; }> = this._onDidMoveVisibleViewDescriptors.event;

	constructor(
		private readonly container: ViewContainer,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this._register(Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(this.contextKeys))(() => this.onDidChangeContext()));
		this.viewDescriptorsState = this._register(instantiationService.createInstance(ViewDescriptorsState, container.storageId || `${container.id}.state`));
		this._register(this.viewDescriptorsState.onDidChangeStoredState(items => this.updateVisibility(items)));

		this._register(Event.any(
			this.onDidAddVisibleViewDescriptors,
			this.onDidRemoveVisibleViewDescriptors,
			this.onDidMoveVisibleViewDescriptors)
			(() => {
				this.viewDescriptorsState.updateState(this.allViewDescriptors);
				this.updateContainerInfo();
			}));

		this.updateContainerInfo();
	}

	private updateContainerInfo(): void {
		/* Use default container info if one of the visible view descriptors belongs to the current container by default */
		const useDefaultContainerInfo = this.visibleViewDescriptors.length === 0 || this.visibleViewDescriptors.some(v => Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).getViewContainer(v.id) === this.container);
		const title = useDefaultContainerInfo ? this.container.name : this.visibleViewDescriptors[0]?.name || '';
		let titleChanged: boolean = false;
		if (this._title !== title) {
			this._title = title;
			titleChanged = true;
		}

		const icon = useDefaultContainerInfo ? this.container.icon : this.visibleViewDescriptors[0]?.containerIcon || 'codicon-window';
		let iconChanged: boolean = false;
		if (URI.isUri(icon) && URI.isUri(this._icon) ? isEqual(icon, this._icon) : this._icon !== icon) {
			this._icon = icon;
			iconChanged = true;
		}

		if (titleChanged || iconChanged) {
			this._onDidChangeContainerInfo.fire({ title: titleChanged, icon: iconChanged });
		}
	}

	isVisible(id: string): boolean {
		const viewDescriptorItem = this.viewDescriptorItems.filter(v => v.viewDescriptor.id === id)[0];
		if (!viewDescriptorItem) {
			throw new Error(`Unknown view ${id}`);
		}
		return this.isViewDescriptorVisible(viewDescriptorItem);
	}

	setVisible(id: string, visible: boolean, size?: number): void {
		this.updateVisibility([{ id, visible, size }]);
	}

	private updateVisibility(viewDescriptors: { id: string, visible: boolean, size?: number }[]): void {
		const added: IAddedViewDescriptorRef[] = [];
		const removed: IViewDescriptorRef[] = [];

		for (const { visibleIndex, viewDescriptorItem, visible, size } of viewDescriptors.map(({ id, visible, size }) => ({ ...this.find(id), visible, size }))) {
			const viewDescriptor = viewDescriptorItem.viewDescriptor;

			if (!viewDescriptor.canToggleVisibility) {
				throw new Error(`Can't toggle this view's visibility`);
			}

			if (this.isViewDescriptorVisible(viewDescriptorItem) === visible) {
				return;
			}

			if (viewDescriptor.workspace) {
				viewDescriptorItem.state.visibleWorkspace = visible;
			} else {
				viewDescriptorItem.state.visibleGlobal = visible;
			}

			if (typeof viewDescriptorItem.state.size === 'number') {
				viewDescriptorItem.state.size = size;
			}

			if (visible) {
				added.push({ index: visibleIndex, viewDescriptor, size: viewDescriptorItem.state.size, collapsed: !!viewDescriptorItem.state.collapsed });
			} else {
				removed.push({ index: visibleIndex, viewDescriptor });
			}
		}

		if (added.length) {
			this._onDidAddVisibleViewDescriptors.fire(added);
		}
		if (removed.length) {
			this._onDidRemoveVisibleViewDescriptors.fire(removed);
		}
	}

	isCollapsed(id: string): boolean {
		return !!this.find(id).viewDescriptorItem.state.collapsed;
	}

	setCollapsed(id: string, collapsed: boolean): void {
		const { viewDescriptorItem } = this.find(id);
		if (viewDescriptorItem.state.collapsed !== collapsed) {
			viewDescriptorItem.state.collapsed = collapsed;
		}
		this.viewDescriptorsState.updateState(this.allViewDescriptors);
	}

	getSize(id: string): number | undefined {
		return this.find(id).viewDescriptorItem.state.size;
	}

	setSize(id: string, size: number): void {
		const { viewDescriptorItem } = this.find(id);
		if (viewDescriptorItem.state.size !== size) {
			viewDescriptorItem.state.size = size;
		}
		this.viewDescriptorsState.updateState(this.allViewDescriptors);
	}

	move(from: string, to: string): void {
		const fromIndex = firstIndex(this.viewDescriptorItems, v => v.viewDescriptor.id === from);
		const toIndex = firstIndex(this.viewDescriptorItems, v => v.viewDescriptor.id === to);

		const fromViewDescriptor = this.viewDescriptorItems[fromIndex];
		const toViewDescriptor = this.viewDescriptorItems[toIndex];

		move(this.viewDescriptorItems, fromIndex, toIndex);

		for (let index = 0; index < this.viewDescriptorItems.length; index++) {
			this.viewDescriptorItems[index].state.order = index;
		}

		this._onDidMoveVisibleViewDescriptors.fire({
			from: { index: fromIndex, viewDescriptor: fromViewDescriptor.viewDescriptor },
			to: { index: toIndex, viewDescriptor: toViewDescriptor.viewDescriptor }
		});
	}

	add(viewDescriptors: IViewDescriptor[]): void {
		const addedItems: IViewDescriptorItem[] = [];
		const addedActiveDescriptors: IViewDescriptor[] = [];
		const addedVisibleItems: { index: number, viewDescriptor: IViewDescriptor, size?: number, collapsed: boolean; }[] = [];

		for (const viewDescriptor of viewDescriptors) {

			if (viewDescriptor.when) {
				for (const key of viewDescriptor.when.keys()) {
					this.contextKeys.add(key);
				}
			}

			let state = this.viewDescriptorsState.get(viewDescriptor.id);
			if (state) {
				// set defaults if not set
				if (viewDescriptor.workspace) {
					state.visibleWorkspace = isUndefinedOrNull(state.visibleWorkspace) ? !viewDescriptor.hideByDefault : state.visibleWorkspace;
				} else {
					state.visibleGlobal = isUndefinedOrNull(state.visibleGlobal) ? !viewDescriptor.hideByDefault : state.visibleGlobal;
				}
				state.collapsed = isUndefinedOrNull(state.collapsed) ? !!viewDescriptor.collapsed : state.collapsed;
			} else {
				state = {
					active: false,
					visibleGlobal: !viewDescriptor.hideByDefault,
					visibleWorkspace: !viewDescriptor.hideByDefault,
					collapsed: !!viewDescriptor.collapsed,
				};
			}
			this.viewDescriptorsState.set(viewDescriptor.id, state);
			state.active = this.contextKeyService.contextMatchesRules(viewDescriptor.when);
			addedItems.push({ viewDescriptor, state });

			if (state.active) {
				addedActiveDescriptors.push(viewDescriptor);
			}
		}

		this.viewDescriptorItems.push(...addedItems);
		this.viewDescriptorItems.sort(this.compareViewDescriptors.bind(this));

		for (const viewDescriptorItem of addedItems) {
			if (this.isViewDescriptorVisible(viewDescriptorItem)) {
				const { visibleIndex } = this.find(viewDescriptorItem.viewDescriptor.id);
				addedVisibleItems.push({ index: visibleIndex, viewDescriptor: viewDescriptorItem.viewDescriptor, size: viewDescriptorItem.state.size, collapsed: !!viewDescriptorItem.state.collapsed });
			}
		}

		this._onDidChangeAllViewDescriptors.fire({ added: addedItems.map(({ viewDescriptor }) => viewDescriptor), removed: [] });
		if (addedActiveDescriptors.length) {
			this._onDidChangeActiveViewDescriptors.fire(({ added: addedActiveDescriptors, removed: [] }));
		}
		if (addedVisibleItems.length) {
			this._onDidAddVisibleViewDescriptors.fire(addedVisibleItems);
		}
	}

	remove(viewDescriptors: IViewDescriptor[]): void {
		const removed: IViewDescriptor[] = [];
		const removedItems: IViewDescriptorItem[] = [];
		const removedActiveDescriptors: IViewDescriptor[] = [];
		const removedVisibleItems: { index: number, viewDescriptor: IViewDescriptor; }[] = [];

		for (const viewDescriptor of viewDescriptors) {
			if (viewDescriptor.when) {
				for (const key of viewDescriptor.when.keys()) {
					this.contextKeys.delete(key);
				}
			}
			const index = firstIndex(this.viewDescriptorItems, i => i.viewDescriptor.id === viewDescriptor.id);
			if (index !== -1) {
				removed.push(viewDescriptor);
				const viewDescriptorItem = this.viewDescriptorItems[index];
				if (viewDescriptorItem.state.active) {
					removedActiveDescriptors.push(viewDescriptorItem.viewDescriptor);
				}
				if (this.isViewDescriptorVisible(viewDescriptorItem)) {
					const { visibleIndex } = this.find(viewDescriptorItem.viewDescriptor.id);
					removedVisibleItems.push({ index: visibleIndex, viewDescriptor: viewDescriptorItem.viewDescriptor });
				}
				removedItems.push(viewDescriptorItem);
			}
		}

		removedItems.forEach(item => this.viewDescriptorItems.splice(this.viewDescriptorItems.indexOf(item), 1));

		this._onDidChangeAllViewDescriptors.fire({ added: [], removed });
		if (removedActiveDescriptors.length) {
			this._onDidChangeActiveViewDescriptors.fire(({ added: [], removed: removedActiveDescriptors }));
		}
		if (removedVisibleItems.length) {
			this._onDidRemoveVisibleViewDescriptors.fire(removedVisibleItems);
		}
	}

	private onDidChangeContext(): void {
		const addedActiveItems: { item: IViewDescriptorItem, wasVisible: boolean }[] = [];
		const removedActiveItems: { item: IViewDescriptorItem, wasVisible: boolean }[] = [];
		const removedVisibleItems: { index: number, viewDescriptor: IViewDescriptor; }[] = [];
		const addedVisibleItems: { index: number, viewDescriptor: IViewDescriptor, size?: number, collapsed: boolean; }[] = [];

		for (const item of this.viewDescriptorItems) {
			const wasActive = item.state.active;
			const wasVisible = this.isViewDescriptorVisible(item);
			const isActive = this.contextKeyService.contextMatchesRules(item.viewDescriptor.when);
			if (wasActive !== isActive) {
				if (isActive) {
					addedActiveItems.push({ item, wasVisible });
				} else {
					removedActiveItems.push({ item, wasVisible });
				}
			}
		}

		for (const { item, wasVisible } of removedActiveItems) {
			if (wasVisible) {
				const { visibleIndex } = this.find(item.viewDescriptor.id);
				removedVisibleItems.push({ index: visibleIndex, viewDescriptor: item.viewDescriptor });
			}
		}

		// Update the State
		removedActiveItems.forEach(({ item }) => item.state.active = false);
		addedActiveItems.forEach(({ item }) => item.state.active = true);

		for (const { item, wasVisible } of addedActiveItems) {
			if (wasVisible !== this.isViewDescriptorVisibleWhenActive(item)) {
				const { visibleIndex } = this.find(item.viewDescriptor.id);
				addedVisibleItems.push({ index: visibleIndex, viewDescriptor: item.viewDescriptor, size: item.state.size, collapsed: !!item.state.collapsed });
			}
		}

		if (addedActiveItems.length || removedActiveItems.length) {
			this._onDidChangeActiveViewDescriptors.fire(({ added: addedActiveItems.map(({ item }) => item.viewDescriptor), removed: removedActiveItems.map(({ item }) => item.viewDescriptor) }));
		}
		if (removedVisibleItems.length) {
			this._onDidRemoveVisibleViewDescriptors.fire(removedVisibleItems);
		}
		if (addedVisibleItems.length) {
			this._onDidAddVisibleViewDescriptors.fire(addedVisibleItems);
		}
	}

	private isViewDescriptorVisible(viewDescriptorItem: IViewDescriptorItem): boolean {
		if (!viewDescriptorItem.state.active) {
			return false;
		}
		return this.isViewDescriptorVisibleWhenActive(viewDescriptorItem);
	}

	private isViewDescriptorVisibleWhenActive(viewDescriptorItem: IViewDescriptorItem): boolean {
		if (viewDescriptorItem.viewDescriptor.workspace) {
			return !!viewDescriptorItem.state.visibleWorkspace;
		}
		return !!viewDescriptorItem.state.visibleGlobal;
	}

	private find(id: string): { index: number, visibleIndex: number, viewDescriptorItem: IViewDescriptorItem; } {
		for (let i = 0, visibleIndex = 0; i < this.viewDescriptorItems.length; i++) {
			const viewDescriptorItem = this.viewDescriptorItems[i];
			if (viewDescriptorItem.viewDescriptor.id === id) {
				return { index: i, visibleIndex, viewDescriptorItem: viewDescriptorItem };
			}
			if (this.isViewDescriptorVisible(viewDescriptorItem)) {
				visibleIndex++;
			}
		}
		throw new Error(`view descriptor ${id} not found`);
	}

	private compareViewDescriptors(a: IViewDescriptorItem, b: IViewDescriptorItem): number {
		if (a.viewDescriptor.id === b.viewDescriptor.id) {
			return 0;
		}

		return (this.getViewOrder(a) - this.getViewOrder(b)) || this.getGroupOrderResult(a.viewDescriptor, b.viewDescriptor);
	}

	private getViewOrder(viewDescriptorItem: IViewDescriptorItem): number {
		const viewOrder = typeof viewDescriptorItem.state.order === 'number' ? viewDescriptorItem.state.order : viewDescriptorItem.viewDescriptor.order;
		return typeof viewOrder === 'number' ? viewOrder : Number.MAX_VALUE;
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
}

interface ICachedViewContainerInfo {
	containerId: string;
	location?: ViewContainerLocation;
}

export class ViewDescriptorService extends Disposable implements IViewDescriptorService {

	_serviceBrand: undefined;

	private static readonly CACHED_VIEW_POSITIONS = 'views.cachedViewPositions';
	private static readonly COMMON_CONTAINER_ID_PREFIX = 'workbench.views.service';

	private readonly _onDidChangeContainer: Emitter<{ views: IViewDescriptor[], from: ViewContainer, to: ViewContainer }> = this._register(new Emitter<{ views: IViewDescriptor[], from: ViewContainer, to: ViewContainer }>());
	readonly onDidChangeContainer: Event<{ views: IViewDescriptor[], from: ViewContainer, to: ViewContainer }> = this._onDidChangeContainer.event;

	private readonly _onDidChangeLocation: Emitter<{ views: IViewDescriptor[], from: ViewContainerLocation, to: ViewContainerLocation }> = this._register(new Emitter<{ views: IViewDescriptor[], from: ViewContainerLocation, to: ViewContainerLocation }>());
	readonly onDidChangeLocation: Event<{ views: IViewDescriptor[], from: ViewContainerLocation, to: ViewContainerLocation }> = this._onDidChangeLocation.event;

	private readonly viewContainerModels: Map<ViewContainer, { viewContainerModel: ViewContainerModel, disposable: IDisposable; }>;
	private readonly activeViewContextKeys: Map<string, IContextKey<boolean>>;
	private readonly movableViewContextKeys: Map<string, IContextKey<boolean>>;
	private readonly defaultViewLocationContextKeys: Map<string, IContextKey<boolean>>;

	private readonly viewsRegistry: IViewsRegistry;
	private readonly viewContainersRegistry: IViewContainersRegistry;

	private cachedViewInfo: Map<string, ICachedViewContainerInfo>;

	private _cachedViewPositionsValue: string | undefined;
	private get cachedViewPositionsValue(): string {
		if (!this._cachedViewPositionsValue) {
			this._cachedViewPositionsValue = this.getStoredCachedViewPositionsValue();
		}

		return this._cachedViewPositionsValue;
	}

	private set cachedViewPositionsValue(value: string) {
		if (this.cachedViewPositionsValue !== value) {
			this._cachedViewPositionsValue = value;
			this.setStoredCachedViewPositionsValue(value);
		}
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageKeysSyncRegistryService storageKeysSyncRegistryService: IStorageKeysSyncRegistryService,
	) {
		super();

		storageKeysSyncRegistryService.registerStorageKey({ key: ViewDescriptorService.CACHED_VIEW_POSITIONS, version: 1 });
		this.viewContainerModels = new Map<ViewContainer, { viewContainerModel: ViewContainerModel, disposable: IDisposable; }>();
		this.activeViewContextKeys = new Map<string, IContextKey<boolean>>();
		this.movableViewContextKeys = new Map<string, IContextKey<boolean>>();
		this.defaultViewLocationContextKeys = new Map<string, IContextKey<boolean>>();

		this.viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		this.viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);

		this.cachedViewInfo = this.getCachedViewPositions();

		// Register all containers that were registered before this ctor
		this.viewContainersRegistry.all.forEach(viewContainer => this.onDidRegisterViewContainer(viewContainer));

		// Try generating all generated containers that don't need extensions
		this.tryGenerateContainers();

		this._register(this.viewsRegistry.onViewsRegistered(({ views, viewContainer }) => this.onDidRegisterViews(views, viewContainer)));
		this._register(this.viewsRegistry.onViewsDeregistered(({ views, viewContainer }) => this.onDidDeregisterViews(views, viewContainer)));

		this._register(this.viewsRegistry.onDidChangeContainer(({ views, from, to }) => this.moveViews(views, from, to)));

		this._register(this.viewContainersRegistry.onDidRegister(({ viewContainer }) => this.onDidRegisterViewContainer(viewContainer)));
		this._register(this.viewContainersRegistry.onDidDeregister(({ viewContainer }) => this.onDidDeregisterViewContainer(viewContainer)));
		this._register(toDisposable(() => {
			this.viewContainerModels.forEach(({ disposable }) => disposable.dispose());
			this.viewContainerModels.clear();
		}));

		this._register(this.storageService.onDidChangeStorage((e) => { this.onDidStorageChange(e); }));

		this._register(this.extensionService.onDidRegisterExtensions(() => this.onDidRegisterExtensions()));
	}

	private registerGroupedViews(groupedViews: Map<string, { cachedContainerInfo?: ICachedViewContainerInfo, views: IViewDescriptor[] }>): void {
		// Register views that have already been registered to their correct view containers
		for (const containerId of groupedViews.keys()) {
			const viewContainer = this.viewContainersRegistry.get(containerId);
			const containerData = groupedViews.get(containerId)!;

			// The container has not been registered yet
			if (!viewContainer || !this.viewContainerModels.has(viewContainer)) {
				if (containerData.cachedContainerInfo && this.shouldGenerateContainer(containerData.cachedContainerInfo)) {
					const containerInfo = containerData.cachedContainerInfo;

					if (!this.viewContainersRegistry.get(containerId)) {
						this.registerGeneratedViewContainer(containerInfo.location!, containerId);
					}
				}

				continue;
			}

			this.addViews(viewContainer, containerData.views);
		}
	}

	private deregisterGroupedViews(groupedViews: Map<string, { cachedContainerInfo?: ICachedViewContainerInfo, views: IViewDescriptor[] }>): void {
		// Register views that have already been registered to their correct view containers
		for (const viewContainerId of groupedViews.keys()) {
			const viewContainer = this.viewContainersRegistry.get(viewContainerId);

			// The container has not been registered yet
			if (!viewContainer || !this.viewContainerModels.has(viewContainer)) {
				continue;
			}

			this.removeViews(viewContainer, groupedViews.get(viewContainerId)!.views);
		}
	}

	private tryGenerateContainers(fallbackToDefault?: boolean): void {
		for (const [viewId, containerInfo] of this.cachedViewInfo.entries()) {
			const containerId = containerInfo.containerId;

			// check if cached view container is registered
			if (this.viewContainersRegistry.get(containerId)) {
				continue;
			}

			// check if we should generate this container
			if (this.shouldGenerateContainer(containerInfo)) {
				this.registerGeneratedViewContainer(containerInfo.location!, containerId);
				continue;
			}

			if (fallbackToDefault) {
				// check if view has been registered to default location
				const viewContainer = this.viewsRegistry.getViewContainer(viewId);
				const viewDescriptor = this.getViewDescriptor(viewId);
				if (viewContainer && viewDescriptor) {
					this.addViews(viewContainer, [viewDescriptor]);

					const newLocation = this.getViewContainerLocation(viewContainer);
					if (containerInfo.location && containerInfo.location !== newLocation) {
						this._onDidChangeLocation.fire({ views: [viewDescriptor], from: containerInfo.location, to: newLocation });
					}
				}
			}
		}

		if (fallbackToDefault) {
			this.saveViewPositionsToCache();
		}
	}

	private onDidRegisterExtensions(): void {
		this.tryGenerateContainers(true);
	}

	private onDidRegisterViews(views: IViewDescriptor[], viewContainer: ViewContainer): void {
		// When views are registered, we need to regroup them based on the cache
		const regroupedViews = this.regroupViews(viewContainer.id, views);

		// Once they are grouped, try registering them which occurs
		// if the container has already been registered within this service
		// or we can generate the container from the source view id
		this.registerGroupedViews(regroupedViews);

		views.forEach(viewDescriptor => this.getOrCreateMovableViewContextKey(viewDescriptor).set(!!viewDescriptor.canMoveView));
	}

	private shouldGenerateContainer(containerInfo: ICachedViewContainerInfo): boolean {
		return containerInfo.containerId.startsWith(ViewDescriptorService.COMMON_CONTAINER_ID_PREFIX) && containerInfo.location !== undefined;
	}

	private onDidDeregisterViews(views: IViewDescriptor[], viewContainer: ViewContainer): void {
		// When views are registered, we need to regroup them based on the cache
		const regroupedViews = this.regroupViews(viewContainer.id, views);
		this.deregisterGroupedViews(regroupedViews);
		views.forEach(viewDescriptor => this.getOrCreateMovableViewContextKey(viewDescriptor).set(false));
	}

	private regroupViews(containerId: string, views: IViewDescriptor[]): Map<string, { cachedContainerInfo?: ICachedViewContainerInfo, views: IViewDescriptor[] }> {
		const ret = new Map<string, { cachedContainerInfo?: ICachedViewContainerInfo, views: IViewDescriptor[] }>();

		views.forEach(viewDescriptor => {
			const containerInfo = this.cachedViewInfo.get(viewDescriptor.id);
			const correctContainerId = containerInfo?.containerId || containerId;

			const containerData = ret.get(correctContainerId) || { cachedContainerInfo: containerInfo, views: [] };
			containerData.views.push(viewDescriptor);
			ret.set(correctContainerId, containerData);
		});

		return ret;
	}

	getViewDescriptor(viewId: string): IViewDescriptor | null {
		return this.viewsRegistry.getView(viewId);
	}

	getViewLocation(viewId: string): ViewContainerLocation | null {
		const cachedInfo = this.cachedViewInfo.get(viewId);

		if (cachedInfo && cachedInfo.location) {
			return cachedInfo.location;
		}

		const container = cachedInfo?.containerId ?
			this.viewContainersRegistry.get(cachedInfo.containerId) ?? null :
			this.viewsRegistry.getViewContainer(viewId);

		if (!container) {
			return null;
		}

		return this.getViewContainerLocation(container);
	}

	getViewContainer(viewId: string): ViewContainer | null {
		const containerId = this.cachedViewInfo.get(viewId)?.containerId;

		return containerId ?
			this.viewContainersRegistry.get(containerId) ?? null :
			this.viewsRegistry.getViewContainer(viewId);
	}

	getViewContainerLocation(viewContainer: ViewContainer): ViewContainerLocation {
		return this.viewContainersRegistry.getViewContainerLocation(viewContainer);
	}

	getDefaultContainer(viewId: string): ViewContainer | null {
		return this.viewsRegistry.getViewContainer(viewId) ?? null;
	}

	getViewContainerModel(container: ViewContainer): ViewContainerModel {
		return this.getOrRegisterViewContainerModel(container);
	}

	moveViewToLocation(view: IViewDescriptor, location: ViewContainerLocation): void {
		let container = this.registerGeneratedViewContainer(location);
		this.moveViewsToContainer([view], container);
	}

	moveViewsToContainer(views: IViewDescriptor[], viewContainer: ViewContainer): void {
		if (!views.length) {
			return;
		}

		const from = this.getViewContainer(views[0].id);
		const to = viewContainer;

		if (from && to && from !== to) {
			this.moveViews(views, from, to);
		}
	}

	private moveViews(views: IViewDescriptor[], from: ViewContainer, to: ViewContainer, skipCacheUpdate?: boolean): void {
		this.removeViews(from, views);
		this.addViews(to, views);

		const oldLocation = this.getViewContainerLocation(from);
		const newLocation = this.getViewContainerLocation(to);

		if (oldLocation !== newLocation) {
			this._onDidChangeLocation.fire({ views, from: oldLocation, to: newLocation });
		}

		this._onDidChangeContainer.fire({ views, from, to });

		if (!skipCacheUpdate) {
			this.saveViewPositionsToCache();

			const containerToString = (container: ViewContainer): string => {
				if (container.id.startsWith(ViewDescriptorService.COMMON_CONTAINER_ID_PREFIX)) {
					return 'custom';
				}

				if (!container.extensionId) {
					return container.id;
				}

				return 'extension';
			};

			// Log on cache update to avoid duplicate events in other windows
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
				viewCount: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
				fromContainer: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
				toContainer: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
				fromLocation: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
				toLocation: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			};

			this.telemetryService.publicLog2<ViewDescriptorServiceMoveViewsEvent, ViewDescriptorServiceMoveViewsClassification>('viewDescriptorService.moveViews', { viewCount, fromContainer, toContainer, fromLocation, toLocation });
		}
	}

	private registerGeneratedViewContainer(location: ViewContainerLocation, existingId?: string): ViewContainer {
		const id = existingId || this.generateContainerId(location);

		return this.viewContainersRegistry.registerViewContainer({
			id,
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [id, { mergeViewWithContainerWhenSingleView: true, donotShowContainerTitleWhenMergedWithContainer: true }]),
			name: 'Custom Views', // we don't want to see this, so no need to localize
			icon: location === ViewContainerLocation.Sidebar ? 'codicon-window' : undefined,
			storageId: `${id}.state`,
			hideIfEmpty: true
		}, location);
	}

	private getCachedViewPositions(): Map<string, ICachedViewContainerInfo> {
		const result = new Map<string, ICachedViewContainerInfo>(JSON.parse(this.cachedViewPositionsValue));

		// Sanitize cache
		for (const [viewId, containerInfo] of result.entries()) {
			if (!containerInfo) {
				result.delete(viewId);
			}
		}

		return result;
	}

	private onDidStorageChange(e: IWorkspaceStorageChangeEvent): void {
		if (e.key === ViewDescriptorService.CACHED_VIEW_POSITIONS && e.scope === StorageScope.GLOBAL
			&& this.cachedViewPositionsValue !== this.getStoredCachedViewPositionsValue() /* This checks if current window changed the value or not */) {
			this._cachedViewPositionsValue = this.getStoredCachedViewPositionsValue();

			const newCachedPositions = this.getCachedViewPositions();

			for (let viewId of newCachedPositions.keys()) {
				const viewDescriptor = this.getViewDescriptor(viewId);
				if (!viewDescriptor) {
					continue;
				}

				const prevViewContainer = this.getViewContainer(viewId);
				const newViewContainerInfo = newCachedPositions.get(viewId)!;
				// Verify if we need to create the destination container
				if (!this.viewContainersRegistry.get(newViewContainerInfo.containerId)) {
					this.registerGeneratedViewContainer(newViewContainerInfo.location!, newViewContainerInfo.containerId);
				}

				// Try moving to the new container
				const newViewContainer = this.viewContainersRegistry.get(newViewContainerInfo.containerId);
				if (prevViewContainer && newViewContainer && newViewContainer !== prevViewContainer) {
					const viewDescriptor = this.getViewDescriptor(viewId);
					if (viewDescriptor) {
						this.moveViews([viewDescriptor], prevViewContainer, newViewContainer);
					}
				}
			}

			// If a value is not present in the cache, it must be reset to default
			this.viewContainersRegistry.all.forEach(viewContainer => {
				const viewContainerModel = this.getViewContainerModel(viewContainer);
				viewContainerModel.allViewDescriptors.forEach(viewDescriptor => {
					if (!newCachedPositions.has(viewDescriptor.id)) {
						const currentContainer = this.getViewContainer(viewDescriptor.id);
						const defaultContainer = this.getDefaultContainer(viewDescriptor.id);
						if (currentContainer && defaultContainer && currentContainer !== defaultContainer) {
							this.moveViews([viewDescriptor], currentContainer, defaultContainer);
						}

						this.cachedViewInfo.delete(viewDescriptor.id);
					}
				});
			});

			this.cachedViewInfo = this.getCachedViewPositions();
		}
	}

	// Generated Container Id Format
	// {Common Prefix}.{Location}.{Uniqueness Id}
	// Old Format (deprecated)
	// {Common Prefix}.{Uniqueness Id}.{Source View Id}
	private generateContainerId(location: ViewContainerLocation): string {
		return `${ViewDescriptorService.COMMON_CONTAINER_ID_PREFIX}.${location === ViewContainerLocation.Panel ? 'panel' : 'sidebar'}.${generateUuid()}`;
	}

	private getStoredCachedViewPositionsValue(): string {
		return this.storageService.get(ViewDescriptorService.CACHED_VIEW_POSITIONS, StorageScope.GLOBAL, '[]');
	}

	private setStoredCachedViewPositionsValue(value: string): void {
		this.storageService.store(ViewDescriptorService.CACHED_VIEW_POSITIONS, value, StorageScope.GLOBAL);
	}

	private saveViewPositionsToCache(): void {
		this.viewContainersRegistry.all.forEach(viewContainer => {
			const viewContainerModel = this.getViewContainerModel(viewContainer);
			viewContainerModel.allViewDescriptors.forEach(viewDescriptor => {
				const containerLocation = this.getViewContainerLocation(viewContainer);
				this.cachedViewInfo.set(viewDescriptor.id, {
					containerId: viewContainer.id,
					location: containerLocation
				});
			});
		});

		// Do no save default positions to the cache
		// so that default changes can be recognized
		// https://github.com/microsoft/vscode/issues/90414
		for (const [viewId, containerInfo] of this.cachedViewInfo) {
			const defaultContainer = this.getDefaultContainer(viewId);
			if (defaultContainer?.id === containerInfo.containerId) {
				this.cachedViewInfo.delete(viewId);
			}
		}

		this.cachedViewPositionsValue = JSON.stringify([...this.cachedViewInfo]);
	}

	private getViewsByContainer(viewContainer: ViewContainer): IViewDescriptor[] {
		const result = this.viewsRegistry.getViews(viewContainer).filter(viewDescriptor => {
			const cachedContainer = this.cachedViewInfo.get(viewDescriptor.id)?.containerId || viewContainer.id;
			return cachedContainer === viewContainer.id;
		});

		for (const [viewId, containerInfo] of this.cachedViewInfo.entries()) {
			if (!containerInfo || containerInfo.containerId !== viewContainer.id) {
				continue;
			}

			if (this.viewsRegistry.getViewContainer(viewId) === viewContainer) {
				continue;
			}

			const viewDescriptor = this.getViewDescriptor(viewId);
			if (viewDescriptor) {
				result.push(viewDescriptor);
			}
		}

		return result;
	}

	private onDidRegisterViewContainer(viewContainer: ViewContainer): void {
		this.getOrRegisterViewContainerModel(viewContainer);
	}

	private getOrRegisterViewContainerModel(viewContainer: ViewContainer): ViewContainerModel {
		let viewContainerModel = this.viewContainerModels.get(viewContainer)?.viewContainerModel;

		if (!viewContainerModel) {
			const disposables = new DisposableStore();
			viewContainerModel = disposables.add(this.instantiationService.createInstance(ViewContainerModel, viewContainer));

			this.onDidChangeActiveViews({ added: viewContainerModel.activeViewDescriptors, removed: [] });
			viewContainerModel.onDidChangeActiveViewDescriptors(changed => this.onDidChangeActiveViews(changed), this, disposables);

			this.viewContainerModels.set(viewContainer, { viewContainerModel: viewContainerModel, disposable: disposables });

			const viewsToRegister = this.getViewsByContainer(viewContainer);
			if (viewsToRegister.length) {
				this.addViews(viewContainer, viewsToRegister);
				viewsToRegister.forEach(viewDescriptor => this.getOrCreateMovableViewContextKey(viewDescriptor).set(!!viewDescriptor.canMoveView));
			}
		}

		return viewContainerModel;
	}

	private onDidDeregisterViewContainer(viewContainer: ViewContainer): void {
		const viewContainerModelItem = this.viewContainerModels.get(viewContainer);
		if (viewContainerModelItem) {
			viewContainerModelItem.disposable.dispose();
			this.viewContainerModels.delete(viewContainer);
		}
	}

	private onDidChangeActiveViews({ added, removed }: { added: ReadonlyArray<IViewDescriptor>, removed: ReadonlyArray<IViewDescriptor>; }): void {
		added.forEach(viewDescriptor => this.getOrCreateActiveViewContextKey(viewDescriptor).set(true));
		removed.forEach(viewDescriptor => this.getOrCreateActiveViewContextKey(viewDescriptor).set(false));
	}

	private addViews(container: ViewContainer, views: IViewDescriptor[]): void {
		// Update in memory cache
		const location = this.getViewContainerLocation(container);
		views.forEach(view => {
			this.cachedViewInfo.set(view.id, { containerId: container.id, location });
			this.getOrCreateDefaultViewLocationContextKey(view).set(this.getDefaultContainer(view.id) === container);
		});

		this.getViewContainerModel(container).add(views);
	}

	private removeViews(container: ViewContainer, views: IViewDescriptor[]): void {
		// Set view default location keys to false
		views.forEach(view => this.getOrCreateDefaultViewLocationContextKey(view).set(false));

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
}

registerSingleton(IViewDescriptorService, ViewDescriptorService);
