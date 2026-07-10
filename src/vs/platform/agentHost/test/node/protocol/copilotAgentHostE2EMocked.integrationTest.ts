/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent host end-to-end tests (Copilot, mocked LLM).
 */

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { buildDefaultChatUri, ResponsePartKind, type ISessionWithDefaultChat } from '../../../common/state/sessionState.js';
import { AgentHostSessionReleaseGraceMsEnvVar } from '../../../common/agentService.js';
import { createRealSession, dispatchTurn, IAgentHostE2EProviderConfig } from './agentHostE2ETestHelpers.js';
import { fetchSessionWithChat, isActionNotification, IServerHandle, startRealServer, TestProtocolClient } from './testHelpers.js';

export const COPILOT_CONFIG: IAgentHostE2EProviderConfig = {
	suiteTitle: 'Agent Host E2E — Copilot (Mocked LLM)',
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

suite('Agent Host E2E — Copilot, Mocked LLM (Copilot-specific)', function () {

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

/**
 * Idle-session release exercised end to end against the real Copilot SDK
 * (mock LLM). Uses a dedicated server with a short
 * {@link AgentHostSessionReleaseGraceMsEnvVar} grace so the release fires
 * promptly after the last subscriber drops (production defaults to 30s). Kept
 * in its own suite/server so the short grace can't perturb the timing of the
 * other agent host e2e suites.
 */
suite('Agent Host E2E — Copilot, Mocked LLM (idle release)', function () {

	// Short enough that a post-unsubscribe wait reliably outlasts it, long
	// enough that the intra-test subscribe calls in createRealSession don't race it.
	const RELEASE_GRACE_MS = 500;

	let server: IServerHandle;
	let client: TestProtocolClient;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];

	suiteSetup(async function () {
		this.timeout(120_000);
		server = await startRealServer({ mockLlm: true, env: { [AgentHostSessionReleaseGraceMsEnvVar]: String(RELEASE_GRACE_MS) } });
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

	test('releases an idle session and resumes it losslessly on re-subscribe (mock LLM)', async function () {
		this.timeout(180_000);

		const assistantMarkdown = (turns: ISessionWithDefaultChat['turns'], turnId: string): string =>
			turns.find(t => t.id === turnId)?.responseParts.map(p => p.kind === ResponsePartKind.Markdown ? p.content : '').join('\n') ?? '';
		// Project each turn onto its durable transcript content: the user message
		// and the assistant's rendered markdown. Live-only or reconstructed fields
		// (regenerated response-part ids, the internal turn id which is rebuilt
		// from the SDK event log on restore, per-turn `usage` token telemetry that
		// is not persisted) legitimately do not survive a restore-from-disk, so
		// "lossless" is asserted over the transcript the user sees.
		const transcript = (turns: ISessionWithDefaultChat['turns']) =>
			turns.map(t => ({ message: t.message.text, markdown: assistantMarkdown(turns, t.id) }));

		const workspaceDir = await mkdtemp(`${tmpdir()}/test-mock-release-resume`);
		tempDirs.push(workspaceDir);
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-mock-release', createdSessions, URI.file(workspaceDir));

		// Drive one turn so the session has durable SDK state (a persisted event
		// log) backed by a live SDK session that owns real per-session resources.
		const firstProbe = 'MOCK_RELEASE_PROBE_1';
		dispatchTurn(client, sessionUri, 'turn-release-1', `Reply with exactly: ${firstProbe}`, 1);
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);

		const before = await fetchSessionWithChat(client, sessionUri);
		assert.match(assistantMarkdown(before.turns, 'turn-release-1'), new RegExp(`\\b${firstProbe}\\b`, 'i'), 'first turn should have completed before release');

		// Drop every subscriber. The parent-session unsubscribe is sent last so it
		// arms idle-session eviction on the server; after the short release grace
		// elapses the cached protocol state is dropped AND the provider releases
		// the live SDK session (session.disconnect), while the on-disk session log
		// is preserved.
		for (const channel of [buildDefaultChatUri(sessionUri), sessionUri]) {
			client.notify('unsubscribe', { channel });
		}
		// Wait comfortably past the release grace so the release actually fires
		// (and its sequenced SDK disconnect completes) before we re-subscribe.
		await timeout(RELEASE_GRACE_MS + 2000);

		// Re-subscribe: the server restores the session from disk and the provider
		// resumes the SDK session on demand. The restored transcript must match
		// the pre-release view.
		const after = await fetchSessionWithChat(client, sessionUri);
		assert.deepStrictEqual(transcript(after.turns), transcript(before.turns), 'restored transcript must match the pre-release state');

		// Drive a SECOND turn after the release/resume cycle. This is the key
		// assertion: it proves the SDK session resumed cleanly rather than wedging
		// the runtime — the exact failure mode idle release could introduce.
		client.clearReceived();
		const secondProbe = 'MOCK_RELEASE_PROBE_2';
		dispatchTurn(client, sessionUri, 'turn-release-2', `Reply with exactly: ${secondProbe}`, 2);
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);

		const final = await fetchSessionWithChat(client, sessionUri);
		assert.match(assistantMarkdown(final.turns, 'turn-release-2'), new RegExp(`\\b${secondProbe}\\b`, 'i'), 'a follow-up turn must complete after the release/resume cycle');
	});
});
