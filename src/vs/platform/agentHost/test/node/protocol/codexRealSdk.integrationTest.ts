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
import { MessageKind, PendingMessageKind } from '../../../common/state/sessionState.js';
import { createRealSession, defineSharedRealSdkTests, dispatchTurn, type IRealSdkProviderConfig } from './realSdkTestHelpers.js';
import { getActionEnvelope, isActionNotification, startRealServer, TestProtocolClient, type IServerHandle } from './testHelpers.js';

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
		const session = await createRealSession(client, CODEX_CONFIG, 'steer-client', createdSessions, workingDirectory);

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
});
