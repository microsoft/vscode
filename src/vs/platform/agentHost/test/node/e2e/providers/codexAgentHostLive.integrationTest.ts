/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live, non-deterministic Codex scenarios that depend on real-time app-server behavior.
 */

import assert from 'assert';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { buildDefaultChatUri, ChatInputResponseKind, MessageKind, PendingMessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolResultContentType, type ChatInputRequest, type ChatState } from '../../../../common/state/sessionState.js';
import { createRealSession, dispatchTurn, getAcceptedAnswers } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification, startRealServer, stopServer, TestProtocolClient, type IServerHandle } from '../../serverIntegrationTestHelpers.js';
import { CODEX_CONFIG, CODEX_SDK_ROOT } from './codexTestConfiguration.js';

const REAL_CODEX_ENABLED = process.env['AGENT_HOST_REAL_CODEX'] === '1';

// Codex-specific steering coverage. Steering is wired via `turn/steer`; the
// agent buffers the message and promotes the codex `userMessage` echo into a
// fresh visible turn (clearing the pending bubble). These exercise real-time,
// stateful app-server behaviors (mid-turn steering, late tool registration,
// truncate) that are not deterministically reproducible, so they run only
// against the live app-server (`AGENT_HOST_REAL_CODEX=1`).
(REAL_CODEX_ENABLED && !!CODEX_SDK_ROOT ? suite : suite.skip)('Agent Host E2E — Codex - steering', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];
	let cleanupClientSeq = 10_000;

	async function chatState(chat: string): Promise<ChatState> {
		const result = await client.call<SubscribeResult>('subscribe', { channel: chat });
		return result.snapshot!.state as ChatState;
	}

	async function markdownResponse(chat: string, turnId: string): Promise<string> {
		const turn = (await chatState(chat)).turns.find(turn => turn.id === turnId);
		return turn?.responseParts
			.filter(part => part.kind === ResponsePartKind.Markdown)
			.map(part => part.content)
			.join('') ?? '';
	}

	async function cancelActiveTurnIfNeeded(session: string): Promise<void> {
		const chat = buildDefaultChatUri(session);
		const state = await chatState(chat);
		const turnId = state.activeTurn?.id;
		if (!turnId) {
			return;
		}
		client.dispatch({
			channel: chat,
			clientSeq: cleanupClientSeq++,
			action: {
				type: ActionType.ChatTurnCancelled,
				turnId,
				duration: 0,
			},
		});
		await client.waitForNotification(n =>
			isActionNotification(n, ActionType.ChatTurnCancelled)
			&& getActionEnvelope(n).channel === chat
			&& (getActionEnvelope(n).action as { turnId?: string }).turnId === turnId,
			30_000,
		);
	}

	setup(async function () {
		this.timeout(60_000);
		const homeDirectory = mkdtempSync(join(tmpdir(), 'codex-live-home-'));
		tempDirs.push(homeDirectory);
		server = await startRealServer({
			codexSdkRoot: CODEX_CONFIG.codexSdkRoot,
			homeDir: homeDirectory,
			userDataDir: join(homeDirectory, 'user-data'),
			codexHomeDir: join(homeDirectory, '.codex'),
		});
		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(async function () {
		this.timeout(180_000);
		const cleanupFailures: string[] = [];
		for (const session of createdSessions) {
			try {
				await cancelActiveTurnIfNeeded(session);
			} catch (error) {
				cleanupFailures.push(`failed to cancel active turn for ${session}: ${error instanceof Error ? error.message : String(error)}`);
			}
			try {
				await client.call('disposeSession', { channel: session }, 30_000);
			} catch (error) {
				cleanupFailures.push(`failed to dispose ${session}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		createdSessions.length = 0;
		try {
			client.close();
		} catch (error) {
			cleanupFailures.push(`failed to close client: ${error instanceof Error ? error.message : String(error)}`);
		}
		try {
			await stopServer(server);
		} catch (error) {
			cleanupFailures.push(`failed to stop server: ${error instanceof Error ? error.message : String(error)}`);
		}
		for (const dir of tempDirs) {
			try {
				rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch (error) {
				cleanupFailures.push(`failed to remove ${dir}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		tempDirs.length = 0;
		if (cleanupFailures.length > 0) {
			if (this.currentTest?.state === 'failed') {
				process.stdout.write(`[agent-host-e2e] Codex live cleanup reported secondary errors:\n${cleanupFailures.map(failure => `[agent-host-e2e] # ${failure}`).join('\n')}\n`);
				return;
			}
			throw new Error(`Codex live test cleanup failed:\n${cleanupFailures.join('\n')}`);
		}
	});

	test('mid-turn steering clears pending state without getting stuck', async function () {
		this.timeout(180_000);
		const workingDirectory = mkdtempSync(join(tmpdir(), 'codex-steer-'));
		tempDirs.push(workingDirectory);
		const session = await createRealSession(client, CODEX_CONFIG, 'steer-client', createdSessions, URI.file(workingDirectory));
		const chat = buildDefaultChatUri(session);

		// A long, slow turn gives us a window to steer before it completes.
		const turnId = generateUuid();
		dispatchTurn(client, session, turnId, 'Count slowly from 1 to 40. Put each number on its own line and think briefly between each.', 1);

		// Wait until the turn is visibly in progress.
		await client.waitForNotification(n =>
			isActionNotification(n, 'chat/responsePart')
			&& getActionEnvelope(n).channel === chat
			&& (getActionEnvelope(n).action as { turnId?: string }).turnId === turnId,
			90_000,
		);

		// Inject a steering message with a distinctive marker.
		const steerText = 'IMPORTANT: also include the exact word PINEAPPLE in your reply.';
		client.dispatch({
			channel: chat,
			clientSeq: 2,
			action: {
				type: ActionType.ChatPendingMessageSet,
				kind: PendingMessageKind.Steering,
				id: 'steer-1',
				message: { text: steerText, origin: { kind: MessageKind.User } },
			},
		});

		// The fix promotes the steering into its own visible turn (preferred)
		// OR — if codex never echoes the userMessage — drains it on turn
		// completion. Either way the pending bubble must clear. Assert the
		// stronger promotion outcome, falling back to the removal signal.
		await client.waitForNotification(n => {
			if (isActionNotification(n, 'chat/turnStarted')) {
				if (getActionEnvelope(n).channel !== chat) {
					return false;
				}
				const action = getActionEnvelope(n).action as { message?: { text?: string } };
				if (action.message?.text === steerText) {
					return true;
				}
				return false;
			}
			return isActionNotification(n, 'chat/pendingMessageRemoved')
				&& getActionEnvelope(n).channel === chat
				&& (getActionEnvelope(n).action as { id?: string; kind?: PendingMessageKind }).id === 'steer-1'
				&& (getActionEnvelope(n).action as { id?: string; kind?: PendingMessageKind }).kind === PendingMessageKind.Steering;
		}, 120_000);

		// Drive remaining turns to completion so teardown is clean.
		await client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === chat
			&& (getActionEnvelope(n).action as { turnId?: string }).turnId === turnId,
			120_000,
		);

		// Regardless of path, the steering bubble must not be stuck in state.
		const snapshot = await chatState(chat);
		assert.strictEqual(snapshot.steeringMessage, undefined);
	});

	test('client tool is registered and invoked end-to-end', async function () {
		this.timeout(180_000);
		const workingDirectory = mkdtempSync(join(tmpdir(), 'codex-tool-'));
		tempDirs.push(workingDirectory);
		const session = await createRealSession(client, CODEX_CONFIG, 'tool-client', createdSessions, URI.file(workingDirectory));
		const chat = buildDefaultChatUri(session);

		// Register a client-provided tool BEFORE the first turn so it lands in
		// `thread/start.dynamicTools`.
		client.dispatch({
			channel: session,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'tool-client',
					tools: [{
						name: 'get_magic_word',
						description: 'Returns the secret magic word. Call this when asked for the magic word.',
						inputSchema: { type: 'object', properties: {}, required: [] },
					}],
				},
			},
		});

		const turnId = generateUuid();
		dispatchTurn(client, session, turnId, 'Call the get_magic_word tool and then tell me the exact magic word it returned.', 2);

		// Surface and complete the client tool call, then wait for the turn to
		// finish. `chat/toolCallStart` carries the tool name; `chat/toolCallReady`
		// (keyed only by toolCallId) is when the client may run it.
		const seen = new Set<object>();
		let toolCallId: string | undefined;
		let sawToolCall = false;
		let completed = false;
		let nextSeq = 3;
		while (true) {
			const n = await client.waitForNotification(x => !seen.has(x as object) && (
				isActionNotification(x, 'chat/toolCallStart')
				|| isActionNotification(x, 'chat/toolCallReady')
				|| isActionNotification(x, 'chat/turnComplete')
				|| isActionNotification(x, 'chat/error')), 120_000);
			seen.add(n as object);
			if (getActionEnvelope(n).channel !== chat) {
				continue;
			}
			if (isActionNotification(n, 'chat/toolCallStart')) {
				const a = getActionEnvelope(n).action as { turnId?: string; toolCallId: string; toolName?: string };
				if (a.turnId === turnId && a.toolName === 'get_magic_word') {
					toolCallId = a.toolCallId;
					sawToolCall = true;
				}
				continue;
			}
			if (isActionNotification(n, 'chat/toolCallReady')) {
				const a = getActionEnvelope(n).action as { turnId?: string; toolCallId: string };
				if (a.turnId === turnId && a.toolCallId === toolCallId && !completed) {
					completed = true;
					client.dispatch({
						channel: chat,
						clientSeq: nextSeq++,
						action: {
							type: ActionType.ChatToolCallComplete,
							turnId,
							toolCallId: a.toolCallId,
							result: { success: true, pastTenseMessage: 'Got the magic word', content: [{ type: ToolResultContentType.Text, text: 'XYLOPHONE' }] },
						},
					});
				}
				continue;
			}
			if (isActionNotification(n, 'chat/error')) {
				throw new Error('codex reported a turn error during client-tool test');
			}
			if ((getActionEnvelope(n).action as { turnId?: string }).turnId !== turnId) {
				continue;
			}
			break;
		}
		assert.deepStrictEqual({
			sawToolCall,
			completed,
			responseIncludesResult: (await markdownResponse(chat, turnId)).includes('XYLOPHONE'),
		}, {
			sawToolCall: true,
			completed: true,
			responseIncludesResult: true,
		});
	});

	test('client tool registered after session creation is still invoked', async function () {
		this.timeout(180_000);
		const workingDirectory = mkdtempSync(join(tmpdir(), 'codex-tool2-'));
		tempDirs.push(workingDirectory);
		const session = await createRealSession(client, CODEX_CONFIG, 'tool-client-2', createdSessions, URI.file(workingDirectory));
		const chat = buildDefaultChatUri(session);

		// Register after the session exists but before the first turn. There is
		// no public AHP signal for Codex thread-prewarm readiness.
		client.dispatch({
			channel: session,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'tool-client-2',
					tools: [{
						name: 'get_magic_word',
						description: 'Returns the secret magic word. Call this when asked for the magic word.',
						inputSchema: { type: 'object', properties: {}, required: [] },
					}],
				},
			},
		});

		const turnId = generateUuid();
		dispatchTurn(client, session, turnId, 'Call the get_magic_word tool and then tell me the exact magic word it returned.', 2);

		const seen = new Set<object>();
		let toolCallId: string | undefined;
		let completed = false;
		let nextSeq = 3;
		while (true) {
			const n = await client.waitForNotification(x => !seen.has(x as object) && (
				isActionNotification(x, 'chat/toolCallStart')
				|| isActionNotification(x, 'chat/toolCallReady')
				|| isActionNotification(x, 'chat/turnComplete')
				|| isActionNotification(x, 'chat/error')), 120_000);
			seen.add(n as object);
			if (getActionEnvelope(n).channel !== chat) {
				continue;
			}
			if (isActionNotification(n, 'chat/toolCallStart')) {
				const a = getActionEnvelope(n).action as { turnId?: string; toolCallId: string; toolName?: string };
				if (a.turnId === turnId && a.toolName === 'get_magic_word') {
					toolCallId = a.toolCallId;
				}
				continue;
			}
			if (isActionNotification(n, 'chat/toolCallReady')) {
				const a = getActionEnvelope(n).action as { turnId?: string; toolCallId: string };
				if (a.turnId === turnId && a.toolCallId === toolCallId && !completed) {
					completed = true;
					client.dispatch({
						channel: chat,
						clientSeq: nextSeq++,
						action: {
							type: ActionType.ChatToolCallComplete,
							turnId,
							toolCallId: a.toolCallId,
							result: { success: true, pastTenseMessage: 'Got the magic word', content: [{ type: ToolResultContentType.Text, text: 'XYLOPHONE' }] },
						},
					});
				}
				continue;
			}
			if (isActionNotification(n, 'chat/error')) {
				throw new Error('codex reported a turn error during late client-tool test');
			}
			if ((getActionEnvelope(n).action as { turnId?: string }).turnId !== turnId) {
				continue;
			}
			break;
		}
		assert.deepStrictEqual({
			completed,
			responseIncludesResult: (await markdownResponse(chat, turnId)).includes('XYLOPHONE'),
		}, {
			completed: true,
			responseIncludesResult: true,
		});
	});

	test('server tool (listComments) is registered and executed in-process', async function () {
		this.timeout(180_000);
		const workingDirectory = mkdtempSync(join(tmpdir(), 'codex-servertool-'));
		tempDirs.push(workingDirectory);
		const session = await createRealSession(client, CODEX_CONFIG, 'servertool-client', createdSessions, URI.file(workingDirectory));
		const chat = buildDefaultChatUri(session);

		// No client tools are registered. The agent host's server tools
		// (feedback "comments") are wired automatically by the server and must
		// be registered with codex at `thread/start` without any client.
		const turnId = generateUuid();
		dispatchTurn(client, session, turnId, 'Call your listComments tool to list existing comments, then tell me exactly how many comments there are.', 1);

		// Drive the turn to completion WITHOUT ever dispatching a
		// `chat/toolCallComplete`: a server tool executes in-process, so the
		// agent host answers codex's `item/tool/call` itself. If the harness had
		// to round-trip to a client, the turn would hang and time out.
		const seen = new Set<object>();
		let sawServerToolCall = false;
		let serverToolHadClientContributor = false;
		let serverToolCallId: string | undefined;
		let sawSuccessfulCompletion = false;
		while (true) {
			const n = await client.waitForNotification(x => !seen.has(x as object) && (
				isActionNotification(x, 'chat/toolCallStart')
				|| isActionNotification(x, 'chat/toolCallComplete')
				|| isActionNotification(x, 'chat/turnComplete')
				|| isActionNotification(x, 'chat/error')), 120_000);
			seen.add(n as object);
			if (getActionEnvelope(n).channel !== chat) {
				continue;
			}
			if (isActionNotification(n, 'chat/toolCallStart')) {
				const a = getActionEnvelope(n).action as { turnId?: string; toolCallId?: string; toolName?: string; contributor?: { kind: string } };
				if (a.turnId === turnId && a.toolName === 'listComments') {
					sawServerToolCall = true;
					serverToolCallId = a.toolCallId;
					// A server tool executes in-process, so it must NOT advertise
					// a client contributor (which would route execution away).
					serverToolHadClientContributor = a.contributor?.kind === 'client';
				}
				continue;
			}
			if (isActionNotification(n, 'chat/toolCallComplete')) {
				const action = getActionEnvelope(n).action as { turnId?: string; toolCallId: string; result: { success: boolean } };
				if (action.turnId === turnId && action.toolCallId === serverToolCallId) {
					sawSuccessfulCompletion = action.result.success;
				}
				continue;
			}
			if (isActionNotification(n, 'chat/error')) {
				throw new Error('codex reported a turn error during server-tool test');
			}
			if ((getActionEnvelope(n).action as { turnId?: string }).turnId !== turnId) {
				continue;
			}
			break;
		}
		assert.deepStrictEqual({
			sawServerToolCall,
			serverToolHadClientContributor,
			sawSuccessfulCompletion,
			responseReportsNoComments: /\b0\b|no comments/i.test(await markdownResponse(chat, turnId)),
		}, {
			sawServerToolCall: true,
			serverToolHadClientContributor: false,
			sawSuccessfulCompletion: true,
			responseReportsNoComments: true,
		});
	});

	test('file-change approval is surfaced and can be approved', async function () {
		this.timeout(180_000);
		const workingDirectory = mkdtempSync(join(tmpdir(), 'codex-fileapprove-'));
		tempDirs.push(workingDirectory);
		const session = await createRealSession(client, CODEX_CONFIG, 'fileapprove-client', createdSessions, URI.file(workingDirectory));
		const chat = buildDefaultChatUri(session);

		// Read-only sandbox + on-request approval forces codex to ask before
		// applying any file edit (an `item/fileChange/requestApproval`).
		client.dispatch({
			channel: session,
			clientSeq: 1,
			action: { type: ActionType.SessionConfigChanged, config: { 'codex.sandboxMode': 'read-only', 'codex.approvalPolicy': 'on-request' } },
		});
		await client.waitForNotification(n =>
			isActionNotification(n, 'session/configChanged')
			&& getActionEnvelope(n).channel === session,
			30_000,
		);

		const turnId = generateUuid();
		dispatchTurn(client, session, turnId, 'Create a new file named hello.txt containing exactly the text "hi" by editing the file (use your apply_patch/file-edit capability, not a shell command).', 2);

		const seen = new Set<object>();
		let sawPendingConfirmation = false;
		let sawSuccessfulFileEdit = false;
		let fileEditToolCallId: string | undefined;
		let nextSeq = 3;
		while (true) {
			const n = await client.waitForNotification(x => !seen.has(x as object) && (
				isActionNotification(x, 'chat/toolCallStart')
				|| isActionNotification(x, 'chat/toolCallReady')
				|| isActionNotification(x, 'chat/toolCallComplete')
				|| isActionNotification(x, 'chat/turnComplete')
				|| isActionNotification(x, 'chat/error')), 120_000);
			seen.add(n as object);
			if (isActionNotification(n, 'chat/error')) {
				throw new Error('codex reported a turn error during file-change approval test');
			}
			if (isActionNotification(n, 'chat/toolCallStart')) {
				const action = getActionEnvelope(n).action as { turnId?: string; toolCallId: string; toolName?: string };
				if (getActionEnvelope(n).channel === chat && action.turnId === turnId && action.toolName === 'file_edit') {
					fileEditToolCallId = action.toolCallId;
				}
				continue;
			}
			if (isActionNotification(n, 'chat/toolCallReady')) {
				const action = getActionEnvelope(n).action as { turnId?: string; toolCallId: string; confirmed?: string };
				if (getActionEnvelope(n).channel !== chat || action.turnId !== turnId || action.toolCallId !== fileEditToolCallId || action.confirmed !== undefined) {
					continue;
				}
				sawPendingConfirmation = true;
				client.dispatch({
					channel: chat,
					clientSeq: nextSeq++,
					action: { type: ActionType.ChatToolCallConfirmed, turnId, toolCallId: action.toolCallId, approved: true, confirmed: ToolCallConfirmationReason.UserAction },
				});
				continue;
			}
			if (isActionNotification(n, 'chat/toolCallComplete') || isActionNotification(n, 'chat/turnComplete')) {
				const action = getActionEnvelope(n).action as { turnId?: string; toolCallId?: string };
				if (getActionEnvelope(n).channel !== chat || action.turnId !== turnId) {
					continue;
				}
				if (isActionNotification(n, 'chat/toolCallComplete') && action.toolCallId !== fileEditToolCallId) {
					continue;
				}
				if (isActionNotification(n, 'chat/toolCallComplete')) {
					sawSuccessfulFileEdit = (getActionEnvelope(n).action as { result: { success: boolean } }).result.success;
					continue;
				}
				break;
			}
		}
		assert.deepStrictEqual({
			sawPendingConfirmation,
			sawSuccessfulFileEdit,
			fileContents: readFileSync(join(workingDirectory, 'hello.txt'), 'utf8'),
		}, {
			sawPendingConfirmation: true,
			sawSuccessfulFileEdit: true,
			fileContents: 'hi',
		});
	});

	test('Plan mode (Agent Mode control) makes request_user_input reachable end-to-end', async function () {
		this.timeout(180_000);
		const workingDirectory = mkdtempSync(join(tmpdir(), 'codex-planmode-'));
		tempDirs.push(workingDirectory);
		const session = await createRealSession(client, CODEX_CONFIG, 'planmode-client', createdSessions, URI.file(workingDirectory));
		const chat = buildDefaultChatUri(session);

		// Switch the session to Plan mode via the platform-generic Agent Mode
		// control — codex only exposes `request_user_input` in plan collaboration
		// mode, so this is the user-facing switch that makes ask_user reachable.
		client.dispatch({
			channel: session,
			clientSeq: 1,
			action: { type: ActionType.SessionConfigChanged, config: { mode: 'plan' } },
		});
		await client.waitForNotification(n =>
			isActionNotification(n, 'session/configChanged')
			&& getActionEnvelope(n).channel === session,
			30_000,
		);

		const turnId = generateUuid();
		dispatchTurn(client, session, turnId, 'Use your request_user_input capability to ask me one question: "Which fruit?" with options Apple and Banana. After I answer, reply with the option I chose.', 2);

		const seen = new Set<object>();
		let sawInputRequest = false;
		let nextSeq = 3;
		while (true) {
			const n = await client.waitForNotification(x => !seen.has(x as object) && (
				isActionNotification(x, 'chat/inputRequested')
				|| isActionNotification(x, 'chat/turnComplete')
				|| isActionNotification(x, 'chat/error')), 150_000);
			seen.add(n as object);
			if (getActionEnvelope(n).channel !== chat) {
				continue;
			}
			if (isActionNotification(n, 'chat/inputRequested')) {
				sawInputRequest = true;
				const action = getActionEnvelope(n).action as { request: ChatInputRequest };
				client.dispatch({
					channel: chat,
					clientSeq: nextSeq++,
					action: {
						type: ActionType.ChatInputCompleted,
						requestId: action.request.id,
						response: ChatInputResponseKind.Accept,
						answers: getAcceptedAnswers(action.request),
					},
				});
				continue;
			}
			if (isActionNotification(n, 'chat/error')) {
				throw new Error('codex reported a turn error during plan-mode request_user_input test');
			}
			if ((getActionEnvelope(n).action as { turnId?: string }).turnId !== turnId) {
				continue;
			}
			break;
		}
		assert.ok(sawInputRequest, 'switching to Plan mode should make request_user_input surface as chat/inputRequested');
	});
});
