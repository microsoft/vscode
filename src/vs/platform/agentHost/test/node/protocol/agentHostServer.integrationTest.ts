/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PROTOCOL_VERSION } from '../../../common/state/sessionCapabilities.js';
import { IServerHandle, startServer, TestProtocolClient } from './testHelpers.js';

suite('Agent Host Server', function () {

	let server: IServerHandle;

	suiteSetup(async function () {
		this.timeout(15_000);
		server = await startServer({ quiet: false });
	});

	suiteTeardown(function () {
		server.process.kill();
	});

	test('starts with production agent services registered', async function () {
		this.timeout(10_000);

		const client = new TestProtocolClient(server.port);
		try {
			await client.connect();
			await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-agent-host-server-services' });
		} finally {
			client.close();
		}
	});
});
