/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChat, ISession, ISessionType, ISessionWorkspace, ISessionWorkspaceBrowseAction } from './session.js';

/**
 * Event fired when sessions change within a provider.
 */
export interface ISessionChangeEvent {
	readonly added: readonly ISession[];
	readonly removed: readonly ISession[];
	readonly changed: readonly ISession[];
}

/**
 * Options for sending a request to a session.
 */
export interface ISendRequestOptions {
	/** The query text to send. */
	readonly query: string;
	/** Optional attached context entries. */
	readonly attachedContext?: IChatRequestVariableEntry[];
}

/**
 * A sessions provider encapsulates a compute environment.
 * It owns workspace discovery, session creation, session listing, and picker contributions.
 *
 * One provider can serve multiple session types. Multiple provider instances can
 * serve the same session type (e.g., one per remote agent host).
 */
export interface ISessionsProvider {
	/**
	 * Unique identifier for the provider.
	 */
	readonly id: string;

	/**
	 * A human-readable label for the provider, used in the UI.
	 */
	readonly label: string;

	/**
	 * Icon for the provider, used in the UI.
	 */
	readonly icon: ThemeIcon;

	/**
	 * Session types supported by this provider. The provider is expected to update this list and fire `onDidChangeSessionTypes`
	 */
	readonly sessionTypes: readonly ISessionType[];
	/**
	 * Event that fires when the list of session types changes. Consumers should refresh any session type pickers when this occurs.
	 */
	readonly onDidChangeSessionTypes: Event<void>;

	/**
	 * List of all sessions currently known to the provider. Consumers should not cache this list, but should listen to `onDidChangeSessions` and update their cached list accordingly.
	 */
	getSessions(): ISession[];
	/**
	 * Event that fires when sessions are added, removed, or changed. Consumers should update their session lists and any related UI when this occurs.
	 */
	readonly onDidChangeSessions: Event<ISessionChangeEvent>;
	/**
	 * Optional. Fires when a temporary (untitled) session is atomically replaced
	 * by a committed session after the first turn.
	 *
	 * @internal This is an implementation detail of the Copilot Chat sessions
	 * provider. Do not implement or consume this event in other providers.
	 */
	readonly onDidReplaceSession?: Event<{ readonly from: ISession; readonly to: ISession }>;

	/**
	 * List of workspace browse actions supported by the provider. These are used to contribute entries to the "Open Workspace" picker. Consumers should not cache this list, but should call `resolveWorkspace` when an action is executed.
	 */
	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];

	/**
	 * Whether this provider can resolve and run sessions against local file-system workspaces.
	 * When `true`, the workspace picker includes a "Local" tab with a built-in
	 * folder browse action that resolves through this provider.
	 */
	readonly supportsLocalWorkspaces?: boolean;

	/**
	 * Resolve a workspace for the given repository URI.
	 * Returns `undefined` when the provider cannot handle the given URI
	 * (e.g. wrong scheme or authority).
	 * @param workspaceUri The URI of the repository to resolve the workspace for.
	 */
	resolveWorkspace(workspaceUri: URI): ISessionWorkspace | undefined;

	/**
	 * Create a new session for the given workspace URI.
	 * The provider should not add this session to its session list until the first request is sent.
	 * @param workspaceUri The URI of the repository to create the session for.
	 * @param sessionTypeId The ID of the session type to create.
	 */
	createNewSession(workspaceUri: URI, sessionTypeId: string): ISession;

	/**
	 * Get the session types supported for a given workspace URI.
	 * @param workspaceUri The URI of the workspace to get session types for.
	 */
	getSessionTypes(workspaceUri: URI): ISessionType[];

	/**
	 * Rename a chat within a session.
	 * @param sessionId The ID of the session containing the chat to rename.
	 * @param chatUri The URI of the chat to rename.
	 * @param title The new title for the chat.
	 */
	renameChat(sessionId: string, chatUri: URI, title: string): Promise<void>;

	/**
	 * Set the model for a session.
	 * @param sessionId The ID of the session.
	 * @param modelId The ID of the model to set for the session.
	 */
	setModel(sessionId: string, modelId: string): void;

	/**
	 * Archive a session.
	 * @param sessionId The ID of the session to archive.
	 */
	archiveSession(sessionId: string): Promise<void>;

	/**
	 * Unarchive a session.
	 * @param sessionId The ID of the session to unarchive.
	 */
	unarchiveSession(sessionId: string): Promise<void>;

	/**
	 * Delete a session.
	 * @param sessionId The ID of the session to delete.
	 */
	deleteSession(sessionId: string): Promise<void>;

	/**
	 * Delete a single chat from a session.
	 * @param sessionId The ID of the session containing the chat to delete.
	 * @param chatUri The URI of the chat to delete.
	 */
	deleteChat(sessionId: string, chatUri: URI): Promise<void>;

	/**
	 * Create a new chat in the given session and return it.
	 *
	 * @param sessionId The ID of the session to create the new chat in.
	 * @param prompt Optional prompt to initialize the new chat with.
	 */
	createNewChat(sessionId: string, prompt?: string): Promise<IChat>;

	/**
	 * Send a request for a chat within a session.
	 *
	 * @param sessionId The ID of the session containing the chat.
	 * @param chatResource The resource URI of the chat to send the request for.
	 * @param options Options for the request, including the query and any attached context entries.
	 */
	sendRequest(sessionId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession>;
}
