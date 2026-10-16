/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { savedChatToDto } from '../../common/agentHostSavedChat.js';
import type { IAgentCreateChatResult } from '../../common/agent.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AH_META_IS_ARCHIVED_DB_KEY, MessageKind, SessionStatus, isSessionStatusArchived, type SessionSummary, type Turn } from '../../common/state/sessionState.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { encodeAgentHostCatalogPayload, decodeAgentHostCatalogPayload } from '../../node/agentHostCatalogProjection.js';
import { chatCatalogV2ToCatalogChats } from '../../node/agentHostCatalogSourceResolver.js';
import { encodeProviderData } from '../../node/agentChatBackings.js';
import { IClaudeAgentSdkService } from '../../node/claude/claudeAgentSdkService.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { SESSION_WORKING_DIRECTORIES_KEY } from '../../node/shared/persistSessionMetadata.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY } from '../../node/shared/sessionAdditionalWorktrees.js';
import { createNoopGitService, createSessionDataService } from '../common/sessionTestHelpers.js';
import { createTestAgentHostWorktreeIsolation, createTestAgentService, getTestAgentHostProviderService, getTestAgentStateManager, registerTestAgentProvider, setTestAgentHostWorktreeIsolation } from './agentServiceTestUtils.js';
import { MockAgent } from './mockAgent.js';

class SavedSdk extends mock<IClaudeAgentSdkService>() {
	readError: Error | undefined;
	onRead: (() => void) | undefined;
	override async canLoadWithoutDownload(): Promise<boolean> { return true; }
	override async getSessionMessages(): ReturnType<IClaudeAgentSdkService['getSessionMessages']> {
		this.onRead?.();
		if (this.readError) {
			throw this.readError;
		}
		return [
			{ type: 'user', uuid: 'saved-question', session_id: 'native-saved', parent_tool_use_id: null, parent_agent_id: null, message: { role: 'user', content: 'Saved question' } },
			{ type: 'assistant', uuid: 'saved-answer', session_id: 'native-saved', parent_tool_use_id: null, parent_agent_id: null, message: { role: 'assistant', content: [{ type: 'text', text: 'Saved answer' }] } },
		];
	}
	override async startup(): Promise<never> { throw new Error('Saved completion must not start Claude'); }
	override async query(): Promise<never> { throw new Error('Saved completion must not execute Claude'); }
}

class SourceAgent extends MockAgent {
	readonly lifecycle: string[] = [];
	readonly createdChats: string[] = [];
	createStarted: DeferredPromise<void> | undefined;
	createResult: DeferredPromise<IAgentCreateChatResult> | undefined;
	materializeStarted: DeferredPromise<void> | undefined;
	materializeResult: DeferredPromise<void> | undefined;
	materializing = false;
	override async createChat(_session: URI, chat: URI): Promise<IAgentCreateChatResult> {
		this.createdChats.push(chat.toString());
		this.createStarted?.complete();
		return this.createResult?.p ?? { providerData: encodeProviderData({ sdkSessionId: 'uncopied-peer' }) };
	}
	async onArchivedChanged(): Promise<void> { this.lifecycle.push('archived'); }
	override async materializeChat(): Promise<void> {
		this.lifecycle.push('materialize');
		this.materializing = true;
		this.materializeStarted?.complete();
		try {
			await this.materializeResult?.p;
		} finally {
			this.materializing = false;
		}
	}
	override async disposeChat(): Promise<void> { this.lifecycle.push('dispose'); }
	override async sendMessage(): Promise<void> { this.lifecycle.push('send'); }
}

class ArchiveCommitDatabase extends SessionDatabase {
	afterArchiveCommit: (() => void) | undefined;
	afterCatalogAcknowledgement: (() => void) | undefined;
	restoreArchiveError: Error | undefined;

	override async setMetadataValuesAndCatalogSyncSnapshot(...args: Parameters<SessionDatabase['setMetadataValuesAndCatalogSyncSnapshot']>): ReturnType<SessionDatabase['setMetadataValuesAndCatalogSyncSnapshot']> {
		if (args[0][AH_META_IS_ARCHIVED_DB_KEY] === '' && this.restoreArchiveError) {
			throw this.restoreArchiveError;
		}
		const result = await super.setMetadataValuesAndCatalogSyncSnapshot(...args);
		if (result === 'applied' && args[0][AH_META_IS_ARCHIVED_DB_KEY] === 'true') {
			const afterCommit = this.afterArchiveCommit;
			this.afterArchiveCommit = undefined;
			afterCommit?.();
		}
		return result;
	}

	override async acknowledgeCatalogSyncSnapshot(...args: Parameters<SessionDatabase['acknowledgeCatalogSyncSnapshot']>): ReturnType<SessionDatabase['acknowledgeCatalogSyncSnapshot']> {
		const acknowledged = await super.acknowledgeCatalogSyncSnapshot(...args);
		if (acknowledged) {
			const afterAcknowledgement = this.afterCatalogAcknowledgement;
			this.afterCatalogAcknowledgement = undefined;
			afterAcknowledgement?.();
		}
		return acknowledged;
	}
}

suite('AgentHostSavedChatContinuation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const source = URI.parse('ahp-session:/saved-source');
	const chat = URI.parse('ahp-chat:/saved-source-default');
	const destination = URI.parse('ahp-session:/verified-copilot');

	async function fixture(live: boolean, localDatabase?: SessionDatabase) {
		const log = new NullLogService();
		const fileService = disposables.add(new FileService(log));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const local = localDatabase ?? disposables.add(await SessionDatabase.open(':memory:'));
		const dataService = createSessionDataService(local);
		const sdk = new SavedSdk();
		const svc = disposables.add(createTestAgentService(
			log, fileService, dataService, new class extends mock<IProductService>() { }(), createNoopGitService(),
			undefined, undefined, undefined, undefined, undefined, [], undefined, undefined, database,
			undefined, undefined, undefined, undefined, 'utility', sdk,
		));
		const provider = disposables.add(new SourceAgent('claude'));
		registerTestAgentProvider(svc, provider);
		await svc.listSessions();
		await svc.whenCatalogReconciliationIdle();
		const worktreeCalls: string[] = [];
		setTestAgentHostWorktreeIsolation(svc, createTestAgentHostWorktreeIsolation({
			readSessionWorktreeForRemoval: async () => { worktreeCalls.push('archive'); return undefined; },
			markDetachedWorktreeArchived: async () => { worktreeCalls.push('detached'); return false; },
		}));
		await local.setMetadataValues({
			[SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify(['file:///saved/project']),
			[ADDITIONAL_WORKTREES_METADATA_KEY]: JSON.stringify([{ handle: '11111111-1111-4111-8111-111111111111', workingDirectory: 'file:///saved/additional', repositoryRoot: 'file:///repository' }]),
			sessionArtifacts: '[{"id":"original-artifact","type":"file","uri":"file:///saved/artifact"}]',
		});
		for (const [session, providerId, defaultChat] of [[source, 'claude', chat], [destination, 'copilotcli', URI.parse('ahp-chat:/copilot-copy-default')]] as const) {
			await database.registerSessionV2(session.toString(), { provider: providerId, startTime: 1, source: 'explicit' }, { checkTombstone: false });
			await database.registerChatCatalogV2(session.toString(), {
				defaultChat: { chat: defaultChat.toString(), order: 0, storageResource: session.toString(), providerData: encodeProviderData({ sdkSessionId: 'native-saved' }), metadata: { summary: 'Saved source' } },
				peers: [], privateDescendants: [],
			});
			const [snapshot] = await database.readCatalogSnapshot([session.toString()]);
			assert.ok(snapshot.header);
			const encoded = encodeAgentHostCatalogPayload({ modifiedTime: 1, isRead: true, isArchived: false, summary: 'Saved source', workingDirectories: ['file:///saved/project'], chats: chatCatalogV2ToCatalogChats(snapshot) });
			assert.ok(encoded.ok);
			await database.upsertSessionV2FromChatCatalog({ session: session.toString(), sessionGeneration: `${providerId}-generation`, sourceRevision: 1, payloadVersion: 2, payload: encoded.value.payload, payloadHash: encoded.value.payloadHash, verified: true }, undefined, snapshot.header.revision);
		}
		getTestAgentHostProviderService(svc).associateSession(source, 'claude');
		const stateManager = getTestAgentStateManager(svc);
		const summary = {
			resource: source.toString(), defaultChat: chat.toString(), provider: 'claude', title: 'Saved source', status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(), modifiedAt: new Date(1).toISOString(), workingDirectories: ['file:///saved/project'],
		} satisfies SessionSummary;
		if (live) {
			stateManager.createSession(summary);
		} else {
			stateManager.announceSurfacedSession(summary);
		}
		return { svc, database, local, stateManager, provider, worktreeCalls, sdk };
	}

	for (const live of [false, true]) {
		test(`archives ${live ? 'idle live' : 'cold surfaced'} metadata and publishes without source or worktree execution`, async () => {
			const { svc, database, local, stateManager, provider, worktreeCalls } = await fixture(live);
			const saved = await svc.readSavedChat(source);
			const artifacts = await local.getMetadata('sessionArtifacts');
			const worktrees = await local.getMetadata(ADDITIONAL_WORKTREES_METADATA_KEY);
			const changed = Event.toPromise(Event.filter(svc.onDidNotification, event => event.type === 'root/sessionSummaryChanged' && event.session === source.toString() && isSessionStatusArchived(event.changes.status)));
			const completed = await svc.completeSavedChatContinuation({ session: source, chat, identity: saved.identity, destination });
			await changed;
			const row = await database.getSessionV2(source.toString());
			assert.ok(row);
			const payload = decodeAgentHostCatalogPayload(row.payload);
			assert.ok(payload.ok);
			assert.deepStrictEqual({
				completed, archived: await local.getMetadata(AH_META_IS_ARCHIVED_DB_KEY), catalogArchived: payload.value.data.isArchived,
				published: isSessionStatusArchived((stateManager.getSessionSummary(source.toString()) ?? stateManager.getSurfacedSessionSummary(source.toString()))?.status),
				live: !!stateManager.getSessionState(source.toString()), sourceCalls: provider.lifecycle, releases: provider.releaseSessionCalls.length, worktreeCalls,
				artifactsUnchanged: await local.getMetadata('sessionArtifacts') === artifacts,
				worktreesUnchanged: await local.getMetadata(ADDITIONAL_WORKTREES_METADATA_KEY) === worktrees,
				availability: savedChatToDto(await svc.readSavedChat(source)).availability,
			}, {
				completed: { archived: true }, archived: 'true', catalogArchived: true, published: true, live,
				sourceCalls: [], releases: 0, worktreeCalls: [], artifactsUnchanged: true, worktreesUnchanged: true,
				availability: { kind: 'continued', destination: destination.toString() },
			});
		});
	}

	test.skip('records a busy source completion and retries archive when its turn has finished', async () => {
		const { svc, local, stateManager, provider, worktreeCalls } = await fixture(true);
		const saved = await svc.readSavedChat(source);
		stateManager.dispatchServerAction(chat.toString(), { type: ActionType.ChatTurnStarted, turnId: 'busy', startedAt: new Date(2).toISOString(), message: { text: 'Busy source', origin: { kind: MessageKind.User } } });
		const request = { session: source, chat, identity: saved.identity, destination };
		const busy = await svc.completeSavedChatContinuation(request);
		const before = await local.getMetadata(AH_META_IS_ARCHIVED_DB_KEY);
		stateManager.dispatchServerAction(chat.toString(), { type: ActionType.ChatTurnComplete, turnId: 'busy', duration: 0 });
		const idle = await svc.completeSavedChatContinuation(request);
		assert.deepStrictEqual({ busy, before, idle, sourceCalls: provider.lifecycle, worktreeCalls }, { busy: { archived: false }, before: undefined, idle: { archived: true }, sourceCalls: [], worktreeCalls: [] });
	});

	test('waits for an accepted peer creation before deciding whether continuation can archive the source', async () => {
		const { svc, local, database, stateManager, provider, worktreeCalls } = await fixture(true);
		await provider.chats.createChat(chat, source);
		const saved = await svc.readSavedChat(source);
		const peer = URI.parse('ahp-chat:/pending-peer');
		provider.createStarted = new DeferredPromise<void>();
		provider.createResult = new DeferredPromise<IAgentCreateChatResult>();
		const creating = svc.createChat(source, peer);
		await provider.createStarted.p;
		const completing = svc.completeSavedChatContinuation({ session: source, chat, identity: saved.identity, destination });
		let completedWhileCreating = false;
		void completing.then(() => { completedWhileCreating = !provider.createResult?.isSettled; }, () => undefined);
		try {
			await timeout(200);
		} finally {
			await provider.createResult.complete({ providerData: encodeProviderData({ sdkSessionId: 'uncopied-peer' }) });
		}
		await creating;
		const completed = await completing;
		const storedPeer = await database.readChatV2(source.toString(), peer.toString());
		assert.deepStrictEqual({
			completedWhileCreating, completed, archived: await local.getMetadata(AH_META_IS_ARCHIVED_DB_KEY) === 'true',
			liveArchived: isSessionStatusArchived(stateManager.getSessionState(source.toString())?.status),
			storedPeer: storedPeer.chat?.chat, peerAvailability: (await svc.readSavedChat(source, peer)).availability,
			createdChats: provider.createdChats, sourceCalls: provider.lifecycle, worktreeCalls,
		}, {
			completedWhileCreating: false, completed: { archived: false }, archived: false, liveArchived: false,
			storedPeer: peer.toString(), peerAvailability: { kind: 'available' }, createdChats: [peer.toString()], sourceCalls: [], worktreeCalls: [],
		});
	});

	test('rejects peer creation prepared before continuation when its parent becomes archived', async () => {
		const { svc, stateManager, provider, worktreeCalls } = await fixture(true);
		await provider.chats.createChat(chat, source);
		const saved = await svc.readSavedChat(source);
		const forkOwner = 'ahp-session:/fork-owner';
		const forkChat = 'ahp-chat:/fork-source';
		stateManager.createSession({ resource: forkOwner, provider: 'claude', defaultChat: 'ahp-chat:/fork-owner-default', title: '', status: SessionStatus.Idle, createdAt: new Date(1).toISOString(), modifiedAt: new Date(1).toISOString() });
		const preparationStarted = new DeferredPromise<void>();
		const prepared = new DeferredPromise<{ turns: Turn[] }>();
		stateManager.registerRestoredChatSummary(forkOwner, forkChat, {
			storageResource: forkChat,
			resolver: async () => {
				preparationStarted.complete();
				return prepared.p;
			},
		});
		const peer = URI.parse('ahp-chat:/late-fork');
		const creating = svc.createChat(source, peer, { fork: { source: URI.parse(forkChat), turnId: saved.turns[0].id } });
		await preparationStarted.p;
		const completed = await svc.completeSavedChatContinuation({ session: source, chat, identity: saved.identity, destination });
		await prepared.complete({ turns: [...saved.turns] });
		await assert.rejects(creating, /archived/i);
		assert.deepStrictEqual({ completed, createdChats: provider.createdChats, published: stateManager.getSessionState(source.toString())?.chats.map(chat => chat.resource), sourceCalls: provider.lifecycle, worktreeCalls }, {
			completed: { archived: true }, createdChats: [], published: [chat.toString()], sourceCalls: [], worktreeCalls: [],
		});
	});

	test('preserves peer creation explicitly begun on an already archived parent', async () => {
		const { svc, database, provider } = await fixture(true);
		await provider.chats.createChat(chat, source);
		const saved = await svc.readSavedChat(source);
		await svc.completeSavedChatContinuation({ session: source, chat, identity: saved.identity, destination });
		const peer = URI.parse('ahp-chat:/explicit-archived-peer');
		await svc.createChat(source, peer);
		assert.deepStrictEqual({ createdChats: provider.createdChats, storedPeer: (await database.readChatV2(source.toString(), peer.toString())).chat?.chat }, {
			createdChats: [peer.toString()], storedPeer: peer.toString(),
		});
	});

	test('retries archive publication after a saved read fails after the local archive commit', async () => {
		const local = disposables.add(new ArchiveCommitDatabase(':memory:'));
		const { svc, database, stateManager, sdk, provider, worktreeCalls } = await fixture(true, local);
		const saved = await svc.readSavedChat(source);
		const request = { session: source, chat, identity: saved.identity, destination };
		const nativeError = new Error('Native history temporarily unavailable after commit');
		let committed = false;
		local.afterArchiveCommit = () => {
			committed = true;
			sdk.readError = nativeError;
		};
		await assert.rejects(svc.completeSavedChatContinuation(request), error => error === nativeError);
		const archivedBeforeRetry = await local.getMetadata(AH_META_IS_ARCHIVED_DB_KEY) === 'true';
		sdk.readError = undefined;
		const retried = await svc.completeSavedChatContinuation(request);
		const row = await database.getSessionV2(source.toString());
		assert.ok(row);
		const catalog = decodeAgentHostCatalogPayload(row.payload);
		assert.ok(catalog.ok);
		assert.deepStrictEqual({
			committed, archivedBeforeRetry, retried, localArchived: await local.getMetadata(AH_META_IS_ARCHIVED_DB_KEY) === 'true',
			liveArchived: isSessionStatusArchived(stateManager.getSessionState(source.toString())?.status), catalogArchived: catalog.value.data.isArchived,
			sourceCalls: provider.lifecycle, worktreeCalls,
		}, { committed: true, archivedBeforeRetry: false, retried: { archived: true }, localArchived: true, liveArchived: true, catalogArchived: true, sourceCalls: [], worktreeCalls: [] });
	});

	test('retains a source that becomes busy after the local archive commit', async () => {
		const local = disposables.add(new ArchiveCommitDatabase(':memory:'));
		const { svc, database, stateManager, provider, worktreeCalls } = await fixture(true, local);
		const saved = await svc.readSavedChat(source);
		let committed = false;
		local.afterArchiveCommit = () => {
			committed = true;
			stateManager.dispatchServerAction(chat.toString(), { type: ActionType.ChatTurnStarted, turnId: 'late-busy', startedAt: new Date(3).toISOString(), message: { text: 'Started after the saved copy', origin: { kind: MessageKind.User } } });
		};
		await assert.rejects(svc.completeSavedChatContinuation({ session: source, chat, identity: saved.identity, destination }), /busy/i);
		const row = await database.getSessionV2(source.toString());
		assert.ok(row);
		const catalog = decodeAgentHostCatalogPayload(row.payload);
		assert.ok(catalog.ok);
		assert.deepStrictEqual({
			committed, localArchived: await local.getMetadata(AH_META_IS_ARCHIVED_DB_KEY) === 'true',
			catalogArchived: catalog.value.data.isArchived,
			liveArchived: isSessionStatusArchived(stateManager.getSessionState(source.toString())?.status), busy: stateManager.hasActiveTurn(source.toString()),
			sourceCalls: provider.lifecycle, releases: provider.releaseSessionCalls.length, worktreeCalls,
		}, { committed: true, localArchived: false, catalogArchived: false, liveArchived: false, busy: true, sourceCalls: [], releases: 0, worktreeCalls: [] });
	});

	test('retains a source that becomes busy during catalog acknowledgement', async () => {
		const local = disposables.add(new ArchiveCommitDatabase(':memory:'));
		const { svc, database, stateManager, provider, worktreeCalls } = await fixture(true, local);
		const saved = await svc.readSavedChat(source);
		let acknowledged = false;
		local.afterCatalogAcknowledgement = () => {
			acknowledged = true;
			stateManager.dispatchServerAction(chat.toString(), { type: ActionType.ChatTurnStarted, turnId: 'busy-during-acknowledgement', startedAt: new Date(4).toISOString(), message: { text: 'Started during archive acknowledgement', origin: { kind: MessageKind.User } } });
		};
		const completed = await svc.completeSavedChatContinuation({ session: source, chat, identity: saved.identity, destination });
		const row = await database.getSessionV2(source.toString());
		assert.ok(row);
		const catalog = decodeAgentHostCatalogPayload(row.payload);
		assert.ok(catalog.ok);
		assert.deepStrictEqual({
			acknowledged, completed, localArchived: await local.getMetadata(AH_META_IS_ARCHIVED_DB_KEY) === 'true', catalogArchived: catalog.value.data.isArchived,
			liveArchived: isSessionStatusArchived(stateManager.getSessionState(source.toString())?.status), busy: stateManager.hasActiveTurn(source.toString()),
			availability: savedChatToDto(await svc.readSavedChat(source)).availability,
			sourceCalls: provider.lifecycle, releases: provider.releaseSessionCalls.length, worktreeCalls,
		}, {
			acknowledged: true, completed: { archived: false }, localArchived: false, catalogArchived: false, liveArchived: false, busy: true,
			availability: { kind: 'continued', destination: destination.toString() }, sourceCalls: [], releases: 0, worktreeCalls: [],
		});
	});

	test('retries archive publication when restoring the published archive state also fails', async () => {
		const local = disposables.add(new ArchiveCommitDatabase(':memory:'));
		const { svc, database, stateManager, sdk, provider, worktreeCalls } = await fixture(true, local);
		const saved = await svc.readSavedChat(source);
		const request = { session: source, chat, identity: saved.identity, destination };
		const nativeError = new Error('Native history temporarily unavailable after commit');
		const compensationError = new Error('Archive metadata write temporarily unavailable');
		local.afterArchiveCommit = () => {
			sdk.readError = nativeError;
			local.restoreArchiveError = compensationError;
		};
		await assert.rejects(svc.completeSavedChatContinuation(request), error => {
			assert.ok(error instanceof AggregateError);
			assert.deepStrictEqual({
				originalError: error.errors[0] === nativeError, compensationError: error.errors[1] === compensationError, message: error.message,
			}, {
				originalError: true, compensationError: true,
				message: 'Saved chat archival failed: Native history temporarily unavailable after commit. Restoring archive metadata also failed: Archive metadata write temporarily unavailable',
			});
			return true;
		});
		const localArchivedBeforeRetry = await local.getMetadata(AH_META_IS_ARCHIVED_DB_KEY) === 'true';
		const publishedBeforeRetry = isSessionStatusArchived(stateManager.getSessionState(source.toString())?.status);
		sdk.readError = undefined;
		local.restoreArchiveError = undefined;
		const availabilityBeforeRetry = savedChatToDto(await svc.readSavedChat(source)).availability;
		const retried = await svc.completeSavedChatContinuation(request);
		const row = await database.getSessionV2(source.toString());
		assert.ok(row);
		const catalog = decodeAgentHostCatalogPayload(row.payload);
		assert.ok(catalog.ok);
		assert.deepStrictEqual({
			localArchivedBeforeRetry, publishedBeforeRetry, availabilityBeforeRetry, retried,
			localArchived: await local.getMetadata(AH_META_IS_ARCHIVED_DB_KEY) === 'true', catalogArchived: catalog.value.data.isArchived,
			published: isSessionStatusArchived(stateManager.getSessionState(source.toString())?.status),
			availability: savedChatToDto(await svc.readSavedChat(source)).availability,
			sourceCalls: provider.lifecycle, releases: provider.releaseSessionCalls.length, worktreeCalls,
		}, {
			localArchivedBeforeRetry: true, publishedBeforeRetry: false, availabilityBeforeRetry: { kind: 'continued', destination: destination.toString() },
			retried: { archived: true }, localArchived: true, catalogArchived: true, published: true,
			availability: { kind: 'continued', destination: destination.toString() }, sourceCalls: [], releases: 0, worktreeCalls: [],
		});
	});

	test('preserves a separately published archive when completion cannot finish', async () => {
		const local = disposables.add(new ArchiveCommitDatabase(':memory:'));
		const { svc, database, stateManager, sdk, provider, worktreeCalls } = await fixture(false, local);
		const saved = await svc.readSavedChat(source);
		local.afterArchiveCommit = () => {
			stateManager.setSurfacedSessionStatusFlag(source.toString(), SessionStatus.IsArchived, true);
			sdk.readError = new Error('Native history temporarily unavailable after commit');
		};
		await assert.rejects(svc.completeSavedChatContinuation({ session: source, chat, identity: saved.identity, destination }), /temporarily unavailable after commit/);
		const row = await database.getSessionV2(source.toString());
		assert.ok(row);
		const catalog = decodeAgentHostCatalogPayload(row.payload);
		assert.ok(catalog.ok);
		assert.deepStrictEqual({
			localArchived: await local.getMetadata(AH_META_IS_ARCHIVED_DB_KEY) === 'true', catalogArchived: catalog.value.data.isArchived,
			published: isSessionStatusArchived(stateManager.getSurfacedSessionSummary(source.toString())?.status),
			sourceCalls: provider.lifecycle, releases: provider.releaseSessionCalls.length, worktreeCalls,
		}, { localArchived: true, catalogArchived: true, published: true, sourceCalls: [], releases: 0, worktreeCalls: [] });
	});

	test('does not read continuation history during a restore that passed its first completion check', async () => {
		const { svc, stateManager, provider, sdk } = await fixture(false);
		await provider.chats.createChat(chat, source);
		const saved = await svc.readSavedChat(source);
		provider.materializeStarted = new DeferredPromise<void>();
		provider.materializeResult = new DeferredPromise<void>();
		let readDuringRestore = false;
		sdk.onRead = () => { readDuringRestore ||= provider.materializing; };
		const restoring = svc.restoreSession(source);
		await Promise.resolve();
		const completing = svc.completeSavedChatContinuation({ session: source, chat, identity: saved.identity, destination });
		await provider.materializeStarted.p;
		try {
			await timeout(100);
		} finally {
			await provider.materializeResult.complete();
		}
		await restoring;
		const completed = await completing;
		assert.deepStrictEqual({ readDuringRestore, completed, liveArchived: isSessionStatusArchived(stateManager.getSessionState(source.toString())?.status) }, {
			readDuringRestore: false, completed: { archived: true }, liveArchived: true,
		});
	});
});
