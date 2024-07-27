/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/paneCompositePart';
import { Event } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressIndicator } from 'vs/platform/progress/common/progress';
import { Extensions, PaneComposite, PaneCompositeDescriptor, PaneCompositeRegistry } from 'vs/workbench/browser/panecomposite';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { IView } from 'vs/base/browser/ui/grid/grid';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { CompositePart, ICompositeTitleLabel } from 'vs/workbench/browser/parts/compositePart';
import { IPaneCompositeBarOptions, PaneCompositeBar } from 'vs/workbench/browser/parts/paneCompositeBar';
import { Dimension, EventHelper, trackFocus, $, addDisposableListener, EventType, prepend, getWindow } from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IComposite } from 'vs/workbench/common/composite';
import { localize } from 'vs/nls';
import { CompositeDragAndDropObserver, toggleDropEffect } from 'vs/workbench/browser/dnd';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from 'vs/workbench/common/theme';
import { IPartOptions } from 'vs/workbench/browser/part';
import { CompositeMenuActions } from 'vs/workbench/browser/actions';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { ActionsOrientation, prepareActions } from 'vs/base/browser/ui/actionbar/actionbar';
import { Gesture, EventType as GestureEventType } from 'vs/base/browser/touch';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IAction, SubmenuAction } from 'vs/base/common/actions';
import { Composite } from 'vs/workbench/browser/composite';
import { ViewsSubMenu } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { HiddenItemStrategy, WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';

export enum CompositeBarPosition {
	TOP,
	TITLE,
	BOTTOM
}

export interface IPaneCompositePart extends IView {

	readonly partId: Parts.PANEL_PART | Parts.AUXILIARYBAR_PART | Parts.SIDEBAR_PART;

	readonly onDidPaneCompositeOpen: Event<IPaneComposite>;
	readonly onDidPaneCompositeClose: Event<IPaneComposite>;

	/**
	 * Opens a viewlet with the given identifier and pass keyboard focus to it if specified.
	 */
	openPaneComposite(id: string | undefined, focus?: boolean): Promise<IPaneComposite | undefined>;

	/**
	 * Returns the current active viewlet if any.
	 */
	getActivePaneComposite(): IPaneComposite | undefined;

	/**
	 * Returns the viewlet by id.
	 */
	getPaneComposite(id: string): PaneCompositeDescriptor | undefined;

	/**
	 * Returns all enabled viewlets
	 */
	getPaneComposites(): PaneCompositeDescriptor[];

	/**
	 * Returns the progress indicator for the side bar.
	 */
	getProgressIndicator(id: string): IProgressIndicator | undefined;

	/**
	 * Hide the active viewlet.
	 */
	hideActivePaneComposite(): void;

	/**
	 * Return the last active viewlet id.
	 */
	getLastActivePaneCompositeId(): string;

	/**
	 * Returns id of pinned view containers following the visual order.
	 */
	getPinnedPaneCompositeIds(): string[];

	/**
	 * Returns id of visible view containers following the visual order.
	 */
	getVisiblePaneCompositeIds(): string[];
}

export abstract class AbstractPaneCompositePart extends CompositePart<PaneComposite> implements IPaneCompositePart {

	private static readonly MIN_COMPOSITE_BAR_WIDTH = 50;

	get snap(): boolean {
		// Always allow snapping closed
		// Only allow dragging open if the panel contains view containers
		return this.layoutService.isVisible(this.partId) || !!this.paneCompositeBar.value?.getVisiblePaneCompositeIds().length;
	}

	get onDidPaneCompositeOpen(): Event<IPaneComposite> { return Event.map(this.onDidCompositeOpen.event, compositeEvent => <IPaneComposite>compositeEvent.composite); }
	readonly onDidPaneCompositeClose = this.onDidCompositeClose.event as Event<IPaneComposite>;

	private readonly location: ViewContainerLocation;
	private titleContainer: HTMLElement | undefined;
	private headerFooterCompositeBarContainer: HTMLElement | undefined;
	protected readonly headerFooterCompositeBarDispoables = this._register(new DisposableStore());
	private paneCompositeBarContainer: HTMLElement | undefined;
	private readonly paneCompositeBar = this._register(new MutableDisposable<PaneCompositeBar>());
	private compositeBarPosition: CompositeBarPosition | undefined = undefined;
	private emptyPaneMessageElement: HTMLElement | undefined;

	private globalToolBar: WorkbenchToolBar | undefined;
	private readonly globalActions: CompositeMenuActions;

	private blockOpening = false;
	protected contentDimension: Dimension | undefined;

	constructor(
		readonly partId: Parts.PANEL_PART | Parts.AUXILIARYBAR_PART | Parts.SIDEBAR_PART,
		partOptions: IPartOptions,
		activePaneCompositeSettingsKey: string,
		private readonly activePaneContextKey: IContextKey<string>,
		private paneFocusContextKey: IContextKey<boolean>,
		nameForTelemetry: string,
		compositeCSSClass: string,
		titleForegroundColor: string | undefined,
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IMenuService protected readonly menuService: IMenuService,
	) {
		let location = ViewContainerLocation.Sidebar;
		let registryId = Extensions.Viewlets;
		let globalActionsMenuId = MenuId.SidebarTitle;
		if (partId === Parts.PANEL_PART) {
			location = ViewContainerLocation.Panel;
			registryId = Extensions.Panels;
			globalActionsMenuId = MenuId.PanelTitle;
		} else if (partId === Parts.AUXILIARYBAR_PART) {
			location = ViewContainerLocation.AuxiliaryBar;
			registryId = Extensions.Auxiliary;
			globalActionsMenuId = MenuId.AuxiliaryBarTitle;
		}
		super(
			notificationService,
			storageService,
			contextMenuService,
			layoutService,
			keybindingService,
			hoverService,
			instantiationService,
			themeService,
			Registry.as<PaneCompositeRegistry>(registryId),
			activePaneCompositeSettingsKey,
			viewDescriptorService.getDefaultViewContainer(location)?.id || '',
			nameForTelemetry,
			compositeCSSClass,
			titleForegroundColor,
			partId,
			partOptions
		);

		this.location = location;
		this.globalActions = this._register(this.instantiationService.createInstance(CompositeMenuActions, globalActionsMenuId, undefined, undefined));

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.onDidPaneCompositeOpen(composite => this.onDidOpen(composite)));
		this._register(this.onDidPaneCompositeClose(this.onDidClose, this));
		this._register(this.globalActions.onDidChange(() => this.updateGlobalToolbarActions()));

		this._register(this.registry.onDidDeregister((viewletDescriptor: PaneCompositeDescriptor) => {

			const activeContainers = this.viewDescriptorService.getViewContainersByLocation(this.location)
				.filter(container => this.viewDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0);

			if (activeContainers.length) {
				if (this.getActiveComposite()?.getId() === viewletDescriptor.id) {
					const defaultViewletId = this.viewDescriptorService.getDefaultViewContainer(this.location)?.id;
					const containerToOpen = activeContainers.filter(c => c.id === defaultViewletId)[0] || activeContainers[0];
					this.doOpenPaneComposite(containerToOpen.id);
				}
			} else {
				this.layoutService.setPartHidden(true, this.partId);
			}

			this.removeComposite(viewletDescriptor.id);
		}));

		this._register(this.extensionService.onDidRegisterExtensions(() => {
			this.layoutCompositeBar();
		}));
	}

	private onDidOpen(composite: IComposite): void {
		this.activePaneContextKey.set(composite.getId());
	}

	private onDidClose(composite: IComposite): void {
		const id = composite.getId();
		if (this.activePaneContextKey.get() === id) {
			this.activePaneContextKey.reset();
		}
	}

	protected override showComposite(composite: Composite): void {
		super.showComposite(composite);
		this.layoutCompositeBar();
		this.layoutEmptyMessage();
	}

	protected override hideActiveComposite(): Composite | undefined {
		const composite = super.hideActiveComposite();
		this.layoutCompositeBar();
		this.layoutEmptyMessage();
		return composite;
	}

	override create(parent: HTMLElement): void {
		this.element = parent;
		this.element.classList.add('pane-composite-part');

		super.create(parent);

		const contentArea = this.getContentArea();
		if (contentArea) {
			this.createEmptyPaneMessage(contentArea);
		}

		this.updateCompositeBar();

		const focusTracker = this._register(trackFocus(parent));
		this._register(focusTracker.onDidFocus(() => this.paneFocusContextKey.set(true)));
		this._register(focusTracker.onDidBlur(() => this.paneFocusContextKey.set(false)));
	}

	private createEmptyPaneMessage(parent: HTMLElement): void {
		this.emptyPaneMessageElement = document.createElement('div');
		this.emptyPaneMessageElement.classList.add('empty-pane-message-area');

		const messageElement = document.createElement('div');
		messageElement.classList.add('empty-pane-message');
		messageElement.innerText = localize('pane.emptyMessage', "Drag a view here to display.");

		this.emptyPaneMessageElement.appendChild(messageElement);
		parent.appendChild(this.emptyPaneMessageElement);

		this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(this.emptyPaneMessageElement, {
			onDragOver: (e) => {
				EventHelper.stop(e.eventData, true);
				if (this.paneCompositeBar.value) {
					const validDropTarget = this.paneCompositeBar.value.dndHandler.onDragEnter(e.dragAndDropData, undefined, e.eventData);
					toggleDropEffect(e.eventData.dataTransfer, 'move', validDropTarget);
				}
			},
			onDragEnter: (e) => {
				EventHelper.stop(e.eventData, true);
				if (this.paneCompositeBar.value) {
					const validDropTarget = this.paneCompositeBar.value.dndHandler.onDragEnter(e.dragAndDropData, undefined, e.eventData);
					this.emptyPaneMessageElement!.style.backgroundColor = validDropTarget ? this.theme.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND)?.toString() || '' : '';
				}
			},
			onDragLeave: (e) => {
				EventHelper.stop(e.eventData, true);
				this.emptyPaneMessageElement!.style.backgroundColor = '';
			},
			onDragEnd: (e) => {
				EventHelper.stop(e.eventData, true);
				this.emptyPaneMessageElement!.style.backgroundColor = '';
			},
			onDrop: (e) => {
				EventHelper.stop(e.eventData, true);
				this.emptyPaneMessageElement!.style.backgroundColor = '';
				if (this.paneCompositeBar.value) {
					this.paneCompositeBar.value.dndHandler.drop(e.dragAndDropData, undefined, e.eventData);
				}
			},
		}));
	}

	protected override createTitleArea(parent: HTMLElement): HTMLElement {
		const titleArea = super.createTitleArea(parent);

		this._register(addDisposableListener(titleArea, EventType.CONTEXT_MENU, e => {
			this.onTitleAreaContextMenu(new StandardMouseEvent(getWindow(titleArea), e));
		}));
		this._register(Gesture.addTarget(titleArea));
		this._register(addDisposableListener(titleArea, GestureEventType.Contextmenu, e => {
			this.onTitleAreaContextMenu(new StandardMouseEvent(getWindow(titleArea), e));
		}));

		const globalTitleActionsContainer = titleArea.appendChild($('.global-actions'));

		// Global Actions Toolbar
		this.globalToolBar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, globalTitleActionsContainer, {
			actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
			orientation: ActionsOrientation.HORIZONTAL,
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			anchorAlignmentProvider: () => this.getTitleAreaDropDownAnchorAlignment(),
			toggleMenuTitle: localize('moreActions', "More Actions..."),
			hoverDelegate: this.toolbarHoverDelegate,
			hiddenItemStrategy: HiddenItemStrategy.NoHide
		}));

		this.updateGlobalToolbarActions();

		return titleArea;
	}

	protected override createTitleLabel(parent: HTMLElement): ICompositeTitleLabel {
		this.titleContainer = parent;

		const titleLabel = super.createTitleLabel(parent);
		this.titleLabelElement!.draggable = true;
		const draggedItemProvider = (): { type: 'view' | 'composite'; id: string } => {
			const activeViewlet = this.getActivePaneComposite()!;
			return { type: 'composite', id: activeViewlet.getId() };
		};
		this._register(CompositeDragAndDropObserver.INSTANCE.registerDraggable(this.titleLabelElement!, draggedItemProvider, {}));

		return titleLabel;
	}

	protected updateCompositeBar(): void {
		const wasCompositeBarVisible = this.compositeBarPosition !== undefined;
		const isCompositeBarVisible = this.shouldShowCompositeBar();
		const previousPosition = this.compositeBarPosition;
		const newPosition = isCompositeBarVisible ? this.getCompositeBarPosition() : undefined;

		// Only update if the visibility or position has changed
		if (previousPosition === newPosition) {
			return;
		}

		// Remove old composite bar
		if (wasCompositeBarVisible) {
			const previousCompositeBarContainer = previousPosition === CompositeBarPosition.TITLE ? this.titleContainer : this.headerFooterCompositeBarContainer;
			if (!this.paneCompositeBarContainer || !this.paneCompositeBar.value || !previousCompositeBarContainer) {
				throw new Error('Composite bar containers should exist when removing the previous composite bar');
			}

			this.paneCompositeBarContainer.remove();
			this.paneCompositeBarContainer = undefined;
			this.paneCompositeBar.value = undefined;

			previousCompositeBarContainer.classList.remove('has-composite-bar');

			if (previousPosition === CompositeBarPosition.TOP) {
				this.removeFooterHeaderArea(true);
			} else if (previousPosition === CompositeBarPosition.BOTTOM) {
				this.removeFooterHeaderArea(false);
			}
		}

		// Create new composite bar
		let newCompositeBarContainer;
		switch (newPosition) {
			case CompositeBarPosition.TOP: newCompositeBarContainer = this.createHeaderArea(); break;
			case CompositeBarPosition.TITLE: newCompositeBarContainer = this.titleContainer; break;
			case CompositeBarPosition.BOTTOM: newCompositeBarContainer = this.createFooterArea(); break;
		}
		if (isCompositeBarVisible) {

			if (this.paneCompositeBarContainer || this.paneCompositeBar.value || !newCompositeBarContainer) {
				throw new Error('Invalid composite bar state when creating the new composite bar');
			}

			newCompositeBarContainer.classList.add('has-composite-bar');
			this.paneCompositeBarContainer = prepend(newCompositeBarContainer, $('.composite-bar-container'));
			this.paneCompositeBar.value = this.createCompositeBar();
			this.paneCompositeBar.value.create(this.paneCompositeBarContainer);

			if (newPosition === CompositeBarPosition.TOP) {
				this.setHeaderArea(newCompositeBarContainer);
			} else if (newPosition === CompositeBarPosition.BOTTOM) {
				this.setFooterArea(newCompositeBarContainer);
			}
		}

		this.compositeBarPosition = newPosition;
	}

	protected override createHeaderArea(): HTMLElement {
		const headerArea = super.createHeaderArea();
		return this.createHeaderFooterCompositeBarArea(headerArea);
	}

	protected override createFooterArea(): HTMLElement {
		const footerArea = super.createFooterArea();
		return this.createHeaderFooterCompositeBarArea(footerArea);
	}

	protected createHeaderFooterCompositeBarArea(area: HTMLElement): HTMLElement {
		if (this.headerFooterCompositeBarContainer) {
			// A pane composite part has either a header or a footer, but not both
			throw new Error('Header or Footer composite bar already exists');
		}
		this.headerFooterCompositeBarContainer = area;

		this.headerFooterCompositeBarDispoables.add(addDisposableListener(area, EventType.CONTEXT_MENU, e => {
			this.onCompositeBarAreaContextMenu(new StandardMouseEvent(getWindow(area), e));
		}));
		this.headerFooterCompositeBarDispoables.add(Gesture.addTarget(area));
		this.headerFooterCompositeBarDispoables.add(addDisposableListener(area, GestureEventType.Contextmenu, e => {
			this.onCompositeBarAreaContextMenu(new StandardMouseEvent(getWindow(area), e));
		}));

		return area;
	}

	private removeFooterHeaderArea(header: boolean): void {
		this.headerFooterCompositeBarContainer = undefined;
		this.headerFooterCompositeBarDispoables.clear();
		if (header) {
			this.removeHeaderArea();
		} else {
			this.removeFooterArea();
		}
	}

	protected createCompositeBar(): PaneCompositeBar {
		return this.instantiationService.createInstance(PaneCompositeBar, this.getCompositeBarOptions(), this.partId, this);
	}

	protected override onTitleAreaUpdate(compositeId: string): void {
		super.onTitleAreaUpdate(compositeId);

		// If title actions change, relayout the composite bar
		this.layoutCompositeBar();
	}

	async openPaneComposite(id?: string, focus?: boolean): Promise<PaneComposite | undefined> {
		if (typeof id === 'string' && this.getPaneComposite(id)) {
			return this.doOpenPaneComposite(id, focus);
		}

		await this.extensionService.whenInstalledExtensionsRegistered();

		if (typeof id === 'string' && this.getPaneComposite(id)) {
			return this.doOpenPaneComposite(id, focus);
		}

		return undefined;
	}

	private doOpenPaneComposite(id: string, focus?: boolean): PaneComposite | undefined {
		if (this.blockOpening) {
			return undefined; // Workaround against a potential race condition
		}

		if (!this.layoutService.isVisible(this.partId)) {
			try {
				this.blockOpening = true;
				this.layoutService.setPartHidden(false, this.partId);
			} finally {
				this.blockOpening = false;
			}
		}

		return this.openComposite(id, focus) as PaneComposite;
	}

	getPaneComposite(id: string): PaneCompositeDescriptor | undefined {
		return (this.registry as PaneCompositeRegistry).getPaneComposite(id);
	}

	getPaneComposites(): PaneCompositeDescriptor[] {
		return (this.registry as PaneCompositeRegistry).getPaneComposites()
			.sort((v1, v2) => {
				if (typeof v1.order !== 'number') {
					return 1;
				}

				if (typeof v2.order !== 'number') {
					return -1;
				}

				return v1.order - v2.order;
			});
	}

	getPinnedPaneCompositeIds(): string[] {
		return this.paneCompositeBar.value?.getPinnedPaneCompositeIds() ?? [];
	}

	getVisiblePaneCompositeIds(): string[] {
		return this.paneCompositeBar.value?.getVisiblePaneCompositeIds() ?? [];
	}

	getActivePaneComposite(): IPaneComposite | undefined {
		return <IPaneComposite>this.getActiveComposite();
	}

	getLastActivePaneCompositeId(): string {
		return this.getLastActiveCompositeId();
	}

	hideActivePaneComposite(): void {
		if (this.layoutService.isVisible(this.partId)) {
			this.layoutService.setPartHidden(true, this.partId);
		}

		this.hideActiveComposite();
	}

	protected focusCompositeBar(): void {
		this.paneCompositeBar.value?.focus();
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(this.partId)) {
			return;
		}

		this.contentDimension = new Dimension(width, height);

		// Layout contents
		super.layout(this.contentDimension.width, this.contentDimension.height, top, left);

		// Layout composite bar
		this.layoutCompositeBar();

		// Add empty pane message
		this.layoutEmptyMessage();
	}

	private layoutCompositeBar(): void {
		if (this.contentDimension && this.dimension && this.paneCompositeBar.value) {
			const padding = this.compositeBarPosition === CompositeBarPosition.TITLE ? 16 : 8;
			const borderWidth = this.partId === Parts.PANEL_PART ? 0 : 1;
			let availableWidth = this.contentDimension.width - padding - borderWidth;
			availableWidth = Math.max(AbstractPaneCompositePart.MIN_COMPOSITE_BAR_WIDTH, availableWidth - this.getToolbarWidth());
			this.paneCompositeBar.value.layout(availableWidth, this.dimension.height);
		}
	}

	private layoutEmptyMessage(): void {
		const visible = !this.getActiveComposite();
		this.emptyPaneMessageElement?.classList.toggle('visible', visible);
		if (visible) {
			this.titleLabel?.updateTitle('', '');
		}
	}

	private updateGlobalToolbarActions(): void {
		const primaryActions = this.globalActions.getPrimaryActions();
		const secondaryActions = this.globalActions.getSecondaryActions();
		this.globalToolBar?.setActions(prepareActions(primaryActions), prepareActions(secondaryActions));
	}

	protected getToolbarWidth(): number {
		if (!this.toolBar || this.compositeBarPosition !== CompositeBarPosition.TITLE) {
			return 0;
		}

		const activePane = this.getActivePaneComposite();
		if (!activePane) {
			return 0;
		}

		// Each toolbar item has 4px margin
		const toolBarWidth = this.toolBar.getItemsWidth() + this.toolBar.getItemsLength() * 4;
		const globalToolBarWidth = this.globalToolBar ? this.globalToolBar.getItemsWidth() + this.globalToolBar.getItemsLength() * 4 : 0;
		return toolBarWidth + globalToolBarWidth + 5; // 5px padding left
	}

	private onTitleAreaContextMenu(event: StandardMouseEvent): void {
		if (this.shouldShowCompositeBar() && this.getCompositeBarPosition() === CompositeBarPosition.TITLE) {
			return this.onCompositeBarContextMenu(event);
		} else {
			const activePaneComposite = this.getActivePaneComposite() as PaneComposite;
			const activePaneCompositeActions = activePaneComposite ? activePaneComposite.getContextMenuActions() : [];
			if (activePaneCompositeActions.length) {
				this.contextMenuService.showContextMenu({
					getAnchor: () => event,
					getActions: () => activePaneCompositeActions,
					getActionViewItem: (action, options) => this.actionViewItemProvider(action, options),
					actionRunner: activePaneComposite.getActionRunner(),
					skipTelemetry: true
				});
			}
		}
	}

	private onCompositeBarAreaContextMenu(event: StandardMouseEvent): void {
		return this.onCompositeBarContextMenu(event);
	}

	private onCompositeBarContextMenu(event: StandardMouseEvent): void {
		if (this.paneCompositeBar.value) {
			const actions: IAction[] = [...this.paneCompositeBar.value.getContextMenuActions()];
			if (actions.length) {
				this.contextMenuService.showContextMenu({
					getAnchor: () => event,
					getActions: () => actions,
					skipTelemetry: true
				});
			}
		}
	}

	protected getViewsSubmenuAction(): SubmenuAction | undefined {
		const viewPaneContainer = (this.getActivePaneComposite() as PaneComposite)?.getViewPaneContainer();
		if (viewPaneContainer) {
			const disposables = new DisposableStore();
			const viewsActions: IAction[] = [];
			const scopedContextKeyService = disposables.add(this.contextKeyService.createScoped(this.element));
			scopedContextKeyService.createKey('viewContainer', viewPaneContainer.viewContainer.id);
			const menu = this.menuService.getMenuActions(ViewsSubMenu, scopedContextKeyService, { shouldForwardArgs: true, renderShortTitle: true });
			createAndFillInActionBarActions(menu, { primary: viewsActions, secondary: [] }, () => true);
			disposables.dispose();
			return viewsActions.length > 1 && viewsActions.some(a => a.enabled) ? new SubmenuAction('views', localize('views', "Views"), viewsActions) : undefined;
		}
		return undefined;
	}

	protected abstract shouldShowCompositeBar(): boolean;
	protected abstract getCompositeBarOptions(): IPaneCompositeBarOptions;
	protected abstract getCompositeBarPosition(): CompositeBarPosition;

}
