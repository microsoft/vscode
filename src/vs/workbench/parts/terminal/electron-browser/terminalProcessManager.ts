/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess } from 'child_process';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ProcessState, ITerminalProcessManager } from 'vs/workbench/parts/terminal/common/terminal';

/**
 * Holds all state related to the creation and management of terminal processes.
 *
 * Definitions:
 * - Process: The process launched with the terminalProcess.ts file
 * - Pty Process: The pseudoterminal slave process (or the winpty agent process)
 * - Shell Process: The pseudoterminal master process
 */
export class TerminalProcessManager implements ITerminalProcessManager {
	public processState: ProcessState = ProcessState.UNINITIALIZED;
	// _process
	public process: ChildProcess;
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