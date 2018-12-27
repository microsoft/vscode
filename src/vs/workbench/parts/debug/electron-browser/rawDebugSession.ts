/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import * as objects from 'vs/base/common/objects';
import { Action } from 'vs/base/common/actions';
import * as errors from 'vs/base/common/errors';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { formatPII } from 'vs/workbench/parts/debug/common/debugUtils';
import { IDebugAdapter, IConfig, AdapterEndEvent, IDebugger } from 'vs/workbench/parts/debug/common/debug';
import { createErrorWithActions } from 'vs/base/common/errorsWithActions';

/**
 * Encapsulates the DebugAdapter lifecycle and some idiosyncrasies of the Debug Adapter Protocol.
 */
export class RawDebugSession {

	private allThreadsContinued: boolean;
	private _readyForBreakpoints: boolean;
	private _capabilities: DebugProtocol.Capabilities;

	// shutdown
	private debugAdapterStopped: boolean;
	private inShutdown: boolean;
	private terminated: boolean;
	private firedAdapterExitEvent: boolean;

	// telemetry
	private startTime: number;
	private didReceiveStoppedEvent: boolean;

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
		private debugAdapter: IDebugAdapter,
		dbgr: IDebugger,
		private telemetryService: ITelemetryService,
		public customTelemetryService: ITelemetryService
	) {
		this._capabilities = Object.create(null);
		this._readyForBreakpoints = false;
		this.inShutdown = false;
		this.debugAdapterStopped = false;
		this.firedAdapterExitEvent = false;
		this.didReceiveStoppedEvent = false;

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

		this.debugAdapter.onEvent(event => {
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
					this.didReceiveStoppedEvent = true;		// telemetry: remember that debugger stopped successfully
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
		});

		this.debugAdapter.onRequest(request => this.dispatchRequest(request, dbgr));
	}

	public get onDidExitAdapter(): Event<AdapterEndEvent> {
		return this._onDidExitAdapter.event;
	}

	public get capabilities(): DebugProtocol.Capabilities {
		return this._capabilities;
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

	//---- DebugAdapter lifecycle

	/**
	 * Starts the underlying debug adapter and tracks the session time for telemetry.
	 */
	public start(): Promise<void> {
		return this.debugAdapter.startSession().then(() => {
			this.startTime = new Date().getTime();
		}, err => {
			return Promise.reject(err);
		});
	}

	/**
	 * Send client capabilities to the debug adapter and receive DA capabilities in return.
	 */
	public initialize(args: DebugProtocol.InitializeRequestArguments): Promise<DebugProtocol.InitializeResponse> {
		return this.send('initialize', args).then((response: DebugProtocol.InitializeResponse) => {
			this.mergeCapabilities(response.body);
			return response;
		});
	}

	/**
	 * Terminate the debuggee and shutdown the adapter
	 */
	public disconnect(restart = false): Promise<any> {
		return this.shutdown(undefined, restart);
	}

	//---- DAP requests

	public launchOrAttach(config: IConfig): Promise<DebugProtocol.Response> {
		return this.send(config.request, config).then(response => {
			this.mergeCapabilities(response.body);
			return response;
		});
	}

	/**
	 * Try killing the debuggee softly...
	 */
	public terminate(restart = false): Promise<DebugProtocol.TerminateResponse> {
		if (this.capabilities.supportsTerminateRequest) {
			if (!this.terminated) {
				this.terminated = true;
				return this.send('terminate', { restart });
			}
			return this.disconnect(restart);
		}
		return Promise.reject(new Error('terminated not supported'));
	}

	public restart(): Promise<DebugProtocol.RestartResponse> {
		if (this.capabilities.supportsRestartRequest) {
			return this.send('restart', null);
		}
		return Promise.reject(new Error('restart not supported'));
	}

	public next(args: DebugProtocol.NextArguments): Promise<DebugProtocol.NextResponse> {
		return this.send('next', args).then(response => {
			this.fireSimulatedContinuedEvent(args.threadId);
			return response;
		});
	}

	public stepIn(args: DebugProtocol.StepInArguments): Promise<DebugProtocol.StepInResponse> {
		return this.send('stepIn', args).then(response => {
			this.fireSimulatedContinuedEvent(args.threadId);
			return response;
		});
	}

	public stepOut(args: DebugProtocol.StepOutArguments): Promise<DebugProtocol.StepOutResponse> {
		return this.send('stepOut', args).then(response => {
			this.fireSimulatedContinuedEvent(args.threadId);
			return response;
		});
	}

	public continue(args: DebugProtocol.ContinueArguments): Promise<DebugProtocol.ContinueResponse> {
		return this.send<DebugProtocol.ContinueResponse>('continue', args).then(response => {
			if (response && response.body && response.body.allThreadsContinued !== undefined) {
				this.allThreadsContinued = response.body.allThreadsContinued;
			}
			this.fireSimulatedContinuedEvent(args.threadId, this.allThreadsContinued);
			return response;
		});
	}

	public pause(args: DebugProtocol.PauseArguments): Promise<DebugProtocol.PauseResponse> {
		return this.send('pause', args);
	}

	public terminateThreads(args: DebugProtocol.TerminateThreadsArguments): Promise<DebugProtocol.TerminateThreadsResponse> {
		if (this.capabilities.supportsTerminateThreadsRequest) {
			return this.send('terminateThreads', args);
		}
		return Promise.reject(new Error('terminateThreads not supported'));
	}

	public setVariable(args: DebugProtocol.SetVariableArguments): Promise<DebugProtocol.SetVariableResponse> {
		if (this.capabilities.supportsSetVariable) {
			return this.send<DebugProtocol.SetVariableResponse>('setVariable', args);
		}
		return Promise.reject(new Error('setVariable not supported'));
	}

	public restartFrame(args: DebugProtocol.RestartFrameArguments, threadId: number): Promise<DebugProtocol.RestartFrameResponse> {
		if (this.capabilities.supportsRestartFrame) {
			return this.send('restartFrame', args).then(response => {
				this.fireSimulatedContinuedEvent(threadId);
				return response;
			});
		}
		return Promise.reject(new Error('restartFrame not supported'));
	}

	public completions(args: DebugProtocol.CompletionsArguments): Promise<DebugProtocol.CompletionsResponse> {
		if (this.capabilities.supportsCompletionsRequest) {
			return this.send<DebugProtocol.CompletionsResponse>('completions', args);
		}
		return Promise.reject(new Error('completions not supported'));
	}

	public setBreakpoints(args: DebugProtocol.SetBreakpointsArguments): Promise<DebugProtocol.SetBreakpointsResponse> {
		return this.send<DebugProtocol.SetBreakpointsResponse>('setBreakpoints', args);
	}

	public setFunctionBreakpoints(args: DebugProtocol.SetFunctionBreakpointsArguments): Promise<DebugProtocol.SetFunctionBreakpointsResponse> {
		if (this.capabilities.supportsFunctionBreakpoints) {
			return this.send<DebugProtocol.SetFunctionBreakpointsResponse>('setFunctionBreakpoints', args);
		}
		return Promise.reject(new Error('setFunctionBreakpoints not supported'));
	}

	public setExceptionBreakpoints(args: DebugProtocol.SetExceptionBreakpointsArguments): Promise<DebugProtocol.SetExceptionBreakpointsResponse> {
		return this.send<DebugProtocol.SetExceptionBreakpointsResponse>('setExceptionBreakpoints', args);
	}

	public configurationDone(): Promise<DebugProtocol.ConfigurationDoneResponse> {
		if (this.capabilities.supportsConfigurationDoneRequest) {
			return this.send('configurationDone', null);
		}
		return Promise.reject(new Error('configurationDone not supported'));
	}

	public stackTrace(args: DebugProtocol.StackTraceArguments): Promise<DebugProtocol.StackTraceResponse> {
		return this.send<DebugProtocol.StackTraceResponse>('stackTrace', args);
	}

	public exceptionInfo(args: DebugProtocol.ExceptionInfoArguments): Promise<DebugProtocol.ExceptionInfoResponse> {
		if (this.capabilities.supportsExceptionInfoRequest) {
			return this.send<DebugProtocol.ExceptionInfoResponse>('exceptionInfo', args);
		}
		return Promise.reject(new Error('exceptionInfo not supported'));
	}

	public scopes(args: DebugProtocol.ScopesArguments): Promise<DebugProtocol.ScopesResponse> {
		return this.send<DebugProtocol.ScopesResponse>('scopes', args);
	}

	public variables(args: DebugProtocol.VariablesArguments): Promise<DebugProtocol.VariablesResponse> {
		return this.send<DebugProtocol.VariablesResponse>('variables', args);
	}

	public source(args: DebugProtocol.SourceArguments): Promise<DebugProtocol.SourceResponse> {
		return this.send<DebugProtocol.SourceResponse>('source', args);
	}

	public loadedSources(args: DebugProtocol.LoadedSourcesArguments): Promise<DebugProtocol.LoadedSourcesResponse> {
		if (this.capabilities.supportsLoadedSourcesRequest) {
			return this.send<DebugProtocol.LoadedSourcesResponse>('loadedSources', args);
		}
		return Promise.reject(new Error('loadedSources not supported'));
	}

	public threads(): Promise<DebugProtocol.ThreadsResponse> {
		return this.send<DebugProtocol.ThreadsResponse>('threads', null);
	}

	public evaluate(args: DebugProtocol.EvaluateArguments): Promise<DebugProtocol.EvaluateResponse> {
		return this.send<DebugProtocol.EvaluateResponse>('evaluate', args);
	}

	public stepBack(args: DebugProtocol.StepBackArguments): Promise<DebugProtocol.StepBackResponse> {
		if (this.capabilities.supportsStepBack) {
			return this.send('stepBack', args).then(response => {
				if (response.body === undefined) {	// TODO@AW why this check?
					this.fireSimulatedContinuedEvent(args.threadId);
				}
				return response;
			});
		}
		return Promise.reject(new Error('stepBack not supported'));
	}

	public reverseContinue(args: DebugProtocol.ReverseContinueArguments): Promise<DebugProtocol.ReverseContinueResponse> {
		if (this.capabilities.supportsStepBack) {
			return this.send('reverseContinue', args).then(response => {
				if (response.body === undefined) {	// TODO@AW why this check?
					this.fireSimulatedContinuedEvent(args.threadId);
				}
				return response;
			});
		}
		return Promise.reject(new Error('reverseContinue not supported'));
	}

	public custom(request: string, args: any): Promise<DebugProtocol.Response> {
		return this.send(request, args);
	}

	//---- private


	private shutdown(error?: Error, restart = false): Promise<any> {
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
		return Promise.resolve(undefined);
	}

	private stopAdapter(error?: Error): Promise<any> {
		if (this.debugAdapter) {
			const da = this.debugAdapter;
			this.debugAdapter = null;
			return da.stopSession().then(_ => {
				this.debugAdapterStopped = true;
				this.fireAdapterExitEvent(error);
			}, err => {
				this.fireAdapterExitEvent(error);
			});
		} else {
			this.fireAdapterExitEvent(error);
		}
		return Promise.resolve(undefined);
	}

	private fireAdapterExitEvent(error?: Error): void {
		if (!this.firedAdapterExitEvent) {
			this.firedAdapterExitEvent = true;

			const e: AdapterEndEvent = {
				emittedStopped: this.didReceiveStoppedEvent,
				sessionLengthInSeconds: (new Date().getTime() - this.startTime) / 1000
			};
			if (error && !this.debugAdapterStopped) {
				e.error = error;
			}
			this._onDidExitAdapter.fire(e);
		}
	}

	private dispatchRequest(request: DebugProtocol.Request, dbgr: IDebugger): void {

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
				dbgr.runInTerminal(request.arguments as DebugProtocol.RunInTerminalRequestArguments).then(shellProcessId => {
					const resp = response as DebugProtocol.RunInTerminalResponse;
					resp.body = {};
					if (typeof shellProcessId === 'number') {
						resp.body.shellProcessId = shellProcessId;
					}
					safeSendResponse(resp);
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

	private send<R extends DebugProtocol.Response>(command: string, args: any, timeout?: number): Promise<R> {
		return new Promise<R>((completeDispatch, errorDispatch) => {
			this.debugAdapter.sendRequest(command, args, (response: R) => {
				if (response.success) {
					completeDispatch(response);
				} else {
					errorDispatch(response);
				}
			}, timeout);
		}).then(response => response, err => Promise.reject(this.handleErrorResponse(err)));
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
			return createErrorWithActions(userMessage, {
				actions: [new Action('debug.moreInfo', label, null, true, () => {
					window.open(error.url);
					return Promise.resolve(null);
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
