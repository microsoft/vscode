/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import { CancellationToken } from '../vs/base/common/cancellation';

function dispose(socket: net.Socket): void {
	try {
		socket.removeAllListeners('connect');
		socket.removeAllListeners('error');
		socket.end();
		socket.destroy();
		socket.unref();
	} catch (error) {
		console.error(error); // otherwise this error would get lost in the callback chain
	}
}

export async function waitForListenerOnPort(port: number, host: string | undefined, token: CancellationToken) {
	while (!token.isCancellationRequested) {
		try {
			await new Promise<void>((resolve, reject) => {
				const socket = new net.Socket();
				const cleanup = () => {
					clearTimeout(t);
					dispose(socket);
				};
				socket.once('connect', () => {
					cleanup();
					resolve();
				});
				socket.once('error', (err) => {
					cleanup();
					reject(err);
				});
				const t = setTimeout(() => {
					cleanup();
					reject(new Error(`Timeout waiting for port ${port}`));
				}, 1000);
				socket.connect(port, host ?? '127.0.0.1');
			});
			return; // Successfully connected
		} catch {
			// Ignore errors and retry
			await new Promise(resolve => setTimeout(resolve, 100)); // Wait before retrying
		}
	}

	throw new Error(`Cancelled or unable to connect to port ${port}`);
}
