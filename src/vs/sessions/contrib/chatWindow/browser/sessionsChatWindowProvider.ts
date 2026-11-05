/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWindow.css';
import { raceTimeout, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, disposableObservableValue, IObservable, IReader, ISettableObservable, observableFromEvent, observableSignalFromEvent, observableValue, waitForState } from '../../../../base/common/observable.js';
import { isNative } from '../../../../base/common/platform.js';
import { isEqual } from '../../../../base/common/resources.js';
import { DeepPartial } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { hasCustomTitlebar } from '../../../../platform/window/common/window.js';
import { IEditorGroupView, IEditorGroupViewOptions } from '../../../../workbench/browser/parts/editor/editor.js';
import { GroupModelChangeKind, IEditorPartOptions } from '../../../../workbench/common/editor.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatWindow, IChatWindowChat, IChatWindowChrome, IChatWindowChromeElement, IChatWindowContent, IChatWindowEditors, IChatWindowLook, IChatWindowProvider, IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ChatWindowColumnPlacement, ChatWindowLayoutMode, ChatWindowTerminalPosition, computeChatWindowLayout } from '../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService, LayoutSettings, ModernUIDensity, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ITitleService } from '../../../../workbench/services/title/browser/titleService.js';
import { Menus } from '../../../browser/menus.js';
import { EmptyEditorGroupAddTab } from '../../../browser/parts/emptyEditorGroupAddTab.js';
import { registerSessionActivityBarExternalHost, SESSION_ACTIVITY_BAR_COLUMN_WIDTH } from '../../../browser/parts/sessionActivityBar.js';
import { TitlebarPart } from '../../../browser/parts/titlebarPart.js';
import { CustomViewVisibleContext } from '../../../common/contextkeys.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../common/layoutConstants.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../../common/sessionConfig.js';
import { SessionsChatSurface } from '../../../services/chatBackground/browser/sessionsChatSurface.js';
import { ActiveSessionHost, bindSessionHostScopeContext, getMainWindowHost, ISessionHost, ISessionHostService, SessionHostKind } from '../../../services/sessions/browser/sessionHost.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChatHostOpenerService } from '../../../services/sessions/browser/chatHostOpener.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { bindSessionScopeContextKeys } from '../../changes/browser/sessionActionsHost.js';
import { SessionChangesEditorFileListContext } from '../../changes/common/changes.js';
import { IChangesViewService } from '../../changes/common/changesViewService.js';
import { ISessionEditorWorkingSetService } from '../../layout/common/sessionEditorWorkingSet.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../common/chatWindows.js';
import { ChatModelHold, chatWindowTitle, isChatWindowChatGone } from './chatWindowOpening.js';
import { AGENTS_CHAT_WINDOW_CLASS } from './chatWindowTitleDoubleClick.js';
import { ChatEditorInput, ISessionChatViewHeaderHost, ISessionChatViewHost, ISessionChatViewTitle, registerSessionChatViewHost } from '../../chatEditor/browser/chatEditor.js';
import { ChatEditorContent } from '../../chatEditor/browser/chatEditorContent.js';
import { VisibleSession } from '../../../services/sessions/browser/visibleSessions.js';
import { EditorTabsControl } from '../../../../workbench/browser/parts/editor/editorTabsControl.js';

/** How long restoring a chat window waits for its session to load. */
const RESTORE_SESSION_TIMEOUT = 30_000;

/** The width of the frame of the cards of a chat window. */
const CARD_FRAME_WIDTH = 1;

/** A title row of a chat window, and where the session header shows in it. */
interface IChatWindowTitle extends IDisposable {
	readonly element: HTMLElement;
	readonly size: IObservable<number>;
	readonly header: ISessionChatViewHeaderHost | undefined;
	layout(width: number, height: number): void;
}

/** Creates a title row of a chat window; see `SessionsChatWindowProvider._createTitle`. */
type ChatWindowTitleFactory = (window: IChatWindow, content: SessionsChatWindowContent, container: HTMLElement, instantiationService: IInstantiationService, overChat: boolean) => IChatWindowTitle | undefined;

/**
 * The options of the main part of a chat window: its tabs follow `workbench.editor.showTabs`, live, as the main window's
 * editor area does; `none` shows as `single`, so that the part keeps its title with its actions. Double-clicking a tab
 * does not maximize or expand a group: the window arranges its parts.
 */
export function getChatWindowMainPartOptions(showTabs: string | undefined): DeepPartial<IEditorPartOptions> {
	return { doubleClickTabToToggleEditorGroupSizes: 'off', ...(showTabs === 'none' ? { showTabs: 'single' } : undefined) };
}

/** The options of the groups of the main part of a chat window: those of the main window's editor area of the Agents window. */
export const CHAT_WINDOW_MAIN_PART_GROUP_VIEW_OPTIONS: IEditorGroupViewOptions = {
	menuIds: {
		headerPrimary: Menus.SessionsEditorHeaderPrimary,
		headerSecondary: Menus.SessionsEditorHeaderSecondary,
		headerLayout: Menus.SessionsEditorHeaderLayout,
		editorActions: Menus.SessionsEditorTitle,
		tabsBarContext: Menus.SessionsEditorTabsBarContext,
		tabsBarAddTab: Menus.SessionsEditorTabsBarAddTab,
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
 * Centers the header's actions (`actionsHost`, last at the right of the title bar `titlebar`) above the Session Activity
 * Bar's column, at the right of the window below the title bar, as the entries of the column are: by the inset after them.
 */
/** The class of the title of a chat over its column only, whose window controls float at the top right of the window. */
const CHAT_COLUMN_TITLE_CLASS = 'header-chat-column';

/** The room the tab row at the top right of a chat window keeps for the window controls floating above it. */
const WINDOW_CONTROLS_WIDTH_PROPERTY = '--chat-window-controls-right-width';

/**
 * Lets the tab row at the top right of the chat window that `titlebar` is in keep the room of its window controls at the
 * right, `controls`, while they float at the top right of the window over the part beside the chat (Windows, Linux):
 * none while they are in the title row, hidden as in full screen, or at the left, as the traffic lights of macOS are.
 */
export function reserveChatWindowControls(titlebar: HTMLElement, controls: HTMLElement | undefined): void {
	const host = titlebar.closest<HTMLElement>(`.${AGENTS_CHAT_WINDOW_CLASS}`);
	if (!host) {
		return;
	}
	const width = controls && titlebar.classList.contains(CHAT_COLUMN_TITLE_CLASS) ? controls.offsetWidth : 0;
	if (width > 0) {
		host.style.setProperty(WINDOW_CONTROLS_WIDTH_PROPERTY, `${width}px`);
	} else {
		host.style.removeProperty(WINDOW_CONTROLS_WIDTH_PROPERTY);
	}
}

export function alignChatWindowHeaderActions(titlebar: HTMLElement, actionsHost: HTMLElement): void {
	const actions = actionsHost.firstElementChild?.getBoundingClientRect().width ?? 0;
	const inset = actions ? Math.max(0, Math.round((SESSION_ACTIVITY_BAR_COLUMN_WIDTH - actions) / 2)) : undefined;
	if (inset === undefined) {
		titlebar.style.removeProperty('--session-header-actions-inset');
	} else {
		titlebar.style.setProperty('--session-header-actions-inset', `${inset}px`);
	}
}

/** Whether the Session Activity Bar of a chat window shows in a column of its own: while the chat is below the main part or hidden. */
export function isChatWindowStripInColumn(mode: ChatWindowLayoutMode): boolean {
	return computeChatWindowLayout({ mode, terminalPosition: ChatWindowTerminalPosition.FullWidth, terminalsVisible: false, activityBar: true, inputOnly: false }).column !== ChatWindowColumnPlacement.None;
}

/** A session and the chat of it that a resource names: a session names its own; a chat its session. */
interface IResolvedChat {
	readonly session: ISession;
	readonly chat: URI | undefined;
}

function resolveChat(sessionsManagementService: ISessionsManagementService, resource: URI): IResolvedChat | undefined {
	const session = sessionsManagementService.getSession(resource);
	if (session) {
		return { session, chat: undefined };
	}
	for (const candidate of sessionsManagementService.getSessions()) {
		if (candidate.chats.get().some(chat => isEqual(chat.resource, resource))) {
			return { session: candidate, chat: resource };
		}
	}
	return undefined;
}

/**
 * One chat of a chat window: its editor, and the chat's session scoped to the chat, which its editor shows and the window
 * acts on while it is the window's active chat. The session follows the chat, such as when it is replaced or the chat
 * moves to another session; the chat ends, and leaves the window, once it is deleted or archived.
 */
class SessionsChatWindowChat extends Disposable implements IChatWindowChat, ISessionChatViewHost {

	readonly chat: ISettableObservable<URI>;
	readonly input: ChatEditorInput;
	readonly title: IObservable<string>;

	private readonly _onDidEnd = this._register(new Emitter<void>());
	readonly onDidEnd = this._onDidEnd.event;
	private _ended = false;

	private readonly _session = this._register(disposableObservableValue<VisibleSession | undefined>(this, undefined));
	readonly session: IObservable<IActiveSession | undefined> = this._session;
	/** The session the chat was last known in, so that its end is known while the session no longer lists it. */
	private _knownSession: ISession | undefined;
	/** The session and chat {@link session} is scoped to. */
	private _scopedTo: { readonly session: ISession; readonly chat: IChat } | undefined;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;
	/** Keeps the chat out of the main window's grid while the window shows it. */
	private readonly _gridHold = this._register(new MutableDisposable());

	/** The views of its editor, the last of which shows it; see {@link view}. */
	private readonly _attachedViews: ChatEditorContent[] = [];
	private readonly _view = observableValue<ChatEditorContent | undefined>(this, undefined);
	readonly view: IObservable<ChatEditorContent | undefined> = this._view;
	private readonly _heldChat: ChatModelHold;

	readonly window: IObservable<IChatWindow | undefined>;
	readonly header: IObservable<ISessionChatViewHeaderHost | undefined>;
	readonly showsTitle: IObservable<boolean>;
	readonly active: IObservable<boolean>;
	/** Where the session header shows in the title row of its own editor, once it has one. */
	private readonly _viewHeader = observableValue<ISessionChatViewHeaderHost | undefined>(this, undefined);

	constructor(
		private readonly _owner: SessionsChatWindowContent,
		chatResource: URI,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IChatService chatService: IChatService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
	) {
		super();
		this.chat = observableValue<URI>(this, chatResource);
		this.input = this._register(new ChatEditorInput(chatResource));
		this._register(registerSessionChatViewHost(this.input, this));
		this.window = _owner.window;
		// The window's title rows show the header of its active chat only
		const isActive = this.active = derived(this, reader => isEqual(_owner.window.read(reader)?.chat.read(reader), this.chat.read(reader)));
		// Each chat editor has a title row of its own, which shows the header while its chat is the active one
		this.showsTitle = derived(this, reader => isActive.read(reader)
			&& _owner.titleRowsShow.read(reader)
			&& !!this._viewHeader.read(reader)
			&& (this._view.read(reader)?.headerShown.read(reader) ?? true));
		this.header = derived(this, reader => !isActive.read(reader) ? undefined : this.showsTitle.read(reader) ? this._viewHeader.read(reader) : _owner.windowHeader.read(reader));
		this.title = derived(this, reader => {
			const session = this._session.read(reader);
			return session ? chatWindowTitle(session, this.chat.read(reader), reader) : '';
		});
		this._register(autorun(reader => this.input.setName(this.title.read(reader))));

		// The loaded model of the chat bridges its move into the window, from the main window's grid, which lets go of it.
		this._heldChat = this._register(new ChatModelHold(resource => chatService.acquireExistingSession(resource, 'ChatWindow#move')));
		this._heldChat.hold(chatResource, this._boundCheck());

		const sessionsChanged = observableSignalFromEvent(this, _sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			this._update(reader);
		}));
	}

	private _end(): void {
		if (!this._ended) {
			this._ended = true;
			this._onDidEnd.fire();
		}
	}

	private _update(reader: IReader): void {
		if (this._ended) {
			return;
		}
		const chatResource = this.chat.read(reader);
		// The chats of the session it was in, as these change without the sessions changing, such as as one is deleted
		// or replaced; the lookup below is not observable.
		this._knownSession?.chats.read(reader);
		this._knownSession?.loading.read(reader);
		const owner = this._sessionsManagementService.getSessionForChatResource(chatResource);
		if (owner) {
			if (this._knownSession !== owner.session) {
				owner.session.chats.read(reader);
				owner.session.loading.read(reader);
			}
			this._knownSession = owner.session;
			if (owner.chat.isArchived.read(reader)) {
				this._end();
				return;
			}
			if (this._scopedTo?.session !== owner.session || this._scopedTo.chat !== owner.chat) {
				const sessionChanged = this._scopedTo?.session.sessionId !== owner.session.sessionId;
				this._scopedTo = owner;
				this._session.set(new VisibleSession(owner.session, owner.chat, undefined, undefined, owner.chat.resource), undefined);
				if (sessionChanged) {
					this._gridHold.value = this._sessionsService.hideChatFromGrid(owner.session, owner.chat.resource);
				}
			}
			return;
		}
		// Gone once the session it was in has loaded and no longer lists it, such as once it was deleted
		if (this._knownSession && isChatWindowChatGone(this._knownSession, chatResource, reader)) {
			this._end();
		}
	}

	override dispose(): void {
		this._onWillDispose.fire();
		super.dispose();
	}

	attach(view: ChatEditorContent): IDisposable {
		this._attachedViews.push(view);
		this._view.set(view, undefined);
		return toDisposable(() => {
			const index = this._attachedViews.indexOf(view);
			if (index >= 0) {
				this._attachedViews.splice(index, 1);
			}
			this._view.set(this._attachedViews.at(-1), undefined);
		});
	}

	createTitle(container: HTMLElement, instantiationService: IInstantiationService): ISessionChatViewTitle | undefined {
		const title = this._owner.createTitleRow(container, instantiationService);
		if (!title) {
			return undefined;
		}
		const header = title.header;
		this._viewHeader.set(header, undefined);
		return {
			element: title.element,
			size: title.size,
			layout: (width, height) => title.layout(width, height),
			dispose: () => {
				if (this._viewHeader.get() === header) {
					this._viewHeader.set(undefined, undefined);
				}
				title.dispose();
			},
		};
	}

	/** Whether the chat view of its editor has bound to its model: it loaded, or showed that it was loading and is done. */
	private _boundCheck(): () => boolean {
		let loading = false;
		return () => {
			const view = this._view.get()?.primaryChatView.get();
			if (!view) {
				return false;
			}
			if (view.isLoadingTranscript.get()) {
				loading = true;
				return false;
			}
			return loading;
		};
	}
}

/**
 * What a chat window shows: its chats, each an editor of its chat part, and the host of the window, whose chat is its
 * active chat, the chat editor last active in it; the window acts on that chat and its session, and binds its keys.
 */
export class SessionsChatWindowContent extends Disposable implements IChatWindowContent {

	readonly services: ServiceCollection;
	readonly window = observableValue<IChatWindow | undefined>(this, undefined);
	/** Where the session header shows in the title row of the window, once it has one. */
	readonly windowHeader = observableValue<ISessionChatViewHeaderHost | undefined>(this, undefined);
	/** Whether the window lets its active chat show the header in the chat's own title row, as the chat leads it. */
	readonly titleRowsShow: IObservable<boolean>;

	private readonly _chats = observableValue<readonly SessionsChatWindowChat[]>(this, []);
	/** The chat of the window's active chat editor, while it shows; the first chat until then. */
	readonly activeChat: IObservable<SessionsChatWindowChat | undefined>;
	/** The title of the window: that of its active chat. */
	readonly title: IObservable<string>;
	/**
	 * Whether the active chat's view shows its own title row, at the top of the chat's card: with a single chat, side by
	 * side and in chat only, as the view shows its header then, while the chat leads the window, at its top left. Otherwise,
	 * such as with other editors beside it as tabs, or after another part, the title row of the window shows, across it.
	 */
	readonly showsTitle: IObservable<boolean>;
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

	constructor(
		private readonly _titleFactory: ChatWindowTitleFactory,
		@IChangesViewService private readonly _changesViewService: IChangesViewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionHostService sessionHostService: ISessionHostService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
	) {
		super();
		this.activeChat = derived(this, reader => {
			const chats = this._chats.read(reader);
			const active = this.window.read(reader)?.chat.read(reader);
			return (active && chats.find(chat => isEqual(chat.chat.read(reader), active))) ?? chats[0];
		});
		this.title = derived(this, reader => this.activeChat.read(reader)?.title.read(reader) ?? '');
		this.titleRowsShow = derived(this, reader => {
			const window = this.window.read(reader);
			const mode = window?.layoutMode.read(reader);
			return (mode === ChatWindowLayoutMode.SideBySide || mode === ChatWindowLayoutMode.ChatOnly) && !!window?.chatLeads.read(reader);
		});
		this.showsTitle = derived(this, reader => this.activeChat.read(reader)?.showsTitle.read(reader) ?? false);
		// What the window shows acts on its active chat and its session, not on what the main window shows.
		const session = derived(this, reader => this.activeChat.read(reader)?.session.read(reader));
		this.host = new ActiveSessionHost({
			kind: SessionHostKind.ChatWindow,
			parent: undefined,
			session,
			loadingChat: derived(this, reader => this.activeChat.read(reader)?.chat.read(reader)),
			windowId: derived(this, reader => this.window.read(reader)?.windowId),
			contextKeyService: () => this._windowContextKeyService ?? contextKeyService,
		});
		this._register(sessionHostService.registerHost(this.host));
		this.services = new ServiceCollection([ISessionHost, this.host]);
		this._register(toDisposable(() => this._chats.get().forEach(chat => chat.dispose())));
	}

	async resolveChat(resource: URI): Promise<IChatWindowChat | undefined> {
		const resolved = resolveChat(this._sessionsManagementService, resource);
		if (!resolved) {
			return undefined;
		}
		const chatResource = resolved.chat ?? shownChatOfSession(this._sessionsService, resolved.session);
		const existing = this._chats.get().find(candidate => isEqual(candidate.chat.get(), chatResource));
		if (existing) {
			return existing;
		}
		const chat = this._instantiationService.createInstance(SessionsChatWindowChat, this, chatResource);
		this._chats.set([...this._chats.get(), chat], undefined);
		// The window owns it while it shows it, and disposes it as it leaves
		Event.once(chat.onWillDispose)(() => this._chats.set(this._chats.get().filter(candidate => candidate !== chat), undefined));
		return chat;
	}

	/** Whether it shows `chat`, as one of its chats. */
	showsChat(chat: URI): boolean {
		return this._chats.get().some(candidate => isEqual(candidate.chat.get(), chat));
	}

	/** Closes the editor of `chat`, one of its chats. */
	async closeChat(chat: URI): Promise<void> {
		const entry = this._chats.get().find(candidate => isEqual(candidate.chat.get(), chat));
		const group = entry && this._editorGroupsService.groups.find(candidate => candidate.contains(entry.input, { strictEquals: true }));
		await group?.closeEditor(entry!.input);
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
		// Those of its changes too, such as the changeset operations its Changes editor shows.
		store.add(bindSessionScopeContextKeys(this._instantiationService, { session: this.host.session, chat: this.host.chat, isMainWindow: false, changes: this._changesViewService.getSessionChanges(this.host.session, this.host.chat) }, contextKeyService));

		// The tab of its last chat offers no close action while other editors are beside it in its group, as that chat
		// closes with its window.
		store.add(this._trackLastChat(window));

		// Its empty groups offer the same Add Tab entries as the main window's.
		const addTabs = store.add(new DisposableMap<IEditorGroupView>());
		const add = (group: IEditorGroupView) => addTabs.set(group, this._instantiationService.createInstance(EmptyEditorGroupAddTab, group, Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEmptyEditorGroupAddTab));
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

	/** Creates a title row over a chat, in its editor. */
	createTitleRow(container: HTMLElement, instantiationService: IInstantiationService) {
		const window = this.window.get();
		return window && this._titleFactory(window, this, container, instantiationService, true);
	}
}

/** The chat a chat window opened for a session shows: the one the session shows in the grid, else its main chat. */
function shownChatOfSession(sessionsService: ISessionsService, session: ISession): URI {
	// The session's own slot: the grid's visible sessions do not include detached panes.
	const shown = sessionsService.visibleSessions.get().find(candidate => candidate?.sessionId === session.sessionId);
	return shown?.activeChat.get().resource ?? session.mainChat.get().resource;
}

/**
 * Shows the chats of the Agents window in chat windows: a chat beside the window's main part, with its session's header
 * as the window's top row, its Session Activity Bar, and the look of the main window.
 */
export class SessionsChatWindowProvider extends Disposable implements IChatWindowProvider {

	private readonly _contents = observableValue<readonly SessionsChatWindowContent[]>(this, []);

	readonly restoreEnabled: IObservable<boolean>;
	readonly onDidRemoveChats: Event<readonly URI[]>;
	readonly look: IChatWindowLook;
	readonly chrome: IChatWindowChrome;
	/** The height of the title rows of chat windows. */
	private readonly _titleHeight: IObservable<number>;

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
	) {
		super();

		// Opening a chat that a chat window shows reveals it there, and a chat opened beside one it shows opens beside it.
		this._register(chatHostOpenerService.register({
			showsChat: chat => this._contents.get().some(content => content.showsChat(chat)),
			reveal: async (chat, options) => { await this._chatWindowService.open(chat, { preserveFocus: options?.preserveFocus }); },
			openBeside: async (chat, reference, options) => {
				const window = this._chatWindowService.windows.get().find(candidate => candidate.chats.get().some(shown => isEqual(shown, reference)));
				await this._chatWindowService.open(chat, { window, beside: reference, preserveFocus: options?.preserveFocus });
			},
			close: async chat => { await this._contents.get().find(content => content.showsChat(chat))?.closeChat(chat); },
		}));

		const enabled = observableConfigValue<boolean>(CHAT_WINDOWS_ENABLED_SETTING, false, _configurationService);
		this.restoreEnabled = derived(this, reader => enabled.read(reader) && !chatEntitlementService.sentimentObs.read(reader).hidden);
		this.onDidRemoveChats = Event.filter(Event.map(_sessionsManagementService.onDidChangeSessions, e => e.removed.flatMap(session => [session.resource, ...session.chats.get().map(chat => chat.resource)])), chats => chats.length > 0);

		const density = observableConfigValue<ModernUIDensity>(LayoutSettings.MODERN_UI_DENSITY, ModernUIDensity.Default, _configurationService);
		const showTabs = observableConfigValue<string | undefined>('workbench.editor.showTabs', undefined, _configurationService);
		const tabHeight = observableConfigValue<string | undefined>('workbench.editor.tabHeight', undefined, _configurationService);
		this._titleHeight = derived(this, reader => getChatWindowTitleHeight(tabHeight.read(reader) === 'compact', density.read(reader) !== ModernUIDensity.Compact));
		this.look = {
			// The parts are cards, as the main window's are, unless Layout Density is compact, which keeps them flush.
			gap: derived(reader => density.read(reader) === ModernUIDensity.Compact ? 0 : AGENTS_FLOATING_PANEL_GAP),
			// The cards keep the gap to the edges of the window as the main window's do; the title row is at the top.
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
			createStrip: (window, container) => this._createStrip(window, container),
		};

	}

	async resolveContent(resource: URI): Promise<SessionsChatWindowContent | undefined> {
		if (!resolveChat(this._sessionsManagementService, resource)) {
			return undefined;
		}
		const content = this._instantiationService.createInstance(SessionsChatWindowContent, (window, windowContent, container, instantiationService, overChat) => this._createTitle(window, windowContent, container, instantiationService, overChat));
		this._contents.set([...this._contents.get(), content], undefined);
		Event.once(content.onWillDispose)(() => this._contents.set(this._contents.get().filter(candidate => candidate !== content), undefined));
		return content;
	}

	async moveToMainWindow(chats: readonly URI[], editors: IChatWindowEditors): Promise<void> {
		const moved = chats.map(chat => resolveChat(this._sessionsManagementService, chat)).filter(resolved => !!resolved)
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

	async canRestore(resource: URI): Promise<boolean> {
		// After the main window restored the sessions it shows, and their editors, so that these are not shown there again.
		await waitForState(this._sessionsService.initialRestoreComplete);
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

	private async _waitForChat(resource: URI): Promise<IResolvedChat | undefined> {
		const resolved = resolveChat(this._sessionsManagementService, resource);
		if (resolved) {
			return resolved;
		}
		const store = new DisposableStore();
		try {
			return await raceTimeout(new Promise<IResolvedChat | undefined>(resolve => {
				store.add(this._sessionsManagementService.onDidChangeSessions(() => {
					const loaded = resolveChat(this._sessionsManagementService, resource);
					if (loaded) {
						resolve(loaded);
					}
				}));
			}), RESTORE_SESSION_TIMEOUT);
		} finally {
			store.dispose();
		}
	}

	private _contentOf(window: IChatWindow): SessionsChatWindowContent | undefined {
		return this._contents.get().find(content => content.window.get() === window);
	}

	/**
	 * The title row of the window: across its top, while the view does not show its own (see
	 * {@link SessionsChatWindowContent.showsTitle}). Only with a custom title bar.
	 */
	private _createTitleRow(window: IChatWindow, container: HTMLElement, instantiationService: IInstantiationService): IChatWindowChromeElement | undefined {
		const content = this._contentOf(window);
		const title = content && this._createTitle(window, content, container, instantiationService, false);
		if (!content || !title) {
			return undefined;
		}
		content.windowHeader.set(title.header, undefined);
		return {
			visible: derived(reader => !content.showsTitle.read(reader)),
			size: title.size,
			layout: (width, height) => title.layout(width, height),
			dispose: () => {
				if (content.windowHeader.get() === title.header) {
					content.windowHeader.set(undefined, undefined);
				}
				title.dispose();
			},
		};
	}

	/**
	 * A title row of a chat window: the title bar, as other windows of the Agents window have one, which shows the session
	 * header in place of the title of the chat. The title row of the window, or, `overChat`, the view's own, over the chat
	 * only: the window controls at the right then stay at the top right of the window while the main part is beside it.
	 * As tall as the row of tabs of the main part, from the first frame, in every layout. Only with a custom title bar.
	 */
	private _createTitle(window: IChatWindow, content: SessionsChatWindowContent, container: HTMLElement, instantiationService: IInstantiationService, overChat: boolean): IChatWindowTitle | undefined {
		if (!isNative || !hasCustomTitlebar(this._configurationService)) {
			return undefined;
		}
		const store = new DisposableStore();
		const titlebar = store.add(this._titleService.createAuxiliaryTitlebarPart(container, window.mainPart, instantiationService));
		const size = observableFromEvent(this, titlebar.onDidChange, () => titlebar.height);
		let header: ISessionChatViewHeaderHost | undefined;
		if (titlebar instanceof TitlebarPart) {
			store.add(autorun(reader => titlebar.setHeight(this._titleHeight.read(reader))));
			store.add(autorun(reader => titlebar.setTitle(content.title.read(reader))));
			if (overChat) {
				store.add(autorun(reader => {
					titlebar.element.classList.toggle(CHAT_COLUMN_TITLE_CLASS, window.layoutMode.read(reader) === ChatWindowLayoutMode.SideBySide);
					reserveChatWindowControls(titlebar.element, titlebar.rightWindowControlsContainer);
				}));
				// From the element it is in, which stays in the window as the title bar goes.
				store.add(toDisposable(() => reserveChatWindowControls(container, undefined)));
			}
			header = {
				element: titlebar.getSessionHeaderHost(),
				actionsElement: titlebar.getSessionHeaderActionsHost(),
				setShown: shown => titlebar.setHostsSessionHeader(shown),
			};
		}
		return {
			element: titlebar.element,
			size,
			header,
			layout: (width, height) => {
				// Not while it does not show: laid out without height, it would move the window controls out of the title row that shows.
				if (height <= 0) {
					return;
				}
				if (titlebar instanceof TitlebarPart) {
					alignChatWindowHeaderActions(titlebar.element, titlebar.getSessionHeaderActionsHost());
				}
				titlebar.layout(width, height, 0, 0);
				if (overChat && titlebar instanceof TitlebarPart) {
					reserveChatWindowControls(titlebar.element, titlebar.rightWindowControlsContainer);
				}
			},
			dispose: () => store.dispose(),
		};
	}

	/**
	 * The strip: the column the Session Activity Bar of the chat shows in while the chat is below the main part or hidden;
	 * beside the chat otherwise, as in the main window.
	 */
	private _createStrip(window: IChatWindow, container: HTMLElement): IChatWindowChromeElement {
		const height = observableValue<number>(this, 0);
		const registration = registerSessionActivityBarExternalHost(container.ownerDocument.body, {
			element: container,
			active: derived(reader => isChatWindowStripInColumn(window.layoutMode.read(reader))),
			height,
			setOccupied: () => { },
		});
		return {
			visible: observableConfigValue<boolean>(SESSION_ACTIVITY_BAR_SETTING, true, this._configurationService),
			// Its column, the gap to the parts beside it included, as the grid adds the half of the gap beside its card.
			size: derived(reader => SESSION_ACTIVITY_BAR_COLUMN_WIDTH - Math.floor(this.look.gap.read(reader) / 2)),
			layout: (_width, columnHeight) => height.set(columnHeight, undefined),
			dispose: () => registration.dispose(),
		};
	}
}

/**
 * The height of the title rows of chat windows: that of the row of tabs of an editor part, with `compactTabs` or not,
 * and, with `cards`, the frame of the card the tabs are in, so that a title row lines up with the tabs beside it.
 */
export function getChatWindowTitleHeight(compactTabs: boolean, cards: boolean): number {
	return EditorTabsControl.getModernUITabRowHeight(compactTabs) + (cards ? CARD_FRAME_WIDTH : 0);
}
