/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Host-owned lifecycle commands that were previously only exercised by the
 * frozen white-box protocol suite: liveness (`ping`), turn-history paging
 * (`fetchTurns` / `chat/turnsLoaded`), reconnect replay, and the OTLP logs
 * channel handshake.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { OTLP_LOGS_CHANNEL_TEMPLATE } from '../../../../common/otlp/otlpLogEmitter.js';
import {
	ReconnectResultType,
	type FetchTurnsResult,
	type InitializeResult,
	type ReconnectResult,
	type SubscribeResult,
} from '../../../../common/state/protocol/commands.js';
import type { TelemetryCapabilities } from '../../../../common/state/protocol/channels-otlp/state.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, ROOT_STATE_URI } from '../../../../common/state/sessionState.js';
import { createRealSession, dispatchTurn } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification, TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineProtocolLifecycleTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;

	async function createSession(prefix: string): Promise<{ sessionUri: string; chatUri: string; clientId: string }> {
		const workspace = mkdtempSync(join(tmpdir(), `ahp-lifecycle-${prefix}-`));
		tempDirs.push(workspace);
		const clientId = `${prefix}-${config.provider}`;
		const sessionUri = await createRealSession(context.client, config, clientId, createdSessions, URI.file(workspace));
		return { sessionUri, chatUri: buildDefaultChatUri(sessionUri), clientId };
	}

	conformanceTest(context, 'ping succeeds before initialize', async function () {
		const result = await context.client.call('ping');
		assert.strictEqual(result, null);
	});

	conformanceTest(context, 'ping succeeds after initialize', async function () {
		await context.client.call<InitializeResult>('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `ping-after-init-${config.provider}`,
		});
		const result = await context.client.call('ping', { channel: ROOT_STATE_URI });
		assert.strictEqual(result, null);
	});

	conformanceTest(context, 'initialize advertises the OTLP logs channel template', async function () {
		const result = await context.client.call<InitializeResult & { telemetry?: TelemetryCapabilities }>('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `otlp-handshake-${config.provider}`,
			initialSubscriptions: [ROOT_STATE_URI],
		});
		assert.deepStrictEqual(result.telemetry, { logs: OTLP_LOGS_CHANNEL_TEMPLATE });
	});

	conformanceTest(context, 'subscribe on the OTLP logs channel returns a stateless empty result', async function () {
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `otlp-subscribe-${config.provider}`,
			initialSubscriptions: [ROOT_STATE_URI],
		});
		const result = await context.client.call<SubscribeResult>('subscribe', {
			channel: 'ahp-otlp://logs/trace',
		});
		assert.deepStrictEqual(result, {});
	});

	conformanceTest(context, 'fetchTurns acknowledges completed turn history loading', async function () {
		const { sessionUri, chatUri } = await createSession('fetch-turns');

		context.client.clearReceived();
		dispatchTurn(context.client, sessionUri, 'turn-ft-1', '/rename Fetch Turns One', 1);
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-ft-1',
		);
		dispatchTurn(context.client, sessionUri, 'turn-ft-2', '/rename Fetch Turns Two', 2);
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-ft-2',
		);

		const loadedPromise = context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnsLoaded')
			&& getActionEnvelope(n).channel === chatUri,
		);
		const result = await context.client.call<FetchTurnsResult>('fetchTurns', { channel: chatUri });
		assert.deepStrictEqual(result, {});
		const loaded = await loadedPromise;
		const action = getActionEnvelope(loaded).action as { type: string; turns: unknown[]; turnsNextCursor?: string };
		assert.deepStrictEqual({
			type: action.type,
			turns: action.turns,
			turnsNextCursor: action.turnsNextCursor,
		}, {
			type: ActionType.ChatTurnsLoaded,
			turns: [],
			turnsNextCursor: undefined,
		});
	});

	conformanceTest(context, 'fetchTurns rejects an unknown chat', async function () {
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `fetch-turns-missing-${config.provider}`,
		});
		await assert.rejects(
			() => context.client.call('fetchTurns', { channel: 'ahp-chat:/missing-session/missing-chat' }),
			/session not found/i,
		);
	});

	conformanceTest(context, 'fetchTurns rejects an unrecognized cursor', async function () {
		const { chatUri } = await createSession('fetch-turns-cursor');
		await assert.rejects(
			() => context.client.call('fetchTurns', { channel: chatUri, cursor: 'unknown-cursor' }),
			/unrecognized fetchTurns cursor/i,
		);
	});

	conformanceTest(context, 'reconnect replays missed actions', async function () {
		const { sessionUri, clientId } = await createSession('reconnect');

		context.client.clearReceived();
		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: { type: ActionType.SessionTitleChanged, title: 'Reconnect Title' },
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, ActionType.SessionTitleChanged)
			&& getActionEnvelope(n).channel === sessionUri,
		);

		const allActions = context.client.receivedNotifications(n => n.method === 'action');
		assert.ok(allActions.length > 0, 'expected at least one action before reconnect');
		const missedFromSeq = getActionEnvelope(allActions[0]).serverSeq - 1;

		// Drop the primary transport; dispose the session through the reconnecting
		// client so the shared-server lease does not leave a stale session behind.
		context.client.close();
		const secondary = new TestProtocolClient(context.serverPort);
		try {
			await secondary.connect();
			const result = await secondary.call<ReconnectResult>('reconnect', {
				channel: ROOT_STATE_URI,
				clientId,
				lastSeenServerSeq: missedFromSeq,
				subscriptions: [sessionUri],
			});

			assert.ok(
				result.type === ReconnectResultType.Replay || result.type === ReconnectResultType.Snapshot,
				`expected replay or snapshot, got ${result.type}`,
			);
			if (result.type === ReconnectResultType.Replay) {
				assert.ok(result.actions.length > 0, 'replay should include missed actions');
				assert.ok(
					result.actions.some(envelope => envelope.action.type === ActionType.SessionTitleChanged),
					'replay should include the title change',
				);
			} else {
				assert.ok(result.snapshots.length > 0, 'snapshot reconnect should include subscription snapshots');
			}

			await secondary.call('disposeSession', { channel: sessionUri });
			const index = createdSessions.indexOf(sessionUri);
			if (index >= 0) {
				createdSessions.splice(index, 1);
			}
		} finally {
			secondary.close();
		}
	});
}
