/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Registry } from 'vs/platform/registry/common/platform';
import { Action } from 'vs/base/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IPartService, Position } from 'vs/workbench/services/part/common/partService';

export class ToggleSidebarPositionAction extends Action {

	public static ID = 'workbench.action.toggleSidebarPosition';
	public static LABEL = nls.localize('toggleLocation', "Toggle Side Bar Location");

	private static sidebarPositionConfigurationKey = 'workbench.sideBar.location';

	constructor(
		id: string,
		label: string,
		@IPartService private partService: IPartService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService
	) {
		super(id, label);

		this.enabled = !!this.partService && !!this.configurationEditingService;
	}

	public run(): TPromise<any> {
		const position = this.partService.getSideBarPosition();
		const newPositionValue = (position === Position.LEFT) ? 'right' : 'left';

		this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: ToggleSidebarPositionAction.sidebarPositionConfigurationKey, value: newPositionValue });

		return TPromise.as(null);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleSidebarPositionAction, ToggleSidebarPositionAction.ID, ToggleSidebarPositionAction.LABEL), 'View: Toggle Side Bar Location', nls.localize('view', "View"));