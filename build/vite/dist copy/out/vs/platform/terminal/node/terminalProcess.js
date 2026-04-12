/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TerminalProcess_1;
import * as fs from 'fs';
import { exec } from 'child_process';
import { timeout } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import * as path from '../../../base/common/path.js';
import { isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { findExecutable } from '../../../base/node/processes.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService, LogLevel } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ChildProcessMonitor } from './childProcessMonitor.js';
import { getShellIntegrationInjection, sanitizeEnvForLogging } from './terminalEnvironment.js';
import { WindowsShellHelper } from './windowsShellHelper.js';
import { spawn } from 'node-pty';
import { isNumber } from '../../../base/common/types.js';
import { getWindowsBuildNumberSync } from '../../../base/node/windowsVersion.js';
var ShutdownConstants;
(function (ShutdownConstants) {
    /**
     * The amount of ms that must pass between data events after exit is queued before the actual
     * kill call is triggered. This data flush mechanism works around an [issue in node-pty][1]
     * where not all data is flushed which causes problems for task problem matchers. Additionally
     * on Windows under conpty, killing a process while data is being output will cause the [conhost
     * flush to hang the pty host][2] because [conhost should be hosted on another thread][3].
     *
     * [1]: https://github.com/microsoft/node-pty/issues/72
     * [2]: https://github.com/microsoft/vscode/issues/71966
     * [3]: https://github.com/microsoft/node-pty/pull/415
     */
    ShutdownConstants[ShutdownConstants["DataFlushTimeout"] = 250] = "DataFlushTimeout";
    /**
     * The maximum ms to allow after dispose is called because forcefully killing the process.
     */
    ShutdownConstants[ShutdownConstants["MaximumShutdownTime"] = 5000] = "MaximumShutdownTime";
})(ShutdownConstants || (ShutdownConstants = {}));
var Constants;
(function (Constants) {
    /**
     * The minimum duration between kill and spawn calls on Windows/conpty as a mitigation for a
     * hang issue. See:
     * - https://github.com/microsoft/vscode/issues/71966
     * - https://github.com/microsoft/vscode/issues/117956
     * - https://github.com/microsoft/vscode/issues/121336
     */
    Constants[Constants["KillSpawnThrottleInterval"] = 250] = "KillSpawnThrottleInterval";
    /**
     * The amount of time to wait when a call is throttled beyond the exact amount, this is used to
     * try prevent early timeouts causing a kill/spawn call to happen at double the regular
     * interval.
     */
    Constants[Constants["KillSpawnSpacingDuration"] = 50] = "KillSpawnSpacingDuration";
})(Constants || (Constants = {}));
const posixShellTypeMap = new Map([
    ['bash', "bash" /* PosixShellType.Bash */],
    ['csh', "csh" /* PosixShellType.Csh */],
    ['fish', "fish" /* PosixShellType.Fish */],
    ['ksh', "ksh" /* PosixShellType.Ksh */],
    ['sh', "sh" /* PosixShellType.Sh */],
    ['zsh', "zsh" /* PosixShellType.Zsh */]
]);
const generalShellTypeMap = new Map([
    ['pwsh', "pwsh" /* GeneralShellType.PowerShell */],
    ['powershell', "pwsh" /* GeneralShellType.PowerShell */],
    ['python', "python" /* GeneralShellType.Python */],
    ['julia', "julia" /* GeneralShellType.Julia */],
    ['nu', "nu" /* GeneralShellType.NuShell */],
    ['node', "node" /* GeneralShellType.Node */],
    ['xonsh', "xonsh" /* GeneralShellType.Xonsh */],
]);
let TerminalProcess = class TerminalProcess extends Disposable {
    static { TerminalProcess_1 = this; }
    static { this._lastKillOrStart = 0; }
    get exitMessage() { return this._exitMessage; }
    get currentTitle() { return this._windowsShellHelper?.shellTitle || this._currentTitle; }
    get shellType() { return isWindows ? this._windowsShellHelper?.shellType : posixShellTypeMap.get(this._currentTitle) || generalShellTypeMap.get(this._currentTitle); }
    get hasChildProcesses() { return this._childProcessMonitor?.hasChildProcesses || false; }
    constructor(shellLaunchConfig, cwd, cols, rows, env, 
    /**
     * environment used for `findExecutable`
     */
    _executableEnv, _options, _logService, _productService) {
        super();
        this.shellLaunchConfig = shellLaunchConfig;
        this._executableEnv = _executableEnv;
        this._options = _options;
        this._logService = _logService;
        this._productService = _productService;
        this.id = 0;
        this.shouldPersist = false;
        this._properties = {
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
        this._currentTitle = '';
        this._isPtyPaused = false;
        this._unacknowledgedCharCount = 0;
        this._onProcessData = this._register(new Emitter());
        this.onProcessData = this._onProcessData.event;
        this._onProcessReady = this._register(new Emitter());
        this.onProcessReady = this._onProcessReady.event;
        this._onDidChangeProperty = this._register(new Emitter());
        this.onDidChangeProperty = this._onDidChangeProperty.event;
        this._onProcessExit = this._register(new Emitter());
        this.onProcessExit = this._onProcessExit.event;
        let name;
        if (isWindows) {
            name = path.basename(this.shellLaunchConfig.executable || '');
        }
        else {
            // Using 'xterm-256color' here helps ensure that the majority of Linux distributions will use a
            // color prompt as defined in the default ~/.bashrc file.
            name = 'xterm-256color';
        }
        this._initialCwd = cwd;
        this._properties["initialCwd" /* ProcessPropertyType.InitialCwd */] = this._initialCwd;
        this._properties["cwd" /* ProcessPropertyType.Cwd */] = this._initialCwd;
        const useConpty = process.platform === 'win32' && getWindowsBuildNumberSync() >= 18309;
        const useConptyDll = useConpty && this._options.windowsUseConptyDll;
        this._ptyOptions = {
            name,
            cwd,
            // TODO: When node-pty is updated this cast can be removed
            env: env,
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
                this._delayedResizer = this._register(new DelayedResizer());
                this._register(this._delayedResizer.onTrigger(dimensions => {
                    this._delayedResizer?.dispose();
                    this._delayedResizer = undefined;
                    if (dimensions.cols && dimensions.rows) {
                        this.resize(dimensions.cols, dimensions.rows);
                    }
                }));
            }
            // WindowsShellHelper is used to fetch the process title and shell type
            this._register(this.onProcessReady(e => {
                this._windowsShellHelper = this._register(new WindowsShellHelper(e.pid));
                this._register(this._windowsShellHelper.onShellTypeChanged(e => this._onDidChangeProperty.fire({ type: "shellType" /* ProcessPropertyType.ShellType */, value: e })));
                this._register(this._windowsShellHelper.onShellNameChanged(e => this._onDidChangeProperty.fire({ type: "title" /* ProcessPropertyType.Title */, value: e })));
            }));
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
    async start() {
        const results = await Promise.all([this._validateCwd(), this._validateExecutable()]);
        const firstError = results.find(r => r !== undefined);
        if (firstError) {
            return firstError;
        }
        const injection = await getShellIntegrationInjection(this.shellLaunchConfig, this._options, this._ptyOptions.env, this._logService, this._productService);
        if (injection.type === 'injection') {
            this._onDidChangeProperty.fire({ type: "usedShellIntegrationInjection" /* ProcessPropertyType.UsedShellIntegrationInjection */, value: true });
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
                    }
                    catch {
                        // Swallow error, this should only happen when multiple users are on the same
                        // machine. Since the shell integration scripts rarely change, plus the other user
                        // should be using the same version of the server in this case, assume the script is
                        // fine if copy fails and swallow the error.
                    }
                }
            }
        }
        else {
            this._onDidChangeProperty.fire({ type: "failedShellIntegrationActivation" /* ProcessPropertyType.FailedShellIntegrationActivation */, value: true });
            this._onDidChangeProperty.fire({ type: "shellIntegrationInjectionFailureReason" /* ProcessPropertyType.ShellIntegrationInjectionFailureReason */, value: injection.reason });
            // Even if shell integration injection failed, still set the nonce if one was provided
            // This allows extensions to use shell integration with custom shells
            if (this._options.shellIntegration.nonce) {
                this._ptyOptions.env ||= {};
                this._ptyOptions.env['VSCODE_NONCE'] = this._options.shellIntegration.nonce;
            }
        }
        try {
            const injectionConfig = injection.type === 'injection' ? injection : undefined;
            await this.setupPtyProcess(this.shellLaunchConfig, this._ptyOptions, injectionConfig);
            if (injectionConfig?.newArgs) {
                return { injectedArgs: injectionConfig.newArgs };
            }
            return undefined;
        }
        catch (err) {
            this._logService.trace('node-pty.node-pty.IPty#spawn native exception', err);
            const errorMessage = err.message;
            if (errorMessage?.includes('Cannot launch conpty')) {
                return { message: localize('conptyLaunchFailed', "A native exception occurred during launch (Cannot launch conpty). Winpty has been removed, see {0} for more details. You can also try enabling the `{1}` setting.", 'https://code.visualstudio.com/updates/v1_109#_removal-of-winpty-support', 'terminal.integrated.windowsUseConptyDll') };
            }
            return { message: `A native exception occurred during launch (${errorMessage})` };
        }
    }
    async _validateCwd() {
        try {
            const result = await fs.promises.stat(this._initialCwd);
            if (!result.isDirectory()) {
                return { message: localize('launchFail.cwdNotDirectory', "Starting directory (cwd) \"{0}\" is not a directory", this._initialCwd.toString()) };
            }
        }
        catch (err) {
            if (err?.code === 'ENOENT') {
                return { message: localize('launchFail.cwdDoesNotExist', "Starting directory (cwd) \"{0}\" does not exist", this._initialCwd.toString()) };
            }
        }
        this._onDidChangeProperty.fire({ type: "initialCwd" /* ProcessPropertyType.InitialCwd */, value: this._initialCwd });
        return undefined;
    }
    async _validateExecutable() {
        const slc = this.shellLaunchConfig;
        if (!slc.executable) {
            throw new Error('IShellLaunchConfig.executable not set');
        }
        const cwd = slc.cwd instanceof URI ? slc.cwd.path : slc.cwd;
        const envPaths = (slc.env && slc.env.PATH) ? slc.env.PATH.split(path.delimiter) : undefined;
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
        }
        catch (err) {
            if (err?.code === 'EACCES') {
                // Swallow
            }
            else {
                throw err;
            }
        }
        return undefined;
    }
    async setupPtyProcess(shellLaunchConfig, options, shellIntegrationInjection) {
        const args = shellIntegrationInjection?.newArgs || shellLaunchConfig.args || [];
        await this._throttleKillSpawn();
        const sanitizedOptions = { ...options, env: sanitizeEnvForLogging(options.env) };
        this._logService.trace('node-pty.IPty#spawn', shellLaunchConfig.executable, args, sanitizedOptions);
        const ptyProcess = spawn(shellLaunchConfig.executable, args, options);
        this._ptyProcess = ptyProcess;
        this._childProcessMonitor = this._register(new ChildProcessMonitor(ptyProcess.pid, this._logService));
        this._register(this._childProcessMonitor.onDidChangeHasChildProcesses(value => this._onDidChangeProperty.fire({ type: "hasChildProcesses" /* ProcessPropertyType.HasChildProcesses */, value })));
        this._processStartupComplete = new Promise(c => {
            this._register(this.onProcessReady(() => c()));
        });
        this._register(ptyProcess.onData(data => {
            // Handle flow control
            this._unacknowledgedCharCount += data.length;
            if (!this._isPtyPaused && this._unacknowledgedCharCount > 100000 /* FlowControlConstants.HighWatermarkChars */) {
                this._logService.trace(`Flow control: Pause (${this._unacknowledgedCharCount} > ${100000 /* FlowControlConstants.HighWatermarkChars */})`);
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
        // node-pty >= 1.2.0-beta.11 defers conptyNative.connect() on Windows, so
        // ptyProcess.pid may be 0 immediately after spawn. In that case we wait
        // for the first data event which only fires after the connection completes
        // and the real pid is available. See microsoft/node-pty#885.
        if (ptyProcess.pid > 0) {
            this._sendProcessId(ptyProcess.pid);
        }
        else {
            const dataListener = ptyProcess.onData(() => {
                dataListener.dispose();
                this._childProcessMonitor?.setPid(ptyProcess.pid);
                this._sendProcessId(ptyProcess.pid);
            });
            this._register(dataListener);
        }
        this._setupTitlePolling(ptyProcess);
    }
    _setupTitlePolling(ptyProcess) {
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
    // See https://github.com/microsoft/node-pty/issues/72
    _queueProcessExit() {
        if (this._logService.getLevel() === LogLevel.Trace) {
            this._logService.trace('TerminalProcess#_queueProcessExit', new Error().stack?.replace(/^Error/, ''));
        }
        if (this._closeTimeout) {
            clearTimeout(this._closeTimeout);
        }
        this._closeTimeout = setTimeout(() => {
            this._closeTimeout = undefined;
            this._kill();
        }, 250 /* ShutdownConstants.DataFlushTimeout */);
    }
    async _kill() {
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
        }
        catch (ex) {
            // Swallow, the pty has already been killed
        }
        this._onProcessExit.fire(this._exitCode || 0);
        this.dispose();
    }
    async _throttleKillSpawn() {
        // Only throttle on Windows/conpty
        if (!isWindows || !hasConptyOption(this._ptyOptions) || !this._ptyOptions.useConpty) {
            return;
        }
        // Don't throttle when using conpty.dll as it seems to have been fixed in later versions
        if (this._ptyOptions.useConptyDll) {
            return;
        }
        // Use a loop to ensure multiple calls in a single interval space out
        while (Date.now() - TerminalProcess_1._lastKillOrStart < 250 /* Constants.KillSpawnThrottleInterval */) {
            this._logService.trace('Throttling kill/spawn call');
            await timeout(250 /* Constants.KillSpawnThrottleInterval */ - (Date.now() - TerminalProcess_1._lastKillOrStart) + 50 /* Constants.KillSpawnSpacingDuration */);
        }
        TerminalProcess_1._lastKillOrStart = Date.now();
    }
    _sendProcessId(pid) {
        this._onProcessReady.fire({
            pid,
            cwd: this._initialCwd,
            windowsPty: this.getWindowsPty()
        });
    }
    _sendProcessTitle(ptyProcess) {
        if (this._store.isDisposed) {
            return;
        }
        // HACK: The node-pty API can return undefined somehow https://github.com/microsoft/vscode/issues/222323
        this._currentTitle = (ptyProcess.process ?? '');
        this._onDidChangeProperty.fire({ type: "title" /* ProcessPropertyType.Title */, value: this._currentTitle });
        // If fig is installed it may change the title of the process
        let sanitizedTitle = this.currentTitle.replace(/ \(figterm\)$/g, '');
        // Ensure any prefixed path is removed so that the executable name since we use this to
        // detect the shell type
        if (!isWindows) {
            sanitizedTitle = path.basename(sanitizedTitle);
        }
        if (sanitizedTitle.toLowerCase().startsWith('python')) {
            this._onDidChangeProperty.fire({ type: "shellType" /* ProcessPropertyType.ShellType */, value: "python" /* GeneralShellType.Python */ });
        }
        else if (sanitizedTitle.toLowerCase().startsWith('julia')) {
            this._onDidChangeProperty.fire({ type: "shellType" /* ProcessPropertyType.ShellType */, value: "julia" /* GeneralShellType.Julia */ });
        }
        else {
            const shellTypeValue = posixShellTypeMap.get(sanitizedTitle) || generalShellTypeMap.get(sanitizedTitle);
            this._onDidChangeProperty.fire({ type: "shellType" /* ProcessPropertyType.ShellType */, value: shellTypeValue });
        }
    }
    shutdown(immediate) {
        if (this._logService.getLevel() === LogLevel.Trace) {
            this._logService.trace('TerminalProcess#shutdown', new Error().stack?.replace(/^Error/, ''));
        }
        // don't force immediate disposal of the terminal processes on Windows as an additional
        // mitigation for https://github.com/microsoft/vscode/issues/71966 which causes the pty host
        // to become unresponsive, disconnecting all terminals across all windows.
        if (immediate && !isWindows) {
            this._kill();
        }
        else {
            if (!this._closeTimeout && !this._store.isDisposed) {
                this._queueProcessExit();
                // Allow a maximum amount of time for the process to exit, otherwise force kill it
                setTimeout(() => {
                    if (this._closeTimeout && !this._store.isDisposed) {
                        this._closeTimeout = undefined;
                        this._kill();
                    }
                }, 5000 /* ShutdownConstants.MaximumShutdownTime */);
            }
        }
    }
    input(data, isBinary = false) {
        this._logService.trace('node-pty.IPty#write', data, isBinary);
        if (isBinary) {
            this._ptyProcess.write(Buffer.from(data, 'binary'));
        }
        else {
            this._ptyProcess.write(data);
        }
        this._childProcessMonitor?.handleInput();
    }
    sendSignal(signal) {
        if (this._store.isDisposed || !this._ptyProcess) {
            return;
        }
        this._ptyProcess.kill(signal);
    }
    async processBinary(data) {
        this.input(data, true);
    }
    async refreshProperty(type) {
        switch (type) {
            case "cwd" /* ProcessPropertyType.Cwd */: {
                const newCwd = await this.getCwd();
                if (newCwd !== this._properties.cwd) {
                    this._properties.cwd = newCwd;
                    this._onDidChangeProperty.fire({ type: "cwd" /* ProcessPropertyType.Cwd */, value: this._properties.cwd });
                }
                return newCwd;
            }
            case "initialCwd" /* ProcessPropertyType.InitialCwd */: {
                const initialCwd = await this.getInitialCwd();
                if (initialCwd !== this._properties.initialCwd) {
                    this._properties.initialCwd = initialCwd;
                    this._onDidChangeProperty.fire({ type: "initialCwd" /* ProcessPropertyType.InitialCwd */, value: this._properties.initialCwd });
                }
                return initialCwd;
            }
            case "title" /* ProcessPropertyType.Title */:
                return this.currentTitle;
            default:
                return this.shellType;
        }
    }
    async updateProperty(type, value) {
        if (type === "fixedDimensions" /* ProcessPropertyType.FixedDimensions */) {
            this._properties.fixedDimensions = value;
        }
    }
    resize(cols, rows, pixelWidth, pixelHeight) {
        if (this._store.isDisposed) {
            return;
        }
        if (!isNumber(cols) || !isNumber(rows)) {
            return;
        }
        // Ensure that cols and rows are always >= 1, this prevents a native exception in winpty.
        // TODO: Handle this directly on node-pty instead: https://github.com/microsoft/node-pty/issues/877
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
                const pixelSize = pixelWidth !== undefined && pixelHeight !== undefined
                    ? { width: pixelWidth, height: pixelHeight }
                    : undefined;
                this._ptyProcess.resize(cols, rows, pixelSize);
            }
            catch (e) {
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
    clearBuffer() {
        this._ptyProcess?.clear();
    }
    acknowledgeDataEvent(charCount) {
        // Prevent lower than 0 to heal from errors
        this._unacknowledgedCharCount = Math.max(this._unacknowledgedCharCount - charCount, 0);
        this._logService.trace(`Flow control: Ack ${charCount} chars (unacknowledged: ${this._unacknowledgedCharCount})`);
        if (this._isPtyPaused && this._unacknowledgedCharCount < 5000 /* FlowControlConstants.LowWatermarkChars */) {
            this._logService.trace(`Flow control: Resume (${this._unacknowledgedCharCount} < ${5000 /* FlowControlConstants.LowWatermarkChars */})`);
            this._ptyProcess?.resume();
            this._isPtyPaused = false;
        }
    }
    clearUnacknowledgedChars() {
        this._unacknowledgedCharCount = 0;
        this._logService.trace(`Flow control: Cleared all unacknowledged chars, forcing resume`);
        if (this._isPtyPaused) {
            this._ptyProcess?.resume();
            this._isPtyPaused = false;
        }
    }
    async setUnicodeVersion(version) {
        // No-op
    }
    getInitialCwd() {
        return Promise.resolve(this._initialCwd);
    }
    async getCwd() {
        if (isMacintosh) {
            // From Big Sur (darwin v20) there is a spawn blocking thread issue on Electron,
            // this is fixed in VS Code's internal Electron.
            // https://github.com/Microsoft/vscode/issues/105446
            return new Promise(resolve => {
                if (!this._ptyProcess) {
                    resolve(this._initialCwd);
                    return;
                }
                this._logService.trace('node-pty.IPty#pid');
                exec('lsof -OPln -p ' + this._ptyProcess.pid + ' | grep cwd', { env: { ...process.env, LANG: 'en_US.UTF-8' } }, (error, stdout, stderr) => {
                    if (!error && stdout !== '') {
                        resolve(stdout.substring(stdout.indexOf('/'), stdout.length - 1));
                    }
                    else {
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
            }
            catch (error) {
                return this._initialCwd;
            }
        }
        return this._initialCwd;
    }
    getWindowsPty() {
        return isWindows ? {
            backend: 'conpty',
            buildNumber: getWindowsBuildNumberSync()
        } : undefined;
    }
};
TerminalProcess = TerminalProcess_1 = __decorate([
    __param(7, ILogService),
    __param(8, IProductService)
], TerminalProcess);
export { TerminalProcess };
/**
 * Tracks the latest resize event to be trigger at a later point.
 */
class DelayedResizer extends Disposable {
    get onTrigger() { return this._onTrigger.event; }
    constructor() {
        super();
        this._onTrigger = this._register(new Emitter());
        this._timeout = setTimeout(() => {
            this._onTrigger.fire({ rows: this.rows, cols: this.cols });
        }, 1000);
        this._register(toDisposable(() => clearTimeout(this._timeout)));
    }
}
function hasConptyOption(obj) {
    return 'useConpty' in obj;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxQcm9jZXNzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVybWluYWwvbm9kZS90ZXJtaW5hbFByb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDckMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdFLE9BQU8sS0FBSyxJQUFJLE1BQU0sOEJBQThCLENBQUM7QUFDckQsT0FBTyxFQUF1QixPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDaEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9ELE9BQU8sRUFBRSw0QkFBNEIsRUFBb0MscUJBQXFCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNqSSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM3RCxP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