/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import {Action} from 'vs/base/common/actions';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IWorkbenchActionRegistry, Extensions} from 'vs/workbench/common/actionRegistry';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import {IHistoryService} from 'vs/workbench/services/history/common/history';

const NAVIGATE_FORWARD_ID = 'workbench.action.navigateForward';
const NAVIGATE_FORWARD_LABEL = nls.localize('navigateNext', "Go Forward");

export class NavigateForwardAction extends Action {

	constructor(id: string, label: string, @IHistoryService private historyService: IHistoryService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.historyService.forward();

		return TPromise.as(null);
	}
}

const NAVIGATE_BACKWARDS_ID = 'workbench.action.navigateBack';
const NAVIGATE_BACKWARDS_LABEL = nls.localize('navigatePrevious', "Go Back");

export class NavigateBackwardsAction extends Action {

	constructor(id: string, label: string, @IHistoryService private historyService: IHistoryService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.historyService.back();

		return TPromise.as(null);
	}
}

let registry = <IWorkbenchActionRegistry>Registry.as(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateForwardAction, NAVIGATE_FORWARD_ID, NAVIGATE_FORWARD_LABEL, {
	primary: null,
	win: { primary: KeyMod.Alt | KeyCode.RightArrow },
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.US_MINUS },
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_MINUS }
}));

registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateBackwardsAction, NAVIGATE_BACKWARDS_ID, NAVIGATE_BACKWARDS_LABEL, {
	primary: null,
	win: { primary: KeyMod.Alt | KeyCode.LeftArrow },
	mac: { primary: KeyMod.WinCtrl | KeyCode.US_MINUS },
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.US_MINUS }
}));