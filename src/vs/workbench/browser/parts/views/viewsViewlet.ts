/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import * as DOM from 'vs/base/browser/dom';
import { $, Dimension, Builder } from 'vs/base/browser/builder';
import { Scope } from 'vs/workbench/common/memento';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { firstIndex } from 'vs/base/common/arrays';
import { DelayedDragHandler } from 'vs/base/browser/dnd';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ViewsRegistry, ViewLocation, IViewDescriptor } from 'vs/workbench/browser/parts/views/viewsRegistry';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IContextKeyService, IContextKeyChangeEvent } from 'vs/platform/contextkey/common/contextkey';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { PanelViewlet, ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { IPanelOptions } from 'vs/base/browser/ui/splitview/panelview';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';

export interface IViewOptions extends IPanelOptions {
	id: string;
	name: string;
	actionRunner: IActionRunner;
}

export abstract class ViewsViewletPanel extends ViewletPanel {

	private _isVisible: boolean;

	readonly id: string;
	readonly name: string;

	constructor(
		options: IViewOptions,
		protected keybindingService: IKeybindingService,
		protected contextMenuService: IContextMenuService
	) {
		super(options.name, options, keybindingService, contextMenuService);

		this.id = options.id;
		this.name = options.name;
		this._expanded = options.expanded;
	}

	setVisible(visible: boolean): TPromise<void> {
		if (this._isVisible !== visible) {
			this._isVisible = visible;
		}

		return TPromise.wrap(null);
	}

	isVisible(): boolean {
		return this._isVisible;
	}

	getActions(): IAction[] {
		return [];
	}

	getSecondaryActions(): IAction[] {
		return [];
	}

	getActionItem(action: IAction): IActionItem {
		return null;
	}

	getActionsContext(): any {
		return undefined;
	}

	getOptimalWidth(): number {
		return 0;
	}

	create(): TPromise<void> {
		return TPromise.as(null);
	}

	shutdown(): void {
		// Subclass to implement
	}

}

// TODO@isidor @sandeep remove this class
export abstract class TreeViewsViewletPanel extends ViewsViewletPanel {

	readonly id: string;
	readonly name: string;
	protected treeContainer: HTMLElement;

	// TODO@sandeep why is tree here? isn't this coming only from TreeView
	protected tree: WorkbenchTree;
	protected isDisposed: boolean;
	private dragHandler: DelayedDragHandler;

	constructor(
		options: IViewOptions,
		protected keybindingService: IKeybindingService,
		protected contextMenuService: IContextMenuService
	) {
		super(options, keybindingService, contextMenuService);

		this.id = options.id;
		this.name = options.name;
		this._expanded = options.expanded;
	}

	setExpanded(expanded: boolean): void {
		this.updateTreeVisibility(this.tree, expanded);
		super.setExpanded(expanded);
	}

	protected renderHeader(container: HTMLElement): void {
		super.renderHeader(container);

		// Expand on drag over
		this.dragHandler = new DelayedDragHandler(container, () => this.setExpanded(true));
	}

	protected renderViewTree(container: HTMLElement): HTMLElement {
		const treeContainer = document.createElement('div');
		container.appendChild(treeContainer);
		return treeContainer;
	}

	getViewer(): WorkbenchTree {
		return this.tree;
	}

	setVisible(visible: boolean): TPromise<void> {
		if (this.isVisible() !== visible) {
			return super.setVisible(visible)
				.then(() => this.updateTreeVisibility(this.tree, visible && this.isExpanded()));
		}

		return TPromise.wrap(null);
	}

	focus(): void {
		super.focus();
		this.focusTree();
	}

	protected reveal(element: any, relativeTop?: number): TPromise<void> {
		if (!this.tree) {
			return TPromise.as(null); // return early if viewlet has not yet been created
		}

		return this.tree.reveal(element, relativeTop);
	}

	layoutBody(size: number): void {
		if (this.tree) {
			this.treeContainer.style.height = size + 'px';
			this.tree.layout(size);
		}
	}

	getActions(): IAction[] {
		return [];
	}

	getSecondaryActions(): IAction[] {
		return [];
	}

	getActionItem(action: IAction): IActionItem {
		return null;
	}

	getActionsContext(): any {
		return undefined;
	}

	getOptimalWidth(): number {
		return 0;
	}

	create(): TPromise<void> {
		return TPromise.as(null);
	}

	shutdown(): void {
		// Subclass to implement
	}

	dispose(): void {
		this.isDisposed = true;
		this.treeContainer = null;

		if (this.tree) {
			this.tree.dispose();
		}

		if (this.dragHandler) {
			this.dragHandler.dispose();
		}

		super.dispose();
	}

	private updateTreeVisibility(tree: WorkbenchTree, isVisible: boolean): void {
		if (!tree) {
			return;
		}

		if (isVisible) {
			$(tree.getHTMLElement()).show();
		} else {
			$(tree.getHTMLElement()).hide(); // make sure the tree goes out of the tabindex world by hiding it
		}

		if (isVisible) {
			tree.onVisible();
		} else {
			tree.onHidden();
		}
	}

	private focusTree(): void {
		if (!this.tree) {
			return; // return early if viewlet has not yet been created
		}

		// Make sure the current selected element is revealed
		const selection = this.tree.getSelection();
		if (selection.length > 0) {
			this.reveal(selection[0], 0.5).done(null, errors.onUnexpectedError);
		}

		// Pass Focus to Viewer
		this.tree.DOMFocus();
	}
}

export interface IViewletViewOptions extends IViewOptions {
	viewletSettings: object;
}

export interface IViewState {
	collapsed: boolean;
	size: number | undefined;
	isHidden: boolean;
	order: number;
}

export class ViewsViewlet extends PanelViewlet {

	private viewHeaderContextMenuListeners: IDisposable[] = [];
	private viewletSettings: object;
	private readonly viewsContextKeys: Set<string> = new Set<string>();
	private viewsViewletPanels: ViewsViewletPanel[] = [];
	private didLayout = false;
	protected viewsStates: Map<string, IViewState> = new Map<string, IViewState>();
	private areExtensionsReady: boolean = false;

	constructor(
		id: string,
		private location: ViewLocation,
		private showHeaderInTitleWhenSingleView: boolean,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService protected storageService: IStorageService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IExtensionService protected extensionService: IExtensionService
	) {
		super(id, { showHeaderInTitleWhenSingleView, dnd: true }, telemetryService, themeService);

		this.viewletSettings = this.getMemento(storageService, Scope.WORKSPACE);
	}

	async create(parent: Builder): TPromise<void> {
		await super.create(parent);

		this._register(this.onDidSashChange(() => this.updateAllViewsSizes()));
		this._register(ViewsRegistry.onViewsRegistered(this.onViewsRegistered, this));
		this._register(ViewsRegistry.onViewsDeregistered(this.onViewsDeregistered, this));
		this._register(this.contextKeyService.onDidChangeContext(this.onContextChanged, this));

		// Update headers after and title contributed views after available, since we read from cache in the beginning to know if the viewlet has single view or not. Ref #29609
		this.extensionService.whenInstalledExtensionsRegistered().then(() => {
			this.areExtensionsReady = true;
			this.updateHeaders();
		});

		this.onViewsRegistered(ViewsRegistry.getViews(this.location));
		this.focus();
	}

	getContextMenuActions(): IAction[] {
		return this.getViewDescriptorsFromRegistry(true)
			.filter(viewDescriptor => viewDescriptor.canToggleVisibility && this.contextKeyService.contextMatchesRules(viewDescriptor.when))
			.map(viewDescriptor => (<IAction>{
				id: `${viewDescriptor.id}.toggleVisibility`,
				label: viewDescriptor.name,
				checked: this.isCurrentlyVisible(viewDescriptor),
				enabled: true,
				run: () => this.toggleViewVisibility(viewDescriptor.id)
			}));
	}

	setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible)
			.then(() => TPromise.join(this.viewsViewletPanels.filter(view => view.isVisible() !== visible)
				.map((view) => view.setVisible(visible))))
			.then(() => void 0);
	}

	layout(dimension: Dimension): void {
		super.layout(dimension);

		if (!this.didLayout) {
			this.didLayout = true;
			this._resizePanels();
		}

		this.updateAllViewsSizes();
	}

	getOptimalWidth(): number {
		const additionalMargin = 16;
		const optimalWidth = Math.max(...this.viewsViewletPanels.map(view => view.getOptimalWidth() || 0));
		return optimalWidth + additionalMargin;
	}

	shutdown(): void {
		this.viewsViewletPanels.forEach((view) => view.shutdown());
		super.shutdown();
	}

	toggleViewVisibility(id: string, visible?: boolean): void {
		const view = this.getView(id);
		let viewState = this.viewsStates.get(id);

		if ((visible === true && view) || (visible === false && !view)) {
			return;
		}

		if (view) {
			viewState = viewState || this.createViewState(view);
			viewState.isHidden = true;
		} else {
			viewState = viewState || { collapsed: true, size: void 0, isHidden: false, order: void 0 };
			viewState.isHidden = false;
		}
		this.viewsStates.set(id, viewState);
		this.updateViews();
	}

	private onViewsRegistered(views: IViewDescriptor[]): TPromise<ViewsViewletPanel[]> {
		this.viewsContextKeys.clear();
		for (const viewDescriptor of this.getViewDescriptorsFromRegistry()) {
			if (viewDescriptor.when) {
				for (const key of viewDescriptor.when.keys()) {
					this.viewsContextKeys.add(key);
				}
			}
		}

		return this.updateViews();
	}

	private onViewsDeregistered(views: IViewDescriptor[]): TPromise<ViewsViewletPanel[]> {
		return this.updateViews(views);
	}

	private onContextChanged(event: IContextKeyChangeEvent): void {
		if (event.affectsSome(this.viewsContextKeys)) {
			this.updateViews();
		}
	}

	protected updateViews(unregisteredViews: IViewDescriptor[] = []): TPromise<ViewsViewletPanel[]> {
		const registeredViews = this.getViewDescriptorsFromRegistry();
		const [visible, toAdd, toRemove] = registeredViews.reduce<[IViewDescriptor[], IViewDescriptor[], IViewDescriptor[]]>((result, viewDescriptor) => {
			const isCurrentlyVisible = this.isCurrentlyVisible(viewDescriptor);
			const canBeVisible = this.canBeVisible(viewDescriptor);

			if (canBeVisible) {
				result[0].push(viewDescriptor);
			}

			if (!isCurrentlyVisible && canBeVisible) {
				result[1].push(viewDescriptor);
			}

			if (isCurrentlyVisible && !canBeVisible) {
				result[2].push(viewDescriptor);
			}

			return result;

		}, [[], [], []]);

		toRemove.push(...unregisteredViews.filter(viewDescriptor => this.isCurrentlyVisible(viewDescriptor)));

		const toCreate: ViewsViewletPanel[] = [];

		if (toAdd.length || toRemove.length) {
			const panels = [...this.viewsViewletPanels];

			for (const view of panels) {
				let viewState = this.viewsStates.get(view.id);
				if (!viewState || typeof viewState.size === 'undefined' || !view.isExpanded() !== viewState.collapsed) {
					viewState = this.updateViewStateSize(view);
					this.viewsStates.set(view.id, viewState);
				}
			}

			if (toRemove.length) {
				for (const viewDescriptor of toRemove) {
					let view = this.getView(viewDescriptor.id);
					const viewState = this.updateViewStateSize(view);
					this.viewsStates.set(view.id, viewState);
					this.removePanel(view);
					this.viewsViewletPanels.splice(this.viewsViewletPanels.indexOf(view), 1);
				}
			}

			for (const viewDescriptor of toAdd) {
				let viewState = this.viewsStates.get(viewDescriptor.id);
				let index = visible.indexOf(viewDescriptor);
				const view = this.createView(viewDescriptor,
					{
						id: viewDescriptor.id,
						name: viewDescriptor.name,
						actionRunner: this.getActionRunner(),
						expanded: !(viewState ? viewState.collapsed : viewDescriptor.collapsed),
						viewletSettings: this.viewletSettings
					});
				toCreate.push(view);

				const size = (viewState && viewState.size) || viewDescriptor.size || 200;
				this.addPanel(view, size, index);
				this.viewsViewletPanels.splice(index, 0, view);

				this.viewsStates.set(view.id, this.updateViewStateSize(view));
			}

			return TPromise.join(toCreate.map(view => view.create()))
				.then(() => this.onViewsUpdated())
				.then(() => this._resizePanels())
				.then(() => toCreate);
		}

		return TPromise.as([]);
	}

	private updateAllViewsSizes(): void {
		for (const view of this.viewsViewletPanels) {
			let viewState = this.updateViewStateSize(view);
			this.viewsStates.set(view.id, viewState);
		}
	}

	private _resizePanels(): void {
		if (!this.didLayout) {
			return;
		}

		for (const panel of this.viewsViewletPanels) {
			const viewState = this.viewsStates.get(panel.id);
			const size = (viewState && viewState.size) || 200;
			this.resizePanel(panel, size);
		}
	}

	movePanel(from: ViewletPanel, to: ViewletPanel): void {
		const fromIndex = firstIndex(this.viewsViewletPanels, panel => panel === from);
		const toIndex = firstIndex(this.viewsViewletPanels, panel => panel === to);

		if (fromIndex < 0 || fromIndex >= this.viewsViewletPanels.length) {
			return;
		}

		if (toIndex < 0 || toIndex >= this.viewsViewletPanels.length) {
			return;
		}

		super.movePanel(from, to);

		const [panel] = this.viewsViewletPanels.splice(fromIndex, 1);
		this.viewsViewletPanels.splice(toIndex, 0, panel);

		for (let order = 0; order < this.viewsViewletPanels.length; order++) {
			const view = this.viewsStates.get(this.viewsViewletPanels[order].id);

			if (!view) {
				continue;
			}

			view.order = order;
		}
	}

	private isCurrentlyVisible(viewDescriptor: IViewDescriptor): boolean {
		return !!this.getView(viewDescriptor.id);
	}

	private canBeVisible(viewDescriptor: IViewDescriptor): boolean {
		const viewstate = this.viewsStates.get(viewDescriptor.id);
		if (viewDescriptor.canToggleVisibility && viewstate && viewstate.isHidden) {
			return false;
		}
		return this.contextKeyService.contextMatchesRules(viewDescriptor.when);
	}

	private onViewsUpdated(): TPromise<void> {
		this.viewHeaderContextMenuListeners = dispose(this.viewHeaderContextMenuListeners);

		for (const viewDescriptor of this.getViewDescriptorsFromRegistry()) {
			const view = this.getView(viewDescriptor.id);

			if (view) {
				this.viewHeaderContextMenuListeners.push(DOM.addDisposableListener(view.draggableElement, DOM.EventType.CONTEXT_MENU, e => {
					e.stopPropagation();
					e.preventDefault();
					if (viewDescriptor.canToggleVisibility) {
						this.onContextMenu(new StandardMouseEvent(e), view);
					}
				}));
			}
		}

		return this.setVisible(this.isVisible());
	}

	private updateHeaders(): void {
		if (this.viewsViewletPanels.length) {
			this.updateTitleArea();
			this.updateViewHeaders();
		}
	}

	private onContextMenu(event: StandardMouseEvent, view: ViewsViewletPanel): void {
		event.stopPropagation();
		event.preventDefault();

		let anchor: { x: number, y: number } = { x: event.posx, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => TPromise.as([<IAction>{
				id: `${view.id}.removeView`,
				label: nls.localize('hideView', "Hide from Side Bar"),
				enabled: true,
				run: () => this.toggleViewVisibility(view.id)
			}]),
		});
	}

	protected isSingleView(): boolean {
		if (!this.showHeaderInTitleWhenSingleView) {
			return false;
		}
		if (this.getViewDescriptorsFromRegistry().length === 0) {
			return false;
		}
		if (this.length > 1) {
			return false;
		}
		// Check in cache so that view do not jump. See #29609
		if (ViewLocation.getContributedViewLocation(this.location.id) && !this.areExtensionsReady) {
			let visibleViewsCount = 0;
			this.viewsStates.forEach((viewState, id) => {
				if (!viewState.isHidden) {
					visibleViewsCount++;
				}
			});
			return visibleViewsCount === 1;
		}
		return super.isSingleView();
	}

	protected getViewDescriptorsFromRegistry(defaultOrder: boolean = false): IViewDescriptor[] {
		return ViewsRegistry.getViews(this.location)
			.sort((a, b) => {
				const viewStateA = this.viewsStates.get(a.id);
				const viewStateB = this.viewsStates.get(b.id);
				const orderA = !defaultOrder && viewStateA ? viewStateA.order : a.order;
				const orderB = !defaultOrder && viewStateB ? viewStateB.order : b.order;

				if (orderB === void 0 || orderB === null) {
					return -1;
				}
				if (orderA === void 0 || orderA === null) {
					return 1;
				}

				return orderA - orderB;
			});
	}

	protected createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): ViewsViewletPanel {
		return this.instantiationService.createInstance(viewDescriptor.ctor, options);
	}

	protected get views(): ViewsViewletPanel[] {
		return this.viewsViewletPanels;
	}

	protected getView(id: string): ViewsViewletPanel {
		return this.viewsViewletPanels.filter(view => view.id === id)[0];
	}

	private updateViewStateSize(view: ViewsViewletPanel): IViewState {
		const currentState = this.viewsStates.get(view.id);
		const newViewState = this.createViewState(view);
		return currentState ? { ...currentState, collapsed: newViewState.collapsed, size: newViewState.size } : newViewState;
	}

	protected createViewState(view: ViewsViewletPanel): IViewState {
		return {
			collapsed: !view.isExpanded(),
			size: this.getPanelSize(view),
			isHidden: false,
			order: this.viewsViewletPanels.indexOf(view)
		};
	}
}

export class PersistentViewsViewlet extends ViewsViewlet {

	constructor(
		id: string,
		location: ViewLocation,
		private viewletStateStorageId: string,
		showHeaderInTitleWhenSingleView: boolean,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService
	) {
		super(id, location, showHeaderInTitleWhenSingleView, telemetryService, storageService, instantiationService, themeService, contextKeyService, contextMenuService, extensionService);
	}

	create(parent: Builder): TPromise<void> {
		this.loadViewsStates();
		return super.create(parent);
	}

	shutdown(): void {
		this.saveViewsStates();
		super.shutdown();
	}

	protected saveViewsStates(): void {
		const viewsStates = {};
		const registeredViewDescriptors = this.getViewDescriptorsFromRegistry();
		this.viewsStates.forEach((viewState, id) => {
			const view = this.getView(id);

			if (view) {
				viewsStates[id] = this.createViewState(view);
			} else {
				const viewDescriptor = registeredViewDescriptors.filter(v => v.id === id)[0];
				if (viewDescriptor) {
					viewsStates[id] = viewState;
				}
			}
		});

		this.storageService.store(this.viewletStateStorageId, JSON.stringify(viewsStates), this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? StorageScope.WORKSPACE : StorageScope.GLOBAL);
	}

	protected loadViewsStates(): void {
		const viewsStates = JSON.parse(this.storageService.get(this.viewletStateStorageId, this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? StorageScope.WORKSPACE : StorageScope.GLOBAL, '{}'));
		Object.keys(viewsStates).forEach(id => this.viewsStates.set(id, <IViewState>viewsStates[id]));
	}
}
