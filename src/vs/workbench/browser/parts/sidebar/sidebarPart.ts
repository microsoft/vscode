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
import { IThemeService, registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { SIDE_BAR_TITLE_FOREGROUND, SIDE_BAR_TITLE_BORDER, SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND, SIDE_BAR_BORDER, SIDE_BAR_DRAG_AND_DROP_BACKGROUND, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_TOP_FOREGROUND, ACTIVITY_BAR_TOP_ACTIVE_BORDER, ACTIVITY_BAR_TOP_HOVER_BACKGROUND, ACTIVITY_BAR_TOP_HOVER_FOREGROUND, ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND, ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_TOP_BACKGROUND, ACTIVITY_BAR_TOP_ACTIVE_BACKGROUND, ACTIVITY_BAR_BOTTOM_BACKGROUND, ACTIVITY_BAR_BOTTOM_ACTIVE_BACKGROUND, ACTIVITY_BAR_BOTTOM_FOREGROUND, ACTIVITY_BAR_BOTTOM_ACTIVE_BORDER, ACTIVITY_BAR_BOTTOM_HOVER_BACKGROUND, ACTIVITY_BAR_BOTTOM_HOVER_FOREGROUND, ACTIVITY_BAR_BOTTOM_INACTIVE_FOREGROUND, ACTIVITY_BAR_BOTTOM_DRAG_AND_DROP_BORDER } from '../../../common/theme.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { AnchorAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { LayoutPriority } from '../../../../base/browser/ui/grid/grid.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../paneCompositePart.js';
import { ActivityBarCompositeBar, ActivitybarPart } from '../activitybar/activitybarPart.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IPaneCompositeBarOptions } from '../paneCompositeBar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Separator } from '../../../../base/common/actions.js';
import { ToggleActivityBarVisibilityActionId } from '../../actions/layoutActions.js';
import { localize2 } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { VisibleViewContainersTracker } from '../visibleViewContainersTracker.js';
import { Extensions } from '../../panecomposite.js';

export class SidebarPart extends AbstractPaneCompositePart {

	static readonly activeViewletSettingsKey = 'workbench.sidebar.activeviewletid';

	//#region IView

	readonly minimumWidth: number = 170;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;
	override get snap(): boolean { return true; }

	readonly priority: LayoutPriority = LayoutPriority.Low;

	get preferredWidth(): number | undefined {
		const viewlet = this.getActivePaneComposite();

		if (!viewlet) {
			return undefined;
		}

		const width = viewlet.getOptimalWidth();
		if (typeof width !== 'number') {
			return undefined;
		}

		return Math.max(width, 300);
	}

	private readonly activityBarPart = this._register(this.instantiationService.createInstance(ActivitybarPart, this.location, this));
	private readonly visibleViewContainersTracker: VisibleViewContainersTracker;

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
			{ hasTitle: true, trailingSeparator: false, borderWidth: () => (this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder)) ? 1 : 0 },
			SidebarPart.activeViewletSettingsKey,
			ActiveViewletContext.bindTo(contextKeyService),
			SidebarFocusContext.bindTo(contextKeyService),
			'sideBar',
			'viewlet',
			SIDE_BAR_TITLE_FOREGROUND,
			SIDE_BAR_TITLE_BORDER,
			ViewContainerLocation.Sidebar,
			Extensions.Viewlets,
			MenuId.SidebarTitle,
			undefined,
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

		// Track visible view containers for auto-hide
		this.visibleViewContainersTracker = this._register(instantiationService.createInstance(VisibleViewContainersTracker, ViewContainerLocation.Sidebar));
		this._register(this.visibleViewContainersTracker.onDidChange((e) => this.onDidChangeAutoHideViewContainers(e)));

		this.rememberActivityBarVisiblePosition();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
				this.onDidChangeActivityBarLocation();
			}
			if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_AUTO_HIDE)) {
				this.onDidChangeActivityBarLocation();
			}
		}));

		this.registerActions();
	}

	private onDidChangeAutoHideViewContainers(e: { before: number; after: number }): void {
		// Only update if auto-hide is enabled and composite bar position is top/bottom
		const activityBarPosition = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		const autoHide = this.configurationService.getValue<boolean>(LayoutSettings.ACTIVITY_BAR_AUTO_HIDE);
		if (autoHide && (activityBarPosition === ActivityBarPosition.TOP || activityBarPosition === ActivityBarPosition.BOTTOM)) {
			const visibleBefore = e.before > 1;
			const visibleAfter = e.after > 1;
			if (visibleBefore !== visibleAfter) {
				this.onDidChangeActivityBarLocation();
			}
		}
	}

	private onDidChangeActivityBarLocation(): void {
		this.activityBarPart.hide();

		this.updateCompositeBar();

		const id = this.getActiveComposite()?.getId();
		if (id) {
			this.onTitleAreaUpdate(id);
		}

		if (this.shouldShowActivityBar()) {
			this.activityBarPart.show();
		}

		this.rememberActivityBarVisiblePosition();
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertReturnsDefined(this.getContainer());

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

		const activityBarPosition = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		if (this.paneCompositeBarContainer && (activityBarPosition === ActivityBarPosition.TOP || activityBarPosition === ActivityBarPosition.BOTTOM)) {
			const isTop = activityBarPosition === ActivityBarPosition.TOP;
			this.paneCompositeBarContainer.style.backgroundColor = (isTop ? this.getColor(ACTIVITY_BAR_TOP_BACKGROUND) : this.getColor(ACTIVITY_BAR_BOTTOM_BACKGROUND)) || '';
			this.paneCompositeBarContainer.style.color = (isTop ? this.getColor(ACTIVITY_BAR_TOP_FOREGROUND) : this.getColor(ACTIVITY_BAR_BOTTOM_FOREGROUND)) || '';
		}
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
			return;
		}

		super.layout(width, height, top, left);
	}

	protected override getTitleAreaDropDownAnchorAlignment(): AnchorAlignment {
		return this.layoutService.getSideBarPosition() === SideBarPosition.LEFT ? AnchorAlignment.LEFT : AnchorAlignment.RIGHT;
	}

	protected override createCompositeBar(): ActivityBarCompositeBar {
		return this.instantiationService.createInstance(ActivityBarCompositeBar, ViewContainerLocation.Sidebar, this.getCompositeBarOptions(), this.partId, this, false);
	}

	protected getCompositeBarOptions(): IPaneCompositeBarOptions {
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
				if (this.getCompositeBarPosition() === CompositeBarPosition.TITLE) {
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
			colors: theme => {
				const activityBarPosition = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
				const isTop = activityBarPosition === ActivityBarPosition.TOP;
				return {
					activeBackgroundColor: isTop ? theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BACKGROUND) : theme.getColor(ACTIVITY_BAR_BOTTOM_ACTIVE_BACKGROUND),
					inactiveBackgroundColor: isTop ? theme.getColor(ACTIVITY_BAR_TOP_BACKGROUND) : theme.getColor(ACTIVITY_BAR_BOTTOM_BACKGROUND),
					activeBorderBottomColor: isTop ? theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BORDER) : theme.getColor(ACTIVITY_BAR_BOTTOM_ACTIVE_BORDER),
					activeForegroundColor: isTop ? theme.getColor(ACTIVITY_BAR_TOP_FOREGROUND) : theme.getColor(ACTIVITY_BAR_BOTTOM_FOREGROUND),
					inactiveForegroundColor: isTop ? theme.getColor(ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND) : theme.getColor(ACTIVITY_BAR_BOTTOM_INACTIVE_FOREGROUND),
					badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
					badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
					dragAndDropBorder: isTop ? theme.getColor(ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER) : theme.getColor(ACTIVITY_BAR_BOTTOM_DRAG_AND_DROP_BORDER)
				};
			},
			compact: true
		};
	}

	protected shouldShowCompositeBar(): boolean {
		const activityBarPosition = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		if (activityBarPosition !== ActivityBarPosition.TOP && activityBarPosition !== ActivityBarPosition.BOTTOM) {
			return false;
		}

		// Check if auto-hide is enabled and there's only one visible view container
		const autoHide = this.configurationService.getValue<boolean>(LayoutSettings.ACTIVITY_BAR_AUTO_HIDE);
		if (autoHide) {
			// Use visible composite count from the composite bar if available (considers pinned state),
			// otherwise fall back to the tracker's count (based on active view descriptors).
			// Note: We access paneCompositeBar directly to avoid circular calls with getVisiblePaneCompositeIds()
			const visibleCount = this.visibleViewContainersTracker.visibleCount;
			if (visibleCount <= 1) {
				return false;
			}
		}

		return true;
	}

	private shouldShowActivityBar(): boolean {
		if (this.shouldShowCompositeBar()) {
			return false;
		}

		return this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) !== ActivityBarPosition.HIDDEN;
	}

	protected getCompositeBarPosition(): CompositeBarPosition {
		const activityBarPosition = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		switch (activityBarPosition) {
			case ActivityBarPosition.TOP: return CompositeBarPosition.TOP;
			case ActivityBarPosition.BOTTOM: return CompositeBarPosition.BOTTOM;
			case ActivityBarPosition.HIDDEN:
			case ActivityBarPosition.DEFAULT: // noop
			default: return CompositeBarPosition.TITLE;
		}
	}

	private rememberActivityBarVisiblePosition(): void {
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
		return this.shouldShowCompositeBar() ? super.getPinnedPaneCompositeIds() : this.activityBarPart.getPinnedPaneCompositeIds();
	}

	override getVisiblePaneCompositeIds(): string[] {
		return this.shouldShowCompositeBar() ? super.getVisiblePaneCompositeIds() : this.activityBarPart.getVisiblePaneCompositeIds();
	}

	override getPaneCompositeIds(): string[] {
		return this.shouldShowCompositeBar() ? super.getPaneCompositeIds() : this.activityBarPart.getPaneCompositeIds();
	}

	async focusActivityBar(): Promise<void> {
		if (this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) === ActivityBarPosition.HIDDEN) {
			await this.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, this.getRememberedActivityBarVisiblePosition());

			this.onDidChangeActivityBarLocation();
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
				});
			}
			run(): Promise<void> {
				const value = that.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) === ActivityBarPosition.HIDDEN ? that.getRememberedActivityBarVisiblePosition() : ActivityBarPosition.HIDDEN;
				return that.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, value);
			}
		}));
	}

	toJSON(): object {
		return {
			type: Parts.SIDEBAR_PART
		};
	}
}

registerThemingParticipant((theme, collector) => {
	// Top (Title & Header)
	const activeForegroundTop = theme.getColor(ACTIVITY_BAR_TOP_FOREGROUND);
	if (activeForegroundTop) {
		collector.addRule(`
			.monaco-workbench .part.sidebar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .action-label.codicon,
			.monaco-workbench .part.sidebar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .action-label.codicon {
				color: ${activeForegroundTop} !important;
				position: relative !important;
				z-index: 1 !important;
			}
			.monaco-workbench .part.sidebar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .action-label.uri-icon,
			.monaco-workbench .part.sidebar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .action-label.uri-icon {
				background-color: ${activeForegroundTop} !important;
				position: relative !important;
				z-index: 1 !important;
			}
		`);
	}

	const inactiveForegroundTop = theme.getColor(ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND);
	if (inactiveForegroundTop) {
		collector.addRule(`
			.monaco-workbench .part.sidebar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:not(.checked) .action-label.codicon,
			.monaco-workbench .part.sidebar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:not(.checked) .action-label.codicon {
				color: ${inactiveForegroundTop} !important;
				position: relative !important;
				z-index: 1 !important;
			}
			.monaco-workbench .part.sidebar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:not(.checked) .action-label.uri-icon,
			.monaco-workbench .part.sidebar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:not(.checked) .action-label.uri-icon {
				background-color: ${inactiveForegroundTop} !important;
				position: relative !important;
				z-index: 1 !important;
			}
		`);
	}

	const hoverBackgroundTop = theme.getColor(ACTIVITY_BAR_TOP_HOVER_BACKGROUND);
	if (hoverBackgroundTop) {
		collector.addRule(`
			.monaco-workbench .part.sidebar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .active-item-indicator,
			.monaco-workbench .part.sidebar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .active-item-indicator {
				background-color: ${hoverBackgroundTop} !important;
				z-index: 0;
			}
		`);
	}

	const hoverForegroundTop = theme.getColor(ACTIVITY_BAR_TOP_HOVER_FOREGROUND);
	if (hoverForegroundTop) {
		collector.addRule(`
			.monaco-workbench .part.sidebar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .action-label.codicon,
			.monaco-workbench .part.sidebar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked:hover .action-label.codicon,
			.monaco-workbench .part.sidebar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .action-label.codicon,
			.monaco-workbench .part.sidebar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked:hover .action-label.codicon {
				color: ${hoverForegroundTop} !important;
				position: relative !important;
				z-index: 1 !important;
			}
			.monaco-workbench .part.sidebar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .action-label.uri-icon,
			.monaco-workbench .part.sidebar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked:hover .action-label.uri-icon,
			.monaco-workbench .part.sidebar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .action-label.uri-icon,
			.monaco-workbench .part.sidebar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked:hover .action-label.uri-icon {
				background-color: ${hoverForegroundTop} !important;
				position: relative !important;
				z-index: 1 !important;
			}
		`);
	}

	// Active/Click state for Top
	const activeBackgroundTop = theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BACKGROUND);
	if (activeBackgroundTop) {
		collector.addRule(`
			.monaco-workbench .part.sidebar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:active .active-item-indicator,
			.monaco-workbench .part.sidebar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:active .active-item-indicator {
				background-color: ${activeBackgroundTop} !important;
				z-index: 0;
			}
		`);
	}

	const activeBorderTop = theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BORDER);
	if (activeBorderTop) {
		collector.addRule(`
			.monaco-workbench .part.sidebar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:active .active-item-indicator:before,
			.monaco-workbench .part.sidebar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:active .active-item-indicator:before {
				border-bottom-color: ${activeBorderTop};
			}
		`);
	}

	// Bottom (Footer)
	const activeForegroundBottom = theme.getColor(ACTIVITY_BAR_BOTTOM_FOREGROUND);
	if (activeForegroundBottom) {
		collector.addRule(`
			.monaco-workbench .part.sidebar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .action-label.codicon {
				color: ${activeForegroundBottom} !important;
				position: relative !important;
				z-index: 1 !important;
			}
			.monaco-workbench .part.sidebar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .action-label.uri-icon {
				background-color: ${activeForegroundBottom} !important;
				position: relative !important;
				z-index: 1 !important;
			}
		`);
	}

	const inactiveForegroundBottom = theme.getColor(ACTIVITY_BAR_BOTTOM_INACTIVE_FOREGROUND);
	if (inactiveForegroundBottom) {
		collector.addRule(`
			.monaco-workbench .part.sidebar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:not(.checked) .action-label.codicon {
				color: ${inactiveForegroundBottom} !important;
				position: relative !important;
				z-index: 1 !important;
			}
			.monaco-workbench .part.sidebar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:not(.checked) .action-label.uri-icon {
				background-color: ${inactiveForegroundBottom} !important;
				position: relative !important;
				z-index: 1 !important;
			}
		`);
	}

	const hoverBackgroundBottom = theme.getColor(ACTIVITY_BAR_BOTTOM_HOVER_BACKGROUND);
	if (hoverBackgroundBottom) {
		collector.addRule(`
			.monaco-workbench .part.sidebar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .active-item-indicator {
				background-color: ${hoverBackgroundBottom} !important;
				z-index: 0;
			}
		`);
	}

	const hoverForegroundBottom = theme.getColor(ACTIVITY_BAR_BOTTOM_HOVER_FOREGROUND);
	if (hoverForegroundBottom) {
		collector.addRule(`
			.monaco-workbench .part.sidebar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .action-label.codicon,
			.monaco-workbench .part.sidebar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked:hover .action-label.codicon {
				color: ${hoverForegroundBottom} !important;
				position: relative !important;
				z-index: 1 !important;
			}
			.monaco-workbench .part.sidebar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .action-label.uri-icon,
			.monaco-workbench .part.sidebar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked:hover .action-label.uri-icon {
				background-color: ${hoverForegroundBottom} !important;
				position: relative !important;
				z-index: 1 !important;
			}
		`);
	}

	// Active/Click state for Bottom
	const activeBackgroundBottom = theme.getColor(ACTIVITY_BAR_BOTTOM_ACTIVE_BACKGROUND);
	if (activeBackgroundBottom) {
		collector.addRule(`
			.monaco-workbench .part.sidebar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:active .active-item-indicator {
				background-color: ${activeBackgroundBottom} !important;
				z-index: 0;
			}
		`);
	}

	const activeBorderBottom = theme.getColor(ACTIVITY_BAR_BOTTOM_ACTIVE_BORDER);
	if (activeBorderBottom) {
		collector.addRule(`
			.monaco-workbench .part.sidebar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:active .active-item-indicator:before {
				border-bottom-color: ${activeBorderBottom};
			}
		`);
	}
});
