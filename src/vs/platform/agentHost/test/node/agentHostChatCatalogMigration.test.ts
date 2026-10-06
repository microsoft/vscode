/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildChatUri, buildDefaultChatUri } from '../../common/state/sessionState.js';
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
});
