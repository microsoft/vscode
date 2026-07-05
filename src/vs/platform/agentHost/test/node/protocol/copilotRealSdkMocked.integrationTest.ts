/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real Copilot SDK integration tests running on a mocked LLM.
 */

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { URI } from '../../../../../base/common/uri.js';
import { ResponsePartKind } from '../../../common/state/sessionState.js';
import { createRealSession, dispatchTurn, IRealSdkProviderConfig } from './realSdkTestHelpers.js';
import { fetchSessionWithChat, isActionNotification, IServerHandle, startRealServer, TestProtocolClient } from './testHelpers.js';

export const COPILOT_CONFIG: IRealSdkProviderConfig = {
	suiteTitle: 'Protocol WebSocket — Real Copilot SDK Mocked LLM',
	provider: 'copilotcli',
	scheme: 'copilotcli',
	shellToolName: 'bash',
	subagentToolNames: ['task'],
	exitPlanModeToolName: 'exit_plan_mode',
	enabled: true,
	supportsWorktreeIsolation: true,
	supportsSubagents: true,
	supportsPlanMode: true,
	githubToken: 'not-a-real-token', // The tests will use a mocked LLM, so the token doesn't need to be valid.
};

suite('Protocol WebSocket — Real Copilot SDK, Mocked LLM (Copilot-specific)', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];

	suiteSetup(async function () {
		this.timeout(120_000);
		server = await startRealServer({ mockLlm: true });
	});

	suiteTeardown(function () {
		server?.process.kill();
	});

	setup(async function () {
		this.timeout(120_000);
		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(async function () {
		for (const session of createdSessions) {
			try {
				await client.call('disposeSession', { session }, 5000);
			} catch { /* best-effort */ }
		}
		createdSessions.length = 0;
		client.close();

		for (const dir of tempDirs) {
			try {
				await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch { /* best-effort */ }
		}
		tempDirs.length = 0;
	});

	test('returns a hello response via mock LLM', async function () {
		this.timeout(180_000);

		const probeToken = 'MOCK_REQUEST_PROBE_12345';
		const workspaceDir = await mkdtemp(`${tmpdir()}/test-mock-hello`);
		tempDirs.push(workspaceDir);
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-mock-hello', createdSessions, URI.file(workspaceDir));
		dispatchTurn(client, sessionUri, 'turn-mock-hello', `Reply with exactly: ${probeToken}`, 1);
		try {
			await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);
		} catch (err) {
			console.error(`Failed to receive chat/turnComplete notification within timeout: ${err}, receivedNotifications: ${JSON.stringify(client.receivedNotifications())}, logMessages: ${server.mockLlm?.logMessages.join('\n') ?? 'no mockllm server'}`);
			throw new Error(`Failed to receive chat/turnComplete notification within timeout: ${err}, receivedNotifications: ${JSON.stringify(client.receivedNotifications())}, logMessages: ${server.mockLlm?.logMessages.join('\n') ?? 'no mockllm server'}`);
		}

		assert.ok((server.mockLlm?.requestCount() ?? 0) >= 1, 'expected at least one request to the mock LLM');

		const state = await fetchSessionWithChat(client, sessionUri);

		const turn = state.turns.find(t => t.id === 'turn-mock-hello');
		const markdownText = turn?.responseParts.map(p => p.kind === ResponsePartKind.Markdown ? p.content : '').join('\n') ?? ``;
		assert.ok(markdownText.trim().length > 0, `expected non-empty assistant markdown; got: ${JSON.stringify(markdownText)}`);
		assert.match(markdownText, new RegExp(`\\b${probeToken}\\b`, 'i'), `expected probe token in assistant markdown; got: ${JSON.stringify(markdownText)}`);
	});
});
