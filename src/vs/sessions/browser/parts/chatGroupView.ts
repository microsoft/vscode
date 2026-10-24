/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, size, trackFocus } from '../../../base/browser/dom.js';
import { ISerializableView, IViewSize } from '../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue, runOnChange } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { isEqual } from '../../../base/common/resources.js';
import { localize } from '../../../nls.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { getChatSessionArchiveActionWording } from '../../../platform/chat/common/sessionArchiveActions.js';
import { ChatInteractivity, getChatCapabilities, IChat, isSideChatOf, SessionStatus } from '../../services/sessions/common/session.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { SessionActiveChatCanArchiveContext, SessionActiveChatHasSideChatsContext, SessionActiveChatIsClosableContext, SessionActiveChatIsDeletableContext, SessionActiveChatIsUntitledContext, SessionActiveChatResourceContext, SessionFocusedChatIsRenameTargetContext, SessionHeaderActiveChatIsPinnedContext, SessionHeaderShowsChatContext, SessionHeaderTargetsChatContext, SessionToolbarShowsSessionContext } from '../../common/contextkeys.js';
import { IChatViewFactory } from '../../services/chatView/browser/chatViewFactory.js';
import { ChatCompositeBar, IChatCompositeBarDelegate } from './chatCompositeBar.js';
import { type IRemoteHostUnavailableEmptyStateContent, RemoteHostUnavailableEmptyState } from './remoteHostUnavailableEmptyState.js';
import { SessionRemoteConnection } from './sessionRemoteConnection.js';
import { getArchivedChatBannerContent, ISessionReadOnlyBannerContent, SessionReadOnlyBanner } from './sessionReadOnlyBanner.js';
import { AbstractChatView, ChatViewKind, IChatViewOptions, ISelectNoWorkspaceOptions, ISelectWorkspaceOptions, WorkspaceSelectionResult } from './chatView.js';
import { ChatViewSessionActivityBar } from './sessionActivityBar.js';
import { ChatHeader } from './chatHeader.js';
import { IGridEdgeInsets, NO_GRID_EDGE_INSETS } from './gridGap.js';

/**
 * The data + callbacks a {@link ChatGroupView} needs from its owning
 * {@link ChatGroupsView}. Each group renders a subset of the session's chats.
 */
export interface IChatGroupContext {

	/** The session whose chats are partitioned across groups. */
	readonly session: IActiveSession;

	/** Options forwarded to the new-chat views the group creates. */
	readonly options: IChatViewOptions;

	/** The chats assigned to this group, in tab order. */
	readonly chats: IObservable<readonly IChat[]>;

	/** The resource (as a string) of the chat shown by this group. */
	readonly activeChatResource: IObservable<string>;

	/** The session's main chat resource (as a string); its tab is not closeable. */
	readonly mainChatResource: IObservable<string>;

	/** Whether the group's tab strip should be shown. */
	readonly tabsVisible: IObservable<boolean>;

	/** Whether this group should show its chat header instead of tabs. */
	readonly chatHeaderVisible: IObservable<boolean>;

	/** Whether this group's active chat is pinned against automatic replacement. */
	readonly activeChatIsPinned: IObservable<boolean>;

	/** Whether this group's tab row replaces the session header and shows its actions. */
	readonly showSessionActions: IObservable<boolean>;
	/** Whether this chat group occupies a separate pane within the session. */
	readonly showParentContext: IObservable<boolean>;

	/** Make this the active chat group for group-scoped header actions. */
	activate(): void;

	/** Activate (show + focus) the given chat within this group. */
	openChat(resource: URI): void;

	/** A chat tab drag has started for the given chat. */
	onTabDragStart(resource: URI): void;

	/** A chat tab drag has ended. */
	onTabDragEnd(): void;
}

interface IChatGroupSurface {
	readonly banner: ISessionReadOnlyBannerContent | undefined;
	readonly recovery: IRemoteHostUnavailableEmptyStateContent | undefined;
}

/**
 * A single leaf in the {@link ChatGroupsView} grid. Hosts session or chat-tab
 * presentation on top of a kind-switched {@link AbstractChatView} that renders
 * the group's active chat.
 */
export class ChatGroupView extends Disposable implements ISerializableView {

	static readonly TYPE = 'sessions.chatGroupView';
	private static readonly MINIMUM_WIDTH = 200;
	private static readonly MINIMUM_HEIGHT = 200;

	readonly element: HTMLElement = $('.chat-group-view');

	get tabsElement(): HTMLElement { return this._compositeBar.element; }

	private _insets = NO_GRID_EDGE_INSETS;

	get minimumWidth() { return ChatGroupView.MINIMUM_WIDTH + this._insets.left + this._insets.right; }
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	get minimumHeight() { return ChatGroupView.MINIMUM_HEIGHT + this._insets.top + this._insets.bottom; }
	readonly maximumHeight = Number.POSITIVE_INFINITY;

	private readonly _onDidChange = this._register(new Emitter<IViewSize | undefined>());
	readonly onDidChange: Event<IViewSize | undefined> = this._onDidChange.event;

	/** Fires when keyboard focus enters this group (any of its descendants). */
	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private readonly _compositeBar: ChatCompositeBar;
	private readonly _chatHeader: ChatHeader;
	private readonly _surface: HTMLElement;
	private readonly _barContainer: HTMLElement;
	private readonly _readOnlyBanner: SessionReadOnlyBanner;
	private readonly _contentContainer: HTMLElement;
	private readonly _remoteHostUnavailableEmptyState: RemoteHostUnavailableEmptyState;

	// Stop observing the session before disposing the view those observers can replace.
	private readonly _contextDisposables = this._register(new DisposableStore());
	private readonly _currentView = this._register(new MutableDisposable<AbstractChatView>());
	private _draftChatResource: URI | undefined;
	private readonly _scopedInstantiationService: IInstantiationService;
	private readonly _activeChatIsClosableKey: IContextKey<boolean>;
	private readonly _activeChatCanArchiveKey: IContextKey<boolean>;
	private readonly _activeChatIsDeletableKey: IContextKey<boolean>;
	private readonly _activeChatIsUntitledKey: IContextKey<boolean>;
	private readonly _activeChatIsPinnedKey: IContextKey<boolean>;
	private readonly _activeChatResourceKey: IContextKey<string>;
	private readonly _activeChatHasSideChatsKey: IContextKey<boolean>;
	private readonly _headerShowsChatKey: IContextKey<boolean>;
	private readonly _headerTargetsChatKey: IContextKey<boolean>;
	private readonly _toolbarShowsSessionKey: IContextKey<boolean>;
	private readonly _focusedChatIsRenameTargetKey: IContextKey<boolean>;
	private readonly _connection: SessionRemoteConnection;

	/** The configured wording for the archive/unarchive action (Archive vs Delete). */
	private readonly _archiveActionWording: IObservable<ReturnType<typeof getChatSessionArchiveActionWording>>;

	private _lastGridLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;
	private _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	/** Whether this group is the active (focused) group within the session. */
	private _groupActive = false;
	private readonly _sessionActivityBar: ChatViewSessionActivityBar;
	/** Whether this group's session is the active session in the sessions part. */
	private _sessionActive = true;
	/** Whether this group's session is currently visible in the sessions part. */
	private _sessionVisible = true;
	/** Whether this is the first group in the chat grid's logical order. */
	private _primary = false;
	/** Whether the chat grid has more than one group. */
	private _split = false;
	/** Index of this group within the persisted layout, written into {@link toJSON}. */
	private _serializationIndex = 0;

	constructor(
		@IChatViewFactory private readonly _chatViewFactory: IChatViewFactory,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		this._scopedInstantiationService = this._register(this._instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		this._activeChatIsClosableKey = SessionActiveChatIsClosableContext.bindTo(scopedContextKeyService);
		this._activeChatCanArchiveKey = SessionActiveChatCanArchiveContext.bindTo(scopedContextKeyService);
		this._activeChatIsDeletableKey = SessionActiveChatIsDeletableContext.bindTo(scopedContextKeyService);
		this._activeChatIsUntitledKey = SessionActiveChatIsUntitledContext.bindTo(scopedContextKeyService);
		this._activeChatIsPinnedKey = SessionHeaderActiveChatIsPinnedContext.bindTo(scopedContextKeyService);
		this._activeChatResourceKey = SessionActiveChatResourceContext.bindTo(scopedContextKeyService);
		this._activeChatHasSideChatsKey = SessionActiveChatHasSideChatsContext.bindTo(scopedContextKeyService);
		this._headerShowsChatKey = SessionHeaderShowsChatContext.bindTo(scopedContextKeyService);
		this._headerTargetsChatKey = SessionHeaderTargetsChatContext.bindTo(scopedContextKeyService);
		this._toolbarShowsSessionKey = SessionToolbarShowsSessionContext.bindTo(scopedContextKeyService);
		this._focusedChatIsRenameTargetKey = SessionFocusedChatIsRenameTargetContext.bindTo(scopedContextKeyService);

		// Assigned here rather than as a field initializer: `_instantiationService`
		// is a parameter property of this class, which class-field semantics
		// initialize after the field initializers run.
		this._connection = this._register(this._instantiationService.createInstance(SessionRemoteConnection));

		this._archiveActionWording = observableFromEvent(
			this,
			configurationService.onDidChangeConfiguration,
			() => getChatSessionArchiveActionWording(configurationService),
		);

		this._surface = append(this.element, $('.chat-group-view-surface'));
		this._barContainer = append(this._surface, $('.chat-group-view-bar'));

		this._chatHeader = this._register(this._scopedInstantiationService.createInstance(ChatHeader));
		append(this._barContainer, this._chatHeader.element);

		this._compositeBar = this._register(this._scopedInstantiationService.createInstance(ChatCompositeBar, undefined));
		append(this._barContainer, this._compositeBar.element);

		// Single status banner, shown flush below this group's tab bar when the
		// active chat is non-interactive or its remote host is unavailable.
		this._readOnlyBanner = this._register(this._instantiationService.createInstance(SessionReadOnlyBanner));
		append(this._barContainer, this._readOnlyBanner.domNode);

		this._contentContainer = append(this._surface, $('.chat-group-view-content'));
		this._remoteHostUnavailableEmptyState = this._register(this._instantiationService.createInstance(RemoteHostUnavailableEmptyState));
		append(this._contentContainer, this._remoteHostUnavailableEmptyState.domNode);

		this._sessionActivityBar = this._register(this._scopedInstantiationService.createInstance(ChatViewSessionActivityBar, this.element));
		this._updateSessionActivityBarActive();
		this._register(runOnChange(this._sessionActivityBar.reservedWidth, () => this._layoutChildren()));

		this._register(this._chatHeader.onDidChangeVisibility(() => this._layoutChildren()));
		this._register(this._chatHeader.onDidChangeHeight(() => this._layoutChildren()));
		this._register(this._compositeBar.onDidChangeVisibility(() => {
			this._contentContainer.classList.toggle('modern-ui-editor-tab-content', this._compositeBar.visible);
			this._layoutChildren();
		}));
		this._register(this._compositeBar.onDidChangeHeight(() => this._layoutChildren()));

		const focusTracker = this._register(trackFocus(this.element));
		this._register(focusTracker.onDidFocus(() => this._onDidFocus.fire()));
	}

	setGroupPosition(index: number, count: number): void {
		this._primary = index === 0;
		this._split = count > 1;
		this._currentView.value?.setPrimary(this._primary, this._split);

		if (count <= 1) {
			this.element.removeAttribute('role');
			this.element.removeAttribute('aria-label');
			this._compositeBar.setAriaLabel(localize('chatTabsAriaLabel', "Chats"));
			return;
		}

		this.element.setAttribute('role', 'region');
		this.element.setAttribute('aria-label', localize('chatGroupAriaLabel', "Chat Group {0} of {1}", index + 1, count));
		this._compositeBar.setAriaLabel(localize('chatGroupTabsAriaLabel', "Chats, Group {0} of {1}", index + 1, count));
	}

	startFocusedChatTitleEditing(): boolean {
		return this._compositeBar.startFocusedTabEditing();
	}

	startChatTitleEditing(chatResource: URI): boolean {
		return this._compositeBar.startTabEditing(chatResource);
	}

	/** Sets (or clears) the group this view renders. */
	setContext(context: IChatGroupContext | undefined): void {
		this._contextDisposables.clear();
		this._connection.setSession(context?.session);

		if (!context) {
			this._sessionActivityBar.setChatActions(undefined);
			this._draftChatResource = undefined;
			this._activeChatIsClosableKey.reset();
			this._activeChatCanArchiveKey.reset();
			this._activeChatIsDeletableKey.reset();
			this._activeChatIsUntitledKey.reset();
			this._activeChatIsPinnedKey.reset();
			this._activeChatResourceKey.reset();
			this._activeChatHasSideChatsKey.reset();
			this._headerShowsChatKey.reset();
			this._headerTargetsChatKey.reset();
			this._toolbarShowsSessionKey.reset();
			this._focusedChatIsRenameTargetKey.reset();
			this._chatHeader.setChat(undefined);
			this._compositeBar.setGroup(undefined);
			this._currentView.clear();
			this._setRemoteHostUnavailableEmptyState(undefined);
			this._contentContainer.replaceChildren(this._remoteHostUnavailableEmptyState.domNode);
			return;
		}

		const activeChat = derived(reader => {
			const activeResource = context.activeChatResource.read(reader);
			return context.chats.read(reader).find(c => c.resource.toString() === activeResource);
		});
		this._chatHeader.setChat({
			session: context.session,
			chat: activeChat,
			activate: () => context.activate(),
		});
		this._contextDisposables.add(autorun(reader => {
			const visible = context.chatHeaderVisible.read(reader);
			this._chatHeader.setVisible(visible);
			this._headerShowsChatKey.set(visible);
		}));
		this._contextDisposables.add(autorun(reader => {
			this._toolbarShowsSessionKey.set(context.showSessionActions.read(reader));
		}));

		const delegate: IChatCompositeBarDelegate = {
			session: context.session,
			chats: context.chats,
			activeChatResource: context.activeChatResource,
			mainChatResource: context.mainChatResource,
			visible: context.tabsVisible,
			showSessionActions: context.showSessionActions,
			showParentContext: context.showParentContext,
			openChat: resource => context.openChat(resource),
			onTabDragStart: resource => context.onTabDragStart(resource),
			onTabDragEnd: () => context.onTabDragEnd(),
		};
		this._compositeBar.setGroup(delegate);

		this._contextDisposables.add(autorun(reader => {
			const activeResource = context.activeChatResource.read(reader);
			const mainResource = context.mainChatResource.read(reader);
			const chat = activeChat.read(reader);
			const isNonMainChat = activeResource !== mainResource;
			this._activeChatIsClosableKey.set(isNonMainChat || context.chatHeaderVisible.read(reader));
			const capabilities = chat && getChatCapabilities(chat, context.session, reader);
			this._activeChatCanArchiveKey.set(!!capabilities?.canArchive && !(chat?.isArchived?.read(reader) ?? false));
			this._activeChatIsDeletableKey.set(capabilities?.canDelete ?? false);
			this._activeChatIsUntitledKey.set(chat?.status.read(reader) === SessionStatus.Untitled);
			this._activeChatIsPinnedKey.set(context.activeChatIsPinned.read(reader));
			this._activeChatResourceKey.set(chat?.resource.toString() ?? '');
			this._activeChatHasSideChatsKey.set(!!chat && context.session.chats.read(reader).some(candidate => isSideChatOf(candidate, chat.resource)));
			this._headerTargetsChatKey.set(context.chatHeaderVisible.read(reader) && isNonMainChat);
			this._focusedChatIsRenameTargetKey.set(isNonMainChat);
		}));
		const currentView = observableValue<AbstractChatView | undefined>(this._contextDisposables, this._currentView.value);

		const readOnlyContent = derived(reader => {
			const chat = activeChat.read(reader);
			if (!chat || chat.interactivity.read(reader) === ChatInteractivity.Full || chat.interactivity.read(reader) === ChatInteractivity.DraftOnly) {
				return undefined;
			}

			const archivedContent = getArchivedChatBannerContent(context.session, chat, this._archiveActionWording.read(reader), this._commandService, reader);
			if (archivedContent) {
				return { archived: true, content: archivedContent };
			}
			return { archived: false, content: { message: localize('sessionReadOnlyBanner.message', "This chat is read-only") } };
		});

		const surface = derived<IChatGroupSurface>(reader => {
			const view = currentView.read(reader);
			const historyStatus = view?.historyStatus.read(reader);
			const readOnly = readOnlyContent.read(reader);
			if (readOnly?.archived) {
				return {
					banner: historyStatus?.kind === 'history' ? {
						message: localize('sessionHistoryStatus.archived', "{0} {1}", historyStatus.message, readOnly.content.message),
						action: historyStatus.action,
						secondaryAction: readOnly.content.action,
					} : readOnly.content,
					recovery: undefined,
				};
			}

			// Keep the banner while history loads to avoid flashing the centered recovery state.
			const transcriptSettled = view === undefined || !view.isLoadingTranscript.read(reader);
			const recovery = !transcriptSettled || view?.hasVisibleTranscriptContent.read(reader) || activeChat.read(reader)?.interactivity.read(reader) === ChatInteractivity.DraftOnly
				? undefined
				: this._connection.recoveryContent.read(reader);
			if (recovery) {
				return { banner: undefined, recovery };
			}
			// Explain connection-related read-only state before falling back to the generic notice.
			const connectionBanner = this._connection.bannerContent.read(reader);
			const quietDraft = activeChat.read(reader)?.interactivity.read(reader) === ChatInteractivity.DraftOnly
				&& this._connection.isQuiet.read(reader);
			if (connectionBanner && !quietDraft) {
				return { banner: connectionBanner, recovery: undefined };
			}
			if (historyStatus && (historyStatus.kind === 'history' || !this._connection.isQuiet.read(reader))) {
				return { banner: { icon: historyStatus.isLoading ? Codicon.sync : Codicon.warning, message: historyStatus.message, action: historyStatus.action }, recovery: undefined };
			}
			if (!quietDraft && activeChat.read(reader)?.interactivity.read(reader) === ChatInteractivity.DraftOnly && context.session.remoteConnectionStatus?.read(reader)?.kind === 'connected') {
				return { banner: { icon: Codicon.sync, message: localize('sessionReadOnlyBanner.preparing', "Preparing the session...") }, recovery: undefined };
			}

			return { banner: !transcriptSettled || view?.isInputBlocked.read(reader) ? undefined : readOnly?.content, recovery: undefined };
		});

		this._contextDisposables.add(autorun(reader => {
			const session = context.session;
			const chat = activeChat.read(reader);
			if (!isEqual(this._draftChatResource, chat?.resource)) {
				this._draftChatResource = undefined;
			}
			if (chat?.interactivity.read(reader) === ChatInteractivity.DraftOnly) {
				this._draftChatResource = chat.resource;
			}

			let desiredKind: ChatViewKind;
			if (session.isCreated.read(reader) === false) {
				desiredKind = session.isNewSessionRequestInProgress?.read(reader) === true || chat?.interactivity.read(reader) === ChatInteractivity.ReadOnly
					? 'chat'
					: 'newSession';
			} else if (!chat || (chat.status.read(reader) === SessionStatus.Untitled && chat.interactivity.read(reader) === ChatInteractivity.Full && !isEqual(this._draftChatResource, chat.resource))) {
				desiredKind = 'newChatInSession';
			} else {
				desiredKind = 'chat';
			}

			let view = this._currentView.value;
			if (!view || view.kind !== desiredKind) {
				view = desiredKind === 'chat'
					? this._chatViewFactory.createChatView(this._scopedInstantiationService)
					: this._chatViewFactory.createNewChatView(desiredKind === 'newChatInSession', context.options, this._scopedInstantiationService);
				this._contentContainer.replaceChildren(view.element, this._remoteHostUnavailableEmptyState.domNode);
				this._currentView.value = view;
				currentView.set(view, undefined);
				this._sessionActivityBar.setChatActions(view.activityBarActions);
				view.setPrimary(this._primary, this._split);
				view.setActive(this._sessionActive && this._groupActive);
				view.setVisible(this._sessionVisible);
				this._layoutChildren();
			}

			if (chat) {
				const needsConnectionFeedback = chat.interactivity.read(reader) === ChatInteractivity.DraftOnly || view.isInputBlocked.read(reader);
				view.setChat(chat, session.sessionId, session, needsConnectionFeedback ? () => this._connection.connectOnInput() : undefined);
			}

			const surfaceContent = surface.read(reader);
			this._setRemoteHostUnavailableEmptyState(surfaceContent.recovery);
			this._setReadOnlyBanner(surfaceContent.banner);
		}));
	}

	private _setReadOnlyBanner(content: ISessionReadOnlyBannerContent | undefined): void {
		if (content) {
			this._readOnlyBanner.setContent(content);
		}
		// Only re-layout when the banner's visibility (and thus its
		// contribution to the bar height) actually changes.
		if (this._readOnlyBanner.visible !== !!content) {
			this._readOnlyBanner.setVisible(!!content);
			this._layoutChildren();
		}
	}

	private _setRemoteHostUnavailableEmptyState(content: IRemoteHostUnavailableEmptyStateContent | undefined): void {
		this._remoteHostUnavailableEmptyState.setContent(content);
		this._contentContainer.classList.toggle('remote-host-unavailable', !!content);
	}

	/** Whether this group is the active (focused) group within the session. */
	setGroupActive(active: boolean): void {
		this._groupActive = active;
		this.element.classList.toggle('active-group', active);
		this._currentView.value?.setActive(this._sessionActive && active);
		this._updateSessionActivityBarActive();
	}

	/** Only the active group of the active, visible session shows the session activity bar. */
	private _updateSessionActivityBarActive(): void {
		this._sessionActivityBar.setActive(this._groupActive && this._sessionActive && this._sessionVisible);
	}

	get groupActive(): boolean {
		return this._groupActive;
	}

	/** Whether this group's session is the active session in the sessions part. */
	setSessionActive(active: boolean): void {
		if (this._sessionActive === active) {
			return;
		}
		this._sessionActive = active;
		this._currentView.value?.setActive(active && this._groupActive);
		this._updateSessionActivityBarActive();
	}

	/** Whether this group's session is currently visible in the sessions part. */
	setSessionVisible(visible: boolean): void {
		if (this._sessionVisible === visible) {
			return;
		}
		this._sessionVisible = visible;
		this._currentView.value?.setVisible(visible);
		this._updateSessionActivityBarActive();
		if (visible) {
			this._layoutChildren();
		}
	}

	submitInput(): Promise<boolean> {
		return this._currentView.value?.submitInput() ?? Promise.resolve(false);
	}

	reopenChat(resource: URI): Promise<void> {
		return this._currentView.value?.reopenChat(resource) ?? Promise.resolve();
	}

	selectWorkspace(folderUri: URI, options?: ISelectWorkspaceOptions): WorkspaceSelectionResult {
		return this._currentView.value?.selectWorkspace(folderUri, options) ?? 'notReady';
	}

	selectNoWorkspace(options?: ISelectNoWorkspaceOptions): void {
		this._currentView.value?.selectNoWorkspace(options);
	}

	prefillInput(text: string): void {
		this._currentView.value?.prefillInput(text);
	}

	sendQuery(text: string): void {
		this._currentView.value?.sendQuery(text);
	}

	attach(uris: URI[]): void {
		this._currentView.value?.attach(uris);
	}

	setInsets(insets: IGridEdgeInsets): boolean {
		if (this._insets.top === insets.top
			&& this._insets.right === insets.right
			&& this._insets.bottom === insets.bottom
			&& this._insets.left === insets.left) {
			return false;
		}
		this._insets = insets;
		if (this._lastGridLayout) {
			const { width, height, top, left } = this._lastGridLayout;
			this.layout(width, height, top, left);
		}
		return true;
	}

	notifyConstraintsChanged(): void {
		this._onDidChange.fire(undefined);
	}

	layout(width: number, height: number, top: number, left: number): void {
		this._lastGridLayout = { width, height, top, left };
		const insets = this._insets;
		this.element.style.borderTopWidth = `${insets.top}px`;
		this.element.style.borderRightWidth = `${insets.right}px`;
		this.element.style.borderBottomWidth = `${insets.bottom}px`;
		this.element.style.borderLeftWidth = `${insets.left}px`;
		size(this.element, width, height);
		this._lastLayout = {
			width: Math.max(0, width - insets.left - insets.right),
			height: Math.max(0, height - insets.top - insets.bottom),
			top: top + insets.top,
			left: left + insets.left,
		};
		this._layoutChildren();
	}

	private _layoutChildren(): void {
		if (!this._lastLayout || !this._sessionVisible) {
			return;
		}
		const { width, height, top, left } = this._lastLayout;
		const headerHeight = this._chatHeader.visible ? this._chatHeader.height : 0;
		const tabsHeight = this._compositeBar.visible ? this._compositeBar.height : 0;
		const bannerHeight = this._readOnlyBanner.visible ? this._readOnlyBanner.domNode.offsetHeight : 0;
		const barHeight = headerHeight + tabsHeight + bannerHeight;
		const contentInset = this._sessionActivityBar.reservedWidth.get();
		size(this._barContainer, width, barHeight);
		size(this._contentContainer, width, height - barHeight);
		this._sessionActivityBar.setScrollDownButton(this._currentView.value?.scrollDownButtonDomNode);
		this._sessionActivityBar.layout(barHeight, height - barHeight);
		this._currentView.value?.layout(width, height - barHeight, top + barHeight, left, contentInset);
	}

	/** Sets the index this group serializes as, so the grid deserializer can map nodes back to groups. */
	setSerializationIndex(index: number): void {
		this._serializationIndex = index;
	}

	toJSON(): object {
		return { type: ChatGroupView.TYPE, index: this._serializationIndex };
	}

	focus(): void {
		if (this._remoteHostUnavailableEmptyState.visible) {
			this._remoteHostUnavailableEmptyState.focus();
			return;
		}
		this._currentView.value?.focus();
	}
}
