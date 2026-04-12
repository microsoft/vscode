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
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { OS, isWindows } from '../../../base/common/platform.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService, ILoggerService, LogLevel } from '../../log/common/log.js';
import { RemoteLoggerChannelClient } from '../../log/common/logIpc.js';
import { getResolvedShellEnv } from '../../shell/node/shellEnv.js';
import { RequestStore } from '../common/requestStore.js';
import { HeartbeatConstants, TerminalIpcChannels } from '../common/terminal.js';
import { registerTerminalPlatformConfiguration } from '../common/terminalPlatformConfiguration.js';
import { detectAvailableProfiles } from './terminalProfiles.js';
import { getSystemShell } from '../../../base/node/shell.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
var Constants;
(function (Constants) {
    Constants[Constants["MaxRestarts"] = 5] = "MaxRestarts";
})(Constants || (Constants = {}));
/**
 * This service implements IPtyService by launching a pty host process, forwarding messages to and
 * from the pty host process and manages the connection.
 */
let PtyHostService = class PtyHostService extends Disposable {
    get _connection() {
        this._ensurePtyHost();
        return this.__connection;
    }
    get _proxy() {
        this._ensurePtyHost();
        return this.__proxy;
    }
    /**
     * Get the proxy if it exists, otherwise undefined. This is used when calls are not needed to be
     * passed through to the pty host if it has not yet been spawned.
     */
    get _optionalProxy() {
        return this.__proxy;
    }
    _ensurePtyHost() {
        if (!this.__connection) {
            this._startPtyHost();
        }
    }
    constructor(_ptyHostStarter, _configurationService, _logService, _loggerService) {
        super();
        this._ptyHostStarter = _ptyHostStarter;
        this._configurationService = _configurationService;
        this._logService = _logService;
        this._loggerService = _loggerService;
        this._wasQuitRequested = false;
        this._restartCount = 0;
        this._isResponsive = true;
        this._onPtyHostExit = this._register(new Emitter());
        this.onPtyHostExit = this._onPtyHostExit.event;
        this._onPtyHostStart = this._register(new Emitter());
        this.onPtyHostStart = this._onPtyHostStart.event;
        this._onPtyHostUnresponsive = this._register(new Emitter());
        this.onPtyHostUnresponsive = this._onPtyHostUnresponsive.event;
        this._onPtyHostResponsive = this._register(new Emitter());
        this.onPtyHostResponsive = this._onPtyHostResponsive.event;
        this._onPtyHostRequestResolveVariables = this._register(new Emitter());
        this.onPtyHostRequestResolveVariables = this._onPtyHostRequestResolveVariables.event;
        this._onProcessData = this._register(new Emitter());
        this.onProcessData = this._onProcessData.event;
        this._onProcessReady = this._register(new Emitter());
        this.onProcessReady = this._onProcessReady.event;
        this._onProcessReplay = this._register(new Emitter());
        this.onProcessReplay = this._onProcessReplay.event;
        this._onProcessOrphanQuestion = this._register(new Emitter());
        this.onProcessOrphanQuestion = this._onProcessOrphanQuestion.event;
        this._onDidRequestDetach = this._register(new Emitter());
        this.onDidRequestDetach = this._onDidRequestDetach.event;
        this._onDidChangeProperty = this._register(new Emitter());
        this.onDidChangeProperty = this._onDidChangeProperty.event;
        this._onProcessExit = this._register(new Emitter());
        this.onProcessExit = this._onProcessExit.event;
        // Platform configuration is required on the process running the pty host (shared process or
        // remote server).
        registerTerminalPlatformConfiguration();
        this._register(this._ptyHostStarter);
        this._register(toDisposable(() => this._disposePtyHost()));
        this._resolveVariablesRequestStore = this._register(new RequestStore(undefined, this._logService));
        this._register(this._resolveVariablesRequestStore.onCreateRequest(this._onPtyHostRequestResolveVariables.fire, this._onPtyHostRequestResolveVariables));
        // Start the pty host when a window requests a connection, if the starter has that capability.
        if (this._ptyHostStarter.onRequestConnection) {
            this._register(Event.once(this._ptyHostStarter.onRequestConnection)(() => this._ensurePtyHost()));
        }
        if (this._ptyHostStarter.onWillShutdown) {
            this._register(this._ptyHostStarter.onWillShutdown(() => this._wasQuitRequested = true));
        }
    }
    get _ignoreProcessNames() {
        return this._configurationService.getValue("terminal.integrated.ignoreProcessNames" /* TerminalSettingId.IgnoreProcessNames */);
    }
    async _refreshIgnoreProcessNames() {
        return this._optionalProxy?.refreshIgnoreProcessNames?.(this._ignoreProcessNames);
    }
    async _resolveShellEnv() {
        if (isWindows) {
            return process.env;
        }
        try {
            return await getResolvedShellEnv(this._configurationService, this._logService, { _: [] }, process.env);
        }
        catch (error) {
            this._logService.error('ptyHost was unable to resolve shell environment', error);
            return {};
        }
    }
    _startPtyHost() {
        const connection = this._ptyHostStarter.start();
        const client = connection.client;
        // Log a full stack trace which will tell the exact reason the pty host is starting up
        if (this._logService.getLevel() === LogLevel.Trace) {
            this._logService.trace('PtyHostService#_startPtyHost', new Error().stack?.replace(/^Error/, ''));
        }
        // Setup heartbeat service and trigger a heartbeat immediately to reset the timeouts
        const heartbeatService = ProxyChannel.toService(client.getChannel(TerminalIpcChannels.Heartbeat));
        heartbeatService.onBeat(() => this._handleHeartbeat());
        this._handleHeartbeat(true);
        // Handle exit
        this._register(connection.onDidProcessExit(e => {
            this._onPtyHostExit.fire(e.code);
            if (!this._wasQuitRequested && !this._store.isDisposed) {
                if (this._restartCount <= Constants.MaxRestarts) {
                    this._logService.error(`ptyHost terminated unexpectedly with code ${e.code}`);
                    this._restartCount++;
                    this.restartPtyHost();
                }
                else {
                    this._logService.error(`ptyHost terminated unexpectedly with code ${e.code}, giving up`);
                }
            }
        }));
        // Create proxy and forward events
        const proxy = ProxyChannel.toService(client.getChannel(TerminalIpcChannels.PtyHost));
        this._register(proxy.onProcessData(e => this._onProcessData.fire(e)));
        this._register(proxy.onProcessReady(e => this._onProcessReady.fire(e)));
        this._register(proxy.onProcessExit(e => this._onProcessExit.fire(e)));
        this._register(proxy.onDidChangeProperty(e => this._onDidChangeProperty.fire(e)));
        this._register(proxy.onProcessReplay(e => this._onProcessReplay.fire(e)));
        this._register(proxy.onProcessOrphanQuestion(e => this._onProcessOrphanQuestion.fire(e)));
        this._register(proxy.onDidRequestDetach(e => this._onDidRequestDetach.fire(e)));
        this._register(new RemoteLoggerChannelClient(this._loggerService, client.getChannel(TerminalIpcChannels.Logger)));
        this.__connection = connection;
        this.__proxy = proxy;
        this._onPtyHostStart.fire();
        this._register(this._configurationService.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration("terminal.integrated.ignoreProcessNames" /* TerminalSettingId.IgnoreProcessNames */)) {
                await this._refreshIgnoreProcessNames();
            }
        }));
        this._refreshIgnoreProcessNames();
        return [connection, proxy];
    }
    async createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, options, shouldPersist, workspaceId, workspaceName) {
        const timeout = setTimeout(() => this._handleUnresponsiveCreateProcess(), HeartbeatConstants.CreateProcessTimeout);
        const id = await this._proxy.createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, options, shouldPersist, workspaceId, workspaceName);
        clearTimeout(timeout);
        return id;
    }
    updateTitle(id, title, titleSource) {
        return this._proxy.updateTitle(id, title, titleSource);
    }
    updateIcon(id, userInitiated, icon, color) {
        return this._proxy.updateIcon(id, userInitiated, icon, color);
    }
    attachToProcess(id) {
        return this._proxy.attachToProcess(id);
    }
    detachFromProcess(id, forcePersist) {
        return this._proxy.detachFromProcess(id, forcePersist);
    }
    shutdownAll() {
        return this._proxy.shutdownAll();
    }
    listProcesses() {
        return this._proxy.listProcesses();
    }
    async getPerformanceMarks() {
        return this._optionalProxy?.getPerformanceMarks() ?? [];
    }
    async reduceConnectionGraceTime() {
        return this._optionalProxy?.reduceConnectionGraceTime();
    }
    start(id) {
        return this._proxy.start(id);
    }
    shutdown(id, immediate) {
        return this._proxy.shutdown(id, immediate);
    }
    input(id, data) {
        return this._proxy.input(id, data);
    }
    sendSignal(id, signal) {
        return this._proxy.sendSignal(id, signal);
    }
    processBinary(id, data) {
        return this._proxy.processBinary(id, data);
    }
    resize(id, cols, rows, pixelWidth, pixelHeight) {
        return this._proxy.resize(id, cols, rows, pixelWidth, pixelHeight);
    }
    clearBuffer(id) {
        return this._proxy.clearBuffer(id);
    }
    acknowledgeDataEvent(id, charCount) {
        return this._proxy.acknowledgeDataEvent(id, charCount);
    }
    setUnicodeVersion(id, version) {
        return this._proxy.setUnicodeVersion(id, version);
    }
    setNextCommandId(id, commandLine, commandId) {
        return this._proxy.setNextCommandId(id, commandLine, commandId);
    }
    getInitialCwd(id) {
        return this._proxy.getInitialCwd(id);
    }
    getCwd(id) {
        return this._proxy.getCwd(id);
    }
    async getLatency() {
        const sw = new StopWatch();
        const results = await this._proxy.getLatency();
        sw.stop();
        return [
            {
                label: 'ptyhostservice<->ptyhost',
                latency: sw.elapsed()
            },
            ...results
        ];
    }
    orphanQuestionReply(id) {
        return this._proxy.orphanQuestionReply(id);
    }
    installAutoReply(match, reply) {
        return this._proxy.installAutoReply(match, reply);
    }
    uninstallAllAutoReplies() {
        return this._proxy.uninstallAllAutoReplies();
    }
    getDefaultSystemShell(osOverride) {
        return this._optionalProxy?.getDefaultSystemShell(osOverride) ?? getSystemShell(osOverride ?? OS, process.env);
    }
    async getProfiles(workspaceId, profiles, defaultProfile, includeDetectedProfiles = false) {
        const shellEnv = await this._resolveShellEnv();
        return detectAvailableProfiles(profiles, defaultProfile, includeDetectedProfiles, this._configurationService, shellEnv, undefined, this._logService, this._resolveVariables.bind(this, workspaceId));
    }
    async getEnvironment() {
        // If the pty host is yet to be launched, just return the environment of this process as it
        // is essentially the same when used to evaluate terminal profiles.
        if (!this.__proxy) {
            return { ...process.env };
        }
        return this._proxy.getEnvironment();
    }
    getWslPath(original, direction) {
        return this._proxy.getWslPath(original, direction);
    }
    getRevivedPtyNewId(workspaceId, id) {
        return this._proxy.getRevivedPtyNewId(workspaceId, id);
    }
    setTerminalLayoutInfo(args) {
        return this._proxy.setTerminalLayoutInfo(args);
    }
    async getTerminalLayoutInfo(args) {
        // This is optional as we want reconnect requests to go through only if the pty host exists.
        // Revive is handled specially as reviveTerminalProcesses is guaranteed to be called before
        // the request for layout info.
        return this._optionalProxy?.getTerminalLayoutInfo(args);
    }
    async requestDetachInstance(workspaceId, instanceId) {
        return this._proxy.requestDetachInstance(workspaceId, instanceId);
    }
    async acceptDetachInstanceReply(requestId, persistentProcessId) {
        return this._proxy.acceptDetachInstanceReply(requestId, persistentProcessId);
    }
    async freePortKillProcess(port) {
        if (!this._proxy.freePortKillProcess) {
            throw new Error('freePortKillProcess does not exist on the pty proxy');
        }
        return this._proxy.freePortKillProcess(port);
    }
    async serializeTerminalState(ids) {
        return this._proxy.serializeTerminalState(ids);
    }
    async reviveTerminalProcesses(workspaceId, state, dateTimeFormatLocate) {
        return this._proxy.reviveTerminalProcesses(workspaceId, state, dateTimeFormatLocate);
    }
    async refreshProperty(id, property) {
        return this._proxy.refreshProperty(id, property);
    }
    async updateProperty(id, property, value) {
        return this._proxy.updateProperty(id, property, value);
    }
    async restartPtyHost() {
        this._disposePtyHost();
        this._isResponsive = true;
        this._startPtyHost();
    }
    _disposePtyHost() {
        this._proxy.shutdownAll();
        this._connection.store.dispose();
    }
    _handleHeartbeat(isConnecting) {
        this._clearHeartbeatTimeouts();
        this._heartbeatFirstTimeout = setTimeout(() => this._handleHeartbeatFirstTimeout(), isConnecting ? HeartbeatConstants.ConnectingBeatInterval : (HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier));
        if (!this._isResponsive) {
            this._isResponsive = true;
            this._onPtyHostResponsive.fire();
        }
    }
    _handleHeartbeatFirstTimeout() {
        this._logService.warn(`No ptyHost heartbeat after ${HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier / 1000} seconds`);
        this._heartbeatFirstTimeout = undefined;
        this._heartbeatSecondTimeout = setTimeout(() => this._handleHeartbeatSecondTimeout(), HeartbeatConstants.BeatInterval * HeartbeatConstants.SecondWaitMultiplier);
    }
    _handleHeartbeatSecondTimeout() {
        this._logService.error(`No ptyHost heartbeat after ${(HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier + HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier) / 1000} seconds`);
        this._heartbeatSecondTimeout = undefined;
        if (this._isResponsive) {
            this._isResponsive = false;
            this._onPtyHostUnresponsive.fire();
        }
    }
    _handleUnresponsiveCreateProcess() {
        this._clearHeartbeatTimeouts();
        this._logService.error(`No ptyHost response to createProcess after ${HeartbeatConstants.CreateProcessTimeout / 1000} seconds`);
        if (this._isResponsive) {
            this._isResponsive = false;
            this._onPtyHostUnresponsive.fire();
        }
    }
    _clearHeartbeatTimeouts() {
        if (this._heartbeatFirstTimeout) {
            clearTimeout(this._heartbeatFirstTimeout);
            this._heartbeatFirstTimeout = undefined;
        }
        if (this._heartbeatSecondTimeout) {
            clearTimeout(this._heartbeatSecondTimeout);
            this._heartbeatSecondTimeout = undefined;
        }
    }
    _resolveVariables(workspaceId, text) {
        return this._resolveVariablesRequestStore.createRequest({ workspaceId, originalText: text });
    }
    async acceptPtyHostResolvedVariables(requestId, resolved) {
        this._resolveVariablesRequestStore.acceptReply(requestId, resolved);
    }
};
PtyHostService = __decorate([
    __param(1, IConfigurationService),
    __param(2, ILogService),
    __param(3, ILoggerService)
], PtyHostService);
export { PtyHostService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHR5SG9zdFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZXJtaW5hbC9ub2RlL3B0eUhvc3RTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RSxPQUFPLEVBQXVCLEVBQUUsRUFBbUIsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDdkcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ2hGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRW5FLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsa0JBQWtCLEVBQTJYLG1CQUFtQixFQUF1QyxNQUFNLHVCQUF1QixDQUFDO0FBQzllLE9BQU8sRUFBRSxxQ0FBcUMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBR25HLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRWhFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFOUQsSUFBSyxTQUVKO0FBRkQs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