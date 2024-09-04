/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import * as objects from '../../../../base/common/objects.js';
import * as platform from '../../../../base/common/platform.js';
import { removeDangerousEnvVariables } from '../../../../base/common/processes.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IMessagePassingProtocol } from '../../../../base/parts/ipc/common/ipc.js';
import { BufferedEmitter } from '../../../../base/parts/ipc/common/ipc.net.js';
import { acquirePort } from '../../../../base/parts/ipc/electron-sandbox/ipc.mp.js';
import * as nls from '../../../../nls.js';
import { IExtensionHostDebugService } from '../../../../platform/debug/common/extensionHostDebug.js';
import { IExtensionHostProcessOptions, IExtensionHostStarter } from '../../../../platform/extensions/common/extensionHostStarter.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService, ILoggerService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INotificationService, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isLoggingOnly } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, WorkbenchState, isUntitledWorkspace } from '../../../../platform/workspace/common/workspace.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-sandbox/environmentService.js';
import { IShellEnvironmentService } from '../../environment/electron-sandbox/shellEnvironmentService.js';
import { MessagePortExtHostConnection, writeExtHostConnection } from '../common/extensionHostEnv.js';
import { IExtensionHostInitData, MessageType, NativeLogMarkers, UIKind, isMessageOfType } from '../common/extensionHostProtocol.js';
import { LocalProcessRunningLocation } from '../common/extensionRunningLocation.js';
import { ExtensionHostExtensions, ExtensionHostStartup, IExtensionHost } from '../common/extensions.js';
import { IHostService } from '../../host/browser/host.js';
import { ILifecycleService, WillShutdownEvent } from '../../lifecycle/common/lifecycle.js';
import { parseExtensionDevOptions } from '../common/extensionDevOptions.js';

export interface ILocalProcessExtensionHostInitData {
	readonly extensions: ExtensionHostExtensions;
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

	public start(opts: IExtensionHostProcessOptions): Promise<{ pid: number | undefined }> {
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

	public pid: number | null = null;
	public readonly remoteAuthority = null;
	public extensions: ExtensionHostExtensions | null = null;

	private readonly _onExit: Emitter<[number, string]> = new Emitter<[number, string]>();
	public readonly onExit: Event<[number, string]> = this._onExit.event;

	private readonly _onDidSetInspectPort = new Emitter<void>();

	private readonly _toDispose = new DisposableStore();

	private readonly _isExtensionDevHost: boolean;
	private readonly _isExtensionDevDebug: boolean;
	private readonly _isExtensionDevDebugBrk: boolean;
	private readonly _isExtensionDevTestFromCli: boolean;

	// State
	private _terminating: boolean;

	// Resources, in order they get acquired/created when .start() is called:
	private _inspectListener: { port: number; host: string } | null;
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
		@ILogService private readonly _logService: ILogService,
		@ILoggerService private readonly _loggerService: ILoggerService,
		@ILabelService private readonly _labelService: ILabelService,
		@IExtensionHostDebugService private readonly _extensionHostDebugService: IExtensionHostDebugService,
		@IHostService private readonly _hostService: IHostService,
		@IProductService private readonly _productService: IProductService,
		@IShellEnvironmentService private readonly _shellEnvironmentService: IShellEnvironmentService,
		@IExtensionHostStarter private readonly _extensionHostStarter: IExtensionHostStarter,
	) {
		const devOpts = parseExtensionDevOptions(this._environmentService);
		this._isExtensionDevHost = devOpts.isExtensionDevHost;
		this._isExtensionDevDebug = devOpts.isExtensionDevDebug;
		this._isExtensionDevDebugBrk = devOpts.isExtensionDevDebugBrk;
		this._isExtensionDevTestFromCli = devOpts.isExtensionDevTestFromCli;

		this._terminating = false;

		this._inspectListener = null;
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

	private async _start(): Promise<IMessagePassingProtocol> {
		const [extensionHostCreationResult, portNumber, processEnv] = await Promise.all([
			this._extensionHostStarter.createExtensionHost(),
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
			responseWindowId: this._nativeHostService.windowId,
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

		const inspectHost = '127.0.0.1';
		if (portNumber !== 0) {
			opts.execArgv = [
				'--nolazy',
				(this._isExtensionDevDebugBrk ? '--inspect-brk=' : '--inspect=') + `${inspectHost}:${portNumber}`
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
		const onStdout = this._handleProcessOutputStream(this._extensionHostProcess.onStdout, this._toDispose);
		const onStderr = this._handleProcessOutputStream(this._extensionHostProcess.onStderr, this._toDispose);
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
		this._toDispose.add(onDebouncedOutput(output => {
			const inspectorUrlMatch = output.data && output.data.match(/ws:\/\/([^\s]+):(\d+)\/[^\s]+/);
			if (inspectorUrlMatch) {
				const [, host, port] = inspectorUrlMatch;
				if (!this._environmentService.isBuilt && !this._isExtensionDevTestFromCli) {
					console.log(`%c[Extension Host] %cdebugger inspector at devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=${inspectorUrlMatch[1]}`, 'color: blue', 'color:');
				}
				if (!this._inspectListener) {
					this._inspectListener = { host, port: Number(port) };
					this._onDidSetInspectPort.fire();
				}
			} else {
				if (!this._isExtensionDevTestFromCli) {
					console.group('Extension Host');
					console.log(output.data, ...output.format);
					console.groupEnd();
				}
			}
		}));

		// Lifecycle

		this._toDispose.add(this._extensionHostProcess.onExit(({ code, signal }) => this._onExtHostProcessExit(code, signal)));

		// Notify debugger that we are ready to attach to the process if we run a development extension
		if (portNumber) {
			if (this._isExtensionDevHost && this._isExtensionDevDebug && this._environmentService.debugExtensionHost.debugId) {
				this._extensionHostDebugService.attachSession(this._environmentService.debugExtensionHost.debugId, portNumber);
			}
			this._inspectListener = { port: portNumber, host: inspectHost };
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
		const protocol = await this._establishProtocol(this._extensionHostProcess, opts);
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

	private _establishProtocol(extensionHostProcess: ExtensionHostProcess, opts: IExtensionHostProcessOptions): Promise<IMessagePassingProtocol> {

		writeExtHostConnection(new MessagePortExtHostConnection(), opts.env);

		// Get ready to acquire the message port from the shared process worker
		const portPromise = acquirePort(undefined /* we trigger the request via service call! */, opts.responseChannel, opts.responseNonce);

		return new Promise<IMessagePassingProtocol>((resolve, reject) => {

			const handle = setTimeout(() => {
				reject('The local extension host took longer than 60s to connect.');
			}, 60 * 1000);

			portPromise.then((port) => {
				this._toDispose.add(toDisposable(() => {
					// Close the message port when the extension host is disposed
					port.close();
				}));
				clearTimeout(handle);

				const onMessage = new BufferedEmitter<VSBuffer>();
				port.onmessage = ((e) => {
					if (e.data) {
						onMessage.fire(VSBuffer.wrap(e.data));
					}
				});
				port.start();

				resolve({
					onMessage: onMessage.event,
					send: message => port.postMessage(message.buffer),
				});
			});

			// Now that the message port listener is installed, start the ext host process
			const sw = StopWatch.create(false);
			extensionHostProcess.start(opts).then(({ pid }) => {
				if (pid) {
					this.pid = pid;
				}
				this._logService.info(`Started local extension host with pid ${pid}.`);
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
		this.extensions = initData.extensions;
		const workspace = this._contextService.getWorkspace();
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
				configuration: workspace.configuration ?? undefined,
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
			extensions: this.extensions.toSnapshot(),
			telemetryInfo: {
				sessionId: this._telemetryService.sessionId,
				machineId: this._telemetryService.machineId,
				sqmId: this._telemetryService.sqmId,
				devDeviceId: this._telemetryService.devDeviceId,
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

	private _handleProcessOutputStream(stream: Event<string>, store: DisposableStore) {
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
		}, undefined, store);

		return event;
	}

	public async enableInspectPort(): Promise<boolean> {
		if (!!this._inspectListener) {
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
		return !!this._inspectListener;
	}

	public getInspectPort(): { port: number; host: string } | undefined {
		return this._inspectListener ?? undefined;
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
