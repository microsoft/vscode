/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { match, stub } from 'sinon';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode } from '../../../files/common/files.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IProductService } from '../../../product/common/productService.js';
import { createNoopGitService } from '../common/sessionTestHelpers.js';
import { createTestAgentService, getTestAgentStateManager, registerTestAgentProvider } from './agentServiceTestUtils.js';
import { MockAgent } from './mockAgent.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { CompatibleAgentHostDatabase } from '../../node/compatibleAgentHostDatabase.js';
import { SessionStorageIdentity, storedChatUri } from '../../node/sessionStorageIdentity.js';
import { SessionDataService } from '../../node/sessionDataService.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri, buildSubagentSessionUri, ChatOriginKind, MessageKind, MessageAttachmentKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, type Message, type ToolCallResponsePart, type Turn } from '../../common/state/sessionState.js';
import { StringSHA1 } from '../../../../base/common/hash.js';
import { uuidFromSha1 } from '../../common/agentHostChatIdentity.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION, decodeAgentHostCatalogPayloadData, encodeAgentHostCatalogPayload, hashAgentHostCatalogPayload, type AgentHostCatalogData } from '../../node/agentHostCatalogProjection.js';
import { AgentHostPeerChatStore } from '../../node/agentHostPeerChatStore.js';
import { AgentSessionRegistry } from '../../node/agentSessionRegistry.js';
import { readAgentMessageDelegationMeta, toAgentMessageDelegationMeta } from '../../common/meta/agentMessageDelegationMeta.js';
import { AgentHostCatalogSyncService, matchesAcknowledgedCatalogReceipt } from '../../node/agentHostCatalogSyncService.js';
import { createLiveChatOwnership } from './chatOwnershipTestUtils.js';

suite('Session storage identity compatibility', () => {
	const store = new DisposableStore();
	let directory: string;

	setup(async () => directory = await mkdtemp(join(tmpdir(), 'ah-storage-compat-')));
	teardown(async () => {
		store.clear();
		await rm(directory, { recursive: true, force: true });
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	function files() {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new DiskFileSystemProvider(new NullLogService()))));
		return fileService;
	}

	async function database(writeCompatibility = true) {
		const db = store.add(new CompatibleAgentHostDatabase(join(directory, 'agent-host.db'), writeCompatibility));
		await db.initialize();
		return db;
	}

	function payload(session: string): AgentHostCatalogData {
		return {
			modifiedTime: 2, summary: 'Conversation', isRead: true, isArchived: false, workingDirectories: [],
			chats: [
				{ uri: buildDefaultChatUri(session), order: 0, kind: 'default' },
				{ uri: buildChatUri(session, 'peer'), order: 1, kind: 'peer' },
			],
		};
	}

	test('maps only registered local identities and preserves chat IDs and arbitrary text', () => {
		const codec = new SessionStorageIdentity();
		codec.add({ runtime: 'ahp-session:/new', storage: 'copilotcli:/new', provider: 'copilotcli' });
		const resources = ['ahp-session:/new', buildDefaultChatUri('ahp-session:/new'), buildChatUri('ahp-session:/new', 'peer'), buildSubagentChatUri('ahp-session:/new', 'call/1')];
		const encoded = resources.map(resource => codec.toStorage(resource));
		assert.deepStrictEqual({
			encoded,
			decoded: encoded.map(resource => codec.toRuntime(resource)),
			opaque: ['ahp-session://tenant/new?revision=1', 'conversation://tenant/chat', 'codex:/new', 'copilotcli:/historical'].map(resource => codec.toStorage(resource)),
			message: codec.record({ text: 'ahp-session:/new', providerData: '{"uri":"ahp-session:/new"}' }, 'storage'),
		}, {
			encoded: ['copilotcli:/new', buildDefaultChatUri('copilotcli:/new'), buildChatUri('copilotcli:/new', 'peer'), buildSubagentChatUri('copilotcli:/new', 'call/1')],
			decoded: resources,
			opaque: ['ahp-session://tenant/new?revision=1', 'conversation://tenant/chat', 'codex:/new', 'copilotcli:/historical'],
			message: { text: 'ahp-session:/new', providerData: '{"uri":"ahp-session:/new"}' },
		});
	});

	test('translates the session a chat URI was minted for and keeps its chat id and suffix', () => {
		const codec = new SessionStorageIdentity();
		codec.add({ runtime: 'ahp-session:/translated', storage: 'claude:/translated', provider: 'claude' });
		const chats = (session: string) => [
			buildDefaultChatUri(session),
			buildChatUri(session, 'peer'),
			buildSubagentChatUri(session, 'call/1'),
			`${buildChatUri(session, 'peer')}?revision=2#turn-1`,
		];
		const unknown = [buildChatUri('ahp-session:/unregistered', 'peer'), buildSubagentChatUri('claude:/unregistered', 'call/1')];
		const storage = chats('ahp-session:/translated').map(chat => codec.toStorage(chat));

		assert.deepStrictEqual({
			storage,
			runtime: storage.map(chat => codec.toRuntime(chat)),
			roundTrip: storage.map(chat => codec.toStorage(codec.toRuntime(chat))),
			unknown: unknown.map(chat => [codec.toStorage(chat), codec.toRuntime(chat)]),
		}, {
			storage: chats('claude:/translated'),
			runtime: chats('ahp-session:/translated'),
			roundTrip: chats('claude:/translated'),
			unknown: unknown.map(chat => [chat, chat]),
		});
	});

	for (const provider of ['copilotcli', 'claude', 'codex']) {
		test(`writes ${provider} as one older-readable registration and reads it natively after restart`, async () => {
			const db = await database();
			await db.prepareSessionStorage('ahp-session:/new', provider);
			await db.registerRuntimeSession('ahp-session:/new', { provider, startTime: 1, source: 'explicit' }, { checkTombstone: false });
			const stored = await db.raw.listSessionV2Registrations();
			await db.close();
			const next = await database();
			assert.deepStrictEqual({
				stored: stored.map(entry => [entry.session, entry.provider]),
				runtime: (await next.listSessionV2Registrations()).map(entry => [entry.session, entry.provider]),
			}, { stored: [[`${provider}:/new`, provider]], runtime: [['ahp-session:/new', provider]] });
		});
	}

	test('historical and already-written native or opaque identities are not reencoded', async () => {
		const raw = store.add(new AgentHostDatabase(join(directory, 'agent-host.db')));
		for (const session of ['copilotcli:/old', 'ahp-session:/existing', 'ahp-session://tenant/opaque?revision=1']) {
			await raw.registerRuntimeSession(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		}
		await raw.close();
		const db = await database();
		await db.prepareSessionStorage('ahp-session:/existing', 'copilotcli');
		assert.deepStrictEqual((await db.listSessionV2Registrations()).map(entry => entry.session).sort(), [
			'copilotcli:/old', 'ahp-session:/existing', 'ahp-session://tenant/opaque?revision=1',
		].sort());
	});

	for (const registration of ['registerRuntimeSession', 'registerSessionV2'] as const) {
		for (const source of ['discovery', 'restore', 'explicit'] as const) {
			test(`${registration} with ${source} does not change an unregistered native session's storage representation`, async () => {
				const db = await database();
				const fileService = files();
				const existing = new SessionDataService(URI.file(directory), fileService, new NullLogService());
				const session = URI.parse('ahp-session:/existing');
				const peer = URI.parse(buildChatUri(session, 'peer'));
				const original = existing.openDatabase(peer);
				await original.object.setChatDraft(peer, { text: 'Existing unsent draft', origin: { kind: MessageKind.User } });
				original.dispose();
				await db[registration](session.toString(), { provider: 'copilotcli', startTime: 1, source }, { checkTombstone: true });
				const modern = new SessionDataService(URI.file(directory), fileService, new NullLogService(), undefined, db.identity);
				const restored = await modern.tryOpenDatabase(peer);
				const draft = await restored?.object.getChatDraft(peer);
				restored?.dispose();
				assert.deepStrictEqual({
					identity: db.identity.toStorage(session.toString()),
					registrations: (await db.raw.listSessionV2Registrations()).map(row => row.session),
					markers: await db.raw.readStorageIdentityMetadata('sessionStorageIdentity:'),
					draft: draft?.text,
					directory: modern.getSessionDataDir(peer).toString(),
				}, {
					identity: session.toString(), registrations: [session.toString()], markers: [],
					draft: 'Existing unsent draft', directory: existing.getSessionDataDir(peer).toString(),
				});
			});
		}
	}

	for (const registration of ['registerRuntimeSession', 'registerSessionV2'] as const) {
		test(`${registration} preserves native deletion tombstones without allocating a compatibility identity`, async () => {
			const raw = store.add(new AgentHostDatabase(join(directory, 'agent-host.db')));
			const session = 'ahp-session:/deleted';
			await raw.registerRuntimeSession(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			await raw.tombstoneAndUnregisterSession(session);
			await raw.close();
			const db = await database();
			const registered = await db[registration](session, { provider: 'copilotcli', startTime: 2, source: 'discovery' }, {
				checkTombstone: true, discoveryBackingSession: 'copilotcli:/deleted',
			});
			await db.close();
			const next = await database();
			assert.deepStrictEqual({
				registered,
				tombstoned: await next.isSessionTombstoned(session),
				identity: next.identity.toStorage(session),
				markers: await next.raw.readStorageIdentityMetadata('sessionStorageIdentity:'),
				registrations: await next.listSessionV2Registrations(),
			}, { registered: false, tombstoned: true, identity: session, markers: [], registrations: [] });
		});
	}

	test('discovery does not allocate a compatibility identity over a deleted legacy backing', async () => {
		const db = await database();
		await db.raw.markSessionTombstoned('copilotcli:/deleted');
		const registered = await db.registerRuntimeSession('ahp-session:/deleted', {
			provider: 'copilotcli', startTime: 2, source: 'discovery',
		}, { checkTombstone: true, discoveryBackingSession: 'copilotcli:/deleted' });
		assert.deepStrictEqual({
			registered,
			tombstoned: await db.raw.isSessionTombstoned('copilotcli:/deleted'),
			markers: await db.raw.readStorageIdentityMetadata('sessionStorageIdentity:'),
		}, { registered: false, tombstoned: true, markers: [] });
	});

	test('preparing deleted native data cannot bypass explicit creation collision checks', async () => {
		const db = await database();
		const session = URI.parse('ahp-session:/deleted');
		await db.raw.markSessionTombstoned(session.toString());
		const fileService = files();
		const data = new SessionDataService(URI.file(directory), fileService, new NullLogService(), undefined, db.identity);
		const service = store.add(createTestAgentService(
			new NullLogService(), fileService, data, { _serviceBrand: undefined } as IProductService, createNoopGitService(),
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, db,
		));
		registerTestAgentProvider(service, store.add(new MockAgent('copilotcli')));
		await db.prepareSessionStorage(session.toString(), 'copilotcli');
		await assert.rejects(service.createSession({ legacyChatUris: true, provider: 'copilotcli', session }), /Session storage identity is already in use/);
		assert.deepStrictEqual({
			tombstoned: await db.isSessionTombstoned(session.toString()),
			identity: db.identity.toStorage(session.toString()),
			markers: await db.raw.readStorageIdentityMetadata('sessionStorageIdentity:'),
			registrations: (await db.raw.listSessionV2Registrations()).map(row => row.session),
		}, { tombstoned: true, identity: session.toString(), markers: [], registrations: [] });
	});

	test('the dual reader accepts a future native writer in a mixed database', async () => {
		const writer = await database(false);
		await writer.registerRuntimeSession('ahp-session:/future', { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await writer.close();
		const reader = await database();
		await reader.prepareSessionStorage('ahp-session:/compatible', 'claude');
		await reader.registerRuntimeSession('ahp-session:/compatible', { provider: 'claude', startTime: 2, source: 'explicit' }, { checkTombstone: false });
		assert.deepStrictEqual({
			runtime: (await reader.listSessionV2Registrations()).map(entry => entry.session).sort(),
			storage: (await reader.raw.listSessionV2Registrations()).map(entry => entry.session).sort(),
		}, {
			runtime: ['ahp-session:/compatible', 'ahp-session:/future'],
			storage: ['ahp-session:/future', 'claude:/compatible'],
		});
	});

	test('historical stable identities retain writable legacy chat authority during the compatibility window', async () => {
		const raw = store.add(new AgentHostDatabase(join(directory, 'agent-host.db')));
		const session = URI.parse('copilotcli:/historical');
		await raw.registerRuntimeSession(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await raw.close();
		const db = await database();
		const modern = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, db.identity);
		const peers = new AgentHostPeerChatStore(db, modern, new NullLogService(), createLiveChatOwnership(() => undefined, () => undefined));
		const peer = buildChatUri(session, 'first');
		await peers.replace(session, [{ uri: peer }]);
		const normalized = await db.registerChatCatalogV2(session.toString(), {
			defaultChat: { chat: buildDefaultChatUri(session), order: 0 },
			peers: [{ chat: peer, order: 1 }], privateDescendants: [],
		});
		const legacy = new SessionDataService(URI.file(directory), files(), new NullLogService()).openDatabase(session);
		const oldAdded = buildChatUri(session, 'old-added');
		await legacy.object.setMetadata('peerChats', JSON.stringify([{ uri: peer }, { uri: oldAdded }]));
		legacy.dispose();
		assert.deepStrictEqual({
			normalized,
			identity: (await db.getSessionV2Registration(session.toString()))?.session,
			chats: (await peers.reconcileLegacy(session))?.map(entry => entry.uri),
		}, {
			normalized: { status: 'notReady' }, identity: session.toString(), chats: [peer, oldAdded],
		});
	});

	test('legacy deletion remains deleted after upgrade without readdressing historical sessions', async () => {
		const db = await database();
		await db.prepareSessionStorage('ahp-session:/new', 'copilotcli');
		await db.registerRuntimeSession('ahp-session:/new', { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await db.close();
		const old = store.add(new AgentHostDatabase(join(directory, 'agent-host.db')));
		await old.tombstoneAndUnregisterSession('copilotcli:/new');
		await old.registerRuntimeSession('copilotcli:/created-by-old', { provider: 'copilotcli', startTime: 2, source: 'explicit' }, { checkTombstone: false });
		await old.close();
		const next = await database();
		assert.deepStrictEqual({
			deleted: await next.isSessionTombstoned('ahp-session:/new'),
			sessions: (await next.listSessionV2Registrations()).map(entry => entry.session),
		}, { deleted: true, sessions: ['copilotcli:/created-by-old'] });
	});

	test('normalized catalogs read their session and default chat in runtime spelling', async () => {
		const db = await database();
		const session = 'ahp-session:/normalized-compat';
		await db.prepareSessionStorage(session, 'copilotcli');
		await db.registerRuntimeSession(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const recordedDefault = `${buildDefaultChatUri(session)}?generation=1`;
		// The compatibility format keeps this session's catalog in its storage spelling.
		await db.raw.registerChatCatalogV2('copilotcli:/normalized-compat', { defaultChat: { chat: `${buildDefaultChatUri('copilotcli:/normalized-compat')}?generation=1`, order: 0 }, peers: [], privateDescendants: [] });
		assert.deepStrictEqual({
			runtime: (await db.readSessionRegistrations()).normalizedCatalogs,
			storage: (await db.raw.readSessionRegistrations()).normalizedCatalogs,
		}, {
			runtime: [{ session, defaultChatUri: recordedDefault }],
			storage: [{ session: 'copilotcli:/normalized-compat', defaultChatUri: `${buildDefaultChatUri('copilotcli:/normalized-compat')}?generation=1` }],
		});
	});

	test('catalog payload checksums and per-session receipts round-trip through storage encoding', async () => {
		const db = await database();
		const session = 'ahp-session:/new';
		await db.prepareSessionStorage(session, 'copilotcli');
		await db.registerRuntimeSession(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const encoded = encodeAgentHostCatalogPayload(payload(session));
		assert.ok(encoded.ok);
		await db.upsertSessionV2({
			session, sessionGeneration: 'generation', sourceRevision: 1, payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION, verified: true,
			payload: encoded.value.payload, payloadHash: encoded.value.payloadHash,
		}, undefined);
		const stored = await db.raw.getSessionV2('copilotcli:/new');
		assert.ok(stored);
		const data = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, db.identity);
		const ref = data.openDatabase(URI.parse(session));
		await ref.object.setMetadataValuesAndCatalogSyncSnapshot({}, {
			sessionGeneration: 'generation', sourceRevision: 1, projectionVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION, state: 'pending',
			payload: encoded.value.payload, payloadHash: encoded.value.payloadHash,
		});
		const acknowledged = await ref.object.acknowledgeCatalogSyncSnapshot({
			sessionGeneration: 'generation', sourceRevision: 1, projectionVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION, payloadHash: encoded.value.payloadHash,
		});
		ref.dispose();
		await db.close();
		const next = await database();
		const centralReceipt = (await next.listSessionsV2Receipts())[0];
		const nextData = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, next.identity);
		const nextRef = nextData.openDatabase(URI.parse(session));
		const receipt = await nextRef.object.getCatalogSyncSnapshot();
		nextRef.dispose();
		assert.deepStrictEqual({
			acknowledged,
			checksumValid: stored.payloadHash === hashAgentHostCatalogPayload(stored.payload),
			storedHasLegacyChat: stored.payload.includes(buildDefaultChatUri('copilotcli:/new')),
			runtimePayload: (await next.getSessionV2(session))?.payload,
			receiptHash: receipt?.payloadHash,
			centralReceiptHash: centralReceipt.payloadHash,
			receiptMatches: matchesAcknowledgedCatalogReceipt(receipt, centralReceipt),
		}, {
			acknowledged: true, checksumValid: true, storedHasLegacyChat: true,
			runtimePayload: encoded.value.payload, receiptHash: encoded.value.payloadHash,
			centralReceiptHash: encoded.value.payloadHash, receiptMatches: true,
		});
	});

	test('cancelled or stale central writes retain the durable receipt hash pair', async () => {
		const db = await database();
		const session = 'ahp-session:/new';
		await db.prepareSessionStorage(session, 'copilotcli');
		await db.registerRuntimeSession(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const first = encodeAgentHostCatalogPayload(payload(session));
		const next = encodeAgentHostCatalogPayload({ ...payload(session), summary: 'Cancelled replacement' });
		assert.ok(first.ok && next.ok);
		const envelope = {
			session, sessionGeneration: 'generation', sourceRevision: 2, payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
			verified: true as const, payload: first.value.payload, payloadHash: first.value.payloadHash,
		};
		await db.upsertSessionV2(envelope, undefined);
		const cancelled = await db.upsertSessionV2({ ...envelope, sourceRevision: 3, payload: next.value.payload, payloadHash: next.value.payloadHash }, 'generation', () => false);
		const stale = await db.upsertSessionV2({ ...envelope, sourceRevision: 1, payload: next.value.payload, payloadHash: next.value.payloadHash }, 'generation');
		await db.close();
		const restarted = await database();
		assert.deepStrictEqual({ cancelled, stale, hash: (await restarted.listSessionsV2Receipts())[0].payloadHash }, {
			cancelled: 'cancelled', stale: 'stale', hash: first.value.payloadHash,
		});
	});

	test('cold central receipt translation does not depend on the bounded hash cache', async () => {
		const db = await database();
		const session = 'ahp-session:/new';
		await db.prepareSessionStorage(session, 'copilotcli');
		await db.registerRuntimeSession(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const encoded = encodeAgentHostCatalogPayload(payload(session));
		assert.ok(encoded.ok);
		await db.upsertSessionV2({
			session, sessionGeneration: 'generation', sourceRevision: 1, payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
			verified: true, payload: encoded.value.payload, payloadHash: encoded.value.payloadHash,
		}, undefined);
		// Evict translations in memory without persisting unrelated sessions.
		for (let index = 0; index < 260; index++) {
			db.identity.rememberHash(`runtime-${index}`, `storage-${index}`);
		}
		const evictedHash = db.identity.hash(encoded.value.payloadHash, 'storage');
		const warmReceipts = await db.listSessionsV2Receipts();
		await db.close();
		const restarted = await database();
		const receipts = await restarted.listSessionsV2Receipts();
		const receipt = receipts[0];
		const excluded = await restarted.excludeSessionV2({
			session: receipt.session, provider: 'copilotcli', reason: 'providerAbsent', fingerprint: 'test',
		}, {
			identity: await restarted.getSessionV2Registration(receipt.session),
			catalog: { sessionGeneration: receipt.sessionGeneration, sourceRevision: receipt.sourceRevision, payloadHash: receipt.payloadHash },
		});
		const hidden = await restarted.getSessionV2(receipt.session);
		await restarted.registerRuntimeSession(receipt.session, {
			provider: 'copilotcli', startTime: receipt.startTime, source: 'restore',
		}, { checkTombstone: true });
		const revived = (await restarted.listSessionsV2Receipts()).find(candidate => candidate.session === receipt.session);
		await restarted.close();
		assert.deepStrictEqual({
			evictedHash, warmReceipts, receipts, excluded, hidden, revivedHash: revived?.payloadHash,
		}, {
			evictedHash: encoded.value.payloadHash, warmReceipts: receipts,
			receipts: [{
				session, provider: 'copilotcli', startTime: 1, sessionGeneration: 'generation', sourceRevision: 1,
				payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION, payloadHash: encoded.value.payloadHash,
				external: false, isChatBacking: false, modifiedTime: 1, payloadDirty: 0, source: 'explicit', verified: true,
			}],
			excluded: 'excluded', hidden: undefined, revivedHash: encoded.value.payloadHash,
		});
	});

	test('catalog synchronization settles after an older writer replaces a snapshot without its runtime hash bridge', async () => {
		const db = await database();
		const fileService = files();
		const session = URI.parse('ahp-session:/new');
		await db.prepareSessionStorage(session.toString(), 'copilotcli');
		await db.registerRuntimeSession(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const modern = new SessionDataService(URI.file(directory), fileService, new NullLogService(), undefined, db.identity);
		const first = await new AgentHostCatalogSyncService(modern, db, new NullLogService()).synchronize(session, {
			data: payload(session.toString()), legacyMetadata: { customTitle: 'Conversation' },
		});
		await db.close();
		const old = store.add(new AgentHostDatabase(join(directory, 'agent-host.db')));
		const oldData = new SessionDataService(URI.file(directory), fileService, new NullLogService());
		const oldWritten = await new AgentHostCatalogSyncService(oldData, old, new NullLogService()).synchronize(URI.parse('copilotcli:/new'), {
			data: { ...payload('copilotcli:/new'), summary: 'Edited by stable' },
			legacyMetadata: { customTitle: 'Edited by stable' },
		});
		await old.close();
		const upgraded = await database();
		const upgradedData = new SessionDataService(URI.file(directory), fileService, new NullLogService(), undefined, upgraded.identity);
		const sync = new AgentHostCatalogSyncService(upgradedData, upgraded, new NullLogService());
		const request = { data: { ...payload(session.toString()), summary: 'Edited by stable' }, legacyMetadata: { customTitle: 'Edited by stable' } };
		const settled = await sync.synchronize(session, request);
		const repeated = await sync.synchronize(session, request);
		const ref = upgradedData.openDatabase(session);
		const source = await ref.object.getCatalogSyncSnapshot();
		const central = await upgraded.getSessionV2(session.toString());
		ref.dispose();
		assert.deepStrictEqual({
			first: first.status,
			oldWritten: oldWritten.status,
			settled,
			repeated,
			sourceState: source?.state,
			matches: matchesAcknowledgedCatalogReceipt(source, central),
		}, {
			first: 'acknowledged', oldWritten: 'acknowledged',
			settled: { status: 'acknowledged', sourceRevision: 2 },
			repeated: { status: 'acknowledged', sourceRevision: 2 },
			sourceState: 'acknowledged', matches: true,
		});
	});

	test('peer storage and URI-keyed titles and drafts are writable through both readers', async () => {
		const db = await database();
		await db.prepareSessionStorage('ahp-session:/new', 'copilotcli');
		const modern = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, db.identity);
		const old = new SessionDataService(URI.file(directory), files(), new NullLogService());
		const runtimeChat = URI.parse(buildChatUri('ahp-session:/new', 'peer'));
		const storageChat = URI.parse(buildChatUri('copilotcli:/new', 'peer'));
		const first = modern.openDatabase(runtimeChat);
		await first.object.createTurn('new-turn');
		await first.object.setMetadata(`customChatTitle:${runtimeChat}`, 'Initial title');
		await first.object.setChatDraft(runtimeChat, { text: 'Unsent draft', origin: { kind: MessageKind.User } });
		first.dispose();
		const legacy = old.openDatabase(storageChat);
		const draft = await legacy.object.getChatDraft(storageChat);
		await legacy.object.createTurn('old-turn');
		await legacy.object.setTurnEventId('old-turn', 'old-event');
		await legacy.object.setMetadata(`customChatTitle:${storageChat}`, 'Renamed by old');
		legacy.dispose();
		const restored = modern.openDatabase(runtimeChat);
		const title = await restored.object.getMetadata(`customChatTitle:${runtimeChat}`);
		const oldTurn = await restored.object.getNextTurnEventId('new-turn');
		restored.dispose();
		assert.deepStrictEqual({
			sameDirectory: modern.getSessionDataDir(runtimeChat).toString() === old.getSessionDataDir(storageChat).toString(),
			draft: draft?.text, title, oldTurn,
		}, { sameDirectory: true, draft: 'Unsent draft', title: 'Renamed by old', oldTurn: 'old-event' });
	});

	test('concurrent provider claims cannot leave conflicting durable identity markers', async () => {
		const first = await database();
		const second = await database();
		const results = await Promise.allSettled([
			first.prepareSessionStorage('ahp-session:/claimed', 'copilotcli'),
			second.prepareSessionStorage('ahp-session:/claimed', 'claude'),
		]);
		await first.close();
		await second.close();
		const next = await database();
		assert.deepStrictEqual({
			claims: results.map(result => result.status).sort(),
			identities: (await next.raw.readStorageIdentityMetadata('sessionStorageIdentity:')).length,
			storage: ['copilotcli:/claimed', 'claude:/claimed'].filter(uri => next.identity.toRuntime(uri) === 'ahp-session:/claimed').length,
		}, { claims: ['fulfilled', 'rejected'], identities: 1, storage: 1 });
	});

	for (const tombstone of ['tombstoneAndUnregisterSession', 'markSessionTombstoned'] as const) {
		test(`${tombstone} cannot race compatibility allocation into hiding a deletion`, async () => {
			const db = await database();
			const session = 'ahp-session:/allocating';
			const entered = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			const claim = stub(db.raw, 'setStorageIdentityMetadata');
			store.add(toDisposable(() => claim.restore()));
			claim.callsFake(async (key, value) => {
				await entered.complete();
				await release.p;
				claim.restore();
				await db.raw.setStorageIdentityMetadata(key, value);
			});
			const preparing = db.prepareSessionStorage(session, 'copilotcli');
			await entered.p;
			const deleting = db[tombstone](session);
			await release.complete();
			await Promise.all([preparing, deleting]);
			const registered = await db.registerRuntimeSession(session, { provider: 'copilotcli', startTime: 1, source: 'discovery' }, {
				checkTombstone: true, discoveryBackingSession: 'copilotcli:/allocating',
			});
			assert.deepStrictEqual({
				registered,
				tombstoned: await db.isSessionTombstoned(session),
				storedTombstone: await db.raw.isSessionTombstoned('copilotcli:/allocating'),
				registrations: await db.listSessionV2Registrations(),
			}, { registered: false, tombstoned: true, storedTombstone: true, registrations: [] });
		});
	}

	test('old peer additions, removal, archive and origin edits survive upgrade', async () => {
		const db = await database();
		const session = URI.parse('ahp-session:/new');
		await db.prepareSessionStorage(session.toString(), 'copilotcli');
		await db.registerRuntimeSession(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const modern = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, db.identity);
		const peers = new AgentHostPeerChatStore(db, modern, new NullLogService(), createLiveChatOwnership(() => undefined, () => undefined));
		const first = buildChatUri(session, 'first');
		await peers.replace(session, [{ uri: first, providerData: 'sdk-first' }]);
		const old = new SessionDataService(URI.file(directory), files(), new NullLogService());
		const oldRef = old.openDatabase(URI.parse('copilotcli:/new'));
		const oldPeers = JSON.parse((await oldRef.object.getMetadata('peerChats'))!);
		const replacement = buildChatUri('copilotcli:/new', 'replacement');
		const origin = { kind: ChatOriginKind.Fork, chat: buildDefaultChatUri('copilotcli:/new'), turnId: 'old-turn' };
		await oldRef.object.setMetadata('peerChats', JSON.stringify([{ uri: replacement, archived: true, providerData: 'sdk-replacement', origin }]));
		oldRef.dispose();
		const oldPeerRef = old.openDatabase(URI.parse(replacement));
		await oldPeerRef.object.setMetadata('agentHost.chatProviderData', 'sdk-replacement');
		oldPeerRef.dispose();
		const restored = await peers.reconcileLegacy(session);
		assert.deepStrictEqual({
			oldPeers,
			restored,
			legacyAuthority: db.requiresLegacyChatCatalog(session.toString()),
		}, {
			oldPeers: [{ uri: buildChatUri('copilotcli:/new', 'first'), providerData: 'sdk-first' }],
			restored: [{ uri: buildChatUri(session, 'replacement'), archived: true, providerData: 'sdk-replacement', origin: { ...origin, chat: buildDefaultChatUri(session) } }],
			legacyAuthority: true,
		});
	});

	test('chat suffixes and path-subagent IDs survive encoding exactly', () => {
		const codec = new SessionStorageIdentity();
		codec.add({ runtime: 'ahp-session:/new', storage: 'codex:/new', provider: 'codex' });
		const suffix = '?generation=123#selection';
		const runtime = buildSubagentChatUri('ahp-session:/new', 'call/1') + suffix;
		const storage = codec.toStorage(runtime);
		const subagent = buildSubagentSessionUri('ahp-session:/new', 'call-1');
		assert.deepStrictEqual({
			storage,
			runtime: codec.toRuntime(storage),
			subagent: codec.toRuntime(codec.toStorage(subagent)),
		}, {
			storage: buildSubagentChatUri('codex:/new', 'call/1') + suffix,
			runtime, subagent,
		});
	});

	test('known metadata references translate while opaque data and persisted conversation payloads do not', async () => {
		const db = await database();
		await db.prepareSessionStorage('ahp-session:/new', 'claude');
		const data = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, db.identity);
		const session = URI.parse('ahp-session:/new');
		const chat = buildChatUri(session, 'peer');
		const ref = data.openDatabase(session);
		const creation = { session: session.toString(), chat, turnId: 'source' };
		const delegation = { sourceSession: session.toString(), sourceChat: chat, sourceTurnId: 'source' };
		const conversation = JSON.stringify({ text: 'ahp-session:/new', resource: session.toString(), providerData: { session: session.toString() } });
		await ref.object.setMetadataValues({
			'agentHost.createdBySession': JSON.stringify(creation),
			'peerChatBacking': chat,
			'providerData': conversation,
		});
		await ref.object.createTurn('turn');
		await ref.object.setTurnDelegation('turn', JSON.stringify(delegation));
		await ref.object.insertPersistedTurn({ kind: 'local', turnId: 'turn', chatUri: chat, anchorTurnId: undefined, payload: conversation });
		ref.dispose();
		const old = new SessionDataService(URI.file(directory), files(), new NullLogService());
		const legacy = old.openDatabase(URI.parse('claude:/new'));
		const oldCreation = JSON.parse((await legacy.object.getMetadata('agentHost.createdBySession'))!);
		const oldDelegation = JSON.parse((await legacy.object.getTurnDelegations()).get('turn')!);
		const oldTurn = (await legacy.object.getPersistedTurns())[0];
		assert.deepStrictEqual({ oldCreation, oldDelegation, oldTurn: { chatUri: oldTurn.chatUri, payload: oldTurn.payload }, opaque: await legacy.object.getMetadata('providerData') }, {
			oldCreation: { ...creation, session: 'claude:/new', chat: buildChatUri('claude:/new', 'peer') },
			oldDelegation: { ...delegation, sourceSession: 'claude:/new', sourceChat: buildChatUri('claude:/new', 'peer') },
			oldTurn: { chatUri: buildChatUri('claude:/new', 'peer'), payload: conversation },
			opaque: conversation,
		});
		legacy.dispose();
	});

	test('draft-owned chat attachments and delegation translate without rewriting text or provider metadata', () => {
		const codec = new SessionStorageIdentity();
		codec.add({ runtime: 'ahp-session:/new', storage: 'copilotcli:/new', provider: 'copilotcli' });
		const chat = buildChatUri('ahp-session:/new', 'peer');
		const draft: Message = {
			text: chat, origin: { kind: MessageKind.Agent },
			attachments: [{ type: MessageAttachmentKind.Chat, label: 'Chat', resource: chat }],
			_meta: { opaque: { resource: chat }, ...toAgentMessageDelegationMeta({ sourceSession: 'ahp-session:/new', sourceChat: chat }) },
		};
		const stored = codec.message(draft, 'storage');
		assert.deepStrictEqual({
			text: stored?.text,
			resource: stored?.attachments?.[0],
			delegation: readAgentMessageDelegationMeta(stored!),
			opaque: stored?._meta?.opaque,
			runtime: codec.message(stored, 'runtime'),
		}, {
			text: chat,
			resource: { ...draft.attachments![0], resource: buildChatUri('copilotcli:/new', 'peer') },
			delegation: { sourceSession: 'copilotcli:/new', sourceChat: buildChatUri('copilotcli:/new', 'peer') },
			opaque: { resource: chat }, runtime: draft,
		});
	});

	test('cancelled source writes cannot replace the durable compact receipt hash', async () => {
		const db = await database();
		await db.prepareSessionStorage('ahp-session:/new', 'copilotcli');
		const data = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, db.identity);
		const session = URI.parse('ahp-session:/new');
		const ref = data.openDatabase(session);
		const encoded = encodeAgentHostCatalogPayload(payload(session.toString()));
		assert.ok(encoded.ok);
		const identity = { sessionGeneration: 'generation', sourceRevision: 1, projectionVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION, payloadHash: encoded.value.payloadHash };
		await ref.object.setMetadataValuesAndCatalogSyncSnapshot({ customTitle: 'Kept' }, { ...identity, state: 'pending', payload: encoded.value.payload });
		await ref.object.acknowledgeCatalogSyncSnapshot(identity);
		for (let index = 0; index < 270; index++) {
			const next = encodeAgentHostCatalogPayload({ ...payload(session.toString()), summary: `Cancelled ${index}` });
			assert.ok(next.ok);
			await ref.object.setMetadataValuesAndCatalogSyncSnapshot({ customTitle: 'Cancelled' }, { ...identity, sourceRevision: index + 2, state: 'pending', payload: next.value.payload, payloadHash: next.value.payloadHash }, () => false);
		}
		ref.dispose();
		await db.close();
		const restarted = await database();
		const fresh = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, restarted.identity).openDatabase(session);
		assert.deepStrictEqual({ title: await fresh.object.getMetadata('customTitle'), receipt: await fresh.object.getCatalogSyncSnapshot() }, {
			title: 'Kept', receipt: { ...identity, state: 'acknowledged', payload: undefined, acknowledgedHash: identity.payloadHash },
		});
		fresh.dispose();
	});

	test('unmapped payload bytes and invalid or future projections remain available to their owning reader', () => {
		const codec = new SessionStorageIdentity();
		codec.add({ runtime: 'ahp-session:/new', storage: 'copilotcli:/new', provider: 'copilotcli' });
		const encoded = encodeAgentHostCatalogPayload(payload('ahp-session:/unmapped'));
		assert.ok(encoded.ok);
		const noncanonical = ' \n' + encoded.value.payload;
		assert.deepStrictEqual([
			codec.record({ payload: noncanonical }, 'storage').payload,
			codec.record({ payload: 'invalid' }, 'runtime').payload,
			codec.record({ payload: '{"payloadVersion":99}' }, 'runtime').payload,
		], [noncanonical, 'invalid', '{"payloadVersion":99}']);
	});

	test('pending acknowledgements survive eviction of unrelated checksum translations', async () => {
		const db = await database();
		await db.prepareSessionStorage('ahp-session:/new', 'copilotcli');
		const data = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, db.identity);
		const ref = data.openDatabase(URI.parse('ahp-session:/new'));
		const encoded = encodeAgentHostCatalogPayload(payload('ahp-session:/new'));
		assert.ok(encoded.ok);
		const identity = { sessionGeneration: 'generation', sourceRevision: 1, projectionVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION, payloadHash: encoded.value.payloadHash };
		await ref.object.setMetadataValuesAndCatalogSyncSnapshot({}, { ...identity, state: 'pending', payload: encoded.value.payload });
		for (let index = 0; index < 270; index++) {
			const other = encodeAgentHostCatalogPayload({ ...payload('ahp-session:/new'), summary: `Other ${index}` });
			assert.ok(other.ok);
			db.identity.record({ payload: other.value.payload, payloadHash: other.value.payloadHash }, 'storage');
		}
		assert.deepStrictEqual({
			acknowledged: await ref.object.acknowledgeCatalogSyncSnapshot(identity),
			receipt: await ref.object.getCatalogSyncSnapshot(),
		}, {
			acknowledged: true, receipt: { ...identity, state: 'acknowledged', payload: undefined, acknowledgedHash: identity.payloadHash },
		});
		ref.dispose();
	});

	for (const provider of ['copilotcli', 'claude', 'codex']) {
		for (const errorCode of [FileSystemProviderErrorCode.NoPermissions, FileSystemProviderErrorCode.Unavailable]) {
			test(`${provider} discovery does not change native storage when its directory stat fails with ${errorCode}`, async () => {
				const db = await database();
				const fileService = files();
				const data = new SessionDataService(URI.file(directory), fileService, new NullLogService(), undefined, db.identity);
				const session = URI.parse('ahp-session:/discovered');
				const backing = URI.parse(`${provider}:/discovered`);
				const peer = URI.parse(buildChatUri(session, 'peer'));
				const root = data.openDatabase(session);
				await root.object.setMetadata('peerChats', JSON.stringify([{ uri: peer.toString() }]));
				root.dispose();
				const storedPeer = data.openDatabase(peer);
				await storedPeer.object.setChatDraft(peer, { text: 'Existing native draft', origin: { kind: MessageKind.User } });
				storedPeer.dispose();

				const disk = fileService.getProvider(Schemas.file)!;
				const failure = createFileSystemProviderError('Session directory stat failed', errorCode);
				const failingStat = stub(disk, 'stat').callThrough();
				failingStat.withArgs(match(resource => URI.isUri(resource) && isEqual(resource, data.getSessionDataDir(session)))).rejects(failure);
				store.add(toDisposable(() => failingStat.restore()));
				const log = new NullLogService();
				const warnings = stub(log, 'warn');
				store.add(toDisposable(() => warnings.restore()));
				const service = store.add(createTestAgentService(
					log, fileService, data, { _serviceBrand: undefined } as IProductService, createNoopGitService(),
					undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, db,
				));
				const agent = store.add(new MockAgent(provider));
				await agent.chats.createChat(URI.parse(buildDefaultChatUri(backing)), backing);
				registerTestAgentProvider(service, agent);
				await service.listSessions();
				const markers = await db.raw.readStorageIdentityMetadata('sessionStorageIdentity:');
				const registrations = await db.raw.listSessionV2Registrations();
				service.dispose();
				failingStat.restore();
				const draftRef = await data.tryOpenDatabase(peer);
				const draft = await draftRef?.object.getChatDraft(peer);
				draftRef?.dispose();
				assert.deepStrictEqual({
					storage: db.identity.toStorage(session.toString()),
					markers,
					registrations,
					loggedFailure: warnings.getCalls().some(call => typeof call.args[0] === 'string' && call.args[0].includes('Failed to register discovered chat') && call.args[1] instanceof Error),
					draft: draft?.text,
				}, {
					storage: session.toString(), markers: [], registrations: [], loggedFailure: true, draft: 'Existing native draft',
				});
			});
		}

		for (const existingData of [false, true]) {
			test(`${provider} discovery preserves ${existingData ? 'existing native data' : 'first-admission compatibility across a stable roundtrip'}`, async () => {
				const db = await database();
				const fileService = files();
				const data = new SessionDataService(URI.file(directory), fileService, new NullLogService(), undefined, db.identity);
				const session = URI.parse('ahp-session:/discovered');
				const backing = URI.parse(`${provider}:/discovered`);
				const peer = URI.parse(buildChatUri(session, 'peer'));
				if (existingData) {
					const root = data.openDatabase(session);
					await root.object.setMetadata('peerChats', JSON.stringify([{ uri: peer.toString() }]));
					root.dispose();
					const storedPeer = data.openDatabase(peer);
					await storedPeer.object.setChatDraft(peer, { text: 'Existing native draft', origin: { kind: MessageKind.User } });
					storedPeer.dispose();
				}
				const service = store.add(createTestAgentService(
					new NullLogService(), fileService, data, { _serviceBrand: undefined } as IProductService, createNoopGitService(),
					undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, db,
				));
				const agent = store.add(new MockAgent(provider));
				await agent.chats.createChat(URI.parse(buildDefaultChatUri(backing)), backing);
				registerTestAgentProvider(service, agent);
				await service.listSessions();
				const registered = (await db.raw.listSessionV2Registrations()).map(row => row.session);
				const draftRef = existingData ? await data.tryOpenDatabase(peer) : undefined;
				const draft = await draftRef?.object.getChatDraft(peer);
				draftRef?.dispose();
				service.dispose();
				await db.close();
				if (!existingData) {
					const old = store.add(new AgentHostDatabase(join(directory, 'agent-host.db')));
					await old.registerRuntimeSession(backing.toString(), { provider, startTime: 1, source: 'discovery' }, { checkTombstone: true });
					await old.close();
				}
				const next = await database();
				const registry = store.add(new AgentSessionRegistry(next));
				const resolution = (await registry.resolveDiscoveredSessionIdentities(provider, [backing])).get(backing.toString());
				assert.deepStrictEqual({
					registered,
					sessions: (await next.listSessionV2Registrations()).map(row => row.session),
					resolution: resolution?.status === 'resolved' ? { status: resolution.status, session: resolution.session.toString() } : resolution,
					draft: draft?.text,
				}, {
					registered: [existingData ? session.toString() : backing.toString()],
					sessions: [session.toString()],
					resolution: { status: 'resolved', session: session.toString() },
					draft: existingData ? 'Existing native draft' : undefined,
				});
			});
		}

		for (const writeCompatibility of [true, false]) {
			test(`${provider} allocation (${writeCompatibility ? 'compatible' : 'native'}) and peer restore use the storage boundary in a fresh service graph`, async () => {
				const db = await database(writeCompatibility);
				const fileService = files();
				const modern = new SessionDataService(URI.file(directory), fileService, new NullLogService(), undefined, db.identity);
				const createService = (database: CompatibleAgentHostDatabase, data: SessionDataService) => store.add(createTestAgentService(
					new NullLogService(), fileService, data, { _serviceBrand: undefined } as IProductService, createNoopGitService(),
					undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, database,
				));
				const creating = createService(db, modern);
				const agent = store.add(new class extends MockAgent {
					override async createChat() { return { providerData: 'peer-backing' }; }
				}(provider));
				registerTestAgentProvider(creating, agent);
				const session = await creating.createSession({ legacyChatUris: true, provider });
				const peer = URI.parse(buildChatUri(session, 'peer'));
				await creating.createChat(session, peer);
				const state = getTestAgentStateManager(creating).getSessionState(session.toString());
				const stored = await db.raw.listSessionV2Registrations();
				creating.dispose();
				await modern.whenIdle();
				await db.close();
				const next = await database(!writeCompatibility);
				const restoredData = new SessionDataService(URI.file(directory), fileService, new NullLogService(), undefined, next.identity);
				const restored = createService(next, restoredData);
				const fresh = store.add(new MockAgent(provider));
				await fresh.chats.createChat(URI.parse(buildDefaultChatUri(session)), session);
				registerTestAgentProvider(restored, fresh);
				await restored.restoreSession(session);
				assert.deepStrictEqual({
					runtime: session.scheme,
					provider: state?.provider,
					storage: stored.map(row => row.session),
					chats: getTestAgentStateManager(restored).getSessionState(session.toString())?.chats.map(chat => chat.resource),
				}, {
					runtime: 'ahp-session', provider,
					storage: [writeCompatibility ? session.with({ scheme: provider }).toString() : session.toString()],
					chats: [buildDefaultChatUri(session), peer.toString()],
				});
			});
		}
	}
	suite('opaque chats', () => {
		const session = 'ahp-session:/opaque';
		const storageSession = 'copilotcli:/opaque';
		const defaultChat = 'ahp-chat:/11111111-1111-4111-8111-111111111111';
		const peer = 'ahp-chat:/22222222-2222-4222-8222-222222222222';
		const subagent = 'ahp-chat:/33333333-3333-4333-8333-333333333333';
		const nested = 'ahp-chat:/44444444-4444-4444-8444-444444444444';
		const clientChosen = 'ahp-chat:/x/y';
		const oldPeer = buildChatUri(session, 'old');
		const stored = {
			defaultChat: buildDefaultChatUri(storageSession),
			peer: buildChatUri(storageSession, '22222222-2222-4222-8222-222222222222'),
			subagent: buildSubagentChatUri(storageSession, 'call/1'),
			nested: buildSubagentChatUri(storageSession, 'call/2'),
			clientChosen: buildChatUri(storageSession, uuidFromSha1(clientChosen)),
			oldPeer: buildChatUri(storageSession, 'old'),
		};

		async function compatibilitySession() {
			const db = await database();
			await db.prepareSessionStorage(session, 'copilotcli');
			await db.registerRuntimeSession(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			db.recordChatStorageIdentity(session, defaultChat, { kind: 'default', generation: undefined });
			db.recordChatStorageIdentity(session, peer, { kind: 'peer' });
			db.recordChatStorageIdentity(session, subagent, { kind: 'subagent', toolCallId: 'call/1' });
			db.recordChatStorageIdentity(session, nested, { kind: 'subagent', toolCallId: 'call/2' });
			db.recordChatStorageIdentity(session, clientChosen, { kind: 'peer' });
			db.recordChatStorageIdentity(session, oldPeer, { kind: 'peer' });
			return db;
		}

		function payloadChats(value: string): string[] | undefined {
			const decoded = decodeAgentHostCatalogPayloadData(value);
			return decoded.ok ? decoded.value.chats.map(chat => chat.uri) : undefined;
		}

		function turn(id: string): Turn {
			return {
				id, state: TurnState.Complete, usage: undefined,
				message: {
					text: `see ${peer}`, origin: { kind: MessageKind.User },
					attachments: [{ type: MessageAttachmentKind.Chat, label: 'Peer', resource: peer }],
					_meta: toAgentMessageDelegationMeta({ sourceSession: session, sourceChat: oldPeer }),
				},
				responseParts: [{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						status: ToolCallStatus.Completed, toolCallId: 'call/1', toolName: 'task', displayName: 'Task', invocationMessage: 'Task',
						success: true, pastTenseMessage: 'Task', confirmed: ToolCallConfirmationReason.NotNeeded,
						_meta: { subagentChatUri: subagent, opaque: peer },
						content: [{ type: ToolResultContentType.Subagent, resource: subagent, title: 'Worker' }, { type: ToolResultContentType.Text, text: nested }],
					},
				}],
			};
		}

		test('records exactly the opaque chats of a compatibility session and reload them after restart', async () => {
			const db = await compatibilitySession();
			db.recordChatStorageIdentity('ahp-session:/native', 'ahp-chat:/55555555-5555-4555-8555-555555555555', { kind: 'peer' });
			await db.close();
			const next = await database();
			const recorded = (await next.raw.readStorageIdentityMetadata('chatStorageIdentity:')).map(entry => ({ key: entry.key, value: JSON.parse(entry.value) }));
			assert.deepStrictEqual({
				recorded: recorded.sort((a, b) => a.key.localeCompare(b.key)),
				storage: [defaultChat, peer, subagent, nested, clientChosen, oldPeer].map(chat => next.identity.toStorage(chat)),
				runtime: Object.values(stored).map(chat => next.identity.toRuntime(chat)),
			}, {
				recorded: [defaultChat, peer, subagent, nested, clientChosen].map(chat => ({ key: `chatStorageIdentity:${chat}`, value: { runtime: chat, storage: next.identity.toStorage(chat) } })).sort((a, b) => a.key.localeCompare(b.key)),
				storage: Object.values(stored),
				runtime: [defaultChat, peer, subagent, nested, clientChosen, oldPeer],
			});
		});

		test('every store holds only the shaped spelling and reads back the runtime chat', async () => {
			const db = await compatibilitySession();
			const modern = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, db.identity);
			const old = new SessionDataService(URI.file(directory), files(), new NullLogService());
			const origin = JSON.stringify({ kind: ChatOriginKind.Tool, chat: peer, toolCallId: 'call/1' });

			await db.replaceSessionChatCatalog(session, [
				{ chat: peer, order: 0, origin: JSON.stringify({ kind: ChatOriginKind.Fork, chat: defaultChat, turnId: 'turn' }) },
				{ chat: oldPeer, order: 1 },
			], undefined);
			const catalogPayload: AgentHostCatalogData = {
				modifiedTime: 2, summary: 'Conversation', isRead: true, isArchived: false, workingDirectories: [],
				chats: [{ uri: defaultChat, order: 0, kind: 'default' }, { uri: peer, order: 1, kind: 'peer' }, { uri: oldPeer, order: 2, kind: 'peer' }],
			};
			const encoded = encodeAgentHostCatalogPayload(catalogPayload);
			assert.ok(encoded.ok);
			await db.upsertSessionV2({
				session, sessionGeneration: 'generation', sourceRevision: 1, payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION, verified: true,
				payload: encoded.value.payload, payloadHash: encoded.value.payloadHash,
			}, undefined);
			const sessionRef = modern.openDatabase(URI.parse(session));
			await sessionRef.object.setMetadataValues({
				[`customChatTitle:${peer}`]: 'Peer title',
				'agentHost.chatOrigin': origin,
				'peerChatBacking': subagent,
			});
			await sessionRef.object.setMetadataValuesAndCatalogSyncSnapshot({}, {
				sessionGeneration: 'generation', sourceRevision: 1, projectionVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION, state: 'pending',
				payload: encoded.value.payload, payloadHash: encoded.value.payloadHash,
			});
			sessionRef.dispose();
			const peerRef = modern.openDatabase(URI.parse(peer));
			await peerRef.object.setChatDraft(URI.parse(peer), { text: 'draft', origin: { kind: MessageKind.User }, attachments: [{ type: MessageAttachmentKind.Chat, label: 'Worker', resource: subagent }] });
			await peerRef.object.createTurn('turn');
			await peerRef.object.setTurnDelegation('turn', JSON.stringify({ sourceSession: session, sourceChat: peer, sourceTurnId: 'source' }));
			await peerRef.object.insertPersistedTurn({ kind: 'local', turnId: 'turn', chatUri: peer, anchorTurnId: undefined, payload: JSON.stringify(turn('turn')) });
			peerRef.dispose();

			const oldSession = old.openDatabase(URI.parse(storageSession));
			const oldPeerRef = old.openDatabase(URI.parse(stored.peer));
			const storedRows = {
				sessionChats: (await db.raw.getSessionChatCatalog(storageSession))?.chats.map(chat => [chat.chat, chat.origin]),
				catalogPayload: payloadChats((await db.raw.getSessionV2(storageSession))!.payload),
				metadata: [await oldSession.object.getMetadata(`customChatTitle:${stored.peer}`), await oldSession.object.getMetadata('agentHost.chatOrigin'), await oldSession.object.getMetadata('peerChatBacking')],
				catalogSyncSnapshot: payloadChats((await oldSession.object.getCatalogSyncSnapshot())?.payload ?? ''),
				draft: (await oldPeerRef.object.getChatDraft(URI.parse(stored.peer)))?.attachments,
				localTurn: (await oldPeerRef.object.getPersistedTurns()).map(record => [record.chatUri, JSON.parse(record.payload)]),
				delegation: JSON.parse((await oldPeerRef.object.getTurnDelegations()).get('turn')!),
				directories: [peer, subagent, clientChosen, oldPeer].map(chat => modern.getSessionDataDir(URI.parse(chat)).toString()),
			};
			oldSession.dispose();
			oldPeerRef.dispose();
			const storedTurn = turn('turn');
			const expectedStoredTurn: Turn = {
				...storedTurn,
				message: {
					...storedTurn.message,
					attachments: [{ type: MessageAttachmentKind.Chat, label: 'Peer', resource: stored.peer }],
					_meta: toAgentMessageDelegationMeta({ sourceSession: storageSession, sourceChat: stored.oldPeer }),
				},
				responseParts: [{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						...(storedTurn.responseParts[0] as ToolCallResponsePart).toolCall,
						_meta: { subagentChatUri: stored.subagent, opaque: peer },
						content: [{ type: ToolResultContentType.Subagent, resource: stored.subagent, title: 'Worker' }, { type: ToolResultContentType.Text, text: nested }],
					} as ToolCallResponsePart['toolCall'],
				}],
			};
			assert.deepStrictEqual(storedRows, {
				sessionChats: [[stored.peer, JSON.stringify({ kind: ChatOriginKind.Fork, chat: stored.defaultChat, turnId: 'turn' })], [stored.oldPeer, undefined]],
				catalogPayload: [stored.defaultChat, stored.peer, stored.oldPeer],
				metadata: ['Peer title', JSON.stringify({ kind: ChatOriginKind.Tool, chat: stored.peer, toolCallId: 'call/1' }), stored.subagent],
				catalogSyncSnapshot: [stored.defaultChat, stored.peer, stored.oldPeer],
				draft: [{ type: MessageAttachmentKind.Chat, label: 'Worker', resource: stored.subagent }],
				localTurn: [[stored.peer, JSON.parse(JSON.stringify(expectedStoredTurn))]],
				delegation: { sourceSession: storageSession, sourceChat: stored.peer, sourceTurnId: 'source' },
				directories: [stored.peer, stored.subagent, stored.clientChosen, stored.oldPeer].map(chat => old.getSessionDataDir(URI.parse(chat)).toString()),
			});

			await db.close();
			const next = await database();
			const restored = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, next.identity);
			const restoredSession = restored.openDatabase(URI.parse(session));
			const restoredPeer = restored.openDatabase(URI.parse(peer));
			assert.deepStrictEqual({
				sessionChats: (await next.getSessionChatCatalog(session))?.chats.map(chat => chat.chat),
				catalogPayload: (await next.getSessionV2(session))?.payload,
				owner: (await next.findCentralChatOwners([peer])).get(peer)?.ownerSession,
				metadata: [await restoredSession.object.getMetadata(`customChatTitle:${peer}`), await restoredSession.object.getMetadata('peerChatBacking')],
				draft: (await restoredPeer.object.getChatDraft(URI.parse(peer)))?.attachments,
				localTurn: (await restoredPeer.object.getPersistedTurns()).map(record => [record.chatUri, record.payload]),
			}, {
				sessionChats: [peer, oldPeer],
				catalogPayload: encoded.value.payload,
				owner: session,
				metadata: ['Peer title', subagent],
				draft: [{ type: MessageAttachmentKind.Chat, label: 'Worker', resource: subagent }],
				localTurn: [[peer, JSON.stringify(turn('turn'))]],
			});
			restoredSession.dispose();
			restoredPeer.dispose();
		});

		test('a normalized catalog written in the storage spelling reads its opaque chats back', async () => {
			const db = await compatibilitySession();
			// A future native writer of this session keeps its normalized catalog in the storage spelling.
			const normalized = await db.raw.registerChatCatalogV2(storageSession, {
				defaultChat: { chat: stored.defaultChat, order: 0 },
				peers: [{ chat: stored.peer, order: 1 }],
				privateDescendants: [{ chat: stored.subagent, parentChat: stored.peer, origin: JSON.stringify({ kind: ChatOriginKind.Tool, chat: stored.peer, toolCallId: 'call/1' }) }],
			});
			assert.deepStrictEqual(normalized, { status: 'applied', catalogRevision: 1 });
			assert.deepStrictEqual({
				storedHeader: (await db.raw.readSessionRegistrations()).normalizedCatalogs,
				header: (await db.readSessionRegistrations()).normalizedCatalogs,
				chats: [(await db.readChatV2(session, peer)).chat?.chat, (await db.readChatV2(session, subagent)).chat?.parentChat],
				owner: (await db.findCentralChatOwners([subagent])).get(subagent)?.ownerSession,
			}, {
				storedHeader: [{ session: storageSession, defaultChatUri: stored.defaultChat }],
				header: [{ session, defaultChatUri: defaultChat }],
				chats: [peer, peer],
				owner: session,
			});
		});

		test('a peer keeps its canonical uuid in storage and any other chat URI gets a stable uuid from its SHA-1', () => {
			const codec = new SessionStorageIdentity();
			codec.add({ runtime: session, storage: storageSession, provider: 'copilotcli' });
			const withQuery = `${peer}?one`;
			for (const chat of [peer, clientChosen, withQuery]) {
				codec.addChat({ runtime: chat, storage: storedChatUri(storageSession, chat, { kind: 'peer' }) });
			}
			const storage = [peer, clientChosen, withQuery].map(chat => codec.toStorage(chat));
			assert.deepStrictEqual({
				storage,
				runtime: storage.map(chat => codec.toRuntime(chat)),
				sha: [uuidFromSha1(clientChosen), uuidFromSha1(withQuery)],
			}, {
				storage: [
					buildChatUri(storageSession, '22222222-2222-4222-8222-222222222222'),
					buildChatUri(storageSession, 'a28e6494-36dc-538a-acde-27b9e4f28c3b'),
					buildChatUri(storageSession, uuidFromSha1(withQuery)),
				],
				runtime: [peer, clientChosen, withQuery],
				sha: ['a28e6494-36dc-538a-acde-27b9e4f28c3b', '7c7fdd3e-2691-5f99-bad5-6c649ab2cfd7'],
			});
		});

		test('chats without a record keep shaped directories or use the hash of their complete URI', () => {
			const data = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, new SessionStorageIdentity());
			const base = URI.joinPath(URI.file(directory), 'agentSessionData');
			const opaque = 'ahp-chat:/55555555-5555-4555-8555-555555555555';
			const sha = (value: string) => { const hash = new StringSHA1(); hash.update(value); return hash.digest(); };
			assert.deepStrictEqual([opaque, clientChosen, oldPeer, session].map(chat => data.getSessionDataDir(URI.parse(chat)).toString()), [
				URI.joinPath(base, `chat-${sha(opaque)}`).toString(),
				URI.joinPath(base, `chat-${sha(clientChosen)}`).toString(),
				URI.joinPath(base, `old-${oldPeer.slice('ahp-chat://old/'.length)}`).toString(),
				URI.joinPath(base, 'opaque').toString(),
			]);
		});

		test('a chat whose record never landed surfaces in its shaped runtime spelling after restart', async () => {
			const db = await database();
			await db.prepareSessionStorage(session, 'copilotcli');
			const write = stub(db.raw, 'setStorageIdentityMetadata').callsFake(() => new Promise<void>(() => { }));
			store.add(toDisposable(() => write.restore()));
			db.recordChatStorageIdentity(session, peer, { kind: 'peer' });
			const modern = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, db.identity);
			const ref = modern.openDatabase(URI.parse(peer));
			await ref.object.setChatDraft(URI.parse(peer), { text: 'draft', origin: { kind: MessageKind.User } });
			ref.dispose();
			await modern.whenIdle();
			// The host stops before the record lands.
			const next = await database();
			const restored = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, next.identity);
			const shaped = URI.parse(buildChatUri(session, '22222222-2222-4222-8222-222222222222'));
			const restoredRef = restored.openDatabase(shaped);
			assert.deepStrictEqual({
				runtime: next.identity.toRuntime(stored.peer),
				draft: (await restoredRef.object.getChatDraft(shaped))?.text,
				records: await next.raw.readStorageIdentityMetadata('chatStorageIdentity:'),
			}, { runtime: shaped.toString(), draft: 'draft', records: [] });
			restoredRef.dispose();
		});

		test('a recreated default chat keeps its generation in storage', async () => {
			const db = await database();
			await db.prepareSessionStorage(session, 'copilotcli');
			db.recordChatStorageIdentity(session, defaultChat, { kind: 'default', generation: 'regenerated' });
			await db.close();
			const next = await database();
			assert.strictEqual(next.identity.toStorage(defaultChat), `${buildDefaultChatUri(storageSession)}?generation=regenerated`);
		});

		test('chat records are immutable: recording again is idempotent and a chat that no longer exists keeps its record', async () => {
			const db = await database();
			await db.prepareSessionStorage(session, 'copilotcli');
			db.recordChatStorageIdentity(session, peer, { kind: 'peer' });
			// A rolled back createChat retries with the same URI.
			db.recordChatStorageIdentity(session, peer, { kind: 'peer' });
			await db.close();
			// An older build that never wrote the chat to its catalog leaves the record behind; nothing deletes it.
			const next = await database();
			next.recordChatStorageIdentity(session, peer, { kind: 'peer' });
			await next.close();
			const reopened = await database();
			assert.deepStrictEqual({
				storage: reopened.identity.toStorage(peer),
				chat: (await reopened.readChatV2(session, peer)).chat,
				records: (await reopened.raw.readStorageIdentityMetadata('chatStorageIdentity:')).map(entry => entry.key),
			}, {
				storage: reopened.identity.toStorage(peer),
				chat: undefined,
				records: [`chatStorageIdentity:${peer}`],
			});
		});

		test('an older build that deletes, adds and edits shaped chats leaves the records harmless on upgrade', async () => {
			const db = await compatibilitySession();
			const created = await db.replaceSessionChatCatalog(session, [{ chat: peer, order: 0 }, { chat: subagent, order: 1 }], undefined);
			const modern = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, db.identity);
			const defaultRef = modern.openDatabase(URI.parse(defaultChat));
			await defaultRef.object.setChatDraft(URI.parse(defaultChat), { text: 'new build draft', origin: { kind: MessageKind.User }, attachments: [] });
			defaultRef.dispose();
			await db.close();

			// The older build only knows the shaped rows: it removes the peer, adds one of its own and edits the default chat.
			const downgraded = await database();
			const newShapedPeer = buildChatUri(storageSession, 'from-old-build');
			const replaced = await downgraded.raw.replaceSessionChatCatalog(storageSession, [{ chat: stored.subagent, order: 0 }, { chat: newShapedPeer, order: 1 }], created.status === 'applied' ? created.revision : undefined);
			assert.strictEqual(replaced.status, 'applied');
			const old = new SessionDataService(URI.file(directory), files(), new NullLogService());
			const oldDefaultRef = old.openDatabase(URI.parse(stored.defaultChat));
			await oldDefaultRef.object.setChatDraft(URI.parse(stored.defaultChat), { text: 'old build draft', origin: { kind: MessageKind.User }, attachments: [] });
			oldDefaultRef.dispose();
			await downgraded.close();

			const upgraded = await database();
			const upgradedService = new SessionDataService(URI.file(directory), files(), new NullLogService(), undefined, upgraded.identity);
			const upgradedDefaultRef = upgradedService.openDatabase(URI.parse(defaultChat));
			const catalog = await upgraded.getSessionChatCatalog(session);
			assert.deepStrictEqual({
				chats: catalog?.chats.map(chat => chat.chat),
				draft: (await upgradedDefaultRef.object.getChatDraft(URI.parse(defaultChat)))?.text,
				deletedPeerStorage: upgraded.identity.toStorage(peer),
				deletedPeerRuntime: upgraded.identity.toRuntime(stored.peer),
				deletedPeerRecord: (await upgraded.raw.readStorageIdentityMetadata('chatStorageIdentity:')).some(entry => entry.key === `chatStorageIdentity:${peer}`),
				subagentRuntime: upgraded.identity.toRuntime(stored.subagent),
				newShapedPeerRuntime: upgraded.identity.toRuntime(newShapedPeer),
			}, {
				chats: [subagent, buildChatUri(session, 'from-old-build')],
				draft: 'old build draft',
				deletedPeerStorage: stored.peer,
				deletedPeerRuntime: peer,
				deletedPeerRecord: true,
				subagentRuntime: subagent,
				newShapedPeerRuntime: buildChatUri(session, 'from-old-build'),
			});
			upgradedDefaultRef.dispose();
		});

		test('chat records survive deleting the chat and the session, and the next start loads cleanly', async () => {
			const db = await database();
			const fileService = files();
			const modern = new SessionDataService(URI.file(directory), fileService, new NullLogService(), undefined, db.identity);
			const createService = (target: CompatibleAgentHostDatabase, data: SessionDataService) => store.add(createTestAgentService(
				new NullLogService(), fileService, data, { _serviceBrand: undefined } as IProductService, createNoopGitService(),
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, target,
			));
			const service = createService(db, modern);
			const agent = store.add(new class extends MockAgent {
				override async createChat() { return { providerData: 'peer-backing' }; }
			}('copilotcli'));
			registerTestAgentProvider(service, agent);
			const created = await service.createSession({ legacyChatUris: false, provider: 'copilotcli' });
			const opaquePeer = URI.parse('ahp-chat:/66666666-6666-4666-8666-666666666666');
			await service.createChat(created, opaquePeer);
			const recordKeys = async (target: CompatibleAgentHostDatabase) => (await target.raw.readStorageIdentityMetadata('chatStorageIdentity:')).map(entry => entry.key).sort();
			await db.close();
			const afterCreate = await recordKeys(await database());

			const second = await database();
			const secondData = new SessionDataService(URI.file(directory), fileService, new NullLogService(), undefined, second.identity);
			const restarted = createService(second, secondData);
			const fresh = store.add(new MockAgent('copilotcli'));
			await fresh.chats.createChat(URI.parse(defaultChat), created);
			registerTestAgentProvider(restarted, fresh);
			await restarted.restoreSession(created);
			await restarted.disposeChat(created, opaquePeer);
			await restarted.disposeSession(created);
			await secondData.whenIdle();
			await second.close();
			const afterDelete = await recordKeys(await database());
			assert.deepStrictEqual({ afterCreate: afterCreate.length, afterDelete }, { afterCreate: 2, afterDelete: afterCreate });
		});

		test('restoring a compatibility session registers its subagent chat in memory with its origin, without a catalog admission', async () => {
			const db = await database();
			const fileService = files();
			const warnings: string[] = [];
			const logService = new class extends NullLogService {
				override warn(message: string): void { warnings.push(message); }
			}();
			const createService = (target: CompatibleAgentHostDatabase) => store.add(createTestAgentService(
				logService, fileService, new SessionDataService(URI.file(directory), fileService, logService, undefined, target.identity), { _serviceBrand: undefined } as IProductService, createNoopGitService(),
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, target,
			));
			const creating = createService(db);
			registerTestAgentProvider(creating, store.add(new MockAgent('copilotcli')));
			const created = await creating.createSession({ legacyChatUris: false, provider: 'copilotcli' });
			await db.close();

			const second = await database();
			const restarted = createService(second);
			const agent = store.add(new MockAgent('copilotcli'));
			const toolCallId = 'historical-task';
			agent.sessionMessages = [
				{ type: 'message', session: created, role: 'user', messageId: 'user', content: 'Delegate', toolRequests: [] },
				{ type: 'message', session: created, role: 'assistant', messageId: 'assistant', content: '', toolRequests: [{ toolCallId, name: 'task' }] },
				{ type: 'tool_start', session: created, toolCallId, toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating', toolKind: 'subagent', subagentDescription: 'Historical Worker', subagentAgentName: 'explore' },
				{ type: 'subagent_started', session: created, toolCallId, agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explore' },
				{ type: 'tool_complete', session: created, toolCallId, result: { success: true, pastTenseMessage: 'Delegated', content: [] } },
			];
			const originalDefault = getTestAgentStateManager(creating).getSessionState(created.toString())!.defaultChat!;
			await agent.chats.createChat(URI.parse(originalDefault), created);
			registerTestAgentProvider(restarted, agent);
			await restarted.restoreSession(created);
			await timeout(50);

			const state = getTestAgentStateManager(restarted).getSessionState(created.toString());
			const parentChat = state?.defaultChat;
			const subagent = state?.chats.find(chat => chat.origin?.kind === ChatOriginKind.Tool);
			const resolvedChat = subagent && await getTestAgentStateManager(restarted).resolveChatState(subagent.resource);
			const subagentResource = subagent?.resource;
			await second.close();

			const third = await database();
			const again = createService(third);
			const freshAgent = store.add(new MockAgent('copilotcli'));
			freshAgent.sessionMessages = agent.sessionMessages;
			await freshAgent.chats.createChat(URI.parse(originalDefault), created);
			registerTestAgentProvider(again, freshAgent);
			await again.restoreSession(created);
			await timeout(50);
			const secondRestore = getTestAgentStateManager(again).getSessionState(created.toString())?.chats.filter(chat => chat.origin?.kind === ChatOriginKind.Tool).map(chat => chat.resource);
			assert.deepStrictEqual({ resolved: resolvedChat !== undefined, secondRestore }, { resolved: true, secondRestore: [subagentResource] });
			assert.deepStrictEqual({
				origin: subagent?.origin,
				opaque: subagent?.resource.startsWith('ahp-chat:/') && !subagent.resource.startsWith('ahp-chat://'),
				recorded: subagent !== undefined && second.identity.hasChat(subagent.resource),
				warnings: warnings.filter(message => message.includes('admission') || message.includes('private chats')),
			}, {
				origin: { kind: ChatOriginKind.Tool, chat: parentChat, toolCallId },
				opaque: true,
				recorded: true,
				warnings: [],
			});
		});
	});
});
