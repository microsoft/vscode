/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { MenuId, MenuRegistry, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';

export class ToggleReadOnlyModeAction extends Action {

	public static readonly ID = 'workbench.action.toggleReadOnlyMode';
	public static readonly LABEL = nls.localize('toggleReadOnlyMode', "Toggle Read Only Mode");

	constructor(
		id: string,
		label: string,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		let newReadOnlyMode = !this._configurationService.getValue<boolean>('workbench.editor.readOnlyMode');

		if (newReadOnlyMode) {
			this.notificationService.info(nls.localize('toggle.readOnlyMode.on', "Read Only Mode has been turned on."));
		} else {
			this.notificationService.info(nls.localize('toggle.readOnlyMode.off', "Read Only Mode has been turned off."));
		}

		return this._configurationService.updateValue('workbench.editor.readOnlyMode', newReadOnlyMode, ConfigurationTarget.USER);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(SyncActionDescriptor.from(ToggleReadOnlyModeAction), 'View: Toggle Read Only Mode', nls.localize('view', "View"));

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '5_editor',
	command: {
		id: ToggleReadOnlyModeAction.ID,
		title: nls.localize({ key: 'miToggleReadOnlyMode', comment: ['&& denotes a mnemonic'] }, "Toggle &&Read Only Mode"),
		toggled: ContextKeyExpr.equals('config.workbench.editor.readOnlyMode', true)
	},
	order: 5
});
