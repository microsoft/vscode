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
import type { SessionToolCallStartAction } from '../../../common/state/protocol/actions.js';
import { SubscribeResult } from '../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { ResponsePartKind, ROOT_STATE_URI, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, ToolResultContentType, isSubagentSession, type SessionInputAnswer, type SessionInputRequest, type SessionState, type TerminalState, type ToolResultContent, type ToolResultSubagentContent } from '../../../common/state/sessionState.js';
import type { RootState } from '../../../common/state/protocol/state.js';
import { type RootAgentsChangedAction, type SessionInputRequestedAction, type SessionToolCallReadyAction, type SessionAddedNotification } from '../../../common/state/sessionActions.js';
import { NotificationType } from '../../../common/state/protocol/notifications.js';
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
	addedNotification: SessionAddedNotification;
	subscribeSnapshot: SessionState;
}

/** Full version that returns the sessionAdded notification and subscribe snapshot for assertions. */
async function createRealSessionFull(c: TestProtocolClient, clientId: string, trackingList: string[], workingDirectory?: string): Promise<IRealSessionResult> {
	await c.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId }, 30_000);

	await c.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);

	const sessionUri = URI.from({ scheme: 'copilotcli', path: `/real-test-${Date.now()}` }).toString();
	await c.call('createSession', { session: sessionUri, provider: 'copilotcli', workingDirectory }, 30_000);

	// Sessions are created provisionally — `notify/sessionAdded` is deferred
	// until the agent materializes on first message dispatch. The provisional
	// state is already in the state manager and addressable by the URI we
	// passed in, so subscribe directly without waiting for the notification.
	trackingList.push(sessionUri);

	const subscribeResult = await c.call<SubscribeResult>('subscribe', { resource: sessionUri });
	const subscribeSnapshot = subscribeResult.snapshot.state as SessionState;
	const addedNotification: SessionAddedNotification = { type: NotificationType.SessionAdded, summary: subscribeSnapshot.summary };
	c.clearReceived();

	return { sessionUri, addedNotification, subscribeSnapshot };
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

function getAcceptedAnswers(request: SessionInputRequest): Record<string, SessionInputAnswer> | undefined {
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
				} satisfies SessionInputAnswer];
			case SessionInputQuestionKind.Number:
			case SessionInputQuestionKind.Integer:
				return [question.id, {
					state: SessionInputAnswerState.Submitted,
					value: {
						kind: SessionInputAnswerValueKind.Number,
						value: question.defaultValue ?? question.min ?? 1,
					},
				} satisfies SessionInputAnswer];
			case SessionInputQuestionKind.Boolean:
				return [question.id, {
					state: SessionInputAnswerState.Submitted,
					value: {
						kind: SessionInputAnswerValueKind.Boolean,
						value: question.defaultValue ?? true,
					},
				} satisfies SessionInputAnswer];
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
				} satisfies SessionInputAnswer];
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
				} satisfies SessionInputAnswer];
			}
		}
	}));
}

function getMarkdownResponseText(c: TestProtocolClient): string {
	// Markdown content arrives as a `session/responsePart` action that opens
	// the part with the first chunk, followed by `session/delta` actions
	// appending subsequent chunks. Concatenate both to get the full text.
	const markdownPartIds = new Set<string>();
	const pieces: string[] = [];
	for (const notification of c.receivedNotifications(n =>
		isActionNotification(n, 'session/responsePart') || isActionNotification(n, 'session/delta')
	)) {
		const action = getActionEnvelope(notification).action;
		if (action.type === 'session/responsePart' && action.part.kind === ResponsePartKind.Markdown) {
			markdownPartIds.add(action.part.id);
			pieces.push(action.part.content);
		} else if (action.type === 'session/delta' && markdownPartIds.has(action.partId)) {
			pieces.push(action.content);
		}
	}
	return pieces.join('');
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
			const action = getActionEnvelope(notification).action as SessionToolCallReadyAction;
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
			const action = getActionEnvelope(notification).action as SessionInputRequestedAction;
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

function terminalResourceFromContent(content: readonly ToolResultContent[]): string | undefined {
	const terminalContent = content.find(c => c.type === ToolResultContentType.Terminal);
	return terminalContent?.resource;
}

function terminalText(state: TerminalState): string {
	return removeAnsiEscapeCodes(state.content.map(part => part.type === 'command' ? `${part.commandLine}\n${part.output}` : part.value).join(''));
}

/** Looks up the toolName for a toolCallReady by joining against the matching toolCallStart. */
function findToolNameForCall(c: TestProtocolClient, toolCallId: string): string | undefined {
	return c.receivedNotifications(n => isActionNotification(n, 'session/toolCallStart'))
		.map(n => getActionEnvelope(n).action as SessionToolCallStartAction)
		.find(a => a.toolCallId === toolCallId)?.toolName;
}

interface IApprovalRule {
	/** Tool name this rule applies to (e.g. `'bash'`, `'write_bash'`). */
	toolName: string;
	/** Optional predicate over the tool input. If omitted, any input matches. */
	matchInput?: (toolInput: string | undefined) => boolean;
	/**
	 * Optional inspector run for every matched call before approval.
	 * Push assertion failure messages onto `errors` to fail the test.
	 */
	inspect?: (info: {
		action: SessionToolCallReadyAction;
		errors: string[];
	}) => void;
}

interface IBackgroundApprovalLoopOptions {
	/** Starting clientSeq for dispatched toolCallConfirmed actions. Avoids collisions with the test's own dispatches. */
	approvalSeqStart: number;
	/**
	 * Allow-list of tool calls the loop is permitted to auto-approve. Each
	 * pending confirmation must match exactly one rule (by `toolName` plus
	 * optional `matchInput` predicate). Calls that don't match are recorded
	 * as errors and denied — the loop refuses to rubber-stamp anything the
	 * test didn't anticipate (e.g. an unexpected `rm` from the model).
	 */
	allow: readonly IApprovalRule[];
}

interface IBackgroundApprovalLoop {
	/** Errors collected during the run (unmatched tool calls + inspector failures). */
	readonly errors: readonly string[];
	/** Tool names that were observed and approved at least once. */
	readonly approvedToolNames: ReadonlySet<string>;
	/**
	 * Tool names for every permission request observed by the loop, regardless
	 * of whether they matched the allow-list. Useful for asserting that a
	 * tool with `skipPermission: true` never triggered a permission flow.
	 */
	readonly observedToolNames: ReadonlySet<string>;
	/** Stops the loop and waits for it to drain. */
	stop(): Promise<void>;
}

/**
 * Starts a background loop that auto-approves pending tool call confirmations
 * during a real-SDK turn, but only if they match the supplied allow-list.
 * Anything outside the allow-list is denied and recorded as an error so the
 * test fails loudly instead of silently approving model-chosen tool calls.
 *
 * Implementation note: `waitForNotification` does NOT consume notifications from
 * the client's queue, so we dedupe by `serverSeq`.
 */
function startBackgroundApprovalLoop(c: TestProtocolClient, options: IBackgroundApprovalLoopOptions): IBackgroundApprovalLoop {
	const errors: string[] = [];
	const approvedToolNames = new Set<string>();
	const observedToolNames = new Set<string>();
	const processedSeqs = new Set<number>();
	let active = true;
	let approvalSeq = options.approvalSeqStart;

	const loop = (async () => {
		while (active) {
			try {
				const ready = await c.waitForNotification(n => {
					if (!isActionNotification(n, 'session/toolCallReady')) {
						return false;
					}
					return !processedSeqs.has(getActionEnvelope(n).serverSeq);
				}, 2_000);
				const envelope = getActionEnvelope(ready);
				processedSeqs.add(envelope.serverSeq);
				const action = envelope.action as SessionToolCallReadyAction & { session: string; turnId: string };
				if (action.confirmed) {
					continue;
				}

				const toolName = findToolNameForCall(c, action.toolCallId);
				if (toolName) {
					observedToolNames.add(toolName);
				}
				const matchingRule = options.allow.find(rule =>
					rule.toolName === toolName
					&& (rule.matchInput?.(action.toolInput) ?? true));

				if (!matchingRule) {
					errors.push(`unexpected tool call: toolName=${toolName ?? '<unknown>'} input=${JSON.stringify(action.toolInput)}`);
					c.notify('dispatchAction', {
						clientSeq: ++approvalSeq,
						action: {
							type: 'session/toolCallConfirmed',
							session: action.session,
							turnId: action.turnId,
							toolCallId: action.toolCallId,
							approved: false,
						},
					});
					continue;
				}

				matchingRule.inspect?.({ action, errors });
				approvedToolNames.add(matchingRule.toolName);

				c.notify('dispatchAction', {
					clientSeq: ++approvalSeq,
					action: {
						type: 'session/toolCallConfirmed',
						session: action.session,
						turnId: action.turnId,
						toolCallId: action.toolCallId,
						approved: true,
					},
				});
			} catch (e) {
				// Only ignore the expected 2-second poll timeout. Any other error
				// (e.g. 'Client closed', exception from matchingRule.inspect) is a
				// real failure — record it so the test fails deterministically.
				const msg = e instanceof Error ? e.message : String(e);
				if (!msg.includes('Timed out') && !msg.includes('timed out')) {
					errors.push(`approval loop error: ${msg}`);
					active = false;
				}
			}
		}
	})();

	return {
		errors,
		approvedToolNames,
		observedToolNames,
		async stop(): Promise<void> {
			active = false;
			await loop;
		},
	};
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

		// Remove temp directories created during this test. On Windows the
		// agent subprocess can still hold handles to the working directory for
		// a brief moment after `disposeSession` returns, which surfaces as
		// EBUSY. Retry a few times to give the OS a chance to release the
		// handle before failing the teardown.
		for (const dir of tempDirs) {
			try {
				rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch {
				// Best-effort cleanup — leftover temp dirs in os.tmpdir() are
				// harmless and shouldn't fail an otherwise passing test.
			}
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

		// Switch the session into plan mode via the standard config-change flow
		// before sending the first turn. The agent host reads this value at
		// turn-start time and pushes it to the SDK via `rpc.mode.set`.
		client.notify('dispatchAction', {
			clientSeq: 1,
			action: {
				type: 'session/configChanged',
				session: sessionUri,
				config: { mode: 'plan' },
			},
		});
		await client.waitForNotification(n => isActionNotification(n, 'session/configChanged'));

		const planTurn = await driveTurnToCompletion(client, sessionUri, 'turn-plan',
			'Help me implement a Python script that prints "hello world" to stdout. Write the shortest possible plan to your session plan.md and use the exit_plan_mode tool to ask me to approve it before writing any code.', 2);
		assert.strictEqual(planTurn.sawPendingConfirmation, false, 'should not have received pending-confirmation toolCallReady while writing session-state plan.md');
		assert.ok(planTurn.sawInputRequest, 'should reach the exit_plan_mode question so the test can continue the same session');

		const extraSessionNotificationsAfterPlan = client.receivedNotifications(n =>
			n.method === 'notification' &&
			(n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded' &&
			((n.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource !== sessionUri,
		);
		assert.strictEqual(extraSessionNotificationsAfterPlan.length, 0, 'should not create a second session while answering the plan-mode question');

		// Mirror what a real UI client would do after the user accepted the
		// plan: update the session config so subsequent turns no longer run
		// in plan mode. Without this the agent host would re-set the SDK's
		// mode to 'plan' at the next send because the session config still
		// holds the original 'plan' value.
		client.notify('dispatchAction', {
			clientSeq: 50,
			action: {
				type: 'session/configChanged',
				session: sessionUri,
				config: { mode: 'interactive' },
			},
		});
		await client.waitForNotification(n => isActionNotification(n, 'session/configChanged'));

		const followupTurn = await driveTurnToCompletion(client, sessionUri, 'turn-followup',
			'What did the plan I just approved say to print? Reply with exactly "hello world".', 100,
		);
		assert.strictEqual(followupTurn.sawPendingConfirmation, false, 'follow-up turn should not surface new pending confirmations');
		assert.match(followupTurn.responseText, /hello world/i, 'follow-up turn should retain the original plan context');

		const extraSessionNotificationsAfterFollowup = client.receivedNotifications(n =>
			n.method === 'notification' &&
			(n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded' &&
			((n.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource !== sessionUri,
		);
		assert.strictEqual(extraSessionNotificationsAfterFollowup.length, 0, 'sending another message should stay on the same session instead of forking');

		const resubscribeResult = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const finalSnapshot = resubscribeResult.snapshot.state as SessionState;
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

		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'real-sdk-workdir' });
		await client.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() });

		const sessionUri = URI.from({ scheme: 'copilotcli', path: `/real-test-wd-${Date.now()}` }).toString();
		await client.call('createSession', { session: sessionUri, provider: 'copilotcli', workingDirectory: workingDirUri });
		createdSessions.push(sessionUri);

		// Sessions are created provisionally; the workingDirectory is recorded
		// in the session state immediately and is unchanged by materialization
		// for the non-worktree (folder) isolation case. Subscribe directly and
		// verify the snapshot carries the requested working directory.
		const subscribeResult = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const sessionState = subscribeResult.snapshot.state as SessionState;
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

		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'real-sdk-worktree' });
		await client.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() });

		const sessionUri = URI.from({ scheme: 'copilotcli', path: `/real-test-wt-${Date.now()}` }).toString();
		await client.call('createSession', {
			session: sessionUri,
			provider: 'copilotcli',
			workingDirectory: workingDirUri,
			config: { isolation: 'worktree', branch: defaultBranch },
		});
		createdSessions.push(sessionUri);

		// Subscribe so we receive action broadcasts for this session. The
		// session is provisional — the worktree isn't created and the
		// `notify/sessionAdded` isn't emitted until the agent materializes
		// on the first sendMessage below.
		await client.call<SubscribeResult>('subscribe', { resource: sessionUri });

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
				session: sessionUri,
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

		// Send a turn — this triggers materialization (worktree creation +
		// SDK session instantiation) followed by sendMessage. The materialized
		// session should use the worktree as its working directory.
		client.clearReceived();
		dispatchTurn(client, sessionUri, 'turn-wt',
			'What is your current working directory? Reply with just the absolute path and nothing else.', 2);

		// Wait for the deferred sessionAdded notification — it fires when the
		// agent materializes the provisional session into a real one.
		const addedNotif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded',
			60_000,
		);
		const addedSummary = ((addedNotif.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary;

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

		// Wait for the turn (which triggered materialization) to complete or
		// error. The session refresh during materialization should succeed —
		// if it errors with "workingDirectory is required to resume", the
		// worktree path was lost.
		await client.waitForNotification(
			n => isActionNotification(n, 'session/turnComplete') || isActionNotification(n, 'session/error'),
			90_000,
		);

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
			const action = getActionEnvelope(n).action as { toolCallId: string; content: readonly ToolResultContent[] };
			return action.toolCallId === toolStartAction.toolCallId && terminalResourceFromContent(action.content) !== undefined;
		}, 30_000);
		const terminalContentAction = getActionEnvelope(terminalContentNotif).action as { content: readonly ToolResultContent[] };
		const terminalUri = terminalResourceFromContent(terminalContentAction.content);
		assert.ok(terminalUri, 'shell tool should expose its terminal resource');

		const terminalSubscribeResult = await client.call<SubscribeResult>('subscribe', { resource: terminalUri });
		const initialTerminalState = terminalSubscribeResult.snapshot.state as TerminalState;
		assert.strictEqual(initialTerminalState.cwd, resolvedWorkingDirectoryPath, 'terminal should be created in the resolved worktree directory');

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'), 90_000);
		const terminalSnapshot = await client.call<SubscribeResult>('subscribe', { resource: terminalUri });
		const terminalState = terminalSnapshot.snapshot.state as TerminalState;
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
		// loop keeps the turn unblocked. Track processed serverSeqs so we don't
		// busy-spin on already-handled notifications (waitForNotification returns
		// matching notifications from the queue without consuming them). Using
		// serverSeq rather than toolCallId allows the same tool to be legitimately
		// re-confirmed in a later notification.
		let approvalsActive = true;
		let approvalSeq = 1000;
		const processedSeqs = new Set<number>();
		const approvalLoop = (async () => {
			while (approvalsActive) {
				try {
					const ready = await client.waitForNotification(n => {
						if (!isActionNotification(n, 'session/toolCallReady')) {
							return false;
						}
						const envelope = getActionEnvelope(n);
						const a = envelope.action as { confirmed?: string };
						return !a.confirmed && !processedSeqs.has(envelope.serverSeq);
					}, 2_000);
					const envelope = getActionEnvelope(ready);
					if (!processedSeqs.has(envelope.serverSeq)) {
						processedSeqs.add(envelope.serverSeq);
						const action = envelope.action as { session: string; turnId: string; toolCallId: string; confirmed?: string };
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
			const action = getActionEnvelope(n).action as { session: string; content: readonly ToolResultContent[] };
			return action.session === sessionUri && action.content.some(c => c.type === ToolResultContentType.Subagent);
		}, 120_000);

		const parentContent = (getActionEnvelope(subagentContentNotif).action as { content: readonly ToolResultContent[] }).content;
		const subagentRef = parentContent.find((c): c is ToolResultSubagentContent => c.type === ToolResultContentType.Subagent)!;
		const subagentSessionUri = subagentRef.resource as unknown as string;
		assert.ok(typeof subagentSessionUri === 'string' && isSubagentSession(subagentSessionUri),
			`subagent session URI should be subagent-shaped, got: ${JSON.stringify(subagentSessionUri)}`);

		// Subscribe so we receive the subagent session's own action broadcasts.
		await client.call<SubscribeResult>('subscribe', { resource: subagentSessionUri });

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
			.map(n => getActionEnvelope(n).action as SessionToolCallStartAction);

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

		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'real-sdk-list-models' }, 30_000);

		// Subscribe to root state *before* authenticating so we can observe
		// the agentsChanged action that carries the populated model list.
		const rootResult = await client.call<SubscribeResult>('subscribe', { resource: ROOT_STATE_URI }, 30_000);
		const initial = rootResult.snapshot.state as RootState;
		const copilotAgent = initial.agents.find(a => a.provider === 'copilotcli');
		assert.ok(copilotAgent, `Expected copilotcli agent in root state, got: ${initial.agents.map(a => a.provider).join(', ')}`);

		await client.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);

		// Models are loaded asynchronously after authenticate. Wait for the
		// agentsChanged action that populates them.
		const notif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'root/agentsChanged')) {
				return false;
			}
			const action = getActionEnvelope(n).action as RootAgentsChangedAction;
			const agent = action.agents.find(a => a.provider === 'copilotcli');
			return !!agent && agent.models.length > 0;
		}, 30_000);

		const action = getActionEnvelope(notif).action as RootAgentsChangedAction;
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

	// ---- Redundant cd-prefix stripping --------------------------------------

	test('strips redundant `cd <workingDirectory> &&` prefix from shell tool calls', async function () {
		this.timeout(180_000);

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-cd-strip-test-`);
		tempDirs.push(tempDir);
		const expectedWorkingDirPath = tempDir;
		const sessionUri = await createRealSession(client, 'real-sdk-cd-strip', createdSessions, URI.file(tempDir).toString());

		// Coax the model into producing a `cd <wd> && X` form. The exact text is
		// non-deterministic, so the test asserts on rewrite behavior conditional
		// on actually receiving a cd-prefixed command.
		client.clearReceived();
		dispatchTurn(client, sessionUri, 'turn-cd-strip',
			`Run this exact shell command, do not modify it: cd ${expectedWorkingDirPath} && echo strip-me-please`,
			1);

		// Wait for the toolCallReady action that carries the rewritten toolInput.
		const toolReadyNotif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/toolCallReady')) {
				return false;
			}
			const action = getActionEnvelope(n).action as { toolInput?: string };
			return typeof action.toolInput === 'string' && action.toolInput.includes('echo strip-me-please');
		}, 90_000);

		const toolReadyAction = getActionEnvelope(toolReadyNotif).action as { toolCallId: string; toolInput?: string; confirmed?: string };
		const toolInput = toolReadyAction.toolInput!;

		// The core assertion: regardless of whether the model emitted the cd
		// prefix verbatim or already pre-stripped it, the toolInput surfaced to
		// the client must NOT contain the redundant `cd <tempDir> &&` prefix.
		// Use a regex that anchors to the start of the command and tolerates
		// optional surrounding quotes around the directory plus either `&&`
		// or `;` as the chain operator (so quoted variants like
		// `cd "<wd>" && …` and pwsh-style `cd <wd>; …` are both detected).
		const escapedWorkingDirPath = expectedWorkingDirPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const redundantWorkingDirCdPrefix = new RegExp(
			`^\\s*cd\\s+(?:"${escapedWorkingDirPath}"|'${escapedWorkingDirPath}'|${escapedWorkingDirPath})\\s*(?:&&|;)\\s*`,
		);
		assert.ok(
			!redundantWorkingDirCdPrefix.test(toolInput),
			`toolInput should not contain a redundant cd-prefix targeting the working directory; got: ${JSON.stringify(toolInput)}`,
		);
		assert.ok(
			toolInput.includes('echo strip-me-please'),
			`toolInput should contain the rewritten command body; got: ${JSON.stringify(toolInput)}`,
		);

		// Approve so the turn can complete. If it was already auto-confirmed
		// (`confirmed` is set), skip the manual approval.
		if (!toolReadyAction.confirmed) {
			client.notify('dispatchAction', {
				clientSeq: 2,
				action: {
					type: 'session/toolCallConfirmed',
					session: sessionUri,
					turnId: 'turn-cd-strip',
					toolCallId: toolReadyAction.toolCallId,
					approved: true,
				},
			});
		}

		// Drive any further confirmations to completion so teardown is clean.
		// Track which toolCallReady notifications we've already handled by
		// serverSeq — without this, `waitForNotification` keeps finding the
		// same already-processed notification synchronously every iteration
		// and the loop spins at 100% CPU.
		const seenSeqs = new Set<number>();
		seenSeqs.add(getActionEnvelope(toolReadyNotif).serverSeq);
		let teardownSeq = 3;
		while (true) {
			const next = await client.waitForNotification(
				n => {
					if (isActionNotification(n, 'session/turnComplete') || isActionNotification(n, 'session/error')) {
						return true;
					}
					if (!isActionNotification(n, 'session/toolCallReady')) {
						return false;
					}
					return !seenSeqs.has(getActionEnvelope(n).serverSeq);
				},
				90_000,
			);
			if (isActionNotification(next, 'session/turnComplete') || isActionNotification(next, 'session/error')) {
				break;
			}
			const envelope = getActionEnvelope(next);
			seenSeqs.add(envelope.serverSeq);
			const action = envelope.action as { session: string; turnId: string; toolCallId: string; confirmed?: string };
			if (!action.confirmed) {
				client.notify('dispatchAction', {
					clientSeq: ++teardownSeq,
					action: {
						type: 'session/toolCallConfirmed',
						session: action.session,
						turnId: action.turnId,
						toolCallId: action.toolCallId,
						approved: true,
					},
				});
			}
		}
	});

	// ---- write_bash skipPermission regression test --------------------------

	test('write_bash never triggers a permission request (skipPermission flag)', async function () {
		this.timeout(180_000);

		// What this test verifies:
		//   `write_bash` (and `read_bash` / `bash_shutdown` / `list_bash`) are
		//   registered as external tools with `skipPermission: true`, mirroring
		//   the SDK's built-in shell helpers which never call `permissions.request`.
		//   This regression test catches accidental removal of that flag — if it's
		//   removed, the SDK will route write_bash through our permission flow and
		//   the test will fail with `observedToolNames` containing 'write_bash'.
		//
		// How it works:
		//   1. Allow-list permits ONLY `bash` (the interactive prompt). write_bash
		//      is intentionally absent from the allow list.
		//   2. The model is instructed to use `write_bash`. If any permission
		//      request appears for write_bash, the loop records it in
		//      `observedToolNames` and we fail the assertion.
		//   3. We assert that bash actually ran AND that write_bash appeared in
		//      toolCallStart notifications (so the test is non-vacuous — the model
		//      actually tried to use the tool, not just piped input via bash).

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-write-bash-skip-perm-`);
		tempDirs.push(tempDir);
		const sessionUri = await createRealSession(client, 'real-sdk-write-bash-skip-perm', createdSessions, URI.file(tempDir).toString());

		const approvalLoop = startBackgroundApprovalLoop(client, {
			approvalSeqStart: 100,
			allow: [
				{
					// Setup bash command — the interactive `read` prompt.
					toolName: 'bash',
					matchInput: input => !!input && input.includes('read') && input.includes('Got:'),
				},
				// Note: write_bash is intentionally NOT in the allow list. With
				// skipPermission: true, the SDK won't ask us — so the test passes.
				// Without it, the SDK would ask, the loop would deny + record an
				// error, and the test would fail loudly.
			],
		});

		dispatchTurn(client, sessionUri, 'turn-write-bash-skip-perm',
			'You MUST demonstrate the `write_bash` tool. Steps, in order:\n' +
			'1. Use the `bash` tool to run exactly: read -p "Enter: " v; echo "Got: $v"\n' +
			'   This will block waiting for stdin.\n' +
			'2. While that bash call is waiting, you MUST use the `write_bash` tool to send the input "hello\\n" to it.\n' +
			'   Do NOT pipe the input via the original bash command. Do NOT use `echo hello | ...`.\n' +
			'   You MUST go through the `write_bash` tool — that is the entire point of this task.\n' +
			'3. After the shell prints "Got: hello", reply with the single word "done".',
			1);

		await client.waitForNotification(
			n => isActionNotification(n, 'session/turnComplete') || isActionNotification(n, 'session/error'),
			150_000,
		);
		await approvalLoop.stop();

		// Sanity check: the bash setup command actually ran. Otherwise the
		// model ignored the prompt and the write_bash assertion below is vacuous.
		assert.ok(approvalLoop.approvedToolNames.has('bash'),
			`expected the model to invoke bash for setup; observed approved tools: ${[...approvalLoop.approvedToolNames].join(', ') || '<none>'}`);

		// Non-vacuousness check: write_bash must have actually been invoked
		// (seen in a toolCallStart notification). If the model piped input via
		// the original bash command instead of using write_bash, this fails.
		const writeBashStarts = client.receivedNotifications(n => isActionNotification(n, 'session/toolCallStart'))
			.map(n => getActionEnvelope(n).action as { toolName?: string })
			.filter(a => a.toolName === 'write_bash');
		assert.ok(writeBashStarts.length > 0,
			`expected write_bash to be invoked at least once (toolCallStart), but it was never called. The model may have piped input via the original bash command instead.`);

		// The actual regression check: write_bash must never reach our
		// permission handler. If this fails, `skipPermission: true` was likely
		// removed from copilotShellTools.ts.
		assert.ok(!approvalLoop.observedToolNames.has('write_bash'),
			`write_bash should be auto-approved by the SDK (skipPermission: true) and never trigger a permission request, but the test observed one. Observed permission requests: ${[...approvalLoop.observedToolNames].join(', ')}`);

		// Any other unexpected permission requests (e.g. an unrelated tool the
		// model decided to use) would also have been recorded as errors.
		assert.deepStrictEqual(approvalLoop.errors, [],
			`unexpected approval-loop errors: ${approvalLoop.errors.join('; ')}`);
	});
});
