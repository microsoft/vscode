/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as http from 'http';
import type { AddressInfo } from 'net';
import type { IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult } from '../../../common/agentService.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { ROOT_STATE_URI } from '../../../common/state/sessionState.js';
import { getAgentHostE2ETestTimeout, IServerHandle, startServer, TestProtocolClient } from './testHelpers.js';

suite('Protocol WebSocket - quiet network diagnostics', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	let target: http.Server;
	let targetUrl: string;

	suiteSetup(async function () {
		this.timeout(getAgentHostE2ETestTimeout(15_000, 60_000));
		server = await startServer({ quiet: true });
		const httpModule = await import('http');
		target = httpModule.createServer((_request, response) => {
			response.writeHead(200, { 'content-type': 'text/plain' });
			response.end('pong');
		});
		await new Promise<void>((resolve, reject) => {
			target.once('error', reject);
			target.listen(0, '127.0.0.1', resolve);
		});
		targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}/ping`;
	});

	suiteTeardown(async function () {
		server.process.kill();
		await new Promise<void>(resolve => target.close(() => resolve()));
	});

	setup(async function () {
		this.timeout(10_000);
		client = new TestProtocolClient(server.port);
		await client.connect();
		await client.call('initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'test-quiet-network-diagnostics',
			initialSubscriptions: [ROOT_STATE_URI],
		});
	});

	teardown(function () {
		client.close();
	});

	test('serves host info and freeform fetch without production agents', async function () {
		this.timeout(10_000);

		const info = await client.call<IAgentHostNetworkDiagnosticsInfo>('getNetworkDiagnosticsInfo');
		const result = await client.call<IAgentHostNetworkFetchResult>('diagnosticsFetch', { url: targetUrl });

		assert.deepStrictEqual({
			hasVersion: typeof info.version === 'string',
			os: info.os,
			arch: info.arch,
			endpoints: info.endpoints,
			url: result.url,
			statusCode: result.statusCode,
			body: result.body,
			error: result.error,
		}, {
			hasVersion: true,
			os: process.platform,
			arch: process.arch,
			endpoints: [],
			url: targetUrl,
			statusCode: 200,
			body: 'pong',
			error: undefined,
		});
	});
});
