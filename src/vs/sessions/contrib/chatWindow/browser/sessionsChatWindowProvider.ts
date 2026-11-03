/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWindow.css';
import { getWindow } from '../../../../base/browser/dom.js';
import { raceTimeout, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ISettableObservable, observableFromEvent, observableValue, waitForState } from '../../../../base/common/observable.js';
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
import { ViewEditorInput } from '../../../../workbench/browser/parts/editor/viewEditorInput.js';
import { IEditorPartOptions } from '../../../../workbench/common/editor.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatWindow, IChatWindowChrome, IChatWindowChromeElement, IChatWindowContent, IChatWindowEditors, IChatWindowLook, IChatWindowProvider } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ChatWindowColumnPlacement, ChatWindowLayoutMode, ChatWindowTerminalPosition, computeChatWindowLayout } from '../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService, LayoutSettings, ModernUIDensity, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ITitleService } from '../../../../workbench/services/title/browser/titleService.js';
import { Menus } from '../../../browser/menus.js';
import { EmptyEditorGroupAddTab } from '../../../browser/parts/emptyEditorGroupAddTab.js';
import { registerSessionActivityBarExternalHost, SESSION_ACTIVITY_BAR_COLUMN_WIDTH } from '../../../browser/parts/sessionActivityBar.js';
import { SessionView } from '../../../browser/parts/sessionView.js';
import { TitlebarPart } from '../../../browser/parts/titlebarPart.js';
import { CustomViewVisibleContext } from '../../../common/contextkeys.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../common/layoutConstants.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../../common/sessionConfig.js';
import { SessionsChatSurface } from '../../../services/chatBackground/browser/sessionsChatSurface.js';
import { ISessionScope } from '../../../services/sessions/browser/sessionScope.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { bindSessionScopeContextKeys } from '../../changes/browser/sessionActionsHost.js';
import { IChangesViewService } from '../../changes/common/changesViewService.js';
import { ISessionEditorWorkingSetService } from '../../layout/common/sessionEditorWorkingSet.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../common/chatWindows.js';
import { ChatModelHold, chatWindowTitle, closeChatWindowsOfGoneChats, followReplacedWindowSessions, IGoneChatWindow, IReplaceableChatWindow, isChatWindowChatGone } from './chatWindowOpening.js';
import { ISessionChatViewHeaderHost, ISessionChatViewHost, ISessionChatViewTitle, registerSessionChatViewHost, SESSION_CHAT_VIEW_TYPE } from './sessionChatViewEditor.js';
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
 * What a chat window shows of a session: one of its chats, as a session of its own window (`showSessionInWindow`), once
 * the window exists; the window acts on that session ({@link ISessionScope}) and binds its keys.
 */
class SessionsChatWindowContent extends Disposable implements IChatWindowContent, ISessionChatViewHost, IReplaceableChatWindow, IGoneChatWindow {

	readonly chat: ISettableObservable<URI>;
	readonly input: ViewEditorInput;
	readonly title: IObservable<string>;
	readonly services: ServiceCollection;

	private readonly _onDidEnd = this._register(new Emitter<void>());
	readonly onDidEnd = this._onDidEnd.event;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	private readonly _session = observableValue<IActiveSession | undefined>(this, undefined);
	readonly session: IObservable<IActiveSession | undefined> = this._session;
	readonly window = observableValue<IChatWindow | undefined>(this, undefined);
	/** Where the session header shows in the title row of the window, once it has one. */
	readonly windowHeader = observableValue<ISessionChatViewHeaderHost | undefined>(this, undefined);
	/** Where the session header shows in the view's own title row, once it has one. */
	private readonly _viewHeader = observableValue<ISessionChatViewHeaderHost | undefined>(this, undefined);
	private readonly _view = observableValue<SessionView | undefined>(this, undefined);
	/**
	 * Whether the view shows its own title row, at the top of the chat's card: with a single chat, side by side and in chat
	 * only, as the session view shows its header then. Otherwise, such as with the chats of the session as tabs, which
	 * replace the header, the title row of the window shows, across the window, as the main window's title bar does.
	 */
	readonly showsTitle: IObservable<boolean> = derived(this, reader => {
		const mode = this.window.read(reader)?.layoutMode.read(reader);
		return !!this._viewHeader.read(reader)
			&& (mode === ChatWindowLayoutMode.SideBySide || mode === ChatWindowLayoutMode.ChatOnly)
			&& (this._view.read(reader)?.headerShown.read(reader) ?? true);
	});
	/** The title row the session header shows in: the one that shows. */
	readonly header: IObservable<ISessionChatViewHeaderHost | undefined> = derived(this, reader => this.showsTitle.read(reader) ? this._viewHeader.read(reader) : this.windowHeader.read(reader));
	private readonly _heldChat: ChatModelHold;

	constructor(
		readonly sourceSession: ISession,
		chatResource: URI,
		private readonly _titleFactory: ChatWindowTitleFactory,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsPartService private readonly _sessionsPartService: ISessionsPartService,
		@IChangesViewService private readonly _changesViewService: IChangesViewService,
		@IHostService private readonly _hostService: IHostService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatService chatService: IChatService,
	) {
		super();
		this.chat = observableValue<URI>(this, chatResource);
		this.input = this._register(new ViewEditorInput(SESSION_CHAT_VIEW_TYPE, chatResource));
		this._register(registerSessionChatViewHost(this.input, this));
		this.title = derived(this, reader => chatWindowTitle(this._session.read(reader) ?? sourceSession, this.chat.read(reader), reader));
		// What the window shows acts on its session, not on the one the main window shows.
		const sessionScope: ISessionScope = { _serviceBrand: undefined, session: this._session };
		this.services = new ServiceCollection([ISessionScope, sessionScope]);
		this._heldChat = this._register(new ChatModelHold(resource => chatService.acquireExistingSession(resource, 'ChatWindow#move')));
		this._register(toDisposable(() => this._releaseSession()));
	}

	bind(window: IChatWindow, instantiationService: IInstantiationService): IDisposable {
		const store = new DisposableStore();
		this.window.set(window, undefined);
		store.add(toDisposable(() => this.window.set(undefined, undefined)));

		// The loaded model of the chat bridges its move from the main window's grid, which lets go of it as the session
		// leaves the grid for the window.
		const chat = this.chat.get();
		this._heldChat.hold(this.sourceSession.chats.get().some(candidate => isEqual(candidate.resource, chat)) ? chat : undefined, this._boundCheck());
		const windowSession = this._sessionsService.showSessionInWindow(this.sourceSession, { chatResource: chat });
		this.setSession(windowSession);
		// Closing the window stops showing its session there at once, such as before the chat shows in the main window again.
		store.add(window.onDidClose(() => this._releaseSession()));

		// The keys of the session it shows on the window's context, as the main window binds those of its own session.
		const contextKeyService = instantiationService.invokeFunction(accessor => accessor.get(IContextKeyService));
		CustomViewVisibleContext.bindTo(contextKeyService).set(false);
		// Those of its changes too, such as the changeset operations its Changes editor shows.
		store.add(bindSessionScopeContextKeys(this._instantiationService, { session: this._session, changes: this._changesViewService.getSessionChanges(this._session) }, contextKeyService));

		// Its empty groups offer the same Add Tab entries as the main window's.
		const addTabs = store.add(new DisposableMap<IEditorGroupView>());
		const add = (group: IEditorGroupView) => addTabs.set(group, this._instantiationService.createInstance(EmptyEditorGroupAddTab, group, Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEmptyEditorGroupAddTab));
		window.mainPart.groups.forEach(group => add(group as IEditorGroupView));
		store.add(window.mainPart.onDidAddGroup(group => add(group as IEditorGroupView)));
		store.add(window.mainPart.onDidRemoveGroup(group => addTabs.deleteAndDispose(group as IEditorGroupView)));
		return store;
	}

	didShow(_window: IChatWindow, focused: boolean): void {
		const session = this._session.get();
		if (focused && session) {
			this._sessionsService.setActive(session);
		}
	}

	createTitle(container: HTMLElement, instantiationService: IInstantiationService): ISessionChatViewTitle | undefined {
		const window = this.window.get();
		const title = window && this._titleFactory(window, this, container, instantiationService, true);
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

	attach(view: SessionView): IDisposable {
		const store = new DisposableStore();
		this._view.set(view, undefined);
		store.add(toDisposable(() => this._view.set(undefined, undefined)));
		// The session it shows becomes the active session once its window has focus, and focusing the session focuses
		// the window, and its chat while the chat shows: focusing it while only the main part shows would not show it.
		store.add(this._sessionsPartService.registerWindowSessionView(view, {
			focus: () => {
				const targetWindow = getWindow(view.element);
				focusChatWindowUnlessFocused(targetWindow, () => void this._hostService.focus(targetWindow));
				if (this.window.get()?.layoutMode.get() !== ChatWindowLayoutMode.EditorOnly) {
					view.focus();
				}
			},
		}));
		return store;
	}

	setSession(session: IActiveSession): void {
		this._session.set(session, undefined);
		if (session.scopedChatResource) {
			this.chat.set(session.scopedChatResource, undefined);
		}
	}

	close(): void {
		this._onDidEnd.fire();
	}

	override dispose(): void {
		this._onWillDispose.fire();
		super.dispose();
	}

	/** Whether the chat view of the window has bound to its model: it loaded, or showed that it was loading and is done. */
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

	/** Stops showing its session in a window, which a window of the same chat may still show, such as after a failed opening. */
	private _releaseSession(): void {
		const session = this._session.get();
		if (session && this._sessionsService.windowSessions.get().includes(session)) {
			this._sessionsService.closeSession(session);
		}
	}
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
	) {
		super();

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
			className: 'agents-chat-window',
			paintChatBackground: element => this._instantiationService.createInstance(SessionsChatSurface, element),
			mainPartOptions: derived(reader => getChatWindowMainPartOptions(showTabs.read(reader))),
			mainPartGroupViewOptions: CHAT_WINDOW_MAIN_PART_GROUP_VIEW_OPTIONS,
		};
		this.chrome = {
			createTitleRow: (window, container, instantiationService) => this._createTitleRow(window, container, instantiationService),
			createStrip: (window, container) => this._createStrip(window, container),
		};

		// A chat window shows its session for as long as the session shows in a window, and its chat for as long as the
		// chat exists and is not archived: closing the session, deleting or archiving the chat closes the window.
		this._register(followReplacedWindowSessions(this._contents, this._sessionsService.windowSessions));
		this._register(closeChatWindowsOfGoneChats(this._contents));
	}

	async resolveContent(resource: URI): Promise<IChatWindowContent | undefined> {
		const resolved = resolveChat(this._sessionsManagementService, resource);
		if (!resolved) {
			return undefined;
		}
		const { session } = resolved;
		// The chat the window shows, as `ISessionsService.showSessionInWindow` picks it: the one asked for, else the one the
		// session shows in the grid, else its main chat.
		const shown = this._sessionsService.visibleSessions.get().find(candidate => candidate?.sessionId === session.sessionId && !candidate.scopedChatResource);
		const chat = resolved.chat ?? shown?.activeChat.get().resource ?? session.mainChat.get().resource;
		const content = this._instantiationService.createInstance(SessionsChatWindowContent, session, chat, (window, windowContent, container, instantiationService, overChat) => this._createTitle(window, windowContent, container, instantiationService, overChat));
		this._contents.set([...this._contents.get(), content], undefined);
		Event.once(content.onWillDispose)(() => this._contents.set(this._contents.get().filter(candidate => candidate !== content), undefined));
		return content;
	}

	async moveToMainWindow(chat: URI, editors: IChatWindowEditors): Promise<void> {
		const resolved = resolveChat(this._sessionsManagementService, chat);
		if (!resolved) {
			return;
		}
		const { session } = resolved;
		await (resolved.chat ? this._sessionsService.openChat(session, resolved.chat) : this._sessionsService.openSession(session.resource));
		const inputs = editors.editors ?? [];
		if (!inputs.length) {
			return;
		}
		// Once the main window is laid out for the session: laying it out restores the session's last editors, which would replace these.
		await waitForState(this._sessionsService.mainWindowActiveSession, active => active?.sessionId === session.sessionId);
		await timeout(0);
		await waitForState(this._editorWorkingSetService.restoreState, restoreState => !restoreState.restoring);
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
				store.add(autorun(reader => titlebar.element.classList.toggle('header-chat-column', window.layoutMode.read(reader) === ChatWindowLayoutMode.SideBySide)));
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
