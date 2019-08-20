/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, ipcMain as ipc, systemPreferences, shell, Event, contentTracing, protocol, powerMonitor } from 'electron';
import { IProcessEnvironment, isWindows, isMacintosh } from 'vs/base/common/platform';
import { WindowsManager } from 'vs/code/electron-main/windows';
import { IWindowsService, OpenContext, ActiveWindowManager, IURIToOpen } from 'vs/platform/windows/common/windows';
import { WindowsChannel } from 'vs/platform/windows/common/windowsIpc';
import { WindowsService } from 'vs/platform/windows/electron-main/windowsService';
import { ILifecycleService, LifecycleMainPhase } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { getShellEnvironment } from 'vs/code/node/shellEnv';
import { IUpdateService } from 'vs/platform/update/common/update';
import { UpdateChannel } from 'vs/platform/update/node/updateIpc';
import { Server as ElectronIPCServer } from 'vs/base/parts/ipc/electron-main/ipc.electron-main';
import { Client } from 'vs/base/parts/ipc/common/ipc.net';
import { Server, connect } from 'vs/base/parts/ipc/node/ipc.net';
import { SharedProcess } from 'vs/code/electron-main/sharedProcess';
import { LaunchService, LaunchChannel, ILaunchService } from 'vs/platform/launch/electron-main/launchService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateService } from 'vs/platform/state/common/state';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IURLService } from 'vs/platform/url/common/url';
import { URLHandlerChannelClient, URLServiceChannel } from 'vs/platform/url/node/urlIpc';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService, combinedAppender, LogAppender } from 'vs/platform/telemetry/common/telemetryUtils';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/node/telemetryIpc';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';
import { getDelayedChannel, StaticRouter } from 'vs/base/parts/ipc/common/ipc';
import product from 'vs/platform/product/node/product';
import pkg from 'vs/platform/product/node/package';
import { ProxyAuthHandler } from 'vs/code/electron-main/auth';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWindowsMainService, ICodeWindow } from 'vs/platform/windows/electron-main/windows';
import { IHistoryMainService } from 'vs/platform/history/common/history';
import { URI } from 'vs/base/common/uri';
import { WorkspacesChannel } from 'vs/platform/workspaces/node/workspacesIpc';
import { IWorkspacesMainService, hasWorkspaceFileExtension } from 'vs/platform/workspaces/common/workspaces';
import { getMachineId } from 'vs/base/node/id';
import { Win32UpdateService } from 'vs/platform/update/electron-main/updateService.win32';
import { LinuxUpdateService } from 'vs/platform/update/electron-main/updateService.linux';
import { DarwinUpdateService } from 'vs/platform/update/electron-main/updateService.darwin';
import { IIssueService } from 'vs/platform/issue/node/issue';
import { IssueChannel } from 'vs/platform/issue/node/issueIpc';
import { IssueService } from 'vs/platform/issue/electron-main/issueService';
import { LogLevelSetterChannel } from 'vs/platform/log/common/logIpc';
import { setUnexpectedErrorHandler, onUnexpectedError } from 'vs/base/common/errors';
import { ElectronURLListener } from 'vs/platform/url/electron-main/electronUrlListener';
import { serve as serveDriver } from 'vs/platform/driver/electron-main/driver';
import { IMenubarService } from 'vs/platform/menubar/node/menubar';
import { MenubarService } from 'vs/platform/menubar/electron-main/menubarService';
import { MenubarChannel } from 'vs/platform/menubar/node/menubarIpc';
import { hasArgs } from 'vs/platform/environment/node/argv';
import { RunOnceScheduler } from 'vs/base/common/async';
import { registerContextMenuListener } from 'vs/base/parts/contextmenu/electron-main/contextmenu';
import { homedir } from 'os';
import { join, sep } from 'vs/base/common/path';
import { localize } from 'vs/nls';
import { Schemas } from 'vs/base/common/network';
import { SnapUpdateService } from 'vs/platform/update/electron-main/updateService.snap';
import { IStorageMainService, StorageMainService } from 'vs/platform/storage/node/storageMainService';
import { GlobalStorageDatabaseChannel } from 'vs/platform/storage/node/storageIpc';
import { startsWith } from 'vs/base/common/strings';
import { BackupMainService } from 'vs/platform/backup/electron-main/backupMainService';
import { IBackupMainService } from 'vs/platform/backup/common/backup';
import { HistoryMainService } from 'vs/platform/history/electron-main/historyMainService';
import { URLService } from 'vs/platform/url/common/urlService';
import { WorkspacesMainService } from 'vs/platform/workspaces/electron-main/workspacesMainService';
import { statSync } from 'fs';
import { DiagnosticsService } from 'vs/platform/diagnostics/node/diagnosticsIpc';
import { IDiagnosticsService } from 'vs/platform/diagnostics/node/diagnosticsService';
import { FileService } from 'vs/platform/files/common/fileService';
import { IFileService } from 'vs/platform/files/common/files';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { ExtensionHostDebugBroadcastChannel } from 'vs/platform/debug/common/extensionHostDebugIpc';

export class CodeApplication extends Disposable {

	private static readonly MACHINE_ID_KEY = 'telemetry.machineId';
	private static readonly TRUE_MACHINE_ID_KEY = 'telemetry.trueMachineId';

	private windowsMainService: IWindowsMainService | undefined;

	constructor(
		private readonly mainIpcServer: Server,
		private readonly userEnv: IProcessEnvironment,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStateService private readonly stateService: IStateService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// We handle uncaught exceptions here to prevent electron from opening a dialog to the user
		setUnexpectedErrorHandler(err => this.onUnexpectedError(err));
		process.on('uncaughtException', err => this.onUnexpectedError(err));
		process.on('unhandledRejection', (reason: unknown) => onUnexpectedError(reason));

		// Dispose on shutdown
		this.lifecycleService.onWillShutdown(() => this.dispose());

		// Contextmenu via IPC support
		registerContextMenuListener();

		app.on('accessibility-support-changed', (event: Event, accessibilitySupportEnabled: boolean) => {
			if (this.windowsMainService) {
				this.windowsMainService.sendToAll('vscode:accessibilitySupportChanged', accessibilitySupportEnabled);
			}
		});

		app.on('activate', (event: Event, hasVisibleWindows: boolean) => {
			this.logService.trace('App#activate');

			// Mac only event: open new window when we get activated
			if (!hasVisibleWindows && this.windowsMainService) {
				this.windowsMainService.openNewWindow(OpenContext.DOCK);
			}
		});

		// Security related measures (https://electronjs.org/docs/tutorial/security)
		//
		// !!! DO NOT CHANGE without consulting the documentation !!!
		//
		// app.on('remote-get-guest-web-contents', event => event.preventDefault()); // TODO@Ben TODO@Matt revisit this need for <webview>
		app.on('remote-require', (event, sender, module) => {
			this.logService.trace('App#on(remote-require): prevented');

			event.preventDefault();
		});
		app.on('remote-get-global', (event, sender, module) => {
			this.logService.trace(`App#on(remote-get-global): prevented on ${module}`);

			event.preventDefault();
		});
		app.on('remote-get-builtin', (event, sender, module) => {
			this.logService.trace(`App#on(remote-get-builtin): prevented on ${module}`);

			if (module !== 'clipboard') {
				event.preventDefault();
			}
		});
		app.on('remote-get-current-window', event => {
			this.logService.trace(`App#on(remote-get-current-window): prevented`);

			event.preventDefault();
		});
		app.on('remote-get-current-web-contents', event => {
			if (this.environmentService.args.driver) {
				return; // the driver needs access to web contents
			}

			this.logService.trace(`App#on(remote-get-current-web-contents): prevented`);

			event.preventDefault();
		});
		app.on('web-contents-created', (_event: Electron.Event, contents) => {
			contents.on('will-attach-webview', (event: Electron.Event, webPreferences, params) => {

				const isValidWebviewSource = (source: string): boolean => {
					if (!source) {
						return false;
					}

					if (source === 'data:text/html;charset=utf-8,%3C%21DOCTYPE%20html%3E%0D%0A%3Chtml%20lang%3D%22en%22%20style%3D%22width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3Chead%3E%0D%0A%09%3Ctitle%3EVirtual%20Document%3C%2Ftitle%3E%0D%0A%3C%2Fhead%3E%0D%0A%3Cbody%20style%3D%22margin%3A%200%3B%20overflow%3A%20hidden%3B%20width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3C%2Fbody%3E%0D%0A%3C%2Fhtml%3E') {
						return true;
					}

					const srcUri = URI.parse(source).fsPath.toLowerCase();
					const rootUri = URI.file(this.environmentService.appRoot).fsPath.toLowerCase();

					return startsWith(srcUri, rootUri + sep);
				};

				// Ensure defaults
				delete webPreferences.preload;
				webPreferences.nodeIntegration = false;

				// Verify URLs being loaded
				if (isValidWebviewSource(params.src) && isValidWebviewSource(webPreferences.preloadURL)) {
					return;
				}

				delete webPreferences.preloadUrl;

				// Otherwise prevent loading
				this.logService.error('webContents#web-contents-created: Prevented webview attach');

				event.preventDefault();
			});

			contents.on('will-navigate', event => {
				this.logService.error('webContents#will-navigate: Prevented webcontent navigation');

				event.preventDefault();
			});

			contents.on('new-window', (event: Event, url: string) => {
				event.preventDefault(); // prevent code that wants to open links

				shell.openExternal(url);
			});
		});

		let macOpenFileURIs: IURIToOpen[] = [];
		let runningTimeout: NodeJS.Timeout | null = null;
		app.on('open-file', (event: Event, path: string) => {
			this.logService.trace('App#open-file: ', path);
			event.preventDefault();

			// Keep in array because more might come!
			macOpenFileURIs.push(this.getURIToOpenFromPathSync(path));

			// Clear previous handler if any
			if (runningTimeout !== null) {
				clearTimeout(runningTimeout);
				runningTimeout = null;
			}

			// Handle paths delayed in case more are coming!
			runningTimeout = setTimeout(() => {
				if (this.windowsMainService) {
					this.windowsMainService.open({
						context: OpenContext.DOCK /* can also be opening from finder while app is running */,
						cli: this.environmentService.args,
						urisToOpen: macOpenFileURIs,
						gotoLineMode: false,
						preferNewWindow: true /* dropping on the dock or opening from finder prefers to open in a new window */
					});

					macOpenFileURIs = [];
					runningTimeout = null;
				}
			}, 100);
		});

		app.on('new-window-for-tab', () => {
			if (this.windowsMainService) {
				this.windowsMainService.openNewWindow(OpenContext.DESKTOP); //macOS native tab "+" button
			}
		});

		ipc.on('vscode:exit', (event: Event, code: number) => {
			this.logService.trace('IPC#vscode:exit', code);

			this.dispose();
			this.lifecycleService.kill(code);
		});

		ipc.on('vscode:fetchShellEnv', async (event: Event) => {
			const webContents = event.sender;

			try {
				const shellEnv = await getShellEnvironment(this.logService, this.environmentService);
				if (!webContents.isDestroyed()) {
					webContents.send('vscode:acceptShellEnv', shellEnv);
				}
			} catch (error) {
				if (!webContents.isDestroyed()) {
					webContents.send('vscode:acceptShellEnv', {});
				}

				this.logService.error('Error fetching shell env', error);
			}
		});

		ipc.on('vscode:toggleDevTools', (event: Event) => event.sender.toggleDevTools());
		ipc.on('vscode:openDevTools', (event: Event) => event.sender.openDevTools());

		ipc.on('vscode:reloadWindow', (event: Event) => event.sender.reload());

		// Some listeners after window opened
		(async () => {
			await this.lifecycleService.when(LifecycleMainPhase.AfterWindowOpen);

			// After waking up from sleep  (after window opened)
			powerMonitor.on('resume', () => {
				if (this.windowsMainService) {
					this.windowsMainService.sendToAll('vscode:osResume', undefined);
				}
			});

			// Keyboard layout changes (after window opened)
			const nativeKeymap = await import('native-keymap');
			nativeKeymap.onDidChangeKeyboardLayout(() => {
				if (this.windowsMainService) {
					this.windowsMainService.sendToAll('vscode:keyboardLayoutChanged', false);
				}
			});
		})();
	}

	private onUnexpectedError(err: Error): void {
		if (err) {

			// take only the message and stack property
			const friendlyError = {
				message: err.message,
				stack: err.stack
			};

			// handle on client side
			if (this.windowsMainService) {
				this.windowsMainService.sendToFocused('vscode:reportError', JSON.stringify(friendlyError));
			}
		}

		this.logService.error(`[uncaught exception in main]: ${err}`);
		if (err.stack) {
			this.logService.error(err.stack);
		}
	}

	async startup(): Promise<void> {
		this.logService.debug('Starting VS Code');
		this.logService.debug(`from: ${this.environmentService.appRoot}`);
		this.logService.debug('args:', this.environmentService.args);

		// Make sure we associate the program with the app user model id
		// This will help Windows to associate the running program with
		// any shortcut that is pinned to the taskbar and prevent showing
		// two icons in the taskbar for the same app.
		if (isWindows && product.win32AppUserModelId) {
			app.setAppUserModelId(product.win32AppUserModelId);
		}

		// Fix native tabs on macOS 10.13
		// macOS enables a compatibility patch for any bundle ID beginning with
		// "com.microsoft.", which breaks native tabs for VS Code when using this
		// identifier (from the official build).
		// Explicitly opt out of the patch here before creating any windows.
		// See: https://github.com/Microsoft/vscode/issues/35361#issuecomment-399794085
		try {
			if (isMacintosh && this.configurationService.getValue<boolean>('window.nativeTabs') === true && !systemPreferences.getUserDefault('NSUseImprovedLayoutPass', 'boolean')) {
				systemPreferences.setUserDefault('NSUseImprovedLayoutPass', 'boolean', true as any);
			}
		} catch (error) {
			this.logService.error(error);
		}

		// Create Electron IPC Server
		const electronIpcServer = new ElectronIPCServer();

		// Resolve unique machine ID
		this.logService.trace('Resolving machine identifier...');
		const { machineId, trueMachineId } = await this.resolveMachineId();
		this.logService.trace(`Resolved machine identifier: ${machineId} (trueMachineId: ${trueMachineId})`);

		// Spawn shared process after the first window has opened and 3s have passed
		const sharedProcess = this.instantiationService.createInstance(SharedProcess, machineId, this.userEnv);
		const sharedProcessClient = sharedProcess.whenReady().then(() => connect(this.environmentService.sharedIPCHandle, 'main'));
		this.lifecycleService.when(LifecycleMainPhase.AfterWindowOpen).then(() => {
			this._register(new RunOnceScheduler(async () => {
				const userEnv = await getShellEnvironment(this.logService, this.environmentService);

				sharedProcess.spawn(userEnv);
			}, 3000)).schedule();
		});

		// Services
		const appInstantiationService = await this.createServices(machineId, trueMachineId, sharedProcess, sharedProcessClient);

		// Create driver
		if (this.environmentService.driverHandle) {
			const server = await serveDriver(electronIpcServer, this.environmentService.driverHandle!, this.environmentService, appInstantiationService);

			this.logService.info('Driver started at:', this.environmentService.driverHandle);
			this._register(server);
		}

		// Setup Auth Handler
		const authHandler = appInstantiationService.createInstance(ProxyAuthHandler);
		this._register(authHandler);

		// Open Windows
		const windows = appInstantiationService.invokeFunction(accessor => this.openFirstWindow(accessor, electronIpcServer, sharedProcessClient));

		// Post Open Windows Tasks
		this.afterWindowOpen();

		// Tracing: Stop tracing after windows are ready if enabled
		if (this.environmentService.args.trace) {
			this.stopTracingEventually(windows);
		}
	}

	private async resolveMachineId(): Promise<{ machineId: string, trueMachineId?: string }> {

		// We cache the machineId for faster lookups on startup
		// and resolve it only once initially if not cached
		let machineId = this.stateService.getItem<string>(CodeApplication.MACHINE_ID_KEY);
		if (!machineId) {
			machineId = await getMachineId();

			this.stateService.setItem(CodeApplication.MACHINE_ID_KEY, machineId);
		}

		// Check if machineId is hashed iBridge Device
		let trueMachineId: string | undefined;
		if (isMacintosh && machineId === '6c9d2bc8f91b89624add29c0abeae7fb42bf539fa1cdb2e3e57cd668fa9bcead') {
			trueMachineId = this.stateService.getItem<string>(CodeApplication.TRUE_MACHINE_ID_KEY);
			if (!trueMachineId) {
				trueMachineId = await getMachineId();

				this.stateService.setItem(CodeApplication.TRUE_MACHINE_ID_KEY, trueMachineId);
			}
		}

		return { machineId, trueMachineId };
	}

	private async createServices(machineId: string, trueMachineId: string | undefined, sharedProcess: SharedProcess, sharedProcessClient: Promise<Client<string>>): Promise<IInstantiationService> {
		const services = new ServiceCollection();

		// Files
		const fileService = this._register(new FileService(this.logService));
		services.set(IFileService, fileService);

		const diskFileSystemProvider = this._register(new DiskFileSystemProvider(this.logService));
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);

		switch (process.platform) {
			case 'win32':
				services.set(IUpdateService, new SyncDescriptor(Win32UpdateService));
				break;

			case 'linux':
				if (process.env.SNAP && process.env.SNAP_REVISION) {
					services.set(IUpdateService, new SyncDescriptor(SnapUpdateService, [process.env.SNAP, process.env.SNAP_REVISION]));
				} else {
					services.set(IUpdateService, new SyncDescriptor(LinuxUpdateService));
				}
				break;

			case 'darwin':
				services.set(IUpdateService, new SyncDescriptor(DarwinUpdateService));
				break;
		}

		services.set(IWindowsMainService, new SyncDescriptor(WindowsManager, [machineId, this.userEnv]));
		services.set(IWindowsService, new SyncDescriptor(WindowsService, [sharedProcess]));
		services.set(ILaunchService, new SyncDescriptor(LaunchService));

		const diagnosticsChannel = getDelayedChannel(sharedProcessClient.then(client => client.getChannel('diagnostics')));
		services.set(IDiagnosticsService, new SyncDescriptor(DiagnosticsService, [diagnosticsChannel]));

		services.set(IIssueService, new SyncDescriptor(IssueService, [machineId, this.userEnv]));
		services.set(IMenubarService, new SyncDescriptor(MenubarService));

		const storageMainService = new StorageMainService(this.logService, this.environmentService);
		services.set(IStorageMainService, storageMainService);
		this.lifecycleService.onWillShutdown(e => e.join(storageMainService.close()));

		const backupMainService = new BackupMainService(this.environmentService, this.configurationService, this.logService);
		services.set(IBackupMainService, backupMainService);

		services.set(IHistoryMainService, new SyncDescriptor(HistoryMainService));
		services.set(IURLService, new SyncDescriptor(URLService));
		services.set(IWorkspacesMainService, new SyncDescriptor(WorkspacesMainService));

		// Telemetry
		if (!this.environmentService.isExtensionDevelopment && !this.environmentService.args['disable-telemetry'] && !!product.enableTelemetry) {
			const channel = getDelayedChannel(sharedProcessClient.then(client => client.getChannel('telemetryAppender')));
			const appender = combinedAppender(new TelemetryAppenderClient(channel), new LogAppender(this.logService));
			const commonProperties = resolveCommonProperties(product.commit, pkg.version, machineId, this.environmentService.installSourcePath);
			const piiPaths = this.environmentService.extensionsPath ? [this.environmentService.appRoot, this.environmentService.extensionsPath] : [this.environmentService.appRoot];
			const config: ITelemetryServiceConfig = { appender, commonProperties, piiPaths, trueMachineId };

			services.set(ITelemetryService, new SyncDescriptor(TelemetryService, [config]));
		} else {
			services.set(ITelemetryService, NullTelemetryService);
		}

		// Init services that require it
		await backupMainService.initialize();

		return this.instantiationService.createChild(services);
	}

	private stopTracingEventually(windows: ICodeWindow[]): void {
		this.logService.info(`Tracing: waiting for windows to get ready...`);

		let recordingStopped = false;
		const stopRecording = (timeout: boolean) => {
			if (recordingStopped) {
				return;
			}

			recordingStopped = true; // only once

			contentTracing.stopRecording(join(homedir(), `${product.applicationName}-${Math.random().toString(16).slice(-4)}.trace.txt`), path => {
				if (!timeout) {
					if (this.windowsMainService) {
						this.windowsMainService.showMessageBox({
							type: 'info',
							message: localize('trace.message', "Successfully created trace."),
							detail: localize('trace.detail', "Please create an issue and manually attach the following file:\n{0}", path),
							buttons: [localize('trace.ok', "Ok")]
						}, this.windowsMainService.getLastActiveWindow());
					}
				} else {
					this.logService.info(`Tracing: data recorded (after 30s timeout) to ${path}`);
				}
			});
		};

		// Wait up to 30s before creating the trace anyways
		const timeoutHandle = setTimeout(() => stopRecording(true), 30000);

		// Wait for all windows to get ready and stop tracing then
		Promise.all(windows.map(window => window.ready())).then(() => {
			clearTimeout(timeoutHandle);
			stopRecording(false);
		});
	}

	private openFirstWindow(accessor: ServicesAccessor, electronIpcServer: ElectronIPCServer, sharedProcessClient: Promise<Client<string>>): ICodeWindow[] {

		// Register more Main IPC services
		const launchService = accessor.get(ILaunchService);
		const launchChannel = new LaunchChannel(launchService);
		this.mainIpcServer.registerChannel('launch', launchChannel);

		// Register more Electron IPC services
		const updateService = accessor.get(IUpdateService);
		const updateChannel = new UpdateChannel(updateService);
		electronIpcServer.registerChannel('update', updateChannel);

		const issueService = accessor.get(IIssueService);
		const issueChannel = new IssueChannel(issueService);
		electronIpcServer.registerChannel('issue', issueChannel);

		const workspacesService = accessor.get(IWorkspacesMainService);
		const workspacesChannel = new WorkspacesChannel(workspacesService);
		electronIpcServer.registerChannel('workspaces', workspacesChannel);

		const windowsService = accessor.get(IWindowsService);
		const windowsChannel = new WindowsChannel(windowsService);
		electronIpcServer.registerChannel('windows', windowsChannel);
		sharedProcessClient.then(client => client.registerChannel('windows', windowsChannel));

		const menubarService = accessor.get(IMenubarService);
		const menubarChannel = new MenubarChannel(menubarService);
		electronIpcServer.registerChannel('menubar', menubarChannel);

		const urlService = accessor.get(IURLService);
		const urlChannel = new URLServiceChannel(urlService);
		electronIpcServer.registerChannel('url', urlChannel);

		const storageMainService = accessor.get(IStorageMainService);
		const storageChannel = this._register(new GlobalStorageDatabaseChannel(this.logService, storageMainService));
		electronIpcServer.registerChannel('storage', storageChannel);

		// Log level management
		const logLevelChannel = new LogLevelSetterChannel(accessor.get(ILogService));
		electronIpcServer.registerChannel('loglevel', logLevelChannel);
		sharedProcessClient.then(client => client.registerChannel('loglevel', logLevelChannel));

		// ExtensionHost Debug broadcast service
		electronIpcServer.registerChannel(ExtensionHostDebugBroadcastChannel.ChannelName, new ExtensionHostDebugBroadcastChannel());

		// Signal phase: ready (services set)
		this.lifecycleService.phase = LifecycleMainPhase.Ready;

		// Propagate to clients
		const windowsMainService = this.windowsMainService = accessor.get(IWindowsMainService);

		// Create a URL handler which forwards to the last active window
		const activeWindowManager = new ActiveWindowManager(windowsService);
		const activeWindowRouter = new StaticRouter(ctx => activeWindowManager.getActiveClientId().then(id => ctx === id));
		const urlHandlerChannel = electronIpcServer.getChannel('urlHandler', activeWindowRouter);
		const multiplexURLHandler = new URLHandlerChannelClient(urlHandlerChannel);

		// On Mac, Code can be running without any open windows, so we must create a window to handle urls,
		// if there is none
		if (isMacintosh) {
			const environmentService = accessor.get(IEnvironmentService);

			urlService.registerHandler({
				async handleURL(uri: URI): Promise<boolean> {
					if (windowsMainService.getWindowCount() === 0) {
						const cli = { ...environmentService.args };
						const [window] = windowsMainService.open({ context: OpenContext.API, cli, forceEmpty: true, gotoLineMode: true });

						await window.ready();

						return urlService.open(uri);
					}

					return false;
				}
			});
		}

		// Register the multiple URL handler
		urlService.registerHandler(multiplexURLHandler);

		// Watch Electron URLs and forward them to the UrlService
		const args = this.environmentService.args;
		const urls = args['open-url'] ? args._urls : [];
		const urlListener = new ElectronURLListener(urls || [], urlService, windowsMainService);
		this._register(urlListener);

		// Open our first window
		const macOpenFiles: string[] = (<any>global).macOpenFiles;
		const context = !!process.env['VSCODE_CLI'] ? OpenContext.CLI : OpenContext.DESKTOP;
		const hasCliArgs = hasArgs(args._);
		const hasFolderURIs = hasArgs(args['folder-uri']);
		const hasFileURIs = hasArgs(args['file-uri']);
		const noRecentEntry = args['skip-add-to-recently-opened'] === true;
		const waitMarkerFileURI = args.wait && args.waitMarkerFilePath ? URI.file(args.waitMarkerFilePath) : undefined;

		// new window if "-n" was used without paths
		if (args['new-window'] && !hasCliArgs && !hasFolderURIs && !hasFileURIs) {
			return windowsMainService.open({
				context,
				cli: args,
				forceNewWindow: true,
				forceEmpty: true,
				noRecentEntry,
				waitMarkerFileURI,
				initialStartup: true
			});
		}

		// mac: open-file event received on startup
		if (macOpenFiles && macOpenFiles.length && !hasCliArgs && !hasFolderURIs && !hasFileURIs) {
			return windowsMainService.open({
				context: OpenContext.DOCK,
				cli: args,
				urisToOpen: macOpenFiles.map(file => this.getURIToOpenFromPathSync(file)),
				noRecentEntry,
				waitMarkerFileURI,
				gotoLineMode: false,
				initialStartup: true
			});
		}

		// default: read paths from cli
		return windowsMainService.open({
			context,
			cli: args,
			forceNewWindow: args['new-window'] || (!hasCliArgs && args['unity-launch']),
			diffMode: args.diff,
			noRecentEntry,
			waitMarkerFileURI,
			gotoLineMode: args.goto,
			initialStartup: true
		});
	}

	private getURIToOpenFromPathSync(path: string): IURIToOpen {
		try {
			const fileStat = statSync(path);
			if (fileStat.isDirectory()) {
				return { folderUri: URI.file(path) };
			}

			if (hasWorkspaceFileExtension(path)) {
				return { workspaceUri: URI.file(path) };
			}
		} catch (error) {
			// ignore errors
		}

		return { fileUri: URI.file(path) };
	}

	private afterWindowOpen(): void {

		// Signal phase: after window open
		this.lifecycleService.phase = LifecycleMainPhase.AfterWindowOpen;

		// Remote Authorities
		this.handleRemoteAuthorities();
	}

	private handleRemoteAuthorities(): void {
		protocol.registerHttpProtocol(Schemas.vscodeRemote, (request, callback) => {
			callback({
				url: request.url.replace(/^vscode-remote:/, 'http:'),
				method: request.method
			});
		});
	}
}
