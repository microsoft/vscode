/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalChildProcess, IMessageToTerminalProcess, IMessageFromTerminalProcess } from 'vs/workbench/parts/terminal/node/terminal';
import { EventEmitter } from 'events';
import { ITerminalService, ITerminalProcessExtHostProxy } from 'vs/workbench/parts/terminal/common/terminal';

export class TerminalProcessExtHostProxy extends EventEmitter implements ITerminalChildProcess, ITerminalProcessExtHostProxy {
	public connected: boolean;

	constructor(
		@ITerminalService private _terminalService: ITerminalService
	) {
		super();

		this._terminalService.requestExtHostProcess(this).then(() => {
		});
	}

	public emitData(data: string): void {
		this.emit('message', { type: 'data', content: data } as IMessageFromTerminalProcess);
	}
	public emitTitle(title: string): void {
		this.emit('message', { type: 'title', content: title } as IMessageFromTerminalProcess);
	}
	public emitPid(pid: number): void {
		this.emit('message', { type: 'pid', content: pid } as IMessageFromTerminalProcess);
	}

	public send(message: IMessageToTerminalProcess): boolean {
		console.log('TerminalProcessExtHostBridge#send', arguments);
		return true;
	}
}