/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import platform = require('vs/base/common/platform');
import { serve, Server, connect } from 'vs/base/parts/ipc/node/ipc.net';
import { TPromise } from 'vs/base/common/winjs.base';

// Services
import { IConfiguration } from 'vs/platform/workspace/common/workspace';
import { WorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { EventService } from 'vs/platform/event/common/eventService';

// Extra services
import { ExtensionsChannel } from 'vs/workbench/parts/extensions/common/extensionsIpc';
import { ExtensionsService } from 'vs/workbench/parts/extensions/node/extensionsService';

interface IInitData {
	configuration: IConfiguration;
	contextServiceOptions: { settings: any };
}

function quit(err?: Error) {
	if (err) {
		console.error(err);
	}

	process.exit(err ? 1 : 0);
}

/**
 * Plan B is to kill oneself if one's parent dies. Much drama.
 */
function setupPlanB(parentPid: number): void {
	setInterval(function () {
		try {
			process.kill(parentPid, 0); // throws an exception if the main process doesn't exist anymore.
		} catch (e) {
			process.exit();
		}
	}, 5000);
}

function main(server: Server, initData: IInitData): void {
	const eventService = new EventService();
	const contextService = new WorkspaceContextService(eventService, null, initData.configuration, initData.contextServiceOptions);
	const extensionService = new ExtensionsService(contextService);
	const channel = new ExtensionsChannel(extensionService);

	server.registerChannel('extensions', channel);

	// eventually clean up old extensions
	setTimeout(() => extensionService.removeDeprecatedExtensions(), 5000);
}

function setupIPC(hook: string): TPromise<Server> {
	function setup(retry: boolean): TPromise<Server> {
		return serve(hook).then(null, err => {
			if (!retry || platform.isWindows || err.code !== 'EADDRINUSE') {
				return TPromise.wrapError(err);
			}

			// should retry, not windows and eaddrinuse

			return connect(hook).then(
				client => {
					// we could connect to a running instance. this is not good, abort
					client.dispose();
					return TPromise.wrapError(new Error('There is an instance already running.'));
				},
				err => {
					// it happens on Linux and OS X that the pipe is left behind
					// let's delete it, since we can't connect to it
					// and the retry the whole thing
					try {
						fs.unlinkSync(hook);
					} catch (e) {
						return TPromise.wrapError(new Error('Error deleting the shared ipc hook.'));
					}

					return setup(false);
				}
			);
		});
	}

	return setup(true);
}

function handshake(): TPromise<IInitData> {
	return new TPromise<IInitData>((c, e) => {
		process.once('message', c);
		process.once('error', e);
		process.send('hello');
	});
}

TPromise.join<any>([setupIPC(process.env['VSCODE_SHARED_IPC_HOOK']), handshake()])
	.then(r => main(r[0], r[1]))
	.then(() => setupPlanB(process.env['VSCODE_PID']))
	.done(null, quit);