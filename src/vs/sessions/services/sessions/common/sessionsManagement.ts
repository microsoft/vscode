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
import { IChat, ISession, ISessionType } from './session.js';
import { ISendRequestOptions } from './sessionsProvider.js';

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
	 * Fires when available session types change (providers added/removed).
	 */
	readonly onDidChangeSessionTypes: Event<void>;

	/**
	 * Fires when sessions change across any provider.
	 */
	readonly onDidChangeSessions: Event<ISessionsChangeEvent>;

	// -- Active Session --

	/**
	 * Observable for the currently active session as {@link IActiveSession}.
	 */
	readonly activeSession: IObservable<IActiveSession | undefined>;

	/**
	 * Observable list of sessions currently displayed in the sessions part's
	 * grid, in their grid order (left-to-right). Contains the active session
	 * (if any) plus any other sessions previously opened or pinned. Sessions
	 * pinned via {@link toggleSessionStickiness} are sticky; the remaining
	 * non-sticky sessions get replaced when new sessions are opened.
	 */
	readonly visibleSessions: IObservable<readonly IActiveSession[]>;

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
	 */
	insertAt(session: ISession, targetSessionId: string, side: 'left' | 'right'): void;

	/**
	 * Close a session: remove it from the visibility model so it is no longer
	 * shown in the grid. If the session was the active one, the previous
	 * visible session becomes active; if no session remains visible, the
	 * new-session view is opened.
	 */
	closeSession(session: ISession): void;

	setActive(session: IActiveSession): void;

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
	 * Create a new session for the given workspace.
	 * Delegates to the provider identified by providerId.
	 */
	createNewSession(providerId: string, workspaceUri: URI, sessionTypeId?: string): ISession;

	/**
	 * Unset the new session
	 */
	unsetNewSession(): void;

	/**
	 * Send a request, creating a new chat in the session.
	 */
	sendAndCreateChat(session: ISession, options: ISendRequestOptions): Promise<void>;

	/**
	 * Send a request for an existing chat within a session.
	 */
	sendRequest(session: ISession, chat: IChat, options: ISendRequestOptions): Promise<void>;

	/**
	 * Switch to the new-chat-in-session view.
	 * Adds a new chat to the session via the provider, makes it the active chat,
	 * and shows a rich input for composing a message.
	 */
	openNewChatInSession(session: ISession): void;

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
