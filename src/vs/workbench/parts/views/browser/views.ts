/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IThemable, attachHeaderViewStyler } from 'vs/platform/theme/common/styler';
import * as errors from 'vs/base/common/errors';
import * as DOM from 'vs/base/browser/dom';
import { $, Dimension, Builder } from 'vs/base/browser/builder';
import { Scope } from 'vs/workbench/common/memento';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { IActionItem, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { prepareActions } from 'vs/workbench/browser/actions';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { DelayedDragHandler } from 'vs/base/browser/dnd';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IMessageService } from 'vs/platform/message/common/message';
import { CollapsibleView, CollapsibleState, FixedCollapsibleView, IView, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { ViewsRegistry, ViewLocation, IViewDescriptor, IViewOptions } from 'vs/workbench/parts/views/browser/viewsRegistry';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

export interface IViewletViewOptions extends IViewOptions {
	viewletSettings: any;
}

export interface IViewletView extends IView, IThemable {
	id?: string;
	create(): TPromise<void>;
	setVisible(visible: boolean): TPromise<void>;
	getActions(): IAction[];
	getSecondaryActions(): IAction[];
	getActionItem(action: IAction): IActionItem;
	showHeader(): boolean;
	hideHeader(): boolean;
	shutdown(): void;
	focusBody(): void;
	isExpanded(): boolean;
	expand(): void;
	collapse(): void;
	getOptimalWidth(): number;
}

/**
 * The AdaptiveCollapsibleViewletView can grow with the content inside dynamically.
 */
export abstract class AdaptiveCollapsibleViewletView extends FixedCollapsibleView implements IViewletView {
	protected treeContainer: HTMLElement;
	protected tree: ITree;
	protected toDispose: IDisposable[];
	protected isVisible: boolean;
	protected toolBar: ToolBar;
	protected actionRunner: IActionRunner;
	protected isDisposed: boolean;

	private dragHandler: DelayedDragHandler;

	constructor(
		actionRunner: IActionRunner,
		initialBodySize: number,
		collapsed: boolean,
		private viewName: string,
		protected keybindingService: IKeybindingService,
		protected contextMenuService: IContextMenuService
	) {
		super({
			expandedBodySize: initialBodySize,
			initialState: collapsed ? CollapsibleState.COLLAPSED : CollapsibleState.EXPANDED,
			ariaHeaderLabel: viewName,
			headerSize: 22,
		});

		this.actionRunner = actionRunner;
		this.toDispose = [];
	}

	protected changeState(state: CollapsibleState): void {
		updateTreeVisibility(this.tree, state === CollapsibleState.EXPANDED);

		super.changeState(state);
	}

	public create(): TPromise<void> {
		return TPromise.as(null);
	}

	public renderHeader(container: HTMLElement): void {

		// Tool bar
		this.toolBar = new ToolBar($('div.actions').appendTo(container).getHTMLElement(), this.contextMenuService, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionItemProvider: (action) => this.getActionItem(action),
			ariaLabel: nls.localize('viewToolbarAriaLabel', "{0} actions", this.viewName),
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
	}

	protected renderViewTree(container: HTMLElement): HTMLElement {
		return renderViewTree(container);
	}

	public getViewer(): ITree {
		return this.tree;
	}

	public setVisible(visible: boolean): TPromise<void> {
		this.isVisible = visible;

		updateTreeVisibility(this.tree, visible && this.state === CollapsibleState.EXPANDED);

		return TPromise.as(null);
	}

	public focusBody(): void {
		focus(this.tree);
	}

	protected reveal(element: any, relativeTop?: number): TPromise<void> {
		return reveal(this.tree, element, relativeTop);
	}

	protected layoutBody(size: number): void {
		this.treeContainer.style.height = size + 'px';
		this.tree.layout(size);
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

	public shutdown(): void {
		// Subclass to implement
	}

	public getOptimalWidth(): number {
		return 0;
	}

	public dispose(): void {
		this.isDisposed = true;
		this.treeContainer = null;
		this.tree.dispose();

		this.dragHandler.dispose();

		this.toDispose = dispose(this.toDispose);

		if (this.toolBar) {
			this.toolBar.dispose();
		}

		super.dispose();
	}
}

export abstract class CollapsibleViewletView extends CollapsibleView implements IViewletView {
	protected treeContainer: HTMLElement;
	protected tree: ITree;
	protected toDispose: IDisposable[];
	protected isVisible: boolean;
	protected toolBar: ToolBar;
	protected actionRunner: IActionRunner;
	protected isDisposed: boolean;

	private dragHandler: DelayedDragHandler;

	constructor(
		actionRunner: IActionRunner,
		collapsed: boolean,
		private viewName: string,
		protected messageService: IMessageService,
		protected keybindingService: IKeybindingService,
		protected contextMenuService: IContextMenuService,
		headerSize?: number,
		minimumSize?: number
	) {
		super({
			minimumSize: minimumSize === void 0 ? 5 * 22 : minimumSize,
			initialState: collapsed ? CollapsibleState.COLLAPSED : CollapsibleState.EXPANDED,
			ariaHeaderLabel: viewName,
			headerSize
		});

		this.actionRunner = actionRunner;
		this.toDispose = [];
	}

	protected changeState(state: CollapsibleState): void {
		updateTreeVisibility(this.tree, state === CollapsibleState.EXPANDED);

		super.changeState(state);
	}

	public create(): TPromise<void> {
		return TPromise.as(null);
	}

	public renderHeader(container: HTMLElement): void {

		// Tool bar
		this.toolBar = new ToolBar($('div.actions').appendTo(container).getHTMLElement(), this.contextMenuService, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionItemProvider: (action) => this.getActionItem(action),
			ariaLabel: nls.localize('viewToolbarAriaLabel', "{0} actions", this.viewName),
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
	}

	protected renderViewTree(container: HTMLElement): HTMLElement {
		return renderViewTree(container);
	}

	public getViewer(): ITree {
		return this.tree;
	}

	public setVisible(visible: boolean): TPromise<void> {
		this.isVisible = visible;

		updateTreeVisibility(this.tree, visible && this.state === CollapsibleState.EXPANDED);

		return TPromise.as(null);
	}

	public focusBody(): void {
		focus(this.tree);
	}

	protected reveal(element: any, relativeTop?: number): TPromise<void> {
		return reveal(this.tree, element, relativeTop);
	}

	public layoutBody(size: number): void {
		this.treeContainer.style.height = size + 'px';
		this.tree.layout(size);
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

	public shutdown(): void {
		// Subclass to implement
	}

	public getOptimalWidth(): number {
		return 0;
	}

	public dispose(): void {
		this.isDisposed = true;
		this.treeContainer = null;
		this.tree.dispose();

		if (this.dragHandler) {
			this.dragHandler.dispose();
		}

		this.toDispose = dispose(this.toDispose);

		if (this.toolBar) {
			this.toolBar.dispose();
		}

		super.dispose();
	}
}

function updateTreeVisibility(tree: ITree, isVisible: boolean): void {
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

function focus(tree: ITree): void {
	if (!tree) {
		return; // return early if viewlet has not yet been created
	}

	// Make sure the current selected element is revealed
	const selection = tree.getSelection();
	if (selection.length > 0) {
		reveal(tree, selection[0], 0.5).done(null, errors.onUnexpectedError);
	}

	// Pass Focus to Viewer
	tree.DOMFocus();
}

function renderViewTree(container: HTMLElement): HTMLElement {
	const treeContainer = document.createElement('div');
	container.appendChild(treeContainer);

	return treeContainer;
}

function reveal(tree: ITree, element: any, relativeTop?: number): TPromise<void> {
	if (!tree) {
		return TPromise.as(null); // return early if viewlet has not yet been created
	}

	return tree.reveal(element, relativeTop);
}

export interface IViewState {
	collapsed: boolean;
	size: number;
}

export class ComposedViewsViewlet extends Viewlet {

	protected viewletContainer: HTMLElement;
	protected lastFocusedView: IViewletView;

	private splitView: SplitView;
	private views: IViewletView[];
	private dimension: Dimension;
	private viewletSettings: any;

	private readonly viewsStates: Map<string, IViewState>;

	constructor(
		id: string,
		private location: ViewLocation,
		private viewletStateStorageId: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService protected storageService: IStorageService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService
	) {
		super(id, telemetryService, themeService);

		this.views = [];
		this.viewletSettings = this.getMemento(storageService, Scope.WORKSPACE);
		this.viewsStates = this.loadViewsStates();

		this._register(ViewsRegistry.onViewsRegistered(viewDescriptors => this.createViews(viewDescriptors.filter(viewDescriptor => ViewLocation.Explorer === viewDescriptor.location))));
		this._register(ViewsRegistry.onViewsDeregistered(viewDescriptors => this.removeViews(viewDescriptors.filter(viewDescriptor => ViewLocation.Explorer === viewDescriptor.location))));
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.viewletContainer = DOM.append(parent.getHTMLElement(), DOM.$(''));
		this.splitView = this._register(new SplitView(this.viewletContainer));
		this._register(this.splitView.onFocus((view: IViewletView) => this.lastFocusedView = view));

		const views = ViewsRegistry.getViews(ViewLocation.Explorer);
		return this.createViews(views)
			.then(() => this.lastFocusedView = this.views[0])
			.then(() => this.setVisible(this.isVisible()))
			.then(() => this.focus());
	}

	public getActions(): IAction[] {
		if (this.views.length === 1) {
			return this.views[0].getActions();
		}
		return [];
	}

	public getSecondaryActions(): IAction[] {
		if (this.views.length === 1) {
			return this.views[0].getSecondaryActions();
		}
		return [];
	}

	private createViews(viewDescriptors: IViewDescriptor[]): TPromise<void> {
		if (!this.splitView || !viewDescriptors.length) {
			return TPromise.as(null);
		}

		const views = [];
		const sorted = ViewsRegistry.getViews(this.location).sort((a, b) => {
			if (b.order === void 0 || b.order === null) {
				return -1;
			}
			if (a.order === void 0 || a.order === null) {
				return 1;
			}
			return a.order - b.order;
		});
		for (const viewDescriptor of viewDescriptors) {
			let viewState = this.viewsStates.get(viewDescriptor.id);
			let index = sorted.indexOf(viewDescriptor);
			const view = this.createView(viewDescriptor, {
				name: viewDescriptor.name,
				actionRunner: this.getActionRunner(),
				collapsed: viewState ? viewState.collapsed : true,
				viewletSettings: this.viewletSettings
			});
			if (index !== -1) {
				this.views.splice(index, 0, view);
			} else {
				this.views.push(view);
			}
			views.push(view);
			attachHeaderViewStyler(view, this.themeService);
			this.splitView.addView(view, viewState ? viewState.size : void 0, index);
		}

		return TPromise.join(views.map(view => view.create()))
			.then(() => this.onViewsUpdated());
	}


	private removeViews(viewDescriptors: IViewDescriptor[]): void {
		if (!this.splitView || !viewDescriptors.length) {
			return;
		}

		for (const viewDescriptor of viewDescriptors) {
			let view = this.getView(viewDescriptor.id);
			if (view) {
				this.views.splice(this.views.indexOf(view), 1);
				this.splitView.removeView(view);
			}
		}

		this.onViewsUpdated();
	}

	private onViewsUpdated(): void {
		if (this.views.length === 1) {
			this.views[0].hideHeader();
			if (!this.views[0].isExpanded()) {
				this.views[0].expand();
			}
		} else {
			for (const view of this.views) {
				view.showHeader();
			}
		}

		if (this.dimension) {
			this.layout(this.dimension);
		}

		// Update title area since the title actions have changed.
		this.updateTitleArea();
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible)
			.then(() => TPromise.join(this.views.map((view) => view.setVisible(visible))))
			.then(() => void 0);
	}

	public focus(): void {
		super.focus();
		if (this.lastFocusedView) {
			this.lastFocusedView.focus();
		}
	}

	public layout(dimension: Dimension): void {
		this.dimension = dimension;
		this.splitView.layout(dimension.height);
	}

	public getOptimalWidth(): number {
		const additionalMargin = 16;
		const optimalWidth = Math.max(...this.views.map(view => view.getOptimalWidth() || 0));
		return optimalWidth + additionalMargin;
	}

	public shutdown(): void {
		this.saveViewsStates();
		this.views.forEach((view) => view.shutdown());
		super.shutdown();
	}

	protected saveViewsStates(): void {
		const viewletState = this.views.reduce((result, view) => {
			result[view.id] = {
				collapsed: !view.isExpanded(),
				size: view.size > 0 ? view.size : void 0
			};
			return result;
		}, {});
		this.storageService.store(this.viewletStateStorageId, JSON.stringify(viewletState), this.contextService.hasWorkspace() ? StorageScope.WORKSPACE : StorageScope.GLOBAL);
	}

	protected loadViewsStates(): Map<string, IViewState> {
		const viewsStates = JSON.parse(this.storageService.get(this.viewletStateStorageId, this.contextService.hasWorkspace() ? StorageScope.WORKSPACE : StorageScope.GLOBAL, '{}'));
		return Object.keys(viewsStates).reduce((result, id) => {
			result.set(id, viewsStates[id]);
			return result;
		}, new Map<string, IViewState>());
	}

	protected createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): IViewletView {
		return this.instantiationService.createInstance(viewDescriptor.ctor, viewDescriptor.id, options);
	}

	protected getView(id: string): IViewletView {
		return this.views.filter(view => view.id === id)[0];
	}
}