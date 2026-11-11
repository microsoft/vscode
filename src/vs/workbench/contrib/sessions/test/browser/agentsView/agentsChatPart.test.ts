/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAgentsViewFolderLocationService } from '../../../browser/agentsView/agentsViewFolderLocation.js';
import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyChangeEvent, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../../platform/storage/common/storage.js';
import { EditorInputWithOptions } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IContentPart, IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
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
import { isChatWindowComposerResource } from '../../../browser/chatEditor/chatWindowComposer.js';
import { IChatViewFactory } from '../../../browser/chatViewFactory.js';
import { ISessionGroupsService } from '../../../browser/sessionGroupsService.js';
import { INewSessionDraftSlot, ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { buildTestSession } from '../../common/testSessionBuilder.js';
import { ISessionsListModelService } from '../../../browser/sessionsListModelService.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { timeout } from '../../../../../../base/common/async.js';

/** An editor group that keeps its editors in memory, as the chat part's groups do, without rendering them. */
class FakeGroup {
	private static nextId = 1;
	readonly id = FakeGroup.nextId++;
	editors: EditorInput[] = [];
	activeEditor: EditorInput | null = null;
	readonly onDidActiveEditorChangeEmitter = new Emitter<void>();
	readonly onDidActiveEditorChange = this.onDidActiveEditorChangeEmitter.event;
	readonly onWillCloseEditorEmitter = new Emitter<void>();
	readonly onWillCloseEditor = this.onWillCloseEditorEmitter.event;
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
		this.onWillCloseEditorEmitter.fire();
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
		this.onWillCloseEditorEmitter.dispose();
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

	function createService(options?: { readonly stored?: string; readonly visible?: boolean; readonly chatEnabled?: boolean; readonly sessions?: () => readonly ISession[]; readonly newSession?: IObservable<ISession | undefined> }) {
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
		instantiationService.stub(IAgentsChatPartFrame, upcastPartial<IAgentsChatPartFrame>({ part: upcastPartial<IAgentsChatPartFrame['part']>({ setContent: () => toDisposable(() => { }) }) }));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ createEditorPart: () => part as unknown as IContentPart, mainPart: undefined }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			openEditor: (async (editor: EditorInput, editorOptions: IEditorOptions | undefined, group: FakeGroup) => {
				group.open(editor, editorOptions?.inactive);
				if (!editorOptions?.inactive) {
					part.activate(group);
				}
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

		// The sessions, of which each composer holds a slot for the session it creates; the listeners on their events count
		// The changes of the listed sessions, and of all sessions, also of those the providers' listing scope hides
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
			onDidChangeAllSessions: counted(allSessionsChanged),
			onDidAcceptNewSessionRequest: Event.None,
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

		// The sessions whose opening asked to move the window's folder to where they work
		const switchedTo: ISession[] = [];
		instantiationService.stub(IAgentsViewFolderLocationService, upcastPartial<IAgentsViewFolderLocationService>({ switchToSession: async session => { switchedTo.push(session); } }));

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
			setShowTabs: (value: string) => {
				configurationService.setUserConfiguration('workbench.editor.showTabs', value);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === 'workbench.editor.showTabs' }));
			},
			setChatEnabled: (enabled: boolean) => contextKeyService.setValue(ChatContextKeys.enabled.key, enabled),
			fireSessionsChanged: (added: readonly ISession[], removed: readonly ISession[] = []) => {
				sessionsChanged.fire({ added, removed, changed: [] } as never);
				allSessionsChanged.fire({ added, removed, changed: [] } as never);
			},
			/** Changes of sessions that the providers' listing scope hides, such as of another folder: they are not listed. */
			fireHiddenSessionsChanged: (added: readonly ISession[], removed: readonly ISession[] = []) => allSessionsChanged.fire({ added, removed, changed: [] } as never),
			switchedTo,
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

	test('opening a session or picking its tab moves the window\'s folder to where it works; tabs that open, close or restore do not', async () => {
		const first = buildTestSession({ id: 'first', title: 'First' });
		const second = buildTestSession({ id: 'second', title: 'Second' });
		const { service, part, switchedTo } = createService({ sessions: () => [first.session, second.session] });
		const switched = () => switchedTo.splice(0).map(session => session === first.session ? 'first' : session === second.session ? 'second' : 'other');

		await service.openChat(first.session, undefined);
		await service.openChat(second.session, undefined);
		const opened = switched();
		// Picking the first tab, as a click does
		part.activeGroup.open(part.activeGroup.editors[0]);
		const picked = switched();
		// Closing it activates the other tab, which the user did not pick
		await part.activeGroup.closeEditor(part.activeGroup.activeEditor!);
		await timeout(0);

		assert.deepStrictEqual({ opened, picked, closed: switched() }, { opened: ['first', 'second'], picked: ['first'], closed: [] });
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
