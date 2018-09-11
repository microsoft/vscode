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
import { IOutputService } from 'vs/workbench/parts/output/common/output';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { formatPII } from 'vs/workbench/parts/debug/common/debugUtils';
import { IDebugAdapter, IConfig, AdapterEndEvent, IDebugger } from 'vs/workbench/parts/debug/common/debug';

export class RawDebugSession {

	private debugAdapter: IDebugAdapter;
	private cachedInitDebugAdapterP: TPromise<void>;
	private allThreadsContinued: boolean;
	private _readyForBreakpoints: boolean;
	private _capabilities: DebugProtocol.Capabilities;

	// shutdown
	private inShutdown: boolean;
	private terminated: boolean;
	private firedAdapterExitEvent: boolean;

	// telemetry
	private startTime: number;
	private emittedStopped: boolean;

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
	private readonly _onDidExitAdapter: Emitter<AdapterEndEvent>;

	constructor(
		private debugServerPort: number,
		private _debugger: IDebugger,
		public customTelemetryService: ITelemetryService,
		private root: IWorkspaceFolder,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IOutputService private outputService: IOutputService
	) {
		this._readyForBreakpoints = false;
		this.inShutdown = false;
		this.firedAdapterExitEvent = false;

		this.emittedStopped = false;

		this.allThreadsContinued = true;

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

		this._onDidExitAdapter = new Emitter<AdapterEndEvent>();
	}

	public get onDidExitAdapter(): Event<AdapterEndEvent> {
		return this._onDidExitAdapter.event;
	}

	public get capabilities(): DebugProtocol.Capabilities {
		return this._capabilities || {};
	}

	/**
	 * DA is ready to accepts setBreakpoint requests.
	 * Becomes true after "initialized" events has been received.
	 */
	public get readyForBreakpoints(): boolean {
		return this._readyForBreakpoints;
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
		return this.send('initialize', args).then((response: DebugProtocol.InitializeResponse) => {
			this.mergeCapabilities(response.body);
			return response;
		});
	}

	public launchOrAttach(config: IConfig): TPromise<DebugProtocol.Response> {
		return this.send(config.request, config).then(response => {
			this.mergeCapabilities(response.body);
			return response;
		});
	}

	public restart(): TPromise<DebugProtocol.RestartResponse> {
		if (this.capabilities.supportsRestartRequest) {
			return this.send('restart', null);
		}
		return TPromise.wrapError(new Error('restart not supported'));
	}

	public next(args: DebugProtocol.NextArguments): TPromise<DebugProtocol.NextResponse> {
		return this.send('next', args).then(response => {
			this.fireSimulatedContinuedEvent(args.threadId);
			return response;
		});
	}

	public stepIn(args: DebugProtocol.StepInArguments): TPromise<DebugProtocol.StepInResponse> {
		return this.send('stepIn', args).then(response => {
			this.fireSimulatedContinuedEvent(args.threadId);
			return response;
		});
	}

	public stepOut(args: DebugProtocol.StepOutArguments): TPromise<DebugProtocol.StepOutResponse> {
		return this.send('stepOut', args).then(response => {
			this.fireSimulatedContinuedEvent(args.threadId);
			return response;
		});
	}

	public continue(args: DebugProtocol.ContinueArguments): TPromise<DebugProtocol.ContinueResponse> {
		return this.send<DebugProtocol.ContinueResponse>('continue', args).then(response => {
			if (response && response.body && response.body.allThreadsContinued !== undefined) {
				this.allThreadsContinued = response.body.allThreadsContinued;
			}
			this.fireSimulatedContinuedEvent(args.threadId, this.allThreadsContinued);
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
			this.fireSimulatedContinuedEvent(threadId);
			return response;
		});
	}

	public completions(args: DebugProtocol.CompletionsArguments): TPromise<DebugProtocol.CompletionsResponse> {
		if (this.capabilities.supportsCompletionsRequest) {
			return this.send<DebugProtocol.CompletionsResponse>('completions', args);
		}
		return TPromise.wrapError(new Error('completions not supported'));
	}

	/**
	 * Try terminate the debuggee softly
	 */
	public terminate(restart = false): TPromise<DebugProtocol.TerminateResponse> {
		if (this.capabilities.supportsTerminateRequest) {
			if (!this.terminated) {
				this.terminated = true;
				return this.send('terminate', { restart });
			}
			return this.disconnect(restart);
		}
		return TPromise.wrapError(new Error('terminated not supported'));
	}

	/**
	 * Terminate the debuggee
	 */
	public disconnect(restart = false): TPromise<any> {
		return this.shutdown(undefined, restart);
	}

	public setBreakpoints(args: DebugProtocol.SetBreakpointsArguments): TPromise<DebugProtocol.SetBreakpointsResponse> {
		return this.send<DebugProtocol.SetBreakpointsResponse>('setBreakpoints', args);
	}

	public setFunctionBreakpoints(args: DebugProtocol.SetFunctionBreakpointsArguments): TPromise<DebugProtocol.SetFunctionBreakpointsResponse> {
		if (this.capabilities.supportsFunctionBreakpoints) {
			return this.send<DebugProtocol.SetFunctionBreakpointsResponse>('setFunctionBreakpoints', args);
		}
		return TPromise.wrapError(new Error('setFunctionBreakpoints not supported'));
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
		if (this.capabilities.supportsLoadedSourcesRequest) {
			return this.send<DebugProtocol.LoadedSourcesResponse>('loadedSources', args);
		}
		return TPromise.wrapError(new Error('loadedSources not supported'));
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
				this.fireSimulatedContinuedEvent(args.threadId);
			}
			return response;
		});
	}

	public reverseContinue(args: DebugProtocol.ReverseContinueArguments): TPromise<DebugProtocol.ReverseContinueResponse> {
		return this.send('reverseContinue', args).then(response => {
			if (response.body === undefined) {
				this.fireSimulatedContinuedEvent(args.threadId);
			}
			return response;
		});
	}

	public custom(request: string, args: any): TPromise<DebugProtocol.Response> {
		return this.send(request, args);
	}

	//---- private

	private startAdapter(): TPromise<void> {

		if (!this.cachedInitDebugAdapterP) {

			const startSessionP = this._debugger.createDebugAdapter(this.root, this.outputService, this.debugServerPort).then(debugAdapter => {

				this.debugAdapter = debugAdapter;

				this.debugAdapter.onError(err => {
					this.shutdown(err);
				});

				this.debugAdapter.onExit(code => {
					if (code !== 0) {
						this.shutdown(new Error(`exit code: ${code}`));
					} else {
						// normal exit
						this.shutdown();
					}
				});

				this.debugAdapter.onEvent(event => this.onDapEvent(event));
				this.debugAdapter.onRequest(request => this.dispatchRequest(request));

				return this.debugAdapter.startSession();
			});

			this.cachedInitDebugAdapterP = startSessionP.then(() => {
				this.startTime = new Date().getTime();
			}, err => {
				return TPromise.wrapError(err);
			});
		}

		return this.cachedInitDebugAdapterP;
	}

	private shutdown(error?: Error, restart = false): TPromise<any> {
		if (!this.inShutdown) {
			this.inShutdown = true;
			if (this.debugAdapter) {
				return this.send('disconnect', { restart }, 500).then(() => {
					this.stopAdapter(error);
				}, () => {
					// ignore error
					this.stopAdapter(error);
				});
			}
			return this.stopAdapter(error);
		}
		return TPromise.as(undefined);
	}

	private stopAdapter(error?: Error): TPromise<any> {
		if (this.debugAdapter) {
			const da = this.debugAdapter;
			this.debugAdapter = null;
			return da.stopSession().then(_ => {
				this.fireAdapterExitEvent(error);
			}, err => {
				this.fireAdapterExitEvent(error);
			});
		} else {
			this.fireAdapterExitEvent(error);
		}
		return TPromise.as(undefined);
	}

	private fireAdapterExitEvent(error?: Error): void {
		if (!this.firedAdapterExitEvent) {
			this.firedAdapterExitEvent = true;

			const e: AdapterEndEvent = {
				emittedStopped: this.emittedStopped,
				sessionLengthInSeconds: (new Date().getTime() - this.startTime) / 1000
			};
			if (error) {
				e.error = error;
			}
			this._onDidExitAdapter.fire(e);
		}
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
					this.mergeCapabilities(capabilites);
				}
				break;
			case 'stopped':
				this.emittedStopped = true;
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

	private dispatchRequest(request: DebugProtocol.Request): void {

		const response: DebugProtocol.Response = {
			type: 'response',
			seq: 0,
			command: request.command,
			request_seq: request.seq,
			success: true
		};

		const safeSendResponse = (response) => this.debugAdapter && this.debugAdapter.sendResponse(response);

		switch (request.command) {
			case 'runInTerminal':
				this._debugger.runInTerminal(<DebugProtocol.RunInTerminalRequestArguments>request.arguments).then(_ => {
					response.body = {};
					safeSendResponse(response);
				}, err => {
					response.success = false;
					response.message = err.message;
					safeSendResponse(response);
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
					safeSendResponse(response);
				} catch (e) {
					response.success = false;
					response.message = e.message;
					safeSendResponse(response);
				}
				break;
			default:
				response.success = false;
				response.message = `unknown request '${request.command}'`;
				safeSendResponse(response);
				break;
		}
	}

	private send<R extends DebugProtocol.Response>(command: string, args: any, timeout?: number): TPromise<R> {

		return this.startAdapter().then(() => {

			return new TPromise<R>((completeDispatch, errorDispatch) => {
				this.debugAdapter.sendRequest(command, args, (response: R) => {
					if (response.success) {
						completeDispatch(response);
					} else {
						errorDispatch(response);
					}
				}, timeout);
			}).then(response => response, err => TPromise.wrapError(this.handleErrorResponse(err)));
		});
	}

	private handleErrorResponse(errorResponse: DebugProtocol.Response): Error {

		if (errorResponse.command === 'canceled' && errorResponse.message === 'canceled') {
			return errors.canceled();
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
			return errors.create(userMessage, {
				actions: [new Action('debug.moreInfo', label, null, true, () => {
					window.open(error.url);
					return TPromise.as(null);
				})]
			});
		}

		return new Error(userMessage);
	}

	private mergeCapabilities(capabilities: DebugProtocol.Capabilities): void {
		if (capabilities) {
			this._capabilities = objects.mixin(this._capabilities, capabilities);
		}
	}

	private fireSimulatedContinuedEvent(threadId: number, allThreadsContinued = false): void {
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
