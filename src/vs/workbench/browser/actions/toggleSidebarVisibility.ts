/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Registry } from 'vs/platform/platform';
import { Action } from 'vs/base/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';

export class ToggleSidebarVisibilityAction extends Action {

	public static ID = 'workbench.action.toggleSidebarVisibility';
	public static LABEL = nls.localize('toggleSidebar', "Toggle Side Bar Visibility");

	constructor(
		id: string,
		label: string,
		@IPartService private partService: IPartService
	) {
		super(id, label);

		this.enabled = !!this.partService;
	}

	public run(): TPromise<any> {
		const hideSidebar = this.partService.isVisible(Parts.SIDEBAR_PART);
		return this.partService.setSideBarHidden(hideSidebar);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleSidebarVisibilityAction, ToggleSidebarVisibilityAction.ID, ToggleSidebarVisibilityAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_B }), 'View: Toggle Side Bar Visibility', nls.localize('view', "View"));