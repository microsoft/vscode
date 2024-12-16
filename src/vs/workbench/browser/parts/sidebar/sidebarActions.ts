/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sidebarpart.css';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { ViewContainerLocation } from '../../../common/views.js';

export class FocusSideBarAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.focusSideBar',
			title: localize2('focusSideBar', 'Focus into Primary Side Bar'),
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: null,
				primary: KeyMod.CtrlCmd | KeyCode.Digit0
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const paneCompositeService = accessor.get(IPaneCompositePartService);

		// Show side bar
		if (!layoutService.isVisible(Parts.SIDEBAR_PART)) {
			layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
		}

		// Focus into active viewlet
		const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
		viewlet?.focus();
	}
}

registerAction2(FocusSideBarAction);
