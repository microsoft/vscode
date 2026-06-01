/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IChat, ISession, ISessionType, ISessionWorkspace } from './session.js';
import { ISendRequestOptions } from './sessionsProvider.js';

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
}

export const ActiveSessionSupportsMultiChatContext = new RawContextKey<boolean>('activeSessionSupportsMultiChat', false, localize('activeSessionSupportsMultiChat', "Whether the active session supports multiple chats"));

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
	/** Fires after a session's stickiness was toggled via {@link toggleSessionStickiness}. */
	readonly onDidToggleSessionStickiness: Event<IToggleSessionStickinessEvent>;

	// -- Active Session --

	/**
	 * Observable for the currently active session as {@link IActiveSession}.
	 */
	readonly activeSession: IObservable<IActiveSession | undefined>;

	/**
	 * Observable list of slots currently displayed in the sessions part's
	 * grid, in their grid order (left-to-right). Each entry is either an
	 * {@link IActiveSession} or `undefined` for the empty (new-session)
	 * placeholder. At most one entry is `undefined` at a time. Sessions
	 * pinned via {@link toggleSessionStickiness} are sticky; the remaining
	 * non-sticky entries get replaced when new sessions are opened.
	 */
	readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]>;

	/**
	 * Toggle a session's stickiness in the grid. The session keeps its grid
	 * slot when toggled. If the session is not currently visible, it is
	 * appended to the grid as sticky.
	 */
	toggleSessionStickiness(session: ISession): void;

	/**
	 * Insert (or move) a session into the grid positioned next to a target
	 * session that is already visible.
	 * - If the session is not yet visible, a new non-sticky entry is created
	 *   at the computed position.
	 * - If the session is already visible, it is moved to the computed
	 *   position; its sticky / non-sticky state is preserved.
	 *
	 * When `activate` is `true` (default), the inserted session also becomes
	 * the active session. Pass `false` to leave the active session unchanged.
	 */
	insertAt(session: ISession, targetSessionId: string, side: 'left' | 'right', activate?: boolean): void;

	/**
	 * Close a session: remove it from the visibility model so it is no longer
	 * shown in the grid. If the session was the active one, the previous
	 * visible session becomes active; if no session remains visible, the
	 * new-session view is opened. Passing `undefined` closes the empty
	 * (new-session) slot if it is currently visible.
	 */
	closeSession(session: ISession | undefined): void;

	setActive(session: IActiveSession | undefined): void;

	/**
	 * Select an existing session as the active session.
	 * Sets `isNewChatSession` context to false and opens the active chat belonging to the session.
	 */
	openSession(sessionResource: URI, options?: { preserveFocus?: boolean }): Promise<void>;

	/**
	 * Open a specific chat within a session.
	 * Sets `isNewChatSession` context to false and opens the chat.
	 */
	openChat(session: ISession, chatUri: URI): Promise<void>;

	/**
	 * Restore the last active session from persisted state.
	 * Waits until the session provider is available and then opens the session.
	 * Falls back to the new-session view if the session is not found.
	 */
	restoreLastActiveSession(): Promise<void>;

	/**
	 * Switch to the new-session view.
	 * No-op if the current session is already a new session.
	 */
	openNewSessionView(): void;

	/**
	 * Create a new session for the given folder.
	 *
	 * When `options.providerId` is omitted, iterates registered providers and
	 * picks the first one whose {@link ISessionsProvider.resolveWorkspace}
	 * succeeds for `folderUri` (and, when `options.sessionTypeId` is given,
	 * whose `getSessionTypes` includes it). When `options.sessionTypeId` is
	 * omitted, defaults to the chosen provider's first advertised type for
	 * the folder.
	 */
	createNewSession(folderUri: URI, options?: ICreateNewSessionOptions): ISession;

	/**
	 * Unset the new session
	 */
	unsetNewSession(): void;

	/**
	 * Send a request, creating a new chat in the session.
	 */
	sendNewChatRequest(session: ISession, options: ISendRequestOptions): Promise<void>;

	/**
	 * Send a request for an existing chat within a session.
	 */
	sendRequest(session: ISession, chat: IChat, options: ISendRequestOptions): Promise<void>;

	/**
	 * Switch to the new-chat-in-session view.
	 * Adds a new chat to the session via the provider, makes it the active chat,
	 * and shows a rich input for composing a message.
	 */
	openNewChatInSession(session: ISession): Promise<void>;

	/** Navigate to the previous session in the navigation history. */
	openPreviousSession(): Promise<void>;

	/** Navigate to the next session in the navigation history. */
	openNextSession(): Promise<void>;

	// -- Session Actions --

	/** Archive a session. */
	archiveSession(session: ISession): Promise<void>;

	/** Unarchive a session. */
	unarchiveSession(session: ISession): Promise<void>;

	/** Delete a session. */
	deleteSession(session: ISession): Promise<void>;

	/** Delete a single chat from a session by its URI. */
	deleteChat(session: ISession, chatUri: URI): Promise<void>;

	/** Rename a chat within a session. */
	renameChat(session: ISession, chatUri: URI, title: string): Promise<void>;
}

export const ISessionsManagementService = createDecorator<ISessionsManagementService>('sessionsManagementService');

//#endregion
