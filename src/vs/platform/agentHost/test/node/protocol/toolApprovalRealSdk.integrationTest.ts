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
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { removeAnsiEscapeCodes } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import type { ISessionToolCallStartAction } from '../../../common/state/protocol/actions.js';
import { ISubscribeResult } from '../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../common/state/sessionCapabilities.js';
import { ResponsePartKind, ROOT_STATE_URI, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, ToolResultContentType, isSubagentSession, type ISessionInputAnswer, type ISessionInputRequest, type ISessionState, type ITerminalState, type IToolResultContent, type IToolResultSubagentContent } from '../../../common/state/sessionState.js';
import type { IRootState } from '../../../common/state/protocol/state.js';
import type { IRootAgentsChangedAction, ISessionAddedNotification, ISessionInputRequestedAction, ISessionResponsePartAction, ISessionToolCallReadyAction } from '../../../common/state/sessionActions.js';
import type { INotificationBroadcastParams } from '../../../common/state/sessionProtocol.js';
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

	const sessionUri = URI.from({ scheme: 'copilotcli', path: `/real-test-${Date.now()}` }).toString();
	await c.call('createSession', { session: sessionUri, provider: 'copilotcli', workingDirectory }, 30_000);

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

function getAcceptedAnswers(request: ISessionInputRequest): Record<string, ISessionInputAnswer> | undefined {
	if (!request.questions?.length) {
		return undefined;
	}

	return Object.fromEntries(request.questions.map(question => {
		switch (question.kind) {
			case SessionInputQuestionKind.Text:
				return [question.id, {
					state: SessionInputAnswerState.Submitted,
					value: {
						kind: SessionInputAnswerValueKind.Text,
						value: question.defaultValue ?? 'interactive',
					},
				} satisfies ISessionInputAnswer];
			case SessionInputQuestionKind.Number:
			case SessionInputQuestionKind.Integer:
				return [question.id, {
					state: SessionInputAnswerState.Submitted,
					value: {
						kind: SessionInputAnswerValueKind.Number,
						value: question.defaultValue ?? question.min ?? 1,
					},
				} satisfies ISessionInputAnswer];
			case SessionInputQuestionKind.Boolean:
				return [question.id, {
					state: SessionInputAnswerState.Submitted,
					value: {
						kind: SessionInputAnswerValueKind.Boolean,
						value: question.defaultValue ?? true,
					},
				} satisfies ISessionInputAnswer];
			case SessionInputQuestionKind.SingleSelect: {
				const preferredOption = question.options.find(option => /interactive/i.test(option.id) || /interactive/i.test(option.label))
					?? question.options.find(option => option.recommended)
					?? question.options[0];
				return [question.id, {
					state: SessionInputAnswerState.Submitted,
					value: {
						kind: SessionInputAnswerValueKind.Selected,
						value: preferredOption.id,
					},
				} satisfies ISessionInputAnswer];
			}
			case SessionInputQuestionKind.MultiSelect: {
				const preferredOptions = question.options.filter(option => option.recommended);
				const selectedOptions = preferredOptions.length > 0 ? preferredOptions : question.options.slice(0, 1);
				return [question.id, {
					state: SessionInputAnswerState.Submitted,
					value: {
						kind: SessionInputAnswerValueKind.SelectedMany,
						value: selectedOptions.map(option => option.id),
					},
				} satisfies ISessionInputAnswer];
			}
		}
	}));
}

function getMarkdownResponseText(c: TestProtocolClient): string {
	return c.receivedNotifications(n => isActionNotification(n, 'session/responsePart'))
		.map(notification => getActionEnvelope(notification).action as ISessionResponsePartAction)
		.flatMap(action => action.part.kind === ResponsePartKind.Markdown ? [action.part.content] : [])
		.join('\n');
}

interface IDrivenTurnResult {
	sawInputRequest: boolean;
	sawPendingConfirmation: boolean;
	responseText: string;
}

async function driveTurnToCompletion(c: TestProtocolClient, session: string, turnId: string, text: string, clientSeq: number): Promise<IDrivenTurnResult> {
	c.clearReceived();
	dispatchTurn(c, session, turnId, text, clientSeq);

	const seenNotifications = new Set<object>();
	let nextClientSeq = clientSeq + 1;
	let sawInputRequest = false;
	let sawPendingConfirmation = false;

	while (true) {
		const notification = await c.waitForNotification(n => !seenNotifications.has(n as object) && (
			isActionNotification(n, 'session/toolCallReady')
			|| isActionNotification(n, 'session/inputRequested')
			|| isActionNotification(n, 'session/turnComplete')
			|| isActionNotification(n, 'session/error')
		), 90_000);
		seenNotifications.add(notification as object);

		if (isActionNotification(notification, 'session/error')) {
			throw new Error(`Session error while driving ${turnId}`);
		}

		if (isActionNotification(notification, 'session/toolCallReady')) {
			const action = getActionEnvelope(notification).action as ISessionToolCallReadyAction;
			if (!action.confirmed) {
				sawPendingConfirmation = true;
				c.notify('dispatchAction', {
					clientSeq: nextClientSeq++,
					action: {
						type: 'session/toolCallConfirmed',
						session,
						turnId,
						toolCallId: action.toolCallId,
						approved: true,
					},
				});
			}
			continue;
		}

		if (isActionNotification(notification, 'session/inputRequested')) {
			sawInputRequest = true;
			const action = getActionEnvelope(notification).action as ISessionInputRequestedAction;
			c.notify('dispatchAction', {
				clientSeq: nextClientSeq++,
				action: {
					type: 'session/inputCompleted',
					session,
					requestId: action.request.id,
					response: SessionInputResponseKind.Accept,
					answers: getAcceptedAnswers(action.request),
				},
			});
			continue;
		}

		break;
	}

	return {
		sawInputRequest,
		sawPendingConfirmation,
		responseText: getMarkdownResponseText(c),
	};
}

function terminalResourceFromContent(content: readonly IToolResultContent[]): string | undefined {
	const terminalContent = content.find(c => c.type === ToolResultContentType.Terminal);
	return terminalContent?.resource;
}

function terminalText(state: ITerminalState): string {
	return removeAnsiEscapeCodes(state.content.map(part => part.type === 'command' ? `${part.commandLine}\n${part.output}` : part.value).join(''));
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

	test('planning-mode session-state writes are auto-approved in default mode', async function () {
		this.timeout(180_000);

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-plan-test-`);
		tempDirs.push(tempDir);
		const sessionUri = await createRealSession(client, 'real-sdk-plan-mode', createdSessions, URI.file(tempDir).toString());

		const planTurn = await driveTurnToCompletion(client, sessionUri, 'turn-plan',
			'Enter plan mode for the trivial task "say hello". Write the shortest possible plan to your session plan.md, then stop at exit_plan_mode. Do not inspect or modify workspace files.', 1);
		assert.strictEqual(planTurn.sawPendingConfirmation, false, 'should not have received pending-confirmation toolCallReady while writing session-state plan.md');
		assert.ok(planTurn.sawInputRequest, 'should reach the exit_plan_mode question so the test can continue the same session');

		const extraSessionNotificationsAfterPlan = client.receivedNotifications(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded',
		);
		assert.strictEqual(extraSessionNotificationsAfterPlan.length, 0, 'should not create a second session while answering the plan-mode question');

		const followupTurn = await driveTurnToCompletion(client, sessionUri, 'turn-followup',
			'What was the trivial task from the plan? Reply with exactly "say hello".', 10,
		);
		assert.strictEqual(followupTurn.sawPendingConfirmation, false, 'follow-up turn should not surface new pending confirmations');
		assert.match(followupTurn.responseText, /say hello/i, 'follow-up turn should retain the original plan context');

		const extraSessionNotificationsAfterFollowup = client.receivedNotifications(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded',
		);
		assert.strictEqual(extraSessionNotificationsAfterFollowup.length, 0, 'sending another message should stay on the same session instead of forking');

		const resubscribeResult = await client.call<ISubscribeResult>('subscribe', { resource: sessionUri });
		const finalSnapshot = resubscribeResult.snapshot.state as ISessionState;
		assert.strictEqual(finalSnapshot.summary.resource, sessionUri, 'follow-up turn should keep the original session resource');
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

		const sessionUri = URI.from({ scheme: 'copilotcli', path: `/real-test-wd-${Date.now()}` }).toString();
		await client.call('createSession', { session: sessionUri, provider: 'copilotcli', workingDirectory: workingDirUri });

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

		const sessionUri = URI.from({ scheme: 'copilotcli', path: `/real-test-wt-${Date.now()}` }).toString();
		await client.call('createSession', {
			session: sessionUri,
			provider: 'copilotcli',
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
		const resolvedWorkingDirectoryPath = URI.parse(addedSummary.workingDirectory!).fsPath;

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

		client.clearReceived();
		dispatchTurn(client, addedSummary.resource, 'turn-wt-terminal', 'Run the shell command: pwd', 3);

		const toolStartNotif = await client.waitForNotification(
			n => isActionNotification(n, 'session/toolCallStart'),
			60_000,
		);
		const toolStartAction = getActionEnvelope(toolStartNotif).action as { toolCallId: string };

		const toolReadyNotif = await client.waitForNotification(
			n => isActionNotification(n, 'session/toolCallReady'),
			30_000,
		);
		const toolReadyAction = getActionEnvelope(toolReadyNotif).action as { confirmed?: string };
		if (!toolReadyAction.confirmed) {
			client.notify('dispatchAction', {
				clientSeq: 4,
				action: {
					type: 'session/toolCallConfirmed',
					session: addedSummary.resource,
					turnId: 'turn-wt-terminal',
					toolCallId: toolStartAction.toolCallId,
					approved: true,
				},
			});
		}

		const terminalContentNotif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/toolCallContentChanged')) {
				return false;
			}
			const action = getActionEnvelope(n).action as { toolCallId: string; content: readonly IToolResultContent[] };
			return action.toolCallId === toolStartAction.toolCallId && terminalResourceFromContent(action.content) !== undefined;
		}, 30_000);
		const terminalContentAction = getActionEnvelope(terminalContentNotif).action as { content: readonly IToolResultContent[] };
		const terminalUri = terminalResourceFromContent(terminalContentAction.content);
		assert.ok(terminalUri, 'shell tool should expose its terminal resource');

		const terminalSubscribeResult = await client.call<ISubscribeResult>('subscribe', { resource: terminalUri });
		const initialTerminalState = terminalSubscribeResult.snapshot.state as ITerminalState;
		assert.strictEqual(initialTerminalState.cwd, resolvedWorkingDirectoryPath, 'terminal should be created in the resolved worktree directory');

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'), 90_000);
		const terminalSnapshot = await client.call<ISubscribeResult>('subscribe', { resource: terminalUri });
		const terminalState = terminalSnapshot.snapshot.state as ITerminalState;
		assert.ok(terminalText(terminalState).includes(resolvedWorkingDirectoryPath), `pwd output should include the resolved worktree path ${resolvedWorkingDirectoryPath}`);
	});

	// ---- Subagent tool call grouping ----------------------------------------

	test('subagent tool calls are routed to the subagent session, not flat in the parent', async function () {
		this.timeout(180_000);

		// Set up a small fixture directory so the subagent has something to view.
		const tempDir = mkdtempSync(`${tmpdir()}/ahp-subagent-test-`);
		tempDirs.push(tempDir);
		writeFileSync(`${tempDir}/file-a.txt`, 'alpha');
		writeFileSync(`${tempDir}/file-b.txt`, 'beta');

		const sessionUri = await createRealSession(client, 'real-sdk-subagent', createdSessions, URI.file(tempDir).toString());

		// Auto-approve every tool that needs confirmation while the turn runs.
		// Multiple inner tool calls may need approval; doing this in a background
		// loop keeps the turn unblocked.
		let approvalsActive = true;
		let approvalSeq = 1000;
		const approvalLoop = (async () => {
			while (approvalsActive) {
				try {
					const ready = await client.waitForNotification(n => isActionNotification(n, 'session/toolCallReady'), 2_000);
					const action = getActionEnvelope(ready).action as { session: string; turnId: string; toolCallId: string; confirmed?: string };
					if (!action.confirmed) {
						client.notify('dispatchAction', {
							clientSeq: ++approvalSeq,
							action: {
								type: 'session/toolCallConfirmed',
								session: action.session,
								turnId: action.turnId,
								toolCallId: action.toolCallId,
								approved: true,
							},
						});
					}
				} catch {
					// Timeout — re-poll. Loop exits when approvalsActive flips.
				}
			}
		})();

		// Encourage the model to delegate via the `task` subagent tool. The exact
		// behaviour is non-deterministic — if the model declines we fail the test
		// with a clear message rather than silently passing.
		dispatchTurn(client, sessionUri, 'turn-sa',
			'Use the `task` tool to spawn a subagent to list the files in the current working directory. ' +
			'The subagent should call a single read-only tool (e.g. `view` or `bash` with `ls`) to enumerate the directory. ' +
			'Do not enumerate the directory yourself — delegate to the subagent.',
			1);

		// Wait for the parent's `task` tool call to expose a Subagent content
		// block carrying the subagent session URI.
		const subagentContentNotif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/toolCallContentChanged')) {
				return false;
			}
			const action = getActionEnvelope(n).action as { session: string; content: readonly IToolResultContent[] };
			return action.session === sessionUri && action.content.some(c => c.type === ToolResultContentType.Subagent);
		}, 120_000);

		const parentContent = (getActionEnvelope(subagentContentNotif).action as { content: readonly IToolResultContent[] }).content;
		const subagentRef = parentContent.find((c): c is IToolResultSubagentContent => c.type === ToolResultContentType.Subagent)!;
		const subagentSessionUri = subagentRef.resource as unknown as string;
		assert.ok(typeof subagentSessionUri === 'string' && isSubagentSession(subagentSessionUri),
			`subagent session URI should be subagent-shaped, got: ${JSON.stringify(subagentSessionUri)}`);

		// Subscribe so we receive the subagent session's own action broadcasts.
		await client.call<ISubscribeResult>('subscribe', { resource: subagentSessionUri });

		// Wait for the parent turn to complete (with a generous timeout — the
		// subagent's turn must finish first).
		await client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/turnComplete')) {
				return false;
			}
			return (getActionEnvelope(n).action as { session: string }).session === sessionUri;
		}, 150_000);

		approvalsActive = false;
		await approvalLoop;

		// Group all received toolCallStart actions by the session they target.
		// This is the bug's signature: when inner tool_start arrives before
		// subagent_started, the inner tool calls leak into the parent session.
		const toolStarts = client.receivedNotifications(n => isActionNotification(n, 'session/toolCallStart'))
			.map(n => getActionEnvelope(n).action as ISessionToolCallStartAction);

		const parentStarts = toolStarts.filter(a => (a.session as unknown as string) === sessionUri);
		const subagentStarts = toolStarts.filter(a => (a.session as unknown as string) === subagentSessionUri);

		// Parent should only carry the outer `task` tool call. Any other
		// tool call on the parent indicates the inner-tool routing bug.
		const parentNonTaskStarts = parentStarts.filter(a => a.toolName !== 'task');
		assert.deepStrictEqual(
			parentNonTaskStarts.map(a => a.toolName),
			[],
			`parent session should not contain inner tool calls; found: ${JSON.stringify(parentNonTaskStarts.map(a => a.toolName))}`,
		);

		// Subagent session must have at least one inner tool call. If this
		// fails, the subagent never actually executed any work — likely the
		// model didn't delegate as instructed.
		assert.ok(subagentStarts.length >= 1,
			`subagent session should contain at least one inner tool call, got ${subagentStarts.length}. ` +
			`Parent tool calls: ${JSON.stringify(parentStarts.map(a => a.toolName))}`);
	});

	// ---- Model discovery -----------------------------------------------------

	test('listModels returns well-shaped model entries after authenticate', async function () {
		this.timeout(60_000);

		await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'real-sdk-list-models' }, 30_000);

		// Subscribe to root state *before* authenticating so we can observe
		// the agentsChanged action that carries the populated model list.
		const rootResult = await client.call<ISubscribeResult>('subscribe', { resource: ROOT_STATE_URI }, 30_000);
		const initial = rootResult.snapshot.state as IRootState;
		const copilotAgent = initial.agents.find(a => a.provider === 'copilotcli');
		assert.ok(copilotAgent, `Expected copilotcli agent in root state, got: ${initial.agents.map(a => a.provider).join(', ')}`);

		await client.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);

		// Models are loaded asynchronously after authenticate. Wait for the
		// agentsChanged action that populates them.
		const notif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'root/agentsChanged')) {
				return false;
			}
			const action = getActionEnvelope(n).action as IRootAgentsChangedAction;
			const agent = action.agents.find(a => a.provider === 'copilotcli');
			return !!agent && agent.models.length > 0;
		}, 30_000);

		const action = getActionEnvelope(notif).action as IRootAgentsChangedAction;
		const agent = action.agents.find(a => a.provider === 'copilotcli')!;

		assert.ok(agent.models.length > 0, 'Expected at least one model from listModels');

		// Assert every model has the shape CopilotAgent._listModels produces.
		// maxContextWindow is optional because synthetic SDK entries (e.g. the
		// `auto` router) ship with `capabilities: {}` and no fixed window.
		for (const model of agent.models) {
			assert.strictEqual(typeof model.id, 'string', `model.id should be a string: ${JSON.stringify(model)}`);
			assert.ok(model.id.length > 0, `model.id should be non-empty: ${JSON.stringify(model)}`);
			assert.strictEqual(typeof model.name, 'string', `model.name should be a string: ${JSON.stringify(model)}`);
			assert.strictEqual(model.provider, 'copilotcli', `model.provider should be copilotcli: ${JSON.stringify(model)}`);
			assert.ok(model.maxContextWindow === undefined || (typeof model.maxContextWindow === 'number' && model.maxContextWindow > 0),
				`model.maxContextWindow should be undefined or a positive number: ${JSON.stringify(model)}`);
			assert.ok(model.supportsVision === undefined || typeof model.supportsVision === 'boolean', `model.supportsVision should be boolean or undefined: ${JSON.stringify(model)}`);
		}

		// The `auto` synthetic router model should be present even though it
		// has no fixed context window.
		assert.ok(agent.models.some(m => m.id === 'auto'), `Expected 'auto' model in list, got: ${agent.models.map(m => m.id).join(', ')}`);
	});
});
