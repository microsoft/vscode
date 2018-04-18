/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalChildProcess, IMessageToTerminalProcess, IMessageFromTerminalProcess } from 'vs/workbench/parts/terminal/node/terminal';
import { EventEmitter } from 'events';
import { ITerminalService, ITerminalProcessExtHostProxy, IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle';

export class TerminalProcessExtHostProxy extends EventEmitter implements ITerminalChildProcess, ITerminalProcessExtHostProxy {
	// For ext host processes connected checks happen on the ext host
	public connected: boolean = true;

	constructor(
		public terminalId: number,
		shellLaunchConfig: IShellLaunchConfig,
		cols: number,
		rows: number,
		@ITerminalService private _terminalService: ITerminalService
	) {
		super();

		// TODO: Return TPromise<boolean> indicating success? Teardown if failure?
		this._terminalService.requestExtHostProcess(this, shellLaunchConfig, cols, rows);
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
		switch (message.event) {
			case 'input': this.emit('input', message.data); break;
			case 'resize': this.emit('resize', message.cols, message.rows); break;
			case 'shutdown': this.emit('shutdown'); break;
		}
		return true;
	}

	public onInput(listener: (data: string) => void): IDisposable {
		const outerListener = (data) => listener(data);
		this.on('input', data => outerListener);
		return toDisposable(() => this.removeListener('input', outerListener));
	}

	public onResize(listener: (cols: number, rows: number) => void): IDisposable {
		const outerListener = (cols, rows) => listener(cols, rows);
		this.on('resize', outerListener);
		return toDisposable(() => this.removeListener('resize', outerListener));
	}

	public onShutdown(listener: () => void): IDisposable {
		const outerListener = () => listener();
		this.on('shutdown', outerListener);
		return toDisposable(() => this.removeListener('shutdown', outerListener));
	}
}