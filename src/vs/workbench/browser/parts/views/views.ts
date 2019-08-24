/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/views';
import { Disposable, IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { IViewsService, IViewsViewlet, ViewContainer, IViewDescriptor, IViewContainersRegistry, Extensions as ViewExtensions, IView, IViewDescriptorCollection, IViewsRegistry } from 'vs/workbench/common/views';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IContextKeyService, IContextKeyChangeEvent, IReadableSet, IContextKey, RawContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Event, Emitter } from 'vs/base/common/event';
import { sortedDiff, firstIndex, move, isNonEmptyArray } from 'vs/base/common/arrays';
import { isUndefinedOrNull, isUndefined } from 'vs/base/common/types';
import { MenuId, MenuRegistry, ICommandAction } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { localize } from 'vs/nls';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { values } from 'vs/base/common/map';
import { IFileIconTheme, IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { toggleClass, addClass } from 'vs/base/browser/dom';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

function filterViewRegisterEvent(container: ViewContainer, event: Event<{ viewContainer: ViewContainer, views: IViewDescriptor[] }>): Event<IViewDescriptor[]> {
	return Event.chain(event)
		.map(({ views, viewContainer }) => viewContainer === container ? views : [])
		.filter(views => views.length > 0)
		.event;
}

function filterViewMoveEvent(container: ViewContainer, event: Event<{ from: ViewContainer, to: ViewContainer, views: IViewDescriptor[] }>): Event<{ added?: IViewDescriptor[], removed?: IViewDescriptor[] }> {
	return Event.chain(event)
		.map(({ views, from, to }) => from === container ? { removed: views } : to === container ? { added: views } : {})
		.filter(({ added, removed }) => isNonEmptyArray(added) || isNonEmptyArray(removed))
		.event;
}

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

interface IViewItem {
	viewDescriptor: IViewDescriptor;
	active: boolean;
}

class ViewDescriptorCollection extends Disposable implements IViewDescriptorCollection {

	private contextKeys = new CounterSet<string>();
	private items: IViewItem[] = [];

	private _onDidChange: Emitter<{ added: IViewDescriptor[], removed: IViewDescriptor[] }> = this._register(new Emitter<{ added: IViewDescriptor[], removed: IViewDescriptor[] }>());
	readonly onDidChangeActiveViews: Event<{ added: IViewDescriptor[], removed: IViewDescriptor[] }> = this._onDidChange.event;

	get activeViewDescriptors(): IViewDescriptor[] {
		return this.items
			.filter(i => i.active)
			.map(i => i.viewDescriptor);
	}

	get allViewDescriptors(): IViewDescriptor[] {
		return this.items.map(i => i.viewDescriptor);
	}

	constructor(
		container: ViewContainer,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		const onRelevantViewsRegistered = filterViewRegisterEvent(container, viewsRegistry.onViewsRegistered);
		this._register(onRelevantViewsRegistered(this.onViewsRegistered, this));

		const onRelevantViewsMoved = filterViewMoveEvent(container, viewsRegistry.onDidChangeContainer);
		this._register(onRelevantViewsMoved(({ added, removed }) => {
			if (isNonEmptyArray(added)) {
				this.onViewsRegistered(added);
			}
			if (isNonEmptyArray(removed)) {
				this.onViewsDeregistered(removed);
			}
		}));

		const onRelevantViewsDeregistered = filterViewRegisterEvent(container, viewsRegistry.onViewsDeregistered);
		this._register(onRelevantViewsDeregistered(this.onViewsDeregistered, this));

		const onRelevantContextChange = Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(this.contextKeys));
		this._register(onRelevantContextChange(this.onContextChanged, this));

		this.onViewsRegistered(viewsRegistry.getViews(container));
	}

	private onViewsRegistered(viewDescriptors: IViewDescriptor[]): void {
		const added: IViewDescriptor[] = [];

		for (const viewDescriptor of viewDescriptors) {
			const item = {
				viewDescriptor,
				active: this.isViewDescriptorActive(viewDescriptor) // TODO: should read from some state?
			};

			this.items.push(item);

			if (viewDescriptor.when) {
				for (const key of viewDescriptor.when.keys()) {
					this.contextKeys.add(key);
				}
			}

			if (item.active) {
				added.push(viewDescriptor);
			}
		}

		if (added.length) {
			this._onDidChange.fire({ added, removed: [] });
		}
	}

	private onViewsDeregistered(viewDescriptors: IViewDescriptor[]): void {
		const removed: IViewDescriptor[] = [];

		for (const viewDescriptor of viewDescriptors) {
			const index = firstIndex(this.items, i => i.viewDescriptor.id === viewDescriptor.id);

			if (index === -1) {
				continue;
			}

			const item = this.items[index];
			this.items.splice(index, 1);

			if (viewDescriptor.when) {
				for (const key of viewDescriptor.when.keys()) {
					this.contextKeys.delete(key);
				}
			}

			if (item.active) {
				removed.push(viewDescriptor);
			}
		}

		if (removed.length) {
			this._onDidChange.fire({ added: [], removed });
		}
	}

	private onContextChanged(event: IContextKeyChangeEvent): void {
		const removed: IViewDescriptor[] = [];
		const added: IViewDescriptor[] = [];

		for (const item of this.items) {
			const active = this.isViewDescriptorActive(item.viewDescriptor);

			if (item.active !== active) {
				if (active) {
					added.push(item.viewDescriptor);
				} else {
					removed.push(item.viewDescriptor);
				}
			}

			item.active = active;
		}

		if (added.length || removed.length) {
			this._onDidChange.fire({ added, removed });
		}
	}

	private isViewDescriptorActive(viewDescriptor: IViewDescriptor): boolean {
		return !viewDescriptor.when || this.contextKeyService.contextMatchesRules(viewDescriptor.when);
	}
}

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

	readonly viewDescriptors: IViewDescriptor[] = [];
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

	constructor(
		container: ViewContainer,
		viewsService: IViewsService,
		protected viewStates = new Map<string, IViewState>(),
	) {
		super();
		const viewDescriptorCollection = viewsService.getViewDescriptors(container);

		if (viewDescriptorCollection) {
			this._register(viewDescriptorCollection.onDidChangeActiveViews(() => this.onDidChangeViewDescriptors(viewDescriptorCollection.activeViewDescriptors)));
			this.onDidChangeViewDescriptors(viewDescriptorCollection.activeViewDescriptors);
		}
	}

	isVisible(id: string): boolean {
		const viewDescriptor = this.viewDescriptors.filter(v => v.id === id)[0];

		if (!viewDescriptor) {
			throw new Error(`Unknown view ${id}`);
		}

		return this.isViewDescriptorVisible(viewDescriptor);
	}

	setVisible(id: string, visible: boolean, size?: number): void {
		const { visibleIndex, viewDescriptor, state } = this.find(id);

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
			this._onDidAdd.fire([{ index: visibleIndex, viewDescriptor, size: state.size, collapsed: !!state.collapsed }]);
		} else {
			this._onDidRemove.fire([{ index: visibleIndex, viewDescriptor }]);
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

		move(this.viewDescriptors, fromIndex, toIndex);

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

	private find(id: string): { index: number, visibleIndex: number, viewDescriptor: IViewDescriptor, state: IViewState } {
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

		return (this.getViewOrder(a) - this.getViewOrder(b)) || this.getGroupOrderResult(a, b) || (a.id < b.id ? -1 : 1);
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
		const ids = new Set<string>();

		for (const viewDescriptor of this.viewDescriptors) {
			ids.add(viewDescriptor.id);
		}

		viewDescriptors = viewDescriptors.sort(this.compareViewDescriptors.bind(this));

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

		const splices = sortedDiff<IViewDescriptor>(
			this.viewDescriptors,
			viewDescriptors,
			this.compareViewDescriptors.bind(this)
		).reverse();

		const toRemove: { index: number, viewDescriptor: IViewDescriptor }[] = [];
		const toAdd: { index: number, viewDescriptor: IViewDescriptor, size?: number, collapsed: boolean }[] = [];

		for (const splice of splices) {
			const startViewDescriptor = this.viewDescriptors[splice.start];
			let startIndex = startViewDescriptor ? this.find(startViewDescriptor.id).visibleIndex : this.viewDescriptors.length;

			for (let i = 0; i < splice.deleteCount; i++) {
				const viewDescriptor = this.viewDescriptors[splice.start + i];

				if (this.isViewDescriptorVisible(viewDescriptor)) {
					toRemove.push({ index: startIndex++, viewDescriptor });
				}
			}

			for (const viewDescriptor of splice.toInsert) {
				const state = this.viewStates.get(viewDescriptor.id)!;

				if (this.isViewDescriptorVisible(viewDescriptor)) {
					toAdd.push({ index: startIndex++, viewDescriptor, size: state.size, collapsed: !!state.collapsed });
				}
			}
		}

		this.viewDescriptors.splice(0, this.viewDescriptors.length, ...viewDescriptors);

		if (toRemove.length) {
			this._onDidRemove.fire(toRemove);
		}

		if (toAdd.length) {
			this._onDidAdd.fire(toAdd);
		}
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
		@IViewsService viewsService: IViewsService,
		@IStorageService storageService: IStorageService,
	) {
		const globalViewsStateStorageId = `${viewletStateStorageId}.hidden`;
		const viewStates = PersistentContributableViewsModel.loadViewsStates(viewletStateStorageId, globalViewsStateStorageId, storageService);

		super(container, viewsService, viewStates);

		this.workspaceViewsStateStorageId = viewletStateStorageId;
		this.globalViewsStateStorageId = globalViewsStateStorageId;
		this.storageService = storageService;

		this._register(Event.any(
			this.onDidAdd,
			this.onDidRemove,
			Event.map(this.onDidMove, ({ from, to }) => [from, to]),
			Event.map(this.onDidChangeViewState, viewDescriptorRef => [viewDescriptorRef]))
			(viewDescriptorRefs => this.saveViewsStates(viewDescriptorRefs.map(r => r.viewDescriptor))));
	}

	private saveViewsStates(viewDescriptors: IViewDescriptor[]): void {
		this.saveWorkspaceViewsStates();
		this.saveGlobalViewsStates();
	}

	private saveWorkspaceViewsStates(): void {
		const storedViewsStates: { [id: string]: IStoredWorkspaceViewState } = {};

		let hasState = false;
		for (const viewDescriptor of this.viewDescriptors) {
			const viewState = this.viewStates.get(viewDescriptor.id);
			if (viewState) {
				storedViewsStates[viewDescriptor.id] = {
					collapsed: !!viewState.collapsed,
					isHidden: !viewState.visibleWorkspace,
					size: viewState.size,
					order: viewDescriptor.workspace && viewState ? viewState.order : undefined
				};
				hasState = true;
			}
		}

		if (hasState) {
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
		this.storageService.store(this.globalViewsStateStorageId, JSON.stringify(values(storedViewsVisibilityStates)), StorageScope.GLOBAL);
	}


	private static loadViewsStates(workspaceViewsStateStorageId: string, globalViewsStateStorageId: string, storageService: IStorageService): Map<string, IViewState> {
		const viewStates = new Map<string, IViewState>();
		const workspaceViewsStates = <{ [id: string]: IStoredWorkspaceViewState }>JSON.parse(storageService.get(workspaceViewsStateStorageId, StorageScope.WORKSPACE, '{}'));
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

	_serviceBrand!: ServiceIdentifier<any>;

	private readonly viewDescriptorCollections: Map<ViewContainer, { viewDescriptorCollection: IViewDescriptorCollection, disposable: IDisposable }>;
	private readonly viewDisposable: Map<IViewDescriptor, IDisposable>;
	private readonly activeViewContextKeys: Map<string, IContextKey<boolean>>;

	constructor(
		@IViewletService private readonly viewletService: IViewletService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();

		this.viewDescriptorCollections = new Map<ViewContainer, { viewDescriptorCollection: IViewDescriptorCollection, disposable: IDisposable }>();
		this.viewDisposable = new Map<IViewDescriptor, IDisposable>();
		this.activeViewContextKeys = new Map<string, IContextKey<boolean>>();

		const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		viewContainersRegistry.all.forEach(viewContainer => {
			this.onDidRegisterViews(viewContainer, viewsRegistry.getViews(viewContainer));
			this.onDidRegisterViewContainer(viewContainer);
		});
		this._register(viewsRegistry.onViewsRegistered(({ views, viewContainer }) => this.onDidRegisterViews(viewContainer, views)));
		this._register(viewsRegistry.onViewsDeregistered(({ views }) => this.onDidDeregisterViews(views)));
		this._register(viewsRegistry.onDidChangeContainer(({ views, to }) => { this.onDidDeregisterViews(views); this.onDidRegisterViews(to, views); }));
		this._register(toDisposable(() => {
			this.viewDisposable.forEach(disposable => disposable.dispose());
			this.viewDisposable.clear();
		}));
		this._register(viewContainersRegistry.onDidRegister(viewContainer => this.onDidRegisterViewContainer(viewContainer)));
		this._register(viewContainersRegistry.onDidDeregister(viewContainer => this.onDidDeregisterViewContainer(viewContainer)));
		this._register(toDisposable(() => {
			this.viewDescriptorCollections.forEach(({ disposable }) => disposable.dispose());
			this.viewDescriptorCollections.clear();
		}));
	}

	getViewDescriptors(container: ViewContainer): IViewDescriptorCollection | null {
		const viewDescriptorCollectionItem = this.viewDescriptorCollections.get(container);
		return viewDescriptorCollectionItem ? viewDescriptorCollectionItem.viewDescriptorCollection : null;
	}

	async openView(id: string, focus: boolean): Promise<IView | null> {
		const viewContainer = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).getViewContainer(id);
		if (viewContainer) {
			const viewletDescriptor = this.viewletService.getViewlet(viewContainer.id);
			if (viewletDescriptor) {
				const viewlet = await this.viewletService.openViewlet(viewletDescriptor.id, focus) as IViewsViewlet | null;
				if (viewlet && viewlet.openView) {
					return viewlet.openView(id, focus);
				}
			}
		}

		return null;
	}

	private onDidRegisterViewContainer(viewContainer: ViewContainer): void {
		const viewDescriptorCollection = new ViewDescriptorCollection(viewContainer, this.contextKeyService);
		const disposables: IDisposable[] = [viewDescriptorCollection];

		this.onDidChangeActiveViews({ added: viewDescriptorCollection.activeViewDescriptors, removed: [] });
		viewDescriptorCollection.onDidChangeActiveViews(changed => this.onDidChangeActiveViews(changed), this, disposables);

		this.viewDescriptorCollections.set(viewContainer, { viewDescriptorCollection, disposable: toDisposable(() => dispose(disposables)) });
	}

	private onDidDeregisterViewContainer(viewContainer: ViewContainer): void {
		const viewDescriptorCollectionItem = this.viewDescriptorCollections.get(viewContainer);
		if (viewDescriptorCollectionItem) {
			viewDescriptorCollectionItem.disposable.dispose();
			this.viewDescriptorCollections.delete(viewContainer);
		}
	}

	private onDidChangeActiveViews({ added, removed }: { added: IViewDescriptor[], removed: IViewDescriptor[] }): void {
		added.forEach(viewDescriptor => this.getOrCreateActiveViewContextKey(viewDescriptor).set(true));
		removed.forEach(viewDescriptor => this.getOrCreateActiveViewContextKey(viewDescriptor).set(false));
	}

	private onDidRegisterViews(container: ViewContainer, views: IViewDescriptor[]): void {
		const viewlet = this.viewletService.getViewlet(container.id);
		for (const viewDescriptor of views) {
			const disposables: IDisposable[] = [];
			const command: ICommandAction = {
				id: viewDescriptor.focusCommand ? viewDescriptor.focusCommand.id : `${viewDescriptor.id}.focus`,
				title: { original: `Focus on ${viewDescriptor.name} View`, value: localize('focus view', "Focus on {0} View", viewDescriptor.name) },
				category: viewlet ? viewlet.name : localize('view category', "View"),
			};
			const when = ContextKeyExpr.has(`${viewDescriptor.id}.active`);

			disposables.push(CommandsRegistry.registerCommand(command.id, () => this.openView(viewDescriptor.id, true)));

			disposables.push(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
				command,
				when
			}));

			if (viewDescriptor.focusCommand && viewDescriptor.focusCommand.keybindings) {
				KeybindingsRegistry.registerKeybindingRule({
					id: command.id,
					when,
					weight: KeybindingWeight.WorkbenchContrib,
					primary: viewDescriptor.focusCommand.keybindings.primary,
					secondary: viewDescriptor.focusCommand.keybindings.secondary,
					linux: viewDescriptor.focusCommand.keybindings.linux,
					mac: viewDescriptor.focusCommand.keybindings.mac,
					win: viewDescriptor.focusCommand.keybindings.win
				});
			}

			this.viewDisposable.set(viewDescriptor, toDisposable(() => dispose(disposables)));
		}
	}

	private onDidDeregisterViews(views: IViewDescriptor[]): void {
		for (const view of views) {
			const disposable = this.viewDisposable.get(view);
			if (disposable) {
				disposable.dispose();
				this.viewDisposable.delete(view);
			}
		}
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
}

export function createFileIconThemableTreeContainerScope(container: HTMLElement, themeService: IWorkbenchThemeService): IDisposable {
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
