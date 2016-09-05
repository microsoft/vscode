/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as fs from 'original-fs';
import { app, ipcMain as ipc } from 'electron';
import { assign } from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { parseMainProcessArgv, ParsedArgs } from 'vs/platform/environment/node/argv';
import { mkdirp } from 'vs/base/node/pfs';
import { IProcessEnvironment, IEnvService, EnvService } from 'vs/code/electron-main/env';
import { IWindowsService, WindowsManager } from 'vs/code/electron-main/windows';
import { ILifecycleService, LifecycleService } from 'vs/code/electron-main/lifecycle';
import { VSCodeMenu } from 'vs/code/electron-main/menus';
import { IUpdateService, UpdateManager } from 'vs/code/electron-main/update-manager';
import { Server as ElectronIPCServer } from 'vs/base/parts/ipc/common/ipc.electron';
import { Server, serve, connect } from 'vs/base/parts/ipc/node/ipc.net';
import { TPromise } from 'vs/base/common/winjs.base';
import { AskpassChannel } from 'vs/workbench/parts/git/common/gitIpc';
import { GitAskpassService } from 'vs/workbench/parts/git/electron-main/askpassService';
import { spawnSharedProcess } from 'vs/code/electron-main/sharedProcess';
import { Mutex } from 'windows-mutex';
import { LaunchService, ILaunchChannel, LaunchChannel, LaunchChannelClient } from './launch';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService, MainLogService } from 'vs/code/electron-main/log';
import { IStorageService, StorageService } from 'vs/code/electron-main/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { IRequestService } from 'vs/platform/request/common/request';
import { RequestService } from 'vs/platform/request/node/requestService';
import * as cp from 'child_process';
import { generateUuid } from 'vs/base/common/uuid';
import { URLChannel } from 'vs/platform/url/common/urlIpc';
import { URLService } from 'vs/platform/url/electron-main/urlService';

function quit(accessor: ServicesAccessor, error?: Error);
function quit(accessor: ServicesAccessor, message?: string);
function quit(accessor: ServicesAccessor, arg?: any) {
	const logService = accessor.get(ILogService);

	let exitCode = 0;
	if (typeof arg === 'string') {
		logService.log(arg);
	} else {
		exitCode = 1; // signal error to the outside
		if (arg.stack) {
			console.error(arg.stack);
		} else {
			console.error('Startup error: ' + arg.toString());
		}
	}

	process.exit(exitCode); // in main, process.exit === app.exit
}

function main(accessor: ServicesAccessor, mainIpcServer: Server, userEnv: IProcessEnvironment): void {
	const instantiationService = accessor.get(IInstantiationService);
	const logService = accessor.get(ILogService);
	const envService = accessor.get(IEnvService);
	const windowsService = accessor.get(IWindowsService);
	const lifecycleService = accessor.get(ILifecycleService);
	const updateService = accessor.get(IUpdateService);
	const configurationService = accessor.get(IConfigurationService) as ConfigurationService<any>;

	// We handle uncaught exceptions here to prevent electron from opening a dialog to the user
	process.on('uncaughtException', (err: any) => {
		if (err) {

			// take only the message and stack property
			const friendlyError = {
				message: err.message,
				stack: err.stack
			};

			// handle on client side
			windowsService.sendToFocused('vscode:reportError', JSON.stringify(friendlyError));
		}

		console.error('[uncaught exception in main]: ' + err);
		if (err.stack) {
			console.error(err.stack);
		}
	});

	logService.log('### VSCode main.js ###');
	logService.log(envService.appRoot, envService.cliArgs);

	// Setup Windows mutex
	let windowsMutex: Mutex = null;
	try {
		const Mutex = (<any>require.__$__nodeRequire('windows-mutex')).Mutex;
		windowsMutex = new Mutex(envService.product.win32MutexName);
	} catch (e) {
		// noop
	}

	// Register Main IPC services
	const launchService = instantiationService.createInstance(LaunchService);
	const launchChannel = new LaunchChannel(launchService);
	mainIpcServer.registerChannel('launch', launchChannel);

	const askpassService = new GitAskpassService();
	const askpassChannel = new AskpassChannel(askpassService);
	mainIpcServer.registerChannel('askpass', askpassChannel);

	// Create Electron IPC Server
	const electronIpcServer = new ElectronIPCServer(ipc);

	// Register Electron IPC services
	const urlService = instantiationService.createInstance(URLService);
	const urlChannel = instantiationService.createInstance(URLChannel, urlService);
	electronIpcServer.registerChannel('url', urlChannel);

	// Spawn shared process
	const sharedProcess = spawnSharedProcess({
		allowOutput: !envService.isBuilt || envService.cliArgs.verbose,
		debugPort: envService.isBuilt ? null : 5871
	});

	// Make sure we associate the program with the app user model id
	// This will help Windows to associate the running program with
	// any shortcut that is pinned to the taskbar and prevent showing
	// two icons in the taskbar for the same app.
	if (platform.isWindows && envService.product.win32AppUserModelId) {
		app.setAppUserModelId(envService.product.win32AppUserModelId);
	}

	function dispose() {
		if (mainIpcServer) {
			mainIpcServer.dispose();
			mainIpcServer = null;
		}

		sharedProcess.dispose();

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
	windowsService.ready(userEnv);

	// Install Menu
	const menu = instantiationService.createInstance(VSCodeMenu);
	menu.ready();

	// Install Tasks
	if (platform.isWindows && envService.isBuilt) {
		app.setUserTasks([
			{
				title: nls.localize('newWindow', "New Window"),
				program: process.execPath,
				arguments: '-n', // force new window
				iconPath: process.execPath,
				iconIndex: 0
			}
		]);
	}

	// Setup auto update
	updateService.initialize();

	// Open our first window
	if (envService.cliArgs['new-window'] && envService.cliArgs.paths.length === 0) {
		windowsService.open({ cli: envService.cliArgs, forceNewWindow: true, forceEmpty: true }); // new window if "-n" was used without paths
	} else if (global.macOpenFiles && global.macOpenFiles.length && (!envService.cliArgs.paths || !envService.cliArgs.paths.length)) {
		windowsService.open({ cli: envService.cliArgs, pathsToOpen: global.macOpenFiles }); // mac: open-file event received on startup
	} else {
		windowsService.open({ cli: envService.cliArgs, forceNewWindow: envService.cliArgs['new-window'], diffMode: envService.cliArgs.diff }); // default: read paths from cli
	}
}

function setupIPC(accessor: ServicesAccessor): TPromise<Server> {
	const logService = accessor.get(ILogService);
	const environmentService = accessor.get(IEnvironmentService);
	const envService = accessor.get(IEnvService);

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
			return connect(environmentService.mainIPCHandle).then(
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

					return service.start(envService.cliArgs, process.env)
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

interface IEnv {
	[key: string]: string;
}

function getUnixShellEnvironment(): TPromise<IEnv> {
	const promise = new TPromise((c, e) => {
		const runAsNode = process.env['ATOM_SHELL_INTERNAL_RUN_AS_NODE'];
		const noAttach = process.env['ELECTRON_NO_ATTACH_CONSOLE'];
		const mark = generateUuid().replace(/-/g, '').substr(0, 12);
		const regex = new RegExp(mark + '(.*)' + mark);

		const env = assign({}, process.env, {
			ATOM_SHELL_INTERNAL_RUN_AS_NODE: '1',
			ELECTRON_NO_ATTACH_CONSOLE: '1'
		});

		const command = `'${process.execPath}' -p '"${ mark }" + JSON.stringify(process.env) + "${ mark }"'`;
		const child = cp.spawn(process.env.SHELL, ['-ilc', command], {
			detached: true,
			stdio: ['ignore', 'pipe', process.stderr],
			env
		});

		const buffers: Buffer[] = [];
		child.on('error', () => c({}));
		child.stdout.on('data', b => buffers.push(b));

		child.on('close', (code: number, signal: any) => {
			if (code !== 0) {
				return e(new Error('Failed to get environment'));
			}

			const raw = Buffer.concat(buffers).toString('utf8');
			const match = regex.exec(raw);
			const rawStripped = match ? match[1] : '{}';

			try {
				const env = JSON.parse(rawStripped);

				if (runAsNode) {
					env['ATOM_SHELL_INTERNAL_RUN_AS_NODE'] = runAsNode;
				} else {
					delete env['ATOM_SHELL_INTERNAL_RUN_AS_NODE'];
				}

				if (noAttach) {
					env['ELECTRON_NO_ATTACH_CONSOLE'] = noAttach;
				} else {
					delete env['ELECTRON_NO_ATTACH_CONSOLE'];
				}

				c(env);
			} catch (err) {
				e(err);
			}
		});
	});

	// swallow errors
	return promise.then(null, () => ({}));
}

/**
 * We eed to get the environment from a user's shell.
 * This should only be done when Code itself is not launched
 * from within a shell.
 */
function getShellEnvironment(): TPromise<IEnv> {
	if (process.env['VSCODE_CLI'] === '1') {
		return TPromise.as({});
	}

	if (platform.isWindows) {
		return TPromise.as({});
	}

	return getUnixShellEnvironment();
}

/**
 * Returns the user environment necessary for all Code processes.
 * Such environment needs to be propagated to the renderer/shared
 * processes.
 */
function getEnvironment(accessor: ServicesAccessor): TPromise<IEnv> {
	const environmentService = accessor.get(IEnvironmentService);

	return getShellEnvironment().then(shellEnv => {
		const instanceEnv = {
			VSCODE_PID: String(process.pid),
			VSCODE_IPC_HOOK: environmentService.mainIPCHandle,
			VSCODE_SHARED_IPC_HOOK: environmentService.sharedIPCHandle,
			VSCODE_NLS_CONFIG: process.env['VSCODE_NLS_CONFIG']
		};

		return assign({}, shellEnv, instanceEnv);
	});
}

function createPaths(environmentService: IEnvironmentService): TPromise<any> {
	const paths = [environmentService.appSettingsHome, environmentService.userHome, environmentService.extensionsPath];
	return TPromise.join(paths.map(p => mkdirp(p))) as TPromise<any>;
}

function start(): void {
	let args: ParsedArgs;

	try {
		args = parseMainProcessArgv(process.argv);
	} catch (err) {
		console.error(err.message);
		process.exit(1);
		return;
	}

	// TODO: isolate
	const services = new ServiceCollection();

	services.set(IEnvironmentService, new SyncDescriptor(EnvironmentService, args, process.execPath));
	services.set(IEnvService, new SyncDescriptor(EnvService));
	services.set(ILogService, new SyncDescriptor(MainLogService));
	services.set(IWindowsService, new SyncDescriptor(WindowsManager));
	services.set(ILifecycleService, new SyncDescriptor(LifecycleService));
	services.set(IStorageService, new SyncDescriptor(StorageService));
	services.set(IConfigurationService, new SyncDescriptor(ConfigurationService));
	services.set(IRequestService, new SyncDescriptor(RequestService));
	services.set(IUpdateService, new SyncDescriptor(UpdateManager));

	const instantiationService = new InstantiationService(services);

	// On some platforms we need to manually read from the global environment variables
	// and assign them to the process environment (e.g. when doubleclick app on Mac)
	return instantiationService.invokeFunction(accessor => {
		return getEnvironment(accessor).then(env => {
			assign(process.env, env);

			return instantiationService.invokeFunction(a => createPaths(a.get(IEnvironmentService)))
				.then(() => instantiationService.invokeFunction(setupIPC))
				.then(mainIpcServer => instantiationService.invokeFunction(main, mainIpcServer, env));
		});
	})
	.done(null, err => instantiationService.invokeFunction(quit, err));
}

start();