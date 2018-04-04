/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { app, ipcMain as ipc } from 'electron';
import * as platform from 'vs/base/common/platform';
import { WindowsManager } from 'vs/code/electron-main/windows';
import { IWindowsService, OpenContext, ActiveWindowManager } from 'vs/platform/windows/common/windows';
import { WindowsChannel } from 'vs/platform/windows/common/windowsIpc';
import { WindowsService } from 'vs/platform/windows/electron-main/windowsService';
import { ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { CodeMenu } from 'vs/code/electron-main/menus';
import { getShellEnvironment } from 'vs/code/node/shellEnv';
import { IUpdateService } from 'vs/platform/update/common/update';
import { UpdateChannel } from 'vs/platform/update/common/updateIpc';
import { Server as ElectronIPCServer } from 'vs/base/parts/ipc/electron-main/ipc.electron-main';
import { Server, connect, Client } from 'vs/base/parts/ipc/node/ipc.net';
import { SharedProcess } from 'vs/code/electron-main/sharedProcess';
import { Mutex } from 'windows-mutex';
import { LaunchService, LaunchChannel, ILaunchService } from './launch';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateService } from 'vs/platform/state/common/state';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IURLService } from 'vs/platform/url/common/url';
import { URLHandlerChannelClient, URLServiceChannel } from 'vs/platform/url/common/urlIpc';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITelemetryAppenderChannel, TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';
import { getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import { ProxyAuthHandler } from './auth';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { IHistoryMainService } from 'vs/platform/history/common/history';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { CodeWindow } from 'vs/code/electron-main/window';
import { KeyboardLayoutMonitor } from 'vs/code/electron-main/keyboard';
import URI from 'vs/base/common/uri';
import { WorkspacesChannel } from 'vs/platform/workspaces/common/workspacesIpc';
import { IWorkspacesMainService } from 'vs/platform/workspaces/common/workspaces';
import { getMachineId } from 'vs/base/node/id';
import { Win32UpdateService } from 'vs/platform/update/electron-main/updateService.win32';
import { LinuxUpdateService } from 'vs/platform/update/electron-main/updateService.linux';
import { DarwinUpdateService } from 'vs/platform/update/electron-main/updateService.darwin';
import { IIssueService } from 'vs/platform/issue/common/issue';
import { IssueChannel } from 'vs/platform/issue/common/issueIpc';
import { IssueService } from 'vs/platform/issue/electron-main/issueService';
import { LogLevelSetterChannel } from 'vs/platform/log/common/logIpc';
import { setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { join } from 'path';
import { copy } from 'vs/base/node/pfs';
import { ElectronURLListener } from 'vs/platform/url/electron-main/electronUrlListener';
import { serve, Driver } from './driver';

export class CodeApplication {

	private static readonly MACHINE_ID_KEY = 'telemetry.machineId';
	private static readonly LOCAL_STORAGE_BACKED_UP_KEY = 'localStorage.backedUp';

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
		@IConfigurationService configurationService: ConfigurationService,
		@IStateService private stateService: IStateService,
		@IHistoryMainService private historyMainService: IHistoryMainService
	) {
		this.toDispose = [mainIpcServer, configurationService];

		this.registerListeners();
	}

	private registerListeners(): void {

		// We handle uncaught exceptions here to prevent electron from opening a dialog to the user
		setUnexpectedErrorHandler(err => this.onUnexpectedError(err));
		process.on('uncaughtException', err => this.onUnexpectedError(err));

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

		const isValidWebviewSource = (source: string): boolean => {
			if (!source) {
				return false;
			}
			if (source === 'data:text/html;charset=utf-8,%3C%21DOCTYPE%20html%3E%0D%0A%3Chtml%20lang%3D%22en%22%20style%3D%22width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3Chead%3E%0D%0A%09%3Ctitle%3EVirtual%20Document%3C%2Ftitle%3E%0D%0A%3C%2Fhead%3E%0D%0A%3Cbody%20style%3D%22margin%3A%200%3B%20overflow%3A%20hidden%3B%20width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3C%2Fbody%3E%0D%0A%3C%2Fhtml%3E') {
				return true;
			}
			const srcUri: any = URI.parse(source.toLowerCase()).toString();
			return srcUri.startsWith(URI.file(this.environmentService.appRoot.toLowerCase()).toString());
		};

		app.on('web-contents-created', (event: any, contents) => {
			contents.on('will-attach-webview', (event: Electron.Event, webPreferences, params) => {
				delete webPreferences.preload;
				webPreferences.nodeIntegration = false;

				// Verify URLs being loaded
				if (isValidWebviewSource(params.src) && isValidWebviewSource(webPreferences.preloadURL)) {
					return;
				}

				// Otherwise prevent loading
				this.logService.error('webContents#web-contents-created: Prevented webview attach');
				event.preventDefault();
			});

			contents.on('will-navigate', event => {
				this.logService.error('webContents#will-navigate: Prevented webcontent navigation');
				event.preventDefault();
			});
		});

		let macOpenFiles: string[] = [];
		let runningTimeout: number = null;
		app.on('open-file', (event: Event, path: string) => {
			this.logService.trace('App#open-file: ', path);
			event.preventDefault();

			// Keep in array because more might come!
			macOpenFiles.push(path);

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
						pathsToOpen: macOpenFiles,
						preferNewWindow: true /* dropping on the dock or opening from finder prefers to open in a new window */
					});
					macOpenFiles = [];
					runningTimeout = null;
				}
			}, 100);
		});

		app.on('new-window-for-tab', () => {
			this.windowsMainService.openNewWindow(OpenContext.DESKTOP); //macOS native tab "+" button
		});

		ipc.on('vscode:exit', (event: any, code: number) => {
			this.logService.trace('IPC#vscode:exit', code);

			this.dispose();
			this.lifecycleService.kill(code);
		});

		ipc.on('vscode:fetchShellEnv', event => {
			const webContents = event.sender.webContents;
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

		ipc.on('vscode:broadcast', (event: any, windowId: number, broadcast: { channel: string; payload: any; }) => {
			if (this.windowsMainService && broadcast.channel && !isUndefinedOrNull(broadcast.payload)) {
				this.logService.trace('IPC#vscode:broadcast', broadcast.channel, broadcast.payload);

				// Handle specific events on main side
				this.onBroadcast(broadcast.channel, broadcast.payload);

				// Send to all windows (except sender window)
				this.windowsMainService.sendToAll('vscode:broadcast', broadcast, [windowId]);
			}
		});

		// Keyboard layout changes
		KeyboardLayoutMonitor.INSTANCE.onDidChangeKeyboardLayout(() => {
			if (this.windowsMainService) {
				this.windowsMainService.sendToAll('vscode:keyboardLayoutChanged', false);
			}
		});
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

			this.stateService.setItem(CodeWindow.themeStorageKey, data.id);
			this.stateService.setItem(CodeWindow.themeBackgroundStorageKey, data.background);
		}
	}

	public startup(): TPromise<void> {
		this.logService.debug('Starting VS Code');
		this.logService.debug(`from: ${this.environmentService.appRoot}`);
		this.logService.debug('args:', this.environmentService.args);

		// Backup local storage (TODO@Ben remove me after a while)
		this.logService.trace('Backing up localStorage if needed...');
		return this.backupLocalStorage().then(() => {

			// Make sure we associate the program with the app user model id
			// This will help Windows to associate the running program with
			// any shortcut that is pinned to the taskbar and prevent showing
			// two icons in the taskbar for the same app.
			if (platform.isWindows && product.win32AppUserModelId) {
				app.setAppUserModelId(product.win32AppUserModelId);
			}

			// Create Electron IPC Server
			this.electronIpcServer = new ElectronIPCServer();

			// Resolve unique machine ID
			this.logService.trace('Resolving machine identifier...');
			return this.resolveMachineId().then(machineId => {
				this.logService.trace(`Resolved machine identifier: ${machineId}`);

				// Spawn shared process
				this.sharedProcess = new SharedProcess(this.environmentService, this.lifecycleService, this.logService, machineId, this.userEnv);
				this.sharedProcessClient = this.sharedProcess.whenReady().then(() => connect(this.environmentService.sharedIPCHandle, 'main'));

				// Services
				const appInstantiationService = this.initServices(machineId);

				// Create driver
				if (this.environmentService.driverHandle) {
					const driver = appInstantiationService.createInstance(Driver);

					serve(this.environmentService.driverHandle, driver).then(server => {
						this.logService.info('Driver started at:', this.environmentService.driverHandle);
						this.toDispose.push(server);
					}, err => {
						this.logService.error('Failed to start driver running at:', this.environmentService.driverHandle);
					});
				}

				// Setup Auth Handler
				const authHandler = appInstantiationService.createInstance(ProxyAuthHandler);
				this.toDispose.push(authHandler);

				// Open Windows
				appInstantiationService.invokeFunction(accessor => this.openFirstWindow(accessor));

				// Post Open Windows Tasks
				appInstantiationService.invokeFunction(accessor => this.afterWindowOpen(accessor));
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

	private backupLocalStorage(): TPromise<void> {
		const localStorageBackedUp = this.stateService.getItem<string>(CodeApplication.LOCAL_STORAGE_BACKED_UP_KEY);
		if (localStorageBackedUp) {
			return TPromise.wrap(void 0);
		}

		const afterBackupDone = () => {

			// Remember in global storage
			this.stateService.setItem(CodeApplication.LOCAL_STORAGE_BACKED_UP_KEY, true);
		};

		const localStorageFile = join(this.environmentService.userDataPath, 'Local Storage', 'file__0.localstorage');
		const localStorageJournalFile = join(this.environmentService.userDataPath, 'Local Storage', 'file__0.localstorage-journal');

		return copy(localStorageFile, `${localStorageFile}.vscbak`).then(() => copy(localStorageJournalFile, `${localStorageJournalFile}.vscbak`)).then(afterBackupDone, afterBackupDone);
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

		services.set(IWindowsMainService, new SyncDescriptor(WindowsManager, machineId));
		services.set(IWindowsService, new SyncDescriptor(WindowsService, this.sharedProcess));
		services.set(ILaunchService, new SyncDescriptor(LaunchService));
		services.set(IIssueService, new SyncDescriptor(IssueService, machineId, this.userEnv));

		// Telemtry
		if (this.environmentService.isBuilt && !this.environmentService.isExtensionDevelopment && !this.environmentService.args['disable-telemetry'] && !!product.enableTelemetry) {
			const channel = getDelayedChannel<ITelemetryAppenderChannel>(this.sharedProcessClient.then(c => c.getChannel('telemetryAppender')));
			const appender = new TelemetryAppenderClient(channel);
			const commonProperties = resolveCommonProperties(product.commit, pkg.version, machineId, this.environmentService.installSourcePath);
			const piiPaths = [this.environmentService.appRoot, this.environmentService.extensionsPath];
			const config: ITelemetryServiceConfig = { appender, commonProperties, piiPaths };

			services.set(ITelemetryService, new SyncDescriptor(TelemetryService, config));
		} else {
			services.set(ITelemetryService, NullTelemetryService);
		}

		return this.instantiationService.createChild(services);
	}

	private openFirstWindow(accessor: ServicesAccessor): void {
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
		this.sharedProcessClient.done(client => client.registerChannel('windows', windowsChannel));

		const urlService = accessor.get(IURLService);
		const urlChannel = new URLServiceChannel(urlService);
		this.electronIpcServer.registerChannel('url', urlChannel);

		// Log level management
		const logLevelChannel = new LogLevelSetterChannel(accessor.get(ILogService));
		this.electronIpcServer.registerChannel('loglevel', logLevelChannel);
		this.sharedProcessClient.done(client => client.registerChannel('loglevel', logLevelChannel));

		// Lifecycle
		this.lifecycleService.ready();

		// Propagate to clients
		this.windowsMainService = accessor.get(IWindowsMainService); // TODO@Joao: unfold this

		const args = this.environmentService.args;

		// Create a URL handler which forwards to the last active window
		const activeWindowManager = new ActiveWindowManager(windowsService);
		const urlHandlerChannel = this.electronIpcServer.getChannel('urlHandler', { route: () => activeWindowManager.activeClientId });
		const multiplexURLHandler = new URLHandlerChannelClient(urlHandlerChannel);

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
		if (args['new-window'] && args._.length === 0) {
			this.windowsMainService.open({ context, cli: args, forceNewWindow: true, forceEmpty: true, initialStartup: true }); // new window if "-n" was used without paths
		} else if (macOpenFiles && macOpenFiles.length && (!args._ || !args._.length)) {
			this.windowsMainService.open({ context: OpenContext.DOCK, cli: args, pathsToOpen: macOpenFiles, initialStartup: true }); // mac: open-file event received on startup
		} else {
			this.windowsMainService.open({ context, cli: args, forceNewWindow: args['new-window'] || (!args._.length && args['unity-launch']), diffMode: args.diff, initialStartup: true }); // default: read paths from cli
		}
	}

	private afterWindowOpen(accessor: ServicesAccessor): void {
		const appInstantiationService = accessor.get(IInstantiationService);
		const windowsMainService = accessor.get(IWindowsMainService);

		let windowsMutex: Mutex = null;
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

		// Install Menu
		appInstantiationService.createInstance(CodeMenu);

		// Jump List
		this.historyMainService.updateWindowsJumpList();
		this.historyMainService.onRecentlyOpenedChange(() => this.historyMainService.updateWindowsJumpList());

		// Start shared process here
		this.sharedProcess.spawn();
	}

	private dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}
