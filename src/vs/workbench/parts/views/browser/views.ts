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
import { IActionItem, ActionsOrientation, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { Registry } from 'vs/platform/registry/common/platform';
import { prepareActions } from 'vs/workbench/browser/actions';
import { Viewlet, ViewletRegistry, Extensions } from 'vs/workbench/browser/viewlet';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { DelayedDragHandler } from 'vs/base/browser/dnd';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
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
import { SIDE_BAR_SECTION_HEADER_FOREGROUND, SIDE_BAR_SECTION_HEADER_BACKGROUND } from "vs/workbench/common/theme";
import { contrastBorder } from "vs/platform/theme/common/colorRegistry";

export interface IViewOptions {

	id: string;

	name: string;

	actionRunner: IActionRunner;

	collapsed: boolean;

}

export interface IViewConstructorSignature {

	new (options: IViewOptions, ...services: { _serviceBrand: any; }[]): IView;

}

export interface IView extends IBaseView, IThemable {

	id: string;

	name: string;

	create(): TPromise<void>;

	setVisible(visible: boolean): TPromise<void>;

	isVisible(): boolean;

	getActions(): IAction[];

	getSecondaryActions(): IAction[];

	getActionItem(action: IAction): IActionItem;

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
		options: ICollapsibleViewOptions,
		protected keybindingService: IKeybindingService,
		protected contextMenuService: IContextMenuService
	) {
		super({
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

	public create(): TPromise<void> {
		return TPromise.as(null);
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

interface IViewState {

	collapsed: boolean;

	size: number;

	isHidden: boolean;

}

export class ComposedViewsViewlet extends Viewlet {

	protected viewletContainer: HTMLElement;
	protected lastFocusedView: IView;

	private splitView: SplitView;
	protected views: IView[];
	private dimension: Dimension;
	private viewletSettings: object;

	private readonly viewsContextKeys: Set<string> = new Set<string>();
	private readonly viewsStates: Map<string, IViewState>;

	constructor(
		id: string,
		private location: ViewLocation,
		private viewletStateStorageId: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService protected storageService: IStorageService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		super(id, telemetryService, themeService);

		this.views = [];
		this.viewletSettings = this.getMemento(storageService, Scope.WORKSPACE);
		this.viewsStates = this.loadViewsStates();

		this._register(ViewsRegistry.onViewsRegistered(() => this.onViewDescriptorsChanged()));
		this._register(ViewsRegistry.onViewsDeregistered(() => this.onViewDescriptorsChanged()));
		this._register(contextKeyService.onDidChangeContext(keys => this.onContextChanged(keys)));
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.viewletContainer = DOM.append(parent.getHTMLElement(), DOM.$(''));
		this.splitView = this._register(new SplitView(this.viewletContainer));
		this._register(this.splitView.onFocus((view: IView) => this.lastFocusedView = view));
		this._register(DOM.addDisposableListener(this.viewletContainer, 'contextmenu', e => this.onContextMenu(new StandardMouseEvent(e))));

		return this.onViewDescriptorsChanged()
			.then(() => {
				this.lastFocusedView = this.views[0];
				this.focus();
			});
	}

	public getTitle(): string {
		let title = Registry.as<ViewletRegistry>(Extensions.Viewlets).getViewlet(this.getId()).name;
		if (this.views.length === 1) {
			title += ': ' + this.views[0].name;
		}
		return title;
	}

	public getActions(): IAction[] {
		if (this.views.length === 1) {
			return this.views[0].getActions();
		}
		return [];
	}

	public getSecondaryActions(): IAction[] {
		let actions = [];
		if (this.views.length === 1) {
			actions = this.views[0].getSecondaryActions();
		}

		if (actions.length) {
			actions.push(new Separator());
		}

		actions.push(...this.getToggleVisibilityActions(this.getViewDescriptorsFromRegistry()));

		return actions;
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible)
			.then(() => TPromise.join(this.views.filter(view => view.isVisible() !== visible)
				.map((view) => view.setVisible(visible))))
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
		this.layoutViews();
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

	private layoutViews(): void {
		this.splitView.layout(this.dimension.height);
		for (const view of this.views) {
			let viewState = this.createViewState(view);
			this.viewsStates.set(view.id, viewState);
		}
	}

	private onContextMenu(event: StandardMouseEvent): void {
		let anchor: { x: number, y: number } = { x: event.posx, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => TPromise.as(this.getSecondaryActions()),
		});
	}

	private getToggleVisibilityActions(viewDescriptors: IViewDescriptor[]): IAction[] {
		// return viewDescriptors.map(viewDescriptor => (<IAction>{
		// 	id: `${viewDescriptor.id}.toggleVisibility`,
		// 	label: viewDescriptor.name,
		// 	checked: this.isCurrentlyVisible(viewDescriptor),
		// 	enabled: this.contextKeyService.contextMatchesRules(viewDescriptor.when),
		// 	run: () => this.toggleViewVisibility(viewDescriptor)
		// }));
		return [];
	}

	protected toggleViewVisibility(viewDescriptor: IViewDescriptor): void {
		const view = this.getView(viewDescriptor.id);
		let viewState = this.viewsStates.get(viewDescriptor.id);
		if (view) {
			viewState = viewState || this.createViewState(view);
			viewState.isHidden = true;
		} else {
			viewState = viewState || { collapsed: true, size: void 0, isHidden: false };
			viewState.isHidden = false;
		}
		this.viewsStates.set(viewDescriptor.id, viewState);
		this.updateViews();
	}

	private onViewDescriptorsChanged(): TPromise<void> {
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

	protected updateViews(): TPromise<void> {
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

			}, [[], [], []]);

			const toCreate = [];

			if (toAdd.length || toRemove.length) {
				for (const view of this.views) {
					let viewState = this.viewsStates.get(view.id);
					if (!viewState || view.size !== viewState.size || !view.isExpanded() !== viewState.collapsed) {
						viewState = { ...this.createViewState(view), isHidden: viewState && viewState.isHidden };
						this.viewsStates.set(view.id, viewState);
						this.splitView.updateWeight(view, viewState.size);
					}
				}
				if (toRemove.length) {
					for (const viewDescriptor of toRemove) {
						let view = this.getView(viewDescriptor.id);
						this.views.splice(this.views.indexOf(view), 1);
						this.splitView.removeView(view);
						if (this.lastFocusedView === view) {
							this.lastFocusedView = null;
						}
					}
				}

				for (const viewDescriptor of toAdd) {
					let viewState = this.viewsStates.get(viewDescriptor.id);
					let index = visible.indexOf(viewDescriptor);
					const view = this.createView(viewDescriptor, {
						id: viewDescriptor.id,
						name: viewDescriptor.name,
						actionRunner: this.getActionRunner(),
						collapsed: viewState ? viewState.collapsed : void 0,
						viewletSettings: this.viewletSettings
					});
					toCreate.push(view);

					this.views.splice(index, 0, view);
					this.attachHeaderViewStyler(view, this.themeService);
					this.splitView.addView(view, viewState && viewState.size ? Math.max(viewState.size, 1) : viewDescriptor.size, index);
				}

				return TPromise.join(toCreate.map(view => view.create()))
					.then(() => this.onViewsUpdated());
			}
		}
		return TPromise.as(null);
	}

	private attachHeaderViewStyler(widget: IThemable, themeService: IThemeService, options?: { noContrastBorder?: boolean }): IDisposable {
		return attachStyler(themeService, {
			headerForeground: SIDE_BAR_SECTION_HEADER_FOREGROUND,
			headerBackground: SIDE_BAR_SECTION_HEADER_BACKGROUND,
			headerHighContrastBorder: (options && options.noContrastBorder) ? null : contrastBorder
		}, widget);
	}

	private isCurrentlyVisible(viewDescriptor: IViewDescriptor): boolean {
		return !!this.getView(viewDescriptor.id);
	}

	private canBeVisible(viewDescriptor: IViewDescriptor): boolean {
		const viewstate = this.viewsStates.get(viewDescriptor.id);
		if (viewstate && viewstate.isHidden) {
			return false;
		}
		return this.contextKeyService.contextMatchesRules(viewDescriptor.when);
	}

	private onViewsUpdated(): TPromise<void> {
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

		// Update title area since the title actions have changed.
		this.updateTitleArea();

		if (this.dimension) {
			this.layoutViews();
		}

		return this.setVisible(this.isVisible());
	}

	private getViewDescriptorsFromRegistry(): IViewDescriptor[] {
		return ViewsRegistry.getViews(this.location)
			.sort((a, b) => {
				if (b.order === void 0 || b.order === null) {
					return -1;
				}
				if (a.order === void 0 || a.order === null) {
					return 1;
				}
				return a.order - b.order;
			});
	}

	private saveViewsStates(): void {
		const viewsStates = {};
		this.viewsStates.forEach((viewState, id) => {
			const view = this.getView(id);
			viewState = view ? this.createViewState(view) : viewState;
			viewsStates[id] = { size: viewState.size, collapsed: viewState.collapsed, isHidden: viewState.isHidden };
		});

		this.storageService.store(this.viewletStateStorageId, JSON.stringify(viewsStates), this.contextService.hasWorkspace() ? StorageScope.WORKSPACE : StorageScope.GLOBAL);
	}

	private loadViewsStates(): Map<string, IViewState> {
		const viewsStates = JSON.parse(this.storageService.get(this.viewletStateStorageId, this.contextService.hasWorkspace() ? StorageScope.WORKSPACE : StorageScope.GLOBAL, '{}'));
		return Object.keys(viewsStates).reduce((result, id) => {
			const viewState = <IViewState>viewsStates[id];
			result.set(id, viewState);
			return result;
		}, new Map<string, IViewState>());
	}

	protected createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): IView {
		return this.instantiationService.createInstance(viewDescriptor.ctor, options);
	}

	protected getView(id: string): IView {
		return this.views.filter(view => view.id === id)[0];
	}

	private createViewState(view: IView): IViewState {
		const collapsed = !view.isExpanded();
		const size = collapsed && view instanceof CollapsibleView ? view.previousSize : view.size;
		return {
			collapsed,
			size: size && size > 0 ? size : void 0,
			isHidden: false
		};
	}
}