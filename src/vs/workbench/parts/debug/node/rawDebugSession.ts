/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import cp = require('child_process');
import fs = require('fs');
import net = require('net');
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
import debug = require('vs/workbench/parts/debug/common/debug');
import { Adapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import v8 = require('vs/workbench/parts/debug/node/v8Protocol');
import { IOutputService } from 'vs/workbench/parts/output/common/output';
import { ExtensionsChannelId } from 'vs/platform/extensionManagement/common/extensionManagement';

import { shell } from 'electron';

export interface SessionExitedEvent extends DebugProtocol.ExitedEvent {
	body: {
		exitCode: number,
		sessionId: string
	};
}

export interface SessionTerminatedEvent extends DebugProtocol.TerminatedEvent {
	body: {
		restart?: boolean,
		sessionId: string
	};
}

export class RawDebugSession extends v8.V8Protocol implements debug.IRawDebugSession {

	public restarted: boolean;
	public emittedStopped: boolean;
	public readyForBreakpoints: boolean;

	private serverProcess: cp.ChildProcess;
	private socket: net.Socket = null;
	private cachedInitServer: TPromise<void>;
	private startTime: number;
	private stopServerPending: boolean;
	private sentPromises: TPromise<DebugProtocol.Response>[];
	private isAttach: boolean;
	private capabilities: DebugProtocol.Capabilites;

	private _onDidInitialize: Emitter<DebugProtocol.InitializedEvent>;
	private _onDidStop: Emitter<DebugProtocol.StoppedEvent>;
	private _onDidTerminateDebugee: Emitter<SessionTerminatedEvent>;
	private _onDidExitAdapter: Emitter<SessionExitedEvent>;
	private _onDidThread: Emitter<DebugProtocol.ThreadEvent>;
	private _onDidOutput: Emitter<DebugProtocol.OutputEvent>;
	private _onDidBreakpoint: Emitter<DebugProtocol.BreakpointEvent>;
	private _onDidEvent: Emitter<DebugProtocol.Event>;

	constructor(
		private debugServerPort: number,
		private adapter: Adapter,
		private customTelemetryService: ITelemetryService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IOutputService private outputService: IOutputService
	) {
		super();
		this.emittedStopped = false;
		this.readyForBreakpoints = false;
		this.sentPromises = [];

		this._onDidInitialize = new Emitter<DebugProtocol.InitializedEvent>();
		this._onDidStop = new Emitter<DebugProtocol.StoppedEvent>();
		this._onDidTerminateDebugee = new Emitter<SessionTerminatedEvent>();
		this._onDidExitAdapter = new Emitter<SessionExitedEvent>();
		this._onDidThread = new Emitter<DebugProtocol.ThreadEvent>();
		this._onDidOutput = new Emitter<DebugProtocol.OutputEvent>();
		this._onDidBreakpoint = new Emitter<DebugProtocol.BreakpointEvent>();
		this._onDidEvent = new Emitter<DebugProtocol.Event>();
	}

	public get onDidInitialize(): Event<DebugProtocol.InitializedEvent> {
		return this._onDidInitialize.event;
	}

	public get onDidStop(): Event<DebugProtocol.StoppedEvent> {
		return this._onDidStop.event;
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
			}
		);

		return this.cachedInitServer;
	}

	public custom(request: string, args: any): TPromise<DebugProtocol.Response> {
		return this.send(request, args);
	}

	protected send(command: string, args: any): TPromise<DebugProtocol.Response> {
		return this.initServer().then(() => {
			const promise = super.send(command, args).then(response => response, (errorResponse: DebugProtocol.ErrorResponse) => {
				const error = errorResponse.body ? errorResponse.body.error : null;
				const message = error ? debug.formatPII(error.format, false, error.variables) : errorResponse.message;
				if (error && error.sendTelemetry) {
					this.telemetryService.publicLog('debugProtocolErrorResponse', { error: message });
					if (this.customTelemetryService) {
						this.customTelemetryService.publicLog('debugProtocolErrorResponse', { error: message });
					}
				}
				if (errors.isPromiseCanceledError(errorResponse) || (error && error.showUser === false)) {
					// Do not show error message to user if showUser === false or 'canceled' error message #7906
					return TPromise.as(null);
				}

				if (error && error.url) {
					const label = error.urlLabel ? error.urlLabel : nls.localize('moreInfo', "More Info");
					return TPromise.wrapError(errors.create(message, { actions: [CloseAction, new Action('debug.moreInfo', label, null, true, () => {
						shell.openExternal(error.url);
						return TPromise.as(null);
					})]}));
				}

				return TPromise.wrapError(new Error(message));
			});

			this.sentPromises.push(promise);
			return promise;
		});
	}

	protected onEvent(event: DebugProtocol.Event): void {
		if (event.body) {
			event.body.sessionId = this.getId();
		} else {
			event.body = { sessionId: this.getId() };
		}

		if (event.event === 'initialized') {
			this.readyForBreakpoints = true;
			this._onDidInitialize.fire(event);
		} else if (event.event === 'stopped') {
			this.emittedStopped = true;
			this._onDidStop.fire(<DebugProtocol.StoppedEvent>event);
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
		}

		this._onDidEvent.fire(event);
	}

	public get configuration(): { type: string, isAttach: boolean, capabilities: DebugProtocol.Capabilites } {
		return {
			type: this.adapter.type,
			isAttach: this.isAttach,
			capabilities: this.capabilities || {}
		};
	}

	public initialize(args: DebugProtocol.InitializeRequestArguments): TPromise<DebugProtocol.InitializeResponse> {
		return this.send('initialize', args).then(response => this.readCapabilities(response));
	}

	private readCapabilities(response: DebugProtocol.Response): DebugProtocol.Response {
		this.capabilities = objects.mixin(this.capabilities, response.body);
		return response;
	}

	public launch(args: DebugProtocol.LaunchRequestArguments): TPromise<DebugProtocol.LaunchResponse> {
		this.isAttach = false;
		return this.send('launch', args).then(response => this.readCapabilities(response));
	}

	public attach(args: DebugProtocol.AttachRequestArguments): TPromise<DebugProtocol.AttachResponse> {
		this.isAttach = true;
		return this.send('attach', args).then(response => this.readCapabilities(response));
	}

	public next(args: DebugProtocol.NextArguments): TPromise<DebugProtocol.NextResponse> {
		return this.send('next', args);
	}

	public stepIn(args: DebugProtocol.StepInArguments): TPromise<DebugProtocol.StepInResponse> {
		return this.send('stepIn', args);
	}

	public stepOut(args: DebugProtocol.StepOutArguments): TPromise<DebugProtocol.StepOutResponse> {
		return this.send('stepOut', args);
	}

	public stepBack(args: DebugProtocol.StepBackArguments): TPromise<DebugProtocol.StepBackResponse> {
		return this.send('stepBack', args);
	}

	public continue(args: DebugProtocol.ContinueArguments): TPromise<DebugProtocol.ContinueResponse> {
		return this.send('continue', args);
	}

	public pause(args: DebugProtocol.PauseArguments): TPromise<DebugProtocol.PauseResponse> {
		return this.send('pause', args);
	}

	public setVarialbe(args: DebugProtocol.SetVariableArguments): TPromise<DebugProtocol.SetVariableResponse> {
		return this.send('setVariable', args);
	}

	public disconnect(restart = false, force = false): TPromise<DebugProtocol.DisconnectResponse> {
		if (this.stopServerPending && force) {
			return this.stopServer();
		}

		// Cancel all sent promises on disconnect so debug trees are not left in a broken state #3666.
		// Give a 1s timeout to give a chance for some promises to complete.
		setTimeout(() => {
			this.sentPromises.forEach(p => p.cancel());
			this.sentPromises = [];
		}, 1000);

		if ((this.serverProcess || this.socket) && !this.stopServerPending) {
			// point of no return: from now on don't report any errors
			this.stopServerPending = true;
			this.restarted = restart;
			return this.send('disconnect', { restart: restart }).then(() => this.stopServer(), () => this.stopServer());
		}

		return TPromise.as(null);
	}

	public setBreakpoints(args: DebugProtocol.SetBreakpointsArguments): TPromise<DebugProtocol.SetBreakpointsResponse> {
		return this.send('setBreakpoints', args);
	}

	public setFunctionBreakpoints(args: DebugProtocol.SetFunctionBreakpointsArguments): TPromise<DebugProtocol.SetFunctionBreakpointsResponse> {
		return this.send('setFunctionBreakpoints', args);
	}

	public setExceptionBreakpoints(args: DebugProtocol.SetExceptionBreakpointsArguments): TPromise<DebugProtocol.SetExceptionBreakpointsResponse> {
		return this.send('setExceptionBreakpoints', args);
	}

	public configurationDone(): TPromise<DebugProtocol.ConfigurationDoneResponse> {
		return this.send('configurationDone', null);
	}

	public stackTrace(args: DebugProtocol.StackTraceArguments): TPromise<DebugProtocol.StackTraceResponse> {
		return this.send('stackTrace', args);
	}

	public scopes(args: DebugProtocol.ScopesArguments): TPromise<DebugProtocol.ScopesResponse> {
		return this.send('scopes', args);
	}

	public variables(args: DebugProtocol.VariablesArguments): TPromise<DebugProtocol.VariablesResponse> {
		return this.send('variables', args);
	}

	public source(args: DebugProtocol.SourceArguments): TPromise<DebugProtocol.SourceResponse> {
		return this.send('source', args);
	}

	public threads(): TPromise<DebugProtocol.ThreadsResponse> {
		return this.send('threads', null);
	}

	public evaluate(args: DebugProtocol.EvaluateArguments): TPromise<DebugProtocol.EvaluateResponse> {
		return this.send('evaluate', args);
	}

	public getLengthInSeconds(): number {
		return (new Date().getTime() - this.startTime) / 1000;
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
		if (!this.adapter.program) {
			return TPromise.wrapError(new Error(nls.localize('noDebugAdapterExtensionInstalled', "No extension installed for '{0}' debugging.", this.adapter.type)));
		}

		return this.getLaunchDetails().then(d => this.launchServer(d).then(() => {
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

	private launchServer(launch: { command: string, argv: string[] }): TPromise<void> {
		return new TPromise<void>((c, e) => {
			if (launch.command === 'node') {
				stdfork.fork(launch.argv[0], launch.argv.slice(1), {}, (err, child) => {
					if (err) {
						e(new Error(nls.localize('unableToLaunchDebugAdapter', "Unable to launch debug adapter from '{0}'.", launch.argv[0])));
					}
					this.serverProcess = child;
					c(null);
				});
			} else {
				this.serverProcess = cp.spawn(launch.command, launch.argv, {
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
			this.onEvent({ event: 'exit', type: 'event', seq: 0 });
		}

		if (!this.serverProcess) {
			return TPromise.as(null);
		}

		this.stopServerPending = true;

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

	private getLaunchDetails(): TPromise<{ command: string; argv: string[]; }> {
		return new TPromise((c, e) => {
			fs.exists(this.adapter.program, exists => {
				if (exists) {
					c(null);
				} else {
					e(new Error(nls.localize('debugAdapterBinNotFound', "Debug adapter executable '{0}' not found.", this.adapter.program)));
				}
			});
		}).then(() => {
			if (this.adapter.runtime) {
				return {
					command: this.adapter.runtime,
					argv: (this.adapter.runtimeArgs || []).concat([this.adapter.program]).concat(this.adapter.args || [])
				};
			}

			return {
				command: this.adapter.program,
				argv: this.adapter.args || []
			};
		});
	}

	protected onServerError(err: Error): void {
		this.messageService.show(severity.Error, nls.localize('stoppingDebugAdapter', "{0}. Stopping the debug adapter.", err.message));
		this.stopServer().done(null, errors.onUnexpectedError);
	}

	private onServerExit(): void {
		this.serverProcess = null;
		this.cachedInitServer = null;
		if (!this.stopServerPending) {
			this.messageService.show(severity.Error, nls.localize('debugAdapterCrash', "Debug adapter process has terminated unexpectedly"));
		}
		this.onEvent({ event: 'exit', type: 'event', seq: 0 });
	}

	public dispose(): void {
		this.disconnect().done(null, errors.onUnexpectedError);
	}
}
