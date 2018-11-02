/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, ipcMain as ipc, systemPreferences, shell, Event, contentTracing } from 'electron';
import * as platform from 'vs/base/common/platform';
import { WindowsManager } from 'vs/code/electron-main/windows';
import { IWindowsService, OpenContext, ActiveWindowManager } from 'vs/platform/windows/common/windows';
import { WindowsChannel } from 'vs/platform/windows/node/windowsIpc';
import { WindowsService } from 'vs/platform/windows/electron-main/windowsService';
import { ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { getShellEnvironment } from 'vs/code/node/shellEnv';
import { IUpdateService } from 'vs/platform/update/common/update';
import { UpdateChannel } from 'vs/platform/update/node/updateIpc';
import { Server as ElectronIPCServer } from 'vs/base/parts/ipc/electron-main/ipc.electron-main';
import { Server, connect, Client } from 'vs/base/parts/ipc/node/ipc.net';
import { SharedProcess } from 'vs/code/electron-main/sharedProcess';
import { Mutex } from 'windows-mutex';
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
import { ITelemetryAppenderChannel, TelemetryAppenderClient } from 'vs/platform/telemetry/node/telemetryIpc';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';
import { getDelayedChannel } from 'vs/base/parts/ipc/node/ipc';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import { ProxyAuthHandler } from 'vs/code/electron-main/auth';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWindowsMainService, ICodeWindow } from 'vs/platform/windows/electron-main/windows';
import { IHistoryMainService } from 'vs/platform/history/common/history';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { KeyboardLayoutMonitor } from 'vs/code/electron-main/keyboard';
import { URI } from 'vs/base/common/uri';
import { WorkspacesChannel } from 'vs/platform/workspaces/node/workspacesIpc';
import { IWorkspacesMainService } from 'vs/platform/workspaces/common/workspaces';
import { getMachineId } from 'vs/base/node/id';
import { Win32UpdateService } from 'vs/platform/update/electron-main/updateService.win32';
import { LinuxUpdateService } from 'vs/platform/update/electron-main/updateService.linux';
import { DarwinUpdateService } from 'vs/platform/update/electron-main/updateService.darwin';
import { IIssueService } from 'vs/platform/issue/common/issue';
import { IssueChannel } from 'vs/platform/issue/node/issueIpc';
import { IssueService } from 'vs/platform/issue/electron-main/issueService';
import { LogLevelSetterChannel } from 'vs/platform/log/node/logIpc';
import * as errors from 'vs/base/common/errors';
import { ElectronURLListener } from 'vs/platform/url/electron-main/electronUrlListener';
import { serve as serveDriver } from 'vs/platform/driver/electron-main/driver';
import { IMenubarService } from 'vs/platform/menubar/common/menubar';
import { MenubarService } from 'vs/platform/menubar/electron-main/menubarService';
import { MenubarChannel } from 'vs/platform/menubar/node/menubarIpc';
import { ILabelService, RegisterFormatterEvent } from 'vs/platform/label/common/label';
import { hasArgs } from 'vs/platform/environment/node/argv';
import { RunOnceScheduler } from 'vs/base/common/async';
import { registerContextMenuListener } from 'vs/base/parts/contextmenu/electron-main/contextmenu';
import { THEME_STORAGE_KEY, THEME_BG_STORAGE_KEY } from 'vs/code/electron-main/theme';
import { nativeSep, join } from 'vs/base/common/paths';
import { homedir } from 'os';
import { localize } from 'vs/nls';

export class CodeApplication {

	private static readonly MACHINE_ID_KEY = 'telemetry.machineId';

	private toDispose: IDisposable[];
	private windowsMainService: IWindowsMainService;

	private electronIpcServer: ElectronIPCServer;

	private sharedProcess: SharedProcess;
	private sharedProcessClient: TPromise<Client>;

	constructor(
		private mainIpcServer: Server,
		private userEnv: platform.IProcessEnvironment,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ILogService private logService: ILogService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IConfigurationService private configurationService: ConfigurationService,
		@IStateService private stateService: IStateService,
		@IHistoryMainService private historyMainService: IHistoryMainService,
		@ILabelService private labelService: ILabelService
	) {
		this.toDispose = [mainIpcServer, configurationService];

		this.registerListeners();
	}

	private registerListeners(): void {

		// We handle uncaught exceptions here to prevent electron from opening a dialog to the user
		errors.setUnexpectedErrorHandler(err => this.onUnexpectedError(err));
		process.on('uncaughtException', err => this.onUnexpectedError(err));
		process.on('unhandledRejection', (reason: any, promise: Promise<any>) => errors.onUnexpectedError(reason));

		// Contextmenu via IPC support
		registerContextMenuListener();

		app.on('will-quit', () => {
			this.logService.trace('App#will-quit: disposing resources');

			this.dispose();
		});

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
		// DO NOT CHANGE without consulting the documentation
		app.on('web-contents-created', (event: any, contents) => {
			contents.on('will-attach-webview', (event: Electron.Event, webPreferences, params) => {

				// Ensure defaults
				delete webPreferences.preload;
				webPreferences.nodeIntegration = false;

				// Verify URLs being loaded
				if (this.isValidWebviewSource(params.src) && this.isValidWebviewSource(webPreferences.preloadURL)) {
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

		let macOpenFileURIs: URI[] = [];
		let runningTimeout: any = null;
		app.on('open-file', (event: Event, path: string) => {
			this.logService.trace('App#open-file: ', path);
			event.preventDefault();

			// Keep in array because more might come!
			macOpenFileURIs.push(URI.file(path));

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
						preferNewWindow: true /* dropping on the dock or opening from finder prefers to open in a new window */
					});
					macOpenFileURIs = [];
					runningTimeout = null;
				}
			}, 100);
		});

		app.on('new-window-for-tab', () => {
			this.windowsMainService.openNewWindow(OpenContext.DESKTOP); //macOS native tab "+" button
		});

		ipc.on('vscode:exit', (event: Event, code: number) => {
			this.logService.trace('IPC#vscode:exit', code);

			this.dispose();
			this.lifecycleService.kill(code);
		});

		ipc.on('vscode:fetchShellEnv', (event: Event) => {
			const webContents = event.sender;
			getShellEnvironment().then(shellEnv => {
				if (!webContents.isDestroyed()) {
					webContents.send('vscode:acceptShellEnv', shellEnv);
				}
			}, err => {
				if (!webContents.isDestroyed()) {
					webContents.send('vscode:acceptShellEnv', {});
				}

				this.logService.error('Error fetching shell env', err);
			});
		});

		ipc.on('vscode:broadcast', (event: Event, windowId: number, broadcast: { channel: string; payload: any; }) => {
			if (this.windowsMainService && broadcast.channel && !isUndefinedOrNull(broadcast.payload)) {
				this.logService.trace('IPC#vscode:broadcast', broadcast.channel, broadcast.payload);

				// Handle specific events on main side
				this.onBroadcast(broadcast.channel, broadcast.payload);

				// Send to all windows (except sender window)
				this.windowsMainService.sendToAll('vscode:broadcast', broadcast, [windowId]);
			}
		});

		ipc.on('vscode:labelRegisterFormatter', (event: any, data: RegisterFormatterEvent) => {
			this.labelService.registerFormatter(data.selector, data.formatter);
		});

		ipc.on('vscode:toggleDevTools', (event: Event) => {
			event.sender.toggleDevTools();
		});

		ipc.on('vscode:openDevTools', (event: Event) => {
			event.sender.openDevTools();
		});

		ipc.on('vscode:reloadWindow', (event: Event) => {
			event.sender.reload();
		});

		// Keyboard layout changes
		KeyboardLayoutMonitor.INSTANCE.onDidChangeKeyboardLayout(() => {
			if (this.windowsMainService) {
				this.windowsMainService.sendToAll('vscode:keyboardLayoutChanged', false);
			}
		});
	}

	private isValidWebviewSource(source: string): boolean {
		if (!source) {
			return false;
		}

		if (source === 'data:text/html;charset=utf-8,%3C%21DOCTYPE%20html%3E%0D%0A%3Chtml%20lang%3D%22en%22%20style%3D%22width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3Chead%3E%0D%0A%09%3Ctitle%3EVirtual%20Document%3C%2Ftitle%3E%0D%0A%3C%2Fhead%3E%0D%0A%3Cbody%20style%3D%22margin%3A%200%3B%20overflow%3A%20hidden%3B%20width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3C%2Fbody%3E%0D%0A%3C%2Fhtml%3E') {
			return true;
		}

		const srcUri: any = URI.parse(source).fsPath.toLowerCase();
		const rootUri = URI.file(this.environmentService.appRoot).fsPath.toLowerCase();
		return srcUri.startsWith(rootUri + nativeSep);
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

	private onBroadcast(event: string, payload: any): void {

		// Theme changes
		if (event === 'vscode:changeColorTheme' && typeof payload === 'string') {
			let data = JSON.parse(payload);

			this.stateService.setItem(THEME_STORAGE_KEY, data.baseTheme);
			this.stateService.setItem(THEME_BG_STORAGE_KEY, data.background);
		}
	}

	startup(): TPromise<void> {
		this.logService.debug('Starting VS Code');
		this.logService.debug(`from: ${this.environmentService.appRoot}`);
		this.logService.debug('args:', this.environmentService.args);

		// Make sure we associate the program with the app user model id
		// This will help Windows to associate the running program with
		// any shortcut that is pinned to the taskbar and prevent showing
		// two icons in the taskbar for the same app.
		if (platform.isWindows && product.win32AppUserModelId) {
			app.setAppUserModelId(product.win32AppUserModelId);
		}

		// Fix native tabs on macOS 10.13
		// macOS enables a compatibility patch for any bundle ID beginning with
		// "com.microsoft.", which breaks native tabs for VS Code when using this
		// identifier (from the official build).
		// Explicitly opt out of the patch here before creating any windows.
		// See: https://github.com/Microsoft/vscode/issues/35361#issuecomment-399794085
		try {
			if (platform.isMacintosh && this.configurationService.getValue<boolean>('window.nativeTabs') === true && !systemPreferences.getUserDefault('NSUseImprovedLayoutPass', 'boolean')) {
				systemPreferences.setUserDefault('NSUseImprovedLayoutPass', 'boolean', true as any);
			}
		} catch (error) {
			this.logService.error(error);
		}

		// Create Electron IPC Server
		this.electronIpcServer = new ElectronIPCServer();

		// Resolve unique machine ID
		this.logService.trace('Resolving machine identifier...');
		return this.resolveMachineId().then(machineId => {
			this.logService.trace(`Resolved machine identifier: ${machineId}`);

			// Spawn shared process
			this.sharedProcess = this.instantiationService.createInstance(SharedProcess, machineId, this.userEnv);
			this.sharedProcessClient = this.sharedProcess.whenReady().then(() => connect(this.environmentService.sharedIPCHandle, 'main'));

			// Services
			const appInstantiationService = this.initServices(machineId);

			let promise: TPromise<any> = TPromise.as(null);

			// Create driver
			if (this.environmentService.driverHandle) {
				serveDriver(this.electronIpcServer, this.environmentService.driverHandle, this.environmentService, appInstantiationService).then(server => {
					this.logService.info('Driver started at:', this.environmentService.driverHandle);
					this.toDispose.push(server);
				});
			}

			return promise.then(() => {

				// Setup Auth Handler
				const authHandler = appInstantiationService.createInstance(ProxyAuthHandler);
				this.toDispose.push(authHandler);

				// Open Windows
				const windows = appInstantiationService.invokeFunction(accessor => this.openFirstWindow(accessor));

				// Post Open Windows Tasks
				appInstantiationService.invokeFunction(accessor => this.afterWindowOpen(accessor));

				// Tracing: Stop tracing after windows are ready if enabled
				if (this.environmentService.args.trace) {
					this.logService.info(`Tracing: waiting for windows to get ready...`);

					let recordingStopped = false;
					const stopRecording = (timeout) => {
						if (recordingStopped) {
							return;
						}

						recordingStopped = true; // only once

						contentTracing.stopRecording(join(homedir(), `${product.applicationName}-${Math.random().toString(16).slice(-4)}.trace.txt`), path => {
							if (!timeout) {
								this.windowsMainService.showMessageBox({
									type: 'info',
									message: localize('trace.message', "Successfully created trace."),
									detail: localize('trace.detail', "Please create an issue and manually attach the following file:\n{0}", path),
									buttons: [localize('trace.ok', "Ok")]
								}, this.windowsMainService.getLastActiveWindow());
							} else {
								this.logService.info(`Tracing: data recorded (after 30s timeout) to ${path}`);
							}
						});
					};

					// Wait up to 30s before creating the trace anyways
					const timeoutHandle = setTimeout(() => stopRecording(true), 30000);

					// Wait for all windows to get ready and stop tracing then
					TPromise.join(windows.map(window => window.ready())).then(() => {
						clearTimeout(timeoutHandle);
						stopRecording(false);
					});
				}
			});
		});
	}

	private resolveMachineId(): TPromise<string> {
		const machineId = this.stateService.getItem<string>(CodeApplication.MACHINE_ID_KEY);
		if (machineId) {
			return TPromise.wrap(machineId);
		}

		return getMachineId().then(machineId => {

			// Remember in global storage
			this.stateService.setItem(CodeApplication.MACHINE_ID_KEY, machineId);

			return machineId;
		});
	}

	private initServices(machineId: string): IInstantiationService {
		const services = new ServiceCollection();

		if (process.platform === 'win32') {
			services.set(IUpdateService, new SyncDescriptor(Win32UpdateService));
		} else if (process.platform === 'linux') {
			services.set(IUpdateService, new SyncDescriptor(LinuxUpdateService));
		} else if (process.platform === 'darwin') {
			services.set(IUpdateService, new SyncDescriptor(DarwinUpdateService));
		}

		services.set(IWindowsMainService, new SyncDescriptor(WindowsManager, [machineId]));
		services.set(IWindowsService, new SyncDescriptor(WindowsService, [this.sharedProcess]));
		services.set(ILaunchService, new SyncDescriptor(LaunchService));
		services.set(IIssueService, new SyncDescriptor(IssueService, [machineId, this.userEnv]));
		services.set(IMenubarService, new SyncDescriptor(MenubarService));

		// Telemtry
		if (!this.environmentService.isExtensionDevelopment && !this.environmentService.args['disable-telemetry'] && !!product.enableTelemetry) {
			const channel = getDelayedChannel<ITelemetryAppenderChannel>(this.sharedProcessClient.then(c => c.getChannel('telemetryAppender')));
			const appender = combinedAppender(new TelemetryAppenderClient(channel), new LogAppender(this.logService));
			const commonProperties = resolveCommonProperties(product.commit, pkg.version, machineId, this.environmentService.installSourcePath);
			const piiPaths = [this.environmentService.appRoot, this.environmentService.extensionsPath];
			const config: ITelemetryServiceConfig = { appender, commonProperties, piiPaths };

			services.set(ITelemetryService, new SyncDescriptor(TelemetryService, [config]));
		} else {
			services.set(ITelemetryService, NullTelemetryService);
		}

		return this.instantiationService.createChild(services);
	}

	private openFirstWindow(accessor: ServicesAccessor): ICodeWindow[] {
		const appInstantiationService = accessor.get(IInstantiationService);

		// Register more Main IPC services
		const launchService = accessor.get(ILaunchService);
		const launchChannel = new LaunchChannel(launchService);
		this.mainIpcServer.registerChannel('launch', launchChannel);

		// Register more Electron IPC services
		const updateService = accessor.get(IUpdateService);
		const updateChannel = new UpdateChannel(updateService);
		this.electronIpcServer.registerChannel('update', updateChannel);

		const issueService = accessor.get(IIssueService);
		const issueChannel = new IssueChannel(issueService);
		this.electronIpcServer.registerChannel('issue', issueChannel);

		const workspacesService = accessor.get(IWorkspacesMainService);
		const workspacesChannel = appInstantiationService.createInstance(WorkspacesChannel, workspacesService);
		this.electronIpcServer.registerChannel('workspaces', workspacesChannel);

		const windowsService = accessor.get(IWindowsService);
		const windowsChannel = new WindowsChannel(windowsService);
		this.electronIpcServer.registerChannel('windows', windowsChannel);
		this.sharedProcessClient.then(client => client.registerChannel('windows', windowsChannel));

		const menubarService = accessor.get(IMenubarService);
		const menubarChannel = new MenubarChannel(menubarService);
		this.electronIpcServer.registerChannel('menubar', menubarChannel);

		const urlService = accessor.get(IURLService);
		const urlChannel = new URLServiceChannel(urlService);
		this.electronIpcServer.registerChannel('url', urlChannel);

		// Log level management
		const logLevelChannel = new LogLevelSetterChannel(accessor.get(ILogService));
		this.electronIpcServer.registerChannel('loglevel', logLevelChannel);
		this.sharedProcessClient.then(client => client.registerChannel('loglevel', logLevelChannel));

		// Lifecycle
		this.lifecycleService.ready();

		// Propagate to clients
		const windowsMainService = this.windowsMainService = accessor.get(IWindowsMainService); // TODO@Joao: unfold this

		const args = this.environmentService.args;

		// Create a URL handler which forwards to the last active window
		const activeWindowManager = new ActiveWindowManager(windowsService);
		const route = () => activeWindowManager.getActiveClientId();
		const urlHandlerChannel = this.electronIpcServer.getChannel('urlHandler', { routeCall: route, routeEvent: route });
		const multiplexURLHandler = new URLHandlerChannelClient(urlHandlerChannel);

		// On Mac, Code can be running without any open windows, so we must create a window to handle urls,
		// if there is none
		if (platform.isMacintosh) {
			const environmentService = accessor.get(IEnvironmentService);

			urlService.registerHandler({
				handleURL(uri: URI): TPromise<boolean> {
					if (windowsMainService.getWindowCount() === 0) {
						const cli = { ...environmentService.args, goto: true };
						const [window] = windowsMainService.open({ context: OpenContext.API, cli, forceEmpty: true });

						return window.ready().then(() => urlService.open(uri));
					}

					return TPromise.as(false);
				}
			});
		}

		// Register the multiple URL handker
		urlService.registerHandler(multiplexURLHandler);

		// Watch Electron URLs and forward them to the UrlService
		const urls = args['open-url'] ? args._urls : [];
		const urlListener = new ElectronURLListener(urls, urlService, this.windowsMainService);
		this.toDispose.push(urlListener);

		this.windowsMainService.ready(this.userEnv);

		// Open our first window
		const macOpenFiles = (<any>global).macOpenFiles as string[];
		const context = !!process.env['VSCODE_CLI'] ? OpenContext.CLI : OpenContext.DESKTOP;
		const hasCliArgs = hasArgs(args._);
		const hasFolderURIs = hasArgs(args['folder-uri']);
		const hasFileURIs = hasArgs(args['file-uri']);

		if (args['new-window'] && !hasCliArgs && !hasFolderURIs && !hasFileURIs) {
			return this.windowsMainService.open({ context, cli: args, forceNewWindow: true, forceEmpty: true, initialStartup: true }); // new window if "-n" was used without paths
		}

		if (macOpenFiles && macOpenFiles.length && !hasCliArgs && !hasFolderURIs && !hasFileURIs) {
			return this.windowsMainService.open({ context: OpenContext.DOCK, cli: args, urisToOpen: macOpenFiles.map(file => URI.file(file)), initialStartup: true }); // mac: open-file event received on startup
		}

		return this.windowsMainService.open({ context, cli: args, forceNewWindow: args['new-window'] || (!hasCliArgs && args['unity-launch']), diffMode: args.diff, initialStartup: true }); // default: read paths from cli
	}

	private afterWindowOpen(accessor: ServicesAccessor): void {
		const windowsMainService = accessor.get(IWindowsMainService);

		let windowsMutex: Mutex | null = null;
		if (platform.isWindows) {

			// Setup Windows mutex
			try {
				const Mutex = (require.__$__nodeRequire('windows-mutex') as any).Mutex;
				windowsMutex = new Mutex(product.win32MutexName);
				this.toDispose.push({ dispose: () => windowsMutex.release() });
			} catch (e) {
				if (!this.environmentService.isBuilt) {
					windowsMainService.showMessageBox({
						title: product.nameLong,
						type: 'warning',
						message: 'Failed to load windows-mutex!',
						detail: e.toString(),
						noLink: true
					});
				}
			}

			// Ensure Windows foreground love module
			try {
				// tslint:disable-next-line:no-unused-expression
				<any>require.__$__nodeRequire('windows-foreground-love');
			} catch (e) {
				if (!this.environmentService.isBuilt) {
					windowsMainService.showMessageBox({
						title: product.nameLong,
						type: 'warning',
						message: 'Failed to load windows-foreground-love!',
						detail: e.toString(),
						noLink: true
					});
				}
			}
		}

		// Jump List
		this.historyMainService.updateWindowsJumpList();
		this.historyMainService.onRecentlyOpenedChange(() => this.historyMainService.updateWindowsJumpList());

		// Start shared process after a while
		const sharedProcess = new RunOnceScheduler(() => this.sharedProcess.spawn(), 3000);
		sharedProcess.schedule();
		this.toDispose.push(sharedProcess);
	}

	private dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}
