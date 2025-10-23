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
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { AuxiliaryBarMaximizedContext, AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext } from '../../../common/contextkeys.js';
import { ViewContainerLocation, ViewContainerLocationToString } from '../../../common/views.js';
import { ActivityBarPosition, IWorkbenchLayoutService, LayoutSettings, Parts } from '../../../services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { SwitchCompositeViewAction } from '../compositeBarActions.js';
import { closeIcon as panelCloseIcon } from '../panel/panelActions.js';

const maximizeIcon = registerIcon('auxiliarybar-maximize', Codicon.screenFull, localize('maximizeIcon', 'Icon to maximize the secondary side bar.'));
const closeIcon = registerIcon('auxiliarybar-close', panelCloseIcon, localize('closeIcon', 'Icon to close the secondary side bar.'));

const auxiliaryBarRightIcon = registerIcon('auxiliarybar-right-layout-icon', Codicon.layoutSidebarRight, localize('toggleAuxiliaryIconRight', 'Icon to toggle the secondary side bar off in its right position.'));
const auxiliaryBarRightOffIcon = registerIcon('auxiliarybar-right-off-layout-icon', Codicon.layoutSidebarRightOff, localize('toggleAuxiliaryIconRightOn', 'Icon to toggle the secondary side bar on in its right position.'));
const auxiliaryBarLeftIcon = registerIcon('auxiliarybar-left-layout-icon', Codicon.layoutSidebarLeft, localize('toggleAuxiliaryIconLeft', 'Icon to toggle the secondary side bar in its left position.'));
const auxiliaryBarLeftOffIcon = registerIcon('auxiliarybar-left-off-layout-icon', Codicon.layoutSidebarLeftOff, localize('toggleAuxiliaryIconLeftOn', 'Icon to toggle the secondary side bar on in its left position.'));

export class ToggleAuxiliaryBarAction extends Action2 {

	static readonly ID = 'workbench.action.toggleAuxiliaryBar';
	static readonly LABEL = localize2('toggleAuxiliaryBar', "Toggle Secondary Side Bar Visibility");

	constructor() {
		super({
			id: ToggleAuxiliaryBarAction.ID,
			title: ToggleAuxiliaryBarAction.LABEL,
			toggled: {
				condition: AuxiliaryBarVisibleContext,
				title: localize('closeSecondarySideBar', 'Hide Secondary Side Bar'),
				icon: closeIcon,
				mnemonicTitle: localize({ key: 'miCloseSecondarySideBar', comment: ['&& denotes a mnemonic'] }, "&&Secondary Side Bar"),
			},
			icon: closeIcon,
			category: Categories.View,
			metadata: {
				description: localize('openAndCloseAuxiliaryBar', 'Open/Show and Close/Hide Secondary Side Bar'),
			},
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyB
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
		const isCurrentlyVisible = layoutService.isVisible(Parts.AUXILIARYBAR_PART);

		layoutService.setPartHidden(isCurrentlyVisible, Parts.AUXILIARYBAR_PART);

		// Announce visibility change to screen readers
		const alertMessage = isCurrentlyVisible
			? localize('auxiliaryBarHidden', "Secondary Side Bar hidden")
			: localize('auxiliaryBarVisible', "Secondary Side Bar shown");
		alert(alertMessage);
	}
}

registerAction2(ToggleAuxiliaryBarAction);

MenuRegistry.appendMenuItem(MenuId.AuxiliaryBarTitle, {
	command: {
		id: ToggleAuxiliaryBarAction.ID,
		title: localize('closeSecondarySideBar', 'Hide Secondary Side Bar'),
		icon: closeIcon
	},
	group: 'navigation',
	order: 2,
	when: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.DEFAULT)
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.closeAuxiliaryBar',
			title: localize2('closeSecondarySideBar', 'Hide Secondary Side Bar'),
			category: Categories.View,
			precondition: AuxiliaryBarVisibleContext,
			f1: true,
		});
	}
	run(accessor: ServicesAccessor) {
		accessor.get(IWorkbenchLayoutService).setPartHidden(true, Parts.AUXILIARYBAR_PART);
	}
});

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
			when: ContextKeyExpr.and(
				IsAuxiliaryWindowContext.negate(),
				ContextKeyExpr.or(
					ContextKeyExpr.equals('config.workbench.layoutControl.type', 'toggles'),
					ContextKeyExpr.equals('config.workbench.layoutControl.type', 'both')),
				ContextKeyExpr.equals('config.workbench.sideBar.location', 'right')
			),
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
			when: ContextKeyExpr.and(
				IsAuxiliaryWindowContext.negate(),
				ContextKeyExpr.or(
					ContextKeyExpr.equals('config.workbench.layoutControl.type', 'toggles'),
					ContextKeyExpr.equals('config.workbench.layoutControl.type', 'both')),
				ContextKeyExpr.equals('config.workbench.sideBar.location', 'left')
			),
			order: 2
		}
	}, {
		id: MenuId.ViewContainerTitleContext,
		item: {
			group: '3_workbench_layout_move',
			command: {
				id: ToggleAuxiliaryBarAction.ID,
				title: localize2('hideAuxiliaryBar', 'Hide Secondary Side Bar'),
			},
			when: ContextKeyExpr.and(AuxiliaryBarVisibleContext, ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar))),
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

// --- Maximized Mode

class MaximizeAuxiliaryBar extends Action2 {

	static readonly ID = 'workbench.action.maximizeAuxiliaryBar';

	constructor() {
		super({
			id: MaximizeAuxiliaryBar.ID,
			title: localize2('maximizeAuxiliaryBar', 'Maximize Secondary Side Bar'),
			tooltip: localize('maximizeAuxiliaryBarTooltip', "Maximize Secondary Side Bar Size"),
			category: Categories.View,
			f1: true,
			precondition: AuxiliaryBarMaximizedContext.negate(),
			icon: maximizeIcon,
			menu: {
				id: MenuId.AuxiliaryBarTitle,
				group: 'navigation',
				order: 1,
				when: AuxiliaryBarMaximizedContext.negate()
			}
		});
	}

	run(accessor: ServicesAccessor) {
		const layoutService = accessor.get(IWorkbenchLayoutService);

		layoutService.setAuxiliaryBarMaximized(true);
	}
}
registerAction2(MaximizeAuxiliaryBar);

class RestoreAuxiliaryBar extends Action2 {

	static readonly ID = 'workbench.action.restoreAuxiliaryBar';

	constructor() {
		super({
			id: RestoreAuxiliaryBar.ID,
			title: localize2('restoreAuxiliaryBar', 'Restore Secondary Side Bar'),
			tooltip: localize('restoreAuxiliaryBarTooltip', "Restore Secondary Side Bar Size"),
			category: Categories.View,
			f1: true,
			precondition: AuxiliaryBarMaximizedContext,
			toggled: AuxiliaryBarMaximizedContext,
			icon: maximizeIcon,
			menu: {
				id: MenuId.AuxiliaryBarTitle,
				group: 'navigation',
				order: 1,
				when: AuxiliaryBarMaximizedContext
			}
		});
	}

	run(accessor: ServicesAccessor) {
		const layoutService = accessor.get(IWorkbenchLayoutService);

		layoutService.setAuxiliaryBarMaximized(false);
	}
}
registerAction2(RestoreAuxiliaryBar);

class ToggleMaximizedAuxiliaryBar extends Action2 {

	static readonly ID = 'workbench.action.toggleMaximizedAuxiliaryBar';

	constructor() {
		super({
			id: ToggleMaximizedAuxiliaryBar.ID,
			title: localize2('toggleMaximizedAuxiliaryBar', 'Toggle Maximized Secondary Side Bar'),
			f1: true,
			category: Categories.View
		});
	}

	run(accessor: ServicesAccessor) {
		const layoutService = accessor.get(IWorkbenchLayoutService);

		layoutService.toggleMaximizedAuxiliaryBar();
	}
}
registerAction2(ToggleMaximizedAuxiliaryBar);
