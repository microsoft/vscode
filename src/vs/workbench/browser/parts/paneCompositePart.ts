/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/paneCompositePart.css';
import { Event } from '../../../base/common/event.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IProgressIndicator } from '../../../platform/progress/common/progress.js';
import { PaneComposite, PaneCompositeDescriptor, PaneCompositeRegistry } from '../panecomposite.js';
import { IPaneComposite } from '../../common/panecomposite.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../common/views.js';
import { DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { IView } from '../../../base/browser/ui/grid/grid.js';
import { IWorkbenchLayoutService, Parts, Position, SINGLE_WINDOW_PARTS, FLOATING_PANEL_INNER_MARGIN, FLOATING_PANEL_MARGIN, getFloatingOuterGutterEdges, getFloatingSidebarSiblingToEditorStatus } from '../../services/layout/browser/layoutService.js';
import { CompositePart, ICompositePartOptions, ICompositeTitleLabel } from './compositePart.js';
import { IPaneCompositeBarOptions, PaneCompositeBar } from './paneCompositeBar.js';
import { Dimension, EventHelper, trackFocus, $, addDisposableListener, EventType, prepend, getWindow } from '../../../base/browser/dom.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { IComposite } from '../../common/composite.js';
import { localize } from '../../../nls.js';
import { CompositeDragAndDropObserver, toggleDropEffect } from '../dnd.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../common/theme.js';
import { IMenuService, MenuId } from '../../../platform/actions/common/actions.js';
import { ActionsOrientation } from '../../../base/browser/ui/actionbar/actionbar.js';
import { Gesture, EventType as GestureEventType } from '../../../base/browser/touch.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { IAction, SubmenuAction } from '../../../base/common/actions.js';
import { Composite } from '../composite.js';
import { ViewsSubMenu } from './views/viewPaneContainer.js';
import { getActionBarActions } from '../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { DeferredPromise } from '../../../base/common/async.js';

export enum CompositeBarPosition {
	TOP,
	TITLE,
	BOTTOM
}

export interface IPaneCompositePart extends IView {

	readonly partId: SINGLE_WINDOW_PARTS;
	readonly registryId: string;

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
	 * Returns id of all view containers following the visual order.
	 */
	getPaneCompositeIds(): string[];
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

	private titleContainer: HTMLElement | undefined;
	private headerFooterCompositeBarContainer: HTMLElement | undefined;
	protected readonly headerFooterCompositeBarDispoables = this._register(new DisposableStore());
	private paneCompositeBarContainer: HTMLElement | undefined;
	private readonly paneCompositeBar = this._register(new MutableDisposable<PaneCompositeBar>());
	private compositeBarPosition: CompositeBarPosition | undefined = undefined;
	private emptyPaneMessageElement: HTMLElement | undefined;

	private globalToolBar: MenuWorkbenchToolBar | undefined;
	private blockOpening: DeferredPromise<PaneComposite | undefined> | undefined = undefined;
	protected contentDimension: Dimension | undefined;
	private floatingLayoutDimension: Dimension | undefined;

	constructor(
		readonly partId: SINGLE_WINDOW_PARTS,
		partOptions: ICompositePartOptions,
		activePaneCompositeSettingsKey: string,
		private readonly activePaneContextKey: IContextKey<string>,
		private paneFocusContextKey: IContextKey<boolean>,
		nameForTelemetry: string,
		compositeCSSClass: string,
		titleForegroundColor: string | undefined,
		titleBorderColor: string | undefined,
		protected readonly location: ViewContainerLocation,
		readonly registryId: string,
		private readonly globalActionsMenuId: MenuId,
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
		@IConfigurationService protected readonly configurationService: IConfigurationService,
	) {
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
			titleBorderColor,
			partId,
			partOptions
		);
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.onDidPaneCompositeOpen(composite => this.onDidOpen(composite)));
		this._register(this.onDidPaneCompositeClose(this.onDidClose, this));

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

		if (this.contentArea) {
			this.createEmptyPaneMessage(this.contentArea);
		}

		this.updateCompositeBar();

		const focusTracker = this._register(trackFocus(parent));
		this._register(focusTracker.onDidFocus(() => this.paneFocusContextKey.set(true)));
		this._register(focusTracker.onDidBlur(() => this.paneFocusContextKey.set(false)));
	}

	private createEmptyPaneMessage(parent: HTMLElement): void {
		this.emptyPaneMessageElement = $('.empty-pane-message-area');

		const messageElement = $('.empty-pane-message');
		messageElement.textContent = localize('pane.emptyMessage', "Drag a view here to display.");

		this.emptyPaneMessageElement.appendChild(messageElement);
		parent.appendChild(this.emptyPaneMessageElement);

		const setDropBackgroundFeedback = (visible: boolean) => {
			const updateActivityBarBackground = !this.getActiveComposite() || !visible;
			const backgroundColor = visible ? this.theme.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND)?.toString() || '' : '';

			if (this.titleContainer && updateActivityBarBackground) {
				this.titleContainer.style.backgroundColor = backgroundColor;
			}
			if (this.headerFooterCompositeBarContainer && updateActivityBarBackground) {
				this.headerFooterCompositeBarContainer.style.backgroundColor = backgroundColor;
			}

			this.emptyPaneMessageElement!.style.backgroundColor = backgroundColor;
		};

		if (this.viewDescriptorService.canMoveViews()) {
			this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(this.element, {
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
						setDropBackgroundFeedback(validDropTarget);
					}
				},
				onDragLeave: (e) => {
					EventHelper.stop(e.eventData, true);
					setDropBackgroundFeedback(false);
				},
				onDragEnd: (e) => {
					EventHelper.stop(e.eventData, true);
					setDropBackgroundFeedback(false);
				},
				onDrop: (e) => {
					EventHelper.stop(e.eventData, true);
					setDropBackgroundFeedback(false);
					if (this.paneCompositeBar.value) {
						this.paneCompositeBar.value.dndHandler.drop(e.dragAndDropData, undefined, e.eventData);
					} else {
						// Allow opening views/composites if the composite bar is hidden
						const dragData = e.dragAndDropData.getData();

						if (dragData.type === 'composite') {
							const currentContainer = this.viewDescriptorService.getViewContainerById(dragData.id)!;
							this.viewDescriptorService.moveViewContainerToLocation(currentContainer, this.location, undefined, 'dnd');
							this.openPaneComposite(currentContainer.id, true);
						}

						else if (dragData.type === 'view') {
							const viewToMove = this.viewDescriptorService.getViewDescriptorById(dragData.id)!;
							if (viewToMove.canMoveView) {
								this.viewDescriptorService.moveViewToLocation(viewToMove, this.location, 'dnd');

								const newContainer = this.viewDescriptorService.getViewContainerByViewId(viewToMove.id)!;

								this.openPaneComposite(newContainer.id, true).then(composite => {
									composite?.openView(viewToMove.id, true);
								});
							}
						}
					}
				},
			}));
		}
	}

	protected override createTitleArea(parent: HTMLElement): HTMLElement | undefined {
		const titleArea = super.createTitleArea(parent);
		if (!titleArea) {
			return undefined;
		}

		this._register(addDisposableListener(titleArea, EventType.CONTEXT_MENU, e => {
			this.onTitleAreaContextMenu(new StandardMouseEvent(getWindow(titleArea), e));
		}));
		this._register(Gesture.addTarget(titleArea));
		this._register(addDisposableListener(titleArea, GestureEventType.Contextmenu, e => {
			this.onTitleAreaContextMenu(new StandardMouseEvent(getWindow(titleArea), e));
		}));

		const globalTitleActionsContainer = titleArea.appendChild($('.global-actions'));

		// Global Actions Toolbar
		this.globalToolBar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar,
			globalTitleActionsContainer,
			this.globalActionsMenuId,
			{
				actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
				orientation: ActionsOrientation.HORIZONTAL,
				getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
				anchorAlignmentProvider: () => this.getTitleAreaDropDownAnchorAlignment(),
				toggleMenuTitle: localize('moreActions', "More Actions..."),
				hoverDelegate: this.toolbarHoverDelegate,
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
				highlightToggledItems: true,
				telemetrySource: this.nameForTelemetry
			}
		));

		return titleArea;
	}

	protected override createTitleLabel(parent: HTMLElement): ICompositeTitleLabel {
		this.titleContainer = parent;

		const titleLabel = super.createTitleLabel(parent);
		this.titleLabelElement!.draggable = this.viewDescriptorService.canMoveViews();
		const draggedItemProvider = (): { type: 'view' | 'composite'; id: string } => {
			const activeViewlet = this.getActivePaneComposite()!;
			return { type: 'composite', id: activeViewlet.getId() };
		};
		this._register(CompositeDragAndDropObserver.INSTANCE.registerDraggable(this.titleLabelElement!, draggedItemProvider, {}));

		return titleLabel;
	}

	protected updateCompositeBar(updateCompositeBarOption: boolean = false): void {
		const wasCompositeBarVisible = this.compositeBarPosition !== undefined;
		const isCompositeBarVisible = this.shouldShowCompositeBar();
		const previousPosition = this.compositeBarPosition;
		const newPosition = isCompositeBarVisible ? this.getCompositeBarPosition() : undefined;

		// Only update if the visibility or position has changed or if the composite bar options should be updated
		if (!updateCompositeBarOption && previousPosition === newPosition) {
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

		if (updateCompositeBarOption) {
			this.layoutCompositeBar();
		}
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
		return this.instantiationService.createInstance(PaneCompositeBar, this.location, this.getCompositeBarOptions(), this.partId, this);
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

	private async doOpenPaneComposite(id: string, focus?: boolean): Promise<PaneComposite | undefined> {
		if (this.blockOpening) {
			// Workaround against a potential race condition when calling
			// `setPartHidden` we may end up in `openPaneComposite` again.
			// But we still want to return the result of the original call,
			// so we return the promise of the original call.
			return this.blockOpening.p;
		}

		let blockOpening: DeferredPromise<PaneComposite | undefined> | undefined;
		if (!this.layoutService.isVisible(this.partId)) {
			try {
				blockOpening = this.blockOpening = new DeferredPromise<PaneComposite | undefined>();
				this.layoutService.setPartHidden(false, this.partId);
			} finally {
				this.blockOpening = undefined;
			}
		}

		try {
			const result = this.openComposite(id, focus) as PaneComposite | undefined;
			blockOpening?.complete(result);

			return result;
		} catch (error) {
			blockOpening?.error(error);
			throw error;
		}
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

	getPaneCompositeIds(): string[] {
		return this.paneCompositeBar.value?.getPaneCompositeIds() ?? [];
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

		// Remember the dimension as provided by the grid (before the floating inset is
		// applied) so relayouts triggered by internal changes (title/header/footer) feed
		// back this original dimension instead of a repeatedly shrunk one.
		this.floatingLayoutDimension = new Dimension(width, height);

		// When the floating panels experiment is enabled, shrink the content to
		// leave room for the card margin and border applied via CSS on the part.
		const floatingInset = this.getFloatingInset();
		if (floatingInset.width > 0 || floatingInset.height > 0) {
			width = Math.max(0, width - floatingInset.width);
			height = Math.max(0, height - floatingInset.height);
		}

		this.contentDimension = new Dimension(width, height);

		// Reflect which window edges this part is the outermost floating card on so the
		// matching doubled outer gutter can be applied in CSS (kept in sync with
		// `getFloatingInset`).
		const outerGutter = this.getFloatingOuterGutterEdges();
		this.element.classList.toggle('floating-part-outer-left', outerGutter.left);
		this.element.classList.toggle('floating-part-outer-right', outerGutter.right);

		// Layout contents
		super.layout(this.contentDimension.width, this.contentDimension.height, top, left);

		// Layout composite bar
		this.layoutCompositeBar();

		// Add empty pane message
		this.layoutEmptyMessage();
	}

	/**
	 * The window edges on which this part is the outermost floating card and therefore
	 * adopts a doubled outer gutter, so its contents do not hug the window edge. Applies
	 * to the primary side bar, the secondary side bar and the panel; a horizontal panel
	 * can own both edges at once.
	 */
	private getFloatingOuterGutterEdges(): { left: boolean; right: boolean } {
		return getFloatingOuterGutterEdges(this.layoutService, this.partId);
	}

	protected override getRelayoutDimension(): Dimension | undefined {
		return this.floatingLayoutDimension ?? super.getRelayoutDimension();
	}

	/**
	 * Returns true when this sidebar/aux bar is in the same grid row as the editor
	 * (a sibling), meaning it abuts the panel above or below rather than the window edge.
	 * Delegates to the shared formula exported from layoutService.ts.
	 */
	private isSidebarSiblingToEditor(): boolean {
		const { sideBar, auxBar } = getFloatingSidebarSiblingToEditorStatus(this.layoutService);
		return this.partId === Parts.SIDEBAR_PART ? sideBar : auxBar;
	}

	/**
	 * Returns the top margin (in pixels) this part should receive when floating panels
	 * are enabled. Only the bottom-panel and sibling side bars (when the panel is at the
	 * top) need a top margin; all other parts sit flush with the title bar.
	 */
	private getFloatingPartTopMargin(panelVisible: boolean, margin: number): number {
		// Bottom panel: needs a top margin only when the editor is visible (inter-card gap).
		// When maximized (editor hidden) the panel is flush with the title bar — no top margin.
		if (this.partId === Parts.PANEL_PART && this.layoutService.getPanelPosition() === Position.BOTTOM) {
			return this.layoutService.isVisible(Parts.EDITOR_PART, getWindow(this.element)) ? margin : 0;
		}
		// Sidebar / aux bar that is in the same grid row as the editor (sibling) and the panel
		// is at the top: needs a top margin matching the editor's gap from the panel card.
		if (panelVisible &&
			this.layoutService.getPanelPosition() === Position.TOP &&
			(this.partId === Parts.SIDEBAR_PART || this.partId === Parts.AUXILIARYBAR_PART) &&
			this.isSidebarSiblingToEditor()) {
			return margin;
		}
		return 0;
	}

	/**
	 * Returns whether this part's bottom edge faces the window edge rather than another
	 * floating card. When the status bar is hidden and this returns `true`, a doubled
	 * bottom margin is applied so the outer gap matches the doubled side gutters.
	 */
	private isFloatingPartAtWindowBottomEdge(panelVisible: boolean): boolean {
		// Panel at TOP: its bottom faces the editor card, not the window edge.
		if (this.partId === Parts.PANEL_PART && this.layoutService.getPanelPosition() === Position.TOP) {
			return false;
		}
		// A sidebar/aux bar that is a sibling to the editor sits above a bottom panel row,
		// so its bottom faces the panel card rather than the window edge.
		const panelAtBottom = panelVisible && this.layoutService.getPanelPosition() === Position.BOTTOM;
		if (panelAtBottom &&
			(this.partId === Parts.SIDEBAR_PART || this.partId === Parts.AUXILIARYBAR_PART) &&
			this.isSidebarSiblingToEditor()) {
			return false;
		}
		return true;
	}

	/**
	 * Amount (in pixels) to subtract from each axis when the floating panels
	 * experiment is enabled: a margin on each side plus a 1px border on each side
	 * (the border is drawn inside the box, as `.monaco-workbench .part` is
	 * `box-sizing: border-box` in `part.css`). The side bars sit directly under the
	 * title bar, so they have no top margin. On each window edge this part is the outermost
	 * floating card on (see {@link getFloatingOuterGutterEdges}) it gets a doubled outer
	 * margin, so its width inset is larger on that side.
	 */
	private getFloatingInset(): { width: number; height: number } {
		if (!this.layoutService.isFloatingPanelsEnabled()) {
			return { width: 0, height: 0 };
		}

		const borderTotal = 2; // 1px border on each side
		const margin = FLOATING_PANEL_MARGIN;
		const panelVisible = this.layoutService.isVisible(Parts.PANEL_PART);
		const topMargin = this.getFloatingPartTopMargin(panelVisible, margin);
		const isAtWindowBottom = this.isFloatingPartAtWindowBottomEdge(panelVisible);
		const bottomMargin = !this.layoutService.isVisible(Parts.STATUSBAR_PART, getWindow(this.element)) && isAtWindowBottom
			? margin * 2 : FLOATING_PANEL_INNER_MARGIN;
		const outerGutter = this.getFloatingOuterGutterEdges();
		const leftMargin = outerGutter.left ? margin * 2 : margin;
		const rightMargin = outerGutter.right ? margin * 2 : FLOATING_PANEL_INNER_MARGIN;
		return {
			width: leftMargin + rightMargin + borderTotal,
			height: topMargin + bottomMargin + borderTotal
		};
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
		this.element.classList.toggle('empty', visible);
		if (visible) {
			this.titleLabel?.updateTitle('', '');
		}
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
		return toolBarWidth + globalToolBarWidth + 8; // 8px padding left
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
			const scopedContextKeyService = disposables.add(this.contextKeyService.createScoped(this.element));
			scopedContextKeyService.createKey('viewContainer', viewPaneContainer.viewContainer.id);
			const menu = this.menuService.getMenuActions(ViewsSubMenu, scopedContextKeyService, { shouldForwardArgs: true, renderShortTitle: true });
			const viewsActions = getActionBarActions(menu, () => true).primary;
			disposables.dispose();
			return viewsActions.length > 1 && viewsActions.some(a => a.enabled) ? new SubmenuAction('views', localize('views', "Views"), viewsActions) : undefined;
		}
		return undefined;
	}

	protected abstract shouldShowCompositeBar(): boolean;
	protected abstract getCompositeBarOptions(): IPaneCompositeBarOptions;
	protected abstract getCompositeBarPosition(): CompositeBarPosition;
}
