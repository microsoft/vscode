/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import actions = require('vs/base/common/actions');
import { InformationPanel } from 'vs/workbench/parts/mock/browser/mockPanels';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';

export class ShowInformationAction extends actions.Action {
	static ID = 'workbench.debug.action.showInformation';
	static LABEL = nls.localize('showInformation', "Show Information");

	constructor(id: string, label: string,
		@IPartService private partService: IPartService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label, 'debug-action show-information', true);
	}

	public run(): TPromise<any> {
		return this.panelService.openPanel(InformationPanel.ID)
		.then(() => this.partService.setPanelHidden(false));
	}
}