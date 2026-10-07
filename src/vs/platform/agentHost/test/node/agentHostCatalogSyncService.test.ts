/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { ISessionCatalogSyncAcknowledgement, ISessionCatalogSyncPendingSnapshot, SessionCatalogSyncWriteResult } from '../../common/sessionDataService.js';
import { META_GIT_STATE } from '../../common/agentHostGitStateService.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION, AgentHostCatalogData, encodeAgentHostCatalogPayload } from '../../node/agentHostCatalogProjection.js';
import { AgentHostCatalogSyncService, replayPendingCatalogSnapshot } from '../../node/agentHostCatalogSyncService.js';
import { chatCatalogV2ToCatalogChats } from '../../node/agentHostCatalogSourceResolver.js';
import { AgentHostDatabase, AgentHostDatabaseSessionV2UpsertResult, IAgentHostDatabaseSessionV2Envelope } from '../../node/agentHostDatabase.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

const session = URI.parse('agenthost:test-session');

function data(summary: string, chatSummary = summary): AgentHostCatalogData {
	return {
		modifiedTime: 1,
		summary,
		titleSource: 'user',
		isRead: false,
		isArchived: false,
		workingDirectories: [],
		chats: [{
			uri: 'agenthost-chat:test-session/default',
			order: 0,
			kind: 'default',
			summary: chatSummary,
			titleSource: 'user',
		}],
	};
}

/** Reads the opaque payload the way a downstream reader would, without a SQL projection. */
function summaryOf(payload: string): string {
	return JSON.parse(payload).data.summary;
}

class RecordingSessionDatabase extends TestSessionDatabase {
	readonly calls: string[] = [];
	readonly writes: Array<{ readonly metadata: Readonly<Record<string, string>>; readonly title: string; readonly chatTitle: string }> = [];
	failLocalWrite = false;
	blockFirstWrite: Promise<void> | undefined;

	constructor(private readonly order?: string[]) {
		super();
	}

	override async setMetadataValuesAndCatalogSyncSnapshot(values: Readonly<Record<string, string>>, snapshot: ISessionCatalogSyncPendingSnapshot): Promise<SessionCatalogSyncWriteResult> {
		const persisted = JSON.parse(snapshot.payload).data;
		this.calls.push(`local:${snapshot.sourceRevision}:${persisted.summary}`);
		this.writes.push({ metadata: { ...values }, title: persisted.summary, chatTitle: persisted.chats[0].summary });
		this.order?.push('local');
		if (this.failLocalWrite) {
			throw new Error('local write failed');
		}
		if (this.blockFirstWrite) {
			const blocker = this.blockFirstWrite;
			this.blockFirstWrite = undefined;
			await blocker;
		}
		return super.setMetadataValuesAndCatalogSyncSnapshot(values, snapshot);
	}

	override async transitionMetadataValuesAndCatalogSyncSnapshot(values: Readonly<Record<string, string>>, expectedSessionGeneration: string, snapshot: ISessionCatalogSyncPendingSnapshot): Promise<boolean> {
		this.calls.push(`transition:${expectedSessionGeneration}:${snapshot.sessionGeneration}`);
		return super.transitionMetadataValuesAndCatalogSyncSnapshot(values, expectedSessionGeneration, snapshot);
	}

	override async acknowledgeCatalogSyncSnapshot(acknowledgement: ISessionCatalogSyncAcknowledgement): Promise<boolean> {
		this.calls.push(`ack:${acknowledgement.sourceRevision}`);
		this.order?.push('ack');
		return super.acknowledgeCatalogSyncSnapshot(acknowledgement);
	}
}

class RecordingCatalogDatabase extends AgentHostDatabase {
	readonly calls: string[] = [];
	getError: Error | undefined;
	upsertError: Error | undefined;
	upsertResult: AgentHostDatabaseSessionV2UpsertResult | undefined;
	seedConcurrentGeneration: string | undefined;

	constructor(private readonly order?: string[]) {
		super(':memory:');
	}

	override async getSessionV2(session: string) {
		this.calls.push('get');
		this.order?.push('get');
		if (this.getError) {
			throw this.getError;
		}
		return super.getSessionV2(session);
	}

	override async upsertSessionV2(envelope: IAgentHostDatabaseSessionV2Envelope, expectedSessionGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult> {
		this.calls.push(`upsert:${envelope.sourceRevision}:${summaryOf(envelope.payload)}`);
		this.order?.push('upsert');
		if (this.upsertError) {
			throw this.upsertError;
		}
		if (this.seedConcurrentGeneration) {
			const generation = this.seedConcurrentGeneration;
			this.seedConcurrentGeneration = undefined;
			await super.upsertSessionV2({ ...envelope, sessionGeneration: generation }, expectedSessionGeneration);
			return 'generationMismatch';
		}
		return this.upsertResult ?? super.upsertSessionV2(envelope, expectedSessionGeneration);
	}
}

suite('AgentHostCatalogSyncService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createHarness(order?: string[]) {
		const local = new RecordingSessionDatabase(order);
		const central = store.add(new RecordingCatalogDatabase(order));
		await central.registerSessionV2(session.toString(), {
			provider: 'copilotcli',
			startTime: 1,
			source: 'explicit',
		}, { checkTombstone: false });
		return {
			local,
			central,
			service: new AgentHostCatalogSyncService(createSessionDataService(local), central, new NullLogService()),
		};
	}

	async function activateChatCatalog(central: AgentHostDatabase) {
		const source = await central.getSessionV2(session.toString());
		if (!source || !await central.markSessionV2PayloadClean(session.toString(), source.payloadDirty)) {
			throw new Error('Expected a persisted legacy catalog');
		}
		const result = await central.ensureChatCatalogV2(session.toString(), {
			sessionGeneration: source.sessionGeneration,
			sourceRevision: source.sourceRevision,
			payloadHash: source.payloadHash,
			catalogRevision: 0,
		}, {
			defaultChat: { chat: data('initial').chats[0].uri, order: 0, metadata: { summary: 'Chat', titleSource: 'user' } },
			peers: [],
			privateDescendants: [],
		});
		if (result.status !== 'applied') {
			throw new Error(`Expected catalog activation, got ${result.status}`);
		}
		const [snapshot] = await central.readCatalogSnapshot([session.toString()]);
		if (!snapshot?.header) {
			throw new Error('Expected an activated catalog header');
		}
		return { ...snapshot, header: snapshot.header };
	}

	test('synchronizes normalized session aggregates without overwriting a concurrent chat patch', async () => {
		const { local, central, service } = await createHarness();
		await service.synchronize(session, { data: data('initial', 'Chat'), legacyMetadata: {} });
		const snapshot = await activateChatCatalog(central);
		const request = {
			data: { ...data('aggregate'), chats: chatCatalogV2ToCatalogChats(snapshot) },
			legacyMetadata: {},
			chatCatalogRevision: snapshot.header.revision,
		};
		const applied = await service.synchronize(session, request);
		const chat = snapshot.chats[0];
		await central.updateChatV2Metadata(chat.chat, chat, { metadata: { ...chat.metadata, summary: 'Concurrent' } });
		const rejected = await service.synchronize(session, { ...request, data: { ...request.data, summary: 'Stale aggregate' } });
		const pending = await local.getCatalogSyncSnapshot();
		const [current] = await central.readCatalogSnapshot([session.toString()]);
		if (!current?.header) {
			throw new Error('Expected the current catalog header');
		}
		const accepted = await service.synchronize(session, {
			data: { ...data('Latest aggregate'), chats: chatCatalogV2ToCatalogChats(current) },
			legacyMetadata: {},
			chatCatalogRevision: current.header.revision,
		});
		const source = await central.getSessionV2(session.toString());
		const [final] = await central.readCatalogSnapshot([session.toString()]);
		assert.deepStrictEqual({
			applied,
			rejected,
			pending: pending?.state,
			accepted,
			summary: source && summaryOf(source.payload),
			chat: final.chats[0].metadata?.summary,
			headerRevision: final.header?.revision,
			receipt: (await local.getCatalogSyncSnapshot())?.state,
		}, {
			applied: { status: 'acknowledged', sourceRevision: 1 },
			rejected: { status: 'pending', sourceRevision: 2, reason: 'conflict' },
			pending: 'pending',
			accepted: { status: 'acknowledged', sourceRevision: 3 },
			summary: 'Latest aggregate',
			chat: 'Concurrent',
			headerRevision: current.header?.revision,
			receipt: 'acknowledged',
		});
	});

	for (const localStorage of [false, true]) {
		test(`rebuilds normalized requests after a catalog revision conflict ${localStorage ? 'with' : 'without'} local storage`, async () => {
			const { local, central, service } = await createHarness();
			await service.synchronize(session, { data: data('initial', 'Chat'), legacyMetadata: {} });
			await activateChatCatalog(central);
			const sessionData = createSessionDataService(local);
			const syncing = localStorage ? service : new AgentHostCatalogSyncService({ ...sessionData, tryOpenDatabase: async () => undefined }, central, new NullLogService());
			const revisions: number[] = [];
			const result = await syncing.synchronizeMigrationWithFactory(session, async () => {
				const [snapshot] = await central.readCatalogSnapshot([session.toString()]);
				if (!snapshot.header) {
					throw new Error('Missing normalized synchronization header');
				}
				revisions.push(snapshot.header.revision);
				if (revisions.length === 1) {
					const chat = snapshot.chats[0];
					await central.updateChatV2Metadata(chat.chat, chat, { metadata: { ...chat.metadata, summary: 'Concurrent title' } });
				}
				return {
					data: { ...data('aggregate'), chats: chatCatalogV2ToCatalogChats(snapshot) },
					legacyMetadata: {},
					chatCatalogRevision: snapshot.header.revision,
				};
			});
			const stored = await central.getSessionV2(session.toString());
			assert.deepStrictEqual({
				status: result.status,
				revisions,
				summary: stored && summaryOf(stored.payload),
				chat: stored && JSON.parse(stored.payload).data.chats[0].summary,
				receipt: localStorage ? (await local.getCatalogSyncSnapshot())?.state : undefined,
			}, {
				status: 'acknowledged', revisions: [1, 2], summary: 'aggregate', chat: 'Concurrent title',
				receipt: localStorage ? 'acknowledged' : undefined,
			});
		});
	}

	test('replays a durable normalized aggregate without legacy upsert or chat mutation', async () => {
		const { local, central, service } = await createHarness();
		await service.synchronize(session, { data: data('initial', 'Chat'), legacyMetadata: {} });
		const snapshot = await activateChatCatalog(central);
		const source = await central.getSessionV2(session.toString());
		const encoded = encodeAgentHostCatalogPayload({ ...data('Replayed aggregate'), chats: chatCatalogV2ToCatalogChats(snapshot) });
		if (!source || !encoded.ok) {
			throw new Error('Expected a valid normalized aggregate');
		}
		const pending: ISessionCatalogSyncPendingSnapshot = {
			sessionGeneration: source.sessionGeneration,
			sourceRevision: source.sourceRevision + 1,
			projectionVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
			payload: encoded.value.payload,
			payloadHash: encoded.value.payloadHash,
			state: 'pending',
		};
		await local.setMetadataValuesAndCatalogSyncSnapshot({}, pending);
		const result = await replayPendingCatalogSnapshot(central, session, pending, acknowledgement => local.acknowledgeCatalogSyncSnapshot(acknowledgement), CancellationToken.None);
		const stored = await central.getSessionV2(session.toString());
		assert.deepStrictEqual({
			result,
			summary: stored && summaryOf(stored.payload),
			snapshot: (await central.readCatalogSnapshot([session.toString()]))[0],
			receipt: (await local.getCatalogSyncSnapshot())?.state,
		}, {
			result: { session: session.toString(), status: 'succeeded', reason: 'pendingReplayed', sourceRevision: 1 },
			summary: 'Replayed aggregate',
			snapshot,
			receipt: 'acknowledged',
		});
	});

	test('traces queued catalog work separately from its execution and preserves failures', async () => {
		const { local, central } = await createHarness();
		const traces: { operationId: string; stage: string; outcome?: string; queueWaitMs?: number; executionMs?: number }[] = [];
		const logService = new class extends NullLogService {
			override trace(message: string): void {
				const match = /operationId=(?<operationId>[^,]+), kind=write, stage=(?<stage>[^,]+)(?:, outcome=(?<outcome>[^,]+))?(?:, queueWaitMs=(?<queueWaitMs>\d+))?(?:, executionMs=(?<executionMs>\d+))?$/.exec(message);
				if (match?.groups) {
					traces.push({
						operationId: match.groups.operationId,
						stage: match.groups.stage,
						outcome: match.groups.outcome,
						queueWaitMs: match.groups.queueWaitMs === undefined ? undefined : Number(match.groups.queueWaitMs),
						executionMs: match.groups.executionMs === undefined ? undefined : Number(match.groups.executionMs),
					});
				}
			}
		}();
		const service = new AgentHostCatalogSyncService(createSessionDataService(local), central, logService);
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const blocker = service.runExclusive(session, async () => {
			started.complete();
			await release.p;
		});
		await started.p;
		const queued = service.runExclusive(session, async () => { throw new Error('catalog operation failed'); });
		const rejected = assert.rejects(queued, /catalog operation failed/);
		const beforeRelease = traces.map(trace => trace.stage);
		release.complete();
		await Promise.all([blocker, rejected]);

		assert.deepStrictEqual({
			beforeRelease,
			stages: traces.map(trace => [trace.stage, trace.outcome]),
			operationCount: new Set(traces.map(trace => trace.operationId)).size,
			validDurations: traces.filter(trace => trace.stage === 'settled').every(trace => trace.queueWaitMs !== undefined && trace.queueWaitMs >= 0 && trace.executionMs !== undefined && trace.executionMs >= 0),
		}, {
			beforeRelease: ['queued', 'started', 'queued'],
			stages: [
				['queued', undefined],
				['started', undefined],
				['queued', undefined],
				['settled', 'completed'],
				['started', undefined],
				['settled', 'failed'],
			],
			operationCount: 2,
			validDurations: true,
		});
	});

	test('traces the local write boundary before awaiting it', async () => {
		const { local, central } = await createHarness();
		const stages: string[] = [];
		const logService = new class extends NullLogService {
			override trace(message: string): void {
				const match = /attempt=\d+, stage=(?<stage>[^,]+)/.exec(message);
				if (match?.groups) {
					stages.push(match.groups.stage);
				}
			}
		}();
		const service = new AgentHostCatalogSyncService(createSessionDataService(local), central, logService);
		local.failLocalWrite = true;

		await assert.rejects(service.synchronize(session, { data: data('one'), legacyMetadata: {} }), /local write failed/);

		assert.deepStrictEqual(stages, ['readLocalReceipt', 'readCentralCatalog', 'readLegacyMetadata', 'writeLocalReceipt']);
	});

	test('writes legacy metadata and pending receipt before sessions_v2, then clears payload on exact acknowledgement', async () => {
		const order: string[] = [];
		const { local, central, service } = await createHarness(order);

		const result = await service.synchronize(session, { data: data('one'), legacyMetadata: { customTitle: 'one' } });
		const snapshot = await local.getCatalogSyncSnapshot();
		const catalog = await central.getSessionV2(session.toString());

		assert.deepStrictEqual({
			result,
			order: order.filter(call => call !== 'get'),
			localCalls: local.calls,
			title: await local.getMetadata('customTitle'),
			snapshot,
			catalogTitle: catalog && summaryOf(catalog.payload),
			payloadDirty: catalog?.payloadDirty,
			receiptMatchesCatalog: snapshot?.sessionGeneration === catalog?.sessionGeneration
				&& snapshot?.sourceRevision === catalog?.sourceRevision
				&& snapshot?.projectionVersion === catalog?.payloadVersion
				&& snapshot?.payloadHash === catalog?.payloadHash,
		}, {
			result: { status: 'acknowledged', sourceRevision: 0 },
			order: ['local', 'upsert', 'ack'],
			localCalls: ['local:0:one', 'ack:0'],
			title: 'one',
			snapshot: {
				sessionGeneration: snapshot?.sessionGeneration,
				sourceRevision: 0,
				projectionVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
				payload: undefined,
				payloadHash: snapshot?.payloadHash,
				acknowledgedHash: snapshot?.payloadHash,
				state: 'acknowledged',
			},
			catalogTitle: 'one',
			payloadDirty: 2,
			receiptMatchesCatalog: true,
		});
	});

	test('migration writes only the central catalog when the local database is absent', async () => {
		const central = store.add(new RecordingCatalogDatabase());
		await central.registerSessionV2(session.toString(), {
			provider: 'copilotcli',
			startTime: 1,
			source: 'restore',
		}, { checkTombstone: false });
		let opens = 0;
		let probes = 0;
		const sessionDataService = {
			...createSessionDataService(),
			openDatabase: () => {
				opens++;
				throw new Error('must not create a database');
			},
			tryOpenDatabase: async () => {
				probes++;
				return undefined;
			},
		};
		const service = new AgentHostCatalogSyncService(sessionDataService, central, new NullLogService());

		const result = await service.synchronizeMigrationWithFactory(session, async () => ({
			data: data('migrated'),
			legacyMetadata: { customTitle: 'migrated' },
		}));

		assert.deepStrictEqual({
			result,
			opens,
			probes,
			title: summaryOf((await central.getSessionV2(session.toString()))!.payload),
		}, {
			result: { status: 'acknowledged', sourceRevision: 0 },
			opens: 0,
			probes: 1,
			title: 'migrated',
		});
	});

	test('central-only migration retries a same-revision conflict instead of acknowledging the loser', async () => {
		class ConflictingCatalogDatabase extends RecordingCatalogDatabase {
			private conflicted = false;

			override async upsertSessionV2(envelope: IAgentHostDatabaseSessionV2Envelope, expectedGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult> {
				if (!this.conflicted) {
					this.conflicted = true;
					const concurrent = encodeAgentHostCatalogPayload(data('concurrent'));
					if (!concurrent.ok) {
						throw new Error(concurrent.error);
					}
					await super.upsertSessionV2({
						...envelope,
						payload: concurrent.value.payload,
						payloadHash: concurrent.value.payloadHash,
					}, expectedGeneration);
					return 'conflict';
				}
				return super.upsertSessionV2(envelope, expectedGeneration);
			}
		}
		const central = store.add(new ConflictingCatalogDatabase());
		await central.registerSessionV2(session.toString(), {
			provider: 'copilotcli',
			startTime: 1,
			source: 'restore',
		}, { checkTombstone: false });
		const service = new AgentHostCatalogSyncService({
			...createSessionDataService(),
			tryOpenDatabase: async () => undefined,
		}, central, new NullLogService());

		const result = await service.synchronizeMigrationWithFactory(session, async () => ({ data: data('migration'), legacyMetadata: {} }));
		const catalog = await central.getSessionV2(session.toString());

		assert.deepStrictEqual({
			result,
			title: catalog && summaryOf(catalog.payload),
			upserts: central.calls.filter(call => call.startsWith('upsert')).length,
		}, {
			result: { status: 'acknowledged', sourceRevision: 1 },
			title: 'migration',
			upserts: 2,
		});
	});

	test('central-only migration reports transient central failures as pending', async () => {
		const central = store.add(new RecordingCatalogDatabase());
		await central.registerSessionV2(session.toString(), {
			provider: 'copilotcli',
			startTime: 1,
			source: 'restore',
		}, { checkTombstone: false });
		central.upsertError = new Error('central unavailable');
		const service = new AgentHostCatalogSyncService({
			...createSessionDataService(),
			tryOpenDatabase: async () => undefined,
		}, central, new NullLogService());

		assert.deepStrictEqual(
			await service.synchronizeMigrationWithFactory(session, async () => ({ data: data('migration'), legacyMetadata: {} })),
			{ status: 'pending', sourceRevision: 0, reason: 'upsertFailed' },
		);
	});

	test('migration uses coordinated local-first synchronization when the database exists', async () => {
		const { local, central, service } = await createHarness();

		const result = await service.synchronizeMigrationWithFactory(session, async () => ({
			data: data('migrated'),
			legacyMetadata: { customTitle: 'migrated' },
		}));

		assert.deepStrictEqual({
			result,
			localCalls: local.calls,
			title: await local.getMetadata('customTitle'),
			receiptState: (await local.getCatalogSyncSnapshot())?.state,
			centralTitle: summaryOf((await central.getSessionV2(session.toString()))!.payload),
		}, {
			result: { status: 'acknowledged', sourceRevision: 0 },
			localCalls: ['local:0:migrated', 'ack:0'],
			title: 'migrated',
			receiptState: 'acknowledged',
			centralTitle: 'migrated',
		});
	});

	test('migration propagates local database probe failures', async () => {
		const central = store.add(new RecordingCatalogDatabase());
		await central.registerSessionV2(session.toString(), {
			provider: 'copilotcli',
			startTime: 1,
			source: 'restore',
		}, { checkTombstone: false });
		const service = new AgentHostCatalogSyncService({
			...createSessionDataService(),
			tryOpenDatabase: async () => { throw new Error('probe failed'); },
		}, central, new NullLogService());

		await assert.rejects(
			service.synchronizeMigrationWithFactory(session, async () => ({ data: data('migrated'), legacyMetadata: {} })),
			/probe failed/,
		);
		assert.deepStrictEqual(await central.getSessionV2(session.toString()), undefined);
	});

	test('migration does not bypass a concurrent tombstone', async () => {
		const central = store.add(new RecordingCatalogDatabase());
		await central.registerSessionV2(session.toString(), {
			provider: 'copilotcli',
			startTime: 1,
			source: 'restore',
		}, { checkTombstone: false });
		await central.tombstoneAndUnregisterSession(session.toString());
		const service = new AgentHostCatalogSyncService({
			...createSessionDataService(),
			tryOpenDatabase: async () => undefined,
		}, central, new NullLogService());

		const result = await service.synchronizeMigrationWithFactory(session, async () => ({ data: data('migrated'), legacyMetadata: {} }));

		assert.deepStrictEqual({
			result,
			catalog: await central.getSessionV2(session.toString()),
		}, {
			result: { status: 'pending', sourceRevision: 0, reason: 'tombstoned' },
			catalog: undefined,
		});
	});

	test('migration verifies and replaces a concurrent generation before acknowledging it', async () => {
		class RacingCatalogDatabase extends RecordingCatalogDatabase {
			private raced = false;

			override async upsertSessionV2(envelope: IAgentHostDatabaseSessionV2Envelope, expectedGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult> {
				if (!this.raced) {
					this.raced = true;
					const live = encodeAgentHostCatalogPayload(data('live adoption'));
					if (!live.ok) {
						throw new Error(live.error);
					}
					await super.upsertSessionV2({
						...envelope,
						sessionGeneration: 'live-generation',
						payload: live.value.payload,
						payloadHash: live.value.payloadHash,
					}, expectedGeneration);
					return 'generationMismatch';
				}
				return super.upsertSessionV2(envelope, expectedGeneration);
			}
		}
		const central = store.add(new RacingCatalogDatabase());
		await central.registerSessionV2(session.toString(), {
			provider: 'copilotcli',
			startTime: 1,
			source: 'restore',
		}, { checkTombstone: false });
		const service = new AgentHostCatalogSyncService({
			...createSessionDataService(),
			tryOpenDatabase: async () => undefined,
		}, central, new NullLogService());

		const result = await service.synchronizeMigrationWithFactory(session, async () => ({ data: data('stale migration'), legacyMetadata: {} }));
		const winner = await central.getSessionV2(session.toString());

		assert.deepStrictEqual({
			result,
			generation: winner?.sessionGeneration,
			title: winner && summaryOf(winner.payload),
		}, {
			result: { status: 'acknowledged', sourceRevision: 1 },
			generation: 'live-generation',
			title: 'stale migration',
		});
	});

	test('does not write sessions_v2 when the local transaction fails', async () => {
		const { local, central, service } = await createHarness();
		local.failLocalWrite = true;

		await assert.rejects(service.synchronize(session, { data: data('one'), legacyMetadata: { customTitle: 'one' } }), /local write failed/);
		assert.deepStrictEqual(central.calls, ['get']);
	});

	test('retains the pending payload when the central upsert fails', async () => {
		const { local, central, service } = await createHarness();
		central.upsertError = new Error('central unavailable');

		const result = await service.synchronize(session, { data: data('one'), legacyMetadata: { customTitle: 'one' } });
		const snapshot = await local.getCatalogSyncSnapshot();

		assert.deepStrictEqual({
			result,
			state: snapshot?.state,
			hasPayload: snapshot?.payload !== undefined,
			title: await local.getMetadata('customTitle'),
		}, {
			result: { status: 'pending', sourceRevision: 0, reason: 'upsertFailed' },
			state: 'pending',
			hasPayload: true,
			title: 'one',
		});
	});

	test('targeted replay recovers a pending payload when there is no central row', async () => {
		const { local, central, service } = await createHarness();
		central.upsertError = new Error('central unavailable');
		await service.synchronize(session, { data: data('pending'), legacyMetadata: { customTitle: 'pending' } });
		central.upsertError = undefined;

		const result = await service.replayPending(session, CancellationToken.None);
		const catalog = await central.getSessionV2(session.toString());

		assert.deepStrictEqual({
			result,
			receipt: (await local.getCatalogSyncSnapshot())?.state,
			title: catalog && summaryOf(catalog.payload),
		}, {
			result: { session: session.toString(), status: 'succeeded', reason: 'pendingReplayed', sourceRevision: 0 },
			receipt: 'acknowledged',
			title: 'pending',
		});
	});

	test('targeted replay skips already acknowledged snapshots without reading the central catalog', async () => {
		const { central, service } = await createHarness();
		await service.synchronize(session, { data: data('one'), legacyMetadata: {} });
		central.calls.length = 0;

		const result = await service.replayPending(session, CancellationToken.None);

		assert.deepStrictEqual({ result, calls: central.calls }, { result: undefined, calls: [] });
	});

	test('targeted replay respects a session deletion fence', async () => {
		const { local, central, service } = await createHarness();
		central.upsertError = new Error('central unavailable');
		await service.synchronize(session, { data: data('pending'), legacyMetadata: {} });
		const fence = store.add(service.beginSessionDeletion(session));
		await fence.whenDrained;
		central.calls.length = 0;

		const result = await service.replayPending(session, CancellationToken.None);

		assert.deepStrictEqual({
			result,
			calls: central.calls,
			receipt: (await local.getCatalogSyncSnapshot())?.state,
		}, {
			result: undefined,
			calls: [],
			receipt: 'pending',
		});
	});

	test('targeted replay cancelled while queued performs no central writes', async () => {
		const { local, central, service } = await createHarness();
		central.upsertError = new Error('central unavailable');
		await service.synchronize(session, { data: data('pending'), legacyMetadata: {} });
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const blocker = service.runExclusive(session, async () => {
			started.complete();
			await release.p;
		});
		await started.p;
		central.calls.length = 0;
		const cancellation = store.add(new CancellationTokenSource());
		const replay = service.replayPending(session, cancellation.token);
		cancellation.cancel();
		release.complete();
		await blocker;

		assert.deepStrictEqual({
			result: await replay,
			calls: central.calls,
			receipt: (await local.getCatalogSyncSnapshot())?.state,
		}, {
			result: undefined,
			calls: [],
			receipt: 'pending',
		});
	});

	test('a targeted replay queued during a real catalog close retains its pending snapshot', async () => {
		const snapshotQueued = new DeferredPromise<void>();
		class ClosingCatalogDatabase extends AgentHostDatabase {
			failUpsert = true;

			override async upsertSessionV2(envelope: IAgentHostDatabaseSessionV2Envelope, expectedSessionGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult> {
				if (this.failUpsert) {
					throw new Error('central unavailable');
				}
				return super.upsertSessionV2(envelope, expectedSessionGeneration);
			}

			override readCatalogSnapshot(sessions?: readonly string[]) {
				const result = super.readCatalogSnapshot(sessions);
				snapshotQueued.complete();
				return result;
			}
		}
		const local = new TestSessionDatabase();
		const central = store.add(new ClosingCatalogDatabase(':memory:'));
		await central.registerSessionV2(session.toString(), {
			provider: 'copilotcli',
			startTime: 1,
			source: 'explicit',
		}, { checkTombstone: false });
		const service = new AgentHostCatalogSyncService(createSessionDataService(local), central, new NullLogService());
		await service.synchronize(session, { data: data('pending'), legacyMetadata: {} });
		central.failUpsert = false;
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const transactionSequencer = (central as unknown as {
			_transactionSequencer: { queue<T>(operation: () => Promise<T>): Promise<T> };
		})._transactionSequencer;
		const blocker = transactionSequencer.queue(async () => {
			started.complete();
			await release.p;
		});
		await started.p;
		const replay = service.replayPending(session, CancellationToken.None);
		try {
			await snapshotQueued.p;
			await central.close();
		} finally {
			release.complete();
		}
		await blocker;

		assert.deepStrictEqual({
			result: await replay,
			receipt: (await local.getCatalogSyncSnapshot())?.state,
		}, {
			result: { session: session.toString(), status: 'pending', reason: 'upsertFailed', sourceRevision: 0 },
			receipt: 'pending',
		});
	});

	for (const stage of ['catalog read', 'tombstone read', 'central upsert']) {
		test(`targeted replay stops when cancelled during ${stage}`, async () => {
			const { local, central, service } = await createHarness();
			central.upsertError = new Error('central unavailable');
			await service.synchronize(session, { data: data('pending'), legacyMetadata: {} });
			central.upsertError = undefined;
			const cancellation = store.add(new CancellationTokenSource());
			if (stage === 'catalog read') {
				central.getSessionV2 = async () => {
					cancellation.cancel();
					return undefined;
				};
			} else if (stage === 'tombstone read') {
				central.isSessionTombstoned = async () => {
					cancellation.cancel();
					return false;
				};
			} else {
				central.upsertSessionV2 = async () => {
					cancellation.cancel();
					return 'applied';
				};
			}

			const result = await service.replayPending(session, cancellation.token);

			assert.deepStrictEqual({
				result,
				receipt: (await local.getCatalogSyncSnapshot())?.state,
			}, {
				result: { session: session.toString(), status: 'retry', reason: 'cancelled' },
				receipt: 'pending',
			});
		});
	}

	test('replays an acknowledged exact receipt without rewriting sessions_v2', async () => {
		const { local, central, service } = await createHarness();
		const request = { data: data('one'), legacyMetadata: { customTitle: 'one' } };

		const first = await service.synchronize(session, request);
		const callsAfterFirst = central.calls.length;
		const second = await service.synchronize(session, request);

		assert.deepStrictEqual({
			first,
			second,
			secondCentralCalls: central.calls.slice(callsAfterFirst),
			localCalls: local.calls,
			payload: (await local.getCatalogSyncSnapshot())?.payload,
		}, {
			first: { status: 'acknowledged', sourceRevision: 0 },
			second: { status: 'acknowledged', sourceRevision: 0 },
			secondCentralCalls: ['get'],
			localCalls: ['local:0:one', 'ack:0', 'local:0:one'],
			payload: undefined,
		});
	});

	test('advances the revision when legacy metadata changes without changing the projection hash', async () => {
		const { local, service } = await createHarness();
		const catalogData = data('one');

		await service.synchronize(session, {
			data: catalogData,
			legacyMetadata: { customTitle: 'one', [META_GIT_STATE]: '{"branch":"first"}' },
		});
		const first = await local.getCatalogSyncSnapshot();
		const result = await service.synchronize(session, {
			data: catalogData,
			legacyMetadata: { customTitle: 'one', [META_GIT_STATE]: '{"branch":"second"}' },
		});
		const second = await local.getCatalogSyncSnapshot();

		assert.deepStrictEqual({
			result,
			hashUnchanged: first?.payloadHash === second?.payloadHash,
			revision: second?.sourceRevision,
			payload: second?.payload,
			gitState: await local.getMetadata(META_GIT_STATE),
		}, {
			result: { status: 'acknowledged', sourceRevision: 1 },
			hashUnchanged: true,
			revision: 1,
			payload: undefined,
			gitState: '{"branch":"second"}',
		});
	});

	test('advances changed content beyond a newer local pending revision after central failure', async () => {
		const { local, central, service } = await createHarness();
		await service.synchronize(session, { data: data('H0'), legacyMetadata: { customTitle: 'H0' } });
		central.upsertError = new Error('central unavailable');
		const failed = await service.synchronize(session, { data: data('H1'), legacyMetadata: { customTitle: 'H1' } });
		const pending = await local.getCatalogSyncSnapshot();
		central.upsertError = undefined;

		const recovered = await service.synchronize(session, { data: data('H2'), legacyMetadata: { customTitle: 'H2' } });
		const acknowledged = await local.getCatalogSyncSnapshot();

		assert.deepStrictEqual({
			failed,
			pending: { revision: pending?.sourceRevision, state: pending?.state, hasPayload: pending?.payload !== undefined },
			recovered,
			acknowledged: { revision: acknowledged?.sourceRevision, state: acknowledged?.state, payload: acknowledged?.payload },
			central: {
				revision: (await central.getSessionV2(session.toString()))?.sourceRevision,
				title: summaryOf((await central.getSessionV2(session.toString()))!.payload),
			},
			legacyTitle: await local.getMetadata('customTitle'),
		}, {
			failed: { status: 'pending', sourceRevision: 1, reason: 'upsertFailed' },
			pending: { revision: 1, state: 'pending', hasPayload: true },
			recovered: { status: 'acknowledged', sourceRevision: 2 },
			acknowledged: { revision: 2, state: 'acknowledged', payload: undefined },
			central: { revision: 2, title: 'H2' },
			legacyTitle: 'H2',
		});
	});

	test('advances pending content while getSessionV2 is unavailable and later converges without rejection', async () => {
		const { local, central, service } = await createHarness();
		await service.synchronize(session, { data: data('H0'), legacyMetadata: { customTitle: 'H0' } });
		central.getError = new Error('central read unavailable');

		const first = await service.synchronize(session, { data: data('H1'), legacyMetadata: { customTitle: 'H1' } });
		const second = await service.synchronize(session, { data: data('H2'), legacyMetadata: { customTitle: 'H2' } });
		const pending = await local.getCatalogSyncSnapshot();
		central.getError = undefined;
		const recovered = await service.synchronize(session, { data: data('H2'), legacyMetadata: { customTitle: 'H2' } });

		assert.deepStrictEqual({
			first,
			second,
			pending: { revision: pending?.sourceRevision, state: pending?.state, hasPayload: pending?.payload !== undefined },
			recovered,
			central: {
				revision: (await central.getSessionV2(session.toString()))?.sourceRevision,
				title: summaryOf((await central.getSessionV2(session.toString()))!.payload),
			},
			payload: (await local.getCatalogSyncSnapshot())?.payload,
		}, {
			first: { status: 'pending', sourceRevision: 1, reason: 'upsertFailed' },
			second: { status: 'pending', sourceRevision: 2, reason: 'upsertFailed' },
			pending: { revision: 2, state: 'pending', hasPayload: true },
			recovered: { status: 'acknowledged', sourceRevision: 2 },
			central: { revision: 2, title: 'H2' },
			payload: undefined,
		});
	});

	test('adopts the winning generation after a concurrent first writer', async () => {
		const { local, central, service } = await createHarness();
		central.seedConcurrentGeneration = 'winner';

		const result = await service.synchronize(session, { data: data('one'), legacyMetadata: {} });
		const snapshot = await local.getCatalogSyncSnapshot();

		assert.deepStrictEqual({
			result,
			generation: snapshot?.sessionGeneration,
			localCalls: local.calls.map(call => call.startsWith('transition:') ? 'transition' : call),
			centralCalls: central.calls,
		}, {
			result: { status: 'acknowledged', sourceRevision: 0 },
			generation: 'winner',
			localCalls: ['local:0:one', 'transition', 'ack:0'],
			centralCalls: ['get', 'upsert:0:one', 'get', 'upsert:0:one'],
		});
	});

	test('delete and recreate uses a new session generation', async () => {
		const { local, central, service } = await createHarness();
		await service.synchronize(session, { data: data('one'), legacyMetadata: {} });
		const firstGeneration = (await local.getCatalogSyncSnapshot())?.sessionGeneration;
		await central.tombstoneAndUnregisterSession(session.toString());
		await central.clearSessionTombstone(session.toString());
		await central.registerSessionV2(session.toString(), {
			provider: 'copilotcli',
			startTime: 2,
			source: 'explicit',
		}, { checkTombstone: false });

		const result = await service.synchronize(session, { data: data('two'), legacyMetadata: {} });
		const secondGeneration = (await local.getCatalogSyncSnapshot())?.sessionGeneration;

		assert.deepStrictEqual({
			result,
			generationChanged: firstGeneration !== secondGeneration,
			centralGeneration: (await central.getSessionV2(session.toString()))?.sessionGeneration,
		}, {
			result: { status: 'acknowledged', sourceRevision: 0 },
			generationChanged: true,
			centralGeneration: secondGeneration,
		});
	});

	test('serializes queued mutations without dropping caller payloads', async () => {
		let releaseFirstWrite!: () => void;
		const { local, service } = await createHarness();
		local.blockFirstWrite = new Promise(resolve => releaseFirstWrite = resolve);

		const first = service.synchronize(session, { data: data('one', 'chat-one'), legacyMetadata: { customTitle: 'one' } });
		const second = service.synchronize(session, { data: data('two', 'chat-two'), legacyMetadata: { customTitle: 'two' } });
		const third = service.synchronize(session, { data: data('three', 'chat-three'), legacyMetadata: { customTitle: 'three' } });
		releaseFirstWrite();

		assert.deepStrictEqual({
			results: await Promise.all([first, second, third]),
			writes: local.writes,
			title: await local.getMetadata('customTitle'),
		}, {
			results: [
				{ status: 'acknowledged', sourceRevision: 0 },
				{ status: 'acknowledged', sourceRevision: 1 },
				{ status: 'acknowledged', sourceRevision: 2 },
			],
			writes: [
				{ metadata: { customTitle: 'one' }, title: 'one', chatTitle: 'chat-one' },
				{ metadata: { customTitle: 'two' }, title: 'two', chatTitle: 'chat-two' },
				{ metadata: { customTitle: 'three' }, title: 'three', chatTitle: 'chat-three' },
			],
			title: 'three',
		});
	});

	for (const operation of ['write', 'migration'] as const) {
		test(`serializes a ${operation} through another URI for the same session database`, async () => {
			const local = store.add(await SessionDatabase.open(':memory:'));
			const central = store.add(new AgentHostDatabase(':memory:'));
			const service = new AgentHostCatalogSyncService(createSessionDataService(local), central, new NullLogService());
			const legacySession = URI.parse('codex:/shared-session');
			const standardSession = URI.parse('ahp-session:/shared-session');
			for (const resource of [legacySession, standardSession]) {
				await central.registerSessionV2(resource.toString(), {
					provider: 'codex', startTime: 1, source: 'restore',
				}, { checkTombstone: true });
			}
			const started = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			const order: string[] = [];
			const first = service.runExclusive(legacySession, async synchronize => {
				order.push('first started');
				started.complete();
				await release.p;
				const result = await synchronize({ data: data('first'), legacyMetadata: { customTitle: 'first' } });
				order.push('first finished');
				return result;
			});
			await started.p;
			const request = { data: data('second'), legacyMetadata: { customTitle: 'second' } };
			const second = operation === 'write'
				? service.runExclusive(standardSession, async synchronize => {
					order.push('second started');
					return synchronize(request);
				})
				: service.runMigrationExclusive(standardSession, async (_database, synchronize) => {
					order.push('second started');
					return synchronize(request);
				});
			release.complete();
			const results = await Promise.allSettled([first, second]);
			const snapshot = await local.getCatalogSyncSnapshot();
			const catalog = await central.getSessionV2(standardSession.toString());

			assert.deepStrictEqual({
				results,
				order,
				title: await local.getMetadata('customTitle'),
				receipt: snapshot?.state,
				generationMatches: snapshot?.sessionGeneration === catalog?.sessionGeneration,
			}, {
				results: [
					{ status: 'fulfilled', value: { status: 'acknowledged', sourceRevision: 0 } },
					{ status: 'fulfilled', value: { status: 'acknowledged', sourceRevision: 0 } },
				],
				order: ['first started', 'first finished', 'second started'],
				title: 'second',
				receipt: 'acknowledged',
				generationMatches: true,
			});
		});
	}

	test('shares deletion fences across session storage aliases', async () => {
		const { service } = await createHarness();
		const alias = session.with({ scheme: 'ahp-session' });
		const firstFence = store.add(service.beginSessionDeletion(session));
		await firstFence.whenDrained;

		await assert.rejects(
			service.synchronize(alias, { data: data('blocked'), legacyMetadata: {} }),
			/Catalog synchronization rejected during session deletion/,
		);
		await assert.rejects(service.runMigrationExclusive(alias, async () => { }), /Catalog synchronization rejected during session deletion/);
		const replay = await service.replayPending(alias, CancellationToken.None);
		const secondFence = store.add(service.beginSessionDeletion(alias));
		await secondFence.whenDrained;
		firstFence.dispose();
		const fencedAfterFirstRelease = service.isSessionDeletionFenced(session);
		secondFence.dispose();

		assert.deepStrictEqual({
			replay,
			fencedAfterFirstRelease,
			fencedAfterSecondRelease: service.isSessionDeletionFenced(alias),
		}, {
			replay: undefined,
			fencedAfterFirstRelease: true,
			fencedAfterSecondRelease: false,
		});
	});

	test('deletion drains writes through storage aliases while unrelated sessions remain independent', async () => {
		const { service } = await createHarness();
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const writer = service.runExclusive(session, async () => {
			started.complete();
			await release.p;
		});
		await started.p;
		const fence = store.add(service.beginSessionDeletion(session.with({ scheme: 'ahp-session' })));
		let drained = false;
		const drain = fence.whenDrained.then(() => { drained = true; });
		let drainedBeforeRelease: boolean;
		try {
			await service.runExclusive(URI.parse('codex:/independent-session'), async () => { });
			drainedBeforeRelease = drained;
		} finally {
			release.complete();
			await Promise.all([writer, drain]);
		}

		assert.deepStrictEqual({ drainedBeforeRelease, drained }, { drainedBeforeRelease: false, drained: true });
	});

	test('rejects synchronization until overlapping deletion fences are released', async () => {
		const { local, service } = await createHarness();
		const firstFence = service.beginSessionDeletion(session);
		const secondFence = service.beginSessionDeletion(session);
		await Promise.all([firstFence.whenDrained, secondFence.whenDrained]);

		await assert.rejects(
			service.synchronize(session, { data: data('blocked'), legacyMetadata: { customTitle: 'blocked' } }),
			/Catalog synchronization rejected during session deletion/,
		);
		firstFence.dispose();
		const fencedAfterFirstRelease = service.isSessionDeletionFenced(session);
		await assert.rejects(
			service.synchronize(session, { data: data('still-blocked'), legacyMetadata: { customTitle: 'still-blocked' } }),
			/Catalog synchronization rejected during session deletion/,
		);
		secondFence.dispose();
		const result = await service.synchronize(session, { data: data('recreated'), legacyMetadata: { customTitle: 'recreated' } });

		assert.deepStrictEqual({
			fencedAfterFirstRelease,
			fencedAfterSecondRelease: service.isSessionDeletionFenced(session),
			result,
			writes: local.writes.map(write => write.title),
		}, {
			fencedAfterFirstRelease: true,
			fencedAfterSecondRelease: false,
			result: { status: 'acknowledged', sourceRevision: 0 },
			writes: ['recreated'],
		});
	});
});
