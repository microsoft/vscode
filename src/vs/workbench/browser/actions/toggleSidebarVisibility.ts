/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import {Action} from 'vs/base/common/actions';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IWorkbenchActionRegistry, Extensions} from 'vs/workbench/common/actionRegistry';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

const ID = 'workbench.action.toggleSidebarVisibility';
const LABEL = nls.localize('toggleSidebar', "Toggle Side Bar Visibility");

export class ToggleSidebarVisibilityAction extends Action {

	constructor(id: string, label: string, @IPartService private partService: IPartService) {
		super(id, label);

		this.enabled = !!this.partService;
	}

	public run(): TPromise<any> {
		let hideSidebar = !this.partService.isSideBarHidden();
		this.partService.setSideBarHidden(hideSidebar);

		return TPromise.as(null);
	}
}

let registry = <IWorkbenchActionRegistry>Registry.as(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleSidebarVisibilityAction, ID, LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_B }), nls.localize('view', "View"));