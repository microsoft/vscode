/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { ISessionCatalogSyncAcknowledgement, ISessionCatalogSyncPendingSnapshot, SessionCatalogSyncWriteResult } from '../../common/sessionDataService.js';
import { META_GIT_STATE } from '../../common/agentHostGitStateService.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION, AgentHostCatalogData } from '../../node/agentHostCatalogProjection.js';
import { AgentHostCatalogSyncService } from '../../node/agentHostCatalogSyncService.js';
import { AgentHostDatabase, AgentHostDatabaseSessionV2UpsertResult, IAgentHostDatabaseSessionV2Envelope } from '../../node/agentHostDatabase.js';
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
});
