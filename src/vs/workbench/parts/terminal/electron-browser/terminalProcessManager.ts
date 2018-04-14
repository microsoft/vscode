/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess } from 'child_process';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ProcessState, ITerminalProcessManager, ITerminalProcessMessage, IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
import { TPromise } from 'vs/base/common/winjs.base';
import { ILogService } from 'vs/platform/log/common/log';
import { Emitter, Event } from 'vs/base/common/event';

/**
 * Holds all state related to the creation and management of terminal processes.
 *
 * Definitions:
 * - Process: The process launched with the terminalProcess.ts file
 * - Pty Process: The pseudoterminal master process (or the winpty agent process)
 * - Shell Process: The pseudoterminal slave process (ie. the shell)
 */
export class TerminalProcessManager implements ITerminalProcessManager {
	public processState: ProcessState = ProcessState.UNINITIALIZED;
	// _process
	public process: ChildProcess;
	public ptyProcessReady: TPromise<void>;
	public shellProcessId: number;

	private _preLaunchInputQueue: string[] = [];
	private _disposables: IDisposable[] = [];

	private readonly _onShellProcessIdReady: Emitter<number> = new Emitter<number>();
	public get onShellProcessIdReady(): Event<number> { return this._onShellProcessIdReady.event; }

	constructor(
		@ILogService private _logService: ILogService
	) {
	}

	public dispose(): void {
		this._disposables.forEach(d => d.dispose());
		this._disposables.length = 0;
	}

	public addDisposable(disposable: IDisposable) {
		this._disposables.push(disposable);
	}

	public createProcess(launchConfig: IShellLaunchConfig): void {
		this.ptyProcessReady = new TPromise<void>(c => {
			this.onShellProcessIdReady(() => {
				this._logService.debug(`Terminal process ready (shellProcessId: ${this.shellProcessId})`);
				c(void 0);
			});
		});
	}

	public write(data: string): void {
		if (this.shellProcessId) {
			// Send data if the pty is ready
			this.process.send({
				event: 'input',
				data
			});
		} else {
			// If the pty is not ready, queue the data received to send later
			this._preLaunchInputQueue.push(data);
		}
	}

	public acceptProcessMessage(message: ITerminalProcessMessage): void {
		if (message.type === 'pid') {
			this.shellProcessId = <number>message.content;
			this._onShellProcessIdReady.fire(this.shellProcessId);

			// Send any queued data that's waiting
			if (this._preLaunchInputQueue.length > 0) {
				this.process.send({
					event: 'input',
					data: this._preLaunchInputQueue.join('')
				});
				this._preLaunchInputQueue.length = 0;
			}
		}
	}


	// Should this be here or in instance?
	// private _isExiting: boolean;

}