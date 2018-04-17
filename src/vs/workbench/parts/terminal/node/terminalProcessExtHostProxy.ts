/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalChildProcess, IMessageToTerminalProcess, IMessageFromTerminalProcess } from 'vs/workbench/parts/terminal/node/terminal';
import { EventEmitter } from 'events';
import { ITerminalService, ITerminalProcessExtHostProxy } from 'vs/workbench/parts/terminal/common/terminal';
import { IDisposable } from '../../../../base/common/lifecycle';

export class TerminalProcessExtHostProxy extends EventEmitter implements ITerminalChildProcess, ITerminalProcessExtHostProxy {
	public connected: boolean;

	constructor(
		public terminalId: number,
		@ITerminalService private _terminalService: ITerminalService
	) {
		super();

		// TODO: Return TPromise<boolean> indicating success? Teardown if failure?
		this._terminalService.requestExtHostProcess(this);
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
		console.log('TerminalProcessExtHostProxy#send');
		if (message.event === 'input') {
			console.log('emit input', message.data);
			this.emit('input', message.data);
		}
		return true;
	}

	public onInput(listener: (data: string) => void): IDisposable {
		console.log('TerminalProcessExtHostProxy#onInput', arguments);
		// TODO: Dispose of me
		this.on('input', data => {
			console.log('TerminalProcessExtHostProxy#onInput - listener');
			listener(data);
		});
		return null;
	}
}