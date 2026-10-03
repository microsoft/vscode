/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ChatOriginKind } from '../../common/state/protocol/state.js';
import { buildChatUri, buildDefaultChatUri } from '../../common/state/sessionState.js';
import { AGENT_HOST_CATALOG_CHILD_LIMIT } from '../../node/agentHostCatalogProjection.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostPeerChatStore, CHAT_ORIGIN_METADATA_KEY, CHAT_PROVIDER_DATA_METADATA_KEY, PEER_CHATS_METADATA_KEY } from '../../node/agentHostPeerChatStore.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

const session = URI.parse('agenthost:peer-store');
const first = URI.parse(buildChatUri(session, 'first'));
const second = URI.parse(buildChatUri(session, 'second'));
const third = URI.parse(buildChatUri(session, 'third'));
const origin = {
	kind: ChatOriginKind.SideChat,
	chat: buildDefaultChatUri(session),
	turnId: 'turn-1',
	selection: { text: 'selected', responsePartId: 'response-1' },
} as const;

class FailingLegacyMirrorDatabase extends TestSessionDatabase {
	private legacyMirrorFailures = 0;

	failLegacyMirrors(count: number): void {
		this.legacyMirrorFailures = count;
	}

	override async setMetadata(key: string, value: string): Promise<void> {
		if (key === PEER_CHATS_METADATA_KEY && this.legacyMirrorFailures > 0) {
			this.legacyMirrorFailures--;
			throw new Error('legacy mirror failed');
		}
		return super.setMetadata(key, value);
	}
}

class RecordingLogService extends NullLogService {
	readonly errors: (string | Error)[] = [];

	override error(message: string | Error): void {
		this.errors.push(message);
	}
}

class ConcurrentMetadataWriteDatabase extends FailingLegacyMirrorDatabase {
	private inFlightWrites = 0;
	maxInFlightWrites = 0;
	metadataValueWrites = 0;

	override async setMetadataValues(values: Readonly<Record<string, string>>): Promise<void> {
		this.metadataValueWrites++;
		this.inFlightWrites++;
		this.maxInFlightWrites = Math.max(this.maxInFlightWrites, this.inFlightWrites);
		await Promise.resolve();
		try {
			await super.setMetadataValues(values);
		} finally {
			this.inFlightWrites--;
		}
	}
}

suite('AgentHostPeerChatStore', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let orchestrator: AgentHostDatabase;

	setup(async () => {
		orchestrator = new AgentHostDatabase(':memory:');
		await orchestrator.registerRuntimeSession(session.toString(), {
			provider: 'copilot',
			startTime: 1,
			source: 'explicit',
		}, { checkTombstone: false });
	});

	teardown(async () => {
		sinon.restore();
		await orchestrator.close();
	});

	function createStore(database: TestSessionDatabase, logService = new NullLogService()): AgentHostPeerChatStore {
		return new AgentHostPeerChatStore(orchestrator, createSessionDataService(database), logService);
	}

	function createPerResourceStore(): {
		readonly store: AgentHostPeerChatStore;
		readonly databaseFor: (resource: URI) => ConcurrentMetadataWriteDatabase;
		readonly service: ReturnType<typeof createSessionDataService>;
		readonly databaseCount: () => number;
	} {
		const databases = new Map<string, ConcurrentMetadataWriteDatabase>();
		const databaseFor = (resource: URI) => {
			const key = (resource.authority ? resource : resource.with({ fragment: '' })).toString();
			let database = databases.get(key);
			if (!database) {
				database = new ConcurrentMetadataWriteDatabase();
				databases.set(key, database);
			}
			return database;
		};
		const service = {
			...createSessionDataService(),
			getSessionDataDir: (resource: URI) => URI.file(`/session-data/${resource.authority ? `${resource.authority}-` : ''}${resource.path.slice(1)}`),
			getSessionDataDirById: (id: string) => URI.file(`/session-data/${id}`),
			listSessionDataIds: async () => [...databases.keys()].map(key => {
				const resource = URI.parse(key);
				return `${resource.authority ? `${resource.authority}-` : ''}${resource.path.slice(1)}`;
			}),
			openDatabase: (resource: URI) => ({ object: databaseFor(resource), dispose: () => { } }),
			tryOpenDatabase: async (resource: URI) => {
				const key = (resource.authority ? resource : resource.with({ fragment: '' })).toString();
				const database = databases.get(key);
				return database ? { object: database, dispose: () => { } } : undefined;
			},
		};
		return {
			store: new AgentHostPeerChatStore(orchestrator, service, new NullLogService()),
			databaseFor,
			service,
			databaseCount: () => databases.size,
		};
	}

	test('recovers persisted membership erased by a fragment session sharing the parent database', async () => {
		const parent = URI.parse('copilotcli:/55253794-e725-4f06-9e2b-5506ac5411ff');
		const selectedId = '653a2e4f-5354-46ae-9a96-30c1b2cf4ce1';
		const otherId = 'c805f176-d9f7-4a24-a332-feac66843088';
		const selected = URI.parse(buildChatUri(parent, selectedId));
		const other = URI.parse(buildChatUri(parent, otherId));
		const phantom = parent.with({ fragment: selectedId });
		const { store, databaseFor } = createPerResourceStore();
		await orchestrator.registerRuntimeSession(parent.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await orchestrator.registerRuntimeSession(phantom.toString(), { provider: 'copilotcli', startTime: 1, source: 'restore' }, { checkTombstone: false });
		await databaseFor(selected).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, '{"sdkSessionId":"selected-sdk"}');
		await databaseFor(selected).setMetadata('customTitle', 'Selected Chat');
		await databaseFor(selected).createTurn('original-turn');
		await databaseFor(selected).setTurnEventId('original-turn', 'original-sdk-event');
		await databaseFor(other).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, '{"sdkSessionId":"other-sdk"}');
		await databaseFor(other).setMetadata(CHAT_ORIGIN_METADATA_KEY, JSON.stringify(origin));
		await databaseFor(parent).setMetadata(`customChatTitle:${other.toString()}`, 'Other Chat');
		await databaseFor(parent).setMetadata(`customChatTitleSource:${other.toString()}`, 'user');
		await store.replace(parent, [
			{ uri: selected.toString(), providerData: '{"sdkSessionId":"selected-sdk"}' },
			{ uri: other.toString(), providerData: '{"sdkSessionId":"other-sdk"}', origin },
		]);
		await store.replace(phantom, []);
		await store.reconcileLegacy(parent);
		const before = await store.tryRead(parent);

		await store.recoverChatSelectionCorruption(parent, [selectedId]);
		const firstRecovery = await store.tryRead(parent);
		const backup = await databaseFor(parent).getMetadata('agentHost.peerChatRecovery339409');
		await store.recoverChatSelectionCorruption(parent, [selectedId]);

		assert.deepStrictEqual({
			before,
			firstRecovery,
			repeatedRecovery: await store.tryRead(parent),
			legacy: await store.tryReadLegacy(parent),
			title: await databaseFor(selected).getMetadata('customTitle'),
			turnEvent: await databaseFor(selected).getTurnEventId('original-turn'),
			backupUnchanged: backup !== undefined && backup === await databaseFor(parent).getMetadata('agentHost.peerChatRecovery339409'),
		}, {
			before: [],
			firstRecovery: [
				{ uri: selected.toString(), providerData: '{"sdkSessionId":"selected-sdk"}' },
				{ uri: other.toString(), providerData: '{"sdkSessionId":"other-sdk"}', origin },
			],
			repeatedRecovery: [
				{ uri: selected.toString(), providerData: '{"sdkSessionId":"selected-sdk"}' },
				{ uri: other.toString(), providerData: '{"sdkSessionId":"other-sdk"}', origin },
			],
			legacy: [
				{ uri: selected.toString(), providerData: '{"sdkSessionId":"selected-sdk"}' },
				{ uri: other.toString(), providerData: '{"sdkSessionId":"other-sdk"}', origin },
			],
			title: 'Selected Chat',
			turnEvent: 'original-sdk-event',
			backupUnchanged: true,
		});
	});

	test('recovery requires the phantom-selected backing and never imports another owner or the default chat', async () => {
		const parent = URI.parse('copilotcli:/55253794-e725-4f06-9e2b-5506ac5411ff');
		const selectedId = '653a2e4f-5354-46ae-9a96-30c1b2cf4ce1';
		const otherId = 'c805f176-d9f7-4a24-a332-feac66843088';
		const foreign = URI.parse(buildChatUri(URI.parse('copilotcli:/another-parent'), selectedId));
		const missingBacking = URI.parse(buildChatUri(parent, selectedId));
		const other = URI.parse(buildChatUri(parent, otherId));
		const { store, databaseFor } = createPerResourceStore();
		await orchestrator.registerRuntimeSession(parent.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await store.replace(parent, []);
		await databaseFor(foreign).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'foreign-backing');
		await databaseFor(URI.parse(buildDefaultChatUri(parent))).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'default-backing');
		await databaseFor(other).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'other-backing');
		databaseFor(missingBacking);

		assert.deepStrictEqual({
			result: await store.recoverChatSelectionCorruption(parent, [selectedId]),
			membership: await store.tryRead(parent),
			backup: await databaseFor(parent).getMetadata('agentHost.peerChatRecovery339409'),
		}, { result: undefined, membership: [], backup: undefined });
	});

	test('recovery preserves current archived membership and excludes explicitly deleted peers with leftover storage', async () => {
		const parent = URI.parse('copilotcli:/55253794-e725-4f06-9e2b-5506ac5411ff');
		const selectedId = '653a2e4f-5354-46ae-9a96-30c1b2cf4ce1';
		const selected = URI.parse(buildChatUri(parent, selectedId));
		const deleted = URI.parse(buildChatUri(parent, 'c805f176-d9f7-4a24-a332-feac66843088'));
		const { store, databaseFor } = createPerResourceStore();
		await orchestrator.registerRuntimeSession(parent.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const current = [{ uri: selected.toString(), providerData: 'current-backing', archived: true }];
		await store.replace(parent, current);
		await databaseFor(selected).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'older-backing');
		await databaseFor(deleted).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'deleted-backing');
		await databaseFor(parent).setMetadata(`customChatTitle:${deleted.toString()}`, '');
		await databaseFor(parent).setMetadata(`customChatTitleSource:${deleted.toString()}`, '');

		assert.deepStrictEqual({
			recovered: (await store.recoverChatSelectionCorruption(parent, [selectedId]))?.entries,
			membership: await store.tryRead(parent),
			legacy: await store.tryReadLegacy(parent),
		}, { recovered: current, membership: current, legacy: current });
	});

	suite('recovery dataset safety', () => {
		const parent = URI.parse('copilotcli:/55253794-e725-4f06-9e2b-5506ac5411ff');
		const selectedId = '653a2e4f-5354-46ae-9a96-30c1b2cf4ce1';
		const extraId = 'c805f176-d9f7-4a24-a332-feac66843088';
		const selected = URI.parse(buildChatUri(parent, selectedId));
		const extra = URI.parse(buildChatUri(parent, extraId));

		async function createDataset() {
			const fixture = createPerResourceStore();
			await orchestrator.registerRuntimeSession(parent.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			await fixture.store.replace(parent, []);
			await fixture.databaseFor(selected).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'selected-backing');
			await fixture.databaseFor(parent).setMetadata(`customChatTitle:${selected.toString()}`, 'Selected');
			await fixture.databaseFor(parent).setMetadata(`customChatTitleSource:${selected.toString()}`, 'user');
			return fixture;
		}

		test('does not overwrite newer chat-local continuation metadata for existing members', async () => {
			const { store, databaseFor } = await createDataset();
			await store.replace(parent, [{ uri: selected.toString(), providerData: 'catalog-backing', archived: true }]);
			await databaseFor(selected).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'newer-local-backing');
			const writesBefore = databaseFor(selected).setMetadataCalls.length;

			await store.recoverChatSelectionCorruption(parent, [selectedId]);

			assert.deepStrictEqual({
				providerData: await databaseFor(selected).getMetadata(CHAT_PROVIDER_DATA_METADATA_KEY),
				additionalWrites: databaseFor(selected).setMetadataCalls.length - writesBefore,
				membership: await store.tryRead(parent),
			}, {
				providerData: 'newer-local-backing',
				additionalWrites: 0,
				membership: [{ uri: selected.toString(), providerData: 'catalog-backing', archived: true }],
			});
		});

		test('does not resurrect unstamped orphan storage alongside a verified selected chat', async () => {
			const { store, databaseFor } = await createDataset();
			await databaseFor(extra).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'orphan-backing');
			await databaseFor(extra).setMetadata('customTitle', 'Failed creation or abandoned backing');

			await store.recoverChatSelectionCorruption(parent, [selectedId]);

			assert.deepStrictEqual(await store.tryRead(parent), [{ uri: selected.toString(), providerData: 'selected-backing' }]);
		});

		test('does not recover a historical chat URI already owned by a different current catalogue', async () => {
			const { store, databaseFor } = await createDataset();
			const target = URI.parse('copilotcli:/destination');
			await orchestrator.registerRuntimeSession(target.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			await orchestrator.replaceSessionChatCatalog(target.toString(), [{ chat: extra.toString(), order: 0, providerData: 'moved-backing' }], undefined);
			await databaseFor(extra).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'moved-backing');
			await databaseFor(parent).setMetadata(`customChatTitle:${extra.toString()}`, 'Moved chat');
			await databaseFor(parent).setMetadata(`customChatTitleSource:${extra.toString()}`, 'user');
			const targetBefore = await orchestrator.getSessionChatCatalog(target.toString());

			await store.recoverChatSelectionCorruption(parent, [selectedId]);

			assert.deepStrictEqual({
				source: await store.tryRead(parent),
				target: await orchestrator.getSessionChatCatalog(target.toString()),
			}, { source: [{ uri: selected.toString(), providerData: 'selected-backing' }], target: targetBefore });
		});

		test('does not repeat a completed recovery after the user subsequently removes membership', async () => {
			const { store } = await createDataset();
			await store.recoverChatSelectionCorruption(parent, [selectedId]);
			await store.remove(parent, selected);

			await store.recoverChatSelectionCorruption(parent, [selectedId]);

			assert.deepStrictEqual(await store.tryRead(parent), []);
		});

		test('verifies a moved phantom for cleanup without reattaching its selected chat to the historical owner', async () => {
			const { store } = await createDataset();
			const target = URI.parse('copilotcli:/destination');
			await orchestrator.registerRuntimeSession(target.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			await orchestrator.replaceSessionChatCatalog(target.toString(), [{ chat: selected.toString(), order: 0, providerData: 'current-owner' }], undefined);
			const targetBefore = await orchestrator.getSessionChatCatalog(target.toString());

			assert.deepStrictEqual({
				result: await store.recoverChatSelectionCorruption(parent, [selectedId]),
				target: await orchestrator.getSessionChatCatalog(target.toString()),
			}, { result: { entries: [], verifiedPhantomChatIds: [selectedId] }, target: targetBefore });
		});

		test('verifies an explicitly deleted selection for phantom cleanup but does not restore its surviving backing', async () => {
			const { store, databaseFor } = await createDataset();
			await databaseFor(parent).setMetadata(`customChatTitle:${selected.toString()}`, '');
			await databaseFor(parent).setMetadata(`customChatTitleSource:${selected.toString()}`, '');
			const writesBefore = databaseFor(selected).setMetadataCalls.length;

			assert.deepStrictEqual({
				result: await store.recoverChatSelectionCorruption(parent, [selectedId]),
				additionalBackingWrites: databaseFor(selected).setMetadataCalls.length - writesBefore,
			}, { result: { entries: [], verifiedPhantomChatIds: [selectedId] }, additionalBackingWrites: 0 });
		});

		test('does not scavenge remembered but detached storage when both current catalogues are healthy', async () => {
			const { store, databaseFor } = await createDataset();
			await store.replace(parent, [{ uri: selected.toString(), providerData: 'selected-backing' }]);
			await databaseFor(extra).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'detached-backing');
			await databaseFor(parent).setMetadata(`customChatTitle:${extra.toString()}`, 'Detached chat');
			await databaseFor(parent).setMetadata(`customChatTitleSource:${extra.toString()}`, 'user');
			const before = await orchestrator.getSessionChatCatalog(parent.toString());
			const parentWrites = databaseFor(parent).setMetadataCalls.length;

			await store.recoverChatSelectionCorruption(parent, [selectedId]);

			assert.deepStrictEqual({
				catalog: await orchestrator.getSessionChatCatalog(parent.toString()),
				additionalWrites: databaseFor(parent).setMetadataCalls.length - parentWrites,
			}, { catalog: before, additionalWrites: 0 });
		});

		test('does not parse malformed detached backing metadata when the catalogue is healthy', async () => {
			const { store, databaseFor } = await createDataset();
			await store.replace(parent, [{ uri: selected.toString(), providerData: 'selected-backing' }]);
			await databaseFor(extra).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'detached-backing');
			await databaseFor(extra).setMetadata(CHAT_ORIGIN_METADATA_KEY, '{invalid-json');
			const before = await orchestrator.getSessionChatCatalog(parent.toString());

			await store.recoverChatSelectionCorruption(parent, [selectedId]);

			assert.deepStrictEqual(await orchestrator.getSessionChatCatalog(parent.toString()), before);
		});

		test('cannot resurrect a tombstoned parent even when its backing databases survive', async () => {
			const { store, databaseFor } = await createDataset();
			await orchestrator.tombstoneAndUnregisterSession(parent.toString());
			const writesBefore = databaseFor(parent).setMetadataCalls.length;

			assert.deepStrictEqual({
				result: await store.recoverChatSelectionCorruption(parent, [selectedId]),
				catalog: await orchestrator.getSessionChatCatalog(parent.toString()),
				additionalWrites: databaseFor(parent).setMetadataCalls.length - writesBefore,
			}, { result: undefined, catalog: undefined, additionalWrites: 0 });
		});

		for (const resource of [
			parent.with({ scheme: 'codex' }),
			parent.with({ authority: 'remote-host' }),
			parent.with({ query: 'revision=1' }),
			parent.with({ fragment: selectedId }),
		]) {
			test(`does not infer recovery for non-legacy identity ${resource.toString()}`, async () => {
				const { store, databaseFor } = await createDataset();
				const writesBefore = databaseFor(parent).setMetadataCalls.length;

				assert.deepStrictEqual({
					result: await store.recoverChatSelectionCorruption(resource, [selectedId]),
					membership: await store.tryRead(parent),
					additionalWrites: databaseFor(parent).setMetadataCalls.length - writesBefore,
				}, { result: undefined, membership: [], additionalWrites: 0 });
			});
		}

		test('malformed backing metadata aborts before changing membership or recording a recovery', async () => {
			const { store, databaseFor } = await createDataset();
			await databaseFor(selected).setMetadata(CHAT_ORIGIN_METADATA_KEY, '{invalid-json');
			await assert.rejects(store.recoverChatSelectionCorruption(parent, [selectedId]), SyntaxError);
			assert.deepStrictEqual({
				membership: await store.tryRead(parent),
				backup: await databaseFor(parent).getMetadata('agentHost.peerChatRecovery339409'),
			}, { membership: [], backup: undefined });
		});

		test('merges a partially erased catalogue without changing existing archive flags or backing metadata', async () => {
			const { store, databaseFor } = await createDataset();
			await store.replace(parent, [{ uri: selected.toString(), providerData: 'current-backing', archived: true }]);
			await databaseFor(parent).setMetadata(PEER_CHATS_METADATA_KEY, '[]');
			await databaseFor(selected).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'newer-local-backing');
			await databaseFor(extra).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'extra-backing');
			await databaseFor(parent).setMetadata(`customChatTitle:${extra.toString()}`, 'Extra');
			await databaseFor(parent).setMetadata(`customChatTitleSource:${extra.toString()}`, 'agent');
			const writesBefore = databaseFor(selected).setMetadataCalls.length;

			await store.recoverChatSelectionCorruption(parent, [selectedId]);

			assert.deepStrictEqual({
				entries: await store.tryRead(parent),
				providerData: await databaseFor(selected).getMetadata(CHAT_PROVIDER_DATA_METADATA_KEY),
				additionalWrites: databaseFor(selected).setMetadataCalls.length - writesBefore,
			}, {
				entries: [
					{ uri: selected.toString(), providerData: 'current-backing', archived: true },
					{ uri: extra.toString(), providerData: 'extra-backing' },
				],
				providerData: 'newer-local-backing',
				additionalWrites: 0,
			});
		});

		test('retries an interrupted mirror using frozen candidates without importing later detached storage', async () => {
			const { store, databaseFor } = await createDataset();
			databaseFor(parent).failLegacyMirrors(1);
			await assert.rejects(store.recoverChatSelectionCorruption(parent, [selectedId]), /legacy mirror failed/);
			const pending = await databaseFor(parent).getMetadata('agentHost.peerChatRecovery339409');
			await databaseFor(extra).setMetadata(CHAT_PROVIDER_DATA_METADATA_KEY, 'later-backing');
			await databaseFor(parent).setMetadata(`customChatTitle:${extra.toString()}`, 'Later');
			await databaseFor(parent).setMetadata(`customChatTitleSource:${extra.toString()}`, 'user');

			await store.recoverChatSelectionCorruption(parent, [selectedId]);

			assert.deepStrictEqual({
				pending: pending !== undefined && JSON.parse(pending).completed !== true,
				entries: await store.tryRead(parent),
				completed: JSON.parse((await databaseFor(parent).getMetadata('agentHost.peerChatRecovery339409'))!).completed,
			}, { pending: true, entries: [{ uri: selected.toString(), providerData: 'selected-backing' }], completed: true });
		});

		test('does not undo a removal made after an interrupted recovery', async () => {
			const { store, databaseFor } = await createDataset();
			databaseFor(parent).failLegacyMirrors(1);
			await assert.rejects(store.recoverChatSelectionCorruption(parent, [selectedId]), /legacy mirror failed/);
			await store.remove(parent, selected);

			await store.recoverChatSelectionCorruption(parent, [selectedId]);

			assert.deepStrictEqual(await store.tryRead(parent), []);
		});

		test('preserves concurrent membership edits instead of rebasing missing candidates after a CAS conflict', async () => {
			const { store } = await createDataset();
			sinon.stub(orchestrator, 'recoverSessionChatCatalog').callsFake(async (session, _entries, revision) => {
				await orchestrator.replaceSessionChatCatalog(session, [], revision);
				return { status: 'conflict' };
			});

			await store.recoverChatSelectionCorruption(parent, [selectedId]);

			assert.deepStrictEqual(await store.tryRead(parent), []);
		});

		test('malformed recovery records fail closed without any further writes', async () => {
			const { store, databaseFor } = await createDataset();
			await databaseFor(parent).setMetadata('agentHost.peerChatRecovery339409', '{"recovered":"invalid"}');
			const writesBefore = databaseFor(parent).setMetadataCalls.length;
			await assert.rejects(store.recoverChatSelectionCorruption(parent, [selectedId]), /Invalid peer-chat recovery backup/);

			assert.deepStrictEqual({
				entries: await store.tryRead(parent),
				additionalWrites: databaseFor(parent).setMetadataCalls.length - writesBefore,
			}, { entries: [], additionalWrites: 0 });
		});

		test('does not create missing backing databases listed by a stale directory enumeration', async () => {
			const { databaseFor, databaseCount, service } = await createDataset();
			const missingId = `${extraId}-${extra.path.slice(1)}`;
			const missingStore = new AgentHostPeerChatStore(orchestrator, {
				...service,
				listSessionDataIds: async () => [missingId],
			}, new NullLogService());
			const databasesBefore = databaseCount();

			assert.deepStrictEqual({
				result: await missingStore.recoverChatSelectionCorruption(parent, [extraId]),
				databasesCreated: databaseCount() - databasesBefore,
				backup: await databaseFor(parent).getMetadata('agentHost.peerChatRecovery339409'),
			}, { result: undefined, databasesCreated: 0, backup: undefined });
		});

		for (const count of [AGENT_HOST_CATALOG_CHILD_LIMIT - 2, AGENT_HOST_CATALOG_CHILD_LIMIT - 1]) {
			test(`respects the catalogue size boundary with ${count} existing peers`, async () => {
				const { store, databaseFor } = await createDataset();
				await store.replace(parent, Array.from({ length: count }, () => ({ uri: buildChatUri(parent, generateUuid()), providerData: 'existing' })));
				await databaseFor(parent).setMetadata(PEER_CHATS_METADATA_KEY, '[]');
				const before = await orchestrator.getSessionChatCatalog(parent.toString());
				if (count === AGENT_HOST_CATALOG_CHILD_LIMIT - 1) {
					await assert.rejects(store.recoverChatSelectionCorruption(parent, [selectedId]), /exceeds the catalog limit/);
					assert.deepStrictEqual({
						catalog: await orchestrator.getSessionChatCatalog(parent.toString()),
						backup: await databaseFor(parent).getMetadata('agentHost.peerChatRecovery339409'),
					}, { catalog: before, backup: undefined });
				} else {
					await store.recoverChatSelectionCorruption(parent, [selectedId]);
					assert.strictEqual((await store.tryRead(parent))?.length, AGENT_HOST_CATALOG_CHILD_LIMIT - 1);
				}
			});
		}
	});

	test('migration-only membership does not create compatibility databases and mirrors after adoption', async () => {
		const database = new TestSessionDatabase();
		let opens = 0;
		const unavailable = {
			...createSessionDataService(database),
			openDatabase: () => {
				opens++;
				throw new Error('must not create a database');
			},
			tryOpenDatabase: async () => undefined,
		};
		const migrationStore = new AgentHostPeerChatStore(orchestrator, unavailable, new NullLogService());

		await migrationStore.replaceForMigration(session, [{ uri: first.toString(), providerData: 'provider-data', origin, inheritedTurnId: 'inherited' }]);
		const catalog = await orchestrator.getSessionChatCatalog(session.toString());
		const read = await migrationStore.tryRead(session);
		await migrationStore.reconcileLegacy(session);

		const adoptedStore = createStore(database);
		await adoptedStore.reconcileLegacy(session);

		assert.deepStrictEqual({
			opens,
			read,
			compatibilityAcknowledged: catalog?.legacyMirroredRevision === catalog?.revision,
			recordedBase: catalog?.legacyMirroredPayload,
			legacy: await adoptedStore.tryReadLegacy(session),
		}, {
			opens: 0,
			read: [{ uri: first.toString(), providerData: 'provider-data', origin, inheritedTurnId: 'inherited' }],
			compatibilityAcknowledged: false,
			recordedBase: JSON.stringify([{ uri: first.toString(), providerData: 'provider-data', origin, inheritedTurnId: 'inherited' }]),
			legacy: [{ uri: first.toString(), providerData: 'provider-data', origin, inheritedTurnId: 'inherited' }],
		});
	});

	test('initialization returns current membership instead of stale migration entries', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		await store.upsert(session, first, 'current-backing', origin);

		const initialized = await store.initialize(session, [{ uri: second.toString(), providerData: 'stale-backing' }]);

		assert.deepStrictEqual({
			initialized,
			legacy: await store.tryReadLegacy(session),
		}, {
			initialized: [{ uri: first.toString(), providerData: 'current-backing', origin }],
			legacy: [{ uri: first.toString(), providerData: 'current-backing', origin }],
		});
	});

	test('initialization does not resurrect a peer deleted during legacy enumeration', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		await store.upsert(session, first, 'backing');
		await store.remove(session, first);

		const initialized = await store.initialize(session, [{ uri: first.toString(), providerData: 'backing' }]);

		assert.deepStrictEqual({
			initialized,
			central: await store.tryRead(session),
			legacy: await store.tryReadLegacy(session),
		}, {
			initialized: [],
			central: [],
			legacy: [],
		});
	});

	test('merges an older-build delta against migration-only membership before mirroring', async () => {
		const unavailable = {
			...createSessionDataService(),
			openDatabase: () => {
				throw new Error('must not create a database');
			},
			tryOpenDatabase: async () => undefined,
		};
		const migrationStore = new AgentHostPeerChatStore(orchestrator, unavailable, new NullLogService());
		await migrationStore.replaceForMigration(session, [{ uri: first.toString() }]);
		const imported = await orchestrator.getSessionChatCatalog(session.toString());
		assert.ok(imported);
		const updated = await orchestrator.replaceSessionChatCatalog(session.toString(), [
			{ chat: first.toString(), order: 0 },
			{ chat: second.toString(), order: 1 },
		], imported.revision);
		assert.strictEqual(updated.status, 'applied');

		const database = new TestSessionDatabase();
		await database.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify([{ uri: third.toString() }]));
		const store = createStore(database);

		const reconciled = await store.reconcileLegacy(session);
		const catalog = await orchestrator.getSessionChatCatalog(session.toString());

		assert.deepStrictEqual({
			reconciled,
			legacy: await store.tryReadLegacy(session),
			catalog: catalog && {
				entries: catalog.chats.map(chat => chat.chat),
				compatibilityAcknowledged: catalog.legacyMirroredRevision === catalog.revision,
			},
		}, {
			reconciled: [{ uri: third.toString() }, { uri: second.toString() }],
			legacy: [{ uri: third.toString() }, { uri: second.toString() }],
			catalog: {
				entries: [third.toString(), second.toString()],
				compatibilityAcknowledged: true,
			},
		});
	});

	test('merges an older-build addition made after migration-only authoritative empty', async () => {
		const unavailable = {
			...createSessionDataService(),
			openDatabase: () => {
				throw new Error('must not create a database');
			},
			tryOpenDatabase: async () => undefined,
		};
		const migrationStore = new AgentHostPeerChatStore(orchestrator, unavailable, new NullLogService());
		await migrationStore.replaceForMigration(session, []);
		const database = new TestSessionDatabase();
		await database.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify([{ uri: first.toString() }]));
		const store = createStore(database);

		const reconciled = await store.reconcileLegacy(session);

		assert.deepStrictEqual({
			reconciled,
			central: await store.tryRead(session),
			legacy: await store.tryReadLegacy(session),
		}, {
			reconciled: [{ uri: first.toString() }],
			central: [{ uri: first.toString() }],
			legacy: [{ uri: first.toString() }],
		});
	});

	test('does not resurrect a stale pre-deletion mirror during unmirrored repair', async () => {
		const database = new FailingLegacyMirrorDatabase();
		const store = createStore(database);
		await store.replace(session, [{ uri: first.toString() }]);
		database.failLegacyMirrors(1);
		await store.remove(session, first);

		const reconciled = await store.reconcileLegacy(session);

		assert.deepStrictEqual({
			reconciled,
			central: await store.tryRead(session),
			legacy: await store.tryReadLegacy(session),
		}, {
			reconciled: [],
			central: [],
			legacy: [],
		});
	});

	test('migration import does not replace a catalog created after its initial read', async () => {
		class RacingDatabase extends AgentHostDatabase {
			private raced = false;

			override async getSessionChatCatalog(sessionKey: string) {
				if (!this.raced) {
					this.raced = true;
					await super.replaceSessionChatCatalog(sessionKey, [{ chat: second.toString(), order: 0, providerData: 'concurrent' }], undefined);
					return undefined;
				}
				return super.getSessionChatCatalog(sessionKey);
			}
		}
		await orchestrator.close();
		orchestrator = new RacingDatabase(':memory:');
		await orchestrator.registerRuntimeSession(session.toString(), {
			provider: 'copilot',
			startTime: 1,
			source: 'explicit',
		}, { checkTombstone: false });
		const store = createStore(new TestSessionDatabase());

		await store.replaceForMigration(session, [{ uri: first.toString(), providerData: 'migration' }]);

		assert.deepStrictEqual(await store.tryRead(session, false), [{ uri: second.toString(), providerData: 'concurrent' }]);
	});

	test('heals malformed metadata on the next write', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		await database.setMetadata(PEER_CHATS_METADATA_KEY, '{"not":"an array"}');

		const before = await store.tryReadLegacy(session);
		await store.upsert(session, first, 'provider-data', { kind: ChatOriginKind.User });

		assert.deepStrictEqual({
			before,
			entries: await store.tryRead(session),
			raw: await database.getMetadata(PEER_CHATS_METADATA_KEY),
		}, {
			before: undefined,
			entries: [{ uri: first.toString(), providerData: 'provider-data', origin: { kind: ChatOriginKind.User } }],
			raw: JSON.stringify([{ uri: first.toString(), providerData: 'provider-data', origin: { kind: ChatOriginKind.User } }]),
		});
	});

	test('filters duplicate, foreign, default, and invalid entries while normalizing origins', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		const foreignSession = URI.parse('agenthost:foreign');
		await database.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify([
			{ uri: first.toString(), providerData: 'first', origin },
			{ uri: first.toString(), providerData: 'duplicate' },
			{ uri: buildChatUri(foreignSession, 'foreign') },
			{ uri: buildDefaultChatUri(session) },
			{ uri: second.toString(), providerData: 42 },
			{
				uri: third.toString(),
				origin: {
					kind: ChatOriginKind.SideChat,
					chat: buildDefaultChatUri(session),
					turnId: 'turn-2',
					selection: { text: 'kept', responsePartId: false },
				},
			},
		]));

		assert.deepStrictEqual(await store.tryReadLegacy(session), [
			{ uri: first.toString(), providerData: 'first', origin },
			{
				uri: third.toString(),
				origin: {
					kind: ChatOriginKind.SideChat,
					chat: buildDefaultChatUri(session),
					turnId: 'turn-2',
				},
			},
		]);
	});

	test('serializes concurrent add, remove, and update operations', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		await store.replace(session, [
			{ uri: first.toString(), providerData: 'old', origin },
			{ uri: second.toString(), providerData: 'remove' },
		]);

		await Promise.all([
			store.upsert(session, third, 'third', { kind: ChatOriginKind.User }),
			store.remove(session, second),
			store.upsert(session, first, 'refreshed'),
		]);

		assert.deepStrictEqual(await store.tryRead(session), [
			{ uri: third.toString(), providerData: 'third', origin: { kind: ChatOriginKind.User } },
			{ uri: first.toString(), providerData: 'refreshed', origin },
		]);
	});

	test('does not recreate membership or compatibility data after tombstoning', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		await orchestrator.tombstoneAndUnregisterSession(session.toString());

		await store.upsert(session, first, 'late-provider-data');

		assert.deepStrictEqual({
			central: await store.tryRead(session),
			legacy: await database.getMetadata(PEER_CHATS_METADATA_KEY),
			chatProviderData: await database.getMetadata(CHAT_PROVIDER_DATA_METADATA_KEY),
		}, {
			central: undefined,
			legacy: undefined,
			chatProviderData: undefined,
		});
	});

	test('keeps overlapping deletion fences active until every disposer exits', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		await store.beginSessionDeletion(session);
		await store.beginSessionDeletion(session);
		store.endSessionDeletion(session);

		await store.upsert(session, first, 'provider-data');

		assert.strictEqual(await store.tryRead(session), undefined);
		store.endSessionDeletion(session);
	});

	test('does not create membership for a missing registered session', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		await orchestrator.unregisterRuntimeSession(session.toString());

		await store.upsert(session, first, 'provider-data');

		assert.deepStrictEqual({
			central: await store.tryRead(session),
			legacy: await store.tryReadLegacy(session),
		}, {
			central: undefined,
			legacy: undefined,
		});
	});

	test('restores authoritative side-chat selection from chat-local metadata', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		const selectionText = 'selected text '.repeat(400);
		await database.setMetadata(CHAT_ORIGIN_METADATA_KEY, JSON.stringify({
			kind: ChatOriginKind.SideChat,
			chat: buildDefaultChatUri(session),
			turnId: 'turn-1',
			selection: { text: selectionText, responsePartId: 'response-1' },
		}));

		const restored = await store.readLocalChatMetadata([{
			uri: first.toString(),
			origin: { kind: ChatOriginKind.SideChat, chat: buildDefaultChatUri(session), turnId: 'turn-1' },
		}]);

		assert.strictEqual(restored[0].origin?.kind === ChatOriginKind.SideChat && restored[0].origin.selection?.text, selectionText);
	});

	test('retries concurrent mutations from separate store instances', async () => {
		const database = new TestSessionDatabase();
		const firstStore = createStore(database);
		const secondStore = createStore(database);
		await firstStore.replace(session, []);

		await Promise.all([
			firstStore.upsert(session, first, 'first'),
			secondStore.upsert(session, second, 'second'),
		]);

		assert.deepStrictEqual(
			(await firstStore.tryRead(session))?.slice().sort((a, b) => a.uri.localeCompare(b.uri)),
			[
				{ uri: first.toString(), providerData: 'first' },
				{ uri: second.toString(), providerData: 'second' },
			].sort((a, b) => a.uri.localeCompare(b.uri)),
		);
	});

	test('refreshes provider data without dropping persisted origin, inherited turn, or working directories', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		await store.upsert(session, first, 'old', origin, 'inherited-turn', ['file:///workspace/first']);

		await store.upsert(session, first, 'refreshed');

		assert.deepStrictEqual(await store.tryRead(session), [
			{ uri: first.toString(), providerData: 'refreshed', origin, inheritedTurnId: 'inherited-turn', workingDirectories: ['file:///workspace/first'] },
		]);
	});

	test('updates working directories without dropping provider data', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		await store.upsert(session, first, 'backing', origin, 'inherited-turn', ['file:///workspace/first']);
		await store.setArchived(session, first, true);

		await store.updateWorkingDirectories(session, first, ['file:///workspace/second']);

		assert.deepStrictEqual(await store.tryRead(session), [
			{ uri: first.toString(), archived: true, providerData: 'backing', origin, inheritedTurnId: 'inherited-turn', workingDirectories: ['file:///workspace/second'] },
		]);
	});

	test('persists archived state across updates and restores', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		await store.upsert(session, first, 'old', origin, 'inherited-turn');
		await store.setArchived(session, first, true);
		await store.upsert(session, first, 'refreshed');
		const archived = await store.tryRead(session);

		await store.setArchived(session, first, false);
		const restored = await store.tryRead(session);

		assert.deepStrictEqual({ archived, restored }, {
			archived: [{ uri: first.toString(), archived: true, providerData: 'refreshed', origin, inheritedTurnId: 'inherited-turn' }],
			restored: [{ uri: first.toString(), providerData: 'refreshed', origin, inheritedTurnId: 'inherited-turn' }],
		});
	});

	test('persists and reads the explicit empty sentinel', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);

		await store.replace(session, []);

		assert.deepStrictEqual({
			entries: await store.tryRead(session),
			raw: await database.getMetadata(PEER_CHATS_METADATA_KEY),
		}, {
			entries: [],
			raw: '[]',
		});
	});

	test('bounds concurrent compatibility chat-metadata writes', async () => {
		const database = new ConcurrentMetadataWriteDatabase();
		const store = createStore(database);
		const entries = Array.from({ length: 12 }, (_, index) => ({
			uri: buildChatUri(session, `concurrent-${index}`),
		}));

		await store.replace(session, entries);

		assert.deepStrictEqual({
			writes: database.metadataValueWrites,
			maxInFlight: database.maxInFlightWrites,
		}, {
			writes: entries.length,
			maxInFlight: 4,
		});
	});

	test('writes chat-local compatibility metadata only for changed entries during mutations', async () => {
		const { store, databaseFor } = createPerResourceStore();
		const added = URI.parse(buildChatUri(session, 'added'));
		await store.replace(session, [
			{ uri: first.toString(), providerData: 'first' },
			{ uri: second.toString(), providerData: 'second' },
			{ uri: third.toString(), providerData: 'third' },
		]);
		databaseFor(first).metadataValueWrites = 0;
		databaseFor(second).metadataValueWrites = 0;
		databaseFor(third).metadataValueWrites = 0;

		await store.upsert(session, first, 'first');
		const reorderedWrites = databaseFor(first).metadataValueWrites + databaseFor(second).metadataValueWrites + databaseFor(third).metadataValueWrites;
		await store.upsert(session, second, 'updated');
		const updatedWrites = databaseFor(first).metadataValueWrites + databaseFor(second).metadataValueWrites + databaseFor(third).metadataValueWrites - reorderedWrites;
		await store.remove(session, third);
		const removedWrites = databaseFor(first).metadataValueWrites + databaseFor(second).metadataValueWrites + databaseFor(third).metadataValueWrites - reorderedWrites - updatedWrites;
		await store.upsert(session, added, 'added');
		const addedWrites = databaseFor(added).metadataValueWrites;
		const central = await store.tryRead(session);

		assert.deepStrictEqual({
			reorderedWrites,
			updatedWrites,
			removedWrites,
			addedWrites,
			local: central && await store.readLocalChatMetadata(central),
			legacy: await store.tryReadLegacy(session),
		}, {
			reorderedWrites: 0,
			updatedWrites: 1,
			removedWrites: 0,
			addedWrites: 1,
			local: [
				{ uri: first.toString(), providerData: 'first' },
				{ uri: second.toString(), providerData: 'updated' },
				{ uri: added.toString(), providerData: 'added' },
			],
			legacy: [
				{ uri: first.toString(), providerData: 'first' },
				{ uri: second.toString(), providerData: 'updated' },
				{ uri: added.toString(), providerData: 'added' },
			],
		});
	});

	test('fully publishes legacy metadata imported during an interactive mutation', async () => {
		const { store, databaseFor } = createPerResourceStore();
		await store.replace(session, [{ uri: first.toString(), providerData: 'current' }]);
		await databaseFor(session).setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify([
			{ uri: first.toString(), providerData: 'legacy-update' },
		]));

		await store.upsert(session, second, 'added');
		const central = await store.tryRead(session);
		const local = central && await store.readLocalChatMetadata(central);
		const reconciled = await store.reconcileLegacy(session);

		assert.deepStrictEqual({
			central,
			local,
			reconciled,
		}, {
			central: [
				{ uri: first.toString(), providerData: 'legacy-update' },
				{ uri: second.toString(), providerData: 'added' },
			],
			local: [
				{ uri: first.toString(), providerData: 'legacy-update' },
				{ uri: second.toString(), providerData: 'added' },
			],
			reconciled: [
				{ uri: first.toString(), providerData: 'legacy-update' },
				{ uri: second.toString(), providerData: 'added' },
			],
		});
	});

	test('fully publishes when the recorded mirror does not match central authority', async () => {
		const { store, databaseFor } = createPerResourceStore();
		await store.replace(session, [{ uri: first.toString(), providerData: 'initial' }]);
		const initial = await orchestrator.getSessionChatCatalog(session.toString());
		assert.ok(initial);
		const updated = await orchestrator.replaceSessionChatCatalog(session.toString(), [
			{ chat: first.toString(), order: 0, providerData: 'central-update' },
		], initial.revision);
		assert.strictEqual(updated.status, 'applied');
		const stalePayload = JSON.stringify([{ uri: first.toString(), providerData: 'initial' }]);
		await databaseFor(session).setMetadata(PEER_CHATS_METADATA_KEY, stalePayload);
		assert.strictEqual(await orchestrator.markSessionChatCatalogLegacyMirrored(session.toString(), updated.revision, stalePayload), true);

		await store.upsert(session, second, 'added');
		const central = await store.tryRead(session);

		assert.deepStrictEqual(central && await store.readLocalChatMetadata(central), [
			{ uri: first.toString(), providerData: 'central-update' },
			{ uri: second.toString(), providerData: 'added' },
		]);
	});

	test('advances the merge base before retrying a failed compatibility mirror', async () => {
		const database = new FailingLegacyMirrorDatabase();
		const store = createStore(database);
		await store.replace(session, [
			{ uri: first.toString() },
			{ uri: second.toString() },
		]);
		await database.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify([{ uri: second.toString() }]));
		database.failLegacyMirrors(1);
		await store.reconcileLegacy(session);
		const merged = await orchestrator.getSessionChatCatalog(session.toString());
		assert.ok(merged);
		const concurrent = await orchestrator.replaceSessionChatCatalog(session.toString(), [
			{ chat: second.toString(), order: 0 },
			{ chat: first.toString(), order: 1 },
		], merged.revision);
		assert.strictEqual(concurrent.status, 'applied');
		database.failLegacyMirrors(1);

		await store.reconcileLegacy(session);

		assert.deepStrictEqual(await store.tryRead(session, false), [
			{ uri: second.toString() },
			{ uri: first.toString() },
		]);
	});

	test('rejects oversized imported legacy membership without changing central authority', async () => {
		const database = new ConcurrentMetadataWriteDatabase();
		const store = createStore(database);
		await store.replace(session, [{ uri: first.toString(), providerData: 'central' }]);
		database.metadataValueWrites = 0;
		const entries = Array.from({ length: AGENT_HOST_CATALOG_CHILD_LIMIT + 2 }, (_, index) => ({
			uri: buildChatUri(session, `legacy-${index}`),
			providerData: `${index}`,
		}));
		await database.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify(entries));

		const reconciled = await store.reconcileLegacy(session);
		const central = await store.tryRead(session, false);

		assert.deepStrictEqual({
			reconciled,
			central,
			chatMetadataWrites: database.metadataValueWrites,
		}, {
			reconciled: [{ uri: first.toString(), providerData: 'central' }],
			central: [{ uri: first.toString(), providerData: 'central' }],
			chatMetadataWrites: 1,
		});
	});

	test('imports at most one fewer peer than the catalog child limit', async () => {
		const database = new ConcurrentMetadataWriteDatabase();
		const store = createStore(database);
		const entries = Array.from({ length: AGENT_HOST_CATALOG_CHILD_LIMIT - 1 }, (_, index) => ({
			uri: buildChatUri(session, `legacy-${index}`),
		}));
		await database.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify(entries));

		const reconciled = await store.reconcileLegacy(session);

		assert.deepStrictEqual({
			reconciledLength: reconciled?.length,
			compatibilityWrites: database.metadataValueWrites,
			maxInFlightWrites: database.maxInFlightWrites,
		}, {
			reconciledLength: AGENT_HOST_CATALOG_CHILD_LIMIT - 1,
			compatibilityWrites: AGENT_HOST_CATALOG_CHILD_LIMIT - 1,
			maxInFlightWrites: 4,
		});
	});

	test('does not truncate authoritative current membership writes', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		const entries = Array.from({ length: AGENT_HOST_CATALOG_CHILD_LIMIT + 1 }, (_, index) => ({
			uri: buildChatUri(session, `current-${index}`),
		}));

		await store.replace(session, entries);
		await store.reconcileLegacy(session);
		const additional = { uri: buildChatUri(session, 'current-additional') };
		await store.upsert(session, URI.parse(additional.uri), undefined);
		const central = await store.tryRead(session, false);

		assert.deepStrictEqual({
			length: central?.length,
			last: central?.at(-1),
		}, {
			length: entries.length + 1,
			last: additional,
		});
	});

	test('republishes central membership when the acknowledged legacy mirror is missing or malformed', async () => {
		const initialDatabase = new TestSessionDatabase();
		const initialStore = createStore(initialDatabase);
		await initialStore.replace(session, [{ uri: first.toString(), providerData: 'central' }]);

		const missingDatabase = new TestSessionDatabase();
		const missingStore = createStore(missingDatabase);
		const missingResult = await missingStore.reconcileLegacy(session);
		const missingMirror = await missingDatabase.getMetadata(PEER_CHATS_METADATA_KEY);

		await missingDatabase.setMetadata(PEER_CHATS_METADATA_KEY, '{"not":"an array"}');
		const malformedResult = await missingStore.reconcileLegacy(session);

		assert.deepStrictEqual({
			missingResult,
			missingMirror,
			malformedResult,
			repairedMirror: await missingDatabase.getMetadata(PEER_CHATS_METADATA_KEY),
		}, {
			missingResult: [{ uri: first.toString(), providerData: 'central' }],
			missingMirror: JSON.stringify([{ uri: first.toString(), providerData: 'central' }]),
			malformedResult: [{ uri: first.toString(), providerData: 'central' }],
			repairedMirror: JSON.stringify([{ uri: first.toString(), providerData: 'central' }]),
		});
	});

	test('returns central membership when republishing a missing legacy mirror fails', async () => {
		const initialDatabase = new TestSessionDatabase();
		const initialStore = createStore(initialDatabase);
		await initialStore.replace(session, [{ uri: first.toString(), providerData: 'central' }]);

		const database = new FailingLegacyMirrorDatabase();
		database.failLegacyMirrors(1);
		const logService = new RecordingLogService();
		const store = createStore(database, logService);

		assert.deepStrictEqual({
			reconciled: await store.reconcileLegacy(session),
			legacy: await store.tryReadLegacy(session),
			errors: logService.errors.map(error => error instanceof Error ? error.message : error),
		}, {
			reconciled: [{ uri: first.toString(), providerData: 'central' }],
			legacy: undefined,
			errors: ['legacy mirror failed'],
		});
	});

	test('imports membership changed by an older build into central authority', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		await database.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify([
			{ uri: first.toString(), providerData: 'first' },
		]));

		const firstImport = await store.reconcileLegacy(session);
		await database.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify([
			{ uri: second.toString(), providerData: 'second' },
		]));
		const secondImport = await store.reconcileLegacy(session);

		assert.deepStrictEqual({
			firstImport,
			secondImport,
			central: await store.tryRead(session),
		}, {
			firstImport: [{ uri: first.toString(), providerData: 'first' }],
			secondImport: [{ uri: second.toString(), providerData: 'second' }],
			central: [{ uri: second.toString(), providerData: 'second' }],
		});
	});

	test('merges older-build changes made after an interrupted compatibility mirror', async () => {
		const database = new FailingLegacyMirrorDatabase();
		const store = createStore(database);
		await store.replace(session, [{ uri: first.toString() }]);

		database.failLegacyMirrors(1);
		await store.upsert(session, second, undefined);
		await database.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify([
			{ uri: third.toString() },
		]));

		const beforeRepair = await store.tryRead(session);
		const reconciled = await store.reconcileLegacy(session);

		assert.deepStrictEqual({
			beforeRepair,
			reconciled,
			central: await store.tryRead(session),
			legacy: await store.tryReadLegacy(session),
		}, {
			beforeRepair: [
				{ uri: first.toString() },
				{ uri: second.toString() },
			],
			reconciled: [
				{ uri: third.toString() },
				{ uri: second.toString() },
			],
			central: [
				{ uri: third.toString() },
				{ uri: second.toString() },
			],
			legacy: [
				{ uri: third.toString() },
				{ uri: second.toString() },
			],
		});
	});

	test('preserves older-build changes when a new write follows an interrupted mirror', async () => {
		const database = new FailingLegacyMirrorDatabase();
		const store = createStore(database);
		await store.replace(session, [{ uri: first.toString() }]);
		database.failLegacyMirrors(1);
		await store.upsert(session, second, undefined);
		await database.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify([
			{ uri: third.toString() },
		]));
		database.failLegacyMirrors(1);

		await store.remove(session, first);

		assert.deepStrictEqual({
			central: await store.tryRead(session),
			legacy: await store.tryReadLegacy(session),
		}, {
			central: [
				{ uri: third.toString() },
				{ uri: second.toString() },
			],
			legacy: [
				{ uri: third.toString() },
				{ uri: second.toString() },
			],
		});
	});
});
