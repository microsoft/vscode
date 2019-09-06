/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'vs/base/common/path';
import * as platform from 'vs/base/common/platform';
import * as pty from 'node-pty';
import * as fs from 'fs';
import { Event, Emitter } from 'vs/base/common/event';
import { getWindowsBuildNumber } from 'vs/workbench/contrib/terminal/node/terminal';
import { Disposable } from 'vs/base/common/lifecycle';
import { IShellLaunchConfig, ITerminalChildProcess, SHELL_PATH_INVALID_EXIT_CODE, SHELL_PATH_DIRECTORY_EXIT_CODE, SHELL_CWD_INVALID_EXIT_CODE } from 'vs/workbench/contrib/terminal/common/terminal';
import { exec } from 'child_process';
import { ILogService } from 'vs/platform/log/common/log';
import { stat } from 'vs/base/node/pfs';
import { findExecutable } from 'vs/workbench/contrib/terminal/node/terminalEnvironment';
import { URI } from 'vs/base/common/uri';

export class TerminalProcess extends Disposable implements ITerminalChildProcess {
	private _exitCode: number | undefined;
	private _closeTimeout: any;
	private _ptyProcess: pty.IPty | undefined;
	private _currentTitle: string = '';
	private _processStartupComplete: Promise<void> | undefined;
	private _isDisposed: boolean = false;
	private _titleInterval: NodeJS.Timer | null = null;
	private _initialCwd: string;

	private readonly _onProcessData = this._register(new Emitter<string>());
	public get onProcessData(): Event<string> { return this._onProcessData.event; }
	private readonly _onProcessExit = this._register(new Emitter<number>());
	public get onProcessExit(): Event<number> { return this._onProcessExit.event; }
	private readonly _onProcessReady = this._register(new Emitter<{ pid: number, cwd: string }>());
	public get onProcessReady(): Event<{ pid: number, cwd: string }> { return this._onProcessReady.event; }
	private readonly _onProcessTitleChanged = this._register(new Emitter<string>());
	public get onProcessTitleChanged(): Event<string> { return this._onProcessTitleChanged.event; }

	constructor(
		shellLaunchConfig: IShellLaunchConfig,
		cwd: string,
		cols: number,
		rows: number,
		env: platform.IProcessEnvironment,
		windowsEnableConpty: boolean,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		let shellName: string;
		if (os.platform() === 'win32') {
			shellName = path.basename(shellLaunchConfig.executable || '');
		} else {
			// Using 'xterm-256color' here helps ensure that the majority of Linux distributions will use a
			// color prompt as defined in the default ~/.bashrc file.
			shellName = 'xterm-256color';
		}

		this._initialCwd = cwd;

		const useConpty = windowsEnableConpty && process.platform === 'win32' && getWindowsBuildNumber() >= 18309;
		const options: pty.IPtyForkOptions | pty.IWindowsPtyForkOptions = {
			name: shellName,
			cwd,
			env,
			cols,
			rows,
			experimentalUseConpty: useConpty,
			// This option will force conpty to not redraw the whole viewport on launch
			conptyInheritCursor: useConpty && !!shellLaunchConfig.initialText
		};

		const cwdVerification = stat(cwd).then(async stat => {
			if (!stat.isDirectory()) {
				return Promise.reject(SHELL_CWD_INVALID_EXIT_CODE);
			}
		}, async err => {
			if (err && err.code === 'ENOENT') {
				// So we can include in the error message the specified CWD
				shellLaunchConfig.cwd = cwd;
				return Promise.reject(SHELL_CWD_INVALID_EXIT_CODE);
			}
		});

		const exectuableVerification = stat(shellLaunchConfig.executable!).then(async stat => {
			if (!stat.isFile() && !stat.isSymbolicLink()) {
				return Promise.reject(stat.isDirectory() ? SHELL_PATH_DIRECTORY_EXIT_CODE : SHELL_PATH_INVALID_EXIT_CODE);
			}
		}, async (err) => {
			if (err && err.code === 'ENOENT') {
				let cwd = shellLaunchConfig.cwd instanceof URI ? shellLaunchConfig.cwd.path : shellLaunchConfig.cwd!;
				// Try to get path
				const envPaths: string[] | undefined = (shellLaunchConfig.env && shellLaunchConfig.env.PATH) ? shellLaunchConfig.env.PATH.split(path.delimiter) : undefined;
				const executable = await findExecutable(shellLaunchConfig.executable!, cwd, envPaths);
				if (!executable) {
					return Promise.reject(SHELL_PATH_INVALID_EXIT_CODE);
				}
			}
		});

		Promise.all([cwdVerification, exectuableVerification]).then(() => {
			this.setupPtyProcess(shellLaunchConfig, options);
		}).catch((exitCode: number) => {
			return this._launchFailed(exitCode);
		});
	}

	private _launchFailed(exitCode: number): void {
		this._exitCode = exitCode;
		this._queueProcessExit();
		this._processStartupComplete = Promise.resolve(undefined);
	}

	private setupPtyProcess(shellLaunchConfig: IShellLaunchConfig, options: pty.IPtyForkOptions): void {
		const args = shellLaunchConfig.args || [];
		this._logService.trace('IPty#spawn', shellLaunchConfig.executable, args, options);
		const ptyProcess = pty.spawn(shellLaunchConfig.executable!, args, options);
		this._ptyProcess = ptyProcess;
		this._processStartupComplete = new Promise<void>(c => {
			this.onProcessReady(() => c());
		});
		ptyProcess.on('data', data => {
			this._onProcessData.fire(data);
			if (this._closeTimeout) {
				clearTimeout(this._closeTimeout);
				this._queueProcessExit();
			}
		});
		ptyProcess.on('exit', code => {
			this._exitCode = code;
			this._queueProcessExit();
		});
		this._setupTitlePolling(ptyProcess);
		// TODO: We should no longer need to delay this since pty.spawn is sync
		setTimeout(() => {
			this._sendProcessId(ptyProcess);
		}, 500);
	}

	public dispose(): void {
		this._isDisposed = true;
		if (this._titleInterval) {
			clearInterval(this._titleInterval);
		}
		this._titleInterval = null;
		this._onProcessData.dispose();
		this._onProcessExit.dispose();
		this._onProcessReady.dispose();
		this._onProcessTitleChanged.dispose();
		super.dispose();
	}

	private _setupTitlePolling(ptyProcess: pty.IPty) {
		// Send initial timeout async to give event listeners a chance to init
		setTimeout(() => {
			this._sendProcessTitle(ptyProcess);
		}, 0);
		// Setup polling for non-Windows, for Windows `process` doesn't change
		if (!platform.isWindows) {
			this._titleInterval = setInterval(() => {
				if (this._currentTitle !== ptyProcess.process) {
					this._sendProcessTitle(ptyProcess);
				}
			}, 200);
		}
	}

	// Allow any trailing data events to be sent before the exit event is sent.
	// See https://github.com/Tyriar/node-pty/issues/72
	private _queueProcessExit() {
		if (this._closeTimeout) {
			clearTimeout(this._closeTimeout);
		}
		this._closeTimeout = setTimeout(() => this._kill(), 250);
	}

	private _kill(): void {
		// Wait to kill to process until the start up code has run. This prevents us from firing a process exit before a
		// process start.
		this._processStartupComplete!.then(() => {
			if (this._isDisposed) {
				return;
			}
			// Attempt to kill the pty, it may have already been killed at this
			// point but we want to make sure
			try {
				if (this._ptyProcess) {
					this._logService.trace('IPty#kill');
					this._ptyProcess.kill();
				}
			} catch (ex) {
				// Swallow, the pty has already been killed
			}
			this._onProcessExit.fire(this._exitCode || 0);
			this.dispose();
		});
	}

	private _sendProcessId(ptyProcess: pty.IPty) {
		this._onProcessReady.fire({ pid: ptyProcess.pid, cwd: this._initialCwd });
	}

	private _sendProcessTitle(ptyProcess: pty.IPty): void {
		if (this._isDisposed) {
			return;
		}
		this._currentTitle = ptyProcess.process;
		this._onProcessTitleChanged.fire(this._currentTitle);
	}

	public shutdown(immediate: boolean): void {
		if (immediate) {
			this._kill();
		} else {
			this._queueProcessExit();
		}
	}

	public input(data: string): void {
		if (this._isDisposed || !this._ptyProcess) {
			return;
		}
		this._logService.trace('IPty#write', `${data.length} characters`);
		this._ptyProcess.write(data);
	}

	public resize(cols: number, rows: number): void {
		if (this._isDisposed) {
			return;
		}
		if (typeof cols !== 'number' || typeof rows !== 'number' || isNaN(cols) || isNaN(rows)) {
			return;
		}
		// Ensure that cols and rows are always >= 1, this prevents a native
		// exception in winpty.
		if (this._ptyProcess) {
			cols = Math.max(cols, 1);
			rows = Math.max(rows, 1);
			this._logService.trace('IPty#resize', cols, rows);
			this._ptyProcess.resize(cols, rows);
		}
	}

	public getInitialCwd(): Promise<string> {
		return Promise.resolve(this._initialCwd);
	}

	public getCwd(): Promise<string> {
		if (platform.isMacintosh) {
			return new Promise<string>(resolve => {
				if (!this._ptyProcess) {
					resolve(this._initialCwd);
					return;
				}
				this._logService.trace('IPty#pid');
				exec('lsof -p ' + this._ptyProcess.pid + ' | grep cwd', (error, stdout, stderr) => {
					if (stdout !== '') {
						resolve(stdout.substring(stdout.indexOf('/'), stdout.length - 1));
					}
				});
			});
		}

		if (platform.isLinux) {
			return new Promise<string>(resolve => {
				if (!this._ptyProcess) {
					resolve(this._initialCwd);
					return;
				}
				this._logService.trace('IPty#pid');
				fs.readlink('/proc/' + this._ptyProcess.pid + '/cwd', (err, linkedstr) => {
					if (err) {
						resolve(this._initialCwd);
					}
					resolve(linkedstr);
				});
			});
		}

		return new Promise<string>(resolve => {
			resolve(this._initialCwd);
		});
	}

	public getLatency(): Promise<number> {
		return Promise.resolve(0);
	}
}
