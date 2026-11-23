/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { raceTimeout } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, ITransaction, observableValue, transaction, waitForState } from '../../../../../base/common/observable.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { parse, stringify } from '../../../../../base/common/marshalling.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { SESSIONS_CHAT_TABS_DEFAULT, SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode } from '../../common/sessionConfig.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { EditorCloseContext, EditorsOrder, GroupIdentifier, IEditorPane } from '../../../../common/editor.js';
import { GroupDirection, GroupsOrder, IContentPart, IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { getEditorWindowComposerTarget } from '../editorWindow/editorWindowSessionsPresenter.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { ISessionHost } from '../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession, isSessionCreated } from '../../../../services/sessions/common/session.js';
import { IChatWidget } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { IChatDraft } from '../../../chat/common/attachments/chatDraft.js';
import { fromStoredChatDraft, toStoredChatDraft } from '../../common/newChatDraftState.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { getChatWindowMainPartOptions } from '../../../chatWindow/browser/chatWindow.js';
import { enforceChatPartOptions } from '../../../chatWindow/browser/chatWindowService.js';
import { ChatWindowLayoutMode } from '../../../chatWindow/common/chatWindowLayout.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { IChatEditorWindow, registerSessionChatViewEditor, SESSION_CHAT_VIEW_WORKING_SET_HOST_OPTIONS } from '../chatEditor/chatEditor.js';
import { ChatWindowComposerModel, ChatWindowComposers, createChatWindowComposerResource, isChatWindowComposerResource } from '../chatEditor/chatWindowComposer.js';
import { getChatViewHostOpenReason, IChatViewHostService, IChatViewHostShownSession } from '../../../chat/browser/chatViewHost.js';
import { IEditorWindowComposerFolderOptions, IEditorWindowComposerFoldersService } from '../editorWindow/editorWindowComposerFolders.js';
import { SessionChatEditorEntry, waitForSessionChat } from '../chatEditor/sessionChatEditorHost.js';
import { IChatViewFactory } from '../chatViewFactory.js';
import { applyRememberedNewSessionPicks, EditorWindowNewSessionPicks } from './editorWindowNewSessionPicks.js';
import { INewSessionTarget, ISessionViewHostOptions } from '../parts/chatView.js';
import { ISessionsListModelService } from '../sessionsListModelService.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { IAgentsChatPartFrame } from './agentsChatPartFrame.js';
import { AgentsChatPartAction, logAgentsChatPartAction } from './agentsChatPartTelemetry.js';
import { AgentsViewAvailable, InAgentsChatPartContext } from './agentsChatPartContext.js';
import { IEditorWindowShownChatService } from './editorWindowMainSessionHost.js';

/**
 * The chats of the chat part, which it shows again as the window restores. Its editor part's own state would restore bare
 * chat editors through their serializers; the chat part restores each chat through its session instead, once the
 * providers know it, as the chat it shows.
 */
const CHAT_PART_EDITORS_STORAGE_KEY = 'workbench.chatPart.editors';

/** How long restoring a chat of the chat part waits for its session to load. */
const RESTORE_SESSION_TIMEOUT = 30_000;

/** How long the chat part waits for the view of a composer to show. */
const COMPOSER_VIEW_TIMEOUT = 5_000;

/** A chat that the chat part shows, with its session. */
export interface IAgentsChatPartChat {
	readonly session: ISession;
	readonly chat: IChat;
}

export interface IAgentsChatPartOpenOptions {
	readonly preserveFocus?: boolean;
	/** Opens beside the active chat, in a group of its own. */
	readonly sideBySide?: boolean;
	/** Opens a new composer, also while the active tab is one that has not sent its session yet. */
	readonly newComposer?: boolean;
	/** Starts a new composer with what the user picked last for what the target leaves open: for a default new session only. */
	readonly useRememberedPicks?: boolean;
	/** Shows the chat as one the chat part restores, not one the user opens (see `IChatViewHostOpenOptions.restore`). */
	readonly restore?: boolean;
	/** Shows the chat as the session that its first send created, not one the user opens (see `IChatViewHostOpenOptions.commit`). */
	readonly commit?: boolean;
	/** Shows the chat as one the user opens where the window's folder stays (see `IChatViewHostOpenOptions.keepFolder`). */
	readonly keepFolder?: boolean;
}

export const IAgentsChatPartService = createDecorator<IAgentsChatPartService>('agentsChatPartService');

/**
 * The chat part of an editor window with the Sessions view: it shows chats of sessions, from any workspace, each in a tab
 * of its own, beside the editor area, as a chat window shows them. The chat of its active tab is the window's active chat.
 */
export interface IAgentsChatPartService {
	readonly _serviceBrand: undefined;

	/** The host of the window, whose session and chat are those of the active tab of the chat part. */
	readonly mainWindowHost: ISessionHost;

	/** The chat of the active tab of the chat part, with its session. */
	readonly activeChat: IObservable<IAgentsChatPartChat | undefined>;

	/** Shows `chatResource` of `session`, or its main chat, in the chat part: in its tab, or in a new one. */
	openChat(session: ISession, chatResource: URI | undefined, options?: IAgentsChatPartOpenOptions): Promise<void>;

	/** Opens a new-session composer in a tab of the chat part, aimed at `target`. */
	openComposer(target: INewSessionTarget | undefined, options?: IAgentsChatPartOpenOptions): Promise<void>;

	/** Closes the tab of `chatResource`, where the chat part shows it. */
	closeChat(chatResource: URI): Promise<void>;

	/**
	 * In Single, keeps what was typed in its one unsent new-session composer for its next one, as closing that composer does,
	 * so that another draft can take the composer. Returns whether it did: not with nothing typed or while it sends.
	 */
	parkComposerInput(): boolean;

	/**
	 * Closes the tabs of all its chats, which closes it. In Single, what was typed in its unsent new-session composers is kept
	 * for its next ones, as closing each does.
	 */
	closeAllChats(): Promise<void>;

	/** Whether the chat part shows `chatResource` in one of its tabs. */
	isShowing(chatResource: URI): boolean;

	/** Whether one of its tabs is a new-session composer that has not sent its session yet. */
	hasComposer(): boolean;

	/** Closes the tabs of new-session composers with nothing typed or attached, and no send under way. */
	closeIdleComposers(): Promise<void>;

	/** Moves focus into the chat part. */
	focus(): void;

	/**
	 * Shows the chat part with the chats it had as it closed, also those of before a reload, and moves focus into it unless
	 * `preserveFocus`. Without any, it shows a new-session composer, aimed at `target`.
	 */
	show(target: INewSessionTarget | undefined, options?: { readonly preserveFocus?: boolean; readonly useRememberedPicks?: boolean }): Promise<void>;

	/** The chat widget of the input of the composer in the active tab, once it shows: its submits create the session. */
	getComposerWidget(): Promise<IChatWidget | undefined>;

	/** Shows again the chats the chat part showed as the window last closed, when the layout restores it shown. */
	restore(): Promise<void>;

	/**
	 * The chat of the active tab, and why it shows: `restore` while it is the tab that {@link restore} showed, `open` once
	 * the user opened, picked or sent a chat, as the Chat view reports it (see `IChatViewHost.shownSession`).
	 */
	readonly shownSession: IObservable<IChatViewHostShownSession | undefined>;

	/** The folders its composers create sessions in, and how their workspace pickers show them (see `IEditorWindowComposerFoldersService`). */
	getComposerFolderOptions(): IAgentsChatPartComposerFolderOptions;

	/**
	 * Has its composers offer the folders `provider` gives, such as the worktrees of the window's folder, until the returned
	 * disposable is disposed. The provider set last applies.
	 */
	setComposerFolderOptions(provider: () => IAgentsChatPartComposerFolderOptions): IDisposable;

	/**
	 * Aims the window's composers that aim at `from`, the folder their host aimed them at, at `to`, such as the location the
	 * window's folder moved to (see `IEditorWindowComposerFoldersService.retargetComposerFolders`).
	 */
	retargetComposerFolders(to: URI, from: URI): void;
}

/** The folders the composers of the chat part create sessions in, besides the folder each aims at, and how they show them. */
export type IAgentsChatPartComposerFolderOptions = IEditorWindowComposerFolderOptions;

/**
 * Shows again the chats of the chat part that the layout restored shown. With chat hidden or disabled as the window starts,
 * such as with AI features off, it hides the chat part instead, without its chats.
 */
export async function restoreAgentsChatPart(layoutService: IWorkbenchLayoutService, contextKeyService: IContextKeyService, chatPart: () => IAgentsChatPartService): Promise<void> {
	if (!layoutService.isVisible(Parts.CHAT_PART)) {
		return;
	}
	if (!contextKeyService.contextMatchesRules(AgentsViewAvailable)) {
		layoutService.setPartHidden(true, Parts.CHAT_PART);
		return;
	}
	await chatPart().restore();
}

/**
 * One chat of the chat part: a tab of it that shows a session's chat, or a new-session composer until a request it sends
 * starts its session (see {@link SessionChatEditorEntry}). It closes its tab as the chat ends.
 */
class AgentsChatPartChat extends SessionChatEditorEntry {

	readonly active: IObservable<boolean>;
	/**
	 * As the editor window's chat, it shows its session's changes as the working set of its input; as a new-session composer,
	 * the session header titled as new, as a chat shows it, rather than a tab.
	 */
	readonly hostOptions: ISessionViewHostOptions = { ...SESSION_CHAT_VIEW_WORKING_SET_HOST_OPTIONS, showComposerHeader: true, showTitleProgress: true };

	protected override get composerRendersTitle(): boolean {
		return !!this.hostOptions.showComposerHeader;
	}

	constructor(
		chatResource: URI,
		composer: ChatWindowComposerModel | undefined,
		readonly window: IObservable<IChatEditorWindow | undefined>,
		activeInput: IObservable<EditorInput | undefined>,
		private readonly _close: (chat: AgentsChatPartChat) => void,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IChatService chatService: IChatService,
		@ISessionsListModelService sessionsListModelService: ISessionsListModelService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(chatResource, sessionsManagementService, chatService, sessionsListModelService, sessionsProvidersService, configurationService);
		this.active = derived(this, reader => activeInput.read(reader) === this.input);
		this._register(this.onDidEnd(() => this._close(this)));
		this.start(composer, 'AgentsChatPart#open');
	}

	protected closeShown(): void {
		this._close(this);
	}
}

interface IStoredChatPartEditors {
	readonly chats: readonly string[];
	readonly active: number;
	/** In Single, what its composers kept as they closed or parked their input, the latest last. */
	readonly kept?: readonly IChatDraft[];
}

export class AgentsChatPartService extends Disposable implements IAgentsChatPartService {

	declare readonly _serviceBrand: undefined;

	private readonly _activeInput = observableValue<EditorInput | undefined>(this, undefined);
	/** Why the active tab became active: as {@link restore} showed it, or else as the user opened or picked it. */
	private readonly _activeReason = observableValue<IChatViewHostShownSession['reason']>(this, 'open');
	/** Increases with each explicit open of the active tab: each is reported again, as where its session works may matter again. */
	private readonly _explicitOpens = observableValue(this, 0);
	/** The tabs that {@link restore} shows, while it does: a chat the user opens meanwhile is opened, not restored. */
	private readonly _restoringTabs = new Set<EditorInput>();
	/** Why each tab that an open shows is to show, until it activates as it opens: the latest open of a tab supersedes earlier ones. */
	private readonly _pendingOpens = new Map<EditorInput, { readonly reason: IChatViewHostShownSession['reason'] }>();
	/**
	 * The tabs of new-session composers, until the user opens or picks one once it shows the session its first send created:
	 * that session shows as committed, not opened.
	 */
	private readonly _composerTabs = observableValue<ReadonlySet<EditorInput>>(this, new Set());
	readonly shownSession: IObservable<IChatViewHostShownSession | undefined>;
	/** The composer of each composer's tab, which the tab disposes. */
	private readonly _composerModels = new Map<EditorInput, ChatWindowComposerModel>();
	/** What the user picked last in its composers: the next new composer starts with it. */
	private readonly _picks: EditorWindowNewSessionPicks;
	/**
	 * In Single, what was typed in its new-session composers as they closed or parked their input, the latest last: each new
	 * composer takes the latest, as it has one new session at a time. Not loaded from what it stored until first needed
	 * ({@link _keptComposerInputs}).
	 */
	private _kept: IChatDraft[] | undefined;
	/** What was typed in each composer whose tab is closing, kept once it closed: not when its close is vetoed. */
	private readonly _closingComposerInputs = new WeakMap<EditorInput, IChatDraft>();
	/** Its tabs as they were last active, the latest first, across its groups. */
	private _recentInputs: EditorInput[] = [];
	/** While it closes all its chats, what their composers kept as they closed, to keep in the order they were used. */
	private _closingAllKept: { readonly input: EditorInput; readonly draft: IChatDraft }[] | undefined;
	readonly activeChat: IObservable<IAgentsChatPartChat | undefined>;

	private _part: IContentPart | undefined;
	/** How it shows its chats: as tabs, or one at a time, as a preview, as `sessions.showChatTabs` says. */
	private readonly _chatTabsMode: IObservable<string>;
	/**
	 * The tabs closing that show a chat, not a new-session composer, and whether the chat part had focus as they started to:
	 * closing the last of them in Single shows a composer, which takes focus only then.
	 */
	private readonly _closingChatTabs = new WeakMap<EditorInput, { readonly focused: boolean }>();
	/** The latest open of each group, by the group's id: see {@link _open}. */
	private readonly _openGenerations = new Map<GroupIdentifier, number>();
	/** Whether it closes all its chats, or its part closes: no composer shows in their place then. */
	private _closingAll = false;
	/** Whether its part closes with the window: its composers keep nothing then. */
	private _partClosing = false;
	private readonly _partStore = this._register(new DisposableStore());
	private readonly _chats = this._register(new DisposableMap<EditorInput, AgentsChatPartChat>());
	private _composers: ChatWindowComposers | undefined;
	private readonly _window: IChatEditorWindow;
	private _restored = false;
	/** Whether the chat part changes its visibility as it restores, which it reports as restoring, not opening or closing. */
	private _restoring = false;

	constructor(
		@ISessionHost readonly mainWindowHost: ISessionHost,
		@IAgentsChatPartFrame private readonly _frame: IAgentsChatPartFrame,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IChatViewFactory private readonly _chatViewFactory: IChatViewFactory,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IEditorWindowComposerFoldersService private readonly _composerFolders: IEditorWindowComposerFoldersService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IEditorWindowShownChatService shownChatService: IEditorWindowShownChatService,
		@IChatViewHostService private readonly _chatViewHostService: IChatViewHostService,
	) {
		super();
		this._picks = new EditorWindowNewSessionPicks(this._storageService);
		this._chatTabsMode = observableConfigValue<string>(SESSIONS_CHAT_TABS_SETTING, SESSIONS_CHAT_TABS_DEFAULT, this._configurationService);
		// What a closed composer kept is for the next one in Single only
		this._register(autorun(reader => {
			if (this._chatTabsMode.read(reader) === SessionsChatTabsMode.Multiple) {
				this._kept = [];
			}
		}));

		this.activeChat = derived(this, reader => {
			const input = this._activeInput.read(reader);
			return input ? this._chats.get(input)?.shown.read(reader) : undefined;
		});
		this.shownSession = derived(this, reader => {
			const input = this._activeInput.read(reader);
			const active = this.activeChat.read(reader);
			if (!input || !active) {
				return undefined;
			}
			// A composer shows a session only from its first send on, which made it that session, also in a tab the chat part
			// restored
			this._explicitOpens.read(reader);
			const reason = this._composerTabs.read(reader).has(input) ? 'commit' : this._activeReason.read(reader);
			return { resource: active.chat.resource, reason };
		});
		// The window's host, as its service, shows the active tab's chat, or the draft of its composer until that sends, as an
		// Agents window's host does: what acts on the session of the focused window, such as the composer's branch picker of a
		// folder, which checks out in it, acts on the draft
		this._register(shownChatService.bind(derived(this, reader => {
			const shown = this.activeChat.read(reader);
			if (shown) {
				return shown;
			}
			const input = this._activeInput.read(reader);
			const draft = input && this._chats.get(input)?.composer.read(reader)?.session.read(reader);
			return draft ? { session: draft, chat: draft.mainChat.read(reader) } : undefined;
		})));

		// The chats show beside the editor area, whose editors their Session Activity Bars read
		this._window = {
			layoutMode: constObservable(ChatWindowLayoutMode.SideBySide),
			inputOnly: constObservable(false),
			resizing: constObservable(false),
			mainPart: this._editorGroupsService.mainPart,
			toggleConversation: () => { },
		};

		this._register(this._layoutService.onDidChangePartVisibility(({ partId, visible }) => {
			if (partId === Parts.CHAT_PART && !this._restoring) {
				this._log(visible ? 'open' : 'close');
			}
		}));
		this._register(this._storageService.onWillSaveState(() => this._save()));

		// Chat turned off, such as as AI features are disabled, closes the chat part; it is off until chat starts
		const chatEnabledKeys = new Set([ChatContextKeys.enabled.key]);
		let chatEnabled = !!ChatContextKeys.enabled.getValue(_contextKeyService);
		this._register(_contextKeyService.onDidChangeContext(e => {
			if (!e.affectsSome(chatEnabledKeys)) {
				return;
			}
			const enabled = !!ChatContextKeys.enabled.getValue(_contextKeyService);
			if (chatEnabled && !enabled) {
				this._layoutService.setPartHidden(true, Parts.CHAT_PART);
			}
			chatEnabled = enabled;
		}));

		this._dropChatsOpenedElsewhere();

		// Last: what reads the chat part once it exists reads all of it, of this instance
		this._frame.didCreateContent(this);
	}

	retargetComposerFolders(to: URI, from: URI): void {
		this._composerFolders.retargetComposerFolders(to, from);
	}

	getComposerFolderOptions(): IAgentsChatPartComposerFolderOptions {
		return this._composerFolders.getComposerFolderOptions();
	}

	setComposerFolderOptions(provider: () => IAgentsChatPartComposerFolderOptions): IDisposable {
		return this._composerFolders.setComposerFolderOptions(provider);
	}

	private get composers(): ChatWindowComposers {
		if (!this._composers) {
			this._composers = this._register(this._instantiationService.createInstance(ChatWindowComposers, (resource: URI) => this._waitForSession(resource)));
		}
		return this._composers;
	}

	async openChat(session: ISession, chatResource: URI | undefined, options?: IAgentsChatPartOpenOptions): Promise<void> {
		const resource = chatResource ?? session.mainChat.get().resource;
		const chat = this._findChat(resource) ?? this._addChat(resource, undefined);
		await this._open(chat, options);
	}

	/** `target` with what the user picked last for what it leaves open, such as its agent and model. */
	private _withRememberedPicks(target: INewSessionTarget | undefined): INewSessionTarget | undefined {
		return applyRememberedNewSessionPicks(target, this._picks.read(), {
			toAllowedFolder: uri => this._composerFolders.toAllowedFolder(uri),
			isAgentAvailable: (providerId, sessionTypeId) => this._sessionsManagementService.getAllProviderSessionTypes().some(offered => offered.providerId === providerId && (!sessionTypeId || offered.sessionType.id === sessionTypeId)),
		});
	}

	async openComposer(target: INewSessionTarget | undefined, options?: IAgentsChatPartOpenOptions): Promise<void> {
		// A new session in the active tab while it is a composer that has not sent its session yet, as a chat window does
		const active = this._activeInput.get();
		const activeChat = active && this._chats.get(active);
		// In Single, its one new-session composer that has not sent its session yet, also behind the chat it shows
		const unsentComposer = this._isSingle() && !options?.sideBySide ? [...this._chats.values()].find(chat => chat.isComposer && !isSessionCreated(chat.session.get()) && !!this._groupOf(chat.input)) : undefined;
		if (unsentComposer && (unsentComposer !== activeChat || options?.newComposer) && this._aimReusedComposer(unsentComposer.input, options?.useRememberedPicks ? this._withRememberedPicks(target) : target, options)) {
			return this._open(unsentComposer, options);
		}
		if (activeChat?.isComposer && !options?.sideBySide && !options?.newComposer) {
			// It aims at the new session's folder, such as where the window's folder is now, unless the user picked another
			const composer = active && this._composerModels.get(active);
			if (composer && target?.folderUri) {
				composer.retargetFolder(target.folderUri);
			}
			return this._open(activeChat, options);
		}
		const resource = createChatWindowComposerResource();
		// What was typed in the composer it closed or parked last, in Single
		const input = this._isSingle() ? this._keptComposerInputs().pop() : undefined;
		const composer = this.composers.create(resource, { target: options?.useRememberedPicks ? this._withRememberedPicks(target) : target, ...this.getComposerFolderOptions(), ...(input ? { input: { input } } : {}) }, session => this.openChat(session, undefined));
		await this._open(this._addChat(resource, composer), options);
	}

	/**
	 * Aims the composer of the tab `input`, which a new session reuses, at `target`: all of it as a new session asks
	 * (`newComposer`), keeping what was typed in it; otherwise only the folder its host aimed it at, such as where the
	 * window's folder is now. Returns whether the composer can be reused, which it cannot while it sends.
	 */
	private _aimReusedComposer(input: EditorInput, target: INewSessionTarget | undefined, options: IAgentsChatPartOpenOptions | undefined): boolean {
		const composer = this._composerModels.get(input);
		if (!composer || !target) {
			return true;
		}
		if (options?.newComposer) {
			return composer.requestTarget(target);
		}
		if (target.folderUri) {
			composer.retargetFolder(target.folderUri);
		}
		return true;
	}

	async closeChat(chatResource: URI): Promise<void> {
		// Also the tab of a composer, by the main chat of its session that it did not send yet, as its session header closes it
		const chat = this._findChat(chatResource) ?? [...this._chats.values()].find(chat => chat.isComposer && isEqual(chat.session.get()?.mainChat.get().resource, chatResource));
		if (chat) {
			this._closeChat(chat);
		}
	}

	/**
	 * What its composers kept, loaded from what it stored once, as first needed: also when the window started with the chat part
	 * hidden, which restores no tabs.
	 */
	private _keptComposerInputs(): IChatDraft[] {
		this._kept ??= this._isSingle() ? [...this._readStored()?.kept ?? []] : [];
		return this._kept;
	}

	parkComposerInput(): boolean {
		if (!this._isSingle()) {
			return false;
		}
		const chat = [...this._chats.values()].find(chat => chat.isComposer && !isSessionCreated(chat.session.get()) && !!this._groupOf(chat.input));
		const composer = chat && this._composerModels.get(chat.input);
		const input = composer && this._sendableComposerInput(composer);
		if (!input) {
			return false;
		}
		this._keptComposerInputs().push(input);
		return true;
	}

	async closeAllChats(): Promise<void> {
		const groups = this._part?.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE) ?? [];
		// Its tabs, the most recently active first: as they were active, then as each group, the most recent first, orders the others
		const recency = [...this._recentInputs, ...groups.flatMap(group => group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE))];
		const rank = (input: EditorInput) => {
			const index = recency.indexOf(input);
			return index < 0 ? recency.length : index;
		};
		const kept: { readonly input: EditorInput; readonly draft: IChatDraft }[] = this._closingAllKept = [];
		this._closingAll = true;
		try {
			await Promise.all(groups.map(group => group.closeAllEditors()));
		} finally {
			this._closingAll = false;
			this._closingAllKept = undefined;
			// In Single, the least recently used first: the composer used last keeps its draft last, for the next to take first
			this._keptComposerInputs().push(...kept.sort((a, b) => rank(b.input) - rank(a.input)).map(entry => entry.draft));
		}
		this._hideIfEmpty();
	}

	isShowing(chatResource: URI): boolean {
		return !!this._findChat(chatResource);
	}

	async closeIdleComposers(): Promise<void> {
		const closes: Promise<unknown>[] = [];
		for (const chat of [...this._chats.values()]) {
			if (chat.isIdleComposer) {
				const group = this._groupOf(chat.input);
				if (group) {
					closes.push(group.closeEditor(chat.input));
				} else {
					this._chats.deleteAndDispose(chat.input);
				}
			}
		}
		await Promise.all(closes);
	}

	hasComposer(): boolean {
		for (const chat of this._chats.values()) {
			if (chat.isComposer) {
				return true;
			}
		}
		return false;
	}

	focus(): void {
		this._part?.activeGroup.focus();
	}

	async show(target: INewSessionTarget | undefined, options?: { readonly preserveFocus?: boolean; readonly useRememberedPicks?: boolean }): Promise<void> {
		await this.restore();
		if (!this._tabCount()) {
			return this.openComposer(target, { preserveFocus: options?.preserveFocus, useRememberedPicks: options?.useRememberedPicks });
		}
		this._layoutService.setPartHidden(false, Parts.CHAT_PART);
		if (!options?.preserveFocus) {
			this.focus();
		}
	}

	async getComposerWidget(): Promise<IChatWidget | undefined> {
		const active = this._activeInput.get();
		const chat = active && this._chats.get(active);
		if (!chat?.isComposer) {
			return undefined;
		}
		// Its view, and the widget of its input, show once its editor renders
		const widget = derived(reader => chat.view.read(reader)?.composerView.read(reader)?.chatWidget);
		const cts = new CancellationTokenSource();
		try {
			return await raceTimeout(waitForState(widget, widget => !!widget, undefined, cts.token).catch(() => undefined), COMPOSER_VIEW_TIMEOUT, () => cts.cancel());
		} finally {
			cts.dispose();
		}
	}

	async restore(): Promise<void> {
		// Once it shows chats opened since the window started, those of before are no longer the ones to show again
		if (this._restored || this._part) {
			return;
		}
		this._restored = true;
		this._restoring = true;
		try {
			await this._restoreChats();
		} finally {
			this._restoring = false;
		}
	}

	private async _restoreChats(): Promise<void> {
		const stored = this._readStored();
		const claimed: URI[] = [];
		const chats: AgentsChatPartChat[] = [];
		for (const value of stored?.chats ?? []) {
			let resource: URI;
			try {
				resource = URI.parse(value);
			} catch {
				continue;
			}
			if (isChatWindowComposerResource(resource)) {
				claimed.push(resource);
				const restored = await this.composers.restore(resource, session => this.openChat(session, undefined), this.getComposerFolderOptions());
				if (restored?.kind === 'composer') {
					chats.push(this._addChat(resource, restored.composer));
				} else if (restored?.kind === 'session') {
					chats.push(this._findChat(restored.session.mainChat.get().resource) ?? this._addChat(restored.session.mainChat.get().resource, undefined));
				}
			} else {
				chats.push(this._findChat(resource) ?? this._addChat(resource, undefined));
			}
		}
		this.composers.didFinishRestore(claimed);

		if (!chats.length) {
			// Nothing to show again: the layout's chat part, shown or not, is closed
			this._layoutService.setPartHidden(true, Parts.CHAT_PART);
			return;
		}

		const part = this._ensurePart();
		const active = chats[Math.min(Math.max(stored?.active ?? 0, 0), chats.length - 1)];
		if (this._isSingle()) {
			// Stored most recent first: a group puts an editor it opens inactive right after its active one, so the active one
			// opens first and the others from the least recent
			const others = chats.filter(chat => chat !== active).reverse();
			chats.splice(0, chats.length, active, ...others);
		}
		for (const chat of chats) {
			this._restoringTabs.add(chat.input);
		}
		try {
			// Only the active tab shows its chat: the others create their views once they show. A group activates the first
			// editor it opens, inactive or not, so the active tab opens last.
			await this._editorService.openEditors(chats.map(chat => ({ editor: chat.input, options: { pinned: true, preserveFocus: true, inactive: true } })), part.activeGroup);
			await this._editorService.openEditor(active.input, { pinned: true, preserveFocus: true }, part.activeGroup);
		} finally {
			this._restoringTabs.clear();
		}
		this.composers.didOpen(chats.map(chat => chat.chat.get()));
		if (this._layoutService.isVisible(Parts.CHAT_PART)) {
			this._log('restore');
		}
	}

	/** How many chats the chat part shows in its tabs, shown or not. */
	private _tabCount(): number {
		return this._part?.groups.reduce((count, group) => count + group.editors.filter(input => this._chats.has(input)).length, 0) ?? 0;
	}

	private _log(action: AgentsChatPartAction): void {
		logAgentsChatPartAction(this._telemetryService, action, this._tabCount());
	}

	private async _open(chat: AgentsChatPartChat, options: IAgentsChatPartOpenOptions | undefined): Promise<void> {
		const part = this._ensurePart();
		this._layoutService.setPartHidden(false, Parts.CHAT_PART);
		const group = this._groupOf(chat.input)
			?? (options?.sideBySide && !part.activeGroup.isEmpty ? part.addGroup(part.activeGroup, GroupDirection.RIGHT) : part.activeGroup);
		// An explicit open of a tab that the chat part still restores is the user's: it is opened, not restored
		this._restoringTabs.delete(chat.input);
		// Why it shows, from before the tab can activate as it opens, which reports it as it does
		const request = { reason: getChatViewHostOpenReason(options) };
		this._pendingOpens.set(chat.input, request);
		// Its open is the group's latest until another opens there, which supersedes it, such as one that cancels it
		const generation = (this._openGenerations.get(group.id) ?? 0) + 1;
		this._openGenerations.set(group.id, generation);
		const isCurrentOpen = () => this._openGenerations.get(group.id) === generation && group.activeEditor === chat.input;
		let unconsumed = false;
		let pane: IEditorPane | undefined;
		try {
			pane = await this._editorService.openEditor(chat.input, { pinned: true, preserveFocus: options?.preserveFocus }, group);
		} finally {
			// Not taken as the tab activated: it was the active tab already, unless a later open of it supersedes this one
			unconsumed = this._pendingOpens.get(chat.input) === request;
			if (unconsumed) {
				this._pendingOpens.delete(chat.input);
			}
		}
		// Only an open that showed its chat, and that no later open superseded, replaces the others: a superseded one, which can
		// still resolve after the later one showed its chat, would close that
		if (this._isSingle() && pane && isCurrentOpen()) {
			await this._closeUntouchedComposers(group, chat.input, isCurrentOpen);
		}
		this.composers.didOpen([chat.chat.get()]);
		// Opened again while it is the active tab, such as a tab the user picks in a sessions list: reported again
		if (unconsumed && this._activeInput.get() === chat.input) {
			transaction(tx => {
				this._activeReason.set(request.reason, tx);
				this._settleComposerTab(chat.input, tx);
				this._explicitOpens.set(this._explicitOpens.get() + 1, tx);
			});
		}
	}

	/**
	 * A chat that the user opens elsewhere in the window, in the Chat view while no host replaces it, or in an editor of the
	 * editor area, leaves the chats it keeps: it shows in one place.
	 */
	private _dropChatsOpenedElsewhere(): void {
		const drop = (resource: URI | undefined) => {
			const chat = resource && this._findChat(resource);
			if (chat && !chat.isComposer) {
				this._closeChat(chat);
			}
		};
		this._register(autorun(reader => {
			const shown = this._chatViewHostService.shownSession.read(reader);
			// Not one it restores as the window starts, before the chat part's host replaces it
			if (shown && shown.reason !== 'restore' && this._chatViewHostService.chatViewHosts.read(reader) && !this._chatViewHostService.replaced.read(reader)) {
				drop(shown.resource);
			}
		}));
		this._register(this._editorService.onDidVisibleEditorsChange(() => {
			for (const pane of this._editorService.visibleEditorPanes) {
				if (!this._part?.groups.includes(pane.group)) {
					drop(pane.input?.resource);
				}
			}
		}));
	}

	private _isSingle(): boolean {
		return this._chatTabsMode.get() !== SessionsChatTabsMode.Multiple;
	}

	/**
	 * In Single, it shows one chat at a time, and keeps the others it opened, as an editor group does, to show again as the
	 * chat it shows closes: the chat it opens replaces only the untouched new-session composers of its group.
	 */
	private async _closeUntouchedComposers(group: IEditorGroup, input: EditorInput, isCurrent: () => boolean): Promise<void> {
		for (const editor of group.editors.filter(editor => editor !== input && !!this._chats.get(editor)?.isComposer && !this._keepsComposer(editor))) {
			// Until a later open supersedes it, also while it closes the others
			if (!isCurrent()) {
				return;
			}
			await group.closeEditor(editor);
		}
	}

	/** Whether `editor` is a new-session composer with something typed or attached, or a send under way. */
	private _keepsComposer(editor: EditorInput): boolean {
		const chat = this._chats.get(editor);
		return !!chat?.isComposer && !chat.isPristineComposer;
	}

	/** A composer's tab that the user opens or picks once it shows its session is a chat's: it shows as opened, not committed. */
	private _settleComposerTab(input: EditorInput, tx: ITransaction): void {
		const tabs = this._composerTabs.get();
		if (tabs.has(input) && this._chats.get(input)?.shown.get()) {
			this._composerTabs.set(new Set([...tabs].filter(tab => tab !== input)), tx);
		}
	}

	private _findChat(resource: URI): AgentsChatPartChat | undefined {
		for (const [, chat] of this._chats) {
			if (isEqual(chat.chat.get(), resource)) {
				return chat;
			}
		}
		return undefined;
	}

	private _groupOf(input: EditorInput): IEditorGroup | undefined {
		return this._part?.groups.find(group => group.contains(input));
	}

	private _addChat(resource: URI, composer: ChatWindowComposerModel | undefined): AgentsChatPartChat {
		const chat = this._instantiationService.createInstance(AgentsChatPartChat, resource, composer, constObservable(this._window), this._activeInput, (chat: AgentsChatPartChat) => this._closeChat(chat));
		this._chats.set(chat.input, chat);
		if (composer) {
			this._composerTabs.set(new Set([...this._composerTabs.get(), chat.input]), undefined);
			this._composerModels.set(chat.input, composer);
			// It follows the window's folder with the window's other composers, until its tab disposes it
			const registration = new DisposableStore();
			registration.add(this._composerFolders.registerComposer(composer));
			registration.add(composer.onDidPickTarget(picked => this._picks.store(picked)));
			Event.once(composer.onWillDispose)(() => registration.dispose());
		}
		// It stays in the chat part: its editor shows there
		chat.input.setMoveRestriction({
			reason: localize('agentsChatPart.cannotMove', "A chat stays in the chat area."),
			canMoveTo: group => !!this._part?.groups.some(candidate => candidate.id === group),
		});
		// Its chat goes with its editor: the chat no longer disposes an editor that is disposing (see SessionChatEditorEntry)
		Event.once(chat.input.onWillDispose)(() => {
			this._composerModels.delete(chat.input);
			if (this._composerTabs.get().has(chat.input)) {
				this._composerTabs.set(new Set([...this._composerTabs.get()].filter(tab => tab !== chat.input)), undefined);
			}
			this._chats.deleteAndDispose(chat.input);
		});
		return chat;
	}

	private _closeChat(chat: AgentsChatPartChat): void {
		const group = this._groupOf(chat.input);
		if (group) {
			void group.closeEditor(chat.input).catch(onUnexpectedError);
		} else {
			this._chats.deleteAndDispose(chat.input);
		}
	}

	private _ensurePart(): IContentPart {
		if (this._part) {
			return this._part;
		}

		this._partStore.add(registerSessionChatViewEditor());
		// The part fills the chat part, which lays it out
		const container = $('.agents-chat-part');
		container.style.width = '100%';
		container.style.height = '100%';
		// The menus of its groups tell it apart from the editor area, such as its More Actions, which offer to close it
		const scopedContextKeyService = this._contextKeyService.createScoped(container);
		InAgentsChatPartContext.bindTo(scopedContextKeyService).set(true);
		const part = this._part = this._editorGroupsService.createEditorPart({
			container,
			label: localize('agentsChatPart.label', "Chat"),
			services: new ServiceCollection([ISessionHost, this.mainWindowHost], [IContextKeyService, scopedContextKeyService]),
			// With one tab, the session header of the chat it shows is its title, as alone in its group
			singleTabTitleProvidedByEditor: true,
		});
		this._partStore.add(this._frame.part.setContent(part));
		// It shows its chats as a chat window's chat part does: over the chat surface, with the same options of its tabs
		const background = this._chatViewFactory.createChatBackground?.(container, this._instantiationService);
		if (background) {
			this._partStore.add(background);
		}
		// Its tabs follow the chat tabs of sessions, as a session's chats do, not the editor area's: by default one tab, of the
		// active chat, or one of each chat
		this._partStore.add(enforceChatPartOptions(part, derived(reader => ({
			...getChatWindowMainPartOptions(undefined),
			showTabs: this._chatTabsMode.read(reader) === SessionsChatTabsMode.Multiple ? 'multiple' : 'single',
		}))));
		// The part goes with the window; its chats are not dirty, so nothing moves back to the editor area
		this._partStore.add(toDisposable(() => {
			this._closingAll = true;
			this._partClosing = true;
			this._recentInputs = [];
			part.forceClose();
			this._kept = [];
		}));
		// After the part, whose context is scoped in it
		this._partStore.add(scopedContextKeyService);

		// The active tab is the window's active chat
		const groupListeners = this._partStore.add(new DisposableMap<IEditorGroup>());
		const updateActive = () => {
			const active = part.activeGroup.activeEditor ?? undefined;
			if (active !== this._activeInput.get()) {
				// As an open asks it to show, or else restored while the chat part restores it, and opened otherwise
				const pending = active && this._pendingOpens.get(active);
				if (active && pending) {
					this._pendingOpens.delete(active);
				}
				transaction(tx => {
					this._activeReason.set(pending ? pending.reason : active && this._restoringTabs.has(active) ? 'restore' : 'open', tx);
					this._activeInput.set(active, tx);
					if (active) {
						this._settleComposerTab(active, tx);
					}
				});
				if (active) {
					this._recentInputs = [active, ...this._recentInputs.filter(input => input !== active)];
				}
			}
		};
		const trackGroup = (group: IEditorGroup) => {
			const store = new DisposableStore();
			// Before the tab disposes, which its chat goes with. A tab that moves to another of its groups stays open: it keeps its
			// chat, its draft and when it was active
			store.add(group.onWillCloseEditor(({ editor, context }) => {
				if (context === EditorCloseContext.MOVE) {
					return;
				}
				if (this._chats.get(editor) && !this._chats.get(editor)?.isComposer) {
					this._closingChatTabs.set(editor, { focused: this._layoutService.hasFocus(Parts.CHAT_PART) });
				}
				this._captureClosingComposerInput(editor);
			}));
			store.add(group.onDidActiveEditorChange(() => {
				updateActive();
				this._hideIfEmpty();
			}));
			store.add(group.onDidCloseEditor(({ editor, context }) => {
				if (context === EditorCloseContext.MOVE) {
					updateActive();
					return;
				}
				const kept = this._closingComposerInputs.get(editor);
				if (kept) {
					this._closingComposerInputs.delete(editor);
					if (this._closingAllKept) {
						this._closingAllKept.push({ input: editor, draft: kept });
					} else {
						this._keptComposerInputs().push(kept);
					}
				}
				this._recentInputs = this._recentInputs.filter(input => input !== editor);
				const closedChat = this._closingChatTabs.get(editor);
				this._closingChatTabs.delete(editor);
				updateActive();
				this._didCloseTab(closedChat);
			}));
			groupListeners.set(group, store);
		};
		part.groups.forEach(trackGroup);
		this._partStore.add(part.onDidAddGroup(trackGroup));
		this._partStore.add(part.onDidRemoveGroup(group => groupListeners.deleteAndDispose(group)));
		this._partStore.add(part.onDidChangeActiveGroup(updateActive));
		updateActive();

		return part;
	}

	/**
	 * In Single, closing its new-session composer keeps what was typed in it, without asking, for its next one, also as it
	 * closes all its chats: not as its part closes or the window shuts down, nor a composer that sends its session.
	 */
	private _captureClosingComposerInput(editor: EditorInput): void {
		this._closingComposerInputs.delete(editor);
		const composer = this._composerModels.get(editor);
		if (!composer || !this._isSingle() || this._partClosing || this._lifecycleService.willShutdown || isSessionCreated(this._chats.get(editor)?.session.get())) {
			return;
		}
		const input = this._sendableComposerInput(composer);
		if (input) {
			this._closingComposerInputs.set(editor, input);
		}
	}

	/** What was typed or attached in `composer`, unless nothing was or it sends. */
	private _sendableComposerInput(composer: ChatWindowComposerModel): IChatDraft | undefined {
		const state = composer.input.get();
		return !composer.input.isSubmitting && !state.attempt && (state.input.inputText || state.input.attachments.length) ? state.input : undefined;
	}

	/**
	 * Closing a chat shows the chat opened before it, as an editor group does. Closing the last chat closes the chat part, but
	 * in Single, where it shows one chat at a time, it shows a new-session composer, as a new session: closing that closes the
	 * chat part. Closing its last chat while it is hidden leaves it hidden and empty. The composer takes focus only when the
	 * chat part had it, not when the chat closed as it opened elsewhere, such as in an editor the user opened.
	 */
	private _didCloseTab(closedChat: { readonly focused: boolean } | undefined): void {
		// Not while it is hidden, such as as its chat moves to the Chat view: that would show it
		if (closedChat && this._isSingle() && !this._closingAll && !this._lifecycleService.willShutdown && this._layoutService.isVisible(Parts.CHAT_PART) && this._part?.groups.every(group => group.isEmpty)) {
			this.openComposer(getEditorWindowComposerTarget(this._workspaceContextService, this._editorService), { preserveFocus: !closedChat.focused, useRememberedPicks: true }).catch(onUnexpectedError);
			return;
		}
		this._hideIfEmpty();
	}

	/** Closing the last chat closes the chat part, which gives the editor area its width back. */
	private _hideIfEmpty(): void {
		if (this._lifecycleService.willShutdown || !this._part || this._part.groups.some(group => !group.isEmpty)) {
			return;
		}
		this._layoutService.setPartHidden(true, Parts.CHAT_PART);
	}

	private _readStored(): IStoredChatPartEditors | undefined {
		const raw = this._storageService.get(CHAT_PART_EDITORS_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return undefined;
		}
		try {
			const value = parse(raw) as Partial<Record<keyof IStoredChatPartEditors, unknown>>;
			if (!Array.isArray(value.chats) || !value.chats.every(chat => typeof chat === 'string')) {
				return undefined;
			}
			const kept = Array.isArray(value.kept) ? value.kept.flatMap(draft => {
				try {
					return [fromStoredChatDraft(draft)];
				} catch {
					return [];
				}
			}) : [];
			return { chats: value.chats, active: typeof value.active === 'number' ? value.active : 0, kept };
		} catch {
			return undefined;
		}
	}

	private _save(): void {
		if (!this._part) {
			// Not yet restored, it keeps the chats it stored, and its kept drafts unless it changed them, such as as it forgot
			// them leaving Single
			if (this._kept !== undefined) {
				const stored = this._readStored();
				this._writeStored(stored?.chats ?? [], stored?.active ?? 0, this._isSingle() ? this._kept : []);
			}
			return;
		}
		// In Single, most recent first, to show again in that order as it closes them
		const inputs = this._part.groups.flatMap(group => this._isSingle() ? group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE) : group.editors).filter(input => this._chats.has(input));
		this._writeStored(
			inputs.map(input => this._chats.get(input)!.chat.get().toString()),
			Math.max(0, inputs.indexOf(this._activeInput.get() ?? inputs[0])),
			this._isSingle() ? this._keptComposerInputs() : [],
		);
	}

	private _writeStored(chats: readonly string[], active: number, kept: readonly IChatDraft[]): void {
		if (!chats.length && !kept.length) {
			this._storageService.remove(CHAT_PART_EDITORS_STORAGE_KEY, StorageScope.WORKSPACE);
			return;
		}
		const value = { chats, active, ...(kept.length ? { kept: kept.map(toStoredChatDraft) } : {}) };
		this._storageService.store(CHAT_PART_EDITORS_STORAGE_KEY, stringify(value), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private async _waitForSession(resource: URI): Promise<ISession | undefined> {
		return (await waitForSessionChat(this._sessionsManagementService, resource, RESTORE_SESSION_TIMEOUT))?.session;
	}

}
