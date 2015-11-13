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
export function findFreePort(startPort: number, giveUpAfter:number, clb: (port: number) => void): void {
	if (giveUpAfter === 0) {
		return clb(0);
	}

	var tryPort = startPort;

	var server = net.createServer();
	server.listen(tryPort, (err) => {
		server.once('close', () => {
			return clb(tryPort);
		});

		server.close();
	});

	server.on('error', (err) => {
		findFreePort(startPort + 1, giveUpAfter - 1, clb);
	});
}