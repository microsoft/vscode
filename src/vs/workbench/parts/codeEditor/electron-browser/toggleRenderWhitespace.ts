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

export class ToggleRenderWhitespaceAction extends Action {

	public static readonly ID = 'editor.action.toggleRenderWhitespace';
	public static readonly LABEL = nls.localize('toggleRenderWhitespace', "View: Toggle Render Whitespace");

	constructor(
		id: string,
		label: string,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const renderWhitespace = this._configurationService.getValue<string>('editor.renderWhitespace');

		let newRenderWhitespace: string;
		if (renderWhitespace === 'none') {
			newRenderWhitespace = 'all';
		} else {
			newRenderWhitespace = 'none';
		}

		return this._configurationService.updateValue('editor.renderWhitespace', newRenderWhitespace, ConfigurationTarget.USER);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleRenderWhitespaceAction, ToggleRenderWhitespaceAction.ID, ToggleRenderWhitespaceAction.LABEL), 'View: Toggle Render Whitespace');

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '5_editor',
	command: {
		id: ToggleRenderWhitespaceAction.ID,
		title: nls.localize({ key: 'miToggleRenderWhitespace', comment: ['&& denotes a mnemonic'] }, "Toggle &&Render Whitespace")
	},
	order: 3
});
