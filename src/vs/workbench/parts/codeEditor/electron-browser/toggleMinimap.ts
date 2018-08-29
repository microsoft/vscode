/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';

export class ToggleMinimapAction extends Action {
	public static readonly ID = 'editor.action.toggleMinimap';
	public static readonly LABEL = nls.localize('toggleMinimap', "View: Toggle Minimap");

	constructor(
		id: string,
		label: string,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const newValue = !this._configurationService.getValue<boolean>('editor.minimap.enabled');
		return this._configurationService.updateValue('editor.minimap.enabled', newValue, ConfigurationTarget.USER);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleMinimapAction, ToggleMinimapAction.ID, ToggleMinimapAction.LABEL), 'View: Toggle Minimap');

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '5_editor',
	command: {
		id: ToggleMinimapAction.ID,
		title: nls.localize({ key: 'miToggleMinimap', comment: ['&& denotes a mnemonic'] }, "Toggle &&Minimap")
	},
	order: 2
});
