/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import * as objects from 'vs/base/common/objects';
import { Action } from 'vs/base/common/actions';
import * as errors from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Debugger } from 'vs/workbench/parts/debug/node/debugger';
import { IOutputService } from 'vs/workbench/parts/output/common/output';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { formatPII } from 'vs/workbench/parts/debug/common/debugUtils';
import { SocketDebugAdapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import { IRawDebugSession, IDebugAdapter } from 'vs/workbench/parts/debug/common/debug';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';

export class RawDebugSession implements IRawDebugSession {

	private debugAdapter: IDebugAdapter;
	private cachedInitDebugAdapterP: TPromise<void>;
	private startTime: number;
	private terminated: boolean;
	private cancellationTokens: CancellationTokenSource[];
	private allThreadsContinued: boolean;
	private isAttached: boolean;

	private _emittedStopped: boolean;
	private _readyForBreakpoints: boolean;
	private _disconnected: boolean;
	private _capabilities: DebugProtocol.Capabilities;

	// DAP events
	private readonly _onDidInitialize: Emitter<DebugProtocol.InitializedEvent>;
	private readonly _onDidStop: Emitter<DebugProtocol.StoppedEvent>;
	private readonly _onDidContinued: Emitter<DebugProtocol.ContinuedEvent>;
	private readonly _onDidTerminateDebugee: Emitter<DebugProtocol.TerminatedEvent>;
	private readonly _onDidExitDebugee: Emitter<DebugProtocol.ExitedEvent>;
	private readonly _onDidThread: Emitter<DebugProtocol.ThreadEvent>;
	private readonly _onDidOutput: Emitter<DebugProtocol.OutputEvent>;
	private readonly _onDidBreakpoint: Emitter<DebugProtocol.BreakpointEvent>;
	private readonly _onDidLoadedSource: Emitter<DebugProtocol.LoadedSourceEvent>;
	private readonly _onDidCustomEvent: Emitter<DebugProtocol.Event>;
	private readonly _onDidEvent: Emitter<DebugProtocol.Event>;

	// DA events
	private readonly _onDidExitAdapter: Emitter<Error>;

	constructor(
		private debugServerPort: number,
		private _debugger: Debugger,
		public customTelemetryService: ITelemetryService,
		private root: IWorkspaceFolder,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IOutputService private outputService: IOutputService
	) {
		this._emittedStopped = false;
		this._readyForBreakpoints = false;
		this.allThreadsContinued = true;
		this.cancellationTokens = [];

		this._onDidInitialize = new Emitter<DebugProtocol.InitializedEvent>();
		this._onDidStop = new Emitter<DebugProtocol.StoppedEvent>();
		this._onDidContinued = new Emitter<DebugProtocol.ContinuedEvent>();
		this._onDidTerminateDebugee = new Emitter<DebugProtocol.TerminatedEvent>();
		this._onDidExitDebugee = new Emitter<DebugProtocol.ExitedEvent>();
		this._onDidThread = new Emitter<DebugProtocol.ThreadEvent>();
		this._onDidOutput = new Emitter<DebugProtocol.OutputEvent>();
		this._onDidBreakpoint = new Emitter<DebugProtocol.BreakpointEvent>();
		this._onDidLoadedSource = new Emitter<DebugProtocol.LoadedSourceEvent>();
		this._onDidCustomEvent = new Emitter<DebugProtocol.Event>();
		this._onDidEvent = new Emitter<DebugProtocol.Event>();

		this._onDidExitAdapter = new Emitter<Error>();
	}

	public get onDidExitAdapter(): Event<Error> {
		return this._onDidExitAdapter.event;
	}

	public get sessionLengthInSeconds(): number {
		return (new Date().getTime() - this.startTime) / 1000;
	}

	public get capabilities(): DebugProtocol.Capabilities {
		return this._capabilities || {};
	}

	public get readyForBreakpoints(): boolean {
		return this._readyForBreakpoints;
	}

	public get emittedStopped(): boolean {
		return this._emittedStopped;
	}

	public get disconnected(): boolean {
		return this._disconnected;
	}

	//---- DAP events

	public get onDidInitialize(): Event<DebugProtocol.InitializedEvent> {
		return this._onDidInitialize.event;
	}

	public get onDidStop(): Event<DebugProtocol.StoppedEvent> {
		return this._onDidStop.event;
	}

	public get onDidContinued(): Event<DebugProtocol.ContinuedEvent> {
		return this._onDidContinued.event;
	}

	public get onDidTerminateDebugee(): Event<DebugProtocol.TerminatedEvent> {
		return this._onDidTerminateDebugee.event;
	}

	public get onDidExitDebugee(): Event<DebugProtocol.ExitedEvent> {
		return this._onDidExitDebugee.event;
	}

	public get onDidThread(): Event<DebugProtocol.ThreadEvent> {
		return this._onDidThread.event;
	}

	public get onDidOutput(): Event<DebugProtocol.OutputEvent> {
		return this._onDidOutput.event;
	}

	public get onDidBreakpoint(): Event<DebugProtocol.BreakpointEvent> {
		return this._onDidBreakpoint.event;
	}

	public get onDidLoadedSource(): Event<DebugProtocol.LoadedSourceEvent> {
		return this._onDidLoadedSource.event;
	}

	public get onDidCustomEvent(): Event<DebugProtocol.Event> {
		return this._onDidCustomEvent.event;
	}

	public get onDidEvent(): Event<DebugProtocol.Event> {
		return this._onDidEvent.event;
	}

	//---- DAP requests

	public initialize(args: DebugProtocol.InitializeRequestArguments): TPromise<DebugProtocol.InitializeResponse> {
		return this.send('initialize', args).then(response => this.readCapabilities(response));
	}

	public launch(args: DebugProtocol.LaunchRequestArguments): TPromise<DebugProtocol.LaunchResponse> {
		return this.send('launch', args).then(response => this.readCapabilities(response));
	}

	public attach(args: DebugProtocol.AttachRequestArguments): TPromise<DebugProtocol.AttachResponse> {
		this.isAttached = true;
		return this.send('attach', args).then(response => this.readCapabilities(response));
	}

	public next(args: DebugProtocol.NextArguments): TPromise<DebugProtocol.NextResponse> {
		return this.send('next', args).then(response => {
			this.fireFakeContinued(args.threadId);
			return response;
		});
	}

	public stepIn(args: DebugProtocol.StepInArguments): TPromise<DebugProtocol.StepInResponse> {
		return this.send('stepIn', args).then(response => {
			this.fireFakeContinued(args.threadId);
			return response;
		});
	}

	public stepOut(args: DebugProtocol.StepOutArguments): TPromise<DebugProtocol.StepOutResponse> {
		return this.send('stepOut', args).then(response => {
			this.fireFakeContinued(args.threadId);
			return response;
		});
	}

	public continue(args: DebugProtocol.ContinueArguments): TPromise<DebugProtocol.ContinueResponse> {
		return this.send<DebugProtocol.ContinueResponse>('continue', args).then(response => {
			if (response && response.body && response.body.allThreadsContinued !== undefined) {
				this.allThreadsContinued = response.body.allThreadsContinued;
			}
			this.fireFakeContinued(args.threadId, this.allThreadsContinued);
			return response;
		});
	}

	public pause(args: DebugProtocol.PauseArguments): TPromise<DebugProtocol.PauseResponse> {
		return this.send('pause', args);
	}

	public terminateThreads(args: DebugProtocol.TerminateThreadsArguments): TPromise<DebugProtocol.TerminateThreadsResponse> {
		return this.send('terminateThreads', args);
	}

	public setVariable(args: DebugProtocol.SetVariableArguments): TPromise<DebugProtocol.SetVariableResponse> {
		return this.send<DebugProtocol.SetVariableResponse>('setVariable', args);
	}

	public restartFrame(args: DebugProtocol.RestartFrameArguments, threadId: number): TPromise<DebugProtocol.RestartFrameResponse> {
		return this.send('restartFrame', args).then(response => {
			this.fireFakeContinued(threadId);
			return response;
		});
	}

	public completions(args: DebugProtocol.CompletionsArguments): TPromise<DebugProtocol.CompletionsResponse> {
		return this.send<DebugProtocol.CompletionsResponse>('completions', args);
	}

	public terminate(restart = false): TPromise<DebugProtocol.TerminateResponse> {

		if (this.capabilities.supportsTerminateRequest && !this.terminated && !this.isAttached) {
			this.terminated = true;
			return this.send('terminate', { restart });
		}
		return this.disconnect(restart);
	}

	public setBreakpoints(args: DebugProtocol.SetBreakpointsArguments): TPromise<DebugProtocol.SetBreakpointsResponse> {
		return this.send<DebugProtocol.SetBreakpointsResponse>('setBreakpoints', args);
	}

	public setFunctionBreakpoints(args: DebugProtocol.SetFunctionBreakpointsArguments): TPromise<DebugProtocol.SetFunctionBreakpointsResponse> {
		return this.send<DebugProtocol.SetFunctionBreakpointsResponse>('setFunctionBreakpoints', args);
	}

	public setExceptionBreakpoints(args: DebugProtocol.SetExceptionBreakpointsArguments): TPromise<DebugProtocol.SetExceptionBreakpointsResponse> {
		return this.send<DebugProtocol.SetExceptionBreakpointsResponse>('setExceptionBreakpoints', args);
	}

	public configurationDone(): TPromise<DebugProtocol.ConfigurationDoneResponse> {
		return this.send('configurationDone', null);
	}

	public stackTrace(args: DebugProtocol.StackTraceArguments): TPromise<DebugProtocol.StackTraceResponse> {
		return this.send<DebugProtocol.StackTraceResponse>('stackTrace', args);
	}

	public exceptionInfo(args: DebugProtocol.ExceptionInfoArguments): TPromise<DebugProtocol.ExceptionInfoResponse> {
		return this.send<DebugProtocol.ExceptionInfoResponse>('exceptionInfo', args);
	}

	public scopes(args: DebugProtocol.ScopesArguments): TPromise<DebugProtocol.ScopesResponse> {
		return this.send<DebugProtocol.ScopesResponse>('scopes', args);
	}

	public variables(args: DebugProtocol.VariablesArguments): TPromise<DebugProtocol.VariablesResponse> {
		return this.send<DebugProtocol.VariablesResponse>('variables', args);
	}

	public source(args: DebugProtocol.SourceArguments): TPromise<DebugProtocol.SourceResponse> {
		return this.send<DebugProtocol.SourceResponse>('source', args);
	}

	public loadedSources(args: DebugProtocol.LoadedSourcesArguments): TPromise<DebugProtocol.LoadedSourcesResponse> {
		return this.send<DebugProtocol.LoadedSourcesResponse>('loadedSources', args);
	}

	public threads(): TPromise<DebugProtocol.ThreadsResponse> {
		return this.send<DebugProtocol.ThreadsResponse>('threads', null);
	}

	public evaluate(args: DebugProtocol.EvaluateArguments): TPromise<DebugProtocol.EvaluateResponse> {
		return this.send<DebugProtocol.EvaluateResponse>('evaluate', args);
	}

	public stepBack(args: DebugProtocol.StepBackArguments): TPromise<DebugProtocol.StepBackResponse> {
		return this.send('stepBack', args).then(response => {
			if (response.body === undefined) {
				this.fireFakeContinued(args.threadId);
			}
			return response;
		});
	}

	public reverseContinue(args: DebugProtocol.ReverseContinueArguments): TPromise<DebugProtocol.ReverseContinueResponse> {
		return this.send('reverseContinue', args).then(response => {
			if (response.body === undefined) {
				this.fireFakeContinued(args.threadId);
			}
			return response;
		});
	}

	public custom(request: string, args: any): TPromise<DebugProtocol.Response> {
		return this.send(request, args);
	}

	public disconnect(restart = false): TPromise<any> {
		if (this.disconnected) {
			return this.stopAdapter();
		}

		// Cancel all sent promises on disconnect so debug trees are not left in a broken state #3666.
		// Give a 1s timeout to give a chance for some promises to complete.
		setTimeout(() => {
			this.cancellationTokens.forEach(token => token.cancel());
			this.cancellationTokens = [];
		}, 1000);

		if (this.debugAdapter && !this.disconnected) {
			// point of no return: from now on don't report any errors
			this._disconnected = true;
			return this.send('disconnect', { restart }, false).then(() => this.stopAdapter(), () => this.stopAdapter());
		}

		return TPromise.as(null);
	}

	//---- private

	private startAdapter(): TPromise<void> {

		if (!this.cachedInitDebugAdapterP) {

			const startSessionP = this._debugger.createDebugAdapter(this.root, this.outputService, this.debugServerPort).then(debugAdapter => {

				this.debugAdapter = debugAdapter;

				this.debugAdapter.onError(err => {
					// TODO: don't stop server on this layer
					this.stopAdapter(err);
				});
				this.debugAdapter.onEvent(event => this.onDapEvent(event));
				this.debugAdapter.onExit(code => this.onDebugAdapterExit(code));
				this.debugAdapter.onRequest(request => this.dispatchRequest(request));

				return this.debugAdapter.startSession();
			});

			this.cachedInitDebugAdapterP = startSessionP.then(() => {
				this.startTime = new Date().getTime();
			}, err => {
				this.cachedInitDebugAdapterP = null;
				return TPromise.wrapError(err);
			});
		}

		return this.cachedInitDebugAdapterP;
	}

	private onDapEvent(event: DebugProtocol.Event): void {

		switch (event.event) {
			case 'initialized':
				this._readyForBreakpoints = true;
				this._onDidInitialize.fire(event);
				break;
			case 'loadedSource':
				this._onDidLoadedSource.fire(<DebugProtocol.LoadedSourceEvent>event);
				break;
			case 'capabilities':
				if (event.body) {
					const capabilites = (<DebugProtocol.CapabilitiesEvent>event).body.capabilities;
					this._capabilities = objects.mixin(this._capabilities, capabilites);
				}
				break;
			case 'stopped':
				this._emittedStopped = true;
				this._onDidStop.fire(<DebugProtocol.StoppedEvent>event);
				break;
			case 'continued':
				this.allThreadsContinued = (<DebugProtocol.ContinuedEvent>event).body.allThreadsContinued === false ? false : true;
				this._onDidContinued.fire(<DebugProtocol.ContinuedEvent>event);
				break;
			case 'thread':
				this._onDidThread.fire(<DebugProtocol.ThreadEvent>event);
				break;
			case 'output':
				this._onDidOutput.fire(<DebugProtocol.OutputEvent>event);
				break;
			case 'breakpoint':
				this._onDidBreakpoint.fire(<DebugProtocol.BreakpointEvent>event);
				break;
			case 'terminated':
				this._onDidTerminateDebugee.fire(<DebugProtocol.TerminatedEvent>event);
				break;
			case 'exit':
				this._onDidExitDebugee.fire(<DebugProtocol.ExitedEvent>event);
				break;
			default:
				this._onDidCustomEvent.fire(event);
				break;
		}
		this._onDidEvent.fire(event);
	}

	private onDebugAdapterExit(code: number): void {
		this.debugAdapter = null;
		this.cachedInitDebugAdapterP = null;
		if (!this.disconnected && code !== 0) {
			this._onDidExitAdapter.fire(new Error(`exit code: ${code}`));
		} else {
			// normal exit
			this._onDidExitAdapter.fire();
		}
	}

	private dispatchRequest(request: DebugProtocol.Request): void {

		const response: DebugProtocol.Response = {
			type: 'response',
			seq: 0,
			command: request.command,
			request_seq: request.seq,
			success: true
		};

		const sendResponse = (response) => this.debugAdapter && this.debugAdapter.sendResponse(response);

		switch (request.command) {
			case 'runInTerminal':
				this._debugger.runInTerminal(<DebugProtocol.RunInTerminalRequestArguments>request.arguments).then(_ => {
					response.body = {};
					sendResponse(response);
				}, err => {
					response.success = false;
					response.message = err.message;
					sendResponse(response);
				});
				break;
			case 'handshake':
				try {
					const vsda = <any>require.__$__nodeRequire('vsda');
					const obj = new vsda.signer();
					const sig = obj.sign(request.arguments.value);
					response.body = {
						signature: sig
					};
					sendResponse(response);
				} catch (e) {
					response.success = false;
					response.message = e.message;
					sendResponse(response);
				}
				break;
			default:
				response.success = false;
				response.message = `unknown request '${request.command}'`;
				sendResponse(response);
				break;
		}
	}

	private send<R extends DebugProtocol.Response>(command: string, args: any, cancelOnDisconnect = true): TPromise<R> {

		return this.startAdapter().then(() => {

			const cancellationSource = new CancellationTokenSource();

			const promise = this.internalSend<R>(command, args, cancellationSource.token).then(
				response => {
					return response;
				},
				(errorResponse: DebugProtocol.ErrorResponse) => {

					if (errors.isPromiseCanceledError(errorResponse)) {
						return TPromise.wrapError<R>(<any>errorResponse);
					}

					const error = errorResponse && errorResponse.body ? errorResponse.body.error : null;
					const errorMessage = errorResponse ? errorResponse.message : '';

					if (error && error.sendTelemetry) {
						const telemetryMessage = error ? formatPII(error.format, true, error.variables) : errorMessage;
						this.telemetryDebugProtocolErrorResponse(telemetryMessage);
					}

					const userMessage = error ? formatPII(error.format, false, error.variables) : errorMessage;
					if (error && error.url) {
						const label = error.urlLabel ? error.urlLabel : nls.localize('moreInfo', "More Info");
						return TPromise.wrapError<R>(errors.create(userMessage, {
							actions: [new Action('debug.moreInfo', label, null, true, () => {
								window.open(error.url);
								return TPromise.as(null);
							})]
						}));
					}

					return TPromise.wrapError<R>(new Error(userMessage));
				}
			);

			if (cancelOnDisconnect) {
				this.cancellationTokens.push(cancellationSource);
			}
			return promise;
		});
	}

	private internalSend<R extends DebugProtocol.Response>(command: string, args: any, cancelationToken: CancellationToken): TPromise<R> {
		return new TPromise<R>((completeDispatch, errorDispatch) => {
			cancelationToken.onCancellationRequested(() => errorDispatch(errors.canceled()));
			this.debugAdapter.sendRequest(command, args, (result: R) => {
				if (result.success) {
					completeDispatch(result);
				} else {
					errorDispatch(result);
				}
			});
		});
	}

	private readCapabilities(response: DebugProtocol.Response): DebugProtocol.Response {
		if (response) {
			this._capabilities = objects.mixin(this._capabilities, response.body);
		}
		return response;
	}

	private fireFakeContinued(threadId: number, allThreadsContinued = false): void {
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

	private stopAdapter(error?: Error): TPromise<any> {

		if (/* this.socket !== null */ this.debugAdapter instanceof SocketDebugAdapter) {
			this.debugAdapter.stopSession();
			this.cachedInitDebugAdapterP = null;
		}

		this._onDidExitAdapter.fire(error);
		this._disconnected = true;
		if (!this.debugAdapter || this.debugAdapter instanceof SocketDebugAdapter) {
			return TPromise.as(null);
		}

		return this.debugAdapter.stopSession();
	}

	private telemetryDebugProtocolErrorResponse(telemetryMessage: string) {
		/* __GDPR__
			"debugProtocolErrorResponse" : {
				"error" : { "classification": "CallstackOrException", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog('debugProtocolErrorResponse', { error: telemetryMessage });
		if (this.customTelemetryService) {
			/* __GDPR__TODO__
				The message is sent in the name of the adapter but the adapter doesn't know about it.
				However, since adapters are an open-ended set, we can not declared the events statically either.
			*/
			this.customTelemetryService.publicLog('debugProtocolErrorResponse', { error: telemetryMessage });
		}
	}
}
