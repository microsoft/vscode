/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {Action} from 'vs/base/common/actions';
import {ITerminalService} from 'vs/workbench/parts/terminal/electron-browser/terminal';

export class ToggleTerminalAction extends Action {

	public static ID = 'workbench.action.terminal.toggleTerminal';
	public static LABEL = nls.localize('toggleTerminal', "Toggle Integrated Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.terminalService.toggle();
	}
}