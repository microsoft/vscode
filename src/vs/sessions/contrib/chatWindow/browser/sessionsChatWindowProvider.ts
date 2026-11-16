/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWindow.css';
import { timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableFromEvent, observableValue, waitForState } from '../../../../base/common/observable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IEditorGroupView, IEditorGroupViewOptions } from '../../../../workbench/browser/parts/editor/editor.js';
import { GroupModelChangeKind } from '../../../../workbench/common/editor.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { getChatWindowMainPartOptions, IChatWindow, IChatWindowChat, IChatWindowChrome, IChatWindowChromeElement, IChatWindowContent, IChatWindowEditors, IChatWindowLook, IChatWindowNewChatFolder, IChatWindowNewChatOptions, IChatWindowProvider, IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService, LayoutSettings, ModernUIDensity, ModernUIEditorTabStyle, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ITitleService } from '../../../../workbench/services/title/browser/titleService.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';
import { EmptyEditorGroupAddTab } from '../../../../workbench/browser/parts/sessions/emptyEditorGroupAddTab.js';
import { observeSessionActivityBarSize, registerSessionActivityBarExternalHost } from '../../../../workbench/browser/parts/sessions/sessionActivityBarHost.js';
import { MenuActivityBar, MenuActivityBarSize } from '../../../../workbench/browser/parts/activitybar/menuActivityBar.js';
import { AgentsPartCard } from '../../../../workbench/browser/parts/sessions/agentsPartCard.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ISizeService } from '../../../../platform/theme/common/sizeService.js';
import { agentsPanelsSpacing } from '../../../../platform/theme/common/sizeRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { CustomViewVisibleContext } from '../../../common/agentsWindowContextKeys.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../../workbench/contrib/sessions/common/layoutConstants.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { SessionsChatSurface } from '../../../../workbench/contrib/sessions/browser/sessionsChatSurface.js';
import { bindSessionHostScopeContext, getMainWindowHost, ISessionHost, ISessionHostService, SessionHost, SessionHostKind } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { IChatHostOpenerService } from '../../../../workbench/services/sessions/browser/chatHostOpener.js';
import { ISession, isSessionCreated } from '../../../../workbench/services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { bindSessionScopeContextKeys } from '../../../../workbench/contrib/sessionChanges/browser/sessionActionsHost.js';
import { SessionChangesEditorFileListContext } from '../../../../workbench/contrib/sessions/common/changes.js';
import { IChangesViewService } from '../../../../workbench/contrib/sessions/common/changesViewService.js';
import { ISessionEditorWorkingSetService } from '../../layout/common/sessionEditorWorkingSet.js';
import { CHAT_WINDOWS_ENABLED_SETTING, ChatWindowHasUnsentComposerContext, getUnsentComposerMoveReason } from '../common/chatWindows.js';
import { isChatWindowChatGone } from '../../../../workbench/contrib/sessions/browser/chatEditor/sessionChatOpening.js';
import { IResolvedSessionChat, ISessionChatEditorShown, resolveSessionChat, SessionChatEditorEntry, waitForSessionChat } from '../../../../workbench/contrib/sessions/browser/chatEditor/sessionChatEditorHost.js';
import { ISessionsListModelService } from '../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionGroupsService } from '../../../../workbench/contrib/sessions/browser/sessionGroupsService.js';
import { INewSessionTarget } from '../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { ChatWindowComposerModel, ChatWindowComposers, createChatWindowComposerResource, getChatWindowComposerTarget, IChatWindowComposerInit, isChatWindowComposerResource } from '../../../../workbench/contrib/sessions/browser/chatEditor/chatWindowComposer.js';
import { ChatWindowSessionDropTarget } from './chatWindowSessionDropTarget.js';

/** The class of the element of an Agents chat window. */
export const AGENTS_CHAT_WINDOW_CLASS = 'agents-chat-window';

/**
 * The width of the strip's column at the right of a chat window, as the main window's Session Activity Bar column is
 * (`SessionActivityBarColumn`): the gap between cards, none with compact layout density, which it keeps to the cards to
 * its left, and a {@link MenuActivityBar} at the size chosen for the Session Activity Bar, which fills the rest.
 */
export function getChatWindowStripWidth(compact: boolean, size: MenuActivityBarSize, gap: number = AGENTS_FLOATING_PANEL_GAP, connectedTabs = true): number {
	const frameInset = connectedTabs ? Math.min(AgentsPartCard.BORDER_WIDTH, Math.floor(gap / 2)) : 0;
	return (compact ? 0 : Math.max(0, gap - frameInset)) + MenuActivityBar.getWidth(compact, size);
}

/** The options of the groups of the main part of a chat window: those of the main window's editor area of the Agents window. */
export const CHAT_WINDOW_MAIN_PART_GROUP_VIEW_OPTIONS: IEditorGroupViewOptions = {
	menuIds: {
		headerPrimary: Menus.SessionsEditorHeaderPrimary,
		headerSecondary: Menus.SessionsEditorHeaderSecondary,
		headerLayout: Menus.SessionsEditorHeaderLayout,
		editorActions: Menus.SessionsEditorTitle,
		tabsBarContext: AgentsWindowMenus.SessionsEditorTabsBarContext,
		tabsBarAddTab: AgentsWindowMenus.SessionsEditorTabsBarAddTab,
	},
	showHeader: true,
	useModernUITabs: true,
};

/**
 * Focuses a chat window (`focus`) unless its document has focus already: focusing a focused window again can bring the
 * main window to the front before it.
 */
export function focusChatWindowUnlessFocused(targetWindow: { readonly document: { hasFocus(): boolean } }, focus: () => void): void {
	if (!targetWindow.document.hasFocus()) {
		focus();
	}
}

/**
 * One chat of a chat window (see {@link SessionChatEditorEntry}), which the window acts on while it is the window's active
 * chat. It keeps the chat out of the main window's grid while it shows it, closes it through the window's opener, and keeps
 * a new-session composer in its window until it sends its session.
 */
class SessionsChatWindowChat extends SessionChatEditorEntry implements IChatWindowChat {

	/** Keeps the chat out of the main window's grid while the window shows it. */
	private readonly _gridHold = this._register(new MutableDisposable());
	private _heldSession: ISession | undefined;
	private readonly _shownSession = observableValue<ISessionChatEditorShown | undefined>(this, undefined);

	readonly window: IObservable<IChatWindow | undefined>;
	readonly active: IObservable<boolean>;

	constructor(
		owner: SessionsChatWindowContent,
		chatResource: URI,
		composer: ChatWindowComposerModel | undefined,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IChatService chatService: IChatService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IChatHostOpenerService private readonly _chatHostOpenerService: IChatHostOpenerService,
		@ISessionsListModelService sessionsListModelService: ISessionsListModelService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(chatResource, sessionsManagementService, chatService, sessionsListModelService, sessionsProvidersService, configurationService);
		this.window = owner.window;
		this.active = derived(this, reader => isEqual(owner.window.read(reader)?.chat.read(reader), this.chat.read(reader)));
		// It takes the chat out of the main window's grid only once the window binds it: the window first takes along the
		// editors the main window has open for the chat's session, which taking the chat out of the grid closes.
		this._register(autorun(reader => {
			const shown = this._shownSession.read(reader);
			if (shown && this.window.read(reader) && this._heldSession?.sessionId !== shown.session.sessionId) {
				this._heldSession = shown.session;
				this._gridHold.value = this._sessionsService.hideChatFromGrid(shown.session, shown.chat.resource);
			}
		}));
		// The loaded model of the chat bridges its move into the window, from the main window's grid, which lets go of it.
		this.start(composer, 'ChatWindow#move');
	}

	protected override onDidShowSession(shown: ISessionChatEditorShown): void {
		this._shownSession.set(shown, undefined);
	}

	protected override onDidSetComposer(_composer: ChatWindowComposerModel, store: DisposableStore): void {
		// It stays in its window until it sends its session.
		this.input.setMoveRestriction({
			reason: getUnsentComposerMoveReason(),
			canMoveTo: group => {
				const windowId = this.window.get()?.windowId;
				return windowId !== undefined && this._editorGroupsService.getGroup(group)?.windowId === windowId;
			},
		});
		store.add(toDisposable(() => this.input.setMoveRestriction(undefined)));
	}

	protected override closeShown(resource: URI): void {
		void this._chatHostOpenerService.getOpenerOf(resource)?.close(resource).catch(onUnexpectedError);
	}

	createDropTarget(element: HTMLElement, chat: () => URI | undefined): IDisposable {
		return this._instantiationService.createInstance(ChatWindowSessionDropTarget, element, chat);
	}
}

/**
 * What a chat window shows: its chats, each an editor of its chat part, and the host of the window, whose chat is its
 * active chat, the chat editor last active in it; the window acts on that chat and its session, and binds its keys.
 */
export class SessionsChatWindowContent extends Disposable implements IChatWindowContent {

	readonly services: ServiceCollection;
	readonly window = observableValue<IChatWindow | undefined>(this, undefined);

	private readonly _chats = observableValue<readonly SessionsChatWindowChat[]>(this, []);
	/** The composers opened in the window, by their resource, until their chat takes them ({@link resolveChat}). */
	private readonly _pendingComposers = this._register(new DisposableMap<string, ChatWindowComposerModel>());
	/** The chat of the window's active chat editor, while it shows; the first chat until then. */
	readonly activeChat: IObservable<SessionsChatWindowChat | undefined>;
	/** The host of the window: its active chat, and its session. */
	readonly host: ISessionHost;
	/** The context of its window's parts, where the window binds the keys of its session. */
	private _windowContextKeyService: IContextKeyService | undefined;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	override dispose(): void {
		this._onWillDispose.fire();
		super.dispose();
	}

	/**
	 * @param _didResolveAs Told when a chat resolves as another one, such as a session as one of its chats, so that a
	 * stored chat window of it is known to show.
	 */
	constructor(
		private readonly _composers: ChatWindowComposers,
		private readonly _didResolveAs: (original: URI, canonical: URI) => void,
		@IChatWindowService private readonly _chatWindowService: IChatWindowService,
		@IChangesViewService private readonly _changesViewService: IChangesViewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionHostService sessionHostService: ISessionHostService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ISessionGroupsService private readonly _sessionGroupsService: ISessionGroupsService,
	) {
		super();
		this.activeChat = derived(this, reader => {
			const chats = this._chats.read(reader);
			const active = this.window.read(reader)?.chat.read(reader);
			return (active && chats.find(chat => isEqual(chat.chat.read(reader), active))) ?? chats[0];
		});
		// What the window shows acts on its active chat and its session, not on what the main window shows.
		this.host = new SessionHost({
			kind: SessionHostKind.ChatWindow,
			parent: undefined,
			session: derived(this, reader => this.activeChat.read(reader)?.session.read(reader)),
			chat: derived(this, reader => this.activeChat.read(reader)?.shownChat.read(reader)),
			loadingChat: derived(this, reader => this.activeChat.read(reader)?.chat.read(reader)),
			windowId: derived(this, reader => this.window.read(reader)?.windowId),
			contextKeyService: () => this._windowContextKeyService ?? contextKeyService,
		});
		this._register(sessionHostService.registerHost(this.host));
		this.services = new ServiceCollection([ISessionHost, this.host]);
		this._register(toDisposable(() => this._chats.get().forEach(chat => chat.dispose())));
	}

	async resolveChat(resource: URI, exactChat?: boolean): Promise<IChatWindowChat | undefined> {
		const chat = await this._resolveChat(resource, exactChat);
		const canonical = chat?.chat.get();
		if (canonical && !isEqual(canonical, resource)) {
			this._didResolveAs(resource, canonical);
		}
		return chat;
	}

	private async _resolveChat(resource: URI, exactChat?: boolean): Promise<IChatWindowChat | undefined> {
		if (isChatWindowComposerResource(resource)) {
			return await this._resolveComposer(resource);
		}
		const resolved = resolveSessionChat(this._sessionsManagementService, resource);
		if (!resolved) {
			return undefined;
		}
		const chatResource = resolved.chat ?? (exactChat ? resolved.session.mainChat.get().resource : shownChatOfSession(this._sessionsService, resolved.session));
		const existing = this._chats.get().find(candidate => isEqual(candidate.chat.get(), chatResource));
		if (existing) {
			return existing;
		}
		return this._addChat(chatResource, undefined);
	}

	/**
	 * The chat of the composer of `resource`: one it opened, or a stored one, which restores as a composer, or as the main
	 * chat of the session that a send it had not seen end started.
	 */
	private async _resolveComposer(resource: URI): Promise<SessionsChatWindowChat | undefined> {
		const existing = this._chats.get().find(candidate => isEqual(candidate.chat.get(), resource));
		if (existing) {
			return existing;
		}
		const opened = this._pendingComposers.deleteAndLeak(resource.toString());
		if (opened) {
			return this._addChat(resource, opened);
		}
		const restored = await this._composers.restore(resource, this._openStartedSession(resource));
		if (!restored) {
			return undefined;
		}
		// The window went away while the composer restored
		if (this._store.isDisposed) {
			if (restored.kind === 'composer') {
				restored.composer.dispose();
			}
			return undefined;
		}
		if (restored.kind === 'composer') {
			return this._addChat(resource, restored.composer);
		}
		const main = restored.session.mainChat.get().resource;
		return this._chats.get().find(candidate => isEqual(candidate.chat.get(), main)) ?? this._addChat(main, undefined);
	}

	/** Opens a session that the composer of `resource` started in the background beside it, in its window. */
	private _openStartedSession(resource: URI): (session: ISession) => Promise<void> {
		return async started => {
			await this._chatWindowService.open(started.mainChat.get().resource, { window: this.window.get(), tabOf: resource, exactChat: true });
		};
	}

	private _addChat(chatResource: URI, composer: ChatWindowComposerModel | undefined): SessionsChatWindowChat | undefined {
		if (isChatWindowComposerResource(chatResource) && !composer) {
			return undefined;
		}
		const chat = this._instantiationService.createInstance(SessionsChatWindowChat, this, chatResource, composer);
		this._chats.set([...this._chats.get(), chat], undefined);
		// The window owns it while it shows it, and disposes it as it leaves
		Event.once(chat.onWillDispose)(() => this._chats.set(this._chats.get().filter(candidate => candidate !== chat), undefined));
		return chat;
	}

	/**
	 * Opens a new-session composer as a tab of the window's active chat, in its group, or beside it, which starts its session
	 * in the folder of the options (see {@link _getFolderTarget}), or else as the active chat's (see
	 * {@link getChatWindowComposerTarget}), and whose sessions join the custom group of the sessions list the active chat's
	 * session is in, or that the sessions of the active composer join. Without a folder, while the active chat is a composer that has not sent its session, it shows that one
	 * instead; with a folder, it replaces that composer when closing it loses nothing, before and once the new one shows. The
	 * composer's chat becomes its session's main chat once it sends it in the foreground.
	 */
	async openNewChat(window: IChatWindow, options?: IChatWindowNewChatOptions): Promise<void> {
		const active = this.activeChat.get();
		if (active?.isComposer && !options?.folder) {
			await this._chatWindowService.open(active.chat.get(), { window, preserveFocus: options?.preserveFocus });
			return;
		}
		const replaced = options?.folder && active?.isPristineComposer ? active : undefined;
		const session = active?.session.get();
		const resource = createChatWindowComposerResource();
		const init: IChatWindowComposerInit = {
			target: options?.folder
				? this._getFolderTarget(options.folder)
				: getChatWindowComposerTarget(this._sessionsManagementService, this._sessionsProvidersService, session, active?.shownChat.get()),
			groupId: active?.isComposer ? active.composerGroupId : session && this._sessionGroupsService.getGroupOfSession(session.sessionId),
		};
		this._pendingComposers.set(resource.toString(), this._composers.create(resource, init, this._openStartedSession(resource)));
		try {
			const reference = active?.chat.get();
			await this._chatWindowService.open(resource, { window, preserveFocus: options?.preserveFocus, ...(options?.beside ? { beside: reference } : { tabOf: reference }) });
		} finally {
			// Not taken by a chat, such as when the window went away meanwhile
			this._pendingComposers.deleteAndDispose(resource.toString());
		}
		if (replaced?.isPristineComposer && this.showsChat(resource)) {
			await this.closeChat(replaced.chat.get());
		}
	}

	/**
	 * What a composer opened for `folder` starts its session with: the folder, and the provider that resolved it with that
	 * provider's first session type for the folder, as a new session in a folder of a provider starts in the main window.
	 */
	private _getFolderTarget(folder: IChatWindowNewChatFolder): INewSessionTarget {
		const sessionTypeId = folder.providerId === undefined ? undefined : this._sessionsManagementService.getSessionTypesForFolder(folder.uri).find(type => type.providerId === folder.providerId)?.sessionType.id;
		return { folderUri: folder.uri, ...(folder.providerId ? { providerId: folder.providerId } : {}), ...(sessionTypeId ? { sessionTypeId } : {}) };
	}

	/** Whether `chat` is one of its new-session composers that has not sent its session. */
	isUnsentComposer(chat: URI): boolean {
		return this._chats.get().some(candidate => candidate.isComposer && isEqual(candidate.chat.get(), chat));
	}

	/**
	 * Whether it shows `chat`, as one of its chats, while the chat's editor is open in a group: not once the editor closed,
	 * such as with its window as the window closes, and the window is still going away.
	 */
	showsChat(chat: URI): boolean {
		return this._chats.get().some(candidate => isEqual(candidate.chat.get(), chat) && this._editorGroupsService.groups.some(group => group.contains(candidate.input, { strictEquals: true })));
	}

	/** Closes the editor of `chat`, one of its chats; resolves whether it closed, not when its close is vetoed. */
	async closeChat(chat: URI): Promise<boolean> {
		const entry = this._chats.get().find(candidate => isEqual(candidate.chat.get(), chat));
		const group = entry && this._editorGroupsService.groups.find(candidate => candidate.contains(entry.input, { strictEquals: true }));
		return !!group && await group.closeEditor(entry.input);
	}

	bind(window: IChatWindow, instantiationService: IInstantiationService): IDisposable {
		const store = new DisposableStore();
		this.window.set(window, undefined);
		store.add(toDisposable(() => this.window.set(undefined, undefined)));

		// The keys of the session it shows on the window's context, as the main window binds those of its own session.
		const contextKeyService = instantiationService.invokeFunction(accessor => accessor.get(IContextKeyService));
		// The window's scope provides its host: what applies in session host scopes shows in it.
		bindSessionHostScopeContext(instantiationService);
		this._windowContextKeyService = contextKeyService;
		store.add(toDisposable(() => this._windowContextKeyService = undefined));
		CustomViewVisibleContext.bindTo(contextKeyService).set(false);
		// Its Changes editor shows the list of the changed files beside the diffs, in whichever of its parts it shows; the
		// main window's does not.
		SessionChangesEditorFileListContext.bindTo(contextKeyService).set(true);
		// Whether it holds a new session that cannot leave it yet, so that moving its chats to the main window is not offered.
		const hasUnsentComposer = ChatWindowHasUnsentComposerContext.bindTo(contextKeyService);
		store.add(autorun(reader => hasUnsentComposer.set(this._chats.read(reader).some(chat => chat.isUnsentComposer.read(reader)))));
		// Those of its changes too, such as the changeset operations its Changes editor shows.
		store.add(bindSessionScopeContextKeys(this._instantiationService, { session: this.host.session, chat: this.host.chat, isMainWindow: false, changes: this._changesViewService.getSessionChanges(this.host.session, this.host.chat) }, contextKeyService));

		// The tab of its last chat offers no close action while other editors are beside it in its group, as that chat
		// closes with its window.
		store.add(this._trackLastChat(window));

		// Its empty groups offer the same Add Tab entries as the main window's.
		const addTabs = store.add(new DisposableMap<IEditorGroupView>());
		const add = (group: IEditorGroupView) => addTabs.set(group, this._instantiationService.createInstance(EmptyEditorGroupAddTab, group, AgentsWindowMenus.SessionsEditorTabsBarAddTab, AgentsWindowMenus.SessionsEmptyEditorGroupAddTab));
		window.mainPart.groups.forEach(group => add(group as IEditorGroupView));
		store.add(window.mainPart.onDidAddGroup(group => add(group as IEditorGroupView)));
		store.add(window.mainPart.onDidRemoveGroup(group => addTabs.deleteAndDispose(group as IEditorGroupView)));
		return store;
	}

	private _trackLastChat(window: IChatWindow): IDisposable {
		const store = new DisposableStore();
		const update = () => {
			const chats = this._chats.get();
			for (const chat of chats) {
				const group = chats.length === 1 ? this._editorGroupsService.groups.find(candidate => candidate.windowId === window.windowId && candidate.contains(chat.input, { strictEquals: true })) : undefined;
				chat.input.setCannotClose(!!group && group.count > 1);
			}
		};
		const groups = store.add(new DisposableMap<IEditorGroup>());
		const add = (group: IEditorGroup) => {
			if (group.windowId === window.windowId) {
				groups.set(group, group.onDidModelChange(e => {
					if (e.kind === GroupModelChangeKind.EDITOR_OPEN || e.kind === GroupModelChangeKind.EDITOR_CLOSE) {
						update();
					}
				}));
			}
		};
		this._editorGroupsService.groups.forEach(add);
		store.add(this._editorGroupsService.onDidAddGroup(add));
		store.add(this._editorGroupsService.onDidRemoveGroup(group => { groups.deleteAndDispose(group); update(); }));
		store.add(autorun(reader => { this._chats.read(reader); update(); }));
		store.add(toDisposable(() => this._chats.get().forEach(chat => chat.input.setCannotClose(false))));
		return store;
	}
}

/** The chat a chat window opened for a session shows: the one the session shows in the grid, else its main chat. */
function shownChatOfSession(sessionsService: ISessionsService, session: ISession): URI {
	// The session's own slot, not a detached pane of one of its chats.
	const shown = sessionsService.slotPanes.get().find(pane => pane.session.get()?.sessionId === session.sessionId);
	return shown?.chat.get()?.resource ?? session.mainChat.get().resource;
}

/**
 * Shows the chats of the Agents window in chat windows: a chat beside the window's main part, with the title bar of the
 * Agents window as the window's top row, its Session Activity Bar, and the look of the main window.
 */
export class SessionsChatWindowProvider extends Disposable implements IChatWindowProvider {

	private readonly _contents = observableValue<readonly SessionsChatWindowContent[]>(this, []);
	/** The composers of its windows, and their background sends, which outlive them. */
	private readonly _composers: ChatWindowComposers;
	/** What the chats its windows restore resolved as, when another chat, until the restoration finished. */
	private readonly _restoredAs = new Map<string, URI>();
	private _restoreFinished = false;

	readonly restoreEnabled: IObservable<boolean>;
	readonly onDidRemoveChats: Event<readonly URI[]>;
	readonly look: IChatWindowLook;
	readonly chrome: IChatWindowChrome;
	private readonly _compact: IObservable<boolean>;
	/** The size chosen for the Session Activity Bar, which it shows at in the strip, as in the main window's column. */
	private readonly _stripSize: IObservable<MenuActivityBarSize>;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@ISessionEditorWorkingSetService private readonly _editorWorkingSetService: ISessionEditorWorkingSetService,
		@ITitleService private readonly _titleService: ITitleService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IChatWindowService private readonly _chatWindowService: IChatWindowService,
		@IChatHostOpenerService chatHostOpenerService: IChatHostOpenerService,
		@ISessionHostService private readonly _sessionHostService: ISessionHostService,
		@IStorageService storageService: IStorageService,
		@ISizeService sizeService: ISizeService,
		@IThemeService themeService: IThemeService,
	) {
		super();
		this._composers = this._register(_instantiationService.createInstance(ChatWindowComposers, resource => this._waitForChat(resource).then(resolved => resolved?.session)));
		// A stored composer restored once the chat it restored as shows in an open window, not before: opening it can fail.
		this._register(autorun(reader => {
			for (const window of this._chatWindowService.windows.read(reader)) {
				this._composers.didOpen(window.openedChats.read(reader));
			}
		}));

		// Opening a chat that a chat window shows reveals it there, and a chat opened beside one it shows opens beside it.
		this._register(chatHostOpenerService.register({
			showsChat: chat => this._contents.get().some(content => content.showsChat(chat)),
			reveal: async (chat, options) => { await this._chatWindowService.open(chat, { preserveFocus: options?.preserveFocus }); },
			openBeside: async (chat, reference, options) => {
				const window = this._chatWindowService.windows.get().find(candidate => candidate.chats.get().some(shown => isEqual(shown, reference)));
				await this._chatWindowService.open(chat, { window, beside: reference, preserveFocus: options?.preserveFocus });
			},
			close: async chat => {
				const content = this._contents.get().find(candidate => candidate.showsChat(chat));
				if (!content) {
					return undefined;
				}
				// The window it closed from, which only what closed it holds on to, to show it there again
				const window = content.window.get();
				if (!await content.closeChat(chat)) {
					return undefined;
				}
				return { restore: async () => { await this._chatWindowService.open(chat, { window, preserveFocus: true }); } };
			},
		}));

		const enabled = observableConfigValue<boolean>(CHAT_WINDOWS_ENABLED_SETTING, false, _configurationService);
		this.restoreEnabled = derived(this, reader => enabled.read(reader) && !chatEntitlementService.sentimentObs.read(reader).hidden);
		this.onDidRemoveChats = Event.filter(Event.map(_sessionsManagementService.onDidChangeSessions, e => e.removed.flatMap(session => [session.resource, ...session.chats.get().map(chat => chat.resource)])), chats => chats.length > 0);

		const density = observableConfigValue<ModernUIDensity>(LayoutSettings.MODERN_UI_DENSITY, ModernUIDensity.Default, _configurationService);
		const showTabs = observableConfigValue<string | undefined>('workbench.editor.showTabs', undefined, _configurationService);
		this._compact = derived(this, reader => density.read(reader) === ModernUIDensity.Compact);
		this._stripSize = observeSessionActivityBarSize(this, storageService, this._register(new DisposableStore()));
		const spacing = observableFromEvent(this, Event.any(sizeService.onDidChangeSizes, themeService.onDidColorThemeChange),
			() => sizeService.getSize(agentsPanelsSpacing, themeService.getColorTheme())!.value);
		this.look = {
			// The parts are cards, as the main window's are, unless Layout Density is compact, which keeps them flush.
			gap: derived(reader => this._compact.read(reader) ? 0 : spacing.read(reader)),
			// The cards keep the gap to the edges of the window as the main window's do; the title row spans the window at the top.
			outerInsets: derived(reader => {
				const gap = density.read(reader) === ModernUIDensity.Compact ? 0 : AGENTS_FLOATING_PANEL_GAP;
				return { top: 0, right: gap, bottom: gap, left: gap };
			}),
			className: AGENTS_CHAT_WINDOW_CLASS,
			paintChatBackground: element => this._instantiationService.createInstance(SessionsChatSurface, element),
			mainPartOptions: derived(reader => getChatWindowMainPartOptions(showTabs.read(reader))),
			mainPartGroupViewOptions: CHAT_WINDOW_MAIN_PART_GROUP_VIEW_OPTIONS,
		};
		this.chrome = {
			createTitleRow: (window, container, instantiationService) => this._createTitleRow(window, container, instantiationService),
			createStrip: (_window, container) => this._createStrip(container),
		};

	}

	async resolveContent(resource: URI): Promise<SessionsChatWindowContent | undefined> {
		if (isChatWindowComposerResource(resource) ? !this._composers.hasStored(resource) : !resolveSessionChat(this._sessionsManagementService, resource)) {
			return undefined;
		}
		const content = this._instantiationService.createInstance(SessionsChatWindowContent, this._composers, (original: URI, canonical: URI) => {
			if (!this._restoreFinished) {
				this._restoredAs.set(original.toString(), canonical);
			}
		});
		this._contents.set([...this._contents.get(), content], undefined);
		Event.once(content.onWillDispose)(() => this._contents.set(this._contents.get().filter(candidate => candidate !== content), undefined));
		return content;
	}

	async moveToMainWindow(chats: readonly URI[], editors: IChatWindowEditors): Promise<void> {
		const moved = chats.map(chat => resolveSessionChat(this._sessionsManagementService, chat)).filter(resolved => !!resolved)
			.map(resolved => ({ session: resolved.session, chatResource: resolved.chat ?? resolved.session.mainChat.get().resource }));
		const first = moved[0];
		if (!first) {
			return;
		}
		await this._sessionsService.openMovedChats(moved);
		const inputs = editors.editors ?? [];
		if (!inputs.length) {
			return;
		}
		// Once the main window is laid out for the session of its active chat, if it is: laying it out restores the
		// session's last editors, which would replace these.
		if (getMainWindowHost(this._sessionHostService).session.get()?.sessionId === first.session.sessionId) {
			await timeout(0);
			await waitForState(this._editorWorkingSetService.restoreState, restoreState => !restoreState.restoring);
		}
		const active = editors.activeEditor ?? inputs.at(-1);
		this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
		await this._editorService.openEditors(inputs.map(editor => ({ editor, options: { pinned: true, preserveFocus: true, inactive: editor !== active } })), this._editorGroupsService.mainPart.activeGroup);
	}

	moveVeto(chats: readonly URI[]): string | undefined {
		const unsent = this._contents.get().some(content => chats.some(chat => content.isUnsentComposer(chat)));
		return unsent ? getUnsentComposerMoveReason() : undefined;
	}

	didFinishRestore(claimed: readonly URI[]): void {
		this._composers.didFinishRestore(claimed);
		// The restoration knows what its stored chats opened as from now on: nothing else needs it.
		this._restoreFinished = true;
		this._restoredAs.clear();
	}

	canonicalChatOf(original: URI): URI | undefined {
		// What it resolved as, while restoring
		const resolved = this._restoredAs.get(original.toString());
		if (resolved) {
			return resolved;
		}
		// What it would resolve as now, from what is known: a stored composer as the session its send started, once that is
		// known and created, a session as its main chat, a chat by a previous identity of its session as its current resource.
		if (isChatWindowComposerResource(original)) {
			const sent = this._composers.storedAttemptSessionOf(original);
			const session = sent && this._sessionsManagementService.getSession(sent);
			return session && isSessionCreated(session) ? session.mainChat.get().resource : undefined;
		}
		const known = resolveSessionChat(this._sessionsManagementService, original);
		if (!known) {
			return undefined;
		}
		if (!known.chat) {
			return known.session.mainChat.get().resource;
		}
		return isEqual(known.chat, original) ? undefined : known.chat;
	}

	/** Opens a new-session composer in `window`, as {@link SessionsChatWindowContent.openNewChat} does. */
	async openNewChat(window: IChatWindow, options?: IChatWindowNewChatOptions): Promise<void> {
		const content = this._contents.get().find(candidate => candidate.window.get() === window);
		await content?.openNewChat(window, options);
	}

	async canRestore(resource: URI): Promise<boolean> {
		// After the main window restored the sessions it shows, and their editors, so that these are not shown there again.
		await waitForState(this._sessionsService.initialRestoreComplete);
		if (isChatWindowComposerResource(resource)) {
			return this._composers.hasStored(resource);
		}
		const resolved = await this._waitForChat(resource);
		if (!resolved) {
			return false;
		}
		if (!resolved.chat) {
			return true;
		}
		const session = resolved.session;
		await waitForState(derived(reader => !session.loading.read(reader)));
		return !isChatWindowChatGone(session, resolved.chat, undefined);
	}

	private _waitForChat(resource: URI): Promise<IResolvedSessionChat | undefined> {
		return waitForSessionChat(this._sessionsManagementService, resource);
	}

	/**
	 * The title row of the window: the title bar of the Agents window, as the main window has it, across the top of the
	 * window in every layout, with its command center, its actions and the window controls. It acts on the window's active
	 * chat and its session, through the window's services.
	 */
	private _createTitleRow(window: IChatWindow, container: HTMLElement, instantiationService: IInstantiationService): IChatWindowChromeElement {
		const titlebar = this._titleService.createAuxiliaryTitlebarPart(container, window.mainPart, instantiationService);
		return {
			visible: constObservable(true),
			size: observableFromEvent(this, titlebar.onDidChange, () => titlebar.height),
			layout: (width, height) => titlebar.layout(width, height, 0, 0),
			dispose: () => titlebar.dispose(),
		};
	}

	/**
	 * The strip: the column the Session Activity Bar of the chat shows in, at the right of the window in every layout, as
	 * the main window's column is, at the size chosen for it as in that column. Not with the classes of the main window's column, whose rules
	 * follow the state of the main window, which the workbench element of a chat window mirrors the classes of.
	 */
	private _createStrip(container: HTMLElement): IChatWindowChromeElement {
		container.classList.add('session-activity-bar-host');
		const editorTabStyle = observableConfigValue<ModernUIEditorTabStyle>(LayoutSettings.MODERN_UI_EDITOR_TAB_STYLE, ModernUIEditorTabStyle.Connected, this._configurationService);
		const registration = registerSessionActivityBarExternalHost(container.ownerDocument.body, {
			element: container,
			active: constObservable(true),
			fullSize: true,
			setOccupied: () => { },
		});
		return {
			visible: observableConfigValue<boolean>(SESSION_ACTIVITY_BAR_SETTING, true, this._configurationService),
			// Right beside the cards, the gap to them in the column, as in the main window's column; see the grid.
			size: derived(reader => getChatWindowStripWidth(this._compact.read(reader), this._stripSize.read(reader), this.look.gap.read(reader), editorTabStyle.read(reader) === ModernUIEditorTabStyle.Connected)),
			layout: () => { },
			dispose: () => registration.dispose(),
		};
	}
}
