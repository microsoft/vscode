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
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';


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
