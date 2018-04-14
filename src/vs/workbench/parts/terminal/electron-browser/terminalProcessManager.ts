/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITerminalProcessManager } from '../common/terminal';

export enum ProcessState {
	// The process has not been initialized yet.
	UNINITIALIZED,
	// The process is currently launching, the process is marked as launching
	// for a short duration after being created and is helpful to indicate
	// whether the process died as a result of bad shell and args.
	LAUNCHING,
	// The process is running normally.
	RUNNING,
	// The process was killed during launch, likely as a result of bad shell and
	// args.
	KILLED_DURING_LAUNCH,
	// The process was killed by the user (the event originated from VS Code).
	KILLED_BY_USER,
	// The process was killed by itself, for example the shell crashed or `exit`
	// was run.
	KILLED_BY_PROCESS
}

/**
 * Holds all state related to the creation and management of terminal processes.
 *
 * Definitions:
 * - Terminal Process: The process launched with the terminalProcess.ts file
 * - Pty Process: The pseudoterminal slave process (or the winpty agent process)
 * - Shell Process: The pseudoterminal master process
 */
export class TerminalProcessManager implements ITerminalProcessManager {
	// _processState
	// public _terminalProcessState: ProcessState;
	// _process
	// private _terminalProcess: cp.ChildProcess;
	// private _terminalProcessReady: TPromise<void>;

	// private _shellProcessId: number;

	private _disposables: IDisposable[] = [];

	constructor() {
	}

	public dispose(): void {
		this._disposables.forEach(d => d.dispose());
		this._disposables.length = 0;
	}

	public addDisposable(disposable: IDisposable) {
		this._disposables.push(disposable);
	}




	// Should this be here or in instance?
	// private _isExiting: boolean;

}