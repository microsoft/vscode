/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChat, ISession, ISessionType, ISessionWorkspace } from './session.js';
import { IDeleteChatOptions, ISendRequestOptions as ISessionsProviderSendRequestOptions } from './sessionsProvider.js';

/**
 * Options for sending a request through the sessions management service.
 *
 * Extends the provider-level {@link ISessionsProviderSendRequestOptions} with
 * management-only concerns that the provider is not aware of.
 */
export interface ISendRequestOptions extends ISessionsProviderSendRequestOptions {
	/**
	 * Start the session without navigating into it: the composer stays put and
	 * the started session/chat shows up in the sessions list. Honored by
	 * {@link ISessionsManagementService.sendNewChatRequest} (new sessions) and
	 * {@link ISessionsManagementService.sendRequest} (a new chat within an
	 * existing session).
	 */
	readonly background?: boolean;
}

/**
 * A (provider, session-type) pair returned by
 * {@link ISessionsManagementService.getSessionTypesForFolder} so the UI can
 * group session types by provider when more than one provider can serve the
 * same folder.
 */
export interface IProviderSessionType {
	readonly providerId: string;
	readonly sessionType: ISessionType;
}

/**
 * Options for {@link ISessionsManagementService.createNewSession}.
 */
export interface ICreateNewSessionOptions {
	/**
	 * Force creation through a specific provider. When omitted, the service
	 * iterates registered providers and picks the first one whose
	 * {@link ISessionsProvider.resolveWorkspace} succeeds for the folder URI
	 * (and, when `sessionTypeId` is given, whose `getSessionTypes` includes it).
	 */
	readonly providerId?: string;
	/**
	 * The session type to use. When omitted, defaults to the first type the
	 * chosen provider advertises for the folder URI.
	 */
	readonly sessionTypeId?: string;
	/**
	 * Optional model identifier to apply to the new session via
	 * {@link ISessionsProvider.setModel}. If the provider throws, the
	 * stranded draft is disposed and the error propagates.
	 */
	readonly modelId?: string;
	/**
	 * Optional chat mode identifier (typically a value from `ChatModeKind`)
	 * to apply via {@link ISessionsProvider.setMode}. Skipped if the
	 * provider does not implement the setter.
	 */
	readonly modeId?: string;
	/**
	 * Optional permission level (typically a value from
	 * `ChatPermissionLevel`) to apply via
	 * {@link ISessionsProvider.setPermissionLevel}. Skipped if the provider
	 * does not implement the setter.
	 */
	readonly permissionLevel?: string;
	/**
	 * Optional worktree isolation mode (`worktree` or `workspace`) to apply
	 * via {@link ISessionsProvider.setIsolationMode}. Skipped if the
	 * provider does not implement the setter.
	 */
	readonly isolationMode?: string;
	/**
	 * Optional git branch to apply via {@link ISessionsProvider.setBranch}.
	 * Skipped if the provider does not implement the setter.
	 */
	readonly branch?: string;
}

/**
 * Options for {@link ISessionsManagementService.createNewChatInSession}.
 */
export interface ICreateNewChatInSessionOptions {
	/**
	 * Always create a fresh chat instead of reusing an existing untitled one.
	 * Used to reset the composer right after a background send, where the
	 * just-sent chat may still transiently report `Untitled`.
	 */
	readonly forceNew?: boolean;
}

/**
 * Event fired when sessions change within a provider.
 */
export interface ISessionsChangeEvent {
	readonly added: readonly ISession[];
	readonly removed: readonly ISession[];
	readonly changed: readonly ISession[];
}

/**
 * Payload for {@link ISessionsManagementService.onDidSendRequest}.
 */
export interface ISendRequestSentEvent {
	readonly session: ISession;
	readonly chat: IChat;
	readonly isNewSession: boolean;
	readonly isNewChat: boolean;
	readonly options: ISendRequestOptions;
}

/**
 * Payload for {@link ISessionsManagementService.onDidToggleSessionStickiness}.
 */
export interface IToggleSessionStickinessEvent {
	readonly session: ISession;
	/** The session's stickiness state after the toggle. */
	readonly sticky: boolean;
}

/**
 * An active session extends {@link ISession} with the currently focused chat.
 */
export interface IActiveSession extends ISession {
	/** The currently active chat within this session. */
	readonly activeChat: IObservable<IChat>;

	readonly isCreated: IObservable<boolean>;

	/** Whether this session is sticky in the sessions part's grid. */
	readonly sticky: IObservable<boolean>;

	/**
	 * The chats shown as tabs in the tab strip ({@link ISession.chats} minus
	 * closed ones). Read-only view state: closing/reopening is a view operation
	 * driven through the sessions (view) service, like {@link sticky}.
	 */
	readonly openChats: IObservable<readonly IChat[]>;

	/** The closed (hidden from the tab strip) but still reopenable chats. Deleted chats drop out. */
	readonly closedChats: IObservable<readonly IChat[]>;

	/** The most recently closed chat, or `undefined` if none. */
	readonly lastClosedChat: IChat | undefined;

	/**
	 * The chats shown as tabs in the tab strip: {@link openChats} with subagent
	 * (tool-origin) chats hidden by default, in the provider's order. A subagent
	 * surfaces as a tab only once explicitly opened.
	 */
	readonly visibleChatTabs: IObservable<readonly IChat[]>;

	/**
	 * Whether the chat tab strip should be shown: the session has more than one
	 * chat (counting closed, non-tool chats), or its single remaining chat has a
	 * title that diverged from the session title.
	 */
	readonly shouldShowChatTabs: IObservable<boolean>;
}

/**
 * Sessions split into recently opened and other (never opened) groups, used to
 * populate the sessions picker.
 */
export interface IRecentlyOpenedSessions {
	/** Sessions opened in this workspace, most recently opened first. */
	readonly recent: ISession[];
	/** Sessions never opened in this workspace, most recently updated first. */
	readonly other: ISession[];
}

/**
 * An active session item extends IChatSessionItem with repository information.
 * - For agent session items: repository is the workingDirectory from metadata
 * - For new sessions: repository comes from the session option with id 'repository'
 */
export interface ISessionsManagementService {
	readonly _serviceBrand: undefined;

	// -- Sessions --

	/**
	 * Get all sessions from all registered providers.
	 */
	getSessions(): ISession[];

	/**
	 * Get a session by its resource URI.
	 */
	getSession(resource: URI): ISession | undefined;

	/**
	 * Get the session and chat that own the given chat resource URI.
	 */
	getSessionForChatResource(resource: URI): { session: ISession; chat: IChat } | undefined;

	/**
	 * Get all session types from all registered providers.
	 */
	getAllSessionTypes(): ISessionType[];

	/**
	 * Get all session types that can serve the given workspace URI, across all
	 * registered providers. Returns one entry per (provider × supported type),
	 * so the UI can group types by provider when more than one provider can
	 * serve the same workspace.
	 */
	getSessionTypesForFolder(folderUri: URI): IProviderSessionType[];

	/**
	 * Get all session types offered for quick chats, across every provider that
	 * sets {@link ISessionsProvider.supportsQuickChats}. Returns one entry per
	 * (provider × advertised type) so the UI can let the user pick a type when
	 * creating a quick chat.
	 */
	getQuickChatSessionTypes(): IProviderSessionType[];

	/**
	 * Resolve a workspace URI to a workspace using the first provider whose
	 * {@link ISessionsProvider.resolveWorkspace} succeeds. Returns `undefined`
	 * when no registered provider can resolve the URI.
	 */
	resolveWorkspace(workspaceUri: URI): { providerId: string; workspace: ISessionWorkspace } | undefined;

	/**
	 * Fires when available session types change (providers added/removed).
	 */
	readonly onDidChangeSessionTypes: Event<void>;

	/**
	 * Fires when sessions change across any provider.
	 */
	readonly onDidChangeSessions: Event<ISessionsChangeEvent>;
	/**
	 * Fires when a brand-new session is started by this window via
	 * {@link sendNewChatRequest}.
	 */
	readonly onDidStartSession: Event<ISession>;

	/**
	 * Fires immediately before a chat request is sent from this window via
	 * {@link sendNewChatRequest} or {@link sendRequest}. Listeners can use this
	 * to prewarm caches whose result is consumed by {@link onDidSendRequest}.
	 */
	readonly onWillSendRequest: Event<ISession>;

	/**
	 * Fires after a chat request was successfully sent from this window via
	 * {@link sendNewChatRequest} or {@link sendRequest}.
	 */
	readonly onDidSendRequest: Event<ISendRequestSentEvent>;

	/** Fires after a session was successfully archived via {@link archiveSession}. */
	readonly onDidArchiveSession: Event<ISession>;
	/** Fires after a session was successfully unarchived via {@link unarchiveSession}. */
	readonly onDidUnarchiveSession: Event<ISession>;
	/** Fires after a session was successfully deleted via {@link deleteSession}. */
	readonly onDidDeleteSession: Event<ISession>;
	/** Fires after a chat was successfully deleted via {@link deleteChat}. */
	readonly onDidDeleteChat: Event<ISession>;
	/** Fires after a chat was successfully renamed via {@link renameChat}. */
	readonly onDidRenameChat: Event<ISession>;
	/** Fires after a session was successfully renamed via {@link renameSession}. */
	readonly onDidRenameSession: Event<ISession>;
	/** Fires after a provider replaced a session (e.g. a draft graduating into a committed session). */
	readonly onDidReplaceSession: Event<{ readonly from: ISession; readonly to: ISession }>;
	/**
	 * Fires when the in-progress new session is discarded via
	 * {@link discardNewSession}: either the composer draft is abandoned without
	 * sending, or {@link sendRequest} sends into an existing session (which
	 * discards any pending draft first). Sending the draft itself via
	 * {@link sendNewChatRequest} clears it without firing this event.
	 */
	readonly onDidDiscardNewSession: Event<ISession>;

	// -- New Session --

	/**
	 * Observable for the in-progress new session (composed but not yet sent),
	 * or `undefined` when there is none. Owned by the model; consumers read it
	 * reactively (e.g. the view restores it into the composer slot).
	 */
	readonly newSession: IObservable<ISession | undefined>;

	/**
	 * Create a new session for the given folder.
	 *
	 * When `options.providerId` is omitted, iterates registered providers and
	 * picks the first one whose {@link ISessionsProvider.resolveWorkspace}
	 * succeeds for `folderUri` (and, when `options.sessionTypeId` is given,
	 * whose `getSessionTypes` includes it). When `options.sessionTypeId` is
	 * omitted, defaults to the chosen provider's first advertised type for
	 * the folder.
	 *
	 * Tracks the created session as the new session and returns it. Does not
	 * make it active/visible — the `ISessionsService` shows it.
	 */
	createNewSession(folderUri: URI, options?: ICreateNewSessionOptions): ISession;

	/**
	 * Create a new **quick chat**: a workspace-less session not scoped to any
	 * folder (`ISession.workspace` resolves to `undefined`).
	 *
	 * When `options.providerId` is omitted, picks the first registered provider
	 * (by `order`) that sets {@link ISessionsProvider.supportsQuickChats}. When
	 * `options.sessionTypeId` is omitted, defaults to the chosen provider's
	 * first advertised quick-chat session type.
	 *
	 * Tracks the created session as the new session and returns it. Does not
	 * make it active/visible — the `ISessionsService` shows it.
	 */
	createQuickChat(options?: ICreateNewSessionOptions): ISession;

	/**
	 * Create (or reuse an existing untitled) chat in the given session via its
	 * provider so it can be shown as the new-chat-in-session view. Pass
	 * {@link ICreateNewChatInSessionOptions.forceNew} to always create a fresh
	 * chat. Returns the chat, or `undefined` when the provider could not be
	 * resolved.
	 */
	createNewChatInSession(session: ISession, options?: ICreateNewChatInSessionOptions): Promise<IChat | undefined>;

	/**
	 * Fork an existing chat into a new chat within the same session, seeded
	 * with the source chat's history up to and including the given turn. Used
	 * for the fork gesture on sessions that support multiple chats.
	 *
	 * @param session The session containing the source chat.
	 * @param sourceChat The resource URI of the chat to fork from.
	 * @param turnId The ID of the last turn (request) to include in the fork.
	 */
	forkChatInSession(session: ISession, sourceChat: URI, turnId: string): Promise<IChat>;

	/**
	 * Discard the in-progress new session, disposing it through its provider to
	 * release the eagerly-acquired backend session.
	 *
	 * - When `session` is omitted, discards the current new session
	 *   unconditionally.
	 * - When `session` is provided, discards only if it is the current new
	 *   session (so closing an unrelated session never drops the draft).
	 *
	 * No-op when there is no matching new session.
	 */
	discardNewSession(session?: ISession): void;

	/**
	 * Send a request, creating a new chat in the session.
	 *
	 * When {@link ISendRequestOptions.background} is set, the new-session view
	 * is kept in place (the composer does not navigate into the started
	 * session); the started session still appears in the sessions list.
	 */
	sendNewChatRequest(session: ISession, options: ISendRequestOptions): Promise<void>;

	/**
	 * Create a new session for the given folder and send a chat request to it,
	 * without navigating into the started session.
	 *
	 * The started session appears in the sessions list once the provider
	 * commits it, while the user's current view is left untouched. Intended for
	 * callers outside the new-session composer that want to kick off a session
	 * programmatically. Returns the committed session, or `undefined` if the
	 * service was disposed during the send. Rejects (after disposing the
	 * stranded draft) if the send fails.
	 */
	createAndSendNewChatRequest(folderUri: URI, options: ISendRequestOptions, createOptions?: ICreateNewSessionOptions): Promise<ISession | undefined>;

	/**
	 * Send a request for an existing chat within a session.
	 *
	 * When {@link ISendRequestOptions.background} is set, the send runs
	 * fire-and-forget and the view is not navigated into the sent chat, so the
	 * caller can keep composing (e.g. start a parallel conversation).
	 */
	sendRequest(session: ISession, chat: IChat, options: ISendRequestOptions): Promise<void>;

	// -- Session Actions --

	/** Archive a session. */
	archiveSession(session: ISession): Promise<void>;

	/** Unarchive a session. */
	unarchiveSession(session: ISession): Promise<void>;

	/**
	 * Mark a session as read or unread through its provider, which owns and
	 * persists the read state and reflects it on {@link ISession.isRead}.
	 */
	setSessionReadState(session: ISession, isRead: boolean): Promise<void>;

	/** Mark a session as read through its provider. */
	markRead(session: ISession): Promise<void>;

	/** Mark a session as unread through its provider. */
	markUnread(session: ISession): Promise<void>;

	/** Mark all of the given sessions as read through their providers. */
	markAllRead(sessions: readonly ISession[]): Promise<void>;

	/** Delete a session. */
	deleteSession(session: ISession): Promise<void>;

	/**
	 * Delete multiple sessions at once.
	 *
	 * Groups the sessions by provider and deletes each group through its
	 * provider's batch {@link ISessionsProvider.deleteSessions}. Fires
	 * {@link onDidDeleteSession} once per deleted session.
	 */
	deleteSessions(sessions: readonly ISession[]): Promise<void>;

	/** Delete a single chat from a session by its URI. */
	deleteChat(session: ISession, chatUri: URI, options?: IDeleteChatOptions): Promise<void>;

	/** Rename a chat within a session. */
	renameChat(session: ISession, chatUri: URI, title: string): Promise<void>;

	/** Rename a session, independently of its chats. */
	renameSession(session: ISession, title: string): Promise<void>;
}

export const ISessionsManagementService = createDecorator<ISessionsManagementService>('sessionsManagementService');

//#endregion
