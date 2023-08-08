/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { removeDangerousEnvVariables } from 'vs/base/common/processes';
import { StopWatch } from 'vs/base/common/stopwatch';
import { withNullAsUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { BufferedEmitter } from 'vs/base/parts/ipc/common/ipc.net';
import { acquirePort } from 'vs/base/parts/ipc/electron-sandbox/ipc.mp';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { IExtensionHostProcessOptions, IExtensionHostStarter } from 'vs/platform/extensions/common/extensionHostStarter';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService, ILoggerService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/common/native';
import { INotificationService, NotificationPriority, Severity } from 'vs/platform/notification/common/notification';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { isLoggingOnly } from 'vs/platform/telemetry/common/telemetryUtils';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IWorkspaceContextService, WorkbenchState, isUntitledWorkspace } from 'vs/platform/workspace/common/workspace';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IShellEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/shellEnvironmentService';
import { MessagePortExtHostConnection, writeExtHostConnection } from 'vs/workbench/services/extensions/common/extensionHostEnv';
import { IExtensionHostInitData, MessageType, NativeLogMarkers, UIKind, isMessageOfType } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { LocalProcessRunningLocation } from 'vs/workbench/services/extensions/common/extensionRunningLocation';
import { ExtensionHostExtensions, ExtensionHostStartup, IExtensionHost } from 'vs/workbench/services/extensions/common/extensions';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { ILifecycleService, WillShutdownEvent } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { parseExtensionDevOptions } from '../common/extensionDevOptions';

export interface ILocalProcessExtensionHostInitData {
	readonly allExtensions: IExtensionDescription[];
	readonly myExtensions: ExtensionIdentifier[];
}

export interface ILocalProcessExtensionHostDataProvider {
	getInitData(): Promise<ILocalProcessExtensionHostInitData>;
}

export class ExtensionHostProcess {

	private readonly _id: string;

	public get onStdout(): Event<string> {
		return this._extensionHostStarter.onDynamicStdout(this._id);
	}

	public get onStderr(): Event<string> {
		return this._extensionHostStarter.onDynamicStderr(this._id);
	}

	public get onMessage(): Event<any> {
		return this._extensionHostStarter.onDynamicMessage(this._id);
	}

	public get onExit(): Event<{ code: number; signal: string }> {
		return this._extensionHostStarter.onDynamicExit(this._id);
	}

	constructor(
		id: string,
		private readonly _extensionHostStarter: IExtensionHostStarter,
	) {
		this._id = id;
	}

	public start(opts: IExtensionHostProcessOptions): Promise<void> {
		return this._extensionHostStarter.start(this._id, opts);
	}

	public enableInspectPort(): Promise<boolean> {
		return this._extensionHostStarter.enableInspectPort(this._id);
	}

	public kill(): Promise<void> {
		return this._extensionHostStarter.kill(this._id);
	}
}

export class NativeLocalProcessExtensionHost implements IExtensionHost {

	public readonly remoteAuthority = null;
	public readonly extensions = new ExtensionHostExtensions();

	private readonly _onExit: Emitter<[number, string]> = new Emitter<[number, string]>();
	public readonly onExit: Event<[number, string]> = this._onExit.event;

	private readonly _onDidSetInspectPort = new Emitter<void>();

	protected readonly _toDispose = new DisposableStore();

	private readonly _isExtensionDevHost: boolean;
	private readonly _isExtensionDevDebug: boolean;
	private readonly _isExtensionDevDebugBrk: boolean;
	private readonly _isExtensionDevTestFromCli: boolean;

	// State
	private _terminating: boolean;

	// Resources, in order they get acquired/created when .start() is called:
	private _inspectPort: number | null;
	private _extensionHostProcess: ExtensionHostProcess | null;
	private _messageProtocol: Promise<IMessagePassingProtocol> | null;

	constructor(
		public readonly runningLocation: LocalProcessRunningLocation,
		public readonly startup: ExtensionHostStartup.EagerAutoStart | ExtensionHostStartup.EagerManualStart,
		private readonly _initDataProvider: ILocalProcessExtensionHostDataProvider,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@INotificationService private readonly _notificationService: INotificationService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@INativeWorkbenchEnvironmentService private readonly _environmentService: INativeWorkbenchEnvironmentService,
		@IUserDataProfilesService private readonly _userDataProfilesService: IUserDataProfilesService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService protected readonly _logService: ILogService,
		@ILoggerService protected readonly _loggerService: ILoggerService,
		@ILabelService private readonly _labelService: ILabelService,
		@IExtensionHostDebugService private readonly _extensionHostDebugService: IExtensionHostDebugService,
		@IHostService private readonly _hostService: IHostService,
		@IProductService private readonly _productService: IProductService,
		@IShellEnvironmentService private readonly _shellEnvironmentService: IShellEnvironmentService,
		@IExtensionHostStarter protected readonly _extensionHostStarter: IExtensionHostStarter,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
	) {
		const devOpts = parseExtensionDevOptions(this._environmentService);
		this._isExtensionDevHost = devOpts.isExtensionDevHost;
		this._isExtensionDevDebug = devOpts.isExtensionDevDebug;
		this._isExtensionDevDebugBrk = devOpts.isExtensionDevDebugBrk;
		this._isExtensionDevTestFromCli = devOpts.isExtensionDevTestFromCli;

		this._terminating = false;

		this._inspectPort = null;
		this._extensionHostProcess = null;
		this._messageProtocol = null;

		this._toDispose.add(this._onExit);
		this._toDispose.add(this._lifecycleService.onWillShutdown(e => this._onWillShutdown(e)));
		this._toDispose.add(this._extensionHostDebugService.onClose(event => {
			if (this._isExtensionDevHost && this._environmentService.debugExtensionHost.debugId === event.sessionId) {
				this._nativeHostService.closeWindow();
			}
		}));
		this._toDispose.add(this._extensionHostDebugService.onReload(event => {
			if (this._isExtensionDevHost && this._environmentService.debugExtensionHost.debugId === event.sessionId) {
				this._hostService.reload();
			}
		}));
	}

	public dispose(): void {
		if (this._terminating) {
			return;
		}
		this._terminating = true;

		this._toDispose.dispose();
	}

	public start(): Promise<IMessagePassingProtocol> {
		if (this._terminating) {
			// .terminate() was called
			throw new CancellationError();
		}

		if (!this._messageProtocol) {
			this._messageProtocol = this._start();
		}

		return this._messageProtocol;
	}

	protected async _start(): Promise<IMessagePassingProtocol> {
		const communication = this._toDispose.add(new ExtHostMessagePortCommunication(this._logService));
		return this._startWithCommunication(communication);
	}

	protected async _startWithCommunication<T>(communication: IExtHostCommunication<T>): Promise<IMessagePassingProtocol> {

		const [extensionHostCreationResult, communicationPreparedData, portNumber, processEnv] = await Promise.all([
			this._extensionHostStarter.createExtensionHost(),
			communication.prepare(),
			this._tryFindDebugPort(),
			this._shellEnvironmentService.getShellEnv(),
		]);

		this._extensionHostProcess = new ExtensionHostProcess(extensionHostCreationResult.id, this._extensionHostStarter);

		const env = objects.mixin(processEnv, {
			VSCODE_AMD_ENTRYPOINT: 'vs/workbench/api/node/extensionHostProcess',
			VSCODE_HANDLES_UNCAUGHT_ERRORS: true
		});

		if (this._environmentService.debugExtensionHost.env) {
			objects.mixin(env, this._environmentService.debugExtensionHost.env);
		}

		removeDangerousEnvVariables(env);

		if (this._isExtensionDevHost) {
			// Unset `VSCODE_CODE_CACHE_PATH` when developing extensions because it might
			// be that dependencies, that otherwise would be cached, get modified.
			delete env['VSCODE_CODE_CACHE_PATH'];
		}

		const opts: IExtensionHostProcessOptions = {
			responseWindowId: this._environmentService.window.id,
			responseChannel: 'vscode:startExtensionHostMessagePortResult',
			responseNonce: generateUuid(),
			env,
			// We only detach the extension host on windows. Linux and Mac orphan by default
			// and detach under Linux and Mac create another process group.
			// We detach because we have noticed that when the renderer exits, its child processes
			// (i.e. extension host) are taken down in a brutal fashion by the OS
			detached: !!platform.isWindows,
			execArgv: undefined as string[] | undefined,
			silent: true
		};

		if (portNumber !== 0) {
			opts.execArgv = [
				'--nolazy',
				(this._isExtensionDevDebugBrk ? '--inspect-brk=' : '--inspect=') + portNumber
			];
		} else {
			opts.execArgv = ['--inspect-port=0'];
		}

		if (this._environmentService.extensionTestsLocationURI) {
			opts.execArgv.unshift('--expose-gc');
		}

		if (this._environmentService.args['prof-v8-extensions']) {
			opts.execArgv.unshift('--prof');
		}

		// Refs https://github.com/microsoft/vscode/issues/189805
		opts.execArgv.unshift('--dns-result-order=ipv4first');

		// Catch all output coming from the extension host process
		type Output = { data: string; format: string[] };
		const onStdout = this._handleProcessOutputStream(this._extensionHostProcess.onStdout);
		const onStderr = this._handleProcessOutputStream(this._extensionHostProcess.onStderr);
		const onOutput = Event.any(
			Event.map(onStdout.event, o => ({ data: `%c${o}`, format: [''] })),
			Event.map(onStderr.event, o => ({ data: `%c${o}`, format: ['color: red'] }))
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
				if (!this._environmentService.isBuilt && !this._isExtensionDevTestFromCli) {
					console.log(`%c[Extension Host] %cdebugger inspector at devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=${inspectorUrlMatch[1]}`, 'color: blue', 'color:');
				}
				if (!this._inspectPort) {
					this._inspectPort = Number(inspectorUrlMatch[2]);
					this._onDidSetInspectPort.fire();
				}
			} else {
				if (!this._isExtensionDevTestFromCli) {
					console.group('Extension Host');
					console.log(output.data, ...output.format);
					console.groupEnd();
				}
			}
		});

		// Lifecycle

		this._extensionHostProcess.onExit(({ code, signal }) => this._onExtHostProcessExit(code, signal));

		// Notify debugger that we are ready to attach to the process if we run a development extension
		if (portNumber) {
			if (this._isExtensionDevHost && portNumber && this._isExtensionDevDebug && this._environmentService.debugExtensionHost.debugId) {
				this._extensionHostDebugService.attachSession(this._environmentService.debugExtensionHost.debugId, portNumber);
			}
			this._inspectPort = portNumber;
			this._onDidSetInspectPort.fire();
		}

		// Help in case we fail to start it
		let startupTimeoutHandle: any;
		if (!this._environmentService.isBuilt && !this._environmentService.remoteAuthority || this._isExtensionDevHost) {
			startupTimeoutHandle = setTimeout(() => {
				this._logService.error(`[LocalProcessExtensionHost]: Extension host did not start in 10 seconds (debugBrk: ${this._isExtensionDevDebugBrk})`);

				const msg = this._isExtensionDevDebugBrk
					? nls.localize('extensionHost.startupFailDebug', "Extension host did not start in 10 seconds, it might be stopped on the first line and needs a debugger to continue.")
					: nls.localize('extensionHost.startupFail', "Extension host did not start in 10 seconds, that might be a problem.");

				this._notificationService.prompt(Severity.Warning, msg,
					[{
						label: nls.localize('reloadWindow', "Reload Window"),
						run: () => this._hostService.reload()
					}],
					{
						sticky: true,
						priority: NotificationPriority.URGENT
					}
				);
			}, 10000);
		}

		// Initialize extension host process with hand shakes
		const protocol = await communication.establishProtocol(communicationPreparedData, this._extensionHostProcess, opts);
		await this._performHandshake(protocol);
		clearTimeout(startupTimeoutHandle);
		return protocol;
	}

	/**
	 * Find a free port if extension host debugging is enabled.
	 */
	private async _tryFindDebugPort(): Promise<number> {

		if (typeof this._environmentService.debugExtensionHost.port !== 'number') {
			return 0;
		}

		const expected = this._environmentService.debugExtensionHost.port;
		const port = await this._nativeHostService.findFreePort(expected, 10 /* try 10 ports */, 5000 /* try up to 5 seconds */, 2048 /* skip 2048 ports between attempts */);

		if (!this._isExtensionDevTestFromCli) {
			if (!port) {
				console.warn('%c[Extension Host] %cCould not find a free port for debugging', 'color: blue', 'color:');
			} else {
				if (port !== expected) {
					console.warn(`%c[Extension Host] %cProvided debugging port ${expected} is not free, using ${port} instead.`, 'color: blue', 'color:');
				}
				if (this._isExtensionDevDebugBrk) {
					console.warn(`%c[Extension Host] %cSTOPPED on first line for debugging on port ${port}`, 'color: blue', 'color:');
				} else {
					console.info(`%c[Extension Host] %cdebugger listening on port ${port}`, 'color: blue', 'color:');
				}
			}
		}

		return port || 0;
	}

	private _performHandshake(protocol: IMessagePassingProtocol): Promise<void> {
		// 1) wait for the incoming `ready` event and send the initialization data.
		// 2) wait for the incoming `initialized` event.
		return new Promise<void>((resolve, reject) => {

			let timeoutHandle: any;
			const installTimeoutCheck = () => {
				timeoutHandle = setTimeout(() => {
					reject('The local extension host took longer than 60s to send its ready message.');
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
					resolve();
					return;
				}

				console.error(`received unexpected message during handshake phase from the extension host: `, msg);
			});

		});
	}

	private async _createExtHostInitData(): Promise<IExtensionHostInitData> {
		const initData = await this._initDataProvider.getInitData();
		const workspace = this._contextService.getWorkspace();
		const deltaExtensions = this.extensions.set(initData.allExtensions, initData.myExtensions);
		return {
			commit: this._productService.commit,
			version: this._productService.version,
			quality: this._productService.quality,
			parentPid: 0,
			environment: {
				isExtensionDevelopmentDebug: this._isExtensionDevDebug,
				appRoot: this._environmentService.appRoot ? URI.file(this._environmentService.appRoot) : undefined,
				appName: this._productService.nameLong,
				appHost: this._productService.embedderIdentifier || 'desktop',
				appUriScheme: this._productService.urlProtocol,
				extensionTelemetryLogResource: this._environmentService.extHostTelemetryLogFile,
				isExtensionTelemetryLoggingOnly: isLoggingOnly(this._productService, this._environmentService),
				appLanguage: platform.language,
				extensionDevelopmentLocationURI: this._environmentService.extensionDevelopmentLocationURI,
				extensionTestsLocationURI: this._environmentService.extensionTestsLocationURI,
				globalStorageHome: this._userDataProfilesService.defaultProfile.globalStorageHome,
				workspaceStorageHome: this._environmentService.workspaceStorageHome,
				extensionLogLevel: this._environmentService.extensionLogLevel
			},
			workspace: this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? undefined : {
				configuration: withNullAsUndefined(workspace.configuration),
				id: workspace.id,
				name: this._labelService.getWorkspaceLabel(workspace),
				isUntitled: workspace.configuration ? isUntitledWorkspace(workspace.configuration, this._environmentService) : false,
				transient: workspace.transient
			},
			remote: {
				authority: this._environmentService.remoteAuthority,
				connectionData: null,
				isRemote: false
			},
			consoleForward: {
				includeStack: !this._isExtensionDevTestFromCli && (this._isExtensionDevHost || !this._environmentService.isBuilt || this._productService.quality !== 'stable' || this._environmentService.verbose),
				logNative: !this._isExtensionDevTestFromCli && this._isExtensionDevHost
			},
			allExtensions: deltaExtensions.toAdd,
			activationEvents: deltaExtensions.addActivationEvents,
			myExtensions: deltaExtensions.myToAdd,
			telemetryInfo: {
				sessionId: this._telemetryService.sessionId,
				machineId: this._telemetryService.machineId,
				firstSessionDate: this._telemetryService.firstSessionDate,
				msftInternal: this._telemetryService.msftInternal
			},
			logLevel: this._logService.getLevel(),
			loggers: [...this._loggerService.getRegisteredLoggers()],
			logsLocation: this._environmentService.extHostLogsPath,
			autoStart: (this.startup === ExtensionHostStartup.EagerAutoStart),
			uiKind: UIKind.Desktop
		};
	}

	private _onExtHostProcessExit(code: number, signal: string): void {
		if (this._terminating) {
			// Expected termination path (we asked the process to terminate)
			return;
		}

		this._onExit.fire([code, signal]);
	}

	private _handleProcessOutputStream(stream: Event<string>) {
		let last = '';
		let isOmitting = false;
		const event = new Emitter<string>();
		stream((chunk) => {
			// not a fancy approach, but this is the same approach used by the split2
			// module which is well-optimized (https://github.com/mcollina/split2)
			last += chunk;
			const lines = last.split(/\r?\n/g);
			last = lines.pop()!;

			// protected against an extension spamming and leaking memory if no new line is written.
			if (last.length > 10_000) {
				lines.push(last);
				last = '';
			}

			for (const line of lines) {
				if (isOmitting) {
					if (line === NativeLogMarkers.End) {
						isOmitting = false;
					}
				} else if (line === NativeLogMarkers.Start) {
					isOmitting = true;
				} else if (line.length) {
					event.fire(line + '\n');
				}
			}
		});

		return event;
	}

	public async enableInspectPort(): Promise<boolean> {
		if (typeof this._inspectPort === 'number') {
			return true;
		}

		if (!this._extensionHostProcess) {
			return false;
		}

		const result = await this._extensionHostProcess.enableInspectPort();
		if (!result) {
			return false;
		}

		await Promise.race([Event.toPromise(this._onDidSetInspectPort.event), timeout(1000)]);
		return typeof this._inspectPort === 'number';
	}

	public getInspectPort(): number | undefined {
		return withNullAsUndefined(this._inspectPort);
	}

	private _onWillShutdown(event: WillShutdownEvent): void {
		// If the extension development host was started without debugger attached we need
		// to communicate this back to the main side to terminate the debug session
		if (this._isExtensionDevHost && !this._isExtensionDevTestFromCli && !this._isExtensionDevDebug && this._environmentService.debugExtensionHost.debugId) {
			this._extensionHostDebugService.terminateSession(this._environmentService.debugExtensionHost.debugId);
			event.join(timeout(100 /* wait a bit for IPC to get delivered */), { id: 'join.extensionDevelopment', label: nls.localize('join.extensionDevelopment', "Terminating extension debug session") });
		}
	}
}

export interface IExtHostCommunication<T> {
	prepare(): Promise<T>;
	establishProtocol(prepared: T, extensionHostProcess: ExtensionHostProcess, opts: IExtensionHostProcessOptions): Promise<IMessagePassingProtocol>;
}

export class ExtHostMessagePortCommunication extends Disposable implements IExtHostCommunication<void> {

	constructor(
		@ILogService private readonly _logService: ILogService
	) {
		super();
	}

	async prepare(): Promise<void> {
	}

	establishProtocol(prepared: void, extensionHostProcess: ExtensionHostProcess, opts: IExtensionHostProcessOptions): Promise<IMessagePassingProtocol> {

		writeExtHostConnection(new MessagePortExtHostConnection(), opts.env);

		// Get ready to acquire the message port from the shared process worker
		const portPromise = acquirePort(undefined /* we trigger the request via service call! */, opts.responseChannel, opts.responseNonce);

		return new Promise<IMessagePassingProtocol>((resolve, reject) => {

			const handle = setTimeout(() => {
				reject('The local extension host took longer than 60s to connect.');
			}, 60 * 1000);

			portPromise.then((port) => {
				this._register(toDisposable(() => {
					// Close the message port when the extension host is disposed
					port.close();
				}));
				clearTimeout(handle);

				const onMessage = new BufferedEmitter<VSBuffer>();
				port.onmessage = ((e) => onMessage.fire(VSBuffer.wrap(e.data)));
				port.start();

				resolve({
					onMessage: onMessage.event,
					send: message => port.postMessage(message.buffer),
				});
			});

			// Now that the message port listener is installed, start the ext host process
			const sw = StopWatch.create(false);
			extensionHostProcess.start(opts).then(() => {
				const duration = sw.elapsed();
				if (platform.isCI) {
					this._logService.info(`IExtensionHostStarter.start() took ${duration} ms.`);
				}
			}, (err) => {
				// Starting the ext host process resulted in an error
				reject(err);
			});
		});
	}
}
