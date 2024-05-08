/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ViewContainer, IViewsRegistry, IViewDescriptor, Extensions as ViewExtensions, IViewContainerModel, IAddedViewDescriptorRef, IViewDescriptorRef, IAddedViewDescriptorState, defaultViewIcon, VIEWS_LOG_ID, VIEWS_LOG_NAME } from 'vs/workbench/common/views';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Registry } from 'vs/platform/registry/common/platform';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { coalesce, move } from 'vs/base/common/arrays';
import { isUndefined, isUndefinedOrNull } from 'vs/base/common/types';
import { isEqual } from 'vs/base/common/resources';
import { ThemeIcon } from 'vs/base/common/themables';
import { IStringDictionary } from 'vs/base/common/collections';
import { ILogger, ILoggerService } from 'vs/platform/log/common/log';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { IOutputService } from 'vs/workbench/services/output/common/output';
import { CounterSet } from 'vs/base/common/map';
import { localize2 } from 'vs/nls';
import { Lazy } from 'vs/base/common/lazy';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: '_workbench.output.showViewsLog',
			title: localize2('showViewsLog', "Show Views Log"),
			category: Categories.Developer,
			f1: true
		});
	}
	async run(servicesAccessor: ServicesAccessor): Promise<void> {
		const loggerService = servicesAccessor.get(ILoggerService);
		const outputService = servicesAccessor.get(IOutputService);
		loggerService.setVisibility(VIEWS_LOG_ID, true);
		outputService.showChannel(VIEWS_LOG_ID);
	}
});

export function getViewsStateStorageId(viewContainerStorageId: string): string { return `${viewContainerStorageId}.hidden`; }

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
	active: boolean;
	order?: number;
	size?: number;
}

class ViewDescriptorsState extends Disposable {

	private readonly workspaceViewsStateStorageId: string;
	private readonly globalViewsStateStorageId: string;
	private readonly state: Map<string, IViewDescriptorState>;

	private _onDidChangeStoredState = this._register(new Emitter<{ id: string; visible: boolean }[]>());
	readonly onDidChangeStoredState = this._onDidChangeStoredState.event;

	private readonly logger: Lazy<ILogger>;

	constructor(
		viewContainerStorageId: string,
		private readonly viewContainerName: string,
		@IStorageService private readonly storageService: IStorageService,
		@ILoggerService loggerService: ILoggerService,
	) {
		super();

		this.logger = new Lazy(() => loggerService.createLogger(VIEWS_LOG_ID, { name: VIEWS_LOG_NAME, hidden: true }));

		this.globalViewsStateStorageId = getViewsStateStorageId(viewContainerStorageId);
		this.workspaceViewsStateStorageId = viewContainerStorageId;
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, this.globalViewsStateStorageId, this._register(new DisposableStore()))(() => this.onDidStorageChange()));

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
		const storedViewsStates = this.getStoredWorkspaceState();
		for (const viewDescriptor of viewDescriptors) {
			const viewState = this.get(viewDescriptor.id);
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
			this.storageService.store(this.workspaceViewsStateStorageId, JSON.stringify(storedViewsStates), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(this.workspaceViewsStateStorageId, StorageScope.WORKSPACE);
		}
	}

	private updateGlobalState(viewDescriptors: ReadonlyArray<IViewDescriptor>): void {
		const storedGlobalState = this.getStoredGlobalState();
		for (const viewDescriptor of viewDescriptors) {
			const state = this.get(viewDescriptor.id);
			storedGlobalState.set(viewDescriptor.id, {
				id: viewDescriptor.id,
				isHidden: state && viewDescriptor.canToggleVisibility ? !state.visibleGlobal : false,
				order: !viewDescriptor.workspace && state ? state.order : undefined
			});
		}
		this.setStoredGlobalState(storedGlobalState);
	}

	private onDidStorageChange(): void {
		if (this.globalViewsStatesValue !== this.getStoredGlobalViewsStatesValue() /* This checks if current window changed the value or not */) {
			this._globalViewsStatesValue = undefined;
			const storedViewsVisibilityStates = this.getStoredGlobalState();
			const storedWorkspaceViewsStates = this.getStoredWorkspaceState();
			const changedStates: { id: string; visible: boolean }[] = [];
			for (const [id, storedState] of storedViewsVisibilityStates) {
				const state = this.get(id);
				if (state) {
					if (state.visibleGlobal !== !storedState.isHidden) {
						if (!storedState.isHidden) {
							this.logger.value.info(`View visibility state changed: ${id} is now visible`, this.viewContainerName);
						}
						changedStates.push({ id, visible: !storedState.isHidden });
					}
				} else {
					const workspaceViewState: IStoredWorkspaceViewState | undefined = storedWorkspaceViewsStates[id];
					this.set(id, {
						active: false,
						visibleGlobal: !storedState.isHidden,
						visibleWorkspace: isUndefined(workspaceViewState?.isHidden) ? undefined : !workspaceViewState?.isHidden,
						collapsed: workspaceViewState?.collapsed,
						order: workspaceViewState?.order,
						size: workspaceViewState?.size,
					});
				}
			}
			if (changedStates.length) {
				this._onDidChangeStoredState.fire(changedStates);
				// Update the in memory state after firing the event
				// so that the views can update their state accordingly
				for (const changedState of changedStates) {
					const state = this.get(changedState.id);
					if (state) {
						state.visibleGlobal = changedState.visible;
					}
				}
			}
		}
	}

	private initialize(): Map<string, IViewDescriptorState> {
		const viewStates = new Map<string, IViewDescriptorState>();
		const workspaceViewsStates = this.getStoredWorkspaceState();
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
			for (const { id, isHidden } of workspaceVisibilityStates.values()) {
				const viewState = viewStates.get(id);
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
		for (const { id, isHidden, order } of state.values()) {
			const viewState = viewStates.get(id);
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

	private getStoredWorkspaceState(): IStringDictionary<IStoredWorkspaceViewState> {
		return JSON.parse(this.storageService.get(this.workspaceViewsStateStorageId, StorageScope.WORKSPACE, '{}'));
	}

	private getStoredGlobalState(): Map<string, IStoredGlobalViewState> {
		return this.parseStoredGlobalState(this.globalViewsStatesValue).state;
	}

	private setStoredGlobalState(storedGlobalState: Map<string, IStoredGlobalViewState>): void {
		this.globalViewsStatesValue = JSON.stringify([...storedGlobalState.values()]);
	}

	private parseStoredGlobalState(value: string): { state: Map<string, IStoredGlobalViewState>; hasDuplicates: boolean } {
		const storedValue: Array<string | IStoredGlobalViewState> = JSON.parse(value);
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
		return this.storageService.get(this.globalViewsStateStorageId, StorageScope.PROFILE, '[]');
	}

	private setStoredGlobalViewsStatesValue(value: string): void {
		this.storageService.store(this.globalViewsStateStorageId, value, StorageScope.PROFILE, StorageTarget.USER);
	}

}

interface IViewDescriptorItem {
	viewDescriptor: IViewDescriptor;
	state: IViewDescriptorState;
}

export class ViewContainerModel extends Disposable implements IViewContainerModel {

	private readonly contextKeys = new CounterSet<string>();
	private viewDescriptorItems: IViewDescriptorItem[] = [];
	private viewDescriptorsState: ViewDescriptorsState;

	// Container Info
	private _title!: string;
	get title(): string { return this._title; }

	private _icon: URI | ThemeIcon | undefined;
	get icon(): URI | ThemeIcon | undefined { return this._icon; }

	private _keybindingId: string | undefined;
	get keybindingId(): string | undefined { return this._keybindingId; }

	private _onDidChangeContainerInfo = this._register(new Emitter<{ title?: boolean; icon?: boolean; keybindingId?: boolean }>());
	readonly onDidChangeContainerInfo = this._onDidChangeContainerInfo.event;

	// All View Descriptors
	get allViewDescriptors(): ReadonlyArray<IViewDescriptor> { return this.viewDescriptorItems.map(item => item.viewDescriptor); }
	private _onDidChangeAllViewDescriptors = this._register(new Emitter<{ added: ReadonlyArray<IViewDescriptor>; removed: ReadonlyArray<IViewDescriptor> }>());
	readonly onDidChangeAllViewDescriptors = this._onDidChangeAllViewDescriptors.event;

	// Active View Descriptors
	get activeViewDescriptors(): ReadonlyArray<IViewDescriptor> { return this.viewDescriptorItems.filter(item => item.state.active).map(item => item.viewDescriptor); }
	private _onDidChangeActiveViewDescriptors = this._register(new Emitter<{ added: ReadonlyArray<IViewDescriptor>; removed: ReadonlyArray<IViewDescriptor> }>());
	readonly onDidChangeActiveViewDescriptors = this._onDidChangeActiveViewDescriptors.event;

	// Visible View Descriptors
	get visibleViewDescriptors(): ReadonlyArray<IViewDescriptor> { return this.viewDescriptorItems.filter(item => this.isViewDescriptorVisible(item)).map(item => item.viewDescriptor); }

	private _onDidAddVisibleViewDescriptors = this._register(new Emitter<IAddedViewDescriptorRef[]>());
	readonly onDidAddVisibleViewDescriptors: Event<IAddedViewDescriptorRef[]> = this._onDidAddVisibleViewDescriptors.event;

	private _onDidRemoveVisibleViewDescriptors = this._register(new Emitter<IViewDescriptorRef[]>());
	readonly onDidRemoveVisibleViewDescriptors: Event<IViewDescriptorRef[]> = this._onDidRemoveVisibleViewDescriptors.event;

	private _onDidMoveVisibleViewDescriptors = this._register(new Emitter<{ from: IViewDescriptorRef; to: IViewDescriptorRef }>());
	readonly onDidMoveVisibleViewDescriptors: Event<{ from: IViewDescriptorRef; to: IViewDescriptorRef }> = this._onDidMoveVisibleViewDescriptors.event;

	private readonly logger: Lazy<ILogger>;

	constructor(
		readonly viewContainer: ViewContainer,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILoggerService loggerService: ILoggerService,
	) {
		super();

		this.logger = new Lazy(() => loggerService.createLogger(VIEWS_LOG_ID, { name: VIEWS_LOG_NAME, hidden: true }));

		this._register(Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(this.contextKeys))(() => this.onDidChangeContext()));
		this.viewDescriptorsState = this._register(instantiationService.createInstance(ViewDescriptorsState, viewContainer.storageId || `${viewContainer.id}.state`, typeof viewContainer.title === 'string' ? viewContainer.title : viewContainer.title.original));
		this._register(this.viewDescriptorsState.onDidChangeStoredState(items => this.updateVisibility(items)));

		this.updateContainerInfo();
	}

	private updateContainerInfo(): void {
		/* Use default container info if one of the visible view descriptors belongs to the current container by default */
		const useDefaultContainerInfo = this.viewContainer.alwaysUseContainerInfo || this.visibleViewDescriptors.length === 0 || this.visibleViewDescriptors.some(v => Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).getViewContainer(v.id) === this.viewContainer);
		const title = useDefaultContainerInfo ? (typeof this.viewContainer.title === 'string' ? this.viewContainer.title : this.viewContainer.title.value) : this.visibleViewDescriptors[0]?.containerTitle || this.visibleViewDescriptors[0]?.name?.value || '';
		let titleChanged: boolean = false;
		if (this._title !== title) {
			this._title = title;
			titleChanged = true;
		}

		const icon = useDefaultContainerInfo ? this.viewContainer.icon : this.visibleViewDescriptors[0]?.containerIcon || defaultViewIcon;
		let iconChanged: boolean = false;
		if (!this.isEqualIcon(icon)) {
			this._icon = icon;
			iconChanged = true;
		}

		const keybindingId = this.viewContainer.openCommandActionDescriptor?.id ?? this.activeViewDescriptors.find(v => v.openCommandActionDescriptor)?.openCommandActionDescriptor?.id;
		let keybindingIdChanged: boolean = false;
		if (this._keybindingId !== keybindingId) {
			this._keybindingId = keybindingId;
			keybindingIdChanged = true;
		}

		if (titleChanged || iconChanged || keybindingIdChanged) {
			this._onDidChangeContainerInfo.fire({ title: titleChanged, icon: iconChanged, keybindingId: keybindingIdChanged });
		}
	}

	private isEqualIcon(icon: URI | ThemeIcon | undefined): boolean {
		if (URI.isUri(icon)) {
			return URI.isUri(this._icon) && isEqual(icon, this._icon);
		} else if (ThemeIcon.isThemeIcon(icon)) {
			return ThemeIcon.isThemeIcon(this._icon) && ThemeIcon.isEqual(icon, this._icon);
		}
		return icon === this._icon;
	}

	isVisible(id: string): boolean {
		const viewDescriptorItem = this.viewDescriptorItems.find(v => v.viewDescriptor.id === id);
		if (!viewDescriptorItem) {
			throw new Error(`Unknown view ${id}`);
		}
		return this.isViewDescriptorVisible(viewDescriptorItem);
	}

	setVisible(id: string, visible: boolean): void {
		this.updateVisibility([{ id, visible }]);
	}

	private updateVisibility(viewDescriptors: { id: string; visible: boolean }[]): void {
		// First: Update and remove the view descriptors which are asked to be hidden
		const viewDescriptorItemsToHide = coalesce(viewDescriptors.filter(({ visible }) => !visible)
			.map(({ id }) => this.findAndIgnoreIfNotFound(id)));
		const removed: IViewDescriptorRef[] = [];
		for (const { viewDescriptorItem, visibleIndex } of viewDescriptorItemsToHide) {
			if (this.updateViewDescriptorItemVisibility(viewDescriptorItem, false)) {
				removed.push({ viewDescriptor: viewDescriptorItem.viewDescriptor, index: visibleIndex });
			}
		}
		if (removed.length) {
			this.broadCastRemovedVisibleViewDescriptors(removed);
		}

		// Second: Update and add the view descriptors which are asked to be shown
		const added: IAddedViewDescriptorRef[] = [];
		for (const { id, visible } of viewDescriptors) {
			if (!visible) {
				continue;
			}
			const foundViewDescriptor = this.findAndIgnoreIfNotFound(id);
			if (!foundViewDescriptor) {
				continue;
			}
			const { viewDescriptorItem, visibleIndex } = foundViewDescriptor;
			if (this.updateViewDescriptorItemVisibility(viewDescriptorItem, true)) {
				added.push({ index: visibleIndex, viewDescriptor: viewDescriptorItem.viewDescriptor, size: viewDescriptorItem.state.size, collapsed: !!viewDescriptorItem.state.collapsed });
			}
		}
		if (added.length) {
			this.broadCastAddedVisibleViewDescriptors(added);
		}
	}

	private updateViewDescriptorItemVisibility(viewDescriptorItem: IViewDescriptorItem, visible: boolean): boolean {
		if (!viewDescriptorItem.viewDescriptor.canToggleVisibility) {
			return false;
		}
		if (this.isViewDescriptorVisibleWhenActive(viewDescriptorItem) === visible) {
			return false;
		}

		// update visibility
		if (viewDescriptorItem.viewDescriptor.workspace) {
			viewDescriptorItem.state.visibleWorkspace = visible;
		} else {
			viewDescriptorItem.state.visibleGlobal = visible;
			if (visible) {
				this.logger.value.info(`Showing view ${viewDescriptorItem.viewDescriptor.id} in the container ${this.viewContainer.id}`);
			}
		}

		// return `true` only if visibility is changed
		return this.isViewDescriptorVisible(viewDescriptorItem) === visible;
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

	setSizes(newSizes: readonly { id: string; size: number }[]): void {
		for (const { id, size } of newSizes) {
			const { viewDescriptorItem } = this.find(id);
			if (viewDescriptorItem.state.size !== size) {
				viewDescriptorItem.state.size = size;
			}
		}
		this.viewDescriptorsState.updateState(this.allViewDescriptors);
	}

	move(from: string, to: string): void {
		const fromIndex = this.viewDescriptorItems.findIndex(v => v.viewDescriptor.id === from);
		const toIndex = this.viewDescriptorItems.findIndex(v => v.viewDescriptor.id === to);

		const fromViewDescriptor = this.viewDescriptorItems[fromIndex];
		const toViewDescriptor = this.viewDescriptorItems[toIndex];

		move(this.viewDescriptorItems, fromIndex, toIndex);

		for (let index = 0; index < this.viewDescriptorItems.length; index++) {
			this.viewDescriptorItems[index].state.order = index;
		}

		this.broadCastMovedViewDescriptors({ index: fromIndex, viewDescriptor: fromViewDescriptor.viewDescriptor }, { index: toIndex, viewDescriptor: toViewDescriptor.viewDescriptor });
	}

	add(addedViewDescriptorStates: IAddedViewDescriptorState[]): void {
		const addedItems: IViewDescriptorItem[] = [];
		for (const addedViewDescriptorState of addedViewDescriptorStates) {
			const viewDescriptor = addedViewDescriptorState.viewDescriptor;

			if (viewDescriptor.when) {
				for (const key of viewDescriptor.when.keys()) {
					this.contextKeys.add(key);
				}
			}

			let state = this.viewDescriptorsState.get(viewDescriptor.id);
			if (state) {
				// set defaults if not set
				if (viewDescriptor.workspace) {
					state.visibleWorkspace = isUndefinedOrNull(addedViewDescriptorState.visible) ? (isUndefinedOrNull(state.visibleWorkspace) ? !viewDescriptor.hideByDefault : state.visibleWorkspace) : addedViewDescriptorState.visible;
				} else {
					const isVisible = state.visibleGlobal;
					state.visibleGlobal = isUndefinedOrNull(addedViewDescriptorState.visible) ? (isUndefinedOrNull(state.visibleGlobal) ? !viewDescriptor.hideByDefault : state.visibleGlobal) : addedViewDescriptorState.visible;
					if (state.visibleGlobal && !isVisible) {
						this.logger.value.info(`Added view ${viewDescriptor.id} in the container ${this.viewContainer.id} and showing it.`, `${isVisible}`, `${viewDescriptor.hideByDefault}`, `${addedViewDescriptorState.visible}`);
					}
				}
				state.collapsed = isUndefinedOrNull(addedViewDescriptorState.collapsed) ? (isUndefinedOrNull(state.collapsed) ? !!viewDescriptor.collapsed : state.collapsed) : addedViewDescriptorState.collapsed;
			} else {
				state = {
					active: false,
					visibleGlobal: isUndefinedOrNull(addedViewDescriptorState.visible) ? !viewDescriptor.hideByDefault : addedViewDescriptorState.visible,
					visibleWorkspace: isUndefinedOrNull(addedViewDescriptorState.visible) ? !viewDescriptor.hideByDefault : addedViewDescriptorState.visible,
					collapsed: isUndefinedOrNull(addedViewDescriptorState.collapsed) ? !!viewDescriptor.collapsed : addedViewDescriptorState.collapsed,
				};
			}
			this.viewDescriptorsState.set(viewDescriptor.id, state);
			state.active = this.contextKeyService.contextMatchesRules(viewDescriptor.when);
			addedItems.push({ viewDescriptor, state });
		}
		this.viewDescriptorItems.push(...addedItems);
		this.viewDescriptorItems.sort(this.compareViewDescriptors.bind(this));
		this._onDidChangeAllViewDescriptors.fire({ added: addedItems.map(({ viewDescriptor }) => viewDescriptor), removed: [] });

		const addedActiveItems: { viewDescriptorItem: IViewDescriptorItem; visible: boolean }[] = [];
		for (const viewDescriptorItem of addedItems) {
			if (viewDescriptorItem.state.active) {
				addedActiveItems.push({ viewDescriptorItem, visible: this.isViewDescriptorVisible(viewDescriptorItem) });
			}
		}
		if (addedActiveItems.length) {
			this._onDidChangeActiveViewDescriptors.fire(({ added: addedActiveItems.map(({ viewDescriptorItem }) => viewDescriptorItem.viewDescriptor), removed: [] }));
		}

		const addedVisibleDescriptors: IAddedViewDescriptorRef[] = [];
		for (const { viewDescriptorItem, visible } of addedActiveItems) {
			if (visible && this.isViewDescriptorVisible(viewDescriptorItem)) {
				const { visibleIndex } = this.find(viewDescriptorItem.viewDescriptor.id);
				addedVisibleDescriptors.push({ index: visibleIndex, viewDescriptor: viewDescriptorItem.viewDescriptor, size: viewDescriptorItem.state.size, collapsed: !!viewDescriptorItem.state.collapsed });
			}
		}
		this.broadCastAddedVisibleViewDescriptors(addedVisibleDescriptors);
	}

	remove(viewDescriptors: IViewDescriptor[]): void {
		const removed: IViewDescriptor[] = [];
		const removedItems: IViewDescriptorItem[] = [];
		const removedActiveDescriptors: IViewDescriptor[] = [];
		const removedVisibleDescriptors: IViewDescriptorRef[] = [];

		for (const viewDescriptor of viewDescriptors) {
			if (viewDescriptor.when) {
				for (const key of viewDescriptor.when.keys()) {
					this.contextKeys.delete(key);
				}
			}
			const index = this.viewDescriptorItems.findIndex(i => i.viewDescriptor.id === viewDescriptor.id);
			if (index !== -1) {
				removed.push(viewDescriptor);
				const viewDescriptorItem = this.viewDescriptorItems[index];
				if (viewDescriptorItem.state.active) {
					removedActiveDescriptors.push(viewDescriptorItem.viewDescriptor);
				}
				if (this.isViewDescriptorVisible(viewDescriptorItem)) {
					const { visibleIndex } = this.find(viewDescriptorItem.viewDescriptor.id);
					removedVisibleDescriptors.push({ index: visibleIndex, viewDescriptor: viewDescriptorItem.viewDescriptor });
				}
				removedItems.push(viewDescriptorItem);
			}
		}

		// update state
		removedItems.forEach(item => this.viewDescriptorItems.splice(this.viewDescriptorItems.indexOf(item), 1));

		this.broadCastRemovedVisibleViewDescriptors(removedVisibleDescriptors);
		if (removedActiveDescriptors.length) {
			this._onDidChangeActiveViewDescriptors.fire(({ added: [], removed: removedActiveDescriptors }));
		}
		if (removed.length) {
			this._onDidChangeAllViewDescriptors.fire({ added: [], removed });
		}
	}

	private onDidChangeContext(): void {
		const addedActiveItems: { item: IViewDescriptorItem; visibleWhenActive: boolean }[] = [];
		const removedActiveItems: IViewDescriptorItem[] = [];

		for (const item of this.viewDescriptorItems) {
			const wasActive = item.state.active;
			const isActive = this.contextKeyService.contextMatchesRules(item.viewDescriptor.when);
			if (wasActive !== isActive) {
				if (isActive) {
					addedActiveItems.push({ item, visibleWhenActive: this.isViewDescriptorVisibleWhenActive(item) });
				} else {
					removedActiveItems.push(item);
				}
			}
		}

		const removedVisibleDescriptors: IViewDescriptorRef[] = [];
		for (const item of removedActiveItems) {
			if (this.isViewDescriptorVisible(item)) {
				const { visibleIndex } = this.find(item.viewDescriptor.id);
				removedVisibleDescriptors.push({ index: visibleIndex, viewDescriptor: item.viewDescriptor });
			}
		}

		// Update the State
		removedActiveItems.forEach(item => item.state.active = false);
		addedActiveItems.forEach(({ item }) => item.state.active = true);

		this.broadCastRemovedVisibleViewDescriptors(removedVisibleDescriptors);

		if (addedActiveItems.length || removedActiveItems.length) {
			this._onDidChangeActiveViewDescriptors.fire(({ added: addedActiveItems.map(({ item }) => item.viewDescriptor), removed: removedActiveItems.map(item => item.viewDescriptor) }));
		}

		const addedVisibleDescriptors: IAddedViewDescriptorRef[] = [];
		for (const { item, visibleWhenActive } of addedActiveItems) {
			if (visibleWhenActive && this.isViewDescriptorVisible(item)) {
				const { visibleIndex } = this.find(item.viewDescriptor.id);
				addedVisibleDescriptors.push({ index: visibleIndex, viewDescriptor: item.viewDescriptor, size: item.state.size, collapsed: !!item.state.collapsed });
			}
		}
		this.broadCastAddedVisibleViewDescriptors(addedVisibleDescriptors);
	}

	private broadCastAddedVisibleViewDescriptors(added: IAddedViewDescriptorRef[]): void {
		if (added.length) {
			this._onDidAddVisibleViewDescriptors.fire(added.sort((a, b) => a.index - b.index));
			this.updateState(`Added views:${added.map(v => v.viewDescriptor.id).join(',')} in ${this.viewContainer.id}`);
		}
	}

	private broadCastRemovedVisibleViewDescriptors(removed: IViewDescriptorRef[]): void {
		if (removed.length) {
			this._onDidRemoveVisibleViewDescriptors.fire(removed.sort((a, b) => b.index - a.index));
			this.updateState(`Removed views:${removed.map(v => v.viewDescriptor.id).join(',')} from ${this.viewContainer.id}`);
		}
	}

	private broadCastMovedViewDescriptors(from: IViewDescriptorRef, to: IViewDescriptorRef): void {
		this._onDidMoveVisibleViewDescriptors.fire({ from, to });
		this.updateState(`Moved view ${from.viewDescriptor.id} to ${to.viewDescriptor.id} in ${this.viewContainer.id}`);
	}

	private updateState(reason: string): void {
		this.logger.value.info(reason);
		this.viewDescriptorsState.updateState(this.allViewDescriptors);
		this.updateContainerInfo();
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

	private find(id: string): { index: number; visibleIndex: number; viewDescriptorItem: IViewDescriptorItem } {
		const result = this.findAndIgnoreIfNotFound(id);
		if (result) {
			return result;
		}
		throw new Error(`view descriptor ${id} not found`);
	}

	private findAndIgnoreIfNotFound(id: string): { index: number; visibleIndex: number; viewDescriptorItem: IViewDescriptorItem } | undefined {
		for (let i = 0, visibleIndex = 0; i < this.viewDescriptorItems.length; i++) {
			const viewDescriptorItem = this.viewDescriptorItems[i];
			if (viewDescriptorItem.viewDescriptor.id === id) {
				return { index: i, visibleIndex, viewDescriptorItem: viewDescriptorItem };
			}
			if (this.isViewDescriptorVisible(viewDescriptorItem)) {
				visibleIndex++;
			}
		}
		return undefined;
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
