/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { MenuId, MenuRegistry, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { CATEGORIES, Extensions as WorkbenchExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { ActiveAuxiliaryContext, AuxiliaryBarVisibleContext } from 'vs/workbench/common/auxiliarybar';
import { ViewContainerLocation, ViewContainerLocationToString } from 'vs/workbench/common/views';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';

export class ToggleAuxiliaryBarAction extends Action {

	static readonly ID = 'workbench.action.toggleAuxiliaryBar';
	static readonly LABEL = localize('toggleAuxiliaryBar', "Toggle Side Panel");

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
	static readonly LABEL = localize('focusAuxiliaryBar', "Focus into Side Panel");

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
		id: MenuId.MenubarAppearanceMenu,
		item: {
			group: '2_workbench_layout',
			command: {
				id: ToggleAuxiliaryBarAction.ID,
				title: localize({ key: 'miShowAuxiliaryBar', comment: ['&& denotes a mnemonic'] }, "Show Si&&de Panel"),
				toggled: ActiveAuxiliaryContext
			},
			when: ContextKeyExpr.equals('config.workbench.experimental.sidePanel.enabled', true),
			order: 5
		}
	}, {
		id: MenuId.ViewTitleContext,
		item: {
			group: '3_workbench_layout_move',
			command: {
				id: ToggleAuxiliaryBarAction.ID,
				title: { value: localize('hideAuxiliaryBar', "Hide Side Panel"), original: 'Hide Side Panel' },
			},
			when: ContextKeyExpr.and(AuxiliaryBarVisibleContext, ContextKeyExpr.equals('viewLocation', ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar))),
			order: 2
		}
	}
]);

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.from(ToggleAuxiliaryBarAction), 'View: Toggle Side Panel', CATEGORIES.View.value, ContextKeyExpr.equals('config.workbench.experimental.sidePanel.enabled', true));
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.from(FocusAuxiliaryBarAction), 'View: Focus into Side Panel', CATEGORIES.View.value, ContextKeyExpr.equals('config.workbench.experimental.sidePanel.enabled', true));
