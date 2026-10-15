/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import type { IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { AgentProvider } from '../../common/agent.js';
import { savedChatToDto } from '../../common/agentHostSavedChat.js';
import type { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { AH_META_IS_ARCHIVED_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, buildChatUri, buildDefaultChatUri, ChatInteractivity, ChatOriginKind, MessageKind, ResponsePartKind, TurnState, type Turn } from '../../common/state/sessionState.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostCatalogListReader } from '../../node/agentHostCatalogListReader.js';
import { encodeAgentHostCatalogPayload } from '../../node/agentHostCatalogProjection.js';
import { CHAT_BACKING_METADATA_KEY, chatCatalogV2ToCatalogChats } from '../../node/agentHostCatalogSourceResolver.js';
import { AgentHostSavedChatService, type AgentHostSavedChatArchiveTarget, type IAgentHostSavedChatReadContext, type IAgentHostSavedChatReader } from '../../node/agentHostSavedChatService.js';
import { CHAT_WORKING_DIRECTORIES_METADATA_KEY } from '../../node/agentHostPeerChatStore.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { createTestSessionStateStore } from './chatMetadataTestHelpers.js';
import { replayThreadToTurns } from '../../node/codex/codexReplayMapper.js';
import type { Thread } from '../../node/codex/protocol/generated/v2/Thread.js';
import { SESSION_WORKING_DIRECTORIES_KEY } from '../../node/shared/persistSessionMetadata.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY } from '../../node/shared/sessionAdditionalWorktrees.js';
import { readPersistedWorktreeMetadata } from '../../node/shared/worktreeIsolation.js';

suite('AgentHostSavedChatService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('ahp-session:/saved-owner');
	const defaultChat = URI.parse('ahp-chat:/saved-default');
	const peerChat = URI.parse('ahp-chat:/saved-peer');
	const folder = URI.file('/saved/project');

	function turn(id: string, text: string): Turn {
		return {
			id,
			message: { text, origin: { kind: MessageKind.User } },
			responseParts: [{ kind: ResponsePartKind.Markdown, id: `${id}-response`, content: `${text} response` }],
			usage: {},
			state: TurnState.Complete,
		};
	}

	async function fixture(provider: AgentProvider = 'claude', normalized = true, withPeer = true) {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const sessionDatabase = disposables.add(await SessionDatabase.open(':memory:'));
		const peerDatabase = disposables.add(await SessionDatabase.open(':memory:'));
		await sessionDatabase.setMetadata(SESSION_WORKING_DIRECTORIES_KEY, JSON.stringify([folder.toString()]));
		await database.registerSessionV2(session.toString(), { provider, startTime: 1, source: 'explicit' }, { checkTombstone: false });
		if (normalized) {
			assert.strictEqual((await database.registerChatCatalogV2(session.toString(), {
				defaultChat: { chat: defaultChat.toString(), order: 0, storageResource: session.toString(), providerData: 'opaque-default-backing', metadata: { summary: 'Saved default' } },
				peers: withPeer ? [{ chat: peerChat.toString(), order: 1, storageResource: peerChat.toString(), providerData: 'opaque-peer-backing', metadata: { summary: 'Saved peer' } }] : [],
				privateDescendants: [],
			})).status, 'applied');
		}
		const storage = new Map<string, ISessionDatabase>([[session.toString(), sessionDatabase], [peerChat.toString(), peerDatabase]]);
		const dataService = new class extends mock<ISessionDataService>() {
			override async tryOpenDatabase(resource: URI): Promise<IReference<ISessionDatabase> | undefined> {
				const database = storage.get(resource.toString());
				return database ? { object: database, dispose: () => { } } : undefined;
			}
			override openDatabase(): never { throw new Error('Saved reads must not create storage'); }
			override getSessionDataDir(resource: URI): URI { return URI.file(`/data/${resource.path}`); }
		}();
		const calls: IAgentHostSavedChatReadContext[] = [];
		const reader: IAgentHostSavedChatReader = {
			read: async context => {
				calls.push(context);
				void context.storageResource.fsPath;
				context.workingDirectories.forEach(directory => void directory.fsPath);
				return [turn('native', context.providerData === 'opaque-peer-backing' ? 'Peer question' : 'Saved question')];
			},
		};
		const readers = new Map<AgentProvider, IAgentHostSavedChatReader>([[provider, reader]]);
		const createService = () => new AgentHostSavedChatService(readers, database, dataService, createTestSessionStateStore(database, dataService), new NullLogService());
		return { database, sessionDatabase, peerDatabase, dataService, readers, calls, createService };
	}

	for (const provider of ['claude', 'codex']) {
		test(`reads saved ${provider} history and draft after a fresh service without an executable provider`, async () => {
			const { sessionDatabase, calls, createService } = await fixture(provider);
			const draft = { text: 'Continue with this draft', origin: { kind: MessageKind.User } };
			await sessionDatabase.setChatDraft(defaultChat, draft);
			const saved = await createService().readSavedChat(session);
			assert.match(saved.identity, /^[a-f0-9]{64}$/);
			assert.deepStrictEqual({
				saved: savedChatToDto(saved), backing: {
					session: calls[0].session.toString(), chat: calls[0].chat.toString(), storage: calls[0].storageResource.toString(),
					providerData: calls[0].providerData, origin: calls[0].origin, workingDirectories: calls[0].workingDirectories.map(directory => directory.toString()),
				}
			}, {
				saved: { session: session.toString(), chat: defaultChat.toString(), provider, identity: saved.identity, availability: { kind: 'available' }, title: 'Saved default', turns: [turn('native', 'Saved question')], draft, workspace: { kind: 'folder', workingDirectories: [folder.toString()] } },
				backing: { session: session.toString(), chat: defaultChat.toString(), storage: session.toString(), providerData: 'opaque-default-backing', origin: undefined, workingDirectories: [folder.toString()] },
			});
			assert.deepStrictEqual(savedChatToDto(await createService().readSavedChat(session)), savedChatToDto(saved));
		});
	}

	test('recovers a standard owner whose native alias marked their shared storage as a backing', async () => {
		const { sessionDatabase, database, createService, calls } = await fixture('codex');
		const alias = URI.parse('codex:/saved-owner');
		await sessionDatabase.setMetadata(CHAT_BACKING_METADATA_KEY, defaultChat.toString());
		await sessionDatabase.setChatDraft(defaultChat, { text: 'Saved unsent draft', origin: { kind: MessageKind.User } });
		const [snapshot] = await database.readCatalogSnapshot([session.toString()]);
		assert.ok(snapshot.header);
		const encoded = encodeAgentHostCatalogPayload({
			modifiedTime: 1, isRead: true, isArchived: false, isChatBacking: true,
			workingDirectories: [folder.toString()], chats: chatCatalogV2ToCatalogChats(snapshot),
		});
		assert.ok(encoded.ok);
		assert.strictEqual(await database.upsertSessionV2FromChatCatalog({
			session: session.toString(), sessionGeneration: 'saved-owner-generation', sourceRevision: 1,
			payloadVersion: 2, payload: encoded.value.payload, payloadHash: encoded.value.payloadHash, verified: true,
		}, undefined, snapshot.header.revision), 'applied');
		await database.registerSessionV2(alias.toString(), { provider: 'codex', startTime: 1, source: 'discovery' }, { checkTombstone: false });
		assert.strictEqual(await database.excludeSessionV2({ provider: 'codex', session: alias.toString(), reason: 'backing', fingerprint: 'backing-v1' }, {
			identity: await database.getSessionV2Registration(alias.toString()), catalog: undefined,
		}), 'excluded');
		const listed = await new AgentHostCatalogListReader(database).read({ session, provider: 'codex', startTime: 1, modifiedTime: 1, external: false, source: 'explicit' });
		const saved = await createService().readSavedChat(session);
		await assert.rejects(createService().readSavedChat(alias), /not found/i);
		assert.deepStrictEqual({
			listed: listed.eligible, turns: saved.turns, draft: saved.draft?.text,
			readers: calls.map(call => call.session.toString()),
			excluded: (await database.getSessionsV2Exclusion('codex', alias.toString()))?.reason,
		}, {
			listed: true, turns: [turn('native', 'Saved question')], draft: 'Saved unsent draft',
			readers: [session.toString()], excluded: 'backing',
		});
	});

	test('reads the requested peer backing and never substitutes the default for a missing chat', async () => {
		const { calls, createService } = await fixture();
		const service = createService();
		const saved = await service.readSavedChat(session, peerChat);
		await assert.rejects(service.readSavedChat(session, URI.parse(buildChatUri(session, 'removed'))), /not found|does not belong/i);
		await assert.rejects(service.readSavedChat(session, URI.parse(buildChatUri(URI.parse('ahp-session:/other'), 'peer'))), /not found|does not belong/i);
		assert.deepStrictEqual({ chat: saved.chat, title: saved.title, turns: saved.turns, readBackings: calls.map(call => call.providerData) }, {
			chat: peerChat, title: 'Saved peer', turns: [turn('native', 'Peer question')], readBackings: ['opaque-peer-backing'],
		});
	});

	test('keeps the saved fingerprint stable across real Codex replay IDs while retaining response and tool content', async () => {
		const { readers, createService } = await fixture('codex');
		const native: Thread = {
			id: 'native', sessionId: 'native', environments: null, extra: null, forkedFromId: null, parentThreadId: null,
			preview: 'Saved question', ephemeral: false, section: null, sectionEnteredAt: null, projectId: null,
			historyMode: 'legacy', modelProvider: 'openai', model: null, reasoningEffort: null,
			createdAt: 1, updatedAt: 2, recencyAt: null, status: { type: 'notLoaded' }, path: null,
			cwd: '/workspace', cliVersion: '0.160.0', originator: 'vscode_agent_host', source: 'vscode',
			canAcceptDirectInput: null, threadSource: null, agentNickname: null, agentRole: null, gitInfo: null, name: null, daybreakEnabled: null,
			turns: [{
				id: 'native-turn', status: 'completed', itemsView: 'full', error: null, startedAt: null, completedAt: null, durationMs: null,
				items: [
					{ type: 'userMessage', id: 'prompt', clientId: null, content: [{ type: 'text', text: 'Saved question', text_elements: [] }] },
					{ type: 'agentMessage', id: 'answer', text: 'Saved answer', phase: 'final_answer', memoryCitation: null, delivery: null, questions: null },
					{ type: 'webSearch', id: 'search', query: 'VS Code', action: null, results: null },
					{ type: 'imageGeneration', id: 'image', status: 'completed', revisedPrompt: 'Draw a square', result: 'aW1hZ2U=', failure: null },
					{ type: 'fileChange', id: 'patch', changes: [], status: 'completed' },
					{ type: 'contextCompaction', id: 'compaction' },
				],
			}],
		};
		readers.set('codex', { read: async () => replayThreadToTurns(native) });
		const first = await createService().readSavedChat(session);
		const second = await createService().readSavedChat(session);
		assert.notDeepStrictEqual(first.turns, second.turns);
		assert.strictEqual(first.identity, second.identity);
		const search = native.turns[0].items.find(item => item.type === 'webSearch');
		assert.ok(search?.type === 'webSearch');
		search.query = 'A different search';
		const changedTool = await createService().readSavedChat(session);
		assert.notStrictEqual(changedTool.identity, first.identity);
		const answer = native.turns[0].items.find(item => item.type === 'agentMessage');
		assert.ok(answer?.type === 'agentMessage');
		answer.text = 'A different saved answer';
		assert.notStrictEqual((await createService().readSavedChat(session)).identity, changedTool.identity);
	});

	test('supplies the exact saved spawning backing for a tool-origin chat', async () => {
		const { database, calls, createService } = await fixture();
		const child = URI.parse('ahp-chat:/saved-subagent');
		const [snapshot] = await database.readCatalogSnapshot([session.toString()]);
		assert.ok(snapshot.header);
		await database.insertPrivateChatV2(session.toString(), {
			chat: child.toString(), parentChat: defaultChat.toString(), providerData: 'opaque-child-backing',
			metadata: { interactivity: ChatInteractivity.Hidden },
			origin: JSON.stringify({ kind: ChatOriginKind.Tool, chat: defaultChat.toString(), toolCallId: 'tool-call' }),
		}, snapshot.header.revision);
		const saved = await createService().readSavedChat(session, child);
		assert.deepStrictEqual({ chat: saved.chat.toString(), backing: calls[0].providerData, parent: calls[0].parent?.providerData }, {
			chat: child.toString(), backing: 'opaque-child-backing', parent: 'opaque-default-backing',
		});
	});

	test('honors a legacy empty central catalog over a stale peer mirror', async () => {
		const { database, sessionDatabase, calls, createService } = await fixture('claude', false);
		await sessionDatabase.setMetadataValues({ defaultChatProviderData: 'opaque-default-backing', peerChats: JSON.stringify([{ uri: peerChat.toString(), providerData: 'stale-peer-backing' }]) });
		await database.replaceSessionChatCatalog(session.toString(), [], undefined);
		const saved = await createService().readSavedChat(session);
		await assert.rejects(createService().readSavedChat(session, peerChat), /not found/i);
		assert.deepStrictEqual({ chat: saved.chat.toString(), history: saved.turns, backing: calls.map(call => call.providerData) }, {
			chat: buildDefaultChatUri(session), history: [turn('native', 'Saved question')], backing: ['opaque-default-backing'],
		});
	});

	for (const peer of ['ahp-chat:/legacy-peer', buildChatUri('claude:/former-owner', 'peer')]) {
		test(`reads legacy peer ${peer} using recorded membership`, async () => {
			const { database, calls, createService } = await fixture('claude', false);
			await database.replaceSessionChatCatalog(session.toString(), [{ chat: peer, order: 0, providerData: 'opaque-peer-backing' }], undefined);
			const saved = await createService().readSavedChat(session, URI.parse(peer));
			assert.deepStrictEqual({ chat: saved.chat.toString(), turns: saved.turns, owner: calls[0].session.toString() }, {
				chat: peer, turns: [turn('native', 'Peer question')], owner: session.toString(),
			});
		});
	}

	test('inherits saved session directories for a legacy peer with an empty directory override', async () => {
		const { database, peerDatabase, calls, createService } = await fixture('codex', false);
		await database.replaceSessionChatCatalog(session.toString(), [{ chat: peerChat.toString(), order: 0, providerData: 'opaque-peer-backing' }], undefined);
		await peerDatabase.setMetadata(CHAT_WORKING_DIRECTORIES_METADATA_KEY, '');
		const saved = await createService().readSavedChat(session, peerChat);
		assert.deepStrictEqual({ turns: saved.turns, workspace: savedChatToDto(saved).workspace, readerDirectories: calls[0].workingDirectories.map(directory => directory.toString()) }, {
			turns: [turn('native', 'Peer question')], workspace: { kind: 'folder', workingDirectories: [folder.toString()] }, readerDirectories: [folder.toString()],
		});
	});

	test('rejects a malformed nonempty saved peer directory override', async () => {
		const { database, peerDatabase, calls, createService } = await fixture('codex', false);
		await database.replaceSessionChatCatalog(session.toString(), [{ chat: peerChat.toString(), order: 0, providerData: 'opaque-peer-backing' }], undefined);
		await peerDatabase.setMetadata(CHAT_WORKING_DIRECTORIES_METADATA_KEY, '{broken');
		await assert.rejects(createService().readSavedChat(session, peerChat), SyntaxError);
		assert.deepStrictEqual(calls, []);
	});

	test('projects failed and local turns in place without pruning durable records or crossing chats', async () => {
		const { sessionDatabase, createService } = await fixture();
		for (const record of [
			{ kind: 'local' as const, turnId: 'head', chatUri: defaultChat.toString(), anchorTurnId: undefined, payload: JSON.stringify(turn('head', 'Before history')) },
			{ kind: 'local' as const, turnId: 'local', chatUri: defaultChat.toString(), anchorTurnId: 'native', payload: JSON.stringify(turn('local', 'Local command')) },
			{ kind: 'failed' as const, turnId: 'failed', chatUri: defaultChat.toString(), anchorTurnId: 'native', payload: JSON.stringify(turn('failed', 'Failed request')) },
			{ kind: 'failed' as const, turnId: 'native', chatUri: defaultChat.toString(), anchorTurnId: undefined, payload: JSON.stringify(turn('native', 'Stale copy')) },
			{ kind: 'local' as const, turnId: 'orphan', chatUri: defaultChat.toString(), anchorTurnId: 'truncated', payload: JSON.stringify(turn('orphan', 'Truncated command')) },
			{ kind: 'local' as const, turnId: 'peer-local', chatUri: peerChat.toString(), anchorTurnId: undefined, payload: JSON.stringify(turn('peer-local', 'Other chat')) },
		]) {
			await sessionDatabase.insertPersistedTurn(record);
		}
		const before = await sessionDatabase.getPersistedTurns();
		const saved = await createService().readSavedChat(session);
		assert.deepStrictEqual({ turns: saved.turns, records: await sessionDatabase.getPersistedTurns() }, {
			turns: [turn('head', 'Before history'), turn('native', 'Saved question'), turn('local', 'Local command'), turn('failed', 'Failed request')], records: before,
		});
	});

	test('keeps explicit workspaceless intent despite a saved scratch working directory', async () => {
		const { sessionDatabase, createService } = await fixture();
		await sessionDatabase.setMetadata(AH_META_WORKSPACELESS_DB_KEY, 'true');
		assert.deepStrictEqual((await createService().readSavedChat(session)).workspace, { kind: 'none' });
	});

	test('requires a separate workspace for all source-owned checkouts and preserves exact peer roots', async () => {
		const { sessionDatabase, database, createService } = await fixture();
		const extra = URI.file('/saved/extra');
		await sessionDatabase.setMetadataValues({
			'copilot.worktree.branchName': 'agents/saved',
			'copilot.worktree.path': folder.toString(),
			'copilot.worktree.repositoryRoot': URI.file('/original/project').toString(),
			[SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([folder.toString(), extra.toString()]),
			[ADDITIONAL_WORKTREES_METADATA_KEY]: JSON.stringify([{ handle: '11111111-1111-4111-8111-111111111111', workingDirectory: extra.toString(), repositoryRoot: URI.file('/original/extra').toString(), chat: peerChat.toString() }]),
		});
		const peer = await database.readChatV2(session.toString(), peerChat.toString());
		assert.ok(peer.chat);
		await database.updateChatV2Metadata(peerChat.toString(), peer.chat, { workingDirectories: [URI.file('/saved/extra/src').toString()] });
		const defaultWorkspace = savedChatToDto(await createService().readSavedChat(session)).workspace;
		const peerWorkspace = savedChatToDto(await createService().readSavedChat(session, peerChat)).workspace;
		assert.deepStrictEqual({ defaultWorkspace, peerWorkspace }, {
			defaultWorkspace: { kind: 'managed', workingDirectories: [folder.toString(), extra.toString()], managedDirectories: [folder.toString(), extra.toString()], suggestedDirectories: [URI.file('/original/project').toString(), URI.file('/original/extra').toString()] },
			peerWorkspace: { kind: 'managed', workingDirectories: [URI.file('/saved/extra/src').toString()], managedDirectories: [folder.toString(), extra.toString()], suggestedDirectories: [URI.file('/original/extra/src').toString()] },
		});
	});

	test('does not guess the original repository from a checkout path', async () => {
		const { sessionDatabase, createService } = await fixture();
		await sessionDatabase.setMetadataValues({ 'copilot.worktree.branchName': 'saved', 'copilot.worktree.path': folder.toString() });
		assert.deepStrictEqual(savedChatToDto(await createService().readSavedChat(session)).workspace, {
			kind: 'managed', workingDirectories: [folder.toString()], managedDirectories: [folder.toString()], suggestedDirectories: [],
		});
	});

	test('retains a cold database reference until all saved worktree metadata reads finish', async () => {
		const database = disposables.add(await SessionDatabase.open(':memory:'));
		await database.setMetadataValues({ 'copilot.worktree.branchName': 'saved', 'copilot.worktree.path': folder.toString() });
		let referenceDisposed = false;
		const dataService = new class extends mock<ISessionDataService>() {
			override async tryOpenDatabase(_resource: URI): Promise<IReference<ISessionDatabase>> {
				return {
					object: new class extends mock<ISessionDatabase>() {
						override async getMetadataObject<T extends Record<string, unknown>>(keys: T): Promise<{ [K in keyof T]: string | undefined }> {
							await Promise.resolve();
							assert.strictEqual(referenceDisposed, false, 'metadata read outlived its database reference');
							return database.getMetadataObject(keys);
						}
					}(),
					dispose: () => { referenceDisposed = true; },
				};
			}
		}();
		const metadata = await readPersistedWorktreeMetadata(async resource => {
			const ref = await dataService.tryOpenDatabase(resource);
			return ref && { reader: ref.object, dispose: () => ref.dispose() };
		}, session, new NullLogService());
		assert.deepStrictEqual({ branch: metadata?.branchName, path: metadata?.worktreePath?.toString(), referenceDisposed }, {
			branch: 'saved', path: folder.toString(), referenceDisposed: true,
		});
	});

	test('does not return an incomplete success when host-persisted history is corrupt', async () => {
		const { sessionDatabase, createService } = await fixture();
		await sessionDatabase.insertPersistedTurn({ kind: 'local', chatUri: defaultChat.toString(), turnId: 'broken', anchorTurnId: undefined, payload: '{broken' });
		await assert.rejects(createService().readSavedChat(session), /host history is invalid/i);
	});

	test('distinguishes unavailable and missing native history from a valid empty conversation', async () => {
		const { readers, createService } = await fixture();
		readers.clear();
		await assert.rejects(createService().readSavedChat(session), /reader.*unavailable/i);
		readers.set('claude', { read: async () => { throw new Error('Native transcript is missing'); } });
		await assert.rejects(createService().readSavedChat(session), /Native transcript is missing/);
		readers.set('claude', { read: async () => [] });
		assert.deepStrictEqual((await createService().readSavedChat(session)).turns, []);
	});

	test('rejects a tombstone before reading and one written during native history access', async () => {
		const { database, readers, calls, createService } = await fixture();
		const started = new DeferredPromise<void>();
		const released = new DeferredPromise<readonly Turn[]>();
		readers.set('claude', { read: async () => { started.complete(); return released.p; } });
		const pending = createService().readSavedChat(session);
		await started.p;
		await database.markSessionTombstoned(session.toString());
		released.complete([turn('late', 'Must not escape deletion')]);
		await assert.rejects(pending, /not found|changed|deleted/i);
		await assert.rejects(createService().readSavedChat(session), /not found|deleted/i);
		assert.deepStrictEqual(calls, []);
	});

	test('rejects cancellation before entering the native reader', async () => {
		const { calls, createService } = await fixture();
		const cancellation = disposables.add(new CancellationTokenSource());
		cancellation.cancel();
		await assert.rejects(createService().readSavedChat(session, undefined, cancellation.token), /cancel/i);
		assert.deepStrictEqual(calls, []);
	});

	test('discards history when the exact peer is removed during the read', async () => {
		const { database, readers, createService } = await fixture();
		readers.set('claude', {
			read: async () => {
				const [snapshot] = await database.readCatalogSnapshot([session.toString()]);
				assert.strictEqual((await database.replaceSessionChatCatalog(session.toString(), [], snapshot.header?.revision)).status, 'applied');
				return [turn('late-peer', 'Deleted peer history')];
			}
		});
		await assert.rejects(createService().readSavedChat(session, peerChat), /does not belong/i);
		assert.strictEqual((await database.readChatV2(session.toString(), peerChat.toString())).chat, undefined);
	});

	test('uses the persisted inherited boundary to hide side-chat source context', async () => {
		const { database, readers, createService } = await fixture();
		const savedPeer = await database.readChatV2(session.toString(), peerChat.toString());
		assert.ok(savedPeer.chat);
		await database.updateChatV2Metadata(peerChat.toString(), savedPeer.chat, {
			origin: JSON.stringify({ kind: ChatOriginKind.SideChat, chat: defaultChat.toString(), turnId: 'inherited' }), inheritedTurnId: 'inherited',
		});
		readers.set('claude', { read: async () => [turn('inherited', 'Source context'), turn('own', 'Side question')] });
		assert.deepStrictEqual((await createService().readSavedChat(session, peerChat)).turns, [turn('own', 'Side question')]);
	});

	suite('completed continuations', () => {
		const destination = URI.parse('ahp-session:/copilot-copy');

		async function continuationFixture(withPeer = true) {
			const result = await fixture('claude', true, withPeer);
			const registerDestination = async (resource = destination, provider = 'copilotcli') => {
				await result.database.registerSessionV2(resource.toString(), { provider, startTime: 2, source: 'explicit' }, { checkTombstone: false });
				const encoded = encodeAgentHostCatalogPayload({
					modifiedTime: 2, isRead: true, isArchived: false, workingDirectories: [],
					chats: [{ uri: buildDefaultChatUri(resource), kind: 'default', order: 0 }],
				});
				assert.ok(encoded.ok);
				await result.database.upsertSessionV2({ session: resource.toString(), sessionGeneration: resource.toString(), sourceRevision: 1, payloadVersion: 2, payload: encoded.value.payload, payloadHash: encoded.value.payloadHash, verified: true }, undefined);
			};
			await registerDestination();
			const archived: AgentHostSavedChatArchiveTarget[] = [];
			const archive = async (target: AgentHostSavedChatArchiveTarget, validate: () => Promise<void>) => {
				await validate();
				archived.push(target);
				if (target.kind === 'session') {
					await result.sessionDatabase.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, 'true');
				} else {
					const current = await result.database.readChatV2(session.toString(), target.chat.toString());
					assert.ok(current.chat);
					await result.database.updateChatV2Metadata(target.chat.toString(), current.chat, { archived: true });
				}
				return true;
			};
			return { ...result, registerDestination, archived, archive };
		}

		test('persists a completed receipt across service recreation while retaining an uncopied public peer', async () => {
			const { createService, archive, archived } = await continuationFixture();
			const saved = await createService().readSavedChat(session);
			const request = { session, chat: saved.chat, identity: saved.identity, destination };
			const first = await createService().completeSavedChatContinuation(request, archive);
			const repeated = await createService().completeSavedChatContinuation(request, archive);
			assert.deepStrictEqual({ first, repeated, availability: savedChatToDto(await createService().readSavedChat(session)).availability, peer: (await createService().readSavedChat(session, peerChat)).availability, archived }, {
				first: { archived: false }, repeated: { archived: false }, availability: { kind: 'continued', destination: destination.toString() }, peer: { kind: 'available' }, archived: [],
			});
		});

		test('archives an independent copied peer and then the aggregate when every public chat is covered', async () => {
			const { createService, archive, archived } = await continuationFixture();
			const peer = await createService().readSavedChat(session, peerChat);
			const first = await createService().completeSavedChatContinuation({ session, chat: peer.chat, identity: peer.identity, destination }, archive);
			const before = await createService().readSavedChat(session);
			const second = await createService().completeSavedChatContinuation({ session, chat: before.chat, identity: before.identity, destination }, archive);
			assert.deepStrictEqual({ first, second, before: before.availability, archived: archived.map(target => target.kind === 'chat' ? { kind: target.kind, chat: target.chat.toString() } : target) }, {
				first: { archived: true }, second: { archived: true }, before: { kind: 'available' }, archived: [{ kind: 'chat', chat: peerChat.toString() }, { kind: 'session' }],
			});
		});

		test('keeps private tool descendants readable through an archived original without claiming they were copied', async () => {
			const { database, createService, archive } = await continuationFixture(false);
			const child = URI.parse('ahp-chat:/uncopied-private-child');
			const [snapshot] = await database.readCatalogSnapshot([session.toString()]);
			assert.ok(snapshot.header);
			await database.insertPrivateChatV2(session.toString(), {
				chat: child.toString(), parentChat: defaultChat.toString(), providerData: 'private-backing', metadata: { interactivity: ChatInteractivity.Hidden },
				origin: JSON.stringify({ kind: ChatOriginKind.Tool, chat: defaultChat.toString(), toolCallId: 'original-tool' }),
			}, snapshot.header.revision);
			const saved = await createService().readSavedChat(session);
			const completed = await createService().completeSavedChatContinuation({ session, chat: saved.chat, identity: saved.identity, destination }, archive);
			const reopened = await createService().readSavedChat(session, child);
			assert.deepStrictEqual({ completed, availability: reopened.availability, origin: reopened.origin, turns: reopened.turns }, {
				completed: { archived: true }, availability: { kind: 'archived' }, origin: { kind: ChatOriginKind.Tool, chat: defaultChat.toString(), toolCallId: 'original-tool' }, turns: [turn('native', 'Saved question')],
			});
		});

		test('retains an uncopied public side chat', async () => {
			const { database, createService, archive, archived } = await continuationFixture();
			const peer = await database.readChatV2(session.toString(), peerChat.toString());
			assert.ok(peer.chat);
			await database.updateChatV2Metadata(peerChat.toString(), peer.chat, { origin: JSON.stringify({ kind: ChatOriginKind.SideChat, chat: defaultChat.toString(), turnId: 'source-turn' }) });
			const saved = await createService().readSavedChat(session);
			const completed = await createService().completeSavedChatContinuation({ session, chat: saved.chat, identity: saved.identity, destination }, archive);
			assert.deepStrictEqual({ completed, archived, side: (await createService().readSavedChat(session, peerChat)).availability }, { completed: { archived: false }, archived: [], side: { kind: 'available' } });
		});

		test('rejects a conflicting completed destination and stale backing identity', async () => {
			const { database, createService, archive, registerDestination, archived } = await continuationFixture();
			const other = URI.parse('ahp-session:/other-copy');
			await registerDestination(other);
			const saved = await createService().readSavedChat(session);
			const request = { session, chat: saved.chat, identity: saved.identity, destination };
			await createService().completeSavedChatContinuation(request, archive);
			await assert.rejects(createService().completeSavedChatContinuation({ ...request, destination: other }, archive), /already continued/i);
			const current = await database.readChatV2(session.toString(), saved.chat.toString());
			assert.ok(current.chat);
			await database.updateChatV2Metadata(saved.chat.toString(), current.chat, { providerData: 'replacement-backing' });
			await assert.rejects(createService().completeSavedChatContinuation(request, archive), /identity changed/i);
			assert.deepStrictEqual(archived, []);
		});

		test('rejects a non-Copilot destination before recording completion', async () => {
			const { createService, archive, registerDestination } = await continuationFixture(false);
			const other = URI.parse('ahp-session:/claude-copy');
			await registerDestination(other, 'claude');
			const saved = await createService().readSavedChat(session);
			await assert.rejects(createService().completeSavedChatContinuation({ session, chat: saved.chat, identity: saved.identity, destination: other }, archive), /Copilot destination/);
			assert.deepStrictEqual((await createService().readSavedChat(session)).availability, { kind: 'available' });
		});

		for (const withPeer of [false, true]) {
			for (const removed of ['tombstoned', 'missing'] as const) {
				test(`recovers a ${removed} completed destination while its source is ${withPeer ? 'retained for a peer' : 'archived'}`, async () => {
					const { database, createService, archive, registerDestination } = await continuationFixture(withPeer);
					const saved = await createService().readSavedChat(session);
					const request = { session, chat: saved.chat, identity: saved.identity, destination };
					await createService().completeSavedChatContinuation(request, archive);
					if (removed === 'tombstoned') {
						await database.markSessionTombstoned(destination.toString());
					} else {
						await database.unregisterSessionV2(destination.toString());
					}
					const reopened = await createService().readSavedChat(session);
					assert.deepStrictEqual({ availability: reopened.availability, identity: reopened.identity, turns: reopened.turns }, {
						availability: { kind: withPeer ? 'available' : 'archived' }, identity: saved.identity, turns: [turn('native', 'Saved question')],
					});
					const replacement = URI.parse('ahp-session:/replacement-copy');
					await registerDestination(replacement);
					const completed = await createService().completeSavedChatContinuation({ ...request, destination: replacement }, archive);
					assert.deepStrictEqual({ completed, availability: savedChatToDto(await createService().readSavedChat(session)).availability }, {
						completed: { archived: !withPeer }, availability: { kind: 'continued', destination: replacement.toString() },
					});
				});
			}
		}

		test('atomically chooses one replacement for a deleted completed destination', async () => {
			const { database, createService, archive, registerDestination } = await continuationFixture(false);
			const saved = await createService().readSavedChat(session);
			const request = { session, chat: saved.chat, identity: saved.identity, destination };
			await createService().completeSavedChatContinuation(request, archive);
			await database.markSessionTombstoned(destination.toString());
			const replacements = [URI.parse('ahp-session:/replacement-one'), URI.parse('ahp-session:/replacement-two')];
			for (const replacement of replacements) {
				await registerDestination(replacement);
			}
			const results = await Promise.allSettled(replacements.map(destination => createService().completeSavedChatContinuation({ ...request, destination }, archive)));
			const winner = results.findIndex(result => result.status === 'fulfilled');
			assert.deepStrictEqual(results.map(result => result.status).sort(), ['fulfilled', 'rejected']);
			assert.deepStrictEqual(savedChatToDto(await createService().readSavedChat(session)).availability, { kind: 'continued', destination: replacements[winner].toString() });
		});

		test('keeps completion durable when archive fails and permits an archive-only retry', async () => {
			const { createService, archive } = await continuationFixture(false);
			const saved = await createService().readSavedChat(session);
			const request = { session, chat: saved.chat, identity: saved.identity, destination };
			await assert.rejects(createService().completeSavedChatContinuation(request, async () => { throw new Error('archive unavailable'); }), /archive unavailable/);
			const availability = savedChatToDto(await createService().readSavedChat(session)).availability;
			assert.deepStrictEqual({ availability, retry: await createService().completeSavedChatContinuation(request, archive) }, { availability: { kind: 'continued', destination: destination.toString() }, retry: { archived: true } });
		});

		test('allows a new continuation when an unarchived original has a genuinely new turn', async () => {
			const { createService, readers, sessionDatabase, archive, registerDestination } = await continuationFixture(false);
			const saved = await createService().readSavedChat(session);
			const request = { session, chat: saved.chat, identity: saved.identity, destination };
			await createService().completeSavedChatContinuation(request, archive);
			await sessionDatabase.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, '');
			readers.set('claude', { read: async () => [turn('native', 'Saved question'), turn('new-turn', 'New work after unarchiving')] });
			const changed = await createService().readSavedChat(session);
			await assert.rejects(createService().completeSavedChatContinuation(request, archive), /identity changed/i);
			const replacement = URI.parse('ahp-session:/new-history-copy');
			await registerDestination(replacement);
			const completed = await createService().completeSavedChatContinuation({ session, chat: changed.chat, identity: changed.identity, destination: replacement }, archive);
			assert.deepStrictEqual({ changed: changed.availability, newIdentity: changed.identity !== saved.identity, completed, availability: savedChatToDto(await createService().readSavedChat(session)).availability }, {
				changed: { kind: 'available' }, newIdentity: true, completed: { archived: true }, availability: { kind: 'continued', destination: replacement.toString() },
			});
		});
	});
});
