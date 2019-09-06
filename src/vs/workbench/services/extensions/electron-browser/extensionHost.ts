/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ChildProcess, fork } from 'child_process';
import { Server, Socket, createServer } from 'net';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { timeout } from 'vs/base/common/async';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter, Event } from 'vs/base/common/event';
import { toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import pkg from 'vs/platform/product/node/package';
import { URI } from 'vs/base/common/uri';
import { IRemoteConsoleLog, log, parse } from 'vs/base/common/console';
import { findFreePort, randomPort } from 'vs/base/node/ports';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { PersistentProtocol } from 'vs/base/parts/ipc/common/ipc.net';
import { generateRandomPipeName, NodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILifecycleService, WillShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/node/product';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IInitData } from 'vs/workbench/api/common/extHost.protocol';
import { MessageType, createMessageOfType, isMessageOfType } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { withNullAsUndefined } from 'vs/base/common/types';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { parseExtensionDevOptions } from '../common/extensionDevOptions';
import { VSBuffer } from 'vs/base/common/buffer';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { IExtensionHostStarter } from 'vs/workbench/services/extensions/common/extensions';
import { isEqualOrParent } from 'vs/base/common/resources';

export class ExtensionHostProcessWorker implements IExtensionHostStarter {

	private readonly _onExit: Emitter<[number, string]> = new Emitter<[number, string]>();
	public readonly onExit: Event<[number, string]> = this._onExit.event;

	private readonly _toDispose = new DisposableStore();

	private readonly _isExtensionDevHost: boolean;
	private readonly _isExtensionDevDebug: boolean;
	private readonly _isExtensionDevDebugBrk: boolean;
	private readonly _isExtensionDevTestFromCli: boolean;

	// State
	private _lastExtensionHostError: string | null;
	private _terminating: boolean;

	// Resources, in order they get acquired/created when .start() is called:
	private _namedPipeServer: Server | null;
	private _inspectPort: number | null;
	private _extensionHostProcess: ChildProcess | null;
	private _extensionHostConnection: Socket | null;
	private _messageProtocol: Promise<PersistentProtocol> | null;

	constructor(
		private readonly _autoStart: boolean,
		private readonly _extensions: Promise<IExtensionDescription[]>,
		private readonly _extensionHostLogsLocation: URI,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IWindowsService private readonly _windowsService: IWindowsService,
		@IWindowService private readonly _windowService: IWindowService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@ILabelService private readonly _labelService: ILabelService,
		@IExtensionHostDebugService private readonly _extensionHostDebugService: IExtensionHostDebugService
	) {
		const devOpts = parseExtensionDevOptions(this._environmentService);
		this._isExtensionDevHost = devOpts.isExtensionDevHost;
		this._isExtensionDevDebug = devOpts.isExtensionDevDebug;
		this._isExtensionDevDebugBrk = devOpts.isExtensionDevDebugBrk;
		this._isExtensionDevTestFromCli = devOpts.isExtensionDevTestFromCli;

		this._lastExtensionHostError = null;
		this._terminating = false;

		this._namedPipeServer = null;
		this._inspectPort = null;
		this._extensionHostProcess = null;
		this._extensionHostConnection = null;
		this._messageProtocol = null;

		this._toDispose.add(this._onExit);
		this._toDispose.add(this._lifecycleService.onWillShutdown(e => this._onWillShutdown(e)));
		this._toDispose.add(this._lifecycleService.onShutdown(reason => this.terminate()));
		this._toDispose.add(this._extensionHostDebugService.onClose(event => {
			if (this._isExtensionDevHost && this._environmentService.debugExtensionHost.debugId === event.sessionId) {
				this._windowService.closeWindow();
			}
		}));
		this._toDispose.add(this._extensionHostDebugService.onReload(event => {
			if (this._isExtensionDevHost && this._environmentService.debugExtensionHost.debugId === event.sessionId) {
				this._windowService.reloadWindow();
			}
		}));

		const globalExitListener = () => this.terminate();
		process.once('exit', globalExitListener);
		this._toDispose.add(toDisposable(() => {
			process.removeListener('exit', globalExitListener);
		}));
	}

	public dispose(): void {
		this.terminate();
	}

	public start(): Promise<IMessagePassingProtocol> | null {
		if (this._terminating) {
			// .terminate() was called
			return null;
		}

		if (!this._messageProtocol) {
			this._messageProtocol = Promise.all([
				this._tryListenOnPipe(),
				!this._environmentService.args['disable-inspect'] ? this._tryFindDebugPort() : Promise.resolve(null)
			]).then(data => {
				const pipeName = data[0];
				const portData = data[1];

				const opts = {
					env: objects.mixin(objects.deepClone(process.env), {
						AMD_ENTRYPOINT: 'vs/workbench/services/extensions/node/extensionHostProcess',
						PIPE_LOGGING: 'true',
						VERBOSE_LOGGING: true,
						VSCODE_IPC_HOOK_EXTHOST: pipeName,
						VSCODE_HANDLES_UNCAUGHT_ERRORS: true,
						VSCODE_LOG_STACK: !this._isExtensionDevTestFromCli && (this._isExtensionDevHost || !this._environmentService.isBuilt || product.quality !== 'stable' || this._environmentService.verbose),
						VSCODE_LOG_LEVEL: this._environmentService.verbose ? 'trace' : this._environmentService.log
					}),
					// We only detach the extension host on windows. Linux and Mac orphan by default
					// and detach under Linux and Mac create another process group.
					// We detach because we have noticed that when the renderer exits, its child processes
					// (i.e. extension host) are taken down in a brutal fashion by the OS
					detached: !!platform.isWindows,
					execArgv: undefined as string[] | undefined,
					silent: true
				};

				if (portData && portData.actual) {
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

				const crashReporterOptions = undefined; // TODO@electron pass this in as options to the extension host after verifying this actually works
				if (crashReporterOptions) {
					opts.env.CRASH_REPORTER_START_OPTIONS = JSON.stringify(crashReporterOptions);
				}

				// Run Extension Host as fork of current process
				this._extensionHostProcess = fork(getPathFromAmdModule(require, 'bootstrap-fork'), ['--type=extensionHost'], opts);

				// Catch all output coming from the extension host process
				type Output = { data: string, format: string[] };
				this._extensionHostProcess.stdout.setEncoding('utf8');
				this._extensionHostProcess.stderr.setEncoding('utf8');
				const onStdout = Event.fromNodeEventEmitter<string>(this._extensionHostProcess.stdout, 'data');
				const onStderr = Event.fromNodeEventEmitter<string>(this._extensionHostProcess.stderr, 'data');
				const onOutput = Event.any(
					Event.map(onStdout, o => ({ data: `%c${o}`, format: [''] })),
					Event.map(onStderr, o => ({ data: `%c${o}`, format: ['color: red'] }))
				);

				// Debounce all output, so we can render it in the Chrome console as a group
				const onDebouncedOutput = Event.debounce<Output>(onOutput, (r, o) => {
					return r
						? { data: r.data + o.data, format: [...r.format, ...o.format] }
						: { data: o.data, format: o.format };
				}, 100);

				// Print out extension host output
				onDebouncedOutput(output => {
					const inspectorUrlMatch = output.data && output.data.match(/ws:\/\/([^\s]+:(\d+)\/[^\s]+)/);
					if (inspectorUrlMatch) {
						if (!this._environmentService.isBuilt) {
							console.log(`%c[Extension Host] %cdebugger inspector at chrome-devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=${inspectorUrlMatch[1]}`, 'color: blue', 'color:');
						}
						if (!this._inspectPort) {
							this._inspectPort = Number(inspectorUrlMatch[2]);
						}
					} else {
						console.group('Extension Host');
						console.log(output.data, ...output.format);
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
				if (portData) {
					if (this._isExtensionDevHost && portData.actual && this._isExtensionDevDebug && this._environmentService.debugExtensionHost.debugId) {
						this._extensionHostDebugService.attachSession(this._environmentService.debugExtensionHost.debugId, portData.actual);
					}
					this._inspectPort = portData.actual;
				}

				// Help in case we fail to start it
				let startupTimeoutHandle: any;
				if (!this._environmentService.isBuilt && !this._environmentService.configuration.remoteAuthority || this._isExtensionDevHost) {
					startupTimeoutHandle = setTimeout(() => {
						const msg = this._isExtensionDevDebugBrk
							? nls.localize('extensionHost.startupFailDebug', "Extension host did not start in 10 seconds, it might be stopped on the first line and needs a debugger to continue.")
							: nls.localize('extensionHost.startupFail', "Extension host did not start in 10 seconds, that might be a problem.");

						this._notificationService.prompt(Severity.Warning, msg,
							[{
								label: nls.localize('reloadWindow', "Reload Window"),
								run: () => this._windowService.reloadWindow()
							}],
							{ sticky: true }
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
	private _tryListenOnPipe(): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const pipeName = generateRandomPipeName();

			this._namedPipeServer = createServer();
			this._namedPipeServer.on('error', reject);
			this._namedPipeServer.listen(pipeName, () => {
				if (this._namedPipeServer) {
					this._namedPipeServer.removeListener('error', reject);
				}
				resolve(pipeName);
			});
		});
	}

	/**
	 * Find a free port if extension host debugging is enabled.
	 */
	private _tryFindDebugPort(): Promise<{ expected: number; actual: number }> {
		let expected: number;
		let startPort = randomPort();
		if (typeof this._environmentService.debugExtensionHost.port === 'number') {
			startPort = expected = this._environmentService.debugExtensionHost.port;
		}
		return new Promise(resolve => {
			return findFreePort(startPort, 10 /* try 10 ports */, 5000 /* try up to 5 seconds */).then(port => {
				if (!port) {
					console.warn('%c[Extension Host] %cCould not find a free port for debugging', 'color: blue', 'color:');
				} else {
					if (expected && port !== expected) {
						console.warn(`%c[Extension Host] %cProvided debugging port ${expected} is not free, using ${port} instead.`, 'color: blue', 'color:');
					}
					if (this._isExtensionDevDebugBrk) {
						console.warn(`%c[Extension Host] %cSTOPPED on first line for debugging on port ${port}`, 'color: blue', 'color:');
					} else {
						console.info(`%c[Extension Host] %cdebugger listening on port ${port}`, 'color: blue', 'color:');
					}
				}
				return resolve({ expected, actual: port });
			});
		});
	}

	private _tryExtHostHandshake(): Promise<PersistentProtocol> {

		return new Promise<PersistentProtocol>((resolve, reject) => {

			// Wait for the extension host to connect to our named pipe
			// and wrap the socket in the message passing protocol
			let handle = setTimeout(() => {
				if (this._namedPipeServer) {
					this._namedPipeServer.close();
					this._namedPipeServer = null;
				}
				reject('timeout');
			}, 60 * 1000);

			this._namedPipeServer!.on('connection', socket => {
				clearTimeout(handle);
				if (this._namedPipeServer) {
					this._namedPipeServer.close();
					this._namedPipeServer = null;
				}
				this._extensionHostConnection = socket;

				// using a buffered message protocol here because between now
				// and the first time a `then` executes some messages might be lost
				// unless we immediately register a listener for `onMessage`.
				resolve(new PersistentProtocol(new NodeSocket(this._extensionHostConnection)));
			});

		}).then((protocol) => {

			// 1) wait for the incoming `ready` event and send the initialization data.
			// 2) wait for the incoming `initialized` event.
			return new Promise<PersistentProtocol>((resolve, reject) => {

				let timeoutHandle: NodeJS.Timer;
				const installTimeoutCheck = () => {
					timeoutHandle = setTimeout(() => {
						reject('timeout');
					}, 60 * 1000);
				};
				const uninstallTimeoutCheck = () => {
					clearTimeout(timeoutHandle);
				};

				// Wait 60s for the ready message
				installTimeoutCheck();

				const disposable = protocol.onMessage(msg => {

					if (isMessageOfType(msg, MessageType.Ready)) {
						// 1) Extension Host is ready to receive messages, initialize it
						uninstallTimeoutCheck();

						this._createExtHostInitData().then(data => {

							// Wait 60s for the initialized message
							installTimeoutCheck();

							protocol.send(VSBuffer.fromString(JSON.stringify(data)));
						});
						return;
					}

					if (isMessageOfType(msg, MessageType.Initialized)) {
						// 2) Extension Host is initialized
						uninstallTimeoutCheck();

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

	private _createExtHostInitData(): Promise<IInitData> {
		return Promise.all([this._telemetryService.getTelemetryInfo(), this._extensions])
			.then(([telemetryInfo, extensionDescriptions]) => {
				const workspace = this._contextService.getWorkspace();
				const r: IInitData = {
					commit: product.commit,
					version: pkg.version,
					parentPid: process.pid,
					environment: {
						isExtensionDevelopmentDebug: this._isExtensionDevDebug,
						appRoot: this._environmentService.appRoot ? URI.file(this._environmentService.appRoot) : undefined,
						appSettingsHome: this._environmentService.appSettingsHome ? this._environmentService.appSettingsHome : undefined,
						appName: product.nameLong,
						appUriScheme: product.urlProtocol,
						appLanguage: platform.language,
						extensionDevelopmentLocationURI: this._environmentService.extensionDevelopmentLocationURI,
						extensionTestsLocationURI: this._environmentService.extensionTestsLocationURI,
						globalStorageHome: URI.file(this._environmentService.globalStorageHome),
						userHome: URI.file(this._environmentService.userHome),
						webviewResourceRoot: this._environmentService.webviewResourceRoot,
						webviewCspSource: this._environmentService.webviewCspSource,
					},
					workspace: this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? undefined : {
						configuration: withNullAsUndefined(workspace.configuration),
						id: workspace.id,
						name: this._labelService.getWorkspaceLabel(workspace),
						isUntitled: workspace.configuration ? isEqualOrParent(workspace.configuration, this._environmentService.untitledWorkspacesHome) : false
					},
					remote: {
						authority: this._environmentService.configuration.remoteAuthority,
						isRemote: false
					},
					resolvedExtensions: [],
					hostExtensions: [],
					extensions: extensionDescriptions,
					telemetryInfo,
					logLevel: this._logService.getLevel(),
					logsLocation: this._extensionHostLogsLocation,
					autoStart: this._autoStart
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
			this._windowsService.log(entry.severity, parse(entry).args);
		}

		// Broadcast to other windows if we are in development mode
		else if (this._environmentService.debugExtensionHost.debugId && (!this._environmentService.isBuilt || this._isExtensionDevHost)) {
			this._extensionHostDebugService.logToSession(this._environmentService.debugExtensionHost.debugId, entry);
		}
	}

	private _onExtHostProcessError(err: any): void {
		let errorMessage = toErrorMessage(err);
		if (errorMessage === this._lastExtensionHostError) {
			return; // prevent error spam
		}

		this._lastExtensionHostError = errorMessage;

		this._notificationService.error(nls.localize('extensionHost.error', "Error from the extension host: {0}", errorMessage));
	}

	private _onExtHostProcessExit(code: number, signal: string): void {
		if (this._terminating) {
			// Expected termination path (we asked the process to terminate)
			return;
		}

		this._onExit.fire([code, signal]);
	}

	public getInspectPort(): number | undefined {
		return withNullAsUndefined(this._inspectPort);
	}

	public terminate(): void {
		if (this._terminating) {
			return;
		}
		this._terminating = true;

		this._toDispose.dispose();

		if (!this._messageProtocol) {
			// .start() was not called
			return;
		}

		this._messageProtocol.then((protocol) => {

			// Send the extension host a request to terminate itself
			// (graceful termination)
			protocol.send(createMessageOfType(MessageType.Terminate));

			protocol.dispose();

			// Give the extension host 10s, after which we will
			// try to kill the process and release any resources
			setTimeout(() => this._cleanResources(), 10 * 1000);

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

	private _onWillShutdown(event: WillShutdownEvent): void {

		// If the extension development host was started without debugger attached we need
		// to communicate this back to the main side to terminate the debug session
		if (this._isExtensionDevHost && !this._isExtensionDevTestFromCli && !this._isExtensionDevDebug && this._environmentService.debugExtensionHost.debugId) {
			this._extensionHostDebugService.terminateSession(this._environmentService.debugExtensionHost.debugId);
			event.join(timeout(100 /* wait a bit for IPC to get delivered */));
		}
	}
}
