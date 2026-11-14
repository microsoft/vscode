/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatViewSessionsPane.css';
import '../../../chat/browser/widgetHosts/viewPane/media/chatViewPane.css';
import { $, append, setVisibility } from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { raceTimeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableFromEvent, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Position } from '../../../../services/layout/browser/layoutService.js';
import { ISessionHost } from '../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { AgentSessionsViewerOrientation, AgentSessionsViewerPosition, IAgentSessionsControl, IChatViewSessionsControl } from '../../../chat/browser/agentSessions/agentSessions.js';
import { ChatViewId, IChatWidget } from '../../../chat/browser/chat.js';
import { ChatViewWelcomeController } from '../../../chat/browser/viewsWelcome/chatViewWelcomeController.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../chat/common/constants.js';
import { ChatWindowLayoutMode } from '../../../chatWindow/common/chatWindowLayout.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ChatEditorView, IChatEditorWindow } from '../chatEditor/chatEditor.js';
import { ChatWindowComposerModel, ChatWindowComposers, createChatWindowComposerResource } from '../chatEditor/chatWindowComposer.js';
import { SessionChatEditorEntry, waitForSessionChat } from '../chatEditor/sessionChatEditorHost.js';
import { INewSessionTarget } from '../parts/chatView.js';
import { ISessionsListModelService } from '../sessionsListModelService.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { SessionsGrouping, SessionsList, SessionsSorting } from '../views/sessionsList.js';
import { getAgentsChatPartComposerTarget, IAgentsChatPartChat, IAgentsChatPartOpenOptions, IAgentsChatPartService } from './agentsChatPart.js';
import { AgentsViewNeedsSetup } from './agentsView.js';
import { EditorWindowMainSessionHost } from './editorWindowMainSessionHost.js';

/** How long a session that a composer started takes to show before it is given up on. */
const SESSION_TIMEOUT = 30_000;

/** How long it waits for the view of a composer to show. */
const COMPOSER_VIEW_TIMEOUT = 5_000;

/** The chat of the Chat view: a session's chat, or a new-session composer until a request it sends starts its session. */
class ChatViewSessionsChat extends SessionChatEditorEntry {

	readonly active = constObservable(true);

	constructor(
		chatResource: URI,
		composer: ChatWindowComposerModel | undefined,
		readonly window: IObservable<IChatEditorWindow | undefined>,
		private readonly _close: (chat: ChatViewSessionsChat) => void,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IChatService chatService: IChatService,
		@ISessionsListModelService sessionsListModelService: ISessionsListModelService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(chatResource, sessionsManagementService, chatService, sessionsListModelService, sessionsProvidersService, configurationService);
		this._register(this.onDidEnd(() => this._close(this)));
		this.start(composer, 'ChatViewSessions#open');
	}

	protected closeShown(): void {
		this._close(this);
	}
}

/**
 * Where the Chat view shows the chats of sessions, in place of the chat part: one chat at a time, a session's chat or a
 * new-session composer, below or beside its sessions. It shows the Chat view as it opens a chat.
 */
export class ChatViewSessionsSurface extends Disposable implements IAgentsChatPartService {

	declare readonly _serviceBrand: undefined;

	private readonly _chat = observableValue<ChatViewSessionsChat | undefined>(this, undefined);
	/** The chat the Chat view shows, once it shows one. */
	readonly chat: IObservable<ChatViewSessionsChat | undefined> = this._chat;

	readonly activeChat: IObservable<IAgentsChatPartChat | undefined> = derived(this, reader => this._chat.read(reader)?.shown.read(reader));

	private _composers: ChatWindowComposers | undefined;
	private readonly _window: IChatEditorWindow;
	private readonly _windowFolders: IObservable<readonly URI[]>;
	private _view: { focus(): void } | undefined;

	constructor(
		@ISessionHost readonly mainWindowHost: ISessionHost,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IViewsService private readonly _viewsService: IViewsService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
	) {
		super();
		this._windowFolders = observableFromEvent(this, _workspaceContextService.onDidChangeWorkspaceFolders, () => _workspaceContextService.getWorkspace().folders.map(folder => folder.uri));
		// The chats show beside the editor area, whose editors their Session Activity Bars read
		this._window = {
			layoutMode: constObservable(ChatWindowLayoutMode.SideBySide),
			inputOnly: constObservable(false),
			resizing: constObservable(false),
			mainPart: editorGroupsService.mainPart,
			toggleConversation: () => { },
		};
		// The window's host, as its service, shows the chat of the Chat view
		if (this.mainWindowHost instanceof EditorWindowMainSessionHost) {
			this._register(this.mainWindowHost.bindShownChat(this.activeChat));
		}
		this._register(toDisposable(() => this._chat.get()?.dispose()));
	}

	private get composers(): ChatWindowComposers {
		if (!this._composers) {
			this._composers = this._register(this._instantiationService.createInstance(ChatWindowComposers, async (resource: URI) => (await waitForSessionChat(this._sessionsManagementService, resource, SESSION_TIMEOUT))?.session));
		}
		return this._composers;
	}

	/** Called with the Chat view as it shows the chat, until the returned disposable is disposed. */
	attachView(view: { focus(): void }): IDisposable {
		this._view = view;
		return toDisposable(() => {
			if (this._view === view) {
				this._view = undefined;
			}
		});
	}

	async openChat(session: ISession, chatResource: URI | undefined, options?: IAgentsChatPartOpenOptions): Promise<void> {
		const resource = chatResource ?? session.mainChat.get().resource;
		if (!this.isShowing(resource)) {
			this._setChat(resource, undefined);
		}
		await this._reveal(options?.preserveFocus);
	}

	async openComposer(target: INewSessionTarget | undefined, options?: IAgentsChatPartOpenOptions): Promise<void> {
		if (!this.hasComposer() || options?.newComposer) {
			this._setComposer(target);
		}
		await this._reveal(options?.preserveFocus);
	}

	/** Goes back from a session's chat to a new-session composer, as Back in the Chat view does. */
	back(): void {
		this._setComposer(this._composerTarget());
		this._view?.focus();
	}

	async closeChat(chatResource: URI): Promise<void> {
		if (this.isShowing(chatResource)) {
			this._setComposer(this._composerTarget());
		}
	}

	isShowing(chatResource: URI): boolean {
		return isEqual(this._chat.get()?.chat.get(), chatResource);
	}

	hasComposer(): boolean {
		return !!this._chat.get()?.isComposer;
	}

	async closeIdleComposers(): Promise<void> {
		// Its composer stays: the Chat view always shows a chat
	}

	focus(): void {
		this._view?.focus();
	}

	async show(target: INewSessionTarget | undefined, options?: { readonly preserveFocus?: boolean }): Promise<void> {
		if (!this._chat.get()) {
			return this.openComposer(target, options);
		}
		await this._reveal(options?.preserveFocus);
	}

	async getComposerWidget(): Promise<IChatWidget | undefined> {
		const chat = this._chat.get();
		if (!chat?.isComposer) {
			return undefined;
		}
		// Its view, and the widget of its input, show once the Chat view renders it
		const widget = derived(reader => chat.view.read(reader)?.composerView.read(reader)?.chatWidget);
		const cts = new CancellationTokenSource();
		try {
			return await raceTimeout(waitForState(widget, widget => !!widget, undefined, cts.token).catch(() => undefined), COMPOSER_VIEW_TIMEOUT, () => cts.cancel());
		} finally {
			cts.dispose();
		}
	}

	async restore(): Promise<void> {
		// The Chat view restores itself
	}

	/** Shows a new-session composer as the Chat view first shows, unless it shows a chat already. */
	ensureChat(): void {
		if (!this._chat.get()) {
			this._setComposer(this._composerTarget());
		}
	}

	private _composerTarget(): INewSessionTarget | undefined {
		return getAgentsChatPartComposerTarget(this._workspaceContextService, this._editorService);
	}

	private _setComposer(target: INewSessionTarget | undefined): void {
		const resource = createChatWindowComposerResource();
		const composer = this.composers.create(resource, { target, allowedFolders: this._windowFolders }, session => this.openChat(session, undefined));
		this._setChat(resource, composer);
	}

	private _setChat(resource: URI, composer: ChatWindowComposerModel | undefined): void {
		const previous = this._chat.get();
		const chat = this._instantiationService.createInstance(ChatViewSessionsChat, resource, composer, constObservable(this._window), (ended: ChatViewSessionsChat) => {
			// A chat that ends, such as as its session is deleted, gives way to a composer
			if (this._chat.get() === ended) {
				this._setComposer(this._composerTarget());
			}
		});
		this._chat.set(chat, undefined);
		this.composers.didOpen([chat.chat.get()]);
		// Once the Chat view let go of its view: what it shows goes with the chat
		if (previous) {
			queueMicrotask(() => previous.dispose());
		}
	}

	private async _reveal(preserveFocus: boolean | undefined): Promise<void> {
		await this._viewsService.openView(ChatViewId, !preserveFocus);
		if (!preserveFocus) {
			this._view?.focus();
		}
	}
}

/** The sessions list of the Chat view, as the actions of its sessions toolbar act on it. */
class ChatViewSessionsListControl implements IAgentSessionsControl {

	constructor(private readonly _list: SessionsList, readonly element: HTMLElement) { }

	refresh(): void { this._list.refresh(); }
	openFind(): void { this._list.openFind(); }
	reveal(sessionResource: URI): boolean { return this._list.reveal(sessionResource); }
	clearFocus(): void { this._list.clearFocus(); }
	hasFocusOrSelection(): boolean { return this._list.hasFocusOrSelection(); }
	resetSectionCollapseState(): void { this._list.resetSectionCollapseState(); }
	collapseAllSections(): void { this._list.collapseAllSections(); }
	/** The agent sessions selected, which actions of the Chat view's own list ask for: none of those here. */
	getSelectedSessions(): readonly never[] { return []; }
}

const SESSIONS_TITLE_HEIGHT = 22;
const BACK_BAR_HEIGHT = 30;
const SESSIONS_SIDEBAR_WIDTH = 300;
const CHAT_MIN_WIDTH = 300;
const CHAT_MIN_HEIGHT = 220;

/**
 * The Chat view of an editor window with the sessions of the Agents window: as the Chat view shows its sessions, a Sessions
 * section with the actions of its sessions toolbar and the sessions list, with the chat below it or beside it.
 */
export class ChatViewSessionsPane extends ViewPane implements IChatViewSessionsControl {

	private _body: HTMLElement | undefined;
	private _sessionsContainer: HTMLElement | undefined;
	private _listContainer: HTMLElement | undefined;
	private _chatContainer: HTMLElement | undefined;
	private _backBar: HTMLElement | undefined;
	private _chatHost: HTMLElement | undefined;
	private _list: SessionsList | undefined;
	private _listControl: ChatViewSessionsListControl | undefined;
	private readonly _chatView = this._register(new MutableDisposable<ChatEditorView>());
	private _sessionsOrientation = AgentSessionsViewerOrientation.Stacked;
	private readonly _lastDimensions = new Map<AgentSessionsViewerOrientation, { height: number; width: number }>();
	private _dimensions: { height: number; width: number } | undefined;
	private readonly _orientationContext: IContextKey<AgentSessionsViewerOrientation>;
	private readonly _positionContext: IContextKey<AgentSessionsViewerPosition>;

	constructor(
		private readonly _surface: ChatViewSessionsSurface,
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		ChatContextKeys.chatViewSessionsListActive.bindTo(this.scopedContextKeyService).set(true);
		this._orientationContext = ChatContextKeys.agentSessionsViewerOrientation.bindTo(this.scopedContextKeyService);
		this._positionContext = ChatContextKeys.agentSessionsViewerPosition.bindTo(this.scopedContextKeyService);

		// It shows how to sign in or set up chat, as the Chat view does, until chat can show sessions
		const welcomeKeys = new Set(AgentsViewNeedsSetup.keys());
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(welcomeKeys)) {
				this._onDidChangeViewWelcomeState.fire();
			}
		}));
		this._register(Event.any(this._chatAgentService.onDidChangeAgents)(() => this._onDidChangeViewWelcomeState.fire()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ChatViewSessionsOrientation)) {
				this._relayout();
			}
		}));
	}

	override shouldShowWelcome(): boolean {
		const hasDefaultAgent = this._chatAgentService.getDefaultAgent(ChatAgentLocation.Chat) !== undefined;
		return !hasDefaultAgent || this.contextKeyService.contextMatchesRules(AgentsViewNeedsSetup);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this._body = container;
		container.classList.add('chat-viewpane', 'has-sessions-control', 'chat-view-sessions-pane');
		this._register(this.instantiationService.createInstance(ChatViewWelcomeController, container, this, ChatAgentLocation.Chat));

		const wrapper = append(container, $('.voice-agent-controls-wrapper'));

		// The Sessions section, as the Chat view shows it
		const sessionsContainer = this._sessionsContainer = append(wrapper, $('.agent-sessions-container'));
		const titleContainer = append(sessionsContainer, $('.agent-sessions-title-container'));
		const title = append(titleContainer, $('span.agent-sessions-title'));
		title.textContent = localize('chatViewSessions.sessions', "Sessions");
		this._register(Event.fromDOMEventEmitter(title, 'click')(() => this._list?.focus()));
		const toolbarContainer = append(titleContainer, $('.agent-sessions-toolbar'));
		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, MenuId.AgentSessionsToolbar, {
			menuOptions: { shouldForwardArgs: true },
			telemetrySource: 'chatViewSessionsToolbar',
		}));
		const findWidgetContainer = append(sessionsContainer, $('.agent-sessions-find-widget-container'));
		const listContainer = this._listContainer = append(sessionsContainer, $('.agent-sessions-control-container'));
		const scoped = observableFromEvent(this, this._workspaceContextService.onDidChangeWorkspaceFolders, () => this._workspaceContextService.getWorkspace().folders.length > 0);
		const list = this._list = this._register(this.instantiationService.createInstance(SessionsList, listContainer, {
			grouping: () => SessionsGrouping.Date,
			sorting: () => SessionsSorting.Updated,
			overrideStyles: this.getLocationBasedColors().listOverrideStyles,
			scoped,
			findWidgetContainer,
			onSessionOpen: (resource, preserveFocus) => {
				const session = this._sessionsManagementService.getSession(resource);
				return session ? this._surface.openChat(session, undefined, { preserveFocus }).catch(onUnexpectedError) : undefined;
			},
			onChatOpen: (session: ISession, chat: IChat, preserveFocus: boolean) => this._surface.openChat(session, chat.resource, { preserveFocus }).catch(onUnexpectedError),
		}));
		this._listControl = new ChatViewSessionsListControl(list, listContainer);

		// The chat, below or beside the sessions: Back returns from a session's chat to a new-session composer
		const chatContainer = this._chatContainer = append(wrapper, $('.chat-controls-container'));
		const backBar = this._backBar = append(chatContainer, $('.chat-view-sessions-back'));
		const back = this._register(new Button(backBar, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: localize('chatViewSessions.backTitle', "Back to Sessions") }));
		back.label = `$(arrow-left) ${localize('chatViewSessions.back', "Sessions")}`;
		this._register(back.onDidClick(() => this._surface.back()));
		const chatHost = this._chatHost = append(chatContainer, $('.chat-view-sessions-chat'));

		this._register(this._surface.attachView({ focus: () => this.focus() }));
		this._surface.ensureChat();
		this._register(autorun(reader => {
			const chat = this._surface.chat.read(reader);
			this._chatView.clear();
			if (chat) {
				const view = this._chatView.value = this.instantiationService.createInstance(ChatEditorView, chat);
				chatHost.appendChild(view.element);
			}
			this._relayout();
		}));
		// Whether it shows a session's chat or a composer changes as its composer sends
		this._register(autorun(reader => {
			this._surface.chat.read(reader)?.composer?.read(reader);
			this._relayout();
		}));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._dimensions = { height, width };
		this._relayout();
	}

	private _relayout(): void {
		const dimensions = this._dimensions;
		if (!dimensions || !this._body || !this._sessionsContainer || !this._listContainer || !this._chatContainer || !this._backBar || !this._chatHost) {
			return;
		}
		const { height, width } = dimensions;
		const configured = this.configurationService.getValue<'stacked' | 'sideBySide' | unknown>(ChatConfiguration.ChatViewSessionsOrientation);
		this._sessionsOrientation = configured !== 'stacked' && width >= SESSIONS_SIDEBAR_WIDTH + CHAT_MIN_WIDTH ? AgentSessionsViewerOrientation.SideBySide : AgentSessionsViewerOrientation.Stacked;
		this._lastDimensions.set(this._sessionsOrientation, { height, width });
		const position = this._sessionsPosition();
		this._orientationContext.set(this._sessionsOrientation);
		this._positionContext.set(position === Position.RIGHT ? AgentSessionsViewerPosition.Right : AgentSessionsViewerPosition.Left);
		const element = this._body;
		element.classList.toggle('sessions-control-orientation-stacked', this._sessionsOrientation === AgentSessionsViewerOrientation.Stacked);
		element.classList.toggle('sessions-control-orientation-sidebyside', this._sessionsOrientation === AgentSessionsViewerOrientation.SideBySide);
		element.classList.toggle('chat-view-position-left', position === Position.LEFT);
		element.classList.toggle('chat-view-position-right', position === Position.RIGHT);

		const showingSession = !!this._surface.chat.get() && !this._surface.hasComposer();
		let chatWidth = width;
		let chatHeight = height;
		if (this._sessionsOrientation === AgentSessionsViewerOrientation.SideBySide) {
			setVisibility(true, this._sessionsContainer);
			setVisibility(false, this._backBar);
			this._sessionsContainer.style.width = `${SESSIONS_SIDEBAR_WIDTH}px`;
			this._sessionsContainer.style.height = `${height}px`;
			this._listContainer.style.height = `${height - SESSIONS_TITLE_HEIGHT}px`;
			this._list?.layout(height - SESSIONS_TITLE_HEIGHT, SESSIONS_SIDEBAR_WIDTH);
			chatWidth = width - SESSIONS_SIDEBAR_WIDTH - 1;
		} else if (showingSession) {
			// A session's chat takes the view, with Back to its sessions
			setVisibility(false, this._sessionsContainer);
			setVisibility(true, this._backBar);
			chatHeight = height - BACK_BAR_HEIGHT;
		} else {
			// The sessions above a new-session composer
			setVisibility(true, this._sessionsContainer);
			setVisibility(false, this._backBar);
			const listHeight = Math.max(0, Math.min(Math.floor(height / 2), height - SESSIONS_TITLE_HEIGHT - CHAT_MIN_HEIGHT));
			this._sessionsContainer.style.width = '';
			this._sessionsContainer.style.height = `${listHeight + SESSIONS_TITLE_HEIGHT}px`;
			this._listContainer.style.height = `${listHeight}px`;
			this._list?.layout(listHeight, width);
			chatHeight = height - listHeight - SESSIONS_TITLE_HEIGHT;
		}
		this._chatHost.style.height = `${chatHeight}px`;
		this._chatHost.style.width = `${chatWidth}px`;
		this._chatView.value?.layout(chatWidth, chatHeight, 0, 0);
	}

	private _sessionsPosition(): Position {
		const location = this.viewDescriptorService.getViewLocationById(this.id);
		const sideBarPosition = this._layoutService.getSideBarPosition();
		switch (location) {
			case ViewContainerLocation.Sidebar:
				return sideBarPosition === Position.RIGHT ? Position.RIGHT : Position.LEFT;
			case ViewContainerLocation.Panel:
				return this._layoutService.getPanelPosition() !== Position.LEFT ? Position.RIGHT : Position.LEFT;
			default:
				return sideBarPosition === Position.LEFT ? Position.RIGHT : Position.LEFT;
		}
	}

	override focus(): void {
		super.focus();
		this._chatView.value?.focus();
	}

	// --- The sessions, as the actions of the sessions toolbar act on them

	get agentSessionsControl(): IAgentSessionsControl | undefined {
		return this._listControl;
	}

	getSessionsViewerOrientation(): AgentSessionsViewerOrientation {
		return this._sessionsOrientation;
	}

	updateConfiguredSessionsViewerOrientation(orientation: 'stacked' | 'sideBySide' | unknown): void {
		const validated = orientation === 'stacked' || orientation === 'sideBySide' ? orientation : 'sideBySide';
		void this.configurationService.updateValue(ChatConfiguration.ChatViewSessionsOrientation, validated).then(() => this._relayout());
	}

	getLastDimensions(orientation: AgentSessionsViewerOrientation): { height: number; width: number } | undefined {
		return this._lastDimensions.get(orientation);
	}

	focusSessions(): boolean {
		if (!this._list || this._sessionsContainer?.style.display === 'none') {
			return false;
		}
		this._list.focus();
		return true;
	}
}
