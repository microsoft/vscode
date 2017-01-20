/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { app, ipcMain as ipc, BrowserWindow } from 'electron';
import { assign } from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { parseMainProcessArgv } from 'vs/platform/environment/node/argv';
import { mkdirp } from 'vs/base/node/pfs';
import { validatePaths } from 'vs/code/electron-main/paths';
import { IWindowsMainService, WindowsManager, OpenContext } from 'vs/code/electron-main/windows';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { WindowsChannel } from 'vs/platform/windows/common/windowsIpc';
import { WindowsService } from 'vs/platform/windows/electron-main/windowsService';
import { LifecycleService, ILifecycleService } from 'vs/code/electron-main/lifecycle';
import { VSCodeMenu } from 'vs/code/electron-main/menus';
import { getShellEnvironment } from 'vs/code/electron-main/shellEnv';
import { IUpdateService } from 'vs/platform/update/common/update';
import { UpdateChannel } from 'vs/platform/update/common/updateIpc';
import { UpdateService } from 'vs/platform/update/electron-main/updateService';
import { Server as ElectronIPCServer } from 'vs/base/parts/ipc/electron-main/ipc.electron-main';
import { Server, serve, connect } from 'vs/base/parts/ipc/node/ipc.net';
import { TPromise } from 'vs/base/common/winjs.base';
import { AskpassChannel } from 'vs/workbench/parts/git/common/gitIpc';
import { GitAskpassService } from 'vs/workbench/parts/git/electron-main/askpassService';
import { spawnSharedProcess } from 'vs/code/node/sharedProcess';
import { Mutex } from 'windows-mutex';
import { IDisposable } from 'vs/base/common/lifecycle';
import { LaunchService, ILaunchChannel, LaunchChannel, LaunchChannelClient, ILaunchService } from './launch';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService, MainLogService } from 'vs/code/electron-main/log';
import { IStorageService, StorageService } from 'vs/code/electron-main/storage';
import { IBackupMainService } from 'vs/platform/backup/common/backup';
import { BackupChannel } from 'vs/platform/backup/common/backupIpc';
import { BackupMainService } from 'vs/platform/backup/electron-main/backupMainService';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { IRequestService } from 'vs/platform/request/node/request';
import { RequestService } from 'vs/platform/request/node/requestService';
import { IURLService } from 'vs/platform/url/common/url';
import { URLChannel } from 'vs/platform/url/common/urlIpc';
import { URLService } from 'vs/platform/url/electron-main/urlService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITelemetryAppenderChannel, TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';
import { getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import * as fs from 'original-fs';


ipc.on('vscode:fetchShellEnv', (event, windowId) => {
	const win = BrowserWindow.fromId(windowId);
	getShellEnvironment().then(shellEnv => {
		win.webContents.send('vscode:acceptShellEnv', shellEnv);
	}, err => {
		win.webContents.send('vscode:acceptShellEnv', {});
		console.error('Error fetching shell env', err);
	});
});

function quit(accessor: ServicesAccessor, errorOrMessage?: Error | string): void {
	const logService = accessor.get(ILogService);

	let exitCode = 0;
	if (typeof errorOrMessage === 'string') {
		logService.log(errorOrMessage);
	} else if (errorOrMessage) {
		exitCode = 1; // signal error to the outside
		if (errorOrMessage.stack) {
			console.error(errorOrMessage.stack);
		} else {
			console.error('Startup error: ' + errorOrMessage.toString());
		}
	}

	process.exit(exitCode); // in main, process.exit === app.exit
}

// TODO@Joao wow this is huge, clean up!
function main(accessor: ServicesAccessor, mainIpcServer: Server, userEnv: platform.IProcessEnvironment): void {
	const instantiationService = accessor.get(IInstantiationService);
	const logService = accessor.get(ILogService);
	const environmentService = accessor.get(IEnvironmentService);
	const lifecycleService = accessor.get(ILifecycleService);
	const configurationService = accessor.get(IConfigurationService) as ConfigurationService<any>;
	let windowsMainService: IWindowsMainService;

	// We handle uncaught exceptions here to prevent electron from opening a dialog to the user
	process.on('uncaughtException', (err: any) => {
		if (err) {

			// take only the message and stack property
			const friendlyError = {
				message: err.message,
				stack: err.stack
			};

			// handle on client side
			if (windowsMainService) {
				windowsMainService.sendToFocused('vscode:reportError', JSON.stringify(friendlyError));
			}
		}

		console.error('[uncaught exception in main]: ' + err);
		if (err.stack) {
			console.error(err.stack);
		}
	});

	logService.log('Starting VS Code in verbose mode');
	logService.log(`from: ${environmentService.appRoot}`);
	logService.log('args:', environmentService.args);

	// Setup Windows mutex
	let windowsMutex: Mutex = null;
	if (platform.isWindows) {
		try {
			const Mutex = (<any>require.__$__nodeRequire('windows-mutex')).Mutex;
			windowsMutex = new Mutex(product.win32MutexName);
		} catch (e) {
			// noop
		}
	}

	// Register Main IPC services
	const askpassService = new GitAskpassService();
	const askpassChannel = new AskpassChannel(askpassService);
	mainIpcServer.registerChannel('askpass', askpassChannel);

	// Create Electron IPC Server
	const electronIpcServer = new ElectronIPCServer();

	// Spawn shared process
	const initData = { args: environmentService.args };
	const options = {
		allowOutput: !environmentService.isBuilt || environmentService.verbose,
		debugPort: environmentService.isBuilt ? null : 5871
	};

	let sharedProcessDisposable: IDisposable;

	const sharedProcess = spawnSharedProcess(initData, options).then(disposable => {
		sharedProcessDisposable = disposable;
		return connect(environmentService.sharedIPCHandle, 'main');
	});

	// Create a new service collection, because the telemetry service
	// requires a connection to shared process, which was only established
	// now.
	const services = new ServiceCollection();

	services.set(IUpdateService, new SyncDescriptor(UpdateService));
	services.set(IWindowsMainService, new SyncDescriptor(WindowsManager));
	services.set(IWindowsService, new SyncDescriptor(WindowsService));
	services.set(ILaunchService, new SyncDescriptor(LaunchService));

	if (environmentService.isBuilt && !environmentService.isExtensionDevelopment && !!product.enableTelemetry) {
		const channel = getDelayedChannel<ITelemetryAppenderChannel>(sharedProcess.then(c => c.getChannel('telemetryAppender')));
		const appender = new TelemetryAppenderClient(channel);
		const commonProperties = resolveCommonProperties(product.commit, pkg.version);
		const piiPaths = [environmentService.appRoot, environmentService.extensionsPath];
		const config: ITelemetryServiceConfig = { appender, commonProperties, piiPaths };
		services.set(ITelemetryService, new SyncDescriptor(TelemetryService, config));
	} else {
		services.set(ITelemetryService, NullTelemetryService);
	}

	const instantiationService2 = instantiationService.createChild(services);

	instantiationService2.invokeFunction(accessor => {
		// TODO@Joao: unfold this
		windowsMainService = accessor.get(IWindowsMainService);

		// Register more Main IPC services
		const launchService = accessor.get(ILaunchService);
		const launchChannel = new LaunchChannel(launchService);
		mainIpcServer.registerChannel('launch', launchChannel);

		// Register more Electron IPC services
		const updateService = accessor.get(IUpdateService);
		const updateChannel = new UpdateChannel(updateService);
		electronIpcServer.registerChannel('update', updateChannel);

		const urlService = accessor.get(IURLService);
		const urlChannel = instantiationService2.createInstance(URLChannel, urlService);
		electronIpcServer.registerChannel('url', urlChannel);

		const backupService = accessor.get(IBackupMainService);
		const backupChannel = instantiationService2.createInstance(BackupChannel, backupService);
		electronIpcServer.registerChannel('backup', backupChannel);

		const windowsService = accessor.get(IWindowsService);
		const windowsChannel = new WindowsChannel(windowsService);
		electronIpcServer.registerChannel('windows', windowsChannel);
		sharedProcess.done(client => client.registerChannel('windows', windowsChannel));

		// Make sure we associate the program with the app user model id
		// This will help Windows to associate the running program with
		// any shortcut that is pinned to the taskbar and prevent showing
		// two icons in the taskbar for the same app.
		if (platform.isWindows && product.win32AppUserModelId) {
			app.setAppUserModelId(product.win32AppUserModelId);
		}

		function dispose() {
			if (mainIpcServer) {
				mainIpcServer.dispose();
				mainIpcServer = null;
			}

			if (sharedProcessDisposable) {
				sharedProcessDisposable.dispose();
			}

			if (windowsMutex) {
				windowsMutex.release();
			}

			configurationService.dispose();
		}

		// Dispose on app quit
		app.on('will-quit', () => {
			logService.log('App#will-quit: disposing resources');

			dispose();
		});

		// Dispose on vscode:exit
		ipc.on('vscode:exit', (event, code: number) => {
			logService.log('IPC#vscode:exit', code);

			dispose();
			process.exit(code); // in main, process.exit === app.exit
		});

		// Lifecycle
		lifecycleService.ready();

		// Propagate to clients
		windowsMainService.ready(userEnv);

		// Open our first window
		const context = !!process.env['VSCODE_CLI'] ? OpenContext.CLI : OpenContext.OTHER;
		if (environmentService.args['new-window'] && environmentService.args._.length === 0) {
			windowsMainService.open({ context, cli: environmentService.args, forceNewWindow: true, forceEmpty: true, initialStartup: true }); // new window if "-n" was used without paths
		} else if (global.macOpenFiles && global.macOpenFiles.length && (!environmentService.args._ || !environmentService.args._.length)) {
			windowsMainService.open({ context: OpenContext.DOCK, cli: environmentService.args, pathsToOpen: global.macOpenFiles, initialStartup: true }); // mac: open-file event received on startup
		} else {
			windowsMainService.open({ context, cli: environmentService.args, forceNewWindow: environmentService.args['new-window'] || environmentService.args['new-window-if-not-first'], diffMode: environmentService.args.diff, initialStartup: true }); // default: read paths from cli
		}

		// Install Menu
		instantiationService2.createInstance(VSCodeMenu);
	});
}

function setupIPC(accessor: ServicesAccessor): TPromise<Server> {
	const logService = accessor.get(ILogService);
	const environmentService = accessor.get(IEnvironmentService);

	function allowSetForegroundWindow(service: LaunchChannelClient): TPromise<void> {
		let promise = TPromise.as(null);
		if (platform.isWindows) {
			promise = service.getMainProcessId()
				.then(processId => {
					logService.log('Sending some foreground love to the running instance:', processId);

					try {
						const { allowSetForegroundWindow } = <any>require.__$__nodeRequire('windows-foreground-love');
						allowSetForegroundWindow(processId);
					} catch (e) {
						// noop
					}
				});
		}

		return promise;
	}

	function setup(retry: boolean): TPromise<Server> {
		return serve(environmentService.mainIPCHandle).then(server => {
			if (platform.isMacintosh) {
				app.dock.show(); // dock might be hidden at this case due to a retry
			}

			return server;
		}, err => {
			if (err.code !== 'EADDRINUSE') {
				return TPromise.wrapError(err);
			}

			// Since we are the second instance, we do not want to show the dock
			if (platform.isMacintosh) {
				app.dock.hide();
			}

			// there's a running instance, let's connect to it
			return connect(environmentService.mainIPCHandle, 'main').then(
				client => {

					// Tests from CLI require to be the only instance currently (TODO@Ben support multiple instances and output)
					if (environmentService.extensionTestsPath && !environmentService.debugExtensionHost.break) {
						const msg = 'Running extension tests from the command line is currently only supported if no other instance of Code is running.';
						console.error(msg);
						client.dispose();
						return TPromise.wrapError(msg);
					}

					logService.log('Sending env to running instance...');

					const channel = client.getChannel<ILaunchChannel>('launch');
					const service = new LaunchChannelClient(channel);

					return allowSetForegroundWindow(service)
						.then(() => service.start(environmentService.args, process.env))
						.then(() => client.dispose())
						.then(() => TPromise.wrapError('Sent env to running instance. Terminating...'));
				},
				err => {
					if (!retry || platform.isWindows || err.code !== 'ECONNREFUSED') {
						return TPromise.wrapError(err);
					}

					// it happens on Linux and OS X that the pipe is left behind
					// let's delete it, since we can't connect to it
					// and the retry the whole thing
					try {
						fs.unlinkSync(environmentService.mainIPCHandle);
					} catch (e) {
						logService.log('Fatal error deleting obsolete instance handle', e);
						return TPromise.wrapError(e);
					}

					return setup(false);
				}
			);
		});
	}

	return setup(true);
}


function createPaths(environmentService: IEnvironmentService): TPromise<any> {
	const paths = [
		environmentService.appSettingsHome,
		environmentService.userProductHome,
		environmentService.extensionsPath,
		environmentService.nodeCachedDataDir
	];
	return TPromise.join(paths.map(p => mkdirp(p))) as TPromise<any>;
}

function createServices(args: ParsedArgs): IInstantiationService {
	const services = new ServiceCollection();

	services.set(IEnvironmentService, new SyncDescriptor(EnvironmentService, args, process.execPath));
	services.set(ILogService, new SyncDescriptor(MainLogService));
	services.set(ILifecycleService, new SyncDescriptor(LifecycleService));
	services.set(IStorageService, new SyncDescriptor(StorageService));
	services.set(IConfigurationService, new SyncDescriptor(ConfigurationService));
	services.set(IRequestService, new SyncDescriptor(RequestService));
	services.set(IURLService, new SyncDescriptor(URLService, args['open-url']));
	services.set(IBackupMainService, new SyncDescriptor(BackupMainService));

	return new InstantiationService(services, true);
}

function start(): void {
	let args: ParsedArgs;

	try {
		args = parseMainProcessArgv(process.argv);
		args = validatePaths(args);
	} catch (err) {
		console.error(err.message);
		process.exit(1);
		return;
	}

	const instantiationService = createServices(args);


	return instantiationService.invokeFunction(accessor => {
		const environmentService = accessor.get(IEnvironmentService);
		const instanceEnv: typeof process.env = {
			VSCODE_PID: String(process.pid),
			VSCODE_IPC_HOOK: environmentService.mainIPCHandle,
			VSCODE_SHARED_IPC_HOOK: environmentService.sharedIPCHandle,
			VSCODE_NLS_CONFIG: process.env['VSCODE_NLS_CONFIG']
		};

		// Patch `process.env` with the instance's environment
		assign(process.env, instanceEnv);

		return instantiationService.invokeFunction(a => createPaths(a.get(IEnvironmentService)))
			.then(() => instantiationService.invokeFunction(setupIPC))
			.then(mainIpcServer => instantiationService.invokeFunction(main, mainIpcServer, instanceEnv));
	}).done(null, err => instantiationService.invokeFunction(quit, err));
}

start();
