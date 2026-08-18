/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent Host integration tests using the real Copilot provider and a synthetic local LLM.
 */

import assert from 'assert';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { timeout } from '../../../../../base/common/async.js';
import { join } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ActionType, type ChatToolCallCompleteAction, type ChatToolCallReadyAction } from '../../../common/state/sessionActions.js';
import { buildDefaultChatUri, ResponsePartKind, SessionStatus, type ISessionWithDefaultChat } from '../../../common/state/sessionState.js';
import { ToolCallConfirmationReason } from '../../../common/state/protocol/channels-chat/state.js';
import { AgentHostSessionReleaseGraceMsEnvVar } from '../../../common/agentService.js';
import { createProviderSession, dispatchTurn, type IAgentHostProviderTestConfig } from '../providerIntegrationTestHelpers.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, IServerHandle, startRealServer, stopServer, TestProtocolClient } from '../serverIntegrationTestHelpers.js';

const COPILOT_CONFIG: IAgentHostProviderTestConfig = {
	provider: 'copilotcli',
	scheme: 'copilotcli',
	githubToken: 'not-a-real-token',
};

const DETACHED_SHELL_SCENARIO_ID = 'detached-shell-idle-release';
const DETACHED_SHELL_DELAY_MS = 6000;

function quoteShellArgument(value: string): string {
	return isWindows ? `'${value.replace(/'/g, '\'\'')}'` : `'${value.replace(/'/g, `'\\''`)}'`;
}

suite('Agent Host Provider Integration — Copilot with Mock LLM', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	let suiteHome: string;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];

	suiteSetup(async function () {
		this.timeout(120_000);
		suiteHome = await mkdtemp(`${tmpdir()}/test-mock-copilot-home-`);
		server = await startRealServer({
			mockLlm: true,
			homeDir: suiteHome,
			userDataDir: join(suiteHome, 'user-data'),
		});
	});

	suiteTeardown(async function () {
		await stopServer(server);
		await rm(suiteHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
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
		const sessionUri = await createProviderSession(client, COPILOT_CONFIG, 'real-sdk-mock-hello', createdSessions, URI.file(workspaceDir));
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
 * Idle-session release exercised against the real Copilot SDK and a mock LLM.
 * Uses a dedicated server with a short
 * {@link AgentHostSessionReleaseGraceMsEnvVar} grace so the release fires
 * promptly after the last subscriber drops (production defaults to 30s). Kept
 * in its own suite/server so the short grace can't perturb the timing of the
 * other agent host e2e suites.
 */
suite('Agent Host Provider Integration — Copilot Idle Release', function () {

	// Short enough that a post-unsubscribe wait reliably outlasts it, long
	// enough that the intra-test subscribe calls in createProviderSession don't race it.
	const RELEASE_GRACE_MS = 500;

	let server: IServerHandle;
	let client: TestProtocolClient;
	let suiteHome: string;
	let detachedCompletionMarker: string;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];

	suiteSetup(async function () {
		this.timeout(120_000);
		suiteHome = await mkdtemp(`${tmpdir()}/test-mock-idle-release-home`);
		detachedCompletionMarker = join(suiteHome, 'detached-shell-complete');
		const detachedScript = join(suiteHome, 'detached-shell.js');
		await writeFile(detachedScript, `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(detachedCompletionMarker)}, 'done'), ${DETACHED_SHELL_DELAY_MS});`);
		const command = `node ${quoteShellArgument(detachedScript)}`;
		server = await startRealServer({
			mockLlm: true,
			homeDir: suiteHome,
			userDataDir: join(suiteHome, 'user-data'),
			env: { [AgentHostSessionReleaseGraceMsEnvVar]: String(RELEASE_GRACE_MS) },
			mockScenarios: [{
				id: DETACHED_SHELL_SCENARIO_ID,
				definition: {
					type: 'multi-turn',
					turns: [
						{
							kind: 'tool-calls',
							toolCalls: [{
								toolNamePattern: /^(bash|powershell)$/,
								arguments: {
									command,
									description: 'Run detached shell release probe',
									mode: 'async',
									detach: true,
									initial_wait: 30,
								},
							}],
						},
						{ kind: 'content', chunks: [{ content: 'Waiting for detached shell completion.', delayMs: 0 }] },
					],
				},
			}],
		});
	});

	suiteTeardown(async function () {
		await stopServer(server);
		await rm(suiteHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
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

	test('keeps a detached shell running after an idle session loses all subscribers (mock LLM)', async function () {
		this.timeout(180_000);

		const workspaceDir = await mkdtemp(`${tmpdir()}/test-mock-detached-release`);
		tempDirs.push(workspaceDir);
		const sessionUri = await createProviderSession(client, COPILOT_CONFIG, 'real-sdk-mock-detached-release', createdSessions, URI.file(workspaceDir));
		const turnId = 'turn-detached-release';

		dispatchTurn(client, sessionUri, turnId, `[scenario:${DETACHED_SHELL_SCENARIO_ID}] Start the detached shell.`, 1);
		const readyNotification = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/toolCallReady')) {
				return false;
			}
			return !(getActionEnvelope(n).action as ChatToolCallReadyAction).confirmed;
		}, 90_000);
		const readyEnvelope = getActionEnvelope(readyNotification);
		const readyAction = readyEnvelope.action as ChatToolCallReadyAction;
		client.dispatch({
			channel: readyEnvelope.channel,
			clientSeq: 2,
			action: {
				type: ActionType.ChatToolCallConfirmed,
				turnId: readyAction.turnId,
				toolCallId: readyAction.toolCallId,
				approved: true,
				confirmed: ToolCallConfirmationReason.UserAction,
			},
		});
		const completeNotification = await client.waitForNotification(n => isActionNotification(n, 'chat/toolCallComplete'), 90_000);
		const completeAction = getActionEnvelope(completeNotification).action as ChatToolCallCompleteAction;
		assert.match(JSON.stringify(completeAction.result), /detached background/);
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);

		const idle = await fetchSessionWithChat(client, sessionUri);
		assert.deepStrictEqual({
			activeTurn: idle.activeTurn,
			inProgress: (idle.status & SessionStatus.InProgress) !== 0,
		}, {
			activeTurn: undefined,
			inProgress: false,
		});

		for (const channel of [buildDefaultChatUri(sessionUri), sessionUri]) {
			client.notify('unsubscribe', { channel });
		}
		await timeout(RELEASE_GRACE_MS + 1000);

		for (let attempt = 0; attempt < 150 && !existsSync(detachedCompletionMarker); attempt++) {
			await timeout(100);
		}
		assert.strictEqual(await readFile(detachedCompletionMarker, 'utf8'), 'done');
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
		const sessionUri = await createProviderSession(client, COPILOT_CONFIG, 'real-sdk-mock-release', createdSessions, URI.file(workspaceDir));

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
