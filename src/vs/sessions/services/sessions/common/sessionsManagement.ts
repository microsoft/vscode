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

export const ActiveSessionSupportsMultiChatContext = new RawContextKey<boolean>('activeSessionSupportsMultiChat', false, localize('activeSessionSupportsMultiChat', "Whether the active session's provider supports multiple chats per session"));

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
	getSessionTypes(session: ISession): ISessionType[];

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
	 * Observable for the currently active sessions provider ID.
	 * When only one provider exists, it is selected automatically.
	 */
	readonly activeProviderId: IObservable<string | undefined>;

	/**
	 * Set the active sessions provider by ID.
	 */
	setActiveProvider(providerId: string): void;

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
	 * Switch to the new-session view.
	 * No-op if the current session is already a new session.
	 */
	openNewSessionView(): void;

	/**
	 * Create a new session for the given workspace.
	 * Delegates to the provider identified by providerId.
	 */
	createNewSession(providerId: string, workspace: ISessionWorkspace): ISession;

	/**
	 * Unset the new session
	 */
	unsetNewSession(): void;

	/**
	 * Send a request, creating a new chat in the session.
	 */
	sendAndCreateChat(session: ISession, options: ISendRequestOptions): Promise<void>;

	/**
	 * Update the session type for a new session.
	 */
	setSessionType(session: ISession, type: ISessionType): Promise<void>;

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
