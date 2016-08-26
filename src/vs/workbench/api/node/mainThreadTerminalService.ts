/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
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

	public $createTerminal(name?: string): TPromise<number> {
		return this._terminalService.createNew(name);
	}

	public $show(terminalId: number, preserveFocus: boolean): void {
		this._terminalService.show(!preserveFocus).then((terminalPanel) => {
			this._terminalService.setActiveTerminalById(terminalId);
		});
	}

	public $hide(terminalId: number): void {
		this._terminalService.hideTerminalInstance(terminalId);
	}

	public $dispose(terminalId: number): void {
		// TODO: This could be improved by not first showing the terminal to be disposed
		this._terminalService.show(false).then((terminalPanel) => {
			terminalPanel.closeTerminalById(terminalId);
		});;
	}

	public $sendText(terminalId: number, text: string, addNewLine: boolean): void {
		this._terminalService.show(false).then((terminalPanel) => {
			this._terminalService.setActiveTerminalById(terminalId);
			terminalPanel.sendTextToActiveTerminal(text, addNewLine);
		});
	}
}
