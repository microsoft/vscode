/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { MenuId, MenuRegistry, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { CATEGORIES, Extensions as WorkbenchExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { AuxiliaryBarVisibleContext } from 'vs/workbench/common/contextkeys';
import { ViewContainerLocation, ViewContainerLocationToString } from 'vs/workbench/common/views';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';


const auxiliaryBarRightIcon = registerIcon('auxiliarybar-right-layout-icon', Codicon.layoutSidebarRight, localize('toggleAuxiliaryIconRight', 'Icon to toggle the auxiliary bar off in its right position.'));
const auxiliaryBarRightOffIcon = registerIcon('auxiliarybar-right-off-layout-icon', Codicon.layoutSidebarRightOff, localize('toggleAuxiliaryIconRightOn', 'Icon to toggle the auxiliary bar on in its right position.'));
const auxiliaryBarLeftIcon = registerIcon('auxiliarybar-left-layout-icon', Codicon.layoutSidebarLeft, localize('toggleAuxiliaryIconLeft', 'Icon to toggle the auxiliary bar in its left position.'));
const auxiliaryBarLeftOffIcon = registerIcon('auxiliarybar-left-off-layout-icon', Codicon.layoutSidebarLeftOff, localize('toggleAuxiliaryIconLeftOn', 'Icon to toggle the auxiliary bar on in its left position.'));

export class ToggleAuxiliaryBarAction extends Action {

	static readonly ID = 'workbench.action.toggleAuxiliaryBar';
	static readonly LABEL = localize('toggleAuxiliaryBar', "Toggle Secondary Side Bar Visibility");

	constructor(
		id: string,
		name: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, name, layoutService.isVisible(Parts.AUXILIARYBAR_PART) ? 'auxiliaryBar expanded' : 'auxiliaryBar');
	}

	override async run(): Promise<void> {
		this.layoutService.setPartHidden(this.layoutService.isVisible(Parts.AUXILIARYBAR_PART), Parts.AUXILIARYBAR_PART);
	}
}

class FocusAuxiliaryBarAction extends Action {

	static readonly ID = 'workbench.action.focusAuxiliaryBar';
	static readonly LABEL = localize('focusAuxiliaryBar', "Focus into Secondary Side Bar");

	constructor(
		id: string,
		label: string,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {

		// Show auxiliary bar
		if (!this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		}

		// Focus into active composite
		let composite = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar);
		if (composite) {
			composite.focus();
		}
	}
}

MenuRegistry.appendMenuItems([
	{
		id: MenuId.LayoutControlMenuSubmenu,
		item: {
			group: '0_workbench_layout',
			command: {
				id: ToggleAuxiliaryBarAction.ID,
				title: localize('miShowAuxiliaryBarNoMnemonic', "Show Secondary Side Bar"),
				toggled: AuxiliaryBarVisibleContext
			},
			order: 2
		}
	},
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
	},
	{
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
	},
	{
		id: MenuId.MenubarAppearanceMenu,
		item: {
			group: '2_workbench_layout',
			command: {
				id: ToggleAuxiliaryBarAction.ID,
				title: localize({ key: 'miShowAuxiliaryBar', comment: ['&& denotes a mnemonic'] }, "Show Secondary Si&&de Bar"),
				toggled: AuxiliaryBarVisibleContext
			},
			order: 2
		}
	}, {
		id: MenuId.ViewTitleContext,
		item: {
			group: '3_workbench_layout_move',
			command: {
				id: ToggleAuxiliaryBarAction.ID,
				title: { value: localize('hideAuxiliaryBar', "Hide Secondary Side Bar"), original: 'Hide Secondary Side Bar' },
			},
			when: ContextKeyExpr.and(AuxiliaryBarVisibleContext, ContextKeyExpr.equals('viewLocation', ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar))),
			order: 2
		}
	}
]);

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.from(ToggleAuxiliaryBarAction), 'View: Toggle Secondary Side Bar Visibility', CATEGORIES.View.value);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.from(FocusAuxiliaryBarAction), 'View: Focus into Secondary Side Bar', CATEGORIES.View.value);
