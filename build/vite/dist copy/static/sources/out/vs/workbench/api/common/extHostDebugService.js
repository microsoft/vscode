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
import { coalesce } from '../../../base/common/arrays.js';
import { asPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable as DisposableCls, toDisposable } from '../../../base/common/lifecycle.js';
import { ThemeIcon as ThemeIconUtils } from '../../../base/common/themables.js';
import { URI } from '../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { AbstractDebugAdapter } from '../../contrib/debug/common/abstractDebugAdapter.js';
import { convertToDAPaths, convertToVSCPaths, isDebuggerMainContribution } from '../../contrib/debug/common/debugUtils.js';
import { MainContext } from './extHost.protocol.js';
import { IExtHostCommands } from './extHostCommands.js';
import { IExtHostConfiguration } from './extHostConfiguration.js';
import { IExtHostEditorTabs } from './extHostEditorTabs.js';
import { IExtHostExtensionService } from './extHostExtensionService.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IExtHostTesting } from './extHostTesting.js';
import * as Convert from './extHostTypeConverters.js';
import { DataBreakpoint, DebugAdapterExecutable, DebugAdapterInlineImplementation, DebugAdapterNamedPipeServer, DebugAdapterServer, DebugConsoleMode, DebugStackFrame, DebugThread, Disposable, FunctionBreakpoint, Location, Position, setBreakpointId, SourceBreakpoint, ThemeIcon } from './extHostTypes.js';
import { IExtHostVariableResolverProvider } from './extHostVariableResolverService.js';
import { IExtHostWorkspace } from './extHostWorkspace.js';
export const IExtHostDebugService = createDecorator('IExtHostDebugService');
let ExtHostDebugServiceBase = class ExtHostDebugServiceBase extends DisposableCls {
    get onDidStartDebugSession() { return this._onDidStartDebugSession.event; }
    get onDidTerminateDebugSession() { return this._onDidTerminateDebugSession.event; }
    get onDidChangeActiveDebugSession() { return this._onDidChangeActiveDebugSession.event; }
    get activeDebugSession() { return this._activeDebugSession?.api; }
    get onDidReceiveDebugSessionCustomEvent() { return this._onDidReceiveDebugSessionCustomEvent.event; }
    get activeDebugConsole() { return this._activeDebugConsole.value; }
    constructor(extHostRpcService, _workspaceService, _extensionService, _configurationService, _editorTabs, _variableResolver, _commands, _testing) {
        super();
        this._workspaceService = _workspaceService;
        this._extensionService = _extensionService;
        this._configurationService = _configurationService;
        this._editorTabs = _editorTabs;
        this._variableResolver = _variableResolver;
        this._commands = _commands;
        this._testing = _testing;
        this._debugSessions = new Map();
        this._debugVisualizationTreeItemIdsCounter = 0;
        this._debugVisualizationProviders = new Map();
        this._debugVisualizationTrees = new Map();
        this._debugVisualizationTreeItemIds = new WeakMap();
        this._debugVisualizationElements = new Map();
        this._visualizers = new Map();
        this._visualizerIdCounter = 0;
        this._configProviderHandleCounter = 0;
        this._configProviders = [];
        this._adapterFactoryHandleCounter = 0;
        this._adapterFactories = [];
        this._trackerFactoryHandleCounter = 0;
        this._trackerFactories = [];
        this._debugAdapters = new Map();
        this._debugAdaptersTrackers = new Map();
        this._onDidStartDebugSession = this._register(new Emitter());
        this._onDidTerminateDebugSession = this._register(new Emitter());
        this._onDidChangeActiveDebugSession = this._register(new Emitter());
        this._onDidReceiveDebugSessionCustomEvent = this._register(new Emitter());
        this._debugServiceProxy = extHostRpcService.getProxy(MainContext.MainThreadDebugService);
        this._onDidChangeBreakpoints = this._register(new Emitter());
        this._onDidChangeActiveStackItem = this._register(new Emitter());
        this._activeDebugConsole = new ExtHostDebugConsole(this._debugServiceProxy);
        this._breakpoints = new Map();
        this._extensionService.getExtensionRegistry().then((extensionRegistry) => {
            this._register(extensionRegistry.onDidChange(_ => {
                this.registerAllDebugTypes(extensionRegistry);
            }));
            this.registerAllDebugTypes(extensionRegistry);
        });
        this._telemetryProxy = extHostRpcService.getProxy(MainContext.MainThreadTelemetry);
    }
    async $getVisualizerTreeItem(treeId, element) {
        const context = this.hydrateVisualizationContext(element);
        if (!context) {
            return undefined;
        }
        const item = await this._debugVisualizationTrees.get(treeId)?.getTreeItem?.(context);
        return item ? this.convertVisualizerTreeItem(treeId, item) : undefined;
    }
    registerDebugVisualizationTree(manifest, id, provider) {
        const extensionId = ExtensionIdentifier.toKey(manifest.identifier);
        const key = this.extensionVisKey(extensionId, id);
        if (this._debugVisualizationProviders.has(key)) {
            throw new Error(`A debug visualization provider with id '${id}' is already registered`);
        }
        this._debugVisualizationTrees.set(key, provider);
        this._debugServiceProxy.$registerDebugVisualizerTree(key, !!provider.editItem);
        return toDisposable(() => {
            this._debugServiceProxy.$unregisterDebugVisualizerTree(key);
            this._debugVisualizationTrees.delete(id);
        });
    }
    async $getVisualizerTreeItemChildren(treeId, element) {
        const item = this._debugVisualizationElements.get(element)?.item;
        if (!item) {
            return [];
        }
        const children = await this._debugVisualizationTrees.get(treeId)?.getChildren?.(item);
        return children?.map(i => this.convertVisualizerTreeItem(treeId, i)) || [];
    }
    async $editVisualizerTreeItem(element, value) {
        const e = this._debugVisualizationElements.get(element);
        if (!e) {
            return undefined;
        }
        const r = await this._debugVisualizationTrees.get(e.provider)?.editItem?.(e.item, value);
        return this.convertVisualizerTreeItem(e.provider, r || e.item);
    }
    $disposeVisualizedTree(element) {
        const root = this._debugVisualizationElements.get(element);
        if (!root) {
            return;
        }
        const queue = [root.children];
        for (const children of queue) {
            if (children) {
                for (const child of children) {
                    queue.push(this._debugVisualizationElements.get(child)?.children);
                    this._debugVisualizationElements.delete(child);
                }
            }
        }
    }
    convertVisualizerTreeItem(treeId, item) {
        let id = this._debugVisualizationTreeItemIds.get(item);
        if (!id) {
            id = this._debugVisualizationTreeItemIdsCounter++;
            this._debugVisualizationTreeItemIds.set(item, id);
            this._debugVisualizationElements.set(id, { provider: treeId, item });
        }
        return Convert.DebugTreeItem.from(item, id);
    }
    asDebugSourceUri(src, session) {
        // eslint-disable-next-line local/code-no-any-casts
        const source = src;
        if (typeof source.sourceReference === 'number' && source.sourceReference > 0) {
            // src can be retrieved via DAP's "source" request
            let debug = `debug:${encodeURIComponent(source.path || '')}`;
            let sep = '?';
            if (session) {
                debug += `${sep}session=${encodeURIComponent(session.id)}`;
                sep = '&';
            }
            debug += `${sep}ref=${source.sourceReference}`;
            return URI.parse(debug);
        }
        else if (source.path) {
            // src is just a local file path
            return URI.file(source.path);
        }
        else {
            throw new Error(`cannot create uri from DAP 'source' object; properties 'path' and 'sourceReference' are both missing.`);
        }
    }
    registerAllDebugTypes(extensionRegistry) {
        const debugTypes = [];
        for (const ed of extensionRegistry.getAllExtensionDescriptions()) {
            if (ed.contributes) {
                const debuggers = ed.contributes['debuggers'];
                if (debuggers && debuggers.length > 0) {
                    for (const dbg of debuggers) {
                        if (isDebuggerMainContribution(dbg)) {
                            debugTypes.push(dbg.type);
                        }
                    }
                }
            }
        }
        this._debugServiceProxy.$registerDebugTypes(debugTypes);
    }
    // extension debug API
    get activeStackItem() {
        return this._activeStackItem;
    }
    get onDidChangeActiveStackItem() {
        return this._onDidChangeActiveStackItem.event;
    }
    get onDidChangeBreakpoints() {
        return this._onDidChangeBreakpoints.event;
    }
    get breakpoints() {
        const result = [];
        this._breakpoints.forEach(bp => result.push(bp));
        return result;
    }
    async $resolveDebugVisualizer(id, token) {
        const visualizer = this._visualizers.get(id);
        if (!visualizer) {
            throw new Error(`No debug visualizer found with id '${id}'`);
        }
        let { v, provider, extensionId } = visualizer;
        if (!v.visualization) {
            v = await provider.resolveDebugVisualization?.(v, token) || v;
            visualizer.v = v;
        }
        if (!v.visualization) {
            throw new Error(`No visualization returned from resolveDebugVisualization in '${provider}'`);
        }
        return this.serializeVisualization(extensionId, v.visualization);
    }
    async $executeDebugVisualizerCommand(id) {
        const visualizer = this._visualizers.get(id);
        if (!visualizer) {
            throw new Error(`No debug visualizer found with id '${id}'`);
        }
        const command = visualizer.v.visualization;
        if (command && 'command' in command) {
            this._commands.executeCommand(command.command, ...(command.arguments || []));
        }
    }
    hydrateVisualizationContext(context) {
        const session = this._debugSessions.get(context.sessionId);
        return session && {
            session: session.api,
            variable: context.variable,
            containerId: context.containerId,
            frameId: context.frameId,
            threadId: context.threadId,
        };
    }
    async $provideDebugVisualizers(extensionId, id, context, token) {
        const contextHydrated = this.hydrateVisualizationContext(context);
        const key = this.extensionVisKey(extensionId, id);
        const provider = this._debugVisualizationProviders.get(key);
        if (!contextHydrated || !provider) {
            return []; // probably ended in the meantime
        }
        const visualizations = await provider.provideDebugVisualization(contextHydrated, token);
        if (!visualizations) {
            return [];
        }
        return visualizations.map(v => {
            const id = ++this._visualizerIdCounter;
            this._visualizers.set(id, { v, provider, extensionId });
            const icon = v.iconPath ? this.getIconPathOrClass(v.iconPath) : undefined;
            return {
                id,
                name: v.name,
                iconClass: icon?.iconClass,
                iconPath: icon?.iconPath,
                visualization: this.serializeVisualization(extensionId, v.visualization),
            };
        });
    }
    $disposeDebugVisualizers(ids) {
        for (const id of ids) {
            this._visualizers.delete(id);
        }
    }
    registerDebugVisualizationProvider(manifest, id, provider) {
        if (!manifest.contributes?.debugVisualizers?.some(r => r.id === id)) {
            throw new Error(`Extensions may only call registerDebugVisualizationProvider() for renderers they contribute (got ${id})`);
        }
        const extensionId = ExtensionIdentifier.toKey(manifest.identifier);
        const key = this.extensionVisKey(extensionId, id);
        if (this._debugVisualizationProviders.has(key)) {
            throw new Error(`A debug visualization provider with id '${id}' is already registered`);
        }
        this._debugVisualizationProviders.set(key, provider);
        this._debugServiceProxy.$registerDebugVisualizer(extensionId, id);
        return toDisposable(() => {
            this._debugServiceProxy.$unregisterDebugVisualizer(extensionId, id);
            this._debugVisualizationProviders.delete(id);
        });
    }
    addBreakpoints(breakpoints0) {
        // filter only new breakpoints
        const breakpoints = breakpoints0.filter(bp => {
            const id = bp.id;
            if (!this._breakpoints.has(id)) {
                this._breakpoints.set(id, bp);
                return true;
            }
            return false;
        });
        // send notification for added breakpoints
        this.fireBreakpointChanges(breakpoints, [], []);
        // convert added breakpoints to DTOs
        const dtos = [];
        const map = new Map();
        for (const bp of breakpoints) {
            if (bp instanceof SourceBreakpoint) {
                let dto = map.get(bp.location.uri.toString());
                if (!dto) {
                    dto = {
                        type: 'sourceMulti',
                        uri: bp.location.uri,
                        lines: []
                    };
                    map.set(bp.location.uri.toString(), dto);
                    dtos.push(dto);
                }
                dto.lines.push({
                    id: bp.id,
                    enabled: bp.enabled,
                    condition: bp.condition,
                    hitCondition: bp.hitCondition,
                    logMessage: bp.logMessage,
                    line: bp.location.range.start.line,
                    character: bp.location.range.start.character,
                    mode: bp.mode,
                });
            }
            else if (bp instanceof FunctionBreakpoint) {
                dtos.push({
                    type: 'function',
                    id: bp.id,
                    enabled: bp.enabled,
                    hitCondition: bp.hitCondition,
                    logMessage: bp.logMessage,
                    condition: bp.condition,
                    functionName: bp.functionName,
                    mode: bp.mode,
                });
            }
        }
        // send DTOs to VS Code
        return this._debugServiceProxy.$registerBreakpoints(dtos);
    }
    removeBreakpoints(breakpoints0) {
        // remove from array
        const breakpoints = breakpoints0.filter(b => this._breakpoints.delete(b.id));
        // send notification
        this.fireBreakpointChanges([], breakpoints, []);
        // unregister with VS Code
        const ids = breakpoints.filter(bp => bp instanceof SourceBreakpoint).map(bp => bp.id);
        const fids = breakpoints.filter(bp => bp instanceof FunctionBreakpoint).map(bp => bp.id);
        const dids = breakpoints.filter(bp => bp instanceof DataBreakpoint).map(bp => bp.id);
        return this._debugServiceProxy.$unregisterBreakpoints(ids, fids, dids);
    }
    startDebugging(folder, nameOrConfig, options) {
        const testRunMeta = options.testRun && this._testing.getMetadataForRun(options.testRun);
        return this._debugServiceProxy.$startDebugging(folder ? folder.uri : undefined, nameOrConfig, {
            parentSessionID: options.parentSession ? options.parentSession.id : undefined,
            lifecycleManagedByParent: options.lifecycleManagedByParent,
            repl: options.consoleMode === DebugConsoleMode.MergeWithParent ? 'mergeWithParent' : 'separate',
            noDebug: options.noDebug,
            compact: options.compact,
            suppressSaveBeforeStart: options.suppressSaveBeforeStart,
            testRun: testRunMeta && {
                runId: testRunMeta.runId,
                taskId: testRunMeta.taskId,
            },
            // Check debugUI for back-compat, #147264
            // eslint-disable-next-line local/code-no-any-casts
            suppressDebugStatusbar: options.suppressDebugStatusbar ?? options.debugUI?.simple,
            // eslint-disable-next-line local/code-no-any-casts
            suppressDebugToolbar: options.suppressDebugToolbar ?? options.debugUI?.simple,
            // eslint-disable-next-line local/code-no-any-casts
            suppressDebugView: options.suppressDebugView ?? options.debugUI?.simple,
        });
    }
    stopDebugging(session) {
        return this._debugServiceProxy.$stopDebugging(session ? session.id : undefined);
    }
    registerDebugConfigurationProvider(type, provider, trigger) {
        if (!provider) {
            return new Disposable(() => { });
        }
        const handle = this._configProviderHandleCounter++;
        this._configProviders.push({ type, handle, provider });
        this._debugServiceProxy.$registerDebugConfigurationProvider(type, trigger, !!provider.provideDebugConfigurations, !!provider.resolveDebugConfiguration, !!provider.resolveDebugConfigurationWithSubstitutedVariables, handle);
        return new Disposable(() => {
            this._configProviders = this._configProviders.filter(p => p.provider !== provider); // remove
            this._debugServiceProxy.$unregisterDebugConfigurationProvider(handle);
        });
    }
    registerDebugAdapterDescriptorFactory(extension, type, factory) {
        if (!factory) {
            return new Disposable(() => { });
        }
        // a DebugAdapterDescriptorFactory can only be registered in the extension that contributes the debugger
        if (!this.definesDebugType(extension, type)) {
            throw new Error(`a DebugAdapterDescriptorFactory can only be registered from the extension that defines the '${type}' debugger.`);
        }
        // make sure that only one factory for this type is registered
        if (this.getAdapterDescriptorFactoryByType(type)) {
            throw new Error(`a DebugAdapterDescriptorFactory can only be registered once per a type.`);
        }
        const handle = this._adapterFactoryHandleCounter++;
        this._adapterFactories.push({ type, handle, factory });
        this._debugServiceProxy.$registerDebugAdapterDescriptorFactory(type, handle);
        return new Disposable(() => {
            this._adapterFactories = this._adapterFactories.filter(p => p.factory !== factory); // remove
            this._debugServiceProxy.$unregisterDebugAdapterDescriptorFactory(handle);
        });
    }
    registerDebugAdapterTrackerFactory(type, factory) {
        if (!factory) {
            return new Disposable(() => { });
        }
        const handle = this._trackerFactoryHandleCounter++;
        this._trackerFactories.push({ type, handle, factory });
        return new Disposable(() => {
            this._trackerFactories = this._trackerFactories.filter(p => p.factory !== factory); // remove
        });
    }
    // RPC methods (ExtHostDebugServiceShape)
    async $runInTerminal(args, sessionId) {
        return Promise.resolve(undefined);
    }
    async $substituteVariables(folderUri, config) {
        let ws;
        const folder = await this.getFolder(folderUri);
        if (folder) {
            ws = {
                uri: folder.uri,
                name: folder.name,
                index: folder.index,
            };
        }
        const variableResolver = await this._variableResolver.getResolver();
        return variableResolver.resolveAsync(ws, config);
    }
    createDebugAdapter(adapter, session) {
        if (adapter instanceof DebugAdapterInlineImplementation) {
            return new DirectDebugAdapter(adapter.implementation);
        }
        return undefined;
    }
    createSignService() {
        return undefined;
    }
    async $startDASession(debugAdapterHandle, sessionDto) {
        const mythis = this;
        const session = await this.getSession(sessionDto);
        return this.getAdapterDescriptor(this.getAdapterDescriptorFactoryByType(session.type), session).then(daDescriptor => {
            if (!daDescriptor) {
                throw new Error(`Couldn't find a debug adapter descriptor for debug type '${session.type}' (extension might have failed to activate)`);
            }
            const da = this.createDebugAdapter(daDescriptor, session);
            if (!da) {
                throw new Error(`Couldn't create a debug adapter for type '${session.type}'.`);
            }
            const debugAdapter = da;
            this._debugAdapters.set(debugAdapterHandle, debugAdapter);
            return this.getDebugAdapterTrackers(session).then(tracker => {
                if (tracker) {
                    this._debugAdaptersTrackers.set(debugAdapterHandle, tracker);
                }
                debugAdapter.onMessage(async (message) => {
                    if (message.type === 'request' && message.command === 'handshake') {
                        const request = message;
                        const response = {
                            type: 'response',
                            seq: 0,
                            command: request.command,
                            request_seq: request.seq,
                            success: true
                        };
                        if (!this._signService) {
                            this._signService = this.createSignService();
                        }
                        try {
                            if (this._signService) {
                                const signature = await this._signService.sign(request.arguments.value);
                                response.body = {
                                    signature: signature
                                };
                                debugAdapter.sendResponse(response);
                            }
                            else {
                                throw new Error('no signer');
                            }
                        }
                        catch (e) {
                            response.success = false;
                            response.message = e.message;
                            debugAdapter.sendResponse(response);
                        }
                    }
                    else {
                        if (tracker && tracker.onDidSendMessage) {
                            tracker.onDidSendMessage(message);
                        }
                        // DA -> VS Code
                        try {
                            // Try to catch details for #233167
                            message = convertToVSCPaths(message, true);
                        }
                        catch (e) {
                            // eslint-disable-next-line local/code-no-any-casts
                            const type = message.type + '_' + (message.command ?? message.event ?? '');
                            this._telemetryProxy.$publicLog2('debugProtocolMessageError', { type, from: session.type });
                            throw e;
                        }
                        mythis._debugServiceProxy.$acceptDAMessage(debugAdapterHandle, message);
                    }
                });
                debugAdapter.onError(err => {
                    if (tracker && tracker.onError) {
                        tracker.onError(err);
                    }
                    this._debugServiceProxy.$acceptDAError(debugAdapterHandle, err.name, err.message, err.stack);
                });
                debugAdapter.onExit((code) => {
                    if (tracker && tracker.onExit) {
                        tracker.onExit(code ?? undefined, undefined);
                    }
                    this._debugServiceProxy.$acceptDAExit(debugAdapterHandle, code ?? undefined, undefined);
                });
                if (tracker && tracker.onWillStartSession) {
                    tracker.onWillStartSession();
                }
                return debugAdapter.startSession();
            });
        });
    }
    $sendDAMessage(debugAdapterHandle, message) {
        // VS Code -> DA
        message = convertToDAPaths(message, false);
        const tracker = this._debugAdaptersTrackers.get(debugAdapterHandle); // TODO@AW: same handle?
        if (tracker && tracker.onWillReceiveMessage) {
            tracker.onWillReceiveMessage(message);
        }
        const da = this._debugAdapters.get(debugAdapterHandle);
        da?.sendMessage(message);
    }
    $stopDASession(debugAdapterHandle) {
        const tracker = this._debugAdaptersTrackers.get(debugAdapterHandle);
        this._debugAdaptersTrackers.delete(debugAdapterHandle);
        if (tracker && tracker.onWillStopSession) {
            tracker.onWillStopSession();
        }
        const da = this._debugAdapters.get(debugAdapterHandle);
        this._debugAdapters.delete(debugAdapterHandle);
        if (da) {
            return da.stopSession();
        }
        else {
            return Promise.resolve(void 0);
        }
    }
    $acceptBreakpointsDelta(delta) {
        const a = [];
        const r = [];
        const c = [];
        if (delta.added) {
            for (const bpd of delta.added) {
                const id = bpd.id;
                if (id && !this._breakpoints.has(id)) {
                    let bp;
                    if (bpd.type === 'function') {
                        bp = new FunctionBreakpoint(bpd.functionName, bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage, bpd.mode);
                    }
                    else if (bpd.type === 'data') {
                        bp = new DataBreakpoint(bpd.label, bpd.dataId, bpd.canPersist, bpd.enabled, bpd.hitCondition, bpd.condition, bpd.logMessage, bpd.mode);
                    }
                    else {
                        const uri = URI.revive(bpd.uri);
                        bp = new SourceBreakpoint(new Location(uri, new Position(bpd.line, bpd.character)), bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage, bpd.mode);
                    }
                    setBreakpointId(bp, id);
                    this._breakpoints.set(id, bp);
                    a.push(bp);
                }
            }
        }
        if (delta.removed) {
            for (const id of delta.removed) {
                const bp = this._breakpoints.get(id);
                if (bp) {
                    this._breakpoints.delete(id);
                    r.push(bp);
                }
            }
        }
        if (delta.changed) {
            for (const bpd of delta.changed) {
                if (bpd.id) {
                    const bp = this._breakpoints.get(bpd.id);
                    if (bp) {
                        if (bp instanceof FunctionBreakpoint && bpd.type === 'function') {
                            // eslint-disable-next-line local/code-no-any-casts
                            const fbp = bp;
                            fbp.enabled = bpd.enabled;
                            fbp.condition = bpd.condition;
                            fbp.hitCondition = bpd.hitCondition;
                            fbp.logMessage = bpd.logMessage;
                            fbp.functionName = bpd.functionName;
                        }
                        else if (bp instanceof SourceBreakpoint && bpd.type === 'source') {
                            // eslint-disable-next-line local/code-no-any-casts
                            const sbp = bp;
                            sbp.enabled = bpd.enabled;
                            sbp.condition = bpd.condition;
                            sbp.hitCondition = bpd.hitCondition;
                            sbp.logMessage = bpd.logMessage;
                            sbp.location = new Location(URI.revive(bpd.uri), new Position(bpd.line, bpd.character));
                        }
                        c.push(bp);
                    }
                }
            }
        }
        this.fireBreakpointChanges(a, r, c);
    }
    async $acceptStackFrameFocus(focusDto) {
        let focus;
        if (focusDto) {
            const session = await this.getSession(focusDto.sessionId);
            if (focusDto.kind === 'thread') {
                focus = new DebugThread(session.api, focusDto.threadId);
            }
            else {
                focus = new DebugStackFrame(session.api, focusDto.threadId, focusDto.frameId);
            }
        }
        this._activeStackItem = focus;
        this._onDidChangeActiveStackItem.fire(this._activeStackItem);
    }
    $provideDebugConfigurations(configProviderHandle, folderUri, token) {
        return asPromise(async () => {
            const provider = this.getConfigProviderByHandle(configProviderHandle);
            if (!provider) {
                throw new Error('no DebugConfigurationProvider found');
            }
            if (!provider.provideDebugConfigurations) {
                throw new Error('DebugConfigurationProvider has no method provideDebugConfigurations');
            }
            const folder = await this.getFolder(folderUri);
            return provider.provideDebugConfigurations(folder, token);
        }).then(debugConfigurations => {
            if (!debugConfigurations) {
                throw new Error('nothing returned from DebugConfigurationProvider.provideDebugConfigurations');
            }
            return debugConfigurations;
        });
    }
    $resolveDebugConfiguration(configProviderHandle, folderUri, debugConfiguration, token) {
        return asPromise(async () => {
            const provider = this.getConfigProviderByHandle(configProviderHandle);
            if (!provider) {
                throw new Error('no DebugConfigurationProvider found');
            }
            if (!provider.resolveDebugConfiguration) {
                throw new Error('DebugConfigurationProvider has no method resolveDebugConfiguration');
            }
            const folder = await this.getFolder(folderUri);
            return provider.resolveDebugConfiguration(folder, debugConfiguration, token);
        });
    }
    $resolveDebugConfigurationWithSubstitutedVariables(configProviderHandle, folderUri, debugConfiguration, token) {
        return asPromise(async () => {
            const provider = this.getConfigProviderByHandle(configProviderHandle);
            if (!provider) {
                throw new Error('no DebugConfigurationProvider found');
            }
            if (!provider.resolveDebugConfigurationWithSubstitutedVariables) {
                throw new Error('DebugConfigurationProvider has no method resolveDebugConfigurationWithSubstitutedVariables');
            }
            const folder = await this.getFolder(folderUri);
            return provider.resolveDebugConfigurationWithSubstitutedVariables(folder, debugConfiguration, token);
        });
    }
    async $provideDebugAdapter(adapterFactoryHandle, sessionDto) {
        const adapterDescriptorFactory = this.getAdapterDescriptorFactoryByHandle(adapterFactoryHandle);
        if (!adapterDescriptorFactory) {
            return Promise.reject(new Error('no adapter descriptor factory found for handle'));
        }
        const session = await this.getSession(sessionDto);
        return this.getAdapterDescriptor(adapterDescriptorFactory, session).then(adapterDescriptor => {
            if (!adapterDescriptor) {
                throw new Error(`Couldn't find a debug adapter descriptor for debug type '${session.type}'`);
            }
            return this.convertToDto(adapterDescriptor);
        });
    }
    async $acceptDebugSessionStarted(sessionDto) {
        const session = await this.getSession(sessionDto);
        this._onDidStartDebugSession.fire(session.api);
    }
    async $acceptDebugSessionTerminated(sessionDto) {
        const session = await this.getSession(sessionDto);
        if (session) {
            this._onDidTerminateDebugSession.fire(session.api);
            this._debugSessions.delete(session.id);
        }
    }
    async $acceptDebugSessionActiveChanged(sessionDto) {
        this._activeDebugSession = sessionDto ? await this.getSession(sessionDto) : undefined;
        this._onDidChangeActiveDebugSession.fire(this._activeDebugSession?.api);
    }
    async $acceptDebugSessionNameChanged(sessionDto, name) {
        const session = await this.getSession(sessionDto);
        session?._acceptNameChanged(name);
    }
    async $acceptDebugSessionCustomEvent(sessionDto, event) {
        const session = await this.getSession(sessionDto);
        const ee = {
            session: session.api,
            event: event.event,
            body: event.body
        };
        this._onDidReceiveDebugSessionCustomEvent.fire(ee);
    }
    // private & dto helpers
    convertToDto(x) {
        if (x instanceof DebugAdapterExecutable) {
            return this.convertExecutableToDto(x);
        }
        else if (x instanceof DebugAdapterServer) {
            return this.convertServerToDto(x);
        }
        else if (x instanceof DebugAdapterNamedPipeServer) {
            return this.convertPipeServerToDto(x);
        }
        else if (x instanceof DebugAdapterInlineImplementation) {
            return this.convertImplementationToDto(x);
        }
        else {
            throw new Error('convertToDto unexpected type');
        }
    }
    convertExecutableToDto(x) {
        return {
            type: 'executable',
            command: x.command,
            args: x.args,
            options: x.options
        };
    }
    convertServerToDto(x) {
        return {
            type: 'server',
            port: x.port,
            host: x.host
        };
    }
    convertPipeServerToDto(x) {
        return {
            type: 'pipeServer',
            path: x.path
        };
    }
    convertImplementationToDto(x) {
        return {
            type: 'implementation',
        };
    }
    getAdapterDescriptorFactoryByType(type) {
        const results = this._adapterFactories.filter(p => p.type === type);
        if (results.length > 0) {
            return results[0].factory;
        }
        return undefined;
    }
    getAdapterDescriptorFactoryByHandle(handle) {
        const results = this._adapterFactories.filter(p => p.handle === handle);
        if (results.length > 0) {
            return results[0].factory;
        }
        return undefined;
    }
    getConfigProviderByHandle(handle) {
        const results = this._configProviders.filter(p => p.handle === handle);
        if (results.length > 0) {
            return results[0].provider;
        }
        return undefined;
    }
    definesDebugType(ed, type) {
        if (ed.contributes) {
            const debuggers = ed.contributes['debuggers'];
            if (debuggers && debuggers.length > 0) {
                for (const dbg of debuggers) {
                    // only debugger contributions with a "label" are considered a "defining" debugger contribution
                    if (dbg.label && dbg.type) {
                        if (dbg.type === type) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }
    getDebugAdapterTrackers(session) {
        const config = session.configuration;
        const type = config.type;
        const promises = this._trackerFactories
            .filter(tuple => tuple.type === type || tuple.type === '*')
            .map(tuple => asPromise(() => tuple.factory.createDebugAdapterTracker(session.api)).then(p => p, err => null));
        return Promise.race([
            Promise.all(promises).then(result => {
                const trackers = coalesce(result); // filter null
                if (trackers.length > 0) {
                    return new MultiTracker(trackers);
                }
                return undefined;
            }),
            new Promise(resolve => setTimeout(() => resolve(undefined), 1000)),
        ]).catch(err => {
            // ignore errors
            return undefined;
        });
    }
    async getAdapterDescriptor(adapterDescriptorFactory, session) {
        // a "debugServer" attribute in the launch config takes precedence
        const serverPort = session.configuration.debugServer;
        if (typeof serverPort === 'number') {
            return Promise.resolve(new DebugAdapterServer(serverPort));
        }
        if (adapterDescriptorFactory) {
            const extensionRegistry = await this._extensionService.getExtensionRegistry();
            return asPromise(() => adapterDescriptorFactory.createDebugAdapterDescriptor(session.api, this.daExecutableFromPackage(session, extensionRegistry))).then(daDescriptor => {
                if (daDescriptor) {
                    return daDescriptor;
                }
                return undefined;
            });
        }
        // fallback: use executable information from package.json
        const extensionRegistry = await this._extensionService.getExtensionRegistry();
        return Promise.resolve(this.daExecutableFromPackage(session, extensionRegistry));
    }
    daExecutableFromPackage(session, extensionRegistry) {
        return undefined;
    }
    fireBreakpointChanges(added, removed, changed) {
        if (added.length > 0 || removed.length > 0 || changed.length > 0) {
            this._onDidChangeBreakpoints.fire(Object.freeze({
                added,
                removed,
                changed,
            }));
        }
    }
    async getSession(dto) {
        if (dto) {
            if (typeof dto === 'string') {
                const ds = this._debugSessions.get(dto);
                if (ds) {
                    return ds;
                }
            }
            else {
                let ds = this._debugSessions.get(dto.id);
                if (!ds) {
                    const folder = await this.getFolder(dto.folderUri);
                    const parent = dto.parent ? this._debugSessions.get(dto.parent) : undefined;
                    ds = new ExtHostDebugSession(this._debugServiceProxy, dto.id, dto.type, dto.name, folder, dto.configuration, parent?.api);
                    this._debugSessions.set(ds.id, ds);
                    this._debugServiceProxy.$sessionCached(ds.id);
                }
                return ds;
            }
        }
        throw new Error('cannot find session');
    }
    getFolder(_folderUri) {
        if (_folderUri) {
            const folderURI = URI.revive(_folderUri);
            return this._workspaceService.resolveWorkspaceFolder(folderURI);
        }
        return Promise.resolve(undefined);
    }
    extensionVisKey(extensionId, id) {
        return `${extensionId}\0${id}`;
    }
    serializeVisualization(extensionId, viz) {
        if (!viz) {
            return undefined;
        }
        if ('title' in viz && 'command' in viz) {
            return { type: 0 /* DebugVisualizationType.Command */ };
        }
        if ('treeId' in viz) {
            return { type: 1 /* DebugVisualizationType.Tree */, id: `${extensionId}\0${viz.treeId}` };
        }
        throw new Error('Unsupported debug visualization type');
    }
    getIconPathOrClass(icon) {
        const iconPathOrIconClass = this.getIconUris(icon);
        let iconPath;
        let iconClass;
        if ('id' in iconPathOrIconClass) {
            iconClass = ThemeIconUtils.asClassName(iconPathOrIconClass);
        }
        else {
            iconPath = iconPathOrIconClass;
        }
        return {
            iconPath,
            iconClass
        };
    }
    getIconUris(iconPath) {
        if (iconPath instanceof ThemeIcon) {
            return { id: iconPath.id };
        }
        const dark = typeof iconPath === 'object' && 'dark' in iconPath ? iconPath.dark : iconPath;
        const light = typeof iconPath === 'object' && 'light' in iconPath ? iconPath.light : iconPath;
        return {
            dark: (typeof dark === 'string' ? URI.file(dark) : dark),
            light: (typeof light === 'string' ? URI.file(light) : light),
        };
    }
};
ExtHostDebugServiceBase = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostWorkspace),
    __param(2, IExtHostExtensionService),
    __param(3, IExtHostConfiguration),
    __param(4, IExtHostEditorTabs),
    __param(5, IExtHostVariableResolverProvider),
    __param(6, IExtHostCommands),
    __param(7, IExtHostTesting)
], ExtHostDebugServiceBase);
export { ExtHostDebugServiceBase };
export class ExtHostDebugSession {
    constructor(_debugServiceProxy, _id, _type, _name, _workspaceFolder, _configuration, _parentSession) {
        this._debugServiceProxy = _debugServiceProxy;
        this._id = _id;
        this._type = _type;
        this._name = _name;
        this._workspaceFolder = _workspaceFolder;
        this._configuration = _configuration;
        this._parentSession = _parentSession;
    }
    get api() {
        const that = this;
        return this.apiSession ??= Object.freeze({
            id: that._id,
            type: that._type,
            get name() {
                return that._name;
            },
            set name(name) {
                that._name = name;
                that._debugServiceProxy.$setDebugSessionName(that._id, name);
            },
            parentSession: that._parentSession,
            workspaceFolder: that._workspaceFolder,
            configuration: that._configuration,
            customRequest(command, args) {
                return that._debugServiceProxy.$customDebugAdapterRequest(that._id, command, args);
            },
            getDebugProtocolBreakpoint(breakpoint) {
                return that._debugServiceProxy.$getDebugProtocolBreakpoint(that._id, breakpoint.id);
            }
        });
    }
    get id() {
        return this._id;
    }
    get type() {
        return this._type;
    }
    _acceptNameChanged(name) {
        this._name = name;
    }
    get configuration() {
        return this._configuration;
    }
}
export class ExtHostDebugConsole {
    constructor(proxy) {
        this.value = Object.freeze({
            append(value) {
                proxy.$appendDebugConsole(value);
            },
            appendLine(value) {
                this.append(value + '\n');
            }
        });
    }
}
class MultiTracker {
    constructor(trackers) {
        this.trackers = trackers;
    }
    onWillStartSession() {
        this.trackers.forEach(t => t.onWillStartSession ? t.onWillStartSession() : undefined);
    }
    onWillReceiveMessage(message) {
        this.trackers.forEach(t => t.onWillReceiveMessage ? t.onWillReceiveMessage(message) : undefined);
    }
    onDidSendMessage(message) {
        this.trackers.forEach(t => t.onDidSendMessage ? t.onDidSendMessage(message) : undefined);
    }
    onWillStopSession() {
        this.trackers.forEach(t => t.onWillStopSession ? t.onWillStopSession() : undefined);
    }
    onError(error) {
        this.trackers.forEach(t => t.onError ? t.onError(error) : undefined);
    }
    onExit(code, signal) {
        this.trackers.forEach(t => t.onExit ? t.onExit(code, signal) : undefined);
    }
}
/*
 * Call directly into a debug adapter implementation
 */
class DirectDebugAdapter extends AbstractDebugAdapter {
    constructor(implementation) {
        super();
        this.implementation = implementation;
        implementation.onDidSendMessage((message) => {
            this.acceptMessage(message);
        });
    }
    startSession() {
        return Promise.resolve(undefined);
    }
    sendMessage(message) {
        this.implementation.handleMessage(message);
    }
    stopSession() {
        this.implementation.dispose();
        return Promise.resolve(undefined);
    }
}
let WorkerExtHostDebugService = class WorkerExtHostDebugService extends ExtHostDebugServiceBase {
    constructor(extHostRpcService, workspaceService, extensionService, configurationService, editorTabs, variableResolver, commands, testing) {
        super(extHostRpcService, workspaceService, extensionService, configurationService, editorTabs, variableResolver, commands, testing);
    }
};
WorkerExtHostDebugService = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostWorkspace),
    __param(2, IExtHostExtensionService),
    __param(3, IExtHostConfiguration),
    __param(4, IExtHostEditorTabs),
    __param(5, IExtHostVariableResolverProvider),
    __param(6, IExtHostCommands),
    __param(7, IExtHostTesting)
], WorkerExtHostDebugService);
export { WorkerExtHostDebugService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERlYnVnU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3REZWJ1Z1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUUxRCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsSUFBSSxhQUFhLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUYsT0FBTyxFQUFFLFNBQVMsSUFBSSxjQUFjLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxtQkFBbUIsRUFBeUIsTUFBTSxtREFBbUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFHMUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFMUYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGlCQUFpQixFQUFFLDBCQUEwQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFHM0gsT0FBTyxFQUErSyxXQUFXLEVBQXlELE1BQU0sdUJBQXVCLENBQUM7QUFDeFIsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDeEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDbEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDNUQsT0FBTyxFQUFFLHdCQUF3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