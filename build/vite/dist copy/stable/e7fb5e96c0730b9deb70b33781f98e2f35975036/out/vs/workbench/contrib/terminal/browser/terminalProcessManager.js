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
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, dispose, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isMacintosh, isWindows, OS } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { formatMessageForTerminal } from '../../../../platform/terminal/common/terminalStrings.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { getRemoteAuthority } from '../../../../platform/remote/common/remoteHosts.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { NaiveCwdDetectionCapability } from '../../../../platform/terminal/common/capabilities/naiveCwdDetectionCapability.js';
import { TerminalCapabilityStore } from '../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { ITerminalLogService } from '../../../../platform/terminal/common/terminal.js';
import { TerminalRecorder } from '../../../../platform/terminal/common/terminalRecorder.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EnvironmentVariableInfoChangesActive, EnvironmentVariableInfoStale } from './environmentVariableInfo.js';
import { ITerminalConfigurationService, ITerminalInstanceService, ITerminalService } from './terminal.js';
import { IEnvironmentVariableService } from '../common/environmentVariable.js';
import { MergedEnvironmentVariableCollection } from '../../../../platform/terminal/common/environmentVariableCollection.js';
import { serializeEnvironmentVariableCollections } from '../../../../platform/terminal/common/environmentVariableShared.js';
import { ITerminalProfileResolverService } from '../common/terminal.js';
import * as terminalEnvironment from '../common/terminalEnvironment.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import Severity from '../../../../base/common/severity.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { getActiveWindow, runWhenWindowIdle } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { shouldUseEnvironmentVariableCollection } from '../../../../platform/terminal/common/terminalEnvironment.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { isString } from '../../../../base/common/types.js';
var ProcessConstants;
(function (ProcessConstants) {
    /**
     * The amount of time to consider terminal errors to be related to the launch.
     */
    ProcessConstants[ProcessConstants["ErrorLaunchThresholdDuration"] = 500] = "ErrorLaunchThresholdDuration";
    /**
     * The minimum amount of time between latency requests.
     */
    ProcessConstants[ProcessConstants["LatencyMeasuringInterval"] = 1000] = "LatencyMeasuringInterval";
})(ProcessConstants || (ProcessConstants = {}));
var ProcessType;
(function (ProcessType) {
    ProcessType[ProcessType["Process"] = 0] = "Process";
    ProcessType[ProcessType["PsuedoTerminal"] = 1] = "PsuedoTerminal";
})(ProcessType || (ProcessType = {}));
/**
 * Holds all state related to the creation and management of terminal processes.
 *
 * Internal definitions:
 * - Process: The process launched with the terminalProcess.ts file, or the pty as a whole
 * - Pty Process: The pseudoterminal parent process (or the conpty agent process)
 * - Shell Process: The pseudoterminal child process (ie. the shell)
 */
let TerminalProcessManager = class TerminalProcessManager extends Disposable {
    get persistentProcessId() { return this._process?.id; }
    get shouldPersist() { return !!this.reconnectionProperties || (this._process ? this._process.shouldPersist : false); }
    get hasWrittenData() { return this._hasWrittenData; }
    get hasChildProcesses() { return this._hasChildProcesses; }
    get reconnectionProperties() { return this._shellLaunchConfig?.attachPersistentProcess?.reconnectionProperties || this._shellLaunchConfig?.reconnectionProperties || undefined; }
    get extEnvironmentVariableCollection() { return this._extEnvironmentVariableCollection; }
    get processTraits() { return this._processTraits; }
    constructor(_instanceId, cwd, environmentVariableCollections, shellIntegrationNonce, _historyService, _instantiationService, _logService, _workspaceContextService, _configurationResolverService, _workbenchEnvironmentService, _productService, _remoteAgentService, _pathService, _environmentVariableService, _terminalConfigurationService, _terminalProfileResolverService, _configurationService, _terminalInstanceService, _telemetryService, _notificationService, _accessibilityService, _terminalService) {
        super();
        this._instanceId = _instanceId;
        this._historyService = _historyService;
        this._instantiationService = _instantiationService;
        this._logService = _logService;
        this._workspaceContextService = _workspaceContextService;
        this._configurationResolverService = _configurationResolverService;
        this._workbenchEnvironmentService = _workbenchEnvironmentService;
        this._productService = _productService;
        this._remoteAgentService = _remoteAgentService;
        this._pathService = _pathService;
        this._environmentVariableService = _environmentVariableService;
        this._terminalConfigurationService = _terminalConfigurationService;
        this._terminalProfileResolverService = _terminalProfileResolverService;
        this._configurationService = _configurationService;
        this._terminalInstanceService = _terminalInstanceService;
        this._telemetryService = _telemetryService;
        this._notificationService = _notificationService;
        this._accessibilityService = _accessibilityService;
        this._terminalService = _terminalService;
        this.processState = 1 /* ProcessState.Uninitialized */;
        this.capabilities = this._register(new TerminalCapabilityStore());
        this.processReadyTimestamp = 0;
        this._isDisposed = false;
        this._process = null;
        this._processType = 0 /* ProcessType.Process */;
        this._preLaunchInputQueue = [];
        this._hasWrittenData = false;
        this._hasChildProcesses = false;
        this._ptyListenersAttached = false;
        this._isDisconnected = false;
        this._dimensions = { cols: 0, rows: 0 };
        this._onPtyDisconnect = this._register(new Emitter());
        this.onPtyDisconnect = this._onPtyDisconnect.event;
        this._onPtyReconnect = this._register(new Emitter());
        this.onPtyReconnect = this._onPtyReconnect.event;
        this._onProcessReady = this._register(new Emitter());
        this.onProcessReady = this._onProcessReady.event;
        this._onProcessStateChange = this._register(new Emitter());
        this.onProcessStateChange = this._onProcessStateChange.event;
        this._onBeforeProcessData = this._register(new Emitter());
        this.onBeforeProcessData = this._onBeforeProcessData.event;
        this._onProcessData = this._register(new Emitter());
        this.onProcessData = this._onProcessData.event;
        this._onProcessReplayComplete = this._register(new Emitter());
        this.onProcessReplayComplete = this._onProcessReplayComplete.event;
        this._onDidChangeProperty = this._register(new Emitter());
        this.onDidChangeProperty = this._onDidChangeProperty.event;
        this._onEnvironmentVariableInfoChange = this._register(new Emitter());
        this.onEnvironmentVariableInfoChanged = this._onEnvironmentVariableInfoChange.event;
        this._onProcessExit = this._register(new Emitter());
        this.onProcessExit = this._onProcessExit.event;
        this._onRestoreCommands = this._register(new Emitter());
        this.onRestoreCommands = this._onRestoreCommands.event;
        this._cwdWorkspaceFolder = terminalEnvironment.getWorkspaceForTerminal(cwd, this._workspaceContextService, this._historyService);
        this.ptyProcessReady = this._createPtyProcessReadyPromise();
        this._ackDataBufferer = new AckDataBufferer(e => this._process?.acknowledgeDataEvent(e));
        this._dataFilter = this._register(this._instantiationService.createInstance(SeamlessRelaunchDataFilter));
        this._register(this._dataFilter.onProcessData(ev => {
            const data = (isString(ev) ? ev : ev.data);
            const beforeProcessDataEvent = { data };
            this._onBeforeProcessData.fire(beforeProcessDataEvent);
            if (beforeProcessDataEvent.data && beforeProcessDataEvent.data.length > 0) {
                // This event is used by the caller so the object must be reused
                if (!isString(ev)) {
                    ev.data = beforeProcessDataEvent.data;
                }
                this._onProcessData.fire(!isString(ev) ? ev : { data: beforeProcessDataEvent.data, trackCommit: false });
            }
        }));
        if (cwd && typeof cwd === 'object') {
            this.remoteAuthority = getRemoteAuthority(cwd);
        }
        else {
            this.remoteAuthority = this._workbenchEnvironmentService.remoteAuthority;
        }
        if (environmentVariableCollections) {
            this._extEnvironmentVariableCollection = new MergedEnvironmentVariableCollection(environmentVariableCollections);
            this._register(this._environmentVariableService.onDidChangeCollections(newCollection => this._onEnvironmentVariableCollectionChange(newCollection)));
            this.environmentVariableInfo = this._instantiationService.createInstance(EnvironmentVariableInfoChangesActive, this._extEnvironmentVariableCollection);
            this._onEnvironmentVariableInfoChange.fire(this.environmentVariableInfo);
        }
        this.shellIntegrationNonce = shellIntegrationNonce ?? generateUuid();
    }
    async freePortKillProcess(port) {
        try {
            if (this._process?.freePortKillProcess) {
                await this._process?.freePortKillProcess(port);
            }
        }
        catch (e) {
            this._notificationService.notify({ message: localize('killportfailure', 'Could not kill process listening on port {0}, command exited with error {1}', port, e), severity: Severity.Warning });
        }
    }
    dispose(immediate = false) {
        this._isDisposed = true;
        if (this._process) {
            // If the process was still connected this dispose came from
            // within VS Code, not the process, so mark the process as
            // killed by the user.
            this._setProcessState(5 /* ProcessState.KilledByUser */);
            this._process.shutdown(immediate);
            this._process = null;
        }
        if (this._processListeners) {
            dispose(this._processListeners);
            this._processListeners = undefined;
        }
        super.dispose();
    }
    _createPtyProcessReadyPromise() {
        return new Promise(c => {
            const listener = Event.once(this.onProcessReady)(() => {
                this._logService.debug(`Terminal process ready (shellProcessId: ${this.shellProcessId})`);
                this._store.delete(listener);
                c(undefined);
            });
            this._store.add(listener);
        });
    }
    async detachFromProcess(forcePersist) {
        await this._process?.detach?.(forcePersist);
        this._process = null;
    }
    async createProcess(shellLaunchConfig, cols, rows, reset = true) {
        this._shellLaunchConfig = shellLaunchConfig;
        this._dimensions.cols = cols;
        this._dimensions.rows = rows;
        let newProcess;
        if (shellLaunchConfig.customPtyImplementation) {
            this._processType = 1 /* ProcessType.PsuedoTerminal */;
            newProcess = shellLaunchConfig.customPtyImplementation(this._instanceId, cols, rows);
        }
        else {
            const backend = await this._terminalInstanceService.getBackend(this.remoteAuthority);
            if (!backend) {
                throw new Error(`No terminal backend registered for remote authority '${this.remoteAuthority}'`);
            }
            this.backend = backend;
            // Create variable resolver
            // Start with the full base environment so that all standard variables (e.g. PATH) are
            // available, then overlay the shell environment on top so that launch configuration
            // variables and shell-profile modifications take precedence.
            const envForResolver = { ...await this._terminalProfileResolverService.getEnvironment(this.remoteAuthority) };
            terminalEnvironment.mergeEnvironments(envForResolver, await backend.getShellEnvironment());
            const variableResolver = terminalEnvironment.createVariableResolver(this._cwdWorkspaceFolder, envForResolver, this._configurationResolverService);
            // resolvedUserHome is needed here as remote resolvers can launch local terminals before
            // they're connected to the remote.
            this.userHome = this._pathService.resolvedUserHome?.fsPath;
            this.os = OS;
            if (!!this.remoteAuthority) {
                const userHomeUri = await this._pathService.userHome();
                this.userHome = userHomeUri.path;
                const remoteEnv = await this._remoteAgentService.getEnvironment();
                if (!remoteEnv) {
                    throw new Error(`Failed to get remote environment for remote authority "${this.remoteAuthority}"`);
                }
                this.userHome = remoteEnv.userHome.path;
                this.os = remoteEnv.os;
                // this is a copy of what the merged environment collection is on the remote side
                const env = await this._resolveEnvironment(backend, variableResolver, shellLaunchConfig);
                const shouldPersist = ((this._configurationService.getValue("task.reconnection" /* TaskSettingId.Reconnection */) && shellLaunchConfig.reconnectionProperties) || !shellLaunchConfig.isFeatureTerminal) && this._terminalConfigurationService.config.enablePersistentSessions && !shellLaunchConfig.isTransient;
                if (shellLaunchConfig.attachPersistentProcess) {
                    const result = await backend.attachToProcess(shellLaunchConfig.attachPersistentProcess.id);
                    if (result) {
                        newProcess = result;
                    }
                    else {
                        // Warn and just create a new terminal if attach failed for some reason
                        this._logService.warn(`Attach to process failed for terminal`, shellLaunchConfig.attachPersistentProcess);
                        shellLaunchConfig.attachPersistentProcess = undefined;
                    }
                }
                if (!newProcess) {
                    await this._terminalProfileResolverService.resolveShellLaunchConfig(shellLaunchConfig, {
                        remoteAuthority: this.remoteAuthority,
                        os: this.os
                    });
                    const options = {
                        shellIntegration: {
                            enabled: this._configurationService.getValue("terminal.integrated.shellIntegration.enabled" /* TerminalSettingId.ShellIntegrationEnabled */),
                            suggestEnabled: this._configurationService.getValue("terminal.integrated.suggest.enabled" /* TerminalContribSettingId.SuggestEnabled */),
                            nonce: this.shellIntegrationNonce
                        },
                        windowsUseConptyDll: this._terminalConfigurationService.config.windowsUseConptyDll ?? false,
                        environmentVariableCollections: this._extEnvironmentVariableCollection?.collections ? serializeEnvironmentVariableCollections(this._extEnvironmentVariableCollection.collections) : undefined,
                        workspaceFolder: this._cwdWorkspaceFolder,
                        isScreenReaderOptimized: this._accessibilityService.isScreenReaderOptimized()
                    };
                    try {
                        newProcess = await backend.createProcess(shellLaunchConfig, '', // TODO: Fix cwd
                        cols, rows, this._terminalConfigurationService.config.unicodeVersion, env, // TODO:
                        options, shouldPersist);
                    }
                    catch (e) {
                        if (e?.message === 'Could not fetch remote environment') {
                            this._logService.trace(`Could not fetch remote environment, silently failing`);
                            return undefined;
                        }
                        throw e;
                    }
                }
                if (!this._isDisposed) {
                    this._setupPtyHostListeners(backend);
                }
            }
            else {
                if (shellLaunchConfig.attachPersistentProcess) {
                    const result = shellLaunchConfig.attachPersistentProcess.findRevivedId ? await backend.attachToRevivedProcess(shellLaunchConfig.attachPersistentProcess.id) : await backend.attachToProcess(shellLaunchConfig.attachPersistentProcess.id);
                    if (result) {
                        newProcess = result;
                    }
                    else {
                        // Warn and just create a new terminal if attach failed for some reason
                        this._logService.warn(`Attach to process failed for terminal`, shellLaunchConfig.attachPersistentProcess);
                        shellLaunchConfig.attachPersistentProcess = undefined;
                    }
                }
                if (!newProcess) {
                    newProcess = await this._launchLocalProcess(backend, shellLaunchConfig, cols, rows, this.userHome, variableResolver);
                }
                if (!this._isDisposed) {
                    this._setupPtyHostListeners(backend);
                }
            }
        }
        // If the process was disposed during its creation, shut it down and return failure
        if (this._isDisposed) {
            newProcess.shutdown(false);
            return undefined;
        }
        this._process = newProcess;
        this._setProcessState(2 /* ProcessState.Launching */);
        // Add any capabilities inherent to the backend
        if (this.os === 3 /* OperatingSystem.Linux */ || this.os === 2 /* OperatingSystem.Macintosh */) {
            this.capabilities.add(1 /* TerminalCapability.NaiveCwdDetection */, new NaiveCwdDetectionCapability(this._process));
        }
        this._dataFilter.newProcess(this._process, reset);
        if (this._processListeners) {
            dispose(this._processListeners);
        }
        this._processListeners = [
            newProcess.onProcessReady((e) => {
                this._logService.debug('onProcessReady', e);
                this._processTraits = e;
                this.shellProcessId = e.pid;
                this._initialCwd = e.cwd;
                this.processReadyTimestamp = Date.now();
                this._onDidChangeProperty.fire({ type: "initialCwd" /* ProcessPropertyType.InitialCwd */, value: this._initialCwd });
                this._onProcessReady.fire(e);
                if (this._preLaunchInputQueue.length > 0 && this._process) {
                    // Send any queued data that's waiting
                    this._logService.debug('sending prelaunch input queue', this._preLaunchInputQueue);
                    newProcess.input(this._preLaunchInputQueue.join(''));
                    this._preLaunchInputQueue.length = 0;
                }
            }),
            newProcess.onProcessExit(exitCode => this._onExit(exitCode)),
            newProcess.onDidChangeProperty(({ type, value }) => {
                switch (type) {
                    case "hasChildProcesses" /* ProcessPropertyType.HasChildProcesses */:
                        this._hasChildProcesses = value;
                        break;
                    case "failedShellIntegrationActivation" /* ProcessPropertyType.FailedShellIntegrationActivation */:
                        this._telemetryService?.publicLog2('terminal/shellIntegrationActivationFailureCustomArgs');
                        break;
                }
                this._onDidChangeProperty.fire({ type, value });
            })
        ];
        if (newProcess.onProcessReplayComplete) {
            this._processListeners.push(newProcess.onProcessReplayComplete(() => this._onProcessReplayComplete.fire()));
        }
        if (newProcess.onRestoreCommands) {
            this._processListeners.push(newProcess.onRestoreCommands(e => this._onRestoreCommands.fire(e)));
        }
        setTimeout(() => {
            if (this.processState === 2 /* ProcessState.Launching */) {
                this._setProcessState(3 /* ProcessState.Running */);
            }
        }, 500 /* ProcessConstants.ErrorLaunchThresholdDuration */);
        const result = await newProcess.start();
        if (result) {
            // Error
            return result;
        }
        // Report the latency to the pty host when idle
        runWhenWindowIdle(getActiveWindow(), () => {
            this.backend?.getLatency().then(measurements => {
                this._logService.info(`Latency measurements for ${this.remoteAuthority ?? 'local'} backend\n${measurements.map(e => `${e.label}: ${e.latency.toFixed(2)}ms`).join('\n')}`);
            });
        });
        return undefined;
    }
    async relaunch(shellLaunchConfig, cols, rows, reset) {
        this.ptyProcessReady = this._createPtyProcessReadyPromise();
        this._logService.trace(`Relaunching terminal instance ${this._instanceId}`);
        // Fire reconnect if needed to ensure the terminal is usable again
        if (this._isDisconnected) {
            this._isDisconnected = false;
            this._onPtyReconnect.fire();
        }
        // Clear data written flag to re-enable seamless relaunch if this relaunch was manually
        // triggered
        this._hasWrittenData = false;
        return this.createProcess(shellLaunchConfig, cols, rows, reset);
    }
    // Fetch any extension environment additions and apply them
    async _resolveEnvironment(backend, variableResolver, shellLaunchConfig) {
        const workspaceFolder = terminalEnvironment.getWorkspaceForTerminal(shellLaunchConfig.cwd, this._workspaceContextService, this._historyService);
        const platformKey = isWindows ? 'windows' : (isMacintosh ? 'osx' : 'linux');
        const envFromConfigValue = this._configurationService.getValue(`terminal.integrated.env.${platformKey}`);
        this._logService.debug(`Resolving environment (useShellEnvironment=${shellLaunchConfig.useShellEnvironment}, platformKey=${platformKey}, envFromConfig=${envFromConfigValue ? Object.keys(envFromConfigValue).join(',') : 'none'})`);
        let baseEnv;
        if (shellLaunchConfig.useShellEnvironment) {
            const shellEnv = await backend.getShellEnvironment();
            if (!shellEnv) {
                throw new BugIndicatingError('Cannot fetch shell environment to use');
            }
            this._logService.debug(`Shell environment resolved with ${Object.keys(shellEnv).length} variables: ${Object.keys(shellEnv).sort().join(', ')}`);
            baseEnv = shellEnv;
        }
        else {
            baseEnv = await this._terminalProfileResolverService.getEnvironment(this.remoteAuthority);
            this._logService.debug(`Profile environment resolved with ${Object.keys(baseEnv).length} variables`);
        }
        const env = await terminalEnvironment.createTerminalEnvironment(shellLaunchConfig, envFromConfigValue, variableResolver, this._productService.version, this._terminalConfigurationService.config.detectLocale, baseEnv);
        this._logService.debug(`Terminal environment created with ${Object.keys(env).length} variables: ${Object.keys(env).sort().join(', ')}`);
        if (!this._isDisposed && shouldUseEnvironmentVariableCollection(shellLaunchConfig)) {
            this._extEnvironmentVariableCollection = this._environmentVariableService.mergedCollection;
            this._register(this._environmentVariableService.onDidChangeCollections(newCollection => this._onEnvironmentVariableCollectionChange(newCollection)));
            // For remote terminals, this is a copy of the mergedEnvironmentCollection created on
            // the remote side. Since the environment collection is synced between the remote and
            // local sides immediately this is a fairly safe way of enabling the env var diffing and
            // info widget. While technically these could differ due to the slight change of a race
            // condition, the chance is minimal plus the impact on the user is also not that great
            // if it happens - it's not worth adding plumbing to sync back the resolved collection.
            await this._extEnvironmentVariableCollection.applyToProcessEnvironment(env, { workspaceFolder }, variableResolver);
            if (this._extEnvironmentVariableCollection.getVariableMap({ workspaceFolder }).size) {
                this.environmentVariableInfo = this._instantiationService.createInstance(EnvironmentVariableInfoChangesActive, this._extEnvironmentVariableCollection);
                this._onEnvironmentVariableInfoChange.fire(this.environmentVariableInfo);
            }
        }
        return env;
    }
    async _launchLocalProcess(backend, shellLaunchConfig, cols, rows, userHome, variableResolver) {
        await this._terminalProfileResolverService.resolveShellLaunchConfig(shellLaunchConfig, {
            remoteAuthority: undefined,
            os: OS
        });
        const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot(Schemas.file);
        const initialCwd = await terminalEnvironment.getCwd(shellLaunchConfig, userHome, variableResolver, activeWorkspaceRootUri, this._terminalConfigurationService.config.cwd, this._logService);
        const env = await this._resolveEnvironment(backend, variableResolver, shellLaunchConfig);
        const options = {
            shellIntegration: {
                enabled: this._configurationService.getValue("terminal.integrated.shellIntegration.enabled" /* TerminalSettingId.ShellIntegrationEnabled */),
                suggestEnabled: this._configurationService.getValue("terminal.integrated.suggest.enabled" /* TerminalContribSettingId.SuggestEnabled */),
                nonce: this.shellIntegrationNonce
            },
            windowsUseConptyDll: this._terminalConfigurationService.config.windowsUseConptyDll ?? false,
            environmentVariableCollections: this._extEnvironmentVariableCollection ? serializeEnvironmentVariableCollections(this._extEnvironmentVariableCollection.collections) : undefined,
            workspaceFolder: this._cwdWorkspaceFolder,
            isScreenReaderOptimized: this._accessibilityService.isScreenReaderOptimized()
        };
        const shouldPersist = ((this._configurationService.getValue("task.reconnection" /* TaskSettingId.Reconnection */) && shellLaunchConfig.reconnectionProperties) || !shellLaunchConfig.isFeatureTerminal) && this._terminalConfigurationService.config.enablePersistentSessions && !shellLaunchConfig.isTransient;
        return await backend.createProcess(shellLaunchConfig, initialCwd, cols, rows, this._terminalConfigurationService.config.unicodeVersion, env, options, shouldPersist);
    }
    _setupPtyHostListeners(backend) {
        if (this._ptyListenersAttached) {
            return;
        }
        this._ptyListenersAttached = true;
        // Mark the process as disconnected is the pty host is unresponsive, the responsive event
        // will fire only when the pty host was already unresponsive
        this._register(backend.onPtyHostUnresponsive(() => {
            this._isDisconnected = true;
            this._onPtyDisconnect.fire();
        }));
        this._ptyResponsiveListener = backend.onPtyHostResponsive(() => {
            this._isDisconnected = false;
            this._onPtyReconnect.fire();
        });
        this._register(toDisposable(() => this._ptyResponsiveListener?.dispose()));
        // When the pty host restarts, reconnect is no longer possible so dispose the responsive
        // listener
        this._register(backend.onPtyHostRestart(async () => {
            // When the pty host restarts, reconnect is no longer possible
            if (!this._isDisconnected) {
                this._isDisconnected = true;
                this._onPtyDisconnect.fire();
            }
            this._ptyResponsiveListener?.dispose();
            this._ptyResponsiveListener = undefined;
            if (this._shellLaunchConfig) {
                if (this._shellLaunchConfig.isFeatureTerminal && !this.reconnectionProperties) {
                    // Indicate the process is exited (and gone forever) only for feature terminals
                    // so they can react to the exit, this is particularly important for tasks so
                    // that it knows that the process is not still active. Note that this is not
                    // done for regular terminals because otherwise the terminal instance would be
                    // disposed.
                    this._onExit(-1);
                }
                else {
                    // For normal terminals write a message indicating what happened and relaunch
                    // using the previous shellLaunchConfig
                    const message = localize('ptyHostRelaunch', "Restarting the terminal because the connection to the shell process was lost...");
                    // Align with the pty service's revive logic (_reviveTerminalProcess in src/vs/platform/terminal/node/ptyService.ts)
                    // to hedge against PSReadLine `GetConsoleCursorInfo` and cursor handling from conpty.
                    let postRestartMessage = '';
                    if (this.os === 1 /* OperatingSystem.Windows */ && this._dimensions.rows > 0) {
                        postRestartMessage = '\r\n'.repeat(this._dimensions.rows - 1) + `\x1b[H`;
                    }
                    this._onProcessData.fire({ data: formatMessageForTerminal(message, { loudFormatting: true }) + postRestartMessage, trackCommit: false });
                    await this.relaunch(this._shellLaunchConfig, this._dimensions.cols, this._dimensions.rows, false);
                }
            }
        }));
        this._register(toDisposable(() => {
            this.ptyProcessReady = undefined;
        }));
    }
    async getBackendOS() {
        let os = OS;
        if (!!this.remoteAuthority) {
            const remoteEnv = await this._remoteAgentService.getEnvironment();
            if (!remoteEnv) {
                throw new Error(`Failed to get remote environment for remote authority "${this.remoteAuthority}"`);
            }
            os = remoteEnv.os;
        }
        return os;
    }
    setDimensions(cols, rows, sync, pixelWidth, pixelHeight) {
        if (sync) {
            this._resize(cols, rows, pixelWidth, pixelHeight);
            return;
        }
        return this.ptyProcessReady.then(() => this._resize(cols, rows, pixelWidth, pixelHeight));
    }
    async setUnicodeVersion(version) {
        return this._process?.setUnicodeVersion(version);
    }
    async setNextCommandId(commandLine, commandId) {
        await this.ptyProcessReady;
        const process = this._process;
        if (!process?.id) {
            return;
        }
        await this._terminalService.setNextCommandId(process.id, commandLine, commandId);
    }
    _resize(cols, rows, pixelWidth, pixelHeight) {
        if (!this._process) {
            return;
        }
        // The child process could already be terminated
        try {
            this._process.resize(cols, rows, pixelWidth, pixelHeight);
        }
        catch (error) {
            // We tried to write to a closed pipe / channel.
            if (error.code !== 'EPIPE' && error.code !== 'ERR_IPC_CHANNEL_CLOSED') {
                throw (error);
            }
        }
        this._dimensions.cols = cols;
        this._dimensions.rows = rows;
    }
    async write(data) {
        await this.ptyProcessReady;
        this._dataFilter.disableSeamlessRelaunch();
        this._hasWrittenData = true;
        if (this.shellProcessId || this._processType === 1 /* ProcessType.PsuedoTerminal */) {
            if (this._process) {
                // Send data if the pty is ready
                this._process.input(data);
            }
        }
        else {
            // If the pty is not ready, queue the data received to send later
            this._logService.debug('queueing data in prelaunch input queue', data);
            this._preLaunchInputQueue.push(data);
        }
    }
    async sendSignal(signal) {
        await this.ptyProcessReady;
        if (this._process) {
            this._process.sendSignal(signal);
        }
    }
    async processBinary(data) {
        await this.ptyProcessReady;
        this._dataFilter.disableSeamlessRelaunch();
        this._hasWrittenData = true;
        this._process?.processBinary(data);
    }
    get initialCwd() {
        return this._initialCwd ?? '';
    }
    async refreshProperty(type) {
        if (!this._process) {
            throw new Error('Cannot refresh property when process is not set');
        }
        return this._process.refreshProperty(type);
    }
    async updateProperty(type, value) {
        return this._process?.updateProperty(type, value);
    }
    acknowledgeDataEvent(charCount) {
        this._ackDataBufferer.ack(charCount);
    }
    _onExit(exitCode) {
        this._process = null;
        // If the process is marked as launching then mark the process as killed
        // during launch. This typically means that there is a problem with the
        // shell and args.
        if (this.processState === 2 /* ProcessState.Launching */) {
            this._setProcessState(4 /* ProcessState.KilledDuringLaunch */);
        }
        // If TerminalInstance did not know about the process exit then it was
        // triggered by the process, not on VS Code's side.
        if (this.processState === 3 /* ProcessState.Running */) {
            this._setProcessState(6 /* ProcessState.KilledByProcess */);
        }
        this._onProcessExit.fire(exitCode);
    }
    _setProcessState(state) {
        this.processState = state;
        this._onProcessStateChange.fire();
    }
    _onEnvironmentVariableCollectionChange(newCollection) {
        const diff = this._extEnvironmentVariableCollection.diff(newCollection, { workspaceFolder: this._cwdWorkspaceFolder });
        if (diff === undefined) {
            // If there are no longer differences, remove the stale info indicator
            if (this.environmentVariableInfo instanceof EnvironmentVariableInfoStale) {
                this.environmentVariableInfo = this._instantiationService.createInstance(EnvironmentVariableInfoChangesActive, this._extEnvironmentVariableCollection);
                this._onEnvironmentVariableInfoChange.fire(this.environmentVariableInfo);
            }
            return;
        }
        this.environmentVariableInfo = this._instantiationService.createInstance(EnvironmentVariableInfoStale, diff, this._instanceId, newCollection);
        this._onEnvironmentVariableInfoChange.fire(this.environmentVariableInfo);
    }
    async clearBuffer() {
        this._process?.clearBuffer?.();
    }
};
TerminalProcessManager = __decorate([
    __param(4, IHistoryService),
    __param(5, IInstantiationService),
    __param(6, ITerminalLogService),
    __param(7, IWorkspaceContextService),
    __param(8, IConfigurationResolverService),
    __param(9, IWorkbenchEnvironmentService),
    __param(10, IProductService),
    __param(11, IRemoteAgentService),
    __param(12, IPathService),
    __param(13, IEnvironmentVariableService),
    __param(14, ITerminalConfigurationService),
    __param(15, ITerminalProfileResolverService),
    __param(16, IConfigurationService),
    __param(17, ITerminalInstanceService),
    __param(18, ITelemetryService),
    __param(19, INotificationService),
    __param(20, IAccessibilityService),
    __param(21, ITerminalService)
], TerminalProcessManager);
export { TerminalProcessManager };
class AckDataBufferer {
    constructor(_callback) {
        this._callback = _callback;
        this._unsentCharCount = 0;
    }
    ack(charCount) {
        this._unsentCharCount += charCount;
        while (this._unsentCharCount > 5000 /* FlowControlConstants.CharCountAckSize */) {
            this._unsentCharCount -= 5000 /* FlowControlConstants.CharCountAckSize */;
            this._callback(5000 /* FlowControlConstants.CharCountAckSize */);
        }
    }
}
var SeamlessRelaunchConstants;
(function (SeamlessRelaunchConstants) {
    /**
     * How long to record data events for new terminals.
     */
    SeamlessRelaunchConstants[SeamlessRelaunchConstants["RecordTerminalDuration"] = 10000] = "RecordTerminalDuration";
    /**
     * The maximum duration after a relaunch occurs to trigger a swap.
     */
    SeamlessRelaunchConstants[SeamlessRelaunchConstants["SwapWaitMaximumDuration"] = 3000] = "SwapWaitMaximumDuration";
})(SeamlessRelaunchConstants || (SeamlessRelaunchConstants = {}));
/**
 * Filters data events from the process and supports seamlessly restarting swapping out the process
 * with another, delaying the swap in output in order to minimize flickering/clearing of the
 * terminal.
 */
let SeamlessRelaunchDataFilter = class SeamlessRelaunchDataFilter extends Disposable {
    get onProcessData() { return this._onProcessData.event; }
    constructor(_logService) {
        super();
        this._logService = _logService;
        this._firstDisposable = this._register(new MutableDisposable());
        this._secondDisposable = this._register(new MutableDisposable());
        this._dataListener = this._register(new MutableDisposable());
        this._disableSeamlessRelaunch = false;
        this._onProcessData = this._register(new Emitter());
    }
    newProcess(process, reset) {
        // Stop listening to the old process and trigger delayed shutdown (for hang issue #71966)
        this._dataListener.clear();
        this._activeProcess?.shutdown(false);
        this._activeProcess = process;
        // Start firing events immediately if:
        // - there's no recorder, which means it's a new terminal
        // - this is not a reset, so seamless relaunch isn't necessary
        // - seamless relaunch is disabled because the terminal has accepted input
        if (!this._firstRecorder || !reset || this._disableSeamlessRelaunch) {
            [this._firstRecorder, this._firstDisposable.value] = this._createRecorder(process);
            if (this._disableSeamlessRelaunch && reset) {
                this._onProcessData.fire('\x1bc');
            }
            this._dataListener.value = process.onProcessData(e => this._onProcessData.fire(e));
            this._disableSeamlessRelaunch = false;
            return;
        }
        // Trigger a swap if there was a recent relaunch
        if (this._secondRecorder) {
            this.triggerSwap();
        }
        this._swapTimeout = mainWindow.setTimeout(() => this.triggerSwap(), 3000 /* SeamlessRelaunchConstants.SwapWaitMaximumDuration */);
        // Pause all outgoing data events
        this._dataListener.clear();
        this._firstDisposable.clear();
        const recorder = this._createRecorder(process);
        [this._secondRecorder, this._secondDisposable.value] = recorder;
    }
    /**
     * Disables seamless relaunch for the active process
     */
    disableSeamlessRelaunch() {
        this._disableSeamlessRelaunch = true;
        this._stopRecording();
        this.triggerSwap();
    }
    /**
     * Trigger the swap of the processes if needed (eg. timeout, input)
     */
    triggerSwap() {
        // Clear the swap timeout if it exists
        if (this._swapTimeout) {
            mainWindow.clearTimeout(this._swapTimeout);
            this._swapTimeout = undefined;
        }
        // Do nothing if there's nothing being recorder
        if (!this._firstRecorder) {
            return;
        }
        // Clear the first recorder if no second process was attached before the swap trigger
        if (!this._secondRecorder) {
            this._firstRecorder = undefined;
            this._firstDisposable.clear();
            return;
        }
        // Generate data for each recorder
        const firstData = this._getDataFromRecorder(this._firstRecorder);
        const secondData = this._getDataFromRecorder(this._secondRecorder);
        // Re-write the terminal if the data differs
        if (firstData === secondData) {
            this._logService.trace(`Seamless terminal relaunch - identical content`);
        }
        else {
            this._logService.trace(`Seamless terminal relaunch - resetting content`);
            // Fire full reset (RIS) followed by the new data so the update happens in the same frame
            this._onProcessData.fire({ data: `\x1bc${secondData}`, trackCommit: false });
        }
        // Set up the new data listener
        this._dataListener.value = this._activeProcess.onProcessData(e => this._onProcessData.fire(e));
        // Replace first recorder with second
        this._firstRecorder = this._secondRecorder;
        this._firstDisposable.value = this._secondDisposable.value;
        this._secondRecorder = undefined;
    }
    _stopRecording() {
        // Continue recording if a swap is coming
        if (this._swapTimeout) {
            return;
        }
        // Stop recording
        this._firstRecorder = undefined;
        this._firstDisposable.clear();
        this._secondRecorder = undefined;
        this._secondDisposable.clear();
    }
    _createRecorder(process) {
        const recorder = new TerminalRecorder(0, 0);
        const disposable = process.onProcessData(e => recorder.handleData(isString(e) ? e : e.data));
        return [recorder, disposable];
    }
    _getDataFromRecorder(recorder) {
        return recorder.generateReplayEventSync().events.filter(e => !!e.data).map(e => e.data).join('');
    }
};
SeamlessRelaunchDataFilter = __decorate([
    __param(0, ITerminalLogService)
], SeamlessRelaunchDataFilter);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxQcm9jZXNzTWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxQcm9jZXNzTWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFlLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pILE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQXVCLFdBQVcsRUFBRSxTQUFTLEVBQW1CLEVBQUUsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXZILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNuRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFdkYsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDL0gsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sOEVBQThFLENBQUM7QUFDdkgsT0FBTyxFQUFvUixtQkFBbUIsRUFBbUUsTUFBTSxr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