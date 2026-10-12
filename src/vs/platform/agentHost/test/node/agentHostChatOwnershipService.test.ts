/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { stableStringify } from '../../../../base/common/objects.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri, MessageKind, ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, type SessionSummary, type Turn } from '../../common/state/sessionState.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION } from '../../node/agentHostCatalogProjection.js';
import { AgentHostChatOwnershipService, type IChatRegistration } from '../../node/agentHostChatOwnershipService.js';
import type { Database } from '@vscode/sqlite3';
import { AgentHostDatabase, IAgentHostDatabase, type IAgentHostDatabaseChatOwner, type IAgentHostDatabaseSession } from '../../node/agentHostDatabase.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';

class FakeOwnershipDatabase extends mock<IAgentHostDatabase>() {
	readonly owners = new Map<string, IAgentHostDatabaseChatOwner>();
	readonly payloadOwners = new Map<string, IAgentHostDatabaseChatOwner>();
	readonly sessions: IAgentHostDatabaseSession[] = [];
	inventoryReads = 0;

	override async findCentralChatOwners(chats: readonly string[]): Promise<ReadonlyMap<string, IAgentHostDatabaseChatOwner>> {
		return new Map(chats.flatMap(chat => this.owners.has(chat) ? [[chat, this.owners.get(chat)!] as const] : []));
	}
	override async findPayloadChatOwners(chats: readonly string[]): Promise<ReadonlyMap<string, IAgentHostDatabaseChatOwner>> {
		return new Map(chats.flatMap(chat => this.payloadOwners.has(chat) ? [[chat, this.payloadOwners.get(chat)!] as const] : []));
	}
	override async listSessionV2Registrations(): Promise<readonly IAgentHostDatabaseSession[]> {
		this.inventoryReads++;
		return this.sessions;
	}
	override async listSessions(): Promise<readonly IAgentHostDatabaseSession[]> {
		return [];
	}
}

function summary(resource: string): SessionSummary {
	return { resource, provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: '2025-01-01T00:00:00.000Z', modifiedAt: '2025-01-01T00:00:00.000Z' };
}

function registeredSession(session: string): IAgentHostDatabaseSession {
	return { session, provider: 'copilot', startTime: 1, modifiedTime: 1, external: false, source: 'explicit' };
}

function spawningTurn(toolCallId: string, resource: string): Turn {
	return {
		id: `turn-${toolCallId}`,
		state: TurnState.Complete,
		usage: undefined,
		message: { text: 'Delegate', origin: { kind: MessageKind.User } },
		responseParts: [{
			kind: ResponsePartKind.ToolCall,
			toolCall: {
				toolCallId,
				toolName: 'task',
				displayName: 'Task',
				status: ToolCallStatus.Completed,
				confirmed: ToolCallConfirmationReason.NotNeeded,
				invocationMessage: 'Delegating',
				success: true,
				pastTenseMessage: 'Delegated',
				content: [{ type: ToolResultContentType.Subagent, resource, title: 'Worker' }],
			},
		}],
	};
}

suite('AgentHostChatOwnershipService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function create(): { readonly stateManager: AgentHostStateManager; readonly database: FakeOwnershipDatabase; readonly service: AgentHostChatOwnershipService } {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const database = new FakeOwnershipDatabase();
		return { stateManager, database, service: new AgentHostChatOwnershipService(stateManager, database) };
	}

	test('resolves an owner from the live registry, then the central catalogs, then the registered inventory, then cached payloads, then spawn edges, never from the chat URI', async () => {
		const { stateManager, database, service } = create();
		// Every chat URI encodes a session other than its owner.
		const chat = (id: string) => buildChatUri('copilot:/encoded', id);
		const live = 'copilot:/live-owner';
		const spawner = 'copilot:/spawner';
		stateManager.restoreSession(summary(live), [], creationTimeChatStorageResource);
		stateManager.addChat(live, chat('live'), chat('live'));
		stateManager.restoreSession(summary(spawner), [spawningTurn('tc', chat('spawned'))], creationTimeChatStorageResource);
		database.owners.set(chat('live'), { ownerSession: 'copilot:/catalog-loses-to-live', source: 'normalized', deleted: false });
		database.owners.set(chat('catalog'), { ownerSession: 'copilot:/catalog-owner', source: 'normalized', deleted: false });
		database.owners.set(buildDefaultChatUri('copilot:/inventory-owner'), { ownerSession: 'copilot:/catalog-beats-inventory', source: 'legacyCatalog', deleted: false });
		database.sessions.push(registeredSession('copilot:/inventory-owner'), registeredSession('copilot:/inventory-only'));
		database.payloadOwners.set(buildDefaultChatUri('copilot:/inventory-only'), { ownerSession: 'copilot:/payload-loses-to-inventory', source: 'catalogPayload', deleted: false });
		database.payloadOwners.set(chat('payload'), { ownerSession: 'copilot:/payload-owner', source: 'catalogPayload', deleted: false });

		const owners = await Promise.all([chat('live'), chat('catalog'), buildDefaultChatUri('copilot:/inventory-owner'), buildDefaultChatUri('copilot:/inventory-only'), chat('payload'), chat('spawned'), chat('unknown')]
			.map(async resource => await service.resolveChatOwner(resource)));

		assert.deepStrictEqual(owners, [
			{ owner: live, spawnedBy: undefined },
			{ owner: 'copilot:/catalog-owner', spawnedBy: undefined },
			{ owner: 'copilot:/catalog-beats-inventory', spawnedBy: undefined },
			{ owner: 'copilot:/inventory-only', spawnedBy: undefined },
			{ owner: 'copilot:/payload-owner', spawnedBy: undefined },
			{ owner: spawner, spawnedBy: { chat: buildDefaultChatUri(spawner), toolCallId: 'tc', title: 'Worker' } },
			undefined,
		]);
	});

	test('waits for a tracked restore before reporting a chat unknown, and stops waiting once it settles', async () => {
		const { stateManager, service } = create();
		const owner = 'copilot:/restoring';
		const peer = buildChatUri(owner, 'peer');
		const restore = new DeferredPromise<void>();
		service.trackRestore(restore.p);

		const resolving = service.resolveChatOwner(peer);
		// Let resolution miss every recorded source and start waiting for the restore.
		await timeout(0);
		stateManager.restoreSession(summary(owner), [], creationTimeChatStorageResource);
		stateManager.addChat(owner, peer, peer);
		restore.complete();
		const resolved = await resolving;
		const failed = new DeferredPromise<void>();
		service.trackRestore(failed.p);
		failed.error(new Error('restore failed'));

		assert.deepStrictEqual({
			resolved,
			// A settled restore, failed or not, is no longer awaited.
			afterSettled: await service.resolveChatOwner(buildChatUri(owner, 'never-registered')),
		}, {
			resolved: { owner, spawnedBy: undefined },
			afterSettled: undefined,
		});
	});

	test('reports registrations and unregistrations with the owner and storage the chat was registered with', () => {
		const { stateManager, service } = create();
		const owner = 'copilot:/events-owner';
		const peer = buildChatUri('copilot:/events-encoded', 'peer');
		const events: [string, IChatRegistration][] = [];
		disposables.add(service.onDidRegisterChat(registration => events.push(['register', registration])));
		disposables.add(service.onDidUnregisterChat(registration => events.push(['unregister', registration])));

		stateManager.restoreSession(summary(owner), [], creationTimeChatStorageResource);
		stateManager.addChat(owner, peer, 'copilot:/recorded-storage');
		stateManager.removeChat(owner, peer);
		stateManager.removeSession(owner);

		assert.deepStrictEqual(events, [
			['register', { chat: buildDefaultChatUri(owner), session: owner, storageResource: owner }],
			['register', { chat: peer, session: owner, storageResource: 'copilot:/recorded-storage' }],
			['unregister', { chat: peer, session: owner, storageResource: 'copilot:/recorded-storage' }],
			['unregister', { chat: buildDefaultChatUri(owner), session: owner, storageResource: owner }],
		]);
	});

	test('a recorded-owner lookup reads the registered inventory once for many chats', async () => {
		const { database, service } = create();
		const sessions = ['copilot:/one', 'copilot:/two', 'copilot:/three'];
		database.sessions.push(...sessions.map(registeredSession));

		const lookup = service.createRecordedOwnerLookup();
		const owners = [];
		for (const session of [...sessions, 'copilot:/unregistered']) {
			owners.push(await lookup(buildDefaultChatUri(session)));
		}
		const readsByLookup = database.inventoryReads;
		await service.resolveChatOwner(buildDefaultChatUri('copilot:/one'));
		await service.resolveChatOwner(buildDefaultChatUri('copilot:/two'));

		assert.deepStrictEqual({ owners, readsByLookup, readsByResolutions: database.inventoryReads - readsByLookup }, {
			owners: [...sessions, undefined],
			readsByLookup: 1,
			readsByResolutions: 2,
		});
	});

	test('a legacy default chat resolves from the registered sessions without scanning cached catalog payloads', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const service = new AgentHostChatOwnershipService(stateManager, database);
		const legacy = 'copilot:/legacy-default-owner';
		await database.registerRuntimeSession(legacy, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const sqlite = await (database as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
		const statements: string[] = [];
		const onTrace = (sql: string) => statements.push(sql);
		sqlite.on('trace', onTrace);

		const resolved = await service.resolveChatOwner(buildDefaultChatUri(legacy));
		sqlite.removeListener('trace', onTrace);

		assert.deepStrictEqual({
			resolved,
			payloadScans: statements.filter(sql => sql.includes('FROM sessions_v2') && sql.includes('instr(payload,')).length,
		}, {
			resolved: { owner: legacy, spawnedBy: undefined },
			payloadScans: 0,
		});
	});

	test('a chat listed only in a cached catalog payload still resolves, as the last recorded source', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const service = new AgentHostChatOwnershipService(stateManager, database);
		const owner = 'copilot:/payload-only-owner';
		const chat = buildChatUri('copilot:/payload-only-encoded', 'peer');
		await database.registerRuntimeSession(owner, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const payload = stableStringify({
			payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
			data: {
				modifiedTime: 1,
				summary: 'Payload only',
				isRead: true,
				isArchived: false,
				isChatBacking: false,
				workingDirectories: [],
				chats: [
					{ kind: 'default', order: 0, summary: 'Default', titleSource: 'auto', uri: buildDefaultChatUri(owner) },
					{ kind: 'peer', order: 1, summary: 'Peer', titleSource: 'agent', uri: chat },
				],
			},
		});
		await database.upsertSessionV2({
			session: owner,
			sessionGeneration: 'generation',
			sourceRevision: 1,
			payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
			payloadHash: createHash('sha256').update(payload, 'utf8').digest('hex'),
			verified: true,
			payload,
		}, undefined);

		assert.deepStrictEqual({
			central: (await database.findCentralChatOwners([chat])).get(chat),
			resolved: await service.resolveChatOwner(chat),
			recorded: await service.createRecordedOwnerLookup()(chat),
		}, {
			central: undefined,
			resolved: { owner, spawnedBy: undefined },
			recorded: owner,
		});
	});

	test('a subagent of a loaded chat resolves through its spawning tool call', async () => {
		const { stateManager, service } = create();
		const parent = 'copilot:/subagent-parent';
		stateManager.restoreSession(summary(parent), [spawningTurn('tc-sub', buildSubagentChatUri(parent, 'tc-sub'))], creationTimeChatStorageResource);

		assert.deepStrictEqual(await service.resolveChatOwner(buildSubagentChatUri(parent, 'tc-sub')), {
			owner: parent,
			spawnedBy: { chat: buildDefaultChatUri(parent), toolCallId: 'tc-sub', title: 'Worker' },
		});
	});
});
