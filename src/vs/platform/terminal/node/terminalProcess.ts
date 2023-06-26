/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { timeout } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as path from 'vs/base/common/path';
import { IProcessEnvironment, isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { Promises } from 'vs/base/node/pfs';
import { localize } from 'vs/nls';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { FlowControlConstants, IShellLaunchConfig, ITerminalChildProcess, ITerminalLaunchError, IProcessProperty, IProcessPropertyMap as IProcessPropertyMap, ProcessPropertyType, TerminalShellType, IProcessReadyEvent, ITerminalProcessOptions, PosixShellType, IProcessReadyWindowsPty } from 'vs/platform/terminal/common/terminal';
import { ChildProcessMonitor } from 'vs/platform/terminal/node/childProcessMonitor';
import { findExecutable, getShellIntegrationInjection, getWindowsBuildNumber, IShellIntegrationConfigInjection } from 'vs/platform/terminal/node/terminalEnvironment';
import { WindowsShellHelper } from 'vs/platform/terminal/node/windowsShellHelper';
import { IPty, IPtyForkOptions, IWindowsPtyForkOptions, spawn } from 'node-pty';

const enum ShutdownConstants {
	/**
	 * The amount of ms that must pass between data events after exit is queued before the actual
	 * kill call is triggered. This data flush mechanism works around an [issue in node-pty][1]
	 * where not all data is flushed which causes problems for task problem matchers. Additionally
	 * on Windows under conpty, killing a process while data is being output will cause the [conhost
	 * flush to hang the pty host][2] because [conhost should be hosted on another thread][3].
	 *
	 * [1]: https://github.com/Tyriar/node-pty/issues/72
	 * [2]: https://github.com/microsoft/vscode/issues/71966
	 * [3]: https://github.com/microsoft/node-pty/pull/415
	 */
	DataFlushTimeout = 250,
	/**
	 * The maximum ms to allow after dispose is called because forcefully killing the process.
	 */
	MaximumShutdownTime = 5000
}

const enum Constants {
	/**
	 * The minimum duration between kill and spawn calls on Windows/conpty as a mitigation for a
	 * hang issue. See:
	 * - https://github.com/microsoft/vscode/issues/71966
	 * - https://github.com/microsoft/vscode/issues/117956
	 * - https://github.com/microsoft/vscode/issues/121336
	 */
	KillSpawnThrottleInterval = 250,
	/**
	 * The amount of time to wait when a call is throttles beyond the exact amount, this is used to
	 * try prevent early timeouts causing a kill/spawn call to happen at double the regular
	 * interval.
	 */
	KillSpawnSpacingDuration = 50,

	/**
	 * Writing large amounts of data can be corrupted for some reason, after looking into this is
	 * appears to be a race condition around writing to the FD which may be based on how powerful
	 * the hardware is. The workaround for this is to space out when large amounts of data is being
	 * written to the terminal. See https://github.com/microsoft/vscode/issues/38137
	 */
	WriteMaxChunkSize = 50,
	/**
	 * How long to wait between chunk writes.
	 */
	WriteInterval = 5,
}

interface IWriteObject {
	data: string;
	isBinary: boolean;
}

const posixShellTypeMap = new Map<string, PosixShellType>([
	['bash', PosixShellType.Bash],
	['csh', PosixShellType.Csh],
	['fish', PosixShellType.Fish],
	['ksh', PosixShellType.Ksh],
	['sh', PosixShellType.Sh],
	['pwsh', PosixShellType.PowerShell],
	['zsh', PosixShellType.Zsh]
]);

export class TerminalProcess extends Disposable implements ITerminalChildProcess {
	readonly id = 0;
	readonly shouldPersist = false;

	private _properties: IProcessPropertyMap = {
		cwd: '',
		initialCwd: '',
		fixedDimensions: { cols: undefined, rows: undefined },
		title: '',
		shellType: undefined,
		hasChildProcesses: true,
		resolvedShellLaunchConfig: {},
		overrideDimensions: undefined,
		failedShellIntegrationActivation: false,
		usedShellIntegrationInjection: undefined
	};
	private static _lastKillOrStart = 0;
	private _exitCode: number | undefined;
	private _exitMessage: string | undefined;
	private _closeTimeout: any;
	private _ptyProcess: IPty | undefined;
	private _currentTitle: string = '';
	private _processStartupComplete: Promise<void> | undefined;
	private _isDisposed: boolean = false;
	private _windowsShellHelper: WindowsShellHelper | undefined;
	private _childProcessMonitor: ChildProcessMonitor | undefined;
	private _titleInterval: NodeJS.Timer | null = null;
	private _writeQueue: IWriteObject[] = [];
	private _writeTimeout: NodeJS.Timeout | undefined;
	private _delayedResizer: DelayedResizer | undefined;
	private readonly _initialCwd: string;
	private readonly _ptyOptions: IPtyForkOptions | IWindowsPtyForkOptions;

	private _isPtyPaused: boolean = false;
	private _unacknowledgedCharCount: number = 0;
	get exitMessage(): string | undefined { return this._exitMessage; }

	get currentTitle(): string { return this._windowsShellHelper?.shellTitle || this._currentTitle; }
	get shellType(): TerminalShellType | undefined { return isWindows ? this._windowsShellHelper?.shellType : posixShellTypeMap.get(this._currentTitle); }
	get hasChildProcesses(): boolean { return this._childProcessMonitor?.hasChildProcesses || false; }

	private readonly _onProcessData = this._register(new Emitter<string>());
	readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessReady = this._register(new Emitter<IProcessReadyEvent>());
	readonly onProcessReady = this._onProcessReady.event;
	private readonly _onDidChangeProperty = this._register(new Emitter<IProcessProperty<any>>());
	readonly onDidChangeProperty = this._onDidChangeProperty.event;
	private readonly _onProcessExit = this._register(new Emitter<number>());
	readonly onProcessExit = this._onProcessExit.event;

	constructor(
		readonly shellLaunchConfig: IShellLaunchConfig,
		cwd: string,
		cols: number,
		rows: number,
		env: IProcessEnvironment,
		/**
		 * environment used for `findExecutable`
		 */
		private readonly _executableEnv: IProcessEnvironment,
		private readonly _options: ITerminalProcessOptions,
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService
	) {
		super();
		let name: string;
		if (isWindows) {
			name = path.basename(this.shellLaunchConfig.executable || '');
		} else {
			// Using 'xterm-256color' here helps ensure that the majority of Linux distributions will use a
			// color prompt as defined in the default ~/.bashrc file.
			name = 'xterm-256color';
		}
		this._initialCwd = cwd;
		this._properties[ProcessPropertyType.InitialCwd] = this._initialCwd;
		this._properties[ProcessPropertyType.Cwd] = this._initialCwd;
		const useConpty = this._options.windowsEnableConpty && process.platform === 'win32' && getWindowsBuildNumber() >= 18309;
		this._ptyOptions = {
			name,
			cwd,
			// TODO: When node-pty is updated this cast can be removed
			env: env as { [key: string]: string },
			cols,
			rows,
			useConpty,
			// This option will force conpty to not redraw the whole viewport on launch
			conptyInheritCursor: useConpty && !!shellLaunchConfig.initialText
		};
		// Delay resizes to avoid conpty not respecting very early resize calls
		if (isWindows) {
			if (useConpty && cols === 0 && rows === 0 && this.shellLaunchConfig.executable?.endsWith('Git\\bin\\bash.exe')) {
				this._delayedResizer = new DelayedResizer();
				this._register(this._delayedResizer.onTrigger(dimensions => {
					this._delayedResizer?.dispose();
					this._delayedResizer = undefined;
					if (dimensions.cols && dimensions.rows) {
						this.resize(dimensions.cols, dimensions.rows);
					}
				}));
			}
			// WindowsShellHelper is used to fetch the process title and shell type
			this.onProcessReady(e => {
				this._windowsShellHelper = this._register(new WindowsShellHelper(e.pid));
				this._register(this._windowsShellHelper.onShellTypeChanged(e => this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: e })));
				this._register(this._windowsShellHelper.onShellNameChanged(e => this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: e })));
			});
		}
	}

	async start(): Promise<ITerminalLaunchError | { injectedArgs: string[] } | undefined> {
		const results = await Promise.all([this._validateCwd(), this._validateExecutable()]);
		const firstError = results.find(r => r !== undefined);
		if (firstError) {
			return firstError;
		}

		let injection: IShellIntegrationConfigInjection | undefined;
		if (this._options.shellIntegration.enabled) {
			injection = getShellIntegrationInjection(this.shellLaunchConfig, this._options, this._ptyOptions.env, this._logService, this._productService);
			if (injection) {
				this._onDidChangeProperty.fire({ type: ProcessPropertyType.UsedShellIntegrationInjection, value: true });
				if (injection.envMixin) {
					for (const [key, value] of Object.entries(injection.envMixin)) {
						this._ptyOptions.env ||= {};
						this._ptyOptions.env[key] = value;
					}
				}
				if (injection.filesToCopy) {
					for (const f of injection.filesToCopy) {
						await fs.mkdir(path.dirname(f.dest), { recursive: true });
						try {
							await fs.copyFile(f.source, f.dest);
						} catch {
							// Swallow error, this should only happen when multiple users are on the same
							// machine. Since the shell integration scripts rarely change, plus the other user
							// should be using the same version of the server in this case, assume the script is
							// fine if copy fails and swallow the error.
						}
					}
				}
			} else {
				this._onDidChangeProperty.fire({ type: ProcessPropertyType.FailedShellIntegrationActivation, value: true });
			}
		}

		try {
			await this.setupPtyProcess(this.shellLaunchConfig, this._ptyOptions, injection);
			if (injection?.newArgs) {
				return { injectedArgs: injection.newArgs };
			}
			return undefined;
		} catch (err) {
			this._logService.trace('node-pty.node-pty.IPty#spawn native exception', err);
			return { message: `A native exception occurred during launch (${err.message})` };
		}
	}

	private async _validateCwd(): Promise<undefined | ITerminalLaunchError> {
		try {
			const result = await Promises.stat(this._initialCwd);
			if (!result.isDirectory()) {
				return { message: localize('launchFail.cwdNotDirectory', "Starting directory (cwd) \"{0}\" is not a directory", this._initialCwd.toString()) };
			}
		} catch (err) {
			if (err?.code === 'ENOENT') {
				return { message: localize('launchFail.cwdDoesNotExist', "Starting directory (cwd) \"{0}\" does not exist", this._initialCwd.toString()) };
			}
		}
		this._onDidChangeProperty.fire({ type: ProcessPropertyType.InitialCwd, value: this._initialCwd });
		return undefined;
	}

	private async _validateExecutable(): Promise<undefined | ITerminalLaunchError> {
		const slc = this.shellLaunchConfig;
		if (!slc.executable) {
			throw new Error('IShellLaunchConfig.executable not set');
		}

		const cwd = slc.cwd instanceof URI ? slc.cwd.path : slc.cwd;
		const envPaths: string[] | undefined = (slc.env && slc.env.PATH) ? slc.env.PATH.split(path.delimiter) : undefined;
		const executable = await findExecutable(slc.executable!, cwd, envPaths, this._executableEnv);
		if (!executable) {
			return { message: localize('launchFail.executableDoesNotExist', "Path to shell executable \"{0}\" does not exist", slc.executable) };
		}

		try {
			const result = await Promises.stat(executable);
			if (!result.isFile() && !result.isSymbolicLink()) {
				return { message: localize('launchFail.executableIsNotFileOrSymlink', "Path to shell executable \"{0}\" is not a file or a symlink", slc.executable) };
			}
			// Set the executable explicitly here so that node-pty doesn't need to search the
			// $PATH too.
			slc.executable = executable;
		} catch (err) {
			if (err?.code === 'EACCES') {
				// Swallow
			} else {
				throw err;
			}
		}
		return undefined;
	}

	private async setupPtyProcess(
		shellLaunchConfig: IShellLaunchConfig,
		options: IPtyForkOptions,
		shellIntegrationInjection: IShellIntegrationConfigInjection | undefined
	): Promise<void> {
		const args = shellIntegrationInjection?.newArgs || shellLaunchConfig.args || [];
		await this._throttleKillSpawn();
		this._logService.trace('node-pty.IPty#spawn', shellLaunchConfig.executable, args, options);
		const ptyProcess = spawn(shellLaunchConfig.executable!, args, options);
		this._ptyProcess = ptyProcess;
		this._childProcessMonitor = this._register(new ChildProcessMonitor(ptyProcess.pid, this._logService));
		this._childProcessMonitor.onDidChangeHasChildProcesses(value => this._onDidChangeProperty.fire({ type: ProcessPropertyType.HasChildProcesses, value }));
		this._processStartupComplete = new Promise<void>(c => {
			this.onProcessReady(() => c());
		});
		ptyProcess.onData(data => {
			// Handle flow control
			this._unacknowledgedCharCount += data.length;
			if (!this._isPtyPaused && this._unacknowledgedCharCount > FlowControlConstants.HighWatermarkChars) {
				this._logService.trace(`Flow control: Pause (${this._unacknowledgedCharCount} > ${FlowControlConstants.HighWatermarkChars})`);
				this._isPtyPaused = true;
				ptyProcess.pause();
			}

			// Refire the data event
			this._logService.trace('node-pty.IPty#onData', data);
			this._onProcessData.fire(data);
			if (this._closeTimeout) {
				this._queueProcessExit();
			}
			this._windowsShellHelper?.checkShell();
			this._childProcessMonitor?.handleOutput();
		});
		ptyProcess.onExit(e => {
			this._exitCode = e.exitCode;
			this._queueProcessExit();
		});
		this._sendProcessId(ptyProcess.pid);
		this._setupTitlePolling(ptyProcess);
	}

	override dispose(): void {
		this._isDisposed = true;
		if (this._titleInterval) {
			clearInterval(this._titleInterval);
		}
		this._titleInterval = null;
		super.dispose();
	}

	private _setupTitlePolling(ptyProcess: IPty) {
		// Send initial timeout async to give event listeners a chance to init
		setTimeout(() => this._sendProcessTitle(ptyProcess));
		// Setup polling for non-Windows, for Windows `process` doesn't change
		if (!isWindows) {
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
		this._closeTimeout = setTimeout(() => {
			this._closeTimeout = undefined;
			this._kill();
		}, ShutdownConstants.DataFlushTimeout);
	}

	private async _kill(): Promise<void> {
		// Wait to kill to process until the start up code has run. This prevents us from firing a process exit before a
		// process start.
		await this._processStartupComplete;
		if (this._isDisposed) {
			return;
		}
		// Attempt to kill the pty, it may have already been killed at this
		// point but we want to make sure
		try {
			if (this._ptyProcess) {
				await this._throttleKillSpawn();
				this._logService.trace('node-pty.IPty#kill');
				this._ptyProcess.kill();
			}
		} catch (ex) {
			// Swallow, the pty has already been killed
		}
		this._onProcessExit.fire(this._exitCode || 0);
		this.dispose();
	}

	private async _throttleKillSpawn(): Promise<void> {
		// Only throttle on Windows/conpty
		if (!isWindows || !('useConpty' in this._ptyOptions) || !this._ptyOptions.useConpty) {
			return;
		}
		// Use a loop to ensure multiple calls in a single interval space out
		while (Date.now() - TerminalProcess._lastKillOrStart < Constants.KillSpawnThrottleInterval) {
			this._logService.trace('Throttling kill/spawn call');
			await timeout(Constants.KillSpawnThrottleInterval - (Date.now() - TerminalProcess._lastKillOrStart) + Constants.KillSpawnSpacingDuration);
		}
		TerminalProcess._lastKillOrStart = Date.now();
	}

	private _sendProcessId(pid: number) {
		this._onProcessReady.fire({
			pid,
			cwd: this._initialCwd,
			windowsPty: this.getWindowsPty()
		});
	}

	private _sendProcessTitle(ptyProcess: IPty): void {
		if (this._isDisposed) {
			return;
		}
		this._currentTitle = ptyProcess.process;
		this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: this._currentTitle });
		// If fig is installed it may change the title of the process
		const sanitizedTitle = this.currentTitle.replace(/ \(figterm\)$/g, '');
		this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: posixShellTypeMap.get(sanitizedTitle) });
	}

	shutdown(immediate: boolean): void {
		// don't force immediate disposal of the terminal processes on Windows as an additional
		// mitigation for https://github.com/microsoft/vscode/issues/71966 which causes the pty host
		// to become unresponsive, disconnecting all terminals across all windows.
		if (immediate && !isWindows) {
			this._kill();
		} else {
			if (!this._closeTimeout && !this._isDisposed) {
				this._queueProcessExit();
				// Allow a maximum amount of time for the process to exit, otherwise force kill it
				setTimeout(() => {
					if (this._closeTimeout && !this._isDisposed) {
						this._closeTimeout = undefined;
						this._kill();
					}
				}, ShutdownConstants.MaximumShutdownTime);
			}
		}
	}

	input(data: string, isBinary?: boolean): void {
		if (this._isDisposed || !this._ptyProcess) {
			return;
		}
		for (let i = 0; i <= Math.floor(data.length / Constants.WriteMaxChunkSize); i++) {
			const obj = {
				isBinary: isBinary || false,
				data: data.substr(i * Constants.WriteMaxChunkSize, Constants.WriteMaxChunkSize)
			};
			this._writeQueue.push(obj);
		}
		this._startWrite();
	}

	async processBinary(data: string): Promise<void> {
		this.input(data, true);
	}

	async refreshProperty<T extends ProcessPropertyType>(type: T): Promise<IProcessPropertyMap[T]> {
		switch (type) {
			case ProcessPropertyType.Cwd: {
				const newCwd = await this.getCwd();
				if (newCwd !== this._properties.cwd) {
					this._properties.cwd = newCwd;
					this._onDidChangeProperty.fire({ type: ProcessPropertyType.Cwd, value: this._properties.cwd });
				}
				return newCwd as IProcessPropertyMap[T];
			}
			case ProcessPropertyType.InitialCwd: {
				const initialCwd = await this.getInitialCwd();
				if (initialCwd !== this._properties.initialCwd) {
					this._properties.initialCwd = initialCwd;
					this._onDidChangeProperty.fire({ type: ProcessPropertyType.InitialCwd, value: this._properties.initialCwd });
				}
				return initialCwd as IProcessPropertyMap[T];
			}
			case ProcessPropertyType.Title:
				return this.currentTitle as IProcessPropertyMap[T];
			default:
				return this.shellType as IProcessPropertyMap[T];
		}
	}

	async updateProperty<T extends ProcessPropertyType>(type: T, value: IProcessPropertyMap[T]): Promise<void> {
		if (type === ProcessPropertyType.FixedDimensions) {
			this._properties.fixedDimensions = value as IProcessPropertyMap[ProcessPropertyType.FixedDimensions];
		}
	}

	private _startWrite(): void {
		// Don't write if it's already queued of is there is nothing to write
		if (this._writeTimeout !== undefined || this._writeQueue.length === 0) {
			return;
		}

		this._doWrite();

		// Don't queue more writes if the queue is empty
		if (this._writeQueue.length === 0) {
			this._writeTimeout = undefined;
			return;
		}

		// Queue the next write
		this._writeTimeout = setTimeout(() => {
			this._writeTimeout = undefined;
			this._startWrite();
		}, Constants.WriteInterval);
	}

	private _doWrite(): void {
		const object = this._writeQueue.shift()!;
		this._logService.trace('node-pty.IPty#write', object.data);
		if (object.isBinary) {
			this._ptyProcess!.write(Buffer.from(object.data, 'binary') as any);
		} else {
			this._ptyProcess!.write(object.data);
		}
		this._childProcessMonitor?.handleInput();
	}

	resize(cols: number, rows: number): void {
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

			// Delay resize if needed
			if (this._delayedResizer) {
				this._delayedResizer.cols = cols;
				this._delayedResizer.rows = rows;
				return;
			}

			this._logService.trace('node-pty.IPty#resize', cols, rows);
			try {
				this._ptyProcess.resize(cols, rows);
			} catch (e) {
				// Swallow error if the pty has already exited
				this._logService.trace('node-pty.IPty#resize exception ' + e.message);
				if (this._exitCode !== undefined &&
					e.message !== 'ioctl(2) failed, EBADF' &&
					e.message !== 'Cannot resize a pty that has already exited') {
					throw e;
				}
			}
		}
	}

	clearBuffer(): void {
		this._ptyProcess?.clear();
	}

	acknowledgeDataEvent(charCount: number): void {
		// Prevent lower than 0 to heal from errors
		this._unacknowledgedCharCount = Math.max(this._unacknowledgedCharCount - charCount, 0);
		this._logService.trace(`Flow control: Ack ${charCount} chars (unacknowledged: ${this._unacknowledgedCharCount})`);
		if (this._isPtyPaused && this._unacknowledgedCharCount < FlowControlConstants.LowWatermarkChars) {
			this._logService.trace(`Flow control: Resume (${this._unacknowledgedCharCount} < ${FlowControlConstants.LowWatermarkChars})`);
			this._ptyProcess?.resume();
			this._isPtyPaused = false;
		}
	}

	clearUnacknowledgedChars(): void {
		this._unacknowledgedCharCount = 0;
		this._logService.trace(`Flow control: Cleared all unacknowledged chars, forcing resume`);
		if (this._isPtyPaused) {
			this._ptyProcess?.resume();
			this._isPtyPaused = false;
		}
	}

	async setUnicodeVersion(version: '6' | '11'): Promise<void> {
		// No-op
	}

	getInitialCwd(): Promise<string> {
		return Promise.resolve(this._initialCwd);
	}

	async getCwd(): Promise<string> {
		if (isMacintosh) {
			// From Big Sur (darwin v20) there is a spawn blocking thread issue on Electron,
			// this is fixed in VS Code's internal Electron.
			// https://github.com/Microsoft/vscode/issues/105446
			return new Promise<string>(resolve => {
				if (!this._ptyProcess) {
					resolve(this._initialCwd);
					return;
				}
				this._logService.trace('node-pty.IPty#pid');
				exec('lsof -OPln -p ' + this._ptyProcess.pid + ' | grep cwd', { env: { ...process.env, LANG: 'en_US.UTF-8' } }, (error, stdout, stderr) => {
					if (!error && stdout !== '') {
						resolve(stdout.substring(stdout.indexOf('/'), stdout.length - 1));
					} else {
						this._logService.error('lsof did not run successfully, it may not be on the $PATH?', error, stdout, stderr);
						resolve(this._initialCwd);
					}
				});
			});
		}

		if (isLinux) {
			if (!this._ptyProcess) {
				return this._initialCwd;
			}
			this._logService.trace('node-pty.IPty#pid');
			try {
				return await Promises.readlink(`/proc/${this._ptyProcess.pid}/cwd`);
			} catch (error) {
				return this._initialCwd;
			}
		}

		return this._initialCwd;
	}

	getLatency(): Promise<number> {
		return Promise.resolve(0);
	}

	getWindowsPty(): IProcessReadyWindowsPty | undefined {
		return isWindows ? {
			backend: 'useConpty' in this._ptyOptions && this._ptyOptions.useConpty ? 'conpty' : 'winpty',
			buildNumber: getWindowsBuildNumber()
		} : undefined;
	}
}

/**
 * Tracks the latest resize event to be trigger at a later point.
 */
class DelayedResizer extends Disposable {
	rows: number | undefined;
	cols: number | undefined;
	private _timeout: NodeJS.Timeout;

	private readonly _onTrigger = this._register(new Emitter<{ rows?: number; cols?: number }>());
	get onTrigger(): Event<{ rows?: number; cols?: number }> { return this._onTrigger.event; }

	constructor() {
		super();
		this._timeout = setTimeout(() => {
			this._onTrigger.fire({ rows: this.rows, cols: this.cols });
		}, 1000);
		this._register({
			dispose: () => {
				clearTimeout(this._timeout);
			}
		});
	}

	override dispose(): void {
		super.dispose();
		clearTimeout(this._timeout);
	}
}
