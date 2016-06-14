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
import {IPartService, Position} from 'vs/workbench/services/part/common/partService';

export class ToggleSidebarPositionAction extends Action {

	public static ID = 'workbench.action.toggleSidebarPosition';
	public static LABEL = nls.localize('togglePosition', "Toggle Side Bar Position");

	constructor(id: string, label: string, @IPartService private partService: IPartService) {
		super(id, label);

		this.enabled = !!this.partService;
	}

	public run(): TPromise<any> {
		let position = this.partService.getSideBarPosition();
		this.partService.setSideBarPosition(position === Position.LEFT ? Position.RIGHT : Position.LEFT);

		return TPromise.as(null);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleSidebarPositionAction, ToggleSidebarPositionAction.ID, ToggleSidebarPositionAction.LABEL), 'View: Toggle Side Bar Position', nls.localize('view', "View"));