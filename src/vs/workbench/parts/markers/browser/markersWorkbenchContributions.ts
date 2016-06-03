/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import Messages from 'vs/workbench/parts/markers/common/messages';
import Constants from 'vs/workbench/parts/markers/common/constants';
import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import * as platform from 'vs/platform/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import * as panel from 'vs/workbench/browser/panel';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';

class ToggleMarkersPanelAction extends Action {

	public static ID = 'workbench.action.markers.panel.toggle';

	constructor(id: string, label: string,
		@IPartService private partService: IPartService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const panel= this.panelService.getActivePanel();
		if (panel && panel.getId() === Constants.MARKERS_PANEL_ID) {
			this.partService.setPanelHidden(true);
			return TPromise.as(null);
		}
		return this.panelService.openPanel(Constants.MARKERS_PANEL_ID, true);
	}
}

export function registerContributions(): void {

	// register markers panel
	(<panel.PanelRegistry>platform.Registry.as(panel.Extensions.Panels)).registerPanel(new panel.PanelDescriptor(
		'vs/workbench/parts/markers/browser/markersPanel',
		'MarkersPanel',
		Constants.MARKERS_PANEL_ID,
		Messages.MARKERS_PANEL_TITLE_NO_PROBLEMS,
		'markersPanel'
	));

	let actionRegistry = <IWorkbenchActionRegistry>platform.Registry.as(ActionExtensions.WorkbenchActions);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleMarkersPanelAction, ToggleMarkersPanelAction.ID, Messages.MARKERS_PANEL_TOGGLE_LABEL, {
		primary: null,
		win: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_M },
		linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_M },
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_M }
	}), nls.localize('viewCategory', "View"));

}