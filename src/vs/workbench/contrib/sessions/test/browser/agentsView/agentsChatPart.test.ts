/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stubChatViewHostServiceDependencies } from '../../../../chat/test/common/chatViewSessionsListServiceTestUtils.js';
import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyChangeEvent, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { IChatViewHostService, IChatViewHostShownSession } from '../../../../chat/browser/chatViewHost.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { parse, stringify } from '../../../../../../base/common/marshalling.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../../platform/storage/common/storage.js';
import { EditorCloseContext, EditorInputWithOptions, EditorsOrder, IEditorPane, IVisibleEditorPane } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { GroupsOrder, IContentPart, ICreateEditorPartOptions, IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { EditorWindowComposerFoldersService, IEditorWindowComposerFoldersService } from '../../../browser/editorWindow/editorWindowComposerFolders.js';
import { IEditorService, IVisibleEditorsChangeEvent, PreferredGroup } from '../../../../../services/editor/common/editorService.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { ISessionHost } from '../../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { IChatRequestVariableEntry } from '../../../../chat/common/attachments/chatVariableEntries.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestLifecycleService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { AgentsChatPartService, IAgentsChatPartService, restoreAgentsChatPart } from '../../../browser/agentsView/agentsChatPart.js';
import { IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { EditorWindowMainSessionHost, EditorWindowShownChatService, IEditorWindowShownChatService } from '../../../browser/agentsView/editorWindowMainSessionHost.js';
import { ChatEditorInput } from '../../../browser/chatEditor/chatEditor.js';
import { CHAT_WINDOW_COMPOSERS_STORAGE_KEY, createChatWindowComposerResource, isChatWindowComposerResource } from '../../../browser/chatEditor/chatWindowComposer.js';
import { INewSessionTarget } from '../../../browser/parts/chatView.js';
import { fromStoredChatDraft, toStoredChatDraft } from '../../../common/newChatDraftState.js';
import { IChatViewFactory } from '../../../browser/chatViewFactory.js';
import { ISessionGroupsService } from '../../../browser/sessionGroupsService.js';
import { INewSessionDraftSlot, ISessionChange, ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode } from '../../../common/sessionConfig.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { buildTestSession } from '../../common/testSessionBuilder.js';
import { ISessionsListModelService } from '../../../browser/sessionsListModelService.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';
import { ChatViewHostService } from '../../../../chat/browser/widgetHosts/viewPane/chatViewHostService.js';
import { AgentsChatViewHost } from '../../../browser/agentsView/agentsChatViewHost.js';
import { IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';

/** An editor group that keeps its editors in memory, as the chat part's groups do, without rendering them. */
class FakeGroup {
	private static nextId = 1;
	readonly id = FakeGroup.nextId++;
	editors: EditorInput[] = [];
	activeEditor: EditorInput | null = null;
	readonly onDidActiveEditorChangeEmitter = new Emitter<void>();
	readonly onDidActiveEditorChange = this.onDidActiveEditorChangeEmitter.event;
	readonly onWillCloseEditorEmitter = new Emitter<{ readonly editor: EditorInput; readonly context?: EditorCloseContext }>();
	readonly onWillCloseEditor = this.onWillCloseEditorEmitter.event;
	readonly onDidCloseEditorEmitter = new Emitter<{ readonly editor: EditorInput; readonly context?: EditorCloseContext }>();
	readonly onDidCloseEditor = this.onDidCloseEditorEmitter.event;
	get isEmpty() { return this.editors.length === 0; }
	contains(editor: EditorInput) { return this.editors.includes(editor); }
	/** Opens `editor`, which becomes active unless it opens inactive in a group that has an active editor, as in a real group. */
	open(editor: EditorInput, inactive?: boolean): void {
		if (!this.editors.includes(editor)) {
			this.editors.push(editor);
			// As a real group: an editor that opens inactive is the most recent after its active one
			this.mru.splice(this.mru.length ? 1 : 0, 0, editor);
		}
		if (!inactive || !this.activeEditor) {
			this.activeEditor = editor;
			this.mru = [editor, ...this.mru.filter(candidate => candidate !== editor)];
			this.onDidActiveEditorChangeEmitter.fire();
		}
	}
	/** Its editors most recently active first, as a real group orders them. */
	private mru: EditorInput[] = [];
	getEditors(order: EditorsOrder): readonly EditorInput[] {
		return order === EditorsOrder.MOST_RECENTLY_ACTIVE ? this.mru : this.editors;
	}
	/**
	 * Closes `editor`, which disposes before the group tells it closed, as in a real group; not as it moves to another group,
	 * where it stays open.
	 */
	async closeEditor(editor: EditorInput, context?: EditorCloseContext): Promise<boolean> {
		this.onWillCloseEditorEmitter.fire({ editor, context });
		this.editors = this.editors.filter(candidate => candidate !== editor);
		this.mru = this.mru.filter(candidate => candidate !== editor);
		// As a real group: the most recently active one shows next
		if (this.activeEditor === editor) {
			this.activeEditor = this.mru[0] ?? null;
		}
		if (context !== EditorCloseContext.MOVE) {
			editor.dispose();
		}
		this.onDidCloseEditorEmitter.fire({ editor, context });
		this.onDidActiveEditorChangeEmitter.fire();
		return true;
	}
	async closeAllEditors(): Promise<boolean> {
		return this.closeEditors([...this.editors]);
	}
	/** Closes `editors` in their order: a real group closes its active editor last, which these tests close last. */
	async closeEditors(editors: readonly EditorInput[]): Promise<boolean> {
		for (const editor of editors) {
			await this.closeEditor(editor);
		}
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
	/** Its groups, most recently active first, as a real part orders them. */
	private readonly mruGroups: FakeGroup[] = [];
	activeGroup: FakeGroup;
	/** The options the chat part created it with. */
	createOptions: ICreateEditorPartOptions | undefined;
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
		this.mruGroups.push(group);
		this.onDidAddGroupEmitter.fire(group);
		return group;
	}
	getGroups(order: GroupsOrder): readonly FakeGroup[] {
		return order === GroupsOrder.MOST_RECENTLY_ACTIVE ? this.mruGroups : this.groups;
	}
	activate(group: FakeGroup): void {
		this.mruGroups.splice(this.mruGroups.indexOf(group), 1);
		this.mruGroups.unshift(group);
		if (this.activeGroup !== group) {
			this.activeGroup = group;
			this.onDidChangeActiveGroupEmitter.fire(group);
		}
	}
	/** Moves `editor` from `source` to `target` as a real group does: it opens and activates there before it closes in `source`. */
	async moveEditor(editor: EditorInput, source: FakeGroup, target: FakeGroup): Promise<void> {
		target.open(editor);
		this.activate(target);
		await source.closeEditor(editor, EditorCloseContext.MOVE);
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

	function createService(options?: { readonly stored?: string; readonly storedComposers?: string; readonly visible?: boolean; readonly chatEnabled?: boolean; readonly sessions?: () => readonly ISession[]; readonly newSession?: IObservable<ISession | undefined>; readonly holdOpen?: () => Promise<void>; readonly delayed?: boolean; readonly chatTabs?: SessionsChatTabsMode | null }) {
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
		if (options?.storedComposers !== undefined) {
			storageService.store(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, options.storedComposers, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		// Its chats as tabs, unless a test asks for Single, or for the default (null)
		if (options?.chatTabs !== null) {
			configurationService.setUserConfiguration(SESSIONS_CHAT_TABS_SETTING, options?.chatTabs ?? SessionsChatTabsMode.Multiple);
		}

		// The chat part, whether the layout shows it, and whether it has focus
		const part = new FakePart();
		const focus = { chatPart: false };
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
			hasFocus: (candidate: Parts) => candidate === Parts.CHAT_PART && focus.chatPart,
		}));
		// The frame has the chat part once it is created, as the real frame does
		const content = observableValue<IAgentsChatPartService | undefined>('content', undefined);
		instantiationService.stub(IAgentsChatPartFrame, upcastPartial<IAgentsChatPartFrame>({ part: upcastPartial<IAgentsChatPartFrame['part']>({ setContent: () => toDisposable(() => { }) }), content, contentCreated: derived(reader => !!content.read(reader)), didCreateContent: created => content.set(created, undefined) }));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ createEditorPart: createOptions => { part.createOptions = createOptions; return part as unknown as IContentPart; }, mainPart: undefined }));
		// The editors of the editor area that show
		const editorArea = { panes: [] as IVisibleEditorPane[], onDidChange: store.add(new Emitter<IVisibleEditorsChangeEvent>()) };
		// The editors it opens in its groups, and whether each takes focus
		const opens: { readonly tab: string | null; readonly focuses: boolean }[] = [];
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			get visibleEditorPanes() { return editorArea.panes; },
			onDidVisibleEditorsChange: editorArea.onDidChange.event,
			openEditor: (async (editor: EditorInput, editorOptions: IEditorOptions | undefined, group: FakeGroup) => {
				opens.push({ tab: name(editor), focuses: !editorOptions?.preserveFocus });
				group.open(editor, editorOptions?.inactive);
				if (!editorOptions?.inactive) {
					part.activate(group);
				}
				// An open may complete only after its editor activates, as the editor part resolves it, with the pane that shows it
				await options?.holdOpen?.();
				return upcastPartial<IEditorPane>({ input: editor });
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

		const shownChatService = new EditorWindowShownChatService();
		// The Chat view, as it shows a chat while no host replaces it
		const chatView = { shown: observableValue<IChatViewHostShownSession | undefined>('chatViewShown', undefined), hosts: observableValue('chatViewHosts', true), replaced: observableValue('replaced', false) };
		instantiationService.stub(IEditorWindowShownChatService, shownChatService);
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ shownSession: chatView.shown, chatViewHosts: chatView.hosts, replaced: chatView.replaced }));
		const host = new EditorWindowMainSessionHost(contextKeyService, shownChatService);
		instantiationService.stub(ISessionHost, host);
		// Delayed, as the editor window registers it: created as something first uses it, such as an open
		const scoped = options?.delayed ? store.add(new TestInstantiationService(new ServiceCollection([IAgentsChatPartService, new SyncDescriptor(AgentsChatPartService, [], true)]), false, instantiationService, true)) : undefined;
		const service: IAgentsChatPartService = scoped ? scoped.invokeFunction(accessor => accessor.get(IAgentsChatPartService)) : store.add(instantiationService.createInstance(AgentsChatPartService));
		const name = (input: EditorInput | null) => input instanceof ChatEditorInput ? (isChatWindowComposerResource(input.chatResource) ? 'composer' : input.chatResource.path) : null;
		return {
			service,
			part,
			/** The window's session host, which the chat part binds. */
			host,
			instantiationService,
			/** What the editor window creates with the delayed chat part, which it gets as such. */
			scoped,
			store,
			hide: () => instantiationService.get(IWorkbenchLayoutService).setPartHidden(true, Parts.CHAT_PART),
			chatView,
			editorArea,
			focus,
			opens,
			save: () => {
				storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
				return storageService.get(CHAT_PART_EDITORS_STORAGE_KEY, StorageScope.WORKSPACE);
			},
			/** What was typed in the chat part's composers, as they store it. */
			composerInputs: () => {
				storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
				const raw = storageService.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE);
				return raw ? (parse(raw) as { readonly input?: unknown }[]).map(composer => fromStoredChatDraft(composer.input).inputText) : [];
			},
			lifecycle: instantiationService.get(ILifecycleService) as TestLifecycleService,
			/** What was typed and attached in the chat part's composers, as they store them. */
			composerDrafts: () => {
				storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
				const raw = storageService.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE);
				return raw ? (parse(raw) as { readonly input?: unknown }[]).map(composer => fromStoredChatDraft(composer.input)).map(draft => ({ input: draft.inputText, attachments: draft.attachments.map(attachment => attachment.name) })) : [];
			},
			/** The attachments of the chat part's composers, as they store them: their resources. */
			composerAttachments: () => {
				storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
				const raw = storageService.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE);
				return raw ? (parse(raw) as { readonly input?: unknown }[]).flatMap(composer => fromStoredChatDraft(composer.input).attachments.map(attachment => URI.isUri(attachment.value) ? attachment.value.toString() : String(attachment.value))) : [];
			},
			/** Restores the chat part as the editor window does as it starts: not while the layout hides it. */
			startWindow: () => restoreAgentsChatPart(instantiationService.get(IWorkbenchLayoutService), instantiationService.get(IContextKeyService), () => service),
			/** What the chat part's composers aim at, and what was typed in them, as they store them. */
			composerStates: () => {
				storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
				const raw = storageService.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE);
				return raw ? (parse(raw) as { readonly target?: INewSessionTarget; readonly input?: unknown }[]).map(composer => ({ ...composer.target, folderUri: composer.target?.folderUri?.path, input: fromStoredChatDraft(composer.input).inputText })) : [];
			},
			/** The folders the chat part's composers aim at, as they store them. */
			composerFolders: () => {
				storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
				const raw = storageService.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE);
				return raw ? (parse(raw) as { readonly target?: { readonly folderUri?: URI } }[]).map(composer => composer.target?.folderUri?.path) : [];
			},
			setSetting: (key: string, value: string) => {
				configurationService.setUserConfiguration(key, value);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (candidate: string) => candidate === key }));
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

	test('the window\'s host shows the draft of the active composer until it sends, as the Agents window\'s do, while the chat part shows no chat for it; it follows tab switches, the first send and close', async () => {
		const status = observableValue<SessionStatus>('status', SessionStatus.Untitled);
		const draftChat = upcastPartial<IChat>({ resource: URI.parse('test:/draft') });
		const draft = upcastPartial<ISession>({ resource: URI.parse('test:/draftSession'), status, mainChat: constObservable(draftChat) });
		const newSession = observableValue<ISession | undefined>('newSession', undefined);
		const other = buildTestSession({ id: 'other', title: 'Other' });
		const { service, part, host } = createService({ newSession, sessions: () => [other.session] });
		const hostShows = () => ({ session: host.session.get()?.resource.path ?? 'none', chat: host.chat.get()?.resource.path ?? 'none', active: service.activeChat.get() ? 'chat' : 'none' });

		await service.openComposer(undefined);
		const composerTab = part.activeGroup.activeEditor!;
		const noDraftYet = hostShows();
		newSession.set(draft, undefined);
		const composing = hostShows();
		await service.openChat(other.session, other.mainChat.chat.resource);
		const otherTab = hostShows();
		part.activeGroup.open(composerTab);
		const backToComposer = hostShows();
		status.set(SessionStatus.InProgress, undefined);
		const sent = hostShows();
		await part.activeGroup.closeEditor(part.activeGroup.activeEditor!);
		await service.closeChat(other.mainChat.chat.resource);

		assert.deepStrictEqual({ noDraftYet, composing, otherTab, backToComposer, sent, closed: hostShows() }, {
			noDraftYet: { session: 'none', chat: 'none', active: 'none' },
			composing: { session: '/draftSession', chat: '/draft', active: 'none' },
			otherTab: { session: other.session.resource.path, chat: other.mainChat.chat.resource.path, active: 'chat' },
			backToComposer: { session: '/draftSession', chat: '/draft', active: 'none' },
			sent: { session: '/draftSession', chat: '/draft', active: 'chat' },
			closed: { session: 'none', chat: 'none', active: 'none' },
		});
	});

	test('a composer\'s tab gives its title to its pane, as a chat\'s does, whose session header shows for the composer: Close there, on the main chat of its session not sent yet, closes the tab', async () => {
		const draftChat = upcastPartial<IChat>({ resource: URI.parse('test:/draft') });
		const draft = upcastPartial<ISession>({ resource: URI.parse('test:/draftSession'), status: constObservable(SessionStatus.Untitled), mainChat: constObservable(draftChat) });
		const { service, part, layout } = createService({ newSession: constObservable(draft) });

		await service.openComposer(undefined);
		const input = part.activeGroup.activeEditor;
		const composing = { rendersTitle: input instanceof ChatEditorInput && input.rendersTitle, showing: service.isShowing(draftChat.resource) };
		await service.closeChat(draftChat.resource);

		assert.deepStrictEqual({ composing, closed: layout() }, {
			composing: { rendersTitle: true, showing: false },
			closed: { groups: [{ tabs: [], active: null }], activeGroup: 0, visible: false },
		});
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
		const opened = await shown();
		// The chat it shows already, opened to restore, such as where the user moved the window's folder: restored, not opened
		await service.openChat(restoredSession.session, main, { restore: true });

		assert.deepStrictEqual({ restored, committed, opened, restoredAgain: await shown() }, { restored: 'main restore', committed: 'main commit', opened: 'main open', restoredAgain: 'main restore' });
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

	test('the Chat view\'s hosts report the chat of the active tab as the user opens and picks tabs, also as the chat part is created as its first chat opens, rather than as the host first reads it', async () => {
		const first = buildTestSession({ id: 'first', title: 'First' });
		const second = buildTestSession({ id: 'second', title: 'Second' });
		const firstChat = first.mainChat.chat.resource;
		const secondChat = second.mainChat.chat.resource;
		const { service, part, instantiationService, scoped, store } = createService({ sessions: () => [first.session, second.session], delayed: true });
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ onDidChangeViewVisibility: Event.None, getViewWithId: () => null }));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({}));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({}));
		stubChatViewHostServiceDependencies(instantiationService);
		const hosts = store.add(instantiationService.createInstance(ChatViewHostService));
		// As the editor window registers its host, before the chat part exists
		store.add(hosts.register({ host: scoped!.createInstance(AgentsChatViewHost, constObservable(true)) }));
		const reports: string[] = [];
		store.add(autorun(reader => {
			const value = hosts.shownSession.read(reader);
			if (value) {
				reports.push(`${isEqual(value.resource, firstChat) ? 'first' : isEqual(value.resource, secondChat) ? 'second' : value.resource.toString()} ${value.reason}`);
			}
		}));

		await service.openChat(first.session, firstChat);
		await service.openChat(second.session, secondChat);
		await timeout(0);
		// The user picks the first tab again
		const firstTab = part.activeGroup.editors.find(editor => editor instanceof ChatEditorInput && isEqual(editor.chatResource, firstChat))!;
		part.activeGroup.open(firstTab);
		await timeout(0);

		assert.deepStrictEqual(reports, ['first open', 'second open', 'first open']);
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

	/** A session that a new-session composer sent, as its slot reports it: what was typed in that composer is no draft then. */
	function sentSession(name: string): ISession {
		const resource = URI.parse(`test:/${name}`);
		return upcastPartial<ISession>({ resource, status: constObservable(SessionStatus.Completed), mainChat: constObservable(upcastPartial<IChat>({ resource })) });
	}

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

	test('in Single, a restored chat that has not shown yet stays in its list until its session is reported removed; then it leaves the list and is not stored', async () => {
		const [a, b, c] = ['a', 'b', 'c'].map(id => buildTestSession({ id, title: id.toUpperCase() }));
		const chatOf = (built: typeof a) => built.mainChat.chat.resource;
		let sessions: readonly ISession[] = [];
		const fixture = createService({ chatTabs: SessionsChatTabsMode.Single, visible: true, sessions: () => sessions, stored: JSON.stringify({ chats: [a, b, c].map(built => chatOf(built).toString()), active: 0 }) });
		await fixture.service.restore();
		// Not known yet, as their provider has not loaded them: they stay
		await timeout(0);
		const unknown = JSON.parse(fixture.save()!).chats;
		sessions = [a.session, b.session, c.session];
		fixture.fireSessionsChanged([a.session, b.session, c.session]);
		await timeout(0);
		sessions = [a.session, c.session];
		fixture.fireSessionsChanged([], [b.session]);
		await timeout(0);

		assert.deepStrictEqual({ unknown, afterRemoved: JSON.parse(fixture.save()!).chats, showingB: fixture.service.isShowing(chatOf(b)) }, {
			unknown: [a, b, c].map(built => chatOf(built).toString()),
			afterRemoved: [a, c].map(built => chatOf(built).toString()),
			showingB: false,
		});
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

	test('closing a tab disposes its chat, and the composer it owns, as the tab disposes, without disposing the tab again from within its dispose', async () => {
		const { service, part, state } = createService();
		await service.openComposer(undefined);
		const input = part.activeGroup.activeEditor!;
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

		const closing = part.activeGroup.closeEditor(input);
		// In the same tick as its tab: nothing of it is left to dispose later
		const asItsTabDisposes = { liveSlots: state().liveSlots, reentered, disposed: input.isDisposed() };
		await closing;

		assert.deepStrictEqual(asItsTabDisposes, { liveSlots: 0, reentered: 0, disposed: true });
	});

	test('with tabs, closing the last chat closes the chat part, which closing a chat it does not show leaves as it is', async () => {
		const { service, layout } = createService();
		await service.openChat(session, chatA);
		await service.openChat(session, chatB);

		await service.closeChat(chatC);
		await service.closeChat(chatA);
		const oneLeft = layout();
		await service.closeChat(chatB);
		await timeout(0);

		assert.deepStrictEqual({ oneLeft, none: layout() }, {
			oneLeft: { groups: [{ tabs: ['/b'], active: '/b' }], activeGroup: 0, visible: true },
			none: { groups: [{ tabs: [], active: null }], activeGroup: 0, visible: false },
		});
	});

	test('closing its last chat while it is hidden, such as as that chat moves to the Chat view, leaves it hidden and empty', async () => {
		const { service, layout, hide } = createService();
		await service.openChat(session, chatA);
		hide();
		await service.closeChat(chatA);
		await timeout(0);

		assert.deepStrictEqual(layout(), { groups: [{ tabs: [], active: null }], activeGroup: 0, visible: false });
	});

	{
		test('in Single, it closes as an editor group does: closing the chat it shows shows the one opened before it, closing the last chat shows a new-session composer, and closing that closes the chat part', async () => {
			const { service, part, layout } = createService({ chatTabs: SessionsChatTabsMode.Single });
			await service.openChat(session, chatA);
			await service.openChat(session, chatB);
			const bothOpen = layout();
			await service.closeChat(chatB);
			await timeout(0);
			const closedB = layout();
			await service.closeChat(chatA);
			await timeout(0);
			const closedA = layout();
			await part.activeGroup.closeEditor(part.activeGroup.activeEditor!);
			await timeout(0);

			assert.deepStrictEqual({ bothOpen, closedB, closedA, closedComposer: layout() }, {
				bothOpen: { groups: [{ tabs: ['/a', '/b'], active: '/b' }], activeGroup: 0, visible: true },
				closedB: { groups: [{ tabs: ['/a'], active: '/a' }], activeGroup: 0, visible: true },
				closedA: { groups: [{ tabs: ['composer'], active: 'composer' }], activeGroup: 0, visible: true },
				closedComposer: { groups: [{ tabs: [], active: null }], activeGroup: 0, visible: false },
			});
		});
	}

	test('closing all its chats closes every tab, in each of its groups, which closes the chat part', async () => {
		const { service, layout } = createService();
		await service.openChat(session, chatA);
		await service.openChat(session, chatB, { sideBySide: true });
		await service.openChat(session, chatC);
		const open = layout();

		await service.closeAllChats();
		const closed = layout();

		assert.deepStrictEqual({ open, closed: { tabs: closed.groups.flatMap(group => group.tabs), visible: closed.visible } }, {
			open: { groups: [{ tabs: ['/a'], active: '/a' }, { tabs: ['/b', '/c'], active: '/c' }], activeGroup: 1, visible: true },
			closed: { tabs: [], visible: false },
		});
	});

	test('in Single, it shows one chat at a time and keeps the others it opened, as an editor group does: a chat it opens replaces only an untouched composer', async () => {
		const { service, layout } = createService({ chatTabs: SessionsChatTabsMode.Single });
		await service.openChat(session, chatA);
		await service.openChat(session, chatB);
		const kept = layout();
		await service.openComposer(undefined, { newComposer: true });
		const composer = layout();
		await service.openChat(session, chatC);

		assert.deepStrictEqual({ kept, composer, untouchedComposerReplaced: layout() }, {
			kept: { groups: [{ tabs: ['/a', '/b'], active: '/b' }], activeGroup: 0, visible: true },
			composer: { groups: [{ tabs: ['/a', '/b', 'composer'], active: 'composer' }], activeGroup: 0, visible: true },
			untouchedComposerReplaced: { groups: [{ tabs: ['/a', '/b', '/c'], active: '/c' }], activeGroup: 0, visible: true },
		});
	});

	test('in Single, an open that a later one superseded shows nothing as it resolves after that one: the later chat stays the one it shows', async () => {
		let held: DeferredPromise<void> | undefined;
		const { service, layout } = createService({ chatTabs: SessionsChatTabsMode.Single, holdOpen: () => held?.p ?? Promise.resolve() });
		await service.openChat(session, chatC);
		// A slow open of a, which the editor part resolves only after b showed
		const slow = held = new DeferredPromise<void>();
		const openA = service.openChat(session, chatA);
		await timeout(0);
		held = undefined;
		await service.openChat(session, chatB);
		const afterB = layout();
		slow.complete();
		await openA;
		await timeout(0);

		assert.deepStrictEqual({ afterB, afterA: layout() }, {
			afterB: { groups: [{ tabs: ['/c', '/a', '/b'], active: '/b' }], activeGroup: 0, visible: true },
			afterA: { groups: [{ tabs: ['/c', '/a', '/b'], active: '/b' }], activeGroup: 0, visible: true },
		});
	});

	test('in Single, closing the chat it shows shows a new-session composer, and closing that closes the chat part; closing all its chats closes it at once', async () => {
		const { service, part, layout } = createService({ chatTabs: SessionsChatTabsMode.Single });
		await service.openChat(session, chatA);
		await service.closeChat(chatA);
		await timeout(0);
		const afterChat = layout();
		await part.activeGroup.closeEditor(part.activeGroup.activeEditor!);
		const afterComposer = layout();
		await service.openChat(session, chatB);
		await service.closeAllChats();
		await timeout(0);

		assert.deepStrictEqual({ afterChat, afterComposer, afterCloseAll: layout() }, {
			afterChat: { groups: [{ tabs: ['composer'], active: 'composer' }], activeGroup: 0, visible: true },
			afterComposer: { groups: [{ tabs: [], active: null }], activeGroup: 0, visible: false },
			afterCloseAll: { groups: [{ tabs: [], active: null }], activeGroup: 0, visible: false },
		});
	});

	test('in Single, it stores its chats most recent first, and restoring shows them again in that order as it closes them', async () => {
		const first = createService({ chatTabs: SessionsChatTabsMode.Single });
		await first.service.openChat(session, chatA);
		await first.service.openChat(session, chatB);
		await first.service.openChat(session, chatC);
		await first.service.openChat(session, chatA);
		const stored = JSON.parse(first.save()!);

		const second = createService({ chatTabs: SessionsChatTabsMode.Single, visible: true, stored: JSON.stringify(stored) });
		await second.service.restore();
		const shown = [second.layout().groups[0].active];
		for (const chat of [chatA, chatC]) {
			await second.service.closeChat(chat);
			await timeout(0);
			shown.push(second.layout().groups[0].active);
		}

		assert.deepStrictEqual({ stored, shown }, { stored: { chats: ['test:/a', 'test:/c', 'test:/b'], active: 0 }, shown: ['/a', '/c', '/b'] });
	});

	test('in Single, a new session reuses its one new-session composer that has not sent its session', async () => {
		const { service, part, layout } = createService({ chatTabs: SessionsChatTabsMode.Single });
		await service.openComposer(undefined, { newComposer: true });
		const first = part.activeGroup.activeEditor;
		await service.openComposer(undefined, { newComposer: true });

		assert.deepStrictEqual({ layout: layout(), reused: part.activeGroup.activeEditor === first }, { layout: { groups: [{ tabs: ['composer'], active: 'composer' }], activeGroup: 0, visible: true }, reused: true });
	});

	test('in Single, a new session reuses its unsent composer while a parked draft waits; the parked draft comes back with the next new composer, once that one sent its session, or after the text of that one as it closes', async () => {
		const parkedD = stringify({ chats: [], active: 0, kept: [toStoredChatDraft({ inputText: 'D', attachments: [] })] });
		const run = async (leave: 'sent' | 'closed') => {
			const composerE = createChatWindowComposerResource();
			const newSession = observableValue<ISession | undefined>('newSession', undefined);
			const fixture = createService({
				chatTabs: SessionsChatTabsMode.Single, visible: true, newSession,
				stored: stringify({ ...parse(parkedD), chats: [composerE.toString()] }),
				storedComposers: stringify([{ resource: composerE, input: toStoredChatDraft({ inputText: 'E', attachments: [] }) }]),
			});
			await fixture.service.restore();
			// New Chat, as the user asks for it
			await fixture.service.openComposer(undefined, { newComposer: true });
			const reused = { tabs: fixture.layout().groups[0].tabs, drafts: fixture.composerDrafts().map(draft => draft.input) };
			if (leave === 'sent') {
				newSession.set(sentSession('sentE'), undefined);
			} else {
				await fixture.part.activeGroup.closeEditor(fixture.part.activeGroup.activeEditor!);
			}
			const next: string[] = [];
			for (let i = 0; i < 2; i++) {
				await fixture.service.openComposer(undefined, { newComposer: true });
				next.push(fixture.composerDrafts().at(-1)!.input);
				newSession.set(sentSession(`sent${i}`), undefined);
			}
			return { reused, next };
		};

		assert.deepStrictEqual({ sent: await run('sent'), closed: await run('closed') }, {
			sent: { reused: { tabs: ['composer'], drafts: ['E'] }, next: ['D', ''] },
			closed: { reused: { tabs: ['composer'], drafts: ['E'] }, next: ['E', 'D'] },
		});
	});

	test('in Single, a kept draft comes back with the first new composer after a reload that starts with the chat part hidden, with its attachments, and only once', async () => {
		const attachments = [
			upcastPartial<IChatRequestVariableEntry>({ id: 'drive', name: 'a.ts', kind: 'file', value: URI.from({ scheme: 'file', path: '/c:/Users/me/a.ts' }) }),
			upcastPartial<IChatRequestVariableEntry>({ id: 'unc', name: 'b.ts', kind: 'file', value: URI.from({ scheme: 'file', authority: 'server', path: '/share/b.ts' }) }),
		];
		const run = async (keep: 'closed' | 'parked') => {
			const composer = createChatWindowComposerResource();
			const first = createService({
				chatTabs: SessionsChatTabsMode.Single, visible: true,
				stored: JSON.stringify({ chats: [composer.toString()], active: 0 }),
				storedComposers: stringify([{ resource: composer, input: toStoredChatDraft({ inputText: 'D', attachments }) }]),
			});
			await first.service.restore();
			if (keep === 'closed') {
				// Closing its last chat, the composer, hides the chat part
				await first.part.activeGroup.closeEditor(first.part.activeGroup.activeEditor!);
			} else {
				first.service.parkComposerInput();
				first.hide();
			}
			const hiddenAfterFirst = !first.layout().visible;

			// The window starts again with the chat part hidden: it restores no tabs; New Chat shows it, and the draft is sent
			const sending = observableValue<ISession | undefined>('newSession', undefined);
			const second = createService({ chatTabs: SessionsChatTabsMode.Single, stored: first.save(), newSession: sending });
			await second.startWindow();
			await second.service.openComposer(undefined, { newComposer: true });
			const restored = { drafts: second.composerDrafts().map(draft => draft.input), attachments: second.composerAttachments() };
			sending.set(sentSession('sentD'), undefined);

			const third = createService({ chatTabs: SessionsChatTabsMode.Single, stored: second.save() });
			await third.startWindow();
			await third.service.openComposer(undefined, { newComposer: true });
			return { hiddenAfterFirst, restored, afterAnotherReload: third.composerDrafts().map(draft => draft.input) };
		};
		const expected = { hiddenAfterFirst: true, restored: { drafts: ['D'], attachments: ['file:///c%3A/Users/me/a.ts', 'file://server/share/b.ts'] }, afterAnotherReload: [''] };

		assert.deepStrictEqual({ closed: await run('closed'), parked: await run('parked') }, { closed: expected, parked: expected });
	});

	test('leaving Single forgets the kept drafts it stored also while the chat part was never created, and keeps the tabs it stored', async () => {
		const storedTabs = [chatA.toString(), chatB.toString()];
		const keptD = [toStoredChatDraft({ inputText: 'D', attachments: [] })];
		/** Starts hidden with what it stored, changes its mode as `modes` say, saves, and starts hidden again for a New Chat. */
		const run = async (startMode: SessionsChatTabsMode, modes: readonly SessionsChatTabsMode[], chats: readonly string[] = []) => {
			const first = createService({ chatTabs: startMode, stored: stringify({ chats, active: chats.length ? 1 : 0, kept: keptD }) });
			await first.startWindow();
			for (const mode of modes) {
				first.setSetting(SESSIONS_CHAT_TABS_SETTING, mode);
			}
			const saved = first.save();
			const second = createService({ chatTabs: SessionsChatTabsMode.Single, stored: saved });
			await second.startWindow();
			await second.service.openComposer(undefined, { newComposer: true });
			const value = saved && parse(saved) as { readonly chats: readonly string[]; readonly active: number; readonly kept?: unknown };
			return { stored: value && { chats: value.chats, active: value.active, kept: !!value.kept }, newChat: second.composerDrafts().map(draft => draft.input) };
		};

		assert.deepStrictEqual({
			untouched: await run(SessionsChatTabsMode.Single, []),
			leftSingle: await run(SessionsChatTabsMode.Single, [SessionsChatTabsMode.Multiple, SessionsChatTabsMode.Single]),
			leftSingleWithTabs: await run(SessionsChatTabsMode.Single, [SessionsChatTabsMode.Multiple, SessionsChatTabsMode.Single], storedTabs),
			startedInMultiple: await run(SessionsChatTabsMode.Multiple, []),
		}, {
			untouched: { stored: { chats: [], active: 0, kept: true }, newChat: ['D'] },
			leftSingle: { stored: undefined, newChat: [''] },
			leftSingleWithTabs: { stored: { chats: storedTabs, active: 1, kept: false }, newChat: [''] },
			startedInMultiple: { stored: undefined, newChat: [''] },
		});
	});

	test('in Single, the kept drafts it stored that are no drafts are skipped, and the others come back', async () => {
		const { service, startWindow, composerDrafts } = createService({ chatTabs: SessionsChatTabsMode.Single, stored: stringify({ chats: [], active: 0, kept: [toStoredChatDraft({ inputText: 'D', attachments: [] }), { bogus: true }, 42] }) });
		await startWindow();
		await service.openComposer(undefined, { newComposer: true });

		assert.deepStrictEqual(composerDrafts().map(draft => draft.input), ['D']);
	});

	test('in Single, a parked draft is stored with the chat part and restored once after a reload, with its attachments', async () => {
		const composer = createChatWindowComposerResource();
		const attachment = upcastPartial<IChatRequestVariableEntry>({ id: 'file-a', name: 'a.ts', kind: 'file', value: URI.file('/a.ts') });
		const firstSending = observableValue<ISession | undefined>('newSession', undefined);
		const first = createService({
			chatTabs: SessionsChatTabsMode.Single, visible: true, newSession: firstSending,
			stored: JSON.stringify({ chats: [composer.toString()], active: 0 }),
			storedComposers: stringify([{ resource: composer, input: toStoredChatDraft({ inputText: 'D', attachments: [attachment] }) }]),
		});
		await first.service.restore();
		first.service.parkComposerInput();
		// The draft that took the composer is sent
		firstSending.set(sentSession('sentE'), undefined);

		const secondSending = observableValue<ISession | undefined>('newSession', undefined);
		const second = createService({ chatTabs: SessionsChatTabsMode.Single, visible: true, stored: first.save(), newSession: secondSending });
		await second.service.restore();
		await second.service.openComposer(undefined, { newComposer: true });
		const restored = second.composerDrafts();
		secondSending.set(sentSession('sentD'), undefined);
		await second.service.openComposer(undefined, { newComposer: true });

		assert.deepStrictEqual({ restored, again: second.composerDrafts().at(-1) }, { restored: [{ input: 'D', attachments: ['a.ts'] }], again: { input: '', attachments: [] } });
	});

	test('in Single, its composer parks what was typed in it for a newer draft to take the composer; each new composer then takes the latest kept one, so none is lost', async () => {
		const [older, newer] = [createChatWindowComposerResource(), createChatWindowComposerResource()];
		const sending = observableValue<ISession | undefined>('newSession', undefined);
		const { service, part, composerStates } = createService({
			chatTabs: SessionsChatTabsMode.Single, visible: true, newSession: sending,
			stored: JSON.stringify({ chats: [older.toString(), newer.toString()], active: 0 }),
			storedComposers: stringify([older, newer].map((resource, index) => ({ resource, input: toStoredChatDraft({ inputText: index === 0 ? 'D' : 'E', attachments: [] }) }))),
		});
		await service.restore();
		let sent = 0;
		// The composer sends its session, and New Chat opens the next one
		const nextNewChat = async () => {
			sending.set(sentSession(`sent${sent++}`), undefined);
			await service.openComposer(undefined, { newComposer: true });
			return composerStates().at(-1)?.input;
		};

		// The older draft parks; the newer one, which took a composer of its own here, is closed and kept as well
		const parked = service.parkComposerInput();
		await part.activeGroup.closeEditor(part.activeGroup.editors.find(editor => editor !== part.activeGroup.activeEditor)!);

		assert.deepStrictEqual({ parked, first: await nextNewChat(), second: await nextNewChat(), third: await nextNewChat() }, { parked: true, first: 'E', second: 'D', third: '' });
	});

	test('in Single, closing its new-session composer keeps what was typed in it for its next one, without asking, also as it closes all its chats; not an empty one, not as the window shuts down, nor one that sent its session; leaving Single forgets it', async () => {
		const composer = createChatWindowComposerResource();
		const sentChat = upcastPartial<IChat>({ resource: URI.parse('test:/sent') });
		const sent = upcastPartial<ISession>({ resource: URI.parse('test:/sentSession'), status: constObservable(SessionStatus.Completed), mainChat: constObservable(sentChat) });
		/** Restores a composer with `typed` in it, as after a reload, closes it as `close` does, and opens a new session. */
		const run = async (typed: string, close: (fixture: ReturnType<typeof createService>) => Promise<void>, options?: { readonly newSession?: IObservable<ISession | undefined> }) => {
			const fixture = createService({
				chatTabs: SessionsChatTabsMode.Single, visible: true, newSession: options?.newSession,
				stored: JSON.stringify({ chats: [composer.toString()], active: 0 }),
				storedComposers: stringify([{ resource: composer, input: toStoredChatDraft({ inputText: typed, attachments: [] }) }]),
			});
			await fixture.service.restore();
			await close(fixture);
			await timeout(0);
			fixture.lifecycle.willShutdown = false;
			await fixture.service.openComposer(undefined, { newComposer: true });
			return fixture.composerInputs();
		};
		const closeTab = async ({ part }: ReturnType<typeof createService>) => { await part.activeGroup.closeEditor(part.activeGroup.activeEditor!); };

		assert.deepStrictEqual({
			typed: await run('my draft', closeTab),
			empty: await run('', closeTab),
			closeAll: await run('my draft', ({ service }) => service.closeAllChats()),
			shutdown: await run('my draft', async fixture => { fixture.lifecycle.willShutdown = true; await closeTab(fixture); }),
			sentSession: await run('my draft', closeTab, { newSession: constObservable(sent) }),
			leftSingle: await run('my draft', async fixture => {
				await closeTab(fixture);
				fixture.setSetting(SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode.Multiple);
				fixture.setSetting(SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode.Single);
			}),
		}, { typed: ['my draft'], empty: [''], closeAll: ['my draft'], shutdown: [''], sentSession: [''], leftSingle: [''] });
	});

	test('Close All closes all its chats and hides the chat part, showing them as tabs or one at a time; in Single, what was typed in its unsent composers is kept and stored, each coming back once with a new composer after a reload', async () => {
		const attachment = upcastPartial<IChatRequestVariableEntry>({ id: 'drive', name: 'a.ts', kind: 'file', value: URI.from({ scheme: 'file', path: '/c:/Users/me/a.ts' }) });
		const run = async (chatTabs: SessionsChatTabsMode) => {
			const [d, e] = [createChatWindowComposerResource(), createChatWindowComposerResource()];
			const first = createService({
				chatTabs, visible: true,
				stored: JSON.stringify({ chats: [e.toString(), d.toString()], active: 1 }),
				storedComposers: stringify([d, e].map((resource, index) => ({ resource, input: toStoredChatDraft({ inputText: index === 0 ? 'D' : 'E', attachments: index === 0 ? [attachment] : [] }) }))),
			});
			await first.service.restore();
			await first.service.openChat(session, chatA);
			await first.service.closeAllChats();
			const closed = { tabs: first.layout().groups.flatMap(group => group.tabs), visible: first.layout().visible };

			// The window starts again with the chat part hidden; each New Chat sends its draft before the next
			const sending = observableValue<ISession | undefined>('newSession', undefined);
			const second = createService({ chatTabs: SessionsChatTabsMode.Single, stored: first.save(), newSession: sending });
			await second.startWindow();
			const next: { readonly input: string; readonly attachments: readonly string[] }[] = [];
			for (let i = 0; i < 3; i++) {
				await second.service.openComposer(undefined, { newComposer: true });
				next.push(second.composerDrafts().at(-1)!);
				sending.set(sentSession(`sent${i}`), undefined);
			}
			return { closed, next: next.map(draft => `${draft.input}${draft.attachments.map(name => ` +${name}`).join('')}`) };
		};

		assert.deepStrictEqual({ single: await run(SessionsChatTabsMode.Single), multiple: await run(SessionsChatTabsMode.Multiple) }, {
			single: { closed: { tabs: [], visible: false }, next: ['D +a.ts', 'E', ''] },
			multiple: { closed: { tabs: [], visible: false }, next: ['', '', ''] },
		});
	});

	test('in Single, Close All keeps the draft of the composer used last for the next to take first, also across groups side by side, when a chat shows in front of it, or after it moved to another group', async () => {
		/** D shows in the first group; E, kept from before, comes back with a composer beside it; then `then` goes on from there. */
		const run = async (then: (fixture: ReturnType<typeof createService>) => Promise<void>) => {
			const d = createChatWindowComposerResource();
			const first = createService({
				chatTabs: SessionsChatTabsMode.Single, visible: true,
				stored: stringify({ chats: [d.toString()], active: 0, kept: [toStoredChatDraft({ inputText: 'E', attachments: [] })] }),
				storedComposers: stringify([{ resource: d, input: toStoredChatDraft({ inputText: 'D', attachments: [] }) }]),
			});
			await first.service.restore();
			await then(first);
			const groups = first.part.groups.map(group => group.editors.length);
			await first.service.closeAllChats();

			const sending = observableValue<ISession | undefined>('newSession', undefined);
			const second = createService({ chatTabs: SessionsChatTabsMode.Single, stored: first.save(), newSession: sending });
			await second.startWindow();
			const next: string[] = [];
			for (let i = 0; i < 3; i++) {
				await second.service.openComposer(undefined, { newComposer: true });
				next.push(second.composerDrafts().at(-1)!.input);
				sending.set(sentSession(`sent${i}`), undefined);
			}
			return { groups, next };
		};

		assert.deepStrictEqual({
			// The user goes back to D, in the first group
			backToD: await run(async ({ service, part }) => {
				await service.openComposer(undefined, { sideBySide: true });
				part.activate(part.groups[0]);
			}),
			// A sent chat shows in front of D; E, beside it, is used after D; then the user picks that chat again, in front of D
			chatInFrontOfD: await run(async ({ service }) => {
				await service.openChat(session, chatA);
				await service.openComposer(undefined, { sideBySide: true });
				await service.openChat(session, chatA);
			}),
			// The user goes back to D and moves it beside E: it stays the composer used last, and its draft is kept once
			movedD: await run(async ({ service, part }) => {
				await service.openComposer(undefined, { sideBySide: true });
				part.activate(part.groups[0]);
				await part.moveEditor(part.groups[0].activeEditor!, part.groups[0], part.groups[1]);
			}),
		}, {
			backToD: { groups: [1, 1], next: ['D', 'E', ''] },
			chatInFrontOfD: { groups: [2, 1], next: ['E', 'D', ''] },
			movedD: { groups: [0, 2], next: ['D', 'E', ''] },
		});
	});

	test('a chat that the user opens in the Chat view while no host replaces it, or in an editor, leaves the chats it keeps; not one the Chat view restores, nor one it shows while a host replaces it', async () => {
		const { service, layout, chatView, editorArea } = createService({ chatTabs: SessionsChatTabsMode.Single });
		await service.openChat(session, chatA);
		await service.openChat(session, chatB);
		await service.openChat(session, chatC);
		const tabs = () => layout().groups[0].tabs;
		chatView.replaced.set(true, undefined);
		chatView.shown.set({ resource: chatA, reason: 'open' }, undefined);
		const replacedShows = tabs();
		chatView.shown.set({ resource: chatB, reason: 'restore' }, undefined);
		chatView.replaced.set(false, undefined);
		const restored = tabs();
		chatView.shown.set({ resource: chatA, reason: 'open' }, undefined);
		await timeout(0);
		const openedInChatView = tabs();
		editorArea.panes = [upcastPartial<IVisibleEditorPane>({ input: upcastPartial<EditorInput>({ resource: chatB }), group: upcastPartial<IVisibleEditorPane['group']>({}) })];
		editorArea.onDidChange.fire(upcastPartial<IVisibleEditorsChangeEvent>({}));
		await timeout(0);

		assert.deepStrictEqual({ replacedShows, restored, openedInChatView, openedInEditor: tabs() }, {
			replacedShows: ['/a', '/b', '/c'],
			restored: ['/a', '/b', '/c'],
			openedInChatView: ['/b', '/c'],
			openedInEditor: ['/c'],
		});
	});

	test('in Single, a new session that reuses its composer aims it at all it asks for, also from a folder the user picked, keeping what was typed', async () => {
		const composer = createChatWindowComposerResource();
		const { service, layout, composerStates } = createService({
			chatTabs: SessionsChatTabsMode.Single, visible: true,
			stored: JSON.stringify({ chats: [composer.toString()], active: 0 }),
			// The user picked its folder and its session type
			storedComposers: stringify([{ resource: composer, target: { folderUri: URI.file('/picked'), providerId: 'claude', sessionTypeId: 'claude' }, hostFolder: null, input: toStoredChatDraft({ inputText: 'typed', attachments: [] }) }]),
		});
		await service.restore();

		await service.openComposer({ folderUri: URI.file('/repo'), providerId: 'copilot', sessionTypeId: 'copilotcli', placement: 'worktree' }, { newComposer: true });

		assert.deepStrictEqual({ tabs: layout().groups[0].tabs, composers: composerStates() }, {
			tabs: ['composer'],
			composers: [{ folderUri: '/repo', providerId: 'copilot', sessionTypeId: 'copilotcli', placement: 'worktree', input: 'typed' }],
		});
	});

	test('in Single, the composer that shows as its last chat leaves takes focus only when the chat part had it: not as the chat opens elsewhere', async () => {
		const run = async (leave: (fixture: ReturnType<typeof createService>) => Promise<void>, chatPartFocused: boolean) => {
			// Its composer's editor resolves only later
			const fixture = createService({ chatTabs: SessionsChatTabsMode.Single, visible: true, holdOpen: () => timeout(0) });
			await fixture.service.openChat(session, chatA);
			fixture.focus.chatPart = chatPartFocused;
			fixture.opens.length = 0;
			await leave(fixture);
			await timeout(10);
			return { tabs: fixture.layout().groups[0].tabs, opens: fixture.opens };
		};
		const openedInEditor = async ({ editorArea }: ReturnType<typeof createService>) => {
			editorArea.panes = [upcastPartial<IVisibleEditorPane>({ input: upcastPartial<EditorInput>({ resource: chatA }), group: upcastPartial<IVisibleEditorPane['group']>({}) })];
			editorArea.onDidChange.fire(upcastPartial<IVisibleEditorsChangeEvent>({}));
		};

		assert.deepStrictEqual({
			openedInEditor: await run(openedInEditor, false),
			closedInChatPart: await run(({ service }) => service.closeChat(chatA), true),
		}, {
			openedInEditor: { tabs: ['composer'], opens: [{ tab: 'composer', focuses: false }] },
			closedInChatPart: { tabs: ['composer'], opens: [{ tab: 'composer', focuses: true }] },
		});
	});

	test('in Single, restoring shows the chat it showed and keeps the others it stored, to show again as it closes', async () => {
		const { service, layout } = createService({ chatTabs: SessionsChatTabsMode.Single, visible: true, stored: JSON.stringify({ chats: [chatA.toString(), chatB.toString(), chatC.toString()], active: 1 }) });

		await service.restore();

		// Most recent first, from the one it showed: its tabs, which it does not show, are in the order it opened them
		assert.deepStrictEqual(layout(), { groups: [{ tabs: ['/b', '/c', '/a'], active: '/b' }], activeGroup: 0, visible: true });
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

	test('its tabs follow sessions.showChatTabs as it changes, by default one tab of the active chat, not workbench.editor.showTabs', async () => {
		const { service, part, setSetting } = createService({ chatTabs: null });
		await service.openChat(session, chatA);
		const showTabs = () => (part.options as { readonly showTabs?: string }).showTabs;
		const shown: Record<string, string | undefined> = { default: showTabs() };

		setSetting(SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode.Multiple);
		shown.multiple = showTabs();
		setSetting('workbench.editor.showTabs', 'none');
		shown.multipleWithEditorTabsNone = showTabs();
		setSetting(SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode.Single);
		shown.single = showTabs();
		setSetting('workbench.editor.showTabs', 'multiple');
		shown.singleWithEditorTabsMultiple = showTabs();

		assert.deepStrictEqual({ shown, options: part.options, singleTabTitleProvidedByEditor: part.createOptions?.singleTabTitleProvidedByEditor }, {
			shown: { default: 'single', multiple: 'multiple', multipleWithEditorTabsNone: 'multiple', single: 'single', singleWithEditorTabsMultiple: 'single' },
			options: { doubleClickTabToToggleEditorGroupSizes: 'off', showTabs: 'single', tabSizing: 'fixed', tabSizingFixedMinWidth: 80, tabSizingFixedMaxWidth: 160 },
			singleTabTitleProvidedByEditor: true,
		});
	});
});
