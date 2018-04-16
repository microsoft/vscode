/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalChildProcess, IMessageToTerminalProcess, IMessageFromTerminalProcess } from 'vs/workbench/parts/terminal/node/terminal';
import { EventEmitter } from 'events';

export class TerminalProcessExtHostBridge extends EventEmitter implements ITerminalChildProcess {
	public connected: boolean;

	constructor() {
		super();

		let i = 0;
		setTimeout(() => {
			this._emitPid(-1);
			this._emitTitle('test title');
			this._emitData(`test ${i++}\r\n`);
		}, 0);
		setInterval(() => {
			this._emitData(`test ${i++}\r\n`);
		}, 1000);
	}

	private _emitData(data: string): void {
		this.emit('message', { type: 'data', content: data } as IMessageFromTerminalProcess);
	}
	private _emitTitle(title: string): void {
		this.emit('message', { type: 'data', content: title } as IMessageFromTerminalProcess);
	}
	private _emitPid(pid: number): void {
		this.emit('message', { type: 'data', content: pid } as IMessageFromTerminalProcess);
	}

	public send(message: IMessageToTerminalProcess): boolean {
		console.log('TerminalProcessExtHostBridge#send', arguments);
		return true;
	}
}