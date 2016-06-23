/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import net = require('net');

/**
 * Given a start point and a max number of retries, will find a port that
 * is openable. Will return 0 in case no free port can be found.
 */
export function findFreePort(startPort: number, giveUpAfter: number, timeout: number, clb: (port: number) => void): void {
	let done = false;

	const timeoutHandle = setTimeout(() =>  {
		if (!done) {
			done = true;

			return clb(0);
		}
	}, timeout);

	doFindFreePort(startPort, giveUpAfter, (port) => {
		if (!done) {
			done = true;
			window.clearTimeout(timeoutHandle);

			return clb(port);
		}
	});
}

function doFindFreePort(startPort: number, giveUpAfter: number, clb: (port: number) => void): void {
	if (giveUpAfter === 0) {
		return clb(0);
	}

	const server = net.createServer(() => {});

	server.once('listening', () => {
		dispose(server);
		clb(startPort);
	});

	server.once('error', () => {
		dispose(server);
		doFindFreePort(startPort + 1, giveUpAfter - 1, clb);
	});

	server.listen(startPort, null);
}

function dispose(server: net.Server): void {
	try {
		server.removeAllListeners('listening');
		server.removeAllListeners('error');
		server.close();
		server.unref();
	} catch (error) {
		console.error(error); // otherwise this error would get lost in the callback chain
	}
}