/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/paneviewlet';
import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { ColorIdentifier } from 'vs/platform/theme/common/colorRegistry';
import { attachStyler, IColorMapping } from 'vs/platform/theme/common/styler';
import { SIDE_BAR_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_SECTION_HEADER_FOREGROUND, SIDE_BAR_SECTION_HEADER_BACKGROUND, SIDE_BAR_SECTION_HEADER_BORDER, PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { append, $, trackFocus, toggleClass, EventType, isAncestor, Dimension, addDisposableListener } from 'vs/base/browser/dom';
import { IDisposable, combinedDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { firstIndex } from 'vs/base/common/arrays';
import { IAction, IActionRunner, ActionRunner } from 'vs/base/common/actions';
import { IActionViewItem, ActionsOrientation, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { Registry } from 'vs/platform/registry/common/platform';
import { prepareActions } from 'vs/workbench/browser/actions';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { PaneView, IPaneViewOptions, IPaneOptions, Pane, DefaultPaneDndController } from 'vs/base/browser/ui/splitview/paneview';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { Extensions as ViewContainerExtensions, IView, FocusedViewContext, IViewContainersRegistry, IViewDescriptor, ViewContainer, IViewDescriptorService, ViewContainerLocation, IViewPaneContainer } from 'vs/workbench/common/views';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { assertIsDefined } from 'vs/base/common/types';
import { PersistentContributableViewsModel, IAddedViewDescriptorRef, IViewDescriptorRef } from 'vs/workbench/browser/parts/views/views';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Component } from 'vs/workbench/common/component';
import { MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ContextAwareMenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { ViewMenuActions } from 'vs/workbench/browser/parts/views/viewMenuActions';

export interface IPaneColors extends IColorMapping {
	dropBackground?: ColorIdentifier;
	headerForeground?: ColorIdentifier;
	headerBackground?: ColorIdentifier;
	headerBorder?: ColorIdentifier;
}

export interface IViewPaneOptions extends IPaneOptions {
	actionRunner?: IActionRunner;
	id: string;
	title: string;
	showActionsAlways?: boolean;
	titleMenuId?: MenuId;
}

export abstract class ViewPane extends Pane implements IView {

	private static readonly AlwaysShowActionsConfig = 'workbench.view.alwaysShowHeaderActions';

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur: Event<void> = this._onDidBlur.event;

	private _onDidChangeBodyVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeBodyVisibility: Event<boolean> = this._onDidChangeBodyVisibility.event;

	protected _onDidChangeTitleArea = this._register(new Emitter<void>());
	readonly onDidChangeTitleArea: Event<void> = this._onDidChangeTitleArea.event;

	private focusedViewContextKey: IContextKey<string>;

	private _isVisible: boolean = false;
	readonly id: string;
	title: string;

	private readonly menuActions: ViewMenuActions;

	protected actionRunner?: IActionRunner;
	protected toolbar?: ToolBar;
	private readonly showActionsAlways: boolean = false;
	private headerContainer?: HTMLElement;
	private titleContainer?: HTMLElement;
	protected twistiesContainer?: HTMLElement;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService protected viewDescriptorService: IViewDescriptorService,
		@IInstantiationService protected instantiationService: IInstantiationService,
	) {
		super(options);

		this.id = options.id;
		this.title = options.title;
		this.actionRunner = options.actionRunner;
		this.showActionsAlways = !!options.showActionsAlways;
		this.focusedViewContextKey = FocusedViewContext.bindTo(contextKeyService);

		this.menuActions = this._register(instantiationService.createInstance(ViewMenuActions, this.id, options.titleMenuId || MenuId.ViewTitle, MenuId.ViewTitleContext));
		this._register(this.menuActions.onDidChangeTitle(() => this.updateActions()));
	}

	setVisible(visible: boolean): void {
		if (this._isVisible !== visible) {
			this._isVisible = visible;

			if (this.isExpanded()) {
				this._onDidChangeBodyVisibility.fire(visible);
			}
		}
	}

	isVisible(): boolean {
		return this._isVisible;
	}

	isBodyVisible(): boolean {
		return this._isVisible && this.isExpanded();
	}

	setExpanded(expanded: boolean): boolean {
		const changed = super.setExpanded(expanded);
		if (changed) {
			this._onDidChangeBodyVisibility.fire(expanded);
		}

		return changed;
	}

	render(): void {
		super.render();

		const focusTracker = trackFocus(this.element);
		this._register(focusTracker);
		this._register(focusTracker.onDidFocus(() => {
			this.focusedViewContextKey.set(this.id);
			this._onDidFocus.fire();
		}));
		this._register(focusTracker.onDidBlur(() => {
			this.focusedViewContextKey.reset();
			this._onDidBlur.fire();
		}));
	}

	protected renderHeader(container: HTMLElement): void {
		this.headerContainer = container;

		this.renderTwisties(container);

		this.renderHeaderTitle(container, this.title);

		const actions = append(container, $('.actions'));
		toggleClass(actions, 'show', this.showActionsAlways);
		this.toolbar = new ToolBar(actions, this.contextMenuService, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionViewItemProvider: action => this.getActionViewItem(action),
			ariaLabel: nls.localize('viewToolbarAriaLabel', "{0} actions", this.title),
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			actionRunner: this.actionRunner
		});

		this._register(this.toolbar);
		this.setActions();

		const onDidRelevantConfigurationChange = Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ViewPane.AlwaysShowActionsConfig));
		this._register(onDidRelevantConfigurationChange(this.updateActionsVisibility, this));
		this.updateActionsVisibility();
	}

	protected renderTwisties(container: HTMLElement): void {
		this.twistiesContainer = append(container, $('.twisties.codicon.codicon-chevron-right'));
	}

	protected renderHeaderTitle(container: HTMLElement, title: string): void {
		this.titleContainer = append(container, $('h3.title', undefined, title));
	}

	protected updateTitle(title: string): void {
		if (this.titleContainer) {
			this.titleContainer.textContent = title;
		}
		this.title = title;
		this._onDidChangeTitleArea.fire();
	}

	protected getProgressLocation(): string {
		return this.viewDescriptorService.getViewContainer(this.id)!.id;
	}

	protected getBackgroundColor(): string {
		return this.viewDescriptorService.getViewLocation(this.id) === ViewContainerLocation.Panel ? PANEL_BACKGROUND : SIDE_BAR_BACKGROUND;
	}

	focus(): void {
		if (this.element) {
			this.element.focus();
			this._onDidFocus.fire();
		}
	}

	private setActions(): void {
		if (this.toolbar) {
			this.toolbar.setActions(prepareActions(this.getActions()), prepareActions(this.getSecondaryActions()))();
			this.toolbar.context = this.getActionsContext();
		}
	}

	private updateActionsVisibility(): void {
		if (!this.headerContainer) {
			return;
		}
		const shouldAlwaysShowActions = this.configurationService.getValue<boolean>('workbench.view.alwaysShowHeaderActions');
		toggleClass(this.headerContainer, 'actions-always-visible', shouldAlwaysShowActions);
	}

	protected updateActions(): void {
		this.setActions();
		this._onDidChangeTitleArea.fire();
	}

	getActions(): IAction[] {
		return this.menuActions ? this.menuActions.getPrimaryActions() : [];
	}

	getSecondaryActions(): IAction[] {
		return this.menuActions ? this.menuActions.getSecondaryActions() : [];
	}

	getContextMenuActions(): IAction[] {
		return this.menuActions ? this.menuActions.getContextMenuActions() : [];
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action instanceof MenuItemAction) {
			return this.instantiationService.createInstance(ContextAwareMenuEntryActionViewItem, action);
		}
		return undefined;
	}

	getActionsContext(): unknown {
		return undefined;
	}

	getOptimalWidth(): number {
		return 0;
	}

	saveState(): void {
		// Subclasses to implement for saving state
	}
}

export interface IViewPaneContainerOptions extends IPaneViewOptions {
	mergeViewWithContainerWhenSingleView: boolean;
	donotShowContainerTitleWhenMergedWithContainer?: boolean;
}

interface IViewPaneItem {
	pane: ViewPane;
	disposable: IDisposable;
}

export class ViewPaneContainer extends Component implements IViewPaneContainer {

	readonly viewContainer: ViewContainer;
	private lastFocusedPane: ViewPane | undefined;
	private paneItems: IViewPaneItem[] = [];
	private paneview?: PaneView;

	private visible: boolean = false;

	private areExtensionsReady: boolean = false;

	private didLayout = false;
	private dimension: Dimension | undefined;

	protected actionRunner: IActionRunner | undefined;

	private readonly visibleViewsCountFromCache: number | undefined;
	private readonly visibleViewsStorageId: string;
	protected readonly viewsModel: PersistentContributableViewsModel;
	private viewDisposables: IDisposable[] = [];

	private readonly _onTitleAreaUpdate: Emitter<void> = this._register(new Emitter<void>());
	readonly onTitleAreaUpdate: Event<void> = this._onTitleAreaUpdate.event;

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;


	get onDidSashChange(): Event<number> {
		return assertIsDefined(this.paneview).onDidSashChange;
	}

	protected get panes(): ViewPane[] {
		return this.paneItems.map(i => i.pane);
	}

	protected get length(): number {
		return this.paneItems.length;
	}

	constructor(
		id: string,
		viewPaneContainerStateStorageId: string,
		private options: IViewPaneContainerOptions,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IWorkbenchLayoutService protected layoutService: IWorkbenchLayoutService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@ITelemetryService protected telemetryService: ITelemetryService,
		@IExtensionService protected extensionService: IExtensionService,
		@IThemeService protected themeService: IThemeService,
		@IStorageService protected storageService: IStorageService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IViewDescriptorService protected viewDescriptorService: IViewDescriptorService
	) {

		super(id, themeService, storageService);

		const container = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).get(id);
		if (!container) {
			throw new Error('Could not find container');
		}

		// Use default pane dnd controller if not specified
		if (!this.options.dnd) {
			this.options.dnd = new DefaultPaneDndController();
		}

		this.viewContainer = container;
		this.visibleViewsStorageId = `${id}.numberOfVisibleViews`;
		this.visibleViewsCountFromCache = this.storageService.getNumber(this.visibleViewsStorageId, StorageScope.WORKSPACE, undefined);
		this._register(toDisposable(() => this.viewDisposables = dispose(this.viewDisposables)));
		this.viewsModel = this._register(this.instantiationService.createInstance(PersistentContributableViewsModel, container, viewPaneContainerStateStorageId));
	}

	create(parent: HTMLElement): void {
		this.paneview = this._register(new PaneView(parent, this.options));
		this._register(this.paneview.onDidDrop(({ from, to }) => this.movePane(from as ViewPane, to as ViewPane)));
		this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, (e: MouseEvent) => this.showContextMenu(new StandardMouseEvent(e))));

		this._register(this.onDidSashChange(() => this.saveViewSizes()));
		this.viewsModel.onDidAdd(added => this.onDidAddViews(added));
		this.viewsModel.onDidRemove(removed => this.onDidRemoveViews(removed));
		const addedViews: IAddedViewDescriptorRef[] = this.viewsModel.visibleViewDescriptors.map((viewDescriptor, index) => {
			const size = this.viewsModel.getSize(viewDescriptor.id);
			const collapsed = this.viewsModel.isCollapsed(viewDescriptor.id);
			return ({ viewDescriptor, index, size, collapsed });
		});
		if (addedViews.length) {
			this.onDidAddViews(addedViews);
		}

		// Update headers after and title contributed views after available, since we read from cache in the beginning to know if the viewlet has single view or not. Ref #29609
		this.extensionService.whenInstalledExtensionsRegistered().then(() => {
			this.areExtensionsReady = true;
			if (this.panes.length) {
				this.updateTitleArea();
				this.updateViewHeaders();
			}
		});
	}

	getTitle(): string {
		if (this.isViewMergedWithContainer()) {
			const paneItemTitle = this.paneItems[0].pane.title;
			if (this.options.donotShowContainerTitleWhenMergedWithContainer || this.viewContainer.name === paneItemTitle) {
				return this.paneItems[0].pane.title;
			}
			return paneItemTitle ? `${this.viewContainer.name}: ${paneItemTitle}` : this.viewContainer.name;
		}

		return this.viewContainer.name;
	}

	private showContextMenu(event: StandardMouseEvent): void {
		for (const paneItem of this.paneItems) {
			// Do not show context menu if target is coming from inside pane views
			if (isAncestor(event.target, paneItem.pane.element)) {
				return;
			}
		}

		event.stopPropagation();
		event.preventDefault();

		let anchor: { x: number, y: number; } = { x: event.posx, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.getContextMenuActions()
		});
	}

	getContextMenuActions(viewDescriptor?: IViewDescriptor): IAction[] {
		const result: IAction[] = [];

		if (!viewDescriptor && this.isViewMergedWithContainer()) {
			viewDescriptor = this.viewDescriptorService.getViewDescriptor(this.panes[0].id) || undefined;
		}

		if (viewDescriptor) {
			result.push(<IAction>{
				id: `${viewDescriptor.id}.removeView`,
				label: nls.localize('hideView', "Hide"),
				enabled: viewDescriptor.canToggleVisibility,
				run: () => this.toggleViewVisibility(viewDescriptor!.id)
			});
			const view = this.getView(viewDescriptor.id);
			if (view) {
				result.push(...view.getContextMenuActions());
			}
		}

		const viewToggleActions = this.viewsModel.viewDescriptors.map(viewDescriptor => (<IAction>{
			id: `${viewDescriptor.id}.toggleVisibility`,
			label: viewDescriptor.name,
			checked: this.viewsModel.isVisible(viewDescriptor.id),
			enabled: viewDescriptor.canToggleVisibility,
			run: () => this.toggleViewVisibility(viewDescriptor.id)
		}));

		if (result.length && viewToggleActions.length) {
			result.push(new Separator());
		}

		result.push(...viewToggleActions);

		return result;
	}

	getActions(): IAction[] {
		if (this.isViewMergedWithContainer()) {
			return this.paneItems[0].pane.getActions();
		}

		return [];
	}

	getSecondaryActions(): IAction[] {
		if (this.isViewMergedWithContainer()) {
			return this.paneItems[0].pane.getSecondaryActions();
		}

		return [];
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (this.isViewMergedWithContainer()) {
			return this.paneItems[0].pane.getActionViewItem(action);
		}

		return undefined;
	}

	focus(): void {
		if (this.lastFocusedPane) {
			this.lastFocusedPane.focus();
		} else if (this.paneItems.length > 0) {
			for (const { pane: pane } of this.paneItems) {
				if (pane.isExpanded()) {
					pane.focus();
					return;
				}
			}
		}
	}

	layout(dimension: Dimension): void {
		if (this.paneview) {
			this.paneview.layout(dimension.height, dimension.width);
		}

		this.dimension = dimension;
		if (this.didLayout) {
			this.saveViewSizes();
		} else {
			this.didLayout = true;
			this.restoreViewSizes();
		}
	}

	getOptimalWidth(): number {
		const additionalMargin = 16;
		const optimalWidth = Math.max(...this.panes.map(view => view.getOptimalWidth() || 0));
		return optimalWidth + additionalMargin;
	}

	addPanes(panes: { pane: ViewPane, size: number, index?: number; }[]): void {
		const wasMerged = this.isViewMergedWithContainer();

		for (const { pane: pane, size, index } of panes) {
			this.addPane(pane, size, index);
		}

		this.updateViewHeaders();
		if (this.isViewMergedWithContainer() !== wasMerged) {
			this.updateTitleArea();
		}
	}

	setVisible(visible: boolean): void {
		if (this.visible !== !!visible) {
			this.visible = visible;

			this._onDidChangeVisibility.fire(visible);
		}

		this.panes.filter(view => view.isVisible() !== visible)
			.map((view) => view.setVisible(visible));
	}

	isVisible(): boolean {
		return this.visible;
	}

	protected updateTitleArea(): void {
		this._onTitleAreaUpdate.fire();

	}

	protected createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): ViewPane {
		return (this.instantiationService as any).createInstance(viewDescriptor.ctorDescriptor.ctor, ...(viewDescriptor.ctorDescriptor.staticArguments || []), options) as ViewPane;
	}

	getView(id: string): ViewPane | undefined {
		return this.panes.filter(view => view.id === id)[0];
	}

	private saveViewSizes(): void {
		// Save size only when the layout has happened
		if (this.didLayout) {
			for (const view of this.panes) {
				this.viewsModel.setSize(view.id, this.getPaneSize(view));
			}
		}
	}

	private restoreViewSizes(): void {
		// Restore sizes only when the layout has happened
		if (this.didLayout) {
			let initialSizes;
			for (let i = 0; i < this.viewsModel.visibleViewDescriptors.length; i++) {
				const pane = this.panes[i];
				const viewDescriptor = this.viewsModel.visibleViewDescriptors[i];
				const size = this.viewsModel.getSize(viewDescriptor.id);

				if (typeof size === 'number') {
					this.resizePane(pane, size);
				} else {
					initialSizes = initialSizes ? initialSizes : this.computeInitialSizes();
					this.resizePane(pane, initialSizes.get(pane.id) || 200);
				}
			}
		}
	}

	private computeInitialSizes(): Map<string, number> {
		const sizes: Map<string, number> = new Map<string, number>();
		if (this.dimension) {
			const totalWeight = this.viewsModel.visibleViewDescriptors.reduce((totalWeight, { weight }) => totalWeight + (weight || 20), 0);
			for (const viewDescriptor of this.viewsModel.visibleViewDescriptors) {
				sizes.set(viewDescriptor.id, this.dimension.height * (viewDescriptor.weight || 20) / totalWeight);
			}
		}
		return sizes;
	}

	saveState(): void {
		this.panes.forEach((view) => view.saveState());
		this.storageService.store(this.visibleViewsStorageId, this.length, StorageScope.WORKSPACE);
	}

	private onContextMenu(event: StandardMouseEvent, viewDescriptor: IViewDescriptor): void {
		event.stopPropagation();
		event.preventDefault();

		const actions: IAction[] = this.getContextMenuActions(viewDescriptor);

		let anchor: { x: number, y: number } = { x: event.posx, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions
		});
	}

	openView(id: string, focus?: boolean): IView {
		if (focus) {
			this.focus();
		}
		let view = this.getView(id);
		if (!view) {
			this.toggleViewVisibility(id);
		}
		view = this.getView(id)!;
		view.setExpanded(true);
		if (focus) {
			view.focus();
		}
		return view;
	}

	protected onDidAddViews(added: IAddedViewDescriptorRef[]): ViewPane[] {
		const panesToAdd: { pane: ViewPane, size: number, index: number }[] = [];

		for (const { viewDescriptor, collapsed, index, size } of added) {
			const pane = this.createView(viewDescriptor,
				{
					id: viewDescriptor.id,
					title: viewDescriptor.name,
					actionRunner: this.getActionRunner(),
					expanded: !collapsed,
					minimumBodySize: this.viewDescriptorService.getViewContainerLocation(this.viewContainer) === ViewContainerLocation.Panel ? 0 : 120
				});

			pane.render();
			const contextMenuDisposable = addDisposableListener(pane.draggableElement, 'contextmenu', e => {
				e.stopPropagation();
				e.preventDefault();
				this.onContextMenu(new StandardMouseEvent(e), viewDescriptor);
			});

			const collapseDisposable = Event.latch(Event.map(pane.onDidChange, () => !pane.isExpanded()))(collapsed => {
				this.viewsModel.setCollapsed(viewDescriptor.id, collapsed);
			});

			this.viewDisposables.splice(index, 0, combinedDisposable(contextMenuDisposable, collapseDisposable));
			panesToAdd.push({ pane, size: size || pane.minimumSize, index });
		}

		this.addPanes(panesToAdd);
		this.restoreViewSizes();

		const panes: ViewPane[] = [];
		for (const { pane } of panesToAdd) {
			pane.setVisible(this.isVisible());
			panes.push(pane);
		}
		return panes;
	}

	getActionRunner(): IActionRunner {
		if (!this.actionRunner) {
			this.actionRunner = new ActionRunner();
		}

		return this.actionRunner;
	}

	private onDidRemoveViews(removed: IViewDescriptorRef[]): void {
		removed = removed.sort((a, b) => b.index - a.index);
		const panesToRemove: ViewPane[] = [];
		for (const { index } of removed) {
			const [disposable] = this.viewDisposables.splice(index, 1);
			disposable.dispose();
			panesToRemove.push(this.panes[index]);
		}
		this.removePanes(panesToRemove);
		dispose(panesToRemove);
	}

	protected toggleViewVisibility(viewId: string): void {
		const visible = !this.viewsModel.isVisible(viewId);
		type ViewsToggleVisibilityClassification = {
			viewId: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			visible: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
		};
		this.telemetryService.publicLog2<{ viewId: String, visible: boolean }, ViewsToggleVisibilityClassification>('views.toggleVisibility', { viewId, visible });
		this.viewsModel.setVisible(viewId, visible);
	}

	private addPane(pane: ViewPane, size: number, index = this.paneItems.length - 1): void {
		const onDidFocus = pane.onDidFocus(() => this.lastFocusedPane = pane);
		const onDidChangeTitleArea = pane.onDidChangeTitleArea(() => {
			if (this.isViewMergedWithContainer()) {
				this.updateTitleArea();
			}
		});
		const onDidChange = pane.onDidChange(() => {
			if (pane === this.lastFocusedPane && !pane.isExpanded()) {
				this.lastFocusedPane = undefined;
			}
		});

		// TODO@sbatten Styling is viewlet specific, must fix
		const paneStyler = attachStyler<IPaneColors>(this.themeService, {
			headerForeground: SIDE_BAR_SECTION_HEADER_FOREGROUND,
			headerBackground: SIDE_BAR_SECTION_HEADER_BACKGROUND,
			headerBorder: SIDE_BAR_SECTION_HEADER_BORDER,
			dropBackground: SIDE_BAR_DRAG_AND_DROP_BACKGROUND
		}, pane);
		const disposable = combinedDisposable(onDidFocus, onDidChangeTitleArea, paneStyler, onDidChange);
		const paneItem: IViewPaneItem = { pane: pane, disposable };

		this.paneItems.splice(index, 0, paneItem);
		assertIsDefined(this.paneview).addPane(pane, size, index);
	}

	removePanes(panes: ViewPane[]): void {
		const wasMerged = this.isViewMergedWithContainer();

		panes.forEach(pane => this.removePane(pane));

		this.updateViewHeaders();
		if (wasMerged !== this.isViewMergedWithContainer()) {
			this.updateTitleArea();
		}
	}

	private removePane(pane: ViewPane): void {
		const index = firstIndex(this.paneItems, i => i.pane === pane);

		if (index === -1) {
			return;
		}

		if (this.lastFocusedPane === pane) {
			this.lastFocusedPane = undefined;
		}

		assertIsDefined(this.paneview).removePane(pane);
		const [paneItem] = this.paneItems.splice(index, 1);
		paneItem.disposable.dispose();

	}

	movePane(from: ViewPane, to: ViewPane): void {
		const fromIndex = firstIndex(this.paneItems, item => item.pane === from);
		const toIndex = firstIndex(this.paneItems, item => item.pane === to);

		const fromViewDescriptor = this.viewsModel.visibleViewDescriptors[fromIndex];
		const toViewDescriptor = this.viewsModel.visibleViewDescriptors[toIndex];

		if (fromIndex < 0 || fromIndex >= this.paneItems.length) {
			return;
		}

		if (toIndex < 0 || toIndex >= this.paneItems.length) {
			return;
		}

		const [paneItem] = this.paneItems.splice(fromIndex, 1);
		this.paneItems.splice(toIndex, 0, paneItem);

		assertIsDefined(this.paneview).movePane(from, to);

		this.viewsModel.move(fromViewDescriptor.id, toViewDescriptor.id);
	}

	resizePane(pane: ViewPane, size: number): void {
		assertIsDefined(this.paneview).resizePane(pane, size);
	}

	getPaneSize(pane: ViewPane): number {
		return assertIsDefined(this.paneview).getPaneSize(pane);
	}

	private updateViewHeaders(): void {
		if (this.isViewMergedWithContainer()) {
			this.paneItems[0].pane.setExpanded(true);
			this.paneItems[0].pane.headerVisible = false;
		} else {
			this.paneItems.forEach(i => i.pane.headerVisible = true);
		}
	}

	private isViewMergedWithContainer(): boolean {
		if (!(this.options.mergeViewWithContainerWhenSingleView && this.paneItems.length === 1)) {
			return false;
		}
		if (!this.areExtensionsReady) {
			if (this.visibleViewsCountFromCache === undefined) {
				return false;
			}
			// Check in cache so that view do not jump. See #29609
			return this.visibleViewsCountFromCache === 1;
		}
		return true;
	}

	dispose(): void {
		super.dispose();
		this.paneItems.forEach(i => i.disposable.dispose());
		if (this.paneview) {
			this.paneview.dispose();
		}
	}
}
