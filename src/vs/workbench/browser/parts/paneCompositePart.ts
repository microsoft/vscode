/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/paneCompositePart';
import { Event } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressIndicator } from 'vs/platform/progress/common/progress';
import { Extensions, PaneComposite, PaneCompositeDescriptor, PaneCompositeRegistry } from 'vs/workbench/browser/panecomposite';
// import { PanelPart } from 'vs/workbench/browser/parts/panel/panelPart';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IView } from 'vs/base/browser/ui/grid/grid';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { CompositePart, ICompositeTitleLabel } from 'vs/workbench/browser/parts/compositePart';
import { IPaneCompositeBarOptions, PaneCompositeBar } from 'vs/workbench/browser/parts/paneCompositeBar';
import { Dimension, EventHelper, clearNode, trackFocus, $, addDisposableListener, EventType } from 'vs/base/browser/dom';
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
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { CompositeMenuActions } from 'vs/workbench/browser/actions';
import { MenuId } from 'vs/platform/actions/common/actions';
import { ActionsOrientation, prepareActions } from 'vs/base/browser/ui/actionbar/actionbar';
import { Gesture, EventType as GestureEventType } from 'vs/base/browser/touch';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';

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

	/**
	 * Show activity on the view pane
	 */
	showActivity(id: string, badge: IBadge, clazz?: string, priority?: number): IDisposable;
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
	private titleDisposables = this._register(new DisposableStore());
	private titleContainer: HTMLElement | undefined;
	private paneTitleLabel: ICompositeTitleLabel | undefined;
	private paneCompositeBar = this._register(new MutableDisposable<PaneCompositeBar>());
	private emptyPaneMessageElement: HTMLElement | undefined;

	private globalToolBar: ToolBar | undefined;
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
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@IExtensionService private readonly extensionService: IExtensionService,
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

		this._register(this.registry.onDidDeregister(async (viewletDescriptor: PaneCompositeDescriptor) => {

			const activeContainers = this.viewDescriptorService.getViewContainersByLocation(this.location)
				.filter(container => this.viewDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0);

			if (activeContainers.length) {
				if (this.getActiveComposite()?.getId() === viewletDescriptor.id) {
					const defaultViewletId = this.viewDescriptorService.getDefaultViewContainer(this.location)?.id;
					const containerToOpen = activeContainers.filter(c => c.id === defaultViewletId)[0] || activeContainers[0];
					await this.openPaneComposite(containerToOpen.id);
				}
			} else {
				this.layoutService.setPartHidden(true, this.partId);
			}

			this.removeComposite(viewletDescriptor.id);
		}));
	}

	private onDidOpen(composite: IComposite): void {
		this.activePaneContextKey.set(composite.getId());
		this.layoutEmptyMessage();
	}

	private onDidClose(composite: IComposite): void {
		const id = composite.getId();
		if (this.activePaneContextKey.get() === id) {
			this.activePaneContextKey.reset();
		}
		this.layoutEmptyMessage();
	}

	override create(parent: HTMLElement): void {
		this.element = parent;
		this.element.classList.add('pane-composite-part');

		super.create(parent);

		const contentArea = this.getContentArea();
		if (contentArea) {
			this.createEmptyPaneMessage(contentArea);
		}

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
			this.onTitleAreaContextMenu(new StandardMouseEvent(e));
		}));
		this._register(Gesture.addTarget(titleArea));
		this._register(addDisposableListener(titleArea, GestureEventType.Contextmenu, e => {
			this.onTitleAreaContextMenu(new StandardMouseEvent(e));
		}));

		const globalTitleActionsContainer = titleArea.appendChild($('.global-actions'));

		// Global Actions Toolbar
		this.globalToolBar = this._register(new ToolBar(globalTitleActionsContainer, this.contextMenuService, {
			actionViewItemProvider: action => this.actionViewItemProvider(action),
			orientation: ActionsOrientation.HORIZONTAL,
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			anchorAlignmentProvider: () => this.getTitleAreaDropDownAnchorAlignment(),
			toggleMenuTitle: localize('moreActions', "More Actions...")
		}));

		this.updateGlobalToolbarActions();

		return titleArea;
	}

	protected override createTitleLabel(parent: HTMLElement): ICompositeTitleLabel {
		this.titleContainer = parent;
		this.updateTitleArea();
		return {
			updateTitle: (id, title, keybinding) => {
				if (!this.updateTitleArea() && this.paneTitleLabel) {
					this.paneTitleLabel.updateTitle(id, title, keybinding);
				}
			},
			updateStyles: () => this.paneTitleLabel?.updateStyles()
		};
	}

	protected updateTitleArea(): boolean {
		if (!this.titleContainer) {
			return false;
		}
		if (!this.paneCompositeBar.value && this.shouldShowCompositeBar()) {
			this.titleContainer.classList.add('composite-bar-container');
			this.titleDisposables.clear();
			this.titleLabelElement = undefined;
			clearNode(this.titleContainer);
			this.paneCompositeBar.value = this.createCompisteBar();
			const titleArea = this.paneCompositeBar.value.create(this.titleContainer);
			titleArea.classList.add('pane-composite-bar');
			return true;
		}
		if (!this.titleLabelElement && !this.shouldShowCompositeBar()) {
			this.paneCompositeBar.clear();
			this.titleDisposables.clear();
			clearNode(this.titleContainer);
			this.titleContainer.classList.remove('pane-composite-bar-container');
			this.paneTitleLabel = super.createTitleLabel(this.titleContainer);
			this.titleLabelElement!.draggable = true;
			const draggedItemProvider = (): { type: 'view' | 'composite'; id: string } => {
				const activeViewlet = this.getActivePaneComposite()!;
				return { type: 'composite', id: activeViewlet.getId() };
			};
			this.titleDisposables.add(CompositeDragAndDropObserver.INSTANCE.registerDraggable(this.titleLabelElement!, draggedItemProvider, {}));
			return false;
		}
		return false;
	}

	protected createCompisteBar(): PaneCompositeBar {
		return this.instantiationService.createInstance(PaneCompositeBar, this.getCompoisteBarOptions(), this.partId, this);
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

	showActivity(id: string, badge: IBadge, clazz?: string, priority?: number): IDisposable {
		return this.paneCompositeBar.value?.showActivity(id, badge, clazz, priority) ?? Disposable.None;
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
			let availableWidth = this.contentDimension.width - 40; // take padding into account
			if (this.toolBar) {
				availableWidth = Math.max(AbstractPaneCompositePart.MIN_COMPOSITE_BAR_WIDTH, availableWidth - this.getToolbarWidth());
			}
			this.paneCompositeBar.value.layout(availableWidth, this.dimension.height);
		}
	}

	private layoutEmptyMessage(): void {
		this.emptyPaneMessageElement?.classList.toggle('visible', !!this.paneCompositeBar.value && this.paneCompositeBar.value.getVisiblePaneCompositeIds().length === 0);
	}

	private updateGlobalToolbarActions(): void {
		const primaryActions = this.globalActions.getPrimaryActions();
		const secondaryActions = this.globalActions.getSecondaryActions();
		this.globalToolBar?.setActions(prepareActions(primaryActions), prepareActions(secondaryActions));
	}

	protected getToolbarWidth(): number {
		const activePane = this.getActivePaneComposite();
		if (!activePane || !this.toolBar) {
			return 0;
		}
		return this.toolBar.getItemsWidth() + (this.globalToolBar?.getItemsWidth() ?? 0);
	}

	private onTitleAreaContextMenu(event: StandardMouseEvent): void {
		if (this.shouldShowCompositeBar()) {
			return;
		}
		const activeViewlet = this.getActivePaneComposite() as PaneComposite;
		if (activeViewlet) {
			const contextMenuActions = activeViewlet ? activeViewlet.getContextMenuActions() : [];
			if (contextMenuActions.length) {
				this.contextMenuService.showContextMenu({
					getAnchor: () => event,
					getActions: () => contextMenuActions.slice(),
					getActionViewItem: action => this.actionViewItemProvider(action),
					actionRunner: activeViewlet.getActionRunner(),
					skipTelemetry: true
				});
			}
		}
	}

	protected abstract shouldShowCompositeBar(): boolean;
	protected abstract getCompoisteBarOptions(): IPaneCompositeBarOptions;

}
