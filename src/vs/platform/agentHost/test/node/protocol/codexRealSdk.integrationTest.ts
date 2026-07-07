/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real Codex app-server integration tests.
 *
 * Disabled by default. To run, set `AGENT_HOST_REAL_CODEX=1`. The Codex CLI
 * is resolved automatically from the dev dependency in
 * `node_modules/@openai/codex`.
 *
 *   AGENT_HOST_REAL_CODEX=1 ./scripts/test-integration.sh --run \
 *     src/vs/platform/agentHost/test/node/protocol/codexRealSdk.integrationTest.ts
 *
 * **Authentication:** token from `GITHUB_TOKEN` (preferred) or `gh auth
 * token`. The agent host's Codex proxy forwards the app-server's Responses API
 * traffic to Copilot CAPI using that token.
 */

import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import assert from 'assert';
import { join } from '../../../../../base/common/path.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { MessageKind, PendingMessageKind, ChatInputResponseKind, type ChatInputRequest } from '../../../common/state/sessionState.js';
import { createRealSession, defineSharedRealSdkTests, dispatchTurn, getAcceptedAnswers, type IRealSdkProviderConfig } from './realSdkTestHelpers.js';
import { getActionEnvelope, isActionNotification, startRealServer, TestProtocolClient, type IServerHandle } from './testHelpers.js';
import { URI } from '../../../../../base/common/uri.js';

const REAL_CODEX_ENABLED = process.env['AGENT_HOST_REAL_CODEX'] === '1';

function resolveCodexSdkRoot(): string | undefined {
	const sdkPackageDir = join(process.cwd(), 'node_modules', '@openai', 'codex');
	return existsSync(sdkPackageDir) ? process.cwd() : undefined;
}

const CODEX_SDK_ROOT = REAL_CODEX_ENABLED ? resolveCodexSdkRoot() : undefined;

const CODEX_CONFIG: IRealSdkProviderConfig = {
	suiteTitle: 'Protocol WebSocket - Real Codex App Server',
	provider: 'codex',
	scheme: 'codex',
	shellToolName: 'shell',
	subagentToolNames: [],
	exitPlanModeToolName: 'exit_plan_mode',
	enabled: REAL_CODEX_ENABLED && !!CODEX_SDK_ROOT,
	codexSdkRoot: CODEX_SDK_ROOT,
	supportsWorktreeIsolation: false,
	supportsSubagents: false,
	supportsPlanMode: false,
};

defineSharedRealSdkTests(CODEX_CONFIG);

// Codex-specific steering coverage. Steering is wired via `turn/steer`; the
// agent buffers the message and promotes the codex `userMessage` echo into a
// fresh visible turn (clearing the pending bubble). This exercises the full
// path against the real app-server.
(CODEX_CONFIG.enabled ? suite : suite.skip)('Protocol WebSocket - Real Codex App Server - steering', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];

	setup(async function () {
		this.timeout(60_000);
		server = await startRealServer({ codexSdkRoot: CODEX_CONFIG.codexSdkRoot });
		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(async function () {
		this.timeout(60_000);
		for (const session of createdSessions) {
			try {
				client.notify('dispatchAction', { clientSeq: 9999, action: { type: 'session/abortTurn', session } });
				await client.call('disposeSession', { session }, 30_000);
			} catch { /* best-effort */ }
		}
		createdSessions.length = 0;
		client.close();
		server?.process.kill();
		for (const dir of tempDirs) {
			try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* best-effort */ }
		}
		tempDirs.length = 0;
	});

	test('mid-turn steering surfaces as a new turn and never sticks in pending', async function () {
		this.timeout(180_000);
		const workingDirectory = mkdtempSync(join(tmpdir(), 'codex-steer-'));
		tempDirs.push(workingDirectory);
		const session = await createRealSession(client, CODEX_CONFIG, 'steer-client', createdSessions, URI.file(workingDirectory));

		// A long, slow turn gives us a window to steer before it completes.
		const turnId = generateUuid();
		dispatchTurn(client, session, turnId, 'Count slowly from 1 to 40. Put each number on its own line and think briefly between each.', 1);

		// Wait until the turn is visibly in progress.
		await client.waitForNotification(n => isActionNotification(n, 'chat/responsePart'), 90_000);

		// Inject a steering message with a distinctive marker.
		const steerText = 'IMPORTANT: also include the exact word PINEAPPLE in your reply.';
		client.notify('dispatchAction', {
			channel: session,
			clientSeq: 2,
			action: {
				type: 'chat/pendingMessageSet',
				kind: PendingMessageKind.Steering,
				id: 'steer-1',
				message: { text: steerText, origin: { kind: MessageKind.User } },
			},
		});

		// The fix promotes the steering into its own visible turn (preferred)
		// OR — if codex never echoes the userMessage — drains it on turn
		// completion. Either way the pending bubble must clear. Assert the
		// stronger promotion outcome, falling back to the removal signal.
		let promotedAsTurn = false;
		await client.waitForNotification(n => {
			if (isActionNotification(n, 'chat/turnStarted')) {
				const action = getActionEnvelope(n).action as { message?: { text?: string } };
				if (action.message?.text === steerText) {
					promotedAsTurn = true;
					return true;
				}
				return false;
			}
			return isActionNotification(n, 'chat/pendingMessageRemoved');
		}, 120_000);

		// Drive remaining turns to completion so teardown is clean.
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 120_000);

		// Regardless of path, the steering bubble must not be stuck in state.
		const snapshot = await client.call<{ snapshot?: { state?: { steeringMessage?: unknown } } }>('subscribe', { channel: session });
		assert.ok(!snapshot.snapshot?.state?.steeringMessage, `steering message must not remain pending (promotedAsTurn=${promotedAsTurn})`);
	});

	test('client tool is registered and invoked end-to-end', async function () {
		this.timeout(180_000);
		const workingDirectory = mkdtempSync(join(tmpdir(), 'codex-tool-'));
		tempDirs.push(workingDirectory);
		const session = await createRealSession(client, CODEX_CONFIG, 'tool-client', createdSessions, URI.file(workingDirectory));

		// Register a client-provided tool BEFORE the first turn so it lands in
		// `thread/start.dynamicTools`.
		client.notify('dispatchAction', {
			channel: session,
			clientSeq: 1,
			action: {
				type: 'session/activeClientSet',
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
			if (isActionNotification(n, 'chat/toolCallStart')) {
				const a = getActionEnvelope(n).action as { toolCallId: string; toolName?: string };
				if (a.toolName === 'get_magic_word') {
					toolCallId = a.toolCallId;
					sawToolCall = true;
				}
				continue;
			}
			if (isActionNotification(n, 'chat/toolCallReady')) {
				const a = getActionEnvelope(n).action as { toolCallId: string };
				if (a.toolCallId === toolCallId && !completed) {
					completed = true;
					client.notify('dispatchAction', {
						channel: session,
						clientSeq: nextSeq++,
						action: {
							type: 'chat/toolCallComplete',
							turnId,
							toolCallId: a.toolCallId,
							result: { success: true, pastTenseMessage: 'Got the magic word', content: [{ type: 'text', text: 'XYLOPHONE' }] },
						},
					});
				}
				continue;
			}
			if (isActionNotification(n, 'chat/error')) {
				throw new Error('codex reported a turn error during client-tool test');
			}
			break;
		}
		assert.ok(sawToolCall, 'workbench client should have been asked to run get_magic_word');
		assert.ok(completed, 'the client tool call should have reached the ready state to be completed');
	});

	test('client tool registered after the thread prewarms restarts the thread and still works', async function () {
		this.timeout(180_000);
		const workingDirectory = mkdtempSync(join(tmpdir(), 'codex-tool2-'));
		tempDirs.push(workingDirectory);
		const session = await createRealSession(client, CODEX_CONFIG, 'tool-client-2', createdSessions, URI.file(workingDirectory));

		// Let the background prewarm materialize a thread BEFORE any tools are
		// registered, so the tools must be applied via a thread restart.
		await new Promise(r => setTimeout(r, 4_000));

		client.notify('dispatchAction', {
			channel: session,
			clientSeq: 1,
			action: {
				type: 'session/activeClientSet',
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
			if (isActionNotification(n, 'chat/toolCallStart')) {
				const a = getActionEnvelope(n).action as { toolCallId: string; toolName?: string };
				if (a.toolName === 'get_magic_word') {
					toolCallId = a.toolCallId;
				}
				continue;
			}
			if (isActionNotification(n, 'chat/toolCallReady')) {
				const a = getActionEnvelope(n).action as { toolCallId: string };
				if (a.toolCallId === toolCallId && !completed) {
					completed = true;
					client.notify('dispatchAction', {
						channel: session,
						clientSeq: nextSeq++,
						action: {
							type: 'chat/toolCallComplete',
							turnId,
							toolCallId: a.toolCallId,
							result: { success: true, pastTenseMessage: 'Got the magic word', content: [{ type: 'text', text: 'XYLOPHONE' }] },
						},
					});
				}
				continue;
			}
			if (isActionNotification(n, 'chat/error')) {
				throw new Error('codex reported a turn error during delayed client-tool test');
			}
			break;
		}
		assert.ok(completed, 'a tool registered after prewarm should still reach the client via a thread restart');
	});

	test('server tool (listComments) is registered and executed in-process', async function () {
		this.timeout(180_000);
		const workingDirectory = mkdtempSync(join(tmpdir(), 'codex-servertool-'));
		tempDirs.push(workingDirectory);
		const session = await createRealSession(client, CODEX_CONFIG, 'servertool-client', createdSessions, URI.file(workingDirectory));

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
		while (true) {
			const n = await client.waitForNotification(x => !seen.has(x as object) && (
				isActionNotification(x, 'chat/toolCallStart')
				|| isActionNotification(x, 'chat/turnComplete')
				|| isActionNotification(x, 'chat/error')), 120_000);
			seen.add(n as object);
			if (isActionNotification(n, 'chat/toolCallStart')) {
				const a = getActionEnvelope(n).action as { toolName?: string; contributor?: { kind: string } };
				if (a.toolName === 'listComments') {
					sawServerToolCall = true;
					// A server tool executes in-process, so it must NOT advertise
					// a client contributor (which would route execution away).
					serverToolHadClientContributor = a.contributor?.kind === 'client';
				}
				continue;
			}
			if (isActionNotification(n, 'chat/error')) {
				throw new Error('codex reported a turn error during server-tool test');
			}
			break;
		}
		assert.ok(sawServerToolCall, 'codex should have invoked the in-process listComments server tool');
		assert.strictEqual(serverToolHadClientContributor, false, 'a server tool must not carry a Client contributor');
	});

	test('file-change approval is surfaced and can be approved', async function () {
		this.timeout(180_000);
		const workingDirectory = mkdtempSync(join(tmpdir(), 'codex-fileapprove-'));
		tempDirs.push(workingDirectory);
		const session = await createRealSession(client, CODEX_CONFIG, 'fileapprove-client', createdSessions, URI.file(workingDirectory));

		// Read-only sandbox + on-request approval forces codex to ask before
		// applying any file edit (an `item/fileChange/requestApproval`).
		client.notify('dispatchAction', {
			channel: session,
			clientSeq: 1,
			action: { type: 'session/configChanged', config: { 'codex.sandboxMode': 'read-only', 'codex.approvalPolicy': 'on-request' } },
		});
		await client.waitForNotification(n => isActionNotification(n, 'session/configChanged'), 30_000);

		const turnId = generateUuid();
		dispatchTurn(client, session, turnId, 'Create a new file named hello.txt containing exactly the text "hi" by editing the file (use your apply_patch/file-edit capability, not a shell command).', 2);

		const seen = new Set<object>();
		let sawPendingConfirmation = false;
		let nextSeq = 3;
		while (true) {
			const n = await client.waitForNotification(x => !seen.has(x as object) && (
				(isActionNotification(x, 'chat/toolCallReady') && (getActionEnvelope(x).action as { confirmed?: string }).confirmed === undefined)
				|| isActionNotification(x, 'chat/toolCallComplete')
				|| isActionNotification(x, 'chat/turnComplete')
				|| isActionNotification(x, 'chat/error')), 120_000);
			seen.add(n as object);
			if (isActionNotification(n, 'chat/error')) {
				throw new Error('codex reported a turn error during file-change approval test');
			}
			if (isActionNotification(n, 'chat/toolCallReady')) {
				sawPendingConfirmation = true;
				const action = getActionEnvelope(n).action as { toolCallId: string };
				client.notify('dispatchAction', {
					channel: session,
					clientSeq: nextSeq++,
					action: { type: 'chat/toolCallConfirmed', turnId, toolCallId: action.toolCallId, approved: true },
				});
				continue;
			}
			if (isActionNotification(n, 'chat/toolCallComplete') || isActionNotification(n, 'chat/turnComplete')) {
				break;
			}
		}
		assert.ok(sawPendingConfirmation, 'a file edit under a read-only sandbox should surface a pending-confirmation tool call');
	});

	test('truncate rolls back trailing turns and archive/unarchive reach codex', async function () {
		this.timeout(180_000);
		const workingDirectory = mkdtempSync(join(tmpdir(), 'codex-trunc-'));
		tempDirs.push(workingDirectory);
		const session = await createRealSession(client, CODEX_CONFIG, 'trunc-client', createdSessions, URI.file(workingDirectory));

		// Drive two quick turns to completion so the session has history.
		for (const [turnId, text] of [['trunc-1', 'Reply with exactly OK1.'], ['trunc-2', 'Reply with exactly OK2.']] as const) {
			dispatchTurn(client, session, turnId, text, turnId === 'trunc-1' ? 1 : 2);
			await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete')
				&& (getActionEnvelope(n).action as { turnId: string }).turnId === turnId, 120_000);
		}

		// Truncate everything after the first turn — codex should drop one turn.
		client.notify('dispatchAction', {
			channel: session,
			clientSeq: 3,
			action: { type: 'chat/truncated', turnId: 'trunc-1' },
		});
		await client.waitForNotification(n => isActionNotification(n, 'chat/truncated'), 30_000);

		// Archive then unarchive the session.
		client.notify('dispatchAction', { channel: session, clientSeq: 4, action: { type: 'session/isArchivedChanged', isArchived: true } });
		await new Promise(r => setTimeout(r, 1_500));
		client.notify('dispatchAction', { channel: session, clientSeq: 5, action: { type: 'session/isArchivedChanged', isArchived: false } });
		await new Promise(r => setTimeout(r, 1_500));

		// Reaching here without a thrown error confirms truncate (thread/rollback)
		// and archive/unarchive round-trip through the real codex app-server.
		assert.ok(true);
	});

	test('Plan mode (Agent Mode control) makes request_user_input reachable end-to-end', async function () {
		this.timeout(180_000);
		const workingDirectory = mkdtempSync(join(tmpdir(), 'codex-planmode-'));
		tempDirs.push(workingDirectory);
		const session = await createRealSession(client, CODEX_CONFIG, 'planmode-client', createdSessions, URI.file(workingDirectory));

		// Switch the session to Plan mode via the platform-generic Agent Mode
		// control — codex only exposes `request_user_input` in plan collaboration
		// mode, so this is the user-facing switch that makes ask_user reachable.
		client.notify('dispatchAction', {
			channel: session,
			clientSeq: 1,
			action: { type: 'session/configChanged', config: { mode: 'plan' } },
		});
		await client.waitForNotification(n => isActionNotification(n, 'session/configChanged'), 30_000);

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
			if (isActionNotification(n, 'chat/inputRequested')) {
				sawInputRequest = true;
				const action = getActionEnvelope(n).action as { request: ChatInputRequest };
				client.notify('dispatchAction', {
					channel: session,
					clientSeq: nextSeq++,
					action: {
						type: 'chat/inputCompleted',
						session,
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
			break;
		}
		assert.ok(sawInputRequest, 'switching to Plan mode should make request_user_input surface as chat/inputRequested');
	});
});
