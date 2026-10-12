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
import { AH_META_WORKSPACELESS_DB_KEY, buildChatUri, buildDefaultChatUri, buildSubagentChatUri, ChatInteractivity, ChatOriginKind, MessageKind, ResponsePartKind, TurnState, type Turn } from '../../common/state/sessionState.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostSavedChatService, type IAgentHostSavedChatReadContext, type IAgentHostSavedChatReader } from '../../node/agentHostSavedChatService.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { SESSION_WORKING_DIRECTORIES_KEY } from '../../node/shared/persistSessionMetadata.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY } from '../../node/shared/sessionAdditionalWorktrees.js';
import { readPersistedWorktreeMetadata } from '../../node/shared/worktreeIsolation.js';

suite('AgentHostSavedChatService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('ahp-session:/saved-owner');
	const defaultChat = URI.parse(buildChatUri(session, 'first'));
	const peerChat = URI.parse(buildChatUri(session, 'peer'));
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

	async function fixture(provider: AgentProvider = 'claude', normalized = true) {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const sessionDatabase = disposables.add(await SessionDatabase.open(':memory:'));
		const peerDatabase = disposables.add(await SessionDatabase.open(':memory:'));
		await sessionDatabase.setMetadata(SESSION_WORKING_DIRECTORIES_KEY, JSON.stringify([folder.toString()]));
		await database.registerSessionV2(session.toString(), { provider, startTime: 1, source: 'explicit' }, { checkTombstone: false });
		if (normalized) {
			assert.strictEqual((await database.registerChatCatalogV2(session.toString(), {
				defaultChat: { chat: defaultChat.toString(), order: 0, storageResource: session.toString(), providerData: 'opaque-default-backing', metadata: { summary: 'Saved default' } },
				peers: [{ chat: peerChat.toString(), order: 1, storageResource: peerChat.toString(), providerData: 'opaque-peer-backing', metadata: { summary: 'Saved peer' } }],
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
		const createService = () => new AgentHostSavedChatService(readers, database, dataService, new NullLogService());
		return { database, sessionDatabase, peerDatabase, dataService, readers, calls, createService };
	}

	for (const provider of ['claude', 'codex']) {
		test(`reads saved ${provider} history and draft after a fresh service without an executable provider`, async () => {
			const { sessionDatabase, calls, createService } = await fixture(provider);
			const draft = { text: 'Continue with this draft', origin: { kind: MessageKind.User } };
			await sessionDatabase.setChatDraft(defaultChat, draft);
			const saved = await createService().readSavedChat(session);
			assert.deepStrictEqual({
				saved: savedChatToDto(saved), backing: {
					session: calls[0].session.toString(), chat: calls[0].chat.toString(), storage: calls[0].storageResource.toString(),
					providerData: calls[0].providerData, origin: calls[0].origin, workingDirectories: calls[0].workingDirectories.map(directory => directory.toString()),
				}
			}, {
				saved: { session: session.toString(), chat: defaultChat.toString(), provider, title: 'Saved default', turns: [turn('native', 'Saved question')], draft, workspace: { kind: 'folder', workingDirectories: [folder.toString()] } },
				backing: { session: session.toString(), chat: defaultChat.toString(), storage: session.toString(), providerData: 'opaque-default-backing', origin: undefined, workingDirectories: [folder.toString()] },
			});
			assert.deepStrictEqual(savedChatToDto(await createService().readSavedChat(session)), savedChatToDto(saved));
		});
	}

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

	test('supplies the exact saved spawning backing for a tool-origin chat', async () => {
		const { database, calls, createService } = await fixture();
		const child = URI.parse(buildSubagentChatUri(session, 'tool-call'));
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
			override async tryOpenDatabase(): Promise<IReference<ISessionDatabase>> {
				return {
					object: new class extends mock<ISessionDatabase>() {
						override async getMetadata(key: string): Promise<string | undefined> {
							await Promise.resolve();
							assert.strictEqual(referenceDisposed, false, 'metadata read outlived its database reference');
							return database.getMetadata(key);
						}
					}(),
					dispose: () => { referenceDisposed = true; },
				};
			}
		}();
		const metadata = await readPersistedWorktreeMetadata(dataService, session, new NullLogService());
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
});
