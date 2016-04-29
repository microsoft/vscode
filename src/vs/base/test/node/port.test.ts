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

		// get an initial freeport >= 7000
		ports.findFreePort(7000, 100, 300000, (initialPort) => {
			assert.ok(initialPort >= 7000);

			// create a server to block this port
			const server = net.createServer();
			server.listen(initialPort, null, null, () =>  {

				// once listening, find another free port and assert that the port is different from the opened one
				ports.findFreePort(7000, 50, 300000, (freePort) => {
					assert.ok(freePort >= 7000 && freePort !== initialPort);
					server.close();

					done();
				});
			});
		});
	});

	// Unreliable test:
	// test('Finds a free port (with timeout)', function (done: () => void) {

	// 	// get an initial freeport >= 7000
	// 	ports.findFreePort(7000, 100, 300000, (initialPort) => {
	// 		assert.ok(initialPort >= 7000);

	// 		// create a server to block this port
	// 		const server = net.createServer();
	// 		server.listen(initialPort, null, null, () =>  {

	// 			// once listening, find another free port and assert that the port is different from the opened one
	// 			ports.findFreePort(7000, 50, 0, (freePort) => {
	// 				assert.equal(freePort, 0);
	// 				server.close();

	// 				done();
	// 			});
	// 		});
	// 	});
	// });
});