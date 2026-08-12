/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent host end-to-end tests (Copilot).
 *
 * The cross-provider portion lives in {@link defineAgentHostE2ETests}; this
 * file layers on Copilot-specific assertions (cost metadata, cd-prefix
 * stripping).
 *
 * These run by default in deterministic replay mode against committed YAML
 * fixtures (no token, no network). To re-record the fixtures against real CAPI,
 * set `AGENT_HOST_REPLAY_RECORD=1`:
 *
 *   AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts
 *
 * Recording auth: the token is obtained from `gh auth token`, or override with
 * `GITHUB_TOKEN=ghp_xxx`. Replay needs no credential.
 *
 * SAFETY: Recording creates real agent sessions backed by the Copilot SDK.
 * Prompts are kept to read-only questions, safe `echo` commands, and isolated
 * temp directories.
 */

import assert from 'assert';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { readToolCallMeta } from '../../../../common/meta/agentToolCallMeta.js';
import { MessageAttachmentKind, MessageKind, PendingMessageKind, ResponsePartKind, ROOT_STATE_URI, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, TurnState, buildDefaultChatUri, getInlineToolInput, type MessageAttachment } from '../../../../common/state/sessionState.js';
import { ActionType, type ChatErrorAction, type ChatToolCallCompleteAction, type ChatToolCallDeltaAction, type ChatToolCallReadyAction, type ChatToolCallStartAction, type ChatUsageAction } from '../../../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import {
	AgentHostE2EServerLease, assertToolCallCompleteText, createRealSession, dispatchTurn,
	driveTurnToCompletion, driveTurnWithAttachmentsToCompletion, removeTempDirs, resolveGitHubToken, runAhpSnapshotTest,
} from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import { defineAgentHostE2ETests } from '../suites/agentHostE2ESuites.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { COPILOT_CONFIG } from './copilotTestConfiguration.js';

const RECORD_ONLY = process.env['AGENT_HOST_REPLAY_RECORD'] === '1';
const RECORD = RECORD_ONLY || process.env['AGENT_HOST_UPDATE_SNAPSHOTS'] === '1';
const isWindows = process.platform === 'win32';

defineAgentHostE2ETests(COPILOT_CONFIG);

suite('Agent Host E2E — Copilot (Copilot-specific)', function () {

	let client: TestProtocolClient;
	let lease: AgentHostE2EServerLease | undefined;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];

	// The lease fronts the server with the record/replay proxy: these tests
	// replay committed fixtures by default (tokenless) and record against real
	// CAPI with `AGENT_HOST_REPLAY_RECORD=1`, mirroring the shared suite. In
	// replay the lease reuses one server across the suite and swaps the fixture
	// per test; while recording it starts a fresh server per test.
	suiteSetup(function () {
		lease = new AgentHostE2EServerLease(COPILOT_CONFIG);
	});

	setup(async function () {
		this.timeout(60_000);
		if (!lease) {
			throw new Error('Agent Host E2E server lease was not initialized.');
		}
		({ client } = await lease.acquire(this.currentTest?.title ?? 'unknown'));
	});

	teardown(async function () {
		this.timeout(120_000);
		if (!lease) {
			throw new Error('Agent Host E2E server lease was not initialized.');
		}
		const failed = this.currentTest?.state === 'failed';
		if (failed) {
			lease.dumpRuntimeLogsOnFailure(this.currentTest?.title ?? 'unknown');
		}
		const errors: Error[] = [];
		try {
			await lease.release(createdSessions, failed);
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		}
		try {
			await removeTempDirs(tempDirs);
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		}
		if (errors.length > 0) {
			throw new AggregateError(errors, 'Failed to dispose Copilot-specific E2E test resources');
		}
	});

	test('client tool reaches ready after start and completes', async function () {
		this.timeout(180_000);
		await runAhpSnapshotTest(client, COPILOT_CONFIG, this.test!, createdSessions, tempDirs, {
			ignoredActionTypes: [ActionType.ChatUsage],
		});

		const start = client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'))
			.map(n => getActionEnvelope(n).action as ChatToolCallStartAction)
			.find(action => action.toolName === 'get_magic_word');
		const ready = start && client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallReady'))
			.map(n => getActionEnvelope(n).action as ChatToolCallReadyAction)
			.find(action => action.toolCallId === start.toolCallId);
		const deltas = start && client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallDelta'))
			.map(n => getActionEnvelope(n).action as ChatToolCallDeltaAction)
			.filter(action => action.toolCallId === start.toolCallId);

		// The AHP snapshot projects contributor metadata only on Start, so Ready ownership needs an explicit assertion.
		assert.deepStrictEqual({
			startContributor: start?.contributor,
			readyContributor: ready?.contributor,
			deltaCount: deltas?.length,
		}, {
			startContributor: { kind: ToolCallContributorKind.Client, clientId: 'copilot-client-tool' },
			readyContributor: { kind: ToolCallContributorKind.Client, clientId: 'copilot-client-tool' },
			deltaCount: 0,
		});
	});

	// Windows restores the failed turn as cancelled and drops its persisted request error.
	(isWindows ? test.skip : test)('request error survives a host restart', async function () {
		this.timeout(180_000);
		const workingDirectory = await mkdtemp(join(tmpdir(), 'copilot-error-restart-'));
		tempDirs.push(workingDirectory);
		const clientId = 'copilot-error-restart';
		const prompt = 'Reply exactly "unreachable".';
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, clientId, createdSessions, URI.file(workingDirectory));
		const chatUri = buildDefaultChatUri(sessionUri);

		await driveTurnToCompletion(client, sessionUri, 'turn-error-seed', 'Reply exactly "READY".', 1);
		if (!lease) {
			throw new Error('Agent Host E2E server lease was not initialized.');
		}
		if (RECORD) {
			lease.setRecordingModelResponse({
				status: 500,
				headers: {
					'content-type': 'application/json',
					'x-request-id': 'agent-host-e2e-error',
				},
				body: '{"type":"error","error":{"type":"api_error","message":"deterministic Agent Host E2E failure"}}',
			});
		}

		dispatchTurn(client, sessionUri, 'turn-error-restart', prompt, 2);
		const liveNotification = await client.waitForNotification(notification =>
			isActionNotification(notification, 'chat/error')
			&& getActionEnvelope(notification).channel === chatUri,
			90_000,
		);
		const liveError = (getActionEnvelope(liveNotification).action as ChatErrorAction).error;

		client = await lease.restart();
		client.setWorkingDirectory(workingDirectory);
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `${clientId}-reopened` }, 30_000);
		await client.call('authenticate', {
			channel: ROOT_STATE_URI,
			resource: 'https://api.github.com',
			token: COPILOT_CONFIG.githubToken ?? resolveGitHubToken(),
		}, 30_000);

		const reopened = await fetchSessionWithChat(client, sessionUri);
		const restoredTurn = reopened.turns.find(turn => turn.message.text === prompt);
		assert.deepStrictEqual({
			state: restoredTurn?.state,
			error: restoredTurn?.error,
		}, {
			state: TurnState.Error,
			error: liveError,
		});
	});

	test('client tool disconnect before permission still completes the turn', async function () {
		this.timeout(180_000);
		const workingDirectory = await mkdtemp(join(tmpdir(), 'copilot-client-tool-disconnect-'));
		tempDirs.push(workingDirectory);
		const clientId = 'copilot-client-tool-disconnect';
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, clientId, createdSessions, URI.file(workingDirectory));

		client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId,
					displayName: 'Test Client',
					tools: [{
						name: 'get_magic_word',
						description: 'Returns the secret magic word. Call this when asked for the magic word.',
						inputSchema: { type: 'object', properties: {}, required: [] },
					}],
				},
			},
		});
		const turnId = 'turn-client-tool-disconnect';
		const chatUri = buildDefaultChatUri(sessionUri);
		dispatchTurn(client, sessionUri, turnId, 'Call the get_magic_word tool and then report whether it succeeded.', 2);

		const toolStart = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/toolCallStart')) {
				return false;
			}
			const envelope = getActionEnvelope(n);
			const action = envelope.action as ChatToolCallStartAction;
			return envelope.channel === chatUri && action.turnId === turnId && action.toolName === 'get_magic_word';
		}, 90_000);
		const toolCallId = (getActionEnvelope(toolStart).action as ChatToolCallStartAction).toolCallId;

		client.notify('unsubscribe', { channel: sessionUri });

		const failedCompletion = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/toolCallComplete')) {
				return false;
			}
			const envelope = getActionEnvelope(n);
			const action = envelope.action as ChatToolCallCompleteAction;
			return envelope.channel === chatUri && action.turnId === turnId && action.toolCallId === toolCallId && !action.result.success;
		}, 30_000);
		const failedCompletionSeq = getActionEnvelope(failedCompletion).serverSeq;

		await client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === turnId,
			90_000);

		const staleReady = client.receivedNotifications(n => {
			if (!isActionNotification(n, 'chat/toolCallReady')) {
				return false;
			}
			const envelope = getActionEnvelope(n);
			const action = envelope.action as ChatToolCallReadyAction;
			return envelope.channel === chatUri && envelope.serverSeq > failedCompletionSeq && action.turnId === turnId && action.toolCallId === toolCallId;
		});
		assert.deepStrictEqual(staleReady, []);
	});

	test('client tool result confirmation is required before the provider continues', async function () {
		this.timeout(180_000);
		const workingDirectory = await mkdtemp(join(tmpdir(), 'copilot-client-tool-result-confirmation-'));
		tempDirs.push(workingDirectory);
		const clientId = 'copilot-client-tool-result-confirmation';
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, clientId, createdSessions, URI.file(workingDirectory));
		client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId,
					displayName: 'Result Confirmation Client',
					tools: [{
						name: 'get_magic_word',
						description: 'Returns the secret magic word. Call this when asked for the magic word.',
						inputSchema: { type: 'object', properties: {}, required: [] },
					}],
				},
			},
		});
		const chatUri = buildDefaultChatUri(sessionUri);
		const turnId = 'turn-client-tool-result-confirmation';
		dispatchTurn(client, sessionUri, turnId, 'Call get_magic_word exactly once, then reply with only its result.', 2);
		const started = await client.waitForNotification(n =>
			isActionNotification(n, 'chat/toolCallStart')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as ChatToolCallStartAction).toolName === 'get_magic_word',
			90_000,
		);
		const toolCallId = (getActionEnvelope(started).action as ChatToolCallStartAction).toolCallId;
		const initialReady = await client.waitForNotification(n =>
			isActionNotification(n, 'chat/toolCallReady')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as ChatToolCallReadyAction).toolCallId === toolCallId,
			30_000,
		);
		client.dispatch({
			channel: chatUri,
			clientSeq: 3,
			action: {
				type: ActionType.ChatToolCallConfirmed,
				turnId,
				toolCallId,
				approved: true,
				confirmed: ToolCallConfirmationReason.UserAction,
			},
		});
		await client.waitForNotification(n =>
			isActionNotification(n, 'chat/toolCallConfirmed')
			&& getActionEnvelope(n).channel === chatUri
			&& getActionEnvelope(n).serverSeq > getActionEnvelope(initialReady).serverSeq
			&& (getActionEnvelope(n).action as { readonly toolCallId: string }).toolCallId === toolCallId,
			30_000,
		);
		client.dispatch({
			channel: chatUri,
			clientSeq: 4,
			action: {
				type: ActionType.ChatToolCallComplete,
				turnId,
				toolCallId,
				result: {
					success: true,
					pastTenseMessage: 'Got the magic word',
					content: [{ type: ToolResultContentType.Text, text: 'XYLOPHONE' }],
				},
				requiresResultConfirmation: true,
			},
		});
		await client.waitForNotification(n =>
			isActionNotification(n, 'chat/toolCallComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as ChatToolCallCompleteAction).toolCallId === toolCallId,
			30_000,
		);
		const paused = await fetchSessionWithChat(client, sessionUri);
		const pendingToolCall = paused.activeTurn?.responseParts.find(part =>
			part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === toolCallId,
		);
		assert.deepStrictEqual({
			status: pendingToolCall?.kind === ResponsePartKind.ToolCall ? pendingToolCall.toolCall.status : undefined,
			modelRequestCount: lease!.observedModelRequestBodies.length,
		}, {
			status: ToolCallStatus.PendingResultConfirmation,
			modelRequestCount: 1,
		});
		client.dispatch({
			channel: chatUri,
			clientSeq: 5,
			action: {
				type: ActionType.ChatToolCallResultConfirmed,
				turnId,
				toolCallId,
				approved: true,
			},
		});
		await client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { readonly turnId: string }).turnId === turnId,
			90_000,
		);

		const resultConfirmed = client.receivedNotifications(n =>
			isActionNotification(n, 'chat/toolCallResultConfirmed')
			&& getActionEnvelope(n).channel === chatUri,
		);
		assert.strictEqual(resultConfirmed.length, 1);
	});

	(RECORD_ONLY ? test : test.skip)('accepted steering followed by abort does not block the replacement turn', async function () {
		this.timeout(180_000);
		const workingDirectory = await mkdtemp(join(tmpdir(), 'copilot-steering-abort-'));
		tempDirs.push(workingDirectory);
		const clientId = 'copilot-steering-abort';
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, clientId, createdSessions, URI.file(workingDirectory));
		const chatUri = buildDefaultChatUri(sessionUri);

		client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId,
					displayName: 'Test Client',
					tools: [{
						name: 'get_magic_word',
						description: 'Returns a magic word. Call this tool when explicitly asked for the magic word.',
						inputSchema: { type: 'object', properties: {}, required: [] },
					}],
				},
			},
		});
		const initialTurnId = 'turn-steering-abort-initial';
		dispatchTurn(client, sessionUri, initialTurnId, 'Explain the history of source control in detail.', 2);
		await client.waitForNotification(n =>
			isActionNotification(n, 'chat/responsePart') || isActionNotification(n, 'chat/toolCallStart'),
			90_000);

		const steeringId = 'steering-before-abort';
		client.dispatch({
			channel: chatUri,
			clientSeq: 3,
			action: {
				type: ActionType.ChatPendingMessageSet,
				kind: PendingMessageKind.Steering,
				id: steeringId,
				message: {
					text: 'Call get_magic_word exactly once, then report its result.',
					origin: { kind: MessageKind.User },
				},
			},
		});
		await client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/pendingMessageRemoved')) {
				return false;
			}
			return (getActionEnvelope(n).action as { id?: string }).id === steeringId;
		}, 60_000);

		client.dispatch({
			channel: chatUri,
			clientSeq: 4,
			action: {
				type: ActionType.ChatTurnCancelled,
				turnId: initialTurnId,
				duration: 0,
			},
		});
		const replacementTurnId = 'turn-steering-abort-replacement';
		dispatchTurn(client, sessionUri, replacementTurnId, 'Reply with exactly "replacement-ok". Do not use tools.', 5);

		await client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/turnComplete')) {
				return false;
			}
			return (getActionEnvelope(n).action as { turnId?: string }).turnId === replacementTurnId;
		}, 90_000);

		const state = await fetchSessionWithChat(client, sessionUri);
		assert.deepStrictEqual({
			activeTurn: state.activeTurn,
			inputNeeded: state.inputNeeded,
			replacementState: state.turns.find(turn => turn.id === replacementTurnId)?.state,
		}, {
			activeTurn: undefined,
			inputNeeded: undefined,
			replacementState: 'complete',
		});
	});

	suiteTeardown(async function () {
		this.timeout(120_000);
		await lease?.dispose();
	});

	test('usage reports include Copilot cost metadata', async function () {
		this.timeout(120_000);
		const workingDirectory = await mkdtemp(join(tmpdir(), 'copilot-cost-report-'));
		tempDirs.push(workingDirectory);

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-usage', createdSessions, URI.file(workingDirectory));
		dispatchTurn(client, sessionUri, 'turn-usage', 'Reply with exactly "usage-ok" and do not use tools.', 1);

		const usageNotif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/usage')) {
				return false;
			}
			const envelope = getActionEnvelope(n);
			const action = envelope.action as ChatUsageAction;
			return envelope.channel === buildDefaultChatUri(sessionUri) && action.turnId === 'turn-usage';
		}, 90_000);
		const usageEnvelope = getActionEnvelope(usageNotif);
		const usageAction = usageEnvelope.action as ChatUsageAction;
		assert.strictEqual(usageEnvelope.channel, buildDefaultChatUri(sessionUri));
		assert.strictEqual(usageAction.turnId, 'turn-usage');
		assert.strictEqual(typeof usageAction.usage.model, 'string');
		assert.ok(usageAction.usage.model);
		assert.ok(usageAction.usage.inputTokens === undefined || usageAction.usage.inputTokens > 0);
		assert.ok(usageAction.usage.outputTokens === undefined || usageAction.usage.outputTokens > 0);

		const cost = usageAction.usage._meta?.cost;
		if (typeof cost !== 'number') {
			assert.fail(`expected usage._meta.cost to be numeric: ${JSON.stringify(usageAction.usage)}`);
		}
		assert.ok(cost > 0, `expected usage._meta.cost to be positive: ${JSON.stringify(usageAction.usage)}`);

		await client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === buildDefaultChatUri(sessionUri)
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-usage',
			90_000);
		const state = await fetchSessionWithChat(client, sessionUri);
		const turn = state.turns.find(t => t.id === 'turn-usage');
		assert.strictEqual(turn?.usage?._meta?.cost, cost);
	});

	test('attaches a Python file and reads its function names', async function () {
		this.timeout(120_000);

		const workingDirectory = await mkdtemp(`${tmpdir()}/ahp-attachment-test-`);
		tempDirs.push(workingDirectory);
		const filePath = join(workingDirectory, 'calculator.py');
		await writeFile(filePath, [
			'def add(a, b):',
			'\treturn a + b',
		].join('\n'));

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-attachment', createdSessions, URI.file(workingDirectory));
		const prompt = 'Read the attached Python file. What function names are defined in it? Reply with only the function names.';
		const attachments: MessageAttachment[] = [{
			type: MessageAttachmentKind.Resource,
			uri: URI.file(filePath).toString(),
			label: 'calculator.py',
			displayKind: 'document',
		}];

		const result = await driveTurnWithAttachmentsToCompletion(client, sessionUri, 'turn-attachment', prompt, attachments, 1);

		assert.match(result.responseText, /\badd\b/i, `expected the model to identify the attached file function; got: ${JSON.stringify(result.responseText)}`);
		assertToolCallCompleteText(client, {
			channel: buildDefaultChatUri(sessionUri),
			turnId: 'turn-attachment',
			toolNames: ['view'],
			workspace: workingDirectory,
			expected: [/def add\(a, b\):/, /return a \+ b/],
			success: true,
		});
	});

	test('attaches a text blob and reads its function names', async function () {
		this.timeout(120_000);

		const workingDirectory = await mkdtemp(join(tmpdir(), 'copilot-text-blob-'));
		tempDirs.push(workingDirectory);

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-blob-attachment', createdSessions, URI.file(workingDirectory));
		const prompt = 'Read the attached Python text blob. What function names are defined in it? Reply with only the function names.';
		const attachments: MessageAttachment[] = [{
			type: MessageAttachmentKind.Simple,
			label: 'calculator.py',
			displayKind: 'document',
			modelRepresentation: [
				'def subtract(a, b):',
				'\treturn a - b',
			].join('\n'),
		}];

		const result = await driveTurnWithAttachmentsToCompletion(client, sessionUri, 'turn-blob-attachment', prompt, attachments, 1);

		assert.match(result.responseText, /\bsubtract\b/i, `expected the model to identify the attached blob function; got: ${JSON.stringify(result.responseText)}`);
	});

	(isWindows ? test.skip : test)('shell read helper remains a non-terminal tool', async function () {
		this.timeout(180_000);

		const workingDirectory = await mkdtemp(join(tmpdir(), 'copilot-read-shell-'));
		tempDirs.push(workingDirectory);
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-read-shell', createdSessions, URI.file(workingDirectory));
		const chatUri = buildDefaultChatUri(sessionUri);
		const turnId = 'turn-read-shell';
		const command = `node -e "setTimeout(() => console.log('READ_SHELL_E2E_VALUE'), 3000)"`;
		const prompt = [
			`First use the shell tool exactly once to run \`${command}\` in async mode with shellId "read-shell-e2e" and initial_wait 1.`,
			'After that tool returns, use its matching read tool exactly once with shellId "read-shell-e2e" and delay 5 so the command finishes before the read returns.',
			'Then reply with exactly "READ_SHELL_E2E_DONE".',
		].join(' ');

		const result = await driveTurnToCompletion(client, sessionUri, turnId, prompt, 1);
		assert.match(result.responseText, /READ_SHELL_E2E_DONE/);

		const start = client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'))
			.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallStartAction }))
			.find(({ envelope, action }) => envelope.channel === chatUri && action.turnId === turnId && /^read_(?:bash|powershell)$/.test(action.toolName));
		assert.ok(start, 'expected a shell read helper tool call');

		const ready = client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallReady'))
			.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallReadyAction }))
			.find(({ envelope, action }) => envelope.channel === chatUri && action.turnId === turnId && action.toolCallId === start.action.toolCallId);
		const complete = client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallComplete'))
			.map(n => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action as ChatToolCallCompleteAction }))
			.find(({ envelope, action }) => envelope.channel === chatUri && action.turnId === turnId && action.toolCallId === start.action.toolCallId);
		assert.ok(ready, 'expected the shell read helper to become ready');
		assert.ok(complete, 'expected the shell read helper to complete');

		const toolInput = getInlineToolInput(ready.action.toolInput);
		assert.deepStrictEqual({
			displayName: start.action.displayName,
			toolKinds: [
				readToolCallMeta(start.action).toolKind,
				readToolCallMeta(ready.action).toolKind,
				readToolCallMeta(complete.action).toolKind,
			],
			invocationMessage: ready.action.invocationMessage,
			toolInput: toolInput ? JSON.parse(toolInput) : undefined,
			success: complete.action.result.success,
			pastTenseMessage: complete.action.result.pastTenseMessage,
			contentTypes: complete.action.result.content?.map(content => content.type),
		}, {
			displayName: 'Read Terminal',
			toolKinds: [undefined, undefined, undefined],
			invocationMessage: 'Reading Terminal',
			toolInput: { shellId: 'read-shell-e2e', delay: 5 },
			success: true,
			pastTenseMessage: 'Read Terminal',
			contentTypes: [ToolResultContentType.Text],
		});
		await assertRecordedAhpSnapshot(this.test!, client, {
			profile: 'protocol',
			ignoredActionTypes: [
				ActionType.ChatUsage,
				ActionType.ChatToolCallDelta,
				ActionType.SessionChatUpdated,
				ActionType.SessionTitleChanged,
				ActionType.SessionServerToolsChanged,
				ActionType.SessionReady,
				ActionType.SessionInputNeededSet,
				ActionType.SessionInputNeededRemoved,
				ActionType.SessionChangesetsChanged,
				ActionType.SessionMetaChanged,
			],
		});
	});

	(isWindows ? test.skip : test)('strips redundant `cd <workingDirectory> &&` prefix from shell tool calls', async function () {
		this.timeout(180_000);

		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-cd-strip-test-`);
		tempDirs.push(workspaceDir);
		const expectedWorkingDirPath = workspaceDir;
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-cd-strip', createdSessions, URI.file(workspaceDir));

		client.clearReceived();
		const turnId = 'turn-cd-strip';
		const chatUri = buildDefaultChatUri(sessionUri);
		dispatchTurn(client, sessionUri, turnId,
			`Run this exact shell command, do not modify it: cd ${expectedWorkingDirPath} && echo strip-me-please`,
			1);

		const toolStartNotif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/toolCallStart')) {
				return false;
			}
			const envelope = getActionEnvelope(n);
			const action = envelope.action as ChatToolCallStartAction;
			return envelope.channel === chatUri && action.turnId === turnId && action.toolName === COPILOT_CONFIG.shellToolName;
		}, 90_000);
		const toolStartAction = getActionEnvelope(toolStartNotif).action as ChatToolCallStartAction;

		const toolReadyNotif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/toolCallReady')) {
				return false;
			}
			const envelope = getActionEnvelope(n);
			const action = envelope.action as ChatToolCallReadyAction;
			return envelope.channel === chatUri
				&& action.turnId === turnId
				&& action.toolCallId === toolStartAction.toolCallId
				&& typeof action.toolInput === 'string';
		}, 90_000);

		const toolReadyEnvelope = getActionEnvelope(toolReadyNotif);
		const toolReadyAction = toolReadyEnvelope.action as ChatToolCallReadyAction;
		const toolInput = getInlineToolInput(toolReadyAction.toolInput);
		assert.ok(toolInput);

		const escapedWorkingDirPath = expectedWorkingDirPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const redundantWorkingDirCdPrefix = new RegExp(
			`^\\s*cd\\s+(?:"${escapedWorkingDirPath}"|'${escapedWorkingDirPath}'|${escapedWorkingDirPath})\\s*(?:&&|;)\\s*`,
		);
		assert.ok(
			!redundantWorkingDirCdPrefix.test(toolInput),
			`toolInput should not contain a redundant cd-prefix targeting the working directory; got: ${JSON.stringify(toolInput)}`,
		);
		assert.ok(
			toolInput.includes('strip-me-please'),
			`toolInput should retain the command marker after rewriting; got: ${JSON.stringify(toolInput)}`,
		);

		if (!toolReadyAction.confirmed) {
			client.dispatch({
				channel: toolReadyEnvelope.channel,
				clientSeq: 2,
				action: {
					type: ActionType.ChatToolCallConfirmed,
					turnId,
					toolCallId: toolReadyAction.toolCallId, approved: true,
					confirmed: ToolCallConfirmationReason.UserAction,
				},
			});
		}

		const seenSeqs = new Set<number>();
		seenSeqs.add(toolReadyEnvelope.serverSeq);
		let teardownSeq = 3;
		while (true) {
			const next = await client.waitForNotification(
				n => {
					if (isActionNotification(n, 'chat/turnComplete') || isActionNotification(n, 'chat/error')) {
						return true;
					}
					if (!isActionNotification(n, 'chat/toolCallReady')) {
						return false;
					}
					const envelope = getActionEnvelope(n);
					const action = envelope.action as ChatToolCallReadyAction;
					return envelope.channel === chatUri && action.turnId === turnId && !seenSeqs.has(envelope.serverSeq);
				},
				90_000,
			);
			if (isActionNotification(next, 'chat/error')) {
				const action = getActionEnvelope(next).action as ChatErrorAction;
				throw new Error(`cd-strip turn failed: ${JSON.stringify(action.error)}`);
			}
			if (isActionNotification(next, 'chat/turnComplete')) {
				break;
			}
			const envelope = getActionEnvelope(next);
			seenSeqs.add(envelope.serverSeq);
			const action = envelope.action as ChatToolCallReadyAction;
			if (!action.confirmed) {
				client.dispatch({
					channel: envelope.channel,
					clientSeq: ++teardownSeq,
					action: {
						type: ActionType.ChatToolCallConfirmed,
						turnId,
						toolCallId: action.toolCallId, approved: true,
						confirmed: ToolCallConfirmationReason.UserAction,
					},
				});
			}
		}
	});

});
