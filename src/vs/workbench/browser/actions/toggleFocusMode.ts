/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Action } from 'vs/base/common/actions';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Registry } from 'vs/platform/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { IPartService } from 'vs/workbench/services/part/common/partService';

class ToggleFocusMode extends Action {

	public static ID = 'workbench.action.toggleFocusMode';
	public static LABEL = nls.localize('toggle', "Toggle Focus Mode");

	constructor(
		id: string,
		label: string,
		@IPartService private partService: IPartService
	) {
		super(id, label);
		this.enabled = !!this.partService;
	}

	public run(): TPromise<any> {
		this.partService.toggleFocusMode();
		return TPromise.as(null);
	}
}

let registry = <IWorkbenchActionRegistry>Registry.as(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleFocusMode, ToggleFocusMode.ID, ToggleFocusMode.LABEL, { primary: KeyMod.Shift | KeyCode.F11, mac: { primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_F } }), 'Toggle Focus Mode');
