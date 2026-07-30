/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Host-owned lifecycle edges that complement `protocolContractsSuite.ts`:
 * pre-handshake liveness, fetchTurns rejection cases, and the OTLP logs
 * channel handshake.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { OTLP_LOGS_CHANNEL_TEMPLATE } from '../../../../common/otlp/otlpLogEmitter.js';
import {
	type FetchTurnsResult,
	type InitializeResult,
	type SubscribeResult,
} from '../../../../common/state/protocol/commands.js';
import type { TelemetryCapabilities } from '../../../../common/state/protocol/channels-otlp/state.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { buildDefaultChatUri, ROOT_STATE_URI } from '../../../../common/state/sessionState.js';
import { createRealSession } from '../harness/agentHostE2ETestHarness.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineProtocolLifecycleTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;

	conformanceTest(context, 'ping succeeds before initialize', async function () {
		const result = await context.client.call('ping');
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
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-lifecycle-fetch-turns-cursor-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(
			context.client,
			config,
			`fetch-turns-cursor-${config.provider}`,
			createdSessions,
			URI.file(workspace),
		);
		const chatUri = buildDefaultChatUri(sessionUri);
		await assert.rejects(
			() => context.client.call<FetchTurnsResult>('fetchTurns', { channel: chatUri, cursor: 'unknown-cursor' }),
			/unrecognized fetchTurns cursor/i,
		);
	});
}
