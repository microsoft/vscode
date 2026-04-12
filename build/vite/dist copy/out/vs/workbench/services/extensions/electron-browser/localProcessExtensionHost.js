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
import { timeout } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import * as objects from '../../../../base/common/objects.js';
import * as platform from '../../../../base/common/platform.js';
import { removeDangerousEnvVariables } from '../../../../base/common/processes.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { BufferedEmitter } from '../../../../base/parts/ipc/common/ipc.net.js';
import { acquirePort } from '../../../../base/parts/ipc/electron-browser/ipc.mp.js';
import * as nls from '../../../../nls.js';
import { IExtensionHostDebugService } from '../../../../platform/debug/common/extensionHostDebug.js';
import { extensionHostGraceTimeMs, IExtensionHostStarter } from '../../../../platform/extensions/common/extensionHostStarter.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService, ILoggerService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INotificationService, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isLoggingOnly } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, isUntitledWorkspace } from '../../../../platform/workspace/common/workspace.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { IShellEnvironmentService } from '../../environment/electron-browser/shellEnvironmentService.js';
import { MessagePortExtHostConnection, writeExtHostConnection } from '../common/extensionHostEnv.js';
import { createMessageOfType, UIKind, isMessageOfType } from '../common/extensionHostProtocol.js';
import { IHostService } from '../../host/browser/host.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { parseExtensionDevOptions } from '../common/extensionDevOptions.js';
import { IDefaultLogLevelsService } from '../../log/common/defaultLogLevels.js';
export class ExtensionHostProcess {
    get onStdout() {
        return this._extensionHostStarter.onDynamicStdout(this._id);
    }
    get onStderr() {
        return this._extensionHostStarter.onDynamicStderr(this._id);
    }
    get onMessage() {
        return this._extensionHostStarter.onDynamicMessage(this._id);
    }
    get onExit() {
        return this._extensionHostStarter.onDynamicExit(this._id);
    }
    constructor(id, _extensionHostStarter) {
        this._extensionHostStarter = _extensionHostStarter;
        this._id = id;
    }
    start(opts) {
        return this._extensionHostStarter.start(this._id, opts);
    }
    enableInspectPort() {
        return this._extensionHostStarter.enableInspectPort(this._id);
    }
    waitForExit(maxWaitTimeMs) {
        return this._extensionHostStarter.waitForExit(this._id, maxWaitTimeMs);
    }
    kill() {
        return this._extensionHostStarter.kill(this._id);
    }
}
let NativeLocalProcessExtensionHost = class NativeLocalProcessExtensionHost extends Disposable {
    constructor(runningLocation, startup, _initDataProvider, _contextService, _notificationService, _nativeHostService, _lifecycleService, _environmentService, _userDataProfilesService, _telemetryService, _logService, _loggerService, _labelService, _extensionHostDebugService, _hostService, _productService, _shellEnvironmentService, _extensionHostStarter, _defaultLogLevelsService) {
        super();
        this.runningLocation = runningLocation;
        this.startup = startup;
        this._initDataProvider = _initDataProvider;
        this._contextService = _contextService;
        this._notificationService = _notificationService;
        this._nativeHostService = _nativeHostService;
        this._lifecycleService = _lifecycleService;
        this._environmentService = _environmentService;
        this._userDataProfilesService = _userDataProfilesService;
        this._telemetryService = _telemetryService;
        this._logService = _logService;
        this._loggerService = _loggerService;
        this._labelService = _labelService;
        this._extensionHostDebugService = _extensionHostDebugService;
        this._hostService = _hostService;
        this._productService = _productService;
        this._shellEnvironmentService = _shellEnvironmentService;
        this._extensionHostStarter = _extensionHostStarter;
        this._defaultLogLevelsService = _defaultLogLevelsService;
        this.pid = null;
        this.remoteAuthority = null;
        this.extensions = null;
        this._onExit = this._register(new Emitter());
        this.onExit = this._onExit.event;
        this._onDidSetInspectPort = this._register(new Emitter());
        const devOpts = parseExtensionDevOptions(this._environmentService);
        this._isExtensionDevHost = devOpts.isExtensionDevHost;
        this._isExtensionDevDebug = devOpts.isExtensionDevDebug;
        this._isExtensionDevDebugBrk = devOpts.isExtensionDevDebugBrk;
        this._isExtensionDevTestFromCli = devOpts.isExtensionDevTestFromCli;
        this._terminating = false;
        this._mainProcessHandlesExtHostShutdown = false;
        this._inspectListener = null;
        this._extensionHostProcess = null;
        this._messageProtocol = null;
        this._register(this._lifecycleService.onWillShutdown(e => this._onWillShutdown(e)));
        this._register(this._extensionHostDebugService.onClose(event => {
            if (this._isExtensionDevHost && this._environmentService.debugExtensionHost.debugId === event.sessionId) {
                this._nativeHostService.closeWindow();
            }
        }));
        this._register(this._extensionHostDebugService.onReload(event => {
            if (this._isExtensionDevHost && this._environmentService.debugExtensionHost.debugId === event.sessionId) {
                this._hostService.reload();
            }
        }));
    }
    dispose() {
        if (!this._terminating) {
            this._terminating = true;
        }
        super.dispose();
        this._messageProtocol = null;
    }
    async disconnect() {
        this._terminating = true;
        // Send the Terminate message so the extension host can run
        // deactivation handlers and exit gracefully.
        if (this._messageProtocol) {
            try {
                const protocol = await Promise.race([
                    this._messageProtocol.then(protocol => protocol, () => undefined),
                    timeout(1000).then(() => undefined)
                ]);
                protocol?.send(createMessageOfType(2 /* MessageType.Terminate */));
            }
            catch {
                // ignore - extension host may have already exited
            }
        }
        // For the restart case where the main process does not handle the
        // extension host shutdown, signal the main process to start the grace
        // timer (fire-and-forget). After the timeout the extension host will
        // be forcefully killed if it hasn't exited on its own. For all
        // window-lifecycle shutdown reasons (close/quit/reload/load), the
        // main process already handles this via
        // WindowUtilityProcess.registerWindowListeners.
        if (this._extensionHostProcess && !this._mainProcessHandlesExtHostShutdown) {
            this._extensionHostProcess.waitForExit(extensionHostGraceTimeMs).catch(() => { });
        }
        this._messageProtocol = null;
    }
    start() {
        if (this._terminating) {
            // .terminate() was called
            throw new CancellationError();
        }
        if (!this._messageProtocol) {
            this._messageProtocol = this._start();
        }
        return this._messageProtocol;
    }
    async _start() {
        const [extensionHostCreationResult, portNumber, processEnv] = await Promise.all([
            this._extensionHostStarter.createExtensionHost(),
            this._tryFindDebugPort(),
            this._shellEnvironmentService.getShellEnv(),
        ]);
        this._extensionHostProcess = new ExtensionHostProcess(extensionHostCreationResult.id, this._extensionHostStarter);
        const env = objects.mixin(processEnv, {
            VSCODE_ESM_ENTRYPOINT: 'vs/workbench/api/node/extensionHostProcess',
            VSCODE_HANDLES_UNCAUGHT_ERRORS: true
        });
        if (this._environmentService.debugExtensionHost.env) {
            objects.mixin(env, this._environmentService.debugExtensionHost.env);
        }
        removeDangerousEnvVariables(env);
        if (this._isExtensionDevHost) {
            // Unset `VSCODE_CODE_CACHE_PATH` when developing extensions because it might
            // be that dependencies, that otherwise would be cached, get modified.
            delete env['VSCODE_CODE_CACHE_PATH'];
        }
        const opts = {
            responseWindowId: this._nativeHostService.windowId,
            responseChannel: 'vscode:startExtensionHostMessagePortResult',
            responseNonce: generateUuid(),
            env,
            // We only detach the extension host on windows. Linux and Mac orphan by default
            // and detach under Linux and Mac create another process group.
            // We detach because we have noticed that when the renderer exits, its child processes
            // (i.e. extension host) are taken down in a brutal fashion by the OS
            detached: !!platform.isWindows,
            execArgv: undefined,
            silent: true
        };
        const inspectHost = '127.0.0.1';
        if (portNumber !== 0) {
            opts.execArgv = [
                '--nolazy',
                (this._isExtensionDevDebugBrk ? '--inspect-brk=' : '--inspect=') + `${inspectHost}:${portNumber}`
            ];
        }
        else {
            opts.execArgv = ['--inspect-port=0'];
        }
        if (this._environmentService.extensionTestsLocationURI) {
            opts.execArgv.unshift('--expose-gc');
        }
        if (this._environmentService.args['prof-v8-extensions']) {
            opts.execArgv.unshift('--prof');
        }
        // Refs https://github.com/microsoft/vscode/issues/189805
        //
        // Enable experimental network inspection
        // inspector agent is always setup hence add this flag
        // unconditionally.
        opts.execArgv.unshift('--dns-result-order=ipv4first', '--experimental-network-inspection');
        const onStdout = this._register(this._handleProcessOutputStream(this._extensionHostProcess.onStdout));
        const onStderr = this._register(this._handleProcessOutputStream(this._extensionHostProcess.onStderr));
        const onOutput = Event.any(Event.map(onStdout.event, o => ({ data: `%c${o}`, format: [''] })), Event.map(onStderr.event, o => ({ data: `%c${o}`, format: ['color: red'] })));
        // Debounce all output, so we can render it in the Chrome console as a group
        const onDebouncedOutput = Event.debounce(onOutput, (r, o) => {
            return r
                ? { data: r.data + o.data, format: [...r.format, ...o.format] }
                : { data: o.data, format: o.format };
        }, 100);
        // Print out extension host output
        this._register(onDebouncedOutput(output => {
            const inspectorUrlMatch = output.data && output.data.match(/ws:\/\/([^\s]+):(\d+)\/([^\s]+)/);
            if (inspectorUrlMatch) {
                const [, host, port, auth] = inspectorUrlMatch;
                const devtoolsUrl = `devtools://devtools/bundled/js_app.html?v8only=true&ws=${host}:${port}/${auth}`;
                if (!this._environmentService.isBuilt && !this._isExtensionDevTestFromCli) {
                    console.debug(`%c[Extension Host] %cdebugger inspector at ${devtoolsUrl}`, 'color: blue', 'color:');
                }
                if (!this._inspectListener || !this._inspectListener.devtoolsUrl) {
                    this._inspectListener = { host, port: Number(port), devtoolsUrl };
                    this._onDidSetInspectPort.fire();
                }
            }
            else {
                if (!this._isExtensionDevTestFromCli) {
                    console.group('Extension Host');
                    console.log(output.data, ...output.format);
                    console.groupEnd();
                }
            }
        }));
        // Lifecycle
        this._register(this._extensionHostProcess.onExit(({ code, signal }) => this._onExtHostProcessExit(code, signal)));
        // Notify debugger that we are ready to attach to the process if we run a development extension
        if (portNumber) {
            if (this._isExtensionDevHost && this._isExtensionDevDebug && this._environmentService.debugExtensionHost.debugId) {
                this._extensionHostDebugService.attachSession(this._environmentService.debugExtensionHost.debugId, portNumber);
            }
            this._inspectListener = { port: portNumber, host: inspectHost };
            this._onDidSetInspectPort.fire();
        }
        // Help in case we fail to start it
        let startupTimeoutHandle;
        if (!this._environmentService.isBuilt && !this._environmentService.remoteAuthority || this._isExtensionDevHost) {
            startupTimeoutHandle = setTimeout(() => {
                this._logService.error(`[LocalProcessExtensionHost]: Extension host did not start in 10 seconds (debugBrk: ${this._isExtensionDevDebugBrk})`);
                const msg = this._isExtensionDevDebugBrk
                    ? nls.localize('extensionHost.startupFailDebug', "Extension host did not start in 10 seconds, it might be stopped on the first line and needs a debugger to continue.")
                    : nls.localize('extensionHost.startupFail', "Extension host did not start in 10 seconds, that might be a problem.");
                this._notificationService.prompt(Severity.Warning, msg, [{
                        label: nls.localize('reloadWindow', "Reload Window"),
                        run: () => this._hostService.reload()
                    }], {
                    sticky: true,
                    priority: NotificationPriority.URGENT
                });
            }, 10000);
        }
        // Initialize extension host process with hand shakes
        const protocol = await this._establishProtocol(this._extensionHostProcess, opts);
        await this._performHandshake(protocol);
        clearTimeout(startupTimeoutHandle);
        return protocol;
    }
    /**
     * Find a free port if extension host debugging is enabled.
     */
    async _tryFindDebugPort() {
        if (typeof this._environmentService.debugExtensionHost.port !== 'number') {
            return 0;
        }
        const expected = this._environmentService.debugExtensionHost.port;
        const port = await this._nativeHostService.findFreePort(expected, 10 /* try 10 ports */, 5000 /* try up to 5 seconds */, 2048 /* skip 2048 ports between attempts */);
        if (!this._isExtensionDevTestFromCli) {
            if (!port) {
                console.warn('%c[Extension Host] %cCould not find a free port for debugging', 'color: blue', 'color:');
            }
            else {
                if (port !== expected) {
                    console.warn(`%c[Extension Host] %cProvided debugging port ${expected} is not free, using ${port} instead.`, 'color: blue', 'color:');
                }
                if (this._isExtensionDevDebugBrk) {
                    console.warn(`%c[Extension Host] %cSTOPPED on first line for debugging on port ${port}`, 'color: blue', 'color:');
                }
                else {
                    console.debug(`%c[Extension Host] %cdebugger listening on port ${port}`, 'color: blue', 'color:');
                }
            }
        }
        return port || 0;
    }
    _establishProtocol(extensionHostProcess, opts) {
        writeExtHostConnection(new MessagePortExtHostConnection(), opts.env);
        // Get ready to acquire the message port from the shared process worker
        const portPromise = acquirePort(undefined /* we trigger the request via service call! */, opts.responseChannel, opts.responseNonce);
        return new Promise((resolve, reject) => {
            const handle = setTimeout(() => {
                reject('The local extension host took longer than 60s to connect.');
            }, 60 * 1000);
            portPromise.then((port) => {
                this._register(toDisposable(() => {
                    // Close the message port when the extension host is disposed
                    port.close();
                    port.onmessage = null;
                }));
                clearTimeout(handle);
                const onMessage = new BufferedEmitter();
                port.onmessage = ((e) => {
                    if (e.data) {
                        onMessage.fire(VSBuffer.wrap(e.data));
                    }
                });
                port.start();
                resolve({
                    onMessage: onMessage.event,
                    send: message => port.postMessage(message.buffer),
                });
            });
            // Now that the message port listener is installed, start the ext host process
            const sw = StopWatch.create(false);
            extensionHostProcess.start(opts).then(({ pid }) => {
                if (pid) {
                    this.pid = pid;
                }
                this._logService.info(`Started local extension host with pid ${pid}.`);
                const duration = sw.elapsed();
                if (platform.isCI) {
                    this._logService.info(`IExtensionHostStarter.start() took ${duration} ms.`);
                }
            }, (err) => {
                // Starting the ext host process resulted in an error
                reject(err);
            });
        });
    }
    _performHandshake(protocol) {
        // 1) wait for the incoming `ready` event and send the initialization data.
        // 2) wait for the incoming `initialized` event.
        return new Promise((resolve, reject) => {
            let timeoutHandle;
            const installTimeoutCheck = () => {
                timeoutHandle = setTimeout(() => {
                    reject('The local extension host took longer than 60s to send its ready message.');
                }, 60 * 1000);
            };
            const uninstallTimeoutCheck = () => {
                clearTimeout(timeoutHandle);
            };
            // Wait 60s for the ready message
            installTimeoutCheck();
            const disposable = protocol.onMessage(msg => {
                if (isMessageOfType(msg, 1 /* MessageType.Ready */)) {
                    // 1) Extension Host is ready to receive messages, initialize it
                    uninstallTimeoutCheck();
                    this._createExtHostInitData().then(data => {
                        // Wait 60s for the initialized message
                        installTimeoutCheck();
                        protocol.send(VSBuffer.fromString(JSON.stringify(data)));
                    });
                    return;
                }
                if (isMessageOfType(msg, 0 /* MessageType.Initialized */)) {
                    // 2) Extension Host is initialized
                    uninstallTimeoutCheck();
                    // stop listening for messages here
                    disposable.dispose();
                    // release this promise
                    resolve();
                    return;
                }
                console.error(`received unexpected message during handshake phase from the extension host: `, msg);
            });
        });
    }
    async _createExtHostInitData() {
        const initData = await this._initDataProvider.getInitData();
        this.extensions = initData.extensions;
        const workspace = this._contextService.getWorkspace();
        return {
            commit: this._productService.commit,
            version: this._productService.version,
            quality: this._productService.quality,
            date: this._productService.date,
            parentPid: 0,
            environment: {
                isExtensionDevelopmentDebug: this._isExtensionDevDebug,
                appRoot: this._environmentService.appRoot ? URI.file(this._environmentService.appRoot) : undefined,
                appName: this._productService.nameLong,
                appHost: this._productService.telemetryAppName || this._productService.embedderIdentifier || 'desktop',
                appUriScheme: this._productService.urlProtocol,
                isExtensionTelemetryLoggingOnly: isLoggingOnly(this._productService, this._environmentService),
                isPortable: this._environmentService.isPortable,
                appLanguage: platform.language,
                extensionDevelopmentLocationURI: this._environmentService.extensionDevelopmentLocationURI,
                extensionTestsLocationURI: this._environmentService.extensionTestsLocationURI,
                globalStorageHome: this._userDataProfilesService.defaultProfile.globalStorageHome,
                workspaceStorageHome: this._environmentService.workspaceStorageHome,
                extensionLogLevel: this._defaultLogLevelsService.defaultLogLevels.extensions,
                isSessionsWindow: this._environmentService.isSessionsWindow
            },
            workspace: this._contextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */ ? undefined : {
                configuration: workspace.configuration ?? undefined,
                id: workspace.id,
                name: this._labelService.getWorkspaceLabel(workspace),
                isUntitled: workspace.configuration ? isUntitledWorkspace(workspace.configuration, this._environmentService) : false,
                transient: workspace.transient
            },
            remote: {
                authority: this._environmentService.remoteAuthority,
                connectionData: null,
                isRemote: false
            },
            consoleForward: {
                includeStack: !this._isExtensionDevTestFromCli && (this._isExtensionDevHost || !this._environmentService.isBuilt || this._productService.quality !== 'stable' || this._environmentService.verbose),
                logNative: !this._isExtensionDevTestFromCli && this._isExtensionDevHost
            },
            extensions: this.extensions.toSnapshot(),
            telemetryInfo: {
                sessionId: this._telemetryService.sessionId,
                machineId: this._telemetryService.machineId,
                sqmId: this._telemetryService.sqmId,
                devDeviceId: this._telemetryService.devDeviceId ?? this._telemetryService.machineId,
                firstSessionDate: this._telemetryService.firstSessionDate,
                msftInternal: this._telemetryService.msftInternal
            },
            remoteExtensionTips: this._productService.remoteExtensionTips,
            virtualWorkspaceExtensionTips: this._productService.virtualWorkspaceExtensionTips,
            logLevel: this._logService.getLevel(),
            loggers: [...this._loggerService.getRegisteredLoggers()],
            logsLocation: this._environmentService.extHostLogsPath,
            autoStart: (this.startup === 1 /* ExtensionHostStartup.EagerAutoStart */),
            uiKind: UIKind.Desktop,
            handle: this._environmentService.window.handle ? encodeBase64(this._environmentService.window.handle) : undefined
        };
    }
    _onExtHostProcessExit(code, signal) {
        if (this._terminating) {
            // Expected termination path (we asked the process to terminate)
            return;
        }
        this._onExit.fire([code, signal]);
    }
    _handleProcessOutputStream(stream) {
        let last = '';
        let isOmitting = false;
        const event = new Emitter();
        stream((chunk) => {
            // not a fancy approach, but this is the same approach used by the split2
            // module which is well-optimized (https://github.com/mcollina/split2)
            last += chunk;
            const lines = last.split(/\r?\n/g);
            last = lines.pop();
            // protected against an extension spamming and leaking memory if no new line is written.
            if (last.length > 10_000) {
                lines.push(last);
                last = '';
            }
            for (const line of lines) {
                if (isOmitting) {
                    if (line === "END_NATIVE_LOG" /* NativeLogMarkers.End */) {
                        isOmitting = false;
                    }
                }
                else if (line === "START_NATIVE_LOG" /* NativeLogMarkers.Start */) {
                    isOmitting = true;
                }
                else if (line.length) {
                    event.fire(line + '\n');
                }
            }
        }, undefined, this._store);
        return event;
    }
    async enableInspectPort() {
        if (!!this._inspectListener) {
            return true;
        }
        if (!this._extensionHostProcess) {
            return false;
        }
        const result = await this._extensionHostProcess.enableInspectPort();
        if (!result) {
            return false;
        }
        await Promise.race([Event.toPromise(this._onDidSetInspectPort.event), timeout(1000)]);
        return !!this._inspectListener;
    }
    getInspectPort() {
        return this._inspectListener ?? undefined;
    }
    _onWillShutdown(event) {
        this._mainProcessHandlesExtHostShutdown = true;
        // If the extension development host was started without debugger attached we need
        // to communicate this back to the main side to terminate the debug session
        if (this._isExtensionDevHost && !this._isExtensionDevTestFromCli && !this._isExtensionDevDebug && this._environmentService.debugExtensionHost.debugId) {
            this._extensionHostDebugService.terminateSession(this._environmentService.debugExtensionHost.debugId);
            event.join(timeout(100 /* wait a bit for IPC to get delivered */), { id: 'join.extensionDevelopment', label: nls.localize('join.extensionDevelopment', "Terminating extension debug session") });
        }
    }
};
NativeLocalProcessExtensionHost = __decorate([
    __param(3, IWorkspaceContextService),
    __param(4, INotificationService),
    __param(5, INativeHostService),
    __param(6, ILifecycleService),
    __param(7, INativeWorkbenchEnvironmentService),
    __param(8, IUserDataProfilesService),
    __param(9, ITelemetryService),
    __param(10, ILogService),
    __param(11, ILoggerService),
    __param(12, ILabelService),
    __param(13, IExtensionHostDebugService),
    __param(14, IHostService),
    __param(15, IProductService),
    __param(16, IShellEnvironmentService),
    __param(17, IExtensionHostStarter),
    __param(18, IDefaultLogLevelsService)
], NativeLocalProcessExtensionHost);
export { NativeLocalProcessExtensionHost };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2VsZWN0cm9uLWJyb3dzZXIvbG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEYsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEtBQUssUUFBUSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDcEYsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx5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