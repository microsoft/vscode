/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import {
	JSON_RPC_PARSE_ERROR,
	type InitializeResult,
	type JsonRpcErrorResponse,
} from '../../../common/state/sessionProtocol.js';
import { IServerHandle, nextSessionUri, startServer, TestProtocolClient } from './testHelpers.js';

suite('Protocol WebSocket — Handshake & Errors', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;

	suiteSetup(async function () {
		this.timeout(15_000);
		server = await startServer();
	});

	suiteTeardown(function () {
		server.process.kill();
	});

	setup(async function () {
		this.timeout(10_000);
		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(function () {
		client.close();
	});

	test('handshake returns initialize response with protocol version', async function () {
		this.timeout(5_000);

		const result = await client.call<InitializeResult>('initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'test-handshake',
			initialSubscriptions: [URI.from({ scheme: 'agenthost', path: '/root' }).toString()],
		});

		assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
		assert.ok(result.serverSeq >= 0);
		assert.ok(result.snapshots.length >= 1, 'should have root state snapshot');
	});

	test('malformed JSON message returns parse error', async function () {
		this.timeout(10_000);

		const raw = new TestProtocolClient(server.port);
		await raw.connect();

		const responsePromise = raw.waitForRawMessage();
		raw.sendRaw('this is not valid json{{{');

		const response = await responsePromise as JsonRpcErrorResponse;
		assert.strictEqual(response.jsonrpc, '2.0');
		assert.strictEqual(response.id, null);
		assert.strictEqual(response.error.code, JSON_RPC_PARSE_ERROR);

		raw.close();
	});

	test('createSession with invalid provider does not crash server', async function () {
		this.timeout(10_000);

		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-invalid-create' });

		let gotError = false;
		try {
			await client.call('createSession', { session: nextSessionUri(), provider: 'nonexistent' });
		} catch {
			gotError = true;
		}
		assert.ok(gotError, 'should have received an error for invalid provider');

		// Server should still be functional
		await client.call('createSession', { session: nextSessionUri(), provider: 'mock' });
		const notif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as { notification: { type: string } }).notification.type === 'notify/sessionAdded'
		);
		assert.ok(notif);
	});
});
