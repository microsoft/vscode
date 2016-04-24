/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {Action} from 'vs/base/common/actions';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';
import {TERMINAL_PANEL_ID, ITerminalService} from 'vs/workbench/parts/terminal/common/terminal';

export class ToggleTerminalAction extends Action {

	public static ID = 'workbench.action.terminal.toggleTerminal';
	public static LABEL = nls.localize('toggleTerminal', "(Experimental) Toggle Terminal");

	constructor(
		id: string, label: string,
		@IPartService private partService: IPartService,
		@IPanelService private panelService: IPanelService,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const panel = this.panelService.getActivePanel();
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			this.partService.setPanelHidden(true);

			return TPromise.as(null);
		}

		return this.terminalService.show();
	}
}