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
import { getActiveWindow } from '../../../../base/browser/dom.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { distinct } from '../../../../base/common/arrays.js';
import { Queue, RunOnceScheduler, raceTimeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { canceled } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { normalizeDriveLetter } from '../../../../base/common/labels.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { mixin } from '../../../../base/common/objects.js';
import * as platform from '../../../../base/common/platform.js';
import * as resources from '../../../../base/common/resources.js';
import Severity from '../../../../base/common/severity.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ICustomEndpointTelemetryService, ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { ITestResultService } from '../../testing/common/testResultService.js';
import { ITestService } from '../../testing/common/testService.js';
import { IDebugService, VIEWLET_ID, isFrameDeemphasized } from '../common/debug.js';
import { ExpressionContainer, MemoryRegion, Thread } from '../common/debugModel.js';
import { Source } from '../common/debugSource.js';
import { filterExceptionsFromTelemetry } from '../common/debugUtils.js';
import { ReplModel } from '../common/replModel.js';
import { RawDebugSession } from './rawDebugSession.js';
const TRIGGERED_BREAKPOINT_MAX_DELAY = 1500;
let DebugSession = class DebugSession {
    constructor(id, _configuration, root, model, options, debugService, telemetryService, hostService, configurationService, paneCompositeService, workspaceContextService, productService, notificationService, lifecycleService, uriIdentityService, instantiationService, customEndpointTelemetryService, workbenchEnvironmentService, logService, testService, testResultService, accessibilityService) {
        this.id = id;
        this._configuration = _configuration;
        this.root = root;
        this.model = model;
        this.debugService = debugService;
        this.telemetryService = telemetryService;
        this.hostService = hostService;
        this.configurationService = configurationService;
        this.paneCompositeService = paneCompositeService;
        this.workspaceContextService = workspaceContextService;
        this.productService = productService;
        this.notificationService = notificationService;
        this.uriIdentityService = uriIdentityService;
        this.instantiationService = instantiationService;
        this.customEndpointTelemetryService = customEndpointTelemetryService;
        this.workbenchEnvironmentService = workbenchEnvironmentService;
        this.logService = logService;
        this.testService = testService;
        this.accessibilityService = accessibilityService;
        this.initialized = false;
        this.sources = new Map();
        this.threads = new Map();
        this.threadIds = [];
        this.cancellationMap = new Map();
        this.rawListeners = new DisposableStore();
        this.globalDisposables = new DisposableStore();
        this.fetchThreadsScheduler = new Lazy(() => {
            const inst = new RunOnceScheduler(() => {
                this.fetchThreads();
            }, 100);
            this.rawListeners.add(inst);
            return inst;
        });
        this.stoppedDetails = [];
        this.statusQueue = this.rawListeners.add(new ThreadStatusScheduler());
        this._onDidChangeState = new Emitter();
        this._onDidEndAdapter = new Emitter();
        this._onDidLoadedSource = new Emitter();
        this._onDidCustomEvent = new Emitter();
        this._onDidProgressStart = new Emitter();
        this._onDidProgressUpdate = new Emitter();
        this._onDidProgressEnd = new Emitter();
        this._onDidInvalidMemory = new Emitter();
        this._onDidChangeREPLElements = new Emitter();
        this._onDidChangeName = new Emitter();
        this._options = options || {};
        this.parentSession = this._options.parentSession;
        if (this.hasSeparateRepl()) {
            this.repl = new ReplModel(this.configurationService);
        }
        else {
            this.repl = this.parentSession.repl;
        }
        const toDispose = this.globalDisposables;
        const replListener = toDispose.add(new MutableDisposable());
        replListener.value = this.repl.onDidChangeElements((e) => this._onDidChangeREPLElements.fire(e));
        if (lifecycleService) {
            toDispose.add(lifecycleService.onWillShutdown(() => {
                this.shutdown();
                dispose(toDispose);
            }));
        }
        // Cast here, it's not possible to reference a hydrated result in this code path.
        this.correlatedTestRun = options?.testRun
            ? testResultService.getResult(options.testRun.runId)
            : this.parentSession?.correlatedTestRun;
        if (this.correlatedTestRun) {
            // Listen to the test completing because the user might have taken the cancel action rather than stopping the session.
            toDispose.add(this.correlatedTestRun.onComplete(() => this.terminate()));
        }
        const compoundRoot = this._options.compoundRoot;
        if (compoundRoot) {
            toDispose.add(compoundRoot.onDidSessionStop(() => this.terminate()));
        }
        this.passFocusScheduler = new RunOnceScheduler(() => {
            // If there is some session or thread that is stopped pass focus to it
            if (this.debugService.getModel().getSessions().some(s => s.state === 2 /* State.Stopped */) || this.getAllThreads().some(t => t.stopped)) {
                if (typeof this.lastContinuedThreadId === 'number') {
                    const thread = this.debugService.getViewModel().focusedThread;
                    if (thread && thread.threadId === this.lastContinuedThreadId && !thread.stopped) {
                        const toFocusThreadId = this.getStoppedDetails()?.threadId;
                        const toFocusThread = typeof toFocusThreadId === 'number' ? this.getThread(toFocusThreadId) : undefined;
                        this.debugService.focusStackFrame(undefined, toFocusThread);
                    }
                }
                else {
                    const session = this.debugService.getViewModel().focusedSession;
                    if (session && session.getId() === this.getId() && session.state !== 2 /* State.Stopped */) {
                        this.debugService.focusStackFrame(undefined);
                    }
                }
            }
        }, 800);
        const parent = this._options.parentSession;
        if (parent) {
            toDispose.add(parent.onDidEndAdapter(() => {
                // copy the parent repl and get a new detached repl for this child, and
                // remove its parent, if it's still running
                if (!this.hasSeparateRepl() && this.raw?.isInShutdown === false) {
                    this.repl = this.repl.clone();
                    replListener.value = this.repl.onDidChangeElements((e) => this._onDidChangeREPLElements.fire(e));
                    this.parentSession = undefined;
                }
            }));
        }
    }
    getId() {
        return this.id;
    }
    setSubId(subId) {
        this._subId = subId;
    }
    getMemory(memoryReference) {
        return new MemoryRegion(memoryReference, this);
    }
    get subId() {
        return this._subId;
    }
    get configuration() {
        return this._configuration.resolved;
    }
    get unresolvedConfiguration() {
        return this._configuration.unresolved;
    }
    get lifecycleManagedByParent() {
        return !!this._options.lifecycleManagedByParent;
    }
    get compact() {
        return !!this._options.compact;
    }
    get saveBeforeRestart() {
        return this._options.saveBeforeRestart ?? !this._options?.parentSession;
    }
    get compoundRoot() {
        return this._options.compoundRoot;
    }
    get suppressDebugStatusbar() {
        return this._options.suppressDebugStatusbar ?? false;
    }
    get suppressDebugToolbar() {
        return this._options.suppressDebugToolbar ?? false;
    }
    get suppressDebugView() {
        return this._options.suppressDebugView ?? false;
    }
    get autoExpandLazyVariables() {
        // This tiny helper avoids converting the entire debug model to use service injection
        const screenReaderOptimized = this.accessibilityService.isScreenReaderOptimized();
        const value = this.configurationService.getValue('debug').autoExpandLazyVariables;
        return value === 'auto' && screenReaderOptimized || value === 'on';
    }
    setConfiguration(configuration) {
        this._configuration = configuration;
    }
    getLabel() {
        const includeRoot = this.workspaceContextService.getWorkspace().folders.length > 1;
        return includeRoot && this.root ? `${this.name} (${resources.basenameOrAuthority(this.root.uri)})` : this.name;
    }
    setName(name) {
        this._name = name;
        this._onDidChangeName.fire(name);
    }
    get name() {
        return this._name || this.configuration.name;
    }
    get state() {
        if (!this.initialized) {
            return 1 /* State.Initializing */;
        }
        if (!this.raw) {
            return 0 /* State.Inactive */;
        }
        const focusedThread = this.debugService.getViewModel().focusedThread;
        if (focusedThread && focusedThread.session === this) {
            return focusedThread.stopped ? 2 /* State.Stopped */ : 3 /* State.Running */;
        }
        if (this.getAllThreads().some(t => t.stopped)) {
            return 2 /* State.Stopped */;
        }
        return 3 /* State.Running */;
    }
    get capabilities() {
        return this.raw ? this.raw.capabilities : Object.create(null);
    }
    //---- events
    get onDidChangeState() {
        return this._onDidChangeState.event;
    }
    get onDidEndAdapter() {
        return this._onDidEndAdapter.event;
    }
    get onDidChangeReplElements() {
        return this._onDidChangeREPLElements.event;
    }
    get onDidChangeName() {
        return this._onDidChangeName.event;
    }
    //---- DAP events
    get onDidCustomEvent() {
        return this._onDidCustomEvent.event;
    }
    get onDidLoadedSource() {
        return this._onDidLoadedSource.event;
    }
    get onDidProgressStart() {
        return this._onDidProgressStart.event;
    }
    get onDidProgressUpdate() {
        return this._onDidProgressUpdate.event;
    }
    get onDidProgressEnd() {
        return this._onDidProgressEnd.event;
    }
    get onDidInvalidateMemory() {
        return this._onDidInvalidMemory.event;
    }
    //---- DAP requests
    /**
     * create and initialize a new debug adapter for this session
     */
    async initialize(dbgr) {
        if (this.raw) {
            // if there was already a connection make sure to remove old listeners
            await this.shutdown();
        }
        try {
            const debugAdapter = await dbgr.createDebugAdapter(this);
            this.raw = this.instantiationService.createInstance(RawDebugSession, debugAdapter, dbgr, this.id, this.configuration.name);
            await this.raw.start();
            this.registerListeners();
            await this.raw.initialize({
                clientID: 'vscode',
                clientName: this.productService.nameLong,
                adapterID: this.configuration.type,
                pathFormat: 'path',
                linesStartAt1: true,
                columnsStartAt1: true,
                supportsVariableType: true, // #8858
                supportsVariablePaging: true, // #9537
                supportsRunInTerminalRequest: true, // #10574
                locale: platform.language, // #169114
                supportsProgressReporting: true, // #92253
                supportsInvalidatedEvent: true, // #106745
                supportsMemoryReferences: true, //#129684
                supportsArgsCanBeInterpretedByShell: true, // #149910
                supportsMemoryEvent: true, // #133643
                supportsStartDebuggingRequest: true,
                supportsANSIStyling: true,
            });
            this.initialized = true;
            this._onDidChangeState.fire();
            this.rememberedCapabilities = this.raw.capabilities;
            this.debugService.setExceptionBreakpointsForSession(this, (this.raw && this.raw.capabilities.exceptionBreakpointFilters) || []);
            this.debugService.getModel().registerBreakpointModes(this.configuration.type, this.raw.capabilities.breakpointModes || []);
        }
        catch (err) {
            this.initialized = true;
            this._onDidChangeState.fire();
            await this.shutdown();
            throw err;
        }
    }
    /**
     * launch or attach to the debuggee
     */
    async launchOrAttach(config) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'launch or attach'));
        }
        if (this.parentSession && this.parentSession.state === 0 /* State.Inactive */) {
            throw canceled();
        }
        // __sessionID only used for EH debugging (but we add it always for now...)
        config.__sessionId = this.getId();
        try {
            await this.raw.launchOrAttach(config);
        }
        catch (err) {
            this.shutdown();
            throw err;
        }
    }
    /**
     * Terminate any linked test run.
     */
    cancelCorrelatedTestRun() {
        if (this.correlatedTestRun && !this.correlatedTestRun.completedAt) {
            this.didTerminateTestRun = true;
            this.testService.cancelTestRun(this.correlatedTestRun.id);
        }
    }
    /**
     * terminate the current debug adapter session
     */
    async terminate(restart = false) {
        if (!this.raw) {
            // Adapter went down but it did not send a 'terminated' event, simulate like the event has been sent
            this.onDidExitAdapter();
        }
        this.cancelAllRequests();
        if (this._options.lifecycleManagedByParent && this.parentSession) {
            await this.parentSession.terminate(restart);
        }
        else if (this.correlatedTestRun && !this.correlatedTestRun.completedAt && !this.didTerminateTestRun) {
            this.cancelCorrelatedTestRun();
        }
        else if (this.raw) {
            if (this.raw.capabilities.supportsTerminateRequest && this._configuration.resolved.request === 'launch') {
                await this.raw.terminate(restart);
            }
            else {
                await this.raw.disconnect({ restart, terminateDebuggee: true });
            }
        }
        if (!restart) {
            this._options.compoundRoot?.sessionStopped();
        }
    }
    /**
     * end the current debug adapter session
     */
    async disconnect(restart = false, suspend = false) {
        if (!this.raw) {
            // Adapter went down but it did not send a 'terminated' event, simulate like the event has been sent
            this.onDidExitAdapter();
        }
        this.cancelAllRequests();
        if (this._options.lifecycleManagedByParent && this.parentSession) {
            await this.parentSession.disconnect(restart, suspend);
        }
        else if (this.raw) {
            // TODO terminateDebuggee should be undefined by default?
            await this.raw.disconnect({ restart, terminateDebuggee: false, suspendDebuggee: suspend });
        }
        if (!restart) {
            this._options.compoundRoot?.sessionStopped();
        }
    }
    /**
     * restart debug adapter session
     */
    async restart() {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'restart'));
        }
        this.cancelAllRequests();
        if (this._options.lifecycleManagedByParent && this.parentSession) {
            await this.parentSession.restart();
        }
        else {
            await this.raw.restart({ arguments: this.configuration });
        }
    }
    async sendBreakpoints(modelUri, breakpointsToSend, sourceModified) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'breakpoints'));
        }
        if (!this.raw.readyForBreakpoints) {
            return Promise.resolve(undefined);
        }
        const rawSource = this.getRawSource(modelUri);
        if (breakpointsToSend.length && !rawSource.adapterData) {
            rawSource.adapterData = breakpointsToSend[0].adapterData;
        }
        // Normalize all drive letters going out from vscode to debug adapters so we are consistent with our resolving #43959
        if (rawSource.path) {
            rawSource.path = normalizeDriveLetter(rawSource.path);
        }
        const response = await this.raw.setBreakpoints({
            source: rawSource,
            lines: breakpointsToSend.map(bp => bp.sessionAgnosticData.lineNumber),
            breakpoints: breakpointsToSend.map(bp => bp.toDAP()),
            sourceModified
        });
        if (response?.body) {
            const data = new Map();
            for (let i = 0; i < breakpointsToSend.length; i++) {
                data.set(breakpointsToSend[i].getId(), response.body.breakpoints[i]);
            }
            this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
        }
    }
    async sendFunctionBreakpoints(fbpts) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'function breakpoints'));
        }
        if (this.raw.readyForBreakpoints) {
            const response = await this.raw.setFunctionBreakpoints({ breakpoints: fbpts.map(bp => bp.toDAP()) });
            if (response?.body) {
                const data = new Map();
                for (let i = 0; i < fbpts.length; i++) {
                    data.set(fbpts[i].getId(), response.body.breakpoints[i]);
                }
                this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
            }
        }
    }
    async sendExceptionBreakpoints(exbpts) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'exception breakpoints'));
        }
        if (this.raw.readyForBreakpoints) {
            const args = this.capabilities.supportsExceptionFilterOptions ? {
                filters: [],
                filterOptions: exbpts.map(exb => {
                    if (exb.condition) {
                        return { filterId: exb.filter, condition: exb.condition };
                    }
                    return { filterId: exb.filter };
                })
            } : { filters: exbpts.map(exb => exb.filter) };
            const response = await this.raw.setExceptionBreakpoints(args);
            if (response?.body && response.body.breakpoints) {
                const data = new Map();
                for (let i = 0; i < exbpts.length; i++) {
                    data.set(exbpts[i].getId(), response.body.breakpoints[i]);
                }
                this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
            }
        }
    }
    dataBytesBreakpointInfo(address, bytes) {
        if (this.raw?.capabilities.supportsDataBreakpointBytes === false) {
            throw new Error(localize('sessionDoesNotSupporBytesBreakpoints', "Session does not support breakpoints with bytes"));
        }
        return this._dataBreakpointInfo({ name: address, bytes, asAddress: true });
    }
    dataBreakpointInfo(name, variablesReference, frameId) {
        return this._dataBreakpointInfo({ name, variablesReference, frameId });
    }
    async _dataBreakpointInfo(args) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'data breakpoints info'));
        }
        if (!this.raw.readyForBreakpoints) {
            throw new Error(localize('sessionNotReadyForBreakpoints', "Session is not ready for breakpoints"));
        }
        const response = await this.raw.dataBreakpointInfo(args);
        return response?.body;
    }
    async sendDataBreakpoints(dataBreakpoints) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'data breakpoints'));
        }
        if (this.raw.readyForBreakpoints) {
            const converted = await Promise.all(dataBreakpoints.map(async (bp) => {
                try {
                    const dap = await bp.toDAP(this);
                    return { dap, bp };
                }
                catch (e) {
                    return { bp, message: e.message };
                }
            }));
            const response = await this.raw.setDataBreakpoints({ breakpoints: converted.map(d => d.dap).filter(isDefined) });
            if (response?.body) {
                const data = new Map();
                let i = 0;
                for (const dap of converted) {
                    if (!dap.dap) {
                        data.set(dap.bp.getId(), dap.message);
                    }
                    else if (i < response.body.breakpoints.length) {
                        data.set(dap.bp.getId(), response.body.breakpoints[i++]);
                    }
                }
                this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
            }
        }
    }
    async sendInstructionBreakpoints(instructionBreakpoints) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'instruction breakpoints'));
        }
        if (this.raw.readyForBreakpoints) {
            const response = await this.raw.setInstructionBreakpoints({ breakpoints: instructionBreakpoints.map(ib => ib.toDAP()) });
            if (response?.body) {
                const data = new Map();
                for (let i = 0; i < instructionBreakpoints.length; i++) {
                    data.set(instructionBreakpoints[i].getId(), response.body.breakpoints[i]);
                }
                this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
            }
        }
    }
    async breakpointsLocations(uri, lineNumber) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'breakpoints locations'));
        }
        const source = this.getRawSource(uri);
        const response = await this.raw.breakpointLocations({ source, line: lineNumber });
        if (!response || !response.body || !response.body.breakpoints) {
            return [];
        }
        const positions = response.body.breakpoints.map(bp => ({ lineNumber: bp.line, column: bp.column || 1 }));
        return distinct(positions, p => `${p.lineNumber}:${p.column}`);
    }
    getDebugProtocolBreakpoint(breakpointId) {
        return this.model.getDebugProtocolBreakpoint(breakpointId, this.getId());
    }
    customRequest(request, args) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", request));
        }
        return this.raw.custom(request, args);
    }
    stackTrace(threadId, startFrame, levels, token) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'stackTrace'));
        }
        const sessionToken = this.getNewCancellationToken(threadId, token);
        return this.raw.stackTrace({ threadId, startFrame, levels }, sessionToken);
    }
    async exceptionInfo(threadId) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'exceptionInfo'));
        }
        const response = await this.raw.exceptionInfo({ threadId });
        if (response) {
            return {
                id: response.body.exceptionId,
                description: response.body.description,
                breakMode: response.body.breakMode,
                details: response.body.details
            };
        }
        return undefined;
    }
    scopes(frameId, threadId) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'scopes'));
        }
        const token = this.getNewCancellationToken(threadId);
        return this.raw.scopes({ frameId }, token);
    }
    variables(variablesReference, threadId, filter, start, count) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'variables'));
        }
        const token = threadId ? this.getNewCancellationToken(threadId) : undefined;
        return this.raw.variables({ variablesReference, filter, start, count }, token);
    }
    evaluate(expression, frameId, context, location) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'evaluate'));
        }
        return this.raw.evaluate({ expression, frameId, context, line: location?.line, column: location?.column, source: location?.source });
    }
    async restartFrame(frameId, threadId) {
        await this.waitForTriggeredBreakpoints();
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'restartFrame'));
        }
        await this.raw.restartFrame({ frameId }, threadId);
    }
    setLastSteppingGranularity(threadId, granularity) {
        const thread = this.getThread(threadId);
        if (thread) {
            thread.lastSteppingGranularity = granularity;
        }
    }
    async next(threadId, granularity) {
        await this.waitForTriggeredBreakpoints();
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'next'));
        }
        this.setLastSteppingGranularity(threadId, granularity);
        await this.raw.next({ threadId, granularity });
    }
    async stepIn(threadId, targetId, granularity) {
        await this.waitForTriggeredBreakpoints();
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'stepIn'));
        }
        this.setLastSteppingGranularity(threadId, granularity);
        await this.raw.stepIn({ threadId, targetId, granularity });
    }
    async stepOut(threadId, granularity) {
        await this.waitForTriggeredBreakpoints();
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'stepOut'));
        }
        this.setLastSteppingGranularity(threadId, granularity);
        await this.raw.stepOut({ threadId, granularity });
    }
    async stepBack(threadId, granularity) {
        await this.waitForTriggeredBreakpoints();
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'stepBack'));
        }
        this.setLastSteppingGranularity(threadId, granularity);
        await this.raw.stepBack({ threadId, granularity });
    }
    async continue(threadId) {
        await this.waitForTriggeredBreakpoints();
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'continue'));
        }
        await this.raw.continue({ threadId });
    }
    async reverseContinue(threadId) {
        await this.waitForTriggeredBreakpoints();
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'reverse continue'));
        }
        await this.raw.reverseContinue({ threadId });
    }
    async pause(threadId) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'pause'));
        }
        await this.raw.pause({ threadId });
    }
    async terminateThreads(threadIds) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'terminateThreads'));
        }
        await this.raw.terminateThreads({ threadIds });
    }
    setVariable(variablesReference, name, value) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'setVariable'));
        }
        return this.raw.setVariable({ variablesReference, name, value });
    }
    setExpression(frameId, expression, value) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'setExpression'));
        }
        return this.raw.setExpression({ expression, value, frameId });
    }
    gotoTargets(source, line, column) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'gotoTargets'));
        }
        return this.raw.gotoTargets({ source, line, column });
    }
    goto(threadId, targetId) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'goto'));
        }
        return this.raw.goto({ threadId, targetId });
    }
    loadSource(resource) {
        if (!this.raw) {
            return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'loadSource')));
        }
        const source = this.getSourceForUri(resource);
        let rawSource;
        if (source) {
            rawSource = source.raw;
        }
        else {
            // create a Source
            const data = Source.getEncodedDebugData(resource);
            rawSource = { path: data.path, sourceReference: data.sourceReference };
        }
        return this.raw.source({ sourceReference: rawSource.sourceReference || 0, source: rawSource });
    }
    async getLoadedSources() {
        if (!this.raw) {
            return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'getLoadedSources')));
        }
        const response = await this.raw.loadedSources({});
        if (response?.body && response.body.sources) {
            return response.body.sources.map(src => this.getSource(src));
        }
        else {
            return [];
        }
    }
    async completions(frameId, threadId, text, position, token) {
        if (!this.raw) {
            return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'completions')));
        }
        const sessionCancelationToken = this.getNewCancellationToken(threadId, token);
        return this.raw.completions({
            frameId,
            text,
            column: position.column,
            line: position.lineNumber,
        }, sessionCancelationToken);
    }
    async stepInTargets(frameId) {
        if (!this.raw) {
            return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'stepInTargets')));
        }
        const response = await this.raw.stepInTargets({ frameId });
        return response?.body.targets;
    }
    async cancel(progressId) {
        if (!this.raw) {
            return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'cancel')));
        }
        return this.raw.cancel({ progressId });
    }
    async disassemble(memoryReference, offset, instructionOffset, instructionCount) {
        if (!this.raw) {
            return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'disassemble')));
        }
        const response = await this.raw.disassemble({ memoryReference, offset, instructionOffset, instructionCount, resolveSymbols: true });
        return response?.body?.instructions;
    }
    readMemory(memoryReference, offset, count) {
        if (!this.raw) {
            return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'readMemory')));
        }
        return this.raw.readMemory({ count, memoryReference, offset });
    }
    writeMemory(memoryReference, offset, data, allowPartial) {
        if (!this.raw) {
            return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'disassemble')));
        }
        return this.raw.writeMemory({ memoryReference, offset, allowPartial, data });
    }
    async resolveLocationReference(locationReference) {
        if (!this.raw) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'locations'));
        }
        const location = await this.raw.locations({ locationReference });
        if (!location?.body) {
            throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'locations'));
        }
        const source = this.getSource(location.body.source);
        return { column: 1, ...location.body, source };
    }
    //---- threads
    getThread(threadId) {
        return this.threads.get(threadId);
    }
    getAllThreads() {
        const result = [];
        this.threadIds.forEach((threadId) => {
            const thread = this.threads.get(threadId);
            if (thread) {
                result.push(thread);
            }
        });
        return result;
    }
    clearThreads(removeThreads, reference = undefined) {
        if (reference !== undefined && reference !== null) {
            const thread = this.threads.get(reference);
            if (thread) {
                thread.clearCallStack();
                thread.stoppedDetails = undefined;
                thread.stopped = false;
                if (removeThreads) {
                    this.threads.delete(reference);
                }
            }
        }
        else {
            this.threads.forEach(thread => {
                thread.clearCallStack();
                thread.stoppedDetails = undefined;
                thread.stopped = false;
            });
            if (removeThreads) {
                this.threads.clear();
                this.threadIds = [];
                ExpressionContainer.allValues.clear();
            }
        }
    }
    getStoppedDetails() {
        return this.stoppedDetails.length >= 1 ? this.stoppedDetails[0] : undefined;
    }
    rawUpdate(data) {
        this.threadIds = [];
        data.threads.forEach(thread => {
            this.threadIds.push(thread.id);
            if (!this.threads.has(thread.id)) {
                // A new thread came in, initialize it.
                this.threads.set(thread.id, new Thread(this, thread.name, thread.id));
            }
            else if (thread.name) {
                // Just the thread name got updated #18244
                const oldThread = this.threads.get(thread.id);
                if (oldThread) {
                    oldThread.name = thread.name;
                }
            }
        });
        this.threads.forEach(t => {
            // Remove all old threads which are no longer part of the update #75980
            if (this.threadIds.indexOf(t.threadId) === -1) {
                this.threads.delete(t.threadId);
            }
        });
        const stoppedDetails = data.stoppedDetails;
        if (stoppedDetails) {
            // Set the availability of the threads' callstacks depending on
            // whether the thread is stopped or not
            if (stoppedDetails.allThreadsStopped) {
                this.threads.forEach(thread => {
                    thread.stoppedDetails = thread.threadId === stoppedDetails.threadId ? stoppedDetails : { reason: thread.stoppedDetails?.reason };
                    thread.stopped = true;
                    thread.clearCallStack();
                });
            }
            else {
                const thread = typeof stoppedDetails.threadId === 'number' ? this.threads.get(stoppedDetails.threadId) : undefined;
                if (thread) {
                    // One thread is stopped, only update that thread.
                    thread.stoppedDetails = stoppedDetails;
                    thread.clearCallStack();
                    thread.stopped = true;
                }
            }
        }
    }
    waitForTriggeredBreakpoints() {
        if (!this._waitToResume) {
            return;
        }
        return raceTimeout(this._waitToResume, TRIGGERED_BREAKPOINT_MAX_DELAY);
    }
    async fetchThreads(stoppedDetails) {
        if (this.raw) {
            const response = await this.raw.threads();
            if (response?.body && response.body.threads) {
                this.model.rawUpdate({
                    sessionId: this.getId(),
                    threads: response.body.threads,
                    stoppedDetails
                });
            }
        }
    }
    initializeForTest(raw) {
        this.raw = raw;
        this.registerListeners();
    }
    //---- private
    registerListeners() {
        if (!this.raw) {
            return;
        }
        this.rawListeners.add(this.raw.onDidInitialize(async () => {
            aria.status(this.configuration.noDebug
                ? localize('debuggingStartedNoDebug', "Started running without debugging.")
                : localize('debuggingStarted', "Debugging started."));
            const sendConfigurationDone = async () => {
                if (this.raw && this.raw.capabilities.supportsConfigurationDoneRequest) {
                    try {
                        await this.raw.configurationDone();
                    }
                    catch (e) {
                        // Disconnect the debug session on configuration done error #10596
                        this.notificationService.error(e);
                        this.raw?.disconnect({});
                    }
                }
                return undefined;
            };
            // Send all breakpoints
            try {
                await this.debugService.sendAllBreakpoints(this);
            }
            finally {
                await sendConfigurationDone();
                await this.fetchThreads();
            }
        }));
        const statusQueue = this.statusQueue;
        this.rawListeners.add(this.raw.onDidStop(event => this.handleStop(event.body)));
        this.rawListeners.add(this.raw.onDidThread(event => {
            statusQueue.cancel([event.body.threadId]);
            if (event.body.reason === 'started') {
                if (!this.fetchThreadsScheduler.value.isScheduled()) {
                    this.fetchThreadsScheduler.value.schedule();
                }
            }
            else if (event.body.reason === 'exited') {
                this.model.clearThreads(this.getId(), true, event.body.threadId);
                const viewModel = this.debugService.getViewModel();
                const focusedThread = viewModel.focusedThread;
                this.passFocusScheduler.cancel();
                if (focusedThread && event.body.threadId === focusedThread.threadId) {
                    // De-focus the thread in case it was focused
                    this.debugService.focusStackFrame(undefined, undefined, viewModel.focusedSession, { explicit: false });
                }
            }
        }));
        this.rawListeners.add(this.raw.onDidTerminateDebugee(async (event) => {
            aria.status(localize('debuggingStopped', "Debugging stopped."));
            if (event.body && event.body.restart) {
                await this.debugService.restartSession(this, event.body.restart);
            }
            else if (this.raw) {
                await this.raw.disconnect({ terminateDebuggee: false });
            }
        }));
        this.rawListeners.add(this.raw.onDidContinued(async (event) => {
            const allThreads = event.body.allThreadsContinued !== false;
            let affectedThreads;
            if (!allThreads) {
                affectedThreads = [event.body.threadId];
                if (this.threadIds.includes(event.body.threadId)) {
                    affectedThreads = [event.body.threadId];
                }
                else {
                    this.fetchThreadsScheduler.rawValue?.cancel();
                    affectedThreads = this.fetchThreads().then(() => [event.body.threadId]);
                }
            }
            else if (this.fetchThreadsScheduler.value.isScheduled()) {
                this.fetchThreadsScheduler.value.cancel();
                affectedThreads = this.fetchThreads().then(() => this.threadIds);
            }
            else {
                affectedThreads = this.threadIds;
            }
            statusQueue.cancel(allThreads ? undefined : [event.body.threadId]);
            await statusQueue.run(affectedThreads, threadId => {
                this.stoppedDetails = this.stoppedDetails.filter(sd => sd.threadId !== threadId);
                const tokens = this.cancellationMap.get(threadId);
                this.cancellationMap.delete(threadId);
                tokens?.forEach(t => t.dispose(true));
                this.model.clearThreads(this.getId(), false, threadId);
                return Promise.resolve();
            });
            // We need to pass focus to other sessions / threads with a timeout in case a quick stop event occurs #130321
            this.lastContinuedThreadId = allThreads ? undefined : event.body.threadId;
            this.passFocusScheduler.schedule();
            this._onDidChangeState.fire();
        }));
        const outputQueue = new Queue();
        this.rawListeners.add(this.raw.onDidOutput(async (event) => {
            const outputSeverity = event.body.category === 'stderr' ? Severity.Error : event.body.category === 'console' ? Severity.Warning : Severity.Info;
            // When a variables event is received, execute immediately to obtain the variables value #126967
            if (event.body.variablesReference) {
                const source = event.body.source && event.body.line ? {
                    lineNumber: event.body.line,
                    column: event.body.column ? event.body.column : 1,
                    source: this.getSource(event.body.source)
                } : undefined;
                const container = new ExpressionContainer(this, undefined, event.body.variablesReference, generateUuid());
                const children = container.getChildren();
                // we should put appendToRepl into queue to make sure the logs to be displayed in correct order
                // see https://github.com/microsoft/vscode/issues/126967#issuecomment-874954269
                outputQueue.queue(async () => {
                    const resolved = await children;
                    // For single logged variables, try to use the output if we can so
                    // present a better (i.e. ANSI-aware) representation of the output
                    if (resolved.length === 1) {
                        this.appendToRepl({ output: event.body.output, expression: resolved[0], sev: outputSeverity, source }, event.body.category === 'important');
                        return;
                    }
                    resolved.forEach((child) => {
                        // Since we can not display multiple trees in a row, we are displaying these variables one after the other (ignoring their names)
                        // eslint-disable-next-line local/code-no-any-casts
                        child.name = null;
                        this.appendToRepl({ output: '', expression: child, sev: outputSeverity, source }, event.body.category === 'important');
                    });
                });
                return;
            }
            outputQueue.queue(async () => {
                if (!event.body || !this.raw) {
                    return;
                }
                if (event.body.category === 'telemetry') {
                    // only log telemetry events from debug adapter if the debug extension provided the telemetry key
                    // and the user opted in telemetry
                    const telemetryEndpoint = this.raw.dbgr.getCustomTelemetryEndpoint();
                    if (telemetryEndpoint && this.telemetryService.telemetryLevel !== 0 /* TelemetryLevel.NONE */) {
                        // __GDPR__TODO__ We're sending events in the name of the debug extension and we can not ensure that those are declared correctly.
                        let data = event.body.data;
                        if (!telemetryEndpoint.sendErrorTelemetry && event.body.data) {
                            data = filterExceptionsFromTelemetry(event.body.data);
                        }
                        this.customEndpointTelemetryService.publicLog(telemetryEndpoint, event.body.output, data);
                    }
                    return;
                }
                // Make sure to append output in the correct order by properly waiting on preivous promises #33822
                const source = event.body.source && event.body.line ? {
                    lineNumber: event.body.line,
                    column: event.body.column ? event.body.column : 1,
                    source: this.getSource(event.body.source)
                } : undefined;
                if (event.body.group === 'start' || event.body.group === 'startCollapsed') {
                    const expanded = event.body.group === 'start';
                    this.repl.startGroup(this, event.body.output || '', expanded, source);
                    return;
                }
                if (event.body.group === 'end') {
                    this.repl.endGroup();
                    if (!event.body.output) {
                        // Only return if the end event does not have additional output in it
                        return;
                    }
                }
                if (typeof event.body.output === 'string') {
                    this.appendToRepl({ output: event.body.output, sev: outputSeverity, source }, event.body.category === 'important');
                }
            });
        }));
        this.rawListeners.add(this.raw.onDidBreakpoint(event => {
            const id = event.body && event.body.breakpoint ? event.body.breakpoint.id : undefined;
            const breakpoint = this.model.getBreakpoints().find(bp => bp.getIdFromAdapter(this.getId()) === id);
            const functionBreakpoint = this.model.getFunctionBreakpoints().find(bp => bp.getIdFromAdapter(this.getId()) === id);
            const dataBreakpoint = this.model.getDataBreakpoints().find(dbp => dbp.getIdFromAdapter(this.getId()) === id);
            const exceptionBreakpoint = this.model.getExceptionBreakpoints().find(excbp => excbp.getIdFromAdapter(this.getId()) === id);
            if (event.body.reason === 'new' && event.body.breakpoint.source && event.body.breakpoint.line) {
                const source = this.getSource(event.body.breakpoint.source);
                const bps = this.model.addBreakpoints(source.uri, [{
                        column: event.body.breakpoint.column,
                        enabled: true,
                        lineNumber: event.body.breakpoint.line,
                    }], false);
                if (bps.length === 1) {
                    const data = new Map([[bps[0].getId(), event.body.breakpoint]]);
                    this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
                }
            }
            if (event.body.reason === 'removed') {
                if (breakpoint) {
                    this.model.removeBreakpoints([breakpoint]);
                }
                if (functionBreakpoint) {
                    this.model.removeFunctionBreakpoints(functionBreakpoint.getId());
                }
                if (dataBreakpoint) {
                    this.model.removeDataBreakpoints(dataBreakpoint.getId());
                }
            }
            if (event.body.reason === 'changed') {
                if (breakpoint) {
                    if (!breakpoint.column) {
                        event.body.breakpoint.column = undefined;
                    }
                    const data = new Map([[breakpoint.getId(), event.body.breakpoint]]);
                    this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
                }
                if (functionBreakpoint) {
                    const data = new Map([[functionBreakpoint.getId(), event.body.breakpoint]]);
                    this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
                }
                if (dataBreakpoint) {
                    const data = new Map([[dataBreakpoint.getId(), event.body.breakpoint]]);
                    this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
                }
                if (exceptionBreakpoint) {
                    const data = new Map([[exceptionBreakpoint.getId(), event.body.breakpoint]]);
                    this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
                }
            }
        }));
        this.rawListeners.add(this.raw.onDidLoadedSource(event => {
            this._onDidLoadedSource.fire({
                reason: event.body.reason,
                source: this.getSource(event.body.source)
            });
        }));
        this.rawListeners.add(this.raw.onDidCustomEvent(event => {
            this._onDidCustomEvent.fire(event);
        }));
        this.rawListeners.add(this.raw.onDidProgressStart(event => {
            this._onDidProgressStart.fire(event);
        }));
        this.rawListeners.add(this.raw.onDidProgressUpdate(event => {
            this._onDidProgressUpdate.fire(event);
        }));
        this.rawListeners.add(this.raw.onDidProgressEnd(event => {
            this._onDidProgressEnd.fire(event);
        }));
        this.rawListeners.add(this.raw.onDidInvalidateMemory(event => {
            this._onDidInvalidMemory.fire(event);
        }));
        this.rawListeners.add(this.raw.onDidInvalidated(async (event) => {
            const areas = event.body.areas || ['all'];
            // If invalidated event only requires to update variables or watch, do that, otherwise refetch threads https://github.com/microsoft/vscode/issues/106745
            if (areas.includes('threads') || areas.includes('stacks') || areas.includes('all')) {
                this.cancelAllRequests();
                this.model.clearThreads(this.getId(), true);
                const details = this.stoppedDetails.slice();
                this.stoppedDetails.length = 0;
                if (details.length) {
                    await Promise.all(details.map(d => this.handleStop(d)));
                }
                else if (!this.fetchThreadsScheduler.value.isScheduled()) {
                    // threads are fetched as a side-effect of processing the stopped
                    // event(s), but if there are none, schedule a thread update manually (#282777)
                    this.fetchThreadsScheduler.value.schedule();
                }
            }
            const viewModel = this.debugService.getViewModel();
            if (viewModel.focusedSession === this) {
                viewModel.updateViews();
            }
        }));
        this.rawListeners.add(this.raw.onDidExitAdapter(event => this.onDidExitAdapter(event)));
    }
    async handleStop(event) {
        this.passFocusScheduler.cancel();
        this.stoppedDetails.push(event);
        // do this very eagerly if we have hitBreakpointIds, since it may take a
        // moment for breakpoints to set and we want to do our best to not miss
        // anything
        if (event.hitBreakpointIds) {
            this._waitToResume = this.enableDependentBreakpoints(event.hitBreakpointIds);
        }
        this.statusQueue.run(this.fetchThreads(event).then(() => event.threadId === undefined ? this.threadIds : [event.threadId]), async (threadId, token) => {
            const hasLotsOfThreads = event.threadId === undefined && this.threadIds.length > 10;
            // If the focus for the current session is on a non-existent thread, clear the focus.
            const focusedThread = this.debugService.getViewModel().focusedThread;
            const focusedThreadDoesNotExist = focusedThread !== undefined && focusedThread.session === this && !this.threads.has(focusedThread.threadId);
            if (focusedThreadDoesNotExist) {
                this.debugService.focusStackFrame(undefined, undefined);
            }
            const thread = typeof threadId === 'number' ? this.getThread(threadId) : undefined;
            if (thread) {
                // Call fetch call stack twice, the first only return the top stack frame.
                // Second retrieves the rest of the call stack. For performance reasons #25605
                // Second call is only done if there's few threads that stopped in this event.
                const promises = this.model.refreshTopOfCallstack(thread, /* fetchFullStack= */ !hasLotsOfThreads);
                const focus = async () => {
                    if (focusedThreadDoesNotExist || (!event.preserveFocusHint && thread.getCallStack().length)) {
                        const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
                        if (!focusedStackFrame || focusedStackFrame.thread.session === this) {
                            // Only take focus if nothing is focused, or if the focus is already on the current session
                            const preserveFocus = !this.configurationService.getValue('debug').focusEditorOnBreak;
                            await this.debugService.focusStackFrame(undefined, thread, undefined, { preserveFocus });
                        }
                        if (thread.stoppedDetails && !token.isCancellationRequested) {
                            if (thread.stoppedDetails.reason === 'breakpoint' && this.configurationService.getValue('debug').openDebug === 'openOnDebugBreak' && !this.suppressDebugView) {
                                await this.paneCompositeService.openPaneComposite(VIEWLET_ID, 0 /* ViewContainerLocation.Sidebar */);
                            }
                            if (this.configurationService.getValue('debug').focusWindowOnBreak && !this.workbenchEnvironmentService.extensionTestsLocationURI) {
                                const activeWindow = getActiveWindow();
                                if (!activeWindow.document.hasFocus()) {
                                    await this.hostService.focus(mainWindow, { mode: 2 /* FocusMode.Force */ /* Application may not be active */ });
                                }
                            }
                        }
                    }
                };
                await promises.topCallStack;
                if (!event.hitBreakpointIds) { // if hitBreakpointIds are present, this is handled earlier on
                    this._waitToResume = this.enableDependentBreakpoints(thread);
                }
                if (token.isCancellationRequested) {
                    return;
                }
                focus();
                await promises.wholeCallStack;
                if (token.isCancellationRequested) {
                    return;
                }
                const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
                if (!focusedStackFrame || isFrameDeemphasized(focusedStackFrame)) {
                    // The top stack frame can be deemphesized so try to focus again #68616
                    focus();
                }
            }
            this._onDidChangeState.fire();
        });
    }
    async enableDependentBreakpoints(hitBreakpointIdsOrThread) {
        let breakpoints;
        if (Array.isArray(hitBreakpointIdsOrThread)) {
            breakpoints = this.model.getBreakpoints().filter(bp => hitBreakpointIdsOrThread.includes(bp.getIdFromAdapter(this.id)));
        }
        else {
            const frame = hitBreakpointIdsOrThread.getTopStackFrame();
            if (frame === undefined) {
                return;
            }
            if (hitBreakpointIdsOrThread.stoppedDetails && hitBreakpointIdsOrThread.stoppedDetails.reason !== 'breakpoint') {
                return;
            }
            breakpoints = this.getBreakpointsAtPosition(frame.source.uri, frame.range.startLineNumber, frame.range.endLineNumber, frame.range.startColumn, frame.range.endColumn);
        }
        // find the current breakpoints
        // check if the current breakpoints are dependencies, and if so collect and send the dependents to DA
        const urisToResend = new Set();
        this.model.getBreakpoints({ triggeredOnly: true, enabledOnly: true }).forEach(bp => {
            breakpoints.forEach(cbp => {
                if (bp.enabled && bp.triggeredBy === cbp.getId()) {
                    bp.setSessionDidTrigger(this.getId());
                    urisToResend.add(bp.uri.toString());
                }
            });
        });
        const results = [];
        urisToResend.forEach((uri) => results.push(this.debugService.sendBreakpoints(URI.parse(uri), undefined, this)));
        return Promise.all(results);
    }
    getBreakpointsAtPosition(uri, startLineNumber, endLineNumber, startColumn, endColumn) {
        return this.model.getBreakpoints({ uri: uri }).filter(bp => {
            if (bp.lineNumber < startLineNumber || bp.lineNumber > endLineNumber) {
                return false;
            }
            if (bp.column && (bp.column < startColumn || bp.column > endColumn)) {
                return false;
            }
            return true;
        });
    }
    onDidExitAdapter(event) {
        this.initialized = true;
        this.model.setBreakpointSessionData(this.getId(), this.capabilities, undefined);
        this.shutdown();
        this._onDidEndAdapter.fire(event);
    }
    // Disconnects and clears state. Session can be initialized again for a new connection.
    shutdown() {
        this.rawListeners.clear();
        if (this.raw) {
            // Send out disconnect and immediatly dispose (do not wait for response) #127418
            this.raw.disconnect({});
            this.raw.dispose();
            this.raw = undefined;
        }
        this.passFocusScheduler.cancel();
        this.passFocusScheduler.dispose();
        this.model.clearThreads(this.getId(), true);
        this.sources.clear();
        this.threads.clear();
        this.threadIds = [];
        this.stoppedDetails = [];
        this._onDidChangeState.fire();
    }
    dispose() {
        this.cancelAllRequests();
        this.rawListeners.dispose();
        this.globalDisposables.dispose();
        this._onDidChangeState.dispose();
        this._onDidEndAdapter.dispose();
        this._onDidLoadedSource.dispose();
        this._onDidCustomEvent.dispose();
        this._onDidProgressStart.dispose();
        this._onDidProgressUpdate.dispose();
        this._onDidProgressEnd.dispose();
        this._onDidInvalidMemory.dispose();
        this._onDidChangeREPLElements.dispose();
        this._onDidChangeName.dispose();
        this._waitToResume = undefined;
    }
    //---- sources
    getSourceForUri(uri) {
        return this.sources.get(this.uriIdentityService.asCanonicalUri(uri).toString());
    }
    getSource(raw) {
        let source = new Source(raw, this.getId(), this.uriIdentityService, this.logService);
        const uriKey = source.uri.toString();
        const found = this.sources.get(uriKey);
        if (found) {
            source = found;
            // merge attributes of new into existing
            source.raw = mixin(source.raw, raw);
            if (source.raw && raw) {
                // Always take the latest presentation hint from adapter #42139
                source.raw.presentationHint = raw.presentationHint;
            }
        }
        else {
            this.sources.set(uriKey, source);
        }
        return source;
    }
    getRawSource(uri) {
        const source = this.getSourceForUri(uri);
        if (source) {
            return source.raw;
        }
        else {
            const data = Source.getEncodedDebugData(uri);
            return { name: data.name, path: data.path, sourceReference: data.sourceReference };
        }
    }
    getNewCancellationToken(threadId, token) {
        const tokenSource = new CancellationTokenSource(token);
        const tokens = this.cancellationMap.get(threadId) || [];
        tokens.push(tokenSource);
        this.cancellationMap.set(threadId, tokens);
        return tokenSource.token;
    }
    cancelAllRequests() {
        this.cancellationMap.forEach(tokens => tokens.forEach(t => t.dispose(true)));
        this.cancellationMap.clear();
    }
    // REPL
    getReplElements() {
        return this.repl.getReplElements();
    }
    hasSeparateRepl() {
        return !this.parentSession || this._options.repl !== 'mergeWithParent';
    }
    removeReplExpressions() {
        this.repl.removeReplExpressions();
    }
    async addReplExpression(stackFrame, expression) {
        await this.repl.addReplExpression(this, stackFrame, expression);
        // Evaluate all watch expressions and fetch variables again since repl evaluation might have changed some.
        this.debugService.getViewModel().updateViews();
    }
    appendToRepl(data, isImportant) {
        this.repl.appendToRepl(this, data);
        if (isImportant) {
            this.notificationService.notify({ message: data.output.toString(), severity: data.sev, source: this.name });
        }
    }
};
DebugSession = __decorate([
    __param(5, IDebugService),
    __param(6, ITelemetryService),
    __param(7, IHostService),
    __param(8, IConfigurationService),
    __param(9, IPaneCompositePartService),
    __param(10, IWorkspaceContextService),
    __param(11, IProductService),
    __param(12, INotificationService),
    __param(13, ILifecycleService),
    __param(14, IUriIdentityService),
    __param(15, IInstantiationService),
    __param(16, ICustomEndpointTelemetryService),
    __param(17, IWorkbenchEnvironmentService),
    __param(18, ILogService),
    __param(19, ITestService),
    __param(20, ITestResultService),
    __param(21, IAccessibilityService)
], DebugSession);
export { DebugSession };
/**
 * Keeps track of events for threads, and cancels any previous operations for
 * a thread when the thread goes into a new state. Currently, the operations a thread has are:
 *
 * - started
 * - stopped
 * - continue
 * - exited
 *
 * In each case, the new state preempts the old state, so we don't need to
 * queue work, just cancel old work. It's up to the caller to make sure that
 * no UI effects happen at the point when the `token` is cancelled.
 */
export class ThreadStatusScheduler extends Disposable {
    constructor() {
        super(...arguments);
        /**
         * An array of set of thread IDs. When a 'stopped' event is encountered, the
         * editor refreshes its thread IDs. In the meantime, the thread may change
         * state it again. So the editor puts a Set into this array when it starts
         * the refresh, and checks it after the refresh is finished, to see if
         * any of the threads it looked up should now be invalidated.
         */
        this.pendingCancellations = [];
        /**
         * Cancellation tokens for currently-running operations on threads.
         */
        this.threadOps = this._register(new DisposableMap());
    }
    /**
     * Runs the operation.
     * If thread is undefined it affects all threads.
     */
    async run(threadIdsP, operation) {
        const cancelledWhileLookingUpThreads = new Set();
        this.pendingCancellations.push(cancelledWhileLookingUpThreads);
        const threadIds = await threadIdsP;
        // Now that we got our threads,
        // 1. Remove our pending set, and
        // 2. Cancel any slower callers who might also have found this thread
        for (let i = 0; i < this.pendingCancellations.length; i++) {
            const s = this.pendingCancellations[i];
            if (s === cancelledWhileLookingUpThreads) {
                this.pendingCancellations.splice(i, 1);
                break;
            }
            else {
                for (const threadId of threadIds) {
                    s.add(threadId);
                }
            }
        }
        if (cancelledWhileLookingUpThreads.has(undefined)) {
            return;
        }
        await Promise.all(threadIds.map(threadId => {
            if (cancelledWhileLookingUpThreads.has(threadId)) {
                return;
            }
            this.threadOps.get(threadId)?.cancel();
            const cts = new CancellationTokenSource();
            this.threadOps.set(threadId, cts);
            return operation(threadId, cts.token);
        }));
    }
    /**
     * Cancels all ongoing state operations on the given threads.
     * If threads is undefined it cancel all threads.
     */
    cancel(threadIds) {
        if (!threadIds) {
            for (const [_, op] of this.threadOps) {
                op.cancel();
            }
            this.threadOps.clearAndDisposeAll();
            for (const s of this.pendingCancellations) {
                s.add(undefined);
            }
        }
        else {
            for (const threadId of threadIds) {
                this.threadOps.get(threadId)?.cancel();
                this.threadOps.deleteAndDispose(threadId);
                for (const s of this.pendingCancellations) {
                    s.add(threadId);
                }
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdTZXNzaW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9kZWJ1Z1Nlc3Npb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2xFLE9BQU8sS0FBSyxJQUFJLE1BQU0sMENBQTBDLENBQUM7QUFDakUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hGLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDOUgsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNELE9BQU8sS0FBSyxRQUFRLE1BQU0scUNBQXFDLENBQUM7QUFDaEUsT0FBTyxLQUFLLFNBQVMsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXJFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsK0JBQStCLEVBQUUsaUJBQWlCLEVBQWtCLE1BQU0sb0RBQW9ELENBQUM7QUFDeEksT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLHdCQUF3QixFQUFvQixNQUFNLG9EQUFvRCxDQUFDO0FBRWhILE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNwRixPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUVyRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbkUsT0FBTyxFQUFzSSxhQUFhLEVBQXVQLFVBQVUsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTdjLE9BQU8sRUFBYyxtQkFBbUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ2xELE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3hFLE9BQU8sRUFBdUIsU0FBUyxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDeEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRXZELE1BQU0sOEJBQThCLEdBQUcsSUFBSSxDQUFDO0FBRXJDLElBQU0sWUFBWSxHQUFsQixNQUFNLFlBQVk7SUFzRHhCLFlBQ1MsRUFBVSxFQUNWLGNBQXNFLEVBQ3ZFLElBQWtDLEVBQ2pDLEtBQWlCLEVBQ3pCLE9BQXlDLEVBQzFCLFlBQTRDLEVBQ3hDLGdCQUFvRCxFQUN6RCxXQUEwQyxFQUNqQyxvQkFBNEQsRUFDeEQsb0JBQWdFLEVBQ2pFLHVCQUFrRSxFQUMzRSxjQUFnRCxFQUMzQyxtQkFBMEQsRUFDN0QsZ0JBQW1DLEVBQ2pDLGtCQUF3RCxFQUN0RCxvQkFBNEQsRUFDbEQsOEJBQWdGLEVBQ25GLDJCQUEwRSxFQUMzRixVQUF3QyxFQUN2QyxXQUEwQyxFQUNwQyxpQkFBcUMsRUFDbEMsb0JBQTREO1FBckIzRSxPQUFFLEdBQUYsRUFBRSxDQUFRO1FBQ1YsbUJBQWMsR0FBZCxjQUFjLENBQXdEO1FBQ3ZFLFNBQUksR0FBSixJQUFJLENBQThCO1FBQ2pDLFVBQUssR0FBTCxLQUFLLENBQVk7UUFFTyxpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUN2QixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO1FBQ3hDLGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ2hCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDdkMseUJBQW9CLEdBQXBCLG9CQUFvQixDQUEyQjtRQUNoRCw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQTBCO1FBQzFELG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQUMxQix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXNCO1FBRTFDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFDckMseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUNqQyxtQ0FBOEIsR0FBOUIsOEJBQThCLENBQWlDO1FBQ2xFLGdDQUEyQixHQUEzQiwyQkFBMkIsQ0FBOEI7UUFDMUUsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUN0QixnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQUVoQix5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBdEU1RSxnQkFBVyxHQUFHLEtBQUssQ0FBQztRQUdwQixZQUFPLEdBQUcsSUFBSSxHQUFHLEVBQWtCLENBQUM7UUFDcEMsWUFBTyxHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO1FBQ3BDLGNBQVMsR0FBYSxFQUFFLENBQUM7UUFDekIsb0JBQWUsR0FBRyxJQUFJLEdBQUcsRUFBcUMsQ0FBQztRQUN0RCxpQkFBWSxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDckMsc0JBQWlCLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNuRCwwQkFBcUIsR0FBRyxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDN0MsTUFBTSxJQUFJLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUU7Z0JBQ3RDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNyQixDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDUixJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1QixPQUFPLElBQUksQ0FBQztRQUNiLENBQUMsQ0FBQyxDQUFDO1FBSUssbUJBQWMsR0FBeUIsRUFBRSxDQUFDO1FBQ2pDLGdCQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxxQkFBcUIsRUFBRSxDQUFDLENBQUM7UUFPakUsc0JBQWlCLEdBQUcsSUFBSSxPQUFPLEVBQVEsQ0FBQztRQUN4QyxxQkFBZ0IsR0FBRyxJQUFJLE9BQU8sRUFBK0IsQ0FBQztRQUU5RCx1QkFBa0IsR0FBRyxJQUFJLE9BQU8sRUFBcUIsQ0FBQztRQUN0RCxzQkFBaUIsR0FBRyxJQUFJLE9BQU8sRUFBdUIsQ0FBQztRQUN2RCx3QkFBbUIsR0FBRyxJQUFJLE9BQU8sRUFBb0MsQ0FBQztRQUN0RSx5QkFBb0IsR0FBRyxJQUFJLE9BQU8sRUFBcUMsQ0FBQztRQUN4RSxzQkFBaUIsR0FBRyxJQUFJLE9BQU8sRUFBa0MsQ0FBQztRQUNsRSx3QkFBbUIsR0FBRyxJQUFJLE9BQU8sRUFBNkIsQ0FBQztRQUUvRCw2QkFBd0IsR0FBRyxJQUFJLE9BQU8sRUFBNEIsQ0FBQztRQUduRSxxQkFBZ0IsR0FBRyxJQUFJLE9BQU8sRUFBVSxDQUFDO1FBZ0N6RCxJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sSUFBSSxFQUFFLENBQUM7UUFDOUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQztRQUNqRCxJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDdEQsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsSUFBSSxHQUFJLElBQUksQ0FBQyxhQUE4QixDQUFDLElBQUksQ0FBQztRQUN2RCxDQUFDO1FBRUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDO1FBQ3pDLE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFDNUQsWUFBWSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakcsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3RCLFNBQVMsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxDQUFDLEdBQUcsRUFBRTtnQkFDbEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNoQixPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDcEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxpRkFBaUY7UUFDakYsSUFBSSxDQUFDLGlCQUFpQixHQUFHLE9BQU8sRUFBRSxPQUFPO1lBQ3hDLENBQUMsQ0FBRSxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQW9CO1lBQ3hFLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLGlCQUFpQixDQUFDO1FBRXpDLElBQUksSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDNUIsc0hBQXNIO1lBQ3RILFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFFLENBQUM7UUFFRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQztRQUNoRCxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2xCLFNBQVMsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdEUsQ0FBQztRQUNELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLGdCQUFnQixDQUFDLEdBQUcsRUFBRTtZQUNuRCxzRUFBc0U7WUFDdEUsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLDBCQUFrQixDQUFDLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNsSSxJQUFJLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUNwRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxDQUFDLGFBQWEsQ0FBQztvQkFDOUQsSUFBSSxNQUFNLElBQUksTUFBTSxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMscUJBQXFCLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7d0JBQ2pGLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxFQUFFLFFBQVEsQ0FBQzt3QkFDM0QsTUFBTSxhQUFhLEdBQUcsT0FBTyxlQUFlLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7d0JBQ3hHLElBQUksQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDLFNBQVMsRUFBRSxhQUFhLENBQUMsQ0FBQztvQkFDN0QsQ0FBQztnQkFDRixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxjQUFjLENBQUM7b0JBQ2hFLElBQUksT0FBTyxJQUFJLE9BQU8sQ0FBQyxLQUFLLEVBQUUsS0FBSyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksT0FBTyxDQUFDLEtBQUssMEJBQWtCLEVBQUUsQ0FBQzt3QkFDcEYsSUFBSSxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQzlDLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFFUixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQztRQUMzQyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osU0FBUyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRTtnQkFDekMsdUVBQXVFO2dCQUN2RSwyQ0FBMkM7Z0JBQzNDLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxZQUFZLEtBQUssS0FBSyxFQUFFLENBQUM7b0JBQ2pFLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDOUIsWUFBWSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2pHLElBQUksQ0FBQyxhQUFhLEdBQUcsU0FBUyxDQUFDO2dCQUNoQyxDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSztRQUNKLE9BQU8sSUFBSSxDQUFDLEVBQUUsQ0FBQztJQUNoQixDQUFDO0lBRUQsUUFBUSxDQUFDLEtBQXlCO1FBQ2pDLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxTQUFTLENBQUMsZUFBdUI7UUFDaEMsT0FBTyxJQUFJLFlBQVksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELElBQUksS0FBSztRQUNSLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUNwQixDQUFDO0lBRUQsSUFBSSxhQUFhO1FBQ2hCLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUM7SUFDckMsQ0FBQztJQUVELElBQUksdUJBQXVCO1FBQzFCLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUM7SUFDdkMsQ0FBQztJQUVELElBQUksd0JBQXdCO1FBQzNCLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsd0JBQXdCLENBQUM7SUFDakQsQ0FBQztJQUVELElBQUksT0FBTztRQUNWLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDO0lBQ2hDLENBQUM7SUFFRCxJQUFJLGlCQUFpQjtRQUNwQixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsaUJBQWlCLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLGFBQWEsQ0FBQztJQUN6RSxDQUFDO0lBRUQsSUFBSSxZQUFZO1FBQ2YsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQztJQUNuQyxDQUFDO0lBRUQsSUFBSSxzQkFBc0I7UUFDekIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLHNCQUFzQixJQUFJLEtBQUssQ0FBQztJQUN0RCxDQUFDO0lBRUQsSUFBSSxvQkFBb0I7UUFDdkIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLG9CQUFvQixJQUFJLEtBQUssQ0FBQztJQUNwRCxDQUFDO0lBRUQsSUFBSSxpQkFBaUI7UUFDcEIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLGlCQUFpQixJQUFJLEtBQUssQ0FBQztJQUNqRCxDQUFDO0lBR0QsSUFBSSx1QkFBdUI7UUFDMUIscUZBQXFGO1FBQ3JGLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDbEYsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBc0IsT0FBTyxDQUFDLENBQUMsdUJBQXVCLENBQUM7UUFDdkcsT0FBTyxLQUFLLEtBQUssTUFBTSxJQUFJLHFCQUFxQixJQUFJLEtBQUssS0FBSyxJQUFJLENBQUM7SUFDcEUsQ0FBQztJQUVELGdCQUFnQixDQUFDLGFBQXFFO1FBQ3JGLElBQUksQ0FBQyxjQUFjLEdBQUcsYUFBYSxDQUFDO0lBQ3JDLENBQUM7SUFFRCxRQUFRO1FBQ1AsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFlBQVksRUFBRSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ25GLE9BQU8sV0FBVyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksS0FBSyxTQUFTLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0lBQ2hILENBQUM7SUFFRCxPQUFPLENBQUMsSUFBWTtRQUNuQixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNsQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFRCxJQUFJLElBQUk7UUFDUCxPQUFPLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUM7SUFDOUMsQ0FBQztJQUVELElBQUksS0FBSztRQUNSLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDdkIsa0NBQTBCO1FBQzNCLENBQUM7UUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2YsOEJBQXNCO1FBQ3ZCLENBQUM7UUFFRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxDQUFDLGFBQWEsQ0FBQztRQUNyRSxJQUFJLGFBQWEsSUFBSSxhQUFhLENBQUMsT0FBTyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3JELE9BQU8sYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLHVCQUFlLENBQUMsc0JBQWMsQ0FBQztRQUM5RCxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDL0MsNkJBQXFCO1FBQ3RCLENBQUM7UUFFRCw2QkFBcUI7SUFDdEIsQ0FBQztJQUVELElBQUksWUFBWTtRQUNmLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUVELGFBQWE7SUFDYixJQUFJLGdCQUFnQjtRQUNuQixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7SUFDckMsQ0FBQztJQUVELElBQUksZUFBZTtRQUNsQixPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUM7SUFDcEMsQ0FBQztJQUVELElBQUksdUJBQXVCO1FBQzFCLE9BQU8sSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQztJQUM1QyxDQUFDO0lBRUQsSUFBSSxlQUFlO1FBQ2xCLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQztJQUNwQyxDQUFDO0lBRUQsaUJBQWlCO0lBRWpCLElBQUksZ0JBQWdCO1FBQ25CLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQztJQUNyQyxDQUFDO0lBRUQsSUFBSSxpQkFBaUI7UUFDcEIsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDO0lBQ3RDLENBQUM7SUFFRCxJQUFJLGtCQUFrQjtRQUNyQixPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7SUFDdkMsQ0FBQztJQUVELElBQUksbUJBQW1CO1FBQ3RCLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQztJQUN4QyxDQUFDO0lBRUQsSUFBSSxnQkFBZ0I7UUFDbkIsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDO0lBQ3JDLENBQUM7SUFFRCxJQUFJLHFCQUFxQjtRQUN4QixPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7SUFDdkMsQ0FBQztJQUVELG1CQUFtQjtJQUVuQjs7T0FFRztJQUNILEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBZTtRQUUvQixJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNkLHNFQUFzRTtZQUN0RSxNQUFNLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUN2QixDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0osTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDekQsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGVBQWUsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUUzSCxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDekIsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQztnQkFDekIsUUFBUSxFQUFFLFFBQVE7Z0JBQ2xCLFVBQVUsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVE7Z0JBQ3hDLFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUk7Z0JBQ2xDLFVBQVUsRUFBRSxNQUFNO2dCQUNsQixhQUFhLEVBQUUsSUFBSTtnQkFDbkIsZUFBZSxFQUFFLElBQUk7Z0JBQ3JCLG9CQUFvQixFQUFFLElBQUksRUFBRSxRQUFRO2dCQUNwQyxzQkFBc0IsRUFBRSxJQUFJLEVBQUUsUUFBUTtnQkFDdEMsNEJBQTRCLEVBQUUsSUFBSSxFQUFFLFNBQVM7Z0JBQzdDLE1BQU0sRUFBRSxRQUFRLENBQUMsUUFBUSxFQUFFLFVBQVU7Z0JBQ3JDLHlCQUF5QixFQUFFLElBQUksRUFBRSxTQUFTO2dCQUMxQyx3QkFBd0IsRUFBRSxJQUFJLEVBQUUsVUFBVTtnQkFDMUMsd0JBQXdCLEVBQUUsSUFBSSxFQUFFLFNBQVM7Z0JBQ3pDLG1DQUFtQyxFQUFFLElBQUksRUFBRSxVQUFVO2dCQUNyRCxtQkFBbUIsRUFBRSxJQUFJLEVBQUUsVUFBVTtnQkFDckMsNkJBQTZCLEVBQUUsSUFBSTtnQkFDbkMsbUJBQW1CLEVBQUUsSUFBSTthQUN6QixDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztZQUN4QixJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDOUIsSUFBSSxDQUFDLHNCQUFzQixHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDO1lBQ3BELElBQUksQ0FBQyxZQUFZLENBQUMsaUNBQWlDLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ2hJLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsZUFBZSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzVILENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7WUFDeEIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO1lBQzlCLE1BQU0sSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3RCLE1BQU0sR0FBRyxDQUFDO1FBQ1gsQ0FBQztJQUNGLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBZTtRQUNuQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsMkNBQTJDLEVBQUUsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO1FBQzlHLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxhQUFhLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLDJCQUFtQixFQUFFLENBQUM7WUFDdkUsTUFBTSxRQUFRLEVBQUUsQ0FBQztRQUNsQixDQUFDO1FBRUQsMkVBQTJFO1FBQzNFLE1BQU0sQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2xDLElBQUksQ0FBQztZQUNKLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdkMsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDaEIsTUFBTSxHQUFHLENBQUM7UUFDWCxDQUFDO0lBQ0YsQ0FBQztJQUVEOztPQUVHO0lBQ0gsdUJBQXVCO1FBQ3RCLElBQUksSUFBSSxDQUFDLGlCQUFpQixJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ25FLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUM7WUFDaEMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzNELENBQUM7SUFDRixDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsU0FBUyxDQUFDLE9BQU8sR0FBRyxLQUFLO1FBQzlCLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixvR0FBb0c7WUFDcEcsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDekIsQ0FBQztRQUVELElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ3pCLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDbEUsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM3QyxDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsaUJBQWlCLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsV0FBVyxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDdkcsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDaEMsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsd0JBQXdCLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsT0FBTyxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUN6RyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ25DLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDakUsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxjQUFjLEVBQUUsQ0FBQztRQUM5QyxDQUFDO0lBQ0YsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFVBQVUsQ0FBQyxPQUFPLEdBQUcsS0FBSyxFQUFFLE9BQU8sR0FBRyxLQUFLO1FBQ2hELElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixvR0FBb0c7WUFDcEcsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDekIsQ0FBQztRQUVELElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ3pCLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDbEUsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDdkQsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLHlEQUF5RDtZQUN6RCxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUM1RixDQUFDO1FBRUQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsY0FBYyxFQUFFLENBQUM7UUFDOUMsQ0FBQztJQUNGLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxPQUFPO1FBQ1osSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDckcsQ0FBQztRQUVELElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ3pCLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDbEUsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BDLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQztRQUMzRCxDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxlQUFlLENBQUMsUUFBYSxFQUFFLGlCQUFnQyxFQUFFLGNBQXVCO1FBQzdGLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSwyQ0FBMkMsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDO1FBQ3pHLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQ25DLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNuQyxDQUFDO1FBRUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM5QyxJQUFJLGlCQUFpQixDQUFDLE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN4RCxTQUFTLENBQUMsV0FBVyxHQUFHLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQztRQUMxRCxDQUFDO1FBQ0QscUhBQXFIO1FBQ3JILElBQUksU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3BCLFNBQVMsQ0FBQyxJQUFJLEdBQUcsb0JBQW9CLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZELENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDO1lBQzlDLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUMsVUFBVSxDQUFDO1lBQ3JFLFdBQVcsRUFBRSxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDcEQsY0FBYztTQUNkLENBQUMsQ0FBQztRQUNILElBQUksUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDO1lBQ3BCLE1BQU0sSUFBSSxHQUFHLElBQUksR0FBRyxFQUFvQyxDQUFDO1lBQ3pELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDbkQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RFLENBQUM7WUFFRCxJQUFJLENBQUMsS0FBSyxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzVFLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEtBQTRCO1FBQ3pELElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSwyQ0FBMkMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFDbEgsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQ2xDLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLFdBQVcsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3JHLElBQUksUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDO2dCQUNwQixNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBb0MsQ0FBQztnQkFDekQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztvQkFDdkMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDMUQsQ0FBQztnQkFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzVFLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxNQUE4QjtRQUM1RCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsMkNBQTJDLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1FBQ25ILENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUNsQyxNQUFNLElBQUksR0FBbUQsSUFBSSxDQUFDLFlBQVksQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUM7Z0JBQy9HLE9BQU8sRUFBRSxFQUFFO2dCQUNYLGFBQWEsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFO29CQUMvQixJQUFJLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQzt3QkFDbkIsT0FBTyxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7b0JBQzNELENBQUM7b0JBRUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2pDLENBQUMsQ0FBQzthQUNGLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUUvQyxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUQsSUFBSSxRQUFRLEVBQUUsSUFBSSxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ2pELE1BQU0sSUFBSSxHQUFHLElBQUksR0FBRyxFQUFvQyxDQUFDO2dCQUN6RCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO29CQUN4QyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMzRCxDQUFDO2dCQUVELElBQUksQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLElBQUksQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDNUUsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsdUJBQXVCLENBQUMsT0FBZSxFQUFFLEtBQWE7UUFDckQsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLFlBQVksQ0FBQywyQkFBMkIsS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUNsRSxNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxzQ0FBc0MsRUFBRSxpREFBaUQsQ0FBQyxDQUFDLENBQUM7UUFDdEgsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDNUUsQ0FBQztJQUVELGtCQUFrQixDQUFDLElBQVksRUFBRSxrQkFBMkIsRUFBRSxPQUFnQjtRQUM3RSxPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLElBQUksRUFBRSxrQkFBa0IsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFFTyxLQUFLLENBQUMsbUJBQW1CLENBQUMsSUFBK0M7UUFDaEYsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQztRQUNuSCxDQUFDO1FBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUNuQyxNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxzQ0FBc0MsQ0FBQyxDQUFDLENBQUM7UUFDcEcsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6RCxPQUFPLFFBQVEsRUFBRSxJQUFJLENBQUM7SUFDdkIsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxlQUFrQztRQUMzRCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsMkNBQTJDLEVBQUUsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO1FBQzlHLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUNsQyxNQUFNLFNBQVMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUMsRUFBRSxFQUFDLEVBQUU7Z0JBQ2xFLElBQUksQ0FBQztvQkFDSixNQUFNLEdBQUcsR0FBRyxNQUFNLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ2pDLE9BQU8sRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUM7Z0JBQ3BCLENBQUM7Z0JBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztvQkFDWixPQUFPLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ25DLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ0osTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsV0FBVyxFQUFFLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNqSCxJQUFJLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQztnQkFDcEIsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLEVBQW9DLENBQUM7Z0JBQ3pELElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDVixLQUFLLE1BQU0sR0FBRyxJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUM3QixJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO3dCQUNkLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQ3ZDLENBQUM7eUJBQU0sSUFBSSxDQUFDLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUM7d0JBQ2pELElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQzFELENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzVFLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxzQkFBZ0Q7UUFDaEYsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLHlCQUF5QixDQUFDLENBQUMsQ0FBQztRQUNySCxDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDbEMsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLHlCQUF5QixDQUFDLEVBQUUsV0FBVyxFQUFFLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN6SCxJQUFJLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQztnQkFDcEIsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLEVBQW9DLENBQUM7Z0JBQ3pELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxzQkFBc0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztvQkFDeEQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMzRSxDQUFDO2dCQUNELElBQUksQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLElBQUksQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDNUUsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLG9CQUFvQixDQUFDLEdBQVEsRUFBRSxVQUFrQjtRQUN0RCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsMkNBQTJDLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1FBQ25ILENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3RDLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUNsRixJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDL0QsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBRUQsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxFQUFFLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV6RyxPQUFPLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxVQUFVLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUVELDBCQUEwQixDQUFDLFlBQW9CO1FBQzlDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDMUUsQ0FBQztJQUVELGFBQWEsQ0FBQyxPQUFlLEVBQUUsSUFBUztRQUN2QyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsMkNBQTJDLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNuRyxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUVELFVBQVUsQ0FBQyxRQUFnQixFQUFFLFVBQWtCLEVBQUUsTUFBYyxFQUFFLEtBQXdCO1FBQ3hGLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSwyQ0FBMkMsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDO1FBQ3hHLENBQUM7UUFFRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25FLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzVFLENBQUM7SUFFRCxLQUFLLENBQUMsYUFBYSxDQUFDLFFBQWdCO1FBQ25DLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSwyQ0FBMkMsRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBQzNHLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUM1RCxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsT0FBTztnQkFDTixFQUFFLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUM3QixXQUFXLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUN0QyxTQUFTLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTO2dCQUNsQyxPQUFPLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPO2FBQzlCLENBQUM7UUFDSCxDQUFDO1FBRUQsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELE1BQU0sQ0FBQyxPQUFlLEVBQUUsUUFBZ0I7UUFDdkMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDcEcsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNyRCxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsT0FBTyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVELFNBQVMsQ0FBQyxrQkFBMEIsRUFBRSxRQUE0QixFQUFFLE1BQXVDLEVBQUUsS0FBeUIsRUFBRSxLQUF5QjtRQUNoSyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsMkNBQTJDLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUN2RyxDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUM1RSxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBRUQsUUFBUSxDQUFDLFVBQWtCLEVBQUUsT0FBZSxFQUFFLE9BQWdCLEVBQUUsUUFBeUU7UUFDeEksSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDdEcsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDdEksQ0FBQztJQUVELEtBQUssQ0FBQyxZQUFZLENBQUMsT0FBZSxFQUFFLFFBQWdCO1FBQ25ELE1BQU0sSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7UUFDekMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7UUFDMUcsQ0FBQztRQUVELE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsRUFBRSxPQUFPLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRU8sMEJBQTBCLENBQUMsUUFBZ0IsRUFBRSxXQUErQztRQUNuRyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3hDLElBQUksTUFBTSxFQUFFLENBQUM7WUFDWixNQUFNLENBQUMsdUJBQXVCLEdBQUcsV0FBVyxDQUFDO1FBQzlDLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFnQixFQUFFLFdBQStDO1FBQzNFLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7UUFDekMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDbEcsQ0FBQztRQUVELElBQUksQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDdkQsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQWdCLEVBQUUsUUFBaUIsRUFBRSxXQUErQztRQUNoRyxNQUFNLElBQUksQ0FBQywyQkFBMkIsRUFBRSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSwyQ0FBMkMsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ3BHLENBQUM7UUFFRCxJQUFJLENBQUMsMEJBQTBCLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUVELEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBZ0IsRUFBRSxXQUErQztRQUM5RSxNQUFNLElBQUksQ0FBQywyQkFBMkIsRUFBRSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSwyQ0FBMkMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQ3JHLENBQUM7UUFFRCxJQUFJLENBQUMsMEJBQTBCLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRUQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFnQixFQUFFLFdBQStDO1FBQy9FLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7UUFDekMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDdEcsQ0FBQztRQUVELElBQUksQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDdkQsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFFRCxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQWdCO1FBQzlCLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7UUFDekMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDdEcsQ0FBQztRQUVELE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxLQUFLLENBQUMsZUFBZSxDQUFDLFFBQWdCO1FBQ3JDLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7UUFDekMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLGtCQUFrQixDQUFDLENBQUMsQ0FBQztRQUM5RyxDQUFDO1FBRUQsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVELEtBQUssQ0FBQyxLQUFLLENBQUMsUUFBZ0I7UUFDM0IsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDbkcsQ0FBQztRQUVELE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFRCxLQUFLLENBQUMsZ0JBQWdCLENBQUMsU0FBb0I7UUFDMUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLGtCQUFrQixDQUFDLENBQUMsQ0FBQztRQUM5RyxDQUFDO1FBRUQsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsV0FBVyxDQUFDLGtCQUEwQixFQUFFLElBQVksRUFBRSxLQUFhO1FBQ2xFLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSwyQ0FBMkMsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDO1FBQ3pHLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVELGFBQWEsQ0FBQyxPQUFlLEVBQUUsVUFBa0IsRUFBRSxLQUFhO1FBQy9ELElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSwyQ0FBMkMsRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBQzNHLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFFRCxXQUFXLENBQUMsTUFBNEIsRUFBRSxJQUFZLEVBQUUsTUFBZTtRQUN0RSxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsMkNBQTJDLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUN6RyxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRUQsSUFBSSxDQUFDLFFBQWdCLEVBQUUsUUFBZ0I7UUFDdEMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDbEcsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQsVUFBVSxDQUFDLFFBQWE7UUFDdkIsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsMkNBQTJDLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pILENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlDLElBQUksU0FBK0IsQ0FBQztRQUNwQyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osU0FBUyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUM7UUFDeEIsQ0FBQzthQUFNLENBQUM7WUFDUCxrQkFBa0I7WUFDbEIsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2xELFNBQVMsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDeEUsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxlQUFlLEVBQUUsU0FBUyxDQUFDLGVBQWUsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7SUFDaEcsQ0FBQztJQUVELEtBQUssQ0FBQyxnQkFBZ0I7UUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsMkNBQTJDLEVBQUUsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0gsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbEQsSUFBSSxRQUFRLEVBQUUsSUFBSSxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDN0MsT0FBTyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDOUQsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLFdBQVcsQ0FBQyxPQUEyQixFQUFFLFFBQWdCLEVBQUUsSUFBWSxFQUFFLFFBQWtCLEVBQUUsS0FBd0I7UUFDMUgsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsMkNBQTJDLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFILENBQUM7UUFDRCxNQUFNLHVCQUF1QixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFOUUsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQztZQUMzQixPQUFPO1lBQ1AsSUFBSTtZQUNKLE1BQU0sRUFBRSxRQUFRLENBQUMsTUFBTTtZQUN2QixJQUFJLEVBQUUsUUFBUSxDQUFDLFVBQVU7U0FDekIsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFRCxLQUFLLENBQUMsYUFBYSxDQUFDLE9BQWU7UUFDbEMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsMkNBQTJDLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzVILENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUMzRCxPQUFPLFFBQVEsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQy9CLENBQUM7SUFFRCxLQUFLLENBQUMsTUFBTSxDQUFDLFVBQWtCO1FBQzlCLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNySCxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVELEtBQUssQ0FBQyxXQUFXLENBQUMsZUFBdUIsRUFBRSxNQUFjLEVBQUUsaUJBQXlCLEVBQUUsZ0JBQXdCO1FBQzdHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxSCxDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDcEksT0FBTyxRQUFRLEVBQUUsSUFBSSxFQUFFLFlBQVksQ0FBQztJQUNyQyxDQUFDO0lBRUQsVUFBVSxDQUFDLGVBQXVCLEVBQUUsTUFBYyxFQUFFLEtBQWE7UUFDaEUsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsMkNBQTJDLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pILENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRCxXQUFXLENBQUMsZUFBdUIsRUFBRSxNQUFjLEVBQUUsSUFBWSxFQUFFLFlBQXNCO1FBQ3hGLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxSCxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDOUUsQ0FBQztJQUVELEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxpQkFBeUI7UUFDdkQsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJDQUEyQyxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFDdkcsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFDakUsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQztZQUNyQixNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSwyQ0FBMkMsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBQ3ZHLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEQsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsR0FBRyxRQUFRLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDO0lBQ2hELENBQUM7SUFFRCxjQUFjO0lBRWQsU0FBUyxDQUFDLFFBQWdCO1FBQ3pCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELGFBQWE7UUFDWixNQUFNLE1BQU0sR0FBYyxFQUFFLENBQUM7UUFDN0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRTtZQUNuQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMxQyxJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNaLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDckIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRUQsWUFBWSxDQUFDLGFBQXNCLEVBQUUsWUFBZ0MsU0FBUztRQUM3RSxJQUFJLFNBQVMsS0FBSyxTQUFTLElBQUksU0FBUyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ25ELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzNDLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1osTUFBTSxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUN4QixNQUFNLENBQUMsY0FBYyxHQUFHLFNBQVMsQ0FBQztnQkFDbEMsTUFBTSxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7Z0JBRXZCLElBQUksYUFBYSxFQUFFLENBQUM7b0JBQ25CLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUNoQyxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQzdCLE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDeEIsTUFBTSxDQUFDLGNBQWMsR0FBRyxTQUFTLENBQUM7Z0JBQ2xDLE1BQU0sQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO1lBQ3hCLENBQUMsQ0FBQyxDQUFDO1lBRUgsSUFBSSxhQUFhLEVBQUUsQ0FBQztnQkFDbkIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDckIsSUFBSSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7Z0JBQ3BCLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN2QyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxpQkFBaUI7UUFDaEIsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUM3RSxDQUFDO0lBRUQsU0FBUyxDQUFDLElBQXFCO1FBQzlCLElBQUksQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO1FBQ3BCLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQzdCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMvQixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQ2xDLHVDQUF1QztnQkFDdkMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxJQUFJLE1BQU0sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN2RSxDQUFDO2lCQUFNLElBQUksTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN4QiwwQ0FBMEM7Z0JBQzFDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDOUMsSUFBSSxTQUFTLEVBQUUsQ0FBQztvQkFDZixTQUFTLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQzlCLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUN4Qix1RUFBdUU7WUFDdkUsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDL0MsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2pDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUM7UUFDM0MsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNwQiwrREFBK0Q7WUFDL0QsdUNBQXVDO1lBQ3ZDLElBQUksY0FBYyxDQUFDLGlCQUFpQixFQUFFLENBQUM7Z0JBQ3RDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO29CQUM3QixNQUFNLENBQUMsY0FBYyxHQUFHLE1BQU0sQ0FBQyxRQUFRLEtBQUssY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsY0FBYyxFQUFFLE1BQU0sRUFBRSxDQUFDO29CQUNqSSxNQUFNLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztvQkFDdEIsTUFBTSxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUN6QixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxNQUFNLE1BQU0sR0FBRyxPQUFPLGNBQWMsQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztnQkFDbkgsSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDWixrREFBa0Q7b0JBQ2xELE1BQU0sQ0FBQyxjQUFjLEdBQUcsY0FBYyxDQUFDO29CQUN2QyxNQUFNLENBQUMsY0FBYyxFQUFFLENBQUM7b0JBQ3hCLE1BQU0sQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO2dCQUN2QixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sMkJBQTJCO1FBQ2xDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDekIsT0FBTztRQUNSLENBQUM7UUFFRCxPQUFPLFdBQVcsQ0FDakIsSUFBSSxDQUFDLGFBQWEsRUFDbEIsOEJBQThCLENBQzlCLENBQUM7SUFDSCxDQUFDO0lBRU8sS0FBSyxDQUFDLFlBQVksQ0FBQyxjQUFtQztRQUM3RCxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNkLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUMxQyxJQUFJLFFBQVEsRUFBRSxJQUFJLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDN0MsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUM7b0JBQ3BCLFNBQVMsRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFO29CQUN2QixPQUFPLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPO29CQUM5QixjQUFjO2lCQUNkLENBQUMsQ0FBQztZQUNKLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELGlCQUFpQixDQUFDLEdBQW9CO1FBQ3JDLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7SUFDMUIsQ0FBQztJQUVELGNBQWM7SUFFTixpQkFBaUI7UUFDeEIsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNmLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsS0FBSyxJQUFJLEVBQUU7WUFDekQsSUFBSSxDQUFDLE1BQU0sQ0FDVixJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU87Z0JBQ3pCLENBQUMsQ0FBQyxRQUFRLENBQUMseUJBQXlCLEVBQUUsb0NBQW9DLENBQUM7Z0JBQzNFLENBQUMsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsb0JBQW9CLENBQUMsQ0FDckQsQ0FBQztZQUVGLE1BQU0scUJBQXFCLEdBQUcsS0FBSyxJQUFJLEVBQUU7Z0JBQ3hDLElBQUksSUFBSSxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxnQ0FBZ0MsRUFBRSxDQUFDO29CQUN4RSxJQUFJLENBQUM7d0JBQ0osTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLGlCQUFpQixFQUFFLENBQUM7b0JBQ3BDLENBQUM7b0JBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQzt3QkFDWixrRUFBa0U7d0JBQ2xFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ2xDLElBQUksQ0FBQyxHQUFHLEVBQUUsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUMxQixDQUFDO2dCQUNGLENBQUM7Z0JBRUQsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQyxDQUFDO1lBRUYsdUJBQXVCO1lBQ3ZCLElBQUksQ0FBQztnQkFDSixNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEQsQ0FBQztvQkFBUyxDQUFDO2dCQUNWLE1BQU0scUJBQXFCLEVBQUUsQ0FBQztnQkFDOUIsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDM0IsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFHSixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWhGLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ2xELFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDMUMsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDckMsSUFBSSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQztvQkFDckQsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDN0MsQ0FBQztZQUNGLENBQUM7aUJBQU0sSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDM0MsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNqRSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNuRCxNQUFNLGFBQWEsR0FBRyxTQUFTLENBQUMsYUFBYSxDQUFDO2dCQUM5QyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2pDLElBQUksYUFBYSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxLQUFLLGFBQWEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztvQkFDckUsNkNBQTZDO29CQUM3QyxJQUFJLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxjQUFjLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztnQkFDeEcsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUMsS0FBSyxFQUFDLEVBQUU7WUFDbEUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLElBQUksS0FBSyxDQUFDLElBQUksSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUN0QyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2xFLENBQUM7aUJBQU0sSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7Z0JBQ3JCLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1lBQ3pELENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFDLEtBQUssRUFBQyxFQUFFO1lBQzNELE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEtBQUssS0FBSyxDQUFDO1lBRTVELElBQUksZUFBNkMsQ0FBQztZQUNsRCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ2pCLGVBQWUsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3hDLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO29CQUNsRCxlQUFlLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN6QyxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQztvQkFDOUMsZUFBZSxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pFLENBQUM7WUFDRixDQUFDO2lCQUFNLElBQUksSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDO2dCQUMzRCxJQUFJLENBQUMscUJBQXFCLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUMxQyxlQUFlLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDbEUsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLGVBQWUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDO1lBQ2xDLENBQUM7WUFFRCxXQUFXLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUNuRSxNQUFNLFdBQVcsQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLFFBQVEsQ0FBQyxFQUFFO2dCQUNqRCxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLFFBQVEsS0FBSyxRQUFRLENBQUMsQ0FBQztnQkFDakYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ2xELElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN0QyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUN0QyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUN2RCxPQUFPLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUMxQixDQUFDLENBQUMsQ0FBQztZQUVILDZHQUE2RztZQUM3RyxJQUFJLENBQUMscUJBQXFCLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO1lBQzFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDL0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sV0FBVyxHQUFHLElBQUksS0FBSyxFQUFRLENBQUM7UUFDdEMsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFDLEtBQUssRUFBQyxFQUFFO1lBQ3hELE1BQU0sY0FBYyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO1lBRWhKLGdHQUFnRztZQUNoRyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztnQkFDbkMsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNyRCxVQUFVLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJO29CQUMzQixNQUFNLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNqRCxNQUFNLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztpQkFDekMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO2dCQUNkLE1BQU0sU0FBUyxHQUFHLElBQUksbUJBQW1CLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLFlBQVksRUFBRSxDQUFDLENBQUM7Z0JBQzFHLE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDekMsK0ZBQStGO2dCQUMvRiwrRUFBK0U7Z0JBQy9FLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLEVBQUU7b0JBQzVCLE1BQU0sUUFBUSxHQUFHLE1BQU0sUUFBUSxDQUFDO29CQUNoQyxrRUFBa0U7b0JBQ2xFLGtFQUFrRTtvQkFDbEUsSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO3dCQUMzQixJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsS0FBSyxXQUFXLENBQUMsQ0FBQzt3QkFDNUksT0FBTztvQkFDUixDQUFDO29CQUVELFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTt3QkFDMUIsaUlBQWlJO3dCQUNqSSxtREFBbUQ7d0JBQzdDLEtBQU0sQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO3dCQUN6QixJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLEtBQUssV0FBVyxDQUFDLENBQUM7b0JBQ3hILENBQUMsQ0FBQyxDQUFDO2dCQUNKLENBQUMsQ0FBQyxDQUFDO2dCQUNILE9BQU87WUFDUixDQUFDO1lBQ0QsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLElBQUksRUFBRTtnQkFDNUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7b0JBQzlCLE9BQU87Z0JBQ1IsQ0FBQztnQkFFRCxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxLQUFLLFdBQVcsRUFBRSxDQUFDO29CQUN6QyxpR0FBaUc7b0JBQ2pHLGtDQUFrQztvQkFDbEMsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO29CQUNyRSxJQUFJLGlCQUFpQixJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLGdDQUF3QixFQUFFLENBQUM7d0JBQ3ZGLGtJQUFrSTt3QkFDbEksSUFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7d0JBQzNCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxrQkFBa0IsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDOzRCQUM5RCxJQUFJLEdBQUcsNkJBQTZCLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDdkQsQ0FBQzt3QkFFRCxJQUFJLENBQUMsOEJBQThCLENBQUMsU0FBUyxDQUFDLGlCQUFpQixFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUMzRixDQUFDO29CQUVELE9BQU87Z0JBQ1IsQ0FBQztnQkFFRCxrR0FBa0c7Z0JBQ2xHLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDckQsVUFBVSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSTtvQkFDM0IsTUFBTSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDakQsTUFBTSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7aUJBQ3pDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztnQkFFZCxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxLQUFLLE9BQU8sSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssS0FBSyxnQkFBZ0IsRUFBRSxDQUFDO29CQUMzRSxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssS0FBSyxPQUFPLENBQUM7b0JBQzlDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxFQUFFLEVBQUUsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUN0RSxPQUFPO2dCQUNSLENBQUM7Z0JBQ0QsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLEVBQUUsQ0FBQztvQkFDaEMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztvQkFDckIsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7d0JBQ3hCLHFFQUFxRTt3QkFDckUsT0FBTztvQkFDUixDQUFDO2dCQUNGLENBQUM7Z0JBRUQsSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUMzQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLEtBQUssV0FBVyxDQUFDLENBQUM7Z0JBQ3BILENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUN0RCxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUN0RixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUNwRyxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDcEgsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUM5RyxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7WUFFNUgsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxLQUFLLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUMvRixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUM1RCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7d0JBQ2xELE1BQU0sRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNO3dCQUNwQyxPQUFPLEVBQUUsSUFBSTt3QkFDYixVQUFVLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSTtxQkFDdEMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNYLElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDdEIsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQW1DLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2xHLElBQUksQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLElBQUksQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQzVFLENBQUM7WUFDRixDQUFDO1lBRUQsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDckMsSUFBSSxVQUFVLEVBQUUsQ0FBQztvQkFDaEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7Z0JBQzVDLENBQUM7Z0JBQ0QsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO29CQUN4QixJQUFJLENBQUMsS0FBSyxDQUFDLHlCQUF5QixDQUFDLGtCQUFrQixDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7Z0JBQ2xFLENBQUM7Z0JBQ0QsSUFBSSxjQUFjLEVBQUUsQ0FBQztvQkFDcEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztnQkFDMUQsQ0FBQztZQUNGLENBQUM7WUFFRCxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUNyQyxJQUFJLFVBQVUsRUFBRSxDQUFDO29CQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO3dCQUN4QixLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDO29CQUMxQyxDQUFDO29CQUNELE1BQU0sSUFBSSxHQUFHLElBQUksR0FBRyxDQUFtQyxDQUFDLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN0RyxJQUFJLENBQUMsS0FBSyxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUM1RSxDQUFDO2dCQUNELElBQUksa0JBQWtCLEVBQUUsQ0FBQztvQkFDeEIsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQW1DLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDOUcsSUFBSSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDNUUsQ0FBQztnQkFDRCxJQUFJLGNBQWMsRUFBRSxDQUFDO29CQUNwQixNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBbUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDMUcsSUFBSSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDNUUsQ0FBQztnQkFDRCxJQUFJLG1CQUFtQixFQUFFLENBQUM7b0JBQ3pCLE1BQU0sSUFBSSxHQUFHLElBQUksR0FBRyxDQUFtQyxDQUFDLENBQUMsbUJBQW1CLENBQUMsS0FBSyxFQUFFLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQy9HLElBQUksQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLElBQUksQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQzVFLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDeEQsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQztnQkFDNUIsTUFBTSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTTtnQkFDekIsTUFBTSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7YUFDekMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDdkQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUN6RCxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQzFELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdkMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDdkQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUM1RCxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBQyxLQUFLLEVBQUMsRUFBRTtZQUM3RCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzFDLHdKQUF3SjtZQUN4SixJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3BGLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO2dCQUN6QixJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBRTVDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQzVDLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztnQkFDL0IsSUFBSSxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQ3BCLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pELENBQUM7cUJBQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQztvQkFDNUQsaUVBQWlFO29CQUNqRSwrRUFBK0U7b0JBQy9FLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQzdDLENBQUM7WUFDRixDQUFDO1lBRUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNuRCxJQUFJLFNBQVMsQ0FBQyxjQUFjLEtBQUssSUFBSSxFQUFFLENBQUM7Z0JBQ3ZDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN6QixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3pGLENBQUM7SUFFTyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQXlCO1FBQ2pELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNqQyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUVoQyx3RUFBd0U7UUFDeEUsdUVBQXVFO1FBQ3ZFLFdBQVc7UUFDWCxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzlFLENBQUM7UUFFRCxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FDbkIsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQ3JHLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDekIsTUFBTSxnQkFBZ0IsR0FBRyxLQUFLLENBQUMsUUFBUSxLQUFLLFNBQVMsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7WUFFcEYscUZBQXFGO1lBQ3JGLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLENBQUMsYUFBYSxDQUFDO1lBQ3JFLE1BQU0seUJBQXlCLEdBQUcsYUFBYSxLQUFLLFNBQVMsSUFBSSxhQUFhLENBQUMsT0FBTyxLQUFLLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUM3SSxJQUFJLHlCQUF5QixFQUFFLENBQUM7Z0JBQy9CLElBQUksQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN6RCxDQUFDO1lBRUQsTUFBTSxNQUFNLEdBQUcsT0FBTyxRQUFRLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7WUFDbkYsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWiwwRUFBMEU7Z0JBQzFFLDhFQUE4RTtnQkFDOUUsOEVBQThFO2dCQUM5RSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFTLE1BQU0sRUFBRSxxQkFBcUIsQ0FBQSxDQUFDLGdCQUFnQixDQUFDLENBQUM7Z0JBQzFHLE1BQU0sS0FBSyxHQUFHLEtBQUssSUFBSSxFQUFFO29CQUN4QixJQUFJLHlCQUF5QixJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLElBQUksTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7d0JBQzdGLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQzt3QkFDN0UsSUFBSSxDQUFDLGlCQUFpQixJQUFJLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxPQUFPLEtBQUssSUFBSSxFQUFFLENBQUM7NEJBQ3JFLDJGQUEyRjs0QkFDM0YsTUFBTSxhQUFhLEdBQUcsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFzQixPQUFPLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQzs0QkFDM0csTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUM7d0JBQzFGLENBQUM7d0JBRUQsSUFBSSxNQUFNLENBQUMsY0FBYyxJQUFJLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7NEJBQzdELElBQUksTUFBTSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEtBQUssWUFBWSxJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQXNCLE9BQU8sQ0FBQyxDQUFDLFNBQVMsS0FBSyxrQkFBa0IsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO2dDQUNuTCxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLHdDQUFnQyxDQUFDOzRCQUM5RixDQUFDOzRCQUVELElBQUksSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBc0IsT0FBTyxDQUFDLENBQUMsa0JBQWtCLElBQUksQ0FBQyxJQUFJLENBQUMsMkJBQTJCLENBQUMseUJBQXlCLEVBQUUsQ0FBQztnQ0FDeEosTUFBTSxZQUFZLEdBQUcsZUFBZSxFQUFFLENBQUM7Z0NBQ3ZDLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7b0NBQ3ZDLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLEVBQUUsSUFBSSx5QkFBaUIsQ0FBQyxtQ0FBbUMsRUFBRSxDQUFDLENBQUM7Z0NBQ3pHLENBQUM7NEJBQ0YsQ0FBQzt3QkFDRixDQUFDO29CQUNGLENBQUM7Z0JBQ0YsQ0FBQyxDQUFDO2dCQUVGLE1BQU0sUUFBUSxDQUFDLFlBQVksQ0FBQztnQkFFNUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsOERBQThEO29CQUM1RixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDOUQsQ0FBQztnQkFFRCxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO29CQUNuQyxPQUFPO2dCQUNSLENBQUM7Z0JBRUQsS0FBSyxFQUFFLENBQUM7Z0JBRVIsTUFBTSxRQUFRLENBQUMsY0FBYyxDQUFDO2dCQUM5QixJQUFJLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO29CQUNuQyxPQUFPO2dCQUNSLENBQUM7Z0JBRUQsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxDQUFDLGlCQUFpQixDQUFDO2dCQUM3RSxJQUFJLENBQUMsaUJBQWlCLElBQUksbUJBQW1CLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDO29CQUNsRSx1RUFBdUU7b0JBQ3ZFLEtBQUssRUFBRSxDQUFDO2dCQUNULENBQUM7WUFDRixDQUFDO1lBQ0QsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQy9CLENBQUMsQ0FDRCxDQUFDO0lBQ0gsQ0FBQztJQUVPLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyx3QkFBMkM7UUFDbkYsSUFBSSxXQUEwQixDQUFDO1FBQy9CLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLENBQUM7WUFDN0MsV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsd0JBQXdCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFILENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxLQUFLLEdBQUcsd0JBQXdCLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUMxRCxJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDekIsT0FBTztZQUNSLENBQUM7WUFFRCxJQUFJLHdCQUF3QixDQUFDLGNBQWMsSUFBSSx3QkFBd0IsQ0FBQyxjQUFjLENBQUMsTUFBTSxLQUFLLFlBQVksRUFBRSxDQUFDO2dCQUNoSCxPQUFPO1lBQ1IsQ0FBQztZQUVELFdBQVcsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN2SyxDQUFDO1FBRUQsK0JBQStCO1FBRS9CLHFHQUFxRztRQUNyRyxNQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDbEYsV0FBVyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRTtnQkFDekIsSUFBSSxFQUFFLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxXQUFXLEtBQUssR0FBRyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUM7b0JBQ2xELEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztvQkFDdEMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQ3JDLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxPQUFPLEdBQW1CLEVBQUUsQ0FBQztRQUNuQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoSCxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUVPLHdCQUF3QixDQUFDLEdBQVEsRUFBRSxlQUF1QixFQUFFLGFBQXFCLEVBQUUsV0FBbUIsRUFBRSxTQUFpQjtRQUNoSSxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQzFELElBQUksRUFBRSxDQUFDLFVBQVUsR0FBRyxlQUFlLElBQUksRUFBRSxDQUFDLFVBQVUsR0FBRyxhQUFhLEVBQUUsQ0FBQztnQkFDdEUsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDO1lBRUQsSUFBSSxFQUFFLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sR0FBRyxXQUFXLElBQUksRUFBRSxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUMsRUFBRSxDQUFDO2dCQUNyRSxPQUFPLEtBQUssQ0FBQztZQUNkLENBQUM7WUFDRCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVPLGdCQUFnQixDQUFDLEtBQXVCO1FBQy9DLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLElBQUksQ0FBQyxZQUFZLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDaEYsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2hCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELHVGQUF1RjtJQUMvRSxRQUFRO1FBQ2YsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUMxQixJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNkLGdGQUFnRjtZQUNoRixJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN4QixJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ25CLElBQUksQ0FBQyxHQUFHLEdBQUcsU0FBUyxDQUFDO1FBQ3RCLENBQUM7UUFDRCxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDakMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDckIsSUFBSSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7UUFDcEIsSUFBSSxDQUFDLGNBQWMsR0FBRyxFQUFFLENBQUM7UUFDekIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO0lBQy9CLENBQUM7SUFFTSxPQUFPO1FBQ2IsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDekIsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUM1QixJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDakMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNoQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbEMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDcEMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDeEMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxhQUFhLEdBQUcsU0FBUyxDQUFDO0lBQ2hDLENBQUM7SUFFRCxjQUFjO0lBRWQsZUFBZSxDQUFDLEdBQVE7UUFDdkIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDakYsQ0FBQztJQUVELFNBQVMsQ0FBQyxHQUEwQjtRQUNuQyxJQUFJLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDckYsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNyQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2QyxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ1gsTUFBTSxHQUFHLEtBQUssQ0FBQztZQUNmLHdDQUF3QztZQUN4QyxNQUFNLENBQUMsR0FBRyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLElBQUksTUFBTSxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztnQkFDdkIsK0RBQStEO2dCQUMvRCxNQUFNLENBQUMsR0FBRyxDQUFDLGdCQUFnQixHQUFHLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQztZQUNwRCxDQUFDO1FBQ0YsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDbEMsQ0FBQztRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVPLFlBQVksQ0FBQyxHQUFRO1FBQzVCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDekMsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNaLE9BQU8sTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNuQixDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM3QyxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUNwRixDQUFDO0lBQ0YsQ0FBQztJQUVPLHVCQUF1QixDQUFDLFFBQWdCLEVBQUUsS0FBeUI7UUFDMUUsTUFBTSxXQUFXLEdBQUcsSUFBSSx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2RCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDeEQsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN6QixJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFM0MsT0FBTyxXQUFXLENBQUMsS0FBSyxDQUFDO0lBQzFCLENBQUM7SUFFTyxpQkFBaUI7UUFDeEIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0UsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUM5QixDQUFDO0lBRUQsT0FBTztJQUVQLGVBQWU7UUFDZCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUVELGVBQWU7UUFDZCxPQUFPLENBQUMsSUFBSSxDQUFDLGFBQWEsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxpQkFBaUIsQ0FBQztJQUN4RSxDQUFDO0lBRUQscUJBQXFCO1FBQ3BCLElBQUksQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBRUQsS0FBSyxDQUFDLGlCQUFpQixDQUFDLFVBQW1DLEVBQUUsVUFBa0I7UUFDOUUsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDaEUsMEdBQTBHO1FBQzFHLElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDaEQsQ0FBQztJQUVELFlBQVksQ0FBQyxJQUF5QixFQUFFLFdBQXFCO1FBQzVELElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNuQyxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ2pCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDN0csQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFBO0FBMWdEWSxZQUFZO0lBNER0QixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsaUJBQWlCLENBQUE7SUFDakIsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEseUJBQXlCLENBQUE7SUFDekIsWUFBQSx3QkFBd0IsQ0FBQTtJQUN4QixZQUFBLGVBQWUsQ0FBQTtJQUNmLFlBQUEsb0JBQW9CLENBQUE7SUFDcEIsWUFBQSxpQkFBaUIsQ0FBQTtJQUNqQixZQUFBLG1CQUFtQixDQUFBO0lBQ25CLFlBQUEscUJBQXFCLENBQUE7SUFDckIsWUFBQSwrQkFBK0IsQ0FBQTtJQUMvQixZQUFBLDRCQUE0QixDQUFBO0lBQzVCLFlBQUEsV0FBVyxDQUFBO0lBQ1gsWUFBQSxZQUFZLENBQUE7SUFDWixZQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFlBQUEscUJBQXFCLENBQUE7R0E1RVgsWUFBWSxDQTBnRHhCOztBQUVEOzs7Ozs7Ozs7Ozs7R0FZRztBQUNILE1BQU0sT0FBTyxxQkFBc0IsU0FBUSxVQUFVO0lBQXJEOztRQUNDOzs7Ozs7V0FNRztRQUNLLHlCQUFvQixHQUE4QixFQUFFLENBQUM7UUFFN0Q7O1dBRUc7UUFDYyxjQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGFBQWEsRUFBbUMsQ0FBQyxDQUFDO0lBZ0VuRyxDQUFDO0lBOURBOzs7T0FHRztJQUNJLEtBQUssQ0FBQyxHQUFHLENBQUMsVUFBd0MsRUFBRSxTQUF3RTtRQUNsSSxNQUFNLDhCQUE4QixHQUFHLElBQUksR0FBRyxFQUFzQixDQUFDO1FBQ3JFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUMvRCxNQUFNLFNBQVMsR0FBRyxNQUFNLFVBQVUsQ0FBQztRQUVuQywrQkFBK0I7UUFDL0IsaUNBQWlDO1FBQ2pDLHFFQUFxRTtRQUNyRSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzNELE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QyxJQUFJLENBQUMsS0FBSyw4QkFBOEIsRUFBRSxDQUFDO2dCQUMxQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDdkMsTUFBTTtZQUNQLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxLQUFLLE1BQU0sUUFBUSxJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUNsQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNqQixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLDhCQUE4QixDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQ25ELE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDMUMsSUFBSSw4QkFBOEIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztnQkFDbEQsT0FBTztZQUNSLENBQUM7WUFDRCxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQztZQUN2QyxNQUFNLEdBQUcsR0FBRyxJQUFJLHVCQUF1QixFQUFFLENBQUM7WUFDMUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ2xDLE9BQU8sU0FBUyxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdkMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7O09BR0c7SUFDSSxNQUFNLENBQUMsU0FBNkI7UUFDMUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hCLEtBQUssTUFBTSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ3RDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLENBQUM7WUFDRCxJQUFJLENBQUMsU0FBUyxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDcEMsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztnQkFDM0MsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNsQixDQUFDO1FBQ0YsQ0FBQzthQUFNLENBQUM7WUFDUCxLQUFLLE1BQU0sUUFBUSxJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUNsQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQztnQkFDdkMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDMUMsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztvQkFDM0MsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDakIsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztDQUNEIn0=