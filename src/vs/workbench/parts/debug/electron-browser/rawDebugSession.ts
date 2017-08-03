/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import cp = require('child_process');
import net = require('net');
import uri from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import platform = require('vs/base/common/platform');
import objects = require('vs/base/common/objects');
import { Action } from 'vs/base/common/actions';
import errors = require('vs/base/common/errors');
import { TPromise } from 'vs/base/common/winjs.base';
import severity from 'vs/base/common/severity';
import stdfork = require('vs/base/node/stdFork');
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ITerminalService } from 'vs/workbench/parts/terminal/common/terminal';
import { ITerminalService as IExternalTerminalService } from 'vs/workbench/parts/execution/common/execution';
import debug = require('vs/workbench/parts/debug/common/debug');
import { Adapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import { V8Protocol } from 'vs/workbench/parts/debug/node/v8Protocol';
import { IOutputService } from 'vs/workbench/parts/output/common/output';
import { ExtensionsChannelId } from 'vs/platform/extensionManagement/common/extensionManagement';
import { TerminalSupport } from 'vs/workbench/parts/debug/electron-browser/terminalSupport';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export interface SessionExitedEvent extends debug.DebugEvent {
	body: {
		exitCode: number,
		sessionId: string
	};
}

export interface SessionTerminatedEvent extends debug.DebugEvent {
	body: {
		restart?: boolean,
		sessionId: string
	};
}

export class RawDebugSession extends V8Protocol implements debug.ISession {

	public emittedStopped: boolean;
	public readyForBreakpoints: boolean;

	private serverProcess: cp.ChildProcess;
	private socket: net.Socket = null;
	private cachedInitServer: TPromise<void>;
	private startTime: number;
	public disconnected: boolean;
	private sentPromises: TPromise<DebugProtocol.Response>[];
	private _capabilities: DebugProtocol.Capabilities;
	private allThreadsContinued: boolean;

	private _onDidInitialize: Emitter<DebugProtocol.InitializedEvent>;
	private _onDidStop: Emitter<DebugProtocol.StoppedEvent>;
	private _onDidContinued: Emitter<DebugProtocol.ContinuedEvent>;
	private _onDidTerminateDebugee: Emitter<SessionTerminatedEvent>;
	private _onDidExitAdapter: Emitter<SessionExitedEvent>;
	private _onDidThread: Emitter<DebugProtocol.ThreadEvent>;
	private _onDidOutput: Emitter<DebugProtocol.OutputEvent>;
	private _onDidBreakpoint: Emitter<DebugProtocol.BreakpointEvent>;
	private _onDidCustomEvent: Emitter<debug.DebugEvent>;
	private _onDidEvent: Emitter<DebugProtocol.Event>;

	constructor(
		id: string,
		private debugServerPort: number,
		private adapter: Adapter,
		private customTelemetryService: ITelemetryService,
		public root: uri,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IOutputService private outputService: IOutputService,
		@ITerminalService private terminalService: ITerminalService,
		@IExternalTerminalService private nativeTerminalService: IExternalTerminalService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(id);
		this.emittedStopped = false;
		this.readyForBreakpoints = false;
		this.allThreadsContinued = true;
		this.sentPromises = [];

		this._onDidInitialize = new Emitter<DebugProtocol.InitializedEvent>();
		this._onDidStop = new Emitter<DebugProtocol.StoppedEvent>();
		this._onDidContinued = new Emitter<DebugProtocol.ContinuedEvent>();
		this._onDidTerminateDebugee = new Emitter<SessionTerminatedEvent>();
		this._onDidExitAdapter = new Emitter<SessionExitedEvent>();
		this._onDidThread = new Emitter<DebugProtocol.ThreadEvent>();
		this._onDidOutput = new Emitter<DebugProtocol.OutputEvent>();
		this._onDidBreakpoint = new Emitter<DebugProtocol.BreakpointEvent>();
		this._onDidCustomEvent = new Emitter<debug.DebugEvent>();
		this._onDidEvent = new Emitter<DebugProtocol.Event>();
	}

	public get onDidInitialize(): Event<DebugProtocol.InitializedEvent> {
		return this._onDidInitialize.event;
	}

	public get onDidStop(): Event<DebugProtocol.StoppedEvent> {
		return this._onDidStop.event;
	}

	public get onDidContinued(): Event<DebugProtocol.ContinuedEvent> {
		return this._onDidContinued.event;
	}

	public get onDidTerminateDebugee(): Event<SessionTerminatedEvent> {
		return this._onDidTerminateDebugee.event;
	}

	public get onDidExitAdapter(): Event<SessionExitedEvent> {
		return this._onDidExitAdapter.event;
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

	public get onDidCustomEvent(): Event<debug.DebugEvent> {
		return this._onDidCustomEvent.event;
	}

	public get onDidEvent(): Event<DebugProtocol.Event> {
		return this._onDidEvent.event;
	}

	private initServer(): TPromise<void> {
		if (this.cachedInitServer) {
			return this.cachedInitServer;
		}

		const serverPromise = this.debugServerPort ? this.connectServer(this.debugServerPort) : this.startServer();
		this.cachedInitServer = serverPromise.then(() => {
			this.startTime = new Date().getTime();
		}, err => {
			this.cachedInitServer = null;
			return TPromise.wrapError(err);
		});

		return this.cachedInitServer;
	}

	public custom(request: string, args: any): TPromise<DebugProtocol.Response> {
		return this.send(request, args);
	}

	protected send<R extends DebugProtocol.Response>(command: string, args: any, cancelOnDisconnect = true): TPromise<R> {
		return this.initServer().then(() => {
			const promise = super.send<R>(command, args).then(response => response, (errorResponse: DebugProtocol.ErrorResponse) => {
				const error = errorResponse && errorResponse.body ? errorResponse.body.error : null;
				const errorMessage = errorResponse ? errorResponse.message : '';
				const telemetryMessage = error ? debug.formatPII(error.format, true, error.variables) : errorMessage;
				if (error && error.sendTelemetry) {
					this.telemetryService.publicLog('debugProtocolErrorResponse', { error: telemetryMessage });
					if (this.customTelemetryService) {
						this.customTelemetryService.publicLog('debugProtocolErrorResponse', { error: telemetryMessage });
					}
				}

				const userMessage = error ? debug.formatPII(error.format, false, error.variables) : errorMessage;
				if (error && error.url) {
					const label = error.urlLabel ? error.urlLabel : nls.localize('moreInfo', "More Info");
					return TPromise.wrapError<R>(errors.create(userMessage, {
						actions: [CloseAction, new Action('debug.moreInfo', label, null, true, () => {
							window.open(error.url);
							return TPromise.as(null);
						})]
					}));
				}

				return errors.isPromiseCanceledError(errorResponse) ? undefined : TPromise.wrapError<R>(new Error(userMessage));
			});

			if (cancelOnDisconnect) {
				this.sentPromises.push(promise);
			}
			return promise;
		});
	}

	protected onEvent(event: debug.DebugEvent): void {
		event.sessionId = this.getId();

		if (event.event === 'initialized') {
			this.readyForBreakpoints = true;
			this._onDidInitialize.fire(event);
		} else if (event.event === 'stopped') {
			this.emittedStopped = true;
			this._onDidStop.fire(<DebugProtocol.StoppedEvent>event);
		} else if (event.event === 'continued') {
			this.allThreadsContinued = (<DebugProtocol.ContinuedEvent>event).body.allThreadsContinued === false ? false : true;
			this._onDidContinued.fire(<DebugProtocol.ContinuedEvent>event);
		} else if (event.event === 'thread') {
			this._onDidThread.fire(<DebugProtocol.ThreadEvent>event);
		} else if (event.event === 'output') {
			this._onDidOutput.fire(<DebugProtocol.OutputEvent>event);
		} else if (event.event === 'breakpoint') {
			this._onDidBreakpoint.fire(<DebugProtocol.BreakpointEvent>event);
		} else if (event.event === 'terminated') {
			this._onDidTerminateDebugee.fire(<SessionTerminatedEvent>event);
		} else if (event.event === 'exit') {
			this._onDidExitAdapter.fire(<SessionExitedEvent>event);
		} else {
			this._onDidCustomEvent.fire(event);
		}

		this._onDidEvent.fire(event);
	}

	public get capabilities(): DebugProtocol.Capabilities {
		return this._capabilities || {};
	}

	public initialize(args: DebugProtocol.InitializeRequestArguments): TPromise<DebugProtocol.InitializeResponse> {
		return this.send('initialize', args).then(response => this.readCapabilities(response));
	}

	private readCapabilities(response: DebugProtocol.Response): DebugProtocol.Response {
		if (response) {
			this._capabilities = objects.mixin(this._capabilities, response.body);
		}

		return response;
	}

	public launch(args: DebugProtocol.LaunchRequestArguments): TPromise<DebugProtocol.LaunchResponse> {
		return this.send('launch', args).then(response => this.readCapabilities(response));
	}

	public attach(args: DebugProtocol.AttachRequestArguments): TPromise<DebugProtocol.AttachResponse> {
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

	public disconnect(restart = false, force = false): TPromise<DebugProtocol.DisconnectResponse> {
		if (this.disconnected && force) {
			return this.stopServer();
		}

		// Cancel all sent promises on disconnect so debug trees are not left in a broken state #3666.
		// Give a 1s timeout to give a chance for some promises to complete.
		setTimeout(() => {
			this.sentPromises.forEach(p => p && p.cancel());
			this.sentPromises = [];
		}, 1000);

		if ((this.serverProcess || this.socket) && !this.disconnected) {
			// point of no return: from now on don't report any errors
			this.disconnected = true;
			return this.send('disconnect', { restart: restart }, false).then(() => this.stopServer(), () => this.stopServer());
		}

		return TPromise.as(null);
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

	public threads(): TPromise<DebugProtocol.ThreadsResponse> {
		return this.send<DebugProtocol.ThreadsResponse>('threads', null);
	}

	public evaluate(args: DebugProtocol.EvaluateArguments): TPromise<DebugProtocol.EvaluateResponse> {
		return this.send<DebugProtocol.EvaluateResponse>('evaluate', args);
	}

	public stepBack(args: DebugProtocol.StepBackArguments): TPromise<DebugProtocol.StepBackResponse> {
		return this.send('stepBack', args).then(response => {
			this.fireFakeContinued(args.threadId);
			return response;
		});
	}

	public reverseContinue(args: DebugProtocol.ReverseContinueArguments): TPromise<DebugProtocol.ReverseContinueResponse> {
		return this.send('reverseContinue', args).then(response => {
			this.fireFakeContinued(args.threadId);
			return response;
		});
	}

	public getLengthInSeconds(): number {
		return (new Date().getTime() - this.startTime) / 1000;
	}

	protected dispatchRequest(request: DebugProtocol.Request, response: DebugProtocol.Response): void {

		if (request.command === 'runInTerminal') {

			TerminalSupport.runInTerminal(this.terminalService, this.nativeTerminalService, this.configurationService, <DebugProtocol.RunInTerminalRequestArguments>request.arguments, <DebugProtocol.RunInTerminalResponse>response).then(() => {
				this.sendResponse(response);
			}, e => {
				response.success = false;
				response.message = e.message;
				this.sendResponse(response);
			});
		} else if (request.command === 'handshake') {
			try {
				const vsda = <any>require.__$__nodeRequire('vsda');
				const obj = new vsda.signer();
				const sig = obj.sign(request.arguments.value);
				response.body = {
					signature: sig
				};
				this.sendResponse(response);
			} catch (e) {
				response.success = false;
				response.message = e.message;
				this.sendResponse(response);
			}
		} else {
			response.success = false;
			response.message = `unknown request '${request.command}'`;
			this.sendResponse(response);
		}
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

	private connectServer(port: number): TPromise<void> {
		return new TPromise<void>((c, e) => {
			this.socket = net.createConnection(port, '127.0.0.1', () => {
				this.connect(this.socket, <any>this.socket);
				c(null);
			});
			this.socket.on('error', (err: any) => {
				e(err);
			});
			this.socket.on('close', () => this.onServerExit());
		});
	}

	private startServer(): TPromise<any> {
		return this.adapter.getAdapterExecutable(this.root).then(ae => this.launchServer(ae).then(() => {
			this.serverProcess.on('error', (err: Error) => this.onServerError(err));
			this.serverProcess.on('exit', (code: number, signal: string) => this.onServerExit());

			const sanitize = (s: string) => s.toString().replace(/\r?\n$/mg, '');
			// this.serverProcess.stdout.on('data', (data: string) => {
			// 	console.log('%c' + sanitize(data), 'background: #ddd; font-style: italic;');
			// });
			this.serverProcess.stderr.on('data', (data: string) => {
				this.outputService.getChannel(ExtensionsChannelId).append(sanitize(data));
			});

			this.connect(this.serverProcess.stdout, this.serverProcess.stdin);
		}));
	}

	private launchServer(launch: debug.IAdapterExecutable): TPromise<void> {
		return new TPromise<void>((c, e) => {
			if (launch.command === 'node') {
				if (Array.isArray(launch.args) && launch.args.length > 0) {
					stdfork.fork(launch.args[0], launch.args.slice(1), {}, (err, child) => {
						if (err) {
							e(new Error(nls.localize('unableToLaunchDebugAdapter', "Unable to launch debug adapter from '{0}'.", launch.args[0])));
						}
						this.serverProcess = child;
						c(null);
					});
				} else {
					e(new Error(nls.localize('unableToLaunchDebugAdapterNoArgs', "Unable to launch debug adapter.")));
				}
			} else {
				this.serverProcess = cp.spawn(launch.command, launch.args, {
					stdio: [
						'pipe', 	// stdin
						'pipe', 	// stdout
						'pipe'		// stderr
					],
				});
				c(null);
			}
		});
	}

	private stopServer(): TPromise<any> {

		if (this.socket !== null) {
			this.socket.end();
			this.cachedInitServer = null;
		}

		this.onEvent({ event: 'exit', type: 'event', seq: 0 });
		if (!this.serverProcess) {
			return TPromise.as(null);
		}

		this.disconnected = true;

		let ret: TPromise<void>;
		// when killing a process in windows its child
		// processes are *not* killed but become root
		// processes. Therefore we use TASKKILL.EXE
		if (platform.isWindows) {
			ret = new TPromise<void>((c, e) => {
				const killer = cp.exec(`taskkill /F /T /PID ${this.serverProcess.pid}`, function (err, stdout, stderr) {
					if (err) {
						return e(err);
					}
				});
				killer.on('exit', c);
				killer.on('error', e);
			});
		} else {
			this.serverProcess.kill('SIGTERM');
			ret = TPromise.as(null);
		}

		return ret;
	}

	protected onServerError(err: Error): void {
		this.messageService.show(severity.Error, nls.localize('stoppingDebugAdapter', "{0}. Stopping the debug adapter.", err.message));
		this.stopServer().done(null, errors.onUnexpectedError);
	}

	private onServerExit(): void {
		this.serverProcess = null;
		this.cachedInitServer = null;
		if (!this.disconnected) {
			this.messageService.show(severity.Error, nls.localize('debugAdapterCrash', "Debug adapter process has terminated unexpectedly"));
		}
		this.onEvent({ event: 'exit', type: 'event', seq: 0 });
	}

	public dispose(): void {
		this.disconnect().done(null, errors.onUnexpectedError);
	}
}
