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
import { execFile, exec } from 'child_process';
import { AutoOpenBarrier, ProcessTimeRunOnceScheduler, Promises, Queue, timeout } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { isWindows, OS } from '../../../base/common/platform.js';
import { getSystemShell } from '../../../base/node/shell.js';
import { LogLevel } from '../../log/common/log.js';
import { RequestStore } from '../common/requestStore.js';
import { TitleEventSource } from '../common/terminal.js';
import { TerminalDataBufferer } from '../common/terminalDataBuffering.js';
import { escapeNonWindowsPath } from '../common/terminalEnvironment.js';
import { sanitizeEnvForLogging } from './terminalEnvironment.js';
import { TerminalProcess } from './terminalProcess.js';
import { localize } from '../../../nls.js';
import { ignoreProcessNames } from './childProcessMonitor.js';
import { ErrorNoTelemetry } from '../../../base/common/errors.js';
import { ShellIntegrationAddon } from '../common/xterm/shellIntegrationAddon.js';
import { formatMessageForTerminal } from '../common/terminalStrings.js';
import { join } from '../../../base/common/path.js';
import { memoize } from '../../../base/common/decorators.js';
import * as performance from '../../../base/common/performance.js';
import pkg from '@xterm/headless';
import { AutoRepliesPtyServiceContribution } from './terminalContrib/autoReplies/autoRepliesContribController.js';
import { hasKey, isFunction, isNumber, isString } from '../../../base/common/types.js';
import { getWindowsBuildNumberAsync } from '../../../base/node/windowsVersion.js';
const { Terminal: XtermTerminal } = pkg;
/**
 * Sanitizes arguments for logging, specifically handling env objects in createProcess calls.
 */
function sanitizeArgsForLogging(fnName, args) {
    // createProcess signature: shellLaunchConfig, cwd, cols, rows, unicodeVersion, env (index 5), executableEnv (index 6), ...
    if (fnName === 'createProcess' && args.length > 5) {
        const sanitizedArgs = [...args];
        if (args[5] && typeof args[5] === 'object') {
            sanitizedArgs[5] = sanitizeEnvForLogging(args[5]);
        }
        if (args[6] && typeof args[6] === 'object') {
            sanitizedArgs[6] = sanitizeEnvForLogging(args[6]);
        }
        return sanitizedArgs;
    }
    return args;
}
export function traceRpc(_target, key, descriptor) {
    if (!isFunction(descriptor.value)) {
        throw new Error('not supported');
    }
    const fnKey = 'value';
    const fn = descriptor.value;
    descriptor[fnKey] = async function (...args) {
        if (this.traceRpcArgs.logService.getLevel() === LogLevel.Trace) {
            const sanitizedArgs = sanitizeArgsForLogging(fn.name, args);
            this.traceRpcArgs.logService.trace(`[RPC Request] PtyService#${fn.name}(${sanitizedArgs.map(e => JSON.stringify(e)).join(', ')})`);
        }
        if (this.traceRpcArgs.simulatedLatency) {
            await timeout(this.traceRpcArgs.simulatedLatency);
        }
        let result;
        try {
            result = await fn.apply(this, args);
        }
        catch (e) {
            this.traceRpcArgs.logService.error(`[RPC Response] PtyService#${fn.name}`, e);
            throw e;
        }
        if (this.traceRpcArgs.logService.getLevel() === LogLevel.Trace) {
            this.traceRpcArgs.logService.trace(`[RPC Response] PtyService#${fn.name}`, result);
        }
        return result;
    };
}
let SerializeAddon;
let Unicode11Addon;
export class PtyService extends Disposable {
    async installAutoReply(match, reply) {
        await this._autoRepliesContribution.installAutoReply(match, reply);
    }
    async uninstallAllAutoReplies() {
        await this._autoRepliesContribution.uninstallAllAutoReplies();
    }
    _traceEvent(name, event) {
        event(e => {
            if (this._logService.getLevel() === LogLevel.Trace) {
                this._logService.trace(`[RPC Event] PtyService#${name}.fire(${JSON.stringify(e)})`);
            }
        });
        return event;
    }
    get traceRpcArgs() {
        return {
            logService: this._logService,
            simulatedLatency: this._simulatedLatency
        };
    }
    constructor(_logService, _productService, _reconnectConstants, _simulatedLatency) {
        super();
        this._logService = _logService;
        this._productService = _productService;
        this._reconnectConstants = _reconnectConstants;
        this._simulatedLatency = _simulatedLatency;
        this._ptys = new Map();
        this._workspaceLayoutInfos = new Map();
        this._revivedPtyIdMap = new Map();
        this._lastPtyId = 0;
        this._onHeartbeat = this._register(new Emitter());
        this.onHeartbeat = this._traceEvent('_onHeartbeat', this._onHeartbeat.event);
        this._onProcessData = this._register(new Emitter());
        this.onProcessData = this._traceEvent('_onProcessData', this._onProcessData.event);
        this._onProcessReplay = this._register(new Emitter());
        this.onProcessReplay = this._traceEvent('_onProcessReplay', this._onProcessReplay.event);
        this._onProcessReady = this._register(new Emitter());
        this.onProcessReady = this._traceEvent('_onProcessReady', this._onProcessReady.event);
        this._onProcessExit = this._register(new Emitter());
        this.onProcessExit = this._traceEvent('_onProcessExit', this._onProcessExit.event);
        this._onProcessOrphanQuestion = this._register(new Emitter());
        this.onProcessOrphanQuestion = this._traceEvent('_onProcessOrphanQuestion', this._onProcessOrphanQuestion.event);
        this._onDidRequestDetach = this._register(new Emitter());
        this.onDidRequestDetach = this._traceEvent('_onDidRequestDetach', this._onDidRequestDetach.event);
        this._onDidChangeProperty = this._register(new Emitter());
        this.onDidChangeProperty = this._traceEvent('_onDidChangeProperty', this._onDidChangeProperty.event);
        this._register(toDisposable(() => {
            for (const pty of this._ptys.values()) {
                pty.shutdown(true);
            }
            this._ptys.clear();
        }));
        this._detachInstanceRequestStore = this._register(new RequestStore(undefined, this._logService));
        this._register(this._detachInstanceRequestStore.onCreateRequest(this._onDidRequestDetach.fire, this._onDidRequestDetach));
        this._autoRepliesContribution = new AutoRepliesPtyServiceContribution(this._logService);
        this._contributions = [this._autoRepliesContribution];
    }
    async refreshIgnoreProcessNames(names) {
        ignoreProcessNames.length = 0;
        ignoreProcessNames.push(...names);
    }
    async requestDetachInstance(workspaceId, instanceId) {
        return this._detachInstanceRequestStore.createRequest({ workspaceId, instanceId });
    }
    async acceptDetachInstanceReply(requestId, persistentProcessId) {
        let processDetails = undefined;
        const pty = this._ptys.get(persistentProcessId);
        if (pty) {
            processDetails = await this._buildProcessDetails(persistentProcessId, pty);
        }
        this._detachInstanceRequestStore.acceptReply(requestId, processDetails);
    }
    async freePortKillProcess(port) {
        const stdout = await new Promise((resolve, reject) => {
            exec(isWindows ? `netstat -ano | findstr "${port}"` : `lsof -nP -iTCP -sTCP:LISTEN | grep ${port}`, {}, (err, stdout) => {
                if (err) {
                    return reject('Problem occurred when listing active processes');
                }
                resolve(stdout);
            });
        });
        const processesForPort = stdout.split(/\r?\n/).filter(s => !!s.trim());
        if (processesForPort.length >= 1) {
            const capturePid = /\s+(\d+)(?:\s+|$)/;
            const processId = processesForPort[0].match(capturePid)?.[1];
            if (processId) {
                try {
                    process.kill(Number.parseInt(processId));
                }
                catch { }
            }
            else {
                throw new Error(`Processes for port ${port} were not found`);
            }
            return { port, processId };
        }
        throw new Error(`Could not kill process with port ${port}`);
    }
    async serializeTerminalState(ids) {
        const promises = [];
        for (const [persistentProcessId, persistentProcess] of this._ptys.entries()) {
            // Only serialize persistent processes that have had data written or performed a replay
            if (persistentProcess.hasWrittenData && ids.indexOf(persistentProcessId) !== -1) {
                promises.push(Promises.withAsyncBody(async (r) => {
                    r({
                        id: persistentProcessId,
                        shellLaunchConfig: persistentProcess.shellLaunchConfig,
                        processDetails: await this._buildProcessDetails(persistentProcessId, persistentProcess),
                        processLaunchConfig: persistentProcess.processLaunchOptions,
                        unicodeVersion: persistentProcess.unicodeVersion,
                        replayEvent: await persistentProcess.serializeNormalBuffer(),
                        timestamp: Date.now()
                    });
                }));
            }
        }
        const serialized = {
            version: 1,
            state: await Promise.all(promises)
        };
        return JSON.stringify(serialized);
    }
    async reviveTerminalProcesses(workspaceId, state, dateTimeFormatLocale) {
        const promises = [];
        for (const terminal of state) {
            promises.push(this._reviveTerminalProcess(workspaceId, terminal));
        }
        await Promise.all(promises);
    }
    async _reviveTerminalProcess(workspaceId, terminal) {
        const restoreMessage = localize('terminal-history-restored', "History restored");
        // Conpty v1.22+ uses passthrough and doesn't reprint the buffer often, this means that when
        // the terminal is revived, the cursor would be at the bottom of the buffer then when
        // PSReadLine requests `GetConsoleCursorInfo` it will be handled by conpty itself by design.
        // This causes the cursor to move to the top into the replayed terminal contents. To avoid
        // this, the post restore message will print new lines to get a clear viewport and put the
        // cursor back at to top left.
        let postRestoreMessage = '';
        if (isWindows) {
            const lastReplayEvent = terminal.replayEvent.events.length > 0 ? terminal.replayEvent.events.at(-1) : undefined;
            if (lastReplayEvent) {
                postRestoreMessage += '\r\n'.repeat(lastReplayEvent.rows - 1) + `\x1b[H`;
            }
        }
        // TODO: We may at some point want to show date information in a hover via a custom sequence:
        //   new Date(terminal.timestamp).toLocaleDateString(dateTimeFormatLocale)
        //   new Date(terminal.timestamp).toLocaleTimeString(dateTimeFormatLocale)
        const newId = await this.createProcess({
            ...terminal.shellLaunchConfig,
            cwd: terminal.processDetails.cwd,
            color: terminal.processDetails.color,
            icon: terminal.processDetails.icon,
            name: terminal.processDetails.titleSource === TitleEventSource.Api ? terminal.processDetails.title : undefined,
            initialText: terminal.replayEvent.events[0].data + formatMessageForTerminal(restoreMessage, { loudFormatting: true }) + postRestoreMessage
        }, terminal.processDetails.cwd, terminal.replayEvent.events[0].cols, terminal.replayEvent.events[0].rows, terminal.unicodeVersion, terminal.processLaunchConfig.env, terminal.processLaunchConfig.executableEnv, terminal.processLaunchConfig.options, true, terminal.processDetails.workspaceId, terminal.processDetails.workspaceName, true, terminal.replayEvent.events[0].data);
        // Don't start the process here as there's no terminal to answer CPR
        const oldId = this._getRevivingProcessId(workspaceId, terminal.id);
        this._revivedPtyIdMap.set(oldId, { newId, state: terminal });
        this._logService.info(`Revived process, old id ${oldId} -> new id ${newId}`);
    }
    async shutdownAll() {
        this.dispose();
    }
    async createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, options, shouldPersist, workspaceId, workspaceName, isReviving, rawReviveBuffer) {
        if (shellLaunchConfig.attachPersistentProcess) {
            throw new Error('Attempt to create a process when attach object was provided');
        }
        const id = ++this._lastPtyId;
        const process = new TerminalProcess(shellLaunchConfig, cwd, cols, rows, env, executableEnv, options, this._logService, this._productService);
        const processLaunchOptions = {
            env,
            executableEnv,
            options
        };
        const persistentProcess = new PersistentTerminalProcess(id, process, workspaceId, workspaceName, shouldPersist, cols, rows, processLaunchOptions, unicodeVersion, this._reconnectConstants, this._logService, isReviving && isString(shellLaunchConfig.initialText) ? shellLaunchConfig.initialText : undefined, rawReviveBuffer, shellLaunchConfig.icon, shellLaunchConfig.color, shellLaunchConfig.name, shellLaunchConfig.fixedDimensions);
        process.onProcessExit(event => {
            for (const contrib of this._contributions) {
                contrib.handleProcessDispose(id);
            }
            persistentProcess.dispose();
            this._ptys.delete(id);
            this._onProcessExit.fire({ id, event });
        });
        persistentProcess.onProcessData(event => this._onProcessData.fire({ id, event }));
        persistentProcess.onProcessReplay(event => this._onProcessReplay.fire({ id, event }));
        persistentProcess.onProcessReady(event => this._onProcessReady.fire({ id, event }));
        persistentProcess.onProcessOrphanQuestion(() => this._onProcessOrphanQuestion.fire({ id }));
        persistentProcess.onDidChangeProperty(property => this._onDidChangeProperty.fire({ id, property }));
        persistentProcess.onPersistentProcessReady(() => {
            for (const contrib of this._contributions) {
                contrib.handleProcessReady(id, process);
            }
        });
        this._ptys.set(id, persistentProcess);
        return id;
    }
    async attachToProcess(id) {
        try {
            await this._throwIfNoPty(id).attach();
            this._logService.info(`Persistent process reconnection "${id}"`);
        }
        catch (e) {
            this._logService.warn(`Persistent process reconnection "${id}" failed`, e.message);
            throw e;
        }
    }
    async updateTitle(id, title, titleSource) {
        this._throwIfNoPty(id).setTitle(title, titleSource);
    }
    async updateIcon(id, userInitiated, icon, color) {
        this._throwIfNoPty(id).setIcon(userInitiated, icon, color);
    }
    async clearBuffer(id) {
        this._throwIfNoPty(id).clearBuffer();
    }
    async refreshProperty(id, type) {
        return this._throwIfNoPty(id).refreshProperty(type);
    }
    async updateProperty(id, type, value) {
        return this._throwIfNoPty(id).updateProperty(type, value);
    }
    async detachFromProcess(id, forcePersist) {
        return this._throwIfNoPty(id).detach(forcePersist);
    }
    async reduceConnectionGraceTime() {
        for (const pty of this._ptys.values()) {
            pty.reduceGraceTime();
        }
    }
    async listProcesses() {
        const persistentProcesses = Array.from(this._ptys.entries()).filter(([_, pty]) => pty.shouldPersistTerminal);
        this._logService.info(`Listing ${persistentProcesses.length} persistent terminals, ${this._ptys.size} total terminals`);
        const promises = persistentProcesses.map(async ([id, terminalProcessData]) => this._buildProcessDetails(id, terminalProcessData));
        const allTerminals = await Promise.all(promises);
        return allTerminals.filter(entry => entry.isOrphan);
    }
    async getPerformanceMarks() {
        return performance.getMarks();
    }
    async start(id) {
        const pty = this._ptys.get(id);
        return pty ? pty.start() : { message: `Could not find pty with id "${id}"` };
    }
    async shutdown(id, immediate) {
        // Don't throw if the pty is already shutdown
        return this._ptys.get(id)?.shutdown(immediate);
    }
    async input(id, data) {
        const pty = this._throwIfNoPty(id);
        if (pty) {
            for (const contrib of this._contributions) {
                contrib.handleProcessInput(id, data);
            }
            pty.input(data);
        }
    }
    async sendSignal(id, signal) {
        return this._throwIfNoPty(id).sendSignal(signal);
    }
    async processBinary(id, data) {
        return this._throwIfNoPty(id).writeBinary(data);
    }
    async resize(id, cols, rows, pixelWidth, pixelHeight) {
        const pty = this._throwIfNoPty(id);
        if (pty) {
            for (const contrib of this._contributions) {
                contrib.handleProcessResize(id, cols, rows, pixelWidth, pixelHeight);
            }
            pty.resize(cols, rows, pixelWidth, pixelHeight);
        }
    }
    async getInitialCwd(id) {
        return this._throwIfNoPty(id).getInitialCwd();
    }
    async getCwd(id) {
        return this._throwIfNoPty(id).getCwd();
    }
    async acknowledgeDataEvent(id, charCount) {
        return this._throwIfNoPty(id).acknowledgeDataEvent(charCount);
    }
    async setUnicodeVersion(id, version) {
        return this._throwIfNoPty(id).setUnicodeVersion(version);
    }
    async setNextCommandId(id, commandLine, commandId) {
        return this._throwIfNoPty(id).setNextCommandId(commandLine, commandId);
    }
    async getLatency() {
        return [];
    }
    async orphanQuestionReply(id) {
        return this._throwIfNoPty(id).orphanQuestionReply();
    }
    async getDefaultSystemShell(osOverride = OS) {
        return getSystemShell(osOverride, process.env);
    }
    async getEnvironment() {
        return { ...process.env };
    }
    async getWslPath(original, direction) {
        if (direction === 'win-to-unix') {
            if (!isWindows) {
                return original;
            }
            if (await getWindowsBuildNumberAsync() < 17063) {
                return original.replace(/\\/g, '/');
            }
            const wslExecutable = await this._getWSLExecutablePath();
            if (!wslExecutable) {
                return original;
            }
            return new Promise(c => {
                const proc = execFile(wslExecutable, ['-e', 'wslpath', original], {}, (error, stdout, stderr) => {
                    c(error ? original : escapeNonWindowsPath(stdout.trim(), "bash" /* PosixShellType.Bash */));
                });
                proc.stdin.end();
            });
        }
        if (direction === 'unix-to-win') {
            // The backend is Windows, for example a local Windows workspace with a wsl session in
            // the terminal.
            if (isWindows) {
                if (await getWindowsBuildNumberAsync() < 17063) {
                    return original;
                }
                const wslExecutable = await this._getWSLExecutablePath();
                if (!wslExecutable) {
                    return original;
                }
                return new Promise(c => {
                    const proc = execFile(wslExecutable, ['-e', 'wslpath', '-w', original], {}, (error, stdout, stderr) => {
                        c(error ? original : stdout.trim());
                    });
                    proc.stdin.end();
                });
            }
        }
        // Fallback just in case
        return original;
    }
    async _getWSLExecutablePath() {
        const useWSLexe = await getWindowsBuildNumberAsync() >= 16299;
        const is32ProcessOn64Windows = process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
        const systemRoot = process.env['SystemRoot'];
        if (systemRoot) {
            return join(systemRoot, is32ProcessOn64Windows ? 'Sysnative' : 'System32', useWSLexe ? 'wsl.exe' : 'bash.exe');
        }
        return undefined;
    }
    async getRevivedPtyNewId(workspaceId, id) {
        try {
            return this._revivedPtyIdMap.get(this._getRevivingProcessId(workspaceId, id))?.newId;
        }
        catch (e) {
            this._logService.warn(`Couldn't find terminal ID ${workspaceId}-${id}`, e.message);
        }
        return undefined;
    }
    async setTerminalLayoutInfo(args) {
        this._workspaceLayoutInfos.set(args.workspaceId, args);
    }
    async getTerminalLayoutInfo(args) {
        performance.mark('code/willGetTerminalLayoutInfo');
        const layout = this._workspaceLayoutInfos.get(args.workspaceId);
        if (layout) {
            const doneSet = new Set();
            const expandedTabs = await Promise.all(layout.tabs.map(async (tab) => this._expandTerminalTab(args.workspaceId, tab, doneSet)));
            const tabs = expandedTabs.filter(t => t.terminals.length > 0);
            const expandedBackground = (await Promise.all(layout.background?.map(b => this._expandTerminalInstance(args.workspaceId, b, doneSet)) ?? [])).filter(b => b.terminal !== null).map(b => b.terminal);
            performance.mark('code/didGetTerminalLayoutInfo');
            return { tabs, background: expandedBackground };
        }
        performance.mark('code/didGetTerminalLayoutInfo');
        return undefined;
    }
    async _expandTerminalTab(workspaceId, tab, doneSet) {
        const expandedTerminals = (await Promise.all(tab.terminals.map(t => this._expandTerminalInstance(workspaceId, t, doneSet))));
        const filtered = expandedTerminals.filter(term => term.terminal !== null);
        return {
            isActive: tab.isActive,
            activePersistentProcessId: tab.activePersistentProcessId,
            terminals: filtered
        };
    }
    async _expandTerminalInstance(workspaceId, t, doneSet) {
        const hasLayout = !isNumber(t);
        const ptyId = hasLayout ? t.terminal : t;
        try {
            const oldId = this._getRevivingProcessId(workspaceId, ptyId);
            const revivedPtyId = this._revivedPtyIdMap.get(oldId)?.newId;
            this._logService.info(`Expanding terminal instance, old id ${oldId} -> new id ${revivedPtyId}`);
            this._revivedPtyIdMap.delete(oldId);
            const persistentProcessId = revivedPtyId ?? ptyId;
            if (doneSet.has(persistentProcessId)) {
                throw new Error(`Terminal ${persistentProcessId} has already been expanded`);
            }
            doneSet.add(persistentProcessId);
            const persistentProcess = this._throwIfNoPty(persistentProcessId);
            const processDetails = persistentProcess && await this._buildProcessDetails(ptyId, persistentProcess, revivedPtyId !== undefined);
            return {
                terminal: { ...processDetails, id: persistentProcessId },
                relativeSize: hasLayout ? t.relativeSize : 0
            };
        }
        catch (e) {
            this._logService.warn(`Couldn't get layout info, a terminal was probably disconnected`, e.message);
            this._logService.debug('Reattach to wrong terminal debug info - layout info by id', t);
            this._logService.debug('Reattach to wrong terminal debug info - _revivePtyIdMap', Array.from(this._revivedPtyIdMap.values()));
            this._logService.debug('Reattach to wrong terminal debug info - _ptys ids', Array.from(this._ptys.keys()));
            // this will be filtered out and not reconnected
            return {
                terminal: null,
                relativeSize: hasLayout ? t.relativeSize : 0
            };
        }
    }
    _getRevivingProcessId(workspaceId, ptyId) {
        return `${workspaceId}-${ptyId}`;
    }
    async _buildProcessDetails(id, persistentProcess, wasRevived = false) {
        performance.mark(`code/willBuildProcessDetails/${id}`);
        // If the process was just revived, don't do the orphan check as it will
        // take some time
        const [cwd, isOrphan] = await Promise.all([persistentProcess.getCwd(), wasRevived ? true : persistentProcess.isOrphaned()]);
        const result = {
            id,
            title: persistentProcess.title,
            titleSource: persistentProcess.titleSource,
            pid: persistentProcess.pid,
            workspaceId: persistentProcess.workspaceId,
            workspaceName: persistentProcess.workspaceName,
            cwd,
            isOrphan,
            icon: persistentProcess.icon,
            color: persistentProcess.color,
            fixedDimensions: persistentProcess.fixedDimensions,
            environmentVariableCollections: persistentProcess.processLaunchOptions.options.environmentVariableCollections,
            reconnectionProperties: persistentProcess.shellLaunchConfig.reconnectionProperties,
            waitOnExit: persistentProcess.shellLaunchConfig.waitOnExit,
            hideFromUser: persistentProcess.shellLaunchConfig.hideFromUser,
            isFeatureTerminal: persistentProcess.shellLaunchConfig.isFeatureTerminal,
            type: persistentProcess.shellLaunchConfig.type,
            hasChildProcesses: persistentProcess.hasChildProcesses,
            shellIntegrationNonce: persistentProcess.processLaunchOptions.options.shellIntegration.nonce,
            tabActions: persistentProcess.shellLaunchConfig.tabActions
        };
        performance.mark(`code/didBuildProcessDetails/${id}`);
        return result;
    }
    _throwIfNoPty(id) {
        const pty = this._ptys.get(id);
        if (!pty) {
            throw new ErrorNoTelemetry(`Could not find pty ${id} on pty host`);
        }
        return pty;
    }
}
__decorate([
    traceRpc
], PtyService.prototype, "installAutoReply", null);
__decorate([
    traceRpc
], PtyService.prototype, "uninstallAllAutoReplies", null);
__decorate([
    memoize
], PtyService.prototype, "traceRpcArgs", null);
__decorate([
    traceRpc
], PtyService.prototype, "refreshIgnoreProcessNames", null);
__decorate([
    traceRpc
], PtyService.prototype, "requestDetachInstance", null);
__decorate([
    traceRpc
], PtyService.prototype, "acceptDetachInstanceReply", null);
__decorate([
    traceRpc
], PtyService.prototype, "freePortKillProcess", null);
__decorate([
    traceRpc
], PtyService.prototype, "serializeTerminalState", null);
__decorate([
    traceRpc
], PtyService.prototype, "reviveTerminalProcesses", null);
__decorate([
    traceRpc
], PtyService.prototype, "shutdownAll", null);
__decorate([
    traceRpc
], PtyService.prototype, "createProcess", null);
__decorate([
    traceRpc
], PtyService.prototype, "attachToProcess", null);
__decorate([
    traceRpc
], PtyService.prototype, "updateTitle", null);
__decorate([
    traceRpc
], PtyService.prototype, "updateIcon", null);
__decorate([
    traceRpc
], PtyService.prototype, "clearBuffer", null);
__decorate([
    traceRpc
], PtyService.prototype, "refreshProperty", null);
__decorate([
    traceRpc
], PtyService.prototype, "updateProperty", null);
__decorate([
    traceRpc
], PtyService.prototype, "detachFromProcess", null);
__decorate([
    traceRpc
], PtyService.prototype, "reduceConnectionGraceTime", null);
__decorate([
    traceRpc
], PtyService.prototype, "listProcesses", null);
__decorate([
    traceRpc
], PtyService.prototype, "getPerformanceMarks", null);
__decorate([
    traceRpc
], PtyService.prototype, "start", null);
__decorate([
    traceRpc
], PtyService.prototype, "shutdown", null);
__decorate([
    traceRpc
], PtyService.prototype, "input", null);
__decorate([
    traceRpc
], PtyService.prototype, "sendSignal", null);
__decorate([
    traceRpc
], PtyService.prototype, "processBinary", null);
__decorate([
    traceRpc
], PtyService.prototype, "resize", null);
__decorate([
    traceRpc
], PtyService.prototype, "getInitialCwd", null);
__decorate([
    traceRpc
], PtyService.prototype, "getCwd", null);
__decorate([
    traceRpc
], PtyService.prototype, "acknowledgeDataEvent", null);
__decorate([
    traceRpc
], PtyService.prototype, "setUnicodeVersion", null);
__decorate([
    traceRpc
], PtyService.prototype, "setNextCommandId", null);
__decorate([
    traceRpc
], PtyService.prototype, "getLatency", null);
__decorate([
    traceRpc
], PtyService.prototype, "orphanQuestionReply", null);
__decorate([
    traceRpc
], PtyService.prototype, "getDefaultSystemShell", null);
__decorate([
    traceRpc
], PtyService.prototype, "getEnvironment", null);
__decorate([
    traceRpc
], PtyService.prototype, "getWslPath", null);
__decorate([
    traceRpc
], PtyService.prototype, "getRevivedPtyNewId", null);
__decorate([
    traceRpc
], PtyService.prototype, "setTerminalLayoutInfo", null);
__decorate([
    traceRpc
], PtyService.prototype, "getTerminalLayoutInfo", null);
var InteractionState;
(function (InteractionState) {
    /** The terminal has not been interacted with. */
    InteractionState["None"] = "None";
    /** The terminal has only been interacted with by the replay mechanism. */
    InteractionState["ReplayOnly"] = "ReplayOnly";
    /** The terminal has been directly interacted with this session. */
    InteractionState["Session"] = "Session";
})(InteractionState || (InteractionState = {}));
class PersistentTerminalProcess extends Disposable {
    get pid() { return this._pid; }
    get shellLaunchConfig() { return this._terminalProcess.shellLaunchConfig; }
    get hasWrittenData() { return this._interactionState.value !== "None" /* InteractionState.None */; }
    get title() { return this._title || this._terminalProcess.currentTitle; }
    get titleSource() { return this._titleSource; }
    get icon() { return this._icon; }
    get color() { return this._color; }
    get fixedDimensions() { return this._fixedDimensions; }
    get hasChildProcesses() { return this._terminalProcess.hasChildProcesses; }
    setTitle(title, titleSource) {
        if (titleSource === TitleEventSource.Api) {
            this._interactionState.setValue("Session" /* InteractionState.Session */, 'setTitle');
            this._serializer.freeRawReviveBuffer();
        }
        this._title = title;
        this._titleSource = titleSource;
    }
    setIcon(userInitiated, icon, color) {
        if (!this._icon || hasKey(icon, { id: true }) && hasKey(this._icon, { id: true }) && icon.id !== this._icon.id ||
            !this.color || color !== this._color) {
            this._serializer.freeRawReviveBuffer();
            if (userInitiated) {
                this._interactionState.setValue("Session" /* InteractionState.Session */, 'setIcon');
            }
        }
        this._icon = icon;
        this._color = color;
    }
    _setFixedDimensions(fixedDimensions) {
        this._fixedDimensions = fixedDimensions;
    }
    constructor(_persistentProcessId, _terminalProcess, workspaceId, workspaceName, shouldPersistTerminal, cols, rows, processLaunchOptions, unicodeVersion, reconnectConstants, _logService, reviveBuffer, rawReviveBuffer, _icon, _color, name, fixedDimensions) {
        super();
        this._persistentProcessId = _persistentProcessId;
        this._terminalProcess = _terminalProcess;
        this.workspaceId = workspaceId;
        this.workspaceName = workspaceName;
        this.shouldPersistTerminal = shouldPersistTerminal;
        this.processLaunchOptions = processLaunchOptions;
        this.unicodeVersion = unicodeVersion;
        this._logService = _logService;
        this._icon = _icon;
        this._color = _color;
        this._pendingCommands = new Map();
        this._isStarted = false;
        this._orphanRequestQueue = new Queue();
        this._onProcessReplay = this._register(new Emitter());
        this.onProcessReplay = this._onProcessReplay.event;
        this._onProcessReady = this._register(new Emitter());
        this.onProcessReady = this._onProcessReady.event;
        this._onPersistentProcessReady = this._register(new Emitter());
        /** Fired when the persistent process has a ready process and has finished its replay. */
        this.onPersistentProcessReady = this._onPersistentProcessReady.event;
        this._onProcessData = this._register(new Emitter());
        this.onProcessData = this._onProcessData.event;
        this._onProcessOrphanQuestion = this._register(new Emitter());
        this.onProcessOrphanQuestion = this._onProcessOrphanQuestion.event;
        this._onDidChangeProperty = this._register(new Emitter());
        this.onDidChangeProperty = this._onDidChangeProperty.event;
        this._inReplay = false;
        this._pid = -1;
        this._cwd = '';
        this._titleSource = TitleEventSource.Process;
        this._interactionState = new MutationLogger(`Persistent process "${this._persistentProcessId}" interaction state`, "None" /* InteractionState.None */, this._logService);
        this._wasRevived = reviveBuffer !== undefined;
        this._serializer = new XtermSerializer(cols, rows, reconnectConstants.scrollback, unicodeVersion, reviveBuffer, processLaunchOptions.options.shellIntegration.nonce, shouldPersistTerminal ? rawReviveBuffer : undefined, this._logService);
        if (name) {
            this.setTitle(name, TitleEventSource.Api);
        }
        this._fixedDimensions = fixedDimensions;
        this._orphanQuestionBarrier = null;
        this._orphanQuestionReplyTime = 0;
        this._disconnectRunner1 = this._register(new ProcessTimeRunOnceScheduler(() => {
            this._logService.info(`Persistent process "${this._persistentProcessId}": The reconnection grace time of ${printTime(reconnectConstants.graceTime)} has expired, shutting down pid "${this._pid}"`);
            this.shutdown(true);
        }, reconnectConstants.graceTime));
        this._disconnectRunner2 = this._register(new ProcessTimeRunOnceScheduler(() => {
            this._logService.info(`Persistent process "${this._persistentProcessId}": The short reconnection grace time of ${printTime(reconnectConstants.shortGraceTime)} has expired, shutting down pid ${this._pid}`);
            this.shutdown(true);
        }, reconnectConstants.shortGraceTime));
        this._register(this._terminalProcess.onProcessExit(() => this._bufferer.stopBuffering(this._persistentProcessId)));
        this._register(this._terminalProcess.onProcessReady(e => {
            this._pid = e.pid;
            this._cwd = e.cwd;
            this._onProcessReady.fire(e);
        }));
        this._register(this._terminalProcess.onDidChangeProperty(e => {
            this._onDidChangeProperty.fire(e);
        }));
        // Data buffering to reduce the amount of messages going to the renderer
        this._bufferer = new TerminalDataBufferer((_, data) => this._onProcessData.fire(data));
        this._register(this._bufferer.startBuffering(this._persistentProcessId, this._terminalProcess.onProcessData));
        // Data recording for reconnect
        this._register(this.onProcessData(e => this._serializer.handleData(e)));
    }
    async attach() {
        if (!this._disconnectRunner1.isScheduled() && !this._disconnectRunner2.isScheduled()) {
            this._logService.warn(`Persistent process "${this._persistentProcessId}": Process had no disconnect runners but was an orphan`);
        }
        this._disconnectRunner1.cancel();
        this._disconnectRunner2.cancel();
    }
    async detach(forcePersist) {
        // Keep the process around if it was indicated to persist and it has had some iteraction or
        // was replayed
        if (this.shouldPersistTerminal && (this._interactionState.value !== "None" /* InteractionState.None */ || forcePersist)) {
            this._disconnectRunner1.schedule();
        }
        else {
            this.shutdown(true);
        }
    }
    serializeNormalBuffer() {
        return this._serializer.generateReplayEvent(true, this._interactionState.value !== "Session" /* InteractionState.Session */);
    }
    async refreshProperty(type) {
        return this._terminalProcess.refreshProperty(type);
    }
    async updateProperty(type, value) {
        if (type === "fixedDimensions" /* ProcessPropertyType.FixedDimensions */) {
            return this._setFixedDimensions(value);
        }
    }
    async start() {
        if (!this._isStarted) {
            const result = await this._terminalProcess.start();
            if (result && hasKey(result, { message: true })) {
                // it's a terminal launch error
                return result;
            }
            this._isStarted = true;
            // If the process was revived, trigger a replay on first start. An alternative approach
            // could be to start it on the pty host before attaching but this fails on Windows as
            // conpty's inherit cursor option which is required, ends up sending DSR CPR which
            // causes conhost to hang when no response is received from the terminal (which wouldn't
            // be attached yet). https://github.com/microsoft/terminal/issues/11213
            if (this._wasRevived) {
                this.triggerReplay();
            }
            else {
                this._onPersistentProcessReady.fire();
            }
            return result;
        }
        this._onProcessReady.fire({ pid: this._pid, cwd: this._cwd, windowsPty: this._terminalProcess.getWindowsPty() });
        this._onDidChangeProperty.fire({ type: "title" /* ProcessPropertyType.Title */, value: this._terminalProcess.currentTitle });
        this._onDidChangeProperty.fire({ type: "shellType" /* ProcessPropertyType.ShellType */, value: this._terminalProcess.shellType });
        this.triggerReplay();
        return undefined;
    }
    shutdown(immediate) {
        return this._terminalProcess.shutdown(immediate);
    }
    input(data) {
        this._interactionState.setValue("Session" /* InteractionState.Session */, 'input');
        this._serializer.freeRawReviveBuffer();
        if (this._inReplay) {
            return;
        }
        return this._terminalProcess.input(data);
    }
    sendSignal(signal) {
        if (this._inReplay) {
            return;
        }
        return this._terminalProcess.sendSignal(signal);
    }
    writeBinary(data) {
        return this._terminalProcess.processBinary(data);
    }
    resize(cols, rows, pixelWidth, pixelHeight) {
        if (this._inReplay) {
            return;
        }
        this._serializer.handleResize(cols, rows);
        // Buffered events should flush when a resize occurs
        this._bufferer.flushBuffer(this._persistentProcessId);
        return this._terminalProcess.resize(cols, rows, pixelWidth, pixelHeight);
    }
    async clearBuffer() {
        this._serializer.clearBuffer();
        this._terminalProcess.clearBuffer();
    }
    setUnicodeVersion(version) {
        this.unicodeVersion = version;
        this._serializer.setUnicodeVersion?.(version);
        // TODO: Pass in unicode version in ctor
    }
    async setNextCommandId(commandLine, commandId) {
        this._serializer.setNextCommandId?.(commandLine, commandId);
    }
    acknowledgeDataEvent(charCount) {
        if (this._inReplay) {
            return;
        }
        return this._terminalProcess.acknowledgeDataEvent(charCount);
    }
    getInitialCwd() {
        return this._terminalProcess.getInitialCwd();
    }
    getCwd() {
        return this._terminalProcess.getCwd();
    }
    async triggerReplay() {
        if (this._interactionState.value === "None" /* InteractionState.None */) {
            this._interactionState.setValue("ReplayOnly" /* InteractionState.ReplayOnly */, 'triggerReplay');
        }
        const ev = await this._serializer.generateReplayEvent();
        let dataLength = 0;
        for (const e of ev.events) {
            dataLength += e.data.length;
        }
        this._logService.info(`Persistent process "${this._persistentProcessId}": Replaying ${dataLength} chars and ${ev.events.length} size events`);
        this._onProcessReplay.fire(ev);
        this._terminalProcess.clearUnacknowledgedChars();
        this._onPersistentProcessReady.fire();
    }
    sendCommandResult(reqId, isError, serializedPayload) {
        const data = this._pendingCommands.get(reqId);
        if (!data) {
            return;
        }
        this._pendingCommands.delete(reqId);
    }
    orphanQuestionReply() {
        this._orphanQuestionReplyTime = Date.now();
        if (this._orphanQuestionBarrier) {
            const barrier = this._orphanQuestionBarrier;
            this._orphanQuestionBarrier = null;
            barrier.open();
        }
    }
    reduceGraceTime() {
        if (this._disconnectRunner2.isScheduled()) {
            // we are disconnected and already running the short reconnection timer
            return;
        }
        if (this._disconnectRunner1.isScheduled()) {
            // we are disconnected and running the long reconnection timer
            this._disconnectRunner2.schedule();
        }
    }
    async isOrphaned() {
        return await this._orphanRequestQueue.queue(async () => this._isOrphaned());
    }
    async _isOrphaned() {
        // The process is already known to be orphaned
        if (this._disconnectRunner1.isScheduled() || this._disconnectRunner2.isScheduled()) {
            return true;
        }
        // Ask whether the renderer(s) whether the process is orphaned and await the reply
        if (!this._orphanQuestionBarrier) {
            // the barrier opens after 4 seconds with or without a reply
            this._orphanQuestionBarrier = new AutoOpenBarrier(4000);
            this._orphanQuestionReplyTime = 0;
            this._onProcessOrphanQuestion.fire();
        }
        await this._orphanQuestionBarrier.wait();
        return (Date.now() - this._orphanQuestionReplyTime > 500);
    }
}
class MutationLogger {
    get value() { return this._value; }
    setValue(value, reason) {
        if (this._value !== value) {
            this._value = value;
            this._log(reason);
        }
    }
    constructor(_name, _value, _logService) {
        this._name = _name;
        this._value = _value;
        this._logService = _logService;
        this._log('initialized');
    }
    _log(reason) {
        this._logService.debug(`MutationLogger "${this._name}" set to "${this._value}", reason: ${reason}`);
    }
}
class XtermSerializer {
    constructor(cols, rows, scrollback, unicodeVersion, reviveBufferWithRestoreMessage, shellIntegrationNonce, _rawReviveBuffer, logService) {
        this._rawReviveBuffer = _rawReviveBuffer;
        this._xterm = new XtermTerminal({
            cols,
            rows,
            scrollback,
            allowProposedApi: true
        });
        if (reviveBufferWithRestoreMessage) {
            this._xterm.writeln(reviveBufferWithRestoreMessage);
        }
        this.setUnicodeVersion(unicodeVersion);
        this._shellIntegrationAddon = new ShellIntegrationAddon(shellIntegrationNonce, true, undefined, undefined, logService);
        this._xterm.loadAddon(this._shellIntegrationAddon);
    }
    freeRawReviveBuffer() {
        // Free the memory of the terminal if it will need to be re-serialized
        this._rawReviveBuffer = undefined;
    }
    handleData(data) {
        this._xterm.write(data);
    }
    handleResize(cols, rows) {
        this._xterm.resize(cols, rows);
    }
    clearBuffer() {
        this._xterm.clear();
    }
    setNextCommandId(commandLine, commandId) {
        this._shellIntegrationAddon.setNextCommandId(commandLine, commandId);
    }
    async generateReplayEvent(normalBufferOnly, restoreToLastReviveBuffer) {
        const serialize = new (await this._getSerializeConstructor());
        this._xterm.loadAddon(serialize);
        const options = {
            scrollback: this._xterm.options.scrollback
        };
        if (normalBufferOnly) {
            options.excludeAltBuffer = true;
            options.excludeModes = true;
        }
        let serialized;
        if (restoreToLastReviveBuffer && this._rawReviveBuffer) {
            serialized = this._rawReviveBuffer;
        }
        else {
            serialized = serialize.serialize(options);
        }
        return {
            events: [
                {
                    cols: this._xterm.cols,
                    rows: this._xterm.rows,
                    data: serialized
                }
            ],
            commands: this._shellIntegrationAddon.serialize()
        };
    }
    async setUnicodeVersion(version) {
        if (this._xterm.unicode.activeVersion === version) {
            return;
        }
        if (version === '11') {
            this._unicodeAddon = new (await this._getUnicode11Constructor());
            this._xterm.loadAddon(this._unicodeAddon);
        }
        else {
            this._unicodeAddon?.dispose();
            this._unicodeAddon = undefined;
        }
        this._xterm.unicode.activeVersion = version;
    }
    async _getUnicode11Constructor() {
        if (!Unicode11Addon) {
            Unicode11Addon = (await import('@xterm/addon-unicode11')).Unicode11Addon;
        }
        return Unicode11Addon;
    }
    async _getSerializeConstructor() {
        if (!SerializeAddon) {
            SerializeAddon = (await import('@xterm/addon-serialize')).SerializeAddon;
        }
        return SerializeAddon;
    }
}
function printTime(ms) {
    let h = 0;
    let m = 0;
    let s = 0;
    if (ms >= 1000) {
        s = Math.floor(ms / 1000);
        ms -= s * 1000;
    }
    if (s >= 60) {
        m = Math.floor(s / 60);
        s -= m * 60;
    }
    if (m >= 60) {
        h = Math.floor(m / 60);
        m -= h * 60;
    }
    const _h = h ? `${h}h` : ``;
    const _m = m ? `${m}m` : ``;
    const _s = s ? `${s}s` : ``;
    const _ms = ms ? `${ms}ms` : ``;
    return `${_h}${_m}${_s}${_ms}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHR5U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvcHR5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUMvQyxPQUFPLEVBQUUsZUFBZSxFQUFFLDJCQUEyQixFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdkgsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0UsT0FBTyxFQUF1QixTQUFTLEVBQW1CLEVBQUUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXZHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM3RCxPQUFPLEVBQWUsUUFBUSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDaEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3pELE9BQU8sRUFBd1EsZ0JBQWdCLEVBQXdTLE1BQU0sdUJBQXVCLENBQUM7QUFDcm1CLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBSXhFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN2RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLGtCQUFrQixFQUFF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Q3ZCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ2IsQ0FBQztJQUNELElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDO1FBQ2IsQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ2IsQ0FBQztJQUNELE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQzVCLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQzVCLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQzVCLE1BQU0sR0FBRyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQ2hDLE9BQU8sR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUNoQyxDQUFDIn0=