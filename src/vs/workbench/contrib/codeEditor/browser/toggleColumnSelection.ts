/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { MenuId, MenuRegistry, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';

export class ToggleColumnSelectionAction extends Action {
	public static readonly ID = 'editor.action.toggleColumnSelection';
	public static readonly LABEL = nls.localize('toggleColumnSelection', "Toggle Column Selection Mode");

	constructor(
		id: string,
		label: string,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		const newValue = !this._configurationService.getValue<boolean>('editor.columnSelection');
		return this._configurationService.updateValue('editor.columnSelection', newValue, ConfigurationTarget.USER);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleColumnSelectionAction, ToggleColumnSelectionAction.ID, ToggleColumnSelectionAction.LABEL), 'View: Toggle Column Selection Mode', nls.localize('view', "View"));

MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
	group: '3_multi',
	command: {
		id: ToggleColumnSelectionAction.ID,
		title: nls.localize({ key: 'miColumnSelection', comment: ['&& denotes a mnemonic'] }, "Column &&Selection Mode"),
		toggled: ContextKeyExpr.equals('config.editor.columnSelection', true)
	},
	order: 1.5
});
