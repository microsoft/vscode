/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyChangeEvent, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { parse } from '../../../../../../base/common/marshalling.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../../platform/storage/common/storage.js';
import { EditorInputWithOptions } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IContentPart, IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { EditorWindowComposerFoldersService, IEditorWindowComposerFoldersService } from '../../../browser/editorWindow/editorWindowComposerFolders.js';
import { IEditorService, PreferredGroup } from '../../../../../services/editor/common/editorService.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { ISessionHost } from '../../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { AgentsChatPartService, IAgentsChatPartService, restoreAgentsChatPart } from '../../../browser/agentsView/agentsChatPart.js';
import { IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { EditorWindowMainSessionHost } from '../../../browser/agentsView/editorWindowMainSessionHost.js';
import { ChatEditorInput } from '../../../browser/chatEditor/chatEditor.js';
import { CHAT_WINDOW_COMPOSERS_STORAGE_KEY, isChatWindowComposerResource } from '../../../browser/chatEditor/chatWindowComposer.js';
import { IChatViewFactory } from '../../../browser/chatViewFactory.js';
import { ISessionGroupsService } from '../../../browser/sessionGroupsService.js';
import { INewSessionDraftSlot, ISessionChange, ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { buildTestSession } from '../../common/testSessionBuilder.js';
import { ISessionsListModelService } from '../../../browser/sessionsListModelService.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';

/** An editor group that keeps its editors in memory, as the chat part's groups do, without rendering them. */
class FakeGroup {
	private static nextId = 1;
	readonly id = FakeGroup.nextId++;
	editors: EditorInput[] = [];
	activeEditor: EditorInput | null = null;
	readonly onDidActiveEditorChangeEmitter = new Emitter<void>();
	readonly onDidActiveEditorChange = this.onDidActiveEditorChangeEmitter.event;
	readonly onDidCloseEditorEmitter = new Emitter<void>();
	readonly onDidCloseEditor = this.onDidCloseEditorEmitter.event;
	get isEmpty() { return this.editors.length === 0; }
	contains(editor: EditorInput) { return this.editors.includes(editor); }
	/** Opens `editor`, which becomes active unless it opens inactive in a group that has an active editor, as in a real group. */
	open(editor: EditorInput, inactive?: boolean): void {
		if (!this.editors.includes(editor)) {
			this.editors.push(editor);
		}
		if (!inactive || !this.activeEditor) {
			this.activeEditor = editor;
			this.onDidActiveEditorChangeEmitter.fire();
		}
	}
	async closeEditor(editor: EditorInput): Promise<boolean> {
		this.editors = this.editors.filter(candidate => candidate !== editor);
		if (this.activeEditor === editor) {
			this.activeEditor = this.editors.at(-1) ?? null;
		}
		this.onDidCloseEditorEmitter.fire();
		this.onDidActiveEditorChangeEmitter.fire();
		editor.dispose();
		return true;
	}
	focus(): void { }
	dispose(): void {
		this.onDidActiveEditorChangeEmitter.dispose();
		this.onDidCloseEditorEmitter.dispose();
	}
}

/** The editor part of the chat part, as the chat part creates it: it starts with one group and adds more beside it. */
class FakePart {
	readonly groups: FakeGroup[] = [];
	activeGroup: FakeGroup;
	/** The options that the chat part enforces on it. */
	options: unknown;
	readonly element = document.createElement('div');
	private readonly onDidAddGroupEmitter = new Emitter<FakeGroup>();
	readonly onDidAddGroup = this.onDidAddGroupEmitter.event;
	private readonly onDidChangeActiveGroupEmitter = new Emitter<FakeGroup>();
	readonly onDidChangeActiveGroup = this.onDidChangeActiveGroupEmitter.event;
	readonly onDidRemoveGroup = Event.None;
	readonly onDidChange = Event.None;

	constructor() {
		this.activeGroup = this.addGroup();
	}

	addGroup(): FakeGroup {
		const group = new FakeGroup();
		this.groups.push(group);
		this.onDidAddGroupEmitter.fire(group);
		return group;
	}
	activate(group: FakeGroup): void {
		if (this.activeGroup !== group) {
			this.activeGroup = group;
			this.onDidChangeActiveGroupEmitter.fire(group);
		}
	}
	enforcePartOptions(options: unknown): IDisposable {
		this.options = options;
		return toDisposable(() => { });
	}
	setVisible(): void { }
	forceClose(): void { }
	dispose(): void {
		this.groups.forEach(group => group.dispose());
		this.onDidAddGroupEmitter.dispose();
		this.onDidChangeActiveGroupEmitter.dispose();
	}
}

/** A context key service whose keys change as a test sets them, such as chat turning off. */
class ChangingContextKeyService extends MockContextKeyService {
	private readonly onDidChangeContextEmitter = new Emitter<IContextKeyChangeEvent>();
	override get onDidChangeContext() { return this.onDidChangeContextEmitter.event; }
	setValue(key: string, value: boolean): void {
		this.createKey(key, value);
		this.onDidChangeContextEmitter.fire(upcastPartial<IContextKeyChangeEvent>({ affectsSome: keys => keys.has(key) }));
	}
	override dispose(): void {
		this.onDidChangeContextEmitter.dispose();
	}
}

const CHAT_PART_EDITORS_STORAGE_KEY = 'workbench.chatPart.editors';
const session = upcastPartial<ISession>({});
const chatA = URI.parse('test:/a');
const chatB = URI.parse('test:/b');
const chatC = URI.parse('test:/c');

suite('AgentsChatPartService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(options?: { readonly stored?: string; readonly visible?: boolean; readonly chatEnabled?: boolean; readonly sessions?: () => readonly ISession[]; readonly newSession?: IObservable<ISession | undefined>; readonly holdOpen?: () => Promise<void> }) {
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const contextKeyService = store.add(new ChangingContextKeyService());
		if (options?.chatEnabled !== undefined) {
			contextKeyService.createKey(ChatContextKeys.enabled.key, options.chatEnabled);
		}
		instantiationService.stub(IContextKeyService, contextKeyService);
		const storageService = instantiationService.get(IStorageService) as TestStorageService;
		if (options?.stored !== undefined) {
			storageService.store(CHAT_PART_EDITORS_STORAGE_KEY, options.stored, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;

		// The chat part, and whether the layout shows it
		const part = new FakePart();
		store.add(part);
		let partVisible = !!options?.visible;
		const onDidChangePartVisibility = store.add(new Emitter<IPartVisibilityChangeEvent>());
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({
			onDidChangePartVisibility: onDidChangePartVisibility.event,
			isVisible: (candidate: Parts) => candidate === Parts.CHAT_PART && partVisible,
			setPartHidden: (hidden: boolean, candidate: Parts) => {
				if (candidate === Parts.CHAT_PART && partVisible === hidden) {
					partVisible = !hidden;
					onDidChangePartVisibility.fire({ partId: Parts.CHAT_PART, visible: partVisible });
				}
			},
			hasFocus: () => false,
		}));
		instantiationService.stub(IAgentsChatPartFrame, upcastPartial<IAgentsChatPartFrame>({ part: upcastPartial<IAgentsChatPartFrame['part']>({ setContent: () => toDisposable(() => { }) }), didCreateContent: () => { } }));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ createEditorPart: () => part as unknown as IContentPart, mainPart: undefined }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			openEditor: (async (editor: EditorInput, editorOptions: IEditorOptions | undefined, group: FakeGroup) => {
				group.open(editor, editorOptions?.inactive);
				if (!editorOptions?.inactive) {
					part.activate(group);
				}
				// An open may complete only after its editor activates, as the editor part resolves it
				await options?.holdOpen?.();
				return undefined;
			}) as IEditorService['openEditor'],
			openEditors: async (editors: EditorInputWithOptions[], group?: PreferredGroup) => {
				const target = group as unknown as FakeGroup;
				editors.forEach(({ editor, options: editorOptions }) => target.open(editor, editorOptions?.inactive));
				return [];
			},
		}));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({ acquireExistingSession: () => undefined }));
		instantiationService.stub(IChatViewFactory, upcastPartial<IChatViewFactory>({}));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ onDidChangeWorkspaceFolders: Event.None, getWorkspace: () => upcastPartial<IWorkspace>({ folders: [] }) }));
		instantiationService.stub(IEditorWindowComposerFoldersService, instantiationService.createInstance(EditorWindowComposerFoldersService));

		// The sessions, of which each composer holds a slot for the session it creates; the listeners on their events count
		// The changes of the listed sessions, and of each session, also of those the providers' listing scope hides
		const toSessionChanges = (added: readonly ISession[], removed: readonly ISession[]): readonly ISessionChange[] => [...added.map(session => ({ session, kind: 'added' as const })), ...removed.map(session => ({ session, kind: 'removed' as const }))];
		const sessionsChanged = store.add(new Emitter<never>());
		const allSessionsChanged = store.add(new Emitter<never>());
		let sessionListeners = 0;
		const counted = (emitter: Emitter<never>): Event<never> => (listener, thisArgs, listenerStore) => {
			sessionListeners++;
			const subscription = emitter.event(listener, thisArgs);
			const countedSubscription = toDisposable(() => { sessionListeners--; subscription.dispose(); });
			if (listenerStore instanceof DisposableStore) {
				listenerStore.add(countedSubscription);
			} else if (Array.isArray(listenerStore)) {
				listenerStore.push(countedSubscription);
			}
			return countedSubscription;
		};
		let liveSlots = 0;
		let nextSlot = 0;
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: counted(sessionsChanged),
			onDidChangeSession: counted(allSessionsChanged),
			onDidAcceptNewSessionRequest: Event.None,
			onDidReplaceSession: Event.None,
			onDidReplaceNewDraftSession: Event.None,
			getSessions: () => [],
			getSession: resource => options?.sessions?.().find(candidate => isEqual(candidate.resource, resource)),
			getSessionForChatResource: resource => {
				for (const candidate of options?.sessions?.() ?? []) {
					const chat = candidate.chats.get().find(chat => isEqual(chat.resource, resource));
					if (chat) {
						return { session: candidate, chat };
					}
				}
				return undefined;
			},
			createNewSessionSlot: () => {
				liveSlots++;
				return upcastPartial<INewSessionDraftSlot & IDisposable>({ id: `slot-${nextSlot++}`, newSession: options?.newSession ?? constObservable(undefined), dispose: () => { liveSlots--; } });
			},
		}));
		instantiationService.stub(ISessionsListModelService, upcastPartial<ISessionsListModelService>({ getStatusIcon: () => Codicon.circle }));
		instantiationService.stub(ISessionGroupsService, upcastPartial<ISessionGroupsService>({ setDraftSlotGroup: () => toDisposable(() => { }), getGroupOfSession: () => undefined }));

		const host = new EditorWindowMainSessionHost(contextKeyService);
		instantiationService.stub(ISessionHost, host);
		const service = store.add(instantiationService.createInstance(AgentsChatPartService));
		const name = (input: EditorInput | null) => input instanceof ChatEditorInput ? (isChatWindowComposerResource(input.chatResource) ? 'composer' : input.chatResource.path) : null;
		return {
			service,
			part,
			hide: () => instantiationService.get(IWorkbenchLayoutService).setPartHidden(true, Parts.CHAT_PART),
			save: () => {
				storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
				return storageService.get(CHAT_PART_EDITORS_STORAGE_KEY, StorageScope.WORKSPACE);
			},
			/** The folders the chat part's composers aim at, as they store them. */
			composerFolders: () => {
				storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
				const raw = storageService.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE);
				return raw ? (parse(raw) as { readonly target?: { readonly folderUri?: URI } }[]).map(composer => composer.target?.folderUri?.path) : [];
			},
			setShowTabs: (value: string) => {
				configurationService.setUserConfiguration('workbench.editor.showTabs', value);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === 'workbench.editor.showTabs' }));
			},
			setChatEnabled: (enabled: boolean) => contextKeyService.setValue(ChatContextKeys.enabled.key, enabled),
			fireSessionsChanged: (added: readonly ISession[], removed: readonly ISession[] = []) => {
				sessionsChanged.fire({ added, removed, changed: [] } as never);
				allSessionsChanged.fire(toSessionChanges(added, removed) as never);
			},
			/** Changes of sessions that the providers' listing scope hides, such as of another folder: they are not listed. */
			fireHiddenSessionsChanged: (added: readonly ISession[], removed: readonly ISession[] = []) => allSessionsChanged.fire(toSessionChanges(added, removed) as never),
			state: () => ({ tabs: part.groups.reduce((count, group) => count + group.editors.length, 0), liveSlots, sessionListeners, visible: partVisible }),
			/** The tabs of each group, the active one of each, and whether the layout shows the chat part. */
			layout: () => ({
				groups: part.groups.map(group => ({ tabs: group.editors.map(name), active: name(group.activeEditor) })),
				activeGroup: part.groups.indexOf(part.activeGroup),
				visible: partVisible,
			}),
		};
	}

	test('a new session reuses the active composer that has not sent its session, so opening and closing the chat part does not add tabs', async () => {
		const { service, hide, state } = createService();

		await service.openComposer(undefined);
		const afterFirst = state();
		for (let index = 0; index < 20; index++) {
			hide();
			await service.show(undefined);
			await service.openComposer(undefined);
		}

		assert.deepStrictEqual({ afterFirst, afterCycles: state() }, {
			afterFirst: { tabs: 1, liveSlots: 1, sessionListeners: afterFirst.sessionListeners, visible: true },
			afterCycles: { tabs: 1, liveSlots: 1, sessionListeners: afterFirst.sessionListeners, visible: true },
		});
	});

	test('the active chat is the session a composer created from its first send on, before that first turn ends; a draft has none', async () => {
		const status = observableValue<SessionStatus>('status', SessionStatus.Untitled);
		const mainChat = upcastPartial<IChat>({ resource: chatA });
		const created = upcastPartial<ISession>({ status, mainChat: constObservable(mainChat) });
		const newSession = observableValue<ISession | undefined>('newSession', undefined);
		const { service } = createService({ newSession });
		const active = () => { const chat = service.activeChat.get(); return chat ? { session: chat.session === created, chat: chat.chat === mainChat } : 'none'; };

		await service.openComposer(undefined);
		const draft = active();
		newSession.set(created, undefined);
		const untitled = active();
		status.set(SessionStatus.InProgress, undefined);

		assert.deepStrictEqual({ draft, untitled, firstTurn: active() }, { draft: 'none', untitled: 'none', firstTurn: { session: true, chat: true } });
	});

	test('the session a composer\'s first send made shows as committed, until the user picks its tab again', async () => {
		const status = observableValue<SessionStatus>('status', SessionStatus.Untitled);
		const mainChat = upcastPartial<IChat>({ resource: chatA });
		const created = upcastPartial<ISession>({ status, mainChat: constObservable(mainChat) });
		const newSession = observableValue<ISession | undefined>('newSession', undefined);
		const { service, part } = createService({ newSession });
		const shown = () => { const value = service.shownSession.get(); return value ? `${value.resource.path} ${value.reason}` : 'none'; };

		await service.openComposer(undefined);
		const composerTab = part.activeGroup.activeEditor!;
		const draft = shown();
		newSession.set(created, undefined);
		status.set(SessionStatus.InProgress, undefined);
		const committed = shown();
		// The user moves to another tab, and back to the composer's
		await service.openComposer(undefined, { newComposer: true });
		part.activeGroup.open(composerTab);

		assert.deepStrictEqual({ draft, committed, picked: shown() }, { draft: 'none', committed: '/a commit', picked: '/a open' });
	});

	test('each explicit open of the active chat reports it again, as where its session works may matter again', async () => {
		const openedSession = buildTestSession({ id: 'reopened', title: 'Reopened' });
		const main = openedSession.mainChat.chat.resource;
		const { service } = createService({ sessions: () => [openedSession.session] });
		const reports: string[] = [];
		const listener = autorun(reader => { const value = service.shownSession.read(reader); if (value) { reports.push(value.reason); } });

		await service.openChat(openedSession.session, main);
		await timeout(0);
		await service.openChat(openedSession.session, main);
		await timeout(0);
		listener.dispose();

		assert.deepStrictEqual(reports.slice(-2), ['open', 'open']);
	});

	test('a chat opened as restored or committed shows as such, and as opened once the user opens it', async () => {
		const restoredSession = buildTestSession({ id: 'restored', title: 'Restored' });
		const main = restoredSession.mainChat.chat.resource;
		const { service } = createService({ sessions: () => [restoredSession.session] });
		const shown = async () => { await timeout(0); const value = service.shownSession.get(); return value && `${isEqual(value.resource, main) ? 'main' : value.resource.toString()} ${value.reason}`; };

		await service.openChat(restoredSession.session, main, { restore: true });
		const restored = await shown();
		await service.openChat(restoredSession.session, main, { commit: true });
		const committed = await shown();
		await service.openChat(restoredSession.session, main);

		assert.deepStrictEqual({ restored, committed, opened: await shown() }, { restored: 'main restore', committed: 'main commit', opened: 'main open' });
	});

	test('a tab recalled as restored that activates before its open completes shows as restored, never as opened in between', async () => {
		const recalled = buildTestSession({ id: 'recalled', title: 'Recalled' });
		const other = buildTestSession({ id: 'other', title: 'Other' });
		const recalledChat = recalled.mainChat.chat.resource;
		const otherChat = other.mainChat.chat.resource;
		let held: DeferredPromise<void> | undefined = undefined;
		const { service } = createService({ sessions: () => [recalled.session, other.session], holdOpen: () => held?.p ?? Promise.resolve() });
		await service.openChat(recalled.session, recalledChat);
		await service.openChat(other.session, otherChat);
		await timeout(0);
		const reports: string[] = [];
		const listener = autorun(reader => { const value = service.shownSession.read(reader); if (value) { reports.push(`${isEqual(value.resource, recalledChat) ? 'recalled' : 'other'} ${value.reason}`); } });

		held = new DeferredPromise<void>();
		const recall = service.openChat(recalled.session, recalledChat, { restore: true });
		await timeout(0);
		const whileHeld = [...reports];
		held.complete();
		await recall;
		await timeout(0);
		listener.dispose();

		assert.deepStrictEqual({ whileHeld, reports }, { whileHeld: ['other open', 'recalled restore'], reports: ['other open', 'recalled restore'] });
	});

	test('its composers that aim at the folder their host aimed them at follow it to another folder, also the active one a new session reuses', async () => {
		const { service, composerFolders } = createService();

		await service.openComposer({ folderUri: URI.file('/repo') });
		await service.openComposer({ folderUri: URI.file('/other') }, { newComposer: true });
		service.retargetComposerFolders(URI.file('/repo.worktrees/a'), URI.file('/repo'));
		const afterMove = composerFolders();
		// A new session in the active composer, which has not sent its session, aims it at the new session's folder
		await service.openComposer({ folderUri: URI.file('/repo.worktrees/b') });

		assert.deepStrictEqual({ afterMove, afterReuse: composerFolders() }, {
			afterMove: ['/repo.worktrees/a', '/other'],
			afterReuse: ['/repo.worktrees/a', '/repo.worktrees/b'],
		});
	});

	test('closing the tab of a composer releases it: opening and closing composers keeps nothing', async () => {
		const { service, part, state } = createService();
		const baseline = state().sessionListeners;

		for (let index = 0; index < 20; index++) {
			await service.openComposer(undefined);
			await part.activeGroup.closeEditor(part.activeGroup.activeEditor!);
		}

		assert.deepStrictEqual(state(), { tabs: 0, liveSlots: 0, sessionListeners: baseline, visible: false });
	});

	function replacedPeerChat() {
		const spec = { id: 'parent', title: 'Parent', chats: [{ id: 'peer', title: 'Peer' }] };
		const original = buildTestSession(spec);
		const peer = original.chats.get('peer')!.chat.resource;
		// The session of the provider registered again lists its peer chats only as it loads
		const replacing = buildTestSession(spec);
		const replacementChats = observableValue<readonly IChat[]>('chats', [replacing.mainChat.chat]);
		const replacementLoading = observableValue('loading', true);
		const replacement: ISession = { ...replacing.session, chats: replacementChats, loading: replacementLoading };
		return { original, peer, replacing, replacementChats, replacementLoading, replacement };
	}

	test('a peer chat whose provider is registered again follows the session that replaces its session, once that lists the chat', async () => {
		const { original, peer, replacing, replacementChats, replacementLoading, replacement } = replacedPeerChat();
		let sessions: readonly ISession[] = [original.session];
		const { service, fireSessionsChanged } = createService({ sessions: () => sessions });
		await service.openChat(original.session, peer);
		const shown = () => {
			const active = service.activeChat.get();
			return { session: active?.session === original.session ? 'original' : active?.session === replacement ? 'replacement' : 'none', chat: active?.chat === original.chats.get('peer')!.chat ? 'original' : active?.chat === replacing.chats.get('peer')!.chat ? 'replacement' : 'none' };
		};

		// Its provider goes, which hides its sessions without removing them
		sessions = [];
		fireSessionsChanged([]);
		const whileGone = shown();
		// Its provider returns, without the peer chat yet
		sessions = [replacement];
		fireSessionsChanged([replacement]);
		const beforePeer = { ...shown(), showing: service.isShowing(peer) };
		transaction(tx => {
			replacementChats.set([replacing.mainChat.chat, replacing.chats.get('peer')!.chat], tx);
			replacementLoading.set(false, tx);
		});

		assert.deepStrictEqual({ whileGone, beforePeer, afterPeer: shown() }, {
			whileGone: { session: 'original', chat: 'original' },
			beforePeer: { session: 'original', chat: 'original', showing: true },
			afterPeer: { session: 'replacement', chat: 'replacement' },
		});
	});

	test('a chat of a session that the listing scope hides, such as of another folder, follows the session that replaces it', async () => {
		const { original, peer, replacing, replacementChats, replacementLoading, replacement } = replacedPeerChat();
		let sessions: readonly ISession[] = [original.session];
		const { service, fireHiddenSessionsChanged } = createService({ sessions: () => sessions });
		await service.openChat(original.session, peer);
		const shown = () => service.activeChat.get()?.session === replacement ? 'replacement' : service.activeChat.get()?.session === original.session ? 'original' : 'none';

		// Its provider goes and returns, without its sessions being listed
		sessions = [];
		fireHiddenSessionsChanged([]);
		sessions = [replacement];
		fireHiddenSessionsChanged([replacement]);
		transaction(tx => {
			replacementChats.set([replacing.mainChat.chat, replacing.chats.get('peer')!.chat], tx);
			replacementLoading.set(false, tx);
		});

		assert.strictEqual(shown(), 'replacement');
	});

	test('a peer chat whose provider is registered again waits for the session that replaces its session to list it, even once that says it loaded', async () => {
		const { original, peer, replacing, replacementChats, replacementLoading, replacement } = replacedPeerChat();
		// A session created again says it loaded before its chats are known
		replacementLoading.set(false, undefined);
		let sessions: readonly ISession[] = [original.session];
		const { service, fireSessionsChanged } = createService({ sessions: () => sessions });
		await service.openChat(original.session, peer);

		sessions = [];
		fireSessionsChanged([]);
		sessions = [replacement];
		fireSessionsChanged([replacement]);
		await timeout(0);
		const beforePeer = service.isShowing(peer);
		replacementChats.set([replacing.mainChat.chat, replacing.chats.get('peer')!.chat], undefined);

		assert.deepStrictEqual({ beforePeer, afterPeer: service.activeChat.get()?.session === replacement }, { beforePeer: true, afterPeer: true });
	});

	test('a peer chat whose provider is registered again closes as the session that replaces its session is archived', async () => {
		const { original, peer, replacement } = replacedPeerChat();
		const archived = observableValue('archived', false);
		const archivable: ISession = { ...replacement, isArchived: archived };
		let sessions: readonly ISession[] = [original.session];
		const { service, fireSessionsChanged } = createService({ sessions: () => sessions });
		await service.openChat(original.session, peer);

		sessions = [];
		fireSessionsChanged([]);
		sessions = [archivable];
		fireSessionsChanged([archivable]);
		const beforeArchived = service.isShowing(peer);
		archived.set(true, undefined);
		await timeout(0);

		assert.deepStrictEqual({ beforeArchived, archived: service.isShowing(peer) }, { beforeArchived: true, archived: false });
	});

	test('a chat closes once its session is removed, such as deleted, but not as its provider goes away', async () => {
		const built = buildTestSession({ id: 'parent', title: 'Parent', chats: [{ id: 'peer', title: 'Peer' }] });
		const peer = built.chats.get('peer')!.chat.resource;
		let sessions: readonly ISession[] = [built.session];
		const { service, fireSessionsChanged } = createService({ sessions: () => sessions });
		await service.openChat(built.session, peer);

		// Its provider goes, which hides its sessions without removing them
		sessions = [];
		fireSessionsChanged([]);
		await timeout(0);
		const providerGone = service.isShowing(peer);
		fireSessionsChanged([], [built.session]);
		await timeout(0);

		assert.deepStrictEqual({ providerGone, removed: service.isShowing(peer) }, { providerGone: true, removed: false });
	});

	test('restoring the chat part shown restores its chats, unless chat is hidden or disabled as the window starts, which hides it', async () => {
		const restore = async (available: boolean) => {
			const calls: string[] = [];
			let visible = true;
			await restoreAgentsChatPart(
				upcastPartial<IWorkbenchLayoutService>({ isVisible: () => visible, setPartHidden: hidden => { visible = !hidden; calls.push(`hidden=${hidden}`); } }),
				upcastPartial<IContextKeyService>({ contextMatchesRules: () => available }),
				() => upcastPartial<IAgentsChatPartService>({ restore: async () => { calls.push('restore chats'); } }),
			);
			return { calls, visible };
		};

		assert.deepStrictEqual({ available: await restore(true), aiOff: await restore(false) }, {
			available: { calls: ['restore chats'], visible: true },
			aiOff: { calls: ['hidden=true'], visible: false },
		});
	});

	test('opening a chat shows the chat part with the chat in a tab of its own; opening it again shows its tab', async () => {
		const { service, layout } = createService();

		await service.openChat(session, chatA);
		await service.openChat(session, chatB);
		await service.openChat(session, chatA);

		assert.deepStrictEqual({ layout: layout(), showing: [service.isShowing(chatA), service.isShowing(chatC)] }, {
			layout: { groups: [{ tabs: ['/a', '/b'], active: '/a' }], activeGroup: 0, visible: true },
			showing: [true, false],
		});
	});

	test('a chat opened to the side opens in a group beside the active one, and a chat it shows already stays in its group', async () => {
		const { service, layout } = createService();

		await service.openChat(session, chatA, { sideBySide: true });
		const first = layout();
		await service.openChat(session, chatB, { sideBySide: true });
		const beside = layout();
		await service.openChat(session, chatA, { sideBySide: true });

		assert.deepStrictEqual({ first, beside, again: layout() }, {
			first: { groups: [{ tabs: ['/a'], active: '/a' }], activeGroup: 0, visible: true },
			beside: { groups: [{ tabs: ['/a'], active: '/a' }, { tabs: ['/b'], active: '/b' }], activeGroup: 1, visible: true },
			again: { groups: [{ tabs: ['/a'], active: '/a' }, { tabs: ['/b'], active: '/b' }], activeGroup: 0, visible: true },
		});
	});

	test('closing a chat while its provider is released, which removes its session as its tab disposes, disposes its tab once, not from within its own dispose', async () => {
		const built = buildTestSession({ id: 'released', title: 'Released' });
		let sessions: readonly ISession[] = [built.session];
		const { service, part, fireSessionsChanged } = createService({ sessions: () => sessions });
		await service.openChat(built.session, built.mainChat.chat.resource);
		const input = part.activeGroup.activeEditor!;
		// The providers are released as the chat part's editors are disposed: its session is removed meanwhile
		Event.once(input.onWillDispose)(() => {
			sessions = [];
			fireSessionsChanged([], [built.session]);
		});
		let depth = 0;
		let reentered = 0;
		const dispose = input.dispose.bind(input);
		input.dispose = () => {
			reentered += depth;
			depth++;
			try {
				dispose();
			} finally {
				depth--;
			}
		};

		await service.closeChat(built.mainChat.chat.resource);
		await timeout(0);

		assert.deepStrictEqual({ reentered, showing: service.isShowing(built.mainChat.chat.resource), disposed: input.isDisposed() }, { reentered: 0, showing: false, disposed: true });
	});

	test('closing the last chat closes the chat part, which closing a chat it does not show leaves as it is', async () => {
		const { service, layout } = createService();
		await service.openChat(session, chatA);
		await service.openChat(session, chatB);

		await service.closeChat(chatC);
		await service.closeChat(chatA);
		const oneLeft = layout();
		await service.closeChat(chatB);

		assert.deepStrictEqual({ oneLeft, none: layout() }, {
			oneLeft: { groups: [{ tabs: ['/b'], active: '/b' }], activeGroup: 0, visible: true },
			none: { groups: [{ tabs: [], active: null }], activeGroup: 0, visible: false },
		});
	});

	test('the chat part stores its chats and the active one as the window saves, and shows them again in that order once restored', async () => {
		const first = createService();
		await first.service.openChat(session, chatA);
		await first.service.openChat(session, chatB);
		await first.service.openChat(session, chatC);
		await first.service.openChat(session, chatB);
		const stored = first.save();

		const second = createService({ stored, visible: true });
		await second.service.restore();

		assert.deepStrictEqual({ stored: JSON.parse(stored!), restored: second.layout() }, {
			stored: { chats: ['test:/a', 'test:/b', 'test:/c'], active: 1 },
			restored: { groups: [{ tabs: ['/a', '/b', '/c'], active: '/b' }], activeGroup: 0, visible: true },
		});
	});

	test('the chat of the active tab shows as restored while the chat part restored it, and as opened once the user opens a chat, also the restored one', async () => {
		const shownSession = buildTestSession({ id: 'shown', title: 'Shown', chats: [{ id: 'peer', title: 'Peer' }] });
		const main = shownSession.mainChat.chat.resource;
		const peer = shownSession.chats.get('peer')!.chat.resource;
		const { service } = createService({ stored: JSON.stringify({ chats: [main.toString(), peer.toString()], active: 1 }), visible: true, sessions: () => [shownSession.session] });
		const shown = async () => {
			await timeout(0);
			const value = service.shownSession.get();
			return value && `${isEqual(value.resource, main) ? 'main' : isEqual(value.resource, peer) ? 'peer' : value.resource.toString()} ${value.reason}`;
		};

		await service.restore();
		const restored = await shown();
		await service.openChat(shownSession.session, peer);
		const reopened = await shown();
		await service.openChat(shownSession.session, main);

		assert.deepStrictEqual({ restored, reopened, opened: await shown() }, { restored: 'peer restore', reopened: 'peer open', opened: 'main open' });
	});

	test('a chat the user opens while the chat part restores is opened, and the tab the restore activates is restored', async () => {
		const shownSession = buildTestSession({ id: 'overlap', title: 'Overlap', chats: [{ id: 'peer', title: 'Peer' }] });
		const main = shownSession.mainChat.chat.resource;
		const peer = shownSession.chats.get('peer')!.chat.resource;
		const { service } = createService({ stored: JSON.stringify({ chats: [main.toString(), peer.toString()], active: 1 }), visible: true, sessions: () => [shownSession.session] });
		const shown = () => { const value = service.shownSession.get(); return value && `${isEqual(value.resource, main) ? 'main' : isEqual(value.resource, peer) ? 'peer' : value.resource.toString()} ${value.reason}`; };

		const restoring = service.restore();
		// The user opens the restored tab that the restore activates, while it is under way
		await service.openChat(shownSession.session, peer);
		await restoring;
		await timeout(0);
		const afterRestore = shown();
		await service.openChat(shownSession.session, main);
		await timeout(0);

		assert.deepStrictEqual({ afterRestore, afterOpen: shown() }, { afterRestore: 'peer open', afterOpen: 'main open' });
	});

	test('its composers offer the window\'s folders, or those a feature provides while it does', () => {
		const { service } = createService();
		const folders = () => service.getComposerFolderOptions().allowedFolders?.get().map(folder => folder.toString());

		const windowFolders = folders();
		const provided = service.setComposerFolderOptions(() => ({ allowedFolders: constObservable([URI.file('/worktree')]) }));
		const whileProvided = folders();
		provided.dispose();

		assert.deepStrictEqual({ whileProvided, afterwards: folders() }, { whileProvided: ['file:///worktree'], afterwards: windowFolders });
	});

	test('with no chats, the chat part removes what it stored, and restoring nothing closes it', async () => {
		const first = createService({ stored: JSON.stringify({ chats: ['test:/a'], active: 0 }) });
		await first.service.openChat(session, chatA);
		await first.service.closeChat(chatA);
		const stored = first.save();

		const unreadable = createService({ stored: 'not json', visible: true });
		await unreadable.service.restore();

		assert.deepStrictEqual({ stored, restored: unreadable.layout().visible }, { stored: undefined, restored: false });
	});

	test('restoring after a chat opened since the window started keeps the chats of now, not those of before the reload', async () => {
		const { service, layout } = createService({ stored: JSON.stringify({ chats: ['test:/a', 'test:/b'], active: 0 }) });

		await service.openChat(session, chatC);
		await service.restore();

		assert.deepStrictEqual(layout(), { groups: [{ tabs: ['/c'], active: '/c' }], activeGroup: 0, visible: true });
	});

	test('showing the chat part shows the chats it had as it closed, and a new-session composer when it had none', async () => {
		const withChats = createService();
		await withChats.service.openChat(session, chatA);
		withChats.hide();
		await withChats.service.show(undefined);

		const empty = createService();
		await empty.service.show(undefined);

		assert.deepStrictEqual({ withChats: withChats.layout(), empty: empty.layout() }, {
			withChats: { groups: [{ tabs: ['/a'], active: '/a' }], activeGroup: 0, visible: true },
			empty: { groups: [{ tabs: ['composer'], active: 'composer' }], activeGroup: 0, visible: true },
		});
	});

	test('chat turning off, such as as AI features are disabled, closes the chat part', async () => {
		const { service, layout, setChatEnabled } = createService({ chatEnabled: true });
		await service.openChat(session, chatA);

		setChatEnabled(false);

		assert.deepStrictEqual(layout(), { groups: [{ tabs: ['/a'], active: '/a' }], activeGroup: 0, visible: false });
	});

	test('its tabs show as a chat window\'s do, following workbench.editor.showTabs as it changes', async () => {
		const { service, part, setShowTabs } = createService();
		await service.openChat(session, chatA);
		const shown = part.options;

		setShowTabs('none');

		assert.deepStrictEqual({ shown, none: part.options }, {
			shown: { doubleClickTabToToggleEditorGroupSizes: 'off', tabSizing: 'fixed', tabSizingFixedMinWidth: 80, tabSizingFixedMaxWidth: 160 },
			none: { doubleClickTabToToggleEditorGroupSizes: 'off', showTabs: 'single', tabSizing: 'fixed', tabSizingFixedMinWidth: 80, tabSizingFixedMaxWidth: 160 },
		});
	});
});
