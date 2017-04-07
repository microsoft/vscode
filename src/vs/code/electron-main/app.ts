/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { app, ipcMain as ipc, BrowserWindow } from 'electron';
import * as platform from 'vs/base/common/platform';
import { OpenContext } from 'vs/code/common/windows';
import { IWindowsMainService, WindowsManager } from 'vs/code/electron-main/windows';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { WindowsChannel } from 'vs/platform/windows/common/windowsIpc';
import { WindowsService } from 'vs/platform/windows/electron-main/windowsService';
import { ILifecycleService } from 'vs/code/electron-main/lifecycle';
import { VSCodeMenu } from 'vs/code/electron-main/menus';
import { getShellEnvironment } from 'vs/code/electron-main/shellEnv';
import { IUpdateService } from 'vs/platform/update/common/update';
import { UpdateChannel } from 'vs/platform/update/common/updateIpc';
import { UpdateService } from 'vs/platform/update/electron-main/updateService';
import { Server as ElectronIPCServer } from 'vs/base/parts/ipc/electron-main/ipc.electron-main';
import { Server, connect, Client } from 'vs/base/parts/ipc/node/ipc.net';
import { AskpassChannel } from 'vs/workbench/parts/git/common/gitIpc';
import { GitAskpassService } from 'vs/workbench/parts/git/electron-main/askpassService';
import { SharedProcess } from 'vs/code/electron-main/sharedProcess';
import { Mutex } from 'windows-mutex';
import { LaunchService, LaunchChannel, ILaunchService } from './launch';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService } from 'vs/code/electron-main/log';
import { IStorageService } from 'vs/code/electron-main/storage';
import { IBackupMainService } from 'vs/platform/backup/common/backup';
import { BackupChannel } from 'vs/platform/backup/common/backupIpc';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IURLService } from 'vs/platform/url/common/url';
import { URLChannel } from 'vs/platform/url/common/urlIpc';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITelemetryAppenderChannel, TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { resolveCommonProperties, machineIdStorageKey, machineIdIpcChannel } from 'vs/platform/telemetry/node/commonProperties';
import { getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import { IDisposable, dispose } from "vs/base/common/lifecycle";
import { ConfigurationService } from "vs/platform/configuration/node/configurationService";
import { TPromise } from "vs/base/common/winjs.base";

export class VSCodeApplication {
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
		@IStorageService private storageService: IStorageService
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

			console.error('[uncaught exception in main]: ' + err);
			if (err.stack) {
				console.error(err.stack);
			}
		});

		app.on('will-quit', () => {
			this.logService.log('App#will-quit: disposing resources');

			this.dispose();
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
			const win = BrowserWindow.fromId(windowId);
			getShellEnvironment().then(shellEnv => {
				win.webContents.send('vscode:acceptShellEnv', shellEnv);
			}, err => {
				win.webContents.send('vscode:acceptShellEnv', {});
				console.error('Error fetching shell env', err);
			});
		});
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

		// Register Main IPC connections
		const askpassService = new GitAskpassService();
		const askpassChannel = new AskpassChannel(askpassService);
		this.mainIpcServer.registerChannel('askpass', askpassChannel);

		// Create Electron IPC Server
		this.electronIpcServer = new ElectronIPCServer();

		// Spawn shared process
		this.sharedProcess = new SharedProcess(this.environmentService, this.userEnv);
		this.toDispose.push(this.sharedProcess);
		this.sharedProcessClient = this.sharedProcess.whenReady()
			.then(() => connect(this.environmentService.sharedIPCHandle, 'main'));

		// Services
		const appInstantiationService = this.initServices();

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
		this.windowsMainService.onWindowClose(() => {
			if (!platform.isMacintosh && this.windowsMainService.getWindowCount() === 0) {
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

		const backupService = accessor.get(IBackupMainService);
		const backupChannel = appInstantiationService.createInstance(BackupChannel, backupService);
		this.electronIpcServer.registerChannel('backup', backupChannel);

		const windowsService = accessor.get(IWindowsService);
		const windowsChannel = new WindowsChannel(windowsService);
		this.electronIpcServer.registerChannel('windows', windowsChannel);
		this.sharedProcessClient.done(client => client.registerChannel('windows', windowsChannel));

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
		appInstantiationService.createInstance(VSCodeMenu);

		// Jump List
		this.windowsMainService.updateWindowsJumpList();
		this.windowsMainService.onRecentPathsChange(() => this.windowsMainService.updateWindowsJumpList());

		// Start shared process here
		this.sharedProcess.spawn();
	}

	private dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}