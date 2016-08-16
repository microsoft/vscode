/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ITerminalService} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {MainThreadTerminalServiceShape} from './extHost.protocol';

export class MainThreadTerminalService extends MainThreadTerminalServiceShape {

	private _terminalService: ITerminalService;

	constructor(
		@ITerminalService terminalService: ITerminalService
	) {
		super();
		this._terminalService = terminalService;
	}
}
