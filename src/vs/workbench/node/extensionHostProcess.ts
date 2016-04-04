/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { ExtensionHostMain, createServices, IInitData, exit } from 'vs/workbench/node/extensionHostMain';
import { Client, connect } from 'vs/base/node/service.net';
import { create as createIPC, IMainProcessExtHostIPC } from 'vs/platform/extensions/common/ipcRemoteCom';
import marshalling = require('vs/base/common/marshalling');

interface IRendererConnection {
	remoteCom: IMainProcessExtHostIPC;
	initData: IInitData;
}

// This calls exit directly in case the initialization is not finished and we need to exit
// Otherwise, if initialization completed we go to extensionHostMain.terminate()
let onTerminate = function() {
	exit();
};

function connectToRenderer(): TPromise<IRendererConnection> {
	return new TPromise<IRendererConnection>((c, e) => {
		const stats: number[] = [];

		// Listen init data message
		process.once('message', raw => {

			let msg = marshalling.parse(raw);

			const remoteCom = createIPC(data => {
				process.send(data);
				stats.push(data.length);
			});

			// Listen to all other messages
			process.on('message', (msg) => {
				if (msg.type === '__$terminate') {
					onTerminate();
					return;
				}
				remoteCom.handle(msg);
			});

			// Print a console message when rejection isn't handled within N seconds. For details:
			// see https://nodejs.org/api/process.html#process_event_unhandledrejection
			// and https://nodejs.org/api/process.html#process_event_rejectionhandled
			const unhandledPromises: Promise<any>[] = [];
			process.on('unhandledRejection', (reason, promise) => {
				unhandledPromises.push(promise);
				setTimeout(() => {
					const idx = unhandledPromises.indexOf(promise);
					if (idx >= 0) {
						unhandledPromises.splice(idx, 1);
						console.warn('rejected promise not handled with 1 second');
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
			process.on('uncaughtException', function(err) {
				onUnexpectedError(err);
			});

			// Kill oneself if one's parent dies. Much drama.
			setInterval(function () {
				try {
					process.kill(msg.parentPid, 0); // throws an exception if the main process doesn't exist anymore.
				} catch (e) {
					onTerminate();
				}
			}, 5000);

			// Check stats
			setInterval(function() {
				if (stats.length >= 250) {
					let total = stats.reduce((prev, current) => prev + current, 0);
					console.warn(`MANY messages are being SEND FROM the extension host!`);
					console.warn(`SEND during 1sec: message_count=${stats.length}, total_len=${total}`);
				}
				stats.length = 0;
			}, 1000);

			// Tell the outside that we are initialized
			process.send('initialized');

			c({ remoteCom, initData: msg });
		});

		// Tell the outside that we are ready to receive messages
		process.send('ready');
	});
}

function connectToSharedProcess(): TPromise<Client> {
	return connect(process.env['VSCODE_SHARED_IPC_HOOK']);
}

TPromise.join<any>([connectToRenderer(), connectToSharedProcess()])
	.done(result => {
		const renderer: IRendererConnection = result[0];
		const sharedProcessClient: Client = result[1];
		const instantiationService = createServices(renderer.remoteCom, renderer.initData, sharedProcessClient);
		const extensionHostMain = instantiationService.createInstance(ExtensionHostMain);

		onTerminate = () => {
			extensionHostMain.terminate();
		};

		extensionHostMain.start()
			.done(null, err => console.error(err));
	});