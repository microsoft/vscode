/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { AuxiliaryBarVisibleContext } from 'vs/workbench/common/contextkeys';
import { ViewContainerLocation, ViewContainerLocationToString } from 'vs/workbench/common/views';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyCodeUtils, KeyMod, KeyModUtils } from 'vs/base/common/keyCodes';
import { mainWindow } from 'vs/base/browser/window';
import { ICommandService } from 'vs/platform/commands/common/commands';

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
					primary: KeyMod.CtrlCmd | KeyCode.Semicolon
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
			group: '0_workbench_toggles',
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
			group: '0_workbench_toggles',
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

class FocusPearAIExtensionAction extends Action2 {
	static readonly ID = 'workbench.action.focusPearAIExtension';
	static readonly LABEL = localize2(
		"focusPearAIExtension",
		"Focus into PearAI Extension",
	);

	constructor() {
		super({
			id: FocusPearAIExtensionAction.ID,
			title: FocusPearAIExtensionAction.LABEL,
			category: Categories.View,
			f1: true,
			// keybinding: do not add keybinding CTRL/CMD L here, it comes from pearai extension
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		// focus pearai extension
		const commandService = accessor.get(ICommandService);
		commandService.executeCommand('pearai.focusContinueInput');
	}
}

registerAction2(FocusPearAIExtensionAction);

MenuRegistry.appendMenuItems([
	{
		id: MenuId.LayoutControlMenu,
		item: {
			group: '0_workbench_toggles',
			command: {
				id: FocusPearAIExtensionAction.ID,
				title: `New Chat (${KeyModUtils.keyModToString(KeyMod.CtrlCmd)} + ${KeyCodeUtils.toString(KeyCode.KeyL)})`,
			},
			order: -1,
		},
	},
]);

// Following is a only PearAI related action, need to refactor these type of actions to separate file
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';
import { IProductService } from 'vs/platform/product/common/productService';

class OpenPearAIDocsAction extends Action2 {
	static readonly ID = 'workbench.action.openPearAIDocs';
	static readonly LABEL = localize2(
		"openPearAIDocs",
		"Open PearAI Documentation",
	);

	constructor() {
		super({
			id: OpenPearAIDocsAction.ID,
			title: OpenPearAIDocsAction.LABEL,
			category: Categories.Help,
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		const productService = accessor.get(IProductService);
		if (!productService.pearAILinks?.docs) {
			return;
		}
		await openerService.open(URI.parse(productService.pearAILinks?.docs));
	}
}

registerAction2(OpenPearAIDocsAction);

MenuRegistry.appendMenuItems([
	{
		id: MenuId.CommandCenter,
		item: {
			command: {
				id: OpenPearAIDocsAction.ID,
				title: 'Docs',
			},
			order: 150,
		},
	},
]);
