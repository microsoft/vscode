/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/panelpart';
import { localize } from 'vs/nls';
import { IAction, Separator, SubmenuAction, toAction } from 'vs/base/common/actions';
import { ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { ActivePanelContext, PanelFocusContext } from 'vs/workbench/common/contextkeys';
import { IWorkbenchLayoutService, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TogglePanelAction } from 'vs/workbench/browser/parts/panel/panelActions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { PANEL_BACKGROUND, PANEL_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_INACTIVE_TITLE_FOREGROUND, PANEL_ACTIVE_TITLE_BORDER, PANEL_DRAG_AND_DROP_BORDER } from 'vs/workbench/common/theme';
import { contrastBorder, badgeBackground, badgeForeground } from 'vs/platform/theme/common/colorRegistry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Dimension } from 'vs/base/browser/dom';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { assertIsDefined } from 'vs/base/common/types';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { AbstractPaneCompositePart, CompositeBarPosition } from 'vs/workbench/browser/parts/paneCompositePart';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IPaneCompositeBarOptions } from 'vs/workbench/browser/parts/paneCompositeBar';
import { IHoverService } from 'vs/platform/hover/browser/hover';

export class PanelPart extends AbstractPaneCompositePart {

	//#region IView

	readonly minimumWidth: number = 300;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 77;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

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

	//#endregion

	static readonly activePanelSettingsKey = 'workbench.panelpart.activepanelid';

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
	) {
		super(
			Parts.PANEL_PART,
			{ hasTitle: true },
			PanelPart.activePanelSettingsKey,
			ActivePanelContext.bindTo(contextKeyService),
			PanelFocusContext.bindTo(contextKeyService),
			'panel',
			'panel',
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
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertIsDefined(this.getContainer());
		container.style.backgroundColor = this.getColor(PANEL_BACKGROUND) || '';
		const borderColor = this.getColor(PANEL_BORDER) || this.getColor(contrastBorder) || '';
		container.style.borderLeftColor = borderColor;
		container.style.borderRightColor = borderColor;
		container.style.borderBottomColor = borderColor;

		const title = this.getTitleArea();
		if (title) {
			title.style.borderTopColor = this.getColor(PANEL_BORDER) || this.getColor(contrastBorder) || '';
		}
	}

	protected getCompositeBarOptions(): IPaneCompositeBarOptions {
		return {
			partContainerClass: 'panel',
			pinnedViewContainersKey: 'workbench.panel.pinnedPanels',
			placeholderViewContainersKey: 'workbench.panel.placeholderPanels',
			viewContainersWorkspaceStateKey: 'workbench.panel.viewContainersWorkspaceState',
			icon: false,
			orientation: ActionsOrientation.HORIZONTAL,
			recomputeSizes: true,
			activityHoverOptions: {
				position: () => this.layoutService.getPanelPosition() === Position.BOTTOM && !this.layoutService.isPanelMaximized() ? HoverPosition.ABOVE : HoverPosition.BELOW,
			},
			fillExtraContextMenuActions: actions => this.fillExtraContextMenuActions(actions),
			compositeSize: 0,
			iconSize: 16,
			overflowActionSize: 44,
			colors: theme => ({
				activeBackgroundColor: theme.getColor(PANEL_BACKGROUND), // Background color for overflow action
				inactiveBackgroundColor: theme.getColor(PANEL_BACKGROUND), // Background color for overflow action
				activeBorderBottomColor: theme.getColor(PANEL_ACTIVE_TITLE_BORDER),
				activeForegroundColor: theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND),
				inactiveForegroundColor: theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND),
				badgeBackground: theme.getColor(badgeBackground),
				badgeForeground: theme.getColor(badgeForeground),
				dragAndDropBorder: theme.getColor(PANEL_DRAG_AND_DROP_BORDER)
			})
		};
	}

	private fillExtraContextMenuActions(actions: IAction[]): void {
		const panelPositionMenu = this.menuService.getMenuActions(MenuId.PanelPositionMenu, this.contextKeyService, { shouldForwardArgs: true });
		const panelAlignMenu = this.menuService.getMenuActions(MenuId.PanelAlignmentMenu, this.contextKeyService, { shouldForwardArgs: true });
		const positionActions: IAction[] = [];
		const alignActions: IAction[] = [];
		createAndFillInContextMenuActions(panelPositionMenu, { primary: [], secondary: positionActions });
		createAndFillInContextMenuActions(panelAlignMenu, { primary: [], secondary: alignActions });

		actions.push(...[
			new Separator(),
			new SubmenuAction('workbench.action.panel.position', localize('panel position', "Panel Position"), positionActions),
			new SubmenuAction('workbench.action.panel.align', localize('align panel', "Align Panel"), alignActions),
			toAction({ id: TogglePanelAction.ID, label: localize('hidePanel', "Hide Panel"), run: () => this.commandService.executeCommand(TogglePanelAction.ID) })
		]);
	}

	override layout(width: number, height: number, top: number, left: number): void {
		let dimensions: Dimension;
		switch (this.layoutService.getPanelPosition()) {
			case Position.RIGHT:
				dimensions = new Dimension(width - 1, height); // Take into account the 1px border when layouting
				break;
			case Position.TOP:
				dimensions = new Dimension(width, height - 1); // Take into account the 1px border when layouting
				break;
			default:
				dimensions = new Dimension(width, height);
				break;
		}

		// Layout contents
		super.layout(dimensions.width, dimensions.height, top, left);
	}

	protected override shouldShowCompositeBar(): boolean {
		return true;
	}

	protected getCompositeBarPosition(): CompositeBarPosition {
		return CompositeBarPosition.TITLE;
	}

	toJSON(): object {
		return {
			type: Parts.PANEL_PART
		};
	}
}
