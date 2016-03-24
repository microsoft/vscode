/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import cp = require('child_process');
import fs = require('fs');
import net = require('net');
import platform = require('vs/base/common/platform');
import { Action } from 'vs/base/common/actions';
import errors = require('vs/base/common/errors');
import { TPromise } from 'vs/base/common/winjs.base';
import severity from 'vs/base/common/severity';
import { AIAdapter } from 'vs/base/node/aiAdapter';
import debug = require('vs/workbench/parts/debug/common/debug');
import { Adapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import v8 = require('vs/workbench/parts/debug/node/v8Protocol');
import stdfork = require('vs/base/node/stdFork');
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { shell } from 'electron';

export class RawDebugSession extends v8.V8Protocol implements debug.IRawDebugSession {
	private serverProcess: cp.ChildProcess;
	private socket: net.Socket = null;
	private cachedInitServer: TPromise<void>;
	private startTime: number;
	private stopServerPending: boolean;
	private sentPromises: TPromise<DebugProtocol.Response>[];
	public isAttach: boolean;
	public restarted: boolean;
	public capabilities: DebugProtocol.Capabilites;

	constructor(
		private messageService: IMessageService,
		private telemetryService: ITelemetryService,
		private debugServerPort: number,
		private adapter: Adapter,
		private telemtryAdapter: AIAdapter
	) {
		super();
		this.capabilities = {};
		this.sentPromises = [];
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

	protected send(command: string, args: any): TPromise<DebugProtocol.Response> {
		return this.initServer().then(() => {
			const promise = super.send(command, args).then(response => response, (errorResponse: DebugProtocol.ErrorResponse) => {
				const error = errorResponse.body ? errorResponse.body.error : null;
				const message = error ? debug.formatPII(error.format, false, error.variables) : errorResponse.message;
				if (error && error.sendTelemetry) {
					this.telemetryService.publicLog('debugProtocolErrorResponse', { error: message });
					this.telemtryAdapter.log('debugProtocolErrorResponse', { error: message });
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

	public initialize(args: DebugProtocol.InitializeRequestArguments): TPromise<DebugProtocol.InitializeResponse> {
		return this.send('initialize', args).then(response => {
			this.capabilities = response.body || this.capabilities;
			return response;
		});
	}

	public launch(args: DebugProtocol.LaunchRequestArguments): TPromise<DebugProtocol.LaunchResponse> {
		this.isAttach = false;
		return this.sendAndLazyEmit('launch', args);
	}

	public attach(args: DebugProtocol.AttachRequestArguments): TPromise<DebugProtocol.AttachResponse> {
		this.isAttach = true;
		return this.sendAndLazyEmit('attach', args);
	}

	public next(args: DebugProtocol.NextArguments): TPromise<DebugProtocol.NextResponse> {
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

	// node sometimes sends "stopped" events earlier than the response for the "step" request.
	// due to this we only emit "continued" if we did not miss a stopped event.
	// we do not emit straight away to reduce viewlet flickering.
	private sendAndLazyEmit(command: string, args: any, eventType = debug.SessionEvents.CONTINUED): TPromise<DebugProtocol.Response> {
		const count = this.flowEventsCount;
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

	public disconnect(restart = false, force = false): TPromise<DebugProtocol.DisconnectResponse> {
		if (this.stopServerPending && force) {
			return this.stopServer();
		}
		// Cancel all sent promises on disconnect so debug trees are not left in a broken state #3666.
		this.sentPromises.forEach(p => p.cancel());
		this.sentPromises = [];

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

	public getType(): string {
		return this.adapter.type;
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
				console.log(sanitize(data));
			});

			this.connect(this.serverProcess.stdout, this.serverProcess.stdin);
		}));
	}

	private launchServer(launch: { command: string, argv: string[] }): TPromise<void> {
		return new TPromise<void>((c, e) => {
			if (launch.command === 'node') {
				stdfork.fork(launch.argv[0], launch.argv.slice(1), {}, (err, child) => {
					if (err) {
						e(new Error(nls.localize('unableToLaunchDebugAdapter', "Unable to launch debug adapter from {0}.", launch.argv[0])));
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
			this.emit(debug.SessionEvents.SERVER_EXIT);
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
					e(new Error(nls.localize('debugAdapterBinNotFound', "DebugAdapter bin folder not found on path {0}.", this.adapter.program)));
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
		this.emit(debug.SessionEvents.SERVER_EXIT);
	}
}
