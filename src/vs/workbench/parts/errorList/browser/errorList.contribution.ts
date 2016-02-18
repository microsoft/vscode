/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
// import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import platform = require('vs/platform/platform');
// import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
// import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import panel = require('vs/workbench/browser/panel');
import { ERROR_LIST_PANEL_ID } from 'vs/workbench/parts/errorList/browser/errorListConstants';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';

class ToggleErrorListAction extends Action {

	public static ID = 'workbench.action.errorList.toggle';
	public static LABEL = nls.localize('toggleErrorList', "Toggle Error List");

	constructor(id: string, label: string,
		@IPartService private partService: IPartService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const panel = this.panelService.getActivePanel();
		if (panel && panel.getId() === ERROR_LIST_PANEL_ID) {
			this.partService.setPanelHidden(true);

			return TPromise.as(null);
		}

		return this.panelService.openPanel(ERROR_LIST_PANEL_ID, true);
	}
}

// register panel
(<panel.PanelRegistry>platform.Registry.as(panel.Extensions.Panels)).registerPanel(new panel.PanelDescriptor(
	'vs/workbench/parts/errorList/browser/errorList',
	'ErrorList',
	ERROR_LIST_PANEL_ID,
	nls.localize('errorListPanel', "Error List"),
	'errorList'
));


// register toggle output action globally
// let actionRegistry = <IWorkbenchActionRegistry>platform.Registry.as(ActionExtensions.WorkbenchActions);
// actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleErrorListAction, ToggleErrorListAction.ID, ToggleErrorListAction.LABEL, {
// 	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_A,
// 	linux: {
// 		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_A
// 	}
// }), nls.localize('viewCategory', "View"));
