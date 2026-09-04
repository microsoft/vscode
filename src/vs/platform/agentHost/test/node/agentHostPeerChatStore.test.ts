/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
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

class ConcurrentMetadataWriteDatabase extends TestSessionDatabase {
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
		await orchestrator.close();
	});

	function createStore(database: TestSessionDatabase, logService = new NullLogService()): AgentHostPeerChatStore {
		return new AgentHostPeerChatStore(orchestrator, createSessionDataService(database), logService);
	}

	function createPerResourceStore(): {
		readonly store: AgentHostPeerChatStore;
		readonly databaseFor: (resource: URI) => ConcurrentMetadataWriteDatabase;
	} {
		const databases = new Map<string, ConcurrentMetadataWriteDatabase>();
		const databaseFor = (resource: URI) => {
			const key = resource.toString();
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
			tryOpenDatabase: async (resource: URI) => ({ object: databaseFor(resource), dispose: () => { } }),
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

	test('refreshes provider data without dropping persisted origin or inherited turn', async () => {
		const database = new TestSessionDatabase();
		const store = createStore(database);
		await store.upsert(session, first, 'old', origin, 'inherited-turn');

		await store.upsert(session, first, 'refreshed');

		assert.deepStrictEqual(await store.tryRead(session), [
			{ uri: first.toString(), providerData: 'refreshed', origin, inheritedTurnId: 'inherited-turn' },
		]);
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
