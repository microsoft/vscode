/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ChatInteractivity, ChatOriginKind } from '../../common/state/protocol/state.js';
import { AH_META_IS_READ_DB_KEY, buildChatUri, buildDefaultChatUri } from '../../common/state/sessionState.js';
import { AGENT_HOST_CATALOG_CHILD_LIMIT, AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT } from '../../node/agentHostCatalogProjection.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostPeerChatStore, CHAT_ORIGIN_METADATA_KEY, CHAT_PROVIDER_DATA_METADATA_KEY, CHAT_WORKING_DIRECTORIES_METADATA_KEY, PEER_CHATS_METADATA_KEY } from '../../node/agentHostPeerChatStore.js';
import { getChatChangesSummaryMetadataKey } from '../../common/agentHostChangesetService.js';
import { customChatTitleMetadataKey, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from '../../node/shared/persistSessionMetadata.js';
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

	test('normalized metadata batches title and source without touching legacy backing', async () => {
		const defaultChat = buildDefaultChatUri(session);
		await orchestrator.registerChatCatalogV2(session.toString(), {
			defaultChat: { chat: defaultChat, order: 0, metadata: { summary: 'Original', interactivity: ChatInteractivity.Full, changes: { files: 0 } } },
			peers: [],
			privateDescendants: [],
		});
		const local = new TestSessionDatabase();
		const store = createStore(local);
		const writes = sinon.spy(orchestrator, 'updateChatV2Metadata');
		await store.persistMetadata(session, URI.parse(defaultChat), {
			[SESSION_CUSTOM_TITLE_KEY]: 'Renamed',
			[SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user',
			[CHAT_PROVIDER_DATA_METADATA_KEY]: 'continuation',
			[CHAT_WORKING_DIRECTORIES_METADATA_KEY]: JSON.stringify(['file:///first', 'file:///second']),
		});
		await store.persistMetadata(session, URI.parse(defaultChat), {
			[SESSION_CUSTOM_TITLE_KEY]: '',
			[CHAT_PROVIDER_DATA_METADATA_KEY]: '',
			[CHAT_WORKING_DIRECTORIES_METADATA_KEY]: '',
			[getChatChangesSummaryMetadataKey(defaultChat)]: '',
		});
		const [snapshot] = await orchestrator.readCatalogSnapshot([session.toString()]);
		const row = snapshot.chats[0];
		assert.deepStrictEqual({
			writes: writes.callCount,
			legacyWrites: local.setMetadataCalls,
			metadata: row.metadata,
			directories: row.workingDirectories,
			detail: await orchestrator.getChatV2ProviderDetail(defaultChat),
		}, {
			writes: 2,
			legacyWrites: [],
			metadata: { interactivity: ChatInteractivity.Full, titleSource: 'user' },
			directories: undefined,
			detail: {},
		});
	});

	test('normalized default title snapshots fill missing titles without legacy writes or later overwrite', async () => {
		const defaultChat = buildDefaultChatUri(session);
		await orchestrator.registerChatCatalogV2(session.toString(), {
			defaultChat: { chat: defaultChat, order: 0, metadata: { interactivity: ChatInteractivity.Full, changes: { files: 0 } } },
			peers: [], privateDescendants: [],
		});
		const local = new TestSessionDatabase();
		await local.setMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY, 'user');
		local.setMetadataCalls.length = 0;
		const store = createStore(local);
		await store.persistDefaultChatTitleSnapshot(session, URI.parse(defaultChat), 'Snapshot');
		await store.persistDefaultChatTitleSnapshot(session, URI.parse(defaultChat), 'Later snapshot');
		const [snapshot] = await orchestrator.readCatalogSnapshot([session.toString()]);
		assert.deepStrictEqual({
			metadata: snapshot.chats[0].metadata, metadataRevision: snapshot.chats[0].metadataRevision,
			legacyWrites: local.setMetadataCalls,
		}, {
			metadata: { interactivity: ChatInteractivity.Full, changes: { files: 0 }, summary: 'Snapshot', titleSource: 'user' },
			metadataRevision: 1, legacyWrites: [],
		});
	});

	test('normalized title writes and snapshots use the migration summary bound without splitting surrogate pairs', async () => {
		const defaultChat = buildDefaultChatUri(session);
		await orchestrator.registerChatCatalogV2(session.toString(), {
			defaultChat: { chat: defaultChat, order: 0 },
			peers: [{ chat: first.toString(), order: 1 }],
			privateDescendants: [],
		});
		const local = new TestSessionDatabase();
		const store = createStore(local);
		const prefix = 'x'.repeat(AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT - 2);
		const oversized = `${prefix}😀tail`;
		await store.persistDefaultChatTitleSnapshot(session, URI.parse(defaultChat), oversized);
		await store.persistMetadata(session, first, { [SESSION_CUSTOM_TITLE_KEY]: oversized, [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user' });
		const [bounded] = await orchestrator.readCatalogSnapshot([session.toString()]);
		const exact = 'y'.repeat(AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT);
		await store.persistMetadata(session, session, { [customChatTitleMetadataKey(first.toString())]: exact });
		const [atLimit] = await orchestrator.readCatalogSnapshot([session.toString()]);
		await store.persistMetadata(session, first, { [SESSION_CUSTOM_TITLE_KEY]: '' });
		assert.deepStrictEqual({
			bounded: bounded.chats.map(chat => chat.metadata?.summary),
			atLimit: atLimit.chats.find(chat => chat.chat === first.toString())?.metadata?.summary,
			cleared: (await store.readNormalizedChat(session, first)).chat?.metadata,
			legacyWrites: local.setMetadataCalls,
		}, {
			bounded: [`${prefix}…`, `${prefix}…`],
			atLimit: exact,
			cleared: { titleSource: 'user' },
			legacyWrites: [],
		});
	});

	test('normalized chat hydration reads only one row per peer in a full catalog', async () => {
		const peers = Array.from({ length: 100 }, (_, index) => ({ chat: buildChatUri(session, `peer-${index}`), order: index + 1, metadata: { summary: `Peer ${index}` } }));
		await orchestrator.registerChatCatalogV2(session.toString(), {
			defaultChat: { chat: buildDefaultChatUri(session), order: 0 },
			peers,
			privateDescendants: Array.from({ length: 899 }, (_, index) => ({ chat: buildChatUri(session, `private-${index}`), parentChat: peers[0].chat })),
		});
		const snapshots = sinon.spy(orchestrator, 'readCatalogSnapshot');
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Count actual production row decoding without a test-only API.
		const originalDecoder = orchestrator['_toChatV2'];
		const decode = sinon.spy(originalDecoder);
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Retain the private method's type when installing the recording wrapper.
		orchestrator['_toChatV2'] = decode;
		const store = createStore(new TestSessionDatabase());
		try {
			const titles = await Promise.all(peers.map(async peer => (await store.readNormalizedChat(session, URI.parse(peer.chat))).chat?.metadata?.summary));
			assert.deepStrictEqual({
				titles, snapshotReads: snapshots.callCount, decodedRows: decode.callCount,
			}, { titles: peers.map(peer => peer.metadata.summary), snapshotReads: 0, decodedRows: peers.length });
		} finally {
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Restore the production decoder after this test.
			orchestrator['_toChatV2'] = originalDecoder;
		}
	});

	test('normalized default title snapshots preserve a concurrent explicit title after a CAS conflict', async () => {
		const defaultChat = buildDefaultChatUri(session);
		await orchestrator.registerChatCatalogV2(session.toString(), {
			defaultChat: { chat: defaultChat, order: 0 },
			peers: [], privateDescendants: [],
		});
		const local = new TestSessionDatabase();
		sinon.stub(local, 'getMetadata').callsFake(async key => {
			assert.strictEqual(key, SESSION_CUSTOM_TITLE_SOURCE_KEY);
			await orchestrator.updateChatV2Metadata(defaultChat, { ownershipRevision: 0, metadataRevision: 0 }, {
				metadata: { summary: 'Concurrent user title', titleSource: 'user' },
			});
			return 'auto';
		});
		const writes = sinon.spy(orchestrator, 'updateChatV2Metadata');
		await createStore(local).persistDefaultChatTitleSnapshot(session, URI.parse(defaultChat), 'Stale snapshot');
		const [snapshot] = await orchestrator.readCatalogSnapshot([session.toString()]);
		assert.deepStrictEqual({
			metadata: snapshot.chats[0].metadata, metadataRevision: snapshot.chats[0].metadataRevision,
			writes: writes.callCount, legacyWrites: local.setMetadataCalls,
		}, {
			metadata: { summary: 'Concurrent user title', titleSource: 'user' },
			metadataRevision: 1, writes: 2, legacyWrites: [],
		});
	});

	test('normalized public identity conflicts fail once instead of retrying an unchanged header', async () => {
		const defaultChat = buildDefaultChatUri(session);
		await orchestrator.registerChatCatalogV2(session.toString(), {
			defaultChat: { chat: defaultChat, order: 0 },
			peers: [{ chat: first.toString(), order: 1 }],
			privateDescendants: [],
		});
		const local = new TestSessionDatabase();
		const store = createStore(local);
		await store.remove(session, first);
		const replacements = sinon.spy(orchestrator, 'replaceSessionChatCatalog');
		await assert.rejects(store.upsert(session, first, 'recreated'), /Normalized peer identity conflicts/);
		await store.whenIdle();
		const [snapshot] = await orchestrator.readCatalogSnapshot([session.toString()]);
		assert.deepStrictEqual({
			attempts: replacements.callCount,
			chats: snapshot.chats.map(chat => chat.chat),
			legacyWrites: local.setMetadataCalls,
		}, {
			attempts: 1, chats: [defaultChat], legacyWrites: [],
		});
	});

	test('normalized flags and private lifecycle preserve public roles and reject tombstoned reuse', async () => {
		const defaultChat = buildDefaultChatUri(session);
		await orchestrator.registerChatCatalogV2(session.toString(), {
			defaultChat: { chat: defaultChat, order: 0 },
			peers: [{ chat: first.toString(), order: 1 }],
			privateDescendants: [],
		});
		const local = new TestSessionDatabase();
		const store = createStore(local);
		await store.setRead(session, URI.parse(defaultChat), true);
		await store.setArchived(session, first, true);
		await store.persistPrivateChat(session, {
			chat: second.toString(), parentChat: first.toString(), providerData: 'private-continuation',
			metadata: { summary: 'Worker', interactivity: ChatInteractivity.Hidden, changes: { files: 0 } },
		});
		await store.persistPrivateChat(session, { chat: second.toString(), providerData: 'updated-continuation', metadata: { interactivity: ChatInteractivity.Hidden } });
		await store.persistPrivateChat(session, { chat: third.toString(), parentChat: second.toString(), metadata: { interactivity: ChatInteractivity.Hidden } });
		const [before] = await orchestrator.readCatalogSnapshot([session.toString()]);
		await store.remove(session, second);
		const [after] = await orchestrator.readCatalogSnapshot([session.toString()]);
		await assert.rejects(store.persistPrivateChat(session, { chat: second.toString(), metadata: { interactivity: ChatInteractivity.Hidden } }), /Conflicting private chat identity/);
		await assert.rejects(store.persistPrivateChat(session, { chat: second.toString(), parentChat: first.toString(), metadata: { interactivity: ChatInteractivity.Hidden } }, true), /Conflicting private chat identity/);
		assert.deepStrictEqual({
			worker: before.chats.find(chat => chat.chat === second.toString())?.metadata,
			remaining: after.chats.map(chat => ({ chat: chat.chat, order: chat.order, read: chat.isRead, archived: chat.archived })),
			legacyWrites: local.setMetadataCalls,
			removed: await orchestrator.getChatV2ProviderDetail(second.toString()),
		}, {
			worker: { summary: 'Worker', interactivity: ChatInteractivity.Hidden, changes: { files: 0 } },
			remaining: [
				{ chat: defaultChat, order: 0, read: true, archived: false },
				{ chat: first.toString(), order: 1, read: undefined, archived: true },
			],
			legacyWrites: [],
			removed: undefined,
		});
	});

	test('late private lineage survives provider updates and removes descendants with their public parent', async () => {
		const defaultChat = buildDefaultChatUri(session);
		await orchestrator.registerChatCatalogV2(session.toString(), {
			defaultChat: { chat: defaultChat, order: 0 },
			peers: [{ chat: first.toString(), order: 1 }],
			privateDescendants: [],
		});
		const store = createStore(new TestSessionDatabase());
		await store.persistPrivateChat(session, { chat: second.toString(), providerData: 'early-continuation', metadata: { interactivity: ChatInteractivity.Hidden } });
		await assert.rejects(store.persistPrivateChat(session, { chat: second.toString(), parentChat: second.toString() }), /parent|lineage|cyclic/i);
		await store.persistPrivateChat(session, { chat: second.toString(), parentChat: first.toString() });
		await store.persistPrivateChat(session, { chat: second.toString(), providerData: 'latest-continuation' });
		await store.persistPrivateChat(session, { chat: third.toString(), parentChat: second.toString(), metadata: { interactivity: ChatInteractivity.Hidden } });
		const [before] = await orchestrator.readCatalogSnapshot([session.toString()]);
		const detail = await orchestrator.getChatV2ProviderDetail(second.toString());
		await store.remove(session, first);
		const [after] = await orchestrator.readCatalogSnapshot([session.toString()]);
		assert.deepStrictEqual({
			parent: before.chats.find(chat => chat.chat === second.toString())?.parentChat,
			detail, remaining: after.chats.map(chat => chat.chat),
			descendants: await Promise.all([second, third].map(chat => orchestrator.getChatV2ProviderDetail(chat.toString()))),
		}, {
			parent: first.toString(), detail: { providerData: 'latest-continuation' },
			remaining: [defaultChat], descendants: [undefined, undefined],
		});
	});

	function createPerResourceStore(): {
		readonly store: AgentHostPeerChatStore;
		readonly databaseFor: (resource: URI) => ConcurrentMetadataWriteDatabase;
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
		};
	}

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

	test('persists read state across updates and restores', async () => {
		const { store, databaseFor } = createPerResourceStore();
		await store.upsert(session, first, 'old', origin, 'inherited-turn');
		await store.setRead(session, first, false);
		await store.upsert(session, first, 'refreshed');
		const unread = await store.tryRead(session);
		const centralUnread = (await orchestrator.getSessionChatCatalog(session.toString()))?.chats.find(chat => chat.chat === first.toString())?.isRead;
		const compatibilityUnread = await databaseFor(first).getMetadata(AH_META_IS_READ_DB_KEY);

		await store.setRead(session, first, true);
		const read = await store.tryRead(session);
		const centralRead = (await orchestrator.getSessionChatCatalog(session.toString()))?.chats.find(chat => chat.chat === first.toString())?.isRead;
		const compatibilityRead = await databaseFor(first).getMetadata(AH_META_IS_READ_DB_KEY);

		assert.deepStrictEqual({ unread, centralUnread, compatibilityUnread, read, centralRead, compatibilityRead }, {
			unread: [{ uri: first.toString(), isRead: false, providerData: 'refreshed', origin, inheritedTurnId: 'inherited-turn' }],
			centralUnread: false,
			compatibilityUnread: '',
			read: [{ uri: first.toString(), isRead: true, providerData: 'refreshed', origin, inheritedTurnId: 'inherited-turn' }],
			centralRead: true,
			compatibilityRead: 'true',
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
