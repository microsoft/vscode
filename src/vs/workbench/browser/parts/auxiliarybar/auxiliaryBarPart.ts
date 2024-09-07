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
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ActiveAuxiliaryContext, AuxiliaryBarFocusContext } from '../../../common/contextkeys.js';
import { ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_TOP_ACTIVE_BORDER, ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_TOP_FOREGROUND, ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND, PANEL_ACTIVE_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_DRAG_AND_DROP_BORDER, PANEL_INACTIVE_TITLE_FOREGROUND, SIDE_BAR_BACKGROUND, SIDE_BAR_BORDER, SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ActivityBarPosition, IWorkbenchLayoutService, LayoutSettings, Parts, Position } from '../../../services/layout/browser/layoutService.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IAction, Separator, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { ToggleAuxiliaryBarAction } from './auxiliaryBarActions.js';
import { assertIsDefined } from '../../../../base/common/types.js';
import { LayoutPriority } from '../../../../base/browser/ui/splitview/splitview.js';
import { ToggleSidebarPositionAction } from '../../actions/layoutActions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../paneCompositePart.js';
import { ActionsOrientation, IActionViewItem, prepareActions } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IPaneCompositeBarOptions } from '../paneCompositeBar.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createAndFillInContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { $ } from '../../../../base/browser/dom.js';
import { HiddenItemStrategy, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { CompositeMenuActions } from '../../actions.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

export class AuxiliaryBarPart extends AbstractPaneCompositePart {

	static readonly activePanelSettingsKey = 'workbench.auxiliarybar.activepanelid';
	static readonly pinnedPanelsKey = 'workbench.auxiliarybar.pinnedPanels';
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
			return;
		}

		const width = activeComposite.getOptimalWidth();
		if (typeof width !== 'number') {
			return;
		}

		return Math.max(width, 300);
	}

	readonly priority = LayoutPriority.Low;

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
				borderWidth: () => (this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder)) ? 1 : 0,
			},
			AuxiliaryBarPart.activePanelSettingsKey,
			ActiveAuxiliaryContext.bindTo(contextKeyService),
			AuxiliaryBarFocusContext.bindTo(contextKeyService),
			'auxiliarybar',
			'auxiliarybar',
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

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
				this.onDidChangeActivityBarLocation();
			}
		}));
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

		const container = assertIsDefined(this.getContainer());
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
	}

	protected getCompositeBarOptions(): IPaneCompositeBarOptions {
		const $this = this;
		return {
			partContainerClass: 'auxiliarybar',
			pinnedViewContainersKey: AuxiliaryBarPart.pinnedPanelsKey,
			placeholderViewContainersKey: AuxiliaryBarPart.placeholdeViewContainersKey,
			viewContainersWorkspaceStateKey: AuxiliaryBarPart.viewContainersWorkspaceStateKey,
			icon: true,
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
			colors: theme => ({
				activeBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				inactiveBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				get activeBorderBottomColor() { return $this.getCompositeBarPosition() === CompositeBarPosition.TITLE ? theme.getColor(PANEL_ACTIVE_TITLE_BORDER) : theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BORDER); },
				get activeForegroundColor() { return $this.getCompositeBarPosition() === CompositeBarPosition.TITLE ? theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND) : theme.getColor(ACTIVITY_BAR_TOP_FOREGROUND); },
				get inactiveForegroundColor() { return $this.getCompositeBarPosition() === CompositeBarPosition.TITLE ? theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND) : theme.getColor(ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND); },
				badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
				badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
				get dragAndDropBorder() { return $this.getCompositeBarPosition() === CompositeBarPosition.TITLE ? theme.getColor(PANEL_DRAG_AND_DROP_BORDER) : theme.getColor(ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER); }
			}),
			compact: true
		};
	}

	private fillExtraContextMenuActions(actions: IAction[]): void {
		const currentPositionRight = this.layoutService.getSideBarPosition() === Position.LEFT;
		const viewsSubmenuAction = this.getViewsSubmenuAction();
		if (viewsSubmenuAction) {
			actions.push(new Separator());
			actions.push(viewsSubmenuAction);
		}

		const activityBarPositionMenu = this.menuService.getMenuActions(MenuId.ActivityBarPositionMenu, this.contextKeyService, { shouldForwardArgs: true, renderShortTitle: true });
		const positionActions: IAction[] = [];
		createAndFillInContextMenuActions(activityBarPositionMenu, { primary: [], secondary: positionActions });

		actions.push(...[
			new Separator(),
			new SubmenuAction('workbench.action.panel.position', localize('activity bar position', "Activity Bar Position"), positionActions),
			toAction({ id: ToggleSidebarPositionAction.ID, label: currentPositionRight ? localize('move second side bar left', "Move Secondary Side Bar Left") : localize('move second side bar right', "Move Secondary Side Bar Right"), run: () => this.commandService.executeCommand(ToggleSidebarPositionAction.ID) }),
			toAction({ id: ToggleAuxiliaryBarAction.ID, label: localize('hide second side bar', "Hide Secondary Side Bar"), run: () => this.commandService.executeCommand(ToggleAuxiliaryBarAction.ID) })
		]);
	}

	protected shouldShowCompositeBar(): boolean {
		return this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION) !== ActivityBarPosition.HIDDEN;
	}

	// TODO@benibenj chache this
	protected getCompositeBarPosition(): CompositeBarPosition {
		const activityBarPosition = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		switch (activityBarPosition) {
			case ActivityBarPosition.TOP: return CompositeBarPosition.TOP;
			case ActivityBarPosition.BOTTOM: return CompositeBarPosition.BOTTOM;
			case ActivityBarPosition.HIDDEN: return CompositeBarPosition.TITLE;
			case ActivityBarPosition.DEFAULT: return CompositeBarPosition.TITLE;
			default: return CompositeBarPosition.TITLE;
		}
	}

	protected override createHeaderArea() {
		const headerArea = super.createHeaderArea();
		const globalHeaderContainer = $('.auxiliary-bar-global-header');

		// Add auxillary header action
		const menu = this.headerFooterCompositeBarDispoables.add(this.instantiationService.createInstance(CompositeMenuActions, MenuId.AuxiliaryBarHeader, undefined, undefined));

		const toolBar = this.headerFooterCompositeBarDispoables.add(this.instantiationService.createInstance(WorkbenchToolBar, globalHeaderContainer, {
			actionViewItemProvider: (action, options) => this.headerActionViewItemProvider(action, options),
			orientation: ActionsOrientation.HORIZONTAL,
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
		}));

		toolBar.setActions(prepareActions(menu.getPrimaryActions()));
		this.headerFooterCompositeBarDispoables.add(menu.onDidChange(() => toolBar.setActions(prepareActions(menu.getPrimaryActions()))));

		headerArea.appendChild(globalHeaderContainer);
		return headerArea;
	}

	private headerActionViewItemProvider(action: IAction, options: IActionViewItemOptions): IActionViewItem | undefined {
		if (action.id === ToggleAuxiliaryBarAction.ID) {
			return this.instantiationService.createInstance(ActionViewItem, undefined, action, options);
		}

		return undefined;
	}

	override toJSON(): object {
		return {
			type: Parts.AUXILIARYBAR_PART
		};
	}
}
