/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildChatUri, buildDefaultChatUri, ChatInteractivity } from '../../common/state/sessionState.js';
import { migrateChatCatalogV2 } from '../../node/agentHostChatCatalogMigration.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION, encodeAgentHostCatalogPayload, type AgentHostCatalogData } from '../../node/agentHostCatalogProjection.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { CHAT_INHERITED_TURN_METADATA_KEY, CHAT_ORIGIN_METADATA_KEY, CHAT_PROVIDER_DATA_METADATA_KEY, CHAT_WORKING_DIRECTORIES_METADATA_KEY } from '../../node/agentHostPeerChatStore.js';
import { customChatTitleMetadataKey, customChatTitleSourceMetadataKey } from '../../node/shared/persistSessionMetadata.js';
import { createNullSessionDataService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

suite('AgentHostChatCatalogMigration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('agent-session://copilot/migration');
	const defaultChat = buildDefaultChatUri(session);

	async function createDatabase(chats: AgentHostCatalogData['chats']): Promise<AgentHostDatabase> {
		const database = store.add(new AgentHostDatabase(':memory:'));
		await database.registerRuntimeSession(session.toString(), { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const encoded = encodeAgentHostCatalogPayload({
			modifiedTime: 1,
			isRead: false,
			isArchived: false,
			workingDirectories: [],
			chats,
		});
		if (!encoded.ok) {
			throw new Error(encoded.error);
		}
		await database.upsertSessionV2({
			session: session.toString(),
			sessionGeneration: 'generation',
			sourceRevision: 1,
			payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
			payloadHash: encoded.value.payloadHash,
			payload: encoded.value.payload,
			verified: true,
		}, undefined);
		return database;
	}

	test('migrates default-only persisted sessions with lazy provider detail and first mutation atomically', async () => {
		const database = await createDatabase([{ uri: defaultChat, kind: 'default', order: 0, summary: 'Default', changes: { files: 0 } }]);
		const local = new TestSessionDatabase();
		await local.setMetadata('defaultChatProviderData', 'opaque-continuation');
		const result = await migrateChatCatalogV2(database, createSessionDataService(local), session, {
			chat: defaultChat,
			expected: { ownershipRevision: 0, metadataRevision: 0 },
			patch: { isRead: true },
		});
		const snapshot = await database.readCatalogSnapshot([session.toString()]);
		const detail = await database.getChatV2ProviderDetail(defaultChat);
		const closedLegacy = createNullSessionDataService();
		closedLegacy.tryOpenDatabase = async () => {
			throw new Error('Activated catalogs must not reread legacy metadata');
		};
		assert.deepStrictEqual({
			status: result.status,
			authority: snapshot[0]?.authorityVersion,
			defaultChat: snapshot[0]?.header?.defaultChatUri,
			chats: snapshot[0]?.chats.map(chat => ({ chat: chat.chat, read: chat.isRead, changes: chat.metadata?.changes })),
			detail,
			secondMigration: await migrateChatCatalogV2(database, closedLegacy, session),
		}, {
			status: 'applied',
			authority: 2,
			defaultChat,
			chats: [{ chat: defaultChat, read: true, changes: { files: 0 } }],
			detail: { providerData: 'opaque-continuation' },
			secondMigration: { status: 'alreadyNormalized' },
		});
	});

	test('defers normalization until default backing provenance is in the verified projection', async () => {
		const database = await createDatabase([{ uri: defaultChat, kind: 'default', order: 0, summary: 'Default' }]);
		const backing = new TestSessionDatabase();
		await backing.setMetadataValues({
			[CHAT_ORIGIN_METADATA_KEY]: JSON.stringify({ kind: 'user' }),
			[CHAT_PROVIDER_DATA_METADATA_KEY]: 'opaque-continuation',
		});
		const service = createSessionDataService(backing);
		const deferred = await migrateChatCatalogV2(database, service, session);
		const [before] = await database.readCatalogSnapshot([session.toString()]);
		const source = (await database.getSessionV2(session.toString()))!;
		const encoded = encodeAgentHostCatalogPayload({
			modifiedTime: 1, isRead: false, isArchived: false, workingDirectories: [],
			chats: [{ uri: defaultChat, kind: 'default', order: 0, summary: 'Default', origin: { kind: 'user' } }],
		});
		if (!encoded.ok) {
			throw new Error(encoded.error);
		}
		await database.upsertSessionV2({
			...source, sourceRevision: source.sourceRevision + 1, payload: encoded.value.payload, payloadHash: encoded.value.payloadHash,
		}, source.sessionGeneration);
		const activated = await migrateChatCatalogV2(database, service, session);
		const [after] = await database.readCatalogSnapshot([session.toString()]);
		assert.deepStrictEqual({
			deferred, before: before.authorityVersion, activated: activated.status,
			after: after.authorityVersion, origin: after.chats[0].origin,
			detail: await database.getChatV2ProviderDetail(defaultChat),
		}, {
			deferred: { status: 'notReady' }, before: 1, activated: 'applied',
			after: 2, origin: '{"kind":"user"}', detail: { providerData: 'opaque-continuation' },
		});
	});

	test('normalizes a provisional catalog without creating provider backing or clearing its lifecycle marker', async () => {
		const database = await createDatabase([{ uri: defaultChat, kind: 'default', order: 0, summary: 'Draft', isRead: true }]);
		await database.setSessionProvisional(session.toString(), true);
		const result = await migrateChatCatalogV2(database, createNullSessionDataService(), session);
		const [snapshot] = await database.readCatalogSnapshot([session.toString()]);
		const beforeMaterialization = {
			status: result.status,
			authority: snapshot.authorityVersion,
			provisional: snapshot.provisional,
			markers: await database.listProvisionalSessions(),
			defaultChat: snapshot.header?.defaultChatUri,
			chats: snapshot.chats.map(chat => ({ chat: chat.chat, summary: chat.metadata?.summary, isRead: chat.isRead })),
			detail: await database.getChatV2ProviderDetail(defaultChat),
		};
		await database.updateChatV2Metadata(defaultChat, { ownershipRevision: 0, metadataRevision: 0 }, { providerData: 'materialized-continuation' });
		await database.setSessionProvisional(session.toString(), false);
		const [materialized] = await database.readCatalogSnapshot([session.toString()]);
		assert.deepStrictEqual({
			beforeMaterialization,
			afterMaterialization: {
				provisional: materialized.provisional,
				markers: await database.listProvisionalSessions(),
				chats: materialized.chats.map(chat => chat.chat),
				detail: await database.getChatV2ProviderDetail(defaultChat),
			},
		}, {
			beforeMaterialization: {
				status: 'applied', authority: 2, provisional: true, markers: [session.toString()],
				defaultChat, chats: [{ chat: defaultChat, summary: 'Draft', isRead: true }], detail: {},
			},
			afterMaterialization: {
				provisional: false, markers: [], chats: [defaultChat], detail: { providerData: 'materialized-continuation' },
			},
		});
	});

	for (const source of ['dirty', 'missing'] as const) {
		test(`keeps a provisional catalog pending when its verified source is ${source}`, async () => {
			const database = source === 'dirty'
				? await createDatabase([{ uri: defaultChat, kind: 'default', order: 0, summary: 'Unreconciled' }])
				: store.add(new AgentHostDatabase(':memory:'));
			if (source === 'missing') {
				await database.registerRuntimeSession(session.toString(), { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			} else {
				await database.markSessionV2PayloadDirty(session.toString());
			}
			await database.setSessionProvisional(session.toString(), true);
			const result = await migrateChatCatalogV2(database, createNullSessionDataService(), session);
			const [snapshot] = await database.readCatalogSnapshot([session.toString()]);
			assert.deepStrictEqual({
				result, authority: snapshot.authorityVersion, provisional: snapshot.provisional, chats: snapshot.chats,
				markers: await database.listProvisionalSessions(),
			}, {
				result: { status: 'notReady' }, authority: 1, provisional: true, chats: [], markers: [session.toString()],
			});
		});
	}

	test('requires reconciled legacy clears before normalization and preserves deleted identities', async () => {
		const peer = buildChatUri(session, 'peer');
		const deleted = buildChatUri(session, 'deleted');
		const database = await createDatabase([
			{ uri: defaultChat, kind: 'default', order: 0 },
			{ uri: peer, kind: 'peer', order: 1, summary: 'Peer' },
		]);
		await database.replaceSessionChatCatalog(session.toString(), [
			{ chat: peer, order: 0, providerData: 'stale', inheritedTurnId: 'stale-turn' },
			{ chat: deleted, order: 1, providerData: 'leftover' },
		], undefined);
		const parent = new TestSessionDatabase();
		await parent.setMetadataValues({ [customChatTitleMetadataKey(deleted)]: '', [customChatTitleSourceMetadataKey(deleted)]: '' });
		const backing = new TestSessionDatabase();
		await backing.setMetadataValues({
			[CHAT_PROVIDER_DATA_METADATA_KEY]: '',
			[CHAT_ORIGIN_METADATA_KEY]: '',
			[CHAT_INHERITED_TURN_METADATA_KEY]: '',
			[CHAT_WORKING_DIRECTORIES_METADATA_KEY]: '',
		});
		const resources = new Map([[session.toString(), parent], [peer, backing]]);
		const service = createNullSessionDataService();
		service.tryOpenDatabase = async resource => {
			const local = resources.get(resource.toString());
			return local ? createSessionDataService(local).tryOpenDatabase(resource) : undefined;
		};
		const firstAttempt = await migrateChatCatalogV2(database, service, session);
		const legacySnapshot = await database.readCatalogSnapshot([session.toString()]);
		const legacyCatalog = await database.getSessionChatCatalog(session.toString());
		const reconciled = await database.replaceSessionChatCatalog(session.toString(), [
			{ chat: peer, order: 0 },
			{ chat: deleted, order: 1, providerData: 'leftover' },
		], legacyCatalog?.revision);
		const migration = await migrateChatCatalogV2(database, service, session);
		const snapshot = await database.readCatalogSnapshot([session.toString()]);
		const row = snapshot[0]?.chats.find(chat => chat.chat === peer);
		assert.deepStrictEqual({
			firstAttempt,
			legacyAuthority: legacySnapshot[0]?.authorityVersion,
			preservedLegacy: legacyCatalog?.chats[0],
			reconciled: reconciled.status,
			migration: migration.status,
			authority: snapshot[0]?.authorityVersion,
			peers: snapshot[0]?.chats.map(chat => chat.chat),
			row: row && { origin: row.origin, inherited: row.inheritedTurnId, directories: row.workingDirectories, summary: row.metadata?.summary },
			peerDetail: await database.getChatV2ProviderDetail(peer),
			deletedDetail: await database.getChatV2ProviderDetail(deleted),
		}, {
			firstAttempt: { status: 'notReady' },
			legacyAuthority: 1,
			preservedLegacy: { chat: peer, order: 0, providerData: 'stale', inheritedTurnId: 'stale-turn' },
			reconciled: 'applied',
			migration: 'applied',
			authority: 2,
			peers: [defaultChat, peer],
			row: { origin: undefined, inherited: undefined, directories: undefined, summary: 'Peer' },
			peerDetail: {},
			deletedDetail: undefined,
		});
	});

	test('preserves explicit parentless private rows while compacting visible order', async () => {
		const privateChat = buildChatUri(session, 'private');
		const peer = buildChatUri(session, 'public');
		const database = await createDatabase([
			{ uri: defaultChat, kind: 'default', order: 0 },
			{ uri: privateChat, kind: 'peer', order: 1, interactivity: ChatInteractivity.Hidden },
			{ uri: peer, kind: 'peer', order: 2, summary: 'Public' },
		]);
		const result = await migrateChatCatalogV2(database, createNullSessionDataService(), session);
		const [snapshot] = await database.readCatalogSnapshot([session.toString()]);
		assert.deepStrictEqual({
			status: result.status,
			chats: [...snapshot.chats].sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000)).map(chat => ({ chat: chat.chat, order: chat.order, parent: chat.parentChat, role: chat.metadata?.interactivity })),
		}, {
			status: 'applied',
			chats: [
				{ chat: defaultChat, order: 0, parent: undefined, role: ChatInteractivity.Full },
				{ chat: peer, order: 1, parent: undefined, role: ChatInteractivity.Full },
				{ chat: privateChat, order: undefined, parent: undefined, role: ChatInteractivity.Hidden },
			],
		});
	});
});
