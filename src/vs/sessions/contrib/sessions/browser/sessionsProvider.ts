/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ISessionData, ISessionWorkspace } from '../common/sessionData.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

/**
 * A platform-level session type identifying an agent backend.
 * Lightweight label — says nothing about where it runs or how it's configured.
 */
export interface ISessionType {
	/** Unique identifier (e.g., 'copilot-cli', 'copilot-cloud', 'claude-code'). */
	readonly id: string;
	/** Display label (e.g., 'Copilot CLI', 'Cloud'). */
	readonly label: string;
	/** Icon for this session type. */
	readonly icon: ThemeIcon;
}

/**
 * A browse action contributed by a sessions provider.
 * Shown in the workspace picker (e.g., "Browse Folders...", "Browse Repositories...").
 */
export interface ISessionsBrowseAction {
	/** Display label for the browse action. */
	readonly label: string;
	/** Icon for the browse action. */
	readonly icon: ThemeIcon;
	/** The provider that owns this action. */
	readonly providerId: string;
	/** Execute the browse action and return the selected workspace, or undefined if cancelled. */
	execute(): Promise<ISessionWorkspace | undefined>;
}

/**
 * Event fired when sessions change within a provider.
 */
export interface ISessionsChangeEvent {
	readonly added: readonly ISessionData[];
	readonly removed: readonly ISessionData[];
	readonly changed: readonly ISessionData[];
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
	/** Unique provider instance ID (e.g., 'default-copilot', 'agenthost-hostA'). */
	readonly id: string;
	/** Display label for this provider. */
	readonly label: string;
	/** Icon for this provider. */
	readonly icon: ThemeIcon;
	/** Session types this provider supports. */
	readonly sessionTypes: readonly ISessionType[];

	// -- Workspaces --

	/** Browse actions shown in the workspace picker. */
	readonly browseActions: readonly ISessionsBrowseAction[];
	/** Resolve a repository URI to a session workspace with label and icon. */
	resolveWorkspace(repositoryUri: URI): ISessionWorkspace;

	// -- Sessions (existing) --

	/** Returns all sessions owned by this provider. */
	getSessions(): ISessionData[];
	/** Fires when sessions are added, removed, or changed. */
	readonly onDidChangeSessions: Event<ISessionsChangeEvent>;

	// -- Session Management --

	/** Create a new session for the given workspace. */
	createNewSession(workspace: ISessionWorkspace): ISessionData;
	/** Update the session type for a session. */
	setSessionType(sessionId: string, type: ISessionType): ISessionData;
	/** Returns session types available for the given session. */
	getSessionTypes(session: ISessionData): ISessionType[];
	/** Rename a session. */
	renameSession(sessionId: string, title: string): Promise<void>;
	/** Set the model for a session. */
	setModel(sessionId: string, modelId: string): void;
	/** Archive a session. */
	archiveSession(sessionId: string): Promise<void>;
	/** Unarchive a session. */
	unarchiveSession(sessionId: string): Promise<void>;
	/** Delete a session. */
	deleteSession(sessionId: string): Promise<void>;
	/** Mark a session as read or unread. */
	setRead(sessionId: string, read: boolean): void;

	// -- Send --

	/** Send the initial request for a new session. Returns the created session data. */
	sendRequest(sessionId: string, options: ISendRequestOptions): Promise<ISessionData>;
}
