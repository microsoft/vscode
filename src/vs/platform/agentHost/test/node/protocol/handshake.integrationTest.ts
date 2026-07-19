/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import {
	JSON_RPC_PARSE_ERROR,
	type InitializeResult,
	type JsonRpcErrorResponse,
} from '../../../common/state/sessionProtocol.js';
import { ROOT_STATE_URI } from '../../../common/state/sessionState.js';
import { getAgentHostE2ETestTimeout, IServerHandle, nextSessionUri, startServer, TestProtocolClient } from './testHelpers.js';

suite('Protocol WebSocket — Handshake & Errors', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;

	suiteSetup(async function () {
		this.timeout(getAgentHostE2ETestTimeout(15_000, 60_000));
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
			initialSubscriptions: [ROOT_STATE_URI],
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
			await client.call('createSession', { channel: nextSessionUri(), provider: 'nonexistent' });
		} catch {
			gotError = true;
		}
		assert.ok(gotError, 'should have received an error for invalid provider');

		// Server should still be functional
		await client.call('createSession', { channel: nextSessionUri(), provider: 'mock' });
		const notif = await client.waitForNotification(n =>
			n.method === 'root/sessionAdded'
		);
		assert.ok(notif);
	});

	test('ping succeeds before initialize', async function () {
		const result = await client.call('ping');
		assert.strictEqual(result, null);
	});

	test('requests other than ping are rejected before initialize', async function () {
		await assert.rejects(() => client.call('listSessions', { channel: ROOT_STATE_URI }), /method not found/i);
	});

	test('initialize rejects incompatible protocol versions', async function () {
		await assert.rejects(() => client.call('initialize', {
			protocolVersions: ['999.0.0'],
			clientId: 'test-incompatible-version',
		}), /none of which are compatible/i);
	});

	test('initialize rejects an empty protocol version list', async function () {
		await assert.rejects(() => client.call('initialize', {
			protocolVersions: [],
			clientId: 'test-empty-versions',
		}), /none of which are compatible/i);
	});

	test('initialize without subscriptions returns no snapshots', async function () {
		const result = await client.call<InitializeResult>('initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'test-no-initial-subscriptions',
		});
		assert.deepStrictEqual(result.snapshots, []);
	});

	test('initialize omits unknown initial subscriptions', async function () {
		const result = await client.call<InitializeResult>('initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'test-unknown-initial-subscription',
			initialSubscriptions: ['mock:/missing-session'],
		});
		assert.deepStrictEqual(result.snapshots, []);
	});

	test('unknown requests are rejected after initialize', async function () {
		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-unknown-request' });
		await assert.rejects(() => client.call('unknown/request', {}), /method not found/i);
	});

	test('notifications before initialize are ignored', async function () {
		client.notify('unsubscribe', { channel: ROOT_STATE_URI });
		client.notify('dispatchAction', {
			channel: ROOT_STATE_URI,
			clientSeq: 1,
			action: { type: 'root/configChanged', config: { values: {} } },
		});

		const result = await client.call<InitializeResult>('initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'test-pre-initialize-notifications',
		});
		assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
	});
});
