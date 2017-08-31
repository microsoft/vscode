/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IThemable, attachStyler } from 'vs/platform/theme/common/styler';
import * as errors from 'vs/base/common/errors';
import * as DOM from 'vs/base/browser/dom';
import { $, Dimension, Builder } from 'vs/base/browser/builder';
import { Scope } from 'vs/workbench/common/memento';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { IActionItem, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { Registry } from 'vs/platform/registry/common/platform';
import { prepareActions } from 'vs/workbench/browser/actions';
import { Viewlet, ViewletRegistry, Extensions } from 'vs/workbench/browser/viewlet';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { DelayedDragHandler } from 'vs/base/browser/dnd';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { AbstractCollapsibleView, CollapsibleState, IView as IBaseView, SplitView, ViewSizing } from 'vs/base/browser/ui/splitview/splitview';
import { ViewsRegistry, ViewLocation, IViewDescriptor } from 'vs/workbench/parts/views/browser/viewsRegistry';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { SIDE_BAR_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_SECTION_HEADER_FOREGROUND, SIDE_BAR_SECTION_HEADER_BACKGROUND } from 'vs/workbench/common/theme';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';

export interface IViewOptions {

	id: string;

	name: string;

	actionRunner: IActionRunner;

	collapsed: boolean;

}

export interface IViewConstructorSignature {

	new(initialSize: number, options: IViewOptions, ...services: { _serviceBrand: any; }[]): IView;

}

export interface IView extends IBaseView, IThemable {

	id: string;

	name: string;

	getHeaderElement(): HTMLElement;

	create(): TPromise<void>;

	setVisible(visible: boolean): TPromise<void>;

	isVisible(): boolean;

	getActions(): IAction[];

	getSecondaryActions(): IAction[];

	getActionItem(action: IAction): IActionItem;

	getActionsContext(): any;

	showHeader(): boolean;

	hideHeader(): boolean;

	focusBody(): void;

	isExpanded(): boolean;

	expand(): void;

	collapse(): void;

	getOptimalWidth(): number;

	shutdown(): void;
}

export interface ICollapsibleViewOptions extends IViewOptions {

	ariaHeaderLabel?: string;

	sizing: ViewSizing;

	initialBodySize?: number;

}

export abstract class CollapsibleView extends AbstractCollapsibleView implements IView {

	readonly id: string;
	readonly name: string;

	protected treeContainer: HTMLElement;
	protected tree: ITree;
	protected toDispose: IDisposable[];
	protected toolBar: ToolBar;
	protected actionRunner: IActionRunner;
	protected isDisposed: boolean;

	private _isVisible: boolean;

	private dragHandler: DelayedDragHandler;

	constructor(
		initialSize: number,
		options: ICollapsibleViewOptions,
		protected keybindingService: IKeybindingService,
		protected contextMenuService: IContextMenuService
	) {
		super(initialSize, {
			ariaHeaderLabel: options.ariaHeaderLabel,
			sizing: options.sizing,
			bodySize: options.initialBodySize ? options.initialBodySize : 4 * 22,
			initialState: options.collapsed ? CollapsibleState.COLLAPSED : CollapsibleState.EXPANDED,
		});

		this.id = options.id;
		this.name = options.name;
		this.actionRunner = options.actionRunner;
		this.toDispose = [];
	}

	protected changeState(state: CollapsibleState): void {
		this.updateTreeVisibility(this.tree, state === CollapsibleState.EXPANDED);

		super.changeState(state);
	}

	get draggableLabel(): string { return this.name; }

	public create(): TPromise<void> {
		return TPromise.as(null);
	}

	getHeaderElement(): HTMLElement {
		return this.header;
	}

	public renderHeader(container: HTMLElement): void {

		// Tool bar
		this.toolBar = new ToolBar($('div.actions').appendTo(container).getHTMLElement(), this.contextMenuService, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionItemProvider: (action) => this.getActionItem(action),
			ariaLabel: nls.localize('viewToolbarAriaLabel', "{0} actions", this.name),
			getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id)
		});
		this.toolBar.actionRunner = this.actionRunner;
		this.updateActions();

		// Expand on drag over
		this.dragHandler = new DelayedDragHandler(container, () => {
			if (!this.isExpanded()) {
				this.expand();
			}
		});
	}

	protected updateActions(): void {
		this.toolBar.setActions(prepareActions(this.getActions()), prepareActions(this.getSecondaryActions()))();
		this.toolBar.context = this.getActionsContext();
	}

	protected renderViewTree(container: HTMLElement): HTMLElement {
		const treeContainer = document.createElement('div');
		container.appendChild(treeContainer);

		return treeContainer;
	}

	public getViewer(): ITree {
		return this.tree;
	}

	public isVisible(): boolean {
		return this._isVisible;
	}

	public setVisible(visible: boolean): TPromise<void> {
		if (this._isVisible !== visible) {
			this._isVisible = visible;
			this.updateTreeVisibility(this.tree, visible && this.state === CollapsibleState.EXPANDED);
		}

		return TPromise.as(null);
	}

	public focusBody(): void {
		this.focusTree();
	}

	protected reveal(element: any, relativeTop?: number): TPromise<void> {
		if (!this.tree) {
			return TPromise.as(null); // return early if viewlet has not yet been created
		}

		return this.tree.reveal(element, relativeTop);
	}

	public layoutBody(size: number): void {
		if (this.tree) {
			this.treeContainer.style.height = size + 'px';
			this.tree.layout(size);
		}
	}

	public getActions(): IAction[] {
		return [];
	}

	public getSecondaryActions(): IAction[] {
		return [];
	}

	public getActionItem(action: IAction): IActionItem {
		return null;
	}

	public getActionsContext(): any {
		return undefined;
	}

	public shutdown(): void {
		// Subclass to implement
	}

	public getOptimalWidth(): number {
		return 0;
	}

	public dispose(): void {
		this.isDisposed = true;
		this.treeContainer = null;

		if (this.tree) {
			this.tree.dispose();
		}

		if (this.dragHandler) {
			this.dragHandler.dispose();
		}

		this.toDispose = dispose(this.toDispose);

		if (this.toolBar) {
			this.toolBar.dispose();
		}

		super.dispose();
	}

	private updateTreeVisibility(tree: ITree, isVisible: boolean): void {
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

export class ViewsViewlet extends Viewlet {

	protected viewletContainer: HTMLElement;
	protected lastFocusedView: IView;

	private splitView: SplitView;
	private viewHeaderContextMenuListeners: IDisposable[] = [];
	protected dimension: Dimension;
	private viewletSettings: object;

	private readonly viewsContextKeys: Set<string> = new Set<string>();
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
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService
	) {
		super(id, telemetryService, themeService);

		this.viewletSettings = this.getMemento(storageService, Scope.WORKSPACE);

		this._register(ViewsRegistry.onViewsRegistered(this.onViewsRegistered, this));
		this._register(ViewsRegistry.onViewsDeregistered(this.onViewsDeregistered, this));
		this._register(contextKeyService.onDidChangeContext(keys => this.onContextChanged(keys)));

		extensionService.onReady().then(() => {
			this.areExtensionsReady = true;
			this.onViewsUpdated();
		});
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.viewletContainer = DOM.append(parent.getHTMLElement(), DOM.$(''));
		this.splitView = this._register(new SplitView(this.viewletContainer, { canChangeOrderByDragAndDrop: true }));
		this.attachSplitViewStyler(this.splitView);
		this._register(this.splitView.onFocus((view: IView) => this.lastFocusedView = view));
		this._register(this.splitView.onDidOrderChange(() => {
			const views = this.splitView.getViews<IView>();
			for (let order = 0; order < views.length; order++) {
				this.viewsStates.get(views[order].id).order = order;
			}
		}));

		return this.onViewsRegistered(ViewsRegistry.getViews(this.location))
			.then(() => {
				this.lastFocusedView = this.splitView.getViews<IView>()[0];
				this.focus();
			});
	}

	public getTitle(): string {
		let title = Registry.as<ViewletRegistry>(Extensions.Viewlets).getViewlet(this.getId()).name;
		if (this.showHeaderInTitleArea() && this.splitView.getViews<IView>()[0]) {
			title += ': ' + this.splitView.getViews<IView>()[0].name;
		}
		return title;
	}

	public getActions(): IAction[] {
		if (this.showHeaderInTitleArea() && this.splitView.getViews<IView>()[0]) {
			return this.splitView.getViews<IView>()[0].getActions();
		}
		return [];
	}

	public getSecondaryActions(): IAction[] {
		if (this.showHeaderInTitleArea() && this.splitView.getViews<IView>()[0]) {
			return this.splitView.getViews<IView>()[0].getSecondaryActions();
		}
		return [];
	}

	public getContextMenuActions(): IAction[] {
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

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible)
			.then(() => TPromise.join(this.splitView.getViews<IView>().filter(view => view.isVisible() !== visible)
				.map((view) => view.setVisible(visible))))
			.then(() => void 0);
	}

	public focus(): void {
		super.focus();

		if (this.lastFocusedView) {
			this.lastFocusedView.focus();
		} else if (this.views.length > 0) {
			this.views[0].focus();
		}
	}

	public layout(dimension: Dimension): void {
		this.dimension = dimension;
		this.layoutViews();
	}

	public getOptimalWidth(): number {
		const additionalMargin = 16;
		const optimalWidth = Math.max(...this.splitView.getViews<IView>().map(view => view.getOptimalWidth() || 0));
		return optimalWidth + additionalMargin;
	}

	public shutdown(): void {
		this.splitView.getViews<IView>().forEach((view) => view.shutdown());
		super.shutdown();
	}

	private layoutViews(): void {
		if (this.splitView) {
			this.splitView.layout(this.dimension.height);
			for (const view of this.splitView.getViews<IView>()) {
				let viewState = this.updateViewStateSize(view);
				this.viewsStates.set(view.id, viewState);
			}
		}
	}

	private toggleViewVisibility(id: string): void {
		const view = this.getView(id);
		let viewState = this.viewsStates.get(id);
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

	private onViewsRegistered(views: IViewDescriptor[]): TPromise<IView[]> {
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

	private onViewsDeregistered(views: IViewDescriptor[]): TPromise<IView[]> {
		return this.updateViews(views);
	}

	private onContextChanged(keys: string[]): void {
		if (!keys) {
			return;
		}

		let hasToUpdate: boolean = false;
		for (const key of keys) {
			if (this.viewsContextKeys.has(key)) {
				hasToUpdate = true;
				break;
			}
		}

		if (hasToUpdate) {
			this.updateViews();
		}
	}

	protected updateViews(unregisteredViews: IViewDescriptor[] = []): TPromise<IView[]> {
		if (this.splitView) {

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

			}, [[], [], unregisteredViews]);

			const toCreate = [];

			if (toAdd.length || toRemove.length) {
				for (const view of this.splitView.getViews<IView>()) {
					let viewState = this.viewsStates.get(view.id);
					if (!viewState || typeof viewState.size === 'undefined' || view.size !== viewState.size || !view.isExpanded() !== viewState.collapsed) {
						viewState = this.updateViewStateSize(view);
						this.viewsStates.set(view.id, viewState);
					}
				}
				if (toRemove.length) {
					for (const viewDescriptor of toRemove) {
						let view = this.getView(viewDescriptor.id);
						this.splitView.removeView(view);
						if (this.lastFocusedView === view) {
							this.lastFocusedView = null;
						}
					}
				}

				for (const viewDescriptor of toAdd) {
					let viewState = this.viewsStates.get(viewDescriptor.id);
					let index = visible.indexOf(viewDescriptor);
					const view = this.createView(viewDescriptor,
						viewState ? viewState.size : this.getDefaultViewSize(),
						{
							id: viewDescriptor.id,
							name: viewDescriptor.name,
							actionRunner: this.getActionRunner(),
							collapsed: viewState ? viewState.collapsed : void 0,
							viewletSettings: this.viewletSettings
						});
					toCreate.push(view);

					this.attachViewStyler(view);
					this.splitView.addView(view, viewState && viewState.size ? Math.max(viewState.size, 1) : viewDescriptor.size, index);
				}

				return TPromise.join(toCreate.map(view => view.create()))
					.then(() => this.onViewsUpdated())
					.then(() => toCreate);
			}
		}
		return TPromise.as([]);
	}

	protected getDefaultViewSize(): number | undefined {
		return undefined;
	}

	private attachViewStyler(widget: IThemable, options?: { noContrastBorder?: boolean }): IDisposable {
		return attachStyler(this.themeService, {
			headerForeground: SIDE_BAR_SECTION_HEADER_FOREGROUND,
			headerBackground: SIDE_BAR_SECTION_HEADER_BACKGROUND,
			headerHighContrastBorder: (options && options.noContrastBorder) ? null : contrastBorder
		}, widget);
	}

	private attachSplitViewStyler(widget: IThemable): IDisposable {
		return attachStyler(this.themeService, {
			dropBackground: SIDE_BAR_DRAG_AND_DROP_BACKGROUND
		}, widget);
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
		if (!this.splitView) {
			return TPromise.as(null);
		}

		if (this.showHeaderInTitleArea()) {
			if (this.splitView.getViews<IView>()[0]) {
				this.splitView.getViews<IView>()[0].hideHeader();
				if (!this.splitView.getViews<IView>()[0].isExpanded()) {
					this.splitView.getViews<IView>()[0].expand();
				}
			}
		} else {
			for (const view of this.splitView.getViews<IView>()) {
				view.showHeader();
			}
		}

		// Update title area since the title actions have changed.
		this.updateTitleArea();

		this.viewHeaderContextMenuListeners = dispose(this.viewHeaderContextMenuListeners);
		for (const viewDescriptor of this.getViewDescriptorsFromRegistry()) {
			const view = this.getView(viewDescriptor.id);
			if (view) {
				this.viewHeaderContextMenuListeners.push(DOM.addDisposableListener(view.getHeaderElement(), DOM.EventType.CONTEXT_MENU, e => {
					e.stopPropagation();
					e.preventDefault();
					if (viewDescriptor.canToggleVisibility) {
						this.onContextMenu(new StandardMouseEvent(e), view);
					}
				}));
			}
		}

		if (this.dimension) {
			this.layoutViews();
		}

		return this.setVisible(this.isVisible());
	}

	private onContextMenu(event: StandardMouseEvent, view: IView): void {
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

	protected showHeaderInTitleArea(): boolean {
		if (!this.showHeaderInTitleWhenSingleView) {
			return false;
		}
		if (this.splitView.getViews<IView>().length > 1) {
			return false;
		}
		if (ViewLocation.getContributedViewLocation(this.location.id) && !this.areExtensionsReady) {
			// Checks in cache so that view do not jump. See #29609
			let visibleViewsCount = 0;
			const viewDecriptors = this.getViewDescriptorsFromRegistry();
			this.viewsStates.forEach((viewState, id) => {
				const viewDescriptor = viewDecriptors.filter(viewDescriptor => viewDescriptor.id === id)[0];
				const isHidden = viewState.isHidden || (viewDescriptor && !this.contextKeyService.contextMatchesRules(viewDescriptor.when));
				if (!isHidden) {
					visibleViewsCount++;
				}
			});
			return visibleViewsCount === 1;
		}
		return true;
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

	protected createView(viewDescriptor: IViewDescriptor, initialSize: number, options: IViewletViewOptions): IView {
		return this.instantiationService.createInstance(viewDescriptor.ctor, initialSize, options);
	}

	protected get views(): IView[] {
		return this.splitView ? this.splitView.getViews<IView>() : [];
	}

	protected getView(id: string): IView {
		return this.splitView.getViews<IView>().filter(view => view.id === id)[0];
	}

	private updateViewStateSize(view: IView): IViewState {
		const currentState = this.viewsStates.get(view.id);
		const newViewState = this.createViewState(view);
		return currentState ? { ...currentState, collapsed: newViewState.collapsed, size: newViewState.size } : newViewState;
	}

	protected createViewState(view: IView): IViewState {
		const collapsed = !view.isExpanded();
		const size = collapsed && view instanceof CollapsibleView ? view.previousSize : view.size;
		return {
			collapsed,
			size: size && size > 0 ? size : void 0,
			isHidden: false,
			order: this.splitView.getViews<IView>().indexOf(view)
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
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService
	) {
		super(id, location, showHeaderInTitleWhenSingleView, telemetryService, storageService, instantiationService, themeService, contextService, contextKeyService, contextMenuService, extensionService);
		this.loadViewsStates();
	}

	shutdown(): void {
		this.saveViewsStates();
		super.shutdown();
	}

	private saveViewsStates(): void {
		const viewsStates = {};
		const registeredViewDescriptors = this.getViewDescriptorsFromRegistry();
		this.viewsStates.forEach((viewState, id) => {
			const view = this.getView(id);
			if (view) {
				viewState = this.createViewState(view);
				viewsStates[id] = { size: viewState.size, collapsed: viewState.collapsed, isHidden: viewState.isHidden, order: viewState.order };
			} else {
				const viewDescriptor = registeredViewDescriptors.filter(v => v.id === id)[0];
				if (viewDescriptor) {
					viewsStates[id] = viewState;
				}
			}
		});

		this.storageService.store(this.viewletStateStorageId, JSON.stringify(viewsStates), this.contextService.hasWorkspace() ? StorageScope.WORKSPACE : StorageScope.GLOBAL);
	}

	private loadViewsStates(): void {
		const viewsStates = JSON.parse(this.storageService.get(this.viewletStateStorageId, this.contextService.hasWorkspace() ? StorageScope.WORKSPACE : StorageScope.GLOBAL, '{}'));
		Object.keys(viewsStates).forEach(id => this.viewsStates.set(id, <IViewState>viewsStates[id]));
	}
}