/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { RemoteAgentHostConnectionStatus } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISession, ISessionWorkspace } from '../common/sessionData.js';
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
 * Capabilities declared by a sessions provider.
 * Consumers check these before surfacing provider-specific features in the UI.
 */
export interface ISessionsProviderCapabilities {
	/** Whether the provider supports multiple chats within a single session. */
	readonly multipleChatsPerSession: boolean;
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
	/** Capabilities supported by this provider. */
	readonly capabilities: ISessionsProviderCapabilities;

	// -- Remote Connection (optional, used by remote agent host providers) --

	/** Connection status observable, present on remote providers. */
	readonly connectionStatus?: IObservable<RemoteAgentHostConnectionStatus>;
	/** Remote address string, present on remote providers. */
	readonly remoteAddress?: string;
	/** Output channel ID for remote provider logs. */
	outputChannelId?: string;

	// -- Workspaces --

	/** Browse actions shown in the workspace picker. */
	readonly browseActions: readonly ISessionsBrowseAction[];
	/** Resolve a repository URI to a session workspace with label and icon. */
	resolveWorkspace(repositoryUri: URI): ISessionWorkspace;

	// -- Sessions (existing) --

	/** Returns all sessions owned by this provider. */
	getSessions(): ISession[];
	/** Fires when sessions are added, removed, or changed. */
	readonly onDidChangeSessions: Event<ISessionChangeEvent>;
	/**
	 * Optional. Fires when a temporary (untitled) session is atomically replaced
	 * by a committed session after the first turn.
	 *
	 * @internal This is an implementation detail of the Copilot Chat sessions
	 * provider. Do not implement or consume this event in other providers.
	 */
	readonly onDidReplaceSession?: Event<{ readonly from: ISession; readonly to: ISession }>;

	// -- Session Management --

	/** Create a new session for the given workspace. */
	createNewSession(workspace: ISessionWorkspace): ISession;
	/** Update the session type for a session. */
	setSessionType(sessionId: string, type: ISessionType): ISession;
	/** Returns session types available for the given session. */
	getSessionTypes(sessionId: string): ISessionType[];
	/** Rename a chat within a session. */
	renameChat(sessionId: string, chatUri: URI, title: string): Promise<void>;
	/** Set the model for a session. */
	setModel(sessionId: string, modelId: string): void;
	/** Archive a session. */
	archiveSession(sessionId: string): Promise<void>;
	/** Unarchive a session. */
	unarchiveSession(sessionId: string): Promise<void>;
	/** Delete a session. */
	deleteSession(sessionId: string): Promise<void>;
	/** Delete a single chat from a session. */
	deleteChat(sessionId: string, chatUri: URI): Promise<void>;
	/** Mark a session as read or unread. */
	setRead(sessionId: string, read: boolean): void;

	// -- Send --
	/** Send a request, creating a new chat in the session. */
	sendAndCreateChat(sessionId: string, options: ISendRequestOptions): Promise<ISession>;
}
