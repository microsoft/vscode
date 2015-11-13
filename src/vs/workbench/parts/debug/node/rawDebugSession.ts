/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import cp = require('child_process');
import fs = require('fs');
import path = require('path');
import net = require('net');
import remote = require('remote');
import nls = require('vs/nls');
import uri from 'vs/base/common/uri';
import platform = require('vs/base/common/platform');
import errors = require('vs/base/common/errors');
import { Promise, TPromise} from 'vs/base/common/winjs.base';
import severity from 'vs/base/common/severity';
import actions = require('vs/base/common/actions');
import debug = require('vs/workbench/parts/debug/common/debug');
import { Adapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import v8 = require('vs/workbench/parts/debug/node/v8Protocol');
import stdfork = require('vs/base/node/stdFork');
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

var shell = remote.require('shell');

export class RawDebugSession extends v8.V8Protocol implements debug.IRawDebugSession {
	private serverProcess: cp.ChildProcess;
	private socket: net.Socket = null;
	private cachedInitServer: Promise;
	private startTime: number;
	private stopServerPending: boolean;

	constructor(
		private messageService: IMessageService,
		private telemetryService: ITelemetryService,
		private debugServerPort: number,
		private adapter: Adapter
	) {
		super();
	}

	private initServer(): Promise {
		if (this.cachedInitServer) {
			return this.cachedInitServer;
		}

		const serverPromise = this.debugServerPort ? this.connectServer(this.debugServerPort) : this.startServer();
		this.cachedInitServer = serverPromise.then(() => {
				this.startTime = new Date().getTime();
			}, err => {
				this.cachedInitServer = null;
				return Promise.wrapError(err);
			}
		);

		return this.cachedInitServer;
	}

	protected send(command: string, args: any): TPromise<DebugProtocol.Response> {
		return this.initServer().then(() => super.send(command, args).then(response => response, (errorResponse: DebugProtocol.ErrorResponse) => {
			var error = errorResponse.body ? errorResponse.body.error : null;
			var message = error ? debug.formatPII(error.format, false, error.variables) : errorResponse.message;
			if (error && error.sendTelemetry) {
				this.telemetryService.publicLog('debugProtocolErrorResponse', { error : message });
			}

			return Promise.wrapError(new Error(message));
		}));
	}

	public initialize(args: DebugProtocol.InitializeRequestArguments): TPromise<DebugProtocol.InitializeResponse> {
		return this.send('initialize', args);
	}

	public launch(args: DebugProtocol.LaunchRequestArguments): TPromise<DebugProtocol.LaunchResponse> {
		return this.sendAndLazyEmit('launch', args);
	}

	public attach(args: DebugProtocol.AttachRequestArguments): TPromise<DebugProtocol.AttachResponse> {
		return this.sendAndLazyEmit('attach', args);
	}

	public stepOver(args: DebugProtocol.NextArguments): TPromise<DebugProtocol.NextResponse> {
		return this.sendAndLazyEmit('next', args);
	}

	public stepIn(args: DebugProtocol.StepInArguments): TPromise<DebugProtocol.StepInResponse> {
		return this.sendAndLazyEmit('stepIn', args);
	}

	public stepOut(args: DebugProtocol.StepOutArguments): TPromise<DebugProtocol.StepOutResponse> {
		return this.sendAndLazyEmit('stepOut', args);
	}

	public continue(args: DebugProtocol.ContinueArguments): TPromise<DebugProtocol.ContinueResponse> {
		return this.sendAndLazyEmit('continue', args);
	}

	// Node sometimes sends "stopped" events earlier than the response for the "step" request.
	// Due to this we only emit "continued" if we did not miss a stopped event.
	// We do not emit straight away to reduce viewlet flickering.
	private sendAndLazyEmit(command: string, args: any, eventType = debug.SessionEvents.CONTINUED): TPromise<DebugProtocol.Response> {
		var count = this.flowEventsCount;
		return this.send(command, args).then(response => {
			setTimeout(() => {
				if (this.flowEventsCount === count) {
					this.emit(eventType);
				}
			}, 500);

			return response;
		});
	}

	public pause(args: DebugProtocol.PauseArguments): TPromise<DebugProtocol.PauseResponse> {
		return this.send('pause', args);
	}

	public stop(restart = false): TPromise<DebugProtocol.DisconnectResponse> {
		if ((this.serverProcess || this.socket) && !this.stopServerPending) {
			this.stopServerPending = true; // point of no return: from now on don't report any errors
			return this.send('disconnect', { extensionHostData: { restart: restart } }).then(() => {
				return this.stopServer();
			}, () => {
				return this.stopServer();
			});
		}

		return Promise.as(null);
	}

	public setBreakpoints(args: DebugProtocol.SetBreakpointsArguments): TPromise<DebugProtocol.SetBreakpointsResponse> {
		return this.send('setBreakpoints', args);
	}

	public setExceptionBreakpoints(args: DebugProtocol.SetExceptionBreakpointsArguments): TPromise<DebugProtocol.SetExceptionBreakpointsResponse> {
		return this.send('setExceptionBreakpoints', args);
	}

	public stackTrace(args: DebugProtocol.StackTraceArguments): TPromise<DebugProtocol.StackTraceResponse> {
		return this.send('stackTrace', args);
	}

	public scopes(args: DebugProtocol.ScopesArguments): TPromise<DebugProtocol.ScopesResponse> {
		return this.send('scopes', args);
	}

	public resolveVariables(args: DebugProtocol.VariablesArguments): TPromise<DebugProtocol.VariablesResponse> {
		return this.send('variables', args);
	}

	public resolveSource(args: DebugProtocol.SourceArguments): TPromise<DebugProtocol.SourceResponse> {
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

	public getType(): string {
		return this.adapter.type;
	}

	//---- private

	private connectServer(port: number): Promise {
		return new Promise((c, e) => {
			this.socket = net.createConnection(port, null, () => {
				this.connect(this.socket, <any>this.socket);
				c(null);
			});
			this.socket.on('error', (err: any) => {
				e(err);
			});
		});
	}

	private startServer(): Promise {
		if (!this.adapter.program) {
			return Promise.wrapError(new Error(`No extension installed for '${ this.adapter.type }' debugging.`));
		}

		return this.getLaunchDetails().then(d => this.launchServer(d).then(() => {
			this.serverProcess.on('error', (err: Error) => this.onServerError(err));
			this.serverProcess.on('exit', (code: number, signal: string) => this.onServerExit());

			var sanitize = (s: string) => s.toString().replace(/\r?\n$/mg, '');
			//		this.serverProcess.stdout.on('data', (data: string) => {
			//			console.log('%c' + sanitize(data), 'background: #ddd; font-style: italic;');
			//		});
			this.serverProcess.stderr.on('data', (data: string) => {
				console.log(sanitize(data));
			});

			this.connect(this.serverProcess.stdout, this.serverProcess.stdin);
		}));
	}

	private launchServer(launch: { command: string, argv: string[] }): Promise {
		return new Promise((c, e) => {
			if (launch.command === 'node') {
				stdfork.fork(launch.argv[0], [], {}, (err, child) => {
					if (err) {
						e(new Error(`Unable to launch debug adapter from ${ launch.argv[0] }.`));
					}
					this.serverProcess = child;
					c(true);
				});
			} else {
				this.serverProcess = cp.spawn(launch.command, launch.argv, {
					stdio: [
						'pipe', 	// stdin
						'pipe', 	// stdout
						'pipe'		// stderr
					],
				});
				c(true);
			}
		});
	}

	private stopServer(): Promise {

		if (this.socket !== null) {
			this.socket.end();
			this.cachedInitServer = null;
			this.emit(debug.SessionEvents.SERVER_EXIT);
		}

		if (!this.serverProcess) {
			return TPromise.as(undefined);
		}

		this.stopServerPending = true;

		var ret: Promise;
		// when killing a process in windows its child
		// processes are *not* killed but become root
		// processes. Therefore we use TASKKILL.EXE
		if (platform.isWindows) {
			ret = new Promise((c, e) => {
				var killer = cp.exec(`taskkill /F /T /PID ${this.serverProcess.pid}`, function (err, stdout, stderr) {
					if (err) {
						return e(err);
					}
				});
				killer.on('exit', c);
				killer.on('error', e);
			});
		} else {
			this.serverProcess.kill('SIGTERM');
			ret = TPromise.as(undefined);
		}

		return ret;
	}

	private getLaunchDetails(): TPromise<{ command: string; argv: string[]; }> {
		return new TPromise<string>((c, e) => {
			fs.exists(this.adapter.program, exists => {
				if (exists) {
					// trust the local bin folder
					c(this.adapter.program);
				} else {
					e(new Error(`DebugAdapter bin folder not found on path ${this.adapter.program}.`));
				}
			});
		}).then(adapterPath => {
			if (this.adapter.runtime) {
				return {
					command: this.adapter.runtime,
					argv: [adapterPath].concat(this.adapter.runtimeArgs)
				};
			}

			return {
				command: adapterPath
			};
		});
	}

	private onServerError(err: Error): void {
		this.stopServer().done(null, errors.onUnexpectedError);
		this.messageService.show(severity.Error, err.message);
	}

	private onServerExit(): void {
		this.serverProcess = null;
		this.cachedInitServer = null;
		if (!this.stopServerPending) {
			this.messageService.show(severity.Error, 'Debug adapter process has terminated unexpectedly');
		}
		this.emit(debug.SessionEvents.SERVER_EXIT);
	}
}
