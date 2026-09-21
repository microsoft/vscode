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
import { buildDefaultChatUri, MessageKind, ResponsePartKind, ROOT_STATE_URI, SessionStatus, TurnState, type ChatState, type ISessionWithDefaultChat } from '../../../common/state/sessionState.js';
import { ToolCallConfirmationReason } from '../../../common/state/protocol/channels-chat/state.js';
import { AgentHostSessionReleaseRetryMsEnvVar, AgentHostSessionResidencyLimitEnvVar } from '../../../common/agentService.js';
import type { IAgentHostPersistentTeamState } from '../../../common/agentHostPersistentTeam.js';
import { CopilotModelTeamConfigKey } from '../../../common/copilotModelTeam.js';
import { GetPersistentTeamStateExtensionMethod } from '../../../common/agentHostExtensionProtocol.js';
import type { SubscribeResult } from '../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { createProviderSession, dispatchTurn, type IAgentHostProviderTestConfig } from '../providerIntegrationTestHelpers.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, IServerHandle, startRealServer, stopServer, TestProtocolClient } from '../serverIntegrationTestHelpers.js';

const COPILOT_CONFIG: IAgentHostProviderTestConfig = {
	provider: 'copilotcli',
	scheme: 'copilotcli',
	githubToken: 'not-a-real-token',
};

const DETACHED_SHELL_SCENARIO_ID = 'detached-shell-idle-release';
const DETACHED_SHELL_DELAY_MS = 6000;

interface ITeamModelInput {
	readonly role?: string;
	readonly content?: string | readonly { readonly text?: string }[];
}

function teamInputText(input: readonly ITeamModelInput[]): string {
	return input.filter(item => item.role === 'user').map(item => typeof item.content === 'string' ? item.content : item.content?.map(part => part.text ?? '').join('') ?? '').join('\n');
}

function teamTarget(input: readonly ITeamModelInput[], role: string): string {
	const text = teamInputText(input);
	const match = text.match(new RegExp(`${role}: (?<link>agent-host-session://[^\\s]+)`, 'i'));
	assert.ok(match?.groups?.link, `Missing ${role} chat link in the real model request`);
	return match.groups.link;
}

function teamReportId(input: readonly ITeamModelInput[], role: string): string {
	return [...teamInputText(input).matchAll(new RegExp(`## ${role}\\nreportId: (?<id>[^\\s]+)`, 'g'))].at(-1)?.groups?.id ?? 'not-yet-delivered';
}

suite('Agent Host Provider Integration - Enforced model teams', function () {
	let server: IServerHandle;
	let client: TestProtocolClient;
	let home: string;
	const sessions: string[] = [];

	async function startTeamServer() {
		server = await startRealServer({
			mockLlm: true, homeDir: home, userDataDir: join(home, 'user-data'),
			mockScenarios: [
				{
					id: 'enforced-team-lead',
					definition: {
						type: 'multi-turn',
						turns: [
							{
								kind: 'tool-calls',
								toolCalls: [{ toolNamePattern: /^bash$/, arguments: { command: `echo forbidden > ${quoteShellArgument(join(home, 'lead-before-handoff.txt'))}`, description: 'Attempt implementation before engineer hand-back' } }],
							},
							{ kind: 'content', chunks: [{ content: 'An early solo answer.', delayMs: 0 }] },
							{
								kind: 'tool-calls',
								toolCalls: ['worker', 'scout'].map(role => ({
									toolNamePattern: /^manage_team$/,
									arguments: { action: 'assign', role, objective: `${role} engineering`, deliverable: `${role} verified result` },
								})),
							},
							{
								kind: 'tool-calls',
								toolCalls: ['worker', 'scout'].map(role => ({
									toolNamePattern: /^send_message$/,
									arguments: (input: readonly ITeamModelInput[]) => ({
										session: teamTarget(input, role), message: `[scenario:enforced-team-${role}] Complete your assignment and report.`,
									}),
								})),
							},
							{ kind: 'content', chunks: [{ content: 'Assignments sent; waiting for results.', delayMs: 0 }] },
							...[0, 1].flatMap(() => [
								{
									kind: 'tool-calls',
									toolCalls: ['worker', 'scout'].map(role => ({
										toolNamePattern: /^manage_team$/,
										arguments: (input: readonly ITeamModelInput[]) => ({
											action: 'review', role, reportId: teamReportId(input, role), accept: true, feedback: `Verified ${role} evidence`,
										}),
									})),
								},
								{ kind: 'content', chunks: [{ content: 'Reviewed WORKER_RESULT_73 and SCOUT_RESULT_42 when available.', delayMs: 0 }] },
							]),
						],
					},
				},
				{
					id: 'team-manager-integration',
					definition: {
						type: 'multi-turn',
						turns: [
							{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^manage_team$/, arguments: { action: 'assign', role: 'worker', objective: 'Implement the component', deliverable: 'Verified component ready to integrate' } }] },
							{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^send_message$/, arguments: (input: readonly ITeamModelInput[]) => ({ session: teamTarget(input, 'worker'), message: '[scenario:enforced-team-worker] Implement and verify the component.' }) }] },
							{ kind: 'content', chunks: [{ content: 'Waiting for the engineer.', delayMs: 0 }] },
							{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^manage_team$/, arguments: (input: readonly ITeamModelInput[]) => ({ action: 'review', role: 'worker', reportId: teamReportId(input, 'worker'), accept: true, feedback: 'Verified the component and test report' }) }] },
							{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^manage_team$/, arguments: { action: 'phase', phase: 'integration' } }] },
							{ kind: 'content', chunks: [{ content: 'Yielding for integration hand-back.', delayMs: 0 }] },
							{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^create$/, arguments: { path: join(home, 'lead-integration.txt'), file_text: 'Integrated accepted work\n' } }] },
							{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^manage_team$/, arguments: { action: 'phase', phase: 'manager' } }] },
							{ kind: 'content', chunks: [{ content: 'Returning to management.', delayMs: 0 }] },
							{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^create$/, arguments: { path: join(home, 'lead-after-integration.txt'), file_text: 'forbidden\n' } }] },
							{ kind: 'content', chunks: [{ content: 'Engineering accepted and integrated.', delayMs: 0 }] },
						],
					},
				},
				{
					id: 'team-normal-chat',
					definition: {
						type: 'multi-turn',
						turns: [
							{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^bash$/, arguments: { command: `echo normal > ${quoteShellArgument(join(home, 'normal-chat-tools.txt'))}`, description: 'Verify normal chat tools' } }] },
							{ kind: 'content', chunks: [{ content: 'Normal chat completed.', delayMs: 0 }] },
						],
					},
				},
				{ id: 'enforced-team-worker', definition: [{ content: 'WORKER_RESULT_73', delayMs: 250 }] },
				{ id: 'enforced-team-scout', definition: [{ content: 'SCOUT_RESULT_42', delayMs: 500 }] },
				{ id: 'enforced-team-ignore', definition: [{ content: 'I will finish alone.', delayMs: 0 }] },
			],
		});
	}

	suiteSetup(async function () {
		this.timeout(120_000);
		home = await mkdtemp(join(tmpdir(), 'test-enforced-team-'));
		await startTeamServer();
	});

	suiteTeardown(async () => {
		await stopServer(server);
		await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
	});

	setup(async () => {
		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(async () => {
		for (const session of sessions.splice(0)) {
			await client.call('disposeSession', { session });
		}
		client.close();
	});

	async function createTeam(scenario: string, existingSession?: string, clientSeq = 1, withScout = true, leadModel = 'gpt-5.3-codex') {
		const session = existingSession ?? await createProviderSession(client, {
			...COPILOT_CONFIG,
			sessionConfig: {
				autoApprove: 'autoApprove',
				[CopilotModelTeamConfigKey]: { worker: { id: 'gpt-5.3-codex' }, ...(withScout ? { scout: { id: 'gpt-5.3-codex' } } : {}) },
			},
		}, scenario, sessions, URI.file(home));
		const leadChat = buildDefaultChatUri(session);
		const turnId = `${scenario}-turn-${clientSeq}`;
		client.dispatch({
			channel: leadChat, clientSeq, action: {
				type: ActionType.ChatTurnStarted, turnId, startedAt: new Date().toISOString(),
				message: { text: `[scenario:${scenario}] Solve this task as a team.`, origin: { kind: MessageKind.User }, model: { id: leadModel } },
			},
		});
		const end = await client.waitForNotification(notification => {
			if (!isActionNotification(notification, ActionType.ChatTurnComplete) && !isActionNotification(notification, ActionType.ChatError)) {
				return false;
			}
			const envelope = getActionEnvelope(notification);
			return envelope.channel === leadChat
				&& (envelope.action.type === ActionType.ChatTurnComplete || envelope.action.type === ActionType.ChatError)
				&& envelope.action.turnId === turnId;
		}, 60_000);
		const action = getActionEnvelope(end).action;
		const state = await client.call<IAgentHostPersistentTeamState>(GetPersistentTeamStateExtensionMethod, { session, leadChat });
		return { session, leadChat, turnId, action, state };
	}

	test('requires both assignments and delivers their final reports without teammate send_message calls', async function () {
		this.timeout(90_000);
		const { session, turnId, action, state } = await createTeam('enforced-team-lead');
		assert.strictEqual(action.type, ActionType.ChatTurnComplete, JSON.stringify(action));
		const transcript = await fetchSessionWithChat(client, session);
		const final = transcript.turns.find(turn => turn.id === turnId)?.responseParts.filter(part => part.kind === ResponsePartKind.Markdown).map(part => part.content).join('\n');
		const teammates = await Promise.all(state.members.map(async member => {
			const result = await client.call<SubscribeResult>('subscribe', { channel: member.chat });
			const chat = result.snapshot?.state as ChatState;
			return {
				role: member.role,
				turns: chat.turns.length,
				hasMessagingCall: chat.turns.some(turn => turn.responseParts.some(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolName === 'send_message')),
			};
		}));
		assert.deepStrictEqual({
			state: state.task?.state,
			assignments: state.task?.assignments.map(assignment => ({ role: assignment.role, state: assignment.state, reviewed: assignment.reviewed })),
			workerReviewed: final?.includes('WORKER_RESULT_73'),
			scoutReviewed: final?.includes('SCOUT_RESULT_42'),
			queued: transcript.queuedMessages?.length ?? 0,
			leadEditedBeforeHandBack: existsSync(join(home, 'lead-before-handoff.txt')),
			teammates,
		}, {
			state: 'completed',
			assignments: [{ role: 'worker', state: 'reported', reviewed: true }, { role: 'scout', state: 'reported', reviewed: true }],
			workerReviewed: true, scoutReviewed: true, queued: 0, leadEditedBeforeHandBack: false,
			teammates: [{ role: 'worker', turns: 1, hasMessagingCall: false }, { role: 'scout', turns: 1, hasMessagingCall: false }],
		});
	});

	test('stock runtime allows integration edits only after hand-back and closes them before management resumes', async function () {
		this.timeout(90_000);
		const { action, state } = await createTeam('team-manager-integration', undefined, 1, false, 'claude-sonnet-4.5');
		assert.strictEqual(action.type, ActionType.ChatTurnComplete, JSON.stringify(action));
		assert.deepStrictEqual({
			integrated: existsSync(join(home, 'lead-integration.txt')) ? await readFile(join(home, 'lead-integration.txt'), 'utf8') : undefined,
			editedAfterHandBack: existsSync(join(home, 'lead-after-integration.txt')),
			state: state.task?.state,
			phase: state.task?.leadPhase,
			accepted: state.task?.assignments[0].reviewed,
		}, { integrated: 'Integrated accepted work\n', editedAfterHandBack: false, state: 'completed', phase: 'manager', accepted: true });
	});

	test('enabling and disabling Team refreshes tools on the same saved Lead chat', async function () {
		this.timeout(120_000);
		const session = await createProviderSession(client, {
			...COPILOT_CONFIG, sessionConfig: { autoApprove: 'autoApprove' },
		}, 'team-toggle-tools', sessions, URI.file(home));
		const runNormal = async (turnId: string, clientSeq: number) => {
			dispatchTurn(client, session, turnId, '[scenario:team-normal-chat] Verify normal tools.', clientSeq);
			await client.waitForNotification(notification => {
				if (!isActionNotification(notification, ActionType.ChatTurnComplete)) {
					return false;
				}
				const envelope = getActionEnvelope(notification);
				return envelope.channel === buildDefaultChatUri(session) && envelope.action.type === ActionType.ChatTurnComplete && envelope.action.turnId === turnId;
			}, 60_000);
			assert.strictEqual(await readFile(join(home, 'normal-chat-tools.txt'), 'utf8'), 'normal\n');
			await rm(join(home, 'normal-chat-tools.txt'));
		};
		await runNormal('normal-before-team', 1);
		client.dispatch({
			channel: session, clientSeq: 2, action: {
				type: ActionType.SessionConfigChanged, config: {
					[CopilotModelTeamConfigKey]: { worker: { id: 'gpt-5.3-codex' }, scout: { id: 'gpt-5.3-codex' } },
				}
			},
		});
		const enabled = await createTeam('enforced-team-lead', session, 3);
		assert.strictEqual(enabled.action.type, ActionType.ChatTurnComplete, JSON.stringify(enabled.action));
		client.dispatch({ channel: session, clientSeq: 4, action: { type: ActionType.SessionConfigChanged, config: { [CopilotModelTeamConfigKey]: {} } } });
		await runNormal('normal-after-team', 5);
	});

	test('a model that keeps ignoring Team is blocked instead of completing alone', async function () {
		this.timeout(90_000);
		const { action, state } = await createTeam('enforced-team-ignore');
		assert.deepStrictEqual({
			action: action.type,
			state: state.task?.state,
			unassigned: state.task?.assignments.map(assignment => assignment.state),
		}, { action: ActionType.ChatError, state: 'blocked', unassigned: ['unassigned', 'unassigned'] });
	});

	test('configuration refresh reuses the same teammates and cannot bypass host completion', async function () {
		this.timeout(120_000);
		const first = await createTeam('enforced-team-lead');
		assert.strictEqual(first.action.type, ActionType.ChatTurnComplete, JSON.stringify(first.action));
		client.dispatch({
			channel: first.session, clientSeq: 2,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'enforced-team-lead', customizations: [],
					tools: [{ name: 'team_test_noop', description: 'Unused tool to refresh session configuration.', inputSchema: { type: 'object', properties: {} } }],
				},
			},
		});
		await client.waitForNotification(notification => isActionNotification(notification, ActionType.SessionActiveClientSet)
			&& getActionEnvelope(notification).channel === first.session);
		const second = await createTeam('enforced-team-lead', first.session, 3);
		assert.deepStrictEqual({
			action: second.action.type,
			error: second.action.type === ActionType.ChatError ? second.action.part.error?.message : undefined,
			members: second.state.members.map(member => member.chat),
			task: second.state.task?.state,
			reviewed: second.state.task?.assignments.map(assignment => assignment.reviewed),
		}, {
			action: ActionType.ChatTurnComplete, error: undefined,
			members: first.state.members.map(member => member.chat), task: 'completed', reviewed: [true, true],
		});
	});

	test('blocked tasks restore with durable turn identities and explicit retry', async function () {
		this.timeout(120_000);
		const first = await createTeam('enforced-team-ignore');
		client.close();
		await stopServer(server);
		await startTeamServer();
		client = new TestProtocolClient(server.port);
		await client.connect();
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'team-cold-restored' });
		await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: COPILOT_CONFIG.githubToken });
		const restored = await client.call<IAgentHostPersistentTeamState>(GetPersistentTeamStateExtensionMethod, { session: first.session, leadChat: first.leadChat });
		const snapshot = await fetchSessionWithChat(client, first.session);
		const turn = snapshot.turns.find(turn => turn.id === restored.task?.leadEventId);
		assert.ok(turn);
		assert.deepStrictEqual({
			turns: snapshot.turns.length,
			text: turn.message.text,
			state: turn.state,
			retryable: turn.responseParts.some(part => part.kind === ResponsePartKind.Error && part.resumable),
			members: restored.members.map(member => member.chat),
		}, {
			turns: 1,
			text: '[scenario:enforced-team-ignore] Solve this task as a team.',
			state: TurnState.Error,
			retryable: true,
			members: first.state.members.map(member => member.chat),
		});
		client.clearReceived();
		client.dispatch({ channel: first.leadChat, clientSeq: 1, action: { type: ActionType.ChatTurnResume, turnId: turn.id } });
		const outcome = await client.waitForNotification(notification => isActionNotification(notification, ActionType.ChatError)
			&& getActionEnvelope(notification).channel === first.leadChat, 60_000);
		const action = getActionEnvelope(outcome).action;
		assert.ok(action.type === ActionType.ChatError);
		assert.strictEqual(action.turnId, turn.id);
	});
});

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
 * The dedicated server uses a zero residency cap and short provider-veto retry
 * so release is deterministic without changing production policy.
 */
suite('Agent Host Provider Integration — Copilot Idle Release', function () {

	// Short enough that a post-unsubscribe wait reliably outlasts it, long
	// enough that the intra-test subscribe calls in createProviderSession don't race it.
	const RELEASE_RETRY_MS = 500;

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
			env: {
				[AgentHostSessionResidencyLimitEnvVar]: '0',
				[AgentHostSessionReleaseRetryMsEnvVar]: String(RELEASE_RETRY_MS),
			},
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
		await timeout(RELEASE_RETRY_MS + 1000);

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
		const firstResult = await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete') || isActionNotification(n, 'chat/error'), 90_000);
		assert.strictEqual(getActionEnvelope(firstResult).action.type, ActionType.ChatTurnComplete, JSON.stringify(getActionEnvelope(firstResult).action));

		const before = await fetchSessionWithChat(client, sessionUri);
		assert.match(assistantMarkdown(before.turns, 'turn-release-1'), new RegExp(`\\b${firstProbe}\\b`, 'i'), 'first turn should have completed before release');

		// Drop every subscriber. The zero-capacity server drops cached protocol
		// state and releases the live SDK session while preserving its event log.
		for (const channel of [buildDefaultChatUri(sessionUri), sessionUri]) {
			client.notify('unsubscribe', { channel });
		}
		await timeout(RELEASE_RETRY_MS + 2000);

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
		const secondResult = await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete') || isActionNotification(n, 'chat/error'), 90_000);
		assert.strictEqual(getActionEnvelope(secondResult).action.type, ActionType.ChatTurnComplete, JSON.stringify(getActionEnvelope(secondResult).action));

		const final = await fetchSessionWithChat(client, sessionUri);
		assert.match(assistantMarkdown(final.turns, 'turn-release-2'), new RegExp(`\\b${secondProbe}\\b`, 'i'), 'a follow-up turn must complete after the release/resume cycle');
	});
});
