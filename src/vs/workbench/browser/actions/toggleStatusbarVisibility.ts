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
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';

export class ToggleStatusbarVisibilityAction extends Action {

	public static ID = 'workbench.action.toggleStatusbarVisibility';
	public static LABEL = nls.localize('toggleStatusbar', "Toggle Status Bar Visibility");

	private static statusbarVisibleKey = 'workbench.statusBar.visible';

	constructor(
		id: string,
		label: string,
		@IPartService private partService: IPartService,
		@IMessageService private messageService: IMessageService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService
	) {
		super(id, label);

		this.enabled = !!this.partService;
	}

	public run(): TPromise<any> {
		const visibility = this.partService.isVisible(Parts.STATUSBAR_PART);
		const newVisibilityValue = !visibility;

		this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: ToggleStatusbarVisibilityAction.statusbarVisibleKey, value: newVisibilityValue }).then(null, error => {
			this.messageService.show(Severity.Error, error);
		});

		return TPromise.as(null);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleStatusbarVisibilityAction, ToggleStatusbarVisibilityAction.ID, ToggleStatusbarVisibilityAction.LABEL), 'View: Toggle Status Bar Visibility', nls.localize('view', "View"));