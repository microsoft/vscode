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

export class ToggleRenderControlCharacterAction extends Action {

	public static readonly ID = 'editor.action.toggleRenderControlCharacter';
	public static readonly LABEL = nls.localize('toggleRenderControlCharacters', "View: Toggle Control Characters");

	constructor(
		id: string,
		label: string,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let newRenderControlCharacters = !this._configurationService.getValue<boolean>('editor.renderControlCharacters');
		return this._configurationService.updateValue('editor.renderControlCharacters', newRenderControlCharacters, ConfigurationTarget.USER);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleRenderControlCharacterAction, ToggleRenderControlCharacterAction.ID, ToggleRenderControlCharacterAction.LABEL), 'View: Toggle Control Characters');

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '5_editor',
	command: {
		id: ToggleRenderControlCharacterAction.ID,
		title: nls.localize({ key: 'miToggleRenderControlCharacters', comment: ['&& denotes a mnemonic'] }, "Toggle &&Control Characters")
	},
	order: 4
});
