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
import { Emitter } from '../../../base/common/event.js';
import { MainContext } from './extHost.protocol.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../base/common/uri.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { DisposableStore, Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { Disposable as VSCodeDisposable, EnvironmentVariableMutatorType } from './extHostTypes.js';
import { localize } from '../../../nls.js';
import { NotSupportedError } from '../../../base/common/errors.js';
import { serializeEnvironmentDescriptionMap, serializeEnvironmentVariableCollection } from '../../../platform/terminal/common/environmentVariableShared.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { TerminalDataBufferer } from '../../../platform/terminal/common/terminalDataBuffering.js';
import { ThemeColor } from '../../../base/common/themables.js';
import { Promises } from '../../../base/common/async.js';
import { TerminalCompletionList, TerminalQuickFix, ViewColumn } from './extHostTypeConverters.js';
import { IExtHostCommands } from './extHostCommands.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { isWindows } from '../../../base/common/platform.js';
import { hasKey } from '../../../base/common/types.js';
import { isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
export const IExtHostTerminalService = createDecorator('IExtHostTerminalService');
export class ExtHostTerminal extends Disposable {
    constructor(_proxy, _id, _creationOptions, _name) {
        super();
        this._proxy = _proxy;
        this._id = _id;
        this._creationOptions = _creationOptions;
        this._name = _name;
        this._disposed = false;
        this._state = { isInteractedWith: false, shell: undefined };
        this.isOpen = false;
        this._onWillDispose = this._register(new Emitter());
        this.onWillDispose = this._onWillDispose.event;
        this._creationOptions = Object.freeze(this._creationOptions);
        this._pidPromise = new Promise(c => this._pidPromiseComplete = c);
        const that = this;
        this.value = {
            get name() {
                return that._name || '';
            },
            get processId() {
                return that._pidPromise;
            },
            get creationOptions() {
                return that._creationOptions;
            },
            get exitStatus() {
                return that._exitStatus;
            },
            get state() {
                return that._state;
            },
            get selection() {
                return that._selection;
            },
            get shellIntegration() {
                return that.shellIntegration;
            },
            sendText(text, shouldExecute = true) {
                that._checkDisposed();
                that._proxy.$sendText(that._id, text, shouldExecute);
            },
            show(preserveFocus) {
                that._checkDisposed();
                that._proxy.$show(that._id, preserveFocus);
            },
            hide() {
                that._checkDisposed();
                that._proxy.$hide(that._id);
            },
            dispose() {
                if (!that._disposed) {
                    that._disposed = true;
                    that._proxy.$dispose(that._id);
                }
            },
            get dimensions() {
                if (that._cols === undefined || that._rows === undefined) {
                    return undefined;
                }
                return {
                    columns: that._cols,
                    rows: that._rows
                };
            }
        };
    }
    dispose() {
        this._onWillDispose.fire();
        super.dispose();
    }
    async create(options, internalOptions) {
        if (typeof this._id !== 'string') {
            throw new Error('Terminal has already been created');
        }
        await this._proxy.$createTerminal(this._id, {
            name: options.name,
            shellPath: options.shellPath ?? undefined,
            shellArgs: options.shellArgs ?? undefined,
            cwd: options.cwd ?? internalOptions?.cwd ?? undefined,
            env: options.env ?? undefined,
            icon: asTerminalIcon(options.iconPath) ?? undefined,
            color: ThemeColor.isThemeColor(options.color) ? options.color.id : undefined,
            initialText: options.message ?? undefined,
            strictEnv: options.strictEnv ?? undefined,
            hideFromUser: options.hideFromUser ?? undefined,
            forceShellIntegration: internalOptions?.forceShellIntegration ?? undefined,
            isFeatureTerminal: internalOptions?.isFeatureTerminal ?? undefined,
            isExtensionOwnedTerminal: true,
            useShellEnvironment: internalOptions?.useShellEnvironment ?? undefined,
            location: internalOptions?.location || this._serializeParentTerminal(options.location, internalOptions?.resolvedExtHostIdentifier),
            isTransient: options.isTransient ?? undefined,
            shellIntegrationNonce: options.shellIntegrationNonce ?? undefined,
            titleTemplate: options.titleTemplate ?? undefined,
        });
    }
    async createExtensionTerminal(location, internalOptions, parentTerminal, iconPath, color, shellIntegrationNonce, titleTemplate) {
        if (typeof this._id !== 'string') {
            throw new Error('Terminal has already been created');
        }
        await this._proxy.$createTerminal(this._id, {
            name: this._name,
            isExtensionCustomPtyTerminal: true,
            icon: iconPath,
            color: ThemeColor.isThemeColor(color) ? color.id : undefined,
            location: internalOptions?.location || this._serializeParentTerminal(location, parentTerminal),
            isTransient: true,
            shellIntegrationNonce: shellIntegrationNonce ?? undefined,
            titleTemplate: titleTemplate ?? undefined,
        });
        // At this point, the id has been set via `$acceptTerminalOpened`
        if (typeof this._id === 'string') {
            throw new Error('Terminal creation failed');
        }
        return this._id;
    }
    _serializeParentTerminal(location, parentTerminal) {
        if (typeof location === 'object') {
            if (hasKey(location, { parentTerminal: true }) && location.parentTerminal && parentTerminal) {
                return { parentTerminal };
            }
            if (hasKey(location, { viewColumn: true })) {
                return { viewColumn: ViewColumn.from(location.viewColumn), preserveFocus: location.preserveFocus };
            }
            return undefined;
        }
        return location;
    }
    _checkDisposed() {
        if (this._disposed) {
            throw new Error('Terminal has already been disposed');
        }
    }
    set name(name) {
        this._name = name;
    }
    setExitStatus(code, reason) {
        this._exitStatus = Object.freeze({ code, reason });
    }
    setDimensions(cols, rows) {
        if (cols === this._cols && rows === this._rows) {
            // Nothing changed
            return false;
        }
        if (cols === 0 || rows === 0) {
            return false;
        }
        this._cols = cols;
        this._rows = rows;
        return true;
    }
    setInteractedWith() {
        if (!this._state.isInteractedWith) {
            this._state = {
                ...this._state,
                isInteractedWith: true
            };
            return true;
        }
        return false;
    }
    setShellType(shellType) {
        if (this._state.shell !== shellType) {
            this._state = {
                ...this._state,
                shell: shellType
            };
            return true;
        }
        return false;
    }
    setSelection(selection) {
        this._selection = selection;
    }
    _setProcessId(processId) {
        // The event may fire 2 times when the panel is restored
        if (this._pidPromiseComplete) {
            this._pidPromiseComplete(processId);
            this._pidPromiseComplete = undefined;
        }
        else {
            // Recreate the promise if this is the nth processId set (e.g. reused task terminals)
            this._pidPromise.then(pid => {
                if (pid !== processId) {
                    this._pidPromise = Promise.resolve(processId);
                }
            });
        }
    }
}
class ExtHostPseudoterminal {
    get onProcessReady() { return this._onProcessReady.event; }
    constructor(_pty) {
        this._pty = _pty;
        this.id = 0;
        this.shouldPersist = false;
        this._onProcessData = new Emitter();
        this.onProcessData = this._onProcessData.event;
        this._onProcessReady = new Emitter();
        this._onDidChangeProperty = new Emitter();
        this.onDidChangeProperty = this._onDidChangeProperty.event;
        this._onProcessExit = new Emitter();
        this.onProcessExit = this._onProcessExit.event;
    }
    refreshProperty(property) {
        throw new Error(`refreshProperty is not suppported in extension owned terminals. property: ${property}`);
    }
    updateProperty(property, value) {
        throw new Error(`updateProperty is not suppported in extension owned terminals. property: ${property}, value: ${value}`);
    }
    async start() {
        return undefined;
    }
    shutdown() {
        this._pty.close();
    }
    input(data) {
        this._pty.handleInput?.(data);
    }
    sendSignal(signal) {
        // Extension owned terminals don't support sending signals directly to processes
        // This could be extended in the future if the pseudoterminal API is enhanced
    }
    resize(cols, rows) {
        this._pty.setDimensions?.({ columns: cols, rows });
    }
    clearBuffer() {
        // no-op
    }
    async processBinary(data) {
        // No-op, processBinary is not supported in extension owned terminals.
    }
    acknowledgeDataEvent(charCount) {
        // No-op, flow control is not supported in extension owned terminals. If this is ever
        // implemented it will need new pause and resume VS Code APIs.
    }
    async setUnicodeVersion(version) {
        // No-op, xterm-headless isn't used for extension owned terminals.
    }
    getInitialCwd() {
        return Promise.resolve('');
    }
    getCwd() {
        return Promise.resolve('');
    }
    startSendingEvents(initialDimensions) {
        // Attach the listeners
        this._pty.onDidWrite(e => this._onProcessData.fire(e));
        this._pty.onDidClose?.((e = undefined) => {
            this._onProcessExit.fire(e === void 0 ? undefined : e);
        });
        this._pty.onDidOverrideDimensions?.(e => {
            if (e) {
                this._onDidChangeProperty.fire({ type: "overrideDimensions" /* ProcessPropertyType.OverrideDimensions */, value: { cols: e.columns, rows: e.rows } });
            }
        });
        this._pty.onDidChangeName?.(title => {
            this._onDidChangeProperty.fire({ type: "title" /* ProcessPropertyType.Title */, value: title });
        });
        this._pty.open(initialDimensions ? initialDimensions : undefined);
        if (initialDimensions) {
            this._pty.setDimensions?.(initialDimensions);
        }
        this._onProcessReady.fire({ pid: -1, cwd: '', windowsPty: undefined });
    }
}
let nextLinkId = 1;
let BaseExtHostTerminalService = class BaseExtHostTerminalService extends Disposable {
    get activeTerminal() { return this._activeTerminal?.value; }
    get terminals() { return this._terminals.map(term => term.value); }
    constructor(supportsProcesses, _extHostCommands, extHostRpc) {
        super();
        this._extHostCommands = _extHostCommands;
        this._terminals = [];
        this._terminalProcesses = new Map();
        this._terminalProcessDisposables = {};
        this._extensionTerminalAwaitingStart = {};
        this._getTerminalPromises = {};
        this._environmentVariableCollections = new Map();
        this._lastQuickFixCommands = this._register(new MutableDisposable());
        this._linkProviders = new Set();
        this._completionProviders = new Map();
        this._profileProviders = new Map();
        this._quickFixProviders = new Map();
        this._terminalLinkCache = new Map();
        this._terminalLinkCancellationSource = new Map();
        this._onDidCloseTerminal = new Emitter();
        this.onDidCloseTerminal = this._onDidCloseTerminal.event;
        this._onDidOpenTerminal = new Emitter();
        this.onDidOpenTerminal = this._onDidOpenTerminal.event;
        this._onDidChangeActiveTerminal = new Emitter();
        this.onDidChangeActiveTerminal = this._onDidChangeActiveTerminal.event;
        this._onDidChangeTerminalDimensions = new Emitter();
        this.onDidChangeTerminalDimensions = this._onDidChangeTerminalDimensions.event;
        this._onDidChangeTerminalState = new Emitter();
        this.onDidChangeTerminalState = this._onDidChangeTerminalState.event;
        this._onDidChangeShell = new Emitter();
        this.onDidChangeShell = this._onDidChangeShell.event;
        this._onDidWriteTerminalData = new Emitter({
            onWillAddFirstListener: () => this._proxy.$startSendingDataEvents(),
            onDidRemoveLastListener: () => this._proxy.$stopSendingDataEvents()
        });
        this.onDidWriteTerminalData = this._onDidWriteTerminalData.event;
        this._onDidExecuteCommand = new Emitter({
            onWillAddFirstListener: () => this._proxy.$startSendingCommandEvents(),
            onDidRemoveLastListener: () => this._proxy.$stopSendingCommandEvents()
        });
        this.onDidExecuteTerminalCommand = this._onDidExecuteCommand.event;
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadTerminalService);
        this._bufferer = new TerminalDataBufferer(this._proxy.$sendProcessData);
        this._proxy.$registerProcessSupport(supportsProcesses);
        this._extHostCommands.registerArgumentProcessor({
            processArgument: arg => {
                const deserialize = (arg) => {
                    return this.getTerminalById(arg.instanceId)?.value;
                };
                switch (arg?.$mid) {
                    case 15 /* MarshalledId.TerminalContext */: return deserialize(arg);
                    default: {
                        // Do array transformation in place as this is a hot path
                        if (Array.isArray(arg)) {
                            for (let i = 0; i < arg.length; i++) {
                                if (arg[i].$mid === 15 /* MarshalledId.TerminalContext */) {
                                    arg[i] = deserialize(arg[i]);
                                }
                                else {
                                    // Probably something else, so exit early
                                    break;
                                }
                            }
                        }
                        return arg;
                    }
                }
            }
        });
        this._register({
            dispose: () => {
                for (const [_, terminalProcess] of this._terminalProcesses) {
                    terminalProcess.shutdown(true);
                }
            }
        });
    }
    getDefaultShell(useAutomationShell) {
        const profile = useAutomationShell ? this._defaultAutomationProfile : this._defaultProfile;
        return profile?.path || '';
    }
    getDefaultShellArgs(useAutomationShell) {
        const profile = useAutomationShell ? this._defaultAutomationProfile : this._defaultProfile;
        return profile?.args || [];
    }
    createExtensionTerminal(options, internalOptions) {
        const terminal = new ExtHostTerminal(this._proxy, generateUuid(), options, options.name);
        const p = new ExtHostPseudoterminal(options.pty);
        terminal.createExtensionTerminal(options.location, internalOptions, this._serializeParentTerminal(options, internalOptions).resolvedExtHostIdentifier, asTerminalIcon(options.iconPath), asTerminalColor(options.color), options.shellIntegrationNonce, options.titleTemplate).then(id => {
            const disposable = this._setupExtHostProcessListeners(id, p);
            this._terminalProcessDisposables[id] = disposable;
        });
        this._terminals.push(terminal);
        return terminal.value;
    }
    _serializeParentTerminal(options, internalOptions) {
        internalOptions = internalOptions ? internalOptions : {};
        if (options.location && typeof options.location === 'object' && hasKey(options.location, { parentTerminal: true })) {
            const parentTerminal = options.location.parentTerminal;
            if (parentTerminal) {
                const parentExtHostTerminal = this._terminals.find(t => t.value === parentTerminal);
                if (parentExtHostTerminal) {
                    internalOptions.resolvedExtHostIdentifier = parentExtHostTerminal._id;
                }
            }
        }
        else if (options.location && typeof options.location !== 'object') {
            internalOptions.location = options.location;
        }
        else if (internalOptions.location && typeof internalOptions.location === 'object' && hasKey(internalOptions.location, { splitActiveTerminal: true })) {
            internalOptions.location = { splitActiveTerminal: true };
        }
        return internalOptions;
    }
    attachPtyToTerminal(id, pty) {
        const terminal = this.getTerminalById(id);
        if (!terminal) {
            throw new Error(`Cannot resolve terminal with id ${id} for virtual process`);
        }
        const p = new ExtHostPseudoterminal(pty);
        const disposable = this._setupExtHostProcessListeners(id, p);
        this._terminalProcessDisposables[id] = disposable;
    }
    async $acceptActiveTerminalChanged(id) {
        const original = this._activeTerminal;
        if (id === null) {
            this._activeTerminal = undefined;
            if (original !== this._activeTerminal) {
                this._onDidChangeActiveTerminal.fire(this._activeTerminal);
            }
            return;
        }
        const terminal = this.getTerminalById(id);
        if (terminal) {
            this._activeTerminal = terminal;
            if (original !== this._activeTerminal) {
                this._onDidChangeActiveTerminal.fire(this._activeTerminal.value);
            }
        }
    }
    async $acceptTerminalProcessData(id, data) {
        const terminal = this.getTerminalById(id);
        if (terminal) {
            this._onDidWriteTerminalData.fire({ terminal: terminal.value, data });
        }
    }
    async $acceptTerminalDimensions(id, cols, rows) {
        const terminal = this.getTerminalById(id);
        if (terminal) {
            if (terminal.setDimensions(cols, rows)) {
                this._onDidChangeTerminalDimensions.fire({
                    terminal: terminal.value,
                    dimensions: terminal.value.dimensions
                });
            }
        }
    }
    async $acceptDidExecuteCommand(id, command) {
        const terminal = this.getTerminalById(id);
        if (terminal) {
            this._onDidExecuteCommand.fire({ terminal: terminal.value, ...command });
        }
    }
    async $acceptTerminalMaximumDimensions(id, cols, rows) {
        // Extension pty terminal only - when virtual process resize fires it means that the
        // terminal's maximum dimensions changed
        this._terminalProcesses.get(id)?.resize(cols, rows);
    }
    async $acceptTerminalTitleChange(id, name) {
        const terminal = this.getTerminalById(id);
        if (terminal) {
            terminal.name = name;
        }
    }
    async $acceptTerminalClosed(id, exitCode, exitReason) {
        const index = this._getTerminalObjectIndexById(this._terminals, id);
        if (index !== null) {
            const terminal = this._terminals.splice(index, 1)[0];
            terminal.setExitStatus(exitCode, exitReason);
            this._onDidCloseTerminal.fire(terminal.value);
        }
    }
    $acceptTerminalOpened(id, extHostTerminalId, name, shellLaunchConfigDto) {
        if (extHostTerminalId) {
            // Resolve with the renderer generated id
            const index = this._getTerminalObjectIndexById(this._terminals, extHostTerminalId);
            if (index !== null) {
                // The terminal has already been created (via createTerminal*), only fire the event
                this._terminals[index]._id = id;
                this._onDidOpenTerminal.fire(this.terminals[index]);
                this._terminals[index].isOpen = true;
                return;
            }
        }
        const creationOptions = {
            name: shellLaunchConfigDto.name,
            shellPath: shellLaunchConfigDto.executable,
            shellArgs: shellLaunchConfigDto.args,
            cwd: typeof shellLaunchConfigDto.cwd === 'string' ? shellLaunchConfigDto.cwd : URI.revive(shellLaunchConfigDto.cwd),
            env: shellLaunchConfigDto.env,
            hideFromUser: shellLaunchConfigDto.hideFromUser,
            titleTemplate: shellLaunchConfigDto.titleTemplate
        };
        const terminal = new ExtHostTerminal(this._proxy, id, creationOptions, name);
        this._terminals.push(terminal);
        this._onDidOpenTerminal.fire(terminal.value);
        terminal.isOpen = true;
    }
    async $acceptTerminalProcessId(id, processId) {
        const terminal = this.getTerminalById(id);
        terminal?._setProcessId(processId);
    }
    async $startExtensionTerminal(id, initialDimensions) {
        // Make sure the ExtHostTerminal exists so onDidOpenTerminal has fired before we call
        // Pseudoterminal.start
        const terminal = this.getTerminalById(id);
        if (!terminal) {
            return { message: localize('launchFail.idMissingOnExtHost', "Could not find the terminal with id {0} on the extension host", id) };
        }
        // Wait for onDidOpenTerminal to fire
        if (!terminal.isOpen) {
            await new Promise(r => {
                // Ensure open is called after onDidOpenTerminal
                const listener = this.onDidOpenTerminal(async (e) => {
                    if (e === terminal.value) {
                        listener.dispose();
                        r();
                    }
                });
            });
        }
        const terminalProcess = this._terminalProcesses.get(id);
        if (terminalProcess) {
            terminalProcess.startSendingEvents(initialDimensions);
        }
        else {
            // Defer startSendingEvents call to when _setupExtHostProcessListeners is called
            this._extensionTerminalAwaitingStart[id] = { initialDimensions };
        }
        return undefined;
    }
    _setupExtHostProcessListeners(id, p) {
        const disposables = new DisposableStore();
        disposables.add(p.onProcessReady(e => this._proxy.$sendProcessReady(id, e.pid, e.cwd, e.windowsPty)));
        disposables.add(p.onDidChangeProperty(property => this._proxy.$sendProcessProperty(id, property)));
        // Buffer data events to reduce the amount of messages going to the renderer
        this._bufferer.startBuffering(id, p.onProcessData);
        disposables.add(p.onProcessExit(exitCode => this._onProcessExit(id, exitCode)));
        this._terminalProcesses.set(id, p);
        const awaitingStart = this._extensionTerminalAwaitingStart[id];
        if (awaitingStart && p instanceof ExtHostPseudoterminal) {
            p.startSendingEvents(awaitingStart.initialDimensions);
            delete this._extensionTerminalAwaitingStart[id];
        }
        return disposables;
    }
    $acceptProcessAckDataEvent(id, charCount) {
        this._terminalProcesses.get(id)?.acknowledgeDataEvent(charCount);
    }
    $acceptProcessInput(id, data) {
        this._terminalProcesses.get(id)?.input(data);
    }
    $acceptTerminalInteraction(id) {
        const terminal = this.getTerminalById(id);
        if (terminal?.setInteractedWith()) {
            this._onDidChangeTerminalState.fire(terminal.value);
        }
    }
    $acceptTerminalSelection(id, selection) {
        this.getTerminalById(id)?.setSelection(selection);
    }
    $acceptProcessResize(id, cols, rows) {
        try {
            this._terminalProcesses.get(id)?.resize(cols, rows);
        }
        catch (error) {
            // We tried to write to a closed pipe / channel.
            if (error.code !== 'EPIPE' && error.code !== 'ERR_IPC_CHANNEL_CLOSED') {
                throw (error);
            }
        }
    }
    $acceptProcessShutdown(id, immediate) {
        this._terminalProcesses.get(id)?.shutdown(immediate);
    }
    $acceptProcessRequestInitialCwd(id) {
        this._terminalProcesses.get(id)?.getInitialCwd().then(initialCwd => this._proxy.$sendProcessProperty(id, { type: "initialCwd" /* ProcessPropertyType.InitialCwd */, value: initialCwd }));
    }
    $acceptProcessRequestCwd(id) {
        this._terminalProcesses.get(id)?.getCwd().then(cwd => this._proxy.$sendProcessProperty(id, { type: "cwd" /* ProcessPropertyType.Cwd */, value: cwd }));
    }
    $acceptProcessRequestLatency(id) {
        return Promise.resolve(id);
    }
    registerProfileProvider(extension, id, provider) {
        if (this._profileProviders.has(id)) {
            throw new Error(`Terminal profile provider "${id}" already registered`);
        }
        this._profileProviders.set(id, { provider, extension });
        this._proxy.$registerProfileProvider(id, extension.identifier.value);
        return new VSCodeDisposable(() => {
            this._profileProviders.delete(id);
            this._proxy.$unregisterProfileProvider(id);
        });
    }
    registerTerminalCompletionProvider(extension, provider, ...triggerCharacters) {
        if (this._completionProviders.has(extension.identifier.value)) {
            throw new Error(`Terminal completion provider "${extension.identifier.value}" already registered`);
        }
        this._completionProviders.set(extension.identifier.value, provider);
        this._proxy.$registerCompletionProvider(extension.identifier.value, extension.identifier.value, ...triggerCharacters);
        return new VSCodeDisposable(() => {
            this._completionProviders.delete(extension.identifier.value);
            this._proxy.$unregisterCompletionProvider(extension.identifier.value);
        });
    }
    async $provideTerminalCompletions(id, options) {
        const token = new CancellationTokenSource().token;
        if (token.isCancellationRequested || !this.activeTerminal) {
            return undefined;
        }
        const provider = this._completionProviders.get(id);
        if (!provider) {
            return;
        }
        const completions = await provider.provideTerminalCompletions(this.activeTerminal, options, token);
        if (completions === null || completions === undefined) {
            return undefined;
        }
        const pathSeparator = !isWindows || this.activeTerminal.state?.shell === "gitbash" /* WindowsShellType.GitBash */ ? '/' : '\\';
        return TerminalCompletionList.from(completions, pathSeparator);
    }
    $acceptTerminalShellType(id, shellType) {
        const terminal = this.getTerminalById(id);
        if (terminal?.setShellType(shellType)) {
            this._onDidChangeTerminalState.fire(terminal.value);
        }
    }
    registerTerminalQuickFixProvider(id, extensionId, provider) {
        if (this._quickFixProviders.has(id)) {
            throw new Error(`Terminal quick fix provider "${id}" is already registered`);
        }
        this._quickFixProviders.set(id, provider);
        this._proxy.$registerQuickFixProvider(id, extensionId);
        return new VSCodeDisposable(() => {
            this._quickFixProviders.delete(id);
            this._proxy.$unregisterQuickFixProvider(id);
        });
    }
    async $provideTerminalQuickFixes(id, matchResult) {
        const token = new CancellationTokenSource().token;
        if (token.isCancellationRequested) {
            return;
        }
        const provider = this._quickFixProviders.get(id);
        if (!provider) {
            return;
        }
        const quickFixes = await provider.provideTerminalQuickFixes(matchResult, token);
        if (quickFixes === null || (Array.isArray(quickFixes) && quickFixes.length === 0)) {
            return undefined;
        }
        const store = new DisposableStore();
        this._lastQuickFixCommands.value = store;
        // Single
        if (!Array.isArray(quickFixes)) {
            return quickFixes ? TerminalQuickFix.from(quickFixes, this._extHostCommands.converter, store) : undefined;
        }
        // Many
        const result = [];
        for (const fix of quickFixes) {
            const converted = TerminalQuickFix.from(fix, this._extHostCommands.converter, store);
            if (converted) {
                result.push(converted);
            }
        }
        return result;
    }
    async $createContributedProfileTerminal(id, options) {
        const token = new CancellationTokenSource().token;
        const profileProviderData = this._profileProviders.get(id);
        if (!profileProviderData) {
            throw new Error(`No terminal profile provider registered for id "${id}"`);
        }
        let profile = await profileProviderData.provider.provideTerminalProfile(token);
        if (token.isCancellationRequested) {
            return;
        }
        if (profile && !hasKey(profile, { options: true })) {
            profile = { options: profile };
        }
        if (!profile || !hasKey(profile, { options: true })) {
            throw new Error(`No terminal profile options provided for id "${id}"`);
        }
        const hasTerminalTitleProposal = isProposedApiEnabled(profileProviderData.extension, 'terminalTitle');
        if (!hasTerminalTitleProposal && profile.options.titleTemplate !== undefined) {
            console.error(`[${profileProviderData.extension.identifier.value}] \`titleTemplate\` returned from TerminalProfileProvider is ignored because the \`terminalTitle\` proposed API is not enabled.`);
            profile = { options: { ...profile.options, titleTemplate: undefined } };
        }
        // options.titleTemplate is not explicitly stripped here because the profileOptions
        // assignment below only applies it when hasTerminalTitleProposal is true.
        if (!hasTerminalTitleProposal && options.titleTemplate !== undefined) {
            console.error(`[${profileProviderData.extension.identifier.value}] \`titleTemplate\` passed to createContributedTerminalProfile is ignored because the \`terminalTitle\` proposed API is not enabled.`);
        }
        const profileOptions = hasTerminalTitleProposal && options.titleTemplate && !profile.options.titleTemplate
            ? { ...profile.options, titleTemplate: options.titleTemplate }
            : profile.options;
        if (hasKey(profileOptions, { pty: true })) {
            this.createExtensionTerminal(profileOptions, options);
            return;
        }
        this.createTerminalFromOptions(profileOptions, options);
    }
    registerLinkProvider(provider) {
        this._linkProviders.add(provider);
        if (this._linkProviders.size === 1) {
            this._proxy.$startLinkProvider();
        }
        return new VSCodeDisposable(() => {
            this._linkProviders.delete(provider);
            if (this._linkProviders.size === 0) {
                this._proxy.$stopLinkProvider();
            }
        });
    }
    async $provideLinks(terminalId, line) {
        const terminal = this.getTerminalById(terminalId);
        if (!terminal) {
            return [];
        }
        // Discard any cached links the terminal has been holding, currently all links are released
        // when new links are provided.
        this._terminalLinkCache.delete(terminalId);
        const oldToken = this._terminalLinkCancellationSource.get(terminalId);
        oldToken?.dispose(true);
        const cancellationSource = new CancellationTokenSource();
        this._terminalLinkCancellationSource.set(terminalId, cancellationSource);
        const result = [];
        const context = { terminal: terminal.value, line };
        const promises = [];
        for (const provider of this._linkProviders) {
            promises.push(Promises.withAsyncBody(async (r) => {
                cancellationSource.token.onCancellationRequested(() => r({ provider, links: [] }));
                const links = (await provider.provideTerminalLinks(context, cancellationSource.token)) || [];
                if (!cancellationSource.token.isCancellationRequested) {
                    r({ provider, links });
                }
            }));
        }
        const provideResults = await Promise.all(promises);
        if (cancellationSource.token.isCancellationRequested) {
            return [];
        }
        const cacheLinkMap = new Map();
        for (const provideResult of provideResults) {
            if (provideResult && provideResult.links.length > 0) {
                result.push(...provideResult.links.map(providerLink => {
                    const link = {
                        id: nextLinkId++,
                        startIndex: providerLink.startIndex,
                        length: providerLink.length,
                        label: providerLink.tooltip
                    };
                    cacheLinkMap.set(link.id, {
                        provider: provideResult.provider,
                        link: providerLink
                    });
                    return link;
                }));
            }
        }
        this._terminalLinkCache.set(terminalId, cacheLinkMap);
        return result;
    }
    $activateLink(terminalId, linkId) {
        const cachedLink = this._terminalLinkCache.get(terminalId)?.get(linkId);
        if (!cachedLink) {
            return;
        }
        cachedLink.provider.handleTerminalLink(cachedLink.link);
    }
    _onProcessExit(id, exitCode) {
        this._bufferer.stopBuffering(id);
        // Remove process reference
        this._terminalProcesses.delete(id);
        delete this._extensionTerminalAwaitingStart[id];
        // Clean up process disposables
        const processDiposable = this._terminalProcessDisposables[id];
        if (processDiposable) {
            processDiposable.dispose();
            delete this._terminalProcessDisposables[id];
        }
        // Send exit event to main side
        this._proxy.$sendProcessExit(id, exitCode);
    }
    getTerminalById(id) {
        return this._getTerminalObjectById(this._terminals, id);
    }
    getTerminalIdByApiObject(terminal) {
        const index = this._terminals.findIndex(item => {
            return item.value === terminal;
        });
        return index >= 0 ? index : null;
    }
    _getTerminalObjectById(array, id) {
        const index = this._getTerminalObjectIndexById(array, id);
        return index !== null ? array[index] : null;
    }
    _getTerminalObjectIndexById(array, id) {
        const index = array.findIndex(item => {
            return item._id === id;
        });
        return index >= 0 ? index : null;
    }
    getEnvironmentVariableCollection(extension) {
        let collection = this._environmentVariableCollections.get(extension.identifier.value);
        if (!collection) {
            collection = this._register(new UnifiedEnvironmentVariableCollection());
            this._setEnvironmentVariableCollection(extension.identifier.value, collection);
        }
        return collection.getScopedEnvironmentVariableCollection(undefined);
    }
    _syncEnvironmentVariableCollection(extensionIdentifier, collection) {
        const serialized = serializeEnvironmentVariableCollection(collection.map);
        const serializedDescription = serializeEnvironmentDescriptionMap(collection.descriptionMap);
        this._proxy.$setEnvironmentVariableCollection(extensionIdentifier, collection.persistent, serialized.length === 0 ? undefined : serialized, serializedDescription);
    }
    $initEnvironmentVariableCollections(collections) {
        collections.forEach(entry => {
            const extensionIdentifier = entry[0];
            const collection = this._register(new UnifiedEnvironmentVariableCollection(entry[1]));
            this._setEnvironmentVariableCollection(extensionIdentifier, collection);
        });
    }
    $acceptDefaultProfile(profile, automationProfile) {
        const oldProfile = this._defaultProfile;
        this._defaultProfile = profile;
        this._defaultAutomationProfile = automationProfile;
        if (oldProfile?.path !== profile.path) {
            this._onDidChangeShell.fire(profile.path);
        }
    }
    _setEnvironmentVariableCollection(extensionIdentifier, collection) {
        this._environmentVariableCollections.set(extensionIdentifier, collection);
        this._register(collection.onDidChangeCollection(() => {
            // When any collection value changes send this immediately, this is done to ensure
            // following calls to createTerminal will be created with the new environment. It will
            // result in more noise by sending multiple updates when called but collections are
            // expected to be small.
            this._syncEnvironmentVariableCollection(extensionIdentifier, collection);
        }));
    }
};
BaseExtHostTerminalService = __decorate([
    __param(1, IExtHostCommands),
    __param(2, IExtHostRpcService)
], BaseExtHostTerminalService);
export { BaseExtHostTerminalService };
/**
 * Unified environment variable collection carrying information for all scopes, for a specific extension.
 */
class UnifiedEnvironmentVariableCollection extends Disposable {
    get persistent() { return this._persistent; }
    set persistent(value) {
        this._persistent = value;
        this._onDidChangeCollection.fire();
    }
    get onDidChangeCollection() { return this._onDidChangeCollection && this._onDidChangeCollection.event; }
    constructor(serialized) {
        super();
        this.map = new Map();
        this.scopedCollections = new Map();
        this.descriptionMap = new Map();
        this._persistent = true;
        this._onDidChangeCollection = this._register(new Emitter());
        this.map = new Map(serialized);
    }
    getScopedEnvironmentVariableCollection(scope) {
        const scopedCollectionKey = this.getScopeKey(scope);
        let scopedCollection = this.scopedCollections.get(scopedCollectionKey);
        if (!scopedCollection) {
            scopedCollection = new ScopedEnvironmentVariableCollection(this, scope);
            this.scopedCollections.set(scopedCollectionKey, scopedCollection);
            this._register(scopedCollection.onDidChangeCollection(() => this._onDidChangeCollection.fire()));
        }
        return scopedCollection;
    }
    replace(variable, value, options, scope) {
        this._setIfDiffers(variable, { value, type: EnvironmentVariableMutatorType.Replace, options: options ?? { applyAtProcessCreation: true }, scope });
    }
    append(variable, value, options, scope) {
        this._setIfDiffers(variable, { value, type: EnvironmentVariableMutatorType.Append, options: options ?? { applyAtProcessCreation: true }, scope });
    }
    prepend(variable, value, options, scope) {
        this._setIfDiffers(variable, { value, type: EnvironmentVariableMutatorType.Prepend, options: options ?? { applyAtProcessCreation: true }, scope });
    }
    _setIfDiffers(variable, mutator) {
        if (mutator.options && mutator.options.applyAtProcessCreation === false && !mutator.options.applyAtShellIntegration) {
            throw new Error('EnvironmentVariableMutatorOptions must apply at either process creation or shell integration');
        }
        const key = this.getKey(variable, mutator.scope);
        const current = this.map.get(key);
        const newOptions = mutator.options ? {
            applyAtProcessCreation: mutator.options.applyAtProcessCreation ?? false,
            applyAtShellIntegration: mutator.options.applyAtShellIntegration ?? false,
        } : {
            applyAtProcessCreation: true
        };
        if (!current ||
            current.value !== mutator.value ||
            current.type !== mutator.type ||
            current.options?.applyAtProcessCreation !== newOptions.applyAtProcessCreation ||
            current.options?.applyAtShellIntegration !== newOptions.applyAtShellIntegration ||
            current.scope?.workspaceFolder?.index !== mutator.scope?.workspaceFolder?.index) {
            const key = this.getKey(variable, mutator.scope);
            const value = {
                variable,
                ...mutator,
                options: newOptions
            };
            this.map.set(key, value);
            this._onDidChangeCollection.fire();
        }
    }
    get(variable, scope) {
        const key = this.getKey(variable, scope);
        const value = this.map.get(key);
        // TODO: Set options to defaults if needed
        return value ? convertMutator(value) : undefined;
    }
    getKey(variable, scope) {
        const scopeKey = this.getScopeKey(scope);
        return scopeKey.length ? `${variable}:::${scopeKey}` : variable;
    }
    getScopeKey(scope) {
        return this.getWorkspaceKey(scope?.workspaceFolder) ?? '';
    }
    getWorkspaceKey(workspaceFolder) {
        return workspaceFolder ? workspaceFolder.uri.toString() : undefined;
    }
    getVariableMap(scope) {
        const map = new Map();
        for (const [_, value] of this.map) {
            if (this.getScopeKey(value.scope) === this.getScopeKey(scope)) {
                map.set(value.variable, convertMutator(value));
            }
        }
        return map;
    }
    delete(variable, scope) {
        const key = this.getKey(variable, scope);
        this.map.delete(key);
        this._onDidChangeCollection.fire();
    }
    clear(scope) {
        if (scope?.workspaceFolder) {
            for (const [key, mutator] of this.map) {
                if (mutator.scope?.workspaceFolder?.index === scope.workspaceFolder.index) {
                    this.map.delete(key);
                }
            }
            this.clearDescription(scope);
        }
        else {
            this.map.clear();
            this.descriptionMap.clear();
        }
        this._onDidChangeCollection.fire();
    }
    setDescription(description, scope) {
        const key = this.getScopeKey(scope);
        const current = this.descriptionMap.get(key);
        if (!current || current.description !== description) {
            let descriptionStr;
            if (typeof description === 'string') {
                descriptionStr = description;
            }
            else {
                // Only take the description before the first `\n\n`, so that the description doesn't mess up the UI
                descriptionStr = description?.value.split('\n\n')[0];
            }
            const value = { description: descriptionStr, scope };
            this.descriptionMap.set(key, value);
            this._onDidChangeCollection.fire();
        }
    }
    getDescription(scope) {
        const key = this.getScopeKey(scope);
        return this.descriptionMap.get(key)?.description;
    }
    clearDescription(scope) {
        const key = this.getScopeKey(scope);
        this.descriptionMap.delete(key);
    }
}
class ScopedEnvironmentVariableCollection {
    get persistent() { return this.collection.persistent; }
    set persistent(value) {
        this.collection.persistent = value;
    }
    get onDidChangeCollection() { return this._onDidChangeCollection && this._onDidChangeCollection.event; }
    constructor(collection, scope) {
        this.collection = collection;
        this.scope = scope;
        this._onDidChangeCollection = new Emitter();
    }
    getScoped(scope) {
        return this.collection.getScopedEnvironmentVariableCollection(scope);
    }
    replace(variable, value, options) {
        this.collection.replace(variable, value, options, this.scope);
    }
    append(variable, value, options) {
        this.collection.append(variable, value, options, this.scope);
    }
    prepend(variable, value, options) {
        this.collection.prepend(variable, value, options, this.scope);
    }
    get(variable) {
        return this.collection.get(variable, this.scope);
    }
    forEach(callback, thisArg) {
        this.collection.getVariableMap(this.scope).forEach((value, variable) => callback.call(thisArg, variable, value, this), this.scope);
    }
    [Symbol.iterator]() {
        return this.collection.getVariableMap(this.scope).entries();
    }
    delete(variable) {
        this.collection.delete(variable, this.scope);
        this._onDidChangeCollection.fire(undefined);
    }
    clear() {
        this.collection.clear(this.scope);
    }
    set description(description) {
        this.collection.setDescription(description, this.scope);
    }
    get description() {
        return this.collection.getDescription(this.scope);
    }
}
let WorkerExtHostTerminalService = class WorkerExtHostTerminalService extends BaseExtHostTerminalService {
    constructor(extHostCommands, extHostRpc, initData) {
        super(false, extHostCommands, extHostRpc);
        this._hasRemoteAuthority = !!initData.remote.authority;
    }
    createTerminal(name, shellPath, shellArgs) {
        if (!this._hasRemoteAuthority) {
            throw new NotSupportedError();
        }
        return this.createTerminalFromOptions({ name, shellPath, shellArgs });
    }
    createTerminalFromOptions(options, internalOptions) {
        if (!this._hasRemoteAuthority) {
            throw new NotSupportedError();
        }
        const terminal = new ExtHostTerminal(this._proxy, generateUuid(), options, options.name);
        this._terminals.push(terminal);
        terminal.create(options, this._serializeParentTerminal(options, internalOptions));
        return terminal.value;
    }
};
WorkerExtHostTerminalService = __decorate([
    __param(0, IExtHostCommands),
    __param(1, IExtHostRpcService),
    __param(2, IExtHostInitDataService)
], WorkerExtHostTerminalService);
export { WorkerExtHostTerminalService };
function asTerminalIcon(iconPath) {
    if (!iconPath || typeof iconPath === 'string') {
        return undefined;
    }
    if (!hasKey(iconPath, { id: true })) {
        return iconPath;
    }
    return {
        id: iconPath.id,
        color: iconPath.color
    };
}
function asTerminalColor(color) {
    return ThemeColor.isThemeColor(color) ? color : undefined;
}
function convertMutator(mutator) {
    const newMutator = { ...mutator };
    delete newMutator.scope;
    newMutator.options = newMutator.options ?? undefined;
    return newMutator;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRlcm1pbmFsU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUZXJtaW5hbFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFTLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBK0IsV0FBVyxFQUFtUyxNQUFNLHVCQUF1QixDQUFDO0FBQ2xYLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDNUQsT0FBTyxFQUFlLGVBQWUsRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoSCxPQUFPLEVBQUUsVUFBVSxJQUFJLGdCQUFnQixFQUFFLDhCQUE4QixFQUE4QyxNQUFNLG1CQUFtQixDQUFDO0FBRS9JLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsc0NBQXNDLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUM1SixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFHNUQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFB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