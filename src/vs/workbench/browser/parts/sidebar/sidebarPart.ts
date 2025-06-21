/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sidebarpart.css';
import './sidebarActions.js';
import { ActivityBarPosition, IWorkbenchLayoutService, LayoutSettings, Parts, Position as SideBarPosition } from '../../../services/layout/browser/layoutService.js';
import { SidebarFocusContext, ActiveViewletContext } from '../../../common/contextkeys.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { SIDE_BAR_TITLE_FOREGROUND, SIDE_BAR_TITLE_BORDER, SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND, SIDE_BAR_BORDER, SIDE_BAR_DRAG_AND_DROP_BACKGROUND, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_TOP_FOREGROUND, ACTIVITY_BAR_TOP_ACTIVE_BORDER, ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND, ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER } from '../../../common/theme.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { AnchorAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { LayoutPriority } from '../../../../base/browser/ui/grid/grid.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../paneCompositePart.js';
import { ActivityBarCompositeBar, ActivitybarPart } from '../activitybar/activitybarPart.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IPaneCompositeBarOptions } from '../paneCompositeBar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Action2, IMenuService, registerAction2, MenuId, ServicesAccessor } from '../../../../platform/actions/common/actions.js';
import { Separator } from '../../../../base/common/actions.js';
import { ToggleActivityBarVisibilityActionId, ToggleSidebarVisibilityAction } from '../../actions/layoutActions.js';
import { localize2 } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import * as DOM from '../../../../base/browser/dom.js';
import { IContextKey } from '../../../../platform/contextkey/common/contextkey.js'; // Added IContextKey

// Store the horizontal view state key to reuse it across mobile drawer and activity bar part
const GlobalHorizontalViewStateKey = 'workbench.sidebar.horizontalViewState';


const MenuIcon = registerIcon('menu-mobile', Codicon.menu, localize2('menuIconMobile', 'Icon for the menu in mobile.'));


export class SidebarPart extends AbstractPaneCompositePart {

	static readonly activeViewletSettingsKey = 'workbench.sidebar.activeviewletid';
	private static readonly MOBILE_DRAWER_OPEN_STATE_KEY = 'workbench.sidebar.mobileDrawerOpenState';

	//#region IView

	readonly minimumWidth: number = 170; // Remains for desktop
	readonly maximumWidth: number = Number.POSITIVE_INFINITY; // Remains for desktop
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;
	override get snap(): boolean { return !this.isMobileDrawerMode && true; } // No snap in drawer mode

	readonly priority: LayoutPriority = LayoutPriority.Low;

	// Mobile Drawer Mode Properties
	private isMobileDrawerMode: boolean = false;
	private isDrawerOpen: boolean = false;
	private mobileDrawerActivityHost?: ActivityBarCompositeBar;
	private mobileDrawerContentContainer?: HTMLElement; // Container for the actual viewlet content inside the drawer
	private defaultMobileDrawerWidth: number = 280; // Default width for the mobile drawer
	private sideBarVisibleContextKey!: IContextKey<boolean>; // Will be assigned from parent

	get preferredWidth(): number | undefined {
		const viewlet = this.getActivePaneComposite();

		if (!viewlet) {
			return;
		}

		const width = viewlet.getOptimalWidth();
		if (typeof width !== 'number') {
			return;
		}

		return Math.max(width, 300);
	}

	// Use the same key for pinned views as the main activity bar for consistency if desired, or a new one.
	private readonly activityBarPart = this._register(this.instantiationService.createInstance(ActivitybarPart, this, GlobalHorizontalViewStateKey));


	//#endregion

	constructor(
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMenuService menuService: IMenuService,
	) {
		super(
			Parts.SIDEBAR_PART,
			// In mobile drawer mode, the title is part of the drawer content, not a separate bar.
			{ hasTitle: () => !this.isMobileDrawerMode, borderWidth: () => (this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder)) ? 1 : 0 },
			SidebarPart.activeViewletSettingsKey,
			ActiveViewletContext.bindTo(contextKeyService),
			SidebarFocusContext.bindTo(contextKeyService), // This context key might need adjustment for drawer behavior
			'sideBar',
			'viewlet',
			SIDE_BAR_TITLE_FOREGROUND,
			SIDE_BAR_TITLE_BORDER,
			notificationService,
			storageService,
			contextMenuService,
			layoutService,
			keybindingService,
			hoverService,
			instantiationService,
			themeService,
			viewDescriptorService,
			contextKeyService,
			extensionService,
			menuService,
		);

		this.rememberActivityBarVisiblePosition(); // This might be less relevant for mobile drawer
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION) && !this.isMobileDrawerMode) {
				this.onDidChangeActivityBarLocation();
			}
			if (e.affectsConfiguration('workbench.mobile.drawerWidth')) {
				if (this.isMobileDrawerMode) {
					this.layoutService.layout(); // Re-layout if drawer width changes
				}
			}
		}));

		// Load drawer state
		this.isDrawerOpen = this.storageService.getBoolean(SidebarPart.MOBILE_DRAWER_OPEN_STATE_KEY, StorageScope.WORKSPACE, false);
		// Assign the context key that reflects sidebar visibility (used by various parts of UI)
		// It's crucial this is set up correctly for the mobile drawer to inform the rest of the system
		// The SideBarVisibleContext is typically a parent of SidebarFocusContext.
		// We need to find the IContextKey instance that controls the 'sideBarVisible' context.
		const sidebarVisibleContext = contextKeyService.getContext(SidebarFocusContext.keyName)?.getParent()?.getValue(ActiveViewletContext.keyName.substring(0, ActiveViewletContext.keyName.lastIndexOf('.')) + '.visible');
		if (sidebarVisibleContext && 'set' in sidebarVisibleContext && typeof sidebarVisibleContext.set === 'function') {
			this.sideBarVisibleContextKey = sidebarVisibleContext as IContextKey<boolean>;
		} else {
			// Fallback or error: This is critical. For now, we'll create a new one if not found,
			// but this might not correctly link with all dependent UI elements.
			// A better approach would be to ensure this context key is correctly passed or retrievable.
			console.warn("SidebarPart: Could not find existing sideBarVisible context key. Creating a new one.");
			this.sideBarVisibleContextKey = this.contextKeyService.createKey<boolean>('sideBarVisible', this.layoutService.isVisible(Parts.SIDEBAR_PART));
		}

		if (this.sideBarVisibleContextKey) {
			this.sideBarVisibleContextKey.set(this.isMobileDrawerMode ? this.isDrawerOpen : this.layoutService.isVisible(Parts.SIDEBAR_PART));
		}


		this.registerActions();
	}

	// Called from WorkbenchLayout or similar to enable/disable mobile drawer mode
	setMobileDrawerMode(enabled: boolean): void {
		if (this.isMobileDrawerMode === enabled) {
			return;
		}
		this.isMobileDrawerMode = enabled;
		const container = this.getContainer();

		if (enabled) {
			this.activityBarPart.hide(); // Hide desktop activity bar
			if (this.compositeBar) { this.compositeBar.hide(); } // Hide title composite bar

			if (container) {
				container.classList.add('mobile-drawer-mode');
				// Initial closed state, layout() will position it
				container.classList.remove('open');
				container.style.transform = `translateX(-${this.getDrawerWidth()}px)`;
			}
			// Ensure content area is recreated or updated for drawer structure
			if (this.contentArea) {
				DOM.clearNode(this.contentArea); // Clear previous content
				this.createContentArea(this.contentArea); // Rebuild content for drawer mode
			}
			this.updateActivityHostContent(); // Populate the drawer's activity host

		} else { // Switching back to desktop mode
			if (container) {
				container.classList.remove('mobile-drawer-mode');
				container.classList.remove('open');
				container.style.transform = ''; // Reset transform
			}
			// Ensure content area is recreated or updated for desktop structure
			if (this.contentArea) {
				DOM.clearNode(this.contentArea);
				this.createContentArea(this.contentArea); // Rebuild content for desktop mode
			}
			// Restore desktop activity bar and composite bar based on settings
			if (this.shouldShowActivityBar()) { this.activityBarPart.show(); }
			if (this.compositeBar && this.shouldShowCompositeBar()) { this.compositeBar.show(); }
			this.onTitleAreaUpdate(this.getActiveComposite()?.getId() ?? '');
		}

		if (this.sideBarVisibleContextKey) {
			this.sideBarVisibleContextKey.set(this.isMobileDrawerMode ? this.isDrawerOpen : this.layoutService.isVisible(Parts.SIDEBAR_PART));
		}
		this.updateTitleArea(); // Update title visibility based on mode
		this.layoutService.layout(); // Trigger a layout update
	}

	private getDrawerWidth(): number {
		return this.configurationService.getValue<number>('workbench.mobile.drawerWidth') || this.defaultMobileDrawerWidth;
	}

	toggleMobileDrawer(): void {
		if (!this.isMobileDrawerMode) {
			this.layoutService.togglePartVisibility(Parts.SIDEBAR_PART);
			return;
		}

		this.isDrawerOpen = !this.isDrawerOpen;
		this.storageService.store(SidebarPart.MOBILE_DRAWER_OPEN_STATE_KEY, this.isDrawerOpen, StorageScope.WORKSPACE, StorageTarget.MACHINE);

		if (this.sideBarVisibleContextKey) {
			this.sideBarVisibleContextKey.set(this.isDrawerOpen);
		}

		const container = assertReturnsDefined(this.getContainer());
		if (this.isDrawerOpen) {
			container.classList.add('open');
			this.getActivePaneComposite()?.focus();
		} else {
			container.classList.remove('open');
		}
		this.layoutService.layout();
	}


	private onDidChangeActivityBarLocation(): void {
		if (this.isMobileDrawerMode) return;

		this.activityBarPart.hide();
		this.updateCompositeBar();
		const id = this.getActiveComposite()?.getId();
		if (id) { this.onTitleAreaUpdate(id); }
		if (this.shouldShowActivityBar()) { this.activityBarPart.show(); }
		this.rememberActivityBarVisiblePosition();
	}

	override createContentArea(parent: HTMLElement): HTMLElement {
		if (this.isMobileDrawerMode) {
			const drawerBody = DOM.append(parent, DOM.$('.drawer-body'));

			const activityHostElement = DOM.append(drawerBody, DOM.$('.mobile-drawer-activity-host'));
			this.mobileDrawerActivityHost = this._register(this.instantiationService.createInstance(ActivityBarCompositeBar, this.getMobileDrawerActivityHostOptions(), Parts.ACTIVITYBAR_PART, this, true, GlobalHorizontalViewStateKey));
			this.mobileDrawerActivityHost.create(activityHostElement);

			this.mobileDrawerContentContainer = DOM.append(drawerBody, DOM.$('.drawer-original-content'));
			super.createContentArea(this.mobileDrawerContentContainer);
			this.updateActivityHostContent();

			return this.mobileDrawerContentContainer;
		} else {
			// Default desktop behavior
			return super.createContentArea(parent);
		}
	}

	private updateActivityHostContent(): void {
		if (!this.isMobileDrawerMode || !this.mobileDrawerActivityHost || !this.getContainer()) {
			return;
		}
		this.mobileDrawerActivityHost.clear();
		const viewlets = this.getPaneComposites();
		for (const viewlet of viewlets) {
			const result = this.mobileDrawerActivityHost.addComposite(viewlet, { icon: true, label: false, keybinding: undefined });
			if (result) {
				this._register(result.composite);
				this._register(result.disposable);
			}
		}
	}


	override updateStyles(): void {
		super.updateStyles();
		const container = assertReturnsDefined(this.getContainer());

		if (this.isMobileDrawerMode) {
			container.style.backgroundColor = this.getColor(SIDE_BAR_BACKGROUND) || '';
		} else {
			container.style.backgroundColor = this.getColor(SIDE_BAR_BACKGROUND) || '';
			container.style.color = this.getColor(SIDE_BAR_FOREGROUND) || '';
			const borderColor = this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder);
			const isPositionLeft = this.layoutService.getSideBarPosition() === SideBarPosition.LEFT;
			container.style.borderRightWidth = borderColor && isPositionLeft ? '1px' : '';
			container.style.borderRightStyle = borderColor && isPositionLeft ? 'solid' : '';
			container.style.borderRightColor = isPositionLeft ? borderColor || '' : '';
			container.style.borderLeftWidth = borderColor && !isPositionLeft ? '1px' : '';
			container.style.borderLeftStyle = borderColor && !isPositionLeft ? 'solid' : '';
			container.style.borderLeftColor = !isPositionLeft ? borderColor || '' : '';
			container.style.outlineColor = this.getColor(SIDE_BAR_DRAG_AND_DROP_BACKGROUND) ?? '';
		}
	}

	override layout(width: number, height: number, top: number, left: number): void {
		const container = this.getContainer();
		if (!container) { return; }

		if (this.isMobileDrawerMode) {
			if (!this.layoutService.isVisible(Parts.SIDEBAR_PART) && !this.isDrawerOpen) {
				container.style.display = 'none';
				return;
			}
			container.style.display = 'block';

			const drawerWidth = this.getDrawerWidth();
			container.style.width = `${drawerWidth}px`;
			container.style.height = `${height}px`;
			container.style.top = `${top}px`;
			container.style.left = `${left}px`;

			if (this.isDrawerOpen) {
				container.style.transform = 'translateX(0%)';
			} else {
				container.style.transform = `translateX(-${drawerWidth}px)`;
			}

			if (this.mobileDrawerActivityHost && this.mobileDrawerContentContainer) {
				const activityHostElement = this.mobileDrawerActivityHost.getContainer();
				const activityHostWidth = 48;
				activityHostElement.style.height = `${height}px`;
				activityHostElement.style.width = `${activityHostWidth}px`;

				const contentWidth = drawerWidth - activityHostWidth;
				this.mobileDrawerContentContainer.style.height = `${height}px`;
				this.mobileDrawerContentContainer.style.width = `${contentWidth}px`;
				this.mobileDrawerContentContainer.style.position = 'absolute';
				this.mobileDrawerContentContainer.style.left = `${activityHostWidth}px`;
				this.mobileDrawerContentContainer.style.top = '0px';


				this.getActivePaneComposite()?.layout(new DOM.Dimension(contentWidth, height));
				this.mobileDrawerActivityHost.layout(new DOM.Dimension(activityHostWidth, height)); // Pass Dimension for activity host
			}
		} else {
			if (!this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
				return;
			}
			container.style.transform = '';
			container.style.display = '';
			super.layout(width, height, top, left);
		}
	}


	protected override getTitleAreaDropDownAnchorAlignment(): AnchorAlignment {
		if (this.isMobileDrawerMode) {
			return AnchorAlignment.LEFT;
		}
		return this.layoutService.getSideBarPosition() === SideBarPosition.LEFT ? AnchorAlignment.LEFT : AnchorAlignment.RIGHT;
	}

	protected override createCompositeBar(): ActivityBarCompositeBar {
		if (this.isMobileDrawerMode) {
			// This should not be called if hasTitle() returns false for mobile mode.
			// Return a dummy to satisfy method signature if it were called.
			return this.instantiationService.createInstance(ActivityBarCompositeBar, this.getMobileDrawerActivityHostOptions() , this.partId, this, false, GlobalHorizontalViewStateKey);
		}
		return this.instantiationService.createInstance(ActivityBarCompositeBar, this.getCompositeBarOptions(), this.partId, this, false, ActivitybarPart.activeViewletSettingsKey);
	}


	private getMobileDrawerActivityHostOptions(): IPaneCompositeBarOptions {
		return {
			partContainerClass: 'mobile-drawer-activity-host-internal',
			pinnedViewContainersKey: `${ActivitybarPart.pinnedViewContainersKey}.mobile`,
			placeholderViewContainersKey: `${ActivitybarPart.placeholderViewContainersKey}.mobile`,
			viewContainersWorkspaceStateKey: `${ActivitybarPart.viewContainersWorkspaceStateKey}.mobile`,
			icon: true,
			orientation: ActionsOrientation.VERTICAL,
			recomputeSizes: true,
			activityHoverOptions: { position: () => HoverPosition.RIGHT },
			fillExtraContextMenuActions: () => { },
			compositeSize: 48,
			iconSize: 24,
			overflowActionSize: 48,
			colors: theme => ({
				activeBackgroundColor: undefined,
				inactiveBackgroundColor: undefined,
				activeBorderColor: theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BORDER),
				activeForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_FOREGROUND),
				inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND),
				badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
				badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
				dragAndDropBorder: theme.getColor(SIDE_BAR_DRAG_AND_DROP_BACKGROUND)
			}),
			compact: true,
			fixedLayout: true,
			hidePart: () => { }
		};
	}


	protected getCompositeBarOptions(): IPaneCompositeBarOptions {
		if (this.isMobileDrawerMode) {
			return this.getMobileDrawerActivityHostOptions();
		}
		return {
			partContainerClass: 'sidebar',
			pinnedViewContainersKey: ActivitybarPart.pinnedViewContainersKey,
			placeholderViewContainersKey: ActivitybarPart.placeholderViewContainersKey,
			viewContainersWorkspaceStateKey: ActivitybarPart.viewContainersWorkspaceStateKey,
			icon: true,
			orientation: ActionsOrientation.HORIZONTAL,
			recomputeSizes: true,
			activityHoverOptions: {
				position: () => this.getCompositeBarPosition() === CompositeBarPosition.BOTTOM ? HoverPosition.ABOVE : HoverPosition.BELOW,
			},
			fillExtraContextMenuActions: actions => {
				if (!this.isMobileDrawerMode && this.getCompositeBarPosition() === CompositeBarPosition.TITLE) {
					const viewsSubmenuAction = this.getViewsSubmenuAction();
					if (viewsSubmenuAction) {
						actions.push(new Separator());
						actions.push(viewsSubmenuAction);
					}
				}
			},
			compositeSize: 0,
			iconSize: 16,
			overflowActionSize: 30,
			colors: theme => ({
				activeBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				inactiveBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				activeBorderBottomColor: theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BORDER),
				activeForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_FOREGROUND),
				inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND),
				badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
				badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
				dragAndDropBorder: theme.getColor(ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER)
			}),
			compact: true
		};
	}


	protected override shouldShowCompositeBar(): boolean {
		if (this.isMobileDrawerMode) {
			return false;
		}
		const activityBarPosition = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		return activityBarPosition === ActivityBarPosition.TOP || activityBarPosition === ActivityBarPosition.BOTTOM;
	}

	private shouldShowActivityBar(): boolean {
		if (this.isMobileDrawerMode || this.shouldShowCompositeBar()) {
			return false;
		}
		return this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) !== ActivityBarPosition.HIDDEN;
	}


	protected override getCompositeBarPosition(): CompositeBarPosition {
		if (this.isMobileDrawerMode) {
			return CompositeBarPosition.TITLE;
		}
		const activityBarPosition = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		switch (activityBarPosition) {
			case ActivityBarPosition.TOP: return CompositeBarPosition.TOP;
			case ActivityBarPosition.BOTTOM: return CompositeBarPosition.BOTTOM;
			case ActivityBarPosition.HIDDEN:
			case ActivityBarPosition.DEFAULT:
			default: return CompositeBarPosition.TITLE;
		}
	}

	private rememberActivityBarVisiblePosition(): void {
		if (this.isMobileDrawerMode) return;
		const activityBarPosition = this.configurationService.getValue<string>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		if (activityBarPosition !== ActivityBarPosition.HIDDEN) {
			this.storageService.store(LayoutSettings.ACTIVITY_BAR_LOCATION, activityBarPosition, StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	private getRememberedActivityBarVisiblePosition(): ActivityBarPosition {
		const activityBarPosition = this.storageService.get(LayoutSettings.ACTIVITY_BAR_LOCATION, StorageScope.PROFILE);
		switch (activityBarPosition) {
			case ActivityBarPosition.TOP: return ActivityBarPosition.TOP;
			case ActivityBarPosition.BOTTOM: return ActivityBarPosition.BOTTOM;
			default: return ActivityBarPosition.DEFAULT;
		}
	}

	override getPinnedPaneCompositeIds(): string[] {
		if (this.isMobileDrawerMode && this.mobileDrawerActivityHost) {
			return this.mobileDrawerActivityHost.getPinnedPaneCompositeIds();
		}
		return this.shouldShowCompositeBar() ? super.getPinnedPaneCompositeIds() : this.activityBarPart.getPinnedPaneCompositeIds();
	}

	override getVisiblePaneCompositeIds(): string[] {
		if (this.isMobileDrawerMode && this.mobileDrawerActivityHost) {
			return this.mobileDrawerActivityHost.getVisiblePaneCompositeIds();
		}
		return this.shouldShowCompositeBar() ? super.getVisiblePaneCompositeIds() : this.activityBarPart.getVisiblePaneCompositeIds();
	}

	override getPaneCompositeIds(): string[] {
		if (this.isMobileDrawerMode && this.mobileDrawerActivityHost) {
			return this.mobileDrawerActivityHost.getPaneCompositeIds();
		}
		return this.shouldShowCompositeBar() ? super.getPaneCompositeIds() : this.activityBarPart.getPaneCompositeIds();
	}

	async focusActivityBar(): Promise<void> {
		if (this.isMobileDrawerMode) {
			if (!this.isDrawerOpen) {
				this.toggleMobileDrawer();
			}
			this.mobileDrawerActivityHost?.focus();
			return;
		}

		if (this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) === ActivityBarPosition.HIDDEN) {
			await this.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, this.getRememberedActivityBarVisiblePosition());
			if (!this.isMobileDrawerMode) {
				this.onDidChangeActivityBarLocation();
			}
		}

		if (this.shouldShowCompositeBar()) {
			this.focusCompositeBar();
		} else {
			if (!this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
				this.layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);
			}
			this.activityBarPart.show(true);
		}
	}

	private registerActions(): void {
		const that = this;

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: ToggleActivityBarVisibilityActionId,
					title: localize2('toggleActivityBar', "Toggle Activity Bar Visibility"),
					menu: [{ id: MenuId.CommandPalette }]
				});
			}
			run(): Promise<void> {
				if (that.isMobileDrawerMode) {
					return Promise.resolve();
				}
				const currentSetting = that.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION);
				const value = currentSetting === ActivityBarPosition.HIDDEN ? that.getRememberedActivityBarVisiblePosition() : ActivityBarPosition.HIDDEN;
				return that.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, value);
			}
		}));

		this._register(registerAction2(class extends ToggleSidebarVisibilityAction {
			override async run(accessor: ServicesAccessor): Promise<void> {
				const layoutService = accessor.get(IWorkbenchLayoutService);
				const sidebarPart = layoutService.getPart(Parts.SIDEBAR_PART) as SidebarPart;

				if (sidebarPart && sidebarPart.isMobileDrawerMode) {
					sidebarPart.toggleMobileDrawer();
				} else {
					await super.run(accessor);
				}
			}
		}));

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.toggleMobileDrawer',
					title: localize2('toggleMobileDrawer', "Toggle Mobile Drawer"),
					icon: MenuIcon,
					menu: [{
						id: MenuId.CommandPalette,
					}]
				});
			}
			run(accessor: ServicesAccessor): void {
				const layoutService = accessor.get(IWorkbenchLayoutService);
				const sidebarPart = layoutService.getPart(Parts.SIDEBAR_PART) as SidebarPart;
				if (sidebarPart) {
					sidebarPart.toggleMobileDrawer();
				}
			}
		});
	}

	override setVisible(visible: boolean): void {
		if (this.isMobileDrawerMode) {
			if (!visible && this.isDrawerOpen) {
				this.toggleMobileDrawer();
			}
		} else {
			super.setVisible(visible);
		}
		if (this.sideBarVisibleContextKey) {
			this.sideBarVisibleContextKey.set(this.isMobileDrawerMode ? this.isDrawerOpen : visible);
		}
	}


	override toJSON(): object {
		if (this.isMobileDrawerMode) {
			return {
				type: Parts.SIDEBAR_PART,
				isMobileDrawer: true,
				isDrawerOpen: this.isDrawerOpen,
				width: this.getDrawerWidth()
			};
		}
		return {
			return super.toJSON();
		}
	}
}
