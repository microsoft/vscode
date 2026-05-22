/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real Copilot SDK integration tests.
 *
 * The cross-provider portion lives in {@link defineSharedRealSdkTests}; this
 * file layers on Copilot-specific assertions (cost metadata, cd-prefix
 * stripping).
 *
 * Disabled by default. To run them, set `AGENT_HOST_REAL_SDK=1`:
 *
 *   AGENT_HOST_REAL_SDK=1 ./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/protocol/copilotRealSdk.integrationTest.ts
 *
 * Authentication: By default the token is obtained from `gh auth token`.
 * You can override it by setting `GITHUB_TOKEN=ghp_xxx`.
 *
 * SAFETY: These tests create real agent sessions backed by the Copilot SDK.
 * Prompts are kept to read-only questions, safe `echo` commands, and isolated
 * temp directories.
 */

import assert from 'assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { URI } from '../../../../../base/common/uri.js';
import { type SessionState } from '../../../common/state/sessionState.js';
import { SubscribeResult } from '../../../common/state/protocol/commands.js';
import type { SessionUsageAction } from '../../../common/state/sessionActions.js';
import {
	createRealSession, defineSharedRealSdkTests, dispatchTurn,
	type IRealSdkProviderConfig,
} from './realSdkTestHelpers.js';
import { getActionEnvelope, isActionNotification, IServerHandle, startRealServer, TestProtocolClient } from './testHelpers.js';

const REAL_SDK_ENABLED = process.env['AGENT_HOST_REAL_SDK'] === '1';

const COPILOT_CONFIG: IRealSdkProviderConfig = {
	suiteTitle: 'Protocol WebSocket — Real Copilot SDK',
	provider: 'copilotcli',
	scheme: 'copilotcli',
	shellToolName: 'bash',
	subagentToolNames: ['task'],
	exitPlanModeToolName: 'exit_plan_mode',
	enabled: REAL_SDK_ENABLED,
	supportsWorktreeIsolation: true,
	supportsSubagents: true,
	supportsPlanMode: true,
};

defineSharedRealSdkTests(COPILOT_CONFIG);

(REAL_SDK_ENABLED ? suite : suite.skip)('Protocol WebSocket — Real Copilot SDK (Copilot-specific)', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	const createdSessions: string[] = [];
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
		for (const session of createdSessions) {
			try {
				await client.call('disposeSession', { session }, 5000);
			} catch { /* best-effort */ }
		}
		createdSessions.length = 0;
		client.close();

		for (const dir of tempDirs) {
			try {
				rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch { /* best-effort */ }
		}
		tempDirs.length = 0;
	});

	test('usage reports include Copilot cost metadata', async function () {
		this.timeout(120_000);

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-usage', createdSessions, URI.file(tmpdir()).toString());
		dispatchTurn(client, sessionUri, 'turn-usage', 'Reply with exactly "usage-ok" and do not use tools.', 1);

		const usageNotif = await client.waitForNotification(n => isActionNotification(n, 'session/usage'), 90_000);
		const usageEnvelope = getActionEnvelope(usageNotif);
		const usageAction = usageEnvelope.action as SessionUsageAction;
		assert.strictEqual(usageEnvelope.channel, sessionUri);
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

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'), 90_000);
		const snapshot = await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		const state = snapshot.snapshot!.state as SessionState;
		const turn = state.turns.find(t => t.id === 'turn-usage');
		assert.strictEqual(turn?.usage?._meta?.cost, cost);
	});

	test('strips redundant `cd <workingDirectory> &&` prefix from shell tool calls', async function () {
		this.timeout(180_000);

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-cd-strip-test-`);
		tempDirs.push(tempDir);
		const expectedWorkingDirPath = tempDir;
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-cd-strip', createdSessions, URI.file(tempDir).toString());

		client.clearReceived();
		dispatchTurn(client, sessionUri, 'turn-cd-strip',
			`Run this exact shell command, do not modify it: cd ${expectedWorkingDirPath} && echo strip-me-please`,
			1);

		const toolReadyNotif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/toolCallReady')) {
				return false;
			}
			const action = getActionEnvelope(n).action as { toolInput?: string };
			return typeof action.toolInput === 'string' && action.toolInput.includes('echo strip-me-please');
		}, 90_000);

		const toolReadyAction = getActionEnvelope(toolReadyNotif).action as { toolCallId: string; toolInput?: string; confirmed?: string };
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
			client.notify('dispatchAction', {
				clientSeq: 2,
				action: {
					type: 'session/toolCallConfirmed',
					session: sessionUri, turnId: 'turn-cd-strip',
					toolCallId: toolReadyAction.toolCallId, approved: true,
				},
			});
		}

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
			const action = envelope.action as { turnId: string; toolCallId: string; confirmed?: string };
			if (!action.confirmed) {
				client.notify('dispatchAction', {
					channel: envelope.channel,
					clientSeq: ++teardownSeq,
					action: {
						type: 'session/toolCallConfirmed',
						turnId: action.turnId,
						toolCallId: action.toolCallId, approved: true,
					},
				});
			}
		}
	});

});
