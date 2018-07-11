/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as pty from 'node-pty';
import { Event, Emitter } from 'vs/base/common/event';

export class TerminalProcess {
	private _exitCode: number;
	private _closeTimeout: number;
	private _ptyProcess: pty.IPty;
	private _currentTitle: string = '';

	private readonly _onData: Emitter<string> = new Emitter<string>();
	public get onData(): Event<string> { return this._onData.event; }
	private readonly _onExit: Emitter<number> = new Emitter<number>();
	public get onExit(): Event<number> { return this._onExit.event; }
	private readonly _onProcessIdReady: Emitter<number> = new Emitter<number>();
	public get onProcessIdReady(): Event<number> { return this._onProcessIdReady.event; }
	private readonly _onTitleChanged: Emitter<string> = new Emitter<string>();
	public get onTitleChanged(): Event<string> { return this._onTitleChanged.event; }

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
		// const shell = process.env.PTYSHELL;
		// const args = getArgs();
		// const cwd = process.env.PTYCWD;
		// const cols = process.env.PTYCOLS;
		// const rows = process.env.PTYROWS;
		// let currentTitle = '';

		// setupPlanB(Number(process.env.PTYPID));
		cleanEnv();

		interface IOptions {
			name: string;
			cwd: string;
			cols?: number;
			rows?: number;
		}

		const options: IOptions = {
			name: shellName,
			cwd
		};
		if (cols && rows) {
			// options.cols = parseInt(cols, 10);
			// options.rows = parseInt(rows, 10);
			options.cols = cols;
			options.rows = rows;
		}

		const ptyProcess = pty.spawn(shell, args, options);
		this._ptyProcess = ptyProcess;

		// let closeTimeout: number;
		// let exitCode: number;

		(<any>ptyProcess).on('data', (data) => {
			this._onData.fire(data);
			// process.send({
			// 	type: 'data',
			// 	content: data
			// });
			if (this._closeTimeout) {
				clearTimeout(this._closeTimeout);
				this._queueProcessExit();
			}
		});

		ptyProcess.on('exit', (code) => {
			this._exitCode = code;
			this._queueProcessExit();
		});

		// process.on('message', (message) => {
		// 	if (message.event === 'input') {
		// 		ptyProcess.write(message.data);
		// 	} else if (message.event === 'resize') {
		// 		// Ensure that cols and rows are always >= 1, this prevents a native
		// 		// exception in winpty.
		// 		ptyProcess.resize(Math.max(message.cols, 1), Math.max(message.rows, 1));
		// 	} else if (message.event === 'shutdown') {
		// 		this._queueProcessExit();
		// 	}
		// });

		setTimeout(() => {
			this._sendProcessId();
		}, 1000);
		this._setupTitlePolling();

		// function getArgs(): string | string[] {
		// 	if (process.env['PTYSHELLCMDLINE']) {
		// 		return process.env['PTYSHELLCMDLINE'];
		// 	}
		// 	const args = [];
		// 	let i = 0;
		// 	while (process.env['PTYSHELLARG' + i]) {
		// 		args.push(process.env['PTYSHELLARG' + i]);
		// 		i++;
		// 	}
		// 	return args;
		// }

		function cleanEnv() {
			const keys = [
				'AMD_ENTRYPOINT',
				'ELECTRON_NO_ASAR',
				'ELECTRON_RUN_AS_NODE',
				'GOOGLE_API_KEY',
				'PTYCWD',
				'PTYPID',
				'PTYSHELL',
				'PTYCOLS',
				'PTYROWS',
				'PTYSHELLCMDLINE',
				'VSCODE_LOGS',
				'VSCODE_PORTABLE',
				'VSCODE_PID',
			];
			// TODO: Don't change process.env, create a new one
			keys.forEach(function (key) {
				if (process.env[key]) {
					delete process.env[key];
				}
			});
			let i = 0;
			while (process.env['PTYSHELLARG' + i]) {
				delete process.env['PTYSHELLARG' + i];
				i++;
			}
		}

		// function setupPlanB(parentPid: number) {
		// 	setInterval(function () {
		// 		try {
		// 			process.kill(parentPid, 0); // throws an exception if the main process doesn't exist anymore.
		// 		} catch (e) {
		// 			process.exit();
		// 		}
		// 	}, 5000);
		// }
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
			this._onExit.fire(this._exitCode);
			// process.exit(exitCode);
		}, 250);
	}

	private _sendProcessId() {
		this._onProcessIdReady.fire(this._ptyProcess.pid);
		// process.send({
		// 	type: 'pid',
		// 	content: ptyProcess.pid
		// });
	}
	private _sendProcessTitle(): void {
		// process.send({
		// 	type: 'title',
		// 	content: ptyProcess.process
		// });
		this._currentTitle = this._ptyProcess.process;
		this._onTitleChanged.fire(this._currentTitle);
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
