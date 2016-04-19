/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';
import {ITerminalService, TERMINAL_PANEL_ID} from 'vs/workbench/parts/terminal/common/terminal';

export class TerminalService implements ITerminalService {
	public serviceId = ITerminalService;

	constructor(
		@IPanelService private panelService: IPanelService
	) {
	}

	public show(): TPromise<any> {
		return this.panelService.openPanel(TERMINAL_PANEL_ID, true);
	}
}