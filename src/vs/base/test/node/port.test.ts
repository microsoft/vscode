/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as net from 'net';
import * as ports from '../../node/ports.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { flakySuite } from './testUtils.js';

flakySuite('Ports', () => {
	(process.env['VSCODE_PID'] ? test.skip /* this test fails when run from within VS Code */ : test)('Finds a free port (no timeout)', function (done) {

		// get an initial freeport >= 7000
		ports.findFreePort(7000, 100, 300000).then(initialPort => {
			assert.ok(initialPort >= 7000);

			// create a server to block this port
			const server = net.createServer();
			server.listen(initialPort, undefined, undefined, () => {

				// once listening, find another free port and assert that the port is different from the opened one
				ports.findFreePort(7000, 50, 300000).then(freePort => {
					assert.ok(freePort >= 7000 && freePort !== initialPort);
					server.close();

					done();
				}, err => done(err));
			});
		}, err => done(err));
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
