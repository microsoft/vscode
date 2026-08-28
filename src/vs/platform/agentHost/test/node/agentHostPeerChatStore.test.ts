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
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostPeerChatStore, PEER_CHATS_METADATA_KEY } from '../../node/agentHostPeerChatStore.js';
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

	function createStore(database: TestSessionDatabase): AgentHostPeerChatStore {
		return new AgentHostPeerChatStore(orchestrator, createSessionDataService(database), new NullLogService());
	}

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
});
