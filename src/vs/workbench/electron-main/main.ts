/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {app} from 'electron';
import fs = require('fs');
import nls = require('vs/nls');
import {assign} from 'vs/base/common/objects';
import platform = require('vs/base/common/platform');
import env = require('vs/workbench/electron-main/env');
import windows = require('vs/workbench/electron-main/windows');
import window = require('vs/workbench/electron-main/window');
import lifecycle = require('vs/workbench/electron-main/lifecycle');
import menu = require('vs/workbench/electron-main/menus');
import settings = require('vs/workbench/electron-main/settings');
import {Instance as UpdateManager} from 'vs/workbench/electron-main/update-manager';
import {Server, serve, connect} from 'vs/base/node/service.net';
import {getUserEnvironment} from 'vs/base/node/env';
import {TPromise} from 'vs/base/common/winjs.base';
import {GitAskpassService} from 'vs/workbench/parts/git/electron-main/askpassService';
import {spawnSharedProcess} from 'vs/workbench/electron-main/sharedProcess';
import {Mutex} from 'windows-mutex';

export class LaunchService {
	public start(args: env.ICommandLineArguments, userEnv: env.IProcessEnvironment): TPromise<void> {
		env.log('Received data from other instance', args);

		// Otherwise handle in windows manager
		let usedWindows: window.VSCodeWindow[];
		if (!!args.extensionDevelopmentPath) {
			windows.manager.openPluginDevelopmentHostWindow({ cli: args, userEnv: userEnv });
		} else if (args.pathArguments.length === 0 && args.openNewWindow) {
			usedWindows = windows.manager.open({ cli: args, userEnv: userEnv, forceNewWindow: true, forceEmpty: true });
		} else if (args.pathArguments.length === 0) {
			usedWindows = [windows.manager.focusLastActive(args)];
		} else {
			usedWindows = windows.manager.open({
				cli: args,
				userEnv: userEnv,
				forceNewWindow: args.waitForWindowClose || args.openNewWindow,
				preferNewWindow: !args.openInSameWindow,
				diffMode: args.diffMode
			});
		}

		// If the other instance is waiting to be killed, we hook up a window listener if one window
		// is being used and only then resolve the startup promise which will kill this second instance
		if (args.waitForWindowClose && usedWindows && usedWindows.length === 1 && usedWindows[0]) {
			const windowId = usedWindows[0].id;

			return new TPromise<void>((c, e) => {

				const unbind = windows.onClose(id => {
					if (id === windowId) {
						unbind();
						c(null);
					}
				});
			});
		}

		return TPromise.as(null);
	}
}

// We handle uncaught exceptions here to prevent electron from opening a dialog to the user
process.on('uncaughtException', (err: any) => {
	if (err) {

		// take only the message and stack property
		let friendlyError = {
			message: err.message,
			stack: err.stack
		};

		// handle on client side
		windows.manager.sendToFocused('vscode:reportError', JSON.stringify(friendlyError));
	}

	console.error('[uncaught exception in main]: ' + err);
	if (err.stack) {
		console.error(err.stack);
	}
});

function quit(error?: Error);
function quit(message?: string);
function quit(arg?: any) {
	let exitCode = 0;
	if (typeof arg === 'string') {
		env.log(arg);
	} else {
		exitCode = 1; // signal error to the outside
		if (arg.stack) {
			console.error(arg.stack);
		} else {
			console.error('Startup error: ' + arg.toString());
		}
	}

	process.exit(exitCode);
}

function main(ipcServer: Server, userEnv: env.IProcessEnvironment): void {
	env.log('### VSCode main.js ###');
	env.log(env.appRoot, env.cliArgs);

	// Setup Windows mutex
	let windowsMutex: Mutex = null;
	try {
		const Mutex = (<any>require.__$__nodeRequire('windows-mutex')).Mutex;
		windowsMutex = new Mutex(env.product.win32MutexName);
	} catch (e) {
		// noop
	}

	// Register IPC services
	ipcServer.registerService('LaunchService', new LaunchService());
	ipcServer.registerService('GitAskpassService', new GitAskpassService());

	// Used by sub processes to communicate back to the main instance
	process.env['VSCODE_PID'] = '' + process.pid;
	process.env['VSCODE_IPC_HOOK'] = env.mainIPCHandle;
	process.env['VSCODE_SHARED_IPC_HOOK'] = env.sharedIPCHandle;

	// Spawn shared process
	const sharedProcess = spawnSharedProcess();

	// Make sure we associate the program with the app user model id
	// This will help Windows to associate the running program with
	// any shortcut that is pinned to the taskbar and prevent showing
	// two icons in the taskbar for the same app.
	if (platform.isWindows && env.product.win32AppUserModelId) {
		app.setAppUserModelId(env.product.win32AppUserModelId);
	}

	// Set programStart in the global scope
	global.programStart = env.cliArgs.programStart;

	// Dispose on app quit
	app.on('will-quit', () => {
		env.log('App#dispose: deleting running instance handle');

		if (ipcServer) {
			ipcServer.dispose();
			ipcServer = null;
		}

		sharedProcess.dispose();

		if (windowsMutex) {
			windowsMutex.release();
		}
	});

	// Lifecycle
	lifecycle.manager.ready();

	// Load settings
	settings.manager.loadSync();

	// Propagate to clients
	windows.manager.ready(userEnv);

	// Install Menu
	menu.manager.ready();

	// Install Tasks
	if (platform.isWindows && env.isBuilt) {
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
	UpdateManager.initialize();

	// Open our first window
	if (env.cliArgs.openNewWindow && env.cliArgs.pathArguments.length === 0) {
		windows.manager.open({ cli: env.cliArgs, forceNewWindow: true, forceEmpty: true }); // new window if "-n" was used without paths
	} else if (global.macOpenFiles && global.macOpenFiles.length && (!env.cliArgs.pathArguments || !env.cliArgs.pathArguments.length)) {
		windows.manager.open({ cli: env.cliArgs, pathsToOpen: global.macOpenFiles }); // mac: open-file event received on startup
	} else {
		windows.manager.open({ cli: env.cliArgs, forceNewWindow: env.cliArgs.openNewWindow, diffMode: env.cliArgs.diffMode }); // default: read paths from cli
	}
}

function setupIPC(): TPromise<Server> {
	function setup(retry: boolean): TPromise<Server> {
		return serve(env.mainIPCHandle).then(null, err => {
			if (err.code !== 'EADDRINUSE') {
				return TPromise.wrapError(err);
			}

			// Since we are the second instance, we do not want to show the dock
			if (platform.isMacintosh) {
				app.dock.hide();
			}

			// Tests from CLI require to be the only instance currently (TODO@Ben support multiple instances and output)
			if (env.isTestingFromCli) {
				const errorMsg = 'Running extension tests from the command line is currently only supported if no other instance of Code is running.';
				console.error(errorMsg);

				return TPromise.wrapError(errorMsg);
			}

			// there's a running instance, let's connect to it
			return connect(env.mainIPCHandle).then(
				client => {
					env.log('Sending env to running instance...');

					const service = client.getService<LaunchService>('LaunchService', LaunchService);

					return service.start(env.cliArgs, process.env)
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
						fs.unlinkSync(env.mainIPCHandle);
					} catch (e) {
						env.log('Fatal error deleting obsolete instance handle', e);
						return TPromise.wrapError(e);
					}

					return setup(false);
				}
			);
		});
	}

	return setup(true);
}

// On some platforms we need to manually read from the global environment variables
// and assign them to the process environment (e.g. when doubleclick app on Mac)
getUserEnvironment()
	.then(userEnv => {
		assign(process.env, userEnv);
		// Make sure the NLS Config travels to the rendered process
		// See also https://github.com/Microsoft/vscode/issues/4558
		userEnv['VSCODE_NLS_CONFIG'] = process.env['VSCODE_NLS_CONFIG'];
		return setupIPC()
			.then(ipcServer => main(ipcServer, userEnv));
	})
	.done(null, quit);