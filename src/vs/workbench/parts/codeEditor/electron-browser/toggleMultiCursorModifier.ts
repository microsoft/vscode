/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Action } from 'vs/base/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class ToggleMultiCursorModifierAction extends Action {

	public static ID = 'workbench.action.toggleMultiCursorModifier';
	public static LABEL = nls.localize('toggleLocation', "Toggle Multi-Cursor Modifier");

	private static multiCursorModifierConfigurationKey = 'editor.multiCursorModifier';

	constructor(
		id: string,
		label: string,
		@IConfigurationService private configurationService: IConfigurationService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService
	) {
		super(id, label);

		this.enabled = !!this.configurationService && !!this.configurationEditingService;
	}

	public run(): TPromise<any> {
		const editorConf = this.configurationService.getConfiguration<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');
		const newValue: 'ctrlCmd' | 'alt' = (editorConf.multiCursorModifier === 'ctrlCmd' ? 'alt' : 'ctrlCmd');

		this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: ToggleMultiCursorModifierAction.multiCursorModifierConfigurationKey, value: newValue });

		return TPromise.as(null);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleMultiCursorModifierAction, ToggleMultiCursorModifierAction.ID, ToggleMultiCursorModifierAction.LABEL), 'Toggle Multi-Cursor Modifier');
