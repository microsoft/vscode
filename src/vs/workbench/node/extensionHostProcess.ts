/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { ExtensionHostMain, exit } from 'vs/workbench/node/extensionHostMain';
import { IInitData } from 'vs/workbench/api/node/extHost.protocol';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { connect, Client } from 'vs/base/parts/ipc/node/ipc.net';
import { Event } from 'vs/base/common/event';
import * as nativeWatchdog from 'native-watchdog';
import { RPCProtocol } from 'vs/workbench/services/extensions/node/rpcProtocol.ipc';

// With Electron 2.x and node.js 8.x the "natives" module
// can cause a native crash (see https://github.com/nodejs/node/issues/19891 and
// https://github.com/electron/electron/issues/10905). To prevent this from
// happening we essentially blocklist this module from getting loaded in any
// extension by patching the node require() function.
(function () {
	const Module = require.__$__nodeRequire('module') as any;
	const originalLoad = Module._load;

	Module._load = function (request) {
		if (request === 'natives') {
			throw new Error('Either the extension or a NPM dependency is using the "natives" node module which is unsupported as it can cause a crash of the extension host. Click [here](https://go.microsoft.com/fwlink/?linkid=871887) to find out more');
		}

		return originalLoad.apply(this, arguments);
	};
})();

// This calls exit directly in case the initialization is not finished and we need to exit
// Otherwise, if initialization completed we go to extensionHostMain.terminate()
let onTerminate = function () {
	exit();
};

function setup(initData: IInitData): void {
	// Print a console message when rejection isn't handled within N seconds. For details:
	// see https://nodejs.org/api/process.html#process_event_unhandledrejection
	// and https://nodejs.org/api/process.html#process_event_rejectionhandled
	const unhandledPromises: Promise<any>[] = [];
	process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
		unhandledPromises.push(promise);
		setTimeout(() => {
			const idx = unhandledPromises.indexOf(promise);
			if (idx >= 0) {
				unhandledPromises.splice(idx, 1);
				console.warn('rejected promise not handled within 1 second');
				onUnexpectedError(reason);
			}
		}, 1000);
	});

	process.on('rejectionHandled', (promise: Promise<any>) => {
		const idx = unhandledPromises.indexOf(promise);
		if (idx >= 0) {
			unhandledPromises.splice(idx, 1);
		}
	});

	// Print a console message when an exception isn't handled.
	process.on('uncaughtException', function (err: Error) {
		onUnexpectedError(err);
	});

	// Kill oneself if one's parent dies. Much drama.
	setInterval(function () {
		try {
			process.kill(initData.parentPid, 0); // throws an exception if the main process doesn't exist anymore.
		} catch (e) {
			onTerminate();
		}
	}, 1000);

	// In certain cases, the event loop can become busy and never yield
	// e.g. while-true or process.nextTick endless loops
	// So also use the native node module to do it from a separate thread
	let watchdog: typeof nativeWatchdog;
	try {
		watchdog = require.__$__nodeRequire('native-watchdog');
		watchdog.start(initData.parentPid);
	} catch (err) {
		// no problem...
		onUnexpectedError(err);
	}
}

async function init(client: Client): Promise<void> {
	// register a lifecycle channel and expect a terminate call
	client.registerChannel('lifecycle', new class implements IChannel {
		call<T>(command: string): Thenable<T> {
			if (command === 'terminate') {
				onTerminate();
			}

			return Promise.resolve(null);
		}

		listen<T>(): Event<T> { throw new Error('Method not implemented.'); }
	});

	// get the other end's lifecycle channel and start initialization
	const channel = client.getChannel('lifecycle');

	// get initData and setup
	const initData = await channel.call<IInitData>('init');
	setup(initData);

	// let renderer know we're done
	await channel.call<void>('initDone');

	// here, instead of this, we must create an rpcProtocol instance which
	// is based on the IPC layer and not on the IMessagePassingProtocol
	const rpcProtocol = new RPCProtocol(client, client);

	// bootstrap extension host main
	const extensionHostMain = new ExtensionHostMain(rpcProtocol, initData);
	onTerminate = () => extensionHostMain.terminate();
	return extensionHostMain.start();
}

patchExecArgv();

connect(process.env.VSCODE_IPC_HOOK_EXTHOST, 'exthost')
	.then(init)
	.then(null, err => console.error(err));

function patchExecArgv() {
	// when encountering the prevent-inspect flag we delete this
	// and the prior flag
	if (process.env.VSCODE_PREVENT_FOREIGN_INSPECT) {
		for (let i = 0; i < process.execArgv.length; i++) {
			if (process.execArgv[i].match(/--inspect-brk=\d+|--inspect=\d+/)) {
				process.execArgv.splice(i, 1);
				break;
			}
		}
	}
}
