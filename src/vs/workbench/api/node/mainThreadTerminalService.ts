/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ITerminalService} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {MainThreadTerminalServiceShape} from './extHost.protocol';
import {TPromise} from 'vs/base/common/winjs.base';

export class MainThreadTerminalService extends MainThreadTerminalServiceShape {

	constructor(
		@IPanelService private panelService: IPanelService,
		@IPartService private partService: IPartService,
		@ITerminalService private terminalService: ITerminalService
	) {
		super();
	}

	public $createTerminal(name?: string, shellPath?: string, shellArgs?: string[]): TPromise<number> {
		return TPromise.as(this.terminalService.createInstance(name, shellPath, shellArgs).id);
	}

	public $show(terminalId: number, preserveFocus: boolean): void {
		let terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (terminalInstance) {
			this.terminalService.setActiveInstance(terminalInstance);
			this.terminalService.showPanel(!preserveFocus);
		}
	}

	public $hide(terminalId: number): void {
		if (this.terminalService.getActiveInstance().id === terminalId) {
			this.terminalService.hidePanel();
		}
	}

	public $dispose(terminalId: number): void {
		let terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (terminalInstance) {
			terminalInstance.dispose();
		}
	}

	public $sendText(terminalId: number, text: string, addNewLine: boolean): void {
		let terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (terminalInstance) {
			terminalInstance.sendText(text, addNewLine);
		}
	}
}
