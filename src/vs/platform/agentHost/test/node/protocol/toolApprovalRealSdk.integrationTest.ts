/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests using the real Copilot SDK instead of a mock agent.
 *
 * These tests are **disabled by default**. To run them, set `AGENT_HOST_REAL_SDK=1`:
 *
 *   AGENT_HOST_REAL_SDK=1 ./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/protocol/toolApprovalRealSdk.integrationTest.ts
 *
 * Authentication: By default the token is obtained from `gh auth token`.
 * You can override it by setting `GITHUB_TOKEN=ghp_xxx`.
 *
 * SAFETY: These tests create real agent sessions backed by the Copilot SDK.
 * The agent may execute tool calls on the user's machine. Prompts should be
 * carefully chosen to avoid destructive side-effects — prefer read-only
 * questions, safe commands like `echo`, and use isolated temp directories as
 * working directories. Never ask the agent to delete, modify, or install
 * anything outside of a test-owned temp directory.
 */

import assert from 'assert';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { URI } from '../../../../../base/common/uri.js';
import { ISubscribeResult } from '../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../common/state/sessionCapabilities.js';
import type { ISessionAddedNotification } from '../../../common/state/sessionActions.js';
import type { INotificationBroadcastParams } from '../../../common/state/sessionProtocol.js';
import type { ISessionState } from '../../../common/state/sessionState.js';
import {
	getActionEnvelope,
	isActionNotification,
	IServerHandle,
	startRealServer,
	TestProtocolClient,
} from './testHelpers.js';

const REAL_SDK_ENABLED = process.env['AGENT_HOST_REAL_SDK'] === '1';

/** Resolve GitHub token from env or `gh auth token`. */
function resolveGitHubToken(): string {
	const envToken = process.env['GITHUB_TOKEN'];
	if (envToken) {
		return envToken;
	}
	try {
		return execSync('gh auth token', { encoding: 'utf-8' }).trim();
	} catch {
		throw new Error('No GITHUB_TOKEN set and `gh auth token` failed. Run `gh auth login` first.');
	}
}

/** Create a session using the real copilot provider, authenticate, subscribe, and return the session URI. */
async function createRealSession(c: TestProtocolClient, clientId: string, trackingList: string[], workingDirectory?: string): Promise<string> {
	const result = await createRealSessionFull(c, clientId, trackingList, workingDirectory);
	return result.sessionUri;
}

interface IRealSessionResult {
	sessionUri: string;
	addedNotification: ISessionAddedNotification;
	subscribeSnapshot: ISessionState;
}

/** Full version that returns the sessionAdded notification and subscribe snapshot for assertions. */
async function createRealSessionFull(c: TestProtocolClient, clientId: string, trackingList: string[], workingDirectory?: string): Promise<IRealSessionResult> {
	await c.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId }, 30_000);

	await c.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);

	const sessionUri = URI.from({ scheme: 'copilot', path: `/real-test-${Date.now()}` }).toString();
	await c.call('createSession', { session: sessionUri, provider: 'copilot', workingDirectory }, 30_000);

	const notif = await c.waitForNotification(n =>
		n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded',
		15_000,
	);
	const addedNotification = (notif.params as INotificationBroadcastParams).notification as ISessionAddedNotification;
	const realSessionUri = addedNotification.summary.resource;
	trackingList.push(realSessionUri);

	const subscribeResult = await c.call<ISubscribeResult>('subscribe', { resource: realSessionUri });
	const subscribeSnapshot = subscribeResult.snapshot.state as ISessionState;
	c.clearReceived();

	return { sessionUri: realSessionUri, addedNotification, subscribeSnapshot };
}

/** Dispatch a turn with the given user message text. */
function dispatchTurn(c: TestProtocolClient, session: string, turnId: string, text: string, clientSeq: number): void {
	c.notify('dispatchAction', {
		clientSeq,
		action: {
			type: 'session/turnStarted',
			session,
			turnId,
			userMessage: { text },
		},
	});
}

(REAL_SDK_ENABLED ? suite : suite.skip)('Protocol WebSocket — Real Copilot SDK', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	/** Session URIs created during the current test, disposed in teardown. */
	const createdSessions: string[] = [];
	/** Temp directories created during the current test, removed in teardown. */
	const tempDirs: string[] = [];

	suiteSetup(async function () {
		this.timeout(60_000);
		server = await startRealServer();
	});

	suiteTeardown(function () {
		server?.process.kill();
	});

	setup(async function () {
		this.timeout(30_000);
		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(async function () {
		// Dispose all sessions created during this test
		for (const session of createdSessions) {
			try {
				await client.call('disposeSession', { session }, 5000);
			} catch {
				// Best-effort cleanup — the session may already be gone
			}
		}
		createdSessions.length = 0;
		client.close();

		// Remove temp directories created during this test
		for (const dir of tempDirs) {
			rmSync(dir, { recursive: true, force: true });
		}
		tempDirs.length = 0;
	});

	// ---- Basic turn execution ------------------------------------------------

	test('sends a simple message and receives a response', async function () {
		this.timeout(120_000);

		const sessionUri = await createRealSession(client, 'real-sdk-simple', createdSessions, URI.file(tmpdir()).toString());
		dispatchTurn(client, sessionUri, 'turn-1', 'Say exactly "hello" and nothing else', 1);

		// Wait for the turn to complete — the real SDK may take a while
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'), 90_000);

		// Verify we received at least one response part
		const responseParts = client.receivedNotifications(n => isActionNotification(n, 'session/responsePart'));
		assert.ok(responseParts.length > 0, 'should have received at least one response part');
	});

	// ---- Tool call with permission flow -------------------------------------

	test('tool call triggers permission request and can be approved', async function () {
		this.timeout(120_000);

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-perm-test-`);
		tempDirs.push(tempDir);
		const sessionUri = await createRealSession(client, 'real-sdk-permission', createdSessions, URI.file(tempDir).toString());
		dispatchTurn(client, sessionUri, 'turn-perm', 'Run the shell command: echo "hello from test"', 1);

		// The real SDK should fire a tool call that needs permission
		const toolStartNotif = await client.waitForNotification(
			n => isActionNotification(n, 'session/toolCallStart'),
			60_000,
		);
		const toolStartAction = getActionEnvelope(toolStartNotif).action as { toolCallId: string };

		// Wait for toolCallReady (pending confirmation)
		const toolReadyNotif = await client.waitForNotification(
			n => isActionNotification(n, 'session/toolCallReady'),
			30_000,
		);
		const toolReadyAction = getActionEnvelope(toolReadyNotif).action as { toolCallId: string; confirmed?: string };

		// If the tool was auto-approved, confirmed will be set; if pending, confirm it
		if (!toolReadyAction.confirmed) {
			client.notify('dispatchAction', {
				clientSeq: 2,
				action: {
					type: 'session/toolCallConfirmed',
					session: sessionUri,
					turnId: 'turn-perm',
					toolCallId: toolStartAction.toolCallId,
					approved: true,
				},
			});
		}

		// Wait for the turn to complete
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'), 90_000);
	});

	// ---- Abort / cancel -----------------------------------------------------

	test('can abort a running turn', async function () {
		this.timeout(120_000);

		const sessionUri = await createRealSession(client, 'real-sdk-abort', createdSessions, URI.file(tmpdir()).toString());
		dispatchTurn(client, sessionUri, 'turn-abort', 'Write a very long essay about the history of computing', 1);

		// Wait a moment for the turn to start processing, then abort
		await client.waitForNotification(
			n => isActionNotification(n, 'session/responsePart') || isActionNotification(n, 'session/toolCallStart'),
			60_000,
		);

		client.notify('dispatchAction', {
			clientSeq: 2,
			action: {
				type: 'session/abortTurn',
				session: sessionUri,
			},
		});

		// Verify the abort action was echoed back by the server.
		// We don't wait for turnComplete because the real Copilot SDK may
		// continue streaming after abort and the turn may not terminate within
		// the test timeout.
		await client.waitForNotification(
			n => isActionNotification(n, 'session/abortTurn'),
			10_000,
		);
	});

	// ---- Working directory correctness --------------------------------------

	test('session is created with the correct working directory', async function () {
		this.timeout(120_000);

		// Use a real temp directory so the path exists on disk.
		// Clean it up at the end to avoid leaving test artifacts.
		const tempDir = mkdtempSync(`${tmpdir()}/ahp-test-`);
		tempDirs.push(tempDir);
		const workingDirUri = URI.file(tempDir).toString();

		await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'real-sdk-workdir' });
		await client.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() });

		const sessionUri = URI.from({ scheme: 'copilot', path: `/real-test-wd-${Date.now()}` }).toString();
		await client.call('createSession', { session: sessionUri, provider: 'copilot', workingDirectory: workingDirUri });

		// 1. Verify workingDirectory in the sessionAdded notification
		const addedNotif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded',
			15_000,
		);
		const addedSummary = ((addedNotif.params as INotificationBroadcastParams).notification as ISessionAddedNotification).summary;
		createdSessions.push(addedSummary.resource);
		assert.strictEqual(
			addedSummary.workingDirectory,
			workingDirUri,
			`sessionAdded notification should carry the requested working directory`,
		);

		// 2. Subscribe and verify workingDirectory in the session state snapshot
		const subscribeResult = await client.call<ISubscribeResult>('subscribe', { resource: addedSummary.resource });
		const sessionState = subscribeResult.snapshot.state as ISessionState;
		assert.strictEqual(
			sessionState.summary.workingDirectory,
			workingDirUri,
			`subscribe snapshot summary should carry the requested working directory`,
		);
	});

	// ---- Worktree isolation -------------------------------------------------

	test('worktree session uses the resolved worktree as working directory', async function () {
		this.timeout(120_000);

		// Set up a minimal git repo so the server can create a worktree
		const tempDir = mkdtempSync(`${tmpdir()}/ahp-wt-test-`);
		tempDirs.push(tempDir, `${tempDir}.worktrees`);
		execSync('git init', { cwd: tempDir });
		execSync('git config user.name "Agent Host Test"', { cwd: tempDir });
		execSync('git config user.email "agent-host-test@example.com"', { cwd: tempDir });
		execSync('git commit --allow-empty -m "init"', { cwd: tempDir });
		const defaultBranch = execSync('git branch --show-current', { cwd: tempDir, encoding: 'utf-8' }).trim();
		const workingDirUri = URI.file(tempDir).toString();

		await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'real-sdk-worktree' });
		await client.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() });

		const sessionUri = URI.from({ scheme: 'copilot', path: `/real-test-wt-${Date.now()}` }).toString();
		await client.call('createSession', {
			session: sessionUri,
			provider: 'copilot',
			workingDirectory: workingDirUri,
			config: { isolation: 'worktree', branch: defaultBranch },
		});

		const addedNotif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded',
			15_000,
		);
		const addedSummary = ((addedNotif.params as INotificationBroadcastParams).notification as ISessionAddedNotification).summary;
		createdSessions.push(addedSummary.resource);

		// Subscribe so we receive action broadcasts for this session
		await client.call<ISubscribeResult>('subscribe', { resource: addedSummary.resource });

		// Verify the worktree path is in the summary
		assert.ok(
			addedSummary.workingDirectory,
			'sessionAdded notification should have a workingDirectory',
		);
		assert.ok(
			addedSummary.workingDirectory!.includes('.worktrees'),
			`workingDirectory should be under the .worktrees folder, got: ${addedSummary.workingDirectory}`,
		);

		// Set the active client with tools (matching real VS Code flow where
		// activeClientChanged is dispatched AFTER createSession). When the next
		// sendMessage detects the tools changed vs the session's creation-time
		// snapshot, it disposes the SDK session and re-creates it via
		// _resumeSession. That resume path must use the worktree working
		// directory, not the original repo path.
		client.notify('dispatchAction', {
			clientSeq: 1,
			action: {
				type: 'session/activeClientChanged',
				session: addedSummary.resource,
				activeClient: {
					clientId: 'real-sdk-worktree',
					displayName: 'Test Client',
					tools: [
						{
							name: 'test_echo',
							description: 'A harmless echo tool for testing',
							inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
						},
					],
				},
			},
		});

		// Send a turn — this triggers sendMessage, which will detect the tools
		// changed and refresh the session (dispose + _resumeSession). The
		// resumed session should still have the worktree as its working
		// directory. Ask a safe, read-only question about the working directory.
		client.clearReceived();
		dispatchTurn(client, addedSummary.resource, 'turn-wt',
			'What is your current working directory? Reply with just the absolute path and nothing else.', 2);

		// Wait for the turn to complete or error
		await client.waitForNotification(
			n => isActionNotification(n, 'session/turnComplete') || isActionNotification(n, 'session/error'),
			90_000,
		);

		// The session refresh should succeed — if it errors with
		// "workingDirectory is required to resume", the worktree path was lost.
		const errors = client.receivedNotifications(n => isActionNotification(n, 'session/error'));
		assert.strictEqual(errors.length, 0,
			errors.length > 0
				? `Session error during turn (worktree path lost on resume): ${(getActionEnvelope(errors[0]).action as { error?: { message?: string } }).error?.message}`
				: '',
		);

		// Verify the turn got a response (the session resumed successfully)
		const responseParts = client.receivedNotifications(n => isActionNotification(n, 'session/responsePart'));
		assert.ok(responseParts.length > 0, 'should have received at least one response part after session refresh');
	});
});
