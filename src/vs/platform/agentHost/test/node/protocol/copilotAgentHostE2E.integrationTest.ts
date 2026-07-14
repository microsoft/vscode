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
 *   AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/protocol/copilotAgentHostE2E.integrationTest.ts
 *
 * Recording auth: the token is obtained from `gh auth token`, or override with
 * `GITHUB_TOKEN=ghp_xxx`. Replay needs no credential.
 *
 * SAFETY: Recording creates real agent sessions backed by the Copilot SDK.
 * Prompts are kept to read-only questions, safe `echo` commands, and isolated
 * temp directories.
 */

import assert from 'assert';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { homedir, tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { MessageAttachmentKind, MessageKind, buildDefaultChatUri, ToolCallConfirmationReason, ToolResultContentType, type MessageAttachment } from '../../../common/state/sessionState.js';
import { ActionType, type ChatToolCallReadyAction, type ChatToolCallStartAction, type ChatUsageAction } from '../../../common/state/sessionActions.js';
import {
	AgentHostE2EServerLease, createRealSession, defineAgentHostE2ETests, dispatchTurn, driveTurnWithAttachmentsToCompletion,
	type IAgentHostE2EProviderConfig,
} from './agentHostE2ETestHelpers.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, TestProtocolClient } from './testHelpers.js';

const COPILOT_CONFIG: IAgentHostE2EProviderConfig = {
	suiteTitle: 'Agent Host E2E — Copilot',
	provider: 'copilotcli',
	scheme: 'copilotcli',
	shellToolName: 'bash',
	subagentToolNames: ['task'],
	exitPlanModeToolName: 'exit_plan_mode',
	// The shared suite runs by default in deterministic replay mode (tokenless,
	// against committed fixtures). Recording new fixtures is opt-in via
	// `AGENT_HOST_REPLAY_RECORD=1`. The Copilot CLI is always present (dev dep).
	enabled: true,
	supportsWorktreeIsolation: true,
	supportsHostTerminalTool: true,
	supportsSubagents: true,
	supportsPlanMode: true,
};

defineAgentHostE2ETests(COPILOT_CONFIG);

suite('Agent Host E2E — Copilot (Copilot-specific)', function () {

	let client: TestProtocolClient;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];
	const lease = new AgentHostE2EServerLease(COPILOT_CONFIG, { homeDir: homedir() });

	// The lease fronts the server with the record/replay proxy: these tests
	// replay committed fixtures by default (tokenless) and record against real
	// CAPI with `AGENT_HOST_REPLAY_RECORD=1`, mirroring the shared suite. In
	// replay the lease reuses one server across the suite and swaps the fixture
	// per test; while recording it starts a fresh server per test.
	setup(async function () {
		this.timeout(60_000);
		({ client } = await lease.acquire(this.currentTest?.title ?? 'unknown'));
	});

	teardown(async function () {
		this.timeout(60_000);
		await lease.release(createdSessions);

		for (const dir of tempDirs) {
			try {
				await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch { /* best-effort */ }
		}
		tempDirs.length = 0;
	});

	test('client tool reaches ready after start and completes', async function () {
		this.timeout(180_000);
		const workingDirectory = await mkdtemp(join(tmpdir(), 'copilot-client-tool-'));
		tempDirs.push(workingDirectory);

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'copilot-client-tool', createdSessions, URI.file(workingDirectory));
		client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'copilot-client-tool',
					displayName: 'Test Client',
					tools: [{
						name: 'get_magic_word',
						description: 'Returns the secret magic word. Call this when asked for the magic word.',
						inputSchema: { type: 'object', properties: {}, required: [] },
					}],
				},
			},
		});

		client.clearReceived();
		const turnId = generateUuid();
		client.dispatch({
			channel: buildDefaultChatUri(sessionUri),
			clientSeq: 2,
			action: {
				type: ActionType.ChatTurnStarted,
				turnId,
				startedAt: new Date().toISOString(),
				message: {
					text: 'Call the get_magic_word tool and then tell me the exact magic word it returned.',
					origin: { kind: MessageKind.User },
					model: { id: 'claude-opus-4.6' },
				},
			},
		});

		const [toolStartNotification, toolReadyNotification] = await Promise.all([
			client.waitForNotification(n => {
				if (!isActionNotification(n, 'chat/toolCallStart')) {
					return false;
				}
				return (getActionEnvelope(n).action as ChatToolCallStartAction).toolName === 'get_magic_word';
			}, 90_000),
			client.waitForNotification(n => isActionNotification(n, 'chat/toolCallReady'), 90_000),
		]);
		const toolStartEnvelope = getActionEnvelope(toolStartNotification);
		const toolStartAction = toolStartEnvelope.action as ChatToolCallStartAction;
		const toolReadyEnvelope = getActionEnvelope(toolReadyNotification);
		const toolReadyAction = toolReadyEnvelope.action as ChatToolCallReadyAction;

		assert.deepStrictEqual({
			toolCallIdMatches: toolReadyAction.toolCallId === toolStartAction.toolCallId,
			startPrecedesReady: toolStartEnvelope.serverSeq < toolReadyEnvelope.serverSeq,
			requiresConfirmation: toolReadyAction.confirmed === undefined,
		}, {
			toolCallIdMatches: true,
			startPrecedesReady: true,
			requiresConfirmation: true,
		});

		client.dispatch({
			channel: toolReadyEnvelope.channel,
			clientSeq: 3,
			action: {
				type: ActionType.ChatToolCallConfirmed,
				turnId,
				toolCallId: toolReadyAction.toolCallId,
				approved: true,
				confirmed: ToolCallConfirmationReason.UserAction,
			},
		});
		client.dispatch({
			channel: toolReadyEnvelope.channel,
			clientSeq: 4,
			action: {
				type: ActionType.ChatToolCallComplete,
				turnId,
				toolCallId: toolReadyAction.toolCallId,
				result: {
					success: true,
					pastTenseMessage: 'Got the magic word',
					content: [{ type: ToolResultContentType.Text, text: 'XYLOPHONE' }],
				},
			},
		});

		const completion = await client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete') || isActionNotification(n, 'chat/error'),
			90_000);
		assert.ok(isActionNotification(completion, 'chat/turnComplete'), 'client tool turn should complete without an error');
	});

	suiteTeardown(async function () {
		this.timeout(60_000);
		await lease.dispose();
	});

	test('usage reports include Copilot cost metadata', async function () {
		this.timeout(120_000);
		const workingDirectory = await mkdtemp(join(tmpdir(), 'copilot-cost-report-'));
		tempDirs.push(workingDirectory);

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-usage', createdSessions, URI.file(workingDirectory));
		dispatchTurn(client, sessionUri, 'turn-usage', 'Reply with exactly "usage-ok" and do not use tools.', 1);

		const usageNotif = await client.waitForNotification(n => isActionNotification(n, 'chat/usage'), 90_000);
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

		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);
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

	test('strips redundant `cd <workingDirectory> &&` prefix from shell tool calls', async function () {
		this.timeout(180_000);

		const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-cd-strip-test-`);
		tempDirs.push(workspaceDir);
		const expectedWorkingDirPath = workspaceDir;
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-cd-strip', createdSessions, URI.file(workspaceDir));

		client.clearReceived();
		dispatchTurn(client, sessionUri, 'turn-cd-strip',
			`Run this exact shell command, do not modify it: cd ${expectedWorkingDirPath} && echo strip-me-please`,
			1);

		const toolReadyNotif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/toolCallReady')) {
				return false;
			}
			const action = getActionEnvelope(n).action as { toolInput?: string };
			return typeof action.toolInput === 'string' && action.toolInput.includes('echo strip-me-please');
		}, 90_000);

		const toolReadyEnvelope = getActionEnvelope(toolReadyNotif);
		const toolReadyAction = toolReadyEnvelope.action as { toolCallId: string; toolInput?: string; confirmed?: string };
		const toolInput = toolReadyAction.toolInput!;

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

		if (!toolReadyAction.confirmed) {
			client.dispatch({
				channel: toolReadyEnvelope.channel,
				clientSeq: 2,
				action: {
					type: ActionType.ChatToolCallConfirmed,
					turnId: 'turn-cd-strip',
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
					return !seenSeqs.has(getActionEnvelope(n).serverSeq);
				},
				90_000,
			);
			if (isActionNotification(next, 'chat/turnComplete') || isActionNotification(next, 'chat/error')) {
				break;
			}
			const envelope = getActionEnvelope(next);
			seenSeqs.add(envelope.serverSeq);
			const action = envelope.action as { turnId: string; toolCallId: string; confirmed?: string };
			if (!action.confirmed) {
				client.dispatch({
					channel: envelope.channel,
					clientSeq: ++teardownSeq,
					action: {
						type: ActionType.ChatToolCallConfirmed,
						turnId: action.turnId,
						toolCallId: action.toolCallId, approved: true,
						confirmed: ToolCallConfirmationReason.UserAction,
					},
				});
			}
		}
	});

});
