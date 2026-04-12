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
import * as nls from '../../../../nls.js';
import { Emitter } from '../../../../base/common/event.js';
import * as objects from '../../../../base/common/objects.js';
import { toAction } from '../../../../base/common/actions.js';
import * as errors from '../../../../base/common/errors.js';
import { createErrorWithActions } from '../../../../base/common/errorMessage.js';
import { formatPII, isUriString } from '../common/debugUtils.js';
import { IExtensionHostDebugService } from '../../../../platform/debug/common/extensionHostDebug.js';
import { URI } from '../../../../base/common/uri.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { Schemas } from '../../../../base/common/network.js';
/**
 * Encapsulates the DebugAdapter lifecycle and some idiosyncrasies of the Debug Adapter Protocol.
 */
let RawDebugSession = class RawDebugSession {
    constructor(debugAdapter, dbgr, sessionId, name, extensionHostDebugService, openerService, notificationService, dialogSerivce) {
        this.dbgr = dbgr;
        this.sessionId = sessionId;
        this.name = name;
        this.extensionHostDebugService = extensionHostDebugService;
        this.openerService = openerService;
        this.notificationService = notificationService;
        this.dialogSerivce = dialogSerivce;
        this.allThreadsContinued = true;
        this._readyForBreakpoints = false;
        // shutdown
        this.debugAdapterStopped = false;
        this.inShutdown = false;
        this.terminated = false;
        this.firedAdapterExitEvent = false;
        // telemetry
        this.startTime = 0;
        this.didReceiveStoppedEvent = false;
        this.toDispose = new DisposableStore();
        // DAP events
        this._onDidInitialize = this.toDispose.add(new Emitter());
        this._onDidStop = this.toDispose.add(new Emitter());
        this._onDidContinued = this.toDispose.add(new Emitter());
        this._onDidTerminateDebugee = this.toDispose.add(new Emitter());
        this._onDidExitDebugee = this.toDispose.add(new Emitter());
        this._onDidThread = this.toDispose.add(new Emitter());
        this._onDidOutput = this.toDispose.add(new Emitter());
        this._onDidBreakpoint = this.toDispose.add(new Emitter());
        this._onDidLoadedSource = this.toDispose.add(new Emitter());
        this._onDidProgressStart = this.toDispose.add(new Emitter());
        this._onDidProgressUpdate = this.toDispose.add(new Emitter());
        this._onDidProgressEnd = this.toDispose.add(new Emitter());
        this._onDidInvalidated = this.toDispose.add(new Emitter());
        this._onDidInvalidateMemory = this.toDispose.add(new Emitter());
        this._onDidCustomEvent = this.toDispose.add(new Emitter());
        this._onDidEvent = this.toDispose.add(new Emitter());
        // DA events
        this._onDidExitAdapter = this.toDispose.add(new Emitter());
        this.stoppedSinceLastStep = false;
        this.debugAdapter = debugAdapter;
        this._capabilities = Object.create(null);
        this.toDispose.add(this.debugAdapter.onError(err => {
            this.shutdown(err);
        }));
        this.toDispose.add(this.debugAdapter.onExit(code => {
            if (code !== 0) {
                this.shutdown(new Error(`exit code: ${code}`));
            }
            else {
                // normal exit
                this.shutdown();
            }
        }));
        this.debugAdapter.onEvent(event => {
            switch (event.event) {
                case 'initialized':
                    this._readyForBreakpoints = true;
                    this._onDidInitialize.fire(event);
                    break;
                case 'loadedSource':
                    this._onDidLoadedSource.fire(event);
                    break;
                case 'capabilities':
                    if (event.body) {
                        const capabilities = event.body.capabilities;
                        this.mergeCapabilities(capabilities);
                    }
                    break;
                case 'stopped':
                    this.didReceiveStoppedEvent = true; // telemetry: remember that debugger stopped successfully
                    this.stoppedSinceLastStep = true;
                    this._onDidStop.fire(event);
                    break;
                case 'continued':
                    this.allThreadsContinued = event.body.allThreadsContinued === false ? false : true;
                    this._onDidContinued.fire(event);
                    break;
                case 'thread':
                    this._onDidThread.fire(event);
                    break;
                case 'output':
                    this._onDidOutput.fire(event);
                    break;
                case 'breakpoint':
                    this._onDidBreakpoint.fire(event);
                    break;
                case 'terminated':
                    this._onDidTerminateDebugee.fire(event);
                    break;
                case 'exited':
                    this._onDidExitDebugee.fire(event);
                    break;
                case 'progressStart':
                    this._onDidProgressStart.fire(event);
                    break;
                case 'progressUpdate':
                    this._onDidProgressUpdate.fire(event);
                    break;
                case 'progressEnd':
                    this._onDidProgressEnd.fire(event);
                    break;
                case 'invalidated':
                    this._onDidInvalidated.fire(event);
                    break;
                case 'memory':
                    this._onDidInvalidateMemory.fire(event);
                    break;
                case 'process':
                    break;
                case 'module':
                    break;
                default:
                    this._onDidCustomEvent.fire(event);
                    break;
            }
            this._onDidEvent.fire(event);
        });
        this.debugAdapter.onRequest(request => this.dispatchRequest(request));
    }
    get isInShutdown() {
        return this.inShutdown;
    }
    get onDidExitAdapter() {
        return this._onDidExitAdapter.event;
    }
    get capabilities() {
        return this._capabilities;
    }
    /**
     * DA is ready to accepts setBreakpoint requests.
     * Becomes true after "initialized" events has been received.
     */
    get readyForBreakpoints() {
        return this._readyForBreakpoints;
    }
    //---- DAP events
    get onDidInitialize() {
        return this._onDidInitialize.event;
    }
    get onDidStop() {
        return this._onDidStop.event;
    }
    get onDidContinued() {
        return this._onDidContinued.event;
    }
    get onDidTerminateDebugee() {
        return this._onDidTerminateDebugee.event;
    }
    get onDidExitDebugee() {
        return this._onDidExitDebugee.event;
    }
    get onDidThread() {
        return this._onDidThread.event;
    }
    get onDidOutput() {
        return this._onDidOutput.event;
    }
    get onDidBreakpoint() {
        return this._onDidBreakpoint.event;
    }
    get onDidLoadedSource() {
        return this._onDidLoadedSource.event;
    }
    get onDidCustomEvent() {
        return this._onDidCustomEvent.event;
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
    get onDidInvalidated() {
        return this._onDidInvalidated.event;
    }
    get onDidInvalidateMemory() {
        return this._onDidInvalidateMemory.event;
    }
    get onDidEvent() {
        return this._onDidEvent.event;
    }
    //---- DebugAdapter lifecycle
    /**
     * Starts the underlying debug adapter and tracks the session time for telemetry.
     */
    async start() {
        if (!this.debugAdapter) {
            return Promise.reject(new Error(nls.localize('noDebugAdapterStart', "No debug adapter, can not start debug session.")));
        }
        await this.debugAdapter.startSession();
        this.startTime = new Date().getTime();
    }
    /**
     * Send client capabilities to the debug adapter and receive DA capabilities in return.
     */
    async initialize(args) {
        const response = await this.send('initialize', args, undefined, undefined, false);
        if (response) {
            this.mergeCapabilities(response.body);
        }
        return response;
    }
    /**
     * Terminate the debuggee and shutdown the adapter
     */
    disconnect(args) {
        const terminateDebuggee = this.capabilities.supportTerminateDebuggee ? args.terminateDebuggee : undefined;
        const suspendDebuggee = this.capabilities.supportTerminateDebuggee && this.capabilities.supportSuspendDebuggee ? args.suspendDebuggee : undefined;
        return this.shutdown(undefined, args.restart, terminateDebuggee, suspendDebuggee);
    }
    //---- DAP requests
    async launchOrAttach(config) {
        const response = await this.send(config.request, config, undefined, undefined, false);
        if (response) {
            this.mergeCapabilities(response.body);
        }
        return response;
    }
    /**
     * Try killing the debuggee softly...
     */
    terminate(restart = false) {
        if (this.capabilities.supportsTerminateRequest) {
            if (!this.terminated) {
                this.terminated = true;
                return this.send('terminate', { restart }, undefined);
            }
            return this.disconnect({ terminateDebuggee: true, restart });
        }
        return Promise.reject(new Error('terminated not supported'));
    }
    restart(args) {
        if (this.capabilities.supportsRestartRequest) {
            return this.send('restart', args);
        }
        return Promise.reject(new Error('restart not supported'));
    }
    async next(args) {
        this.stoppedSinceLastStep = false;
        const response = await this.send('next', args);
        if (!this.stoppedSinceLastStep) {
            this.fireSimulatedContinuedEvent(args.threadId);
        }
        return response;
    }
    async stepIn(args) {
        this.stoppedSinceLastStep = false;
        const response = await this.send('stepIn', args);
        if (!this.stoppedSinceLastStep) {
            this.fireSimulatedContinuedEvent(args.threadId);
        }
        return response;
    }
    async stepOut(args) {
        this.stoppedSinceLastStep = false;
        const response = await this.send('stepOut', args);
        if (!this.stoppedSinceLastStep) {
            this.fireSimulatedContinuedEvent(args.threadId);
        }
        return response;
    }
    async continue(args) {
        this.stoppedSinceLastStep = false;
        const response = await this.send('continue', args);
        if (response && response.body && response.body.allThreadsContinued !== undefined) {
            this.allThreadsContinued = response.body.allThreadsContinued;
        }
        if (!this.stoppedSinceLastStep) {
            this.fireSimulatedContinuedEvent(args.threadId, this.allThreadsContinued);
        }
        return response;
    }
    pause(args) {
        return this.send('pause', args);
    }
    terminateThreads(args) {
        if (this.capabilities.supportsTerminateThreadsRequest) {
            return this.send('terminateThreads', args);
        }
        return Promise.reject(new Error('terminateThreads not supported'));
    }
    setVariable(args) {
        if (this.capabilities.supportsSetVariable) {
            return this.send('setVariable', args);
        }
        return Promise.reject(new Error('setVariable not supported'));
    }
    setExpression(args) {
        if (this.capabilities.supportsSetExpression) {
            return this.send('setExpression', args);
        }
        return Promise.reject(new Error('setExpression not supported'));
    }
    async restartFrame(args, threadId) {
        if (this.capabilities.supportsRestartFrame) {
            this.stoppedSinceLastStep = false;
            const response = await this.send('restartFrame', args);
            if (!this.stoppedSinceLastStep) {
                this.fireSimulatedContinuedEvent(threadId);
            }
            return response;
        }
        return Promise.reject(new Error('restartFrame not supported'));
    }
    stepInTargets(args) {
        if (this.capabilities.supportsStepInTargetsRequest) {
            return this.send('stepInTargets', args);
        }
        return Promise.reject(new Error('stepInTargets not supported'));
    }
    completions(args, token) {
        if (this.capabilities.supportsCompletionsRequest) {
            return this.send('completions', args, token);
        }
        return Promise.reject(new Error('completions not supported'));
    }
    setBreakpoints(args) {
        return this.send('setBreakpoints', args);
    }
    setFunctionBreakpoints(args) {
        if (this.capabilities.supportsFunctionBreakpoints) {
            return this.send('setFunctionBreakpoints', args);
        }
        return Promise.reject(new Error('setFunctionBreakpoints not supported'));
    }
    dataBreakpointInfo(args) {
        if (this.capabilities.supportsDataBreakpoints) {
            return this.send('dataBreakpointInfo', args);
        }
        return Promise.reject(new Error('dataBreakpointInfo not supported'));
    }
    setDataBreakpoints(args) {
        if (this.capabilities.supportsDataBreakpoints) {
            return this.send('setDataBreakpoints', args);
        }
        return Promise.reject(new Error('setDataBreakpoints not supported'));
    }
    setExceptionBreakpoints(args) {
        return this.send('setExceptionBreakpoints', args);
    }
    breakpointLocations(args) {
        if (this.capabilities.supportsBreakpointLocationsRequest) {
            return this.send('breakpointLocations', args);
        }
        return Promise.reject(new Error('breakpointLocations is not supported'));
    }
    configurationDone() {
        if (this.capabilities.supportsConfigurationDoneRequest) {
            return this.send('configurationDone', null);
        }
        return Promise.reject(new Error('configurationDone not supported'));
    }
    stackTrace(args, token) {
        return this.send('stackTrace', args, token);
    }
    exceptionInfo(args) {
        if (this.capabilities.supportsExceptionInfoRequest) {
            return this.send('exceptionInfo', args);
        }
        return Promise.reject(new Error('exceptionInfo not supported'));
    }
    scopes(args, token) {
        return this.send('scopes', args, token);
    }
    variables(args, token) {
        return this.send('variables', args, token);
    }
    source(args) {
        return this.send('source', args);
    }
    locations(args) {
        return this.send('locations', args);
    }
    loadedSources(args) {
        if (this.capabilities.supportsLoadedSourcesRequest) {
            return this.send('loadedSources', args);
        }
        return Promise.reject(new Error('loadedSources not supported'));
    }
    threads() {
        return this.send('threads', null);
    }
    evaluate(args) {
        return this.send('evaluate', args);
    }
    async stepBack(args) {
        if (this.capabilities.supportsStepBack) {
            this.stoppedSinceLastStep = false;
            const response = await this.send('stepBack', args);
            if (!this.stoppedSinceLastStep) {
                this.fireSimulatedContinuedEvent(args.threadId);
            }
            return response;
        }
        return Promise.reject(new Error('stepBack not supported'));
    }
    async reverseContinue(args) {
        if (this.capabilities.supportsStepBack) {
            this.stoppedSinceLastStep = false;
            const response = await this.send('reverseContinue', args);
            if (!this.stoppedSinceLastStep) {
                this.fireSimulatedContinuedEvent(args.threadId);
            }
            return response;
        }
        return Promise.reject(new Error('reverseContinue not supported'));
    }
    gotoTargets(args) {
        if (this.capabilities.supportsGotoTargetsRequest) {
            return this.send('gotoTargets', args);
        }
        return Promise.reject(new Error('gotoTargets is not supported'));
    }
    async goto(args) {
        if (this.capabilities.supportsGotoTargetsRequest) {
            this.stoppedSinceLastStep = false;
            const response = await this.send('goto', args);
            if (!this.stoppedSinceLastStep) {
                this.fireSimulatedContinuedEvent(args.threadId);
            }
            return response;
        }
        return Promise.reject(new Error('goto is not supported'));
    }
    async setInstructionBreakpoints(args) {
        if (this.capabilities.supportsInstructionBreakpoints) {
            return await this.send('setInstructionBreakpoints', args);
        }
        return Promise.reject(new Error('setInstructionBreakpoints is not supported'));
    }
    async disassemble(args) {
        if (this.capabilities.supportsDisassembleRequest) {
            return await this.send('disassemble', args);
        }
        return Promise.reject(new Error('disassemble is not supported'));
    }
    async readMemory(args) {
        if (this.capabilities.supportsReadMemoryRequest) {
            return await this.send('readMemory', args);
        }
        return Promise.reject(new Error('readMemory is not supported'));
    }
    async writeMemory(args) {
        if (this.capabilities.supportsWriteMemoryRequest) {
            return await this.send('writeMemory', args);
        }
        return Promise.reject(new Error('writeMemory is not supported'));
    }
    cancel(args) {
        return this.send('cancel', args);
    }
    custom(request, args) {
        return this.send(request, args);
    }
    //---- private
    async shutdown(error, restart = false, terminateDebuggee = undefined, suspendDebuggee = undefined) {
        if (!this.inShutdown) {
            this.inShutdown = true;
            if (this.debugAdapter) {
                try {
                    const args = { restart };
                    if (typeof terminateDebuggee === 'boolean') {
                        args.terminateDebuggee = terminateDebuggee;
                    }
                    if (typeof suspendDebuggee === 'boolean') {
                        args.suspendDebuggee = suspendDebuggee;
                    }
                    // if there's an error, the DA is probably already gone, so give it a much shorter timeout.
                    await this.send('disconnect', args, undefined, error ? 200 : 2000);
                }
                catch (e) {
                    // Catch the potential 'disconnect' error - no need to show it to the user since the adapter is shutting down
                }
                finally {
                    await this.stopAdapter(error);
                }
            }
            else {
                return this.stopAdapter(error);
            }
        }
    }
    async stopAdapter(error) {
        try {
            if (this.debugAdapter) {
                const da = this.debugAdapter;
                this.debugAdapter = null;
                await da.stopSession();
                this.debugAdapterStopped = true;
            }
        }
        finally {
            this.fireAdapterExitEvent(error);
        }
    }
    fireAdapterExitEvent(error) {
        if (!this.firedAdapterExitEvent) {
            this.firedAdapterExitEvent = true;
            const e = {
                emittedStopped: this.didReceiveStoppedEvent,
                sessionLengthInSeconds: (new Date().getTime() - this.startTime) / 1000
            };
            if (error && !this.debugAdapterStopped) {
                e.error = error;
            }
            this._onDidExitAdapter.fire(e);
        }
    }
    async dispatchRequest(request) {
        const response = {
            type: 'response',
            seq: 0,
            command: request.command,
            request_seq: request.seq,
            success: true
        };
        const safeSendResponse = (response) => this.debugAdapter && this.debugAdapter.sendResponse(response);
        if (request.command === 'launchVSCode') {
            try {
                let result = await this.launchVsCode(request.arguments);
                if (!result.success) {
                    const { confirmed } = await this.dialogSerivce.confirm({
                        type: Severity.Warning,
                        message: nls.localize('canNotStart', "The debugger needs to open a new tab or window for the debuggee but the browser prevented this. You must give permission to continue."),
                        primaryButton: nls.localize({ key: 'continue', comment: ['&& denotes a mnemonic'] }, "&&Continue")
                    });
                    if (confirmed) {
                        result = await this.launchVsCode(request.arguments);
                    }
                    else {
                        response.success = false;
                        safeSendResponse(response);
                        await this.shutdown();
                    }
                }
                response.body = {
                    rendererDebugAddr: result.rendererDebugAddr,
                };
                safeSendResponse(response);
            }
            catch (err) {
                response.success = false;
                response.message = err.message;
                safeSendResponse(response);
            }
        }
        else if (request.command === 'runInTerminal') {
            try {
                const shellProcessId = await this.dbgr.runInTerminal(request.arguments, this.sessionId);
                const resp = response;
                resp.body = {};
                if (typeof shellProcessId === 'number') {
                    resp.body.shellProcessId = shellProcessId;
                }
                safeSendResponse(resp);
            }
            catch (err) {
                response.success = false;
                response.message = err.message;
                safeSendResponse(response);
            }
        }
        else if (request.command === 'startDebugging') {
            try {
                const args = request.arguments;
                const config = {
                    ...args.configuration,
                    ...{
                        request: args.request,
                        type: this.dbgr.type,
                        name: args.configuration.name || this.name
                    }
                };
                const success = await this.dbgr.startDebugging(config, this.sessionId);
                if (success) {
                    safeSendResponse(response);
                }
                else {
                    response.success = false;
                    response.message = 'Failed to start debugging';
                    safeSendResponse(response);
                }
            }
            catch (err) {
                response.success = false;
                response.message = err.message;
                safeSendResponse(response);
            }
        }
        else {
            response.success = false;
            response.message = `unknown request '${request.command}'`;
            safeSendResponse(response);
        }
    }
    launchVsCode(vscodeArgs) {
        const args = [];
        for (const arg of vscodeArgs.args) {
            const a2 = (arg.prefix || '') + (arg.path || '');
            const match = /^--(.+)=(.+)$/.exec(a2);
            if (match && match.length === 3) {
                const key = match[1];
                let value = match[2];
                if ((key === 'file-uri' || key === 'folder-uri') && !isUriString(arg.path)) {
                    value = isUriString(value) ? value : URI.file(value).toString();
                }
                args.push(`--${key}=${value}`);
            }
            else {
                args.push(a2);
            }
        }
        if (vscodeArgs.env) {
            args.push(`--extensionEnvironment=${JSON.stringify(vscodeArgs.env)}`);
        }
        return this.extensionHostDebugService.openExtensionDevelopmentHostWindow(args, !!vscodeArgs.debugRenderer);
    }
    send(command, args, token, timeout, showErrors = true) {
        return new Promise((completeDispatch, errorDispatch) => {
            if (!this.debugAdapter) {
                if (this.inShutdown) {
                    // We are in shutdown silently complete
                    completeDispatch(undefined);
                }
                else {
                    errorDispatch(new Error(nls.localize('noDebugAdapter', "No debugger available found. Can not send '{0}'.", command)));
                }
                return;
            }
            let cancelationListener;
            const requestId = this.debugAdapter.sendRequest(command, args, (response) => {
                cancelationListener?.dispose();
                if (response.success) {
                    completeDispatch(response);
                }
                else {
                    errorDispatch(response);
                }
            }, timeout);
            if (token) {
                cancelationListener = token.onCancellationRequested(() => {
                    cancelationListener.dispose();
                    if (this.capabilities.supportsCancelRequest) {
                        this.cancel({ requestId });
                    }
                });
            }
        }).then(undefined, err => Promise.reject(this.handleErrorResponse(err, showErrors)));
    }
    handleErrorResponse(errorResponse, showErrors) {
        if (errorResponse.command === 'canceled' && errorResponse.message === 'canceled') {
            return new errors.CancellationError();
        }
        const error = errorResponse?.body?.error;
        const errorMessage = errorResponse?.message || '';
        const userMessage = error ? formatPII(error.format, false, error.variables) : errorMessage;
        const url = error?.url;
        if (error && url) {
            const label = error.urlLabel ? error.urlLabel : nls.localize('moreInfo', "More Info");
            const uri = URI.parse(url);
            // Use a suffixed id if uri invokes a command, so default 'Open launch.json' command is suppressed on dialog
            const actionId = uri.scheme === Schemas.command ? 'debug.moreInfo.command' : 'debug.moreInfo';
            return createErrorWithActions(userMessage, [toAction({ id: actionId, label, run: () => this.openerService.open(uri, { allowCommands: true }) })]);
        }
        if (showErrors && error && error.format && error.showUser) {
            this.notificationService.error(userMessage);
        }
        const result = new errors.ErrorNoTelemetry(userMessage);
        result.showUser = error?.showUser;
        return result;
    }
    mergeCapabilities(capabilities) {
        if (capabilities) {
            this._capabilities = objects.mixin(this._capabilities, capabilities);
        }
    }
    fireSimulatedContinuedEvent(threadId, allThreadsContinued = false) {
        this._onDidContinued.fire({
            type: 'event',
            event: 'continued',
            body: {
                threadId,
                allThreadsContinued
            },
            seq: undefined
        });
    }
    dispose() {
        this.toDispose.dispose();
    }
};
RawDebugSession = __decorate([
    __param(4, IExtensionHostDebugService),
    __param(5, IOpenerService),
    __param(6, INotificationService),
    __param(7, IDialogService)
], RawDebugSession);
export { RawDebugSession };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmF3RGVidWdTZXNzaW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9yYXdEZWJ1Z1Nlc3Npb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQVMsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxLQUFLLE1BQU0sTUFBTSxtQ0FBbUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNqRixPQUFPLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRWpFLE9BQU8sRUFBRSwwQkFBMEIsRUFBOEIsTUFBTSx5REFBeUQsQ0FBQztBQUNqSSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxlQUFlLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVwRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQWtCN0Q7O0dBRUc7QUFDSSxJQUFNLGVBQWUsR0FBckIsTUFBTSxlQUFlO0lBeUMzQixZQUNDLFlBQTJCLEVBQ1gsSUFBZSxFQUNkLFNBQWlCLEVBQ2pCLElBQVksRUFDRCx5QkFBc0UsRUFDbEYsYUFBOEMsRUFDeEMsbUJBQTBELEVBQ2hFLGFBQThDO1FBTjlDLFNBQUksR0FBSixJQUFJLENBQVc7UUFDZCxjQUFTLEdBQVQsU0FBUyxDQUFRO1FBQ2pCLFNBQUksR0FBSixJQUFJLENBQVE7UUFDZ0IsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUE0QjtRQUNqRSxrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7UUFDdkIsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFzQjtRQUMvQyxrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7UUEvQ3ZELHdCQUFtQixHQUFHLElBQUksQ0FBQztRQUMzQix5QkFBb0IsR0FBRyxLQUFLLENBQUM7UUFHckMsV0FBVztRQUNILHdCQUFtQixHQUFHLEtBQUssQ0FBQztRQUM1QixlQUFVLEdBQUcsS0FBSyxDQUFDO1FBQ25CLGVBQVUsR0FBRyxLQUFLLENBQUM7UUFDbkIsMEJBQXFCLEdBQUcsS0FBSyxDQUFDO1FBRXRDLFlBQVk7UUFDSixjQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsMkJBQXNCLEdBQUcsS0FBSyxDQUFDO1FBRXRCLGNBQVMsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRW5ELGFBQWE7UUFDSSxxQkFBZ0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBa0MsQ0FBQyxDQUFDO1FBQ3JGLGVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBOEIsQ0FBQyxDQUFDO1FBQzNFLG9CQUFlLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLEVBQWdDLENBQUMsQ0FBQztRQUNsRiwyQkFBc0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBaUMsQ0FBQyxDQUFDO1FBQzFGLHNCQUFpQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUE2QixDQUFDLENBQUM7UUFDakYsaUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBNkIsQ0FBQyxDQUFDO1FBQzVFLGlCQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLEVBQTZCLENBQUMsQ0FBQztRQUM1RSxxQkFBZ0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBaUMsQ0FBQyxDQUFDO1FBQ3BGLHVCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUFtQyxDQUFDLENBQUM7UUFDeEYsd0JBQW1CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLEVBQW9DLENBQUMsQ0FBQztRQUMxRix5QkFBb0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBcUMsQ0FBQyxDQUFDO1FBQzVGLHNCQUFpQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUFrQyxDQUFDLENBQUM7UUFDdEYsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLEVBQWtDLENBQUMsQ0FBQztRQUN0RiwyQkFBc0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBNkIsQ0FBQyxDQUFDO1FBQ3RGLHNCQUFpQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUF1QixDQUFDLENBQUM7UUFDM0UsZ0JBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBdUIsQ0FBQyxDQUFDO1FBRXRGLFlBQVk7UUFDSyxzQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBbUIsQ0FBQyxDQUFDO1FBRWhGLHlCQUFvQixHQUFHLEtBQUssQ0FBQztRQVlwQyxJQUFJLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQztRQUNqQyxJQUFJLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFekMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUU7WUFDbEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNwQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDbEQsSUFBSSxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2hCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxLQUFLLENBQUMsY0FBYyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDaEQsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLGNBQWM7Z0JBQ2QsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2pCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDakMsUUFBUSxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3JCLEtBQUssYUFBYTtvQkFDakIsSUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksQ0FBQztvQkFDakMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDbEMsTUFBTTtnQkFDUCxLQUFLLGNBQWM7b0JBQ2xCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQWtDLEtBQUssQ0FBQyxDQUFDO29CQUNyRSxNQUFNO2dCQUNQLEtBQUssY0FBYztvQkFDbEIsSUFBSSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7d0JBQ2hCLE1BQU0sWUFBWSxHQUFxQyxLQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQzt3QkFDaEYsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxDQUFDO29CQUN0QyxDQUFDO29CQUNELE1BQU07Z0JBQ1AsS0FBSyxTQUFTO29CQUNiLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUMsQ0FBRSx5REFBeUQ7b0JBQzlGLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUM7b0JBQ2pDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUE2QixLQUFLLENBQUMsQ0FBQztvQkFDeEQsTUFBTTtnQkFDUCxLQUFLLFdBQVc7b0JBQ2YsSUFBSSxDQUFDLG1CQUFtQixHQUFrQyxLQUFNLENBQUMsSUFBSSxDQUFDLG1CQUFtQixLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQ25ILElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUErQixLQUFLLENBQUMsQ0FBQztvQkFDL0QsTUFBTTtnQkFDUCxLQUFLLFFBQVE7b0JBQ1osSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQTRCLEtBQUssQ0FBQyxDQUFDO29CQUN6RCxNQUFNO2dCQUNQLEtBQUssUUFBUTtvQkFDWixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBNEIsS0FBSyxDQUFDLENBQUM7b0JBQ3pELE1BQU07Z0JBQ1AsS0FBSyxZQUFZO29CQUNoQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFnQyxLQUFLLENBQUMsQ0FBQztvQkFDakUsTUFBTTtnQkFDUCxLQUFLLFlBQVk7b0JBQ2hCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQWdDLEtBQUssQ0FBQyxDQUFDO29CQUN2RSxNQUFNO2dCQUNQLEtBQUssUUFBUTtvQkFDWixJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUE0QixLQUFLLENBQUMsQ0FBQztvQkFDOUQsTUFBTTtnQkFDUCxLQUFLLGVBQWU7b0JBQ25CLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsS0FBeUMsQ0FBQyxDQUFDO29CQUN6RSxNQUFNO2dCQUNQLEtBQUssZ0JBQWdCO29CQUNwQixJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLEtBQTBDLENBQUMsQ0FBQztvQkFDM0UsTUFBTTtnQkFDUCxLQUFLLGFBQWE7b0JBQ2pCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsS0FBdUMsQ0FBQyxDQUFDO29CQUNyRSxNQUFNO2dCQUNQLEtBQUssYUFBYTtvQkFDakIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxLQUF1QyxDQUFDLENBQUM7b0JBQ3JFLE1BQU07Z0JBQ1AsS0FBSyxRQUFRO29CQUNaLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsS0FBa0MsQ0FBQyxDQUFDO29CQUNyRSxNQUFNO2dCQUNQLEtBQUssU0FBUztvQkFDYixNQUFNO2dCQUNQLEtBQUssUUFBUTtvQkFDWixNQUFNO2dCQUNQO29CQUNDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ25DLE1BQU07WUFDUixDQUFDO1lBQ0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUIsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBRUQsSUFBSSxZQUFZO1FBQ2YsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDO0lBQ3hCLENBQUM7SUFFRCxJQUFJLGdCQUFnQjtRQUNuQixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7SUFDckMsQ0FBQztJQUVELElBQUksWUFBWTtRQUNmLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQztJQUMzQixDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsSUFBSSxtQkFBbUI7UUFDdEIsT0FBTyxJQUFJLENBQUMsb0JBQW9CLENBQUM7SUFDbEMsQ0FBQztJQUVELGlCQUFpQjtJQUVqQixJQUFJLGVBQWU7UUFDbEIsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDO0lBQ3BDLENBQUM7SUFFRCxJQUFJLFNBQVM7UUFDWixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDO0lBQzlCLENBQUM7SUFFRCxJQUFJLGNBQWM7UUFDakIsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQztJQUNuQyxDQUFDO0lBRUQsSUFBSSxxQkFBcUI7UUFDeEIsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxDQUFDO0lBQzFDLENBQUM7SUFFRCxJQUFJLGdCQUFnQjtRQUNuQixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7SUFDckMsQ0FBQztJQUVELElBQUksV0FBVztRQUNkLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7SUFDaEMsQ0FBQztJQUVELElBQUksV0FBVztRQUNkLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7SUFDaEMsQ0FBQztJQUVELElBQUksZUFBZTtRQUNsQixPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUM7SUFDcEMsQ0FBQztJQUVELElBQUksaUJBQWlCO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQztJQUN0QyxDQUFDO0lBRUQsSUFBSSxnQkFBZ0I7UUFDbkIsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDO0lBQ3JDLENBQUM7SUFFRCxJQUFJLGtCQUFrQjtRQUNyQixPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7SUFDdkMsQ0FBQztJQUVELElBQUksbUJBQW1CO1FBQ3RCLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQztJQUN4QyxDQUFDO0lBRUQsSUFBSSxnQkFBZ0I7UUFDbkIsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDO0lBQ3JDLENBQUM7SUFFRCxJQUFJLGdCQUFnQjtRQUNuQixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7SUFDckMsQ0FBQztJQUVELElBQUkscUJBQXFCO1FBQ3hCLE9BQU8sSUFBSSxDQUFDLHNCQUFzQixDQUFDLEtBQUssQ0FBQztJQUMxQyxDQUFDO0lBRUQsSUFBSSxVQUFVO1FBQ2IsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQztJQUMvQixDQUFDO0lBRUQsNkJBQTZCO0lBRTdCOztPQUVHO0lBQ0gsS0FBSyxDQUFDLEtBQUs7UUFDVixJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3hCLE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLHFCQUFxQixFQUFFLGdEQUFnRCxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pILENBQUM7UUFFRCxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDdkMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3ZDLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBOEM7UUFDOUQsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNsRixJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QyxDQUFDO1FBRUQsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsVUFBVSxDQUFDLElBQXVDO1FBQ2pELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDMUcsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDbEosT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGVBQWUsQ0FBQyxDQUFDO0lBQ25GLENBQUM7SUFFRCxtQkFBbUI7SUFFbkIsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFlO1FBQ25DLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RGLElBQUksUUFBUSxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7UUFFRCxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxTQUFTLENBQUMsT0FBTyxHQUFHLEtBQUs7UUFDeEIsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLHdCQUF3QixFQUFFLENBQUM7WUFDaEQsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDdEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7Z0JBQ3ZCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN2RCxDQUFDO1lBQ0QsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDOUQsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUVELE9BQU8sQ0FBQyxJQUFvQztRQUMzQyxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztZQUM5QyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ25DLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSSxDQUFDLElBQWlDO1FBQzNDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLENBQUM7UUFDbEMsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMvQyxJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDaEMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBQ0QsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBbUM7UUFDL0MsSUFBSSxDQUFDLG9CQUFvQixHQUFHLEtBQUssQ0FBQztRQUNsQyxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2pELElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUMsMkJBQTJCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFDRCxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRUQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFvQztRQUNqRCxJQUFJLENBQUMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO1FBQ2xDLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQ2hDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDakQsQ0FBQztRQUNELE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxLQUFLLENBQUMsUUFBUSxDQUFDLElBQXFDO1FBQ25ELElBQUksQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLENBQUM7UUFDbEMsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFpQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbkYsSUFBSSxRQUFRLElBQUksUUFBUSxDQUFDLElBQUksSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLG1CQUFtQixLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ2xGLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDO1FBQzlELENBQUM7UUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDaEMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDM0UsQ0FBQztRQUVELE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBa0M7UUFDdkMsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNqQyxDQUFDO0lBRUQsZ0JBQWdCLENBQUMsSUFBNkM7UUFDN0QsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLCtCQUErQixFQUFFLENBQUM7WUFDdkQsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsZ0NBQWdDLENBQUMsQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFFRCxXQUFXLENBQUMsSUFBd0M7UUFDbkQsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDM0MsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFvQyxhQUFhLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDMUUsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUVELGFBQWEsQ0FBQyxJQUEwQztRQUN2RCxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQXNDLGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM5RSxDQUFDO1FBQ0QsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQsS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUF5QyxFQUFFLFFBQWdCO1FBQzdFLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQzVDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLENBQUM7WUFDbEMsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN2RCxJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7Z0JBQ2hDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUM1QyxDQUFDO1lBQ0QsT0FBTyxRQUFRLENBQUM7UUFDakIsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUVELGFBQWEsQ0FBQyxJQUEwQztRQUN2RCxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztZQUNwRCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pDLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFFRCxXQUFXLENBQUMsSUFBd0MsRUFBRSxLQUF3QjtRQUM3RSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztZQUNsRCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQW9DLGFBQWEsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakYsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUVELGNBQWMsQ0FBQyxJQUEyQztRQUN6RCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQXVDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2hGLENBQUM7SUFFRCxzQkFBc0IsQ0FBQyxJQUFtRDtRQUN6RSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztZQUNuRCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQStDLHdCQUF3QixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2hHLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsc0NBQXNDLENBQUMsQ0FBQyxDQUFDO0lBQzFFLENBQUM7SUFFRCxrQkFBa0IsQ0FBQyxJQUErQztRQUNqRSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUMvQyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQTJDLG9CQUFvQixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3hGLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsa0NBQWtDLENBQUMsQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFFRCxrQkFBa0IsQ0FBQyxJQUErQztRQUNqRSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUMvQyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQTJDLG9CQUFvQixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3hGLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsa0NBQWtDLENBQUMsQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFFRCx1QkFBdUIsQ0FBQyxJQUFvRDtRQUMzRSxPQUFPLElBQUksQ0FBQyxJQUFJLENBQWdELHlCQUF5QixFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2xHLENBQUM7SUFFRCxtQkFBbUIsQ0FBQyxJQUFnRDtRQUNuRSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsa0NBQWtDLEVBQUUsQ0FBQztZQUMxRCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDL0MsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDLENBQUM7SUFDMUUsQ0FBQztJQUVELGlCQUFpQjtRQUNoQixJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsZ0NBQWdDLEVBQUUsQ0FBQztZQUN4RCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDLENBQUM7SUFDckUsQ0FBQztJQUVELFVBQVUsQ0FBQyxJQUF1QyxFQUFFLEtBQXdCO1FBQzNFLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBbUMsWUFBWSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMvRSxDQUFDO0lBRUQsYUFBYSxDQUFDLElBQTBDO1FBQ3ZELElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyw0QkFBNEIsRUFBRSxDQUFDO1lBQ3BELE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBc0MsZUFBZSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzlFLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFFRCxNQUFNLENBQUMsSUFBbUMsRUFBRSxLQUF3QjtRQUNuRSxPQUFPLElBQUksQ0FBQyxJQUFJLENBQStCLFFBQVEsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDdkUsQ0FBQztJQUVELFNBQVMsQ0FBQyxJQUFzQyxFQUFFLEtBQXlCO1FBQzFFLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBa0MsV0FBVyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM3RSxDQUFDO0lBRUQsTUFBTSxDQUFDLElBQW1DO1FBQ3pDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBK0IsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRCxTQUFTLENBQUMsSUFBc0M7UUFDL0MsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFrQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDdEUsQ0FBQztJQUVELGFBQWEsQ0FBQyxJQUEwQztRQUN2RCxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztZQUNwRCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQXNDLGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM5RSxDQUFDO1FBQ0QsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQsT0FBTztRQUNOLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBZ0MsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFFRCxRQUFRLENBQUMsSUFBcUM7UUFDN0MsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFpQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDcEUsQ0FBQztJQUVELEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBcUM7UUFDbkQsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDeEMsSUFBSSxDQUFDLG9CQUFvQixHQUFHLEtBQUssQ0FBQztZQUNsQyxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ25ELElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztnQkFDaEMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNqRCxDQUFDO1lBQ0QsT0FBTyxRQUFRLENBQUM7UUFDakIsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUVELEtBQUssQ0FBQyxlQUFlLENBQUMsSUFBNEM7UUFDakUsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDeEMsSUFBSSxDQUFDLG9CQUFvQixHQUFHLEtBQUssQ0FBQztZQUNsQyxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDMUQsSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO2dCQUNoQyxJQUFJLENBQUMsMkJBQTJCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2pELENBQUM7WUFDRCxPQUFPLFFBQVEsQ0FBQztRQUNqQixDQUFDO1FBQ0QsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLCtCQUErQixDQUFDLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBRUQsV0FBVyxDQUFDLElBQXdDO1FBQ25ELElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO1lBQ2xELE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdkMsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVELEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBaUM7UUFDM0MsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLDBCQUEwQixFQUFFLENBQUM7WUFDbEQsSUFBSSxDQUFDLG9CQUFvQixHQUFHLEtBQUssQ0FBQztZQUNsQyxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQy9DLElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztnQkFDaEMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNqRCxDQUFDO1lBQ0QsT0FBTyxRQUFRLENBQUM7UUFDakIsQ0FBQztRQUVELE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVELEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxJQUFzRDtRQUNyRixJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsOEJBQThCLEVBQUUsQ0FBQztZQUN0RCxPQUFPLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQywyQkFBMkIsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMzRCxDQUFDO1FBRUQsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLDRDQUE0QyxDQUFDLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBRUQsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUF3QztRQUN6RCxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztZQUNsRCxPQUFPLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUVELE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVELEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBdUM7UUFDdkQsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLHlCQUF5QixFQUFFLENBQUM7WUFDakQsT0FBTyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFFRCxPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFFRCxLQUFLLENBQUMsV0FBVyxDQUFDLElBQXdDO1FBQ3pELElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO1lBQ2xELE9BQU8sTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3QyxDQUFDO1FBRUQsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRUQsTUFBTSxDQUFDLElBQW1DO1FBQ3pDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVELE1BQU0sQ0FBQyxPQUFlLEVBQUUsSUFBUztRQUNoQyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFRCxjQUFjO0lBRU4sS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFhLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxvQkFBeUMsU0FBUyxFQUFFLGtCQUF1QyxTQUFTO1FBQzFKLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDdEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7WUFDdkIsSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ3ZCLElBQUksQ0FBQztvQkFDSixNQUFNLElBQUksR0FBc0MsRUFBRSxPQUFPLEVBQUUsQ0FBQztvQkFDNUQsSUFBSSxPQUFPLGlCQUFpQixLQUFLLFNBQVMsRUFBRSxDQUFDO3dCQUM1QyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsaUJBQWlCLENBQUM7b0JBQzVDLENBQUM7b0JBRUQsSUFBSSxPQUFPLGVBQWUsS0FBSyxTQUFTLEVBQUUsQ0FBQzt3QkFDMUMsSUFBSSxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7b0JBQ3hDLENBQUM7b0JBRUQsMkZBQTJGO29CQUMzRixNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNwRSxDQUFDO2dCQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQ1osNkdBQTZHO2dCQUM5RyxDQUFDO3dCQUFTLENBQUM7b0JBQ1YsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUMvQixDQUFDO1lBQ0YsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNoQyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsV0FBVyxDQUFDLEtBQWE7UUFDdEMsSUFBSSxDQUFDO1lBQ0osSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ3ZCLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO2dCQUN6QixNQUFNLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztZQUNqQyxDQUFDO1FBQ0YsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2xDLENBQUM7SUFDRixDQUFDO0lBRU8sb0JBQW9CLENBQUMsS0FBYTtRQUN6QyxJQUFJLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7WUFDakMsSUFBSSxDQUFDLHFCQUFxQixHQUFHLElBQUksQ0FBQztZQUVsQyxNQUFNLENBQUMsR0FBb0I7Z0JBQzFCLGNBQWMsRUFBRSxJQUFJLENBQUMsc0JBQXNCO2dCQUMzQyxzQkFBc0IsRUFBRSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLElBQUk7YUFDdEUsQ0FBQztZQUNGLElBQUksS0FBSyxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7Z0JBQ3hDLENBQUMsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1lBQ2pCLENBQUM7WUFDRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hDLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLGVBQWUsQ0FBQyxPQUE4QjtRQUUzRCxNQUFNLFFBQVEsR0FBMkI7WUFDeEMsSUFBSSxFQUFFLFVBQVU7WUFDaEIsR0FBRyxFQUFFLENBQUM7WUFDTixPQUFPLEVBQUUsT0FBTyxDQUFDLE9BQU87WUFDeEIsV0FBVyxFQUFFLE9BQU8sQ0FBQyxHQUFHO1lBQ3hCLE9BQU8sRUFBRSxJQUFJO1NBQ2IsQ0FBQztRQUVGLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxRQUFnQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTdILElBQUksT0FBTyxDQUFDLE9BQU8sS0FBSyxjQUFjLEVBQUUsQ0FBQztZQUN4QyxJQUFJLENBQUM7Z0JBQ0osSUFBSSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUF5QixPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ2hGLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ3JCLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDO3dCQUN0RCxJQUFJLEVBQUUsUUFBUSxDQUFDLE9BQU87d0JBQ3RCLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSx1SUFBdUksQ0FBQzt3QkFDN0ssYUFBYSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxZQUFZLENBQUM7cUJBQ2xHLENBQUMsQ0FBQztvQkFDSCxJQUFJLFNBQVMsRUFBRSxDQUFDO3dCQUNmLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQXlCLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDN0UsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLFFBQVEsQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO3dCQUN6QixnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDM0IsTUFBTSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQ3ZCLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxRQUFRLENBQUMsSUFBSSxHQUFHO29CQUNmLGlCQUFpQixFQUFFLE1BQU0sQ0FBQyxpQkFBaUI7aUJBQzNDLENBQUM7Z0JBQ0YsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDNUIsQ0FBQztZQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7Z0JBQ2QsUUFBUSxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7Z0JBQ3pCLFFBQVEsQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQztnQkFDL0IsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDNUIsQ0FBQztRQUNGLENBQUM7YUFBTSxJQUFJLE9BQU8sQ0FBQyxPQUFPLEtBQUssZUFBZSxFQUFFLENBQUM7WUFDaEQsSUFBSSxDQUFDO2dCQUNKLE1BQU0sY0FBYyxHQUFHLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLFNBQXdELEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN2SSxNQUFNLElBQUksR0FBRyxRQUErQyxDQUFDO2dCQUM3RCxJQUFJLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztnQkFDZixJQUFJLE9BQU8sY0FBYyxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUN4QyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsR0FBRyxjQUFjLENBQUM7Z0JBQzNDLENBQUM7Z0JBQ0QsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDeEIsQ0FBQztZQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7Z0JBQ2QsUUFBUSxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7Z0JBQ3pCLFFBQVEsQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQztnQkFDL0IsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDNUIsQ0FBQztRQUNGLENBQUM7YUFBTSxJQUFJLE9BQU8sQ0FBQyxPQUFPLEtBQUssZ0JBQWdCLEVBQUUsQ0FBQztZQUNqRCxJQUFJLENBQUM7Z0JBQ0osTUFBTSxJQUFJLEdBQUksT0FBTyxDQUFDLFNBQTBELENBQUM7Z0JBQ2pGLE1BQU0sTUFBTSxHQUFZO29CQUN2QixHQUFHLElBQUksQ0FBQyxhQUFhO29CQUNyQixHQUFHO3dCQUNGLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTzt3QkFDckIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSTt3QkFDcEIsSUFBSSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJO3FCQUMxQztpQkFDRCxDQUFDO2dCQUNGLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDdkUsSUFBSSxPQUFPLEVBQUUsQ0FBQztvQkFDYixnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDNUIsQ0FBQztxQkFBTSxDQUFDO29CQUNQLFFBQVEsQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO29CQUN6QixRQUFRLENBQUMsT0FBTyxHQUFHLDJCQUEyQixDQUFDO29CQUMvQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDNUIsQ0FBQztZQUNGLENBQUM7WUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO2dCQUNkLFFBQVEsQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO2dCQUN6QixRQUFRLENBQUMsT0FBTyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUM7Z0JBQy9CLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzVCLENBQUM7UUFDRixDQUFDO2FBQU0sQ0FBQztZQUNQLFFBQVEsQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO1lBQ3pCLFFBQVEsQ0FBQyxPQUFPLEdBQUcsb0JBQW9CLE9BQU8sQ0FBQyxPQUFPLEdBQUcsQ0FBQztZQUMxRCxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1QixDQUFDO0lBQ0YsQ0FBQztJQUVPLFlBQVksQ0FBQyxVQUFrQztRQUV0RCxNQUFNLElBQUksR0FBYSxFQUFFLENBQUM7UUFFMUIsS0FBSyxNQUFNLEdBQUcsSUFBSSxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDbkMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNqRCxNQUFNLEtBQUssR0FBRyxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZDLElBQUksS0FBSyxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2pDLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDckIsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUVyQixJQUFJLENBQUMsR0FBRyxLQUFLLFVBQVUsSUFBSSxHQUFHLEtBQUssWUFBWSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQzVFLEtBQUssR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDakUsQ0FBQztnQkFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDaEMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDZixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxJQUFJLENBQUMsMEJBQTBCLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN2RSxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMseUJBQXlCLENBQUMsa0NBQWtDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDNUcsQ0FBQztJQUVPLElBQUksQ0FBbUMsT0FBZSxFQUFFLElBQVMsRUFBRSxLQUF5QixFQUFFLE9BQWdCLEVBQUUsVUFBVSxHQUFHLElBQUk7UUFDeEksT0FBTyxJQUFJLE9BQU8sQ0FBcUMsQ0FBQyxnQkFBZ0IsRUFBRSxhQUFhLEVBQUUsRUFBRTtZQUMxRixJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUN4QixJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDckIsdUNBQXVDO29CQUN2QyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDN0IsQ0FBQztxQkFBTSxDQUFDO29CQUNQLGFBQWEsQ0FBQyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLGtEQUFrRCxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkgsQ0FBQztnQkFDRCxPQUFPO1lBQ1IsQ0FBQztZQUVELElBQUksbUJBQWdDLENBQUM7WUFDckMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLFFBQWdDLEVBQUUsRUFBRTtnQkFDbkcsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLENBQUM7Z0JBRS9CLElBQUksUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUN0QixnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDNUIsQ0FBQztxQkFBTSxDQUFDO29CQUNQLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDekIsQ0FBQztZQUNGLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUVaLElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQ1gsbUJBQW1CLEdBQUcsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRTtvQkFDeEQsbUJBQW1CLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQzlCLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO3dCQUM3QyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztvQkFDNUIsQ0FBQztnQkFDRixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RixDQUFDO0lBRU8sbUJBQW1CLENBQUMsYUFBcUMsRUFBRSxVQUFtQjtRQUVyRixJQUFJLGFBQWEsQ0FBQyxPQUFPLEtBQUssVUFBVSxJQUFJLGFBQWEsQ0FBQyxPQUFPLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDbEYsT0FBTyxJQUFJLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ3ZDLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBc0MsYUFBYSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUM7UUFDNUUsTUFBTSxZQUFZLEdBQUcsYUFBYSxFQUFFLE9BQU8sSUFBSSxFQUFFLENBQUM7UUFFbEQsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUM7UUFDM0YsTUFBTSxHQUFHLEdBQUcsS0FBSyxFQUFFLEdBQUcsQ0FBQztRQUN2QixJQUFJLEtBQUssSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNsQixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQztZQUN0RixNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzNCLDRHQUE0RztZQUM1RyxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQztZQUM5RixPQUFPLHNCQUFzQixDQUFDLFdBQVcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25KLENBQUM7UUFDRCxJQUFJLFVBQVUsSUFBSSxLQUFLLElBQUksS0FBSyxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDM0QsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM3QyxDQUFDO1FBQ0QsTUFBTSxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDdkQsTUFBaUMsQ0FBQyxRQUFRLEdBQUcsS0FBSyxFQUFFLFFBQVEsQ0FBQztRQUU5RCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFTyxpQkFBaUIsQ0FBQyxZQUFvRDtRQUM3RSxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxhQUFhLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQ3RFLENBQUM7SUFDRixDQUFDO0lBRU8sMkJBQTJCLENBQUMsUUFBZ0IsRUFBRSxtQkFBbUIsR0FBRyxLQUFLO1FBQ2hGLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDO1lBQ3pCLElBQUksRUFBRSxPQUFPO1lBQ2IsS0FBSyxFQUFFLFdBQVc7WUFDbEIsSUFBSSxFQUFFO2dCQUNMLFFBQVE7Z0JBQ1IsbUJBQW1CO2FBQ25CO1lBQ0QsR0FBRyxFQUFFLFNBQVU7U0FDZixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDMUIsQ0FBQztDQUNELENBQUE7QUE3eEJZLGVBQWU7SUE4Q3pCLFdBQUEsMEJBQTBCLENBQUE7SUFDMUIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLG9CQUFvQixDQUFBO0lBQ3BCLFdBQUEsY0FBYyxDQUFBO0dBakRKLGVBQWUsQ0E2eEIzQiJ9