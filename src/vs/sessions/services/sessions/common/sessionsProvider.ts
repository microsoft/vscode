/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../workbench/contrib/chat/common/languageModels.js';
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
	/** Optional display title for the new session. */
	readonly title?: string;
}

/**
 * Presentation options for the sessions-core model picker. A provider returns
 * these from {@link ISessionsProvider.getModelPickerOptions} so it controls how
 * its models are displayed, rather than the core picker inferring behavior from
 * the provider or session type.
 */
export interface ISessionModelPickerOptions {
	/** Whether to group models by vendor/family in the picker. */
	readonly useGroupedModelPicker: boolean;
	/** Whether to surface featured models. */
	readonly showFeatured: boolean;
	/** Whether to surface featured models that are currently unavailable. */
	readonly showUnavailableFeatured: boolean;
	/** Whether to offer the "Manage Models" action in the picker. */
	readonly showManageModelsAction: boolean;
	/**
	 * Whether the synthetic "Auto" model is available for this session type, so
	 * it can fall back to Auto when no explicit model is selected. Defaults to
	 * `true` when omitted. When `false` and the provider offers no models, the
	 * core picker stays visible and shows a "No models available" state (with an
	 * upgrade prompt for Copilot Free / Student users) instead of hiding the
	 * picker or offering Auto.
	 */
	readonly showAutoModel?: boolean;
}

/**
 * Options controlling how a chat is deleted via {@link ISessionsProvider.deleteChat}.
 */
export interface IDeleteChatOptions {
	/**
	 * Skip the "Are you sure?" confirmation dialog and delete immediately.
	 * Used when the chat is a transient draft (e.g. an untitled in-composer
	 * chat) where there is nothing to lose.
	 */
	readonly skipConfirmation?: boolean;
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
	 * Sort order that determines the precedence of this provider's session
	 * types relative to other providers. Lower values are surfaced first;
	 * providers with equal order keep their registration order. The default is
	 * `0`. A provider may change this dynamically (e.g. based on a setting) and
	 * fire `onDidChangeSessionTypes` to have consumers re-evaluate the order.
	 */
	readonly order: number;

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
	 * Whether this provider can create **quick chats**: workspace-less sessions
	 * that are not scoped to any folder (`ISession.workspace` is `undefined`).
	 * When `true`, the provider must implement {@link createQuickChat}.
	 * Defaults to falsy (quick chats not supported). Providers that do change
	 * this at runtime should signal it via {@link onDidChangeCapabilities}.
	 */
	readonly supportsQuickChats?: boolean;

	/**
	 * Optional. Fires when a capability flag that consumers gate UI on (e.g.
	 * {@link supportsQuickChats}) changes at runtime, so they can re-evaluate.
	 */
	readonly onDidChangeCapabilities?: Event<void>;

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
	 * Multiple new sessions may be created and tracked concurrently; each is
	 * identified by its `sessionId` and lives until it is either sent (graduating
	 * into the session list) or disposed via {@link deleteNewSession}.
	 * @param workspaceUri The URI of the repository to create the session for.
	 * @param sessionTypeId The ID of the session type to create.
	 */
	createNewSession(workspaceUri: URI, sessionTypeId: string): ISession;

	/**
	 * Create a new **quick chat**: a workspace-less session not scoped to any
	 * folder (`ISession.workspace` resolves to `undefined`). Like
	 * {@link createNewSession}, the returned session is an untitled draft that
	 * the provider must not add to its session list until the first request is
	 * sent, and that is disposed via {@link deleteNewSession} if abandoned.
	 *
	 * Callers must gate on {@link supportsQuickChats}; providers that do not
	 * support quick chats must throw.
	 * @param sessionTypeId The ID of the session type to create.
	 */
	createQuickChat(sessionTypeId: string): ISession;

	/**
	 * Delete a new (untitled, not-yet-sent) session previously created via
	 * {@link createNewSession}, removing it from the provider's tracking and
	 * releasing any resources it eagerly acquired (e.g. a backend session).
	 * No-op when the id is unknown or the session has already been sent.
	 * @param sessionId The id of the new session to delete.
	 */
	deleteNewSession(sessionId: string): void;

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
	 * Rename the session itself, independently of its chats. Single-chat
	 * providers may implement this by renaming their main chat.
	 * @param sessionId The ID of the session to rename.
	 * @param title The new title for the session.
	 */
	renameSession(sessionId: string, title: string): Promise<void>;

	/**
	 * Get the language models that can be selected for a session. The sessions
	 * core renders these in a single {@link ModelPickerActionItem}-based picker
	 * and persists the user's choice per provider per session type. Returns an
	 * empty array when the session has no selectable models (e.g. the underlying
	 * runtime does not expose model selection).
	 *
	 * Providers backed by registered language models return them directly;
	 * providers whose models come from another source (e.g. extension-host
	 * option groups for cloud sessions) synthesize equivalent metadata.
	 * @param sessionId The ID of the session.
	 */
	getModels(sessionId: string): readonly ILanguageModelChatMetadataAndIdentifier[];

	/**
	 * Get the presentation options for the sessions-core model picker for the
	 * given session. The provider — not the core picker — decides how its models
	 * are presented (grouping, featured models, whether the manage-models action
	 * is offered), so provider-specific behavior is not hardcoded in core.
	 * @param sessionId The ID of the session.
	 */
	getModelPickerOptions(sessionId: string): ISessionModelPickerOptions;

	/**
	 * Event that fires when the set of models returned by {@link getModels}
	 * may have changed (e.g. language models finished loading, or the backend
	 * advertised a new option group). The core model picker re-reads the model
	 * list when this fires. Has no payload — consumers re-query per session.
	 */
	readonly onDidChangeModels: Event<void>;

	/**
	 * Set the model for a session.
	 * @param sessionId The ID of the session.
	 * @param modelId The ID of the model to set for the session.
	 */
	setModel(sessionId: string, modelId: string): void;

	/**
	 * Set the chat mode for a session.
	 * @param sessionId The ID of the session.
	 * @param modeId The mode identifier to set.
	 */
	setMode?(sessionId: string, modeId: string): void;

	/**
	 * Set the permission level for a session.
	 * @param sessionId The ID of the session.
	 * @param level The permission level to set.
	 */
	setPermissionLevel?(sessionId: string, level: string): void;

	/**
	 * Set the isolation mode for a session.
	 * @param sessionId The ID of the session.
	 * @param mode The isolation mode to set.
	 */
	setIsolationMode?(sessionId: string, mode: string): void;

	/**
	 * Set the git branch for a session.
	 * @param sessionId The ID of the session.
	 * @param branch The branch name to set.
	 */
	setBranch?(sessionId: string, branch: string): void;

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
	 * Set the read/unread state of a session. The provider owns and persists
	 * this state (e.g. via its backend protocol or chat model) and is expected
	 * to reflect it through the session's {@link ISession.isRead} observable.
	 * @param sessionId The ID of the session.
	 * @param isRead `true` to mark the session read, `false` to mark it unread.
	 */
	setSessionReadState(sessionId: string, isRead: boolean): Promise<void>;

	/**
	 * Delete a session.
	 * @param sessionId The ID of the session to delete.
	 */
	deleteSession(sessionId: string): Promise<void>;

	/**
	 * Delete multiple sessions at once. Implementations may delete the
	 * sessions more efficiently in a batch, or simply delegate to
	 * {@link deleteSession} for each id.
	 * @param sessionIds The IDs of the sessions to delete.
	 */
	deleteSessions(sessionIds: readonly string[]): Promise<void>;

	/**
	 * Delete a single chat from a session.
	 * @param sessionId The ID of the session containing the chat to delete.
	 * @param chatUri The URI of the chat to delete.
	 * @param options Optional behavior, e.g. skipping the confirmation dialog.
	 * @returns `true` if a chat was deleted, `false` if the deletion was a no-op
	 * (e.g. the chat was unknown, undeletable, or the user cancelled the
	 * confirmation dialog).
	 */
	deleteChat(sessionId: string, chatUri: URI, options?: IDeleteChatOptions): Promise<boolean>;

	/**
	 * Create a new chat in the given session and return it.
	 *
	 * @param sessionId The ID of the session to create the new chat in.
	 * @param prompt Optional prompt to initialize the new chat with.
	 */
	createNewChat(sessionId: string, prompt?: string): Promise<IChat>;

	/**
	 * Fork an existing chat into a new chat within the same session, seeded
	 * with the source chat's history up to and including the given turn.
	 * @param sessionId The ID of the session containing the source chat.
	 * @param sourceChat The resource URI of the chat to fork from.
	 * @param turnId The ID of the last turn (request) to include in the fork.
	 */
	forkChat(sessionId: string, sourceChat: URI, turnId: string): Promise<IChat>;

	/**
	 * Send a request for a chat within a session.
	 *
	 * @param sessionId The ID of the session containing the chat.
	 * @param chatResource The resource URI of the chat to send the request for.
	 * @param options Options for the request, including the query and any attached context entries.
	 */
	sendRequest(sessionId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession>;
}
