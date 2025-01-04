/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { AuxiliaryBarVisibleContext } from '../../../common/contextkeys.js';
import { ViewContainerLocation, ViewContainerLocationToString } from '../../../common/views.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { SwitchCompositeViewAction } from '../compositeBarActions.js';

const auxiliaryBarRightIcon = registerIcon('auxiliarybar-right-layout-icon', Codicon.layoutSidebarRight, localize('toggleAuxiliaryIconRight', 'Icon to toggle the auxiliary bar off in its right position.'));
const auxiliaryBarRightOffIcon = registerIcon('auxiliarybar-right-off-layout-icon', Codicon.layoutSidebarRightOff, localize('toggleAuxiliaryIconRightOn', 'Icon to toggle the auxiliary bar on in its right position.'));
const auxiliaryBarLeftIcon = registerIcon('auxiliarybar-left-layout-icon', Codicon.layoutSidebarLeft, localize('toggleAuxiliaryIconLeft', 'Icon to toggle the auxiliary bar in its left position.'));
const auxiliaryBarLeftOffIcon = registerIcon('auxiliarybar-left-off-layout-icon', Codicon.layoutSidebarLeftOff, localize('toggleAuxiliaryIconLeftOn', 'Icon to toggle the auxiliary bar on in its left position.'));

export class ToggleAuxiliaryBarAction extends Action2 {

	static readonly ID = 'workbench.action.toggleAuxiliaryBar';
	static readonly LABEL = localize2('toggleAuxiliaryBar', "Toggle Secondary Side Bar Visibility");

	constructor() {
		super({
			id: ToggleAuxiliaryBarAction.ID,
			title: ToggleAuxiliaryBarAction.LABEL,
			toggled: {
				condition: AuxiliaryBarVisibleContext,
				title: localize('secondary sidebar', "Secondary Side Bar"),
				mnemonicTitle: localize({ key: 'secondary sidebar mnemonic', comment: ['&& denotes a mnemonic'] }, "Secondary Si&&de Bar"),
			},

			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Semicolon,
				linux: {
					primary: KeyMod.CtrlCmd | KeyCode.Semicolon
				},
				win: {
					primary: KeyMod.Alt | KeyCode.Semicolon
				},
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.Semicolon
				}
			},
			menu: [
				{
					id: MenuId.LayoutControlMenuSubmenu,
					group: '0_workbench_layout',
					order: 1
				},
				{
					id: MenuId.MenubarAppearanceMenu,
					group: '2_workbench_layout',
					order: 2
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.setPartHidden(layoutService.isVisible(Parts.AUXILIARYBAR_PART), Parts.AUXILIARYBAR_PART);
	}
}

registerAction2(ToggleAuxiliaryBarAction);

registerAction2(class FocusAuxiliaryBarAction extends Action2 {

	static readonly ID = 'workbench.action.focusAuxiliaryBar';
	static readonly LABEL = localize2('focusAuxiliaryBar', "Focus into Secondary Side Bar");

	constructor() {
		super({
			id: FocusAuxiliaryBarAction.ID,
			title: FocusAuxiliaryBarAction.LABEL,
			category: Categories.View,
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		const layoutService = accessor.get(IWorkbenchLayoutService);

		// Show auxiliary bar
		if (!layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		}

		// Focus into active composite
		const composite = paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar);
		composite?.focus();
	}
});

MenuRegistry.appendMenuItems([
	{
		id: MenuId.LayoutControlMenu,
		item: {
			group: '2_pane_toggles',
			command: {
				id: ToggleAuxiliaryBarAction.ID,
				title: localize('toggleSecondarySideBar', "Toggle Secondary Side Bar"),
				toggled: { condition: AuxiliaryBarVisibleContext, icon: auxiliaryBarLeftIcon },
				icon: auxiliaryBarLeftOffIcon,
			},
			when: ContextKeyExpr.and(ContextKeyExpr.or(ContextKeyExpr.equals('config.workbench.layoutControl.type', 'toggles'), ContextKeyExpr.equals('config.workbench.layoutControl.type', 'both')), ContextKeyExpr.equals('config.workbench.sideBar.location', 'right')),
			order: 0
		}
	}, {
		id: MenuId.LayoutControlMenu,
		item: {
			group: '2_pane_toggles',
			command: {
				id: ToggleAuxiliaryBarAction.ID,
				title: localize('toggleSecondarySideBar', "Toggle Secondary Side Bar"),
				toggled: { condition: AuxiliaryBarVisibleContext, icon: auxiliaryBarRightIcon },
				icon: auxiliaryBarRightOffIcon,
			},
			when: ContextKeyExpr.and(ContextKeyExpr.or(ContextKeyExpr.equals('config.workbench.layoutControl.type', 'toggles'), ContextKeyExpr.equals('config.workbench.layoutControl.type', 'both')), ContextKeyExpr.equals('config.workbench.sideBar.location', 'left')),
			order: 2
		}
	}, {
		id: MenuId.ViewTitleContext,
		item: {
			group: '3_workbench_layout_move',
			command: {
				id: ToggleAuxiliaryBarAction.ID,
				title: localize2('hideAuxiliaryBar', 'Hide Secondary Side Bar'),
			},
			when: ContextKeyExpr.and(AuxiliaryBarVisibleContext, ContextKeyExpr.equals('viewLocation', ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar))),
			order: 2
		}
	}
]);

registerAction2(class extends SwitchCompositeViewAction {
	constructor() {
		super({
			id: 'workbench.action.previousAuxiliaryBarView',
			title: localize2('previousAuxiliaryBarView', 'Previous Secondary Side Bar View'),
			category: Categories.View,
			f1: true
		}, ViewContainerLocation.AuxiliaryBar, -1);
	}
});

registerAction2(class extends SwitchCompositeViewAction {
	constructor() {
		super({
			id: 'workbench.action.nextAuxiliaryBarView',
			title: localize2('nextAuxiliaryBarView', 'Next Secondary Side Bar View'),
			category: Categories.View,
			f1: true
		}, ViewContainerLocation.AuxiliaryBar, 1);
	}
});

export class ResizeAuxiliaryBarWidthAction extends Action2 {
	static readonly ID = 'workbench.action.resizeAuxiliaryBarWidth';
	static readonly LABEL = localize2('resizeAuxiliaryBarWidth', "Resize Auxiliary Bar Width");

	// Tracking the previous width of the aux bar and visibility of the left side bar
	static _previousAuxiliaryBarWidth: number | null = null;
	static _previousSideBarVisibility: boolean | null = null;

	constructor() {
		super({
			id: ResizeAuxiliaryBarWidthAction.ID,
			title: ResizeAuxiliaryBarWidthAction.LABEL,
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.BracketLeft,
				linux: {
					primary: KeyMod.CtrlCmd | KeyCode.BracketLeft
				},
				win: {
					primary: KeyMod.Alt | KeyCode.BracketLeft
				},
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.BracketLeft
				}
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		// Check if the main window is available
		if (!mainWindow) {
			return;
		}

		const auxBarPart = layoutService.getContainer(mainWindow, Parts.AUXILIARYBAR_PART);
		const auxBarDimensions = auxBarPart?.getBoundingClientRect();
		const isAuxiliaryBarVisible = layoutService.isVisible(Parts.AUXILIARYBAR_PART);

		// If the auxiliary bar is not visible, or the dimensions are null, return
		if (!auxBarDimensions || !isAuxiliaryBarVisible) {
			return;
		}

		// Save the current width as the previous width if it has not been saved yet
		if (ResizeAuxiliaryBarWidthAction._previousAuxiliaryBarWidth === null) {
			ResizeAuxiliaryBarWidthAction._previousAuxiliaryBarWidth = auxBarDimensions.width;
			ResizeAuxiliaryBarWidthAction._previousSideBarVisibility = layoutService.isVisible(Parts.SIDEBAR_PART);
		}

		// Set a minimum width for the auxiliary bar, unless its greater than a % of the window width
		const PSEUDO_MINIMUM_AUX_BAR_WIDTH = 600;

		// Calculate the minimum width for the auxiliary bar
		// 70% of the window width is the maximum width
		const maxWidth = (0.7 * mainWindow.innerWidth);
		// The minimum width is the maximum width, unless it is less than the max of (previous width * 2) or the predetermined minimum width
		const minWidth = Math.min(maxWidth, Math.max(ResizeAuxiliaryBarWidthAction._previousAuxiliaryBarWidth * 2, PSEUDO_MINIMUM_AUX_BAR_WIDTH));

		// If the current width is less than or equal to the previous width, expand the auxiliary bar
		if (auxBarDimensions.width <= ResizeAuxiliaryBarWidthAction._previousAuxiliaryBarWidth) {
			// Expand to the calculated minWidth
			layoutService.resizePart(Parts.AUXILIARYBAR_PART, (minWidth - auxBarDimensions.width), 0);
			// Hide the left side bar if it was previously visible
			layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
		} else {
			// If the current width is greater than the previous width, collapse the auxiliary bar back to the previous width (initial width)
			layoutService.resizePart(Parts.AUXILIARYBAR_PART, (auxBarDimensions.width - ResizeAuxiliaryBarWidthAction._previousAuxiliaryBarWidth) * -1, 0);
			// Restore the left side bar to the user's previous state
			ResizeAuxiliaryBarWidthAction._previousSideBarVisibility ? layoutService.setPartHidden(false, Parts.SIDEBAR_PART) : layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
			// Reset the previous width to null after collapsing
			ResizeAuxiliaryBarWidthAction._previousAuxiliaryBarWidth = null;
		}

		return;
	}
}

registerAction2(ResizeAuxiliaryBarWidthAction);
