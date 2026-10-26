/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import type { IAgentHostWorktreeCleanupStatus } from '../../../../platform/agentHost/common/agentHostWorktreeCleanup.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable, IReference } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader } from '../../../../base/common/observable.js';
import { IArtifactModel } from '../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ResolveSessionConfigResult } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatSendRequestOptions } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionInitialMessage } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelChatMetadataAndIdentifier, type IModelConfigurationAccess } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ModelIdentifierResolution } from '../../../../workbench/contrib/chat/common/modelSelection.js';
import { IAutomationSessionTemplate } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationUnavailableReasonCode, IAutomationProviderConfiguration, IAutomationStore } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ChatModelSource, IChat, ISession, ISessionCanvas, ISessionCanvasDefinition, ISessionCreationReference, ISessionEnvironment, ISessionType, ISessionWorkspace, ISessionWorkspaceBrowseAction, ISideChatSelection, type SessionCanvasDefinitionSnapshot } from './session.js';

/**
 * Event fired when sessions change within a provider.
 */
export interface ISessionChangeEvent {
	readonly added: readonly ISession[];
	readonly removed: readonly ISession[];
	readonly changed: readonly ISession[];
}

/** One end of a chat move: the session and the chat's resource in it. */
export interface IChatMoveEnd {
	readonly session: ISession;
	readonly chat: URI;
}

/**
 * A chat moved from one session to another of the same provider, or became the
 * main chat of a new session. Its resource changes with its session; its
 * conversation, including a running turn, does not.
 */
export interface IChatMovedEvent {
	readonly from: IChatMoveEnd;
	readonly to: IChatMoveEnd;
}

/**
 * A user invocation of one of a session's changeset operations
 * (`ISessionChangeset.invokeOperation`). Fired once any confirmation the
 * operation requires has been accepted and before the operation runs, so it
 * reports the invocation, not its outcome.
 */
export interface ISessionChangesetOperationInvokedEvent {
	readonly session: ISession;
	/** `ISessionChangesetOperation.id` of the invoked operation. */
	readonly operationId: string;
	/** The operation-specific request metadata the operation was invoked with. */
	readonly metadata?: Record<string, unknown>;
}

/**
 * Why a chat or session move was refused, in a message for the user (e.g. "Chats can't be moved into or out of an
 * archived session."). Moves reject with it for refusals they can explain; anything else is an unexpected failure,
 * whose message isn't meant for the user.
 */
export class SessionMoveRefusedError extends Error {
	constructor(message: string) {
		super(message);
	}
}

/** The workspace chosen for a new nested chat. */
export type INestedChatWorkspace =
	| { readonly kind: 'folder'; readonly folder: URI; readonly isolation: 'folder' }
	| { readonly kind: 'folder'; readonly folder: URI; readonly isolation: 'worktree'; readonly baseBranch: string | undefined }
	| { readonly kind: 'scratch' };

/** What the composer may offer for a new nested chat in a session. */
export interface INestedChatWorkspaceSupport {
	/** The session's own folder (its default chat's primary folder, excluding scratch folders); `undefined` for a workspace-less session. */
	readonly sessionFolder: URI | undefined;
	/** Whether the agent gives a chat its own folder (agent capability `multipleWorkingDirectories`). */
	readonly multipleFolders: boolean;
	/** Folder browse actions of this provider (same host), for "Browse…". */
	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];
}

/** Folder facts for the nested composer's isolation and branch pickers. */
export interface INestedChatFolderInfo {
	/** Whether the host offers isolation `'worktree'` for this folder (a git repository). */
	readonly supportsWorktree: boolean;
	/** The branch a new worktree is based on by default. */
	readonly defaultBranch: string | undefined;
}

/**
 * Why a nested chat could not be given the chosen workspace, in a message for the user.
 * `notSupported`: the provider, host, or agent cannot give it that workspace. `refused`: the host refused the
 * request, or the chat already started.
 */
export class NestedChatWorkspaceError extends Error {

	static notSupported(): NestedChatWorkspaceError {
		return new NestedChatWorkspaceError('notSupported', localize('nestedChatWorkspace.notSupported', "This agent can't give a nested session its own folder."));
	}

	/** `reason` is the host's message; only its first line is shown, without an `Error:` prefix or stack. */
	static refused(workspaceLabel: string, reason: string): NestedChatWorkspaceError {
		const shown = reason.split(/\r?\n/, 1)[0].replace(/^(?:Error:\s*)+/, '').replace(/\s+at\s+\S+\s+\(.*$/, '').trim();
		return new NestedChatWorkspaceError('refused', localize('nestedChatWorkspace.refused', "The nested session could not be created in {0}: {1}", workspaceLabel, shown));
	}

	static alreadyStarted(): NestedChatWorkspaceError {
		return new NestedChatWorkspaceError('refused', localize('nestedChatWorkspace.alreadyStarted', "The nested session already started, so its workspace can't change."));
	}

	constructor(readonly kind: 'notSupported' | 'refused', message: string) {
		super(message);
	}
}

/**
 * Where {@link ISessionsProvider.moveChat} moves a chat: after `after` (a chat of the session `sessionId`, or first
 * when `undefined`) in that session, which may be the chat's own session to reorder it, or into a new session.
 */
export type ISessionChatMoveDestination =
	| { readonly kind: 'session'; readonly sessionId: string; readonly after: URI | undefined }
	| { readonly kind: 'newSession' };

/** Why a session resource is being resolved, so a provider can pick a latency budget. */
export type SessionResourceResolveReason = 'open' | 'restore';

/**
 * Schema-backed configuration consumed by mode and approval pickers, including pre-provisioning drafts.
 * Reads and writes name the chat they are for: a host may let each chat set some properties for itself.
 */
export interface ISessionConfigProvider {
	readonly onDidChangeSessionConfig: Event<string>;
	getSessionConfig(sessionId: string, chat: URI): ResolveSessionConfigResult | undefined;
	getCreateSessionConfig(sessionId: string): Record<string, unknown> | undefined;
	isSessionConfigResolving(sessionId: string, chat: URI): IObservable<boolean>;
	setSessionConfigValue(sessionId: string, chat: URI, property: string, value: unknown): Promise<void>;
	trackSessionConfigOperation?(sessionId: string, operation: Promise<void>): void;
}

/** Provider-owned permission choice exposed while configuring a new session. */
export interface ISessionPermissionOption {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly isDefault?: boolean;
	readonly isAllowAll?: boolean;
	/** Selected provider execution mode to preserve when launching comparison participants. */
	readonly comparisonModeId?: string;
	readonly locked?: boolean;
	readonly lockedReason?: string;
}

/** A provider-prepared replacement draft and its rollback operation. */
export interface IPreparedNewSession {
	readonly session: ISession;
	discard?(): Promise<void>;
}

/**
 * Options for sending a request to a session.
 */
export interface ISendRequestOptions {
	/** Initial configuration resolved by the target provider before its first turn. */
	readonly sessionConfig?: Readonly<Record<string, unknown>>;
	/** UI-only response observation, forwarded to the chat service rather than the backend. */
	readonly onDidCreateResponse?: IChatSendRequestOptions['onDidCreateResponse'];
	/** The query text to send. */
	readonly query: string;
	/** Provider-specific request metadata, separate from the prompt. */
	readonly metadata?: Record<string, unknown>;
	/** Optional attached context entries. */
	readonly attachedContext?: IChatRequestVariableEntry[];
	/** Optional display title for the new session. */
	readonly title?: string;
	/** Hide this request and its response from the chat transcript. */
	readonly hideFromTranscript?: boolean;
}

/** Options for forking a chat within a session. */
export interface IForkChatOptions {
	/** Optional captured prompt and context for a host-owned fork-and-send operation. */
	readonly initialMessage?: IChatSessionInitialMessage;
	readonly title?: string;
}

/** Provider options applied when creating a new session draft. */
export interface ISessionsProviderCreateSessionOptions {
	/** Whether this draft configures an Automation rather than an interactive session. */
	readonly isAutomationDraft?: boolean;
	/** Initial provider metadata to associate with the session. */
	readonly metadata?: Record<string, unknown>;
	/** Session that created this session, when it should be presented as a child. */
	readonly createdBySession?: ISessionCreationReference;
	/** Initial model identifier selected for the draft. */
	readonly modelId?: string;
	/** Model-specific primitive values applied only to this draft. */
	readonly modelConfiguration?: Readonly<Record<string, string | number | boolean | null>>;
	/** Provider-owned permission option resolved before the first request. */
	readonly permissionId?: string;
	/** Initial chat mode applied before the provider creates the draft session. */
	readonly modeId?: string;
	/**
	 * Pull request the session is created from. The provider creates the backend
	 * session with it, so the session is associated with the pull request from
	 * the start; it implies worktree isolation.
	 */
	readonly pullRequestUrl?: string;
	/** Complete Automation state for providers that also own compatibility projections. */
	readonly automationConfiguration?: IAutomationSessionConfiguration;
}

/** A detached configuration snapshot with provider-neutral properties and the full provider-specific values. */
export interface ISessionConfigurationSnapshot {
	/** Selected isolation mode, or undefined when the provider cannot determine it. */
	readonly isolation?: 'worktree' | 'folder';
	/** Provider-specific values may contain sensitive data and must not be logged wholesale. */
	readonly providerConfig: Readonly<Record<string, unknown>>;
}

/** Provider-owned Automation draft state plus temporary compatibility projections. */
export interface IAutomationSessionConfiguration {
	readonly sessionTemplate?: IAutomationSessionTemplate;
	readonly modelId?: string;
	readonly mode?: string;
	readonly permissionLevel?: string;
}

/** Programmatic worktree settings applied together before a new session starts. */
export interface ISessionWorktreeConfiguration {
	readonly isolationMode?: string;
	readonly branch?: string;
}

/**
 * Presentation options for the sessions-core model picker. A provider returns
 * these from {@link ISessionsProvider.getModelPickerOptions} so it controls how
 * its models are displayed, rather than the core picker inferring behavior from
 * the provider or session type.
 */
export interface ISessionModelPickerOptions {
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

export interface ISessionModelsSnapshot {
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly desiredModelResolution: ModelIdentifierResolution;
	/** Concrete chat session type targeted by this model pool, or undefined for the shared pool. */
	readonly modelTarget: string | undefined;
}

/**
 * One concrete Sessions provider's Automation catalogue and operations, with provider-local capability state.
 * Unlike the aggregate IAutomationService, creation eligibility needs no provider ID because ownership is implicit.
 */
export interface ISessionsProviderAutomations extends IAutomationStore {
	readonly configuration?: IAutomationProviderConfiguration;
	/** Disabled providers are excluded from the aggregate catalogue and routing. */
	readonly enabled?: IObservable<boolean>;
	/** Whether this provider accepts new definitions; existing definitions may independently allow updates. */
	readonly canCreateAutomation: IObservable<boolean>;
	/** Explanation and recovery guidance for provider unavailability, when present. */
	readonly unavailableReason?: IObservable<string | undefined>;
	/** Optional category for grouped unavailability messages. */
	readonly unavailableReasonCode?: IObservable<AutomationUnavailableReasonCode | undefined>;
	/** A complete sentence describing this provider's unavailability, used instead of naming the provider. */
	readonly unavailableMessage?: string;
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
 * A logical sessions provider owns creation targets and may use internal, connection-bound backends for existing sessions.
 * Both implement this contract; only logical providers advertise workspace and session creation choices.
 */
export interface ISessionsProvider {
	readonly sessionConfig?: ISessionConfigProvider;
	/**
	 * Unique identifier for the provider.
	 */
	readonly id: string;

	/**
	 * A human-readable label for the provider, used in the UI.
	 */
	readonly label: string;
	readonly environment: ISessionEnvironment;

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
	 * Returns an opaque target that the provider's session-context tool accepts
	 * for the given chat, or `undefined` when transcript access is unavailable.
	 */
	getSessionContextReference?(chatResource: URI): string | undefined;

	/**
	 * Event that fires when sessions are added, removed, or changed. Consumers should update their session lists and any related UI when this occurs.
	 */
	readonly onDidChangeSessions: Event<ISessionChangeEvent>;

	/**
	 * Fires when a chat moved between this provider's sessions, after both
	 * sessions reflect it. Providers whose chats never move return `Event.None`.
	 */
	readonly onDidMoveChat: Event<IChatMovedEvent>;

	/**
	 * Whether the chat can be the source of {@link moveChat}: the provider moves chats and the chat is structurally
	 * movable (never a session's main chat). The destination is validated when moving. `false` for providers whose
	 * chats never move.
	 */
	canMoveChat(sessionId: string, chatUri: URI): boolean;

	/**
	 * Moves the chat of session `sessionId` within its session, into another session of this provider, or into a new
	 * session. Rejects with a {@link SessionMoveRefusedError} when the move is refused (always, for providers whose chats never
	 * move); nothing changes then.
	 */
	moveChat(sessionId: string, chatUri: URI, destination: ISessionChatMoveDestination): Promise<void>;

	/**
	 * Whether the session can move under another session of this provider, its main chat becoming a chat of that
	 * session (see {@link moveSessionUnder}). `false` for providers whose sessions never move.
	 */
	canMoveSessionUnder(sessionId: string): boolean;

	/**
	 * Moves the session under `destinationSessionId`, placing its chat after `after` (`undefined`: first); the session
	 * ends. Rejects with a {@link SessionMoveRefusedError} when the move is refused (always, for providers whose sessions never move).
	 */
	moveSessionUnder(sessionId: string, destinationSessionId: string, after: URI | undefined): Promise<void>;

	/**
	 * Optional. Redirects a resource that this provider supersedes to the one it
	 * should actually be opened as, or `undefined` to leave it unchanged.
	 *
	 * Open paths address a session by URI — restored editors, links, and commands
	 * all bypass the session list — so a provider that adopts another provider's
	 * sessions must be consulted here, not only when the list is built.
	 * Implementations must return quickly and synchronously decline resources
	 * they do not own.
	 *
	 * `reason` says why the resource is being resolved so a provider can pick its
	 * own latency budget; it carries no provider-specific policy.
	 */
	resolveSessionResource?(resource: URI, reason?: SessionResourceResolveReason): Promise<URI | undefined>;
	/**
	 * Optional. Prepares a known session for opening or restoration; it may already be visible.
	 * Startup restoration invokes this only for the active session.
	 */
	prepareSessionForOpen?(session: ISession, reason: SessionResourceResolveReason): Promise<void>;
	/**
	 * Optional. Fires when a temporary (untitled) session is atomically replaced
	 * by a committed session after the first turn.
	 *
	 * @internal This is an implementation detail of the Copilot Chat sessions
	 * provider. Do not implement or consume this event in other providers.
	 */
	readonly onDidReplaceSession?: Event<{ readonly from: ISession; readonly to: ISession }>;

	/**
	 * Optional. Fires when the user invokes a changeset operation of one of
	 * this provider's sessions; see {@link ISessionChangesetOperationInvokedEvent}.
	 */
	readonly onDidInvokeChangesetOperation?: Event<ISessionChangesetOperationInvokedEvent>;

	/**
	 * List of workspace browse actions supported by the provider. These are used to contribute entries to the "Open Workspace" picker. Consumers should not cache this list, but should call `resolveWorkspace` when an action is executed.
	 */
	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];

	/**
	 * Whether this provider participates in workspace selection for new sessions and Automations.
	 * Defaults to true; opting out does not prevent resolution of existing session workspaces.
	 */
	readonly supportsWorkspaceSelection?: boolean;

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

	/** Whether phone layouts replace separate Mode and Model controls with one picker. */
	readonly usesCombinedNewSessionConfigPicker?: boolean;
	/** Whether model-specific configuration can be scoped to a newly created draft. */
	readonly supportsModelConfigurationForCreation?: boolean;
	/** Whether the provider validates and applies explicit permission choices before creating the backend session. */
	readonly supportsPermissionsForCreation?: boolean;
	/** Current draft's provider-owned permission choice, including its policy availability. */
	getPermissionOptionForSession?(sessionId: string): ISessionPermissionOption | undefined;
	/** Translates the current draft's permission intent to a comparison participant's session type. */
	getComparisonPermissionOptionForSession?(sessionId: string, sessionTypeId: string): ISessionPermissionOption | undefined;
	/** Whether Automation configuration can be restored at draft creation and captured through `getAutomationSessionConfiguration`. */
	readonly supportsAutomationSessionConfiguration?: boolean;

	/**
	 * Optional. Fires when a capability flag that consumers gate UI on (e.g.
	 * {@link supportsQuickChats}) changes at runtime, so they can re-evaluate.
	 */
	readonly onDidChangeCapabilities?: Event<void>;

	/** Provider-owned Automation entities, persistence, and run history; absent for providers that do not participate in Automations. */
	readonly automations?: ISessionsProviderAutomations;

	/**
	 * Resolve a workspace for the given repository URI.
	 * Returns `undefined` when the provider cannot handle the given URI
	 * (e.g. wrong scheme or authority).
	 * @param workspaceUri The URI of the repository to resolve the workspace for.
	 */
	resolveWorkspace(workspaceUri: URI): ISessionWorkspace | undefined;

	/**
	 * Returns the canonical URI for a workspace represented by this provider.
	 * Providers may use this to collapse alternate execution environments onto
	 * the user-selected source workspace.
	 */
	canonicalizeWorkspaceUri?(workspaceUri: URI): URI;

	/**
	 * Create a new session for the given workspace URI.
	 * The provider should not add this session to its session list until the first request is sent.
	 * Multiple new sessions may be created and tracked concurrently; each is
	 * identified by its `sessionId` and lives until it is either sent (graduating
	 * into the session list) or disposed via {@link deleteNewSession}.
	 * @param workspaceUri The URI of the repository to create the session for.
	 * @param sessionTypeId The ID of the session type to create.
	 * @param options Optional metadata and other provider creation inputs.
	 */
	createNewSession(workspaceUri: URI, sessionTypeId: string, options?: ISessionsProviderCreateSessionOptions): ISession;

	/** Prepare provider resources for a nonempty, unsent draft without publishing or submitting it. */
	prepareNewSessionWhileComposing?(sessionId: string): void;

	/**
	 * Asynchronously replace a draft before its first chat is created.
	 * Providers use this to materialize execution environments that can change
	 * the provider or workspace backing the session. The first query is supplied
	 * so preparation that depends on it, such as worktree branch naming, does not
	 * need to delay until the replacement provider sends the request.
	 */
	prepareNewSession?(sessionId: string, token: CancellationToken, query: string): Promise<IPreparedNewSession>;

	/**
	 * Mark a new session as preparing its first request before asynchronous
	 * configuration and request-context resolution begin.
	 */
	startNewSessionRequest?(sessionId: string, activity?: string): IDisposable | undefined;

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
	createQuickChat(sessionTypeId: string, options?: ISessionsProviderCreateSessionOptions): ISession;

	/**
	 * Delete a new (untitled, not-yet-sent) session previously created via
	 * {@link createNewSession}, removing it from the provider's tracking and
	 * releasing any resources it eagerly acquired (e.g. a backend session).
	 * No-op when the id is unknown or the session has already been sent.
	 * @param sessionId The id of the new session to delete.
	 */
	deleteNewSession(sessionId: string): void;

	/** Capture Automation draft values; implementing this also declares support for restoring `automationConfiguration` at draft creation. */
	getAutomationSessionConfiguration?(sessionId: string): Promise<IAutomationSessionConfiguration | undefined>;

	/** Model preferences scoped to a session rather than the ordinary New Session defaults. */
	getAutomationModelConfiguration?(sessionId: string): IModelConfigurationAccess | undefined;

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

	/** Remove a recorded artifact without changing independent session associations. */
	removeSessionArtifact?(sessionId: string, artifactId: string): Promise<void>;
	acquireArtifactIntegration?(sessionId: string, artifactId: string): Promise<IReference<IArtifactModel>>;

	/** List canvas types registered in one live chat. After returning `undefined`, republish the chat's canvases when an authoritative snapshot is available. */
	listCanvases?(sessionId: string, chatResource: URI): Promise<SessionCanvasDefinitionSnapshot>;

	/** Open or focus one stable instance of a registered canvas type. */
	openCanvas?(sessionId: string, chatResource: URI, canvas: ISessionCanvasDefinition, instanceId: string): Promise<void>;

	/** Close one live canvas of a chat, notifying the extension that provides it. */
	closeCanvas?(sessionId: string, chatResource: URI, canvas: ISessionCanvas): Promise<void>;

	/**
	 * Get selectable models and the current resolution of `desiredModelId`.
	 * Callers wait for {@link onDidChangeModels} while the requested model is pending.
	 */
	getModelsSnapshot(sessionId: string, desiredModelId?: string): ISessionModelsSnapshot;

	/**
	 * Get selectable models before creating a session, with no workspace URI for a quick chat.
	 * Providers apply the same availability, visibility, and identifier-resolution rules as {@link getModelsSnapshot}.
	 */
	getModelsSnapshotForCreation?(workspaceUri: URI | undefined, sessionTypeId: string, desiredModelId?: string): ISessionModelsSnapshot;

	/**
	 * Get the presentation options for the sessions-core model picker for the
	 * given session. The provider — not the core picker — decides how its models
	 * are presented (grouping, featured models, whether the manage-models action
	 * is offered), so provider-specific behavior is not hardcoded in core.
	 * @param sessionId The ID of the session.
	 */
	getModelPickerOptions(sessionId: string): ISessionModelPickerOptions;

	/**
	 * Event that fires when the snapshot returned by {@link getModelsSnapshot}
	 * may have changed (e.g. language models finished loading, or the backend
	 * advertised a new option group). The core model picker re-reads the model
	 * list when this fires. Has no payload — consumers re-query per session.
	 */
	readonly onDidChangeModels: Event<void>;

	/**
	 * Set the model for one of a session's chats.
	 * @param sessionId The ID of the session.
	 * @param chatResource The chat to set the model on. Passed explicitly because a session id
	 * cannot identify one of its chats, and a picker is always scoped to the chat it is shown in —
	 * inferring the chat from whichever session is active would let a visible peer chat's picker
	 * write to a different conversation.
	 * @param modelId The ID of the model to set.
	 * @param source Whether this is the chat's own model, surfaced back as
	 * {@link IChat.modelSource}. A client picking a model for the chat must say
	 * {@link ChatModelSource.CarriedOver}, or the chat becomes indistinguishable from one the user
	 * chose a model for.
	 */
	setModel(sessionId: string, chatResource: URI, modelId: string, source: ChatModelSource): void;

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

	/** Snapshots the draft configuration after pending changes settle, normalizing common properties at the provider boundary. */
	getNewSessionConfig?(sessionId: string): Promise<ISessionConfigurationSnapshot | undefined>;

	/**
	 * Set the isolation mode for a session.
	 * @param sessionId The ID of the session.
	 * @param mode The isolation mode to set.
	 */
	setIsolationMode?(sessionId: string, mode: string): Promise<void>;

	/**
	 * Apply programmatic worktree settings to a new session as one operation.
	 */
	setWorktreeConfiguration?(sessionId: string, configuration: ISessionWorktreeConfiguration): Promise<void>;

	/**
	 * Set the git branch for a session.
	 * @param sessionId The ID of the session.
	 * @param branch The branch name to set.
	 */
	setBranch?(sessionId: string, branch: string): Promise<void>;

	/**
	 * Archive a session.
	 * @param sessionId The ID of the session to archive.
	 */
	archiveSession(sessionId: string): Promise<void>;

	/** Permanently imports an external session without sending a message or changing its identity. */
	importSession?(sessionId: string): Promise<void>;

	/**
	 * Returns the current on-disk size of the session's isolated worktree.
	 * Providers without host-owned worktrees leave this capability undefined.
	 */
	getSessionWorktreeDiskUsage?(sessionId: string, token?: CancellationToken): Promise<number | undefined>;

	/** Returns undefined when cleanup status and retry are not supported by this session's host. */
	sessionWorktreeCleanup?(sessionId: string, retry: boolean): Promise<IAgentHostWorktreeCleanupStatus | undefined>;

	/**
	 * Unarchive a session.
	 * @param sessionId The ID of the session to unarchive.
	 */
	unarchiveSession(sessionId: string): Promise<void>;

	/** Archive a chat independently of its owning session. */
	archiveChat?(sessionId: string, chatResource: URI): Promise<void>;

	/** Unarchive a chat independently of its owning session. */
	unarchiveChat?(sessionId: string, chatResource: URI): Promise<void>;

	/**
	 * Set the read/unread state of a session. The provider owns and persists
	 * this state (e.g. via its backend protocol or chat model) and is expected
	 * to reflect it through the session's {@link ISession.isRead} observable.
	 * @param sessionId The ID of the session.
	 * @param isRead `true` to mark the session read, `false` to mark it unread.
	 */
	setSessionReadState(sessionId: string, isRead: boolean): Promise<void>;

	/**
	 * Set the read/unread state of a chat independently of its owning session.
	 * Providers without independently readable chats leave this capability undefined.
	 * Returns `false` when the transition was not accepted and may be retried.
	 */
	setChatReadState?(sessionId: string, chatResource: URI, isRead: boolean): Promise<boolean | void>;

	/**
	 * Set the read/unread state of multiple chats in one provider operation.
	 * Providers may use this to publish one atomic local state change before persisting each chat.
	 */
	setChatReadStates?(sessionId: string, chatResources: readonly URI[], isRead: boolean): Promise<void>;

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
	 * What the composer may offer for a new nested chat in the session. Cheap and synchronous; tracked by `reader`,
	 * so a derived re-evaluates when the host, agent, or session state behind it changes.
	 * `undefined` when the composer must not offer workspace choices (a host without nested chat workspaces, a
	 * provider or session without multiple chats, an archived or unknown session, or a provider that is not an
	 * agent host).
	 */
	getNestedChatWorkspaceSupport(sessionId: string, reader: IReader | undefined): INestedChatWorkspaceSupport | undefined;

	/** Resolves the isolation and branch facts of `folder` for a new nested chat in the session. */
	resolveNestedChatFolder(sessionId: string, folder: URI, token: CancellationToken): Promise<INestedChatFolderInfo>;

	/** Branch names of the repository of `folder` matching `query` (may be empty). */
	getNestedChatBranches(sessionId: string, folder: URI, query: string, token: CancellationToken): Promise<readonly string[]>;

	/**
	 * Gives `chat`, an untitled peer chat of the session that has not sent a request, the chosen workspace;
	 * `prompt` names a new worktree. Rejects with a {@link NestedChatWorkspaceError} when the workspace cannot be
	 * applied (the host refused, or the chat already started), leaving the chat as it was.
	 */
	applyNestedChatWorkspace(sessionId: string, chat: URI, workspace: INestedChatWorkspace, prompt: string): Promise<void>;

	/**
	 * Fork an existing chat into a new chat within the same session, seeded
	 * with the source chat's history up to and including the given turn.
	 * @param sessionId The ID of the session containing the source chat.
	 * @param sourceChat The resource URI of the chat to fork from.
	 * @param turnId The ID of the last turn (request) to include in the fork.
	 * @param options Optional fork settings.
	 */
	forkChat(sessionId: string, sourceChat: URI, turnId: string, options?: IForkChatOptions): Promise<IChat>;

	/**
	 * Create a side chat from an existing chat's turn, inheriting the source
	 * chat's model/agent selection. Unlike {@link forkChat}, a side chat is for
	 * a tangential follow-up rather than continuing the same line of work.
	 * @param sessionId The ID of the session containing the source chat.
	 * @param sourceChat The resource URI of the chat to branch from.
	 * @param turnId The ID of the turn to branch from.
	 */
	createSideChat(sessionId: string, sourceChat: URI, turnId: string, selection?: ISideChatSelection): Promise<IChat>;

	/**
	 * Send a request for a chat within a session.
	 *
	 * @param sessionId The ID of the session containing the chat.
	 * @param chatResource The resource URI of the chat to send the request for.
	 * @param options Options for the request, including the query and any attached context entries.
	 */
	sendRequest(sessionId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession>;
}
