/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/auxiliaryBarPart';
import { localize } from 'vs/nls';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ActiveAuxiliaryContext, AuxiliaryBarFocusContext } from 'vs/workbench/common/contextkeys';
import { ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, PANEL_ACTIVE_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_DRAG_AND_DROP_BORDER, PANEL_INACTIVE_TITLE_FOREGROUND, SIDE_BAR_BACKGROUND, SIDE_BAR_BORDER, SIDE_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchLayoutService, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { IAction, Separator, toAction } from 'vs/base/common/actions';
import { ToggleAuxiliaryBarAction } from 'vs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions';
import { assertIsDefined } from 'vs/base/common/types';
import { LayoutPriority } from 'vs/base/browser/ui/splitview/splitview';
import { ToggleSidebarPositionAction } from 'vs/workbench/browser/actions/layoutActions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { AbstractPaneCompositePart } from 'vs/workbench/browser/parts/paneCompositePart';
import { ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { IPaneCompositeBarOptions } from 'vs/workbench/browser/parts/paneCompositeBar';
import { IMenuService } from 'vs/platform/actions/common/actions';

export class AuxiliaryBarPart extends AbstractPaneCompositePart {

	static readonly activePanelSettingsKey = 'workbench.auxiliarybar.activepanelid';
	static readonly pinnedPanelsKey = 'workbench.auxiliarybar.pinnedPanels';
	static readonly placeholdeViewContainersKey = 'workbench.auxiliarybar.placeholderPanels';
	static readonly viewContainersWorkspaceStateKey = 'workbench.auxiliarybar.viewContainersWorkspaceState';

	// Use the side bar dimensions
	override readonly minimumWidth: number = 260;
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

	readonly priority: LayoutPriority = LayoutPriority.Low;

	constructor(
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService extensionService: IExtensionService,
		// MEMBRANE: rm private modifier for command service. See superclass CompositePart
		@ICommandService commandService: ICommandService,
		@IMenuService menuService: IMenuService,
	) {
		super(
			Parts.AUXILIARYBAR_PART,
			{
				// MEMBRANE: hide title area for auxiliary bar
				hasTitle: false,
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
			instantiationService,
			themeService,
			viewDescriptorService,
			contextKeyService,
			extensionService,
			menuService,
			// MEMBRANE: command service added to superclass CompositePart
			commandService,
		);
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
		return {
			partContainerClass: 'auxiliarybar',
			pinnedViewContainersKey: AuxiliaryBarPart.pinnedPanelsKey,
			placeholderViewContainersKey: AuxiliaryBarPart.placeholdeViewContainersKey,
			viewContainersWorkspaceStateKey: AuxiliaryBarPart.viewContainersWorkspaceStateKey,
			icon: true,
			orientation: ActionsOrientation.HORIZONTAL,
			recomputeSizes: true,
			activityHoverOptions: {
				position: () => HoverPosition.BELOW,
			},
			fillExtraContextMenuActions: actions => this.fillExtraContextMenuActions(actions),
			compositeSize: 0,
			iconSize: 16,
			overflowActionSize: 44,
			colors: theme => ({
				activeBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				inactiveBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				activeBorderBottomColor: theme.getColor(PANEL_ACTIVE_TITLE_BORDER),
				activeForegroundColor: theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND),
				inactiveForegroundColor: theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND),
				badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
				badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
				dragAndDropBorder: theme.getColor(PANEL_DRAG_AND_DROP_BORDER)
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
		actions.push(...[
			new Separator(),
			toAction({ id: ToggleSidebarPositionAction.ID, label: currentPositionRight ? localize('move second side bar left', "Move Secondary Side Bar Left") : localize('move second side bar right', "Move Secondary Side Bar Right"), run: () => this.commandService.executeCommand(ToggleSidebarPositionAction.ID) }),
			toAction({ id: ToggleAuxiliaryBarAction.ID, label: localize('hide second side bar', "Hide Secondary Side Bar"), run: () => this.commandService.executeCommand(ToggleAuxiliaryBarAction.ID) })
		]);
	}

	protected shouldShowCompositeBar(): boolean {
		return true;
	}

	override toJSON(): object {
		return {
			type: Parts.AUXILIARYBAR_PART
		};
	}
}
