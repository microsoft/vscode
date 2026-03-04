/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/auxiliaryBarPart.css';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService, registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { ActiveAuxiliaryContext, AuxiliaryBarFocusContext } from '../../../common/contextkeys.js';
import { ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_TOP_ACTIVE_BORDER, ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_TOP_FOREGROUND, ACTIVITY_BAR_TOP_HOVER_BACKGROUND, ACTIVITY_BAR_TOP_HOVER_FOREGROUND, ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND, ACTIVITY_BAR_TOP_BACKGROUND, ACTIVITY_BAR_TOP_ACTIVE_BACKGROUND, ACTIVITY_BAR_BOTTOM_BACKGROUND, ACTIVITY_BAR_BOTTOM_ACTIVE_BACKGROUND, ACTIVITY_BAR_BOTTOM_FOREGROUND, ACTIVITY_BAR_BOTTOM_ACTIVE_BORDER, ACTIVITY_BAR_BOTTOM_HOVER_BACKGROUND, ACTIVITY_BAR_BOTTOM_HOVER_FOREGROUND, ACTIVITY_BAR_BOTTOM_INACTIVE_FOREGROUND, ACTIVITY_BAR_BOTTOM_DRAG_AND_DROP_BORDER, PANEL_ACTIVE_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_DRAG_AND_DROP_BORDER, PANEL_INACTIVE_TITLE_FOREGROUND, SIDE_BAR_BACKGROUND, SIDE_BAR_BORDER, SIDE_BAR_TITLE_BORDER, SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ActivityBarPosition, IWorkbenchLayoutService, LayoutSettings, Parts, Position } from '../../../services/layout/browser/layoutService.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IAction, Separator, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { ToggleAuxiliaryBarAction } from './auxiliaryBarActions.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { LayoutPriority } from '../../../../base/browser/ui/splitview/splitview.js';
import { ToggleSidebarPositionAction } from '../../actions/layoutActions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../paneCompositePart.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IPaneCompositeBarOptions } from '../paneCompositeBar.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { VisibleViewContainersTracker } from '../visibleViewContainersTracker.js';
import { Extensions } from '../../panecomposite.js';

interface IAuxiliaryBarPartConfiguration {
	position: ActivityBarPosition;

	canShowLabels: boolean;
	showLabels: boolean;
}

export class AuxiliaryBarPart extends AbstractPaneCompositePart {

	static readonly activeViewSettingsKey = 'workbench.auxiliarybar.activepanelid';
	static readonly pinnedViewsKey = 'workbench.auxiliarybar.pinnedPanels';
	static readonly placeholdeViewContainersKey = 'workbench.auxiliarybar.placeholderPanels';
	static readonly viewContainersWorkspaceStateKey = 'workbench.auxiliarybar.viewContainersWorkspaceState';

	// Use the side bar dimensions
	override readonly minimumWidth: number = 170;
	override readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	override readonly minimumHeight: number = 0;
	override readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	get preferredHeight(): number | undefined {
		// Don't worry about titlebar or statusbar visibility
		// The difference is minimal and keeps this function clean
		return this.layoutService.mainContainerDimension.height * 0.4;
	}

	get preferredWidth(): number | undefined {
		const activeComposite = this.getActivePaneComposite();

		if (!activeComposite) {
			return undefined;
		}

		const width = activeComposite.getOptimalWidth();
		if (typeof width !== 'number') {
			return undefined;
		}

		return Math.max(width, 300);
	}

	readonly priority = LayoutPriority.Low;

	private configuration: IAuxiliaryBarPartConfiguration;
	private readonly visibleViewContainersTracker: VisibleViewContainersTracker;

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
		@ICommandService private commandService: ICommandService,
		@IMenuService menuService: IMenuService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(
			Parts.AUXILIARYBAR_PART,
			{
				hasTitle: true,
				trailingSeparator: true,
				borderWidth: () => (this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder)) ? 1 : 0,
			},
			AuxiliaryBarPart.activeViewSettingsKey,
			ActiveAuxiliaryContext.bindTo(contextKeyService),
			AuxiliaryBarFocusContext.bindTo(contextKeyService),
			'auxiliarybar',
			'auxiliarybar',
			undefined,
			SIDE_BAR_TITLE_BORDER,
			ViewContainerLocation.AuxiliaryBar,
			Extensions.Auxiliary,
			MenuId.AuxiliaryBarTitle,
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
		this.visibleViewContainersTracker = this._register(instantiationService.createInstance(VisibleViewContainersTracker, ViewContainerLocation.AuxiliaryBar));
		this._register(this.visibleViewContainersTracker.onDidChange((e) => this.onDidChangeAutoHideViewContainers(e)));

		this.configuration = this.resolveConfiguration();

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
				this.configuration = this.resolveConfiguration();
				this.onDidChangeActivityBarLocation();
			} else if (e.affectsConfiguration('workbench.secondarySideBar.showLabels')) {
				this.configuration = this.resolveConfiguration();
				this.updateCompositeBar(true);
			} else if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_AUTO_HIDE)) {
				this.onDidChangeActivityBarLocation();
			}
		}));
	}

	private onDidChangeAutoHideViewContainers(e: { before: number; after: number }): void {
		// Only update if auto-hide is enabled and composite bar would show
		const autoHide = this.configurationService.getValue<boolean>(LayoutSettings.ACTIVITY_BAR_AUTO_HIDE);
		if (autoHide && (this.configuration.position === ActivityBarPosition.TOP || this.configuration.position === ActivityBarPosition.BOTTOM)) {
			const visibleBefore = e.before > 1;
			const visibleAfter = e.after > 1;
			if (visibleBefore !== visibleAfter) {
				this.onDidChangeActivityBarLocation();
			}
		}
	}

	private resolveConfiguration(): IAuxiliaryBarPartConfiguration {
		const position = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);

		const canShowLabels = position !== ActivityBarPosition.TOP && position !== ActivityBarPosition.BOTTOM; // use same style as activity bar in this case
		const showLabels = canShowLabels && this.configurationService.getValue('workbench.secondarySideBar.showLabels') !== false;

		return { position, canShowLabels, showLabels };
	}

	private onDidChangeActivityBarLocation(): void {
		this.updateCompositeBar();

		const id = this.getActiveComposite()?.getId();
		if (id) {
			this.onTitleAreaUpdate(id);
		}
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertReturnsDefined(this.getContainer());
		container.style.backgroundColor = this.getColor(SIDE_BAR_BACKGROUND) || '';
		const borderColor = this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder);
		const isPositionLeft = this.layoutService.getSideBarPosition() === Position.RIGHT;

		container.style.color = this.getColor(SIDE_BAR_FOREGROUND) || '';

		container.style.borderLeftColor = borderColor ?? '';
		container.style.borderRightColor = borderColor ?? '';

		container.style.borderLeftStyle = borderColor && !isPositionLeft ? 'solid' : 'none';
		container.style.borderRightStyle = borderColor && isPositionLeft ? 'solid' : 'none';

		container.style.borderLeftWidth = borderColor && !isPositionLeft ? '1px' : '0px';
		container.style.borderRightWidth = borderColor && isPositionLeft ? '1px' : '0px';

		const activityBarPosition = this.configuration.position;
		if (this.paneCompositeBarContainer && (activityBarPosition === ActivityBarPosition.TOP || activityBarPosition === ActivityBarPosition.BOTTOM)) {
			const isTop = activityBarPosition === ActivityBarPosition.TOP;
			this.paneCompositeBarContainer.style.backgroundColor = (isTop ? this.getColor(ACTIVITY_BAR_TOP_BACKGROUND) : this.getColor(ACTIVITY_BAR_BOTTOM_BACKGROUND)) || '';
			this.paneCompositeBarContainer.style.color = (isTop ? this.getColor(ACTIVITY_BAR_TOP_FOREGROUND) : this.getColor(ACTIVITY_BAR_BOTTOM_FOREGROUND)) || '';
		}
	}

	protected getCompositeBarOptions(): IPaneCompositeBarOptions {
		const $this = this;
		return {
			partContainerClass: 'auxiliarybar',
			pinnedViewContainersKey: AuxiliaryBarPart.pinnedViewsKey,
			placeholderViewContainersKey: AuxiliaryBarPart.placeholdeViewContainersKey,
			viewContainersWorkspaceStateKey: AuxiliaryBarPart.viewContainersWorkspaceStateKey,
			icon: !this.configuration.showLabels,
			orientation: ActionsOrientation.HORIZONTAL,
			recomputeSizes: true,
			activityHoverOptions: {
				position: () => this.getCompositeBarPosition() === CompositeBarPosition.BOTTOM ? HoverPosition.ABOVE : HoverPosition.BELOW,
			},
			fillExtraContextMenuActions: actions => this.fillExtraContextMenuActions(actions),
			compositeSize: 0,
			iconSize: 16,
			// Add 10px spacing if the overflow action is visible to no confuse the user with ... between the toolbars
			get overflowActionSize() { return $this.getCompositeBarPosition() === CompositeBarPosition.TITLE ? 40 : 30; },
			colors: theme => {
				const activityBarPosition = this.configuration.position;
				const isTop = activityBarPosition === ActivityBarPosition.TOP;
				const isBottom = activityBarPosition === ActivityBarPosition.BOTTOM;

				return {
					activeBackgroundColor: isTop ? theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BACKGROUND) : (isBottom ? theme.getColor(ACTIVITY_BAR_BOTTOM_ACTIVE_BACKGROUND) : theme.getColor(SIDE_BAR_BACKGROUND)),
					inactiveBackgroundColor: isTop ? theme.getColor(ACTIVITY_BAR_TOP_BACKGROUND) : (isBottom ? theme.getColor(ACTIVITY_BAR_BOTTOM_BACKGROUND) : theme.getColor(SIDE_BAR_BACKGROUND)),
					activeBorderBottomColor: isTop ? theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BORDER) : (isBottom ? theme.getColor(ACTIVITY_BAR_BOTTOM_ACTIVE_BORDER) : theme.getColor(PANEL_ACTIVE_TITLE_BORDER)),
					activeForegroundColor: isTop ? theme.getColor(ACTIVITY_BAR_TOP_FOREGROUND) : (isBottom ? theme.getColor(ACTIVITY_BAR_BOTTOM_FOREGROUND) : theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND)),
					inactiveForegroundColor: isTop ? theme.getColor(ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND) : (isBottom ? theme.getColor(ACTIVITY_BAR_BOTTOM_INACTIVE_FOREGROUND) : theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND)),
					badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
					badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
					dragAndDropBorder: isTop ? theme.getColor(ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER) : (isBottom ? theme.getColor(ACTIVITY_BAR_BOTTOM_DRAG_AND_DROP_BORDER) : theme.getColor(PANEL_DRAG_AND_DROP_BORDER))
				};
			},
			compact: true
		};
	}

	private fillExtraContextMenuActions(actions: IAction[]): void {
		const currentPositionRight = this.layoutService.getSideBarPosition() === Position.LEFT;

		if (this.getCompositeBarPosition() === CompositeBarPosition.TITLE) {
			const viewsSubmenuAction = this.getViewsSubmenuAction();
			if (viewsSubmenuAction) {
				actions.push(new Separator());
				actions.push(viewsSubmenuAction);
			}
		}

		const activityBarPositionMenu = this.menuService.getMenuActions(MenuId.ActivityBarPositionMenu, this.contextKeyService, { shouldForwardArgs: true, renderShortTitle: true });
		const positionActions = getContextMenuActions(activityBarPositionMenu).secondary;

		const toggleShowLabelsAction = toAction({
			id: 'workbench.action.auxiliarybar.toggleShowLabels',
			label: this.configuration.showLabels ? localize('showIcons', "Show Icons") : localize('showLabels', "Show Labels"),
			enabled: this.configuration.canShowLabels,
			run: () => this.configurationService.updateValue('workbench.secondarySideBar.showLabels', !this.configuration.showLabels)
		});

		actions.push(...[
			new Separator(),
			new SubmenuAction('workbench.action.panel.position', localize('activity bar position', "Activity Bar Position"), positionActions),
			toAction({ id: ToggleSidebarPositionAction.ID, label: currentPositionRight ? localize('move second side bar left', "Move Secondary Side Bar Left") : localize('move second side bar right', "Move Secondary Side Bar Right"), run: () => this.commandService.executeCommand(ToggleSidebarPositionAction.ID) }),
			toggleShowLabelsAction,
			toAction({ id: ToggleAuxiliaryBarAction.ID, label: localize('hide second side bar', "Hide Secondary Side Bar"), run: () => this.commandService.executeCommand(ToggleAuxiliaryBarAction.ID) })
		]);
	}

	protected shouldShowCompositeBar(): boolean {
		if (this.configuration.position === ActivityBarPosition.HIDDEN) {
			return false;
		}

		// Check if auto-hide is enabled and there's only one visible view container
		// while the activity bar is configured to be top or bottom.
		if (this.configuration.position === ActivityBarPosition.TOP || this.configuration.position === ActivityBarPosition.BOTTOM) {
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
		}

		return true;
	}

	protected getCompositeBarPosition(): CompositeBarPosition {
		switch (this.configuration.position) {
			case ActivityBarPosition.TOP: return CompositeBarPosition.TOP;
			case ActivityBarPosition.BOTTOM: return CompositeBarPosition.BOTTOM;
			case ActivityBarPosition.HIDDEN: return CompositeBarPosition.TITLE;
			case ActivityBarPosition.DEFAULT: return CompositeBarPosition.TITLE;
			default: return CompositeBarPosition.TITLE;
		}
	}

	override toJSON(): object {
		return {
			type: Parts.AUXILIARYBAR_PART
		};
	}
}

registerThemingParticipant((theme, collector) => {
	// Top (Title & Header)
	const activeForegroundTop = theme.getColor(ACTIVITY_BAR_TOP_FOREGROUND);
	if (activeForegroundTop) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .action-label.codicon,
			.monaco-workbench .part.auxiliarybar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .action-label.codicon {
				color: ${activeForegroundTop} !important;
				position: relative !important;
				z-index: 1 !important;
			}
			.monaco-workbench .part.auxiliarybar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .action-label.uri-icon,
			.monaco-workbench .part.auxiliarybar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .action-label.uri-icon {
				background-color: ${activeForegroundTop} !important;
				position: relative !important;
				z-index: 1 !important;
			}
		`);
	}

	const inactiveForegroundTop = theme.getColor(ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND);
	if (inactiveForegroundTop) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:not(.checked) .action-label.codicon,
			.monaco-workbench .part.auxiliarybar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:not(.checked) .action-label.codicon {
				color: ${inactiveForegroundTop} !important;
				position: relative !important;
				z-index: 1 !important;
			}
			.monaco-workbench .part.auxiliarybar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:not(.checked) .action-label.uri-icon,
			.monaco-workbench .part.auxiliarybar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:not(.checked) .action-label.uri-icon {
				background-color: ${inactiveForegroundTop} !important;
				position: relative !important;
				z-index: 1 !important;
			}
		`);
	}

	const hoverBackgroundTop = theme.getColor(ACTIVITY_BAR_TOP_HOVER_BACKGROUND);
	if (hoverBackgroundTop) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .active-item-indicator,
			.monaco-workbench .part.auxiliarybar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .active-item-indicator {
				background-color: ${hoverBackgroundTop} !important;
				z-index: 0;
			}
		`);
	}

	const hoverForegroundTop = theme.getColor(ACTIVITY_BAR_TOP_HOVER_FOREGROUND);
	if (hoverForegroundTop) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .action-label.codicon,
			.monaco-workbench .part.auxiliarybar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked:hover .action-label.codicon,
			.monaco-workbench .part.auxiliarybar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .action-label.codicon,
			.monaco-workbench .part.auxiliarybar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked:hover .action-label.codicon {
				color: ${hoverForegroundTop} !important;
				position: relative !important;
				z-index: 1 !important;
			}
			.monaco-workbench .part.auxiliarybar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .action-label.uri-icon,
			.monaco-workbench .part.auxiliarybar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked:hover .action-label.uri-icon,
			.monaco-workbench .part.auxiliarybar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .action-label.uri-icon,
			.monaco-workbench .part.auxiliarybar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked:hover .action-label.uri-icon {
				background-color: ${hoverForegroundTop} !important;
				position: relative !important;
				z-index: 1 !important;
			}
		`);
	}

	// Active/Click state for Top position in Auxiliary Bar
	const activeBackgroundTop = theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BACKGROUND);
	if (activeBackgroundTop) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:active .active-item-indicator,
			.monaco-workbench .part.auxiliarybar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:active .active-item-indicator {
				background-color: ${activeBackgroundTop} !important;
				z-index: 0;
			}
		`);
	}

	const activeBorderTop = theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BORDER);
	if (activeBorderTop) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:active .active-item-indicator:before,
			.monaco-workbench .part.auxiliarybar > .header-or-footer.header > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:active .active-item-indicator:before {
				border-bottom-color: ${activeBorderTop};
			}
		`);
	}

	// Bottom (Footer)
	const activeForegroundBottom = theme.getColor(ACTIVITY_BAR_BOTTOM_FOREGROUND);
	if (activeForegroundBottom) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .action-label.codicon {
				color: ${activeForegroundBottom} !important;
				position: relative !important;
				z-index: 1 !important;
			}
			.monaco-workbench .part.auxiliarybar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .action-label.uri-icon {
				background-color: ${activeForegroundBottom} !important;
				position: relative !important;
				z-index: 1 !important;
			}
		`);
	}

	const inactiveForegroundBottom = theme.getColor(ACTIVITY_BAR_BOTTOM_INACTIVE_FOREGROUND);
	if (inactiveForegroundBottom) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:not(.checked) .action-label.codicon {
				color: ${inactiveForegroundBottom} !important;
				position: relative !important;
				z-index: 1 !important;
			}
			.monaco-workbench .part.auxiliarybar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:not(.checked) .action-label.uri-icon {
				background-color: ${inactiveForegroundBottom} !important;
				position: relative !important;
				z-index: 1 !important;
			}
		`);
	}

	const hoverBackgroundBottom = theme.getColor(ACTIVITY_BAR_BOTTOM_HOVER_BACKGROUND);
	if (hoverBackgroundBottom) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .active-item-indicator {
				background-color: ${hoverBackgroundBottom} !important;
				z-index: 0;
			}
		`);
	}

	const hoverForegroundBottom = theme.getColor(ACTIVITY_BAR_BOTTOM_HOVER_FOREGROUND);
	if (hoverForegroundBottom) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .action-label.codicon,
			.monaco-workbench .part.auxiliarybar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked:hover .action-label.codicon {
				color: ${hoverForegroundBottom} !important;
				position: relative !important;
				z-index: 1 !important;
			}
			.monaco-workbench .part.auxiliarybar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:hover .action-label.uri-icon,
			.monaco-workbench .part.auxiliarybar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked:hover .action-label.uri-icon {
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
			.monaco-workbench .part.auxiliarybar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:active .active-item-indicator {
				background-color: ${activeBackgroundBottom} !important;
				z-index: 0;
			}
		`);
	}

	const activeBorderBottom = theme.getColor(ACTIVITY_BAR_BOTTOM_ACTIVE_BORDER);
	if (activeBorderBottom) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .header-or-footer.footer > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:active .active-item-indicator:before {
				border-bottom-color: ${activeBorderBottom};
			}
		`);
	}
});
