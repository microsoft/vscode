/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as net from 'net';
import ports = require('vs/base/node/ports');

suite('Ports', () => {
	test('Finds a free port (no timeout)', function (done: () => void) {
		this.timeout(1000 * 10); // higher timeout for this test

		if (process.env['VSCODE_PID']) {
			return done(); // TODO@Ben find out why test fails when run from within VS Code
		}

		// get an initial freeport >= 7000
		ports.findFreePort(7000, 100, 300000, (initialPort) => {
			assert.ok(initialPort >= 7000);

			// create a server to block this port
			const server = net.createServer();
			server.listen(initialPort, null, null, () => {

				// once listening, find another free port and assert that the port is different from the opened one
				ports.findFreePort(7000, 50, 300000, (freePort) => {
					assert.ok(freePort >= 7000 && freePort !== initialPort);
					server.close();

					done();
				});
			});
		});
	});
});
