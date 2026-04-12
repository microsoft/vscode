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
var UtilityProcess_1;
import { MessageChannelMain, app, utilityProcess } from 'electron';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { StringDecoder } from 'string_decoder';
import { timeout } from '../../../base/common/async.js';
import { FileAccess } from '../../../base/common/network.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import Severity from '../../../base/common/severity.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { removeDangerousEnvVariables } from '../../../base/common/processes.js';
import { deepClone } from '../../../base/common/objects.js';
import { isWindows } from '../../../base/common/platform.js';
import { isUNCAccessRestrictionsDisabled, getUNCHostAllowlist } from '../../../base/node/unc.js';
function isWindowUtilityProcessConfiguration(config) {
    const candidate = config;
    return typeof candidate.responseWindowId === 'number';
}
let UtilityProcess = class UtilityProcess extends Disposable {
    static { UtilityProcess_1 = this; }
    static { this.ID_COUNTER = 0; }
    static { this.all = new Map(); }
    static getAll() {
        return Array.from(UtilityProcess_1.all.values());
    }
    constructor(logService, telemetryService, lifecycleMainService) {
        super();
        this.logService = logService;
        this.telemetryService = telemetryService;
        this.lifecycleMainService = lifecycleMainService;
        this.id = String(++UtilityProcess_1.ID_COUNTER);
        this._onStdout = this._register(new Emitter());
        this.onStdout = this._onStdout.event;
        this._onStderr = this._register(new Emitter());
        this.onStderr = this._onStderr.event;
        this._onMessage = this._register(new Emitter());
        this.onMessage = this._onMessage.event;
        this._onSpawn = this._register(new Emitter());
        this.onSpawn = this._onSpawn.event;
        this._onExit = this._register(new Emitter());
        this.onExit = this._onExit.event;
        this._onCrash = this._register(new Emitter());
        this.onCrash = this._onCrash.event;
        this.process = undefined;
        this.processPid = undefined;
        this.configuration = undefined;
    }
    log(msg, severity) {
        let logMsg;
        if (this.configuration?.correlationId) {
            logMsg = `[UtilityProcess id: ${this.configuration?.correlationId}, type: ${this.configuration?.type}, pid: ${this.processPid ?? '<none>'}]: ${msg}`;
        }
        else {
            logMsg = `[UtilityProcess type: ${this.configuration?.type}, pid: ${this.processPid ?? '<none>'}]: ${msg}`;
        }
        switch (severity) {
            case Severity.Error:
                this.logService.error(logMsg);
                break;
            case Severity.Warning:
                this.logService.warn(logMsg);
                break;
            case Severity.Info:
                this.logService.trace(logMsg);
                break;
        }
    }
    validateCanStart() {
        if (this.process) {
            this.log('Cannot start utility process because it is already running...', Severity.Error);
            return false;
        }
        return true;
    }
    start(configuration) {
        const started = this.doStart(configuration);
        if (started && configuration.payload) {
            const posted = this.postMessage(configuration.payload);
            if (posted) {
                this.log('payload sent via postMessage()', Severity.Info);
            }
        }
        return started;
    }
    doStart(configuration) {
        if (!this.validateCanStart()) {
            return false;
        }
        this.configuration = configuration;
        const serviceName = `${this.configuration.type}-${this.id}`;
        const modulePath = FileAccess.asFileUri('bootstrap-fork.js').fsPath;
        const args = this.configuration.args ?? [];
        const execArgv = [...(this.configuration.execArgv ?? [])];
        const allowLoadingUnsignedLibraries = this.configuration.allowLoadingUnsignedLibraries;
        const jsFlags = app.commandLine.getSwitchValue('js-flags');
        if (jsFlags) {
            execArgv.push(`--js-flags=${jsFlags}`);
        }
        const respondToAuthRequestsFromMainProcess = this.configuration.respondToAuthRequestsFromMainProcess;
        const stdio = 'pipe';
        const env = this.createEnv(configuration);
        this.log('creating new...', Severity.Info);
        // Fork utility process
        this.process = utilityProcess.fork(modulePath, args, {
            serviceName,
            env,
            execArgv, // !!! Add `--trace-warnings` for node.js tracing !!!
            allowLoadingUnsignedLibraries,
            respondToAuthRequestsFromMainProcess,
            stdio
        });
        // Register to events
        this.registerListeners(this.process, this.configuration, serviceName);
        return true;
    }
    createEnv(configuration) {
        const env = configuration.env ? { ...configuration.env } : { ...deepClone(process.env) };
        // Apply supported environment variables from config
        env['VSCODE_ESM_ENTRYPOINT'] = configuration.entryPoint;
        if (typeof configuration.parentLifecycleBound === 'number') {
            env['VSCODE_PARENT_PID'] = String(configuration.parentLifecycleBound);
        }
        env['VSCODE_CRASH_REPORTER_PROCESS_TYPE'] = configuration.type;
        if (isWindows) {
            if (isUNCAccessRestrictionsDisabled()) {
                env['NODE_DISABLE_UNC_ACCESS_CHECKS'] = '1';
            }
            else {
                env['NODE_UNC_HOST_ALLOWLIST'] = getUNCHostAllowlist().join('\\');
            }
        }
        // Remove any environment variables that are not allowed
        removeDangerousEnvVariables(env);
        // Ensure all values are strings, otherwise the process will not start
        for (const key of Object.keys(env)) {
            env[key] = String(env[key]);
        }
        return env;
    }
    registerListeners(process, configuration, serviceName) {
        // Stdout
        if (process.stdout) {
            const stdoutDecoder = new StringDecoder('utf-8');
            this._register(Event.fromNodeEventEmitter(process.stdout, 'data')(chunk => this._onStdout.fire(typeof chunk === 'string' ? chunk : stdoutDecoder.write(chunk))));
        }
        // Stderr
        if (process.stderr) {
            const stderrDecoder = new StringDecoder('utf-8');
            this._register(Event.fromNodeEventEmitter(process.stderr, 'data')(chunk => this._onStderr.fire(typeof chunk === 'string' ? chunk : stderrDecoder.write(chunk))));
        }
        // Messages
        this._register(Event.fromNodeEventEmitter(process, 'message')(msg => this._onMessage.fire(msg)));
        // Spawn
        this._register(Event.fromNodeEventEmitter(process, 'spawn')(() => {
            this.processPid = process.pid;
            if (typeof process.pid === 'number') {
                UtilityProcess_1.all.set(process.pid, { pid: process.pid, name: isWindowUtilityProcessConfiguration(configuration) ? `${configuration.name} [${configuration.responseWindowId}]` : configuration.name });
            }
            this.log('successfully created', Severity.Info);
            this._onSpawn.fire(process.pid);
        }));
        // Exit
        this._register(Event.fromNodeEventEmitter(process, 'exit')(code => {
            this.log(`received exit event with code ${code}`, Severity.Info);
            // Event
            this._onExit.fire({ pid: this.processPid, code, signal: 'unknown' });
            // Cleanup
            this.onDidExitOrCrashOrKill();
        }));
        // Child process gone
        this._register(Event.fromNodeEventEmitter(app, 'child-process-gone', (event, details) => ({ event, details }))(({ details }) => {
            if (details.type === 'Utility' && details.name === serviceName) {
                this.log(`crashed with code ${details.exitCode} and reason '${details.reason}'`, Severity.Error);
                this.telemetryService.publicLog2('utilityprocesscrash', {
                    type: configuration.type,
                    reason: details.reason,
                    code: details.exitCode
                });
                // Event
                this._onCrash.fire({ pid: this.processPid, code: details.exitCode, reason: details.reason });
                // Cleanup
                this.onDidExitOrCrashOrKill();
            }
        }));
    }
    once(message, callback) {
        const disposable = this._register(this._onMessage.event(msg => {
            if (msg === message) {
                disposable.dispose();
                callback();
            }
        }));
    }
    postMessage(message, transfer) {
        if (!this.process) {
            return false; // already killed, crashed or never started
        }
        this.process.postMessage(message, transfer);
        return true;
    }
    connect(payload) {
        const { port1: outPort, port2: utilityProcessPort } = new MessageChannelMain();
        this.postMessage(payload, [utilityProcessPort]);
        return outPort;
    }
    enableInspectPort() {
        if (!this.process || typeof this.processPid !== 'number') {
            return false;
        }
        this.log('enabling inspect port', Severity.Info);
        // use (undocumented) _debugProcess feature of node if available
        const processExt = process;
        if (typeof processExt._debugProcess === 'function') {
            processExt._debugProcess(this.processPid);
            return true;
        }
        // not supported...
        return false;
    }
    kill() {
        if (!this.process) {
            return; // already killed, crashed or never started
        }
        this.log('attempting to kill the process...', Severity.Info);
        const killed = this.process.kill();
        if (killed) {
            this.log('successfully killed the process', Severity.Info);
            this.onDidExitOrCrashOrKill();
        }
        else {
            this.log('unable to kill the process', Severity.Warning);
        }
    }
    onDidExitOrCrashOrKill() {
        if (typeof this.processPid === 'number') {
            UtilityProcess_1.all.delete(this.processPid);
        }
        this.process = undefined;
    }
    async waitForExit(maxWaitTimeMs) {
        if (!this.process) {
            return; // already killed, crashed or never started
        }
        this.log('waiting to exit...', Severity.Info);
        await Promise.race([Event.toPromise(this.onExit), timeout(maxWaitTimeMs)]);
        if (this.process) {
            this.log(`did not exit within ${maxWaitTimeMs}ms, will kill it now...`, Severity.Info);
            this.kill();
        }
    }
};
UtilityProcess = UtilityProcess_1 = __decorate([
    __param(0, ILogService),
    __param(1, ITelemetryService),
    __param(2, ILifecycleMainService)
], UtilityProcess);
export { UtilityProcess };
let WindowUtilityProcess = class WindowUtilityProcess extends UtilityProcess {
    constructor(logService, windowsMainService, telemetryService, lifecycleMainService) {
        super(logService, telemetryService, lifecycleMainService);
        this.windowsMainService = windowsMainService;
    }
    start(configuration) {
        const responseWindow = this.windowsMainService.getWindowById(configuration.responseWindowId);
        if (!responseWindow?.win || responseWindow.win.isDestroyed() || responseWindow.win.webContents.isDestroyed()) {
            this.log('Refusing to start utility process because requesting window cannot be found or is destroyed...', Severity.Error);
            return true;
        }
        // Start utility process
        const started = super.doStart(configuration);
        if (!started) {
            return false;
        }
        // Register to window events
        this.registerWindowListeners(responseWindow.win, configuration);
        // Establish & exchange message ports
        const windowPort = this.connect(configuration.payload);
        responseWindow.win.webContents.postMessage(configuration.responseChannel, configuration.responseNonce, [windowPort]);
        return true;
    }
    registerWindowListeners(window, configuration) {
        // If the lifecycle of the utility process is bound to the window,
        // we terminate the process if the window closes or changes.
        // If a grace period is configured, we wait for the process to exit
        // before terminating (e.g. extensions need time to deactivate).
        if (configuration.windowLifecycleBound) {
            const graceTime = configuration.windowLifecycleGraceTime;
            const terminate = graceTime && graceTime > 0
                ? () => this.waitForExit(graceTime)
                : () => this.kill();
            this._register(Event.filter(this.lifecycleMainService.onWillLoadWindow, e => e.window.win === window)(terminate));
            this._register(Event.fromNodeEventEmitter(window, 'closed')(terminate));
        }
    }
};
WindowUtilityProcess = __decorate([
    __param(0, ILogService),
    __param(1, IWindowsMainService),
    __param(2, ITelemetryService),
    __param(3, ILifecycleMainService)
], WindowUtilityProcess);
export { WindowUtilityProcess };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbGl0eVByb2Nlc3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91dGlsaXR5UHJvY2Vzcy9lbGVjdHJvbi1tYWluL3V0aWxpdHlQcm9jZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQTBCLGtCQUFrQixFQUFFLEdBQUcsRUFBRSxjQUFjLEVBQTRDLE1BQU0sVUFBVSxDQUFDO0FBQ3JJLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDL0MsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM3RSxPQUFPLFFBQVEsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdELE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJCQUEyQixD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