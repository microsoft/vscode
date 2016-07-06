/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as fs from 'original-fs';
import { app, ipcMain as ipc } from 'electron';
import { assign } from 'vs/base/common/objects';
import { mkdirp } from 'vs/base/node/pfs';
import * as platform from 'vs/base/common/platform';
import { IProcessEnvironment, IEnvironmentService, EnvService } from 'vs/code/electron-main/env';
import { IWindowsService, WindowsManager } from 'vs/code/electron-main/windows';
import { ILifecycleService, LifecycleService } from 'vs/code/electron-main/lifecycle';
import { VSCodeMenu } from 'vs/code/electron-main/menus';
import { ISettingsService, SettingsManager } from 'vs/code/electron-main/settings';
import { IUpdateService, UpdateManager } from 'vs/code/electron-main/update-manager';
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
import * as cp from 'child_process';
import * as ansiregex from 'ansi-regex';

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

function main(accessor: ServicesAccessor, ipcServer: Server, userEnv: IProcessEnvironment): void {
	const instantiationService = accessor.get(IInstantiationService);
	const logService = accessor.get(ILogService);
	const envService = accessor.get(IEnvironmentService);
	const windowsService = accessor.get(IWindowsService);
	const lifecycleService = accessor.get(ILifecycleService);
	const updateService = accessor.get(IUpdateService);
	const settingsService = accessor.get(ISettingsService);

	// We handle uncaught exceptions here to prevent electron from opening a dialog to the user
	process.on('uncaughtException', (err: any) => {
		if (err) {

			// take only the message and stack property
			let friendlyError = {
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

	// Register IPC services
	const launchService = instantiationService.createInstance(LaunchService);
	const launchChannel = new LaunchChannel(launchService);
	ipcServer.registerChannel('launch', launchChannel);

	const askpassService = new GitAskpassService();
	const askpassChannel = new AskpassChannel(askpassService);
	ipcServer.registerChannel('askpass', askpassChannel);

	// Used by sub processes to communicate back to the main instance
	process.env['VSCODE_PID'] = '' + process.pid;
	process.env['VSCODE_IPC_HOOK'] = envService.mainIPCHandle;
	process.env['VSCODE_SHARED_IPC_HOOK'] = envService.sharedIPCHandle;

	// Spawn shared process
	const sharedProcess = spawnSharedProcess(!envService.isBuilt || envService.cliArgs.verboseLogging);

	// Make sure we associate the program with the app user model id
	// This will help Windows to associate the running program with
	// any shortcut that is pinned to the taskbar and prevent showing
	// two icons in the taskbar for the same app.
	if (platform.isWindows && envService.product.win32AppUserModelId) {
		app.setAppUserModelId(envService.product.win32AppUserModelId);
	}

	// Set programStart in the global scope
	global.programStart = envService.cliArgs.programStart;

	function dispose() {
		if (ipcServer) {
			ipcServer.dispose();
			ipcServer = null;
		}

		sharedProcess.dispose();

		if (windowsMutex) {
			windowsMutex.release();
		}
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

	// Load settings
	settingsService.loadSync();

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
	if (envService.cliArgs.openNewWindow && envService.cliArgs.pathArguments.length === 0) {
		windowsService.open({ cli: envService.cliArgs, forceNewWindow: true, forceEmpty: true }); // new window if "-n" was used without paths
	} else if (global.macOpenFiles && global.macOpenFiles.length && (!envService.cliArgs.pathArguments || !envService.cliArgs.pathArguments.length)) {
		windowsService.open({ cli: envService.cliArgs, pathsToOpen: global.macOpenFiles }); // mac: open-file event received on startup
	} else {
		windowsService.open({ cli: envService.cliArgs, forceNewWindow: envService.cliArgs.openNewWindow, diffMode: envService.cliArgs.diffMode }); // default: read paths from cli
	}
}

function setupIPC(accessor: ServicesAccessor): TPromise<Server> {
	const logService = accessor.get(ILogService);
	const envService = accessor.get(IEnvironmentService);

	function setup(retry: boolean): TPromise<Server> {
		return serve(envService.mainIPCHandle).then(server => {
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
			return connect(envService.mainIPCHandle).then(
				client => {

					// Tests from CLI require to be the only instance currently (TODO@Ben support multiple instances and output)
					if (envService.isTestingFromCli) {
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
						fs.unlinkSync(envService.mainIPCHandle);
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

// TODO@Joao: what about in the cli process?
function createPaths(accessor: ServicesAccessor): TPromise<void> {
	const environmentService = accessor.get(IEnvironmentService);

	return TPromise.join([
		mkdirp(environmentService.appSettingsHome),
		mkdirp(environmentService.userHome),
		mkdirp(environmentService.userExtensionsHome)
	]) as any as TPromise<void>;
}

// TODO: isolate
const services = new ServiceCollection();

services.set(IEnvironmentService, new SyncDescriptor(EnvService));
services.set(ILogService, new SyncDescriptor(MainLogService));
services.set(IWindowsService, new SyncDescriptor(WindowsManager));
services.set(ILifecycleService, new SyncDescriptor(LifecycleService));
services.set(IStorageService, new SyncDescriptor(StorageService));
services.set(IUpdateService, new SyncDescriptor(UpdateManager));
services.set(ISettingsService, new SyncDescriptor(SettingsManager));

const instantiationService = new InstantiationService(services);

interface IEnv {
	[key: string]: string;
}

function getUnixUserEnvironment(): TPromise<IEnv> {
	const promise = new TPromise((c, e) => {
		const runAsNode = process.env['ELECTRON_RUN_AS_NODE'];
		const noAttach = process.env['ELECTRON_NO_ATTACH_CONSOLE'];

		const env = assign({}, process.env, {
			ELECTRON_RUN_AS_NODE: '1',
			ELECTRON_NO_ATTACH_CONSOLE: '1'
		});

		const command = `'${process.execPath}' -p 'JSON.stringify(process.env)'`;
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

			const raw = Buffer
				.concat(buffers)
				.toString('utf8')
				// remove regular ANSI escape sequences
				.replace(ansiregex(), '')
				// remove OSC ANSI escape sequences
				.replace(/\u001b\].*?(\u0007|\u001b\\)/g, '');

			try {
				const env = JSON.parse(raw);

				if (runAsNode) {
					env['ELECTRON_RUN_AS_NODE'] = runAsNode;
				} else {
					delete env['ELECTRON_RUN_AS_NODE'];
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

function getUserEnvironment(): TPromise<IEnv> {
	return platform.isWindows ? TPromise.as({}) : getUnixUserEnvironment();
}

// On some platforms we need to manually read from the global environment variables
// and assign them to the process environment (e.g. when doubleclick app on Mac)
getUserEnvironment()
	.then(userEnv => {
		if (process.env['VSCODE_CLI'] !== '1') {
			assign(process.env, userEnv);
		}

		// Make sure the NLS Config travels to the rendered process
		// See also https://github.com/Microsoft/vscode/issues/4558
		userEnv['VSCODE_NLS_CONFIG'] = process.env['VSCODE_NLS_CONFIG'];

		return instantiationService.invokeFunction(createPaths)
			.then(() => instantiationService.invokeFunction(setupIPC))
			.then(ipcServer => instantiationService.invokeFunction(main, ipcServer, userEnv));
	})
	.done(null, err => instantiationService.invokeFunction(quit, err));