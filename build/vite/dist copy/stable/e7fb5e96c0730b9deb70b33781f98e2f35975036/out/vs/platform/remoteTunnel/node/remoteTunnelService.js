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
import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREVENT_SLEEP, LOGGER_NAME, LOG_ID, TunnelStates, INACTIVE_TUNNEL_MODE } from '../common/remoteTunnel.js';
import { Emitter } from '../../../base/common/event.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILoggerService, LogLevelToString } from '../../log/common/log.js';
import { dirname, join } from '../../../base/common/path.js';
import { spawn } from 'child_process';
import { IProductService } from '../../product/common/productService.js';
import { isMacintosh, isWindows } from '../../../base/common/platform.js';
import { createCancelablePromise, Delayer } from '../../../base/common/async.js';
import { ISharedProcessLifecycleService } from '../../lifecycle/node/sharedProcessLifecycleService.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { localize } from '../../../nls.js';
import { hostname, homedir } from 'os';
import { IStorageService } from '../../storage/common/storage.js';
import { isString } from '../../../base/common/types.js';
import { StreamSplitter } from '../../../base/node/nodeStreams.js';
import { joinPath } from '../../../base/common/resources.js';
const restartTunnelOnConfigurationChanges = [
    CONFIGURATION_KEY_HOST_NAME,
    CONFIGURATION_KEY_PREVENT_SLEEP,
];
// This is the session used run the tunnel access.
// if set, the remote tunnel access is currently enabled.
// if not set, the remote tunnel access is currently disabled.
const TUNNEL_ACCESS_SESSION = 'remoteTunnelSession';
// Boolean indicating whether the tunnel should be installed as a service.
const TUNNEL_ACCESS_IS_SERVICE = 'remoteTunnelIsService';
/**
 * This service runs on the shared service. It is running the `code-tunnel` command
 * to make the current machine available for remote access.
 */
let RemoteTunnelService = class RemoteTunnelService extends Disposable {
    constructor(telemetryService, productService, environmentService, loggerService, sharedProcessLifecycleService, configurationService, storageService) {
        super();
        this.telemetryService = telemetryService;
        this.productService = productService;
        this.environmentService = environmentService;
        this.configurationService = configurationService;
        this.storageService = storageService;
        this._onDidTokenFailedEmitter = this._register(new Emitter());
        this.onDidTokenFailed = this._onDidTokenFailedEmitter.event;
        this._onDidChangeTunnelStatusEmitter = this._register(new Emitter());
        this.onDidChangeTunnelStatus = this._onDidChangeTunnelStatusEmitter.event;
        this._onDidChangeModeEmitter = this._register(new Emitter());
        this.onDidChangeMode = this._onDidChangeModeEmitter.event;
        /**
         * "Mode" in the terminal state we want to get to -- started, stopped, and
         * the attributes associated with each.
         *
         * At any given time, work may be ongoing to get `_tunnelStatus` into a
         * state that reflects the desired `mode`.
         */
        this._mode = INACTIVE_TUNNEL_MODE;
        this._initialized = false;
        this.defaultOnOutput = (a, isErr) => {
            if (isErr) {
                this._logger.error(a);
            }
            else {
                this._logger.info(a);
            }
        };
        this._logger = this._register(loggerService.createLogger(joinPath(environmentService.logsHome, `${LOG_ID}.log`), { id: LOG_ID, name: LOGGER_NAME }));
        this._startTunnelProcessDelayer = this._register(new Delayer(100));
        this._register(this._logger.onDidChangeLogLevel(l => this._logger.info('Log level changed to ' + LogLevelToString(l))));
        this._register(sharedProcessLifecycleService.onWillShutdown(() => {
            this._tunnelProcess?.cancel();
            this._tunnelProcess = undefined;
            this.dispose();
        }));
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (restartTunnelOnConfigurationChanges.some(c => e.affectsConfiguration(c))) {
                this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
            }
        }));
        this._mode = this._restoreMode();
        this._tunnelStatus = TunnelStates.uninitialized;
    }
    async getTunnelStatus() {
        return this._tunnelStatus;
    }
    setTunnelStatus(tunnelStatus) {
        this._tunnelStatus = tunnelStatus;
        this._onDidChangeTunnelStatusEmitter.fire(tunnelStatus);
    }
    setMode(mode) {
        if (isSameMode(this._mode, mode)) {
            return;
        }
        this._mode = mode;
        this._storeMode(mode);
        this._onDidChangeModeEmitter.fire(this._mode);
        if (mode.active) {
            this._logger.info(`Session updated: ${mode.session.accountLabel} (${mode.session.providerId}) (service=${mode.asService})`);
            if (mode.session.token) {
                this._logger.info(`Session token updated: ${mode.session.accountLabel} (${mode.session.providerId})`);
            }
        }
        else {
            this._logger.info(`Session reset`);
        }
    }
    getMode() {
        return Promise.resolve(this._mode);
    }
    async initialize(mode) {
        if (this._initialized) {
            return this._tunnelStatus;
        }
        this._initialized = true;
        this.setMode(mode);
        try {
            await this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
        }
        catch (e) {
            this._logger.error(e);
        }
        return this._tunnelStatus;
    }
    getTunnelCommandLocation() {
        if (!this._tunnelCommand) {
            let binParentLocation;
            if (isMacintosh) {
                // appRoot = /Applications/Visual Studio Code - Insiders.app/Contents/Resources/app
                // bin = /Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin
                binParentLocation = this.environmentService.appRoot;
            }
            else if (isWindows) {
                if (this.productService.win32VersionedUpdate) {
                    // appRoot = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\<version>\resources\app
                    // bin = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\bin
                    binParentLocation = dirname(dirname(dirname(this.environmentService.appRoot)));
                }
                else {
                    // appRoot = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\resources\app
                    // bin = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\bin
                    binParentLocation = dirname(dirname(this.environmentService.appRoot));
                }
            }
            else {
                // appRoot = /usr/share/code-insiders/resources/app
                // bin = /usr/share/code-insiders/bin
                binParentLocation = dirname(dirname(this.environmentService.appRoot));
            }
            this._tunnelCommand = join(binParentLocation, 'bin', `${this.productService.tunnelApplicationName}${isWindows ? '.exe' : ''}`);
        }
        return this._tunnelCommand;
    }
    async startTunnel(mode) {
        if (isSameMode(this._mode, mode) && this._tunnelStatus.type !== 'disconnected') {
            return this._tunnelStatus;
        }
        this.setMode(mode);
        try {
            await this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
        }
        catch (e) {
            this._logger.error(e);
        }
        return this._tunnelStatus;
    }
    async stopTunnel() {
        if (this._tunnelProcess) {
            this._tunnelProcess.cancel();
            this._tunnelProcess = undefined;
        }
        if (this._mode.active) {
            // Be careful to only uninstall the service if we're the ones who installed it:
            const needsServiceUninstall = this._mode.asService;
            this.setMode(INACTIVE_TUNNEL_MODE);
            try {
                if (needsServiceUninstall) {
                    this.runCodeTunnelCommand('uninstallService', ['service', 'uninstall']);
                }
            }
            catch (e) {
                this._logger.error(e);
            }
        }
        try {
            await this.runCodeTunnelCommand('stop', ['kill']);
        }
        catch (e) {
            this._logger.error(e);
        }
        this.setTunnelStatus(TunnelStates.disconnected());
    }
    async updateTunnelProcess() {
        const tunnelName = this._getTunnelName();
        this.telemetryService.publicLog2('remoteTunnel.enablement', {
            enabled: this._mode.active,
            service: this._mode.active && this._mode.asService,
            tunnelName,
        });
        if (this._tunnelProcess) {
            this._tunnelProcess.cancel();
            this._tunnelProcess = undefined;
        }
        let output = '';
        let isServiceInstalled = false;
        const onOutput = (a, isErr) => {
            if (isErr) {
                this._logger.error(a);
            }
            else {
                output += a;
            }
            if (!this.environmentService.isBuilt && a.startsWith('   Compiling')) {
                this.setTunnelStatus(TunnelStates.connecting(localize('remoteTunnelService.building', 'Building CLI from sources')));
            }
        };
        const statusProcess = this.runCodeTunnelCommand('status', ['status'], onOutput);
        this._tunnelProcess = statusProcess;
        try {
            await statusProcess;
            if (this._tunnelProcess !== statusProcess) {
                return;
            }
            // split and find the line, since in dev builds additional noise is
            // added by cargo to the output.
            let status;
            try {
                status = JSON.parse(output.trim().split('\n').find(l => l.startsWith('{')));
            }
            catch (e) {
                this._logger.error(`Could not parse status output: ${JSON.stringify(output.trim())}`);
                this.setTunnelStatus(TunnelStates.disconnected());
                return;
            }
            isServiceInstalled = status.service_installed;
            this._logger.info(status.tunnel ? 'Other tunnel running, attaching...' : 'No other tunnel running');
            // If a tunnel is running but the mode isn't "active", we'll still attach
            // to the tunnel to show its state in the UI. If neither are true, disconnect
            if (!status.tunnel && !this._mode.active) {
                this.setTunnelStatus(TunnelStates.disconnected());
                return;
            }
        }
        catch (e) {
            this._logger.error(e);
            this.setTunnelStatus(TunnelStates.disconnected());
            return;
        }
        finally {
            if (this._tunnelProcess === statusProcess) {
                this._tunnelProcess = undefined;
            }
        }
        const session = this._mode.active ? this._mode.session : undefined;
        if (session && session.token) {
            const token = session.token;
            this.setTunnelStatus(TunnelStates.connecting(localize({ key: 'remoteTunnelService.authorizing', comment: ['{0} is a user account name, {1} a provider name (e.g. Github)'] }, 'Connecting as {0} ({1})', session.accountLabel, session.providerId)));
            const onLoginOutput = (a, isErr) => {
                a = a.replaceAll(token, '*'.repeat(4));
                onOutput(a, isErr);
            };
            const loginProcess = this.runCodeTunnelCommand('login', ['user', 'login', '--provider', session.providerId, '--log', LogLevelToString(this._logger.getLevel())], onLoginOutput, { VSCODE_CLI_ACCESS_TOKEN: token });
            this._tunnelProcess = loginProcess;
            try {
                await loginProcess;
                if (this._tunnelProcess !== loginProcess) {
                    return;
                }
            }
            catch (e) {
                this._logger.error(e);
                this._tunnelProcess = undefined;
                this._onDidTokenFailedEmitter.fire(session);
                this.setTunnelStatus(TunnelStates.disconnected(session));
                return;
            }
        }
        const hostName = this._getTunnelName();
        if (hostName) {
            this.setTunnelStatus(TunnelStates.connecting(localize({ key: 'remoteTunnelService.openTunnelWithName', comment: ['{0} is a tunnel name'] }, 'Opening tunnel {0}', hostName)));
        }
        else {
            this.setTunnelStatus(TunnelStates.connecting(localize('remoteTunnelService.openTunnel', 'Opening tunnel')));
        }
        const args = ['--accept-server-license-terms', '--log', LogLevelToString(this._logger.getLevel())];
        if (hostName) {
            args.push('--name', hostName);
        }
        else {
            args.push('--random-name');
        }
        let serviceInstallFailed = false;
        if (this._mode.active && this._mode.asService && !isServiceInstalled) {
            // I thought about calling `code tunnel kill` here, but having multiple
            // tunnel processes running is pretty much idempotent. If there's
            // another tunnel process running, the service process will
            // take over when it exits, no hard feelings.
            serviceInstallFailed = await this.installTunnelService(args) === false;
        }
        return this.serverOrAttachTunnel(session, args, serviceInstallFailed);
    }
    async installTunnelService(args) {
        let status;
        try {
            status = await this.runCodeTunnelCommand('serviceInstall', ['service', 'install', ...args]);
        }
        catch (e) {
            this._logger.error(e);
            status = 1;
        }
        if (status !== 0) {
            const msg = localize('remoteTunnelService.serviceInstallFailed', 'Failed to install tunnel as a service, starting in session...');
            this._logger.warn(msg);
            this.setTunnelStatus(TunnelStates.connecting(msg));
            return false;
        }
        return true;
    }
    async serverOrAttachTunnel(session, args, serviceInstallFailed) {
        args.push('--parent-process-id', String(process.pid));
        if (this._preventSleep()) {
            args.push('--no-sleep');
        }
        let isAttached = false;
        const serveCommand = this.runCodeTunnelCommand('tunnel', args, (message, isErr) => {
            if (isErr) {
                this._logger.error(message);
            }
            else {
                this._logger.info(message);
            }
            if (message.includes('Connected to an existing tunnel process')) {
                isAttached = true;
            }
            const m = message.match(/Open this link in your browser (https:\/\/([^\/\s]+)\/([^\/\s]+)\/([^\/\s]+))/);
            if (m) {
                const info = { link: m[1], domain: m[2], tunnelName: m[4], isAttached };
                this.telemetryService.publicLog2('remoteTunnel.connected', {
                    tunnelName: info.tunnelName,
                    isAttached: info.isAttached,
                });
                this.setTunnelStatus(TunnelStates.connected(info, serviceInstallFailed));
            }
            else if (message.match(/error refreshing token/)) {
                serveCommand.cancel();
                this._onDidTokenFailedEmitter.fire(session);
                this.setTunnelStatus(TunnelStates.disconnected(session));
            }
        });
        this._tunnelProcess = serveCommand;
        serveCommand.finally(() => {
            if (serveCommand === this._tunnelProcess) {
                // process exited unexpectedly
                this._logger.info(`tunnel process terminated`);
                this._tunnelProcess = undefined;
                this._mode = INACTIVE_TUNNEL_MODE;
                this.setTunnelStatus(TunnelStates.disconnected());
            }
        });
    }
    runCodeTunnelCommand(logLabel, commandArgs, onOutput = this.defaultOnOutput, env) {
        return createCancelablePromise(token => {
            return new Promise((resolve, reject) => {
                if (token.isCancellationRequested) {
                    resolve(-1);
                }
                let tunnelProcess;
                const stdio = ['ignore', 'pipe', 'pipe'];
                token.onCancellationRequested(() => {
                    if (tunnelProcess) {
                        this._logger.info(`${logLabel} terminating(${tunnelProcess.pid})`);
                        tunnelProcess.kill();
                    }
                });
                if (!this.environmentService.isBuilt) {
                    onOutput('Building tunnel CLI from sources and run\n', false);
                    onOutput(`${logLabel} Spawning: cargo run -- tunnel ${commandArgs.join(' ')}\n`, false);
                    tunnelProcess = spawn('cargo', ['run', '--', 'tunnel', ...commandArgs], { cwd: join(this.environmentService.appRoot, 'cli'), stdio, env: { ...process.env, RUST_BACKTRACE: '1', ...env } });
                }
                else {
                    onOutput('Running tunnel CLI\n', false);
                    const tunnelCommand = this.getTunnelCommandLocation();
                    onOutput(`${logLabel} Spawning: ${tunnelCommand} tunnel ${commandArgs.join(' ')}\n`, false);
                    tunnelProcess = spawn(tunnelCommand, ['tunnel', ...commandArgs], { cwd: homedir(), stdio, env: { ...process.env, ...env } });
                }
                tunnelProcess.stdout.pipe(new StreamSplitter('\n')).on('data', data => {
                    if (tunnelProcess) {
                        const message = data.toString();
                        onOutput(message, false);
                    }
                });
                tunnelProcess.stderr.pipe(new StreamSplitter('\n')).on('data', data => {
                    if (tunnelProcess) {
                        const message = data.toString();
                        onOutput(message, true);
                    }
                });
                tunnelProcess.on('exit', e => {
                    if (tunnelProcess) {
                        onOutput(`${logLabel} exit(${tunnelProcess.pid}): + ${e} `, false);
                        tunnelProcess = undefined;
                        resolve(e || 0);
                    }
                });
                tunnelProcess.on('error', e => {
                    if (tunnelProcess) {
                        onOutput(`${logLabel} error(${tunnelProcess.pid}): + ${e} `, true);
                        tunnelProcess = undefined;
                        reject();
                    }
                });
            });
        });
    }
    async getTunnelName() {
        return this._getTunnelName();
    }
    _preventSleep() {
        return !!this.configurationService.getValue(CONFIGURATION_KEY_PREVENT_SLEEP);
    }
    _getTunnelName() {
        let name = this.configurationService.getValue(CONFIGURATION_KEY_HOST_NAME) || hostname();
        name = name.replace(/^-+/g, '').replace(/[^\w-]/g, '').substring(0, 20);
        return name || undefined;
    }
    _restoreMode() {
        try {
            const tunnelAccessSession = this.storageService.get(TUNNEL_ACCESS_SESSION, -1 /* StorageScope.APPLICATION */);
            const asService = this.storageService.getBoolean(TUNNEL_ACCESS_IS_SERVICE, -1 /* StorageScope.APPLICATION */, false);
            if (tunnelAccessSession) {
                const session = JSON.parse(tunnelAccessSession);
                if (session && isString(session.accountLabel) && isString(session.sessionId) && isString(session.providerId)) {
                    return { active: true, session, asService };
                }
                this._logger.error('Problems restoring session from storage, invalid format', session);
            }
        }
        catch (e) {
            this._logger.error('Problems restoring session from storage', e);
        }
        return INACTIVE_TUNNEL_MODE;
    }
    _storeMode(mode) {
        if (mode.active) {
            const sessionWithoutToken = {
                providerId: mode.session.providerId, sessionId: mode.session.sessionId, accountLabel: mode.session.accountLabel
            };
            this.storageService.store(TUNNEL_ACCESS_SESSION, JSON.stringify(sessionWithoutToken), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            this.storageService.store(TUNNEL_ACCESS_IS_SERVICE, mode.asService, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(TUNNEL_ACCESS_SESSION, -1 /* StorageScope.APPLICATION */);
            this.storageService.remove(TUNNEL_ACCESS_IS_SERVICE, -1 /* StorageScope.APPLICATION */);
        }
    }
};
RemoteTunnelService = __decorate([
    __param(0, ITelemetryService),
    __param(1, IProductService),
    __param(2, INativeEnvironmentService),
    __param(3, ILoggerService),
    __param(4, ISharedProcessLifecycleService),
    __param(5, IConfigurationService),
    __param(6, IStorageService)
], RemoteTunnelService);
export { RemoteTunnelService };
function isSameSession(a1, a2) {
    if (a1 && a2) {
        return a1.sessionId === a2.sessionId && a1.providerId === a2.providerId && a1.token === a2.token;
    }
    return a1 === a2;
}
const isSameMode = (a, b) => {
    if (a.active !== b.active) {
        return false;
    }
    else if (a.active && b.active) {
        return a.asService === b.asService && isSameSession(a.session, b.session);
    }
    else {
        return true;
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlVHVubmVsU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3JlbW90ZVR1bm5lbC9ub2RlL3JlbW90ZVR1bm5lbFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLDJCQUEyQixFQUFFLCtCQUErQixFQUE4RCxXQUFXLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBNEIsb0JBQW9CLEVBQW9CLE1BQU0sMkJBQTJCLENBQUM7QUFDMVEsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQVcsY0FBYyxFQUFFLGdCQUFnQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDcEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM3RCxPQUFPLEVBQThCLEtBQUssRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMxRSxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3BHLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxR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