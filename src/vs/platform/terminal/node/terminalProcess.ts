/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { exec } from 'child_process';
import { timeout } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import * as path from '../../../base/common/path.js';
import { IProcessEnvironment, isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { findExecutable } from '../../../base/node/processes.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService, LogLevel } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { FlowControlConstants, IShellLaunchConfig, ITerminalChildProcess, ITerminalLaunchError, IProcessProperty, IProcessPropertyMap as IProcessPropertyMap, ProcessPropertyType, TerminalShellType, IProcessReadyEvent, ITerminalProcessOptions, PosixShellType, IProcessReadyWindowsPty, GeneralShellType, ITerminalLaunchResult } from '../common/terminal.js';
import { ChildProcessMonitor } from './childProcessMonitor.js';
import { getShellIntegrationInjection, getWindowsBuildNumber, IShellIntegrationConfigInjection } from './terminalEnvironment.js';
import { WindowsShellHelper } from './windowsShellHelper.js';
import { IPty, IPtyForkOptions, IWindowsPtyForkOptions, spawn } from 'node-pty';
import { isNumber } from '../../../base/common/types.js';

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
	 * The amount of time to wait when a call is throttled beyond the exact amount, this is used to
	 * try prevent early timeouts causing a kill/spawn call to happen at double the regular
	 * interval.
	 */
	KillSpawnSpacingDuration = 50,
}

const posixShellTypeMap = new Map<string, PosixShellType>([
	['bash', PosixShellType.Bash],
	['csh', PosixShellType.Csh],
	['fish', PosixShellType.Fish],
	['ksh', PosixShellType.Ksh],
	['sh', PosixShellType.Sh],
	['zsh', PosixShellType.Zsh]
]);

const generalShellTypeMap = new Map<string, GeneralShellType>([
	['pwsh', GeneralShellType.PowerShell],
	['powershell', GeneralShellType.PowerShell],
	['python', GeneralShellType.Python],
	['julia', GeneralShellType.Julia],
	['nu', GeneralShellType.NuShell],
	['node', GeneralShellType.Node],

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
		usedShellIntegrationInjection: undefined,
		shellIntegrationInjectionFailureReason: undefined,
	};
	private static _lastKillOrStart = 0;
	private _exitCode: number | undefined;
	private _exitMessage: string | undefined;
	private _closeTimeout: Timeout | undefined;
	private _ptyProcess: IPty | undefined;
	private _currentTitle: string = '';
	private _processStartupComplete: Promise<void> | undefined;
	private _windowsShellHelper: WindowsShellHelper | undefined;
	private _childProcessMonitor: ChildProcessMonitor | undefined;
	private _titleInterval: Timeout | undefined;
	private _delayedResizer: DelayedResizer | undefined;
	private readonly _initialCwd: string;
	private readonly _ptyOptions: IPtyForkOptions | IWindowsPtyForkOptions;

	private _isPtyPaused: boolean = false;
	private _unacknowledgedCharCount: number = 0;
	get exitMessage(): string | undefined { return this._exitMessage; }

	get currentTitle(): string { return this._windowsShellHelper?.shellTitle || this._currentTitle; }
	get shellType(): TerminalShellType | undefined { return isWindows ? this._windowsShellHelper?.shellType : posixShellTypeMap.get(this._currentTitle) || generalShellTypeMap.get(this._currentTitle); }
	get hasChildProcesses(): boolean { return this._childProcessMonitor?.hasChildProcesses || false; }

	private readonly _onProcessData = this._register(new Emitter<string>());
	readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessReady = this._register(new Emitter<IProcessReadyEvent>());
	readonly onProcessReady = this._onProcessReady.event;
	private readonly _onDidChangeProperty = this._register(new Emitter<IProcessProperty>());
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
		const useConptyDll = useConpty && this._options.windowsUseConptyDll;
		this._ptyOptions = {
			name,
			cwd,
			// TODO: When node-pty is updated this cast can be removed
			env: env as { [key: string]: string },
			cols,
			rows,
			useConpty,
			useConptyDll,
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
		this._register(toDisposable(() => {
			if (this._titleInterval) {
				clearInterval(this._titleInterval);
				this._titleInterval = undefined;
			}
		}));
		this._register(toDisposable(() => {
			this._ptyProcess = undefined;
			this._processStartupComplete = undefined;
		}));
	}

	async start(): Promise<ITerminalLaunchError | ITerminalLaunchResult | undefined> {
		const results = await Promise.all([this._validateCwd(), this._validateExecutable()]);
		const firstError = results.find(r => r !== undefined);
		if (firstError) {
			return firstError;
		}

		const injection = await getShellIntegrationInjection(this.shellLaunchConfig, this._options, this._ptyOptions.env, this._logService, this._productService);
		if (injection.type === 'injection') {
			this._onDidChangeProperty.fire({ type: ProcessPropertyType.UsedShellIntegrationInjection, value: true });
			if (injection.envMixin) {
				for (const [key, value] of Object.entries(injection.envMixin)) {
					this._ptyOptions.env ||= {};
					this._ptyOptions.env[key] = value;
				}
			}
			if (injection.filesToCopy) {
				for (const f of injection.filesToCopy) {
					try {
						await fs.promises.mkdir(path.dirname(f.dest), { recursive: true });
						await fs.promises.copyFile(f.source, f.dest);
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
			this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellIntegrationInjectionFailureReason, value: injection.reason });
			// Even if shell integration injection failed, still set the nonce if one was provided
			// This allows extensions to use shell integration with custom shells
			if (this._options.shellIntegration.nonce) {
				this._ptyOptions.env ||= {};
				this._ptyOptions.env['VSCODE_NONCE'] = this._options.shellIntegration.nonce;
			}
		}

		try {
			const injectionConfig: IShellIntegrationConfigInjection | undefined = injection.type === 'injection' ? injection : undefined;
			await this.setupPtyProcess(this.shellLaunchConfig, this._ptyOptions, injectionConfig);
			if (injectionConfig?.newArgs) {
				return { injectedArgs: injectionConfig.newArgs };
			}
			return undefined;
		} catch (err) {
			this._logService.trace('node-pty.node-pty.IPty#spawn native exception', err);
			return { message: `A native exception occurred during launch (${err.message})` };
		}
	}

	private async _validateCwd(): Promise<undefined | ITerminalLaunchError> {
		try {
			const result = await fs.promises.stat(this._initialCwd);
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
		const executable = await findExecutable(slc.executable, cwd, envPaths, this._executableEnv);
		if (!executable) {
			return { message: localize('launchFail.executableDoesNotExist', "Path to shell executable \"{0}\" does not exist", slc.executable) };
		}

		try {
			const result = await fs.promises.stat(executable);
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
		this._register(this._childProcessMonitor.onDidChangeHasChildProcesses(value => this._onDidChangeProperty.fire({ type: ProcessPropertyType.HasChildProcesses, value })));
		this._processStartupComplete = new Promise<void>(c => {
			this._register(this.onProcessReady(() => c()));
		});
		this._register(ptyProcess.onData(data => {
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
		}));
		this._register(ptyProcess.onExit(e => {
			this._exitCode = e.exitCode;
			this._queueProcessExit();
		}));
		this._sendProcessId(ptyProcess.pid);
		this._setupTitlePolling(ptyProcess);
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
		if (this._logService.getLevel() === LogLevel.Trace) {
			this._logService.trace('TerminalProcess#_queueProcessExit', new Error().stack?.replace(/^Error/, ''));
		}
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
		if (this._store.isDisposed) {
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
		if (!isWindows || !hasConptyOption(this._ptyOptions) || !this._ptyOptions.useConpty) {
			return;
		}
		// Don't throttle when using conpty.dll as it seems to have been fixed in later versions
		if (this._ptyOptions.useConptyDll) {
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
		if (this._store.isDisposed) {
			return;
		}
		// HACK: The node-pty API can return undefined somehow https://github.com/microsoft/vscode/issues/222323
		this._currentTitle = (ptyProcess.process ?? '');
		this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: this._currentTitle });
		// If fig is installed it may change the title of the process
		let sanitizedTitle = this.currentTitle.replace(/ \(figterm\)$/g, '');
		// Ensure any prefixed path is removed so that the executable name since we use this to
		// detect the shell type
		if (!isWindows) {
			sanitizedTitle = path.basename(sanitizedTitle);
		}

		if (sanitizedTitle.toLowerCase().startsWith('python')) {
			this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: GeneralShellType.Python });
		} else if (sanitizedTitle.toLowerCase().startsWith('julia')) {
			this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: GeneralShellType.Julia });
		} else {
			const shellTypeValue = posixShellTypeMap.get(sanitizedTitle) || generalShellTypeMap.get(sanitizedTitle);
			this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: shellTypeValue });
		}
	}

	shutdown(immediate: boolean): void {
		if (this._logService.getLevel() === LogLevel.Trace) {
			this._logService.trace('TerminalProcess#shutdown', new Error().stack?.replace(/^Error/, ''));
		}
		// don't force immediate disposal of the terminal processes on Windows as an additional
		// mitigation for https://github.com/microsoft/vscode/issues/71966 which causes the pty host
		// to become unresponsive, disconnecting all terminals across all windows.
		if (immediate && !isWindows) {
			this._kill();
		} else {
			if (!this._closeTimeout && !this._store.isDisposed) {
				this._queueProcessExit();
				// Allow a maximum amount of time for the process to exit, otherwise force kill it
				setTimeout(() => {
					if (this._closeTimeout && !this._store.isDisposed) {
						this._closeTimeout = undefined;
						this._kill();
					}
				}, ShutdownConstants.MaximumShutdownTime);
			}
		}
	}

	input(data: string, isBinary: boolean = false): void {
		this._logService.trace('node-pty.IPty#write', data, isBinary);
		if (isBinary) {
			this._ptyProcess!.write(Buffer.from(data, 'binary'));
		} else {
			this._ptyProcess!.write(data);
		}
		this._childProcessMonitor?.handleInput();
	}

	sendSignal(signal: string): void {
		if (this._store.isDisposed || !this._ptyProcess) {
			return;
		}
		this._ptyProcess.kill(signal);
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

	resize(cols: number, rows: number): void {
		if (this._store.isDisposed) {
			return;
		}
		if (!isNumber(cols) || !isNumber(rows)) {
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
				return await fs.promises.readlink(`/proc/${this._ptyProcess.pid}/cwd`);
			} catch (error) {
				return this._initialCwd;
			}
		}

		return this._initialCwd;
	}

	getWindowsPty(): IProcessReadyWindowsPty | undefined {
		return isWindows ? {
			backend: hasConptyOption(this._ptyOptions) && this._ptyOptions.useConpty ? 'conpty' : 'winpty',
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
	private _timeout: Timeout;

	private readonly _onTrigger = this._register(new Emitter<{ rows?: number; cols?: number }>());
	get onTrigger(): Event<{ rows?: number; cols?: number }> { return this._onTrigger.event; }

	constructor() {
		super();
		this._timeout = setTimeout(() => {
			this._onTrigger.fire({ rows: this.rows, cols: this.cols });
		}, 1000);
		this._register(toDisposable(() => clearTimeout(this._timeout)));
	}
}

function hasConptyOption(obj: IPtyForkOptions | IWindowsPtyForkOptions): obj is IWindowsPtyForkOptions {
	return 'useConpty' in obj;
}
