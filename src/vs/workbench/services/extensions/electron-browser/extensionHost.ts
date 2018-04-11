/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import * as objects from 'vs/base/common/objects';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { isWindows, isLinux } from 'vs/base/common/platform';
import { findFreePort } from 'vs/base/node/ports';
import { ILifecycleService, ShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ChildProcess, fork } from 'child_process';
import { ipcRenderer as ipc } from 'electron';
import product from 'vs/platform/node/product';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { generateRandomPipeName, Protocol } from 'vs/base/parts/ipc/node/ipc.net';
import { createServer, Server, Socket } from 'net';
import { Event, Emitter, debounceEvent, mapEvent, anyEvent, fromNodeEventEmitter } from 'vs/base/common/event';
import { IInitData, IWorkspaceData, IConfigurationInitData } from 'vs/workbench/api/node/extHost.protocol';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { ICrashReporterService } from 'vs/workbench/services/crashReporter/electron-browser/crashReporterService';
import { IBroadcastService, IBroadcast } from 'vs/platform/broadcast/electron-browser/broadcastService';
import { isEqual } from 'vs/base/common/paths';
import { EXTENSION_CLOSE_EXTHOST_BROADCAST_CHANNEL, EXTENSION_RELOAD_BROADCAST_CHANNEL, EXTENSION_ATTACH_BROADCAST_CHANNEL, EXTENSION_LOG_BROADCAST_CHANNEL, EXTENSION_TERMINATE_BROADCAST_CHANNEL } from 'vs/platform/extensions/common/extensionHost';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IRemoteConsoleLog, log, parse } from 'vs/base/node/console';
import { getScopes } from 'vs/platform/configuration/common/configurationRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';

export class ExtensionHostProcessWorker {

	private readonly _onCrashed: Emitter<[number, string]> = new Emitter<[number, string]>();
	public readonly onCrashed: Event<[number, string]> = this._onCrashed.event;

	private readonly _toDispose: IDisposable[];

	private readonly _isExtensionDevHost: boolean;
	private readonly _isExtensionDevDebug: boolean;
	private readonly _isExtensionDevDebugBrk: boolean;
	private readonly _isExtensionDevTestFromCli: boolean;

	// State
	private _lastExtensionHostError: string;
	private _terminating: boolean;

	// Resources, in order they get acquired/created when .start() is called:
	private _namedPipeServer: Server;
	private _inspectPort: number;
	private _extensionHostProcess: ChildProcess;
	private _extensionHostConnection: Socket;
	private _messageProtocol: TPromise<IMessagePassingProtocol>;

	constructor(
		/* intentionally not injected */private readonly _extensionService: IExtensionService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IWindowsService private readonly _windowsService: IWindowsService,
		@IWindowService private readonly _windowService: IWindowService,
		@IBroadcastService private readonly _broadcastService: IBroadcastService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IWorkspaceConfigurationService private readonly _configurationService: IWorkspaceConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ICrashReporterService private readonly _crashReporterService: ICrashReporterService,
		@ILogService private readonly _logService: ILogService
	) {
		// handle extension host lifecycle a bit special when we know we are developing an extension that runs inside
		this._isExtensionDevHost = this._environmentService.isExtensionDevelopment;
		this._isExtensionDevDebug = (typeof this._environmentService.debugExtensionHost.port === 'number');
		this._isExtensionDevDebugBrk = !!this._environmentService.debugExtensionHost.break;
		this._isExtensionDevTestFromCli = this._isExtensionDevHost && !!this._environmentService.extensionTestsPath && !this._environmentService.debugExtensionHost.break;

		this._lastExtensionHostError = null;
		this._terminating = false;

		this._namedPipeServer = null;
		this._extensionHostProcess = null;
		this._extensionHostConnection = null;
		this._messageProtocol = null;

		this._toDispose = [];
		this._toDispose.push(this._onCrashed);
		this._toDispose.push(this._lifecycleService.onWillShutdown((e) => this._onWillShutdown(e)));
		this._toDispose.push(this._lifecycleService.onShutdown(reason => this.terminate()));
		this._toDispose.push(this._broadcastService.onBroadcast(b => this._onBroadcast(b)));

		const globalExitListener = () => this.terminate();
		process.once('exit', globalExitListener);
		this._toDispose.push({
			dispose: () => {
				process.removeListener('exit', globalExitListener);
			}
		});
	}

	public dispose(): void {
		this.terminate();
	}

	private _onBroadcast(broadcast: IBroadcast): void {

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

	public start(): TPromise<IMessagePassingProtocol> {
		if (this._terminating) {
			// .terminate() was called
			return null;
		}

		if (!this._messageProtocol) {
			this._messageProtocol = TPromise.join([this._tryListenOnPipe(), this._tryFindDebugPort()]).then(data => {
				const pipeName = data[0];
				const portData = data[1];

				const opts = {
					env: objects.mixin(objects.deepClone(process.env), {
						AMD_ENTRYPOINT: 'vs/workbench/node/extensionHostProcess',
						PIPE_LOGGING: 'true',
						VERBOSE_LOGGING: true,
						VSCODE_IPC_HOOK_EXTHOST: pipeName,
						VSCODE_HANDLES_UNCAUGHT_ERRORS: true,
						VSCODE_LOG_STACK: !this._isExtensionDevTestFromCli && (this._isExtensionDevHost || !this._environmentService.isBuilt || product.quality !== 'stable' || this._environmentService.verbose)
					}),
					// We only detach the extension host on windows. Linux and Mac orphan by default
					// and detach under Linux and Mac create another process group.
					// We detach because we have noticed that when the renderer exits, its child processes
					// (i.e. extension host) are taken down in a brutal fashion by the OS
					detached: !!isWindows,
					execArgv: <string[]>undefined,
					silent: true
				};

				if (portData.actual) {
					opts.execArgv = [
						'--nolazy',
						(this._isExtensionDevDebugBrk ? '--inspect-brk=' : '--inspect=') + portData.actual
					];
					if (!portData.expected) {
						// No one asked for 'inspect' or 'inspect-brk', only us. We add another
						// option such that the extension host can manipulate the execArgv array
						opts.env.VSCODE_PREVENT_FOREIGN_INSPECT = true;
					}
				}

				const crashReporterOptions = this._crashReporterService.getChildProcessStartOptions('extensionHost');
				if (crashReporterOptions) {
					opts.env.CRASH_REPORTER_START_OPTIONS = JSON.stringify(crashReporterOptions);
				}

				// Run Extension Host as fork of current process
				this._extensionHostProcess = fork(URI.parse(require.toUrl('bootstrap')).fsPath, ['--type=extensionHost'], opts);

				// Catch all output coming from the extension host process
				type Output = { data: string, format: string[] };
				this._extensionHostProcess.stdout.setEncoding('utf8');
				this._extensionHostProcess.stderr.setEncoding('utf8');
				const onStdout = fromNodeEventEmitter<string>(this._extensionHostProcess.stdout, 'data');
				const onStderr = fromNodeEventEmitter<string>(this._extensionHostProcess.stderr, 'data');
				const onOutput = anyEvent(
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
					const inspectorUrlIndex = !this._environmentService.isBuilt && data.data && data.data.indexOf('chrome-devtools://');
					if (inspectorUrlIndex >= 0) {
						console.log(`%c[Extension Host] %cdebugger inspector at ${data.data.substr(inspectorUrlIndex)}`, 'color: blue', 'color: black');
					} else {
						console.group('Extension Host');
						console.log(data.data, ...data.format);
						console.groupEnd();
					}
				});

				// Support logging from extension host
				this._extensionHostProcess.on('message', msg => {
					if (msg && (<IRemoteConsoleLog>msg).type === '__$console') {
						this._logExtensionHostMessage(<IRemoteConsoleLog>msg);
					}
				});

				// Lifecycle
				this._extensionHostProcess.on('error', (err) => this._onExtHostProcessError(err));
				this._extensionHostProcess.on('exit', (code: number, signal: string) => this._onExtHostProcessExit(code, signal));

				// Notify debugger that we are ready to attach to the process if we run a development extension
				if (this._isExtensionDevHost && portData.actual) {
					this._broadcastService.broadcast({
						channel: EXTENSION_ATTACH_BROADCAST_CHANNEL,
						payload: {
							debugId: this._environmentService.debugExtensionHost.debugId,
							port: portData.actual
						}
					});
				}
				this._inspectPort = portData.actual;

				// Help in case we fail to start it
				let startupTimeoutHandle: number;
				if (!this._environmentService.isBuilt || this._isExtensionDevHost) {
					startupTimeoutHandle = setTimeout(() => {
						const msg = this._isExtensionDevDebugBrk
							? nls.localize('extensionHostProcess.startupFailDebug', "Extension host did not start in 10 seconds, it might be stopped on the first line and needs a debugger to continue.")
							: nls.localize('extensionHostProcess.startupFail', "Extension host did not start in 10 seconds, that might be a problem.");

						this._notificationService.prompt(Severity.Warning, msg,
							[{
								label: nls.localize('reloadWindow', "Reload Window"),
								run: () => this._windowService.reloadWindow()
							}]
						);
					}, 10000);
				}

				// Initialize extension host process with hand shakes
				return this._tryExtHostHandshake().then((protocol) => {
					clearTimeout(startupTimeoutHandle);
					return protocol;
				});
			});
		}

		return this._messageProtocol;
	}

	/**
	 * Start a server (`this._namedPipeServer`) that listens on a named pipe and return the named pipe name.
	 */
	private _tryListenOnPipe(): TPromise<string> {
		return new TPromise<string>((resolve, reject) => {
			const pipeName = generateRandomPipeName();

			this._namedPipeServer = createServer();
			this._namedPipeServer.on('error', reject);
			this._namedPipeServer.listen(pipeName, () => {
				this._namedPipeServer.removeListener('error', reject);
				resolve(pipeName);
			});
		});
	}

	/**
	 * Find a free port if extension host debugging is enabled.
	 */
	private _tryFindDebugPort(): TPromise<{ expected: number; actual: number }> {
		let expected: number;
		let startPort = 9333;
		if (typeof this._environmentService.debugExtensionHost.port === 'number') {
			startPort = expected = this._environmentService.debugExtensionHost.port;
		} else {
			return TPromise.as({ expected: undefined, actual: 0 });
		}
		return new TPromise((c, e) => {
			return findFreePort(startPort, 10 /* try 10 ports */, 5000 /* try up to 5 seconds */).then(port => {
				if (!port) {
					console.warn('%c[Extension Host] %cCould not find a free port for debugging', 'color: blue', 'color: black');
				} else {
					if (expected && port !== expected) {
						console.warn(`%c[Extension Host] %cProvided debugging port ${expected} is not free, using ${port} instead.`, 'color: blue', 'color: black');
					}
					if (this._isExtensionDevDebugBrk) {
						console.warn(`%c[Extension Host] %cSTOPPED on first line for debugging on port ${port}`, 'color: blue', 'color: black');
					} else {
						console.info(`%c[Extension Host] %cdebugger listening on port ${port}`, 'color: blue', 'color: black');
					}
				}
				return c({ expected, actual: port });
			});
		});
	}

	private _tryExtHostHandshake(): TPromise<IMessagePassingProtocol> {

		return new TPromise<IMessagePassingProtocol>((resolve, reject) => {

			// Wait for the extension host to connect to our named pipe
			// and wrap the socket in the message passing protocol
			let handle = setTimeout(() => {
				this._namedPipeServer.close();
				this._namedPipeServer = null;
				reject('timeout');
			}, 60 * 1000);

			this._namedPipeServer.on('connection', socket => {
				clearTimeout(handle);
				this._namedPipeServer.close();
				this._namedPipeServer = null;
				this._extensionHostConnection = socket;
				resolve(new Protocol(this._extensionHostConnection));
			});

		}).then((protocol) => {

			// 1) wait for the incoming `ready` event and send the initialization data.
			// 2) wait for the incoming `initialized` event.
			return new TPromise<IMessagePassingProtocol>((resolve, reject) => {

				let handle = setTimeout(() => {
					reject('timeout');
				}, 60 * 1000);

				const disposable = protocol.onMessage(msg => {

					if (msg === 'ready') {
						// 1) Extension Host is ready to receive messages, initialize it
						this._createExtHostInitData().then(data => protocol.send(JSON.stringify(data)));
						return;
					}

					if (msg === 'initialized') {
						// 2) Extension Host is initialized

						clearTimeout(handle);

						// stop listening for messages here
						disposable.dispose();

						// release this promise
						resolve(protocol);
						return;
					}

					console.error(`received unexpected message during handshake phase from the extension host: `, msg);
				});

			});

		});
	}

	private _createExtHostInitData(): TPromise<IInitData> {
		return TPromise.join<any>([this._telemetryService.getTelemetryInfo(), this._extensionService.getExtensions()]).then(([telemetryInfo, extensionDescriptions]) => {
			const configurationData: IConfigurationInitData = { ...this._configurationService.getConfigurationData(), configurationScopes: {} };
			const r: IInitData = {
				parentPid: process.pid,
				environment: {
					isExtensionDevelopmentDebug: this._isExtensionDevDebug,
					appRoot: this._environmentService.appRoot,
					appSettingsHome: this._environmentService.appSettingsHome,
					disableExtensions: this._environmentService.disableExtensions,
					extensionDevelopmentPath: this._environmentService.extensionDevelopmentPath,
					extensionTestsPath: this._environmentService.extensionTestsPath,
					// globally disable proposed api when built and not insiders developing extensions
					enableProposedApiForAll: !this._environmentService.isBuilt || (!!this._environmentService.extensionDevelopmentPath && product.nameLong.indexOf('Insiders') >= 0),
					enableProposedApiFor: this._environmentService.args['enable-proposed-api'] || []
				},
				workspace: this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? null : <IWorkspaceData>this._contextService.getWorkspace(),
				extensions: extensionDescriptions,
				// Send configurations scopes only in development mode.
				configuration: !this._environmentService.isBuilt || this._environmentService.isExtensionDevelopment ? { ...configurationData, configurationScopes: getScopes() } : configurationData,
				telemetryInfo,
				windowId: this._windowService.getCurrentWindowId(),
				logLevel: this._logService.getLevel(),
				logsPath: this._environmentService.logsPath
			};
			return r;
		});
	}

	private _logExtensionHostMessage(entry: IRemoteConsoleLog) {

		// Send to local console unless we run tests from cli
		if (!this._isExtensionDevTestFromCli) {
			log(entry, 'Extension Host');
		}

		// Log on main side if running tests from cli
		if (this._isExtensionDevTestFromCli) {
			this._windowsService.log(entry.severity, ...parse(entry).args);
		}

		// Broadcast to other windows if we are in development mode
		else if (!this._environmentService.isBuilt || this._isExtensionDevHost) {
			this._broadcastService.broadcast({
				channel: EXTENSION_LOG_BROADCAST_CHANNEL,
				payload: {
					logEntry: entry,
					debugId: this._environmentService.debugExtensionHost.debugId
				}
			});
		}
	}

	private _onExtHostProcessError(err: any): void {
		let errorMessage = toErrorMessage(err);
		if (errorMessage === this._lastExtensionHostError) {
			return; // prevent error spam
		}

		this._lastExtensionHostError = errorMessage;

		this._notificationService.error(nls.localize('extensionHostProcess.error', "Error from the extension host: {0}", errorMessage));
	}

	private _onExtHostProcessExit(code: number, signal: string): void {
		if (this._terminating) {
			// Expected termination path (we asked the process to terminate)
			return;
		}

		// Unexpected termination
		if (!this._isExtensionDevHost) {
			this._onCrashed.fire([code, signal]);
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

	public getInspectPort(): number {
		return this._inspectPort;
	}

	public terminate(): void {
		if (this._terminating) {
			return;
		}
		this._terminating = true;

		dispose(this._toDispose);

		if (!this._messageProtocol) {
			// .start() was not called
			return;
		}

		this._messageProtocol.then((protocol) => {

			// Send the extension host a request to terminate itself
			// (graceful termination)
			protocol.send({
				type: '__$terminate'
			});

			// Give the extension host 60s, after which we will
			// try to kill the process and release any resources
			setTimeout(() => this._cleanResources(), 60 * 1000);

		}, (err) => {

			// Establishing a protocol with the extension host failed, so
			// try to kill the process and release any resources.
			this._cleanResources();
		});
	}

	private _cleanResources(): void {
		if (this._namedPipeServer) {
			this._namedPipeServer.close();
			this._namedPipeServer = null;
		}
		if (this._extensionHostConnection) {
			this._extensionHostConnection.end();
			this._extensionHostConnection = null;
		}
		if (this._extensionHostProcess) {
			this._extensionHostProcess.kill();
			this._extensionHostProcess = null;
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
