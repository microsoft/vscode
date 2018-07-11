/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as pty from 'node-pty';
import { Event, Emitter } from 'vs/base/common/event';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { ITerminalChildProcess } from 'vs/workbench/parts/terminal/node/terminal';
import { IDisposable } from 'vs/base/common/lifecycle';

export class TerminalProcess implements ITerminalChildProcess, IDisposable {
	private _exitCode: number;
	private _closeTimeout: number;
	private _ptyProcess: pty.IPty;
	private _currentTitle: string = '';

	private readonly _onProcessData: Emitter<string> = new Emitter<string>();
	public get onProcessData(): Event<string> { return this._onProcessData.event; }
	private readonly _onProcessExit: Emitter<number> = new Emitter<number>();
	public get onProcessExit(): Event<number> { return this._onProcessExit.event; }
	private readonly _onProcessIdReady: Emitter<number> = new Emitter<number>();
	public get onProcessIdReady(): Event<number> { return this._onProcessIdReady.event; }
	private readonly _onProcessTitleChanged: Emitter<string> = new Emitter<string>();
	public get onProcessTitleChanged(): Event<string> { return this._onProcessTitleChanged.event; }

	constructor(shell: string, args: string | string[], cwd: string, cols: number, rows: number) {
		// The pty process needs to be run in its own child process to get around maxing out CPU on Mac,
		// see https://github.com/electron/electron/issues/38
		let shellName: string;
		if (os.platform() === 'win32') {
			shellName = path.basename(process.env.PTYSHELL);
		} else {
			// Using 'xterm-256color' here helps ensure that the majority of Linux distributions will use a
			// color prompt as defined in the default ~/.bashrc file.
			shellName = 'xterm-256color';
		}

		const options: pty.IPtyForkOptions = {
			name: shellName,
			cwd,
			env: this._createEnv(),
			cols,
			rows
		};

		this._ptyProcess = pty.spawn(shell, args, options);
		this._ptyProcess.on('data', (data) => {
			this._onProcessData.fire(data);
			if (this._closeTimeout) {
				clearTimeout(this._closeTimeout);
				this._queueProcessExit();
			}
		});
		this._ptyProcess.on('exit', (code) => {
			this._exitCode = code;
			this._queueProcessExit();
		});

		// TODO: We should no longer need to delay this since spawn is sync
		setTimeout(() => {
			this._sendProcessId();
		}, 1000);
		this._setupTitlePolling();
	}

	public dispose(): void {
		this._onProcessData.dispose();
		this._onProcessExit.dispose();
		this._onProcessIdReady.dispose();
		this._onProcessTitleChanged.dispose();
	}

	private _createEnv(): IProcessEnvironment {
		const env: IProcessEnvironment = { ...process.env };
		const keysToRemove = [
			'AMD_ENTRYPOINT',
			'ELECTRON_ENABLE_STACK_DUMPING',
			'ELECTRON_ENABLE_LOGGING',
			'ELECTRON_NO_ASAR',
			'ELECTRON_RUN_AS_NODE',
			'GOOGLE_API_KEY',
			'VSCODE_CLI',
			'VSCODE_DEV',
			'VSCODE_IPC_HOOK',
			'VSCODE_LOGS',
			'VSCODE_NLS_CONFIG',
			'VSCODE_PORTABLE',
			'VSCODE_PID',
		];
		keysToRemove.forEach((key) => {
			if (env[key]) {
				delete env[key];
			}
		});
		Object.keys(env).forEach(key => {
			if (key.search(/^VSCODE_NODE_CACHED_DATA_DIR_\d+$/) === 0) {
				delete env[key];
			}
		});
		return env;
	}

	private _setupTitlePolling() {
		this._sendProcessTitle();
		setInterval(() => {
			if (this._currentTitle !== this._ptyProcess.process) {
				this._sendProcessTitle();
			}
		}, 200);
	}

	// Allow any trailing data events to be sent before the exit event is sent.
	// See https://github.com/Tyriar/node-pty/issues/72
	private _queueProcessExit() {
		if (this._closeTimeout) {
			clearTimeout(this._closeTimeout);
		}
		// TODO: Dispose correctly
		this._closeTimeout = setTimeout(() => {
			this._ptyProcess.kill();
			this._onProcessExit.fire(this._exitCode);
		}, 250);
	}

	private _sendProcessId() {
		this._onProcessIdReady.fire(this._ptyProcess.pid);
	}
	private _sendProcessTitle(): void {
		this._currentTitle = this._ptyProcess.process;
		this._onProcessTitleChanged.fire(this._currentTitle);
	}

	public shutdown(): void {
		this._queueProcessExit();
	}

	public input(data: string): void {
		this._ptyProcess.write(data);
	}

	public resize(cols: number, rows: number): void {
		// Ensure that cols and rows are always >= 1, this prevents a native
		// exception in winpty.
		this._ptyProcess.resize(Math.max(cols, 1), Math.max(rows, 1));
	}

	public get isConnected(): boolean {
		// Don't need connected anymore as it's the same process
		return true;
	}
}
