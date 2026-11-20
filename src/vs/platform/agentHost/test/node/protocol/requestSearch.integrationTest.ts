/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IAgentHostRequestSearchResult } from '../../../common/agentHostRequestSearch.js';
import {
	createAndSubscribeSession,
	dispatchTurnStarted,
	getActionEnvelope,
	getAgentHostE2ETestTimeout,
	IServerHandle,
	isActionNotification,
	startServer,
	stopServer,
	TestProtocolClient,
} from '../serverIntegrationTestHelpers.js';

function isTurnComplete(notification: Parameters<typeof isActionNotification>[0], turnId: string): boolean {
	return isActionNotification(notification, 'chat/turnComplete')
		&& (getActionEnvelope(notification).action as { turnId?: string }).turnId === turnId;
}

suite('Protocol WebSocket — Request Search', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;

	suiteSetup(async function () {
		this.timeout(getAgentHostE2ETestTimeout(15_000, 60_000));
		server = await startServer();
	});

	suiteTeardown(async function () {
		this.timeout(getAgentHostE2ETestTimeout(20_000, 50_000));
		await stopServer(server);
	});

	setup(async function () {
		this.timeout(getAgentHostE2ETestTimeout(10_000, 30_000));
		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(function () {
		client.close();
	});

	test('finds the requests a client sent, by every word they contain', async function () {
		this.timeout(getAgentHostE2ETestTimeout(15_000, 45_000));

		const sessionUri = await createAndSubscribeSession(client, 'test-request-search');
		dispatchTurnStarted(client, sessionUri, 'turn-search-1', 'Fix the LOGIN bug', 1);
		await client.waitForNotification(n => isTurnComplete(n, 'turn-search-1'));
		dispatchTurnStarted(client, sessionUri, 'turn-search-2', 'hello', 2);
		await client.waitForNotification(n => isTurnComplete(n, 'turn-search-2'));

		const result = await client.call<IAgentHostRequestSearchResult>('vscode/searchRequests', { query: 'login fix' });
		assert.deepStrictEqual({
			indexEnabled: result.indexEnabled,
			hits: result.hits.filter(hit => hit.session === sessionUri).map(({ turnId, snippet, chat }) => ({ turnId, snippet, chat })),
		}, {
			indexEnabled: true,
			hits: [{ turnId: 'turn-search-1', snippet: 'Fix the LOGIN bug', chat: undefined }],
		});
		await assert.rejects(() => client.call('vscode/searchRequests', { query: ' ' }));
	});
});
