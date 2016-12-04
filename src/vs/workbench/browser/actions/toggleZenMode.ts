/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Action } from 'vs/base/common/actions';
import { KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { Registry } from 'vs/platform/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { IPartService } from 'vs/workbench/services/part/common/partService';

class ToggleZenMode extends Action {

	public static ID = 'workbench.action.toggleZenMode';
	public static LABEL = nls.localize('toggleZenMode', "Toggle Zen Mode");

	constructor(
		id: string,
		label: string,
		@IPartService private partService: IPartService
	) {
		super(id, label);
		this.enabled = !!this.partService;
	}

	public run(): TPromise<any> {
		this.partService.toggleZenMode();
		return TPromise.as(null);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleZenMode, ToggleZenMode.ID, ToggleZenMode.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_Z) }), 'View: Toggle Zen Mode', nls.localize('view', "View"));