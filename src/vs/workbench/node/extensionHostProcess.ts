/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { ExtensionHostMain, exit } from 'vs/workbench/node/extensionHostMain';
import { IRemoteCom, createProxyProtocol } from 'vs/platform/extensions/common/ipcRemoteCom';
import { parse } from 'vs/base/common/marshalling';
import { IInitData } from 'vs/workbench/api/node/extHost.protocol';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { Protocol } from 'vs/base/parts/ipc/node/ipc.net';
import { createConnection } from 'net';
import Event, { filterEvent } from 'vs/base/common/event';

interface IRendererConnection {
	remoteCom: IRemoteCom;
	initData: IInitData;
}

// This calls exit directly in case the initialization is not finished and we need to exit
// Otherwise, if initialization completed we go to extensionHostMain.terminate()
let onTerminate = function () {
	exit();
};

function createExtHostProtocol(): TPromise<IMessagePassingProtocol> {

	const pipeName = process.env.VSCODE_IPC_HOOK_EXTHOST;

	return new TPromise<IMessagePassingProtocol>((resolve, reject) => {

		const socket = createConnection(pipeName, () => {
			socket.removeListener('error', reject);
			resolve(new Protocol(socket));
		});
		socket.once('error', reject);

	}).then(protocol => {

		return new class implements IMessagePassingProtocol {

			private _terminating = false;

			readonly onMessage: Event<any> = filterEvent(protocol.onMessage, msg => {
				if (msg.type !== '__$terminate') {
					return true;
				}
				this._terminating = true;
				onTerminate();
				return false;
			});

			send(msg: any): void {
				if (!this._terminating) {
					protocol.send(msg);
				}
			}
		};
	});
}

function connectToRenderer(protocol: IMessagePassingProtocol): TPromise<IRendererConnection> {
	return new TPromise<IRendererConnection>((c, e) => {

		// Listen init data message
		const first = protocol.onMessage(raw => {
			first.dispose();

			const initData = parse(raw);
			const remoteCom = createProxyProtocol(protocol);

			// Print a console message when rejection isn't handled within N seconds. For details:
			// see https://nodejs.org/api/process.html#process_event_unhandledrejection
			// and https://nodejs.org/api/process.html#process_event_rejectionhandled
			const unhandledPromises: TPromise<any>[] = [];
			process.on('unhandledRejection', (reason, promise) => {
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
			process.on('rejectionHandled', promise => {
				const idx = unhandledPromises.indexOf(promise);
				if (idx >= 0) {
					unhandledPromises.splice(idx, 1);
				}
			});

			// Print a console message when an exception isn't handled.
			process.on('uncaughtException', function (err) {
				onUnexpectedError(err);
			});

			// Kill oneself if one's parent dies. Much drama.
			setInterval(function () {
				try {
					process.kill(initData.parentPid, 0); // throws an exception if the main process doesn't exist anymore.
				} catch (e) {
					onTerminate();
				}
			}, 5000);

			// Tell the outside that we are initialized
			protocol.send('initialized');

			c({ remoteCom, initData });
		});

		// Tell the outside that we are ready to receive messages
		protocol.send('ready');
	});
}

createExtHostProtocol().then(protocol => {
	// connect to main side
	return connectToRenderer(protocol);
}).then(renderer => {
	// setup things
	const extensionHostMain = new ExtensionHostMain(renderer.remoteCom, renderer.initData);
	onTerminate = () => extensionHostMain.terminate();
	return extensionHostMain.start();
}).done(null, err => console.error(err));
