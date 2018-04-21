/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalChildProcess, IMessageToTerminalProcess, IMessageFromTerminalProcess } from 'vs/workbench/parts/terminal/node/terminal';
import { EventEmitter } from 'events';
import { ITerminalService, ITerminalProcessExtHostProxy, IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';

export class TerminalProcessExtHostProxy extends EventEmitter implements ITerminalChildProcess, ITerminalProcessExtHostProxy {
	// For ext host processes connected checks happen on the ext host
	public connected: boolean = true;

	private _disposables: IDisposable[] = [];

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

	public dispose(): void {
		this._disposables.forEach(d => d.dispose());
		this._disposables.length = 0;
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

	public emitExit(exitCode: number): void {
		this.emit('exit', exitCode);
		this.dispose();
	}

	public send(message: IMessageToTerminalProcess): boolean {
		switch (message.event) {
			case 'input': this.emit('input', message.data); break;
			case 'resize': this.emit('resize', message.cols, message.rows); break;
			case 'shutdown': this.emit('shutdown'); break;
		}
		return true;
	}

	public onInput(listener: (data: string) => void): void {
		const outerListener = (data) => listener(data);
		this.on('input', outerListener);
		this._disposables.push(toDisposable(() => this.removeListener('input', outerListener)));
	}

	public onResize(listener: (cols: number, rows: number) => void): void {
		const outerListener = (cols, rows) => listener(cols, rows);
		this.on('resize', outerListener);
		this._disposables.push(toDisposable(() => this.removeListener('resize', outerListener)));
	}

	public onShutdown(listener: () => void): void {
		const outerListener = () => listener();
		this.on('shutdown', outerListener);
		this._disposables.push(toDisposable(() => this.removeListener('shutdown', outerListener)));
	}
}