/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/views';
import { Disposable, IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { IViewsService, ViewsRegistry, IViewsViewlet, ViewContainer, IViewDescriptor, IViewContainersRegistry, Extensions as ViewContainerExtensions, IView, IViewDescriptorCollection } from 'vs/workbench/common/views';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IContextKeyService, IContextKeyChangeEvent, IReadableSet, IContextKey, RawContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Event, Emitter } from 'vs/base/common/event';
import { sortedDiff, firstIndex, move, isNonEmptyArray } from 'vs/base/common/arrays';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { MenuId, MenuRegistry, ICommandAction } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { localize } from 'vs/nls';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { values } from 'vs/base/common/map';
import { IFileIconTheme, IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { toggleClass, addClass } from 'vs/base/browser/dom';

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
		const onRelevantViewsRegistered = filterViewRegisterEvent(container, ViewsRegistry.onViewsRegistered);
		this._register(onRelevantViewsRegistered(this.onViewsRegistered, this));

		const onRelevantViewsMoved = filterViewMoveEvent(container, ViewsRegistry.onDidChangeContainer);
		this._register(onRelevantViewsMoved(({ added, removed }) => {
			if (isNonEmptyArray(added)) {
				this.onViewsRegistered(added);
			}
			if (isNonEmptyArray(removed)) {
				this.onViewsDeregistered(removed);
			}
		}));

		const onRelevantViewsDeregistered = filterViewRegisterEvent(container, ViewsRegistry.onViewsDeregistered);
		this._register(onRelevantViewsDeregistered(this.onViewsDeregistered, this));

		const onRelevantContextChange = Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(this.contextKeys));
		this._register(onRelevantContextChange(this.onContextChanged, this));

		this.onViewsRegistered(ViewsRegistry.getViews(container));
	}

	private onViewsRegistered(viewDescriptors: IViewDescriptor[]): any {
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

	private onViewsDeregistered(viewDescriptors: IViewDescriptor[]): any {
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

	private onContextChanged(event: IContextKeyChangeEvent): any {
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
	visible: boolean;
	collapsed: boolean;
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
		return this.viewDescriptors.filter(v => this.viewStates.get(v.id)!.visible);
	}

	private _onDidAdd = this._register(new Emitter<IAddedViewDescriptorRef[]>());
	readonly onDidAdd: Event<IAddedViewDescriptorRef[]> = this._onDidAdd.event;

	private _onDidRemove = this._register(new Emitter<IViewDescriptorRef[]>());
	readonly onDidRemove: Event<IViewDescriptorRef[]> = this._onDidRemove.event;

	private _onDidMove = this._register(new Emitter<{ from: IViewDescriptorRef; to: IViewDescriptorRef; }>());
	readonly onDidMove: Event<{ from: IViewDescriptorRef; to: IViewDescriptorRef; }> = this._onDidMove.event;

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
		const state = this.viewStates.get(id);

		if (!state) {
			throw new Error(`Unknown view ${id}`);
		}

		return state.visible;
	}

	setVisible(id: string, visible: boolean): void {
		const { visibleIndex, viewDescriptor, state } = this.find(id);

		if (!viewDescriptor.canToggleVisibility) {
			throw new Error(`Can't toggle this view's visibility`);
		}

		if (state.visible === visible) {
			return;
		}

		state.visible = visible;

		if (visible) {
			this._onDidAdd.fire([{ index: visibleIndex, viewDescriptor, size: state.size, collapsed: state.collapsed }]);
		} else {
			this._onDidRemove.fire([{ index: visibleIndex, viewDescriptor }]);
		}
	}

	isCollapsed(id: string): boolean {
		const state = this.viewStates.get(id);

		if (!state) {
			throw new Error(`Unknown view ${id}`);
		}

		return state.collapsed;
	}

	setCollapsed(id: string, collapsed: boolean): void {
		const { state } = this.find(id);
		state.collapsed = collapsed;
	}

	getSize(id: string): number | undefined {
		const state = this.viewStates.get(id);

		if (!state) {
			throw new Error(`Unknown view ${id}`);
		}

		return state.size;
	}

	setSize(id: string, size: number): void {
		const { state } = this.find(id);
		state.size = size;
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

			if (state.visible) {
				visibleIndex++;
			}
		}

		throw new Error(`view descriptor ${id} not found`);
	}

	private compareViewDescriptors(a: IViewDescriptor, b: IViewDescriptor): number {
		if (a.id === b.id) {
			return 0;
		}

		return (this.getViewOrder(a) - this.getViewOrder(b)) || (a.id < b.id ? -1 : 1);
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
				viewState.visible = isUndefinedOrNull(viewState.visible) ? !viewDescriptor.hideByDefault : viewState.visible;
				viewState.collapsed = isUndefinedOrNull(viewState.collapsed) ? !!viewDescriptor.collapsed : viewState.collapsed;
			} else {
				this.viewStates.set(viewDescriptor.id, {
					visible: !viewDescriptor.hideByDefault,
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
				const { state } = this.find(viewDescriptor.id);

				if (state.visible) {
					toRemove.push({ index: startIndex++, viewDescriptor });
				}
			}

			for (const viewDescriptor of splice.toInsert) {
				const state = this.viewStates.get(viewDescriptor.id)!;

				if (state.visible) {
					toAdd.push({ index: startIndex++, viewDescriptor, size: state.size, collapsed: state.collapsed });
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

export class PersistentContributableViewsModel extends ContributableViewsModel {

	private viewletStateStorageId: string;
	private readonly hiddenViewsStorageId: string;

	private storageService: IStorageService;
	private contextService: IWorkspaceContextService;

	constructor(
		container: ViewContainer,
		viewletStateStorageId: string,
		@IViewsService viewsService: IViewsService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		const hiddenViewsStorageId = `${viewletStateStorageId}.hidden`;
		const viewStates = PersistentContributableViewsModel.loadViewsStates(viewletStateStorageId, hiddenViewsStorageId, storageService, contextService);

		super(container, viewsService, viewStates);

		this.viewletStateStorageId = viewletStateStorageId;
		this.hiddenViewsStorageId = hiddenViewsStorageId;
		this.storageService = storageService;
		this.contextService = contextService;

		this._register(this.onDidAdd(viewDescriptorRefs => this.saveVisibilityStates(viewDescriptorRefs.map(r => r.viewDescriptor))));
		this._register(this.onDidRemove(viewDescriptorRefs => this.saveVisibilityStates(viewDescriptorRefs.map(r => r.viewDescriptor))));
		this._register(this.storageService.onWillSaveState(() => this.saveViewsStates()));
	}

	private saveViewsStates(): void {
		const storedViewsStates: { [id: string]: { collapsed: boolean, size?: number, order?: number } } = {};

		let hasState = false;
		for (const viewDescriptor of this.viewDescriptors) {
			const viewState = this.viewStates.get(viewDescriptor.id);
			if (viewState) {
				storedViewsStates[viewDescriptor.id] = { collapsed: viewState.collapsed, size: viewState.size, order: viewState.order };
				hasState = true;
			}
		}

		if (hasState) {
			this.storageService.store(this.viewletStateStorageId, JSON.stringify(storedViewsStates), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(this.viewletStateStorageId, StorageScope.WORKSPACE);
		}
	}

	private saveVisibilityStates(viewDescriptors: IViewDescriptor[]): void {
		const storedViewsVisibilityStates = PersistentContributableViewsModel.loadViewsVisibilityState(this.hiddenViewsStorageId, this.storageService, this.contextService);
		for (const viewDescriptor of viewDescriptors) {
			if (viewDescriptor.canToggleVisibility) {
				const viewState = this.viewStates.get(viewDescriptor.id);
				storedViewsVisibilityStates.set(viewDescriptor.id, { id: viewDescriptor.id, isHidden: viewState ? !viewState.visible : false });
			}
		}
		this.storageService.store(this.hiddenViewsStorageId, JSON.stringify(values(storedViewsVisibilityStates)), StorageScope.GLOBAL);
	}

	private static loadViewsStates(viewletStateStorageId: string, hiddenViewsStorageId: string, storageService: IStorageService, contextService: IWorkspaceContextService): Map<string, IViewState> {
		const viewStates = new Map<string, IViewState>();
		const storedViewsStates = JSON.parse(storageService.get(viewletStateStorageId, StorageScope.WORKSPACE, '{}'));
		const viewsVisibilityStates = PersistentContributableViewsModel.loadViewsVisibilityState(hiddenViewsStorageId, storageService, contextService);
		for (const { id, isHidden } of values(viewsVisibilityStates)) {
			const viewState = storedViewsStates[id];
			if (viewState) {
				viewStates.set(id, <IViewState>{ ...viewState, ...{ visible: !isHidden } });
			} else {
				// New workspace
				viewStates.set(id, <IViewState>{ ...{ visible: !isHidden } });
			}
		}
		for (const id of Object.keys(storedViewsStates)) {
			if (!viewStates.has(id)) {
				viewStates.set(id, <IViewState>{ ...storedViewsStates[id] });
			}
		}
		return viewStates;
	}

	private static loadViewsVisibilityState(hiddenViewsStorageId: string, storageService: IStorageService, contextService: IWorkspaceContextService): Map<string, { id: string, isHidden: boolean }> {
		const storedVisibilityStates = <Array<string | { id: string, isHidden: boolean }>>JSON.parse(storageService.get(hiddenViewsStorageId, StorageScope.GLOBAL, '[]'));
		let hasDuplicates = false;
		const storedViewsVisibilityStates = storedVisibilityStates.reduce((result, storedState) => {
			if (typeof storedState === 'string' /* migration */) {
				hasDuplicates = hasDuplicates || result.has(storedState);
				result.set(storedState, { id: storedState, isHidden: true });
			} else {
				hasDuplicates = hasDuplicates || result.has(storedState.id);
				result.set(storedState.id, storedState);
			}
			return result;
		}, new Map<string, { id: string, isHidden: boolean }>());

		if (hasDuplicates) {
			storageService.store(hiddenViewsStorageId, JSON.stringify(values(storedViewsVisibilityStates)), StorageScope.GLOBAL);
		}

		return storedViewsVisibilityStates;
	}
}

export class ViewsService extends Disposable implements IViewsService {

	_serviceBrand: any;

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

		const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
		viewContainersRegistry.all.forEach(viewContainer => {
			this.onDidRegisterViews(viewContainer, ViewsRegistry.getViews(viewContainer));
			this.onDidRegisterViewContainer(viewContainer);
		});
		this._register(ViewsRegistry.onViewsRegistered(({ views, viewContainer }) => this.onDidRegisterViews(viewContainer, views)));
		this._register(ViewsRegistry.onViewsDeregistered(({ views }) => this.onDidDeregisterViews(views)));
		this._register(ViewsRegistry.onDidChangeContainer(({ views, to }) => { this.onDidDeregisterViews(views); this.onDidRegisterViews(to, views); }));
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

	openView(id: string, focus: boolean): Promise<IView | null> {
		const viewContainer = ViewsRegistry.getViewContainer(id);
		if (viewContainer) {
			const viewletDescriptor = this.viewletService.getViewlet(viewContainer.id);
			if (viewletDescriptor) {
				return this.viewletService.openViewlet(viewletDescriptor.id, focus)
					.then((viewlet: IViewsViewlet) => {
						if (viewlet && viewlet.openView) {
							return viewlet.openView(id, focus);
						}
						return null;
					});
			}
		}
		return Promise.resolve(null);
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

			disposables.push(CommandsRegistry.registerCommand(command.id, () => this.openView(viewDescriptor.id, true).then(() => null)));

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