/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Protocol-level contracts that are not tied to any one channel: liveness,
 * turn-history paging, and how the host answers a client action it declares
 * but does not yet implement.
 *
 * All of these are host-owned and cross no model boundary.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ReconnectResultType, type FetchTurnsResult, type InitializeResult, type ListSessionsResult, type ReconnectResult, type SubscribeResult } from '../../../../common/state/protocol/commands.js';
import type { SessionSummaryChangedParams } from '../../../../common/state/protocol/channels-root/notifications.js';
import type { OtlpExportLogsParams } from '../../../../common/state/protocol/channels-otlp/notifications.js';
import type { IAgentHostManagedSettingsDiagnostics, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult } from '../../../../common/agentService.js';
import { ActionType, type StateAction } from '../../../../common/state/sessionActions.js';
import { TerminalClaimKind } from '../../../../common/state/protocol/state.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, ROOT_STATE_URI, SessionStatus, type ChatState, type SessionState, type Turn } from '../../../../common/state/sessionState.js';
import { createRealSession, dispatchTurn, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { AhpErrorCodes, JsonRpcErrorCodes } from '../../../../common/state/sessionProtocol.js';
import { getActionEnvelope, isActionNotification, type TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineProtocolContractTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;

	/**
	 * Client sequence numbers must strictly increase for the lifetime of a
	 * client, and the suite shares one across tests, so they cannot be
	 * hard-coded per scenario.
	 */
	let clientSeq = 4000;
	function nextClientSeq(): number {
		return clientSeq++;
	}

	/** Dispatch on the shared client and wait for the server to echo it back. */
	async function dispatchAndWaitOnShared(channel: string, action: StateAction): Promise<void> {
		const seq = nextClientSeq();
		context.client.dispatch({ channel, clientSeq: seq, action });
		await context.client.waitForNotification(n =>
			isActionNotification(n, action.type)
			&& getActionEnvelope(n).channel === channel
			&& getActionEnvelope(n).origin?.clientSeq === seq,
			30_000,
		);
	}

	async function createSession(prefix: string): Promise<{ sessionUri: string; workspace: string }> {
		const workspace = mkdtempSync(join(tmpdir(), `ahp-${prefix}-`));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, URI.file(workspace));
		return { sessionUri, workspace };
	}

	async function initializeAdditionalClient(prefix: string): Promise<TestProtocolClient> {
		const client = await context.connectClient();
		await client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `${prefix}-${config.provider}`,
		});
		return client;
	}

	async function triggerServerActivity(client: TestProtocolClient, marker: string): Promise<void> {
		await client.call('createSession', {
			channel: `missing-provider:/${marker}`,
			provider: 'missing-provider',
		}).catch(() => undefined);
		await client.call('ping', { channel: ROOT_STATE_URI });
	}

	function isOtlpExport(notification: { readonly method: string }): boolean {
		return notification.method === 'otlp/exportLogs';
	}

	conformanceTest(context, 'ping answers while the connection is live', async function () {
		// Liveness has no payload — the response itself is the signal, so the
		// contract is that the call resolves rather than what it returns.
		await context.client.call('ping', { channel: ROOT_STATE_URI });
	});

	conformanceTest(context, 'ping answers before the client initializes', async function () {
		const client = await context.connectClient();
		try {
			const result = await client.call('ping', { channel: ROOT_STATE_URI });
			assert.strictEqual(result, null);
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'subscribed client receives OTLP log exports from the real server', async function () {
		const client = await context.connectClient();
		try {
			await client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `otlp-logs-${config.provider}`,
				initialSubscriptions: [ROOT_STATE_URI],
			});
			await client.call('subscribe', { channel: 'ahp-otlp://logs/trace' });
			const exported = client.waitForNotification(n =>
				n.method === 'otlp/exportLogs'
				&& (n.params as OtlpExportLogsParams).channel === 'ahp-otlp://logs/trace',
				30_000,
			);

			await client.call('createSession', { channel: 'missing-provider:/otlp', provider: 'missing-provider' }).catch(() => undefined);
			const notification = await exported;

			assert.ok(Object.keys((notification.params as OtlpExportLogsParams).payload).length > 0);
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize advertises the OTLP log channel template', async function () {
		const client = await context.connectClient();
		try {
			const result = await client.call<InitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `otlp-capability-${config.provider}`,
			});

			assert.deepStrictEqual(result.telemetry, { logs: 'ahp-otlp://logs/{level}' });
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize ignores an unknown OTLP log level', async function () {
		const client = await context.connectClient();
		try {
			const result = await client.call<InitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `otlp-invalid-initial-${config.provider}`,
				initialSubscriptions: ['ahp-otlp://logs/verbose'],
			});
			client.clearReceived();

			await triggerServerActivity(client, 'otlp-invalid-initial');

			assert.deepStrictEqual({
				snapshots: result.snapshots,
				receivedExports: client.receivedNotifications(isOtlpExport).length,
			}, {
				snapshots: [],
				receivedExports: 0,
			});
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'subscribe acknowledges an unknown OTLP log level without installing it', async function () {
		const client = await initializeAdditionalClient('otlp-invalid-subscribe');
		try {
			const result = await client.call<SubscribeResult>('subscribe', { channel: 'ahp-otlp://logs/verbose' });
			client.clearReceived();

			await triggerServerActivity(client, 'otlp-invalid-subscribe');

			assert.deepStrictEqual({
				result,
				receivedExports: client.receivedNotifications(isOtlpExport).length,
			}, {
				result: {},
				receivedExports: 0,
			});
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'OTLP log subscriptions route exports on their canonical channel', async function () {
		const client = await initializeAdditionalClient('otlp-canonical');
		try {
			await client.call<SubscribeResult>('subscribe', { channel: 'ahp-otlp://logs/trace' });
			const exported = client.waitForNotification(isOtlpExport, 30_000);

			await triggerServerActivity(client, 'otlp-canonical');
			const notification = await exported;

			assert.strictEqual((notification.params as OtlpExportLogsParams).channel, 'ahp-otlp://logs/trace');
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'OTLP log delivery resumes after unsubscribe and resubscribe', async function () {
		const client = await initializeAdditionalClient('otlp-resubscribe');
		try {
			await client.call<SubscribeResult>('subscribe', { channel: 'ahp-otlp://logs/trace' });
			client.notify('unsubscribe', { channel: 'ahp-otlp://logs/trace' });
			await client.call('ping', { channel: ROOT_STATE_URI });
			await client.call<SubscribeResult>('subscribe', { channel: 'ahp-otlp://logs/trace' });
			client.clearReceived();
			const exported = client.waitForNotification(isOtlpExport, 30_000);

			await triggerServerActivity(client, 'otlp-resubscribe');

			assert.strictEqual((await exported).method, 'otlp/exportLogs');
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'unsubscribing from OTLP logs stops delivery', async function () {
		const client = await initializeAdditionalClient('otlp-unsubscribe');
		try {
			await client.call<SubscribeResult>('subscribe', { channel: 'ahp-otlp://logs/trace' });
			client.notify('unsubscribe', { channel: 'ahp-otlp://logs/trace' });
			await client.call('ping', { channel: ROOT_STATE_URI });
			client.clearReceived();

			await triggerServerActivity(client, 'otlp-unsubscribe');

			assert.strictEqual(client.receivedNotifications(isOtlpExport).length, 0);
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'info-level OTLP subscriptions receive server activity', async function () {
		const client = await initializeAdditionalClient('otlp-info-level');
		try {
			await client.call<SubscribeResult>('subscribe', { channel: 'ahp-otlp://logs/info' });
			const exported = client.waitForNotification(isOtlpExport, 30_000);

			await triggerServerActivity(client, 'otlp-info-level');

			assert.strictEqual((await exported).method, 'otlp/exportLogs');
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'fatal-level OTLP subscriptions filter ordinary server activity', async function () {
		const client = await initializeAdditionalClient('otlp-fatal-level');
		try {
			await client.call<SubscribeResult>('subscribe', { channel: 'ahp-otlp://logs/fatal' });
			client.clearReceived();

			await triggerServerActivity(client, 'otlp-fatal-level');

			assert.strictEqual(client.receivedNotifications(isOtlpExport).length, 0);
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'OTLP logs fan out to every subscribed client', async function () {
		const first = await initializeAdditionalClient('otlp-fanout-first');
		const second = await initializeAdditionalClient('otlp-fanout-second');
		try {
			await second.call<SubscribeResult>('subscribe', { channel: 'ahp-otlp://logs/trace' });
			await first.call<SubscribeResult>('subscribe', { channel: 'ahp-otlp://logs/trace' });
			await Promise.all([
				first.call('ping', { channel: ROOT_STATE_URI }),
				second.call('ping', { channel: ROOT_STATE_URI }),
			]);
			first.clearReceived();
			second.clearReceived();
			const firstExport = first.waitForNotification(isOtlpExport, 30_000);
			const secondExport = second.waitForNotification(isOtlpExport, 30_000);

			await triggerServerActivity(first, 'otlp-fanout');

			assert.deepStrictEqual([(await firstExport).method, (await secondExport).method], ['otlp/exportLogs', 'otlp/exportLogs']);
		} finally {
			first.close();
			second.close();
		}
	});

	conformanceTest(context, 'initialize installs an OTLP log subscription without a snapshot', async function () {
		const client = await context.connectClient();
		try {
			const initialized = await client.call<InitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `otlp-initial-${config.provider}`,
				initialSubscriptions: ['ahp-otlp://logs/trace'],
			});
			const exported = client.waitForNotification(n => n.method === 'otlp/exportLogs', 30_000);

			await client.call('createSession', { channel: 'missing-provider:/otlp-initial', provider: 'missing-provider' }).catch(() => undefined);
			const notification = await exported;

			assert.deepStrictEqual({
				snapshots: initialized.snapshots,
				channel: (notification.params as OtlpExportLogsParams).channel,
			}, {
				snapshots: [],
				channel: 'ahp-otlp://logs/trace',
			});
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'management diagnostics report providers and network endpoints', async function () {
		const client = await context.connectClient();
		try {
			await client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `management-diagnostics-${config.provider}`,
			});

			const [network, managed] = await Promise.all([
				client.call<IAgentHostNetworkDiagnosticsInfo>('getNetworkDiagnosticsInfo', {}),
				client.call<readonly IAgentHostManagedSettingsDiagnostics[]>('getManagedSettingsDiagnostics', {}),
			]);

			assert.deepStrictEqual({
				hasVersion: network.version.length > 0,
				os: network.os,
				arch: network.arch,
				hasEndpoints: network.endpoints.length > 0,
				hasReferenceProvider: managed.some(entry => entry.provider === config.provider),
			}, {
				hasVersion: true,
				os: process.platform,
				arch: process.arch,
				hasEndpoints: true,
				hasReferenceProvider: true,
			});
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'diagnostics fetch reports a refused local connection', async function () {
		const client = await context.connectClient();
		try {
			await client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `diagnostics-fetch-${config.provider}`,
			});

			const result = await client.call<IAgentHostNetworkFetchResult>('diagnosticsFetch', { url: 'http://127.0.0.1:1/' }, 30_000);

			assert.deepStrictEqual({
				url: result.url,
				hasError: typeof result.error === 'string' && result.error.length > 0,
				hasDuration: typeof result.durationMs === 'number',
			}, {
				url: 'http://127.0.0.1:1/',
				hasError: true,
				hasDuration: true,
			});
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize rejects incompatible protocol versions', async function () {
		const client = await context.connectClient();
		try {
			await assert.rejects(client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: ['999.0.0'],
				clientId: `incompatible-version-${config.provider}`,
			}), { code: AhpErrorCodes.UnsupportedProtocolVersion });
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize rejects an empty protocol version list', async function () {
		const client = await context.connectClient();
		try {
			await assert.rejects(client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [],
				clientId: `empty-versions-${config.provider}`,
			}), { code: AhpErrorCodes.UnsupportedProtocolVersion });
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize without subscriptions returns no snapshots', async function () {
		const client = await context.connectClient();
		try {
			const initialized = await client.call<InitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `no-initial-subscriptions-${config.provider}`,
			});
			assert.deepStrictEqual(initialized.snapshots, []);
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize reports the negotiated protocol and sequence', async function () {
		const client = await context.connectClient();
		try {
			const initialized = await client.call<InitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `server-identity-${config.provider}`,
				clientInfo: { name: 'agent-host-e2e', version: '1.0.0' },
			});

			assert.deepStrictEqual({
				protocolVersion: initialized.protocolVersion,
				serverSeqIsNonNegative: initialized.serverSeq >= 0,
			}, {
				protocolVersion: PROTOCOL_VERSION,
				serverSeqIsNonNegative: true,
			});
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize selects a supported fallback protocol version', async function () {
		const client = await context.connectClient();
		try {
			const result = await client.call<InitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: ['999.0.0', PROTOCOL_VERSION],
				clientId: `fallback-version-${config.provider}`,
			});

			assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize accepts informational client identity', async function () {
		const client = await context.connectClient();
		try {
			const result = await client.call<InitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `client-info-${config.provider}`,
				clientInfo: { name: 'agent-host-e2e', version: '1.2.3', title: 'Agent Host E2E' },
			});

			assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize accepts locale metadata', async function () {
		const client = await context.connectClient();
		try {
			const result = await client.call<InitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `locale-${config.provider}`,
				locale: 'ja-JP',
			});

			assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize accepts declared client capabilities', async function () {
		const client = await context.connectClient();
		try {
			const result = await client.call<InitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `capabilities-${config.provider}`,
				capabilities: { mcpApps: {} },
			});

			assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize cannot be repeated after the handshake', async function () {
		const client = await initializeAdditionalClient('repeat-initialize');
		try {
			await assert.rejects(client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `repeat-initialize-again-${config.provider}`,
			}), { code: JsonRpcErrorCodes.MethodNotFound });
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'listSessions includes provider-backed session metadata', async function () {
		const { sessionUri, workspace } = await createSession('list-session-metadata');
		const chatUri = buildDefaultChatUri(sessionUri);
		dispatchTurn(context.client, sessionUri, 'turn-list-session-metadata', '/rename Listed Session', nextClientSeq());
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-list-session-metadata',
		);

		const result = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
		const item = result.items.find(item => item.resource === sessionUri);

		assert.deepStrictEqual({
			provider: item?.provider,
			hasTitle: typeof item?.title === 'string' && item.title.length > 0,
			statusIsNumber: typeof item?.status === 'number',
			workingDirectories: item?.workingDirectories,
			hasCreatedAt: item !== undefined && Number.isFinite(Date.parse(item.createdAt)),
			hasModifiedAt: item !== undefined && Number.isFinite(Date.parse(item.modifiedAt)),
		}, {
			provider: config.provider,
			hasTitle: true,
			statusIsNumber: true,
			workingDirectories: [URI.file(workspace).toString()],
			hasCreatedAt: true,
			hasModifiedAt: true,
		});
	});

	conformanceTest(context, 'listSessions reflects live title and status changes', async function () {
		const { sessionUri } = await createSession('list-session-live-state');
		const chatUri = buildDefaultChatUri(sessionUri);
		dispatchTurn(context.client, sessionUri, 'turn-list-session-live-state', '/rename Catalog Title', nextClientSeq());
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-list-session-live-state',
		);
		await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionIsReadChanged, isRead: true });
		await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionIsArchivedChanged, isArchived: true });

		const result = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
		const item = result.items.find(item => item.resource === sessionUri);

		assert.deepStrictEqual({
			title: item?.title,
			isRead: !!(item?.status && item.status & SessionStatus.IsRead),
			isArchived: !!(item?.status && item.status & SessionStatus.IsArchived),
		}, {
			title: 'Catalog Title',
			isRead: true,
			isArchived: true,
		});
	});

	conformanceTest(context, 'disposing a session removes it from listSessions', async function () {
		const { sessionUri } = await createSession('list-session-dispose');
		const chatUri = buildDefaultChatUri(sessionUri);
		dispatchTurn(context.client, sessionUri, 'turn-list-session-dispose', '/rename Disposable Session', nextClientSeq());
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-list-session-dispose',
		);
		const before = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
		assert.strictEqual(before.items.some(item => item.resource === sessionUri), true);

		await context.client.call('disposeSession', { channel: sessionUri });
		const trackedIndex = createdSessions.indexOf(sessionUri);
		if (trackedIndex >= 0) {
			createdSessions.splice(trackedIndex, 1);
		}
		const result = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });

		assert.strictEqual(result.items.some(item => item.resource === sessionUri), false);
	});

	conformanceTest(context, 'fetchTurns currently emits an empty loaded-turns page', async function () {
		const { sessionUri } = await createSession('fetch-turns');
		const chatUri = buildDefaultChatUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });

		// Give the chat a turn to page over. `/rename` is handled entirely by the
		// host's local-command dispatcher, so the turn is real without crossing
		// the model boundary and without depending on a shell.
		dispatchTurn(context.client, sessionUri, 'turn-fetch', '/rename Fetch Turns', nextClientSeq());
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-fetch',
			60_000,
		);

		context.client.clearReceived();
		const result = await context.client.call<FetchTurnsResult>('fetchTurns', { channel: chatUri });

		// The current host implementation accepts the request but has no backing
		// pager: it always publishes an empty page, even when the chat already has
		// loaded turns.
		const loaded = await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnsLoaded') && getActionEnvelope(n).channel === chatUri,
			30_000,
		);

		const action = getActionEnvelope(loaded).action as { readonly type: ActionType.ChatTurnsLoaded; readonly turns: readonly Turn[] };
		assert.deepStrictEqual({
			result,
			action,
		}, {
			result: {},
			action: {
				type: ActionType.ChatTurnsLoaded,
				turns: [],
			},
		});
	});

	conformanceTest(context, 'fetchTurns rejects a cursor the host did not issue', async function () {
		const { sessionUri } = await createSession('fetch-turns-cursor');
		const chatUri = buildDefaultChatUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });

		await assert.rejects(context.client.call('fetchTurns', {
			channel: chatUri,
			cursor: 'not-a-host-cursor',
		}), { code: JsonRpcErrorCodes.InvalidParams });
	});

	conformanceTest(context, 'fetchTurns rejects an unknown chat channel', async function () {
		const { sessionUri } = await createSession('fetch-turns-missing');
		const missingChat = buildChatUri(sessionUri, 'missing');

		await assert.rejects(context.client.call('fetchTurns', {
			channel: missingChat,
		}));
	});

	conformanceTest(context, 'initialize returns snapshots for initial subscriptions', async function () {
		const { sessionUri } = await createSession('initial-subscriptions');
		const chatUri = buildDefaultChatUri(sessionUri);
		const client = await context.connectClient();
		try {
			const initialized = await client.call<InitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `initial-subscriptions-${config.provider}`,
				initialSubscriptions: [sessionUri, chatUri],
			});

			assert.deepStrictEqual(initialized.snapshots.map(snapshot => snapshot.resource).sort(), [sessionUri, chatUri].sort());
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'a session action is broadcast to every subscribed client', async function () {
		const { sessionUri } = await createSession('multi-client-session-action');
		const client = await initializeAdditionalClient('multi-client-session-action');
		try {
			await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			client.clearReceived();
			const sequence = nextClientSeq();
			context.client.dispatch({
				channel: sessionUri,
				clientSeq: sequence,
				action: { type: ActionType.SessionTitleChanged, title: 'Shared Title' },
			});

			const observed = await client.waitForNotification(n =>
				isActionNotification(n, 'session/titleChanged')
				&& getActionEnvelope(n).channel === sessionUri,
				30_000,
			);
			const state = await client.call<SubscribeResult>('subscribe', { channel: sessionUri });

			assert.deepStrictEqual({
				title: (getActionEnvelope(observed).action as { readonly title: string }).title,
				originClientSeq: getActionEnvelope(observed).origin?.clientSeq,
				snapshotTitle: (state.snapshot!.state as SessionState).title,
			}, {
				title: 'Shared Title',
				originClientSeq: sequence,
				snapshotTitle: 'Shared Title',
			});
		} finally {
			client.close();
		}
	});

	// Disabled variants document missing multi-client channel isolation; see KNOWN_ISSUES.md.
	conformanceTest(context, 'a chat action is broadcast to every subscribed client', async function () {
		const { sessionUri } = await createSession('multi-client-chat-action');
		const chatUri = buildDefaultChatUri(sessionUri);
		const client = await initializeAdditionalClient('multi-client-chat-action');
		try {
			await client.call<SubscribeResult>('subscribe', { channel: chatUri });
			client.clearReceived();
			const draft = { text: 'shared draft', origin: { kind: MessageKind.User as const } };
			await dispatchAndWaitOnShared(chatUri, { type: ActionType.ChatDraftChanged, draft });
			const observed = await client.waitForNotification(n =>
				isActionNotification(n, 'chat/draftChanged')
				&& getActionEnvelope(n).channel === chatUri,
				30_000,
			);
			const state = await client.call<SubscribeResult>('subscribe', { channel: chatUri });

			assert.deepStrictEqual({
				actionDraft: (getActionEnvelope(observed).action as { readonly draft?: object }).draft,
				snapshotDraft: (state.snapshot!.state as ChatState).draft,
			}, {
				actionDraft: draft,
				snapshotDraft: draft,
			});
		} finally {
			client.close();
		}
	}, false);

	conformanceTest(context, 'an unsubscribed client stops receiving channel actions', async function () {
		const { sessionUri } = await createSession('multi-client-unsubscribe');
		const client = await initializeAdditionalClient('multi-client-unsubscribe');
		try {
			await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			client.notify('unsubscribe', { channel: sessionUri });
			await client.call('ping', { channel: ROOT_STATE_URI });
			client.clearReceived();

			await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionTitleChanged, title: 'After Unsubscribe' });

			assert.deepStrictEqual(client.receivedNotifications(n =>
				isActionNotification(n, 'session/titleChanged')
				&& getActionEnvelope(n).channel === sessionUri,
			), []);
		} finally {
			client.close();
		}
	}, false);

	conformanceTest(context, 'initial subscriptions include current session and chat state', async function () {
		const { sessionUri } = await createSession('multi-client-initial-state');
		const chatUri = buildDefaultChatUri(sessionUri);
		const draft = { text: 'initial snapshot draft', origin: { kind: MessageKind.User as const } };
		await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Initial Snapshot Title' });
		await dispatchAndWaitOnShared(chatUri, { type: ActionType.ChatDraftChanged, draft });
		const client = await context.connectClient();
		try {
			const initialized = await client.call<InitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `multi-client-initial-state-${config.provider}`,
				initialSubscriptions: [sessionUri, chatUri],
			});
			const session = initialized.snapshots.find(snapshot => snapshot.resource === sessionUri);
			const chat = initialized.snapshots.find(snapshot => snapshot.resource === chatUri);

			assert.deepStrictEqual({
				title: (session?.state as SessionState | undefined)?.title,
				draft: (chat?.state as ChatState | undefined)?.draft,
			}, {
				title: 'Initial Snapshot Title',
				draft,
			});
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'terminal output is streamed to every subscribed client', async function () {
		const { sessionUri, workspace } = await createSession('multi-client-terminal');
		const terminalUri = URI.from({ scheme: 'agenthost-terminal', authority: 'e2e', path: `/${sessionUri.split('/').at(-1)}` }).toString();
		const client = await initializeAdditionalClient('multi-client-terminal');
		try {
			await context.client.call('createTerminal', {
				channel: terminalUri,
				claim: { kind: TerminalClaimKind.Session, session: sessionUri },
				name: 'Multi-client Terminal',
				cwd: URI.file(workspace).toString(),
				cols: 90,
				rows: 30,
			});
			await context.client.call<SubscribeResult>('subscribe', { channel: terminalUri });
			await client.call<SubscribeResult>('subscribe', { channel: terminalUri });
			context.client.clearReceived();
			client.clearReceived();
			context.client.dispatch({
				channel: terminalUri,
				clientSeq: nextClientSeq(),
				action: { type: ActionType.TerminalInput, data: 'node -p "\'MULTI_CLIENT_OUTPUT\'"\r' },
			});

			async function waitForMarker(target: TestProtocolClient): Promise<string> {
				let output = '';
				await target.waitForNotification(n => {
					if (!isActionNotification(n, 'terminal/data') || getActionEnvelope(n).channel !== terminalUri) {
						return false;
					}
					output += (getActionEnvelope(n).action as { readonly data: string }).data;
					return output.includes('MULTI_CLIENT_OUTPUT');
				}, 30_000);
				return output;
			}

			const [sharedOutput, additionalOutput] = await Promise.all([waitForMarker(context.client), waitForMarker(client)]);
			assert.deepStrictEqual({
				shared: sharedOutput.includes('MULTI_CLIENT_OUTPUT'),
				additional: additionalOutput.includes('MULTI_CLIENT_OUTPUT'),
			}, {
				shared: true,
				additional: true,
			});
		} finally {
			await context.client.call('disposeTerminal', { channel: terminalUri });
			client.close();
		}
	}, false);

	conformanceTest(context, 'session disposal invalidates another client subscription', async function () {
		const { sessionUri } = await createSession('multi-client-dispose');
		const chatUri = buildDefaultChatUri(sessionUri);
		const client = await initializeAdditionalClient('multi-client-dispose');
		try {
			await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			await client.call<SubscribeResult>('subscribe', { channel: chatUri });

			await context.client.call('disposeSession', { channel: sessionUri });
			const index = createdSessions.indexOf(sessionUri);
			if (index >= 0) {
				createdSessions.splice(index, 1);
			}

			await assert.rejects(client.call<SubscribeResult>('subscribe', { channel: sessionUri }));
			await assert.rejects(client.call<SubscribeResult>('subscribe', { channel: chatUri }));
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'root session summaries are broadcast to every subscribed client', async function () {
		const { sessionUri } = await createSession('multi-client-root-summary');
		const client = await initializeAdditionalClient('multi-client-root-summary');
		try {
			await client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
			client.clearReceived();
			await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Broadcast Summary' });

			const observed = await client.waitForNotification(n =>
				n.method === 'root/sessionSummaryChanged'
				&& (n.params as SessionSummaryChangedParams).session === sessionUri,
				30_000,
			);

			assert.strictEqual((observed.params as SessionSummaryChangedParams).changes.title, 'Broadcast Summary');
		} finally {
			client.close();
		}
	}, false);

	/**
	 * Runs `body` against a second connection that has completed the handshake
	 * under its own clientId, then drops that connection and hands back a fresh
	 * un-handshaked one. `reconnect` is only answerable pre-handshake, so
	 * recovery cannot be exercised on the shared client.
	 */
	async function afterConnectionDrop<T>(
		clientId: string,
		body: (client: TestProtocolClient) => Promise<T>,
	): Promise<{ carried: T; revived: TestProtocolClient }> {
		const first = await context.connectClient();
		let carried: T;
		try {
			await first.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId });
			carried = await body(first);
		} finally {
			first.close();
		}
		return { carried, revived: await context.connectClient() };
	}

	conformanceTest(context, 'reconnect replays only the actions a dropped client missed', async function () {
		const { sessionUri } = await createSession('reconnect');
		const chatUri = buildDefaultChatUri(sessionUri);
		const droppedClientId = `reconnect-dropped-${config.provider}`;

		// The cutoff comes from the subscribe response rather than from watching
		// this client receive its own dispatch: a subscription is not guaranteed
		// to be installed before a dispatch sent immediately after it is handled,
		// so waiting for that echo races. `fromSeq` is the same boundary and the
		// response itself guarantees it.
		const { carried: seenThrough, revived } = await afterConnectionDrop(droppedClientId, async first => {
			const subscribed = await first.call<SubscribeResult>('subscribe', { channel: chatUri });
			return subscribed.snapshot!.fromSeq;
		});

		try {
			// Produced while nobody was listening on that clientId, so it can only
			// reach the client through replay.
			await dispatchAndWaitOnShared(chatUri, { type: ActionType.ChatDraftChanged, draft: { text: 'missed while disconnected', origin: { kind: MessageKind.User } } });

			const result = await revived.call<ReconnectResult>('reconnect', {
				channel: ROOT_STATE_URI,
				clientId: droppedClientId,
				lastSeenServerSeq: seenThrough,
				subscriptions: [chatUri],
			});

			// A client that reconnects inside the replay window must be able to
			// catch up by applying actions rather than discarding local state for
			// a fresh snapshot, so the cutoff has to be exclusive and exact.
			assert.deepStrictEqual({
				type: result.type,
				replayedAlreadySeen: result.type === ReconnectResultType.Replay
					&& result.actions.some(envelope => envelope.serverSeq <= seenThrough),
				replayedTheGap: result.type === ReconnectResultType.Replay
					&& result.actions.some(envelope => envelope.serverSeq > seenThrough),
			}, {
				type: ReconnectResultType.Replay,
				replayedAlreadySeen: false,
				replayedTheGap: true,
			});
		} finally {
			revived.close();
		}
	});

	conformanceTest(context, 'reconnect with no missed actions returns an empty replay', async function () {
		const { sessionUri } = await createSession('reconnect-empty');
		const chatUri = buildDefaultChatUri(sessionUri);
		const droppedClientId = `reconnect-empty-dropped-${config.provider}`;
		const { carried: seenThrough, revived } = await afterConnectionDrop(droppedClientId, async first => {
			const subscribed = await first.call<SubscribeResult>('subscribe', { channel: chatUri });
			return subscribed.snapshot!.fromSeq;
		});

		try {
			const result = await revived.call<ReconnectResult>('reconnect', {
				channel: ROOT_STATE_URI,
				clientId: droppedClientId,
				lastSeenServerSeq: seenThrough,
				subscriptions: [chatUri],
			});

			assert.deepStrictEqual(result, { type: ReconnectResultType.Replay, actions: [], missing: [] });
		} finally {
			revived.close();
		}
	});

	conformanceTest(context, 'reconnect excludes actions from channels the client did not restore', async function () {
		const firstSession = await createSession('reconnect-filter-first');
		const secondWorkspace = mkdtempSync(join(tmpdir(), 'ahp-reconnect-filter-second-'));
		tempDirs.push(secondWorkspace);
		const secondSessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('createSession', {
			channel: secondSessionUri,
			provider: config.provider,
			workingDirectories: [URI.file(secondWorkspace).toString()],
			config: { isolation: 'folder' },
		});
		createdSessions.push(secondSessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: secondSessionUri });
		const firstChat = buildDefaultChatUri(firstSession.sessionUri);
		const secondChat = buildDefaultChatUri(secondSessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: secondChat });
		const droppedClientId = `reconnect-filter-${config.provider}`;

		const { carried: seenThrough, revived } = await afterConnectionDrop(droppedClientId, async first => {
			const subscribed = await first.call<SubscribeResult>('subscribe', { channel: firstChat });
			return subscribed.snapshot!.fromSeq;
		});

		try {
			await dispatchAndWaitOnShared(firstChat, { type: ActionType.ChatDraftChanged, draft: { text: 'included', origin: { kind: MessageKind.User } } });
			await dispatchAndWaitOnShared(secondChat, { type: ActionType.ChatDraftChanged, draft: { text: 'excluded', origin: { kind: MessageKind.User } } });

			const result = await revived.call<ReconnectResult>('reconnect', {
				channel: ROOT_STATE_URI,
				clientId: droppedClientId,
				lastSeenServerSeq: seenThrough,
				subscriptions: [firstChat],
			});

			assert.deepStrictEqual(result.type === ReconnectResultType.Replay
				? result.actions.map(action => ({ channel: action.channel, type: action.action.type }))
				: result.type, [{ channel: firstChat, type: ActionType.ChatDraftChanged }]);
		} finally {
			revived.close();
		}
	});

	conformanceTest(context, 'reconnect restores an OTLP log subscription', async function () {
		const droppedClientId = `reconnect-otlp-${config.provider}`;
		const { carried: seenThrough, revived } = await afterConnectionDrop(droppedClientId, async first => {
			const root = await first.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
			await first.call<SubscribeResult>('subscribe', { channel: 'ahp-otlp://logs/trace' });
			return root.snapshot!.fromSeq;
		});

		try {
			await revived.call<ReconnectResult>('reconnect', {
				channel: ROOT_STATE_URI,
				clientId: droppedClientId,
				lastSeenServerSeq: seenThrough,
				subscriptions: ['ahp-otlp://logs/trace'],
			});
			const exported = revived.waitForNotification(n => n.method === 'otlp/exportLogs', 30_000);

			await context.client.call('createSession', { channel: 'missing-provider:/otlp-reconnect', provider: 'missing-provider' }).catch(() => undefined);

			assert.strictEqual((await exported).method, 'otlp/exportLogs');
		} finally {
			revived.close();
		}
	});

	conformanceTest(context, 'reconnect replays missed session and chat actions together', async function () {
		const { sessionUri } = await createSession('reconnect-state-snapshots');
		const chatUri = buildDefaultChatUri(sessionUri);
		const droppedClientId = `reconnect-state-snapshots-dropped-${config.provider}`;
		const { carried: seenThrough, revived } = await afterConnectionDrop(droppedClientId, async first => {
			const session = await first.call<SubscribeResult>('subscribe', { channel: sessionUri });
			const chat = await first.call<SubscribeResult>('subscribe', { channel: chatUri });
			return Math.max(session.snapshot!.fromSeq, chat.snapshot!.fromSeq);
		});

		try {
			await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Replay Session' });
			await dispatchAndWaitOnShared(chatUri, { type: ActionType.ChatDraftChanged, draft: { text: 'replay draft', origin: { kind: MessageKind.User } } });

			const result = await revived.call<ReconnectResult>('reconnect', {
				channel: ROOT_STATE_URI,
				clientId: droppedClientId,
				lastSeenServerSeq: seenThrough,
				subscriptions: [sessionUri, chatUri],
			});

			assert.deepStrictEqual(result.type === ReconnectResultType.Replay
				? result.actions.map(action => ({ channel: action.channel, type: action.action.type }))
				: result.type, [
				{ channel: sessionUri, type: ActionType.SessionTitleChanged },
				{ channel: chatUri, type: ActionType.ChatDraftChanged },
			]);
		} finally {
			revived.close();
		}
	});

	conformanceTest(context, 'reconnected state subscriptions receive subsequent live actions', async function () {
		const { sessionUri } = await createSession('reconnect-live');
		const chatUri = buildDefaultChatUri(sessionUri);
		const droppedClientId = `reconnect-live-dropped-${config.provider}`;
		const { carried: seenThrough, revived } = await afterConnectionDrop(droppedClientId, async first => {
			const session = await first.call<SubscribeResult>('subscribe', { channel: sessionUri });
			const chat = await first.call<SubscribeResult>('subscribe', { channel: chatUri });
			return Math.max(session.snapshot!.fromSeq, chat.snapshot!.fromSeq);
		});

		try {
			await revived.call<ReconnectResult>('reconnect', {
				channel: ROOT_STATE_URI,
				clientId: droppedClientId,
				lastSeenServerSeq: seenThrough,
				subscriptions: [sessionUri, chatUri],
			});
			const sessionChanged = revived.waitForNotification(n =>
				isActionNotification(n, 'session/titleChanged') && getActionEnvelope(n).channel === sessionUri,
			);
			const chatChanged = revived.waitForNotification(n =>
				isActionNotification(n, 'chat/draftChanged') && getActionEnvelope(n).channel === chatUri,
			);

			context.client.dispatch({
				channel: sessionUri,
				clientSeq: nextClientSeq(),
				action: { type: ActionType.SessionTitleChanged, title: 'Reconnected Live' },
			});
			context.client.dispatch({
				channel: chatUri,
				clientSeq: nextClientSeq(),
				action: { type: ActionType.ChatDraftChanged, draft: { text: 'live', origin: { kind: MessageKind.User } } },
			});

			assert.deepStrictEqual([
				getActionEnvelope(await sessionChanged).action.type,
				getActionEnvelope(await chatChanged).action.type,
			], [ActionType.SessionTitleChanged, ActionType.ChatDraftChanged]);
		} finally {
			revived.close();
		}
	});

	conformanceTest(context, 'reconnect reports a subscription it cannot resume as missing', async function () {
		const { sessionUri } = await createSession('reconnect-missing');
		const chatUri = buildDefaultChatUri(sessionUri);
		const droppedClientId = `reconnect-missing-dropped-${config.provider}`;
		// A channel that never existed stands in for one disposed while the client
		// was away: either way the server cannot resume it, and the client has to
		// be told rather than left waiting on a dead channel.
		const goneUri = URI.from({ scheme: 'agenthost-terminal', authority: 'e2e', path: '/never-existed' }).toString();

		const { carried: seenThrough, revived } = await afterConnectionDrop(droppedClientId, async first => {
			const subscribed = await first.call<SubscribeResult>('subscribe', { channel: chatUri });
			return subscribed.snapshot!.fromSeq;
		});

		try {
			const result = await revived.call<ReconnectResult>('reconnect', {
				channel: ROOT_STATE_URI,
				clientId: droppedClientId,
				lastSeenServerSeq: seenThrough,
				subscriptions: [chatUri, goneUri],
			});

			assert.deepStrictEqual({
				type: result.type,
				missing: result.type === ReconnectResultType.Replay ? result.missing : undefined,
			}, {
				type: ReconnectResultType.Replay,
				missing: [goneUri],
			});
		} finally {
			revived.close();
		}
	});

	conformanceTest(context, 'resource requests before initialize are rejected', async function () {
		const client = await context.connectClient();
		try {
			await assert.rejects(client.call('resourceResolve', {
				channel: ROOT_STATE_URI,
				uri: URI.file(tmpdir()).toString(),
			}), { code: JsonRpcErrorCodes.MethodNotFound });
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'unknown requests after initialize are rejected', async function () {
		const client = await initializeAdditionalClient('unknown-request');
		try {
			await assert.rejects(client.call('agentHostE2E/unknownRequest', {
				channel: ROOT_STATE_URI,
			}), { code: JsonRpcErrorCodes.MethodNotFound });
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'reconnect rejects an unknown client', async function () {
		const client = await context.connectClient();
		try {
			await assert.rejects(client.call('reconnect', {
				channel: ROOT_STATE_URI,
				clientId: `unknown-reconnect-${config.provider}`,
				lastSeenServerSeq: 0,
				subscriptions: [],
			}), { code: AhpErrorCodes.NotFound });
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'creating a session with an unknown provider is rejected', async function () {
		const client = await initializeAdditionalClient('unknown-provider');
		try {
			await assert.rejects(client.call('createSession', {
				channel: 'missing-provider:/session',
				provider: 'missing-provider',
			}), { code: AhpErrorCodes.ProviderNotFound });
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'creating a duplicate session resource is rejected', async function () {
		const { sessionUri, workspace } = await createSession('duplicate-session');

		await assert.rejects(context.client.call('createSession', {
			channel: sessionUri,
			provider: config.provider,
			workingDirectories: [URI.file(workspace).toString()],
			config: { isolation: 'folder' },
		}), { code: AhpErrorCodes.SessionAlreadyExists });
	}, context.runHostOnlyKnownIssueTests);

	conformanceTest(context, 'a session cannot fork onto its own resource', async function () {
		const { sessionUri } = await createSession('self-fork');

		await assert.rejects(context.client.call('createSession', {
			channel: sessionUri,
			provider: config.provider,
			fork: { session: sessionUri, turnId: 'irrelevant' },
		}), { code: AhpErrorCodes.SessionAlreadyExists });
	});

	conformanceTest(context, 'forking from a missing session is rejected', async function () {
		const target = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		const missingSource = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `missing-fork-source-${config.provider}`,
		});

		await assert.rejects(context.client.call('createSession', {
			channel: target,
			provider: config.provider,
			fork: { session: missingSource, turnId: 'missing-turn' },
		}), { code: AhpErrorCodes.SessionNotFound });
	});

	conformanceTest(context, 'createSession rejects an active client owned by another connection', async function () {
		const client = await context.connectClient();
		try {
			await client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `active-client-owner-${config.provider}`,
			});
			await assert.rejects(client.call('createSession', {
				channel: URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString(),
				provider: config.provider,
				activeClient: { clientId: 'different-client', displayName: 'Different Client', tools: [] },
			}), { code: JsonRpcErrorCodes.InvalidParams });
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'createSession seeds a matching active client into session state', async function () {
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-active-client-create-'));
		tempDirs.push(workspace);
		const clientId = `active-client-create-${config.provider}`;
		const client = await context.connectClient();
		const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		let created = false;
		try {
			await client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId,
			});
			await client.call('authenticate', {
				channel: ROOT_STATE_URI,
				resource: 'https://api.github.com',
				token: config.githubToken ?? resolveGitHubToken(),
			});
			await client.call('createSession', {
				channel: sessionUri,
				provider: config.provider,
				workingDirectories: [URI.file(workspace).toString()],
				config: { isolation: 'folder' },
				activeClient: { clientId, displayName: 'Creating Client', tools: [] },
			});
			created = true;

			const subscribed = await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			const state = subscribed.snapshot!.state as SessionState;
			assert.deepStrictEqual(state.activeClients, [{
				clientId,
				displayName: 'Creating Client',
				tools: [],
			}]);
		} finally {
			if (created) {
				await client.call('disposeSession', { channel: sessionUri });
			}
			client.close();
		}
	});

	conformanceTest(context, 'creating a chat for a missing session is rejected', async function () {
		const client = await initializeAdditionalClient('missing-chat-session');
		const sessionUri = URI.from({ scheme: config.scheme, path: '/missing-chat-session' }).toString();
		try {
			await assert.rejects(client.call('createChat', {
				channel: sessionUri,
				chat: buildChatUri(sessionUri, 'peer'),
			}), { code: AhpErrorCodes.SessionNotFound });
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'subscribing twice does not duplicate action delivery', async function () {
		const { sessionUri } = await createSession('duplicate-subscription');
		const chatUri = buildDefaultChatUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });
		await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });
		context.client.clearReceived();

		const clientSeq = nextClientSeq();
		const action = { type: ActionType.ChatDraftChanged, draft: { text: 'single delivery', origin: { kind: MessageKind.User } } } as const;
		context.client.dispatch({ channel: chatUri, clientSeq, action });
		await context.client.waitForNotification(n =>
			isActionNotification(n, action.type)
			&& getActionEnvelope(n).channel === chatUri
			&& getActionEnvelope(n).origin?.clientSeq === clientSeq,
		);
		await context.client.call('ping', { channel: ROOT_STATE_URI });
		const deliveries = context.client.receivedNotifications(n =>
			isActionNotification(n, action.type)
			&& getActionEnvelope(n).channel === chatUri
			&& getActionEnvelope(n).origin?.clientSeq === clientSeq,
		);

		assert.strictEqual(deliveries.length, 1);
	});

	conformanceTest(context, 'resubscribing receives state changed while unsubscribed', async function () {
		const { sessionUri } = await createSession('resubscribe-snapshot');
		const chatUri = buildDefaultChatUri(sessionUri);
		context.client.notify('unsubscribe', { channel: chatUri });
		const clientSeq = nextClientSeq();
		context.client.dispatch({
			channel: chatUri,
			clientSeq,
			action: {
				type: ActionType.ChatDraftChanged,
				draft: { text: 'changed while unsubscribed', origin: { kind: MessageKind.User } },
			},
		});
		await context.client.call('ping', { channel: ROOT_STATE_URI });

		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });
		const state = subscribed.snapshot!.state as ChatState;

		assert.strictEqual(state.draft?.text, 'changed while unsubscribed');
	});

	// The protocol declares working-directory mutation on both the session and
	// chat channels, but the host rejects all four: applying one would change
	// the synchronized directory set without reconfiguring the agent's actual
	// access. Each is answered through the normal reconciliation path so the
	// client can roll back its optimistic write-ahead action instead of leaving
	// it pending until reconnect.
	const unsupportedWorkingDirectoryActions = [
		{ notification: 'session/workingDirectorySet', channel: 'session', build: (directory: string): StateAction => ({ type: ActionType.SessionWorkingDirectorySet, directory }) },
		{ notification: 'session/workingDirectoryRemoved', channel: 'session', build: (directory: string): StateAction => ({ type: ActionType.SessionWorkingDirectoryRemoved, directory }) },
		{ notification: 'chat/workingDirectorySet', channel: 'chat', build: (directory: string): StateAction => ({ type: ActionType.ChatWorkingDirectorySet, directory }) },
		{ notification: 'chat/workingDirectoryRemoved', channel: 'chat', build: (directory: string): StateAction => ({ type: ActionType.ChatWorkingDirectoryRemoved, directory }) },
	] as const;

	for (const unsupported of unsupportedWorkingDirectoryActions) {
		conformanceTest(context, `${unsupported.notification} is rejected rather than silently dropped`, async function () {
			const { sessionUri, workspace } = await createSession('unsupported-action');
			const channel = unsupported.channel === 'session' ? sessionUri : buildDefaultChatUri(sessionUri);
			await context.client.call<SubscribeResult>('subscribe', { channel });
			context.client.clearReceived();

			const seq = nextClientSeq();
			const directory = URI.file(join(workspace, 'second-root')).toString();
			context.client.dispatch({ channel, clientSeq: seq, action: unsupported.build(directory) });

			const rejected = await context.client.waitForNotification(n =>
				isActionNotification(n, unsupported.notification) && getActionEnvelope(n).channel === channel,
				30_000,
			);
			const envelope = getActionEnvelope(rejected) as { rejectionReason?: string; origin?: { clientSeq?: number } };
			const state = (await context.client.call<SubscribeResult>('subscribe', { channel })).snapshot!.state as { workingDirectories?: readonly string[] };

			assert.deepStrictEqual({
				hasRejectionReason: typeof envelope.rejectionReason === 'string' && envelope.rejectionReason.length > 0,
				echoedClientSeq: envelope.origin?.clientSeq,
				// The reducer is deliberately not run, so state never moves.
				directoryApplied: (state.workingDirectories ?? []).includes(directory),
			}, {
				hasRejectionReason: true,
				echoedClientSeq: seq,
				directoryApplied: false,
			});
		});
	}
}
