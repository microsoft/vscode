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
import { Action } from 'vs/base/common/actions';
import { isWindows, isLinux } from 'vs/base/common/platform';
import { findFreePort } from 'vs/base/node/ports';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ILifecycleService, ShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ChildProcess, fork } from 'child_process';
import { ipcRenderer as ipc } from 'electron';
import product from 'vs/platform/node/product';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ReloadWindowAction } from 'vs/workbench/electron-browser/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { generateRandomPipeName, Protocol } from 'vs/base/parts/ipc/node/ipc.net';
import { createServer, Server } from 'net';
import Event, { Emitter, debounceEvent, mapEvent, any } from 'vs/base/common/event';
import { fromEventEmitter } from 'vs/base/node/event';
import { IInitData, IWorkspaceData } from 'vs/workbench/api/node/extHost.protocol';
import { ExtensionService } from "vs/workbench/services/extensions/electron-browser/extensionService";
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { ICrashReporterService } from 'vs/workbench/services/crashReporter/common/crashReporterService';
import { IBroadcastService, IBroadcast } from "vs/platform/broadcast/electron-browser/broadcastService";
import { isEqual } from "vs/base/common/paths";
import { EXTENSION_CLOSE_EXTHOST_BROADCAST_CHANNEL, EXTENSION_RELOAD_BROADCAST_CHANNEL, ILogEntry, EXTENSION_ATTACH_BROADCAST_CHANNEL, EXTENSION_LOG_BROADCAST_CHANNEL, EXTENSION_TERMINATE_BROADCAST_CHANNEL } from "vs/platform/extensions/common/extensionHost";

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

	private readonly _isExtensionDevHost: boolean;
	private readonly _isExtensionDevTestFromCli: boolean;
	private readonly _isExtensionDevDebug: boolean;
	private readonly _isExtensionDevDebugBrk: boolean;

	readonly messagingProtocol = new LazyMessagePassingProtol();

	private extensionService: ExtensionService;

	constructor(
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@IMessageService private readonly _messageService: IMessageService,
		@IWindowsService private readonly _windowsService: IWindowsService,
		@IWindowService private readonly _windowService: IWindowService,
		@IBroadcastService private readonly _broadcastService: IBroadcastService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IWorkspaceConfigurationService private readonly _configurationService: IWorkspaceConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ICrashReporterService private readonly _crashReporterService: ICrashReporterService

	) {
		// handle extension host lifecycle a bit special when we know we are developing an extension that runs inside
		this._isExtensionDevHost = this._environmentService.isExtensionDevelopment;
		this._isExtensionDevDebug = (typeof this._environmentService.debugExtensionHost.port === 'number');
		this._isExtensionDevDebugBrk = !!this._environmentService.debugExtensionHost.break;
		this._isExtensionDevTestFromCli = this._isExtensionDevHost && !!this._environmentService.extensionTestsPath && !this._environmentService.debugExtensionHost.break;

		this._lifecycleService.onWillShutdown(this._onWillShutdown, this);
		this._lifecycleService.onShutdown(reason => this.terminate());

		_broadcastService.onBroadcast(b => this.onBroadcast(b));
	}

	private onBroadcast(broadcast: IBroadcast): void {

		// Close Ext Host Window Request
		if (broadcast.channel === EXTENSION_CLOSE_EXTHOST_BROADCAST_CHANNEL && this._isExtensionDevHost) {
			const extensionPaths = broadcast.payload as string[];
			if (Array.isArray(extensionPaths) && extensionPaths.some(path => isEqual(this._environmentService.extensionDevelopmentPath, path, !isLinux))) {
				this._windowService.closeWindow();
			}
		}

		if (broadcast.channel === EXTENSION_RELOAD_BROADCAST_CHANNEL && this._isExtensionDevHost) {
			const extensionPaths = broadcast.payload as string[];
			if (Array.isArray(extensionPaths) && extensionPaths.some(path => isEqual(this._environmentService.extensionDevelopmentPath, path, !isLinux))) {
				this._windowService.reloadWindow();
			}
		}
	}

	public start(extensionService: ExtensionService): TPromise<IMessagePassingProtocol> {
		this.extensionService = extensionService;

		return TPromise.join<any>([this._tryListenOnPipe(), this._tryFindDebugPort()]).then(data => {
			const [server, hook] = <[Server, string]>data[0];
			const port = <number>data[1];

			const opts = {
				env: objects.mixin(objects.clone(process.env), {
					AMD_ENTRYPOINT: 'vs/workbench/node/extensionHostProcess',
					PIPE_LOGGING: 'true',
					VERBOSE_LOGGING: true,
					VSCODE_WINDOW_ID: String(this._windowService.getCurrentWindowId()),
					VSCODE_IPC_HOOK_EXTHOST: hook,
					ELECTRON_NO_ASAR: '1'
				}),
				// We only detach the extension host on windows. Linux and Mac orphan by default
				// and detach under Linux and Mac create another process group.
				// We detach because we have noticed that when the renderer exits, its child processes
				// (i.e. extension host) are taken down in a brutal fashion by the OS
				detached: !!isWindows,
				execArgv: port
					? ['--nolazy', (this._isExtensionDevDebugBrk ? '--inspect-brk=' : '--inspect=') + port]
					: undefined,
				silent: true
			};

			const crashReporterOptions = this._crashReporterService.getChildProcessStartOptions('extensionHost');
			if (crashReporterOptions) {
				opts.env.CRASH_REPORTER_START_OPTIONS = JSON.stringify(crashReporterOptions);
			}

			// Run Extension Host as fork of current process
			this.extensionHostProcess = fork(URI.parse(require.toUrl('bootstrap')).fsPath, ['--type=extensionHost'], opts);

			// Catch all output coming from the extension host process
			type Output = { data: string, format: string[] };
			this.extensionHostProcess.stdout.setEncoding('utf8');
			this.extensionHostProcess.stderr.setEncoding('utf8');
			const onStdout = fromEventEmitter<string>(this.extensionHostProcess.stdout, 'data');
			const onStderr = fromEventEmitter<string>(this.extensionHostProcess.stderr, 'data');
			const onOutput = any(
				mapEvent(onStdout, o => ({ data: `%c${o}`, format: [''] })),
				mapEvent(onStderr, o => ({ data: `%c${o}`, format: ['color: red'] }))
			);

			// Debounce all output, so we can render it in the Chrome console as a group
			const onDebouncedOutput = debounceEvent<Output>(onOutput, (r, o) => {
				return r
					? { data: r.data + o.data, format: [...r.format, ...o.format] }
					: { data: o.data, format: o.format };
			}, 100);

			// Print out extension host output
			onDebouncedOutput(data => {
				console.group('Extension Host');
				console.log(data.data, ...data.format);
				console.groupEnd();
			});

			// Support logging from extension host
			this.extensionHostProcess.on('message', msg => {
				if (msg && (<ILogEntry>msg).type === '__$console') {
					this._logExtensionHostMessage(<ILogEntry>msg);
				}
			});

			// Lifecycle
			const globalExitListener = () => this.terminate();
			process.once('exit', globalExitListener);
			this.extensionHostProcess.on('error', (err) => this._onError(err));
			this.extensionHostProcess.on('exit', (code: number, signal: string) => {
				process.removeListener('exit', globalExitListener);
				this._onExit(code, signal);
			});

			// Notify debugger that we are ready to attach to the process if we run a development extension
			if (this._isExtensionDevHost && port) {
				this._broadcastService.broadcast({
					channel: EXTENSION_ATTACH_BROADCAST_CHANNEL,
					payload: {
						debugId: this._environmentService.debugExtensionHost.debugId,
						port
					}
				});
			}

			// Help in case we fail to start it
			let startupTimeoutHandle: number;
			if (!this._environmentService.isBuilt || this._isExtensionDevHost) {
				startupTimeoutHandle = setTimeout(() => {
					const msg = this._isExtensionDevDebugBrk
						? nls.localize('extensionHostProcess.startupFailDebug', "Extension host did not start in 10 seconds, it might be stopped on the first line and needs a debugger to continue.")
						: nls.localize('extensionHostProcess.startupFail', "Extension host did not start in 10 seconds, that might be a problem.");

					this._messageService.show(Severity.Warning, msg);
				}, 10000);
			}

			// Initialize extension host process with hand shakes
			return this._tryExtHostHandshake(server).then((protocol) => {
				clearTimeout(startupTimeoutHandle);
				return protocol;
			});
		});
	}

	private _tryListenOnPipe(): TPromise<[Server, string]> {
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

	private _tryFindDebugPort(): TPromise<number> {
		const extensionHostPort = this._environmentService.debugExtensionHost.port;
		if (typeof extensionHostPort !== 'number') {
			return TPromise.wrap<number>(void 0);
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
				if (this._isExtensionDevDebugBrk) {
					console.warn(`%c[Extension Host] %cSTOPPED on first line for debugging on port ${port}`, 'color: blue', 'color: black');
				} else {
					console.info(`%c[Extension Host] %cdebugger listening on port ${port}`, 'color: blue', 'color: black');
				}
				return c(port);
			});
		});
	}

	private _tryExtHostHandshake(server: Server): TPromise<IMessagePassingProtocol> {

		return new TPromise<IMessagePassingProtocol>((resolve, reject) => {

			let handle = setTimeout(() => reject('timeout'), 60 * 1000);
			server.on('connection', socket => {
				clearTimeout(handle);
				const protocol = new Protocol(socket);
				resolve(protocol);
			});

		}).then(protocol => {

			return new TPromise<IMessagePassingProtocol>((resolve, reject) => {
				protocol.onMessage(msg => {
					if (msg === 'ready') {
						// 1) Host is ready to receive messages, initialize it
						return this._createExtHostInitData().then(data => protocol.send(stringify(data)));
					} else if (msg === 'initialized') {
						// 2) Host is initialized
						this.messagingProtocol.resolve(protocol);
						resolve(protocol);
					}
					return undefined;
				});
			});

		});
	}

	private _createExtHostInitData(): TPromise<IInitData> {
		return TPromise.join<any>([this._telemetryService.getTelemetryInfo(), this.extensionService.getExtensions()]).then(([telemetryInfo, extensionDescriptions]) => {
			const r: IInitData = {
				parentPid: process.pid,
				environment: {
					isExtensionDevelopmentDebug: this._isExtensionDevDebug,
					appSettingsHome: this._environmentService.appSettingsHome,
					disableExtensions: this._environmentService.disableExtensions,
					userExtensionsHome: this._environmentService.extensionsPath,
					extensionDevelopmentPath: this._environmentService.extensionDevelopmentPath,
					extensionTestsPath: this._environmentService.extensionTestsPath,
					// globally disable proposed api when built and not insiders developing extensions
					enableProposedApiForAll: !this._environmentService.isBuilt || (!!this._environmentService.extensionDevelopmentPath && product.nameLong.indexOf('Insiders') >= 0),
					enableProposedApiFor: this._environmentService.args['enable-proposed-api'] || []
				},
				workspace: <IWorkspaceData>this._contextService.getWorkspace(),
				extensions: extensionDescriptions,
				configuration: this._configurationService.getConfigurationData(),
				telemetryInfo
			};
			return r;
		});
	}

	private _logExtensionHostMessage(logEntry: ILogEntry) {
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
		if (!this._isExtensionDevTestFromCli) {
			console[logEntry.severity].apply(console, consoleArgs);
		}

		// Log on main side if running tests from cli
		if (this._isExtensionDevTestFromCli) {
			this._windowsService.log(logEntry.severity, ...args);
		}

		// Broadcast to other windows if we are in development mode
		else if (!this._environmentService.isBuilt || this._isExtensionDevHost) {
			this._broadcastService.broadcast({
				channel: EXTENSION_LOG_BROADCAST_CHANNEL,
				payload: {
					logEntry,
					debugId: this._environmentService.debugExtensionHost.debugId
				}
			});
		}
	}

	private _onError(err: any): void {
		let errorMessage = toErrorMessage(err);
		if (errorMessage === this.lastExtensionHostError) {
			return; // prevent error spam
		}

		this.lastExtensionHostError = errorMessage;

		this._messageService.show(Severity.Error, nls.localize('extensionHostProcess.error', "Error from the extension host: {0}", errorMessage));
	}

	private _onExit(code: number, signal: string): void {
		if (this.terminating) {
			// Expected termination path (we asked it to terminate)
			return;
		}

		// Unexpected termination
		if (!this._isExtensionDevHost) {
			const openDevTools = new Action('openDevTools', nls.localize('devTools', "Developer Tools"), '', true, async (): TPromise<boolean> => {
				await this._windowService.openDevTools();
				return false;
			});

			let message = nls.localize('extensionHostProcess.crash', "Extension host terminated unexpectedly. Please reload the window to recover.");
			if (code === 87) {
				message = nls.localize('extensionHostProcess.unresponsiveCrash', "Extension host terminated because it was not responsive. Please reload the window to recover.");
			}
			this._messageService.show(Severity.Error, {
				message: message,
				actions: [
					openDevTools,
					this._instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, ReloadWindowAction.LABEL)
				]
			});

			console.error('Extension host terminated unexpectedly. Code: ', code, ' Signal: ', signal);
		}

		// Expected development extension termination: When the extension host goes down we also shutdown the window
		else if (!this._isExtensionDevTestFromCli) {
			this._windowService.closeWindow();
		}

		// When CLI testing make sure to exit with proper exit code
		else {
			ipc.send('vscode:exit', code);
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
		if (this._isExtensionDevHost && !this._isExtensionDevTestFromCli && !this._isExtensionDevDebug) {
			this._broadcastService.broadcast({
				channel: EXTENSION_TERMINATE_BROADCAST_CHANNEL,
				payload: {
					debugId: this._environmentService.debugExtensionHost.debugId
				}
			});

			event.veto(TPromise.timeout(100 /* wait a bit for IPC to get delivered */).then(() => false));
		}
	}
}
