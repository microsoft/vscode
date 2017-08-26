/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { app, ipcMain as ipc, BrowserWindow } from 'electron';
import * as platform from 'vs/base/common/platform';
import { WindowsManager } from 'vs/code/electron-main/windows';
import { IWindowsService, OpenContext } from 'vs/platform/windows/common/windows';
import { WindowsChannel } from 'vs/platform/windows/common/windowsIpc';
import { WindowsService } from 'vs/platform/windows/electron-main/windowsService';
import { ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { CodeMenu } from 'vs/code/electron-main/menus';
import { getShellEnvironment } from 'vs/code/node/shellEnv';
import { IUpdateService } from 'vs/platform/update/common/update';
import { UpdateChannel } from 'vs/platform/update/common/updateIpc';
import { UpdateService } from 'vs/platform/update/electron-main/updateService';
import { Server as ElectronIPCServer } from 'vs/base/parts/ipc/electron-main/ipc.electron-main';
import { Server, connect, Client } from 'vs/base/parts/ipc/node/ipc.net';
import { SharedProcess } from 'vs/code/electron-main/sharedProcess';
import { Mutex } from 'windows-mutex';
import { LaunchService, LaunchChannel, ILaunchService } from './launch';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/node/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IURLService } from 'vs/platform/url/common/url';
import { URLChannel } from 'vs/platform/url/common/urlIpc';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITelemetryAppenderChannel, TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { CredentialsService } from 'vs/platform/credentials/node/credentialsService';
import { CredentialsChannel } from 'vs/platform/credentials/node/credentialsIpc';
import { resolveCommonProperties, machineIdStorageKey, machineIdIpcChannel } from 'vs/platform/telemetry/node/commonProperties';
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
import { dirname, join } from 'path';
import { touch } from 'vs/base/node/pfs';

export class CodeApplication {

	private static APP_ICON_REFRESH_KEY = 'macOSAppIconRefresh';

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
		@IConfigurationService private configurationService: ConfigurationService<any>,
		@IStorageService private storageService: IStorageService,
		@IHistoryMainService private historyService: IHistoryMainService
	) {
		this.toDispose = [mainIpcServer, configurationService];

		this.registerListeners();
	}

	private registerListeners(): void {

		// We handle uncaught exceptions here to prevent electron from opening a dialog to the user
		process.on('uncaughtException', (err: any) => {
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
		});

		app.on('will-quit', () => {
			this.logService.log('App#will-quit: disposing resources');

			this.dispose();
		});

		app.on('accessibility-support-changed', (event: Event, accessibilitySupportEnabled: boolean) => {
			if (this.windowsMainService) {
				this.windowsMainService.sendToAll('vscode:accessibilitySupportChanged', accessibilitySupportEnabled);
			}
		});

		app.on('activate', (event: Event, hasVisibleWindows: boolean) => {
			this.logService.log('App#activate');

			// Mac only event: open new window when we get activated
			if (!hasVisibleWindows && this.windowsMainService) {
				this.windowsMainService.openNewWindow(OpenContext.DOCK);
			}
		});

		const isValidWebviewSource = (source: string) =>
			!source || (URI.parse(source.toLowerCase()).toString() as any).startsWith(URI.file(this.environmentService.appRoot.toLowerCase()).toString());

		app.on('web-contents-created', (event, contents) => {
			contents.on('will-attach-webview', (event, webPreferences, params) => {
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
			this.logService.log('App#open-file: ', path);
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

		ipc.on('vscode:exit', (event, code: number) => {
			this.logService.log('IPC#vscode:exit', code);

			this.dispose();
			this.lifecycleService.kill(code);
		});

		ipc.on(machineIdIpcChannel, (event, machineId: string) => {
			this.logService.log('IPC#vscode-machineId');
			this.storageService.setItem(machineIdStorageKey, machineId);
		});

		ipc.on('vscode:fetchShellEnv', (event, windowId) => {
			const { webContents } = BrowserWindow.fromId(windowId);
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

		ipc.on('vscode:broadcast', (event, windowId: number, broadcast: { channel: string; payload: any; }) => {
			if (this.windowsMainService && broadcast.channel && !isUndefinedOrNull(broadcast.payload)) {
				this.logService.log('IPC#vscode:broadcast', broadcast.channel, broadcast.payload);

				// Handle specific events on main side
				this.onBroadcast(broadcast.channel, broadcast.payload);

				// Send to all windows (except sender window)
				this.windowsMainService.sendToAll('vscode:broadcast', broadcast, [windowId]);
			}
		});

		// Keyboard layout changes
		KeyboardLayoutMonitor.INSTANCE.onDidChangeKeyboardLayout(isISOKeyboard => {
			if (this.windowsMainService) {
				this.windowsMainService.sendToAll('vscode:keyboardLayoutChanged', isISOKeyboard);
			}
		});
	}

	private onBroadcast(event: string, payload: any): void {

		// Theme changes
		if (event === 'vscode:changeColorTheme' && typeof payload === 'string') {
			let data = JSON.parse(payload);

			this.storageService.setItem(CodeWindow.themeStorageKey, data.id);
			this.storageService.setItem(CodeWindow.themeBackgroundStorageKey, data.background);
		}
	}

	public startup(): void {
		this.logService.log('Starting VS Code in verbose mode');
		this.logService.log(`from: ${this.environmentService.appRoot}`);
		this.logService.log('args:', this.environmentService.args);

		// Make sure we associate the program with the app user model id
		// This will help Windows to associate the running program with
		// any shortcut that is pinned to the taskbar and prevent showing
		// two icons in the taskbar for the same app.
		if (platform.isWindows && product.win32AppUserModelId) {
			app.setAppUserModelId(product.win32AppUserModelId);
		}

		// Create Electron IPC Server
		this.electronIpcServer = new ElectronIPCServer();

		// Spawn shared process
		this.sharedProcess = new SharedProcess(this.environmentService, this.userEnv);
		this.toDispose.push(this.sharedProcess);
		this.sharedProcessClient = this.sharedProcess.whenReady().then(() => connect(this.environmentService.sharedIPCHandle, 'main'));

		// Services
		const appInstantiationService = this.initServices();

		// Setup Auth Handler
		const authHandler = appInstantiationService.createInstance(ProxyAuthHandler);
		this.toDispose.push(authHandler);

		// Open Windows
		appInstantiationService.invokeFunction(accessor => this.openFirstWindow(accessor));

		// Post Open Windows Tasks
		appInstantiationService.invokeFunction(accessor => this.afterWindowOpen(accessor));
	}

	private initServices(): IInstantiationService {
		const services = new ServiceCollection();

		services.set(IUpdateService, new SyncDescriptor(UpdateService));
		services.set(IWindowsMainService, new SyncDescriptor(WindowsManager));
		services.set(IWindowsService, new SyncDescriptor(WindowsService, this.sharedProcess));
		services.set(ILaunchService, new SyncDescriptor(LaunchService));
		services.set(ICredentialsService, new SyncDescriptor(CredentialsService));

		// Telemtry
		if (this.environmentService.isBuilt && !this.environmentService.isExtensionDevelopment && !!product.enableTelemetry) {
			const channel = getDelayedChannel<ITelemetryAppenderChannel>(this.sharedProcessClient.then(c => c.getChannel('telemetryAppender')));
			const appender = new TelemetryAppenderClient(channel);
			const commonProperties = resolveCommonProperties(product.commit, pkg.version)
				.then(result => Object.defineProperty(result, 'common.machineId', {
					get: () => this.storageService.getItem(machineIdStorageKey),
					enumerable: true
				}));
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

		// TODO@Joao: unfold this
		this.windowsMainService = accessor.get(IWindowsMainService);

		// TODO@Joao: so ugly...
		this.windowsMainService.onWindowsCountChanged(e => {
			if (!platform.isMacintosh && e.newCount === 0) {
				this.sharedProcess.dispose();
			}
		});

		// Register more Main IPC services
		const launchService = accessor.get(ILaunchService);
		const launchChannel = new LaunchChannel(launchService);
		this.mainIpcServer.registerChannel('launch', launchChannel);

		// Register more Electron IPC services
		const updateService = accessor.get(IUpdateService);
		const updateChannel = new UpdateChannel(updateService);
		this.electronIpcServer.registerChannel('update', updateChannel);

		const urlService = accessor.get(IURLService);
		const urlChannel = appInstantiationService.createInstance(URLChannel, urlService);
		this.electronIpcServer.registerChannel('url', urlChannel);

		const workspacesService = accessor.get(IWorkspacesMainService);
		const workspacesChannel = appInstantiationService.createInstance(WorkspacesChannel, workspacesService);
		this.electronIpcServer.registerChannel('workspaces', workspacesChannel);

		const windowsService = accessor.get(IWindowsService);
		const windowsChannel = new WindowsChannel(windowsService);
		this.electronIpcServer.registerChannel('windows', windowsChannel);
		this.sharedProcessClient.done(client => client.registerChannel('windows', windowsChannel));

		const credentialsService = accessor.get(ICredentialsService);
		const credentialsChannel = new CredentialsChannel(credentialsService);
		this.electronIpcServer.registerChannel('credentials', credentialsChannel);

		// Lifecycle
		this.lifecycleService.ready();

		// Propagate to clients
		this.windowsMainService.ready(this.userEnv);

		// Open our first window
		const args = this.environmentService.args;
		const context = !!process.env['VSCODE_CLI'] ? OpenContext.CLI : OpenContext.DESKTOP;
		if (args['new-window'] && args._.length === 0) {
			this.windowsMainService.open({ context, cli: args, forceNewWindow: true, forceEmpty: true, initialStartup: true }); // new window if "-n" was used without paths
		} else if (global.macOpenFiles && global.macOpenFiles.length && (!args._ || !args._.length)) {
			this.windowsMainService.open({ context: OpenContext.DOCK, cli: args, pathsToOpen: global.macOpenFiles, initialStartup: true }); // mac: open-file event received on startup
		} else {
			this.windowsMainService.open({ context, cli: args, forceNewWindow: args['new-window'] || (!args._.length && args['unity-launch']), diffMode: args.diff, initialStartup: true }); // default: read paths from cli
		}
	}

	private afterWindowOpen(accessor: ServicesAccessor): void {
		const appInstantiationService = accessor.get(IInstantiationService);

		// Setup Windows mutex
		let windowsMutex: Mutex = null;
		if (platform.isWindows) {
			try {
				const Mutex = (require.__$__nodeRequire('windows-mutex') as any).Mutex;
				windowsMutex = new Mutex(product.win32MutexName);
				this.toDispose.push({ dispose: () => windowsMutex.release() });
			} catch (e) {
				// noop
			}
		}

		// Install Menu
		appInstantiationService.createInstance(CodeMenu);

		// Jump List
		this.historyService.updateWindowsJumpList();
		this.historyService.onRecentlyOpenedChange(() => this.historyService.updateWindowsJumpList());

		// Start shared process here
		this.sharedProcess.spawn();

		// Helps application icon refresh after an update with new icon is installed (macOS)
		// TODO@Ben remove after a couple of releases
		if (platform.isMacintosh) {
			if (!this.storageService.getItem(CodeApplication.APP_ICON_REFRESH_KEY)) {
				this.storageService.setItem(CodeApplication.APP_ICON_REFRESH_KEY, true);

				// 'exe' => /Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron
				const appPath = dirname(dirname(dirname(app.getPath('exe'))));
				const infoPlistPath = join(appPath, 'Contents', 'Info.plist');
				touch(appPath).done(null, error => { /* ignore */ });
				touch(infoPlistPath).done(null, error => { /* ignore */ });
			}
		}
	}

	private dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}
