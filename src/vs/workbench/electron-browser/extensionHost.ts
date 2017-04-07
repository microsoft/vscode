/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { stringify } from 'vs/base/common/marshalling';
import * as objects from 'vs/base/common/objects';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { isWindows } from 'vs/base/common/platform';
import { findFreePort } from 'vs/base/node/ports';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ILifecycleService, ShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWindowIPCService } from 'vs/workbench/services/window/electron-browser/windowService';
import { ChildProcess, fork } from 'child_process';
import { ipcRenderer as ipc } from 'electron';
import product from 'vs/platform/node/product';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ReloadWindowAction } from 'vs/workbench/electron-browser/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { generateRandomPipeName, Protocol } from 'vs/base/parts/ipc/node/ipc.net';
import { createServer, Server } from 'net';
import Event, { Emitter } from 'vs/base/common/event';
import { IInitData } from 'vs/workbench/api/node/extHost.protocol';
import { MainProcessExtensionService } from 'vs/workbench/api/node/mainThreadExtensionService';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';

export const EXTENSION_LOG_BROADCAST_CHANNEL = 'vscode:extensionLog';
export const EXTENSION_ATTACH_BROADCAST_CHANNEL = 'vscode:extensionAttach';
export const EXTENSION_TERMINATE_BROADCAST_CHANNEL = 'vscode:extensionTerminate';

export interface ILogEntry {
	type: string;
	severity: string;
	arguments: any;
}

export class LazyMessagePassingProtol implements IMessagePassingProtocol {

	private _delegate: IMessagePassingProtocol;
	private _onMessage = new Emitter<any>();
	private _buffer: any[] = [];

	readonly onMessage: Event<any> = this._onMessage.event;

	send(msg: any): void {
		if (this._delegate) {
			this._delegate.send(msg);
		} else {
			this._buffer.push(msg);
		}
	}

	resolve(delegate: IMessagePassingProtocol): void {
		this._delegate = delegate;
		this._delegate.onMessage(data => this._onMessage.fire(data));
		this._buffer.forEach(this._delegate.send, this._delegate);
		this._buffer = null;
	}
}

export class ExtensionHostProcessWorker {

	private extensionHostProcess: ChildProcess;

	private lastExtensionHostError: string;
	private terminating: boolean;

	private isExtensionDevelopmentHost: boolean;
	private isExtensionDevelopmentTestFromCli: boolean;
	private isExtensionDevelopmentDebug: boolean;
	private isExtensionDevelopmentDebugBrk: boolean;

	public readonly messagingProtocol = new LazyMessagePassingProtol();

	private extensionService: MainProcessExtensionService;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IMessageService private messageService: IMessageService,
		@IWindowsService private windowsService: IWindowsService,
		@IWindowIPCService private windowService: IWindowIPCService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		// handle extension host lifecycle a bit special when we know we are developing an extension that runs inside
		this.isExtensionDevelopmentHost = environmentService.isExtensionDevelopment;
		this.isExtensionDevelopmentDebug = (typeof environmentService.debugExtensionHost.port === 'number');
		this.isExtensionDevelopmentDebugBrk = !!environmentService.debugExtensionHost.break;
		this.isExtensionDevelopmentTestFromCli = this.isExtensionDevelopmentHost && !!environmentService.extensionTestsPath && !environmentService.debugExtensionHost.break;

		lifecycleService.onWillShutdown(this._onWillShutdown, this);
		lifecycleService.onShutdown(reason => this.terminate());
	}

	public start(extensionService: MainProcessExtensionService): void {
		this.extensionService = extensionService;

		TPromise.join<any>([this.tryListenOnPipe(), this.tryFindDebugPort()]).then(data => {
			const [server, hook] = <[Server, string]>data[0];
			const port = <number>data[1];

			let opts = {
				env: objects.mixin(objects.clone(process.env), {
					AMD_ENTRYPOINT: 'vs/workbench/node/extensionHostProcess',
					PIPE_LOGGING: 'true',
					VERBOSE_LOGGING: true,
					VSCODE_WINDOW_ID: String(this.windowService.getWindowId()),
					VSCODE_IPC_HOOK_EXTHOST: hook,
					ELECTRON_NO_ASAR: '1'
				}),
				// We only detach the extension host on windows. Linux and Mac orphan by default
				// and detach under Linux and Mac create another process group.
				// We detach because we have noticed that when the renderer exits, its child processes
				// (i.e. extension host) is taken down in a brutal fashion by the OS
				detached: !!isWindows,
				execArgv: port
					? ['--nolazy', (this.isExtensionDevelopmentDebugBrk ? '--debug-brk=' : '--debug=') + port]
					: undefined
			};

			// Run Extension Host as fork of current process
			this.extensionHostProcess = fork(URI.parse(require.toUrl('bootstrap')).fsPath, ['--type=extensionHost'], opts);

			// Support logging from extension host
			this.extensionHostProcess.on('message', msg => {
				if (msg && (<ILogEntry>msg).type === '__$console') {
					this.logExtensionHostMessage(<ILogEntry>msg);
				}
			});

			// Lifecycle
			let onExit = () => this.terminate();
			process.once('exit', onExit);
			this.extensionHostProcess.on('error', (err) => this.onError(err));
			this.extensionHostProcess.on('exit', (code: any, signal: any) => this.onExit(code, signal, onExit));

			// Notify debugger that we are ready to attach to the process if we run a development extension
			if (this.isExtensionDevelopmentHost && port) {
				this.windowService.broadcast({
					channel: EXTENSION_ATTACH_BROADCAST_CHANNEL,
					payload: { port }
				}, this.environmentService.extensionDevelopmentPath /* target */);
			}

			// Help in case we fail to start it
			let startupTimeoutHandle: number;
			if (!this.environmentService.isBuilt || this.isExtensionDevelopmentHost) {
				startupTimeoutHandle = setTimeout(() => {
					const msg = this.isExtensionDevelopmentDebugBrk
						? nls.localize('extensionHostProcess.startupFailDebug', "Extension host did not start in 10 seconds, it might be stopped on the first line and needs a debugger to continue.")
						: nls.localize('extensionHostProcess.startupFail', "Extension host did not start in 10 seconds, that might be a problem.");

					this.messageService.show(Severity.Warning, msg);
				}, 10000);
			}

			// Initialize extension host process with hand shakes
			return this.tryExtHostHandshake(server).then(() => clearTimeout(startupTimeoutHandle));
		}).done(undefined, err => {
			console.error('ERROR starting extension host');
			console.error(err);
		});
	}

	private tryListenOnPipe(): TPromise<[Server, string]> {
		return new TPromise<[Server, string]>((resolve, reject) => {
			const server = createServer();
			server.on('error', reject);
			const hook = generateRandomPipeName();
			server.listen(hook, () => {
				server.removeListener('error', reject);
				resolve([server, hook]);
			});
		});
	}

	private tryFindDebugPort(): TPromise<number> {
		const extensionHostPort = this.environmentService.debugExtensionHost.port;
		if (typeof extensionHostPort !== 'number') {
			return TPromise.wrap(void 0);
		}
		return new TPromise<number>((c, e) => {
			findFreePort(extensionHostPort, 10 /* try 10 ports */, 5000 /* try up to 5 seconds */, (port) => {
				if (!port) {
					console.warn('%c[Extension Host] %cCould not find a free port for debugging', 'color: blue', 'color: black');
					return c(void 0);
				}
				if (port !== extensionHostPort) {
					console.warn(`%c[Extension Host] %cProvided debugging port ${extensionHostPort} is not free, using ${port} instead.`, 'color: blue', 'color: black');
				}
				if (this.isExtensionDevelopmentDebugBrk) {
					console.warn(`%c[Extension Host] %cSTOPPED on first line for debugging on port ${port}`, 'color: blue', 'color: black');
				} else {
					console.info(`%c[Extension Host] %cdebugger listening on port ${port}`, 'color: blue', 'color: black');
				}
				return c(port);
			});
		});
	}

	private tryExtHostHandshake(server: Server): TPromise<any> {

		return new TPromise<IMessagePassingProtocol>((resolve, reject) => {
			let handle = setTimeout(() => reject('timeout'), 60 * 1000);
			server.on('connection', socket => {
				clearTimeout(handle);
				const protocol = new Protocol(socket);
				resolve(protocol);
			});
			// }).then(protocol => {
			// 	return protocol;

		}).then(protocol => {

			protocol.onMessage(msg => {
				if (msg === 'ready') {
					// 1) Host is ready to receive messages, initialize it
					return this.createExtHostInitData().then(data => protocol.send(stringify(data)));
				} else if (msg === 'initialized') {
					// 2) Host is initialized
					this.messagingProtocol.resolve(protocol);
				}
				return undefined;
			});
		});
	}

	private createExtHostInitData(): TPromise<IInitData> {
		return TPromise.join<any>([this.telemetryService.getTelemetryInfo(), this.extensionService.getExtensions()]).then(([telemetryInfo, extensionDescriptions]) => {
			return <IInitData>{
				parentPid: process.pid,
				environment: {
					appSettingsHome: this.environmentService.appSettingsHome,
					disableExtensions: this.environmentService.disableExtensions,
					userExtensionsHome: this.environmentService.extensionsPath,
					extensionDevelopmentPath: this.environmentService.extensionDevelopmentPath,
					extensionTestsPath: this.environmentService.extensionTestsPath,
					// globally disable proposed api when built and not insiders developing extensions
					enableProposedApi: !this.environmentService.isBuilt || (!!this.environmentService.extensionDevelopmentPath && product.nameLong.indexOf('Insiders') >= 0)
				},
				contextService: {
					workspace: this.contextService.getWorkspace()
				},
				extensions: extensionDescriptions,
				configuration: this.configurationService.values(),
				telemetryInfo
			};
		});
	}

	private logExtensionHostMessage(logEntry: ILogEntry) {
		let args = [];
		try {
			let parsed = JSON.parse(logEntry.arguments);
			args.push(...Object.getOwnPropertyNames(parsed).map(o => parsed[o]));
		} catch (error) {
			args.push(logEntry.arguments);
		}

		// If the first argument is a string, check for % which indicates that the message
		// uses substitution for variables. In this case, we cannot just inject our colored
		// [Extension Host] to the front because it breaks substitution.
		let consoleArgs = [];
		if (typeof args[0] === 'string' && args[0].indexOf('%') >= 0) {
			consoleArgs = [`%c[Extension Host]%c ${args[0]}`, 'color: blue', 'color: black', ...args.slice(1)];
		} else {
			consoleArgs = ['%c[Extension Host]', 'color: blue', ...args];
		}

		// Send to local console unless we run tests from cli
		if (!this.isExtensionDevelopmentTestFromCli) {
			console[logEntry.severity].apply(console, consoleArgs);
		}

		// Log on main side if running tests from cli
		if (this.isExtensionDevelopmentTestFromCli) {
			this.windowsService.log(logEntry.severity, ...args);
		}

		// Broadcast to other windows if we are in development mode
		else if (!this.environmentService.isBuilt || this.isExtensionDevelopmentHost) {
			this.windowService.broadcast({
				channel: EXTENSION_LOG_BROADCAST_CHANNEL,
				payload: logEntry
			}, this.environmentService.extensionDevelopmentPath /* target */);
		}
	}

	private onError(err: any): void {
		let errorMessage = toErrorMessage(err);
		if (errorMessage === this.lastExtensionHostError) {
			return; // prevent error spam
		}

		this.lastExtensionHostError = errorMessage;

		this.messageService.show(Severity.Error, nls.localize('extensionHostProcess.error', "Error from the extension host: {0}", errorMessage));
	}

	private onExit(code: any, signal: any, onProcessExit: any): void {
		process.removeListener('exit', onProcessExit);

		if (!this.terminating) {

			// Unexpected termination
			if (!this.isExtensionDevelopmentHost) {
				this.messageService.show(Severity.Error, {
					message: nls.localize('extensionHostProcess.crash', "Extension host terminated unexpectedly. Please reload the window to recover."),
					actions: [this.instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, ReloadWindowAction.LABEL)]
				});
				console.error('Extension host terminated unexpectedly. Code: ', code, ' Signal: ', signal);
			}

			// Expected development extension termination: When the extension host goes down we also shutdown the window
			else if (!this.isExtensionDevelopmentTestFromCli) {
				this.windowService.getWindow().close();
			}

			// When CLI testing make sure to exit with proper exit code
			else {
				ipc.send('vscode:exit', code);
			}
		}
	}

	public terminate(): void {
		this.terminating = true;
		if (this.extensionHostProcess) {
			this.messagingProtocol.send({
				type: '__$terminate'
			});
		}
	}

	private _onWillShutdown(event: ShutdownEvent): void {

		// If the extension development host was started without debugger attached we need
		// to communicate this back to the main side to terminate the debug session
		if (this.isExtensionDevelopmentHost && !this.isExtensionDevelopmentTestFromCli && !this.isExtensionDevelopmentDebug) {
			this.windowService.broadcast({
				channel: EXTENSION_TERMINATE_BROADCAST_CHANNEL,
				payload: true
			}, this.environmentService.extensionDevelopmentPath /* target */);

			event.veto(TPromise.timeout(100 /* wait a bit for IPC to get delivered */).then(() => false));
		}
	}
}
